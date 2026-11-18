# Decisiones técnicas y operativas

## DEC-013 · Opciones por unidad y snapshot de preparación (0.16)

Cada grupo pertenece a un producto y se aplica a sus variantes; tipo addon/exclusion estable. Las exclusiones son instrucciones de preparación con importe cero, no descuentos, reembolsos ni movimientos de inventario. Configuración activa limitada a 8 grupos/20 opciones, conservando archivados y páginas administrativas. Revisiones de grupo/producto y auditoría dentro de UUID transaccional; producto incrementa revisión ante cualquier cambio para invalidar carritos.

Una opción se elige una vez por unidad; cantidades de producto multiplican el precio unitario completo. Preparaciones diferentes tienen claves canónicas distintas en carrito. El servidor valida grupos/opciones por línea, no un distinct global que rechace dos líneas con el mismo grupo. Precio base + adicionales BCMath y límites monetarios, con snapshots en OrderItem; el cálculo tributario recibe el subtotal completo y las opciones heredan el perfil del producto. No recotizar al cobrar/reintentar pedidos anteriores.

La consulta activa tiene límite real de configuración; las lecturas administrativas conservan historial paginado. Una advertencia de bundle 510.01 kB justificó lazy de historial (503.30 restante) y panel de producto (492.97 principal), sin elevar el umbral de Vite ni agregar dependencias.

## DEC-012 · Subcategorías con dos niveles (0.15)

Se añade padre nullable sobre categories existentes y se conservan unicidad de nombres por empresa, revisiones y productos asignados. Dos niveles explícitos permiten prevenir ciclos y consultar ancestro directo sin introducir recursión no requerida. Una raíz con hijos no puede convertirse en hija hasta reasignarlos; una hija sí puede volver a raíz. Elegir padre requiere revisión; omitir parent_id conserva la relación para clientes anteriores.

La disponibilidad efectiva se deriva sin mutar flags ni revisiones de descendientes. Guardar categorías comparte bloqueo Tenant con CreateOrder para serializar archivado/reasignaciones y toma de pedidos. El filtro por raíz incluye sus hijas, mientras los conteos de tarjeta son directos y el recurso explica estado propio/efectivo. Los pedidos anteriores permanecen históricos, incluidos sus replays idempotentes.

## DEC-011 · Declaraciones humanas separadas (0.14)

Conciliar manualmente registra una declaración del operador, sin alterar el pago ni simular respuesta de proveedor. Requiere importe observado escrito por la persona, referencia, confirmación y permiso independiente; diferencia/pending exigen motivo. Historial append-only con versión por pago, revisión financiera/neto observado y auditoría en la misma transacción idempotente.

Toda revisión financiera posterior de la venta invalida conservadoramente matched/difference, incluso si cambia otro pago de esa venta. Se muestra stale hasta una nueva declaración explícita; el UUID antiguo devuelve su declaración histórica, nunca una confirmación sobre el nuevo neto. No incrementar Sale.revision por revisión manual, porque no cambia la operación financiera. Efectivo mantiene arqueo en caja; este comando acepta solo no efectivo. No implica integración bancaria ni comisiones/netos de liquidación del proveedor.

## DEC-010 · Historial por pago y resumen acotado (0.13)

El historial muestra una fila por pago, con devoluciones acumuladas actuales. Fecha filtra registro del pago y no recalcula compensaciones históricas al cierre del rango; la UI lo explica. El resumen suma solo la página actual y agrupa moneda, sin duplicar total de una venta abonada ni presentarlo como ganancias o flujo bancario del período.

Se conserva zona de aplicación/almacenamiento existente y se convierten límites desde la zona de empresa. No cambiar APP_TIMEZONE ni asumir SQL UTC para consultas; prueba explícita de medianoche y Europe/Madrid. Lectura con sales.view sin exponer esperado de caja; registro manual no equivale a proveedor confirmado. La revisión humana independiente se añade en F2.

## DEC-009 · Perfiles por producto y centavos (0.12)

Perfiles con 1–5 impuestos paralelos sobre igual base, sin cascadas ni tasas/regímenes predeterminados. Las variantes heredan perfil del producto. Se copian tasas/modo/nombre/revisión al pedido y se exige revisión del perfil incluso si no cambió precio/producto. Se bloquea activar modo por producto mientras existan pedidos legados no resueltos sin snapshot; no se infieren tasas antiguas.

El subtotal global y descuento se distribuyen a líneas por mayores restos y orden estable. Exclusive redondea cada componente y lo añade; inclusive extrae base y reparte centavos del impuesto total por tasas, conservando importe final. Versión 3 con JSON de desglose, sin reescribir versiones anteriores. El perfil de propina participante debe elegirse explícitamente y queda como política confirmada hasta nueva selección; editar el perfil no cambia esa política ni ventas previas.

La suite ya registra 10 empresas por HTTP. Nuevos recorridos usan fixtures ficticios por CLI con guardas estrictas del archivo SQLite E2E y login UI real; se mantienen límites/validaciones de producción y recorridos de registro existentes. Tres guardas negativas verificadas antes de acceso a base: sin marca, otro driver y otra ruta. No se crea endpoint de acceso alternativo.

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
