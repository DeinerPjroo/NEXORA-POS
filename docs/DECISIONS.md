# Decisiones técnicas y operativas

## DEC-001 · Continuación sobre 0.5

Local HEAD y origin/main coinciden con a487f23. Se preservan arquitectura, migraciones publicadas, APIs de efectivo y pruebas. Los incrementos 2.1–6 se desglosan y completan secuencialmente; este catálogo no implica finalización de fases.

## DEC-002 · Pruebas SQL sin eliminar bases

La instrucción de continuación prohíbe DROP DATABASE. scripts/test-mysql.php continúa creando una base aleatoria nueva y pasando la marca verificada por TestCase, pero la conserva al salir incluso si falla. Nunca reutiliza ni limpia bases anteriores o la base de trabajo. Se registra el nombre generado para administración posterior por el usuario. Los resultados históricos de 0.5 sí usaron limpieza; no describen el nuevo comportamiento. Los esquemas aislados consumen espacio y no se eliminan automáticamente.

## DEC-003 · Primer bloque de ventas

Métodos configurables con tipo estable cash o non_cash, estado/revisión y sin borrado. Nombre/tipo/procedencia copiados al pago. Un método registrado por operador es manual y no prueba confirmación bancaria. En esta primera ampliación, cobro/devolución siguen siendo totales; abonos/mixtos se implementan después sobre los mismos dominios. Las API antiguas sin método siguen cobrando efectivo.

El efectivo mueve caja por ingreso/egreso neto; non_cash se asocia a la sesión operativa abierta de su sucursal y registra el pago/devolución sin movimiento de efectivo. La devolución utiliza el mismo método histórico. No se cambian retroactivamente recibos ni se aceptan tipos de método arbitrarios del cliente.

## DEC-004 · Compatibilidad e historia 0.6

Se conserva el servicio CollectCash y la API de cobro único como entrada compatible; sin payment_method_id se usa efectivo. Los pagos existentes reciben solo campos adicionales de método/procedencia, sin cambiar importes. La migración 000006 crea efectivo por empresa y enlaza pagos anteriores; el descenso automático se rechaza porque eliminar métodos/metadatos perdería historia. Sus FKs se declaran por columnas y nombre explícito para que SQLite pueda reconstruirlas y MariaDB conserve el nombre publicado.

El movimiento nullable no significa efectivo perdido: solo non_cash lo deja vacío; cash exige y crea su movimiento en el mismo servicio/transacción. Una devolución no puede elegir otro tipo para convertir un registro no efectivo en salida de dinero. Código/tipo no se editan y el efectivo principal no se desactiva.

## DEC-005 · Ajustes voluntarios y porcentaje (0.8 en verificación)

El descuento porcentual usa hasta dos decimales entre 0 y 100, se aplica al subtotal global ya redondeado y se redondea half-up. Se conservan tipo/valor/importe derivado, motivo y permiso sales.discount. El fijo anterior sigue siendo la opción predeterminada y API compatible.

Las propinas son de importe fijo, inicialmente deshabilitadas. Habilitarlas requiere elegir explícitamente si participan en la base del impuesto adicional y confirmar configuración. Esto es un cálculo elegido por la empresa, sin asignar régimen/tasa legal; included/excluded aquí se refiere a la base de la propina, no a precios con impuestos incluidos (2.1-E sigue pendiente). No se agrega porcentaje ni importe automático.

La propina positiva exige sales.tips y confirmación del operador de que fue aceptada voluntariamente, guardada en snapshot y auditoría. El descuento no reduce la propina. Total = subtotal − descuento + propina + impuesto, con base elegida explícitamente. Ajustes fijados antes del primer pago; abonos posteriores no pueden cambiarlos. Devolver todos los cobros incluye la parte de propina realmente pagada, nunca dinero no recibido. No se implementa distribución/liquidación de propinas a empleados en este incremento.
