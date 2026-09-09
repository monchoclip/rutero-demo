# Ejecutar Ruts68 localmente

Requisitos: Node.js 22 o 24 y npm. En Windows x64 se incluye PostgreSQL de desarrollo mediante una dependencia; no requiere Docker. Ejecutar desde la raíz del repositorio.

```powershell
npm install
npm run dev
```

El comando crea una credencial aleatoria local, inicia PostgreSQL en `127.0.0.1:55468`, genera Prisma, aplica migraciones y abre los servicios:

- Web: http://localhost:3068
- API: http://localhost:4068

No arrancar dos instancias de `npm run dev` sobre el mismo puerto. Detener el comando para cerrar los servicios. `.local/` contiene los datos persistentes: no borrarla para arreglar errores. El demo anterior sigue en `index.html` y no se modificó el dominio existente.

## Recorrido de la primera versión

1. Elegir “Crea tu empresa” y registrar negocio, sector, nombre, correo y contraseña de al menos 12 caracteres.
2. Ingresar como coordinador e invitar a un asesor desde “Mi equipo”.
3. Abrir “Correo de prueba” y el enlace de invitación. Para mantener ambos perfiles abiertos, copiarlo a otro perfil/ventana privada del navegador; las pestañas del mismo perfil comparten sesión.
4. El asesor crea su contraseña. La invitación no se puede reutilizar.
5. Volver a ingresar como coordinador, actualizar la página y crear un cliente asignado a ese asesor.
6. Programar llamada, visita o seguimiento. El asesor lo verá al actualizar su agenda.
7. Registrar resultado y, opcionalmente, el próximo seguimiento. Consultar la ficha del cliente para ver el historial.
8. Reasignar el cliente a otro asesor: conserva historial y mueve tareas pendientes.

No se crean usuarios ni datos de ejemplo automáticamente en la base de desarrollo. Los datos de prueba viven en `ruts68_test`.

## Empresa de demostración

Los enlaces de demostración de la portada llevan a `/ingresar/?demo=advisor`, `?demo=coordinator`, `?demo=admin` o `?demo=platform` y precargan una cuenta sembrada. Para crearla:

```powershell
npm run demo:seed
```

Siembra la empresa de demostración con dos asesores, un coordinador comercial, un coordinador administrativo, un superadministrador de plataforma, seis clientes ficticios, actividades y la configuración de tarifas de ensayo. Es idempotente: repetirlo no duplica registros. El script rechaza cualquier base que no sea `ruts68` o `ruts68_test` en localhost, y la contraseña de esas cuentas es conocida y se muestra en pantalla: son cuentas de práctica, no de un entorno publicado.

Cuenta administrativa de práctica: `administrativo@ruts68.test`. Este perfil puede revisar cartera, equipo, actividades, conversaciones y cotizaciones de cobro simulado de la empresa demo, pero no puede crear clientes, invitar asesores, reasignar cartera ni guardar simulaciones de pago.

La pestaña «Cobro simulado» solo aparece en esa empresa y para perfiles de coordinación. Calcula el desglose en el servidor y guarda ensayos con su resultado. No conecta con Wompi, no pide datos de tarjeta y no activa suscripciones.

El sembrado también da de alta un número de WhatsApp de la empresa de demostración, asignado a un asesor, con dos conversaciones de ejemplo (una vinculada a un cliente, otra sin vincular). La pestaña «WhatsApp» solo aparece si la cuenta tiene al menos un número visible para su rol. El token de ese número es ficticio: un envío real desde la demo llega a fallar honestamente contra la API de Meta, mostrado como mensaje "fallido" en la burbuja, en vez de simular un éxito falso.

## WhatsApp: variables de entorno

`npm run dev` genera y persiste una clave aleatoria de cifrado en `.local/database.json` (ignorado por Git) y la usa como `WHATSAPP_TOKEN_ENCRYPTION_KEY` para cifrar el token de acceso de cada número (AES-256-GCM). En cualquier otro entorno hay que definir esa variable explícitamente antes de registrar un número real; ver `back/.env.example`.

`META_WEBHOOK_VERIFY_TOKEN` y `META_APP_SECRET` pertenecen a una sola app de Meta compartida por la plataforma (no por empresa) y se usan para el handshake y la verificación de firma del webhook en `/webhooks/whatsapp`. Sin definirlas, el webhook responde 503 en vez de aceptar eventos sin verificar.

Registrar un número se puede hacer desde la demo de plataforma (`plataforma@ruts68.test`) o con `POST /platform/whatsapp-numbers` autenticado como un usuario `super_admin`. La coordinación comercial de la empresa destino puede entonces asignarlo a un asesor desde la pestaña «WhatsApp». La descarga de multimedia entrante y las plantillas aprobadas están implementadas contra el contrato de Meta, pero siguen sin validación externa hasta tener credenciales reales y plantillas aprobadas.

## Pruebas y compilación

```powershell
npm run typecheck
npm test
npm run test:integration
npm run routes:check
npm run build
```

Las pruebas de integración usan exclusivamente una base llamada `ruts68_test`. Reutilizan el PostgreSQL local si está encendido o lo inician si está detenido. Si se usa un servidor propio, definir `TEST_DATABASE_URL` apuntando a esa base. No sustituir por una URL de producción.

Después de cambiar el schema, detener primero el backend en Windows antes de regenerar Prisma: el motor DLL puede estar bloqueado por el proceso en ejecución. Crear una migración nueva, revisar SQL y aplicar; nunca modificar migraciones aplicadas.

## Procesar correo de desarrollo

Mientras PostgreSQL esté corriendo:

```powershell
npm run mail:local
```

Procesa solo correos disponibles (recordatorios 15 minutos antes) y escribe archivos en `.local/mail/`. No realiza envíos externos. No publica contraseñas ni secretos en consola. El adaptador SES requiere una configuración explícita y validación con cuenta de pruebas.

## Contratos de rutas

Editar `back/src/routes.ts`, añadir handler/validación/prueba, ejecutar `npm run routes:generate` y verificar con `npm run routes:check`. No ejecuta comandos de AWS.
