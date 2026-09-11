#!/usr/bin/env bash
# Publica Ruts68 en la instancia unica. Se corre desde la maquina local, no en
# el servidor. Orden deliberado: primero las compuertas locales, despues la
# configuracion del sistema, despues el preflight con los secretos reales, y
# solo al final las migraciones y el reinicio.
#
#   DOMAIN=ruts68.com SSH_TARGET=ubuntu@<ip fija> ./deploy.sh
#
# Variables opcionales:
#   SKIP_GATES=1        salta typecheck/test/routes:check (solo para reintentar
#                       un despliegue cuyas compuertas ya pasaron)
#   SSH_KEY=ruta        llave privada de Lightsail
set -euo pipefail

DOMAIN="${DOMAIN:?DOMAIN es requerido, por ejemplo ruts68.com}"
SSH_TARGET="${SSH_TARGET:?SSH_TARGET es requerido, por ejemplo ubuntu@1.2.3.4}"
ACME_EMAIL="${ACME_EMAIL:-admin@${DOMAIN}}"
API_ORIGIN="https://api.${DOMAIN}"
APP_ORIGIN="https://${DOMAIN}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
REMOTE_TMP=/tmp/ruts68-release
SSH_OPTS=()
# Con set -e un "[ ... ] && ..." que da falso aborta el script, asi que va en if.
if [ -n "${SSH_KEY:-}" ]; then SSH_OPTS=(-i "$SSH_KEY"); fi

paso() { echo; echo "=== $* ==="; }
remoto() { ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "$@"; }

case "$DOMAIN" in
*[!a-zA-Z0-9.-]* | .* | *..* | *.)
  echo "DOMAIN solo puede contener letras, numeros, puntos y guiones; ejemplo ruts68.com" >&2
  exit 1
  ;;
esac

case "$ACME_EMAIL" in
*[!a-zA-Z0-9._%+-@]* | *@*@* | @* | *@)
  echo "ACME_EMAIL no tiene un formato seguro para systemd." >&2
  exit 1
  ;;
esac

cd "$ROOT"

if [ "${SKIP_GATES:-0}" != "1" ]; then
  paso "compuertas locales"
  npm run typecheck
  npm test
  npm run routes:check
  # Las de integracion necesitan el PostgreSQL embebido local y tardan, asi que
  # aqui son opcionales; el runbook las exige antes del primer despliegue.
  if [ "${RUN_INTEGRATION:-0}" = "1" ]; then npm run test:integration; fi
fi

paso "compilando frontend contra $API_ORIGIN"
# El origen de la API se incrusta en el bundle al compilar: un frontend armado
# con otra URL seguiria llamando a la anterior.
NEXT_PUBLIC_API_URL="$API_ORIGIN" npm run build -w front

paso "compilando backend"
npm run build -w back
[ -f back/dist/server.js ] || {
  echo "No se genero back/dist/server.js" >&2
  exit 1
}

paso "enviando archivos al servidor"
remoto "rm -rf $REMOTE_TMP && mkdir -p $REMOTE_TMP/app/back $REMOTE_TMP/app/front $REMOTE_TMP/front $REMOTE_TMP/system $REMOTE_TMP/scripts"
# La raiz del espacio de trabajo y el package.json del frontend viajan porque
# npm ci los necesita para resolver el lockfile; la exportacion estatica va a un
# directorio aparte para que Caddy no pueda servir metadatos del proyecto.
scp -q "${SSH_OPTS[@]}" package.json package-lock.json "$SSH_TARGET:$REMOTE_TMP/app/"
scp -q "${SSH_OPTS[@]}" front/package.json "$SSH_TARGET:$REMOTE_TMP/app/front/"
scp -q "${SSH_OPTS[@]}" back/package.json "$SSH_TARGET:$REMOTE_TMP/app/back/"
scp -qr "${SSH_OPTS[@]}" back/dist back/prisma "$SSH_TARGET:$REMOTE_TMP/app/back/"
scp -qr "${SSH_OPTS[@]}" front/out/. "$SSH_TARGET:$REMOTE_TMP/front/"
scp -q "${SSH_OPTS[@]}" scripts/preflight-production.mjs "$SSH_TARGET:$REMOTE_TMP/scripts/"
scp -q "${SSH_OPTS[@]}" infra/aws/server/Caddyfile infra/aws/server/backup.sh \
  infra/aws/server/ruts68-api.service infra/aws/server/ruts68-reminders.service \
  infra/aws/server/ruts68-reminders.timer infra/aws/server/ruts68-backup.service \
  infra/aws/server/ruts68-backup.timer "$SSH_TARGET:$REMOTE_TMP/system/"

paso "configurando el sistema"
remoto "sudo bash -s" <<REMOTO
set -euo pipefail
install -o root -g root -m 644 $REMOTE_TMP/system/ruts68-*.service $REMOTE_TMP/system/ruts68-*.timer /etc/systemd/system/
install -o root -g root -m 755 $REMOTE_TMP/system/backup.sh /usr/local/sbin/ruts68-backup.sh
install -d -o caddy -g caddy -m 755 /var/log/caddy
install -o root -g root -m 644 $REMOTE_TMP/system/Caddyfile /etc/caddy/Caddyfile

# El dominio y el correo de ACME se inyectan por systemd en vez de quedar
# escritos en el Caddyfile, para que el mismo archivo sirva en otro entorno.
install -d -m 755 /etc/systemd/system/caddy.service.d
cat >/etc/systemd/system/caddy.service.d/ruts68.conf <<UNIDAD
[Service]
Environment=RUTS68_DOMAIN=$DOMAIN
Environment=RUTS68_ACME_EMAIL=$ACME_EMAIL
UNIDAD

RUTS68_DOMAIN=$DOMAIN RUTS68_ACME_EMAIL=$ACME_EMAIL \
  caddy validate --config /etc/caddy/Caddyfile
systemctl daemon-reload
REMOTO

paso "instalando dependencias y generando el cliente de Prisma"
remoto "sudo bash -s" <<'REMOTO'
set -euo pipefail
# Sin la exclusion, --delete borraria node_modules en cada despliegue y
# obligaria a reinstalar todo el arbol en una maquina de 1 GB.
rsync -a --delete --exclude node_modules /tmp/ruts68-release/app/ /srv/ruts68/app/
rsync -a --delete /tmp/ruts68-release/front/ /srv/ruts68/front/
chown -R ruts68:ruts68 /srv/ruts68/app /srv/ruts68/front
# Se instalan tambien las dependencias de desarrollo porque la CLI de Prisma
# aplica las migraciones en el servidor. --ignore-scripts evita que cualquier
# postinstall de un paquete corra aqui; el cliente se genera a mano enseguida.
cd /srv/ruts68/app
sudo -u ruts68 -H npm ci --ignore-scripts --no-audit --no-fund
sudo -u ruts68 -H npx --no-install prisma generate --schema back/prisma/schema.prisma
REMOTO

paso "preflight de produccion con los secretos reales del servidor"
remoto "sudo bash -s" <<'REMOTO'
set -euo pipefail
sudo -u ruts68 -H bash -c '
  set -a
  . /srv/ruts68/secrets/api.env
  set +a
  node /tmp/ruts68-release/scripts/preflight-production.mjs
'
REMOTO

paso "aplicando migraciones"
remoto "sudo bash -s" <<'REMOTO'
set -euo pipefail
cd /srv/ruts68/app
sudo -u ruts68 -H bash -c '
  set -a
  . /srv/ruts68/secrets/api.env
  set +a
  cd /srv/ruts68/app
  npx --no-install prisma migrate deploy --schema back/prisma/schema.prisma
'
REMOTO

paso "reiniciando servicios"
remoto "sudo bash -s" <<'REMOTO'
set -euo pipefail
systemctl enable --now postgresql caddy
systemctl restart caddy
systemctl enable --now ruts68-api.service
systemctl restart ruts68-api.service
systemctl enable --now ruts68-reminders.timer ruts68-backup.timer
rm -rf /tmp/ruts68-release
sleep 3
systemctl is-active --quiet ruts68-api.service || {
  journalctl -u ruts68-api.service -n 40 --no-pager
  exit 1
}
REMOTO

paso "verificacion"
# Sin cookie, /auth/me debe responder 401: prueba que Fastify esta atendiendo
# detras de Caddy con TLS valido, sin crear ni leer datos de nadie.
codigo=$(curl -s -o /dev/null -w '%{http_code}' "$API_ORIGIN/auth/me" || true)
echo "GET $API_ORIGIN/auth/me -> $codigo (se espera 401)"
portada=$(curl -s -o /dev/null -w '%{http_code}' "$APP_ORIGIN/" || true)
echo "GET $APP_ORIGIN/ -> $portada (se espera 200)"
[ "$codigo" = "401" ] && [ "$portada" = "200" ] || {
  echo "La verificacion no dio los codigos esperados; revisar antes de dar el despliegue por bueno." >&2
  exit 1
}
echo
echo "Despliegue completo en $APP_ORIGIN"
