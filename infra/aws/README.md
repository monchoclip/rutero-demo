# Despliegue económico de Ruts68

La plantilla `template.yaml` crea el bucket privado de fotografías con cifrado, bloqueo de acceso público y ciclo de vida, además del bucket del frontend y CloudFront con OAC y HTTPS. No crea base de datos, Lambda ni DNS automáticamente porque esos recursos necesitan elegir región, dominio, límites de conexión y presupuesto.

`server/cloud-init.sh` prepara una instancia Ubuntu 24.04 LTS ARM para el escenario más económico de arranque: Node 22, PostgreSQL local solo en loopback, Caddy, swap de 2 GB, firewall con puertos 22/80/443 y actualizaciones de seguridad. No copia código ni secretos; deja la URL de base de datos generada en `/srv/ruts68/secrets/database-url` con permisos del usuario de la aplicación.

Secuencia recomendada:

1. Crear ACM en `us-east-1` para `ruts68.com` y validar el DNS.
2. Desplegar la plantilla con `aws cloudformation deploy --template-file infra/aws/template.yaml --stack-name ruts68 --parameter-overrides CertificateArn=... --capabilities CAPABILITY_NAMED_IAM`.
3. Publicar `front/out` al bucket y asociar el alias DNS al dominio de CloudFront.
4. Para staging económico inicial, crear una instancia Ubuntu ARM y ejecutar `server/cloud-init.sh` como user-data o con `sudo` en una máquina recién creada. Para producción con mayor resiliencia, provisionar PostgreSQL administrado con backups y límites; ejecutar `prisma migrate deploy` desde un job controlado. Mantener SSE en una instancia persistente o sustituirlo por un broker administrado antes de escalar horizontalmente.
5. Ejecutar la API con Lambda/API Gateway solo si el contrato SSE se cambia a un canal compatible; para SSE sostenido usar un servicio con conexiones persistentes y límite de concurrencia explícito.
6. Configurar `VISIT_PHOTO_STORAGE_MODE=s3`, `VISIT_PHOTO_S3_BUCKET`, región y credenciales IAM mínimas (`s3:PutObject`, `s3:GetObject`, `s3:DeleteObject` sobre `organizations/*`). Nunca subir `.env` ni el sembrado de demostración.
7. Ejecutar `npm run preflight:production` con las variables reales cargadas en el entorno de staging o producción antes de correr migraciones o publicar tráfico. El comando valida que `NODE_ENV=production`, `APP_ORIGIN` use HTTPS, `DATABASE_URL` no apunte a local, Meta y Wompi tengan secretos completos, la llave `WHATSAPP_TOKEN_ENCRYPTION_KEY` sea fuerte, las fotos usen S3 y el correo use SES con remitente configurado. La salida solo lista nombres de variables y motivos; no imprime secretos.

Verificación no destructiva local (2026-09-11): `aws cloudformation validate-template` acepta `template.yaml` y `bash -n infra/aws/server/cloud-init.sh` acepta el arranque de servidor. En la cuenta consultada no hay todavía stacks ni buckets con nombre `ruts68` o `rutero`; por eso el estado sigue siendo preparación y no staging desplegado.

El costo real depende de región, tráfico, base de datos, conexiones y retención. Antes de activar producción hay que fijar presupuesto mensual, alarmas de gasto, backups restaurables, rotación de secretos, CORS con el dominio final y un ensayo de rollback.
