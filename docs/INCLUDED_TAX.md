# Impuesto incluido global (0.11)

## Configuración explícita

Ventas → Configurar ventas permite elegir **Impuesto incluido en los precios**, nombre y tasa de 0 a 100 con hasta cuatro decimales. Requiere sales.configure, revisión actual y confirmación. No asigna régimen ni tasa legal. Los modos anteriores none/exclusive conservan su fórmula.

En este modo el precio final del catálogo ya contiene el impuesto. El descuento reduce ese importe antes de extraer la base; el impuesto extraído se muestra en el recibo, sin sumarlo otra vez al total. Esta es una regla global para el cobro. Desde 0.12, PRODUCT_TAXES.md define perfiles/varios impuestos por producto como modo separado, versión 3.

## Fórmula de cálculo, versión 2

Se redondea el subtotal global half-up a dos decimales como antes. El descuento fijo o porcentual se aplica a ese subtotal y conserva sus snapshots. Sean A el subtotal redondeado menos descuento y P la propina aceptada:

- Total final = A + P.
- Si la propina participa (tip_tax_mode=included), el importe participante G = A + P; si queda fuera (excluded/disabled), G = A.
- Base extraída = round_half_up(G × 100 / (100 + tasa), 2).
- Impuesto incluido = G − base extraída. Se obtiene por diferencia para conservar exactamente el importe final, incluso con centavos/mitades; no se redondean ambos por separado.
- Las operaciones usan cadenas y BCMath con 18 decimales al dividir, sin float. Se conserva DECIMAL(19,4) y el límite monetario actual.

Si participa una propina de 5.25, ese importe aceptado ya contiene su parte del impuesto; no genera un cobro adicional. La configuración explica este tratamiento y la voluntariedad/permiso/consentimiento positivo siguen siendo obligatorios. No se reparte la propina entre empleados ni se infiere una política tributaria legal.

Ejemplo con tasa de prueba de 10 %, no recomendación legal: catálogo 100.0050 → subtotal 100.01; descuento 10.01; propina 5.25. Total final 95.25. Si la propina participa, base 86.59 e impuesto 8.66. Si queda fuera, base 81.82 e impuesto 8.18; el total sigue en 95.25. Una caja con base 1000.00 recibe ingreso neto de 95.25, no 103.91. Con recibido 100.00, cambio 4.75.

## Historia y operación

Migración 000011 agrega sales.calculation_version con valor 1 para todas las filas anteriores. La fórmula incluida se guarda con versión 2; none/exclusive continúan en versión 1. Campo inmutable y elegido por servidor, no aceptado del cliente. Los snapshots originales de tasa/modo/base/impuesto/total siguen inmutables.

Cambiar configuración afecta las próximas cotizaciones/cobros aún no confirmados, con revisión de settings y total esperado. No cambia ventas existentes ni sus abonos, cuentas, devoluciones o recibos. Una diferencia de revisión se rechaza aunque el total coincida y solo cambie la distribución entre base/impuesto.

Abonos y partes iguales se aplican al total final. Las devoluciones compensan pagos y mantienen el desglose tributario original; no son notas fiscales ni un reparto de impuesto por devolución. Solo cash mueve efectivo. No hay validación DIAN ni confirmación de proveedores. Los impuestos por producto usan su contrato separado desde 0.12.

## Verificación

Pruebas: extracción sin doble adición, descuento fijo/porcentual, participación/exclusión de propina, confirmación y consentimiento, revisión, versión histórica, centavos/mitades/extremos, abonos con división y devoluciones parciales/completas. El recorrido Chromium existente de ajustes se amplió usando la misma empresa de prueba: configuración incluida→venta→cambio de configuración sin alterar recibo→devolución→cierre. Mantiene pruebas reales del registro y sus límites, sin crear más registros ni desactivar validaciones. Resultados finales en PROGRESS/PROJECT_STATE.

Verificación completada: 144/1357 SQLite/MariaDB y suite completa 14 Playwright (10.8 min). Migración aplicada, doctor/DDL/build/TypeScript/Prettier/Pint/Composer y captura móvil correctos.
