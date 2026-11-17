# Descuentos y propinas voluntarias (0.8)

## Descuento fijo o porcentual

Al cotizar/cobrar, elegir tipo fixed o percentage. La API anterior sin tipo sigue usando descuento fijo. Para porcentaje se envía discount_value, cadena de 0 a 100 con hasta dos decimales, y no se acepta un discount_amount calculado por cliente. El servidor aplica el porcentaje al subtotal global ya redondeado a dos decimales y redondea el descuento half-up. Motivo y sales.discount obligatorios si se solicita un descuento positivo.

La venta conserva discount_type, discount_value y discount_amount derivado. El porcentaje no se recalcula si cambia el catálogo o la configuración. Descuentos porcentuales por producto o promociones automáticas aún no forman parte de este incremento.

## Habilitación y consentimiento de propina

Las empresas nuevas/existentes comienzan con tip_enabled=false. En Ventas → Configurar ventas, la persona con sales.configure puede habilitar el registro de propinas voluntarias y debe elegir explícitamente su tratamiento en la base del impuesto adicional: excluded o included. La confirmación general de configuración queda auditada. No se asigna una política tributaria ni una tasa legal automática; la empresa elige el cálculo que corresponda a su operación.

tip_tax_mode=included significa que la propina participa en el impuesto elegido por la empresa; no selecciona por sí mismo el modo de precios. En exclusive se añade el impuesto calculado sobre esa base. Desde 0.11, tax_mode=inclusive extrae el impuesto del importe aceptado, incluida la propina si participa, sin otro cobro. Fórmula en INCLUDED_TAX.md. Desde 0.12, modo por producto exige un perfil explícito de propina participante; PRODUCT_TAXES.md define su snapshot y cálculo.

El importe de propina es fijo y opcional, inicialmente cero. Un importe positivo requiere sales.tips y tip_confirmed aceptado: el operador declara que el cliente lo aceptó voluntariamente. La UI exige esa confirmación antes de habilitar el cobro. Se conserva tip_confirmed en la venta y auditoría; esto no es verificación externa del consentimiento ni entrega de dinero a empleados.

No se agrega una propina porcentual ni un valor automático, ni se habilita solo por tener permiso. Deshabilitar propinas o cambiar su tratamiento no altera recibos anteriores. Los roles existentes reciben sales.tips automáticamente solo en propietario; otros se configuran explícitamente.

## Fórmulas y ejemplo de prueba

Esta fórmula corresponde a none/exclusive, versión 1. La versión 2 de precios con impuesto incluido mantiene subtotal/descuento/consentimiento, pero total = subtotal − descuento + propina y extrae impuesto por diferencia; no sumarlo otra vez. INCLUDED_TAX.md contiene fórmula y ejemplos.

BCMath, importes como cadenas y redondeo half-up a dos decimales:

1. subtotal = redondear suma histórica del pedido.
2. descuento fijo, o redondear(subtotal × porcentaje / 100).
3. base de productos = subtotal − descuento.
4. base de impuesto = base de productos + propina si se confirmó included; sin propina si excluded.
5. impuesto adicional = redondear(base × tasa / 100), o cero si no se configuró impuesto adicional.
6. total = base de productos + propina + impuesto. El descuento no reduce la propina; total positivo y rango DECIMAL controlado.

Ejemplo automatizado, no una tasa recomendada: producto 100.0050 → subtotal 100.01; descuento 12.50 % → 12.50; base productos 87.51; propina voluntaria 5.25; tasa de prueba 8.1250 %. Excluded produce impuesto 7.11 y total 99.87. Included produce base 92.76, impuesto 7.54 y total 100.30.

## Pagos, historia y límites

Los ajustes se fijan al crear la venta/primer pago. Los pagos posteriores no aceptan campos de descuento/propina ni recotizan el total. Continúan las reglas de abonos/mixtos, revisión/idempotencia y compensación de cobros de PAYMENTS.md. La devolución de todos los cobros compensa únicamente el dinero aplicado, sin devolver saldo nunca pagado.

tip_amount es el importe voluntario pactado para la venta, no prueba de que esté cobrado completo cuando hay saldo pendiente. Los abonos se imputan al total global; no hay asignación de cada abono entre productos/propina ni distribución/liquidación a empleados. Los futuros reportes deben separar propinas de importes de productos y evitar tratarlas como ganancia definitiva.

No hay cambio de ajustes después de cobrar, reparto por empleado, liquidación de propinas, cargos de servicio automáticos, regulación tributaria automática ni documentos fiscales. Snapshot inmutable, permisos, tenant, confirmación, rango y compatibilidad están cubiertos por pruebas; E2E verifica configuración/consentimiento, porcentaje/total, recibo móvil, cambio de política sin alterar recibo y devolución/cierre.
