# Catálogo avanzado · plan de incrementos 2.2

Diseño de continuidad, no capacidades ya implementadas. Fuente de alcance: REQUIREMENTS 6.3/6.6 y TASKS 2.2. Reutilizar Product/Variant, permisos catalog.*, imágenes privadas, revisiones y snapshots del pedido. Mantener ventas/caja ya verificadas; cada bloque requiere UI/API/pruebas/documentación y commit/push antes del siguiente.

## Secuencia y aceptación

| ID | Incremento | Criterio funcional de salida |
| --- | --- | --- |
| 2.2-A | Categorías y subcategorías | Dos niveles explícitos, padre opcional tenant-safe, sin ciclos/tercer nivel; selector paginado, filtros y disponibilidad efectiva por ancestros. Crear/editar/asignar producto y tomar pedido desde UI. No borrar/reclasificar historia. |
| 2.2-B | Modificadores/adicionales/exclusiones | Grupos y opciones de producto con selección mínima/máxima, obligatoriedad, precio adicional decimal y opción sin costo para exclusiones. Revisión, archivo, validación de selección/revisión/precio en servidor y snapshot por línea, antes de cobrar. Tamaños siguen usando variantes existentes. |
| 2.2-C1 | Precios por sucursal/canal | Reglas explícitas con precedencia determinista y sin conversión de moneda; vista/cotización en contexto sucursal/canal, revisión independiente y snapshot al pedir. Precios base anteriores compatibles; variantes incluidas. |
| 2.2-C2 | Horarios de disponibilidad | Ventanas en zona empresarial, días y cruce de medianoche explícitos; revisión de contexto al pedir, sin recotizar pedidos guardados. Mostrar motivo de indisponibilidad en UI; servidor vuelve a comprobar hora real. |
| 2.2-D | Combos | Componentes permitidos, cantidades/variantes/selecciones y precio definido explícitamente; snapshot de composición y total, sin ciclos. No anunciar consumo de recetas/inventario antes de su fase. Compatibilidad con impuestos por producto exige definir asignación de precio/descuento a componentes antes de implementar. |
| 2.2-E | Promociones | Reglas acotadas por producto/contexto/vigencia, prioridad y compatibilidad explícitas; cálculo decimal en servidor, cotización/snapshot/motivo y permisos. No ejecutar expresiones libres. Probar conflicto de promociones, límite del descuento y base de impuestos. |
| 2.2-F | Galería privada | Varias fotografías ordenadas con portada, límites de tipo/dimensiones/tamaño, recodificación GD y rutas privadas; revisión de producto y autorización. Preservar fotografía/URL anterior como portada compatible y evitar archivos huérfanos. |

No agregar paquetes sin función concreta. Los componentes de selección/precios quedarán reutilizables por el terminal POS 2.3, manteniendo permisos en servidor. Los ingredientes de cocina se expresan inicialmente como opciones de pedido; el maestro de materias primas, unidades y recetas sigue en 3.2/3.3.

## Diseño del primer incremento 2.2-A

categories.parent_id nullable con FK compuesta tenant/parent; ninguna categoría existente recibe padre automáticamente. Nombres siguen siendo únicos dentro de empresa para preservar contrato y evitar selecciones ambiguas. Un producto puede pertenecer a categoría raíz o subcategoría. No hay borrado de categorías.

SaveCatalogRecord también bloqueará Tenant al cambiar categorías, antes del registro/padre, para compartir serialización con CreateOrder. Si se proporciona padre, comprobar que pertenece a la empresa, es raíz, no es la propia categoría y coincide con la revisión elegida. Una raíz con hijos no puede transformarse en hija; una hija sí puede volver a raíz. Omitir parent_id en API anterior conserva relación; enviarlo null elimina solo esa relación administrativa. Validar revisión del registro para toda edición y auditar en la misma transacción.

Se pueden organizar categorías inactivas: estado efectivo = categoría activa y padre activo si existe. No forzar flags de hijos/productos al archivar raíz; al reactivarla se recupera elegibilidad de quienes conserven su propio estado. ProductoResource y CreateOrder deben compartir esta interpretación. Pedidos ya guardados conservan nombres/precios/impuestos y siguen su flujo aunque luego cambie la organización.

GET categorías mantendrá búsqueda/paginación, incluirá padre resumido/conteo de hijos y permitirá filtrar raíces o hijos de una raíz. El selector de padre consultará solo raíces en páginas, con revisión capturada al elegir y opción «Sin categoría principal». No truncar a las primeras 10/50 categorías. CategoryPicker de producto/filtros mostrará ruta principal/subcategoría. Filtrar productos por raíz incluirá sus hijos; por subcategoría solo esa categoría. Explicarlo en UI para evitar confusión de alcance.

Verificar pertenencia/FK, self/ciclos/profundidad, raíz con hijos, cambios de padre/estado/revisión, búsqueda/páginas, permisos/rollback y bloqueo de toma de pedido con padre inactivo. Chromium debe crear raíz/hija/producto, elegirlas con búsqueda, filtrar, tomar pedido, archivar/reactivar raíz y conservar pedido anterior. SQLite/MariaDB y regresión de ventas/caja obligatorias antes de publicar.

## Aspectos que resolver en cada bloque posterior

El precio adicional por modificador debe asignarse al producto/tributación de la línea con snapshot, sin alterar totales después del primer pago. Combos y promociones deben tener criterios propios de asignación de centavos e impuestos; no reutilizar una etiqueta de combo sobre un importe sin composición validada. Los precios por contexto se fijan al crear pedido y no se recalculan al cobrarlo. Horarios se interpretan en zona empresarial sin cambiar timestamps SQL existentes. Galería no requiere generación de imágenes ni exposición pública de archivos.
