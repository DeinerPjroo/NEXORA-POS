# Continuidad de Nexora POS

## Estado al iniciar la continuación autónoma

- Rama main; HEAD y origin/main a487f235649d2a7cf769b317a66229e8beabdd6a, árbol inicialmente limpio. Versión 0.5.0; no existen avances posteriores a la revisión aportada.
- Módulos anteriores preservados; revisar PROGRESS y SALES para alcance real.
- Tarea activa 2.1-A: métodos configurables y cobros/devoluciones manuales no efectivo. Aún sin implementar al crear este documento; no anunciarlo como operativo.
- CONT-01 completado: documentos y protocolo creados; php -l correcto; 82/591 volvieron a pasar en SQLite y MariaDB con el script adaptado. La base aislada nexora_test_7560b20e6e7961ea se conservó. Cambios preparados para commit/push normal; comprobar git log/origin al reanudar.
- Próxima tarea 2.1-B: parciales y mixtos sobre el dominio actual, sin duplicar ventas.
- No hay bloqueos locales conocidos. Pasarelas, DIAN, hardware, SMTP, MySQL 8 y EER requieren entorno externo y se registran sin bloquear tareas independientes.

## Entorno y precauciones

Windows/PowerShell; PHP 8.3, Laravel 13, React/TypeScript/Vite, MariaDB XAMPP. Nexora backend 8001, frontend 5173; pruebas 8011/5199. Horizonte usa 8000: no intervenirlo. Credenciales solo en backend/.env, nunca imprimirlas ni subirlas.

Pruebas SQL únicamente con scripts/test-mysql.php: crea un esquema nuevo y lo conserva según nueva prohibición de DROP DATABASE. TestCase verifica marca/nombre antes de RefreshDatabase. No ejecutar pruebas contra la base de trabajo. SQLite/E2E tienen almacenamiento dedicado.

## Reanudar

Leer AGENTS y documentos requeridos, git status/log/remote y PROJECT_STATE/TASKS. Inspeccionar cualquier cambio local antes de editar. Completar criterios del incremento, pruebas, documentación y commit/push normal autorizado; continuar con el siguiente elegible. Registrar aquí resultados exactos y cambios pendientes antes de cualquier límite real de ejecución/contexto.
