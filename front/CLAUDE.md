@AGENTS.md

# Frontend Ruts68

Leer primero `../CLAUDE.md`. El bloque de Next en `AGENTS.md` complementa estas reglas, no define el negocio.

- App Router con `output: 'export'`. Layout estático y componentes cliente únicamente para interacción/datos autenticados.
- `src/lib/api.ts` centraliza URL, credenciales, timeout y errores; el contrato real está en `../back/src/routes.ts` y su manifiesto generado.
- No usar almacenamiento del navegador como base de datos ni para tokens. Cookie HttpOnly gestionada por el servidor.
- UI en español, código en inglés. Labels, foco visible, HTML semántico y diálogos accesibles. Estados de carga/error/vacío y botones bloqueados durante mutaciones.
- Mantener el verde del demo como referencia de marca, con interfaz comercial multisector. No copiar términos clínicos, balboas o datos ficticios de Kuvvi.
- Los permisos en UI reflejan al servidor; nunca sustituyen autorización.
- No mostrar correos enviados, pagos aprobados, GPS real o sincronización ERP cuando sean funciones pendientes.
- Verificar con `npm run typecheck` y `npm run build` en este workspace. No requiere Capacitor.
