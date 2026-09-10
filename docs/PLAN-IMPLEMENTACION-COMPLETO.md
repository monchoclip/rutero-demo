# Plan completo de implementación de Ruts68

Estado: plan aprobado para ejecución incremental.  
Regla: cada plan se implementa en una rama/commit verificable, después se ejecuta el gate técnico y se levanta un agente validador 5.5 independiente. Solo si el validador aprueba se inicia el siguiente plan.

El registro detallado de dictámenes y gates está en [`docs/VALIDACION-PLANES.md`](./VALIDACION-PLANES.md).

## Definición de oro

Una fase pasa a oro cuando cumple estas condiciones:

- El alcance funcional de la fase queda conectado de punta a punta en front, back, datos, permisos y documentación.
- Los gates locales pasan: `npm run typecheck`, `npm test`, `npm run test:integration`, `npm run routes:check` y `npm run build`.
- El validador independiente responde `APROBADO` sin hallazgos P0/P1 abiertos.
- `docs/ESTADO-DESARROLLO.md` queda actualizado con lo implementado, lo probado y los límites que siguen vivos.
- El commit de la fase queda como punto de control identificable.

Si aparece un hallazgo P0/P1, la fase no avanza. Se corrige en la misma fase, se repiten los gates y se levanta una nueva validación.

## Roles de agentes por fase

Cada fase usa el mismo circuito para mantener costo bajo y control de calidad:

- Agente implementador 5.5: desarrolla solo el alcance de la fase vigente, respeta `CLAUDE.md`, `AGENTS.md`, `front/CLAUDE.md` y `back/CLAUDE.md`, actualiza pruebas y deja commit.
- Agente validador 5.5: no edita archivos; revisa diff, rutas, permisos, migraciones, UX, riesgos, pruebas y criterios de aceptación. Debe responder `APROBADO` o `RECHAZADO`.
- Agente CTO 5.5: se levanta al cerrar un bloque grande, por ejemplo P3, P6 y P9. Revisa arquitectura, costos AWS, seguridad, deuda técnica y coherencia comercial.
- Agente UX/CRM 5.5: se levanta en fases con interfaz pesada, especialmente P3, P5, P6 y P8. Revisa flujo operativo real de asesor, coordinador y administrador.

## Secuencia automática de trabajo

1. Se toma la primera fase con estado pendiente.
2. Se entrega a un implementador 5.5 con el alcance exacto de esa fase.
3. El implementador deja commit y resumen de pruebas.
4. El agente principal ejecuta los gates completos.
5. Se levanta un validador 5.5 en modo solo lectura.
6. Si el validador aprueba, se marca la fase como oro en este plan y en `docs/ESTADO-DESARROLLO.md`.
7. Si el validador rechaza, se documentan hallazgos, se corrige en la misma fase y se vuelve al paso 4.
8. Al aprobar una fase, se inicia la siguiente sin cambiar el orden salvo que un bloqueo externo lo exija, como credenciales reales de Meta, Wompi o AWS.

## Orden de ejecución

### P1 · Base operativa y paginación

Estado: oro local (`a9ef2da`, validado por `p1_validate_final`).

Objetivo: soportar carteras y agendas grandes sin cargar límites fijos en el navegador.

Incluye paginación por cursor en clientes y actividades, búsqueda server-side, filtros por rol, índices PostgreSQL, estados de carga incremental, cancelación de gestiones programadas y pruebas de aislamiento multiempresa.

Aceptación: ningún listado depende de 100 clientes/200 actividades; el asesor conserva su cartera y el coordinador puede filtrar por asesor; typecheck, integración y carga paginada pasan.

Validación: APROBADO. El botón de actividades conserva un cursor global; su etiqueta visual en una sección filtrada queda como mejora no bloqueante para P2/UX.

### P2 · Tiempo real de bajo costo

Estado: oro local (5c9d792, eb51567; validado por p2_validate_final2).

Objetivo: actualizar CRM, visitas, chat y cobros sin refrescos manuales.

Incluye canal SSE por empresa, autenticación por cookie, heartbeat, reconexión con backoff, eventos mínimos (`activity.created`, `activity.completed`, `activity.cancelled`, `visit.started`, `visit.completed`, `chat.received`, `membership.updated`) y fallback a polling cuando SSE no esté disponible.

Aceptación: un cambio autorizado se refleja en otras sesiones en menos de cinco segundos; no se cruzan empresas; reconexión y cierre de sesión limpian el canal; se prueba con dos usuarios.

Evidencia esperada: endpoint SSE autenticado, publicador interno de eventos, cliente front con reconexión, pruebas de aislamiento multiempresa y una validación manual con dos sesiones de demostración.

Evidencia local: se agregó `/realtime/events` con SSE autenticado por cookie y filtrado por empresa, `EventHub` con `reply.hijack()`, heartbeat y cierre de conexiones, publicaciones desde CRM, visitas, WhatsApp entrante y membresías, cliente front con reconexión/backoff y polling de respaldo. `npm run typecheck`, `npm test`, `npm run test:integration`, `npm run routes:check` y `npm run build` pasan localmente. La validación independiente respondió APROBADO.

### P3 · Ubicaciones y visita activa

Estado: oro local (0bcfa20, 75cfb62, f361301, 29e80f9; validado por p3_validate_security_final).

Objetivo: dar al coordinador una vista clara de visitas y al asesor un estado persistente de visita activa.

Incluye módulo de ubicaciones, mapa operativo sin SDK externo, lista alternativa accesible, última posición de inicio/cierre, precisión, hora, distancia, asesor y cliente; panel fijo de visita activa; sincronización de coordenadas como eventos ligados a `Activity`.

Aceptación: coordinadores ven solo su empresa, asesores no ven ubicaciones ajenas, el mapa funciona sin bloquear la tabla, y una visita conserva sus dos coordenadas al trabajar offline.

Evidencia esperada: vista de mapa para perfiles autorizados, panel persistente de visita activa, sincronización offline de inicio/cierre/foto, cálculo visual de distancia entre coordenadas y pruebas de permisos por rol.

Evidencia local: el asesor ve un panel de visita activa cuando una visita tiene ubicación inicial y cierre pendiente; coordinación comercial/administrativa ve un mapa operativo con puntos capturados, lista auditable, estado activa/cerrada, precisión, hora, distancia y enlaces independientes a inicio y cierre en Google Maps. El lienzo ubica marcadores con escala determinista a partir del rango latitud/longitud visible, el cierre aplica el alcance de actividad y bloquea accesos cruzados entre asesores, y reutiliza actividades ya filtradas por servidor y refrescadas por SSE, por lo que no agrega costo de proveedor de mapas ni endpoints nuevos. La validación independiente respondió APROBADO.

### P4 · Evidencia y multimedia en almacenamiento económico

Estado: oro local (`e416ad5`; validado por `catalog_campaigns`).

Objetivo: retirar fotografías y multimedia pesada de PostgreSQL.

Incluye adaptador S3 compatible, URLs presignadas, hash/tamaño/content-type, límites, retención, eliminación autorizada y fallback local únicamente para desarrollo.

Aceptación: la base guarda metadata y llave, nunca el binario en producción; descargas autorizadas funcionan; errores de carga se pueden reintentar; pruebas de seguridad de tipo y tamaño pasan.

Evidencia local: `Activity` guarda llave de almacenamiento, SHA-256, tipo MIME y tamaño de la foto de visita. El backend calcula metadata desde el `data:` recibido, mantiene previsualización local solo en desarrollo, añade adaptador privado S3 compatible con URLs presignadas, descarga autorizada, límite de bytes, retención configurada y eliminación autorizada de objeto + metadata. Producción exige modo S3 y se validan magic bytes reales; la verificación acepta metadata externa sin `dataUrl`. Las pruebas cubren el contrato local y externo con mock sin credenciales reales. El validador independiente `catalog_campaigns` respondió APROBADO sin hallazgos P0/P1. Falta provisionar bucket/IAM/ciclo de vida y validar con credenciales de staging antes de datos reales.

### P5 · Catálogo, ofertas y campañas

Estado: oro local (`50b8961`, `2b90487`; validado por `catalog_campaigns`).

Objetivo: administrar productos/servicios y asociarlos a clientes y asesores.

Incluye productos con código, descripción, precio versionado, moneda, vigencia y estado; ofertas; campañas con participación histórica, reactivación sin sobrescribir historial, permisos comerciales y vistas de asesor/coordinador.

Aceptación: un precio usado queda congelado en la actividad/pedido; una campaña vencida no acepta nuevas altas; la cartera y los datos permanecen aislados por empresa; UI tiene estados vacío/carga/error.

Evidencia local: migración `202609100003_catalog_campaigns` con productos, campañas, relación de productos con precio congelado e inscripciones por cliente/asesor. La API `/catalog/*` aplica aislamiento por empresa y permisos (coordinación comercial administra; asesores inscriben solo su cartera), y la pestaña Catálogo y campañas consume los estados de carga/error/vacío. La integración cubre vigencia de campañas/productos, aislamiento entre empresas y conservación del precio histórico al crear pedidos. El validador independiente `catalog_campaigns` respondió APROBADO sin hallazgos P0/P1.

### P6 · Pedidos y adaptador ERP

Estado: oro local (`ccf8427`, `4230c1a`; validado por `catalog_campaigns`).

Objetivo: convertir una oportunidad en pedido trazable.

Incluye pedido borrador/confirmado/pendiente ERP/enviado/error, líneas con snapshot de precio, idempotencia, reintentos, adaptador ERP simulado y bandeja de errores para coordinación. El validador independiente `catalog_campaigns` respondió APROBADO sin hallazgos P0/P1.

Aceptación: no se duplica un pedido por reintento, nunca se marca enviado sin confirmación del adaptador, y el asesor puede trabajar el borrador sin perderlo offline.

Evidencia local: migración `202609100004_orders` con pedido y líneas de precio congelado, clave de idempotencia por empresa, estados draft/error/sent y referencia ERP. La API `/orders` permite crear/listar y enviar a un adaptador ERP simulado; los reintentos devuelven el mismo pedido y solo marcan `sent` tras confirmación del adaptador. La pestaña Pedidos permite crear borradores y enviarlos desde el flujo comercial; los borradores POST se encolan en IndexedDB cuando no hay red y se reconcilian por `idempotencyKey`. Falta conectar el contrato ERP real.

### P7 · Integraciones reales de WhatsApp y Wompi

Estado: contrato local endurecido; pendiente de validación externa con credenciales sandbox.

Objetivo: pasar de contratos simulados a sandbox verificable.

Incluye checklist de credenciales por empresa, validación Meta sandbox, plantillas aprobadas, webhook real, checkout y webhook Wompi, conciliación, recibo, membresía y estados de error observables.

Aceptación: secretos no llegan al cliente, firmas se validan, transacciones repetidas son idempotentes y el plan de la empresa cambia solo ante evento aprobado verificable.

Evidencia local: el adaptador Meta Cloud API valida número, envía texto/plantillas y descarga multimedia; Wompi genera firma de integridad, valida webhook firmado y evita renovar la membresía al repetir el mismo evento aprobado. Los secretos permanecen en servidor y los errores se muestran en la consola. Falta probar contra Meta/Wompi sandbox, HTTPS público, plantillas aprobadas y conciliación/renovaciones reales.

### P8 · UX/UI de operación de campo

Estado: oro local (histórico F1 + módulos P5/P6; validado por `catalog_campaigns`).

Objetivo: reducir pasos del asesor y dar claridad a coordinación.

Incluye bandeja de chat con estados, panel de visita activa, acciones rápidas, accesibilidad WCAG AA, jerarquía de color, orientación de marca/logo por empresa y pruebas responsive 375/768/1440 px.

Aceptación: navegación por teclado, foco visible, mensajes de error comprensibles, modal de ficha sin salto de página, y cada perfil ve solo sus acciones.

Evidencia local: tokens semánticos de color y foco visible global, modales nativos para ficha/formularios/pago, panel de visita activa, estados de Chat y Catálogo/Pedidos, navegación dinámica por `moduleConfig` y reglas de rol en servidor. Las hojas responsive cubren 375/768/1440 px y respetan `prefers-reduced-motion`; build estático pasa. El validador independiente `catalog_campaigns` respondió APROBADO sin hallazgos P0/P1; falta recorrido manual con dispositivos reales.

### P9 · Preparación AWS, seguridad y operación

Estado: preparado localmente, pendiente de staging y validación independiente 5.5 (límite de agentes).

Objetivo: publicar con el costo mínimo razonable y observabilidad básica.

Incluye front estático, API Lambda/Fargate según carga, PostgreSQL administrado económico, S3, CloudFront, dominio `ruts68.com`, secretos/IAM, backups, logs, alarmas, límites y guía de rollback.

Aceptación: checklist de despliegue reproducible, presupuesto mensual estimado, HTTPS, CORS estricto, migraciones controladas, backups probados y sin sembrado demo en producción.

Evidencia local: `infra/aws/template.yaml` crea buckets privados cifrados, ciclo de vida de fotos, CloudFront con OAC y HTTPS; `infra/aws/README.md` documenta ACM, DNS, IAM mínimo, migraciones, límites SSE y rollback. No se desplegó ni se inventan costos: faltan región, cuenta, base administrada, secretos, alarmas y prueba de restauración en staging.

## Protocolo automático por fase

1. Agente implementador 5.5 trabaja solo en el plan vigente y deja pruebas, documentación y commit.
2. El agente principal ejecuta los gates: `npm run typecheck`, `npm test`, `npm run test:integration`, `npm run routes:check`, `npm run build`.
3. Se levanta un agente validador 5.5 sin permiso de editar. Revisa diff, permisos, migración, UX, pruebas y criterios de aceptación.
4. Si aprueba, se registra el resultado en este documento y se inicia el siguiente plan. Si rechaza, el implementador corrige únicamente los hallazgos y se repite la validación.
5. Cada fase mantiene compatibilidad con las anteriores y actualiza `docs/ESTADO-DESARROLLO.md`.

## Límites que permanecen explícitos

Las coordenadas requieren permiso del navegador; el tracking continuo no se activa por defecto. Las integraciones Meta/Wompi necesitan credenciales sandbox reales. El almacenamiento local de desarrollo nunca se presenta como garantía de producción.
