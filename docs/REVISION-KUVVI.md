# Revisión de Kuvvi como referencia de Ruts68

Revisión de código y documentos locales: 2026-09-08. No es una auditoría exhaustiva de seguridad ni una validación del despliegue vivo. No se modificó Kuvvi ni se ejecutaron sus scripts de AWS.

## Evidencia inspeccionada

| Área | Evidencia en Kuvvi | Hallazgo |
| --- | --- | --- |
| Web | `front/package.json`, `front/next.config.js` | Next 14.2.5, React 18, TypeScript, exportación estática, Capacitor; además React Query, Zustand y componentes Radix. |
| API | `back/package.json`, `back/src/server.ts`, `back/CLAUDE.md` | Fastify local, funciones AWS Lambda, Prisma, Zod, Vitest, SDK de AWS. |
| Datos | `back/prisma/schema.prisma`, `back/src/db/prisma.ts` | PostgreSQL/Aurora; cliente Prisma diferido para esperar secretos de Lambda. |
| Dominios | `back/src/core/README.md`, módulo institutions | Extracción de dominios compartidos y convenciones Service/Repository/Schema/handlers. |
| Rutas | `back/routes.manifest.json`, `Makefile` | Mapeo ruta-función. `make register-routes` llama a `back/scripts/register-new-routes.sh`, una operación de registro de API Gateway. |
| Negocio | `CLAUDE.md`, `back/src/shared/utils/fare/total.ts` | Roles de salud, tarifas de cuidados, comisiones y lógica de estados específicas de Kuvvi. |

## Qué se adopta y qué se adapta

| Regla | Clasificación | Aplicación en Ruts68 |
| --- | --- | --- |
| Front y back separados; TypeScript estricto | Adoptada | Workspaces npm, Next y Fastify. |
| UI española / código inglés | Adoptada | Interfaz comercial con mensajes en español. |
| Handler delgado / service / repository / Zod | Adoptada | Dominios identidad, CRM y notificaciones. |
| Prisma + PostgreSQL + migraciones | Adoptada | PostgreSQL real local; misma familia de motor para AWS. |
| Permisos y organización en servidor | Reforzada | Relaciones compuestas cliente-asesor-empresa; pruebas negativas. |
| JWT RS256 + Redis | Adaptada | Sesiones opacas revocables en PostgreSQL para F1 web; evita Redis inicial. |
| Singleton obligatorio | Adaptada | Inyección de dependencias, clientes reutilizables; facilita pruebas reales. |
| Una Lambda por handler | Adaptada | Adaptador único inicial con rutas por dominio; separación futura por evidencia de carga/permisos. |
| Manifiesto inmutable generado al registrar AWS | Corregida | Registro fuente en TypeScript, generación local pura y comprobación en CI. |
| HMAC-SHA256 genérico para Wompi | Corregida en la guía | Usar contrato vigente del evento de Wompi: propiedades, timestamp, secreto y SHA256. Integración aún pendiente. |
| Tarifas de salud / OTP / pacientes / cuidadores / IPS | No aplica | No trasladar al CRM. |
| WebSocket y Capacitor | Pospuesta | Web primero; tracking real requiere otra etapa. |
| Objetivos de cobertura y checks | Adoptada con evidencia | Tipos, tests, build y rutas; porcentajes no declarados sin informe. |

## Desajustes documentales detectados

- El CLAUDE del backend menciona `src/db/migrations`, pero el schema y migraciones que inspeccionamos viven en `back/prisma/`.
- La regla del manifiesto combina prohibición de edición, regeneración y un comando que opera sobre API Gateway. Ruts68 separa generación local y despliegue para evitar efectos remotos al añadir rutas.
- La guía raíz incluye ejemplos de SAM, mientras el mapa operativo usa Makefile y scripts. En Ruts68 los comandos documentados deben existir y hacer exactamente lo descrito.
- El conteo fijo de tests en guías se puede desactualizar. Se sustituye por comandos verificables y un informe fechado.
- No se replican las versiones antiguas de Next ni datos/credenciales de Kuvvi. La nueva aplicación usa dependencias propias con lockfile.

Referencias externas verificadas: [eventos Wompi Colombia](https://docs.wompi.co/docs/colombia/eventos/), [exportación estática Next.js](https://nextjs.org/docs/app/guides/static-exports), [precios Lambda](https://aws.amazon.com/lambda/pricing/). Las referencias no convierten los adaptadores pendientes en integraciones validadas.
