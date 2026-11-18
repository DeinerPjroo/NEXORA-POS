# Adicionales y exclusiones (0.16)

La ficha de producto permite crear grupos de opciones para todas sus presentaciones. Un adicional suma su precio por unidad; una exclusión como «Sin cebolla» conserva una instrucción de preparación sin recargo ni descuento. Las opciones elegidas quedan copiadas en el pedido y se muestran en carrito, detalle, cobro, recibo e impresión. No ejecutan movimientos de inventario ni reemplazan recetas.

## Configuración y permisos

- Grupos propios de cada producto con nombre, tipo addon/exclusion estable, mínimo/máximo, estado, posición y revisión. Nombres únicos por producto; opciones con nombre único por grupo, precio adicional DECIMAL(19,4), estado y posición.
- Máximo **8 grupos activos por producto** y **20 opciones activas por grupo**. Los archivados se conservan y las listas administrativas tienen paginación real; no consumen el límite activo. La consulta para tomar pedidos entrega solo configuración activa acotada.
- Se crea un grupo con 1–20 opciones en una transacción. Mínimo entre 0 y 20, máximo entre 1 y 20 y mínimo ≤ máximo. Un grupo activo debe tener suficientes opciones activas para cumplir su mínimo; antes de reorganizarlo puede archivarse. No se permite archivar la última opción necesaria sin ajustar/desactivar el grupo.
- Tipo exclusion exige precio cero en todas sus opciones. Adicionales admiten importe no negativo, cadena decimal de hasta 15 enteros y cuatro decimales, sin separadores de miles. Los precios son de venta, no costos de materia prima.
- catalog.view permite consultar; catalog.manage administra mediante Policy de producto. No hay nuevas concesiones de permisos. Binding anidado y FK tenant/product/group impiden transferencias o referencias internas ajenas.

En ficha → **Adicionales y exclusiones**, «Nuevo grupo» incluye opciones y límites; cada grupo permite editar, consultar opciones o agregar otra. Archivar es desmarcar el estado activo, sin borrar. Se ordena por posición y después ID. No hay selección automática de ingredientes ni grupos compartidos entre productos en esta versión.

## Revisiones, auditoría y reintento

Toda creación/edición de grupo u opción exige UUID, product_revision original y moneda. IdempotentOperation bloquea empresa; ModifierProductContext bloquea producto y comprueba contexto monetario/revisión. La Policy se autoriza antes del replay. Group.revision avanza al editar grupo o cualquiera de sus opciones; Product.revision avanza en toda mutación para invalidar carritos anteriores. Se comprueba capacidad/unicidad dentro de la transacción y se audita antes de confirmar el UUID.

Mismo UUID/usuario/acción/contenido devuelve el recurso ya creado, sin volver a crear opciones ni avanzar revisiones. Cambiar contenido con esa clave produce 409. El recurso de configuración puede haber avanzado de estado desde la operación original; el replay no lo restaura. Un fallo de auditoría revierte grupo/opciones/revisiones/UUID.

La UI captura la revisión de producto al abrir formulario; no la sustituye por refetch de fondo. Ante respuesta incierta, deshabilita contenido y reintenta exactamente mientras permanezca abierto. Un conflicto requiere cerrar y actualizar la ficha; no es una cola offline ni una garantía de recuperación tras recargar.

## Selección, precio y snapshots

Tomar pedido primero elige presentación cuando existe y luego muestra grupos activos, mínimos/máximos y precios por opción. Cada opción se elige como máximo una vez por unidad. Las obligatorias requieren decisión explícita. Opciones opcionales pueden quedar vacías. El carrito agrupa solo igual producto/presentación/selección canónica; preparaciones distintas conservan líneas separadas.

Precio final unitario = precio base del producto/presentación + suma de adicionales elegidos. Subtotal de línea = precio final unitario × cantidad. UI usa BigInt y servidor BCMath, ambos sin float; se comprueban límites DECIMAL. expected_unit_price representa el precio final confirmado y se contrasta contra servidor. Las etiquetas visuales del carrito no se envían como autoridad.

CreateOrder valida por línea grupos/opciones activos del mismo producto, ausencia de repetidos y límites. No aplica distinct global entre líneas, porque dos pizzas pueden usar el mismo grupo. Una selección ajena/archivada o revisión/precio obsoleto requiere revisar catálogo; un fallo de cualquier línea deja el pedido completo sin crear.

order_items conserva **base_unit_price** y **modifiers_snapshot**: grupo/nombre/tipo/revisión y opciones/nombres/precios históricos. unit_price y line_subtotal ya contienen adicionales. Filas anteriores a esta migración conservan null; pedidos nuevos sin opciones guardan snapshot vacío. Cambiar precio, renombrar o archivar catálogo no reinterpreta pedidos o recibos. Replay de un pedido original tampoco vuelve a validar/cotizar el catálogo actual.

Los adicionales **heredan el perfil tributario del producto**. ProductTaxTotals usa el subtotal de línea completo y conserva sus fórmulas/versiones; no se asignan tasas diferentes ni legales a ingredientes. Descuentos, propinas, cuentas, abonos y devoluciones continúan sobre importes confirmados. La exclusión de un ingrediente no genera un reembolso por sí sola ni cambia totales después del primer pago.

## API y almacenamiento

- GET products/{product}/modifier-groups: listado administrativo paginado, status y per_page, con conteos de opciones y product_revision.
- POST/PUT products/{product}/modifier-groups[/{modifierGroup}]: idempotency_key, product_revision, currency, nombre, min_select/max_select, is_active y position. Creación añade kind y options[] con name/extra_price/is_active/position; edición no permite cambiar tipo ni sustituir opciones en bloque.
- GET/POST products/{product}/modifier-groups/{modifierGroup}/options y PUT .../options/{option}: lista paginada o comando con UUID, revisión de producto, moneda y datos de opción. Parámetro {option} utiliza la relación Group.options para binding anidado.
- GET products/{product}/modifier-configuration: grupos/opciones activos ordenados y product_revision, consulta acotada para selección. ProductResource añade modifier_groups_count activo.
- POST orders admite items[].modifiers = [{group_id, option_ids: [id, ...]}]. option_ids debe estar presente y puede ser [] en un grupo opcional. Precios/nombres ajenos a ese esquema se rechazan; el servidor copia su catálogo.

Migración 000016 crea product_modifier_groups/options con claves compuestas, nombres únicos e índices de lectura y añade columnas nullable a order_items. No reescribe líneas ni importes anteriores; rollback automático rechaza quitar snapshots. Comandos de configuración usan modelos editables, mientras las líneas de pedido siguen append-only.

## Verificación y límites

197 pruebas / 2102 aserciones correctas en SQLite y MariaDB, con nexora_test_b3583ca6e3f978a9 conservada. Quince casos nuevos cubren límites/archivo/páginas, bindings/tenant/permisos, revisión/replay/rollback, variantes/cantidad/precisión, selección inválida, snapshots e impuesto por producto→descuento→cuentas→mixtos→devoluciones. Migración 000016 aplicada, doctor/DDL/Pint/Composer correctos.

Suite completa 19 Playwright aprobada (14.7 min). El recorrido nuevo comprueba configuración UI con pérdida de respuesta, selección requerida/exclusión, separación y agrupación de preparaciones, pedido con respuesta perdida, cambio posterior de precio/nombre/archivo y replay exacto, cobro/recibo/móvil con snapshot original. Recorrido ampliado con edición/alta de opciones desde UI también aprobado (1.0 min). Capturas finales revisadas; build/TypeScript/Prettier correctos. Historial de pagos y panel de modificadores cargan por separado tras aparecer aviso real de chunk; el principal quedó en 492.97 kB / gzip 139.69 kB.

No hay cantidades independientes de cada adicional, grupos reutilizables entre productos, impuestos propios por opción, ingredientes de inventario, consumo de recetas ni edición de líneas ya registradas. MODIFIERS_PLAN.md queda como diseño de referencia; tareas siguientes: precios por contexto y horarios antes de combos/promociones.
