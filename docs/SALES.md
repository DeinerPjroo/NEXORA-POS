# Venta y devolución con métodos manuales (0.5–0.7)

## Uso

Desde 0.7 se permiten abonos y varios pagos por venta. El total original permanece fijo; el recibo muestra pagos aplicados, saldo e historial. Véanse reglas actuales y devolución de cobros de ventas abonadas en [PAYMENTS.md](PAYMENTS.md). Las reglas de cálculo de este documento siguen vigentes.

1. En **Ventas → Configurar ventas**, confirma el cálculo. La instalación comienza sin configurar y bloquea los cobros hasta esta confirmación.
2. Elige **sin impuesto adicional automático** o un **porcentaje adicional sobre la base** con nombre/tasa definidos por la empresa. No se asigna un régimen ni una tasa legal automáticamente. Los precios del catálogo se interpretan como base; los impuestos incluidos y múltiples por producto no están soportados.
3. Abre una sesión operativa de caja en la sucursal. Desde un pedido no cancelado, entra en **Cobrar pedido** y selecciona un método. Puede cobrarse antes o después de entregar; preparación y pago son estados distintos.
4. Si corresponde, aplica un descuento fijo en dinero con motivo y permiso sales.discount. Pulsa **Actualizar total** y revisa el cálculo del servidor.
5. Selecciona la caja y registra el efectivo recibido o referencia del pago manual no efectivo. Confirmar guarda venta, pago, revisión de sesión/pedido, secuencia y auditoría en una transacción. Solo efectivo genera ingreso neto.
6. El recibo se consulta en **Ventas**, puede imprimirse con el diálogo del navegador y conserva importes y datos comerciales históricos. Su numeración V-000001 es interna por empresa, no una resolución fiscal ni una factura electrónica.

## Métodos configurables desde 0.6

En Ventas → Métodos de pago (sales.configure), crear métodos cash o non_cash, con código único y nombre por empresa. Código y tipo no cambian; el nombre/estado requieren revisión. Sin borrado. Efectivo principal protegido contra desactivación; una API antigua sin método sigue usando ese efectivo.

El pago guarda método, nombre, tipo, revisión, procedencia operator y referencia como snapshot. Los no efectivos exigen referencia y total exacto, no calculan cambio, no generan CashMovement ni alteran expected_amount. Sí requieren sesión operativa abierta de la misma sucursal/moneda e incrementan su revisión, evitando cerrar sobre una sesión desactualizada. No se verifica ninguna referencia con bancos o pasarelas. No llamar gateway/confirmed a estos registros manuales.

El selector de métodos tiene paginación y solo ofrece activos. El servidor vuelve a comprobar revisión/estado al confirmar. Desactivar o renombrar no altera recibos anteriores ni impide devolver por el método histórico.

## Cálculo definido

Importes DECIMAL(19,4), enviados como cadenas y calculados con BCMath. En este circuito COP/USD/EUR se cobran con dos decimales; mitad hacia arriba, no redondeo bancario. El catálogo y las líneas históricas conservan cuatro decimales.

- Se suma el pedido con sus precios históricos; no se vuelve a cotizar con el catálogo actual.
- Se redondea el subtotal global a dos decimales. El ajuste firmado frente al subtotal original queda en la venta y el recibo.
- Se resta el descuento fijo de dos decimales, que no puede exceder el subtotal. Motivo obligatorio si es mayor que cero.
- Para modo adicional: impuesto = base después del descuento × tasa / 100, redondeado a dos decimales. Tasa con hasta cuatro decimales, entre 0 y 100.
- Total = base + impuesto. Debe ser positivo. Pedidos gratuitos/total cero quedan fuera de este circuito de cobro.
- Cambio = recibido − total; recibido debe cubrir el total y tener como máximo dos decimales.
- El ingreso neto en caja es el **total**, no todo el recibido: el cambio se entrega al cliente dentro de la misma operación física.

Ejemplo de prueba, sin representar una tasa tributaria recomendada: 3 × 123.4567 = 370.3701; subtotal redondeado 370.37; descuento 10.12; base 360.25; tasa de prueba 8.1250 %; impuesto 29.27; total 389.52; recibido 400.00; cambio 10.48. Una caja abierta con 1000.00 queda con esperado 1389.52.

## Integridad y reintentos

Cotizar no registra un cobro. Al confirmar se verifican las revisiones de pedido, configuración y caja, además del total esperado; un conflicto devuelve 409 y exige revisar. La sesión debe estar abierta y corresponder a la sucursal/moneda del pedido. El servidor limita los acumulados al rango DECIMAL.

Un UUID idempotente identifica cada cobro/devolución. Si se pierde la respuesta, el formulario congela sus datos y reintenta el payload exacto. Una repetición compatible devuelve la venta actual sin repetir ingresos o egresos. La unicidad tenant/pedido bloquea un segundo cobro incluso con un UUID diferente. Las claves permanecen en memoria mientras el formulario está abierto; no hay cola offline ni recuperación persistente al recargar.

La venta conserva nombre comercial, sucursal/dirección, importes, tasa/modo y revisión de configuración. Sus líneas proceden de order_items inmutables. Cambiar empresa, catálogo o reglas no modifica un recibo anterior. Pagos, devoluciones y movimientos son append-only. El estado y revisión de venta evolucionan al agregar pagos o cerrar mediante compensación; los importes originales no cambian.

## Devolución total

Desde un recibo cobrado o abonado, **Devolución total** requiere sales.refund, motivo y sesión abierta de la misma sucursal/moneda. Puede ser una sesión posterior. Compensa cada pago por su método histórico y solo devuelve los importes aplicados; el saldo nunca cobrado se cancela por separado. Efectivo exige fondos y registra egreso, no efectivo exige referencia y no modifica caja. Conserva pagos/movimientos originales y el reintento no duplica salidas. Detalles en PAYMENTS.md.

No se cancela un pedido con venta asociada: una persona autorizada gestiona su devolución desde el recibo. Devolver no cambia el estado de preparación, no repone inventario y no permite volver a cobrar ese mismo pedido. Este incremento no incluye devoluciones parciales, cambio de productos, notas fiscales ni anulaciones de documentos tributarios.

## Permisos y límites

sales.view consulta ventas/recibos; sales.collect cobra; sales.configure confirma configuración; sales.discount descuenta; sales.refund devuelve. La interfaz de cobro también necesita orders.view para consultar el pedido. No exige cash.movements: un cobro es una acción distinta a un movimiento manual. Las nuevas capacidades se conceden automáticamente solo a propietarios existentes; otros roles se configuran explícitamente.

No hay confirmación electrónica de tarjetas/transferencias, pasarelas, cuentas divididas, propinas, impuestos incluidos o múltiples por producto, devoluciones parciales, inventario, DIAN, impresión ESC/POS ni apertura de cajón. Abonos/mixtos manuales sí existen desde 0.7. Los nombres configurables pueden describir medios externos, pero los registros siguen siendo manuales. Impresión del navegador, sin garantía térmica. El sistema no observa físicamente el dinero ni confirma movimientos de bancos.

Continúan pendientes MySQL 8 específico, CI, carga/concurrencia entre procesos, operación fiscal real, backups/restauración y endurecimiento de producción. MariaDB es la referencia monetaria probada; SQLite solo cubre funcionalidad por sus límites de afinidad NUMERIC.
