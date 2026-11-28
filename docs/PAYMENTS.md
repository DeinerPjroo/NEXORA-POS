# Abonos y pagos mixtos manuales (0.7)

Desde 3.DEL-4B2, el cobro inicial completo en efectivo recibido por repartidor reutiliza CollectCash/RecordPayments, con provenance=courier_cash y cash_session_id/cash_movement_id null. CourierCollection conserva el destino; rendir parcial o totalmente crea ingreso de caja y registro append-only, sin otro pago. Esta ruta no admite abonos, ajustes ni division; los flujos ordinarios conservan su comportamiento. Se requiere confirmacion fisica y autorizacion de gestor/cobro; el rol Repartidor no cobra por defecto.

Actualización 0.9: devoluciones parciales y remanentes por pago en [REFUNDS.md](REFUNDS.md). Se conserva el total y no se genera deuda nueva por devolver. Una venta partially_refunded con saldo positivo permite agregar pagos.

Actualización 0.10: [SPLIT_ACCOUNTS.md](SPLIT_ACCOUNTS.md) añade partes iguales antes del primer pago. Cada línea se asigna a una cuenta de esa venta y queda limitada a su saldo además del saldo global. Sin división, las asignaciones permanecen null y las API anteriores funcionan igual.

## Alcance y uso

Se amplía la venta existente, sin duplicar pedidos, recibos ni servicios. El primer cobro puede aplicar el total o un importe menor. Desde el recibo con estado **Abonada**, **Agregar pagos** permite preparar uno o varios métodos y confirmar un lote. La interfaz de seguimiento de abonos requiere sales.view y sales.collect; quien solo tiene permiso de cobro conserva el cobro completo anterior.

Desde 0.8, porcentaje y propina opcional se fijan antes de ese primer pago; ver ADJUSTMENTS.md. Los lotes siguientes no pueden modificarlos. Los abonos cubren el total global, sin reparto específico entre productos y propinas.

Cada pago conserva método/tipo/nombre/revisión, importe aplicado, recibido/cambio, referencia, procedencia operator, sesión y fecha. Solo los métodos cash producen movimientos de efectivo; non_cash son declaraciones manuales sin confirmación bancaria. No hay pasarela, pagos pendientes de aprobación externa ni conversión de moneda.

## Invariantes

- Una venta por pedido y un total original inmutable, incluyendo cálculo/moneda/descuento/impuesto históricos. Se admiten varios payments por venta; no se modifican ni eliminan los anteriores.
- Primer cobro: total esperado y revisiones de pedido/configuración/caja actuales. payment_amount es opcional y, al omitirse, mantiene el cobro completo de las API 0.5–0.6.
- Un pago aplicado debe ser positivo, con dos decimales como máximo y no exceder el saldo. Recibido en efectivo puede ser mayor y produce cambio; no efectivo exige referencia y recibido igual al importe aplicado.
- Pagos posteriores: UUID, revisión de venta, saldo esperado y sesión abierta de la misma sucursal/moneda. No se recotiza el catálogo ni se aplican ajustes nuevos al total de la venta.
- Se agregan de 1 a 20 líneas por lote. El servidor valida suma y métodos bajo bloqueo; todas confirman juntas o ninguna. Un error en la última línea o auditoría revierte pagos, movimientos, revisiones y estado.
- La revisión de caja se comprueba contra el inicio del lote y se avanza internamente por cada línea, mientras el bloqueo de empresa/venta evita interferencia. No se aceptan revisiones arbitrarias por línea.
- Sumas BCMath sobre cadenas de los pagos: ningún saldo financiero se calcula mediante float ni SUM de afinidad NUMERIC de SQLite. El navegador usa BigInt solo para el borrador; la confirmación procede del servidor.
- Reintentar la misma clave y payload devuelve la venta actual sin volver a cobrar. Una venta saldada no admite otro pago con una clave diferente. Ante respuesta incierta se conserva el lote en el formulario abierto.

## Importes y estados

paid_amount es la suma histórica aplicada, no todo el efectivo entregado antes del cambio y tampoco el neto después de devoluciones. refunded_amount suma las compensaciones. Los recibos muestran ambos con sus líneas y fechas.

- partially_paid / **Abonada**: paid_amount < total; balance_due = total − paid_amount.
- paid / **Cobrada**: paid_amount = total; balance_due = 0.
- refunded / **Devuelta**: se devuelven todos los pagos aplicados y se cierra la venta. balance_due = 0; cancelled_balance = total − paid_amount registra el saldo que nunca fue cobrado y se canceló.

No se crea una venta vacía sin primer pago. Registrar pago no adelanta preparación/entrega. Un pedido con venta sigue sin admitir cancelación directa ni una segunda venta.

## Devolución de todos los cobros

La acción **Devolución total** cierra la venta y compensa cada pago por su método histórico, incluso si el método fue archivado. Devuelve solo el importe recibido/aplicado; jamás devuelve el saldo no pagado. En una venta de 100.01 con abono de 40.00, devuelve 40.00 y cancela saldo de 60.01, conservando el total original.

Cada sale_refund se enlaza al payment original con FK compuesta tenant/sale/payment. Desde 0.9 admite varias compensaciones por pago hasta su importe aplicado; el cierre devuelve solo el remanente. El lote completo es atómico e idempotente. Efectivo requiere fondos de una sesión abierta de la misma sucursal/moneda; no efectivo exige referencia por pago con remanente y no genera egreso de caja. La revisión de venta es obligatoria para ventas abonadas, parcialmente devueltas o de varios pagos, evitando devolver una lista desactualizada. La UI siempre la envía.

Las devoluciones de una parte elegida de un pago existen desde 0.9; la devolución por productos sigue pendiente. Una vez cerrada/devuelta, la venta no admite abonos nuevos. No hay reposición de inventario ni documento fiscal.

## Ejemplo probado

Venta 100.01, caja base 1000.00. Abono cash 40.00, recibido 50.00, cambio 10.00: saldo 60.01, caja 1040.00. Lote siguiente: cash 10.00 con recibido 20.00/cambio 10.00 y transferencia manual 50.01 con referencia: saldo 0, caja 1050.00. La devolución compensa cash 50.00 y no efectivo 50.01; caja vuelve a 1000.00. El cierre con conteo 1000.00 concilia efectivo. Esto no concilia ni confirma movimientos bancarios.

Las pruebas verifican sobrepago, revisión obsoleta, error en línea posterior, fallo de auditoría, reintentos, permisos y tenant, referencia ajena y FK de devolución contra otro pago/venta. El E2E comprueba pérdida de respuesta del lote, recibo mixto/móvil, devolución y cierre. MySQL 8 y carga/concurrencia de varios procesos siguen pendientes.


## Fondos de cambio de repartidores (3.DEL-4A)

Domicilios permite entregar fondo de cambio y recibir su devolucion parcial/total mediante el CashLedger existente. No crea ventas, pagos ni refunds comerciales. Custodia y caja se actualizan juntas con revision/UUID/saldo esperado, BCMath, confirmacion fisica persistida y auditoria; historial append-only con FK tenant/sucursal/cuenta/sesion/movimiento. Caso SQL/UI probado: caja1000.00, fondo100.01 y devolucion40.01 dejan caja940.00 y custodia60.00. El fondo no es ingreso comercial ni cobro al cliente. Cobros al cliente en custodia, rendiciones de esos pagos y compensaciones permanecen pendientes; no usar este anticipo como sustituto de RecordPayments.


3.DEL-4B1 separa el metodo previsto para el domicilio de cualquier pago real. Es una instruccion con snapshot del metodo activo/revisado, motivo/revision/UUID y auditoria, editable solo antes de salir a reparto y de crear una venta. Elegir efectivo/transferencia no registra cobro, no confirma banco ni mueve caja/custodia. El medio real del pago continuara registrado exclusivamente por los servicios financieros existentes; cobro al cliente en custodia4B2 y sus rendiciones siguen pendientes.
