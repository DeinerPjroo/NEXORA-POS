# Devoluciones parciales por pago (0.9)

## Uso

Desde el recibo, **Devolución parcial** permite elegir un pago original y un importe positivo hasta su remanente devolvible. Se pueden preparar hasta 20 pagos distintos por lote; motivo obligatorio y referencia por cada pago no efectivo. Confirmar registra todo junto o revierte todo. Un pago puede recibir varias devoluciones en comandos posteriores.

Se usa el método histórico del pago, aunque haya sido archivado o renombrado. Solo cash genera un egreso; exige fondos esperados suficientes en una sesión abierta de la misma sucursal y moneda. non_cash es una declaración manual del operador, sin confirmación bancaria. No puede convertirse en salida de efectivo.

El recibo conserva total original, pagos y devoluciones con motivos/referencias/fechas. Muestra importe neto y pagos netos después de las compensaciones. **Devolución total** devuelve únicamente el remanente de cada pago y cancela explícitamente el saldo nunca cobrado. No repite devoluciones anteriores.

## Saldos y estados

Todas las sumas se calculan con BCMath sobre cadenas decimales, sin float ni SUM de SQLite. Sean T el total original, P la suma histórica de pagos y R la suma histórica de devoluciones:

- paid_amount = P; refunded_amount = R; net_paid_amount = P − R.
- Mientras la venta permanezca abierta: balance_due = T − P; cancelled_balance = 0; effective_total = T − R.
- Cerrada por devolución total: balance_due = 0; cancelled_balance = T − P; effective_total = T − R − cancelled_balance = 0.
- En cada pago: refunded_amount suma sus compensaciones; refundable_amount = importe aplicado original − esas compensaciones.
- Una devolución parcial no crea deuda ni cancela automáticamente lo que faltaba cobrar. Se puede pagar ese saldo posteriormente; la venta conserva partially_refunded y el historial. Devolver todos los pagos de una venta ya saldada la cierra como refunded.
- Si se devuelven todos los abonos pero aún había deuda, permanece partially_refunded con deuda. **Devolución total** puede cerrar/cancelar esa deuda sin movimiento ni compensación ficticia de importe cero; valida y avanza una vez la sesión operativa y audita el cierre.

Ejemplo: total 100.01, abono cash 40.00 y base 1000.00. Devolver 10.00 deja pagos netos 30.00, importe neto 90.01, deuda 60.01 y caja 1030.00. Pagar la deuda mediante transferencia manual 60.01 deja deuda cero y neto 90.01, sin cambiar caja. El cierre completo posterior devuelve cash 30.00 y transferencia 60.01, dejando caja 1000.00.

## API e integridad

POST sales/{sale}/refunds exige sales.refund, UUID, sale_revision, expected_refundable (neto aún devolvible), cash_session_id/cash_revision, reason y refunds con 1–20 objetos estrictos {payment_id, amount, reference?}. Importe como cadena de hasta dos decimales, positivo y limitado acumulativamente al pago original. No aceptar tenant, importes totales o ajustes nuevos. La venta y todos los pagos deben pertenecer al contexto autenticado.

PartialRefund y RefundCash usan RecordRefunds dentro de IdempotentOperation, con bloqueos de empresa/venta y caja. Revisiones obsoletas o importe esperado distinto producen 409. Cada línea avanza internamente la revisión de sesión; un error posterior o fallo de auditoría revierte compensaciones, caja, estado/revisión e idempotencia. El reintento exacto devuelve la venta actual sin repetir egresos. El formulario conserva y congela el envío incierto mientras permanece abierto, sin recuperación persistente tras recarga.

La API previa POST sales/{sale}/refund se conserva. Exige revisión para ventas abonadas, parcialmente devueltas o con varios pagos; la interfaz siempre la envía. Las referencias son necesarias solo para los pagos no efectivos con remanente positivo.

Migración 000009: retira la unicidad tenant/payment_id en sale_refunds y añade índice de consulta; mantiene FK tenant/sale/payment, filas e importes anteriores. Historial append-only y sin rollback automático que compacte registros. No modifica migraciones publicadas.

## Límites

La devolución es de importes aplicados por pago: no selecciona productos ni distribuye impuestos/propinas, no repone existencias y no emite nota fiscal. Desde 0.10, la división en partes iguales conserva la cuenta mediante el payment original; devolver no reabre su deuda. Ver SPLIT_ACCOUNTS.md. No hay confirmación de proveedor, reversión bancaria automática ni cambios en la preparación del pedido.

Las pruebas comprueban devoluciones repetidas, límites acumulados, saldos, cierre posterior del remanente, deuda conservada/cancelada explícitamente, métodos archivados, aislamiento, permisos, líneas estrictas, revisiones, idempotencia, fondos, sesión cerrada y rollback de auditoría. El recorrido Chromium verifica respuesta perdida, UI de límites/referencias, abono posterior, recibo móvil y cierre de caja. Los resultados exactos se registran en PROGRESS/PROJECT_STATE al completar la verificación.
# Custodia de reparto (3.DEL-4B2)

Los pagos courier_cash admiten las devoluciones existentes desde una caja fisica autorizada. Esa salida de caja no devuelve el efectivo que sigue en manos del repartidor: su rendicion pendiente conserva el pago bruto menos lo ya rendido. No emitir una segunda devolucion al rendir. Desde3.DEL-4C, devolver directamente desde el cobro retenido crea el mismo SaleRefund con courier_collection_id, confirmacion fisica y caja/movimiento null. PartialRefund/RecordRefunds limitan remanente del pago y efectivo retenido; revisiones venta/custodia y UUID serializan con rendiciones. Esa devolucion si reduce la custodia; no reduce caja ni reabre deuda. Terminal: Rendir cobros > Operacion con el efectivo > Devolver al cliente desde el repartidor.
