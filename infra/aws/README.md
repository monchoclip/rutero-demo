# Despliegue económico de Ruts68

La plantilla `template.yaml` crea el bucket privado de fotografías con cifrado, bloqueo de acceso público y ciclo de vida, además del bucket del frontend y CloudFront con OAC y HTTPS. No crea base de datos, Lambda ni DNS automáticamente porque esos recursos necesitan elegir región, dominio, límites de conexión y presupuesto.

Secuencia recomendada:

1. Crear ACM en `us-east-1` para `ruts68.com` y validar el DNS.
2. Desplegar la plantilla con `aws cloudformation deploy --template-file infra/aws/template.yaml --stack-name ruts68 --parameter-overrides CertificateArn=... --capabilities CAPABILITY_NAMED_IAM`.
3. Publicar `front/out` al bucket y asociar el alias DNS al dominio de CloudFront.
4. Provisionar PostgreSQL administrado con backups y límites; ejecutar `prisma migrate deploy` desde un job controlado. Mantener SSE en una instancia persistente o sustituirlo por un broker administrado antes de escalar horizontalmente.
5. Ejecutar la API con Lambda/API Gateway solo si el contrato SSE se cambia a un canal compatible; para SSE sostenido usar un servicio con conexiones persistentes y límite de concurrencia explícito.
6. Configurar `VISIT_PHOTO_STORAGE_MODE=s3`, `VISIT_PHOTO_S3_BUCKET`, región y credenciales IAM mínimas (`s3:PutObject`, `s3:GetObject`, `s3:DeleteObject` sobre `organizations/*`). Nunca subir `.env` ni el sembrado de demostración.

El costo real depende de región, tráfico, base de datos, conexiones y retención. Antes de activar producción hay que fijar presupuesto mensual, alarmas de gasto, backups restaurables, rotación de secretos, CORS con el dominio final y un ensayo de rollback.
