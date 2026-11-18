# Historial de pagos (0.13; ampliado en 0.14)

## Uso y alcance

Ventas → **Historial de pagos** muestra una fila por payment: recibo/estado, sucursal y cuenta históricas, fecha, método/tipo/referencia originales, importe aplicado, devolución acumulada y neto conservado. Se puede abrir el recibo; la sesión de caja se enlaza solo para quien tiene cash.view. La consulta exige sales.view y no entrega saldos esperados de caja a ese lector.

Filtros de sucursal (incluidas inactivas), tipo cash/non_cash, referencia literal y fechas, con paginación de servidor de 1–50 filas (UI: 12). Limpiar/aplicar filtros actualiza la consulta; estados de carga/error/vacío explícitos. Métodos renombrados/archivados siguen apareciendo con su nombre original. Los pagos no efectivos continúan siendo registros manuales del operador, sin confirmación de proveedor.

## Significado de fechas e importes

- **Las fechas filtran el registro del pago.** Las devoluciones mostradas son el acumulado actual de ese pago, aunque se hayan registrado en otra fecha. No es un flujo de devoluciones del período.
- El servidor interpreta las fechas en la zona de la empresa. Convierte sus medianoches a la zona configurada de la aplicación para consultar los timestamps SQL existentes; no asume UTC ni cambia datos históricos. El límite hasta es exclusivo de la siguiente medianoche. La respuesta comunica la zona efectiva y la UI la usa también al mostrar horas.
- La aplicación existente usa APP_TIMEZONE con predeterminado America/Bogota; Eloquent serializa datetimes JSON en UTC. No cambiar esta configuración para reinterpretar timestamps guardados. Las pruebas cubren medianoche y empresa en Europe/Madrid.
- Aplicado = payment.amount, neto de cambio entregado, no todo el efectivo recibido. Devuelto = suma BCMath de compensaciones enlazadas a ese payment. Neto conservado = aplicado − devuelto.
- **Resumen de esta página** suma solo filas visibles, agrupadas por moneda. No repite el total de una venta por cada abono ni presenta una suma global del filtro como si fuera completa. Es resumen de pagos y sus compensaciones, no ganancias ni una conciliación bancaria.
- Sumas como cadenas con BCMath, sin float ni SUM monetario de SQLite. Los agregados pueden superar el límite de una transacción DECIMAL sin truncarse; no se guardan como movimientos.

Cobrar/devolver invalida esta consulta. Al volver a la pantalla se solicita información actual; si se actualiza en segundo plano se indica. El recibo conserva el detalle original de pagos/devoluciones.

## API y almacenamiento

GET finance/payments admite branch_id, method_kind, reference, from/to (Y-m-d), page y per_page. tenant deriva de sesión; se rechaza tenant_id enviado. Sucursal debe ser de la empresa. Las referencias escapan %, _ y ! en LIKE para búsqueda literal. La respuesta incluye data/meta de paginación, summary por moneda de esa página y timezone efectivo.

PaymentBalance centraliza devoluciones/neto por pago; PaymentHistory filtra/pagina y suma con BCMath. Los recursos seleccionan datos financieros históricos, sin saldos de caja ni información de costo/credenciales. No escriben pagos, ventas, caja, auditoría o idempotencia durante la consulta.

Migración 000013 añade índices de consulta por empresa/fecha/id y empresa/sucursal/fecha/id. No modifica filas; su descenso solo retira esos índices de consulta. Las restricciones e historia financieras no cambian.

## Verificación y continuación

0.13 verificada: 165 pruebas/1645 aserciones SQLite/MariaDB correctas, esquema nexora_test_dc7e6176f39abc91 conservado. Suite completa 16 Playwright aprobada (13.2 min), incluidos 14 pagos/paginación, resumen de página, caracteres literales de referencia, método archivado, vacío por fecha futura, recibo/devolución y netos actualizados/móvil.

0.14 añade revisión humana de no efectivos, permiso e historial independientes e importe observado/referencia. review_status filtra estados antes de paginar; review_revision/latest_review informan la última declaración. Contrato en [PAYMENT_REVIEWS.md](PAYMENT_REVIEWS.md). La revisión humana nunca afirma confirmación de un banco/pasarela.
