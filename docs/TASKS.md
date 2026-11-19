# Tareas y criterios de aceptación

Estado inicial contrastado con código local y origin/main: a487f235649d2a7cf769b317a66229e8beabdd6a, versión 0.5.0. Árbol limpio. No hay avances posteriores a esa referencia al iniciar esta continuación.

Protocolo vigente 2026-11-19: contexto mínimo, implementar/integrar, pruebas específicas según impacto, estado breve, commit/push y continuar. Suites completas solo al cerrar fase, entrega estable o cambio transversal justificado; cobertura exhaustiva de operaciones críticas. AGENTS.md sustituye las exigencias históricas de regresión completa por incremento.

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
| 2.2-C1 | COMPLETED | Reglas/menú/preview/revisión de carrito/snapshots conectados. Migración 000017/DDL, 208/2286 SQLite/MariaDB y 20 Playwright en 16.9 minutos aprobados, build/formato/doctor/capturas correctos; CONTEXT_PRICES.md | 2.2-B |
| 2.2-C2 | COMPLETED | API/UI/reloj/zona/vigencia/guardia de zona y snapshots conectados. Migración 000018/DDL, 222/2475 SQLite/MariaDB, 21 Playwright en 22.4 minutos y recorrido final C2 en 2.4 minutos aprobados. Build/formato/doctor/capturas correctos; AVAILABILITY_SCHEDULES.md | 2.2-C1 |
| 2.2-D | COMPLETED | D1 fijo0.19 y D2 alternativas0.20 verificados y conectados; contratos FIXED_COMBOS.md y COMBO_CHOICES.md | 2.2-C2 |
| 2.2-D1 | COMPLETED | Composición/API/UI/carrito/preview/reparto/snapshots/recibo conectados. Migración 000019/DDL, 232/2652 SQLite/MariaDB y 22 Playwright en 20.7 minutos aprobados; build/formato/doctor/capturas correctos. FIXED_COMBOS.md | 2.2-C2 |
| 2.2-D2 | COMPLETED | Grupos/alternativas/API/UI/carrito/preview/snapshots/recibo conectados. Migración000020/DDL; 242/2885 SQLite/MariaDB y 23 Playwright en 18.3 minutos aprobados; build/formato/doctor/capturas correctos. COMBO_CHOICES.md | 2.2-D1 |
| 2.2-E | COMPLETED | Promociones/API/UI/snapshots0.21 conectados. MariaDB dirigidas8/134+finanzas1/35, SQLite permisos/finanzas2/47 y dependencias28/538; Chromium2 en2.9min. Migración000021/DDL/build/formato/capturas correctos. PROMOTIONS.md | 2.2-D |
| 2.2-F | COMPLETED | Galería0.22/API/UI/portada/orden/reintento/legado conectados. SQLite8/121+legado10/85; SQL backfill/FK2/20 y bloqueo1/15; Chromium3 en3.3min más galería final1/1.0min; migración000022/DDL/build/formato/captura correctos. GALLERY.md | 2.2-E |
| 2.3 | COMPLETED | Terminal A/B0.23/0.24 conectados: inicio por permisos, contexto, modo táctil, pedido/cobro/recibo e incertidumbre verificados; POS.md | 2.1/2.2; mesas/delivery mínimos cuando corresponda |
| 2.3-A | COMPLETED | Terminal/pedido/cobro/recibo y controles táctiles reutilizan dominios. Tres casos Chromium aprobados: operación financiera/reintentos, permiso denegado y recibo sin historial; build/TypeScript/formato/capturas correctos. POS.md | 2.2-F |
| 2.3-B | COMPLETED | Inicio autorizado sin bucles; sucursal/canal por actor, menú/carrito móvil y F2/F8 sin cobro automático. Chromium7+POS3 y caso financiero final1/1.5min aprobados, build/formato/captura correctos;0.24 | 2.3-A |
| 2.4 | COMPLETED | A editor0.25, B ocupación/POS0.26 y C reservas0.27 integrados y verificados por impacto; TABLES_PLAN y contratos DINING_* | 2.3, usuarios existentes autorizados |
| 2.4-A | COMPLETED | Salones/mesas y editor visual/API integrados0.25; SQLite7/129, SQL5/54, registro/roles4/23 y Chromium3/1.3min más lector403 final1/19.8s; migración000023/DDL/build/formato/capturas correctos. DINING_LAYOUTS.md | 2.3 |
| 2.4-B | COMPLETED | Ocupación/unión/separación/meseros/traslado/POS0.26 integrados. SQLite40/488+paginación1/18+replay1/15; SQL1/9+5/114; Chromium ocupación4+POS3 por impacto; migración000024/DDL/build/formato/capturas. DINING_OPERATIONS.md | 2.4-A |
| 2.4-C | COMPLETED | Reservas/API/UI/horarios/zona/DST/capacidad/cruces/llegada atómica0.27. SQLite6/83+calendario1/10+dependencias15/285; SQL1/17+3/42+1/10; Chromium3 por ejecuciones dirigidas; migración000025/DDL/build/formato/capturas correctos. DINING_RESERVATIONS.md | 2.4-B |
| 2.5 | COMPLETED | Dashboard real por fecha/sucursal/moneda, comparación, series, métodos, productos y operadores; widgets y permisos. Cierre de fase2: SQLite288/3692+1skip, SQL289/3706; Chromium43 cubiertos (42 completos +1 reintento dirigido). COMMERCIAL_DASHBOARD.md. Costes/ganancia/empleados avanzados dependen de fases3–4 | 2.1–2.4 |
| 1-SEC | IN_PROGRESS | PIN, bloqueo, verificación de correo, MFA y auditoría de denegaciones mediante A–D | Identidad existente; SMTP externo para entrega |
| 1-SEC-A | IN_PROGRESS | PIN propio protegido y bloqueo de sesión exigido por servidor, interfaz de desbloqueo y pruebas dirigidas de acceso/límites/aislamiento | Identidad existente |
| 1-SEC-B | PENDING | Verificación de correo real y estado/interfaz; envío externo solo verificado con SMTP disponible | 1-SEC-A; SMTP |
| 1-SEC-C | PENDING | MFA con desafío y recuperación, integración de inicio de sesión y pruebas críticas | 1-SEC-B |
| 1-SEC-D | PENDING | Auditoría de denegaciones sin secretos y límites de acceso comprobados | 1-SEC-A/C |
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
