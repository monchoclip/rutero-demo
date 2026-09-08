# Backend Ruts68

Leer primero `../CLAUDE.md` y `../docs/ESTADO-DESARROLLO.md`.

- Prisma/PostgreSQL; schema y migraciones en `prisma/`, sin dos ubicaciones alternativas.
- `src/app.ts` compone middleware, servicios y handlers. `src/server.ts` sirve localmente; `src/lambda.entry.ts` es un adaptador sin despliegue provisionado.
- `identity/`, `crm/`, `notifications/`: separar validación, negocio, consultas y transporte. Sin estado de usuario global entre invocaciones.
- Toda operación protegida recibe `Actor` del servidor. Usar el alcance de empresa y cartera, incluso cuando se conoce un UUID.
- Transacciones para altas relacionadas y cambios con recordatorio/auditoría. Las claves únicas y relaciones compuestas refuerzan aislamiento e idempotencia.
- Generar manifiesto con `npm run routes:generate` desde la raíz. Este comando es local y no registra infraestructura.
- Pruebas unitarias sin DB en `tests/unit.test.ts`; pruebas de API con PostgreSQL real separado en `tests/integration.test.ts`.
- Tipos, pruebas, manifiesto y build deben pasar. No afirmar métricas de cobertura no medidas.

Los recordatorios solo usan SES si se configura explícitamente. La ejecución de desarrollo escribe archivos de correo; no envía a personas reales.
