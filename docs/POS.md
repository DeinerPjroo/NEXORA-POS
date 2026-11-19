# Terminal POS · 0.23 (2.3-A)

Ruta `/pos` y navegación propia; exige catalog.view, orders.view, orders.manage y sales.collect. PosAccess y el menú comparten requisitos. Los comandos siguen autorizados en servidor con tenant/revisión/UUID existentes; origen POS solo cambia navegación interna.

OrderComposer se reutiliza con modo terminal: consulta caja de sucursal/configuración, muestra preparación pendiente y bloquea nuevas operaciones hasta disponer de caja abierta y cálculo confirmado. Puede abrir administración en otra pestaña sin perder pantalla. Estado consultivo cada15s/actualización manual; no reserva caja ni sustituye la revisión de Checkout. Un envío incierto conserva cuerpo/UUID y puede reintentarse aunque cambie el estado consultado.

Catálogo, búsqueda/categorías, variantes/preparaciones, combos/alternativas/promociones, precios/contexto y carrito son los existentes. Controles táctiles44px y diseño adaptable. Cambiar sucursal revisa el mismo carrito; no descarta notas ni selecciones. Las observaciones regulares se muestran también en resumen de cobro.

Registrar pedido navega a `/pos/pedidos/{id}/cobrar`, donde Checkout conserva cotización, caja, ajustes, método, revisión, pagos y UUID originales. Solo confirmar el cobro registra venta/pago/caja; un pedido pendiente no equivale a venta. Fallo/cancelación de cobro deja pedido real consultable. Recibo con sales.view usa `/pos/ventas/{id}`; sin ese permiso se presenta el resultado local ya autorizado del cobro, sin habilitar historial. Ambos permiten nueva operación POS.

## Verificación y continuidad

Tres casos Chromium ejecutados/aprobados: operativo final con caja cerrada, cambio de sucursal conservando notas, preparación/variante/combo promocional, impuestos mixtos y respuestas perdidas de pedido/cobro sin duplicación; rol sin cobro sin acceso al terminal/contexto de caja; cobro sin sales.view con recibo local y regreso. Total real16.21 y caja116.21 desde apertura100. Compilación/TypeScript/formato y capturas escritorio/móvil comprobados. Backend financiero sin cambios, resultados anteriores reutilizados.

2.3-A completado. 2.3-B pendiente: inicio por permisos, continuidad del contexto y ergonomía móvil/atajos según POS_PLAN. No completar padre2.3 todavía. Mesas/salones siguen2.4; stock, pasarelas, hardware y offline conservan fases posteriores.
