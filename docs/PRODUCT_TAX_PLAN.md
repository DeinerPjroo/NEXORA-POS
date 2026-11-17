# 2.1-E2 · Diseño pendiente de impuestos por producto

Diseño implementado/verificado en 0.12; contrato vigente en PRODUCT_TAXES.md y resultados en PROGRESS. Este documento conserva el diseño de referencia. E1 agrega impuesto incluido global; E2 añade perfiles/snapshots/cálculo por líneas conservando los modos none/exclusive/inclusive y calculation_version 1/2.

## Resultado previsto

Perfiles por empresa con nombre, modo de precio inclusive/exclusive, lista acotada de 1–5 impuestos paralelos con nombre y tasa explícita (0–100, hasta cuatro decimales), estado/revisión. Sin tasas predeterminadas, interpretación legal, cascadas/retenciones ni borrado. Gestión con sales.configure; asignación a productos con catalog.manage; variantes heredan del producto inicialmente. Configuración activa de cálculo por producto, cotización y recibo desglosado; sin declarar funcional una configuración que todavía no se aplique al cobro.

Mantener entregas funcionales pequeñas si se subdivide: catálogo/configuración y snapshots deben tener consumo visible; completar el cálculo antes de anunciar impuestos por producto operativos.

## Persistencia y revisiones propuestas

- tax_profiles tenant, name, price_mode, rates JSON validado, is_active y revision; FK compuesta tenant/profile en products.tax_profile_id nullable. Guardado bajo bloqueo de empresa, revisión/auditoría y creación idempotente. Archivado no cambia snapshots anteriores.
- ProductResource/controladores cargan perfil/revisión. El editor conserva la revisión del perfil elegido y la del producto; omitir asignación en API anterior conserva el valor. No borrar asignaciones al editar otros campos.
- Al tomar pedido, guardar snapshot por order_item (perfil/nombre/revisión/modo/tasas); ningún cambio de perfil/producto posterior reinterpreta el pedido. Productos sin perfil tienen snapshot explícito de ausencia para pedidos nuevos; filas antiguas quedan null.
- CreateOrder ya serializa por empresa. Comprobar expected_tax_revision junto a product_revision/precio, para detectar un perfil cambiado aunque el producto no haya cambiado. Perfil archivado asignado no se puede usar silenciosamente como tasa cero; exigir revisión/asignación válida. Rechazar enlaces de otro tenant.
- Antes de activar tax_mode=product, resolver pedidos legados sin snapshot aún no vendidos/cancelados; no adivinar su impuesto. Comprobar esta condición bajo el bloqueo común. Los pedidos nuevos pueden conservar explícitamente la ausencia de perfil.
- sales.tax_breakdown JSON inmutable y calculation_version=3 conservan distribución/cálculo final; los campos globales anteriores siguen como agregados, sin presentar una tasa única ficticia en la UI. No editar migraciones publicadas ni importes anteriores.

## Cálculo propuesto, revisar con ejemplos y pruebas

1. Mantener subtotal global redondeado, descuento fijo/porcentual y consentimiento como ahora. Los importes de catálogo pueden representar precio final en perfiles inclusive o base en exclusive. No volver a leer precios/tasas actuales al cobrar: usar snapshots del pedido.
2. Repartir subtotal redondeado en centavos entre líneas usando pesos originales de cuatro decimales y método de mayores restos, desempate por orden/id estable. Repartir descuento global en centavos sobre esos subtotales con el mismo método, sin negativos. La suma por líneas debe coincidir exactamente con subtotal/descuento globales.
3. Exclusive: base = subtotal de línea redondeado − descuento asignado; calcular cada impuesto paralelo sobre esa base y redondear half-up cada componente a centavos. Añadirlos al precio.
4. Inclusive: importe participante = subtotal de línea − descuento; extraer base con la suma de tasas y obtener impuesto total por diferencia como IncludedTax. Repartir esos centavos de impuesto entre componentes por sus tasas/mayores restos para que no se sumen centavos ajenos al precio. Todos cero produce componentes cero sin dividir por cero.
5. Sin perfil: la línea no añade impuesto por producto y conserva su importe descontado; ausencia explícita, sin asumir exención legal.
6. Propina excluded no participa. Si included y tax_mode=product, exigir un perfil de propina explícito, con snapshot confirmado en SalesSetting (modo/tasas/nombre/revisión). Inclusive extrae de la propina aceptada; exclusive añade sus impuestos. No inferir el perfil de propina de los productos.
7. La política de propina confirmada debe permanecer estable hasta reconfigurar; al seleccionar un perfil validar su revisión. Mostrar qué snapshot se usa y explicar que cambiar/archivar catálogo de perfiles no reescribe la política ya confirmada. No imponer propina ni retirar consentimiento/permisos.
8. Total = importes de catálogo descontados + propina + impuestos adicionales exclusive; los inclusive ya están contenidos. Mostrar por separado impuestos incluidos/adicionales, base y componentes/por línea. Sumas BCMath y límites DECIMAL; ningún float ni SUM de SQLite.

El repartidor debe trabajar con enteros BCMath (unidades/centavos), cocientes/restos exactos y desempate estable, sin convertir importes grandes a int/float. Solo el número de centavos restantes, menor que la cantidad de líneas/componentes, se convierte a int para distribuir. Money::bounded limita saldos finales. Máximo actual 100 líneas de pedido.

## UI y comprobaciones

Pantalla/picker paginado de perfiles, asignación de producto y datos visibles en detalle/pedido, activación explícita del modo de cálculo y selección de perfil de propina, quote/recibo con desglose y snapshots. Conservar handlers de conflictos y envío incierto. El recibo de versiones 1/2 sigue mostrando exactamente su fórmula anterior.

Probar pesos fraccionarios/centavos, varios perfiles y modos en una venta, todos cero, descuentos completos con propina, límites/overflow, revisión de perfil/pedido/settings, archivado y snapshots, tenant/FK/permisos, rollback de auditoría, abonos/mixtos/partes iguales y devoluciones sin cambiar historia. E2E debe usar fixtures que respeten los límites: la suite actual ya registra 10 empresas por ejecución; reutilizar una empresa del recorrido adecuado o preparar fixtures aislados sin desactivar validaciones de producción.

Ninguna fórmula de este diseño es consejo tributario ni integración fiscal. Ajustar el contrato matemático explícitamente y documentarlo antes de publicar; no introducir tasas legales, DIAN o confirmación externa simuladas.
