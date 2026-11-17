# Decisiones técnicas y operativas

## DEC-008 · Impuesto incluido global (0.11)

Se añade como modo explícito, sin cambiar none/exclusive ni asumir tasa/regulación. Descuento sobre subtotal redondeado; base extraída con 18 decimales de cálculo y half-up final. Impuesto por diferencia, conservando cada centavo del importe participante; total = subtotal − descuento + propina. Si la propina participa, su importe aceptado ya contiene el impuesto.

calculation_version=2 identifica esta fórmula y permanece inmutable. El historial y modos anteriores conservan versión 1. La nueva columna no cambia importes. E1 no implementa perfiles/varios impuestos por producto (E2 pendiente). Se amplía el recorrido existente de ajustes con otra venta en su misma empresa para probar esta combinación sin desactivar límites de registro ni duplicar altas innecesarias.

## DEC-007 · Partes iguales sobre una venta (0.10)

La primera división es por importes iguales antes del primer pago, de 2–20 partes con mínimo un centavo. El servidor reparte centavos sobrantes a las primeras y mantiene exactamente el total confirmado. Son asignaciones internas del total, sin repartir bases tributarias, productos o propinas ni emitir facturas separadas.

sale_accounts conserva número/etiqueta/importe append-only; payments.account_id nullable mantiene compatibilidad sin inventar cuentas en ventas antiguas. FK compuesta y servicios exigen que pertenezca a la misma venta/tenant. Se limita el acumulado por parte y venta bajo el bloqueo/revisión existentes, incluida la suma de varias líneas del mismo lote.

Las devoluciones siguen al pago original y no reabren deuda de la parte. El cierre completo cancela saldos de todas las cuentas, sin devolver lo nunca cobrado. Reasignar/dividir después del primer pago, división por productos, unión de pedidos y cierre individual de partes quedan para incrementos del POS/mesas, conservando esta historia.

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

## DEC-005 · Ajustes voluntarios y porcentaje (0.8)

El descuento porcentual usa hasta dos decimales entre 0 y 100, se aplica al subtotal global ya redondeado y se redondea half-up. Se conservan tipo/valor/importe derivado, motivo y permiso sales.discount. El fijo anterior sigue siendo la opción predeterminada y API compatible.

Las propinas son de importe fijo, inicialmente deshabilitadas. Habilitarlas requiere elegir explícitamente si participan en la base del impuesto adicional y confirmar configuración. Esto es un cálculo elegido por la empresa, sin asignar régimen/tasa legal; included/excluded aquí se refiere a la base de la propina, no a precios con impuestos incluidos (2.1-E sigue pendiente). No se agrega porcentaje ni importe automático.

La propina positiva exige sales.tips y confirmación del operador de que fue aceptada voluntariamente, guardada en snapshot y auditoría. El descuento no reduce la propina. Total = subtotal − descuento + propina + impuesto, con base elegida explícitamente. Ajustes fijados antes del primer pago; abonos posteriores no pueden cambiarlos. Devolver todos los cobros incluye la parte de propina realmente pagada, nunca dinero no recibido. No se implementa distribución/liquidación de propinas a empleados en este incremento.

## DEC-006 · Compensaciones parciales (0.9)

La devolución parcial se asigna al payment original y tiene límite acumulado, sin reinterpretar productos/impuestos/propinas. Se retira solo la unicidad por pago mediante nueva migración; FK e historia quedan. RecordRefunds se comparte con el cierre completo y comprueba método histórico/fondos/referencias dentro de la transacción bloqueada e idempotente.

Devolver reduce tanto el importe neto de la venta como lo recibido neto: no aumenta deuda. balance_due permanece total − paid mientras esté abierta; net_paid = paid − refunded. Devolver todos los abonos no cancela la deuda restante; el cierre completo explícito sí la cancela y devuelve solo remanentes. Si ya no queda dinero que devolver, valida/avanza sesión sin filas financieras cero. RefundCash antiguo permanece compatible.

Una prueba de navegador detectó revisión de caja reutilizada desde la caché de 15 segundos al abrir devolución después de un abono. useSalesCash obtiene snapshot por formulario, sin actualización de fondo ni reutilización entre operaciones; un conflicto real sigue exigiendo revisión explícita y el envío incierto permanece congelado.
