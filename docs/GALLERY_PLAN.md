# Galería privada · 2.2-F

Diseño sobre0.21 publicada enb443bfd, implementado y verificado por impacto como0.22; contrato en GALLERY.md. Reutiliza disco privado catalog, SanitizeProductImage/GD, fotografía y URL de portada anteriores, permisos y revisión de producto. Máximo ocho imágenes activas por producto; JPEG/PNG/WebP de hasta2MB y32–2048px por lado. Sin enlaces públicos ni rutas de almacenamiento en API.

Migración incremental: product_images con tenant/product/path/mime/posición/estado y products.cover_image_id protegido por FK tenant/product/image. Incorporar fotografías previas sin mover archivos ni cambiar URLs; conservar image_path/image_mime como espejo de portada para el contrato anterior.

Subir añade imagen y la primera pasa a portada; elección explícita de portada, orden completo sin IDs duplicados/ajenos y retirada con siguiente portada por orden, o ninguna si queda vacía. Retirada conserva registro inactivo y limpia archivo solo tras commit; no restaura archivos retirados. Reemplazar/quitar por endpoint anterior afecta la portada actual y conserva otras fotos.

Comandos nuevos con UUID, revisión/moneda, autorización antes de replay, hash de archivo calculado en servidor, Tenant lock, auditoría y rollback. Reutilizar recodificación y limpieza para endpoint anterior; guardar/reintentar exactamente el multipart original ante respuesta incierta. No transferir fotos entre productos/empresas ni permitir que manipular portada cambie referencias ajenas. Sin duplicar fotografía ni alterar historia financiera.

Interfaz de ficha junto a portada actual: miniaturas ordenadas, contador, subir, portada, mover y retirar con confirmación explícita. Probar seguridad de archivos/recodificación, privacidad/headers/permisos/FK/tenant, límite/orden/revisiones/UUID, compatibilidad anterior, auditoría y limpieza de fallos. Chromium dirigido de galería y fotografía/variantes; revisión visual del módulo y compilación si cambian componentes. Pruebas por impacto según AGENTS, sin suites completas por rutina.
