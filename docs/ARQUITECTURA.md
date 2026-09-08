# Arquitectura inicial Ruts68

## Decisiones vigentes

1. **Next.js estático y API separada.** Mantiene la distribución de Kuvvi y permite alojar el frontend sin proceso Node permanente. La API contiene toda autorización y regla comercial.
2. **Prisma/PostgreSQL.** Cartera, asesor, empresa, actividades, auditoría y correo requieren transacciones y relaciones. La prioridad de continuidad con Kuvvi y consistencia relacional justifica PostgreSQL frente a introducir DynamoDB en esta etapa.
3. **Desarrollo Windows autónomo.** `embedded-postgres` arranca PostgreSQL en loopback, puerto 55468, sin Docker ni instalación global. Datos y credencial aleatoria permanecen en `.local/`. Es infraestructura de desarrollo, nunca empaquetar ese servidor dentro de Lambda.
4. **Sesiones opacas.** Tokens de 256 bits, hash en DB, cookie HttpOnly, expiración y revocación. Evita Redis y lógica refresh/access en esta primera web. La sesión debe vivir bajo el mismo sitio que frontend/API en producción.
5. **Cola transaccional de correo.** No se pierde la intención de recordar cuando se guarda una actividad. Worker desacoplado, reintentos y bloqueo temporal. Adaptador SES preparado; configuración y ejecución programada reales pendientes.
6. **Integridad por empresa.** Claves compuestas aseguran que un cliente no referencie un asesor de otra empresa. Servicios restringen también cartera. El acceso de superadmin a datos de empresas queda cerrado hasta implementar contexto auditado.
7. **Manifiesto local generado.** `src/routes.ts` alimenta router Fastify y JSON generado. Ningún comando de validación interactúa con AWS.

## Despliegue objetivo, todavía sin provisionar

Frontend estático en S3/CloudFront o alojamiento estático de AWS; API Gateway HTTP + Lambda; PostgreSQL administrado; SES; ejecución programada del worker y alarmas. Antes de provisionar: elegir región, presupuesto, base RDS/Aurora, conexiones/timeout, límites de concurrencia, red privada/salida, backups, retención y alertas.

Lambda cobra por solicitudes/duración y otros servicios se cobran por separado ([AWS](https://aws.amazon.com/lambda/pricing/)). Por eso **no existe todavía una cifra mensual validada**. Aurora requiere analizar capacidad, motor, pausa y costos completos ([documentación](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/aurora-serverless-v2.how-it-works.html)). No declarar que serverless equivale a gratuito o siempre más barato.

No se incluyen inicialmente Redis, WebSocket permanente, NAT Gateway, RDS Proxy ni provisioned concurrency sin demostrar necesidad. La API tiene un adaptador Lambda, pero faltan empaquetado Linux con motor Prisma, IAM, red, secretos y pruebas en staging antes de producción.

## Límites conocidos de F1

- Frontend muestra hasta 100 clientes y 200 actividades; la lista de clientes tiene cursor en API. Ampliar búsqueda y paginación de UI e indicadores antes de carteras grandes.
- Zona de presentación: dispositivo; datos en UTC. Configuración por empresa preparada en schema, aún no aplicada a toda la UI.
- Prueba gratuita fija a un mes por código, persistida. Configuración de planes y prueba, cobro y suspensión pendientes.
- Recuperación de contraseña, verificación de correo del fundador, MFA, administración completa de usuarios y limpieza automática de sesiones/rate limits quedan pendientes antes de una apertura pública.
- Entrega de correo es at-least-once ante caída entre aceptación de SES y guardado del resultado. El bloqueo evita doble trabajo normal; no garantiza entrega exactamente una vez.
- La bandeja de desarrollo puede mostrar enlaces de invitación a los coordinadores de esa empresa; no existe en producción.
