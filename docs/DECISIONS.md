# Decisiones técnicas y operativas

## DEC-023 · COMPLETED · Impresión operativa compartida

Recibo de venta térmico comparte PrintDocumentPreview con borrador/comanda. Renderiza importes persistidos y SaleAmounts, incluidos saldo pendiente/devoluciones; no crea pagos ni modifica caja. Disponible al cobrar y reimprimir desde historial, con58/80mm y aislamiento CSS del recibo administrativo anterior. Nombre/canal/mesas proceden del pedido relacionado, protegido tras venta. Etiqueta de documento interno sin factura electrónica; hardware/DIAN siguen pendientes.

Borradores y comandas usan una única vista previa/documento58/80mm con texto escapado. Comanda es copia de KitchenTicket real, nunca otro despacho; borrador identifica pendientes y subtotal informativo, sin representar pago. Consulta por pedido respeta orders.view y scopes tenant/sucursal; KDS usa sus tickets autorizados. Portal imprimible se retira al bloquear sesión. Browser print no acredita éxito físico ni sustituye integración de hardware. Preferencias de página solo se aplican mientras exista la vista previa; no alterar el recibo financiero.

## DEC-022 · IN_PROGRESS · Nexora Domicilios propio

Tarifas implementadas con DeliveryPolicy/DeliveryZone por sucursal y perfil tributario explícito. Cotización usa OrderPlan/SaleTotals; guardar valida revisiones y cargo esperado. Snapshot congelado en OrderDelivery, copiado a venta con calculation_version4: envío fuera del descuento/propina de productos, impuestos desglosados y una sola suma al total. Pagos/devoluciones/división siguen el motor existente. Custodia/rendiciones permanecen pendientes.

Extender Order/OrderDelivery, usuarios y motor financiero actuales en cinco etapas solicitadas. Libreta de clientes/direcciones por sucursal con FK tenant/branch/customer, revisiones y auditoría; el domicilio copia un snapshot autoritativo que no sigue ediciones de libreta. Operación de dirección identifica CustomerAddress para reintentos y devuelve saved_address_id, conservando la dirección exacta si se agregan otras después. Guardar un domicilio no requiere caja abierta y no confirma pago. Tarifas y custodia/rendiciones siguen pendientes: no representar efectivo del repartidor como entrada física a caja ni crear otra venta al rendir. Sin plataformas externas, GPS o app independiente.

## DEC-021 · COMPLETED · Canal de atención y destino de preparación

El canal de toma se fija por ruta: POS de mesas, recogidas y domicilios separados. La preferencia histórica de canal no cambia el entorno ni Cliente ofrece cambiarlo; enlaces antiguos redirigen. Elegir mesa no cambia opciones de recogida dentro del POS, pues pertenecen a su propia sección. Pedidos se filtra por canal activo, conserva filtros/página al consultar detalles y permite Todos. El personal sin operación de mesas inicia en recogidas; empacar líneas de mesa conserva pedido y cuenta únicos.

Modificar cliente es una operación separada de agregar productos: solo metadatos de Order y contactos de OrderDelivery, con motivo/revisiones/UUID y auditoría/eventos. No cambia snapshots, dinero ni notas; se impide tras venta/finalización y, para entrega, tras salida. Frontend mantiene snapshot y payload exactos ante incertidumbre y no vuelve a crear pedidos para corregir nombres.

La identificación visual usa canal, no destino de una línea: mesa azul, recogida violeta y domicilio ámbar, siempre con texto/icono. Mesa histórica se identifica como ubicación al registrar; nombre de cliente tiene prioridad sobre referencia en pedidos sin mesa. Filtros reutilizan channel del API.

Pedidos consultados desde POS se muestran en el panel izquierdo, también desde el encabezado común mediante callback de la terminal montada. Consulta/cobro conservan contexto del pedido original; no rehidratar líneas registradas como borrador ni duplicar servicios financieros.

Recogidas operativas reutilizan la Terminal POS mediante canal inicial fijo y selector interno de pedidos persistidos. Líneas registradas se consultan, no se reconstruyen como adiciones. Cocina/cobro conservan el mismo Order; Nueva recogida es explícita y bloqueada con borrador o envío incierto. No ampliar append fuera de mesa en este cambio visual. Lectores conservan consulta sin conceder gestión.

Conservar Order como identidad financiera. preparation_destination por línea no cambia el canal ni recotiza precios: una mesa admite servir/empacar y separa cantidades pendientes. PreparationCorrection agrega historia y reemplaza solo instrucciones efectivas; snapshots de línea/comanda permanecen inmutables. Revisión de pedido y tickets invalida acciones viejas. takeaway es recogida; delivery usa OrderDelivery/eventos con FK, revisiones/UUID, sucursal y repartidor autorizado. Contactos solo para gestor o asignado. Salida a reparto entrega tickets listos al repartidor en la misma transacción; entrega al cliente es otro estado y nunca un cobro. Reutilizar servicios de pedido/cocina/caja existentes.

## DEC-020 · COMPLETED · Empleados con identidad y sucursales existentes

Extender users/roles con revisiones y employee_branches con FK compuestas. Cuentas nuevas requieren sucursales explícitas; acceso legado se conserva. Contexto BranchAccess autenticado limita modelos operativos y comandos, sin confiar en sucursal del cliente. Tenant lock serializa cambios y se revalida versión de sesión antes de comandos idempotentes. Proteger propietario/cuenta propia y negar concesiones superiores al actor. Cambios de acceso revocan sesiones, conservan MFA e historia; PIN6 existente solo desbloquea sesión personal. Admin gestiona empleados, Terminal/Kitchen reutilizan los mismos permisos y servicios.

## DEC-019 · Métricas comerciales sin reinterpretar historia (0.28)

Separar ventas por su fecha de registro y cobros/devoluciones por fecha del evento, con periodos locales y comparación equivalente. Agregados BCMath por moneda y permisos por dominio; deuda actual reutiliza SaleBalance, combo cuenta cabecera y excluye componentes. Transacción de lectura coherente sin mutex de escritura de empresa. No presentar neto como ganancia ni egresos manuales como todos los gastos. COMMERCIAL_DASHBOARD.md define el contrato.

## DEC-018 · Distribución versionada y separada de ocupación (0.25)

Salón como raíz de revisión: metadatos, mesas y plano serializan con Tenant lock y revisión del salón; el plano exige el conjunto completo de mesas activas. Nombres únicos también en archivo; sucursal y salón de pertenencia estables. FK compuestas tenant/sucursal/salón. Geometría entera acotada y objetos de catálogo permitido, sin código libre ni estados de ocupación inventados. Editor captura revisión/datos al abrir y congela DTO/UUID inciertos. DINING_LAYOUTS.md define límites y contrato; B agrega la operación real sin otra implementación financiera.

## DEC-017 · Alternativas explícitas y selección acotada (0.20)

Extender product_combo_components con pertenencia nullable/estable a product_combo_groups, conservando fijos y contrato0.19. Hasta8 grupos/20 alternativas activas; mínimos de alternativas y límites de unidades son conceptos diferentes. SaveComboGroup/ComboBounds comprueban capacidad mínima bajo Tenant lock y SaveCombo avanza revisión de grupo/raíz al cambiar una alternativa. Archivar grupos conserva flags de alternativas e historia. FK tenant/root/group protege pertenencia.

Raíces con grupos activos exigen selection_version2 para impedir que clientes anteriores los interpreten como componentes fijos. ComboSelection comprueba fijos completos, min/max, alternativas únicas y unidades completas antes de cargas completas del catálogo; OrderCatalog solo carga hojas elegidas. Menú admite opciones cerradas no elegidas si existe una composición válida y nunca sustituye automáticamente. Orden estable de fijos/grupos/alternativas/unidades; reparto monetario y fórmulas tributarias existentes conservados. Snapshot estructural2 copia grupos y elecciones; D1 sigue snapshot1. La cabecera y grupos no son otras filas financieras. COMBO_CHOICES.md define contrato.

## DEC-016 · Precio de combo repartido en posiciones históricas (0.19)

La raíz es Product de tipo combo estable y no reemplaza perfiles de sus componentes. El operador elige reparto equal/proportional explícito; bases de referencia contextuales son pesos para proporcional y adicionales se suman a la parte del componente. Reparto a cuatro decimales, mayores restos con orden estable, sin política alternativa automática cuando todos los pesos son cero. No interpretar la diferencia frente a precios individuales como descuento financiero.

Una unidad repetida se representa por posición facturable, con quantity igual a cantidad de combos, evitando unit_price aproximado que no multiplique exactamente. Cabecera append-only copia identidad/contexto/política/asignaciones; no se suma al subtotal. ProductTaxTotals conserva versión3 sobre esas posiciones; no cambia fórmula por agruparlas. Snapshot de referencia se distingue de base asignada. Se valida expansión antes de cargar todo el catálogo y se exige disponibilidad/revisiones de raíz y componentes bajo el mismo Tenant lock/instante; replay y cobro no recotizan. Compatibilidad con posiciones legadas null y sin combos anidados. FIXED_COMBOS.md; alternativas/grupos corresponden a D2.

## DEC-015 · Ventanas locales y comprobación de disponibilidad (0.18)

El producto habilita un horario heredado por presentaciones/preparaciones; inicialmente deshabilitado. Habilitado sin ventanas activas queda cerrado. Hasta 28 ventanas activas y archivadas paginadas; solapes se unen. Días ISO y minutos, inicio incluyente/final excluyente, cruce de medianoche explícito y vigencia aplicada al día local de inicio. Hora de pared en la zona actual de empresa: ambas ocurrencias de una hora repetida tienen igual elegibilidad; no se inventa una hora inexistente. Un día local puede durar 23/25 horas transcurridas.

AvailabilitySchedule carga ventanas por lote y usa un instante común. Menú/ficha informan el estado consultado; OrderPlan vuelve a exigir disponibilidad al previsualizar/registrar. El preview no reserva horario. Cierre posterior no modifica replay ni preparación/cobro/devolución de pedidos guardados; snapshot nullable conserva instante UTC/zona/revisión/ventanas. Filtros manuales y flags de variantes siguen teniendo su significado anterior; sellable combina restricciones. Los tests Chromium usan siete ventanas de día completo y archivo administrativo, sin reloj especial de producción ni espera del minuto real. Contrato en AVAILABILITY_SCHEDULES.md.

Los formularios capturan expected_timezone al abrir y el servidor lo compara bajo bloqueo Tenant antes de una escritura nueva. Un cambio de zona en otra sesión rechaza el formulario obsoleto; el replay registrado sigue devolviendo su resultado sin reejecutarlo. Las respuestas de mutaciones de fotografía también calculan elegibilidad actual, sin asumir que un horario esté abierto por faltar la evaluación.

## DEC-014 · Contexto explícito y revisión de borrador (0.17)

Cada entidad vendible conserva su precio base y reglas propias: sucursal+canal > sucursal > canal > base. Una regla del padre no sustituye precios de variantes. Identidad estable, archivo/revisión/UUID y scopes generados STORED para unicidad real con IDs null, comprobados en SQLite y MariaDB. La consulta contextual devuelve un atributo separado y nunca sobreescribe sale_price del editor.

OrderPlan comparte validaciones/cálculo entre preview sin escrituras de negocio y registro estricto bajo bloqueo Tenant. El carrito no cambia contexto hasta resolver el preview; diferencias de precio/contenido/perfil tributario requieren aceptación visible, conservando cantidades/notas/selecciones. El envío incierto mantiene contexto y UUID/cuerpo original. PriceSnapshot documenta la procedencia histórica, sin recotizar al cobrar o devolver ni reconstruir procedencias de líneas anteriores. Horarios se implementan separadamente en C2. Contrato en CONTEXT_PRICES.md.

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
