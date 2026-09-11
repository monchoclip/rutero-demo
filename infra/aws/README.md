# Infraestructura de Ruts68 en AWS

El procedimiento completo, con costos, orden de pasos, migración del DNS desde Hostinger, verificación manual y límites reales, está en [`docs/DESPLIEGUE-AWS.md`](../../docs/DESPLIEGUE-AWS.md). Aquí solo está el inventario de archivos.

## Qué hay

| Archivo                                   | Qué hace                                                                                                                                                                                                                                  |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `template.yaml`                           | Pila de CloudFormation: zona de Route 53, identidad de SES con DKIM y dominio MAIL FROM, bucket privado de fotos, bucket de respaldos, usuario IAM mínimo y alarma de presupuesto. La zona y los buckets se retienen si la pila se borra. |
| `provision.sh`                            | Crea la instancia Lightsail con su IP fija y su cortafuegos. `--list` imprime planes y precios reales antes de elegir; `--create` exige `CONFIRM=si`.                                                                                     |
| `deploy.sh`                               | Publica desde la máquina local: compuertas, compilación, copia, configuración del sistema, preflight con secretos reales, migraciones, reinicio y verificación por HTTPS.                                                                 |
| `server/cloud-init.sh`                    | Arranque de la instancia: Node 22, PostgreSQL en loopback, Caddy, AWS CLI, usuario de aplicación, intercambio, cortafuegos y actualizaciones desatendidas.                                                                                |
| `server/Caddyfile`                        | TLS automático, frontend estático en el ápice, API en `api.<dominio>` y `flush_interval -1` para que el SSE no quede en el buffer del proxy.                                                                                              |
| `server/ruts68-api.service`               | La API como servicio permanente.                                                                                                                                                                                                          |
| `server/ruts68-reminders.{service,timer}` | Cola de recordatorios cada dos minutos.                                                                                                                                                                                                   |
| `server/ruts68-backup.{service,timer}`    | Respaldo diario a S3 que verifica la restauración antes de subir.                                                                                                                                                                         |
| `server/backup.sh`                        | El volcado, su prueba de restauración en una base desechable y la subida.                                                                                                                                                                 |
| `server/api.env.example`                  | Plantilla del entorno de la API. Sin valores reales; el archivo con valores vive solo en el servidor, con permisos 600.                                                                                                                   |
| `server/backup.env.example`               | Plantilla del entorno del respaldo, aparte porque corre como el usuario `postgres`.                                                                                                                                                       |

## Decisiones que conviene no deshacer por accidente

- **La instancia no está en la pila.** PostgreSQL vive en su disco; borrar una pila no debe poder borrar la base.
- **La API escucha solo en loopback** y Caddy es su único cliente. Por eso `TRUST_PROXY=loopback` es obligatorio: sin eso `request.ip` vale `127.0.0.1` para todo el mundo y el límite de quince intentos de ingreso pasa a ser una sola cubeta compartida por toda la plataforma.
- **El frontend se sirve desde un directorio que solo contiene la exportación estática.** Si se sirviera el directorio del código, `package.json` y las dependencias quedarían accesibles por HTTP.
- **`DATABASE_LOCATION=same-server`** es la declaración explícita de que la base es local. El preflight rechaza una URL de loopback sin esa línea, a propósito: así el atajo queda declarado y no pasa inadvertido.

## Estado

**Desplegado el 11 de septiembre de 2026** en la cuenta `021891592771` (`us-east-1`), perfil `kuvvi`. La aplicacion responde en `https://ruts68.com` y la API en `https://api.ruts68.com`, con certificados de Let's Encrypt.

| Recurso       | Identificador                                                         |
| ------------- | --------------------------------------------------------------------- |
| Pila          | `ruts68`                                                              |
| Zona Route 53 | `Z04992545RI1EVJ93AS6`                                                |
| Instancia     | `ruts68` (`ubuntu_24_04`, `micro_3_0`, 7,00 USD/mes)                  |
| IP fija       | `107.20.221.137`                                                      |
| Llave SSH     | `ruts68-key`, privada en `~/.ssh/ruts68.pem`                          |
| Buckets       | `ruts68-photobucket-geasn5xjay7p`, `ruts68-backupbucket-9okyro6zui1g` |
| Usuario IAM   | `ruts68-server`                                                       |

Verificacion y trampas encontradas: `docs/DESPLIEGUE-AWS.md`, secciones 6 y 8.

Pendiente: salida del sandbox de SES (`ProductionAccessEnabled: false`, 200 correos diarios, solo a direcciones verificadas) y el recorrido manual con datos de negocio.

La cuenta es compartida con Kuvvi por decision explicita del usuario. Por eso los nombres van prefijados, la politica del usuario IAM se limita a dos buckets y un remitente, y la alarma de presupuesto filtra por la etiqueta `Project=ruts68`; esa etiqueta debe activarse como etiqueta de asignacion de costos en la consola de facturacion para que la alarma mida algo.
