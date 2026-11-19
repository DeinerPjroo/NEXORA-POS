# Galería privada de productos · 0.22

Hasta ocho imágenes activas por producto. Reutiliza SanitizeProductImage/GD, disco privado catalog y validación JPEG/PNG/WebP, máximo2MB y32–2048px por lado. Se recodifican bytes y no se guardan nombres originales ni rutas públicas.

`product_images` conserva tenant/product/path/mime/posición/estado; `products.cover_image_id` tiene FK tenant/product/image. La migración incorpora fotografías previas bajo bloqueo Tenant/product y revalida portada antes de insertar. No mueve archivos ni cambia URLs/revisión anteriores; image_path/image_mime siguen siendo espejo de portada para `/products/{id}/image`.

## Operaciones

GET/POST `/products/{product}/images`, GET/DELETE `images/{productImage}`, PUT `images/{productImage}/cover` y PUT `images/order`. Bindings propios, catalog.view/manage y archivos autenticados con private/no-store/nosniff. API no expone path ni tenant. GET lista activos paginados y entrega revisión/portada/límite; cliente solicita los ocho permitidos.

Upload multipart añade foto; la primera es portada, otra lo es solo si se solicita. El orden incluye todas las imágenes activas una vez. Retirar conserva registro inactivo, elige siguiente portada por orden si hace falta y elimina archivo tras commit. No restaura archivos retirados. La fotografía anterior permite reemplazar/quitar la portada conservando las demás.

Comandos nuevos requieren UUID, product_revision/moneda, Gate antes de replay, Tenant lock y auditoría transaccional. Hash de archivo calculado en servidor y excluido del cliente. Si falla escritura/auditoría se revierte portada/revisión/registro/UUID y se limpia blob sin referencia; ante imposibilidad de comprobar referencia se conserva para revisión. Limpiezas fallidas se registran en log.

useOperation conserva FormData o JSON y UUID exactos ante respuesta incierta y admite DELETE. El modal mantiene su snapshot aunque se refresque la ficha; revisiones nuevas no reemplazan una operación pendiente. La galería se consulta por producto/revisión y vuelve a cargar tras cambios de la fotografía anterior. Selección de portada, orden y retirada tienen revisión/confirmación visibles.

## Verificación dirigida

ProductGalleryTest cubre migración compatible/idempotente, bytes recodificados/privacidad, UUID/hash/replay, portada/orden/retirada/limpieza tras commit, límites/archivos inválidos, revisión/moneda, identidad/FK/tenant/permisos/revocación y rollback de auditoría. Usa commits reales en esquema de pruebas protegido para observar limpieza; no ejecuta down sobre historia. CatalogMediaVariantsTest conserva compatibilidad.

Chromium de galería comprueba multipart incierto con otra escritura concurrente, portada/orden, retirada incierta y privacidad tras logout; recorridos afectados de fotografía/variantes y promociones verifican compatibilidad del helper compartido. Una captura móvil del módulo; resultados ejecutados en PROJECT_STATE/HANDOFF.
