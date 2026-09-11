#!/usr/bin/env bash
# Crea la instancia unica de Ruts68 en Lightsail con su IP fija y su
# cortafuegos. Cobra desde el momento en que la instancia existe, asi que pide
# confirmacion explicita.
#
# La instancia se crea aqui y no en la pila de CloudFormation a proposito:
# PostgreSQL vive en su disco, y borrar una pila no debe poder borrar la base.
#
#   ./provision.sh --list     muestra planes y sistemas disponibles con su precio
#   ./provision.sh --create   crea la instancia (requiere CONFIRM=si)
set -euo pipefail

REGION="${AWS_REGION:-us-east-1}"
ZONE="${AWS_ZONE:-${REGION}a}"
INSTANCE="${INSTANCE_NAME:-ruts68}"
STATIC_IP="${STATIC_IP_NAME:-ruts68-ip}"
BLUEPRINT="${BLUEPRINT_ID:-ubuntu_24_04}"
BUNDLE="${BUNDLE_ID:-}"
KEY_PAIR="${KEY_PAIR_NAME:-}"
HERE="$(cd "$(dirname "$0")" && pwd)"

aws() { command aws --region "$REGION" "$@"; }

# En Git Bash sobre Windows la AWS CLI es la nativa y no entiende una ruta
# POSIX dentro de un file://, asi que se traduce cuando cygpath existe.
ruta_nativa() {
  if command -v cygpath >/dev/null 2>&1; then
    cygpath -w "$1"
  else
    printf '%s' "$1"
  fi
}

listar() {
  echo "== Planes disponibles (precio mensual real que reporta AWS) =="
  aws lightsail get-bundles --query \
    'bundles[?isActive].{plan:bundleId,usd:price,ramGb:ramSizeInGb,cpu:cpuCount,diskGb:diskSizeInGb,transferGb:transferPerMonthInGb,arquitectura:supportedPlatforms}' \
    --output table
  echo
  echo "== Sistemas disponibles =="
  aws lightsail get-blueprints --query \
    'blueprints[?type==`os` && isActive].{sistema:blueprintId,nombre:name,plataforma:platform}' \
    --output table
  echo
  echo "Para este proyecto: Ubuntu 24.04 en el plan mas pequeno que tenga 1 GB o"
  echo "mas de RAM. Node y PostgreSQL en la misma maquina no caben bien en 512 MB."
}

crear() {
  [ -n "$BUNDLE" ] || {
    echo "Falta BUNDLE_ID. Corre ./provision.sh --list y elige un plan." >&2
    exit 1
  }
  [ -n "$KEY_PAIR" ] || {
    echo "Falta KEY_PAIR_NAME. Crea o importa una llave SSH en Lightsail primero:" >&2
    # Lightsail reserva los nombres entre tipos de recurso dentro de la region:
    # una llave que se llame igual que la instancia impide crear la instancia.
    echo "  aws lightsail --region $REGION create-key-pair --key-pair-name ${INSTANCE}-key --query privateKeyBase64 --output text" >&2
    echo "Guarda esa llave privada fuera del repositorio, con permisos 600." >&2
    exit 1
  }

  # Un plan inexistente falla con un mensaje poco claro de la API; se valida antes.
  aws lightsail get-bundles --query 'bundles[].bundleId' --output text |
    tr '\t' '\n' | grep -qx "$BUNDLE" || {
    echo "El plan $BUNDLE no existe en $REGION. Corre ./provision.sh --list." >&2
    exit 1
  }

  precio=$(aws lightsail get-bundles \
    --query "bundles[?bundleId=='$BUNDLE'].price | [0]" --output text)
  ram=$(aws lightsail get-bundles \
    --query "bundles[?bundleId=='$BUNDLE'].ramSizeInGb | [0]" --output text)

  cat <<RESUMEN
Se va a crear, con cobro inmediato:
  region            $REGION ($ZONE)
  instancia         $INSTANCE
  sistema           $BLUEPRINT
  plan              $BUNDLE  (${ram} GB RAM, ${precio} USD por mes)
  IP fija           $STATIC_IP
  puertos abiertos  22, 80, 443
  arranque          infra/aws/server/cloud-init.sh
A esto se suman la zona de Route 53, S3 y SES de la pila de CloudFormation.
RESUMEN

  [ "${CONFIRM:-}" = "si" ] || {
    echo "No se creo nada. Para proceder: CONFIRM=si BUNDLE_ID=$BUNDLE KEY_PAIR_NAME=$KEY_PAIR ./provision.sh --create" >&2
    exit 1
  }

  if aws lightsail get-instance --instance-name "$INSTANCE" >/dev/null 2>&1; then
    echo "La instancia $INSTANCE ya existe; no se vuelve a crear."
  else
    aws lightsail create-instances \
      --instance-names "$INSTANCE" \
      --availability-zone "$ZONE" \
      --blueprint-id "$BLUEPRINT" \
      --bundle-id "$BUNDLE" \
      --key-pair-name "$KEY_PAIR" >/dev/null
    echo "Instancia solicitada; esperando que quede en ejecucion."
    aws lightsail get-instance-state --instance-name "$INSTANCE" >/dev/null 2>&1 || true
    until [ "$(aws lightsail get-instance-state --instance-name "$INSTANCE" \
      --query 'state.name' --output text 2>/dev/null)" = "running" ]; do
      sleep 10
      echo -n "."
    done
    echo
  fi

  aws lightsail get-static-ip --static-ip-name "$STATIC_IP" >/dev/null 2>&1 ||
    aws lightsail allocate-static-ip --static-ip-name "$STATIC_IP" >/dev/null
  aws lightsail attach-static-ip --static-ip-name "$STATIC_IP" \
    --instance-name "$INSTANCE" >/dev/null

  # Lightsail abre 22 y 80 por defecto; esta llamada fija la lista exacta.
  aws lightsail put-instance-public-ports --instance-name "$INSTANCE" --port-infos \
    'fromPort=22,toPort=22,protocol=TCP' \
    'fromPort=80,toPort=80,protocol=TCP' \
    'fromPort=443,toPort=443,protocol=TCP' >/dev/null

  ip=$(aws lightsail get-static-ip --static-ip-name "$STATIC_IP" \
    --query 'staticIp.ipAddress' --output text)

  # El arranque va por SSH y no como user-data: Lightsail antepone su propio
  # script al del usuario, con lo que el shebang deja de ser la primera linea y
  # cloud-init ejecuta todo con dash. Por SSH corre con bash y se ve la salida.
  if [ -n "${SSH_KEY:-}" ]; then
    echo "Esperando que SSH responda para ejecutar el arranque."
    until ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new \
      -o ConnectTimeout=10 "ubuntu@${ip}" true 2>/dev/null; do
      sleep 10
      echo -n "."
    done
    echo
    scp -q -i "$SSH_KEY" "${HERE}/server/cloud-init.sh" "ubuntu@${ip}:/tmp/cloud-init.sh"
    ssh -i "$SSH_KEY" "ubuntu@${ip}" "sudo bash /tmp/cloud-init.sh && rm -f /tmp/cloud-init.sh"
  else
    echo "Sin SSH_KEY no se ejecuta el arranque. Correrlo a mano:"
    echo "  scp -i <llave> ${HERE}/server/cloud-init.sh ubuntu@${ip}:/tmp/"
    echo "  ssh -i <llave> ubuntu@${ip} 'sudo bash /tmp/cloud-init.sh'"
  fi

  cat <<SIGUIENTE

Instancia lista. IP fija: $ip

Siguientes pasos:
  1. Volver a desplegar la pila con ServerIp=$ip para crear los registros A.
  2. Esperar a que ruts68.com resuelva a $ip antes de tocar Caddy: el
     certificado solo se emite cuando el DNS ya apunta aqui.
  3. Completar /srv/ruts68/secrets/api.env y backup.env en el servidor.
  4. Correr infra/aws/deploy.sh desde la maquina local.
SIGUIENTE
}

case "${1:-}" in
--list) listar ;;
--create) crear ;;
*)
  echo "Uso: $0 --list | --create" >&2
  exit 1
  ;;
esac
