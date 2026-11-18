# Precios por sucursal/canal · criterios 2.2-C1

Diseño original posterior a modificadores 0.16, ejecutado y verificado como 0.17. Contrato vigente en CONTEXT_PRICES.md y resultados en PROGRESS/HANDOFF. Mantener sale_price base de producto/variante, moneda de empresa, BCMath y snapshots. No cambiar precios de pedidos ya registrados ni requerir una pasarela.

## Regla explícita y precedencia

Cada regla pertenece a producto y, opcionalmente, a una presentación concreta. Un precio de producto sin presentación no sustituye automáticamente el precio de sus variantes: estas conservan su base y reglas propias. Si un producto ya requiere presentación, administrar precios desde cada variante; conservar reglas anteriores de producto para consulta/archivo.

| Prioridad | Coincidencia activa de la entidad vendida |
| --- | --- |
| 1 | Sucursal y canal exactos |
| 2 | Sucursal exacta y todos los canales |
| 3 | Todas las sucursales y canal exacto |
| 4 | sale_price base de producto o variante |

Canales actuales: takeaway/dine_in. all representa cualquier canal en una regla, no un canal de pedido. Al menos sucursal o canal debe ser específico; la base general se edita con el editor existente. No hay conversión de moneda, precedencia por fecha/ID ni promoción implícita. Un precio cero explícito conserva la semántica monetaria actual; una venta cuyo total completo sea cero sigue su validación existente.

Desactivar una regla recupera la siguiente coincidencia/base. La identidad producto/variante/sucursal/canal se conserva al editar; cambiar contexto implica archivar y crear otra, manteniendo historia. Importe/estado se editan con revisión/UUID, sin borrar.

## Datos, concurrencia y permisos

- Tabla de reglas con tenant/product, variante nullable y sucursal nullable, canal all/takeaway/dine_in, importe DECIMAL(19,4), estado/revisión y timestamps. FK tenant/product/variant a variants_product_identity existente y tenant/branch. Sin costos ni moneda propia.
- Unicidad real también cuando variante/sucursal son null: propuesta de scopes generados coalesce(id,0), con índice único tenant/product/variant_scope/branch_scope/channel. Verificar migración en SQLite 3.51.3 local y MariaDB 10.4 antes de adoptar; no confiar solo en unique nullable. Estos scopes no son entrada del cliente.
- Guardar bajo IdempotentOperation + bloqueo de empresa/producto, Policy catalog.manage antes de replay, revisión de producto/moneda y revisión de regla para editar. Cada cambio incrementa Product.revision; catálogo/variante/defaults siguen bajo sus revisiones actuales. Unicidad, auditoría y UUID confirman o revierten juntos.
- Lectura catalog.view, costos siguen catalog.costs. Administrador de catálogo debe poder consultar nombres/IDs/estado de sucursales necesarios sin obtener direcciones ni permiso de edición. OperationsController.context hoy no admite catalog.view; ampliar solo ese permiso de metadatos o crear un contexto acotado y probarlo.
- Listas administrativas paginadas por entidad/presentación y estado, incluyendo archivadas. Nada truncado a primeras variantes/sucursales. La ficha puede mostrar panel base si no hay variantes; cada fila paginada de variante abre su panel de precios, evitando otro selector incompleto.

## Resolución y pedido

CatalogPriceResolver centralizará la precedencia. Lecturas de menú y variantes aceptan branch_id/channel juntos y devuelven precio contextual separado de sale_price, para no guardar accidentalmente un override como base en editores existentes. Consultas sin contexto conservan contrato/precio base. Validar sucursal propia y canal admitido; una sucursal inactiva no puede registrar pedido.

Cargar reglas candidatas por lote de productos/variantes y scopes aplicables, sin una consulta por línea ni traer todo el historial de contextos. El comando de pedido vuelve a resolver bajo bloqueo; el precio contextual es la base antes de sumar modificadores. expected_unit_price sigue representando precio final con adicionales. Product.revision detecta cambios de regla aunque el precio resultante coincida.

order_items.price_snapshot nullable conservará contexto elegido, fuente base/regla, ID/revisión de regla e importe base contextual, además de base_unit_price/modifiers_snapshot existentes. Datos anteriores quedan null sin adivinar. Pedido/recibo muestran el origen histórico cuando exista. Cobrar/abonar/devolver usa los importes guardados y no consulta reglas vigentes para recotizar.

## Cambiar contexto sin perder preparaciones

El tipo de pedido actual es un select no controlado con predeterminado takeaway; convertirlo a estado junto a sucursal para consultar menú/presentaciones. No mezclar líneas de contextos diferentes ni descartar silenciosamente notas/selecciones del carrito.

Diseño preferido: preview de pedido sin escritura, reutilizando un plan de líneas compartido con CreateOrder. POST orders/preview recibe sucursal/canal/moneda y referencias/cantidades/selecciones/notas; devuelve precios/snapshots y revisiones actuales. No crea pedido, auditoría de comando ni UUID. CreateOrder conserva la comprobación estricta de revisiones/precios; preview sirve para revisión explícita antes de enviar.

Cambiar sucursal/canal con carrito solicita ese preview. Si el precio y contenido visibles, perfil tributario y selecciones no cambian, se conserva el flujo y se actualiza contexto. Si cambian, mostrar antes/después y pedir aplicar los importes cotizados antes de permitir registrar. Conservar cantidades y observaciones. Bloquear edición mientras se resuelve/revisa para no aplicar respuesta a otro borrador; cancelar conserva el carrito anterior o permite volver a su contexto. Configuración/ingrediente ya no disponible requiere corregir línea, no reemplazarla por otra opción automáticamente.

Ante pedido de respuesta incierta, no cambiar contexto ni recotizar: conservar UUID/payload exactos hasta confirmar el envío original. Este preview es distinto de orders/{order}/quote financiero existente para cobrar; no alterar su contrato. La extracción de un plan compartido debe preservar validación de categoría/variante/impuestos/modificadores, atomicidad e idempotencia actuales y verificarse con toda la suite.

## Criterios de verificación

- Precedencia completa en dos sucursales/canales y variantes, desactivación/fallback, importes exactos/extremos y cero, unicidad de scopes null en ambos motores, FK/tenant y contexto inválido.
- Permisos sin costos/edición de sucursales, UUID/replay/revisión/auditoría y conflictos. Cambios por otro contexto invalidan revisión conservadoramente; no sobrescribir regla o precio base al editar.
- Menú/presentación/configurador/carrito usan mismo contexto. Cambio con carrito conserva notas/cantidad, revisa diferencias y no envía precio anterior; preview no escribe. Rechazar cualquier precio/revisión/contexto falsificado y pedido entero sin filas parciales.
- Snapshot/replay después de archivar/cambiar reglas; impuestos/modificadores/centavos, cuenta/abonos/devolución y recibo anteriores invariantes. Compatibilidad sin reglas/contexto opcional en consulta.
- Chromium con configuración y dos contextos reales, revisión de carrito, toma/cobro/snapshot/móvil; SQLite/MariaDB, migración/DDL/build/formato y regresión antes de publicar. Horarios siguen en C2; no presentarlos como implementados con C1.
