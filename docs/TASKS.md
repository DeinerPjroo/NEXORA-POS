# Tareas y criterios de aceptación

Estado inicial contrastado con código local y origin/main: a487f235649d2a7cf769b317a66229e8beabdd6a, versión 0.5.0. Árbol limpio. No hay avances posteriores a esa referencia al iniciar esta continuación.

| ID | Estado | Capacidad y criterio de aceptación | Dependencias |
| --- | --- | --- | --- |
| CONT-01 | COMPLETED | Documentos de continuidad, protocolo permanente y pruebas SQL sin DROP DATABASE; 82/591 en SQLite y MariaDB, esquema aislado conservado | Ninguna |
| 2.1-A | COMPLETED | Métodos configurables y cobro/devolución manual no efectivo. Backend 90/684 SQLite/MariaDB y 10 Playwright; migración aplicada, build/formato y capturas verificados | Ventas 0.5 |
| 2.1-B | COMPLETED | Abonos/mixtos, saldo e historial, devolución de importes realmente cobrados. Migración 000007 aplicada; 100/808 SQLite/MariaDB, 11 Playwright, build/formato y capturas correctos | 2.1-A |
| 2.1-C | COMPLETED | Porcentaje y propinas voluntarias con configuración/snapshot/consentimiento; migración 000008 aplicada, 108/891 SQLite/MariaDB, 12 Playwright y build/formato correctos | 2.1-B |
| 2.1-D1 | COMPLETED | Devoluciones parciales conectadas, límites acumulados y cierre de remanentes. Migración 000009 aplicada; 122/1097 SQLite/MariaDB, 13 Playwright, build/formato y capturas correctos | 2.1-B/C |
| 2.1-D2 | COMPLETED | División en partes iguales, FK/asignaciones/saldos y límites por parte/globales. Migración 000010 aplicada; 136/1260 SQLite/MariaDB, 14 Playwright y build/formato/capturas correctos | 2.1-D1 |
| 2.1-E | COMPLETED | Impuestos incluidos globales y varios por producto, snapshots/versiones y sin reinterpretar ventas anteriores; E1/E2 verificados | Catálogo y cálculo versionado |
| 2.1-E1 | COMPLETED | Impuesto incluido global conectado/versionado, sin doble adición y propina explícita. Migración 000011 aplicada; 144/1357 SQLite/MariaDB, 14 Playwright y build/formato/captura correctos | 2.1-D2 |
| 2.1-E2 | COMPLETED | Perfiles/asignación/snapshots y cálculo por líneas, versión 3/propina/centavos. Migración 000012 aplicada; 158/1526 SQLite/MariaDB, 15 Playwright, build/formato/captura y guardas correctos | 2.1-E1 y catálogo |
| 2.1-F | COMPLETED | Historial de pagos y revisión humana no efectiva conectados; estados nunca equivalentes a confirmación de proveedor. F1/F2 verificados | 2.1-B/D1/D2 |
| 2.1-F1 | COMPLETED | Historial conectado, filtros/zonas/netos y resumen de página/moneda; migración 000013 aplicada, 165/1645 SQLite/MariaDB, 16 Playwright (13.2 min), build/formato y capturas correctos | 2.1-E2 |
| 2.1-F2 | COMPLETED | Revisión manual conectada, permiso/historial/versiones/obsolescencia; migración 000014 aplicada, 175/1818 SQLite/MariaDB, 17 Playwright (10.4 min), build/formato y capturas correctos | 2.1-F1 |
| 2.2 | IN_PROGRESS | Catálogo avanzado subdividido en A/B/C1/C2/D/E/F; criterios y dependencias en CATALOG_ADVANCED_PLAN.md | 2.1, catálogo actual |
| 2.2-A | COMPLETED | Subcategorías conectadas, padre/FK/revisión y disponibilidad heredada; migración 000015 aplicada, 182/1913 SQLite/MariaDB, 18 Playwright (11.5 min), build/formato y capturas correctos | 2.1-F2 |
| 2.2-B | COMPLETED | Grupos/opciones, selector/precio/snapshots y recibo conectados; migración 000016 aplicada, 197/2102 SQLite/MariaDB, 19 Playwright (14.7 min), recorrido UI ampliado, build/formato y capturas correctos; MODIFIERS.md | 2.2-A |
| 2.2-C1 | IN_PROGRESS | Precios explícitos por sucursal/canal, precedencia y snapshots de contexto; criterios/preview en CONTEXT_PRICES_PLAN.md | 2.2-B |
| 2.2-C2 | PENDING | Horarios/zonas/vigencia y comprobación al pedir, sin reinterpretar historial | 2.2-C1 |
| 2.2-D | PENDING | Combos con composición/selección, asignación de precio e impuestos y snapshots | 2.2-C2 |
| 2.2-E | PENDING | Promociones acotadas, prioridad/compatibilidad, cálculo/snapshot/autorización | 2.2-D |
| 2.2-F | PENDING | Galería privada ordenada/portada, recodificación, revisiones y compatibilidad | 2.2-E |
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

## Criterios históricos 2.1-D2 (completado)

- División opcional en 2–20 partes iguales elegida antes del primer pago. Total global inmutable; repartir centavos sobrantes a las primeras partes de forma determinista. Rechazar partes de importe cero.
- Conservar una venta y un recibo interno. Partes append-only con tenant/sale, número e importe; payments se asignan por FK compuesta a una parte de esa venta. No reasignar historia ni dividir ventas anteriores.
- Cotización de servidor con distribución previa; cobro inicial identifica parte. Abonos/mixtos posteriores limitados por saldo de parte y venta, incluso si varias líneas se aplican a la misma parte.
- Devoluciones enlazadas al payment conservan su parte y la regla de 0.9: no crear deuda nueva. Cierre completo cancela saldos no cobrados y compensa solo remanentes.
- UI con selección de parte, importes/saldos e historial en recibo, reintento exacto y revisión. Sin división por productos ni múltiples documentos fiscales en este incremento.
- Verificar centavos, límites acumulados, pertenencia/FK, atomicidad, idempotencia, pagos mixtos, devoluciones y compatibilidad sin división en SQLite/MariaDB y Chromium antes de publicar.

## Criterios históricos 2.1-E1 (completado)

Modo global inclusive explícito, sin asignar tasa legal: el subtotal/descuento conserva el precio final del catálogo y el impuesto se extrae, sin añadirlo otra vez. Sobre el importe participante G, base = round_half_up(G × 100 / (100 + tasa), 2); impuesto = G − base. Total = subtotal redondeado − descuento + propina. Si la propina participa, su importe aceptado ya contiene ese impuesto; si no, se extrae solo del importe de productos. Cadenas/BCMath con precisión suficiente, versión 2 para este cálculo y versión 1 para historial/modos anteriores.

Probar mitades/centavos y extremos, descuento fijo/porcentual, tratamiento de propina, revisión/configuración, snapshots anteriores, abonos/división/devoluciones y efectivo real. Impuestos múltiples por producto siguen siendo E2; no anunciar esa capacidad con E1.

## Criterios 2.1-F

F1 será una consulta útil de pagos aplicados con devoluciones y neto, sin duplicar totales de venta al haber varios pagos. Filtros tenant/sucursal, fechas interpretadas en zona de empresa, tipo de método histórico y referencia escapada; paginación real y resumen de la página por moneda con BCMath. sales.view y sin filtrar saldos de caja a roles que no los consultan. No llamar ingreso/ganancia definitiva al neto de pagos.

F2 añadirá declaraciones de revisión humana de no efectivos, nunca aprobación de banco/pasarela. Permiso sales.reconcile (propietarios existentes), revisión de venta y de revisión manual, UUID y auditoría/transacción. Registro append-only con importe observado/referencia/estado (revisado manualmente, diferencia, pendiente), sin mutar Payment/Sale/caja. Si cambia revisión de venta por pago/devolución, mostrar que necesita nueva revisión; no conservar una conciliación aparentemente actual sobre datos cambiados. Desglosar antes de implementar y probar conflictos/rollback/tenant además del flujo UI.

### Aceptación F2

- Migración incremental con historial payment_reviews y FK tenant/sale/payment, actor y sucursal. Versiones correlativas por pago; sin edición/borrado ni cambio de importes financieros.
- POST idempotente con sales.reconcile antes del replay, revisión de venta/manual y neto esperado. Rechazar cash, contexto ajeno y neto/revisiones obsoletos. Revisado exige observado igual al neto; diferencia exige distinto; pendiente requiere motivo. Referencia para estados con importe y declaración humana explícita.
- Auditoría y revisión en una transacción; conservar UUID/payload exactos tras respuesta incierta. Diferencia firmada con BCMath, incluido neto cero. Cambios financieros posteriores muestran revisión obsoleta; nunca confirmación de banco/proveedor.
- GET paginado con sales.view y consulta de estado en historial de pagos; filtros de estado en servidor. UI con importe observado sin autocompletar, referencia, motivo, consentimiento y consulta de declaraciones anteriores. Lectores sin permiso de conciliación no pueden escribir.
- Probar aislamiento/FK/permisos, validación/precisión, conflictos, append-only, rollback, reintento e invalidación tras devolución en SQLite/MariaDB y Chromium. Verificar formato/build/móvil y documentar antes de commit/push.
