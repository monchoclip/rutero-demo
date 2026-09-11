#!/usr/bin/env bash
# Arranque de la instancia unica de Ruts68 sobre Ubuntu 24.04 LTS (ARM).
# Instala Node 22, PostgreSQL, Caddy y los servicios del sistema. No copia
# codigo ni secretos: eso lo hace infra/aws/deploy.sh desde la maquina local.
#
# Se ejecuta una sola vez, como user-data al crear la instancia, o a mano con
# sudo en una instancia recien creada. Es idempotente: repetirlo no rompe nada
# y no sobreescribe la contrasena de la base ni el archivo de entorno.
set -euo pipefail

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
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
node -v

log "Caddy desde el repositorio oficial del proyecto"
if ! command -v caddy >/dev/null; then
  curl -fsSL 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' |
    gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -fsSL 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    -o /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y
  apt-get install -y caddy
fi

log "AWS CLI v2 para subir respaldos a S3"
if ! command -v aws >/dev/null; then
  curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-aarch64.zip" -o /tmp/awscliv2.zip
  unzip -q -o /tmp/awscliv2.zip -d /tmp
  /tmp/aws/install --update
  rm -rf /tmp/aws /tmp/awscliv2.zip
fi
aws --version

log "usuario de aplicacion y directorios"
id -u "$APP_USER" >/dev/null 2>&1 || useradd --system --create-home --shell /usr/sbin/nologin "$APP_USER"
install -d -o "$APP_USER" -g "$APP_USER" -m 755 "$APP_DIR" "$APP_DIR/back" "$APP_DIR/front"
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

log "listo. Siguiente paso: copiar Caddyfile, unidades systemd y el archivo de entorno, y correr deploy.sh"
