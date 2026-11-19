# Promociones de catálogo · 0.21

Reglas propias de producto/presentación con nombre, contexto sucursal/canal, descuento fijo o porcentual, prioridad, fechas locales inclusivas y archivo paginado. Hasta 20 activas por producto incluyendo sus variantes. Identidad producto/presentación/contexto estable; archivar/crear para mover. Las variantes no heredan promociones del producto base.

Gana una sola regla: sucursal+canal, sucursal, canal y general; después menor prioridad y menor ID (antigüedad). No se apilan promociones. CatalogPricing reutiliza CatalogPriceResolver y aplica PromotionResolver por lote con el mismo instante/zona que la disponibilidad al registrar. Fechas sin horas: valid_from/valid_until opcionales en zona de empresa y último día incluido.

## Base y dinero

Primero resolver base contextual, después calcular descuento promocional. Fijo con cuatro decimales; porcentaje de 0 a 100 con dos. Redondear el descuento half-up a cuatro decimales y limitarlo a la base; restarlo y sumar adicionales completos. BCMath y cadenas, sin float ni precios negativos. Una base gratuita con adicionales puede producir importe positivo; el cobro de total cero sigue rechazado por la política existente.

En combos se promociona la base de raíz una vez, antes del reparto existente. Las hojas mantienen referencia contextual sin promoción individual para ponderar; cada adicional/perfil sigue en su posición facturable. No restar otra vez la promoción al cobrar ni sumar cabecera como posición adicional.

El descuento manual de venta se aplica después sobre el subtotal ya promocionado con permiso/motivo existentes. Los perfiles, redondeo a centavos, propina explícita, cuentas, abonos y devoluciones mantienen sus fórmulas/versiones.

## API y snapshots

Bajo `/api/v1/products/{product}`: GET/POST `promotions`; PUT `promotions/{promotion}` con bindings propios. GET acepta variant_id propio, estado y páginas de hasta 50. POST define presentación/sucursal/canal; PUT prohíbe cambiar esa identidad. Reutiliza permisos catalog.view/manage y protege costos. Mutaciones exigen UUID, revisiones de producto/regla, moneda y zona esperadas, Tenant lock y auditoría transaccional; autorización antes de replay. Máximo 20 activas y FK tenant/product/variant/branch.

PriceContext versión 2 cuando aplica promoción: amount es base efectiva, base_amount es contextual anterior, promotion copia identidad/nombre/revisión/tipo/valor/descuento/prioridad/fechas/contexto/zona/fecha local. Sin promoción conserva versión 1 anterior. OrderItem.price_snapshot y cabecera de combo copian el contexto. Preview no reserva vigencia; expectativas estrictas detectan expiración/cambio antes de registrar. Reintento ya registrado, preparación, cobro y devoluciones conservan precio histórico, aunque la regla se archive o expire.

## Interfaz y alcance

Ficha con panel paginado y archivo; variantes usan el panel de «Ver precios». Formularios conservan revisiones y cuerpo/UUID tras respuesta incierta. Menú, preparaciones, carrito, revisión y recibo identifican promoción y base antes/después. Revisar contexto conserva cantidad/notas/opciones y exige aceptación de cambios visibles; no solicita revisión solo porque cambia la fecha local de una promoción aún idéntica.

Sin promociones por cantidad/2x1, cupones/clientes, envío de campañas ni fidelización en este incremento. La historia fiscal, pasarelas y stock siguen sus módulos originales.

## Verificación dirigida

PromotionTest comprueba precedencia/empates, decimales/extremos/cero/límite, identidad/revisiones/UUID/moneda/zona, fechas locales y expiración entre preview/registro, variantes propias, combo sin doble descuento, límites/archivo, permisos/FK/tenant/auditoría y rollback. Caso financiero: adicionales, impuesto incluido, descuento manual separado, cuentas, abonos/replay, compensación parcial/completa y caja histórica. Regresiones dirigidas de precios contextuales, combos y horarios; Chromium de promociones/contexto/reintento/cobro/móvil. Resultados ejecutados en PROJECT_STATE/HANDOFF; no sustituirlos por promesas de cobertura.
