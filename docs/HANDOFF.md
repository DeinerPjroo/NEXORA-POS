# Continuidad de Nexora POS

## Estado actual y referencia inicial

- Rama main; HEAD y origin/main a487f235649d2a7cf769b317a66229e8beabdd6a, árbol inicialmente limpio. Versión 0.5.0; no existen avances posteriores a la revisión aportada.
- Módulos anteriores preservados; revisar PROGRESS y SALES para alcance real.
- 2.1-A completada: migración 000006 aplicada, versión 0.6.0; métodos, pagos/referencias manuales, snapshot y devolución por método histórico. Backend 90/684 SQLite/MariaDB; suite completa 10 Playwright, build/TypeScript/Prettier/Pint/Composer correctos. Capturas de métodos/recibo no efectivo revisadas. Publicación mediante commit/push normal; comprobar git log/origin al reanudar.
- CONT-01 completado y publicado en 942ce39. php -l correcto; 82/591 volvieron a pasar en SQLite y MariaDB con el script adaptado. Bases aisladas conservadas: nexora_test_7560b20e6e7961ea y nexora_test_669b0ab734efe31d. No se ejecutó DROP DATABASE.
- 2.1-A publicada en 0969e57, posterior a 942ce39. 2.1-B completada: migración 000007 aplicada, 100 pruebas/808 aserciones SQLite/MariaDB y suite completa 11 Playwright aprobadas. Incluye abono→lote mixto con respuesta perdida→devolución→cierre. Build/TypeScript/Prettier/Pint/Composer correctos; capturas revisadas y modal compacto al asignar todo el saldo. Incremento 0.7 preparado para commit/push normal; verificar log/origin al reanudar.
- 0.7 publicada en f414bd1. 2.1-C completada: migración 000008 aplicada, porcentaje/tip voluntario conectados (SaleAdjustmentRules/SaleAdjustments); 108/891 SQLite/MariaDB, suite completa 12 Playwright, build/TypeScript/Prettier/Pint/Composer correctos. Tip deshabilitado inicialmente, base explícita, sales.tips y confirmación de voluntariedad persistida. Total fijo desde primer pago, abonos/devolución preservados. 0.8 preparada para commit/push normal; comprobar log/origin al reanudar.
- Activa 2.1-D1 en análisis: devolución parcial por pago. Aún no implementada en 0.8. Después D2 división en partes iguales; se desglosó el incremento D para mantener entregas pequeñas y funcionales.
- Base aislada adicional conservada: nexora_test_0721acbd9026822f (108/891).
- Más bases aisladas conservadas: nexora_test_1d49b406046f4b00 (98/789) y nexora_test_8cd3a7a39e8b9b0a (100/808). Ninguna se eliminó.
- No hay bloqueos locales conocidos. Pasarelas, DIAN, hardware, SMTP, MySQL 8 y EER requieren entorno externo y se registran sin bloquear tareas independientes.

## Entorno y precauciones

Windows/PowerShell; PHP 8.3, Laravel 13, React/TypeScript/Vite, MariaDB XAMPP. Nexora backend 8001, frontend 5173; pruebas 8011/5199. Horizonte usa 8000: no intervenirlo. Credenciales solo en backend/.env, nunca imprimirlas ni subirlas.

Pruebas SQL únicamente con scripts/test-mysql.php: crea un esquema nuevo y lo conserva según nueva prohibición de DROP DATABASE. TestCase verifica marca/nombre antes de RefreshDatabase. No ejecutar pruebas contra la base de trabajo. SQLite/E2E tienen almacenamiento dedicado.

## Reanudar

Leer AGENTS y documentos requeridos, git status/log/remote y PROJECT_STATE/TASKS. Inspeccionar cualquier cambio local antes de editar. Completar criterios del incremento, pruebas, documentación y commit/push normal autorizado; continuar con el siguiente elegible. Registrar aquí resultados exactos y cambios pendientes antes de cualquier límite real de ejecución/contexto.

## Bloque 2.1-B completado

Implementados RecordPayments, AddPayments y SaleBalance; API anterior compatible, abono inicial opcional y lotes posteriores de hasta 20 pagos. Revisión de venta/saldo/caja y movimientos solo para efectivo. Historial y compensaciones por payment original. Las sumas BCMath no usan SUM de SQLite.

El recibo muestra saldo y pagos con fechas; devolver cierra venta, compensa importes realmente aplicados y cancela saldo nunca cobrado por separado. Aliases payment/refund conservan primer objeto; nuevos arrays payments/refunds y paid_amount/balance_due/refunded_amount/cancelled_balance. No repetir esta implementación.

## Bloque 2.1-C completado

SaleTotals/SaleAdjustmentRules calculan porcentaje y tip; fijo compatible. Settings tip_enabled=false/tip_tax_mode=null inicialmente; habilitar exige modo included/excluded explícito sobre base adicional. sales.tips y aceptación voluntaria positiva, snapshot/auditoría. Sin distribución a empleados ni asignación de abonos entre productos/tip. ADJUSTMENTS.md contiene fórmula y límites. No repetir la implementación.

## Próximo bloque elegible: 2.1-D1

Devolución parcial de importes aplicados por payment, no devolución de productos ni nota fiscal. Migración nueva que permita varias compensaciones por payment, conservando FK y registros anteriores. Cada importe positivo ≤ payment.amount − devoluciones previas; lote atómico, revisión de venta/caja, UUID, sales.refund y referencias no efectivas. Solo cash genera egreso y requiere fondos.

Mantener total original inmutable. Saldos: net_paid = paid − refunded; effective_total = total − refunded − saldo_cancelado; balance_due sigue total − paid mientras la venta esté abierta: devolver no genera deuda nueva. Estado de devolución parcial, historial y límites. Devolución completa posterior compensa solo el remanente, sin duplicar lo ya devuelto, y cancela saldo no cobrado explícitamente. Adaptar AddPayments/RecordPayments si queda deuda después de una devolución parcial. Comprobar E2E, sobredevolución, referencias/tenant, rollback y compatibilidad 0.8 antes de publicar.

D2 será división en partes iguales antes del primer pago, asignaciones dentro de la misma venta y saldos por parte; sin múltiples facturas ni reasignar pagos históricos. Resto de fases pendientes en TASKS.md.
