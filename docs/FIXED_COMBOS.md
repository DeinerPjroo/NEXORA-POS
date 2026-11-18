# Combos de composición fija · 0.19

Este contrato conserva D1. Desde0.20, COMBO_CHOICES.md extiende componentes con grupo nullable y selección de alternativas; raíces sin grupos mantienen este contrato y snapshotv1. El padre2.2-D se completó al verificar D2.

Un combo es un Product de tipo estable `combo`, elegido al crear. Los anteriores conservan `regular`. Comparte categoría/fotografía, precio base, reglas por sucursal/canal y horarios. Sus componentes son productos individuales con presentación fija opcional y preparación elegida por unidad. No tiene variantes, adicionales ni perfil tributario propios: esos datos pertenecen a sus componentes. No hay combos anidados, recetas ni movimientos de inventario.

## Configurar

Crear producto → Tipo «Combo de composición fija» → abrir ficha → Composición fija del combo. Elegir explícitamente reparto de base y agregar productos individuales/presentaciones. Cada registro contiene entre 1 y 20 unidades y orden; suma activa máxima 20. Las unidades se expanden a posiciones distintas para permitir preparaciones diferentes y conservar el reparto exacto. Los registros archivados permanecen paginados y no se borran.

Producto/presentación de un registro se conserva al editar; para otra identidad, archivar y crear otro. Se pueden configurar componentes temporalmente no disponibles, pero no tomar pedidos con ellos. Si un producto empieza a requerir presentación o la elegida se archiva, corregir la configuración: no se selecciona otra automáticamente. El tipo regular/combo no se cambia después de crear, evitando anidación por una actualización posterior.

Requiere catalog.view para consultar y catalog.manage para escribir. Catalog.costs sigue protegiendo costos incluso en los productos/presentaciones de la configuración. SaveCombo usa Policy antes de replay, IdempotentOperation, bloqueo Tenant/producto, revisión de raíz/registro y moneda, y auditoría transaccional. Crear un componente también exige la revisión del producto elegido. Cada cambio incrementa Product.revision; editar registro incrementa su revisión. Formularios conservan revisiones originales y UUID/cuerpo exactos ante respuesta incierta.

## Precio y perfiles tributarios

La raíz aporta la base contextual del combo. Se elige reparto `equal` (igual por unidad de componente) o `proportional` (pesos según bases contextuales de componentes sin adicionales). No hay política automática predeterminada. Los adicionales de cada preparación se suman únicamente a su parte.

CentAllocation distribuye enteros en escala 10000, mayores restos y orden estable de componentes/índice de unidad. Las partes suman la base exactamente a cuatro decimales. Ejemplo: base 10.0001, pesos 2/1 → partes 6.6667/3.3334; dos combos generan subtotales 13.3334/6.6668 y total 20.0002. El ajuste global a dos decimales sigue al cobrar. Reparto proporcional de base positiva exige algún peso positivo; base cero admite partes cero. No se cambia silenciosamente a reparto igual.

Por unidad de combo: precio final = base contextual de raíz + adicionales de todas sus unidades. Cada posición facturable almacena su parte base + adicionales, multiplicada por cantidad de combos. Unidad repetida en posiciones separadas evita guardar un unit_price aproximado que no cuadre con cantidad. Se admiten hasta 100 posiciones facturables por pedido expandido; la comprobación ocurre antes de cargar el catálogo completo y de escribir filas.

Cada parte conserva el perfil tributario del producto individual. ProductTaxTotals versión 3 recibe solo posiciones facturables y conserva su fórmula de centavos/descuento/impuestos incluidos o adicionales. La cabecera no se añade como otra línea financiera. Modos globales siguen usando el subtotal total anterior. La política de reparto elegida por la empresa no asigna tasas legales ni es un descuento financiero implícito. Previsualizar partes/perfiles al registrar.

## Disponibilidad y pedido

CatalogEligibility combina horario propio, composición configurada y disponibilidad de componentes/presentaciones/categorías/perfiles. El menú muestra motivos de bloqueo. La consulta es un estado al consultar; OrderCatalog vuelve a validar bajo Tenant lock con un instante común, junto con precios y revisiones. Productos/variantes/reglas se cargan por lote, sin cargar todo el historial de composiciones archivadas.

OrderPlan separa productos individuales y combos. Un combo no puede enviarse como producto individual. OrderComboPlan exige todas las posiciones actuales y únicas, resuelve referencias/selecciones, reparte la base y compara el precio final esperado. Preview usa el mismo plan sin escribir negocio. Cierre, revisión o composición inválidos rechazan el pedido entero.

Configurador: elegir preparación para cada unidad que tiene grupos, agregar observaciones, revisar importes y perfiles calculados y agregar combo revisado al carrito. Las claves incluyen identidad de posiciones, opciones canónicas y observaciones de componente para separar preparaciones distintas. La cantidad/observación general corresponde a la línea completa del combo. Cambiar sucursal/canal recotiza todo y revisa también partes/perfiles/opciones aunque el total coincida. Conserva cantidades/notas; una composición incompatible requiere corregirla explícitamente. Envío incierto bloquea cambios y conserva UUID/cuerpo original.

## API de configuración

- POST products admite `kind=regular|combo` opcional, predeterminado regular; PUT prohíbe kind. Asignar perfil a raíz combo o crearle variante/grupo de modificadores se rechaza también en servidor.
- GET products admite `kind` para el selector paginado de componentes.
- GET `products/{product}/combo-components`: status/page/per_page (máximo 50), registros con producto/presentación filtrados por permisos y metadatos product_revision/allocation_mode/combo_context.
- POST a esa colección: UUID, product_revision, currency, component_product_id/component_product_revision, component_variant_id nullable, units, position, is_active. FK/bindings propios de tenant/producto/presentación.
- PUT `.../combo-components/{comboComponent}`: UUID, product_revision, currency, revision de registro, units/position/is_active. No cambia identidad.
- PUT `products/{product}/combo-settings`: UUID, product_revision, currency, allocation_mode equal/proportional.
- GET `products/{product}/combo-configuration?branch_id=...&channel=...`: composición activa acotada, productos/presentaciones con referencias contextuales, revisión, modo y base contextual de raíz. Sucursal/canal obligatorios para configurar un pedido.

## DTO operativo

Una línea combo de orders/preview recibe `kind=combo`, product_id de raíz, quantity, notes y components. Cada posición recibe únicamente component_id, unit_index (desde 0), notes y modifiers con IDs. No envía producto/presentación elegibles ni importes asignados como autoridad: se derivan del registro de composición. El comando orders añade product_revision y expected_unit_price de raíz, y product_revision/expected_tax_revision de cada componente cuando corresponda. Array de campos permitidos estricto; las etiquetas, precios de partes y snapshots se excluyen del serializador.

Preview devuelve raíz con components detallados, importes asignados, perfiles, referencias y revisiones actuales. Las posiciones se ordenan por configuración, no por el orden enviado. No se permiten duplicados, omisiones ni unidades ajenas. Tipo individual y payload anterior siguen compatibles.

## Historia y datos

Migración 000019: products.kind/combo_allocation_mode; product_combo_components con FK tenant/raíz/componente/presentación; order_combos con cabecera inmutable, importes y snapshot estructural versión 1; order_items.order_combo_id/combo_position nullable y FK tenant/order/cabecera. Pedidos anteriores mantienen posiciones sueltas y no reciben cabeceras artificiales. Descenso rechazado para preservar historia.

Cabecera copia nombre/SKU/cantidad/precio/notas, política, revisión, base/contexto/horario y asignaciones con pesos/referencias/revisiones/posiciones. Solo order_items es facturable. Cada parte copia su nombre/SKU/variante/preparación/perfil/horario, base asignada, precio final y referencia contextual marcada usage=combo_reference. Referencia no se presenta como precio facturado; se muestra separada de la parte asignada.

Pedido/checkout/recibo agrupan desde cabeceras y posiciones históricas, mostrando la cabecera una vez. Los componentes agrupados no se repiten como productos sueltos. Impuestos por producto desglosan las posiciones facturables. Replay de pedido, cobro/abono/división/devolución usan historia aun tras cambiar/archivar composición, opciones, reglas, horarios o perfiles. Cabeceras son append-only, y auditoría/idempotencia/pedido/cabecera/posiciones/evento confirman o revierten juntos.

## Estado de verificación

Suites completas finales: 232 pruebas/2652 aserciones en SQLite y MariaDB, incluida seguridad/tenant/FK/costos/revisiones/UUID/rollback/integridad financiera; esquema nexora_test_89138c797a2eab69 conservado. Regresión completa de 22 Playwright aprobada en 20.7 minutos; recorrido dedicado inicial 1.7 minutos. La UI verifica crear/configurar/preparar unidades, revisar contexto conservando notas/cantidad y snapshot/replay/cobro tras archivo de componentes. Build/formato/doctor/DDL y capturas escritorio/móvil correctos; resultados en PROGRESS/HANDOFF. D2 se verificó después como 0.20 (COMBO_CHOICES.md), completando el padre 2.2-D.
