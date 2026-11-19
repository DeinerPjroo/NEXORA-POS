# Historial de cambios

## 0.23.0 · 2026-11-19

- Terminal POS con requisitos de permisos compartidos, estado de caja/configuración, controles táctiles y rutas propias de pedido→cobro→recibo→nueva operación. Reutiliza los comandos y cálculos existentes; recibo local sin habilitar historial a quien no tiene sales.view.
- Resumen de cobro muestra observaciones regulares. Fixture E2E aislado admite permisos reales acotados; guardas de e2e.sqlite conservadas.
- Verificación dirigida: dos casos de permisos/recibo aprobados y caso operativo final aprobado en1.2min tras corregir visualización de notas. Impuestos mixtos, variantes/preparación/combo promocional, contexto y UUID exactos; venta16.21/caja116.21 sin duplicación. Build/TypeScript/Prettier/PHP-lint fixture y dos capturas correctos; principal494.67kB/gzip139.90. Sin cambios al backend financiero.

## 0.22.0 · 2026-11-19

- Galería privada de hasta ocho imágenes, portada y orden explícitos, retiro con siguiente portada y limpieza tras commit. Migración de fotografía anterior bajo bloqueo, sin mover archivos ni cambiar su URL; compatibilidad de reemplazo/retirada.
- UUID, hash de archivo en servidor, revisión/moneda/Tenant lock/Gate/auditoría/FK; multipart/JSON/DELETE inciertos conservados en useOperation. Recodificación GD y validaciones existentes reutilizadas.
- Dirigidas SQLite galería8/121 y legado10/85; MariaDB backfill/FK2/20 y ajuste de bloqueo1/15; interoperabilidad de pruebas2/36. Chromium galería/fotografía/promociones3 en3.3min y galería final con miniaturas cargadas1 en1.0min. Migración000022 aplicada, DDL/build/TypeScript/formato y captura móvil correctos. Esquemas nexora_test_65bda8209625cbc1 y nexora_test_53cb7a4f90607f8a conservados.

## 0.21.0 · 2026-11-19

- Promociones de base fija/porcentual por producto/presentación/contexto/fechas locales inclusivas. Una ganadora por especificidad, prioridad y antigüedad; hasta20 activas, archivo y revisión/UUID/moneda/zona/auditoría/FK propios.
- Interfaz de administración/preparación/carrito/revisión/recibo conectada. PriceContextv2 conserva promoción/base anterior/descuento; adicionales completos y combo raíz una vez con referencias sin promoción individual. Fórmulas financieras previas conservadas.
- Verificación dirigida: MariaDB PromotionTest8/134 y caso financiero1/35; SQLite permisos/finanzas2/47 y dependencias precios/combos/horarios28/538; Chromium promociones/contexto2 en2.9min. Migración000021 aplicada, DDL/build/TypeScript/formato y dos capturas revisados. Esquemas nexora_test_98f7515a550265ba y nexora_test_7bfd53b7faf48ec2 conservados.
- Protocolo2026-11-19 persistido: pruebas por impacto y cobertura exhaustiva crítica; suites completas por fase/entrega estable/cambio transversal justificado. SQL dirigido admite --filter restringido sin cambiar aislamiento ni retención.

## 0.20.0 · 2026-11-18

- Grupos propios de combo con mínimos/máximos de alternativas, archivo paginado y límites8 grupos/20 alternativas activas; pertenencia estable de componentes y FK tenant/root/group. Revisiones/UUID/moneda/Gate/auditoría bajo Tenant lock, capacidad mínima y rollback.
- Selección explícita versionada2, fijos completos y alternativas/unidades únicas con límites20 por combo/100 por pedido antes de cargar catálogo completo. Disponibilidad de elecciones sin sustituir opciones cerradas; hojas no elegidas no afectan reparto/precio/impuestos.
- Ficha/selector/preparaciones/revisión/carrito/pedido/recibo conectados. Snapshot estructural2 conserva grupos/elección; fijos0.19 siguen contrato/snapshot1 y fórmulas financieras anteriores. Reintentos conservan cuerpo y resultado tras archivar grupos.
- 242 pruebas/2885 aserciones SQLite y MariaDB, esquema nexora_test_34164beced348cd5 conservado; 23 Playwright completas aprobadas en 18.3 minutos. Migración000020/DDL/doctor/build/TypeScript/Pint/Prettier y revisión visual correctos. Pruebas dirigidas durante desarrollo y una regresión completa final, reutilizando auditorías de dependencias0.19 al no cambiar paquetes.
- Padre2.2-D completado con D1/D2. Siguiente2.2-E definido en PROMOTIONS_PLAN.md, sin anunciar promociones implementadas.

## 0.19.0 · 2026-11-18

- Combos de composición fija con tipo de producto estable, componentes/presentaciones/unidades/archivo paginado y reparto de precio explícito equal/proportional. UUID/revisiones/moneda y auditoría atómicos, sin anidación.
- Preparación por unidad y preview de asignaciones/perfiles, base contextual y adicionales separados; carrito canónico conserva notas y revisa partes al cambiar contexto.
- Cabecera histórica append-only y posiciones facturables con reparto exacto a cuatro decimales, FK tenant/order/header y preflight de expansión. ProductTaxTotals/SaleTotals mantienen fórmulas/versiones anteriores.
- Pedido/checkout/recibo agrupan cabecera una vez desde snapshots; replay/cobro/devolución conservan composición e importes tras cambiar catálogo. Migración000019 y FIXED_COMBOS.md. Alternativas por grupos permanecen en D2.

## 0.18.0 · 2026-11-18

- Horarios semanales por producto heredados por presentaciones, política deshabilitada inicialmente y ventanas con archivo/paginación, revisiones/UUID y auditoría atómica. Límite de 28 activas.
- Reloj de servidor y zona empresarial, medianoche explícita, vigencia del día inicial, inicio incluido/final excluido y semántica de hora de pared para cambios estacionales.
- Motivo de cierre en menú y elegibilidad derivada sin cambiar flags manuales. OrderPlan comprueba preview/registro y rechaza pedidos nuevos fuera de horario sin perder preparaciones del carrito.
- Snapshot histórico de instante/zona/ventanas en pedido/checkout/recibo; replay y cobro/devolución permanecen válidos después del cierre. Migración 000018 incremental y AVAILABILITY_SCHEDULES.md.
- expected_timezone detecta formularios abiertos antes de cambiar la zona empresarial; identidad del envío incierto conservada. Respuestas de fotografía incluyen elegibilidad del horario y la tabla de variantes identifica su estado manual.

## 0.17.0 · 2026-11-18

- Precios explícitos por sucursal/canal de producto o presentación, precedencia determinista y precio base separado. Reglas paginadas, identidad estable, archivo, revisiones, UUID y auditoría atómicos.
- Migración 000017 con scopes STORED para unicidad real de contextos null y FK tenant/product/variant/branch; metadatos acotados de sucursales para lectores del catálogo.
- Menú, presentación y adicionales resuelven el mismo contexto. OrderPlan comparte validación/cálculo entre preview sin escrituras de negocio y registro estricto.
- Revisión del carrito al cambiar contexto o recuperar un precio obsoleto, con antes/después, cantidades/notas/selecciones conservadas y envío bloqueado mientras se revisa. Respuesta incierta conserva contexto y cuerpo/UUID originales.
- Snapshot histórico de procedencia en pedido, cobro y recibo; cobrar/abonar/devolver no recotiza reglas vigentes. Compatibilidad de líneas anteriores con snapshot null. Contrato en CONTEXT_PRICES.md; horarios siguen en C2.

## 0.16.0 · 2026-11-18

- Grupos propios de producto con mínimos/máximos, adicionales decimales y exclusiones sin recargo; configuración/archivo paginados, UUID, revisión de producto y auditoría atómicos.
- Límites de grupos/opciones activos con conservación de archivados y bloqueo de configuraciones obligatorias imposibles. Bindings/FK tenant/product/group y permisos catalog existentes.
- Selección tras presentación, sin opciones automáticas, y claves canónicas para conservar preparaciones distintas en carrito. Precio final por unidad y cantidad con BigInt/BCMath.
- Snapshots de precio base/grupos/opciones en pedido y recibo/impresión, heredando impuestos del producto. Renombrar/cambiar precios/archivar no altera pedidos previos ni su replay, abonos, cuentas o devoluciones.
- Migración 000016 incremental y MODIFIERS.md. Carga diferida de historial y panel de producto tras aviso real de tamaño de bundle; no añade paquetes.

## 0.15.0 · 2026-11-18

- Categorías principales/subcategorías con FK compuesta, revisión de padre y bloqueo por empresa; impedir ciclos/tercer nivel o transformar en hija una raíz con subcategorías.
- Selectores de padre paginados con búsqueda, rutas Principal/Subcategoría en catálogo y menú, filtros por nivel/principal e inclusión de hijas al filtrar productos por raíz.
- Disponibilidad efectiva heredada sin cambiar flags de hijas/productos. Pedidos nuevos verifican padre activo; pedidos anteriores y precios/snapshots se conservan.
- Recurso de categoría con campos seleccionados y respuestas de creación/edición compatibles. Paginación/cierre/limpiar selección declaran botones auxiliares para formularios con diálogos.
- Migración 000015 incremental y contrato SUBCATEGORIES.md. No añade jerarquía recursiva arbitraria ni implementa modificadores/combos/promociones.

## 0.14.0 · 2026-11-18

- Revisión humana no efectiva con estados revisado, diferencia y pendiente, importe observado, referencia/motivo y confirmación explícita del operador.
- Historial append-only versionado por pago, FK tenant/sale/payment/actor/sucursal y auditoría atómica; no cambia pagos, ventas, devoluciones o caja.
- Permiso sales.reconcile, UUID/reintento exacto y revisión de venta/manual/neto. Una devolución o un nuevo pago deja obsoletas las declaraciones anteriores sin borrarlas; el replay antiguo no confirma datos nuevos.
- Diferencia firmada BCMath y revisión de neto cero; método histórico aunque esté archivado. GET paginado con sales.view y filtros de estado en servidor.
- Formularios e historial conectados a /ventas/historial; migración 000014 y contrato PAYMENT_REVIEWS.md. No se afirma confirmación de banco o pasarela.

## 0.13.0 · 2026-11-18

- Historial paginado por pago con método/referencia/sucursal/cuenta históricos, compensaciones acumuladas y neto exacto, sin repetir el total de venta por abono.
- Filtros tenant/sucursal, fecha de registro del pago, tipo de método y referencia literal; resúmenes solo de página agrupados por moneda.
- Fechas en zona de empresa convertidas a la zona SQL existente de la aplicación, con siguiente medianoche excluyente. No se reinterpreta almacenamiento como UTC.
- PaymentBalance/PaymentHistory y recursos de consulta con sales.view; no revelan saldos de caja ni escriben registros financieros. Los comandos de cobro/devolución invalidan la consulta.
- Pantalla /ventas/historial con carga/errores/vacío, filtros, páginas y enlaces a recibo; sesión enlazada solo con cash.view. Resúmenes BCMath incluso por encima del límite monetario individual.
- Migración 000013 añade solo índices de consulta. PAYMENT_HISTORY.md aclara acumulados, fechas y alcance; revisión manual no efectiva sigue en F2.

## 0.12.0 · 2026-11-17

- Perfiles por empresa con 1–5 impuestos paralelos, nombre/tasa/modo explícitos, revisión/archivo y creación idempotente. Sin tasas legales automáticas ni fórmulas arbitrarias.
- Asignación de producto con FK compuesta; variantes heredan perfil. Snapshot en cada línea de pedido y revisión independiente de perfil al tomarlo. Cambiar/archivar no reinterpreta pedidos registrados.
- ProductTaxTotals/CentAllocation, versión 3 inmutable: reparto exacto de subtotal/descuento por mayores restos, impuestos adicionales por componente y extracción/distribución de incluidos sin doble adición.
- Propina participante con perfil de política explícito y snapshot hasta nueva confirmación; consentimiento y permisos preservados. Cero no produce línea de propina.
- Configuración, página/editor/picker de perfiles, catálogo/pedido y desglose de quote/recibo conectados; abonos/partes/devoluciones preservan el total histórico.
- Migración 000012 añade perfiles/FK y snapshots JSON sin cambiar importes previos. Activar modo por producto exige resolver pedidos legados sin snapshot; no se adivinan tasas.
- Fixture CLI acotado al SQLite E2E canónico con guardas, login real y sin desactivar límites de registro existentes. Contrato y ejemplos en PRODUCT_TAXES.md.

## 0.11.0 · 2026-11-17

- Modo global inclusive explícito: base extraída half-up del importe participante e impuesto por diferencia, sin añadirlo otra vez al total.
- Descuento fijo/porcentual antes de extraer base; propina participante ya contiene impuesto en su importe aceptado. Tratamiento/consentimiento siguen explícitos.
- IncludedTax con BCMath/18 decimales y conservación exacta de centavos/precio final. None/exclusive conservan fórmula anterior.
- Migración 000011 agrega calculation_version=1 al historial; ventas inclusive guardan versión 2 inmutable y elegida por servidor.
- Configuración y recibo adaptados, con base/impuesto incluido visibles. Abonos, cuentas y devoluciones preservan snapshots ante cambios posteriores.
- Chromium de ajustes ampliado con venta incluida y cambio de configuración sin reinterpretar recibo; sin desactivar validaciones de registro. Alcance/formulas en INCLUDED_TAX.md; varios impuestos por producto siguen pendientes.

## 0.10.0 · 2026-11-17

- División opcional en 2–20 partes iguales antes del primer pago, cotizada en servidor y con centavos sobrantes a las primeras partes. Ninguna parte cero.
- Una venta y un recibo, cuentas append-only y pagos asignados con FK tenant/sale/account. Sin modificar ventas anteriores ni reasignar historia.
- RecordPayments limita acumulados por parte y globales, incluidos lotes mixtos con varias líneas en una misma cuenta.
- Recibo con importes/pagos/devoluciones/saldos por cuenta, selector de parte en cobro y abonos, y límites del borrador con BigInt.
- Devoluciones conservan la cuenta mediante el pago original, sin reabrir deuda. El cierre completo compensa remanentes y cancela partes nunca cobradas.
- Migración 000010 añade sale_accounts y account_id nullable en payments sin reinterpretar registros anteriores. Detalles en SPLIT_ACCOUNTS.md; no divide por productos ni emite varios documentos fiscales.

## 0.9.0 · 2026-11-17

- Devoluciones parciales por pago original, de 1–20 líneas atómicas, límite acumulado, motivo y referencia no efectiva. Método histórico incluso archivado.
- PartialRefund/RecordRefunds y SaleBalance separan pagos brutos, compensaciones, neto, saldo y total original. Devolver no genera ni cancela deuda pendiente.
- Abonos posteriores admitidos si queda saldo tras una devolución parcial. Devolución completa posterior devuelve solo remanentes y cancela explícitamente lo no cobrado.
- Cierre sin dinero remanente valida sesión/revisión y audita sin inventar movimientos ni compensaciones cero. Historial append-only y FK conservados.
- Formularios de cobro/abono/devolución consultan una revisión de caja nueva al abrirse, sin reutilizar caché de la operación anterior. Reintento incierto congelado y exacto.
- Recibo con importes netos e historial de motivos por devolución, filtros/estado de devolución parcial y vista móvil.
- Migración incremental 000009 permite varias compensaciones por pago sin cambiar filas ni importes anteriores. Alcance y API en REFUNDS.md.

## 0.8.0 · 2026-11-17

- Descuento porcentual de hasta dos decimales, calculado half-up sobre subtotal redondeado; tipo/valor/importe históricos y fijo anterior compatible.
- Propinas de importe fijo, voluntarias y deshabilitadas por defecto. Habilitación exige tratamiento de base explícito y confirmación empresarial, sin política tributaria automática.
- sales.tips y consentimiento del operador obligatorios para propina positiva; confirmación persistida y auditada.
- Total y ajustes fijos desde primer pago, con abonos/mixtos/refund anteriores preservados. Pagos posteriores rechazan cambios de ajustes.
- Refactor de controles de cotización a SaleAdjustments, recibo con porcentaje/propina y configuración versionada; sin reparto/liquidación a empleados.
- Migración 000008 aplicada en MariaDB: solo nuevos campos/metadatos, sin alterar importes antiguos. Detalles en ADJUSTMENTS.md.

## 0.7.0 · 2026-11-17

- Abono inicial opcional con total de venta inmutable y saldo exacto calculado con BCMath.
- Lotes de pagos posteriores/mixtos con revisión de venta/saldo/caja, métodos históricos e idempotencia; sobrepago rechazado.
- RecordPayments compartido con el cobro completo anterior; error de línea o auditoría revierte todo el lote.
- Recibos con estados Abonada/Cobrada/Devuelta, importes aplicados/saldo y fechas de cada pago; listas filtradas por saldo pendiente.
- Devolución de todos los cobros por sus métodos originales, enlace por FK a cada pago, sin devolver saldo nunca cobrado; se registra saldo cancelado aparte.
- Migración 000007 aplicada en MariaDB sin alterar totales, pagos ni recibos anteriores; aliases singulares compatibles y nuevos historiales múltiples.
- Pruebas de abonos/mixtos, conflictos, atomicidad, tenant/permisos, referencia ajena y FK contra pagos de otra venta; recorrido E2E con respuesta perdida y cierre de efectivo.
- Sin propinas, descuento porcentual, selección de devoluciones parciales, cuentas divididas ni confirmaciones de pasarela. Continúa 2.1-C.

## 0.6.0 · 2026-11-17

- Continuidad contrastada con origin/main a487f23, sin avances locales posteriores. Nuevos TASKS, PROJECT_STATE, HANDOFF y DECISIONS; protocolo permanente de incrementos y publicación autorizada.
- Pruebas SQL conservan cada esquema aislado nuevo. No ejecutan DROP DATABASE según instrucción vigente; guardas de aislamiento preservadas.
- Métodos de pago por empresa: código/tipo estables, nombre/estado/revisión, paginación y creación idempotente. Efectivo principal protegido.
- Cobro manual no efectivo con referencia e importe exacto, snapshot de método/procedencia y sin alterar saldo de efectivo. Compatibilidad del cobro anterior sin método.
- Devolución total por método histórico, con referencia si no efectivo; conserva el pago y no produce salida de caja para registros no efectivos.
- Migración incremental aplicada en MariaDB, referencias compuestas y recibos anteriores preservados. Sin integración o confirmación de banco/pasarela.

## 0.5.0 · 2026-11-17

- Configuración explícita antes del primer cobro: sin impuesto adicional o porcentaje sobre base, revisión y redondeo half-up a dos decimales.
- Venta en efectivo desde pedido, descuento fijo con permiso/motivo, cálculo de cambio y movimiento por ingreso neto.
- Recibo interno correlativo por empresa, snapshots comerciales/importes, lista filtrada y consulta/impresión desde navegador.
- Devolución total única con salida compensatoria, motivo y fondos suficientes; admite una caja posterior de la misma sucursal/moneda.
- Venta/pago/caja/pedido/secuencia/auditoría atómicos, idempotencia y unicidad de venta por pedido. No permite cancelar pedidos vendidos.
- Permisos sales.view/collect/configure/discount/refund, FKs compuestas e historia protegida contra edición/borrado.
- Migración aplicada en MariaDB. Nuevas pruebas cubren cobro/devolución, precisión, aislamiento, permisos, conflictos, límites y reversión si falla auditoría.
- Sin pagos electrónicos, impuestos incluidos/múltiples por producto, devolución parcial ni documentos fiscales/DIAN. Alcance en SALES.md.

## 0.4.0 · 2026-11-17

- Cajas por sucursal, apertura única, movimientos manuales, cierre y arqueo con diferencia firmada. Sin edición o borrado del historial.
- Pedidos con productos/variantes, precios y nombres históricos, notas, filtros, preparación, entrega y cancelación motivada.
- Importes calculados con BCMath, límites de DECIMAL, revisión de caja/pedido, auditoría y claves idempotentes por empresa.
- Reintento del mismo envío ante respuesta perdida; recorrido Chromium comprueba que no duplica aperturas.
- Permisos operativos, referencias compuestas, caja principal para sucursales nuevas/existentes y bloqueo de moneda desde el primer registro monetario.
- Migración aplicada en MariaDB; 68 pruebas backend y 416 aserciones aprobadas tanto en SQLite como en un esquema temporal MariaDB.
- Pedidos separados de ventas/pagos: entregar no registra ingresos, impuestos, recibo ni factura. Reglas en OPERATIONS.md.

## 0.3.0 · 2026-11-17

- Ficha de producto con fotografía privada, vista previa, sustitución y retirada.
- Validación de formato/tamaño/dimensiones y recodificación GD de JPEG/PNG/WebP; rutas generadas por servidor y acceso autenticado.
- Variantes por producto con SKU/barcode, precio/costo DECIMAL y disponibilidad propia; desactivación sin borrar historia.
- Códigos verificados entre productos y variantes bajo bloqueo de empresa, relación compuesta y paginación.
- Revisiones compartidas del producto para datos, fotografía y variantes. Los formularios conservan la versión con la que se abrieron.
- Pruebas de seguridad de archivos, aislamiento, referencias entre productos y edición desde dos pestañas.
- API de imágenes responde 401 al perder sesión también sin cabecera JSON; almacenamiento y caché de E2E aislados del entorno de trabajo.
- Migración aplicada y esquema MySQL Workbench actualizado.

## 0.2.0 · 2026-11-17

- Categorías y productos conectados a API, con búsqueda, filtros, paginación, edición y estados.
- Precios/costos DECIMAL(19,4), valores enviados como cadenas y visualización sin conversión a float.
- SKU y códigos de barras únicos por empresa, claves compuestas y costos protegidos por permiso.
- Revisiones de catálogo, auditoría transaccional y protección ante cambios de moneda.
- Migración aplicada en MariaDB 10.4.32 y suite validada en una base SQL temporal independiente.
- Pruebas adicionales de catálogo, aislamiento, precisión monetaria y recorrido móvil.
- Nueva documentación de catálogo; se mantiene pendiente POS, caja y cobros reales.

## Corrección de arranque local · 2026-11-17

- Puerto predeterminado de Laravel cambiado a 8001; el 8000 está ocupado por el proyecto Horizonte.
- Proxy de Vite, APP_URL, dominios de Sanctum y comandos de arranque alineados con el nuevo puerto.
- Sin detener ni modificar el proceso del otro proyecto.

## 0.1.0 · 2026-11-17

- Inspección de carpeta vacía, herramientas locales y compatibilidad de versiones.
- Documentación del requerimiento completo y arquitectura por dominios/fases.
- Inicialización Laravel 13 / Sanctum y React 19 / TypeScript / Vite 8 / Tailwind 4.
- Registro empresarial transaccional, sesiones con cookies/CSRF, límites de acceso, recuperación y revocación de sesiones.
- Contexto de empresa derivado de la identidad, scopes que fallan cerrado y FKs compuestas.
- Sucursales, roles dinámicos, catálogo de permisos y auditoría administrativa.
- Interfaz en español con resumen real del espacio, consulta de equipo, configuración y navegación adaptable.
- Identidad visual persistida por empresa, vista previa, historial y control de revisión.
- Migraciones y exportación reproducible de DDL para modelado en MySQL Workbench.
- Pruebas backend y E2E en bases SQLite exclusivas; conexión del MySQL del usuario pendiente de configuración.

No se declara completada toda la Fase 1 ni implementadas fases posteriores.
