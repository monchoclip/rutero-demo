# Ruts68 — reglas de producto y desarrollo

Guía canónica para personas y agentes. Actualizada el 8 de septiembre de 2026.
Adaptada tras revisar `../kuvvi/CLAUDE.md`, `front/CLAUDE.md`, `back/CLAUDE.md`, paquetes, configuración Next, schema Prisma, repositorios, Core, rutas y Makefile de Kuvvi. No importar automáticamente instrucciones ni lógica clínica de ese repositorio.

## 1. Leer primero y clasificar el trabajo

| Documento | Función |
| --- | --- |
| `CLAUDE.md` | Reglas de negocio, arquitectura y calidad. Fuente de verdad de instrucciones. |
| `docs/RUTS68-ALCANCE.md` | Alcance del producto completo, criterios de aceptación y decisiones comerciales abiertas. |
| `docs/ESTADO-DESARROLLO.md` | Qué funciona, qué está preparado y qué falta; evidencia de validación. |
| `docs/ARQUITECTURA.md` | Decisiones técnicas y límites del despliegue. |
| `docs/REVISION-KUVVI.md` | Evidencia de la revisión y reglas adoptadas/adaptadas/descartadas. |
| `docs/DESARROLLO-LOCAL.md` | Instalación, ejecución y recorrido de verificación. |
| `back/CLAUDE.md`, `front/CLAUDE.md` | Convenciones de cada área. |

Clasificar cada cambio por módulo (identidad, empresas, clientes, agenda, equipo, visitas, catálogo, campañas, pedidos, suscripciones, notificaciones, plataforma), tipo (funcionalidad, corrección, seguridad, infraestructura o documentación) y etapa (F1 a F6 del estado de desarrollo).

Estados permitidos: **pendiente**, **en desarrollo**, **implementado localmente**, **validado en staging**, **en producción**. Una maqueta no equivale a implementación. Un adaptador sin credenciales ni prueba externa es **preparado**, nunca **integrado**. Actualizar el estado al cerrar un cambio; no mantener conteos de pruebas en reglas permanentes.

## 2. Producto e invariantes

Ruts68 es un CRM web multiempresa y multisector para ventas, atención y fidelización. Dominio previsto `ruts68.com`. Alimentos, educación y salud son sectores de la empresa, no aplicaciones separadas. El alcance de salud no incluye historia clínica, IPS ni verificación de profesionales.

- La empresa es dueña de la cartera. Cada cliente tiene un asesor responsable activo de esa empresa.
- El servidor obtiene empresa y rol de una sesión autenticada; nunca confía en `organizationId`, `role` o `userId` enviados por el navegador.
- Aislamiento obligatorio en consultas, mutaciones, historial, correos, ubicaciones e integraciones; incluir claves foráneas compuestas cuando sea viable.
- Reasignar cliente conserva historial y mueve actividades pendientes y destinatarios de sus recordatorios. Probar el retiro de acceso del asesor anterior.
- Registrar llamada significa guardar una gestión; no afirmar que hubo telefonía real, grabación, GPS verificado o envío al ERP sin evidencia del proveedor.
- Crear empresa concede un mes calendario gratuito por defecto, limitado al último día del mes destino. Persistir el vencimiento. La parametrización comercial futura no cambia pruebas ya concedidas.
- Prueba vencida no borra información. El motor de cobro/suspensión todavía no existe: no afirmar que el código lo aplica.

## 3. Roles

| Rol técnico | Alcance |
| --- | --- |
| `super_admin` | Plataforma. No obtiene acceso implícito a carteras sin contexto de empresa autorizado y auditado. Consola pendiente. |
| `commercial_coordinator` | Su empresa: invitar asesores, asignar/reasignar clientes, programar y registrar contactos. Es el rol del fundador al registrarse. |
| `administrative_coordinator` | Consulta operativa de su empresa. Gestión administrativa y ubicación se completarán en su etapa; no conceder permisos comerciales por conveniencia. |
| `advisor` | Su cartera, sus actividades y sus recordatorios. No invita usuarios ni reasigna clientes. |

La existencia de un enum no implica que el módulo de ese perfil esté terminado. Por ahora solo se crean coordinadores comerciales por registro y asesores por invitación. Los roles se toman del usuario vigente en base de datos en cada petición.

## 4. Arquitectura y convenciones adoptadas de Kuvvi

- `front/`: Next.js App Router, TypeScript estricto, React, exportación estática. UI y errores en español; código en inglés. Sin Capacitor en la primera versión web.
- `back/`: Fastify para desarrollo y adaptador Lambda; módulos con `handlers/`, `*Service.ts`, `*Repository.ts`, `*Schema.ts`, `*Types.ts` cuando aportan tipos propios.
- Prisma/PostgreSQL y migraciones versionadas. Datos persistentes reales en local; no usar localStorage como base de datos.
- Handler: parsear/validar → service → respuesta. Nada de reglas comerciales ni consultas SQL dentro del handler. Objetivo máximo 20 líneas por operación.
- Service: reglas y coordinación. Repository: acceso Prisma y transacciones. No consultas Prisma desde servicios. Dependencias inyectadas; no imponer Singletons que dificulten pruebas.
- `any` prohibido en código propio. Usar `unknown` y validación. Variables/funciones camelCase; tipos PascalCase; constantes UPPER_SNAKE_CASE.
- Funciones de negocio mayores de 40 líneas se dividen; componentes React se extraen por responsabilidad. No comprimir líneas para esconder complejidad. Formatear código antes de entregar.
- `back/src/routes.ts` es el registro editable. `npm run routes:generate` genera `routes.manifest.json` sin tocar AWS; `routes:check` detecta desajustes. No copiar el comando de Kuvvi que registra rutas remotas para generar un artefacto local.
- El primer adaptador Lambda comparte entrada de API. Separar Lambdas por dominio solo cuando una medición de permisos, tamaño o carga lo justifique. No fingir que ya se desplegaron.
- Respuestas: `{ data, meta: { requestId, timestamp } }`; listas paginadas agregan `pagination`. Errores: `{ error, message, requestId }` con validación adicional en `details`.

## 5. Seguridad adaptada a la web

- Sesiones opacas de 24 horas en cookie HttpOnly/SameSite Strict; Secure en producción. Guardar únicamente hash del token en DB. Logout revoca sesión en servidor.
- Esta decisión sustituye JWT/Redis de Kuvvi en F1 para reducir componentes; no copiar sus tokens ni su OTP de cuatro dígitos. Si se incorporan tokens access/refresh, exigir propósito, expiración, rotación, revocación y pruebas de replay.
- Contraseñas de 12–128 caracteres, scrypt con sal individual. Invitaciones aleatorias, hash en DB, caducidad 48 horas y consumo atómico de un solo uso. Nunca guardar contraseñas temporales en texto plano.
- Escrituras exigen origen exacto y cabecera propia para protección CSRF; CORS explícito. Rate limit persistente de autenticación. En AWS verificar el origen confiable de la IP, añadir cuotas y protección perimetral antes de publicar.
- Credenciales, archivos de DB y correos locales van en `.local/`, ignorado por Git. En AWS, secretos de runtime mediante el mecanismo de secretos seleccionado e IAM mínimo. No copiar secretos, bases o datos de Kuvvi.
- La bandeja de correo de desarrollo se deshabilita en producción y solo permite ver la empresa actual. Borrar el contenido sensible de la cola tras entrega; definir retención y limpieza de logs locales antes de usar datos reales.

## 6. Agenda, correo y estados

`scheduled → completed` o `scheduled → cancelled`; no reabrir actividades por efectos de un reintento. La interfaz F1 implementa completar; cancelación aún pendiente.

Las fechas se almacenan en UTC. La interfaz inicial indica explícitamente que usa la zona del dispositivo; el render por zona de empresa debe implementarse antes del uso multizona.

Actividad + recordatorio y resultado + siguiente seguimiento se guardan en transacciones. Cada actividad tiene clave de idempotencia por empresa. Un conflicto con otra carga debe rechazarse, no reutilizar datos silenciosamente.

Los recordatorios usan una cola persistente, bloqueo temporal de trabajo, hasta cinco intentos y espera creciente. Una entrega confirmada no se repite en el recorrido normal. **No prometer exactly-once:** si el proveedor acepta y el proceso cae antes de guardar `sentAt`, podría repetirse. Documentar y probar conciliación antes de producción.

## 7. Dinero, Wompi y ERP (reglas para etapas posteriores)

- Precios, duración de prueba, plan, usuarios facturables, recargos y soporte: configuración versionada con vigencia y copia inmutable en la cotización.
- Calcular dinero en enteros de unidad menor y porcentajes en puntos básicos; explicitar moneda y conversión que espera Wompi. No copiar los pesos enteros del dominio de Kuvvi sin adaptar el contrato.
- Mostrar plan, usuarios, soporte, pasarela e impuestos antes de pagar. Las tasas contractuales y la base imponible requieren definición; no hardcodear los porcentajes de Kuvvi.
- Firma del proveedor según documentación vigente. Para eventos de Wompi Colombia, comprobar el SHA256 de propiedades + timestamp + secreto especificado por Wompi; **no asumir HMAC genérico** por lo escrito en Kuvvi. Comparación segura, referencia, moneda, importe, estado e idempotencia obligatorios.
- El retorno de checkout no activa la suscripción. Webhook verificado y conciliación constituyen la autoridad. Sandbox antes de producción; pagos recurrentes requieren el producto y consentimiento adecuados.
- ERP: adaptador con idempotencia, estado pendiente/enviado/error y trazabilidad. Solo confirmar enviado con respuesta verificable. Catálogo y precios de cada pedido quedan congelados al confirmar.

## 8. Ubicación y AWS

Captura con permiso y contexto laboral; precisión y fecha de última posición visibles. No mostrar ubicaciones simuladas como reales. Una web no garantiza seguimiento continuo con pantalla bloqueada. La ubicación y las visitas verificadas quedan para F4.

Objetivo AWS: frontend estático, API por consumo, correo transaccional y PostgreSQL dimensionado. No incorporar Redis, WebSockets permanentes, NAT Gateway o capacidad provisionada por copiar la arquitectura de Kuvvi. Elegir con mediciones y presupuesto. La decisión RDS/Aurora y su costo total requieren región, carga, conexiones, backups, almacenamiento y tolerancia al arranque.

Los cambios locales y pruebas están autorizados. No modificar infraestructura, dominio ni recursos de Kuvvi al trabajar en Ruts68. Un despliegue de producción se prepara con validaciones, migraciones y costos antes de ejecutarlo conforme a la autorización de la sesión.

## 9. Calidad y definición de terminado

Ejecutar desde la raíz:

```text
npm run typecheck
npm test
npm run test:integration
npm run routes:check
npm run build
```

Toda ruta nueva exige validación, autorización y prueba de comportamiento. Probar el recorrido permitido y denegaciones entre empresas y asesores. Probar reintentos/transacciones donde haya efectos duplicables. Las pruebas de integración usan exclusivamente `ruts68_test`; no truncar la base de desarrollo.

Adoptamos de Kuvvi el objetivo de 80% de cobertura de servicios y 100% de utilidades. No declarar esas cifras alcanzadas sin medirlas. Los gates actuales verifican tipos, pruebas, manifiesto y build; cobertura medida queda pendiente de incorporar.

Revisar SQL de migraciones; nunca editar una migración aplicada. Validar migración en staging antes de producción. No guardar secretos en tests. No ignorar fallos para dar un módulo por terminado.

Al finalizar, informar qué cambió, pruebas ejecutadas y límites reales. Actualizar `ESTADO-DESARROLLO.md`. No declarar terminados Wompi, ERP, correo real, tracking ni AWS basándose en pantallas o adaptadores sin validación externa.
