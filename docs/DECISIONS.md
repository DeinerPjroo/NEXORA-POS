# Decisiones técnicas y operativas

## DEC-001 · Continuación sobre 0.5

Local HEAD y origin/main coinciden con a487f23. Se preservan arquitectura, migraciones publicadas, APIs de efectivo y pruebas. Los incrementos 2.1–6 se desglosan y completan secuencialmente; este catálogo no implica finalización de fases.

## DEC-002 · Pruebas SQL sin eliminar bases

La instrucción de continuación prohíbe DROP DATABASE. scripts/test-mysql.php continúa creando una base aleatoria nueva y pasando la marca verificada por TestCase, pero la conserva al salir incluso si falla. Nunca reutiliza ni limpia bases anteriores o la base de trabajo. Se registra el nombre generado para administración posterior por el usuario. Los resultados históricos de 0.5 sí usaron limpieza; no describen el nuevo comportamiento. Los esquemas aislados consumen espacio y no se eliminan automáticamente.

## DEC-003 · Primer bloque de ventas

Métodos configurables con tipo estable cash o non_cash, estado/revisión y sin borrado. Nombre/tipo/procedencia copiados al pago. Un método registrado por operador es manual y no prueba confirmación bancaria. En esta primera ampliación, cobro/devolución siguen siendo totales; abonos/mixtos se implementan después sobre los mismos dominios. Las API antiguas sin método siguen cobrando efectivo.

El efectivo mueve caja por ingreso/egreso neto; non_cash se asocia a la sesión operativa abierta de su sucursal y registra el pago/devolución sin movimiento de efectivo. La devolución utiliza el mismo método histórico. No se cambian retroactivamente recibos ni se aceptan tipos de método arbitrarios del cliente.
