# Terminal POS · 2.3

Avance: A implementado/verificado como0.23, contrato POS.md. Continuar B de inicio por permisos, continuidad de contexto y ergonomía; no reiniciar A ni duplicar comandos financieros.

Siguiente bloque tras galería0.22. Reutilizar OrderComposer, catálogo/configuradores/carrito, preview, CreateOrder, CheckoutPage y recibo; no crear otro cálculo de precios, impuestos o caja. Alcance inicial: terminal táctil para llevar/en restaurante con contexto visible, caja de sucursal, búsqueda/categorías, variantes/preparaciones/combos/promociones, pedido y acceso directo a cobro real existente.

Dividir en incrementos verificables: A) terminal conectado y navegación pedido→cobro→recibo→nueva operación, B) ergonomía/atajos/contexto y acceso inicial por permisos según necesidades detectadas. Mesas/salones siguen2.4; entrega/pagos continúan independientes y no se inventan stock, pasarelas ni funciones offline.

Solo habilitar acciones con permisos existentes; la disponibilidad de caja proviene de sales/cash-context, sin exponer saldos por catalog.view. Pedido y venta conservan sus comandos/revisiones/UUID y recuperación de respuestas inciertas. Si falla o se cancela el cobro, el pedido real queda consultable pendiente; no marcarlo pagado. No cambiar configuración/sucursal de envíos inciertos.

Ruta de terminal y componentes adaptables con controles táctiles, foco y estados claros. Reutilizar diseño/tema existente y navegación por permisos; origen POS solo orienta navegación interna y no es autoridad financiera. Aceptación dirigida: regular/variante/combo/promoción, preparación/cantidad/notas/contexto, pedido→pago→recibo, caja cerrada/falta de permisos y reintento sin duplicación; revisión visual escritorio/móvil y compilación al cambiar UI. Pruebas por impacto según AGENTS; no reiniciar fases anteriores.
