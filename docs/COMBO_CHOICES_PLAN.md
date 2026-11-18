# Alternativas de combo · diseño 2.2-D2

Incremento posterior a combos fijos0.19; todavía no implementado. Mantener D1, OrderCatalog/OrderComboPlan, distribución de base y cabecera/posiciones facturables. No cambiar precios de historia, referencias de componentes ni tipo regular/combo.

## Modelo propuesto y límites

Agregar grupos propios de raíz combo, con nombre, mínimo/máximo de alternativas, orden, estado/revisión y archivo paginado. Propuesta inicial: hasta8 grupos activos y20 alternativas activas por grupo; cada alternativa es un registro product_combo_components asociado al grupo mediante FK tenant/root/group. Los registros con grupo null siguen siendo componentes fijos obligatorios de D1.

Una alternativa representa producto/presentación y units ya definidos por D1. Seleccionar una alternativa incluye todas sus unidades; no elegir la misma alternativa dos veces en una línea. Mínimo0 permite omitir el grupo; máximo limita alternativas, no unidades. El total de posiciones tras elegir y expandir unidades, más componentes fijos, no supera20 por combo ni100 por pedido. Mostrar ambas cantidades para no confundir selección con unidades.

Al configurar un grupo obligatorio, mantener suficientes alternativas activas para su mínimo. Tener alternativas activas no garantiza disponibilidad operativa: categoría/perfil/variante/horario se comprueban al elegir y al registrar. No tomar automáticamente otra alternativa si una está cerrada. La raíz debe tener alguna composición no vacía válida; una selección sin posiciones se rechaza.

Cambiar grupo/identidad de un registro debe conservar historia: preferir identidad estable y archivar/crear para mover alternativas, evitando que un carrito cambie de grupo silenciosamente. Toda mutación incrementa revisión de grupo/raíz cuando corresponde, exige revisión/moneda/UUID, Gate antes de replay y auditoría bajo Tenant lock.

## Selección y compatibilidad

GET configuración de combo devuelve componentes fijos y grupos/alternativas activas acotados, con datos de disponibilidad y referencias de contexto filtradas por permisos. Administración de grupos/alternativas archivadas sigue paginada. No cargar toda la historia al resolver pedidos.

Definir una versión explícita del DTO de selección para combos con alternativas. El contrato D1, que envía todas sus posiciones, permanece válido para raíces sin grupos. Una raíz con grupos debe exigir el contrato nuevo para que clientes anteriores no interpreten todas las alternativas como composición fija. El servidor deriva pertenencia al grupo desde configuración, no desde etiquetas ni group_id enviado como autoridad.

Validar selección mínima/máxima por grupo, alternativas únicas, componentes fijos completos, índices de unidad completos de cada alternativa elegida y ausencia de unidades/grupos ajenos. Orden estable: fijos y grupos/alternativas según configuración, con índice de unidad. El reparto equal/proportional considera únicamente las unidades elegidas; adicionales/perfiles/horarios provienen de cada componente. Se conserva el preflight de expansión antes de cargar productos/opciones completos.

Preview y registro usan el mismo plan. La cabecera histórica copia grupos, revisiones y selección; posiciones mantienen FK a cabecera y su perfil/preparación/referencia/asignación. No hay otra fila financiera de grupo ni precio de cabecera duplicado. ProductTaxTotals conserva fórmula si no cambia aritmética; cualquier cambio de fórmula debe versionarse explícitamente.

## Interfaz

Ficha: crear/editar/archivar grupos y alternativas, elegir producto/presentación desde selectores paginados y configurar min/max con mensaje de unidades expandidas. El reparto sigue siendo una decisión explícita de la empresa.

Pedido: grupos con selección visible y contadores, opciones no disponibles con motivo, preparación por unidad elegida, observaciones y revisión de partes/perfiles antes de agregar. Clave canónica incluye alternativas y preparación. Cambiar sucursal/canal revisa las mismas identidades; si dejan de ser válidas exige corrección explícita. No sustituir selección ni descartar notas. Envíos inciertos mantienen cuerpo/UUID; impresión lee solo snapshots.

## Aceptación

- Migración incremental/FK/bindings propios de raíz/grupo/producto/presentación, límites y paginación/archivo, permisos sin costos, revisiones/UUID/replay y rollback.
- API anterior D1 sin grupos idéntica, contrato nuevo obligatorio con grupos, rechazo de omisiones/duplicados/alternativas ajenas o no disponibles y configuración obligatoria imposible.
- Cero/una/varias alternativas, mínimos/máximos y unidades, total expandido antes de cargar catálogo, distribución exacta y perfiles incluidos/adicionales, descuentos/cuentas/abonos/devoluciones e historia preservados.
- Reloj/contexto común, cierre/cambio entre preview y registro y nuevas revisiones sin reescribir pedidos guardados.
- Chromium conectado de administración→selección/preparación→revisión de contexto→pedido/reintento→cobro/recibo/móvil. SQLite/MariaDB, regresión completa, DDL/migración/build/formato/doctor y documentos antes de publicar. Solo entonces marcar padre2.2-D COMPLETED y continuar promociones2.2-E.
