# Validación por fase

Registro de los agentes 5.5 y de los gates ejecutados en local.

| Fase | Implementación | Agente independiente | Evidencia |
| --- | --- | --- | --- |
| P1 Paginación | `a9ef2da` | APROBADO (`p1_validate_final`) | 27 unitarias, 36 integración, typecheck, rutas y build |
| P2 Tiempo real SSE | `5c9d792`, `eb51567` | APROBADO (`p2_validate_final2`) | `reply.hijack`, aislamiento por empresa, 30 unitarias, 37 integración |
| P3 Visitas/mapa | `0bcfa20`, `75cfb62`, `f361301`, `29e80f9` | APROBADO (`p3_validate_security_final`) | cierre cruzado bloqueado, mapa, evidencia, 30 unitarias, 38 integración |
| P4 Fotos/S3 | `91ec770`, `e416ad5` | APROBADO (`catalog_campaigns`) | 35 unitarias, 42 integración, typecheck, rutas y build; sin hallazgos P0/P1 |
| P5 Catálogo/campañas | `50b8961`, `2b90487` | APROBADO (`catalog_campaigns`) | 42 integración; vigencia, aislamiento y selección de productos revisados; sin hallazgos P0/P1 |
| P6 Pedidos/ERP | `ccf8427`, `4230c1a`, `e015bb7` | APROBADO (`catalog_campaigns`) | 42 integración; snapshot, idempotencia, ERP simulado y cola offline; sin hallazgos P0/P1 |
| P7 Meta/Wompi | `bd83beb` + adaptadores existentes | Pendiente sandbox externo | Firmas, secretos e idempotencia verificadas localmente; requiere credenciales reales |
| P8 UX/UI | histórico F1 + módulos P5/P6 | APROBADO (`catalog_campaigns`) | typecheck y build estático pasan; CSS responsive, foco visible, módulos dinámicos y permisos revisados; sin hallazgos P0/P1 |
| P9 AWS | `dce70e6` | APROBADO local / pendiente de staging (`catalog_campaigns`) | El agente independiente no encontró P0/P1 en la plantilla ni el checklist; no se desplegó |

Los rechazos de P2 y P3 se corrigieron antes de avanzar. El agente de P4 detectó tres riesgos, corregidos en `e416ad5`. El validador independiente 5.5 `catalog_campaigns` respondió `APROBADO` para P4, P5, P6, P8 y la preparación local de P9, sin hallazgos P0/P1, sobre el HEAD que incluye cancelación de actividades y captura automática de ubicación al tomar la foto. La edición de planes (`81178e4`) fue aprobada por `billing_plans_validator`, con los cinco gates verdes. La duración de prueba para altas futuras permanece pendiente hasta agregar una configuración de plataforma. P7 requiere credenciales sandbox; P9 todavía requiere una cuenta AWS de staging para completar el criterio operativo.
