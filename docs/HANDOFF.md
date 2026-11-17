# Continuidad de Nexora POS

## Estado actual y referencia inicial

- Rama main; HEAD y origin/main a487f235649d2a7cf769b317a66229e8beabdd6a, árbol inicialmente limpio. Versión 0.5.0; no existen avances posteriores a la revisión aportada.
- Módulos anteriores preservados; revisar PROGRESS y SALES para alcance real.
- 2.1-A completada: migración 000006 aplicada, versión 0.6.0; métodos, pagos/referencias manuales, snapshot y devolución por método histórico. Backend 90/684 SQLite/MariaDB; suite completa 10 Playwright, build/TypeScript/Prettier/Pint/Composer correctos. Capturas de métodos/recibo no efectivo revisadas. Publicación mediante commit/push normal; comprobar git log/origin al reanudar.
- CONT-01 completado y publicado en 942ce39. php -l correcto; 82/591 volvieron a pasar en SQLite y MariaDB con el script adaptado. Bases aisladas conservadas: nexora_test_7560b20e6e7961ea y nexora_test_669b0ab734efe31d. No se ejecutó DROP DATABASE.
- 2.1-A publicada en 0969e57, posterior a 942ce39. 2.1-B completada: migración 000007 aplicada, 100 pruebas/808 aserciones SQLite/MariaDB y suite completa 11 Playwright aprobadas. Incluye abono→lote mixto con respuesta perdida→devolución→cierre. Build/TypeScript/Prettier/Pint/Composer correctos; capturas revisadas y modal compacto al asignar todo el saldo. Incremento 0.7 preparado para commit/push normal; verificar log/origin al reanudar.
- Tarea activa 2.1-C en análisis: descuentos porcentuales y propinas. No están implementados ni se anuncian en 0.7. Próxima 2.1-D.
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

## Próximo bloque elegible: 2.1-C

Extender SaleTotals y configuración existentes. Descuento porcentual se calcula en servidor y se redondea half-up, conserva tipo/valor y descuento derivado en snapshot; fijo anterior compatible y permiso sales.discount vigente. Propina voluntaria inicialmente deshabilitada, activación y tratamiento de base explícitos en configuración de empresa, sin asumir régimen legal; importe fijo/confirmación expresa, nunca imponerla automáticamente. No cambiar total después de primer pago. Mantener abonos/mixtos/refund y recibos anteriores. Desglosar antes de codificar y verificar backend/UI/E2E como los incrementos previos.
