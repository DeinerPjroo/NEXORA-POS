# Categorías y subcategorías (0.15)

El catálogo admite dos niveles: categorías principales y subcategorías. Un producto puede pertenecer a cualquiera. Los nombres siguen siendo únicos por empresa; no se borran categorías ni se cambia automáticamente la organización anterior.

## Uso

Categorías → Nueva/Editar → **Categoría principal (opcional)** permite elegir una raíz con búsqueda y paginación, o conservar «Sin categoría principal». La revisión del padre queda capturada al seleccionarlo. Una categoría que ya tiene hijas muestra ese selector bloqueado; primero hay que reasignar sus hijas. Se puede mover una subcategoría a otra principal o volverla principal sin borrar sus productos.

La lista filtra principales/subcategorías y cada principal enlaza sus hijas. Las tarjetas muestran el padre y si está inactivo; el conteo de productos es directo, no una suma de descendientes. Los selectores/fichas de producto muestran **Principal / Subcategoría**. Filtrar productos o menú por una principal incluye sus productos directos y los de sus subcategorías; filtrar por una subcategoría incluye solo los suyos.

Una categoría es efectivamente activa si está activa y, cuando tiene padre, este también lo está. Se permite organizar categorías inactivas. Desactivar principal no reescribe flags ni revisiones de hijas/productos: cambia su elegibilidad para nuevos pedidos. Reactivarla recupera a quienes conserven sus propios estados activos/disponibles. CreateOrder vuelve a comprobar esa condición en servidor, además de producto/variante/perfil tributario/revisiones. Los pedidos previos conservan sus snapshots y el replay idempotente no vuelve a cotizarlos.

## Integridad y API

- Migración 000015 añade categories.parent_id nullable y FK tenant/parent, índice tenant/parent/name. Las categorías anteriores quedan como raíces; ningún precio, venta o pedido cambia.
- CategoryHierarchy valida dentro del bloqueo de empresa: padre propio, raíz y distinto de sí; impedir tercer nivel o convertir una raíz con hijos en hija. Así no se forman ciclos por API. El rollback automático de la migración rechaza quitar la organización existente.
- SaveCatalogRecord ahora toma también el bloqueo de empresa para categorías, compartiendo serialización con CreateOrder y sus lecturas de disponibilidad. Edición requiere revisión del registro; elegir padre requiere parent_revision actual. Padre/revisión obsoletos responden 409; estructura inválida o ajena se rechaza sin cambios. Auditoría y escritura son atómicas.
- POST/PUT categories acepta parent_id opcional y parent_revision si hay padre. Omitir parent_id conserva la relación en clientes anteriores; null desvincula. Mantiene respuesta de creación/edición sin envoltura data para compatibilidad. El recurso devuelve campos seleccionados, sin tenant_id.
- GET categories añade level=root|child y parent_id propio, conservando búsqueda/estado/páginas. Incluye parent, parent_id, effective_active, children_count y products_count directo. status filtra el estado propio; effective_active informa la herencia.
- GET products?category_id selecciona categoría y sus hijas directas, respetando tenant. ProductoResource incluye resumen de categoría/padre y sellable según disponibilidad efectiva. Las listas cargan padre para evitar una consulta adicional por fila.
- Permisos catalog.view/manage existentes; sin concesiones nuevas. Selectores de padre consultan raíces en páginas, no un listado truncado.

Los botones auxiliares de paginación/cierre/limpiar selección declaran type=button para conservar su función al usarse dentro de formularios anidados en diálogos. Cerrar/seleccionar no constituye una orden de guardar.

## Verificación

182 pruebas / 1913 aserciones correctas en SQLite y MariaDB; nexora_test_5c40f32e1978dda9 conservada. Siete casos nuevos cubren estructura/FK/tenant, páginas/filtros, herencia y pedido previo, revisión/reasignación/compatibilidad y rollback de auditoría. Migración 000015 aplicada en MariaDB de trabajo; doctor/DDL/Pint/Composer correctos.

Suite completa 18 Playwright aprobada (11.5 min), incluido principal fuera de primera página, búsqueda, hija/producto desde UI, filtro de principal, pedido, desactivación/reactivación heredada, conservación del pedido anterior y móvil. Capturas finales revisadas; build/TypeScript/Prettier correctos (JS 499.37 kB / gzip 139.98 kB). Resultado en PROGRESS/PROJECT_STATE.

No se admiten niveles recursivos arbitrarios ni nombres duplicados en ramas diferentes. Modificadores, precios por contexto, horarios, combos, promociones y galería siguen sus incrementos pendientes en CATALOG_ADVANCED_PLAN.md.
