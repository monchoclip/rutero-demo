# Plan completo de implementación de Ruts68

Estado: plan aprobado para ejecución incremental.  
Regla: cada plan se implementa en una rama/commit verificable, después se ejecuta el gate técnico y se levanta un agente validador 5.5 independiente. Solo si el validador aprueba se inicia el siguiente plan.

## Orden de ejecución

### P1 · Base operativa y paginación

Estado: implementado localmente, pendiente de validación independiente 5.5.

Objetivo: soportar carteras y agendas grandes sin cargar límites fijos en el navegador.

Incluye paginación por cursor en clientes y actividades, búsqueda server-side, filtros por rol, índices PostgreSQL, estados de carga incremental y pruebas de aislamiento multiempresa.

Aceptación: ningún listado depende de 100 clientes/200 actividades; el asesor conserva su cartera y el coordinador puede filtrar por asesor; typecheck, integración y carga paginada pasan.

### P2 · Tiempo real de bajo costo

Objetivo: actualizar CRM, visitas, chat y cobros sin refrescos manuales.

Incluye canal SSE por empresa, autenticación por cookie, heartbeat, reconexión con backoff, eventos mínimos (`activity.created`, `activity.completed`, `visit.started`, `visit.completed`, `chat.received`, `membership.updated`) y fallback a polling cuando SSE no esté disponible.

Aceptación: un cambio autorizado se refleja en otras sesiones en menos de cinco segundos; no se cruzan empresas; reconexión y cierre de sesión limpian el canal; se prueba con dos usuarios.

### P3 · Ubicaciones y visita activa

Objetivo: dar al coordinador una vista clara de visitas y al asesor un estado persistente de visita activa.

Incluye módulo de ubicaciones, mapa Leaflet/OpenStreetMap, lista alternativa accesible, última posición de inicio/cierre, precisión, hora, distancia, asesor y cliente; panel fijo de visita activa; sincronización de coordenadas como eventos ligados a `Activity`.

Aceptación: coordinadores ven solo su empresa, asesores no ven ubicaciones ajenas, el mapa funciona sin bloquear la tabla, y una visita conserva sus dos coordenadas al trabajar offline.

### P4 · Evidencia y multimedia en almacenamiento económico

Objetivo: retirar fotografías y multimedia pesada de PostgreSQL.

Incluye adaptador S3 compatible, URLs presignadas, hash/tamaño/content-type, límites, retención, eliminación autorizada y fallback local únicamente para desarrollo.

Aceptación: la base guarda metadata y llave, nunca el binario en producción; descargas autorizadas funcionan; errores de carga se pueden reintentar; pruebas de seguridad de tipo y tamaño pasan.

### P5 · Catálogo, ofertas y campañas

Objetivo: administrar productos/servicios y asociarlos a clientes y asesores.

Incluye productos con código, descripción, precio versionado, moneda, vigencia y estado; ofertas; campañas con participación histórica, reactivación sin sobrescribir historial, permisos comerciales y vistas de asesor/coordinador.

Aceptación: un precio usado queda congelado en la actividad/pedido; una campaña vencida no acepta nuevas altas; la cartera y los datos permanecen aislados por empresa; UI tiene estados vacío/carga/error.

### P6 · Pedidos y adaptador ERP

Objetivo: convertir una oportunidad en pedido trazable.

Incluye pedido borrador/confirmado/pendiente ERP/enviado/error, líneas con snapshot de precio, idempotencia, reintentos, adaptador ERP simulado y bandeja de errores para coordinación.

Aceptación: no se duplica un pedido por reintento, nunca se marca enviado sin confirmación del adaptador, y el asesor puede trabajar el borrador sin perderlo offline.

### P7 · Integraciones reales de WhatsApp y Wompi

Objetivo: pasar de contratos simulados a sandbox verificable.

Incluye checklist de credenciales por empresa, validación Meta sandbox, plantillas aprobadas, webhook real, checkout y webhook Wompi, conciliación, recibo, membresía y estados de error observables.

Aceptación: secretos no llegan al cliente, firmas se validan, transacciones repetidas son idempotentes y el plan de la empresa cambia solo ante evento aprobado verificable.

### P8 · UX/UI de operación de campo

Objetivo: reducir pasos del asesor y dar claridad a coordinación.

Incluye bandeja de chat con estados, panel de visita activa, acciones rápidas, accesibilidad WCAG AA, jerarquía de color, orientación de marca/logo por empresa y pruebas responsive 375/768/1440 px.

Aceptación: navegación por teclado, foco visible, mensajes de error comprensibles, modal de ficha sin salto de página, y cada perfil ve solo sus acciones.

### P9 · Preparación AWS, seguridad y operación

Objetivo: publicar con el costo mínimo razonable y observabilidad básica.

Incluye front estático, API Lambda/Fargate según carga, PostgreSQL administrado económico, S3, CloudFront, dominio `ruts68.com`, secretos/IAM, backups, logs, alarmas, límites y guía de rollback.

Aceptación: checklist de despliegue reproducible, presupuesto mensual estimado, HTTPS, CORS estricto, migraciones controladas, backups probados y sin sembrado demo en producción.

## Protocolo automático por fase

1. Agente implementador 5.5 trabaja solo en el plan vigente y deja pruebas, documentación y commit.
2. El agente principal ejecuta los gates: `npm run typecheck`, `npm test`, `npm run test:integration`, `npm run routes:check`, `npm run build`.
3. Se levanta un agente validador 5.5 sin permiso de editar. Revisa diff, permisos, migración, UX, pruebas y criterios de aceptación.
4. Si aprueba, se registra el resultado en este documento y se inicia el siguiente plan. Si rechaza, el implementador corrige únicamente los hallazgos y se repite la validación.
5. Cada fase mantiene compatibilidad con las anteriores y actualiza `docs/ESTADO-DESARROLLO.md`.

## Límites que permanecen explícitos

Las coordenadas requieren permiso del navegador; el tracking continuo no se activa por defecto. Las integraciones Meta/Wompi necesitan credenciales sandbox reales. El almacenamiento local de desarrollo nunca se presenta como garantía de producción.
