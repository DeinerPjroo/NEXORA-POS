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

La respuesta de producto ahora incluye image_url (nullable), variants_count y available_variants_count. sellable exige producto/categoría activos y disponibilidad manual; si existen variantes, además requiere al menos una activa y disponible. El precio base se presenta como referencia cuando hay variantes. Todavía no existe una API de venta o pedido; su futura implementación deberá exigir selección de variante y usar su precio.

## Referencia de errores

| Código | Significado |
| --- | --- |
| 401 | Falta sesión válida |
| 403 | Permiso insuficiente, rol protegido, cuenta/empresa suspendida |
| 404 | Recurso inexistente o de otra empresa |
| 409 | Revisión visual obsoleta |
| 419 | Protección CSRF no satisfecha |
| 422 | Validación; errors contiene mensajes por campo |
| 429 | Límite de intentos |
| 500 | Error interno; el frontend muestra mensaje genérico |

Sucursales, roles y equipo todavía se listan sin paginación por su tamaño inicial. Productos/categorías ya usan paginación y filtros de servidor. Las futuras listas de ventas deben aplicar límites. Descripciones y claves pueden ampliarse en versiones compatibles; los cambios incompatibles necesitarán una nueva versión de API. Contrato OpenAPI automatizado pendiente.
