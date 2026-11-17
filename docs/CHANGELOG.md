# Historial de cambios

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
