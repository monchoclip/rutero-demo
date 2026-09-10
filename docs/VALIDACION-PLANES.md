# Validación por fase

Registro de los agentes 5.5 y de los gates ejecutados en local.

| Fase | Implementación | Agente independiente | Evidencia |
| --- | --- | --- | --- |
| P1 Paginación | `a9ef2da` | APROBADO (`p1_validate_final`) | 27 unitarias, 36 integración, typecheck, rutas y build |
| P2 Tiempo real SSE | `5c9d792`, `eb51567` | APROBADO (`p2_validate_final2`) | `reply.hijack`, aislamiento por empresa, 30 unitarias, 37 integración |
| P3 Visitas/mapa | `0bcfa20`, `75cfb62`, `f361301`, `29e80f9` | APROBADO (`p3_validate_security_final`) | cierre cruzado bloqueado, mapa, evidencia, 30 unitarias, 38 integración |
| P4 Fotos/S3 | `91ec770`, `e416ad5` | Pendiente por límite de agentes | gates locales: 33 unitarias, 41 integración, typecheck, rutas y build; revisión CTO completada |
| P5 Catálogo/campañas | `50b8961`, `2b90487` | Pendiente por límite de agentes | 41 integración; vigencia de campañas/productos y aislamiento revisados localmente |
| P6 Pedidos/ERP | `ccf8427`, `4230c1a`, `e015bb7` | Pendiente por límite de agentes | 41 integración; snapshot, idempotencia, ERP simulado y cola offline |
| P7 Meta/Wompi | `bd83beb` + adaptadores existentes | Pendiente sandbox externo | Firmas, secretos e idempotencia verificadas localmente; requiere credenciales reales |
| P8 UX/UI | histórico F1 + módulos P5/P6 | Pendiente por recorrido independiente | build estático y revisión de CSS responsive/foco |
| P9 AWS | `dce70e6` | Pendiente de staging | plantilla CloudFormation y checklist; no se desplegó |

Los rechazos de P2 y P3 se corrigieron antes de avanzar. El agente de P4 detectó tres riesgos, corregidos en `e416ad5`; al intentar levantar un validador nuevo la plataforma informó límite de hilos/cuota. No se presenta P4–P9 como certificación de producción hasta completar esas validaciones y, para P7/P9, usar credenciales y una cuenta AWS de staging.
