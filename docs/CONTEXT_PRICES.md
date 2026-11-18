# Precios por sucursal y canal · 0.17

Los precios de contexto pertenecen a un producto o a una presentación concreta y usan la moneda de empresa. `sale_price` permanece como precio base; una regla expresa el importe base anterior a adicionales. No hay conversión, promoción ni horario implícito.

## Precedencia

Se elige la primera coincidencia activa de la entidad vendida:

1. Sucursal y canal exactos.
2. Sucursal exacta, todos los canales.
3. Todas las sucursales, canal exacto.
4. Precio base del producto o de su presentación.

Los pedidos admiten `takeaway` y `dine_in`; `all` solo se usa en reglas. Al menos sucursal o canal debe ser específico. Una regla del producto sin presentación no reemplaza precios de sus variantes. Se permite cero explícito; el cobro sigue exigiendo total positivo. Desactivar una regla recupera la siguiente coincidencia.

## Configuración y concurrencia

La ficha muestra reglas base y cada fila paginada de variantes abre sus propias reglas. Listas de diez por página y filtro de estado incluyen archivadas. Cuando hay variantes, las reglas base anteriores se conservan para consulta y archivo. Consultar requiere `catalog.view`; escribir, `catalog.manage`. El contexto operativo permite consultar nombres/IDs/estado de sucursales a lectores del catálogo sin entregar direcciones ni permiso de edición.

`GET products/{product}/context-prices` admite `variant_id` opcional (omitido = base), `status`, `page`, `per_page` hasta 50 y devuelve `product_revision`. `POST` recibe UUID, revisión de producto, moneda, variante/sucursal nullable, canal, importe decimal como cadena y estado. `PUT .../{price}` recibe UUID, revisión de producto y regla, moneda, importe y estado; prohíbe cambiar variante/sucursal/canal. Para otro contexto, archivar la regla y crear otra.

SaveContextPrice comprueba Policy antes del replay, usa IdempotentOperation, bloquea empresa/producto, valida revisiones/moneda y audita en la misma transacción. Guardar incrementa la revisión del producto y de la regla. Una regla archivada mantiene su identidad única y se reactiva editándola. La UI conserva UUID y cuerpo exactos ante respuesta incierta mientras el formulario permanece abierto.

La migración 000017 crea `product_context_prices`, DECIMAL(19,4), FK tenant/producto/presentación y tenant/sucursal. Scopes STORED generados con COALESCE(id,0) permiten unicidad real incluso con referencias null en SQLite y MariaDB. Los scopes no son entradas del cliente. El descenso se rechaza porque perdería historia.

## Menú y revisión del carrito

GET productos/presentaciones acepta `branch_id` y `channel` juntos; valida sucursal propia activa. Devuelve `price_context` separado del precio base. Sin contexto conserva el contrato previo; un producto con variantes necesita elegir presentación y no expone un precio contextual de venta único. CatalogPriceResolver carga candidatas por lote y comparte precedencia con el registro del pedido.

`POST orders/preview` recibe sucursal, canal, moneda y líneas con IDs/cantidades/observaciones/selecciones. Requiere `orders.manage` y `catalog.view`, no acepta UUID, revisiones/precios esperados ni etiquetas como autoridad. Bajo bloqueo de empresa, OrderPlan comparte con CreateOrder la validación de disponibilidad, presentaciones, impuestos, opciones y límites monetarios. El preview no crea pedidos, eventos, auditorías de comando ni registros financieros. Devuelve precio final, base contextual, selección y snapshots actuales, nombres y revisiones.

Cambiar sucursal/canal con carrito consulta el preview manteniendo el contexto anterior hasta resolverlo. Durante consulta/revisión se bloquean cambios en líneas y envío. Si importes, nombres, opciones elegidas y perfil tributario permanecen iguales, se aplican las revisiones y el nuevo contexto. Si cambian, un diálogo muestra los valores anteriores/actuales y exige aplicar o conservar el contexto anterior. Cantidades y observaciones se conservan. Una opción indisponible exige corregir la línea; no se reemplaza por otra.

El conflicto de registro permite revisar precios conservando el pedido. La aceptación actualiza las expectativas; registrar vuelve a comprobarlas estrictamente. Un preview no garantiza que la configuración siga igual al enviar. Ante respuesta incierta del registro, no se cambia contexto ni se recotiza: se reintenta el UUID/cuerpo original. Los serializadores de carrito envían únicamente los campos permitidos, sin snapshots ni etiquetas como autoridad. Este preview es distinto de la cotización financiera `orders/{order}/quote`.

## Historia

`order_items.price_snapshot` nullable conserva fuente product/variant/rule, ID/revisión de regla cuando corresponde, importe base, sucursal/nombre y canal elegidos y alcance de la regla. El precio final suma los adicionales y multiplica por cantidad con BCMath; la UI usa BigInt para sus importes. `base_unit_price`, modificadores e impuestos mantienen sus snapshots anteriores.

Pedidos, cobro y recibos muestran el origen histórico. Cobrar, abonar, dividir o devolver usa importes ya guardados y no consulta reglas actuales para recotizarlos. Un UUID registrado devuelve el pedido original aunque después se archiven reglas u opciones. Las líneas anteriores a la migración mantienen snapshot null; no se inventa su procedencia. Horarios corresponden al siguiente incremento C2.

## Verificación

Backend C1: 208 pruebas y 2286 aserciones correctas en SQLite y MariaDB 10.4.32, incluida precedencia/fallback, variantes, identidad/UUID/revisiones, unicidad null, aislamiento/permisos, auditoría atómica, preview sin escrituras de negocio y snapshots con impuestos/abonos/devolución. Esquemas SQL conservados según PROJECT_STATE. Suite completa de 20 Playwright aprobada en 16.9 minutos, incluido configurar/editar precios, conflicto 409, revisión de carrito con dos sucursales/canales, preparación conservada, reintento exacto, snapshot/cobro/recibo móvil. Build/formato/doctor/DDL correctos y capturas revisadas; detalle en PROGRESS/HANDOFF.
