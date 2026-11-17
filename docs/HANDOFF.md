# Continuidad de Nexora POS

## Estado al iniciar la continuación autónoma

- Rama main; HEAD y origin/main a487f235649d2a7cf769b317a66229e8beabdd6a, árbol inicialmente limpio. Versión 0.5.0; no existen avances posteriores a la revisión aportada.
- Módulos anteriores preservados; revisar PROGRESS y SALES para alcance real.
- 2.1-A completada: migración 000006 aplicada, versión 0.6.0; métodos, pagos/referencias manuales, snapshot y devolución por método histórico. Backend 90/684 SQLite/MariaDB; suite completa 10 Playwright, build/TypeScript/Prettier/Pint/Composer correctos. Capturas de métodos/recibo no efectivo revisadas. Publicación mediante commit/push normal; comprobar git log/origin al reanudar.
- CONT-01 completado y publicado en 942ce39. php -l correcto; 82/591 volvieron a pasar en SQLite y MariaDB con el script adaptado. Bases aisladas conservadas: nexora_test_7560b20e6e7961ea y nexora_test_669b0ab734efe31d. No se ejecutó DROP DATABASE.
- Tarea activa 2.1-B: comienza el análisis de parciales/mixtos sobre el dominio actual. Aún no implementada ni anunciada como operativa en 0.6. Próxima 2.1-C.
- No hay bloqueos locales conocidos. Pasarelas, DIAN, hardware, SMTP, MySQL 8 y EER requieren entorno externo y se registran sin bloquear tareas independientes.

## Entorno y precauciones

Windows/PowerShell; PHP 8.3, Laravel 13, React/TypeScript/Vite, MariaDB XAMPP. Nexora backend 8001, frontend 5173; pruebas 8011/5199. Horizonte usa 8000: no intervenirlo. Credenciales solo en backend/.env, nunca imprimirlas ni subirlas.

Pruebas SQL únicamente con scripts/test-mysql.php: crea un esquema nuevo y lo conserva según nueva prohibición de DROP DATABASE. TestCase verifica marca/nombre antes de RefreshDatabase. No ejecutar pruebas contra la base de trabajo. SQLite/E2E tienen almacenamiento dedicado.

## Reanudar

Leer AGENTS y documentos requeridos, git status/log/remote y PROJECT_STATE/TASKS. Inspeccionar cualquier cambio local antes de editar. Completar criterios del incremento, pruebas, documentación y commit/push normal autorizado; continuar con el siguiente elegible. Registrar aquí resultados exactos y cambios pendientes antes de cualquier límite real de ejecución/contexto.

## Próximo bloque elegible: 2.1-B

Desglosar abonos/múltiples pagos sobre sales/payments actuales. Preservar API de cobro único 0.5–0.6, recibos, importes y procedencia manual. Quitar unicidad tenant/sale de payments mediante migración incremental, agregar revisión de venta, usar sumas BCMath contra saldo bajo bloqueo y permitir un comando mixto atómico con UUID. Mantener caja abierta por sucursal/moneda y movimiento exclusivamente para efectivo. La revisión de sesión debe comprobarse una vez y avanzar internamente en operaciones del mismo comando sin aceptar revisiones arbitrarias.

Antes de declarar B completado, adaptar recibos a varios pagos y la devolución total a los cobros efectivamente registrados por método, preservando registros anteriores. Evitar devolver saldo nunca pagado. Incluir E2E con abono, saldo, segundo método, rechazo de sobrepago/reintento, historial y cierre de efectivo correcto. No crear un segundo sistema de ventas ni confirmar proveedores externos.
