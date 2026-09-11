#!/usr/bin/env bash
# Respaldo de PostgreSQL a S3. En el diseno de un solo servidor la base vive en
# la misma maquina que la API, asi que este respaldo es la unica copia fuera del
# disco: si no corre, no hay recuperacion posible.
#
# Un respaldo que nunca se restauro no es un respaldo. RESTORE_CHECK=1 verifica
# el volcado restaurandolo en una base desechable antes de subirlo.
#
# Corre como el usuario del sistema postgres, que por autenticacion local puede
# crear y borrar la base de prueba sin sudo y sin ser root.
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL es requerido}"
: "${BACKUP_BUCKET:?BACKUP_BUCKET es requerido}"
RESTORE_CHECK="${RESTORE_CHECK:-1}"
LOCAL_DIR="${BACKUP_LOCAL_DIR:-/var/backups/ruts68}"
KEEP_LOCAL="${BACKUP_KEEP_LOCAL:-2}"

case "$KEEP_LOCAL" in
"" | *[!0-9]*)
  echo "[backup] ERROR: BACKUP_KEEP_LOCAL debe ser un entero no negativo" >&2
  exit 1
  ;;
esac

# libpq rechaza los parametros que Prisma agrega a la URL (schema,
# connection_limit), asi que se corta la cadena de consulta.
PG_URL="${DATABASE_URL%%\?*}"

stamp=$(date -u +%Y%m%dT%H%M%SZ)
key="postgres/$(date -u +%Y/%m)/ruts68-${stamp}.dump"
file="${LOCAL_DIR}/ruts68-${stamp}.dump"

mkdir -p "$LOCAL_DIR"
chmod 700 "$LOCAL_DIR"

echo "[backup] volcando a $file"
pg_dump --format=custom --no-owner --file="$file" "$PG_URL"

size=$(stat -c %s "$file")
if [ "$size" -lt 4096 ]; then
  echo "[backup] ERROR: el volcado pesa ${size} bytes, es demasiado pequeno para ser valido" >&2
  exit 1
fi

if [ "$RESTORE_CHECK" = "1" ]; then
  probe="ruts68_restore_probe_${stamp}"
  echo "[backup] verificando restauracion en la base desechable $probe"
  # La base de prueba se crea y se borra aqui mismo; nunca se toca ruts68.
  createdb "$probe"
  trap 'dropdb --if-exists "$probe" >/dev/null 2>&1 || true' EXIT
  pg_restore --dbname="$probe" --no-owner --exit-on-error "$file"
  tablas=$(psql -tAd "$probe" -c \
    "select count(*) from information_schema.tables where table_schema='public'")
  dropdb "$probe"
  trap - EXIT
  if [ "$tablas" -lt 5 ]; then
    echo "[backup] ERROR: la restauracion dejo solo ${tablas} tablas" >&2
    exit 1
  fi
  echo "[backup] restauracion verificada con ${tablas} tablas"
fi

echo "[backup] subiendo a s3://${BACKUP_BUCKET}/${key}"
aws s3 cp "$file" "s3://${BACKUP_BUCKET}/${key}" \
  --only-show-errors --sse AES256 --storage-class STANDARD_IA

# Se conservan unas pocas copias locales para una restauracion rapida; el
# historial largo vive en S3 con su regla de ciclo de vida.
ls -1t "${LOCAL_DIR}"/ruts68-*.dump 2>/dev/null | tail -n "+$((KEEP_LOCAL + 1))" | xargs -r rm --

echo "[backup] listo: ${key} (${size} bytes)"
