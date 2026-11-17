# División en partes iguales (0.10)

## Uso y alcance

Antes del primer cobro, **Dividir cuenta** permite elegir de 2 a 20 partes iguales y la cuenta del primer pago. El servidor muestra la distribución y reparte los centavos sobrantes a las primeras partes, conservando exactamente el total. Cada parte debe tener al menos un centavo.

Una venta de 100.01 dividida en tres produce Cuenta 1 = 33.34, Cuenta 2 = 33.34 y Cuenta 3 = 33.33. Cobrar un abono de 10.00 a Cuenta 2 deja su saldo en 23.34 y el saldo global en 90.01. Si no se indica payment_amount, el primer pago cubre la parte elegida; sin división conserva el cobro completo anterior.

Desde el recibo, **Agregar pagos** selecciona la cuenta de cada línea. Puede mezclar métodos o aplicar varias líneas a la misma cuenta; la suma preparada no debe superar ni su saldo ni el saldo global. Al terminar una parte, se ofrecen las demás pendientes. La UI requiere consulta de ventas para usar la división y dar seguimiento a sus saldos; el permiso de cobro sigue comprobándose en servidor.

Se conserva **una venta y un recibo interno**. Las partes no son facturas separadas ni documentan clientes individuales. No hay división por productos, unión de pedidos ni reasignación posterior de pagos en este incremento; esas capacidades pertenecen al POS/mesas posterior. No se reparten bases tributarias o propinas entre partes: son asignaciones del total ya confirmado.

## Integridad y API

- Cotización GET orders/{order}/quote acepta split_count y devuelve accounts_preview con number/label/amount; no crea registros ni cobra.
- POST orders/{order}/collect admite split_count y exige account_number de esa división. El total esperado y revisiones de pedido/configuración/caja siguen siendo obligatorios. La distribución se recalcula en servidor antes de crear la venta y sus partes.
- Las partes sale_accounts se crean dentro de la misma transacción idempotente del primer pago, con importes/etiquetas append-only. Fallos de importe, método, caja o auditoría revierten venta, partes, pagos, secuencia y revisiones juntos.
- Pagos posteriores usan payments.*.account_id, obligatorio cuando hay división y perteneciente a esa misma venta/tenant. La FK compuesta tenant/sale/account rechaza enlaces cruzados. El servicio limita el acumulado de todas las líneas de la misma parte antes de escribir.
- No hay ruta para crear partes en una venta anterior, modificarlas o reasignar pagos. En ventas sin división, accounts=[] y payments.account_id=null; las API anteriores permanecen compatibles.
- El total y los importes se calculan con BCMath, incluyendo reparto en centavos; el navegador usa BigInt solo para el borrador. Sin float ni agregados SQL de SQLite.
- Revisión de venta/saldo y caja, UUID, bloqueo por empresa/venta y reintento exacto se conservan. La API devuelve saldos actuales, sin repetir pagos ni partes.

## Devoluciones y saldos

Cada devolución conserva la parte mediante el payment original; no permite elegir otra cuenta. Como en REFUNDS.md, devolver reduce neto y no vuelve a abrir deuda ya pagada. Una cuenta con 33.34 aplicados y 5.00 devueltos conserva saldo cero y neto 28.34. Las partes no pagadas continúan pendientes.

El recibo muestra importe original, pagos, devoluciones y saldo por parte. La API añade net_paid_amount, effective_total y cancelled_balance por cuenta. La devolución total cierra toda la venta: devuelve remanentes y cancela lo nunca cobrado, tanto por parte como globalmente. No se admite cerrar/cancelar individualmente una parte en este incremento.

## Migración y verificación

000010 crea sale_accounts y añade payments.account_id nullable/FK compuesta. No crea divisiones artificiales en ventas anteriores ni modifica sus importes. El rollback automático que elimine estas asignaciones históricas está bloqueado.

Las pruebas verifican centavos y valores extremos, límites por parte/globales y lotes mixtos, cuenta ajena de otra venta/tenant y FK, campos obligatorios, idempotencia, rollback de auditoría y líneas tardías, compatibilidad sin división, devolución/cancelación y append-only. El recorrido Chromium prueba división/cotización, abono y reintento inicial, métodos combinados, devolución parcial sin nueva deuda, las tres partes saldadas, móvil y devolución/cierre. Resultados exactos en PROGRESS/PROJECT_STATE al completar verificación.

Verificación completada: 136/1260 SQLite/MariaDB, suite completa 14 Playwright (10.0 min), build/TypeScript/Prettier/Pint/Composer correctos. Migración aplicada y captura móvil revisada.
