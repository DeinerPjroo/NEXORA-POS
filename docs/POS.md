# Terminal POS · 0.24 (2.3-A/B)

Ruta `/pos` y navegación propia; exige catalog.view, orders.view, orders.manage y sales.collect. PosAccess y el menú comparten requisitos. Los comandos siguen autorizados en servidor con tenant/revisión/UUID existentes; origen POS solo cambia navegación interna.

OrderComposer se reutiliza con modo terminal: consulta caja de sucursal/configuración, muestra preparación pendiente y bloquea nuevas operaciones hasta disponer de caja abierta y cálculo confirmado. Puede abrir administración en otra pestaña sin perder pantalla. Estado consultivo cada15s/actualización manual; no reserva caja ni sustituye la revisión de Checkout. Un envío incierto conserva cuerpo/UUID y puede reintentarse aunque cambie el estado consultado.

Catálogo, búsqueda/categorías, variantes/preparaciones, combos/alternativas/promociones, precios/contexto y carrito son los existentes. Controles táctiles44px y diseño adaptable. Cambiar sucursal revisa el mismo carrito; no descarta notas ni selecciones. Las observaciones regulares se muestran también en resumen de cobro.

Registrar pedido navega a `/pos/pedidos/{id}/cobrar`, donde Checkout conserva cotización, caja, ajustes, método, revisión, pagos y UUID originales. Solo confirmar el cobro registra venta/pago/caja; un pedido pendiente no equivale a venta. Fallo/cancelación de cobro deja pedido real consultable. Recibo con sales.view usa `/pos/ventas/{id}`; sin ese permiso se presenta el resultado local ya autorizado del cobro, sin habilitar historial. Ambos permiten nueva operación POS.

## Verificación y continuidad

Tres casos Chromium ejecutados/aprobados: operativo final con caja cerrada, cambio de sucursal conservando notas, preparación/variante/combo promocional, impuestos mixtos y respuestas perdidas de pedido/cobro sin duplicación; rol sin cobro sin acceso al terminal/contexto de caja; cobro sin sales.view con recibo local y regreso. Total real16.21 y caja116.21 desde apertura100. Compilación/TypeScript/formato y capturas escritorio/móvil comprobados. Backend financiero sin cambios, resultados anteriores reutilizados.

2.3-A/B completados. Mesas/salones siguen2.4; stock, pasarelas, hardware y offline conservan fases posteriores.

## Inicio y contexto desde0.24

homePath elige una ruta autorizada: administración con resumen conserva /inicio; operador con los cuatro permisos POS inicia /pos; otros perfiles van a pedidos/caja/catálogo/ventas u otra sección disponible y, sin capacidades operativas, /acerca. Login obtiene perfil una vez y limpia caché de dominio/mutaciones; retorno desde acceso restringido usa la misma política y evita bucles. No modifica permisos del servidor.

Preferencia de sucursal/canal en sessionStorage por empresa/usuario, sin carrito, importes, revisiones ni tokens. Se valida contra sucursales activas antes de consultar/registrar; una referencia ajena/inactiva exige elección explícita y se limpia al logout. Nueva operación refresca contexto y conserva selección válida. Un reintento incierto usa primero cuerpo/UUID originales aunque cambie la disponibilidad de sucursal; el servidor mantiene autoridad.

Móvil alterna menú/pedido sin desmontar el formulario. F2 enfoca búsqueda y F8 enfoca el pedido/botón, sin registrar ni cobrar por sí solos; se suspenden durante configuradores. Chromium dirigido de inicio/contexto/foundation7 y POS3 aprobados; caso final de sucursal retirada/reintento/contexto fresco1 aprobado1.5min. Build/TypeScript/Prettier y captura móvil comprobados. Resultados en PROJECT_STATE/HANDOFF.
