# Operación inicial de caja y pedidos (0.4)

## Alcance del incremento

Caja registra efectivo declarado por el usuario: base de apertura, ingresos y egresos manuales, conteo de cierre y diferencia. Los pedidos registran una solicitud de preparación/entrega y su subtotal de catálogo. **Un pedido entregado no es una venta pagada.** No se conectan bancos, impresoras o DIAN ni se generan impuestos/cobros ficticios.

## Reglas

- Una caja pertenece a una sucursal. Cada sucursal recibe una caja principal y puede tener cajas adicionales.
- Solo una sesión abierta por caja. Aperturas, movimientos y cierres se realizan bajo bloqueo y transacción con auditoría.
- Efectivo esperado = apertura + ingresos manuales − egresos manuales. No se incluyen pedidos como ingresos.
- Se rechazan egresos superiores al efectivo esperado. Un error se compensa con otro movimiento explicado; no se edita ni borra el anterior.
- El cierre exige revisión actual, conteo no negativo y guarda diferencia firmada. Una sesión cerrada no recibe nuevos movimientos ni se reabre en este incremento.
- Los pedidos son independientes de la sesión de caja hasta implementar pagos. Solo se crean en sucursales activas, con productos/categorías disponibles y variante válida cuando corresponda.
- Precios, nombres y SKU se guardan como snapshots. El servidor calcula el subtotal con BCMath; no acepta totales calculados por cliente.
- Una revisión o precio de catálogo obsoletos se rechazan antes de crear el pedido. Las mutaciones de estado también exigen revisión.
- Flujo: pendiente → en preparación → listo → entregado. Cancelación antes de entrega requiere permiso y motivo. Sin borrado.
- Todo POST operativo exige UUID de idempotencia. Misma clave + acción + usuario + payload devuelve el recurso ya creado; una reutilización incompatible responde 409. El reintento no vuelve a generar movimiento o pedido.
- La UI conserva la clave y el contenido de una operación ante un error de conexión, y permite reintentar el mismo envío.
- Permisos y contexto de empresa se verifican en servidor. Las asignaciones granulares de empleados por sucursal pertenecen a una fase posterior; hoy los permisos operativos abarcan las sucursales de la empresa.

## Pendiente antes de vender/cobrar

Impuestos y redondeo comercial, descuentos, propinas, pagos y asignaciones parciales, venta/recibo, anulaciones compensatorias, cuentas divididas, inventario, mesas, KDS en tiempo real e impresoras. No usar el subtotal de un pedido como factura ni como comprobante de pago.
