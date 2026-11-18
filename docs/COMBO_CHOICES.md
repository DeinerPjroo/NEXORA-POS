# Alternativas de combo · contrato 0.20

Extensión de [combos fijos](FIXED_COMBOS.md). Conserva `Product.kind`, reparto equal/proportional, preparaciones por unidad, cabecera histórica y posiciones facturables existentes. La raíz no tiene variantes, modificadores ni perfil tributario propios. No admite combos anidados.

## Configuración

`product_combo_groups` pertenece a empresa y producto combo: nombre hasta80 caracteres, min_select0–20, max_select1–20 y mayor o igual al mínimo, orden0–999, estado y revisión. Hasta8 grupos activos por raíz. La API lista grupos y archivo con paginación real10 por defecto, máximo50.

`product_combo_components.combo_group_id` nullable identifica pertenencia estable. Null significa componente fijo obligatorio del contrato0.19. Una alternativa de grupo usa el mismo producto/presentación y units1–20 del componente anterior. Elegirla incluye todas sus unidades; no puede elegirse dos veces en una línea. Hasta20 alternativas activas por grupo, incluyendo las de grupos archivados. Archivar un grupo no cambia los estados de sus alternativas.

Un grupo activo debe tener tantas alternativas activas como su mínimo. Para crearlo, usar mínimo0 o estado archivado, agregar alternativas y después exigir un mínimo. No debe superar20 unidades la suma de componentes fijos y las alternativas más pequeñas requeridas por los mínimos. Esta comprobación de configuración no reserva disponibilidad: categorías, perfiles, presentaciones y horarios pueden cambiar.

Las mutaciones de grupo usan UUID, revisión de raíz/moneda capturadas al abrir, revisión del grupo al editar, autorización antes de replay, Tenant lock y auditoría en la misma transacción. Cambiar una alternativa incrementa revisión de componente, grupo y raíz; no se puede mover de grupo ni cambiar producto/presentación en PUT. Archivar/crear conserva identidad e historia. Las FK tenant/root/group impiden referencias ajenas incluso mediante SQL.

Rutas bajo `/api/v1/products/{product}`:

- GET/POST `combo-groups`; PUT `combo-groups/{comboGroup}` con bindings propios de raíz.
- GET/POST `combo-components`; PUT `combo-components/{comboComponent}`. POST acepta combo_group_id propio o null; PUT lo prohíbe.
- GET `combo-configuration?branch_id=…&channel=…` devuelve componentes habilitados, grupos activos ordenados, selection_version, revisiones, referencias de precios y motivos de disponibilidad por alternativa. GET administrativo conserva componentes archivados paginados; no carga todo el archivo en pedidos.

catalog.view permite consulta; catalog.manage permite escritura. ProductResource/VariantResource siguen protegiendo costos con catalog.costs. Identidad de empresa se deriva de sesión y no del cuerpo.

## Disponibilidad y selección

Todos los componentes fijos deben estar disponibles y debe existir una elección válida para cada mínimo de grupo. Una alternativa cerrada no bloquea elegir otra disponible; un grupo opcional puede omitirse. Una raíz que solo tiene grupos opcionales necesita alguna elección no vacía posible. El configurador muestra motivos y no selecciona ni sustituye alternativas automáticamente.

El contrato para raíces con grupos activos exige `selection_version:2`, junto a kind:combo y la lista components de tuplas component_id/unit_index, notas y modificadores. El servidor deriva los grupos desde configuración; no acepta group_id ni nombres como autoridad en las posiciones. Cada alternativa elegida debe incluir todos sus índices de unidad desde0. Los componentes fijos no se pueden omitir. Se rechazan duplicados, unidades ajenas/inactivas, mínimos/máximos incumplidos y selecciones vacías.

Límite20 unidades expandidas por combo y100 posiciones facturables por pedido. Preflight valida selección y expansión antes de cargar productos, preparaciones y referencias completas. Solo carga las hojas de la unión de elecciones efectivas; las alternativas no elegidas no aportan peso, precio, preparación ni impuesto. Cantidad de combos no multiplica el número de posiciones, sino la cantidad de cada posición.

Raíces sin grupos conservan el contrato0.19 sin selection_version y snapshots versión1. Raíces con grupos usan snapshot estructural versión2; no cambia la versión de cálculo tributario. Formularios y carritos antiguos detectan la revisión cambiada y deben corregirse explícitamente.

## Precio, historia e interfaz

Orden estable: fijos por orden/id, después grupos por orden/id y sus alternativas por orden/id, luego índice de unidad. OrderCatalog/OrderComboPlan comparten validación entre preview y registro bajo Tenant lock e instante común de disponibilidad. La base contextual de raíz se distribuye con CentAllocation a escala10000 solo entre unidades elegidas; se añaden extras propios de cada unidad. Proporcional requiere algún peso positivo cuando la base es positiva. Conserva fórmulas y límites BCMath de0.19.

El header order_combos copia grupos con nombre/revisión/min/max/orden e IDs de alternativas elegidas; snapshot.components vincula identidades con posiciones asignadas. Solo order_items alimenta subtotal e impuestos: la cabecera y los grupos no son otras filas financieras. Perfil/preparación/precio/horario de cada posición son históricos. Reintento de UUID, entrega, cotización, cobro, abonos, cuentas y devoluciones no reevalúan configuración ni reloj.

La ficha administra grupos/archivo y agrega alternativas desde selectores paginados de productos/presentaciones existentes. Al tomar el pedido muestra contador de alternativas por grupo y contador total de unidades, preparación y observación por unidad elegida, revisión de partes/perfiles y confirmación. La clave de carrito incluye identidades de alternativas y preparación. Cambiar contexto revisa las mismas identidades y conserva notas/cantidades; no reemplaza elecciones inválidas. Envío incierto conserva UUID/cuerpo exactos. Pedido/recibo muestran grupos y partes desde snapshots, incluso después de archivar o renombrar el grupo.

## Verificación

ComboChoiceTest cubre contrato D1/v2, selección opcional/obligatoria/múltiple, unidades completas/duplicadas, disponibilidad sin sustitución, límites8/20 y expansión20/100 antes de cargas completas, capacidad mínima/revisiones/identidad, scopes/FK, UUID/permisos/auditoría y rollback. Caso financiero con perfiles incluidos/adicionales, extras, descuento, cuentas, abonos/replay/devolución y saldo de caja histórico. FixedComboTest conserva regresión0.19.

Chromium `combo-choices.spec.ts` conecta administración, respuesta perdida al guardar grupo, alternativas/preparaciones, revisión de canal, registro con respuesta perdida y archivo posterior del grupo, replay/cobro/recibo móvil. Capturas en docs/screenshots. Resultados finales de las suites, migración y publicación se registran en PROJECT_STATE/HANDOFF; un recorrido dedicado aprobado no sustituye esas verificaciones.
