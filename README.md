# RUTERO — demo en línea

Sitio estático del demo comercial RUTERO, publicado en https://ventas.kuvvio.com vía GitHub Pages.
Fuente del proyecto: carpeta `comercialPanama` local (index.html + estilos.css + app.js → empaquetado en `index.html`).

## Ruts68 — aplicación en desarrollo

El demo anterior se conserva como referencia. La aplicación real está en `front/` (Next.js) y `back/` (Fastify, Prisma y PostgreSQL).

Desde la raíz, con Node.js 22 o 24:

```powershell
npm install
npm run dev
```

Web local: http://localhost:3068. El comando inicia PostgreSQL local y aplica las migraciones. No requiere Docker.

Incluye registro de empresa, sesiones, invitación de asesores, cartera, agenda, registro de resultados y cola de recordatorios. Los correos se prueban localmente; Wompi, ERP, tracking y despliegue AWS están pendientes.

- Reglas: [CLAUDE.md](CLAUDE.md).
- Ejecución y recorrido: [desarrollo local](docs/DESARROLLO-LOCAL.md).
- Funcionalidades y validación: [estado de desarrollo](docs/ESTADO-DESARROLLO.md).
- Alcance completo: [CRM Ruts68](docs/RUTS68-ALCANCE.md).
- Referencia de arquitectura: [revisión de Kuvvi](docs/REVISION-KUVVI.md).
