# Operación de caja y pedidos (0.4–0.7)

## Composición fija desde 0.19

Un combo exige preparar/revisar sus unidades antes de agregar al carrito. La base de raíz se reparte explícitamente y los adicionales se suman a cada componente. Todos deben estar disponibles al previsualizar/registrar. Precio/perfiles/asignación se conservan en cabecera y posiciones históricas, que son las únicas filas facturables. Cambio de contexto revisa partes y perfiles además del total; incertidumbre conserva UUID/cuerpo. Pedido/checkout/recibo muestran cabecera una vez con composición, y cobrar/devolver no consulta configuración vigente. FIXED_COMBOS.md; grupos de alternativas todavía pendientes.

## Disponibilidad temporal desde 0.18

Un producto puede limitar pedidos nuevos a ventanas semanales en zona empresarial, heredadas por sus variantes. Menú muestra el estado consultado y el servidor comprueba de nuevo la hora al previsualizar/registrar. Un cierre rechaza todo el pedido nuevo sin borrar el carrito; prepararlo, entregarlo, cobrarlo o devolverlo después de registrado conserva su comprobación histórica. No hay reserva de disponibilidad por añadir al carrito. AVAILABILITY_SCHEDULES.md documenta medianoche/vigencia/DST y snapshots.

## Precios contextuales desde 0.17

El menú y las presentaciones usan sucursal/canal elegidos. Cambiar contexto con carrito consulta orders/preview sin registrar el pedido; diferencias visibles se revisan antes de aplicar y conservan cantidades, notas y opciones. El registro vuelve a exigir revisiones/precio actuales. Envío incierto conserva contexto y payload exactos; pedidos previos y cobro usan sus snapshots, sin recotización. Véase CONTEXT_PRICES.md.

## Alcance del incremento

Caja registra efectivo declarado por el usuario: apertura, movimientos manuales, cobros/devoluciones desde 0.5, conteo de cierre y diferencia. Los pedidos registran preparación/entrega y subtotal de catálogo. **Entregar un pedido no lo cobra.** La venta se confirma en una acción separada, con recibo interno. No se conectan bancos, hardware ni DIAN. Véase [SALES.md](SALES.md).

## Reglas

- Una caja pertenece a una sucursal. Cada sucursal recibe una caja principal y puede tener cajas adicionales.
- Solo una sesión abierta por caja. Aperturas, movimientos y cierres se realizan bajo bloqueo y transacción con auditoría.
- Efectivo esperado = apertura + ingresos manuales + cobros de efectivo netos − egresos manuales − devoluciones de efectivo. Abonos y lotes mixtos solo mueven sus componentes cash; non_cash no altera el saldo. Registrar/entregar pedidos tampoco mueve caja.
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

Pasarelas/confirmación electrónica, división por productos/unión de cuentas, inventario, mesas, KDS en tiempo real e impresoras térmicas. Impuestos globales/por producto, abonos/mixtos manuales, propinas voluntarias, descuentos porcentuales, devoluciones parciales por pago y partes iguales ya están disponibles; consultar PRODUCT_TAXES.md, INCLUDED_TAX.md, PAYMENTS.md, ADJUSTMENTS.md, REFUNDS.md y SPLIT_ACCOUNTS.md. No usar el subtotal de un pedido como factura ni como comprobante de pago; la venta tiene su recibo interno separado.

## Concurrencia y almacenamiento

Las escrituras operativas se serializan por empresa con bloqueo transaccional, además de bloquear caja/sesión/pedido. Esto prioriza integridad en esta etapa; la capacidad bajo carga y la reducción del bloqueo requieren medición posterior. El estado se consulta por HTTP; no se implementó difusión en tiempo real.

Las claves idempotentes y registros históricos se retienen sin limpieza automática. Una repetición compatible devuelve el recurso actual, que puede haber avanzado de estado; no una respuesta HTTP congelada. La autorización se vuelve a comprobar al reintentar.

MariaDB/MySQL con DECIMAL es la referencia de persistencia monetaria. SQLite NUMERIC puede redondear importes cercanos al límite de 19 dígitos; se usa para pruebas funcionales, no como garantía financiera ni como motor offline listo. La suite SQL temporal verifica los límites sobre MariaDB.
