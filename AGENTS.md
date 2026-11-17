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
- Pruebas MySQL/MariaDB: `php scripts/test-mysql.php` desde raíz. Crea un esquema aleatorio nuevo y lo conserva al terminar. Está prohibido ejecutar DROP DATABASE, incluso para limpiar pruebas. Nunca ejecutar PHPUnit sobre la base de trabajo; TestCase valida la marca del esquema antes de RefreshDatabase.
- Catálogo: dinero como cadenas decimales, costos protegidos por catalog.costs, revisión obligatoria en PUT. No cambiar moneda si existen productos ni aceptar contexto monetario obsoleto.
- Fotografías privadas en disco catalog: no generar enlaces públicos, aceptar solo JPEG/PNG/WebP acotados y recodificar con GD. Mutaciones de imagen/variante incrementan revisión del producto; conservar la revisión original al abrir formularios.
- SKU y barcode: comprobar disponibilidad en productos y variantes bajo bloqueo de empresa. Las variantes se archivan; nunca se transfieren de producto/empresa.
- Operación: usar BCMath y cadenas decimales; apertura/movimiento/cierre y pedidos requieren UUID idempotente, revisión cuando corresponde y auditoría transaccional. Historial append-only.
- Un pedido entregado no equivale a venta ni pago y no modifica caja. Exigir variante disponible cuando exista; copiar precio/nombre/SKU y recalcular subtotal en servidor.
- No cambiar moneda empresarial si existen productos, sesiones de caja o pedidos. Conservar clave y payload exactos ante respuesta incierta mientras el formulario permanezca abierto.
- Ventas: exigir configuración confirmada, revisar pedido/configuración/caja y total esperado. Dos decimales half-up: subtotal global, descuento fijo antes del impuesto adicional, impuesto redondeado, total positivo. No inventar tasas legales ni interpretar precios incluidos.
- Cobro en efectivo: movimiento por total neto, registrar recibido/cambio, una venta por pedido y recibo interno correlativo por tenant. Venta/pago/caja/auditoría/secuencia deben confirmar o revertir juntos.
- Devolución total única: salida compensatoria con motivo, caja abierta de misma sucursal/moneda y fondos suficientes. Conservar venta/pago, impedir cancelar o recobrar pedido vendido. Nunca confundir recibo interno con documento fiscal.
- Métodos 0.6: cash/non_cash inmutables, nombre/estado con revisión; efectivo principal activo. Copiar método/nombre/tipo/revisión/procedencia/referencia al pago. Solo cash mueve efectivo; non_cash exige referencia e importe exacto, conserva sesión abierta/revisión, no modifica saldo y nunca equivale a confirmación bancaria. La devolución usa el método histórico.
- Abonos 0.7: varios payments sobre una venta de total inmutable. Usar RecordPayments y SaleBalance con BCMath, bloqueo de venta/empresa, revisión y saldo esperado; lotes atómicos de 1–20 líneas y sin sobrepago. La devolución completa compensa cada payment original, cancela saldo no cobrado por separado y nunca devuelve dinero no aplicado. Consultar PAYMENTS.md antes de ampliar.
- Ajustes 0.8: SaleAdjustmentRules/SaleTotals calculan porcentaje y tip voluntario; fixed anterior compatible. Propina deshabilitada inicialmente, requiere base explícita por empresa, sales.tips y consentimiento confirmado/persistido. No imponerla ni cambiar total después del primer pago. ADJUSTMENTS.md define fórmula y límites; propinas no son ganancias definitivas ni están liquidadas a empleados.

## Protocolo de continuidad autónoma

- Autorización vigente: avanzar secuencialmente por todos los incrementos pendientes hasta una primera versión integral. No preguntar al terminar cada módulo. Conservar avances locales y remotos; no reiniciar fases ni duplicar dominios.
- Antes de retomar: leer README, REQUIREMENTS, ARCHITECTURE, ROADMAP, PROGRESS, CHANGELOG, DATABASE, OPERATIONS, SALES y los documentos TASKS, PROJECT_STATE, HANDOFF y DECISIONS. Revisar código, migraciones, pruebas, git status e historial y comparar con origin sin sobrescribir trabajo.
- Por incremento: criterios de aceptación y dependencias, implementación conectada, migración incremental, pruebas y correcciones, verificación de regresiones, documentación, commit descriptivo y push normal al repositorio autorizado https://github.com/DeinerPjroo/NEXORA-POS. Nunca force push ni subir .env/credenciales/tokens/datos reales.
- Mantener docs/TASKS.md, PROJECT_STATE.json, HANDOFF.md y DECISIONS.md con estados PENDING, IN_PROGRESS, TESTING, COMPLETED o BLOCKED, tarea activa/última/próxima, dependencias, bloqueos y resultados reales.
- Las dependencias externas no bloquean tareas independientes. Solicitar intervención solo para operaciones destructivas, credenciales, contratación, decisión comercial importante, cambio de tecnología principal, bloqueo irresoluble o publicación en producción.
- Prohibido modificar otros proyectos o detener Horizonte (puerto 8000). Nexora conserva 8001/5173; pruebas 8011/5199. No ejecutar migrate:fresh sobre la base de trabajo, DROP DATABASE, ni borrar información real.
- No marcar integración como funcional sin verificarla. Pagos registrados por operador siempre identificados como manuales; pasarelas/hardware/DIAN requieren pruebas externas reales.
- Al llegar a un límite real de ejecución/contexto, dejar cambios seguros y continuidad precisa. No anunciar como terminadas fases o capacidades pendientes.
