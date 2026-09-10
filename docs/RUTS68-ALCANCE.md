# Ruts68 — alcance y decisiones iniciales

Fecha: 2026-09-08
Estado: alcance objetivo del producto. La primera base funcional se implementó en `front/` y `back/`; ver `ESTADO-DESARROLLO.md` para distinguir implementación local, adaptadores y pendientes. Las reglas de desarrollo están en `../CLAUDE.md`.

## Proyecto existente

El punto de partida fue el demo estático en `index.html`, con estilos, datos y JavaScript incorporados. Se conserva como referencia. La aplicación nueva incorpora frontend Next.js, backend Fastify, Prisma/PostgreSQL y autenticación real local; el checkout y webhook de Wompi tienen contrato local endurecido, pero aún requieren sandbox y credenciales reales. Se conserva la configuración de dominio existente y el contenido previo del README.

Se pueden aprovechar los flujos de cartera, agenda, registro de llamadas, inicio y cierre de visitas, catálogo, pedidos, reasignación de clientes y consola de administración. Los indicadores GPS, sincronización, sockets, correos y cobros del demo no deben presentarse como servicios reales.

## Producto

CRM web para múltiples empresas de alimentos, distribución, educación, salud y otros sectores de ventas, atención y fidelización. Dominio previsto: ruts68.com. La empresa es la unidad de aislamiento; sector, moneda y zona horaria son configuraciones de cada empresa. En salud se gestionan relaciones comerciales y atención, sin incluir historia clínica en este alcance.

Cada cliente pertenece a la empresa y tiene un asesor responsable. Al retirar a un asesor se reasigna su cartera sin perder historial. Un contacto puede participar en varias campañas y volver a participar en campañas posteriores.

## Perfiles

| Perfil | Alcance inicial |
| --- | --- |
| Superadministrador | Empresas, planes, tarifas, configuración de plataforma y auditoría. El acceso a datos de empresas debe ser explícito y auditado. |
| Coordinador comercial | Crear y administrar asesores de su empresa, asignar cartera, programar actividades, administrar campañas y revisar resultados de su equipo. |
| Coordinador administrativo | Administración operativa de su empresa, visitas, ubicaciones autorizadas, seguimiento de pedidos y suscripción. |
| Asesor | Cartera asignada, llamadas, visitas, tareas, campañas disponibles y toma de pedidos. |

Los permisos se validan en el servidor en cada operación. Ocultar botones o cambiar de vista no constituye autorización. Un coordinador no puede concederse privilegios de plataforma ni crear usuarios de otra empresa.

## Módulos y criterios de aceptación

1. Empresas y usuarios: registro de negocio, invitaciones por correo, inicio de sesión, recuperación de acceso, roles y desactivación. Crear empresa y membresía inicial de forma atómica. Probar explícitamente aislamiento entre dos empresas.
2. Clientes: crear, editar, buscar, asignar y reasignar clientes; historial cronológico de interacciones y responsable. Un asesor no puede consultar clientes ajenos por cambiar una URL o un identificador.
3. Gestión de llamadas: registrar resultado, notas, duración y próximo contacto. Telefonía integrada y grabación quedan fuera del alcance inicial; no simular que se realizó una llamada real.
4. Agenda: llamadas, visitas y seguimientos con vencimiento, responsable, estado y recordatorios por correo. Guardar tiempos en UTC y mostrarlos en la zona horaria de la empresa. Los envíos necesitan reintentos y deduplicación.
5. Catálogo: productos o servicios, código, descripción, precio, moneda y estado. Los pedidos conservan una copia del precio acordado aunque el catálogo cambie.
6. Campañas: vigencia, oferta, productos o servicios, clientes participantes, asesor y resultado. La participación conserva historial; no sobrescribir campañas previas al reactivar al cliente.
7. Visitas: programar, iniciar, registrar ubicación y precisión, notas y cierre. Mostrar fecha de última ubicación y estado sin señal; nunca presentar una posición antigua como actual. La captura requiere permiso y se limita al contexto laboral configurado. Una web no garantiza rastreo continuo en segundo plano con el teléfono bloqueado.
8. Pedidos: borrador, confirmado, pendiente de ERP, enviado y error. Integración mediante un adaptador según el ERP. Claves idempotentes para evitar pedidos duplicados y trazabilidad de reintentos. No marcar enviado sin confirmación del ERP.
9. Suscripciones: registro de empresa con un mes calendario gratuito por defecto; duración configurable para altas futuras. Guardar inicio y fin de prueba en cada suscripción, de modo que un cambio de configuración no modifique beneficios ya otorgados.
10. Auditoría: altas, cambios de rol, asignaciones, cambios de tarifa, pagos y acciones administrativas, con actor, empresa y fecha.

## Planes, prueba y Wompi

No hay precios comerciales confirmados. Los valores en balboas y los 14 días del demo son ejemplos anteriores, no decisiones para Ruts68.

Configurar planes con moneda, periodicidad, precio base, precio por usuario si aplica, usuarios incluidos, límites y estado. Definir expresamente qué usuarios son facturables y cómo se manejan altas y bajas durante un período antes de activar cobros.

Separar en cada cotización: importe del plan, importe por usuarios, comisión de soporte, cargo de pasarela trasladado al cliente e impuestos aplicables. Mostrar subtotal, cada concepto y total antes del pago. Guardar una copia de las reglas y valores usados para no recalcular documentos históricos con tarifas nuevas.

Las tarifas de pasarela deben versionarse, tener fecha de vigencia y moneda, y verificarse con el contrato de la cuenta Wompi. No asumir que un recargo estimado coincide con la liquidación real ni fijar porcentajes sin verificar. Distinguir suma de un porcentaje de la fórmula para recuperar un importe neto: son reglas diferentes y requieren una decisión comercial.

Integrar primero sandbox. El servidor calcula el importe y genera la referencia. Secretos y firma de integridad permanecen en servidor. Validar firma del webhook, referencia, moneda, importe y estado mediante la documentación vigente. Procesar eventos de forma idempotente y manejar eventos duplicados o fuera de orden. La página de retorno del navegador no activa la suscripción por sí sola.

Estados previstos: prueba, activa, vencida, suspendida y cancelada. Definir días de gracia y acceso de lectura antes de activar suspensión. No borrar datos por vencimiento. Cobro recurrente automático depende del producto habilitado por Wompi y de la autorización del pagador; no asumir que disponer de checkout lo habilita.

## Dirección de infraestructura AWS

Objetivo: costo bajo con carga inicial reducida. La revisión de Kuvvi y el flujo transaccional del CRM llevaron a seleccionar Prisma/PostgreSQL, Next.js estático y API adaptable a Lambda. La elección entre RDS y Aurora y la cifra mensual siguen pendientes de validar con volumen, región y precios vigentes. Ver `ARQUITECTURA.md`; no prometer costos ni elegir solo por una cuota gratuita.

Mantener frontend y lógica de negocio independientes del proveedor. Evitar inicialmente servicios permanentemente encendidos sin necesidad, conexiones de ubicación persistentes para usuarios inactivos y consultas frecuentes de paneles cerrados. Limitar retención de posiciones, archivos y registros; configurar presupuesto y alertas. Verificar costo de mapas, correo y proveedor de identidad además de AWS.

No se ha desplegado, modificado DNS ni conectado Wompi. Conservar el demo como referencia visual mientras se construye la aplicación real.

## Orden de construcción

1. Base de aplicación, identidad, empresas, roles y persistencia; verificación de aislamiento.
2. Primer flujo completo: coordinador crea asesor, asigna cliente; asesor registra llamada y agenda seguimiento; el recordatorio se envía por correo.
3. Catálogo, campañas y pedidos con bandeja de integración ERP.
4. Visitas y ubicación real con permisos, precisión y estados de conectividad.
5. Planes, prueba y Wompi sandbox con pruebas de eventos duplicados, firma inválida e importes incorrectos.
6. Validación operativa, despliegue AWS y dominio.

## Información necesaria para las integraciones

- Cuenta y país de operación de Wompi, moneda de cobro y tarifas contractuales.
- Precios de planes, usuarios facturables y modalidad de comisión de soporte.
- ERP inicial, documentación de su API y credenciales de pruebas.
- Cuenta AWS, región prevista y dominio/remitente de correo verificable.

Estos datos no bloquean construir la base del CRM. Sí bloquean activar las integraciones correspondientes en producción.
