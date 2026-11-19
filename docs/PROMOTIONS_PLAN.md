# Promociones · diseño 2.2-E

Diseño original sobre0.20 publicada en2f1dcd8. Implementado y verificado por impacto como0.21, contrato en PROMOTIONS.md y resultados en PROJECT_STATE/HANDOFF. Fuente: REQUIREMENTS6.3/6.6 y CATALOG_ADVANCED_PLAN; reutiliza precios contextuales, horarios, revisión de carrito, snapshots y cálculo tributario sin dependencias nuevas.

## Alcance inicial

Reglas propias de producto/presentación con nombre, descuento fijo o porcentual explícito, contexto opcional sucursal/canal, vigencia por fechas locales de empresa, prioridad, estado/revisión y archivo paginado. Producto combo admite reglas sobre su base raíz; producto regular/presentación sobre su base individual. Identidad producto/presentación/contexto estable; archivar/crear para mover. Límites activos acotados antes de cargar candidatos; definir/probar máximo20 reglas activas por producto, incluyendo sus variantes.

Una sola regla ganadora por entidad/contexto, sin apilamiento entre promociones. Precedencia propuesta: contexto sucursal+canal > sucursal > canal > general, después prioridad numérica menor y antigüedad de creación. Mostrar esta precedencia y la regla aplicada; nunca elegir silenciosamente la que da mayor descuento. Fechas inicio/final opcionales con final incluido como fecha local, zona esperada capturada al abrir bajo Tenant lock; sin horas ambiguas introducidas por un input datetime-local. Disponibilidad horaria anterior sigue siendo requisito independiente.

## Base e impuestos

Resolver primero precio contextual vigente. Aplicar promoción a esa base, antes de adicionales y preparación. Fijo a cuatro decimales; porcentaje0–100 con límite/precisión declarados y redondeo half-up a cuatro decimales. No producir base negativa: descuento aplicado acotado al precio disponible y mostrar importe aplicado. Adicionales conservan importe completo y perfil de producto. No cambiar sale_price ni borrar regla contextual original.

En combo, aplicar promoción de raíz una sola vez antes del reparto; referencias de hojas para ponderación conservan sus bases contextuales sin promoción individual. Esto impide descontar dos veces o permitir que una campaña individual cambie pesos de un combo ya promocionado. Probar bases0/cercanas al límite, todos los pesos0, restos y cantidad repetida. Solo posiciones facturables alimentan ProductTaxTotals; cabecera/grupos nunca otra fila financiera.

El descuento manual de venta existente se aplica después sobre subtotal ya promocionado, con sales.discount/motivo existentes; explicarlo al operador. El snapshot debe distinguir promoción de catálogo de ajuste manual de venta, sin restar el importe promocional una segunda vez. Fórmulas tributarias/centavos/cuentas conservan versiones si no cambian; si se modifica aritmética financiera versionarla antes de publicar.

## Integración y seguridad

Servicio de promoción separado del resolver contextual, con candidatos por lote e instante común/zona en menú/configuradores/preview/registro. Precio contextual original y promoción efectiva se exponen por separado o en snapshot versionado explícito; definir DTO antes de código y mantener snapshotv1 anterior legible. Preview muestra regla/nombre/revisión/base anterior/descuento/base efectiva/vigencia/contexto. Pedido copia esos datos; replay/cobro/abonos/devolución no reevalúan promoción ni fechas.

Mutaciones con catalog.manage antes de replay, UUID, revisión de raíz/regla/moneda/zona, bloqueo Tenant, auditoría y FK tenant/product/variant/branch. Lector catalog.view no recibe costos ni escribe. Cambios incrementan revisión de producto, invalidando carritos; expected_unit_price estricto detecta promoción vencida entre preview/registro aunque revisión del catálogo sea igual. El carrito conserva alternativas/preparaciones/notas/cantidad y exige revisión explícita ante cambio de precio/procedencia visible. Envío incierto conserva UUID/cuerpo/contexto exactos.

Panel de ficha paginado/archivo, formulario con contexto/vigencia/prioridad y explicación de compatibilidad/base. UI de pedido/revisión/recibo identifica promoción aplicada y base antes/después, sin anunciar ahorro acumulado calculado sobre referencias de combo. No promociones por cantidad, 2x1, cupones/clientes, envío de campañas, canales externos ni fidelización en este primer alcance; ampliar mediante incrementos explícitos.

## Aceptación antes de publicar

- API/FK/bindings propios, revisiones/UUID/replay/permisos/archivo/límites y rollback; conflictos concurrentes y zona/moneda obsoletas.
- Prioridad/empates/contexto/variante propia, límites/decimal/porcentaje/fijo y vigencia local/inicio/final con instante compartido, sin cambios de reloj en producción.
- Producto regular y variante con adicionales; combo fijo/alternativas con base promocionada y referencias sin doble descuento. Perfiles incluidos/adicionales, descuento manual, propina, cuentas, abonos/devoluciones e historia.
- Chromium dirigido de configuración a elección/revisión/contexto/registro con respuesta incierta y promoción cambiada después, cobro/recibo/móvil. Pruebas afectadas y cobertura exhaustiva financiera/seguridad/tenant/concurrencia; migración/DDL y TypeScript/build cuando correspondan. Protocolo2026-11-19: suites completas solo por fase/entrega estable/cambio transversal justificado, sin repetir verificaciones vigentes ni capturas generales.

D2 está verificado y publicado antes de código E. Contrato acordado para implementación: máximo 20 activas por producto incluyendo variantes; prioridad específica de contexto, menor número y menor ID como antigüedad; fechas locales inclusivas. PriceContext versión 2 solo cuando hay promoción aplicada, con base_amount y promotion copiados (id/nombre/revisión/tipo/valor/descuento/prioridad/vigencia/contexto/zona/fecha local). amount es base efectiva; versión 1 anterior sin promoción permanece legible. CatalogPricing reutiliza CatalogPriceResolver y aplica promoción separada; referencias de combo optan por base contextual sin promoción. No cambiar fórmula de venta ni versión tributaria. Esta definición no declara promociones operativas.
