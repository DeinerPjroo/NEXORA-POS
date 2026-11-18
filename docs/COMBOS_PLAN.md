# Combos · diseño del incremento 2.2-D

Diseño original posterior a horarios 0.18. D1 de composición fija implementado y verificado como 0.19, contrato en FIXED_COMBOS.md; D2 de alternativas sigue pendiente y su diseño está en COMBO_CHOICES_PLAN.md. Composición/selección, precio e impuestos explícitos y snapshots, sin simular recetas/inventario. Conservar la regresión de precios/horarios, adicionales, impuestos, cuentas/abonos/devoluciones.

## División de trabajo

D1: combo de composición fija con producto/presentación por componente y preparación elegida desde los grupos existentes de cada componente. D2: grupos acotados de alternativas permitidas y selección obligatoria/limitada. Ambos requieren UI/API/pruebas/contrato y publicación propia; 2.2-D no se marca COMPLETED hasta terminar D1/D2. Los límites de grupos/opciones y expansión deben quedar definidos/probados antes de admitir D2.

## Identidad y disponibilidad

Propuesta: Product distingue regular/combo de forma estable desde creación, predeterminando regular para contratos anteriores. Combo comparte categoría/fotografía/precio base/reglas por sucursal/canal y horarios, pero sus impuestos proceden de componentes. No tiene variantes, modificadores propios ni perfil tributario de raíz; sus componentes sí pueden tener presentación y preparación. Validar también en comandos de variantes/modificadores/asignación de impuestos para evitar configuraciones por otra API.

No convertir productos existentes que puedan estar referenciados por otros combos. Admitir únicamente productos regulares como componentes: sin anidación ni ciclos. Cada referencia está protegida por FK tenant/product y, cuando corresponda, tenant/product/variant. Si un componente posteriormente requiere presentación o la elegida se archiva, el combo necesita corrección; no seleccionar otra presentación automáticamente.

Un combo nuevo exige raíz y todos sus componentes disponibles: flags manuales, categoría/padre, presentación, perfil tributario y horario. Usar un instante común del servidor/zona empresarial y bloqueo Tenant con las mismas revisiones actuales. Menú debe mostrar motivo de bloqueo y el configurador comprobar datos actuales; no basta una etiqueta de combo sobre un precio. Pedidos guardados siguen disponibles para preparación/cobro/devolución aunque cierre un componente.

## Precio y reparto explícito

La raíz aporta precio contextual base. Cada componente conserva base contextual propia como dato de referencia; sus adicionales se suman por separado a la parte asignada. La configuración exige elegir una política de reparto visible: proporcional a bases contextuales de componentes o igual por unidad de componente. No introducir una distribución tributaria oculta ni tasas legales predeterminadas. Previsualizar las partes y sus perfiles antes de registrar.

Para reparto proporcional, pesos son bases contextuales sin adicionales de los componentes elegidos. Un total de pesos cero con base de combo positiva exige elegir otro modo/configuración; no cambiar silenciosamente a reparto igual. Base de combo cero permite asignaciones cero y conserva adicionales elegidos. El reparto igual usa un peso por cada unidad de componente. Guardar modo, pesos y resultado en snapshot para reproducir el cálculo.

Repartir la base del combo con precisión de cuatro decimales mediante mayores restos y orden estable de componentes. Las partes suman exactamente la base; después añadir los importes de opciones a su componente. Precio unitario de combo = base contextual de raíz + adicionales de componentes. No llamar a la diferencia con precios individuales un descuento financiero ni cambiar los ajustes de venta. La política elegida debe confirmarse por la empresa; no representa una interpretación fiscal automática.

Inspección del código actual: CentAllocation::distribute recibe enteros decimales como cadenas y no fija escala de dos decimales; puede reutilizarse con importe/pesos multiplicados por 10000 y dividir las partes entre 10000. No cambiar su comportamiento publicado. ProductTaxTotals ya usa line_subtotal como peso de cuatro decimales y distribuye centavos sobre las líneas facturables, por lo que cabeceras exclusivamente visuales no deben añadirse a esa colección. Verificarlo con ejemplos y pruebas antes de confirmar el esquema.

## Representación histórica propuesta

Mantener ProductTaxTotals sobre líneas facturables reales de componentes, cada una con su perfil/snapshot. Una cabecera inmutable de combo por pedido guarda raíz/configuración/contexto/nombre/cantidad/precio/asignación, y las líneas order_items enlazan esa cabecera por FK tenant/order/combo. La cabecera no se suma como otra línea financiera: subtotal del pedido sigue siendo suma de componentes facturables y productos sueltos. La UI agrupa visualmente y no cobra dos veces la cabecera.

Para no almacenar un unit_price aproximado cuya multiplicación no cuadre, una unidad repetida de componente puede representarse en posiciones facturables separadas, todas con quantity igual a cantidad de combos. Ejemplo: dos unidades de pollo por combo generan dos posiciones que pueden diferir en una unidad de 0.0001 por resto. Sus sumas por combo son exactas y el subtotal de cada posición sigue siendo unit_price × quantity. Limitar a 20 posiciones expandidas por combo y a 100 líneas facturables por pedido; rechazar exceso completo. La presentación puede reagrupar cantidades explicando la asignación, sin perder posiciones históricas.

El cálculo tributario existente distribuye después descuento global/centavos sobre importes de componentes. No necesita una tasa de raíz que reemplace perfiles ni un segundo cobro del precio padre. Verificar que la fórmula actual puede conservar su versión para estas líneas; si se cambia la fórmula monetaria, añadir versión y mantener interpretación anterior. Los snapshots de cabecera/componentes tienen su propia versión estructural.

## Comandos, carrito y consulta

Composición/configuración bajo UUID, Product.revision, moneda y auditoría atómica; conservar archivados paginados y Gate antes del replay. Identidad regular/combo estable, selección y referencias tenant-safe. Costos requieren catalog.costs también al consultar componentes; ningún snapshot operativo expone costos.

OrderLineRules/OrderPlan deben admitir explícitamente línea regular o combo. No permitir que un cliente envíe un combo como producto regular para eludir composición, disponibilidad o impuestos. El comando recibe IDs/cantidades/selecciones y expectativas, sin nombres/importes asignados como autoridad. El preview reutiliza el plan y devuelve composición/partes/perfiles actuales sin escritura.

Carrito separa configuraciones por clave canónica, mantiene notas/cantidad/selección y muestra componentes/preparaciones elegidos. Cambio de sucursal/canal recotiza raíz y referencias/componentes; diferencias visibles requieren revisión antes de aplicar. Envío incierto conserva cuerpo/UUID original. Si cambia disponibilidad/composición obligatoria, explicar la corrección necesaria y no reemplazar productos/opciones automáticamente.

OrderResource/SaleResource exponen cabeceras y enlaces históricos opcionales; recibo/pedido/checkout agrupan componentes desde snapshots, con compatibilidad de líneas antiguas sin cabecera. Impresión no consulta la composición vigente. Cobros/abonos/división/devoluciones siguen trabajando con la venta original; no introducir devolución por producto en este bloque.

## Aceptación antes de escribir/publicar D1

- Resolver y documentar esquema de cabecera/asignaciones, límites, estabilidad de kind y protección de APIs anteriores; desglosar TASKS D1/D2.
- Probar reparto a cuatro decimales, extremos/cero/restos, cantidades/repeticiones, suma de cabecera/componentes y combinaciones de perfiles incluidos/adicionales. Descuento/propina/cuentas/abonos/devolución mantienen centavos e historia.
- Probar referencias/FK/tenant/permisos/costos, configuración inválida o archivada, revisiones/replay/auditoría y expansión máxima, sin pedidos/ventas parciales.
- Reloj/contexto compartidos entre raíz/componentes, cierre tras preview, edición posterior de precios/composición/perfiles y replay histórico intacto.
- UI completa para crear/configurar/elegir preparaciones, revisar carrito, cobrar y consultar/impresión de composición; Chromium escritorio/móvil y regresión completa, SQLite/MariaDB, DDL/migración/build/formato y documentación antes de commit/push.
