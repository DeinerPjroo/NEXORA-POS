# Progreso real

Fecha de referencia: **17 de noviembre de 2026**, America/Bogota. Entrega **0.12.0** verificada. Fase 2 con catálogo, caja, pedidos, abonos/mixtos, descuentos/propinas, devoluciones parciales, partes iguales e impuestos globales/por producto. Todavía no se declara lista para producción.

## Implementado y probado

- Monorepo backend/frontend/mobile/desktop/docs/scripts, instrucciones permanentes y documentación completa del requerimiento original.
- Laravel 13.43 / Sanctum 4.5 con API v1 y React 19.3 / TypeScript / Vite 8.3 / Tailwind 4.3.
- Registro atómico de empresa, propietario, siete roles iniciales, permisos, sucursal y ajustes.
- Cookies de sesión, CSRF, renovación al entrar, cierre, contraseñas hasheadas, límites de intentos, recuperación con broker Laravel y revocación de sesiones.
- Contexto derivado del usuario autenticado, scope obligatorio, bindings aislados, Policies/Gates y FKs compuestas para referencias internas.
- Sucursales: consultar, buscar en el cliente, crear, editar y activar/desactivar.
- Roles: consultar, crear y editar permisos dentro del alcance del actor; propietario y rol propio protegidos.
- Equipo: consulta real de usuarios de la empresa; no se implementó alta de empleados.
- Resumen con conteos reales de configuración y actividad administrativa; no hay métricas de ventas simuladas.
- Preferencias de empresa: nombre, tipo, moneda y zona. Interfaz inicialmente es-CO; COP/USD/EUR admitidos, sin conversión automática. El circuito de cobro usa dos decimales.
- Nexora Studio inicial: colores, claro/oscuro, bordes, vista previa, publicación, historial y restauración a una nueva versión. Control de concurrencia por revisión y auditoría transaccional.
- Navegación adaptable, barra plegable, formularios, modales con Escape/foco, estados pendientes/errores, notificaciones y señal de desconexión.
- Migraciones, factory de usuario con contexto, semillas técnicas y exportador de DDL MySQL para modelado en Workbench.
- Comando `php artisan nexora:doctor` para diagnóstico de conexión, sin modificar bases ni mostrar credenciales.
- Catálogo: categorías con color, descripción y estado; productos con SKU, código de barras, precios/costos decimales y disponibilidad. Sin borrado de registros.
- Búsqueda, filtros y paginación de servidor. Selector de categorías con búsqueda y páginas, sin limitarlo a las primeras categorías.
- Permisos catalog.view/catalog.manage/catalog.costs; costos ocultos en API para quien no tiene permiso. Nuevas capacidades concedidas automáticamente solo a propietarios existentes.
- Revisiones y bloqueos para evitar sobrescritura de productos/categorías. Moneda protegida desde el primer producto, con validación del contexto monetario al guardar.
- MariaDB conectado y migración del catálogo aplicada. Script de pruebas SQL en esquema aleatorio nuevo conservado y guardas antes de RefreshDatabase; DROP DATABASE prohibido por continuidad.
- Ficha por producto en /productos/:id. Carga, sustitución y retirada de una fotografía privada; JPEG/PNG/WebP validados y recodificados con GD. Sin rutas de archivos expuestas por API.
- Variantes paginadas con nombre, SKU/barcode, precio/costo y disponibilidad propios, relación tenant/producto protegida y desactivación sin borrado.
- Un espacio de SKU y otro de barcode compartidos entre productos y variantes en el servidor; escritura serializada por empresa y restricciones propias por tabla.
- Toda mutación de variante o fotografía incrementa la revisión del producto. Formularios y selección de archivo conservan la revisión original ante refetch en segundo plano.
- Caja por sucursal: caja principal creada automáticamente y cajas adicionales, apertura única, ingresos/egresos manuales con motivo, cierre con conteo y diferencia firmada. Sesiones y movimientos preservados.
- Pedidos con catálogo y selección obligatoria de variante cuando exista, cantidades enteras y notas; snapshots de nombre/SKU/precio y subtotal recalculado en servidor con BCMath.
- Estados pendiente → preparación → listo → entregado, cancelación motivada antes de entrega y eventos históricos. Cambios con revisión y permisos propios; un pedido vendido no se cancela, gestiona devolución desde su recibo. Entregar por sí solo no cobra.
- UUID idempotente para cada comando operativo, bloqueo transaccional, auditoría y FKs compuestas. Reintentar tras perder una respuesta no repite la operación.
- Pantallas adaptables de caja, historial, arqueo, toma y detalle de pedidos. El formulario conserva el envío incierto en memoria mientras permanece abierto; no es una cola offline.
- La moneda queda bloqueada también cuando existen sesiones de caja o pedidos, aunque no haya productos.
- Configuración confirmada de ventas: sin impuesto adicional automático o un porcentaje adicional sobre base, tasa/nombre explícitos y revisión. Sin asignación automática de régimen/tasa legal.
- Venta en efectivo desde pedido, descuento fijo con permiso/motivo, subtotal global y impuesto redondeados half-up a dos decimales, recibido/cambio y movimiento por total neto.
- Unicidad de venta por pedido más UUID idempotente; venta/pago/caja/revisión/secuencia/auditoría en una transacción. Prueba de reversión completa si falla la auditoría.
- Recibo interno correlativo por empresa, datos comerciales e importes históricos, consulta filtrada y detalle/impresión mediante navegador. No es factura electrónica.
- Devolución total única con permiso/motivo y salida compensatoria en caja abierta de la misma sucursal/moneda con fondos suficientes, incluso una sesión posterior. Pago original conservado.
- Nuevos permisos sales.view/collect/configure/discount/refund; propietarios existentes reciben las capacidades, otros roles se configuran explícitamente. Alcance en SALES.md.
- Métodos configurables cash/non_cash, revisión y creación idempotente; paginación, estado, código/tipo estable y efectivo principal protegido.
- Pago manual no efectivo con referencia y total exacto; nombre/tipo/revisión/procedencia históricos, sin movimiento de efectivo. Se conserva la compatibilidad de efectivo sin método explícito.
- Devolución por método histórico incluso archivado. No efectivo requiere referencia y no altera caja; efectivo conserva salida/fondos. Sin confirmación bancaria ni pasarela.
- Protocolo autónomo y documentos de continuidad creados. Comparación con a487f23, sin avances posteriores al iniciar. Primer commit de continuidad 942ce39 publicado en origin/main.
- Abono inicial y lotes de pagos/mixtos sobre una sola venta con total inmutable, saldo exacto BCMath y estado Abonada/Cobrada/Devuelta.
- Revisión de venta/saldo/caja y métodos; rechazo de sobrepago, escritura atómica del lote y rollback de auditoría. Reintento de lote sin duplicación.
- Recibos con pagos aplicados/saldo, historial por método/fecha y filtros de ventas abonadas. Vista móvil y formulario de lote verificados.
- Devoluciones parciales por pago con límite acumulado, revisión/idempotencia y rollback atómico. Devolución completa posterior compensa solo remanentes y cancela por separado el saldo nunca cobrado. FK a pago original e historial preservados. Devolver no crea deuda; reglas en REFUNDS.md.
- Descuento porcentual calculado half-up sobre subtotal redondeado; tipo/valor/importe históricos y fijo anterior compatible.
- Propina opcional inicialmente deshabilitada, habilitación y tratamiento de base explícitos, sales.tips y declaración de voluntariedad obligatoria/persistida. Sin propina automática ni política tributaria asignada.
- Editor de ajustes con cotización aplicada y consentimiento, recibo desglosado y ajustes bloqueados después del primer pago. Sin distribución/liquidación a empleados; ADJUSTMENTS.md describe el alcance.
- División en partes iguales antes del primer pago, centavos exactos y asignaciones por FK, saldos/límites por cuenta y globales. Sin crear cuentas artificiales en ventas anteriores; SPLIT_ACCOUNTS.md.
- Impuesto incluido global explícito: IncludedTax extrae base half-up e impuesto por diferencia, sin doble adición. Fórmula versión 2 inmutable y modos/historia anteriores versión 1, con propina participante explícita. INCLUDED_TAX.md.
- Perfiles de impuestos paralelos por producto, revisión/archivo/asignación y snapshots en pedidos con control de revisión independiente. Centavos por mayores restos, versión 3/desglose inmutable, propina participante con perfil confirmado explícito. PRODUCT_TAXES.md.

## Verificaciones realizadas

Impuestos por producto 0.12: 158/1526 SQLite/MariaDB correctos, base nexora_test_1aa1ffc21f55ed9a conservada. Suite completa 15 Playwright aprobada (12.5 min), migración 000012 aplicada, doctor/DDL/build/TypeScript/Prettier/Pint/Composer/captura móvil y tres guardas negativas del fixture correctos.

Impuesto incluido 0.11: 144/1357 SQLite/MariaDB correctos, base nexora_test_41ab664d56d22c58 conservada. Suite completa 14 Playwright aprobada (10.8 min), incluido ajustes/venta incluida/snapshot/devolución/cierre. Migración 000011 aplicada, doctor/DDL, build/TypeScript/Prettier/Pint/Composer y captura móvil correctos.

División 0.10: 136 pruebas/1260 aserciones correctas en SQLite y MariaDB (nexora_test_62107b358ab9bfdb conservada). Suite completa 14 Playwright aprobada en 10.0 minutos, incluido recorrido división→abonos mixtos→devolución parcial→saldar partes→devolución total→cierre. Migración 000010 aplicada, doctor/DDL, Pint/Composer, build/formato y captura móvil correctos.

Continuación autónoma: código local y origin/main contrastados en a487f23, sin cambios locales previos ni avances posteriores. La suite de referencia volvió a pasar en SQLite/MariaDB (82/591); la actual de 0.6 pasó 90/684. Las pruebas SQL conservan cada base aislada; ejecuciones anteriores a esta política utilizaban limpieza. Estado vigente en PROJECT_STATE.json y tareas en TASKS.md.

| Verificación | Resultado / alcance |
| --- | --- |
| PHP y extensiones, Composer, Node, npm y cliente SQL | Inspeccionados antes de instalar |
| `php artisan test` | 158 pruebas y 1526 aserciones aprobadas en SQLite: identidad/catálogo/operación, abonos, ajustes/propinas, devoluciones, cuentas, impuestos globales/por producto, snapshots, precisión, tenant/FK/permisos, idempotencia, conflictos y rollback |
| `php scripts/test-mysql.php` | 158 pruebas y 1526 aserciones aprobadas en MariaDB 10.4.32; base aislada nexora_test_1aa1ffc21f55ed9a conservada, sin DROP DATABASE ni pruebas sobre la base de trabajo |
| `php vendor/bin/pint --test` | Formato PHP verificado |
| `composer validate --strict` | Manifiesto válido |
| `composer audit --locked` | Sin avisos conocidos en el resultado consultado |
| `npm run check` / `npm run build` | TypeScript y compilación de producción correctos |
| `npm run format:check` | Formato frontend verificado |
| `npm audit --omit=dev` | Sin vulnerabilidades conocidas en dependencias de runtime en el resultado consultado |
| `npm run test:e2e` | 15 aprobadas en 12.5 minutos: 13 recorridos Chromium y 2 comprobaciones monetarias. Incluye identidad/catálogo/operación, abonos/mixtos/reintentos, consentimiento de tip, impuestos globales/por producto, perfiles/asignación/archivado/snapshots, devoluciones, cuentas/centavos, móvil, impresión y cierre |
| Capturas | Revisadas en escritorio y móvil; docs/screenshots incluye caja/pedidos, cobro y recibo. internal-receipt.pdf es una salida de impresión con datos de prueba |
| Exportación DDL | Generada desde migraciones en modo pretend, sin abrir conexión SQL |
| `php artisan nexora:doctor` sobre configuración SQL actual | Conexión correcta con MariaDB 10.4.32; migraciones de identidad, catálogo, caja/pedidos y ventas aplicadas |

Las pruebas SQLite y las pruebas reales en MariaDB se complementan. SQLite NUMERIC no garantiza precisión en los extremos de DECIMAL(19,4); MariaDB es la referencia monetaria. La validación específica de MySQL 8 aún está pendiente. Playwright usa una base SQLite separada, fotografías en .runtime/e2e-catalog y un prefijo de caché nuevo por ejecución, con servidores 8011/5199 sin alterar `.env`. El correo de desarrollo usa transporte log: se comprueba la notificación y el broker, no una entrega SMTP externa.

## Pendiente para cerrar los cimientos

1. Mantener MariaDB activo en XAMPP y las credenciales locales configuradas. El entorno usa driver mysql con MariaDB, sin sustituirlo por SQLite.
2. Añadir CI y validación específica en MySQL 8, pruebas de carga/concurrencia y comprobación visual de la importación EER en Workbench. La suite de integración ya pasó en MariaDB.
3. Configurar SMTP y verificar entrega; verificación de correo, MFA, PIN y bloqueo de pantalla aún pendientes.
4. CI, backups/restauración, HTTPS productivo, monitoreo y pruebas de carga antes del lanzamiento comercial.

## Fuera del alcance implementado

No existen todavía mesas, pasarelas, división por productos/unión de cuentas, liquidación/reparto de propinas, devoluciones por producto, conciliación, KDS/Reverb, inventarios/recetas, compras, empleados/asignaciones, clientes/fidelización, domicilios, reportes comerciales, facturación, planes/suscripciones, superadministración o landing. Abonos/mixtos y propinas son registros manuales, no confirmaciones bancarias. La entrega sigue separada del pago. En catálogo faltan galerías, subcategorías, modificadores, combos y precios por sucursal/canal. Tampoco editor avanzado, widgets, documentos, automatizaciones, layouts importables, móvil/escritorio, offline, hardware o DIAN.

Esas funciones están conservadas en REQUIREMENTS, diseñadas a nivel de arquitectura y repartidas en ROADMAP; no se anuncian como operativas.
