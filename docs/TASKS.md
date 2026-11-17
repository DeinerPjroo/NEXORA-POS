# Tareas y criterios de aceptación

Estado inicial contrastado con código local y origin/main: a487f235649d2a7cf769b317a66229e8beabdd6a, versión 0.5.0. Árbol limpio. No hay avances posteriores a esa referencia al iniciar esta continuación.

| ID | Estado | Capacidad y criterio de aceptación | Dependencias |
| --- | --- | --- | --- |
| CONT-01 | COMPLETED | Documentos de continuidad, protocolo permanente y pruebas SQL sin DROP DATABASE; 82/591 en SQLite y MariaDB, esquema aislado conservado | Ninguna |
| 2.1-A | IN_PROGRESS | Métodos configurables y cobro/devolución manual no efectivo. Formularios conectados, nombre/tipo históricos, efectivo sin cambios indebidos, permisos, revisiones, idempotencia y E2E | Ventas 0.5 |
| 2.1-B | PENDING | Abonos parciales y pagos mixtos, saldo pendiente exacto, preservación de ventas/recibos anteriores y reintentos sin duplicados | 2.1-A |
| 2.1-C | PENDING | Propinas y descuento porcentual con snapshots/redondeo, permisos y pruebas | 2.1-B |
| 2.1-D | PENDING | Devoluciones parciales y división de cuentas con asignaciones y límites contra sobrepago/sobredevolución | 2.1-B/C |
| 2.1-E | PENDING | Impuestos incluidos y múltiples por producto sin reinterpretar ventas anteriores | Catálogo y cálculo versionado |
| 2.1-F | PENDING | Conciliación manual e historial financiero; estados nunca equivalentes a confirmación de proveedor | 2.1-B/D |
| 2.2 | PENDING | Ampliaciones de catálogo: subcategorías, modificadores/adicionales/exclusiones, combos, promociones, galería, precios y horarios; subdividir antes de implementar | 2.1, catálogo actual |
| 2.3 | PENDING | Terminal POS táctil reutiliza dominios, componentes autorizados preparados para Studio, inicio por permisos | 2.1/2.2; mesas/delivery mínimos cuando corresponda |
| 2.4 | PENDING | Salones/editor/mesas, asignación/traslado, cuentas/meseros y reservas integrados en POS | 2.3, empleados mínimos |
| 2.5 | PENDING | Dashboard comercial real por fecha/sucursal, sin ganancias definitivas; E2E apertura→pedido→cobro→cierre | 2.1–2.4 |
| 1-SEC | PENDING | PIN, bloqueo, verificación de correo, MFA y auditoría de denegaciones; subdividir | Identidad existente; SMTP externo para entrega |
| 1-OPS | PENDING | CI, concurrencia, backups/restauración, MySQL 8 y EER verificados según entorno disponible | Infraestructura local/CI; no destruir datos |
| 3.1 | PENDING | Kitchen/KDS, estaciones, Reverb, tiempos, prioridades e historial | Pedidos/POS |
| 3.2 | PENDING | Inventario/kardex/unidades/ajustes/traslados y vencimientos | Catálogo/sucursales |
| 3.3 | PENDING | Recetas/subrecetas/costos y consumos idempotentes compensables | 3.2 y ventas |
| 3.4 | PENDING | Proveedores/compras/recepciones/cuentas por pagar | 3.2 |
| 3.5 | PENDING | Empleados/usuarios/sucursales/turnos/asistencia/comisiones | Equipo/permisos |
| 3.6 | PENDING | Clientes/direcciones/historial/puntos/membresías/cupones | Ventas |
| 3.7 | PENDING | Reportes reales y exportaciones Excel/PDF | Dominios anteriores |
| 4 | PENDING | Studio avanzado por componentes/schemas/autorización, editor/layouts/documentos/borradores/publicación | POS/dashboard y tema actual |
| 5 | PENDING | SaaS: superadmin, empresas/planes/límites/suscripciones/soporte/landing, restricciones backend | Dominios estables; cobros comerciales requieren autorización |
| 6 | PENDING | Móvil/escritorio/offline/QR/delivery/hardware/pasarelas/DIAN; subdividir y comprobar cada integración | Web estable y dependencias externas |

## Verificación de referencia

0.5: 82 pruebas backend / 591 aserciones en SQLite y MariaDB; 10 Playwright. Resultados heredados contrastados con código; las ejecuciones de esta continuación se registran en PROJECT_STATE/HANDOFF conforme ocurren.

Ninguna fila agregada representa una fase completada. Antes de iniciar cada bloque grande, desglosar criterios e implementar un incremento funcional a la vez.
