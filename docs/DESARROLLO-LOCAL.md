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

Los enlaces «Explorar la demo» de la portada llevan a `/ingresar/?demo=advisor` o `?demo=coordinator` y precargan una cuenta sembrada. Para crearla:

```powershell
npm run demo:seed
```

Siembra la empresa de demostración con dos asesores, un coordinador comercial, seis clientes ficticios, actividades y la configuración de tarifas de ensayo. Es idempotente: repetirlo no duplica registros. El script rechaza cualquier base que no sea `ruts68` o `ruts68_test` en localhost, y la contraseña de esas cuentas es conocida y se muestra en pantalla: son cuentas de práctica, no de un entorno publicado.

La pestaña «Cobro simulado» solo aparece en esa empresa y para perfiles de coordinación. Calcula el desglose en el servidor y guarda ensayos con su resultado. No conecta con Wompi, no pide datos de tarjeta y no activa suscripciones.

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
