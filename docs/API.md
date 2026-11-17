# API REST v1

Base `/api/v1`. Respuestas JSON con `Accept: application/json`. Los endpoints SPA usan cookies y requieren un Origin/Referer incluido en SANCTUM_STATEFUL_DOMAINS. El cliente primero hace `GET /sanctum/csrf-cookie` y, en escrituras, envía la cookie XSRF decodificada en `X-XSRF-TOKEN`, con credenciales incluidas. No se exponen tokens personales en esta fase.

## Identidad

| Método / ruta | Entrada | Resultado |
| --- | --- | --- |
| POST auth/register | company_name, business_type, branch_name, name, email, password, password_confirmation | 201; crea empresa completa y autentica al propietario |
| POST auth/login | email, password | 200; inicia sesión y renueva identificador |
| POST auth/forgot-password | email | 200; mensaje genérico, envía notificación mediante transporte configurado |
| POST auth/reset-password | email, token, password, password_confirmation | 200; token de un uso, cambia hash y revoca sesiones |
| GET auth/me | Sesión | Usuario, empresa, rol, permisos y tema publicado |
| POST auth/logout | Sesión | 204; invalida sesión |
| GET auth/sessions | Sesión | Dispositivos de la cuenta, IP, actividad y marca current; sin IDs de sesión expuestos |
| DELETE auth/sessions | password actual | 204; cierra las demás sesiones de la cuenta |

Rate limiting: login 5/min por correo+IP y 20/min por IP; registro 10/h por IP; recuperación, reset y revocación 3/min por IP. No se guarda ni devuelve la contraseña. Identidad central con correo global único; empresa/rol no son seleccionables desde el cliente.

## Espacio de trabajo

Todos requieren usuario activo, empresa activa y permisos de servidor.

| Método / ruta | Permiso | Datos |
| --- | --- | --- |
| GET workspace/overview | dashboard.view | Conteos reales de sucursales, equipo, roles, revisión visual. Actividad solo con audit.view |
| GET workspace/team | team.view | Usuarios solo de la empresa actual y su rol |
| GET workspace/company | settings.view | Preferencias de la empresa |
| PUT workspace/company | settings.manage | name, business_type, currency (COP/USD/EUR), timezone IANA, locale es-CO |
| GET workspace/theme | studio.view | settings, últimas 20 versiones y defaults |
| PUT workspace/theme | studio.manage | revision y theme validado; publica una versión y audita |
| GET branches | branches.view | Sucursales de la empresa |
| POST branches | branches.manage | name, code, address/city/phone opcionales, is_active opcional |
| PUT branches/{branch} | branches.manage + Policy | Mismos datos, sin tenant_id; recurso de empresa ajena responde 404 |
| GET roles | roles.view | Roles de empresa y catálogo global de permisos implementados |
| POST roles | roles.manage | name, permissions (arreglo de claves) |
| PUT roles/{role} | roles.manage + Policy | Actualiza rol y permisos; propietario y rol propio protegidos |

Ejemplo de publicación:

```json
{
  "revision": 1,
  "theme": {
    "primary": "#31D9FC",
    "secondary": "#8271FF",
    "mode": "light",
    "radius": "rounded"
  }
}
```

Respuesta contiene `revision: 2` y el tema persistido. Campos adicionales en theme se rechazan. Una revisión antigua devuelve **409**; recargar antes de publicar. Restauración: seleccionar un snapshot del historial y publicarlo con la revisión actual para crear una versión nueva.

## Catálogo disponible desde 0.2.0

| Método / ruta | Permiso | Contrato |
| --- | --- | --- |
| GET categories | catalog.view | data + meta de paginación; incluye products_count |
| POST categories | catalog.manage | name, color hexadecimal, is_active; description opcional; 201 con objeto |
| PUT categories/{category} | catalog.manage + Policy | Mismos campos y revision obligatoria; 409 si cambió |
| GET products | catalog.view | data + meta; productos con categoría y sellable calculado |
| GET products/{product} | catalog.view + Policy | Objeto bajo data; un ID de otra empresa responde 404 |
| POST products | catalog.manage | 201 con objeto bajo data |
| PUT products/{product} | catalog.manage + Policy | Mismos datos y revision obligatoria; devuelve nueva revisión |

Producto: name, sku, category_id, sale_price como cadena, currency (moneda actual de la empresa), is_active e is_available obligatorios. description y barcode opcionales. cost_price solo se acepta y entrega con **catalog.costs**; al omitirse se conserva al editar o toma cero al crear. No se calcula el costo desde recetas todavía.

```json
{
  "name": "Pizza Margarita",
  "sku": "PIZZA-001",
  "category_id": 1,
  "sale_price": "28900.1250",
  "cost_price": "8200.0025",
  "currency": "COP",
  "is_active": true,
  "is_available": true
}
```

Importes: hasta 15 dígitos enteros y 4 decimales, no negativos, sin notación exponencial ni separadores de miles. Se rechazan números JSON para dinero: enviar cadenas con punto decimal. Se devuelven cuatro decimales y se guardan en DECIMAL(19,4). SKU se normaliza a mayúsculas; SKU/barcode son únicos por empresa. La categoría debe pertenecer a la misma empresa, comprobado en validación y FK compuesta.

Filtros compartidos: search (máximo 100 caracteres, comodines tratados literalmente), status=active|inactive, page y per_page (predeterminado 20, máximo 50). Productos admite category_id y availability=available|unavailable. Este último filtra el indicador manual is_available (no agotado); **sellable** requiere además producto y categoría activos. Orden por nombre e ID. La interfaz usa 12 registros por página y selector de categorías con páginas de 10.

No hay DELETE: se archiva con is_active=false. Desactivar una categoría conserva los productos y vuelve sellable=false sin cambiar otros indicadores. Cada edición exige la revisión actual. Registros obsoletos o contexto monetario desactualizado devuelven 409. Después del primer producto no se permite cambiar moneda empresarial para evitar reinterpretar precios; no se simulan conversiones.

Empresas existentes reciben permisos nuevos automáticamente solo en su rol propietario; otros roles se actualizan desde Roles y permisos. Nuevas empresas mantienen la política inicial de propietario/administrador. Cada escritura genera auditoría transaccional.

## Fotografías y variantes desde 0.3.0

| Método / ruta | Permiso | Entrada / respuesta |
| --- | --- | --- |
| GET products/{product}/image | catalog.view | Bytes de la fotografía; 404 si no existe o pertenece a otra empresa. Cache-Control privado y no-store, nosniff. |
| POST products/{product}/image | catalog.manage | Multipart: image y revision del producto. Devuelve producto actualizado bajo data. Máximo 20 cargas/min por usuario. |
| DELETE products/{product}/image | catalog.manage | JSON con revision. Retira la imagen y devuelve producto actualizado. |
| GET products/{product}/variants | catalog.view | data, meta y product_revision. Filtros search/status/availability/page/per_page (máximo 50). |
| POST products/{product}/variants | catalog.manage | Nombre, SKU, precio y disponibilidad propios. 201 bajo data. |
| PUT products/{product}/variants/{variant} | catalog.manage | Misma entrada de creación. La variante debe pertenecer al producto de la ruta; de lo contrario 404. |

Fotografías: formatos JPEG, PNG y WebP; hasta 2048 KB y de 32 a 2048 px en ambos lados. Se comprueba el contenido, no solo la extensión. El servidor decodifica y recodifica con GD para quitar metadatos/contenido adicional. SVG y GIF se rechazan. Un archivo se guarda con UUID en un disco privado; image_url es una ruta autenticada, nunca una ruta pública ni el nombre enviado por el usuario. El frontend usa FormData sin forzar Content-Type, conservando protección CSRF.

Cada variante requiere name (máximo 80), sku (máximo 40), sale_price como cadena decimal, currency, is_active, is_available y **product_revision**. barcode y cost_price son opcionales; costo solo con catalog.costs. Los importes tienen el mismo contrato decimal que el producto. SKU y barcode se comprueban entre ambas tablas bajo bloqueo de empresa; nombres únicos dentro del producto. Los inactivos conservan sus códigos.

Crear/editar variantes o cambiar/retirar imagen incrementa la revisión del producto. Esto evita que un formulario anterior sobrescriba cambios realizados desde otra pestaña. No se envía revision de variante: el control pertenece al producto. Las variantes se archivan con is_active=false; no hay DELETE ni traslado a otro producto.

La respuesta de producto ahora incluye image_url (nullable), variants_count y available_variants_count. sellable exige producto/categoría activos y disponibilidad manual; si existen variantes, además requiere al menos una activa y disponible. El precio base se presenta como referencia cuando hay variantes. Crear pedidos exige selección de variante disponible y usa su precio. Desde 0.5 hay venta en efectivo; medios de pago electrónicos siguen pendientes.

## Caja y pedidos desde 0.4.0

Todos los POST siguientes requieren **idempotency_key**, UUID nuevo por intención. Conservar exactamente clave y payload si se pierde la respuesta. Misma empresa/usuario/acción/contenido devuelve el recurso existente en su estado actual; un uso incompatible devuelve 409. Los permisos se vuelven a comprobar. No reenviar con otra clave un comando cuyo resultado es incierto. tenant_id está prohibido; el contexto procede de la sesión.

| Método / ruta | Permiso | Entrada / respuesta |
| --- | --- | --- |
| GET operations/context | Alguno de cash.view/manage/movements u orders.view/manage | branches (id, name, is_active) de la empresa y currency; no envuelto en data |
| GET cash/registers | cash.view | data + meta, cajas con current_session nullable; branch_id/page/per_page |
| POST cash/registers | cash.manage | branch_id, name (80), code (20, A-Z/0-9/_/-); caja bajo data, 201 |
| POST cash/registers/{cashRegister}/open | cash.manage | opening_amount como cadena no negativa y currency; sesión bajo data, 201 |
| GET cash/sessions | cash.view | data + meta; branch_id, status=open/closed, page/per_page |
| GET cash/sessions/{cashSession} | cash.view | Sesión bajo data con importes, revisión y fechas |
| GET cash/sessions/{cashSession}/movements | cash.view | data + meta, orden descendente; page/per_page |
| POST cash/sessions/{cashSession}/movements | cash.movements | revision, type=income/expense, amount positivo como cadena, reason (3–300); movimiento bajo data, 201 |
| POST cash/sessions/{cashSession}/close | cash.manage | revision, counted_amount no negativo como cadena, closing_note opcional (500); sesión cerrada bajo data |
| GET orders | orders.view | data + meta; branch_id, status, page/per_page |
| GET orders/{order} | orders.view | data incluye líneas históricas y eventos |
| POST orders | orders.manage + catalog.view | Pedido descrito abajo; 201 bajo data |
| POST orders/{order}/status | orders.manage u orders.cancel para cancelar | revision, status y reason obligatorio al cancelar (3–300); pedido actualizado bajo data |

Paginación: 20 por defecto, máximo 50. Los IDs enlazados a otra empresa responden 404 en rutas o se rechazan en validación. No hay DELETE ni edición de movimientos, cierres o líneas de pedido. Las sucursales nuevas y existentes reciben caja principal; solo puede abrirse una sesión por caja activa/sucursal activa. Un egreso no puede superar el esperado. Cerrar fija counted_amount, expected_amount y difference (conteo − esperado, admite negativo). La moneda empresarial ya no cambia si hay productos, sesiones de caja o pedidos.

Pedido mínimo (reemplaza IDs, UUID y revisión con valores actuales):

```json
{
  "idempotency_key": "9fc3ad57-6c33-4f2e-9557-21a63c7c646a",
  "branch_id": 1,
  "currency": "COP",
  "channel": "takeaway",
  "reference": "Recoge Ana",
  "customer_name": "Ana",
  "notes": "Empacar por separado",
  "items": [{
    "product_id": 1,
    "variant_id": null,
    "quantity": 2,
    "product_revision": 1,
    "expected_unit_price": "18500.1250",
    "notes": "Sin cebolla"
  }]
}
```

channel admite dine_in/takeaway, sin asignación a mesas todavía. reference máximo 80, customer_name 100 y notes general 1000. De 1 a 100 líneas, quantity entera 1–999 y notas por línea de hasta 300. Si el producto tiene variantes, variant_id es obligatorio y debe corresponder a una disponible de ese producto. Todos deben estar activos/disponibles, incluida categoría y sucursal. Precio/revisión obsoletos devuelven 409; el servidor calcula unit_price, line_subtotal y subtotal mediante BCMath, sin aceptar subtotal o status del cliente. Guarda nombres/SKU/precios como snapshots.

Estados: open → preparing → ready → delivered. Se permite cancelled desde open/preparing/ready con orders.cancel y motivo, siempre que no exista venta. Sin reversión ni cancelación de entregados. Los cambios requieren revisión actual y agregan un evento; nunca borran historia. Un pedido entregado no genera ingresos de caja, cobros, impuestos ni factura por sí solo. Las respuestas incluyen sale_id y sale_status nullable. Consultar [reglas operativas](OPERATIONS.md).

## Ventas en efectivo desde 0.5.0

| Método / ruta | Permiso | Contrato |
| --- | --- | --- |
| GET sales/settings | sales.view, sales.collect o sales.configure | data: configured, tax_mode, tax_name, tax_rate, revision, rounding=half_up y decimal_places=2 |
| PUT sales/settings | sales.configure | revision, confirmed=true, tax_mode=none/exclusive, tax_name (40), tax_rate cadena 0–100 con hasta 4 decimales; confirma configuración y aumenta revisión |
| GET sales/cash-context | sales.collect o sales.refund | branch_id obligatorio del tenant; data: sesiones abiertas y cajas activas con id, name, revision, currency |
| GET orders/{order}/quote | sales.collect; sales.discount si descuento positivo | discount_amount cadena obligatoria; data: cálculo, order_revision y settings_revision. Solo consulta, sin registrar cobros |
| POST orders/{order}/collect | sales.collect; sales.discount si corresponde | Comando de cobro descrito abajo; 201, venta bajo data con pago, líneas y refund nullable |
| GET sales | sales.view | data + meta; branch_id y status=paid/refunded opcionales, page/per_page (20, máximo 50) |
| GET sales/{sale} | sales.view | data: recibo interno con líneas históricas, pago y devolución nullable |
| POST sales/{sale}/refund | sales.refund | idempotency_key UUID, cash_session_id, cash_revision y reason (3–300); devolución total, 200 con venta actualizada |

La configuración nace configured=false: no se puede cotizar/cobrar hasta confirmar. none exige tasa cero y significa sin cálculo adicional automático; no asigna un régimen fiscal. exclusive aplica un solo porcentaje adicional sobre la base después del descuento, sin impuestos incluidos ni múltiples por producto. El cliente no puede cambiar next_receipt_number.

Cobro mínimo (usar revisiones actuales de cotización y caja):

```json
{
  "idempotency_key": "e6cbced5-2de6-439e-955e-bec347b6ec8b",
  "cash_session_id": 1,
  "cash_revision": 1,
  "order_revision": 1,
  "settings_revision": 2,
  "discount_amount": "10.12",
  "discount_reason": "Descuento autorizado",
  "expected_total": "389.52",
  "received_amount": "400.00"
}
```

Importes del comando como cadenas no negativas, máximo 15 enteros y 2 decimales, sin exponentes. discount_reason obligatorio si el descuento es positivo. total, tax_rate y tenant_id están prohibidos: el servidor calcula y verifica. La cotización redondea subtotal global a dos decimales, resta descuento y redondea el impuesto adicional, con BCMath y mitades hacia arriba. Total positivo, descuento ≤ subtotal y recibido ≥ total. Respuestas monetarias con cuatro decimales; rounding_adjustment firmado frente al subtotal de catálogo.

El pedido no puede estar cancelado ni tener venta previa; la caja debe estar abierta en su sucursal/moneda. Conflictos de revisión/configuración/caja/total devuelven 409. Una venta por pedido incluso usando otra clave UUID. Misma clave/contenido/usuario devuelve la venta actual sin repetir movimiento. Cobrar aumenta la revisión del pedido, sin cambiar preparación. La transacción incluye venta, pago, movimiento income por total neto, secuencia y auditoría; recibido y cambio se conservan en payments.

El recibo conserva business_name, branch_name/address, currency, catalog_subtotal, subtotal, rounding_adjustment, discount_amount/reason, taxable_base, tax_mode/name/rate, tax_amount, total y settings_revision. receipt_code V-000001 es numeración interna por tenant. El detalle incluye items de order_items inmutables, payment (received_amount/change_amount/amount/cash_session_id) y refund (amount/reason/cash_session_id/created_at) cuando existe. No es factura electrónica ni verificación de efectivo físico.

La devolución total exige caja abierta de la misma sucursal/moneda y efectivo esperado suficiente. Puede ser una sesión posterior. Se guarda un único egreso y sale_refund, status=refunded, sin modificar el pago o los importes históricos. Reintentos idempotentes no repiten la salida; otro UUID tras devolver responde 409. Un pedido vendido no se cancela ni se cobra de nuevo después de devolver. Pagos parciales, medios electrónicos, impuestos incluidos y devolución parcial están pendientes. Más reglas en [SALES.md](SALES.md).

## Métodos configurables desde 0.6.0

| Método / ruta | Permiso | Contrato |
| --- | --- | --- |
| GET payment-methods | sales.view, sales.collect o sales.configure | data + meta; status=active/inactive, page y per_page (20, máximo 50); efectivo principal primero |
| POST payment-methods | sales.configure | idempotency_key UUID, name (60), code (2–20, a-z/0-9/_/-), kind=cash/non_cash, is_active; 201 bajo data |
| PUT payment-methods/{paymentMethod} | sales.configure | name, is_active y revision; 409 si obsoleta. code, kind, is_system y tenant_id no se pueden establecer al editar |

Código normalizado a minúsculas; nombre/código únicos por empresa, sin borrado. Efectivo principal no se desactiva. Respuestas incluyen id/code/name/kind/is_active/is_system/revision y provenance=operator. Una creación repetida con la misma clave/contenido no duplica métodos; payload incompatible devuelve 409.

POST orders/{order}/collect admite payment_method_id y method_revision (obligatoria con ID), payment_reference (120). Si se omite ID conserva el cobro en efectivo anterior. El método debe ser propio/activo y tener revisión vigente. non_cash exige referencia no vacía y received_amount igual al total exacto, sin cambio: conserva cash_session_id como sesión operativa y aumenta su revisión, pero no crea CashMovement ni cambia expected_amount. cash mantiene ingreso neto y cambio anteriores.

El pago conserva payment_method_id, method_name, method_kind, method_revision, provenance=operator y reference. method es el código histórico. Nunca implica confirmación de proveedor. Se rechazan provenance/provider_confirmed enviados por cliente. El campo cash_movement_id es nullable para no efectivo.

POST sales/{sale}/refund usa el método histórico aunque esté desactivado/renombrado. Si no efectivo requiere refund_reference (120), conserva sesión/revisión y registra devolución total sin salida de efectivo ni requisito de saldo. En efectivo conserva salida/fondos anteriores. La respuesta refund incluye reference. No se permite seleccionar otro método para transformar una devolución en salida de caja. Abonos/mixtos y conciliación siguen pendientes.

## Abonos y lotes mixtos desde 0.7.0

POST orders/{order}/collect admite **payment_amount** opcional (cadena positiva de dos decimales), menor o igual al total. Al omitirlo conserva el cobro completo anterior. received_amount cubre este pago, no todo el saldo; no efectivo exige recibido igual al pago y referencia. Se crea una sola venta con estado partially_paid si queda saldo, paid si queda saldada. El total original y los impuestos/descuentos no se reescriben.

**POST sales/{sale}/payments**, con sales.collect, agrega un lote atómico de 1–20 líneas. Ejemplo:

```json
{
  "idempotency_key": "3471f28b-6971-418c-8305-e6dc432b4fca",
  "sale_revision": 2,
  "expected_balance": "60.01",
  "cash_session_id": 1,
  "cash_revision": 2,
  "payments": [
    {"payment_method_id": 1, "method_revision": 1, "amount": "10.00", "received_amount": "20.00"},
    {"payment_method_id": 2, "method_revision": 1, "amount": "50.01", "received_amount": "50.01", "reference": "REF-001"}
  ]
}
```

payments debe ser una lista JSON y solo admite las claves mostradas por línea. Importes positivos/cadenas con dos decimales, suma ≤ saldo; no efectivo exacto y con referencia. Revisión de venta/saldo/caja obsoletos devuelven 409; sobrepago/importe inválido 422. Un error de línea o auditoría revierte el lote completo. La misma clave/payload devuelve la venta actual sin duplicar pagos; una venta saldada/devuelta no admite otros lotes nuevos. Caja de igual sucursal/moneda, solo cash crea movimiento de efectivo.

GET sales acepta status=partially_paid además de paid/refunded. Respuestas de venta incluyen revision, paid_amount (suma histórica aplicada), balance_due, refunded_amount y cancelled_balance, todos como cadenas de cuatro decimales. payments y refunds son los historiales completos ordenados por ID; payment y refund conservan el primer objeto como alias compatible para recibos antiguos de un pago. Cada refund incluye payment_id.

POST sales/{sale}/refund devuelve **todos los pagos aplicados** y cancela el saldo nunca cobrado. sale_revision es obligatoria si hay varios pagos o la venta está abonada; la UI la envía siempre. Para cada pago no efectivo, enviar refund_references como lista [{payment_id, reference}], todos pertenecientes a esa venta. refund_reference singular se mantiene para exactamente un pago no efectivo. Cada compensación queda ligada por FK al pago original; la transacción es atómica e idempotente. Total original inmutable; refunded_amount puede ser menor que total si se cerró una venta abonada, y cancelled_balance deja explícita la diferencia no cobrada. No son devoluciones de partes elegidas de un pago/producto: eso sigue pendiente. Reglas en [PAYMENTS.md](PAYMENTS.md).

## Referencia de errores

| Código | Significado |
| --- | --- |
| 401 | Falta sesión válida |
| 403 | Permiso insuficiente, rol protegido, cuenta/empresa suspendida |
| 404 | Recurso inexistente o de otra empresa |
| 409 | Revisión/precio/moneda obsoletos, transición incompatible o clave idempotente reutilizada con otro contenido |
| 419 | Protección CSRF no satisfecha |
| 422 | Validación; errors contiene mensajes por campo |
| 429 | Límite de intentos |
| 500 | Error interno; el frontend muestra mensaje genérico |

Sucursales, roles y equipo todavía se listan sin paginación por su tamaño inicial. Productos/categorías ya usan paginación y filtros de servidor. Las futuras listas de ventas deben aplicar límites. Descripciones y claves pueden ampliarse en versiones compatibles; los cambios incompatibles necesitarán una nueva versión de API. Contrato OpenAPI automatizado pendiente.
