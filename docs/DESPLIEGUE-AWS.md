# Despliegue de Ruts68 en AWS

Runbook del despliegue económico de un solo servidor. Escrito el 11 de septiembre de 2026.

**Estado: preparado, no desplegado.** Los archivos de esta guía existen y las compuertas locales pasan, pero todavía no se ha creado ningún recurso en AWS desde este repositorio.

## 1. Decisiones tomadas y por qué

| Decisión | Elegido | Motivo |
| --- | --- | --- |
| Cómputo | Una instancia Lightsail ARM, Ubuntu 24.04 | El backend mantiene conexiones SSE en memoria y una cola de recordatorios con bloqueo: necesita un proceso permanente. En Lambda con API Gateway el SSE no funciona y el frontend quedaría en estado `fallback`, sin tiempo real. |
| Base de datos | PostgreSQL en la misma instancia | Es el punto que más baja el costo de arranque frente a una base administrada. Para producción más resiliente sigue siendo preferible PostgreSQL administrado cuando el presupuesto lo permita. |
| Frontend | Archivos estáticos servidos por Caddy en la misma máquina | `front/` ya exporta estático. Sin CloudFront no hay CDN, pero tampoco hay costo ni certificado que administrar aparte. |
| TLS | Caddy con emisión automática | Renovación sola, sin ACM ni CloudFront de por medio. |
| DNS | Route 53 | Permite registros ALIAS si más adelante se pone CloudFront delante del ápice, que es justo lo que Hostinger no resuelve bien. |
| Región | `us-east-1` | La más barata y donde SES y ACM están disponibles sin rodeos. Desde Colombia son del orden de 60 a 90 ms. |
| Correo | SES | 0,10 USD por mil correos. |
| Fotos de visita | Bucket S3 privado con URL prefirmada | El backend ya exige `VISIT_PHOTO_STORAGE_MODE=s3` en producción. |

## 2. Control de costo

Las cifras de AWS cambian por región, plan, promociones y consumo. Antes de crear recursos, ejecutar `infra/aws/provision.sh --list`: ese comando imprime el precio real que reporta AWS para cada plan disponible en la región elegida. La alarma de presupuesto de la plantilla ayuda a detectar gasto temprano, pero no reemplaza revisar la consola de facturación.

| Concepto | Cómo controlarlo |
| --- | --- |
| Instancia Lightsail ARM | Elegir el plan más pequeño que tenga al menos 1 GB de RAM y confirmar el precio con `provision.sh --list`. |
| DNS Route 53 | Revisar el valor mensual de la zona alojada y consultas antes de mover nameservers. |
| S3 fotos y respaldos | Activar ciclo de vida, limitar tamaño de fotos y vigilar crecimiento por organización. |
| SES | Revisar precio por correos enviados y salir del sandbox solo cuando el dominio esté listo. |
| Presupuesto | Configurar `BudgetAlertEmail` y atender la alerta al 80 %. |

Lo que más puede mover el gasto: instantáneas automáticas de Lightsail, subir de plan si 1 GB de RAM no alcanza, retención larga de fotos/respaldos y el crecimiento de la base, porque hoy la multimedia de WhatsApp se guarda como `data:` dentro de PostgreSQL.

## 3. Antes de empezar

1. Cuenta de AWS con facturación activa y MFA en la raíz.
2. Usuario IAM propio para administrar, no la cuenta raíz. `aws configure` en la máquina local.
3. Compuertas locales en verde desde la raíz del repositorio:

```bash
npm run typecheck && npm test && npm run test:integration && npm run routes:check && npm run build
```

4. Decidir los dos asuntos que todavía no son técnicos:
   - **Wompi y Meta.** El preflight exige `META_WEBHOOK_VERIFY_TOKEN`, `META_APP_SECRET`, `WOMPI_PUBLIC_KEY`, `WOMPI_INTEGRITY_SECRET` y `WOMPI_EVENTS_SECRET`. Sin credenciales reales esas variables no se pueden llenar, y rellenarlas con texto inventado deja un módulo roto que parece configurado. O se consiguen las credenciales sandbox antes de publicar, o hay que decidir explícitamente lanzar con cobro y chat apagados, lo que hoy requiere un cambio de código que no está hecho.
   - **Correo de SES.** Una identidad nueva nace en modo de prueba: solo envía a direcciones verificadas una por una. Las invitaciones a asesores no llegarán a nadie más hasta que AWS apruebe la salida del modo de prueba. La solicitud se hace desde la consola de SES y puede tardar un día hábil.

## 4. Revisar el DNS actual de Hostinger antes de tocar nada

Mover los nameservers a AWS reemplaza **toda** la zona. Si el dominio tiene correo, formularios o verificaciones apuntando a Hostinger y esos registros no se recrean en Route 53, dejan de funcionar en el momento en que propague el cambio.

Antes de cambiar nada, anotar de la zona DNS de Hostinger todos los registros existentes, en especial los `MX` y los `TXT` de SPF, DKIM y verificación de dominio. Cada uno que siga haciendo falta se vuelve a crear en Route 53.

Si el correo del dominio está en Hostinger, hay que decidir si se queda ahí (y entonces sus `MX` se copian a Route 53) o se mueve. SES solo manda correo saliente de la aplicación; no es un buzón.

## 5. Secuencia de despliegue

### 5.1 Crear los recursos administrados

```bash
aws cloudformation deploy --region us-east-1 --stack-name ruts68 --template-file infra/aws/template.yaml --capabilities CAPABILITY_NAMED_IAM --parameter-overrides DomainName=ruts68.com BudgetAlertEmail=tu@correo MailFromAddress=no-reply@ruts68.com
```

Crea la zona de Route 53, la identidad de SES con su DKIM y su dominio MAIL FROM, los buckets privados de fotos y respaldos, el usuario IAM del servidor y la alarma de presupuesto. La zona y los buckets quedan con `DeletionPolicy: Retain`: borrar la pila no borra datos.

Leer las salidas:

```bash
aws cloudformation describe-stacks --region us-east-1 --stack-name ruts68 --query 'Stacks[0].Outputs' --output table
```

### 5.2 Crear la llave de acceso del servidor

Lightsail no admite perfiles de instancia IAM, así que el servidor necesita una llave. Queda limitada a los dos buckets y a un único remitente de SES.

```bash
aws iam create-access-key --user-name ruts68-server
```

Guardar el par fuera del repositorio. Es el único momento en que AWS muestra el secreto.

### 5.3 Crear la instancia

```bash
cd infra/aws
./provision.sh --list
```

Elegir un plan con 1 GB de RAM o más, crear la llave SSH y crear la instancia:

```bash
aws lightsail --region us-east-1 create-key-pair --key-pair-name ruts68 --query privateKeyBase64 --output text > ~/.ssh/ruts68.pem
chmod 600 ~/.ssh/ruts68.pem
CONFIRM=si BUNDLE_ID=<plan elegido> KEY_PAIR_NAME=ruts68 ./provision.sh --create
```

El script crea la instancia con `server/cloud-init.sh` como arranque, asigna la IP fija y deja abiertos solo 22, 80 y 443. Al terminar imprime la IP.

### 5.4 Crear los registros A

```bash
aws cloudformation deploy --region us-east-1 --stack-name ruts68 --template-file infra/aws/template.yaml --capabilities CAPABILITY_NAMED_IAM --parameter-overrides DomainName=ruts68.com BudgetAlertEmail=tu@correo MailFromAddress=no-reply@ruts68.com ServerIp=<la IP fija>
```

Ahora la zona tiene `ruts68.com`, `www` y `api` apuntando a la instancia.

### 5.5 Cambiar los nameservers en Hostinger

Con los registros ya recreados en Route 53, en Hostinger abrir el dominio `ruts68.com`, ir a la sección de nameservers y reemplazar los de Hostinger por los cuatro de la salida `NameServers` de la pila.

Esperar la propagación antes de seguir. Comprobar desde la máquina local:

```bash
nslookup -type=NS ruts68.com
nslookup api.ruts68.com
```

**No avanzar hasta que `api.ruts68.com` resuelva a la IP de la instancia.** Caddy solo puede emitir el certificado cuando el dominio ya apunta aquí; intentarlo antes gasta intentos contra el límite de la autoridad certificadora.

### 5.6 Cargar los secretos en el servidor

```bash
ssh -i ~/.ssh/ruts68.pem ubuntu@<IP>
sudo cat /srv/ruts68/secrets/database-url      # la generó cloud-init
```

Con esa URL, crear los dos archivos de entorno a partir de las plantillas `infra/aws/server/api.env.example` y `backup.env.example`:

```bash
sudo -u ruts68 install -m 600 /dev/null /srv/ruts68/secrets/api.env
sudo -u ruts68 nano /srv/ruts68/secrets/api.env
sudo install -o postgres -g postgres -m 600 /dev/null /srv/ruts68/secrets/backup.env
sudo nano /srv/ruts68/secrets/backup.env
```

`DATABASE_LOCATION=same-server` es obligatorio: declara que PostgreSQL vive en esta misma máquina. Sin esa línea el preflight rechaza una URL de loopback, que es exactamente la que usa este diseño.

Generar la llave de cifrado de tokens de WhatsApp con `head -c 48 /dev/urandom | base64`. Si se pierde, los tokens ya guardados no se pueden descifrar y hay que registrar cada número otra vez.

### 5.7 Publicar

```bash
DOMAIN=ruts68.com SSH_TARGET=ubuntu@<IP> SSH_KEY=~/.ssh/ruts68.pem ACME_EMAIL=tu@correo ./deploy.sh
```

En orden: compuertas locales, compilación del frontend contra `https://api.ruts68.com`, compilación del backend, copia de archivos, configuración de Caddy y de las unidades de systemd, `npm ci` y generación del cliente de Prisma, **preflight con los secretos reales del servidor**, migraciones, reinicio de servicios y verificación por HTTPS.

La verificación final espera 401 en `GET https://api.ruts68.com/auth/me` y 200 en la portada. El 401 sin cookie es la prueba de que Fastify responde detrás de Caddy con TLS válido, sin tocar datos de nadie.

## 6. Verificación manual después del primer despliegue

Lo que el script no puede comprobar por sí solo:

1. Registrar una empresa y confirmar que el mes calendario gratuito queda persistido.
2. Invitar a un asesor y confirmar que el correo **sale de SES y llega**. En modo de prueba solo llegará a direcciones verificadas.
3. Abrir la aplicación en dos navegadores de la misma empresa y confirmar que un cambio en uno aparece en el otro: eso valida el SSE a través de Caddy. El indicador de la barra superior debe decir conectado, no respaldo.
4. Crear una actividad con recordatorio y esperar a que el temporizador lo entregue (`systemctl list-timers ruts68-*`).
5. Registrar una visita con fotografía y confirmar que el objeto queda en el bucket, bajo `organizations/`, y que la descarga funciona con URL prefirmada.
6. Confirmar que la bandeja de correo de desarrollo **no** responde: `curl -s -o /dev/null -w '%{http_code}' https://api.ruts68.com/development/mailbox` debe dar 404.
7. Forzar un respaldo y revisar que verifique la restauración: `sudo systemctl start ruts68-backup.service && journalctl -u ruts68-backup.service -n 30`.
8. Confirmar que el sembrado de demostración nunca corrió en esta base.

## 7. Operación

```bash
sudo systemctl status ruts68-api.service          # estado de la API
sudo journalctl -u ruts68-api.service -f          # registro en vivo
sudo systemctl list-timers 'ruts68-*'             # recordatorios y respaldos
sudo journalctl -u caddy -n 50                    # emisión de certificados
free -h && df -h /                                # memoria y disco
```

Un despliegue nuevo es volver a correr `deploy.sh`. Reiniciar la API corta las conexiones SSE abiertas; los navegadores reconectan solos con respaldo exponencial.

**Restaurar la base** desde un respaldo:

```bash
aws s3 ls s3://<bucket de respaldos>/postgres/ --recursive | tail
aws s3 cp s3://<bucket>/postgres/<ano>/<mes>/<archivo>.dump /tmp/
sudo systemctl stop ruts68-api.service ruts68-reminders.timer
sudo -u postgres pg_restore --clean --if-exists --no-owner --dbname=ruts68 /tmp/<archivo>.dump
sudo systemctl start ruts68-api.service ruts68-reminders.timer
```

**Volver atrás** un despliegue: `git checkout <commit anterior>` y correr `deploy.sh` otra vez. Las migraciones de Prisma no se revierten solas; una migración que haya que deshacer necesita su propia migración hacia adelante.

## 8. Límites reales de este despliegue

Se escriben aquí para que nadie los descubra en producción:

- **Punto único de falla.** Si la instancia muere, la aplicación y la base caen juntas. La recuperación es crear otra instancia, correr `cloud-init.sh`, restaurar el último respaldo y volver a desplegar: del orden de media hora, con pérdida de hasta un día de datos según el último respaldo. Una instantánea automática de Lightsail reduce ese tiempo a cambio de un par de dólares al mes.
- **SSE en memoria.** El hub de eventos vive en el proceso. Funciona porque hay una sola instancia; el día que haya dos, cada navegador solo recibirá los eventos de la instancia a la que esté conectado. Escalar horizontalmente exige antes un canal compartido.
- **Sin CDN.** Todo el tráfico va a una máquina en Virginia. Aceptable para un CRM con pocos usuarios; no para tráfico público grande.
- **1 GB de RAM con 2 GB de intercambio.** Node y PostgreSQL conviven con holgura escasa. Vigilar `free -h`; subir de plan en Lightsail puede exigir instantánea y máquina nueva según el tipo de instancia elegido.
- **Correo en modo de prueba** hasta que AWS apruebe la salida.
- **Wompi, ERP y WhatsApp real siguen sin validación externa.** Que la aplicación esté publicada no los convierte en integrados.
- **El motor de cobro y suspensión por prueba vencida no existe.** Una prueba vencida no borra nada y no bloquea nada, porque ese código no está escrito.
- **Multimedia de WhatsApp en la base.** Se guarda como `data:` dentro de PostgreSQL, con tope de 5 MB por archivo. En un disco de 40 GB compartido con la base eso crece rápido; moverlo a S3 es trabajo pendiente.
- **Llave de acceso de larga vida** en el servidor, porque Lightsail no admite perfiles de instancia IAM. Está limitada a dos buckets y a un remitente, vive en un archivo 600 y conviene rotarla de forma periódica. Con EC2 en lugar de Lightsail se puede evitar usando un perfil de instancia, a cambio de rediseñar el perfil económico.
- **Fechas en la zona del dispositivo.** El render por zona de empresa sigue pendiente; con usuarios en una sola zona no se nota.
