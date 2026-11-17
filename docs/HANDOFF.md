# Continuidad de Nexora POS

## Estado actual y referencia inicial

- Rama main; HEAD y origin/main a487f235649d2a7cf769b317a66229e8beabdd6a, árbol inicialmente limpio. Versión 0.5.0; no existen avances posteriores a la revisión aportada.
- Módulos anteriores preservados; revisar PROGRESS y SALES para alcance real.
- 2.1-A completada: migración 000006 aplicada, versión 0.6.0; métodos, pagos/referencias manuales, snapshot y devolución por método histórico. Backend 90/684 SQLite/MariaDB; suite completa 10 Playwright, build/TypeScript/Prettier/Pint/Composer correctos. Capturas de métodos/recibo no efectivo revisadas. Publicación mediante commit/push normal; comprobar git log/origin al reanudar.
- CONT-01 completado y publicado en 942ce39. php -l correcto; 82/591 volvieron a pasar en SQLite y MariaDB con el script adaptado. Bases aisladas conservadas: nexora_test_7560b20e6e7961ea y nexora_test_669b0ab734efe31d. No se ejecutó DROP DATABASE.
- 2.1-A publicada en 0969e57, posterior a 942ce39. 2.1-B completada: migración 000007 aplicada, 100 pruebas/808 aserciones SQLite/MariaDB y suite completa 11 Playwright aprobadas. Incluye abono→lote mixto con respuesta perdida→devolución→cierre. Build/TypeScript/Prettier/Pint/Composer correctos; capturas revisadas y modal compacto al asignar todo el saldo. Incremento 0.7 preparado para commit/push normal; verificar log/origin al reanudar.
- 0.7 publicada en f414bd1. 2.1-C completada: migración 000008 aplicada, porcentaje/tip voluntario conectados (SaleAdjustmentRules/SaleAdjustments); 108/891 SQLite/MariaDB, suite completa 12 Playwright, build/TypeScript/Prettier/Pint/Composer correctos. Tip deshabilitado inicialmente, base explícita, sales.tips y confirmación de voluntariedad persistida. Total fijo desde primer pago, abonos/devolución preservados. 0.8 preparada para commit/push normal; comprobar log/origin al reanudar.
- 0.8 publicada en 29dc13c. 2.1-D1 completada: devolución parcial implementada por pago con RecordRefunds compartido, estado/netos y cierre de remanentes. Migración 000009 aplicada; 122/1097 SQLite/MariaDB, Pint/Composer/build/formato y capturas correctos. Suite completa 13 Playwright aprobada (9.2 min), incluida nueva devolución→abono→remanente→cierre. 0.9 preparada para commit/push normal; comprobar git log/origin al reanudar. Activa D2 en análisis, continuar sin preguntar.
- Nuevas bases aisladas conservadas: nexora_test_c55f70e344b2f2da (120/1070) y nexora_test_850420c7ee770e3f (122/1097).
- 0.9 publicada en 4c80dee. D2 completada: SplitAccounts/sale_accounts, account_id/FK y límites por parte, cotización/selección de parte, recibo e historial. Migración 000010 aplicada, 136/1260 SQLite/MariaDB, suite completa 14 Playwright (10.0 min) y Pint/Composer/build/formato correctos. 0.10 preparada para commit/push normal; comprobar git log/origin al reanudar. Base aislada nexora_test_62107b358ab9bfdb conservada. Captura móvil split-receipt-mobile revisada. Activa E1 en análisis.
- 0.10 publicada en fa51e97. E1 completada: IncludedTax, modo inclusive, calculation_version 2, UI/configuración/recibo y pruebas. 144/1357 SQLite/MariaDB correctos en nexora_test_41ab664d56d22c58 conservada. Suite completa 14 Playwright aprobada (10.8 min), migración 000011 aplicada, doctor/DDL/build/formato/Pint/Composer y captura móvil correctos. 0.11 preparada para commit/push normal; comprobar git log/origin al reanudar. Activa E2 en análisis, aún sin código; no declarar varios impuestos por producto completados.
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

## Bloque 2.1-D1 completado

PartialRefund/RecordRefunds implementados: importes aplicados por payment, no devolución de productos ni nota fiscal. Migración 000009 permite varias compensaciones por payment conservando FK/registros. Importe positivo ≤ payment.amount − devoluciones previas; lote atómico, revisión de venta/caja, UUID, sales.refund y referencias no efectivas. Solo cash genera egreso y requiere fondos. RefundCash devuelve remanentes y valida sesión al cerrar deuda sin dinero, sin movimiento cero.

SaleBalance mantiene total original: net_paid = paid − refunded; effective_total = total − refunded − saldo_cancelado; balance_due sigue total − paid mientras esté abierta. AddPayments/RecordPayments aceptan deuda tras devolución parcial y conservan estado partially_refunded. Resource muestra refundable/refunded por pago. UI nueva PartialRefundModal y recibo; useSalesCash por instancia de formulario evita revisión en caché de una operación previa. REFUNDS.md define alcance exacto. 122/1097 SQLite/MariaDB y suite completa 13 Playwright correctos, incluyendo errores de referencia/caché corregidos antes de cerrar. Permiso sales.refund renombrado para incluir ambas devoluciones; db:seed sincronizó solo catálogo técnico.

## Bloque 2.1-D2 completado

SplitAccounts::plan distribuye total confirmado en centavos entre 2–20 partes, sobrantes a primeras; crea partes dentro de CollectCash antes del primer pago. SaleAccount append-only, FK tenant/sale/account en payments; no hay API de división posterior o reasignación. RecordPayments limita acumulados de parte/globales y conserva reglas de devolución. balances() deriva saldos/netos por cuenta sin float ni SUM de SQLite. Resource añade accounts[] y payment.account_id, null para legado; todos los endpoints cargan cuentas.

Checkout permite dividir y elegir parte antes de pagar, cuota predeterminada si no se cambia importe. AddPayments elige parte de cada línea y limita borrador, PaymentHistory/recibo muestran asignaciones y saldos. SPLIT_ACCOUNTS.md documenta alcance y límites. 136/1260 SQLite/MariaDB y suite completa 14 Playwright correctos. Continuar E1 (impuesto incluido global, fórmula explícita/versionada) y E2 (varios impuestos por producto/snapshots/cálculo por líneas); TASKS desglosó E para no entregar un bloque grande sin verificar. Resto de fases pendientes en TASKS.md.

## Bloque 2.1-E1 completado

IncludedTax::extract usa BCMath/18 decimales, base half-up e impuesto por diferencia. SaleTotals admite inclusive con total = subtotal − descuento + propina; si la propina participa, su importe ya contiene impuesto. Versiones 1 (historia/none/exclusive) y 2 (inclusive), inmutables en Sale. DTO prohíbe versión enviada por cliente. Settings/receipt frontend muestran modo/tasa/base incluida; campos anteriores compatibles. 144/1357 SQLite/MariaDB y suite completa 14 Playwright (10.8 min) correctos. Continuar E2 tras commit/push 0.11 normal autorizado.

E2 aún no tiene código. PRODUCT_TAX_PLAN.md registra diseño a revisar: perfiles versionados, snapshot por línea de pedido y revisión de perfil, reparto exacto de centavos/descuento por mayores restos, desglose incluido/adicional, propina con perfil explícito en modo por producto y versión 3. Conservar versiones/modos anteriores. La suite ya registra 10 empresas; reutilizar fixture/empresa adecuada sin desactivar límites. No presentar diseño como implementado.
