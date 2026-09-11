#!/usr/bin/env bash
# Arranque de la instancia unica de Ruts68 sobre Ubuntu 24.04 LTS.
# La arquitectura no se asume: Lightsail en us-east-1 solo ofrece planes x86_64
# hoy, pero el guion detecta la del sistema para que siga sirviendo en ARM.
# Instala Node 22, PostgreSQL, Caddy y los servicios del sistema. No copia
# codigo ni secretos: esos artefactos se copian desde la maquina local cuando
# se haga el despliegue controlado.
#
# Se ejecuta con `sudo bash cloud-init.sh` sobre una instancia recien creada.
# Es idempotente: repetirlo no rompe nada y no sobreescribe la contrasena de la
# base ni los archivos de entorno.
#
# No se pasa como user-data de Lightsail: Lightsail antepone su propio script de
# inicializacion al contenido del usuario, el shebang deja de estar en la primera
# linea y cloud-init termina ejecutando todo con dash. Aun asi el guion se
# defiende de ese caso, porque dash no soporta pipefail.
set -eu
if (set -o pipefail) 2>/dev/null; then set -o pipefail; fi

APP_USER=ruts68
APP_DIR=/srv/ruts68
DB_NAME=ruts68
DB_USER=ruts68

log() { echo "[cloud-init] $*"; }

log "paquetes base"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl ca-certificates gnupg git rsync unzip postgresql postgresql-contrib debian-keyring debian-archive-keyring apt-transport-https

log "swap de 2 GB: el plan economico tiene 1 GB de RAM y Node mas PostgreSQL"
if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >>/etc/fstab
  sysctl -w vm.swappiness=10
  grep -q '^vm.swappiness' /etc/sysctl.conf || echo 'vm.swappiness=10' >>/etc/sysctl.conf
fi

log "Node 22 desde el repositorio oficial de NodeSource"
if ! command -v node >/dev/null || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 22 ]; then
  # Descargar y luego ejecutar, no "curl | bash": en una tuberia sin pipefail un
  # curl fallido entrega vacio y el interprete termina en exito, dejando el
  # repositorio sin configurar y el error sin rastro.
  curl -fsSL https://deb.nodesource.com/setup_22.x -o /tmp/nodesource.sh
  [ -s /tmp/nodesource.sh ] || {
    echo "[cloud-init] la descarga del repositorio de Node quedo vacia" >&2
    exit 1
  }
  bash /tmp/nodesource.sh
  rm -f /tmp/nodesource.sh
  apt-get install -y nodejs
fi
node -v

log "Caddy desde el repositorio oficial del proyecto"
if ! command -v caddy >/dev/null; then
  curl -fsSL 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' -o /tmp/caddy.key
  [ -s /tmp/caddy.key ] || {
    echo "[cloud-init] la llave del repositorio de Caddy quedo vacia" >&2
    exit 1
  }
  gpg --batch --yes --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg /tmp/caddy.key
  rm -f /tmp/caddy.key
  curl -fsSL 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    -o /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y
  apt-get install -y caddy
fi

log "AWS CLI v2 para subir respaldos a S3"
if ! command -v aws >/dev/null; then
  case "$(uname -m)" in
  aarch64 | arm64) cli_arch=aarch64 ;;
  x86_64 | amd64) cli_arch=x86_64 ;;
  *)
    echo "[cloud-init] arquitectura $(uname -m) no contemplada para la AWS CLI" >&2
    exit 1
    ;;
  esac
  curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-${cli_arch}.zip" -o /tmp/awscliv2.zip
  unzip -q -o /tmp/awscliv2.zip -d /tmp
  /tmp/aws/install --update
  rm -rf /tmp/aws /tmp/awscliv2.zip
fi
aws --version

log "usuario de aplicacion y directorios"
id -u "$APP_USER" >/dev/null 2>&1 || useradd --system --create-home --shell /usr/sbin/nologin "$APP_USER"
# app/ tiene el codigo y node_modules; front/ tiene solo la exportacion estatica
# y es lo unico que Caddy publica, para que no queden package.json ni
# dependencias accesibles por HTTP.
install -d -o "$APP_USER" -g "$APP_USER" -m 755 "$APP_DIR" "$APP_DIR/app" "$APP_DIR/front"
install -d -o postgres -g postgres -m 700 /var/backups/ruts68
install -d -o "$APP_USER" -g "$APP_USER" -m 700 "$APP_DIR/secrets"

log "PostgreSQL: solo loopback, rol propio y base de la aplicacion"
systemctl enable --now postgresql
PG_CONF_DIR=$(find /etc/postgresql -maxdepth 2 -name postgresql.conf -printf '%h\n' | head -1)
if [ -n "$PG_CONF_DIR" ]; then
  # En 1 GB de RAM los valores por defecto de Ubuntu son razonables; solo se
  # limita la escucha a loopback y se acota la concurrencia al uso real.
  sed -i "s/^#\?listen_addresses.*/listen_addresses = 'localhost'/" "$PG_CONF_DIR/postgresql.conf"
  sed -i "s/^#\?max_connections.*/max_connections = 40/" "$PG_CONF_DIR/postgresql.conf"
  systemctl restart postgresql
fi

if ! sudo -u postgres psql -tAc "select 1 from pg_roles where rolname='$DB_USER'" | grep -q 1; then
  DB_PASSWORD=$(head -c 32 /dev/urandom | base64 | tr -d '/+=' | head -c 32)
  sudo -u postgres psql -c "create role $DB_USER login password '$DB_PASSWORD'"
  sudo -u postgres psql -c "create database $DB_NAME owner $DB_USER"
  umask 077
  printf 'postgresql://%s:%s@127.0.0.1:5432/%s?schema=public&connection_limit=10\n' \
    "$DB_USER" "$DB_PASSWORD" "$DB_NAME" >"$APP_DIR/secrets/database-url"
  chown "$APP_USER:$APP_USER" "$APP_DIR/secrets/database-url"
  chmod 600 "$APP_DIR/secrets/database-url"
  log "base creada; la URL quedo en $APP_DIR/secrets/database-url (solo lectura del usuario de la app)"
else
  log "el rol $DB_USER ya existe; no se toca su contrasena"
fi

log "cortafuegos: solo 22, 80 y 443 entran; PostgreSQL nunca se expone"
if command -v ufw >/dev/null; then
  ufw --force reset >/dev/null
  ufw default deny incoming
  ufw default allow outgoing
  ufw allow 22/tcp
  ufw allow 80/tcp
  ufw allow 443/tcp
  ufw --force enable
fi

log "actualizaciones de seguridad desatendidas"
apt-get install -y unattended-upgrades
dpkg-reconfigure -f noninteractive unattended-upgrades

log "listo. Siguiente paso: copiar Caddyfile, unidades systemd y archivos de entorno, y habilitar los servicios"
