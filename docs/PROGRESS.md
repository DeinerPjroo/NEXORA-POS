# Progreso real

Fecha de referencia: **19 de noviembre de 2026**, America/Bogota. Incremento **0.23.0** de terminal POS operativo integrado/verificado por impacto; catálogo2.2 y terminal2.3-A completos. Sigue2.3-B (inicio por permisos/contexto/ergonomía) antes de salones/mesas2.4. Referencia completa0.20 conservada abajo; producción aún pendiente.

0.23: tres casos Chromium aprobados por ejecución dirigida (dos de permisos/recibo y operativo final1.2min). Pedido/cobro inciertos sin duplicar, impuestos mixtos/variantes/preparación/combo/promoción y contexto; total16.21/caja116.21. Build/TypeScript/formato/capturas correctos; principal494.67kB/gzip139.90. Backend financiero sin cambios; POS.md. No marcar padre2.3 completo todavía.

0.22: SQLite galería8/121 y legado10/85; SQL backfill/FK2/20 y bloqueo1/15. Chromium dirigido galería/fotografía/promociones3 en3.3min, más galería final1/1.0min con miniaturas cargadas. Migración000022 aplicada, DDL/build/TypeScript/Pint/Prettier y captura móvil correctos; principal491.75kB/gzip138.94, panel7.31kB. Contrato GALLERY.md; siguiente POS_PLAN.md. Verificaciones por impacto según AGENTS.

0.21: MariaDB dirigido8/134 más financiero1/35; SQLite permisos/finanzas2/47 y dependencias precios/combos/horarios28/538; Chromium promociones/contexto2 aprobados en2.9min. Migración000021 aplicada, DDL/build/TypeScript/Pint/Prettier y capturas admin/recibo revisados. Principal491.22kB/gzip138.73, panel promocional8.24kB. Contrato PROMOTIONS.md; protocolo vigente de pruebas dirigidas en AGENTS. Las verificaciones completas siguientes corresponden a0.20.

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
- Historial por pago con filtros/paginación, devoluciones acumuladas actuales y netos BCMath por página/moneda; fechas de empresa convertidas a zona SQL existente, sin duplicar ventas ni filtrar saldos de caja a lectores. PAYMENT_HISTORY.md.
- Revisión humana no efectiva con permiso independiente, observado/referencia, diferencias firmadas y declaraciones append-only. Estado obsoleto si cambia revisión de venta; UUID antiguo no confirma datos nuevos. PAYMENT_REVIEWS.md.
- Categorías principales/subcategorías con FK/revisión y disponibilidad efectiva heredada; selectores/rutas/filtros y validación de pedidos conectados. Sin cambiar flags descendientes ni snapshots previos. SUBCATEGORIES.md.
- Adicionales/exclusiones configurables con límites activos/archivo, selección explícita y precio por unidad, snapshots de preparación en pedido/recibo. Preparaciones distintas separadas en carrito y replay conserva precio original; MODIFIERS.md.
- Precios por sucursal/canal de producto/presentación con prioridad explícita, base separada y snapshots. Preview compartido con registro estricto y revisión del carrito conservando cantidades/notas/opciones; reintento incierto mantiene cuerpo y contexto originales. CONTEXT_PRICES.md.
- Ventanas semanales de disponibilidad heredadas por presentaciones, zona empresarial y vigencia del inicio, cruce de medianoche y archivo paginado. Comprobación real en preview/registro y snapshot histórico en pedido/cobro/recibo; un cierre no reinterpreta pedidos guardados. Formularios detectan zona obsoleta. AVAILABILITY_SCHEDULES.md.

- Combos fijos con tipo estable, política de reparto explícita y preparación por unidad, partes exactas a cuatro decimales y perfiles de componentes. Cabecera histórica agrupada sin duplicar filas facturables, revisión de carrito y replay/cobro/devolución conservados. FIXED_COMBOS.md; grupos de alternativas desde0.20 en COMBO_CHOICES.md.

## Verificaciones realizadas

Alternativas0.20: suites completas242 pruebas/2885 aserciones SQLite/MariaDB, esquema nexora_test_34164beced348cd5 conservado. Regresión completa23 Playwright aprobada en 18.3 minutos; recorrido dedicadoD2 inicial1.4min. Migración000020 aplicada, DDL/doctor/Pint/build/TypeScript/Prettier y capturas finales revisados. Principal489.93kB/gzip138.46, panel15.74 y configurador5.28kB, sin aviso. Seguridad/tenant/revisiones/UUID/rollback, selección/unidades/límites, perfiles/adicionales/descuento/cuentas/abonos/devolución e historia verificados. Padre2.2-D completado; siguiente promociones2.2-E según PROMOTIONS_PLAN.md. Verificaciones de dependencias0.19 reutilizadas sin cambios de paquetes.


Combos fijos 0.19: 232 pruebas/2652 aserciones SQLite/MariaDB correctas; nexora_test_89138c797a2eab69 conservada junto a intermedia nexora_test_894aa259f5cc3a6b (229/2615). Suite completa de 22 Playwright aprobada en 20.7 minutos, incluido nuevo recorrido de composición UI, presentación/unidades/preparaciones, UUID exacto, cambio de canal, snapshot/replay tras archivo y cobro/recibo móvil con impuestos incluidos/adicionales. Migración 000019 aplicada, DDL/Pint/Composer/doctor/build/TypeScript/Prettier y capturas correctos. Principal 489.13 kB/gzip 138.19; panel 10.73 y configurador 3.91 kB, sin aviso. Protocolo de verificación optimizado incorporado a AGENTS.

Horarios 0.18: 222 pruebas/2475 aserciones SQLite y MariaDB correctas; esquema final nexora_test_33d1dfbc81b8ea36 conservado junto a los intermedios 5c1f38d30adbbf2e (220/2450) y 35a6f4251e6a3c52 (221/2464), todos con prefijo nexora_test_. Suite completa de 21 Playwright aprobada en 22.4 minutos y recorrido final de horarios aprobado en 2.4 minutos tras añadir expected_timezone y ajustar el encuadre administrativo. Casos de medianoche/vigencia/DST, concurrencia de zona/UUID, archivo/límites/FK/permisos/rollback, cierre tras preview, preparación conservada, snapshot/replay/cobro/devolución y estado correcto tras mutaciones de fotografía. Migración 000018 aplicada, DDL/Pint/Composer/doctor/build/TypeScript/Prettier correctos y capturas finales revisadas. Principal 484.31 kB/gzip 137.01; panel de horarios 9.72 kB, sin aviso de chunk.

Precios contextuales 0.17: 208/2286 SQLite/MariaDB correctos, nexora_test_ecc5ff33045ff4fc conservada (también ejecución intermedia nexora_test_8ce5d1572ba31d9e, 203/2181). Suite completa de 20 Playwright aprobada en 16.9 minutos: configuración/edición/reintento de reglas, dos sucursales/canales, presentación/adicionales, conflicto 409 y revisión conservando preparación, preview sin pedidos, snapshot/replay tras archivo y cobro/recibo móvil. Migración 000017 aplicada, DDL/Pint/Composer/doctor/build/TypeScript/Prettier y capturas finales correctos. Principal 482.29 kB/gzip 136.38, sin aviso de chunk. MariaDB se inició normalmente al hallarse detenida durante el diagnóstico; no se cambiaron credenciales ni datos.

Modificadores 0.16: 197/2102 SQLite/MariaDB correctos, nexora_test_b3583ca6e3f978a9 conservada. Suite completa 19 Playwright aprobada (14.7 min), recorrido ampliado de edición/alta de opciones UI también aprobado (1.0 min). Migración 000016 aplicada, doctor/DDL/Pint/Composer/build/TypeScript/Prettier y capturas finales correctos (principal 492.97 kB, sin aviso tras lazy real).

Subcategorías 0.15: 182/1913 SQLite/MariaDB correctos, nexora_test_5c40f32e1978dda9 conservada. Suite completa 18 Playwright aprobada (11.5 min), migración 000015 aplicada, doctor/DDL/Pint/Composer/build/TypeScript/Prettier y capturas finales correctos. JS 499.37 kB / gzip 139.98 kB, sin aviso de chunk.

Revisión manual 0.14: 175/1818 SQLite/MariaDB correctos, nexora_test_d5020cb6b079dcf8 conservada. Suite completa 17 Playwright aprobada (10.4 min). Migración 000014 aplicada, doctor/DDL/Pint/Composer/build/TypeScript/Prettier y capturas finales correctos. Referencia/observado sin autocompletar, reintento exacto y obsolescencia por devolución verificados.

Historial 0.13: 165/1645 SQLite/MariaDB correctos, nexora_test_dc7e6176f39abc91 conservada. Suite completa 16 Playwright aprobada (13.2 min), incluido historial con 14 pagos/páginas/referencias/devolución/móvil. Migración 000013 aplicada, doctor/DDL/Pint/Composer y build/TypeScript/Prettier correctos. Capturas finales de escritorio y móvil revisadas.

Impuestos por producto 0.12: 158/1526 SQLite/MariaDB correctos, base nexora_test_1aa1ffc21f55ed9a conservada. Suite completa 15 Playwright aprobada (12.5 min), migración 000012 aplicada, doctor/DDL/build/TypeScript/Prettier/Pint/Composer/captura móvil y tres guardas negativas del fixture correctos.

Impuesto incluido 0.11: 144/1357 SQLite/MariaDB correctos, base nexora_test_41ab664d56d22c58 conservada. Suite completa 14 Playwright aprobada (10.8 min), incluido ajustes/venta incluida/snapshot/devolución/cierre. Migración 000011 aplicada, doctor/DDL, build/TypeScript/Prettier/Pint/Composer y captura móvil correctos.

División 0.10: 136 pruebas/1260 aserciones correctas en SQLite y MariaDB (nexora_test_62107b358ab9bfdb conservada). Suite completa 14 Playwright aprobada en 10.0 minutos, incluido recorrido división→abonos mixtos→devolución parcial→saldar partes→devolución total→cierre. Migración 000010 aplicada, doctor/DDL, Pint/Composer, build/formato y captura móvil correctos.

Continuación autónoma: código local y origin/main contrastados en a487f23, sin cambios locales previos ni avances posteriores. La suite de referencia volvió a pasar en SQLite/MariaDB (82/591); la actual de 0.6 pasó 90/684. Las pruebas SQL conservan cada base aislada; ejecuciones anteriores a esta política utilizaban limpieza. Estado vigente en PROJECT_STATE.json y tareas en TASKS.md.

| Verificación | Resultado / alcance |
| --- | --- |
| PHP y extensiones, Composer, Node, npm y cliente SQL | Inspeccionados antes de instalar |
| `php artisan test` | 242 pruebas y 2885 aserciones aprobadas en SQLite: identidad/catálogo/subcategorías/modificadores/precios/horarios/combos/preview/operación, abonos, ajustes/propinas, devoluciones, cuentas, impuestos globales/por producto, historial/revisión humana, snapshots, precisión, tenant/FK/permisos, idempotencia, conflictos y rollback |
| `php scripts/test-mysql.php` | 242 pruebas y 2885 aserciones aprobadas en MariaDB 10.4.32; base aislada nexora_test_34164beced348cd5 conservada, sin DROP DATABASE ni pruebas sobre la base de trabajo |
| `php vendor/bin/pint --test` | Formato PHP verificado |
| `composer validate --strict` | Manifiesto válido |
| `composer audit --locked` | Sin avisos conocidos en el resultado consultado |
| `npm run check` / `npm run build` | TypeScript y compilación de producción correctos |
| `npm run format:check` | Formato frontend verificado |
| `npm audit --omit=dev` | Sin vulnerabilidades conocidas en dependencias de runtime en el resultado consultado |
| `npm run test:e2e` | 23 aprobadas en 18.3 minutos: 21 recorridos Chromium y 2 comprobaciones monetarias. Incluye identidad/catálogo/subcategorías/modificadores/precios/horarios/combos/preview/operación, abonos/mixtos/reintentos, consentimiento de tip, impuestos globales/por producto, snapshots, historial/revisión manual, devoluciones, cuentas/centavos, móvil, impresión y cierre |
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

No existen todavía mesas, pasarelas, división por productos/unión de cuentas, liquidación/reparto de propinas, devoluciones por producto, conciliación bancaria automatizada, KDS/Reverb, inventarios/recetas, compras, empleados/asignaciones, clientes/fidelización, domicilios, reportes comerciales, facturación, planes/suscripciones, superadministración o landing. Abonos/mixtos y propinas son registros manuales; revisión humana disponible desde 0.14, sin confirmación bancaria. La entrega sigue separada del pago. Catálogo avanzado completo, con promociones desde0.21 y galería privada desde0.22; subcategorías operan desde 0.15, modificadores desde 0.16, precios por contexto desde 0.17 horarios desde 0.18 combos fijos desde0.19 y grupos de alternativas desde0.20. Tampoco editor avanzado, widgets, documentos, automatizaciones, layouts importables, móvil/escritorio, offline, hardware o DIAN.

Esas funciones están conservadas en REQUIREMENTS, diseñadas a nivel de arquitectura y repartidas en ROADMAP; no se anuncian como operativas.
