# Progreso real

Fecha de referencia: **17 de noviembre de 2026**, America/Bogota. Entrega **0.5.0**. Base de Fase 1 operativa en MariaDB; Fase 2 con catálogo, caja, pedidos y venta/devolución en efectivo. Todavía no se declara lista para producción.

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
- MariaDB conectado y migración del catálogo aplicada. Script de pruebas SQL en base temporal aleatoria, con limpieza exclusiva de esa base y guardas antes de RefreshDatabase.
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

## Verificaciones realizadas

Continuación autónoma: código local y origin/main contrastados en a487f23, sin cambios locales previos ni avances posteriores. La suite de referencia volvió a pasar en SQLite (82/591). La política nueva de pruebas SQL conserva cada base aislada; los resultados históricos de la tabla de 0.5 describen la limpieza anterior. Estado vigente en PROJECT_STATE.json y tareas en TASKS.md.

| Verificación | Resultado / alcance |
| --- | --- |
| PHP y extensiones, Composer, Node, npm y cliente SQL | Inspeccionados antes de instalar |
| `php artisan test` | 82 pruebas y 591 aserciones aprobadas en SQLite en memoria: identidad, catálogo, caja/pedidos/ventas, permisos, precisión, referencias entre empresas, idempotencia, conflictos y rollback de auditoría |
| `php scripts/test-mysql.php` | 82 pruebas y 591 aserciones aprobadas en MariaDB 10.4.32 en una base nueva temporal; eliminada al finalizar, sin ejecutar pruebas sobre la base de trabajo |
| `php vendor/bin/pint --test` | Formato PHP verificado |
| `composer validate --strict` | Manifiesto válido |
| `composer audit --locked` | Sin avisos conocidos en el resultado consultado |
| `npm run check` / `npm run build` | TypeScript y compilación de producción correctos |
| `npm run format:check` | Formato frontend verificado |
| `npm audit --omit=dev` | Sin vulnerabilidades conocidas en dependencias de runtime en el resultado consultado |
| `npm run test:e2e` | 10 pruebas: 8 recorridos Chromium y 2 comprobaciones de dinero/borrador. Incluye catálogo/móvil/conflictos, respuesta perdida al abrir caja, arqueo, pedidos con variantes, venta con impuesto/descuento/cambio, impresión y respuesta perdida en cobro/devolución sin duplicados |
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

No existen todavía mesas, pagos electrónicos/parciales/mixtos, cuentas divididas, propinas, impuestos incluidos o múltiples por producto, descuentos porcentuales, devoluciones parciales, KDS/Reverb, inventarios/recetas, compras, alta de empleados o asignación por sucursal, clientes/fidelización, domicilios, reportes comerciales, facturación, planes/suscripciones, superadministración ni landing comercial. Caja contempla efectivo declarado y venta/devolución total; la entrega del pedido sigue separada del pago. En catálogo siguen pendientes galerías múltiples, subcategorías, grupos de modificadores, combos y precios por sucursal/canal. Tampoco editor avanzado drag-and-drop, widgets, documentos, automatizaciones, importación/exportación de layouts, aplicaciones móvil/escritorio, sincronización offline, impresión térmica/hardware o integración DIAN.

Esas funciones están conservadas en REQUIREMENTS, diseñadas a nivel de arquitectura y repartidas en ROADMAP; no se anuncian como operativas.
