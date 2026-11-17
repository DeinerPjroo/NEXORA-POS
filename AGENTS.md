# Nexora POS

Producto comercial modular para restaurantes. Eslogan: «El futuro de tu restaurante».

- Trabajar por fases; consultar docs/PROGRESS.md antes de ampliar el alcance.
- Backend Laravel 13 / PHP 8.3+, API REST; frontend React / TypeScript / Vite.
- MySQL es la base de producción. SQLite solo para pruebas automatizadas o desarrollo explícito.
- UI en español, COP y America/Bogota como valores iniciales; persistir preferencias por empresa.
- Aislamiento obligatorio en servidor: contexto derivado de sesión autenticada, modelos tenant con scope que falla cerrado y claves compuestas para relaciones internas. Nunca confiar en tenant_id enviado por clientes.
- Cambios administrativos con autorización y auditoría en la misma transacción.
- Sanctum con cookies HttpOnly y CSRF para SPA. No almacenar tokens de sesión en localStorage.
- No ejecutar HTML, JavaScript, CSS libre ni expresiones de clientes. Studio usa un catálogo permitido y esquemas versionados.
- Mantener control de concurrencia de configuraciones; no sobrescribir revisiones ajenas.
- Nunca simular cobros, ventas, DIAN, hardware, correo enviado ni sincronización offline.
- Dinero en DECIMAL y aritmética decimal en backend; no borrar historia financiera.
- Usar Form Requests, Policies, servicios y componentes pequeños por dominio.
- No agregar paquetes de fases futuras sin uso. Reverb, Recharts, dnd-kit, Zustand se incorporarán cuando su funcionalidad los necesite.
- Revisar archivos antes de cambiarlos; no eliminar trabajo existente ni secretos.
- Actualizar documentación y ejecutar pruebas relevantes antes de cerrar un cambio.
- Verificaciones: backend: `php artisan test`, `vendor/bin/pint --test`; frontend: `npm run check`, `npm run build`, `npm run test:e2e` con servicios de prueba dedicados.
- No usar `migrate:fresh` contra bases de usuarios. Pruebas E2E usan exclusivamente backend/database/e2e.sqlite.
- Pruebas MySQL/MariaDB: `php scripts/test-mysql.php` desde raíz. Crea y limpia únicamente su esquema aleatorio. Nunca ejecutar PHPUnit sobre la base de trabajo; TestCase valida la marca del esquema antes de RefreshDatabase.
- Catálogo: dinero como cadenas decimales, costos protegidos por catalog.costs, revisión obligatoria en PUT. No cambiar moneda si existen productos ni aceptar contexto monetario obsoleto.
- Fotografías privadas en disco catalog: no generar enlaces públicos, aceptar solo JPEG/PNG/WebP acotados y recodificar con GD. Mutaciones de imagen/variante incrementan revisión del producto; conservar la revisión original al abrir formularios.
- SKU y barcode: comprobar disponibilidad en productos y variantes bajo bloqueo de empresa. Las variantes se archivan; nunca se transfieren de producto/empresa.
- Operación: usar BCMath y cadenas decimales; apertura/movimiento/cierre y pedidos requieren UUID idempotente, revisión cuando corresponde y auditoría transaccional. Historial append-only.
- Un pedido entregado no equivale a venta ni pago y no modifica caja. Exigir variante disponible cuando exista; copiar precio/nombre/SKU y recalcular subtotal en servidor.
- No cambiar moneda empresarial si existen productos, sesiones de caja o pedidos. Conservar clave y payload exactos ante respuesta incierta mientras el formulario permanezca abierto.
