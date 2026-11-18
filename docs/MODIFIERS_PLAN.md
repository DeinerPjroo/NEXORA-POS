# Modificadores · criterios del incremento 2.2-B

Diseño de referencia del incremento implementado en 0.16. El contrato vigente y sus límites están en [MODIFIERS.md](MODIFIERS.md). Referencias: REQUIREMENTS 6.3/6.6, CATALOG_ADVANCED_PLAN, Product/Variant/CreateOrder y fórmulas versionadas de ventas.

## Alcance funcional

Grupos propios de cada producto, con nombre, tipo adicional/exclusión, selección mínima/máxima, estado y orden. Opciones con nombre, importe adicional no negativo, estado y orden. Las exclusiones tienen importe cero y expresan preparación (por ejemplo, «Sin cebolla»), sin descuentos negativos ni consumo de inventario simulado. Tamaños/presentaciones siguen en variantes; los grupos se aplican a todas las variantes del producto en este incremento.

Selección de cada opción como máximo una vez por unidad de producto. Una pizza con extra queso y otra sin extra son líneas diferentes; dos con igual variante y selección se pueden agrupar por cantidad. No incluir cantidades independientes por opción, grupos compartidos entre productos ni recetas/inventario antes de 3.2/3.3. Mostrar límites explícitos para una primera configuración acotada (propuesta: 8 grupos por producto y 20 opciones por grupo).

No seleccionar automáticamente opciones ni inventar un precio de adicional. La UI solicita las obligatorias y muestra importe adicional por opción y precio final por unidad. Excluidas/desactivadas no se ofrecen para pedidos nuevos; la historia conserva etiquetas/precios elegidos.

## Datos e integridad

- product_modifier_groups y product_modifier_options con tenant/product/group y FKs compuestas. Nombre único por producto para grupo y por grupo para opción; tipo estable tras crear. Sin borrado: archivo y revisión de configuración.
- Toda mutación de grupo/opción bloquea empresa/producto, exige product_revision original, incrementa Product.revision y audita en la misma transacción, como variantes/fotografía. Así el carrito detecta cambios de configuración incluso si el precio base no cambió.
- catalog.view permite leer; catalog.manage administra. Bindings anidados y FK evitan transferir opciones entre grupos/productos/empresas. Costos de receta no se inventan ni se exponen como precio de opción.
- Crear grupo con sus opciones iniciales debe ser atómico para no publicar un grupo obligatorio imposible. Rechazar min > max, límites inválidos, nombres duplicados, exclusiones con precio positivo y archivar opciones si deja un grupo activo por debajo de su mínimo. Se puede desactivar el grupo antes de reorganizarlo.
- Los comandos nuevos deben admitir UUID/reintento exacto cuando creen filas; mantener revisión para toda edición/archivo y revalidar unicidad dentro del bloqueo. Resolver API/modal de edición con el patrón de revisiones existente, sin introducir otra tecnología ni un generador de formularios.

## Pedido, dinero e historia

CreateOrder valida selección completa sobre grupos/opciones actuales y activos del producto; rechaza grupos duplicados, opciones repetidas/ajenas o cantidad fuera de mínimo/máximo. Verifica revisión de producto antes de elegir precio, y usa solo precios del servidor. Pedido anterior sin grupos sigue compatible. Producto con grupo obligatorio exige selección explícita.

Precio final unitario = precio base de producto/variante + suma de adicionales seleccionados por unidad. Multiplicar por cantidad con BCMath; revisar límites DECIMAL para precio y subtotal. expected_unit_price del carrito debe representar ese precio final, conservando la comprobación contra servidor. No aceptar importes/nombres de modificadores enviados como autoridad.

order_items guardará base_unit_price nullable y modifiers_snapshot JSON nullable: nuevos pedidos copian base/selecciones (grupo/opción/nombre/tipo/precio/revisiones), anteriores permanecen null sin adivinar composición. unit_price/line_subtotal siguen representando precio final y cantidad, por lo que SaleTotals y ProductTaxTotals usan el subtotal de línea completo. Los adicionales heredan el perfil tributario de su producto en esta versión; no asignarles tasas implícitas diferentes.

Resource/detalle de pedido, cotización y recibo/impresión deben mostrar las selecciones históricas. Reetiquetar, cambiar precio o archivar no reinterpreta pedidos/ventas previos. No alterar total después del primer pago. Abonos, partes, descuentos, impuestos y devoluciones deben continuar operando sobre los mismos importes confirmados; una exclusión no crea un reembolso por sí sola.

## UI y reutilización

Panel de modificadores en ficha de producto con grupos/opciones y archivo, revisiones originales capturadas por formulario. Toma de pedido abre configuración después de elegir variante cuando corresponda; valida mínimos/máximos y muestra total unitario antes de agregar. Reutilizar ese configurador en terminal POS 2.3.

La clave de línea del carrito incluye variante y selección canónica de grupos/opciones, para no fusionar preparaciones diferentes. Precio de borrador con BigInt y cadenas; servidor confirma con BCMath. Consultar product_revision junto a configuración y pedir actualizar si difiere del producto abierto, sin reemplazar selecciones silenciosamente. UUID/payload de pedido permanecen congelados ante respuesta incierta.

Mantener accesibilidad de diálogos/selectores y presentación móvil. Si el build supera realmente el aviso de chunk de 500 kB, cargar historial de pagos mediante React.lazy/Suspense o separar el configurador, verificando rutas con la suite; no agregar dependencias solo para dividir código.

## Verificación antes de publicar

- Tenant/FK/bindings/permisos; revisiones, nombres y límites; archivo sin borrado e imposible selección requerida; rollback de auditoría y reintento de creación sin duplicar opciones.
- Pedido con variante, adicionales a cuatro decimales, exclusión cero, cantidad y límite DECIMAL; grupos/opciones falsificados/repetidos/archivados y revisión/precio obsoletos. Rechazar todo el pedido si una línea falla.
- Snapshot después de renombrar/archivar/cambiar precios; compatibilidad sin modificadores y replay previo. Factores incluidos/adicionales, descuento y centavos, abono/división/devolución sin alterar fórmula histórica.
- Chromium con alta/configuración real, selección obligatoria/opcional, líneas diferenciadas, respuesta perdida de pedido y recibo/snapshot/móvil. Backend SQLite/MariaDB, formato/build/DDL/migración y regresión correspondiente antes de commit/push.
