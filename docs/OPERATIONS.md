# Operación de caja y pedidos (0.4–0.5)

## Alcance del incremento

Caja registra efectivo declarado por el usuario: apertura, movimientos manuales, cobros/devoluciones desde 0.5, conteo de cierre y diferencia. Los pedidos registran preparación/entrega y subtotal de catálogo. **Entregar un pedido no lo cobra.** La venta se confirma en una acción separada, con recibo interno. No se conectan bancos, hardware ni DIAN. Véase [SALES.md](SALES.md).

## Reglas

- Una caja pertenece a una sucursal. Cada sucursal recibe una caja principal y puede tener cajas adicionales.
- Solo una sesión abierta por caja. Aperturas, movimientos y cierres se realizan bajo bloqueo y transacción con auditoría.
- Efectivo esperado = apertura + ingresos manuales + cobros netos − egresos manuales − devoluciones. Registrar/entregar pedidos no mueve caja.
- Se rechazan egresos superiores al efectivo esperado. Un error se compensa con otro movimiento explicado; no se edita ni borra el anterior.
- El cierre exige revisión actual, conteo no negativo y guarda diferencia firmada. Una sesión cerrada no recibe nuevos movimientos ni se reabre en este incremento.
- La preparación del pedido es independiente de la caja. Se crean en sucursales activas, con productos/categorías disponibles y variante válida cuando corresponda. Cobrar exige sesión abierta y confirma una venta; no cambia el estado de preparación.
- Precios, nombres y SKU se guardan como snapshots. El servidor calcula el subtotal con BCMath; no acepta totales calculados por cliente.
- Una revisión o precio de catálogo obsoletos se rechazan antes de crear el pedido. Las mutaciones de estado también exigen revisión.
- Flujo: pendiente → en preparación → listo → entregado. Cancelación antes de entrega requiere permiso y motivo, y no se permite si ya hay venta; en ese caso se gestiona devolución desde el recibo. Sin borrado.
- Todo POST operativo exige UUID de idempotencia. Misma clave + acción + usuario + payload devuelve el recurso ya creado; una reutilización incompatible responde 409. El reintento no vuelve a generar movimiento o pedido.
- La UI conserva en memoria la clave y el contenido de una operación ante un error de conexión mientras el formulario permanece abierto, y permite reintentar el mismo envío. Cerrar, navegar o recargar puede descartar el formulario: no es una cola offline ni recuperación persistente.
- Permisos y contexto de empresa se verifican en servidor. Las asignaciones granulares de empleados por sucursal pertenecen a una fase posterior; hoy los permisos operativos abarcan las sucursales de la empresa.

## Ampliaciones pendientes

Pagos electrónicos o parciales/mixtos, propinas, impuestos incluidos y varios impuestos por producto, descuentos porcentuales, devoluciones parciales, cuentas divididas, inventario, mesas, KDS en tiempo real e impresoras térmicas. No usar el subtotal de un pedido como factura ni como comprobante de pago; la venta tiene su recibo interno separado.

## Concurrencia y almacenamiento

Las escrituras operativas se serializan por empresa con bloqueo transaccional, además de bloquear caja/sesión/pedido. Esto prioriza integridad en esta etapa; la capacidad bajo carga y la reducción del bloqueo requieren medición posterior. El estado se consulta por HTTP; no se implementó difusión en tiempo real.

Las claves idempotentes y registros históricos se retienen sin limpieza automática. Una repetición compatible devuelve el recurso actual, que puede haber avanzado de estado; no una respuesta HTTP congelada. La autorización se vuelve a comprobar al reintentar.

MariaDB/MySQL con DECIMAL es la referencia de persistencia monetaria. SQLite NUMERIC puede redondear importes cercanos al límite de 19 dígitos; se usa para pruebas funcionales, no como garantía financiera ni como motor offline listo. La suite SQL temporal verifica los límites sobre MariaDB.
