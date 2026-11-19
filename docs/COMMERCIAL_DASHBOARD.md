# Dashboard comercial · 0.28

GET workspace/commercial-dashboard con dashboard.view. from/to son fechas locales de la empresa, intervalo inclusivo de1..93 días; sede opcional validada dentro del tenant. Zona vigente desde DB, límites convertidos a app.timezone para consultar timestamps existentes. Comparación con periodo anterior de igual cantidad de días. Transacción de lectura; MariaDB local verificado en REPEATABLE-READ, sin bloquear el mutex Tenant de cobros.

Permisos independientes: sales.view para importes/productos/métodos/operadores, cash.view para egresos manuales y cajas abiertas, orders.view para pedidos activos y dining.view para ocupación. Las secciones no autorizadas retornan null. dashboard.view por sí solo no concede acceso financiero. Contexto de sucursales limitado a id/nombre/estado propios.

Por moneda, sin conversiones ni sumas entre monedas:
- Ventas registradas: cantidad y total inmutable de ventas creadas en el periodo; incluye ventas después compensadas. Una venta cuenta una vez aunque tenga varios pagos.
- Cobros aplicados: suma de payments.amount por su fecha; no recibido/cambio ni apertura de caja.
- Devoluciones: sale_refunds.amount por su fecha, incluyendo compensaciones de ventas anteriores.
- Neto de cobros: cobros menos devoluciones del periodo; puede ser negativo, no es ganancia.
- Saldo actual de esas ventas: SaleBalance vigente de la cohorte creada en el periodo. Cobros posteriores reducen ese saldo y las devoluciones no reabren deuda.
- Ticket medio, impuestos y propinas: desde importes registrados, sin recalcular catálogo ni políticas fiscales.
- Egresos manuales de caja: movimientos expense del periodo excluyendo los ligados a devoluciones. No representan todos los gastos contables.

Suma con BCMath a cuatro decimales por lotes/cursores, sin SUM monetario de SQLite ni float. El total agregado puede superar el rango de una venta individual sin desbordarse; ticket medio reutiliza redondeo existente. Diferencias monetarias exactas; variación porcentual solo con base anterior positiva. No inventar ganancia con costos actuales del catálogo: costos históricos, inventario y gastos completos dependen de fases posteriores.

Serie diaria y horas usan la zona empresarial; métodos conservan nombre/tipo histórico del pago original, también en devoluciones. Medios no efectivos siguen siendo registros del operador. Unidades brutas de productos por ventas creadas: combos desde OrderCombo y artículos individuales desde OrderItem sin cabecera de combo, evitando duplicar componentes. Nombres desde snapshots; no se infieren unidades devueltas a partir de devoluciones monetarias. Operadores son quienes registraron la venta, no una medida completa de rendimiento laboral.

Operación actual se consulta aparte del periodo: pedidos open/preparing/ready, mesas ocupadas y sesiones de caja abiertas, por sede. Cobro no implica entrega ni libera automáticamente mesas. Consulta actualizada cada30s y botón manual; se conserva fecha de generación para interpretar el resultado.

UI principal de /inicio con filtros, moneda, comparación, gráfico diario interactivo accesible, métodos, productos, horas y operadores. El resumen administrativo anterior queda en sección desplegable. Gráfico calcula proporciones visuales con BigInt y solo convierte una coordenada acotada; etiquetas usan formatMoney existente, sin convertir importes a float. Preferencias de widgets por usuario/empresa en sessionStorage: solo claves permitidas, sin guardar dinero ni credenciales. Layouts publicados y widgets avanzados de Studio permanecen en fase4.

Verificación dirigida de apertura→pedido POS→cobro→devolución→egreso→cierre y consistencia del dashboard, permisos e interfaz móvil. Cierre de fase2 ejecuta suites completas, registradas en STATE/HANDOFF/PROGRESS. Galería conserva reconstrucción para SQLite de memoria; SQL trunca únicamente filas de su esquema aislado y evita reconstrucciones por caso. Runner SQL:180s dirigido/600s suite, conserva bases incluso ante timeout y reporta resultados parciales sin atribuirlo a credenciales.
