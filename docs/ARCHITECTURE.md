# Arquitectura técnica

## Modificadores de preparación y precio (0.16)

SaveModifierGroup/Option usan IdempotentOperation, Policy antes de replay, ModifierProductContext y Product.revision como revisión global de configuración. Group.revision incluye cambios de opciones. Configuración activa acotada (8/20), archivados paginados y FK tenant/product/group, sin modelos compartidos que puedan cambiar otros productos.

OrderModifiers valida selección por línea y resuelve base + adicionales antes del expected_unit_price y subtotal de CreateOrder. Snapshot append-only en OrderItem, precio final de línea y tributación heredada por ProductTaxTotals sin nueva fórmula. UI canónica separa preparaciones; ModifierDetails consume solo snapshots en pedido/cobro/recibo. MODIFIERS.md define contrato y límites. Historial y panel administrativo cargan mediante lazy/Suspense para mantener chunks acotados tras aviso observado.

## Jerarquía acotada de catálogo (0.15)

CategoryHierarchy valida dos niveles dentro del bloqueo de empresa compartido por SaveCatalogRecord y CreateOrder. Category::isEffectivelyActive centraliza herencia para consulta y toma de pedidos; ProductResource y el comando usan la misma regla. Padre con FK compuesta y revisión elegida, sin cascadas de estado ni reinterpretar snapshots anteriores. SUBCATEGORIES.md define API, filtros y límites.

## Revisión humana versionada (0.14)

ReviewPayment serializa por empresa/venta dentro de IdempotentOperation. Compara sale_revision, última versión de revisión y neto esperado; PaymentReview conserva una declaración append-only y auditoría, sin cambiar Payment/Sale/CashSession. sales.reconcile se autoriza antes del replay y sales.view permite consultar las declaraciones paginadas.

PaymentReviewState deriva estado actual desde la última declaración y revisión financiera de venta. Una declaración matched/difference de otra revisión es stale; pendiente sigue pendiente. Filtros sobre latestReview se ejecutan en SQL y respetan tenant; no son filtros sobre una página ya limitada. PAYMENT_REVIEWS.md especifica importes, fuente manual y límites.

## Consulta de pagos y acumulados (0.13)

PaymentHistory filtra/pagina relaciones de consulta sale/account/refunds; PaymentBalance deriva aplicado/devuelto/neto por payment con BCMath. Resource expone datos históricos y resumen de página/moneda con sales.view, sin saldo de caja ni escrituras. Índices nuevos empresa/fecha/id y empresa/sucursal/fecha/id no alteran filas.

Las fechas seleccionan el registro del pago en zona de empresa y convierten límites a config(app.timezone), con medianoche siguiente excluida. No asumir timestamps SQL UTC: el predeterminado existente es America/Bogota, aunque Eloquent serializa JSON UTC. Devoluciones acumuladas actuales, no actividad de período; PAYMENT_HISTORY.md define semántica y permisos.

## Perfiles y cálculo por producto (0.12)

TaxProfile/SaveTaxProfile gestionan tasas paralelas con revisión/auditoría e idempotencia al crear, bajo bloqueo de empresa. Product mantiene FK tenant/profile y CreateOrder copia snapshot validando expected_tax_revision además de producto/precio. OrderItem sigue append-only; perfil archivado impide pedidos futuros sin alterar snapshots previos. No se inventan impuestos en pedidos legados sin snapshot.

ProductTaxTotals consume solo snapshots y genera versión 3/tax_breakdown inmutable. CentAllocation distribuye centavos por mayores restos, pesos/cocientes/restos BCMath y desempate estable. Se separan incluidos/adicionales y no se añade de nuevo lo incluido. Política de propina participante usa perfil/snapshot explícito de SalesSetting hasta reconfigurar. Frontend expone perfiles/picker/asignación y desglose de quote/recibo. PRODUCT_TAXES.md define el contrato; modos/versiones 1/2 conservados.

## Cálculo incluido versionado (0.11)

IncludedTax recibe importe participante en centavos/tasa validada, divide con BCMath/18 decimales y redondea base half-up una vez. El impuesto es la diferencia frente al importe participante y el total no vuelve a añadirlo. SaleTotals mantiene none/exclusive en versión 1 e inclusive en versión 2, incluyendo tratamiento explícito de propina. sales.calculation_version es inmutable; migración 000011 solo agrega versión 1 a filas previas. No reinterpretar sus importes ni asumir que esto implementa varios impuestos por producto; INCLUDED_TAX.md define el contrato.

## Asignaciones de cuentas (0.10)

SplitAccounts calcula partes iguales en centavos antes del primer pago; sale_accounts es append-only y payments.account_id conserva la asignación con FK tenant/sale/account. No se crean divisiones en ventas previas. RecordPayments limita acumulados por cuenta y globales dentro del bloqueo común, y las compensaciones conservan esa asignación por su payment original. Saldos/netos se derivan con BCMath; una devolución no reabre deuda. La creación de partes comparte transacción, revisión/idempotencia y auditoría del primer cobro. Una venta/recibo, sin reparto de productos o documentos fiscales múltiples; SPLIT_ACCOUNTS.md define contrato y límites.

## Decisión inicial

Monorepo con **monolito modular Laravel** y SPA React independiente. La separación por dominios evita incorporar microservicios y despliegues distribuidos antes de que exista una necesidad operativa. El mismo núcleo podrá atender POS, Kitchen, Go, Manager, Studio, Cloud, Menu y Delivery.

```text
backend/
  app/Domains/Identity/       Registro, catálogo de permisos, auditoría
  app/Domains/Tenancy/        Contexto y scopes obligatorios
  app/Domains/Studio/         Publicación transaccional del tema
  app/Domains/Catalog/        Guardado transaccional y búsqueda del catálogo
  app/Http/Controllers/       Adaptadores REST pequeños
  app/Http/Requests/          Validación de entradas
  app/Http/Middleware/        Resolución de empresa
  app/Models/                Persistencia relacional
  app/Policies/              Autorización de recursos
  database/                  Migraciones y semillas
  tests/                     Integración y seguridad
frontend/
  src/components/            Sistema de diseño y navegación
  src/features/auth/         Sesión y acceso
  src/features/workspace/    Resumen, sedes, equipo, roles y preferencias
  src/features/studio/       Identidad y vista previa
  src/features/catalog/      Productos, categorías y selector paginado
  src/lib/                   Cliente HTTP y contratos TypeScript
  src/styles/                Estilos por responsabilidad
  e2e/                       Recorridos reales con Playwright
mobile/                      Reserva de Fase 6
desktop/                     Reserva de Fase 6
scripts/                     Pruebas aisladas y exportación de esquema
docs/                        Contratos, decisiones y avance
```

React Router controla navegación; TanStack Query administra datos del servidor, invalidación y errores. No se duplica la sesión en Zustand ni se persisten credenciales en el navegador. Tailwind 4 y variables CSS proporcionan la base visual. Lucide cubre iconografía. Recharts y dnd-kit se incorporarán al implementar estadísticas y editores; Zustand se añadirá si el estado del editor lo necesita. Reverb se instalará en Fase 3 con KDS, canales privados y pruebas; actualmente no se anuncian eventos en tiempo real.

Compatibilidad comprobada con la documentación oficial de [Laravel 13](https://laravel.com/docs/13.x/releases) y [Vite](https://vite.dev/guide/). Se eligió Laravel 13 porque el PHP 8.3 instalado lo soporta. Las instalaciones resolvieron dependencias sin incompatibilidades de plataforma. No se actualizó PHP, Node, XAMPP ni el servidor SQL del usuario.

## Aislamiento multi-tenant

Base compartida y esquema compartido, con `tenant_id` obligatorio en los datos de empresa. Primera versión: una cuenta operativa pertenece a una empresa y a un rol; un correo identifica una cuenta globalmente. Para operadores de varias empresas se migrará explícitamente a membresías; no se permite cambiar empresa con un encabezado.

1. Sanctum autentica al usuario mediante la sesión del servidor.
2. `ResolveTenant` comprueba cuenta activa y empresa activa; deriva el contexto del usuario, nunca del cuerpo, ruta o encabezado del cliente.
3. Se establece un `TenantContext` scoped. Se restaura en `finally`, incluso si hay errores.
4. El contexto se resuelve antes de `SubstituteBindings`, de modo que `{branch}` y `{role}` tampoco pueden encontrar IDs ajenos.
5. `BelongsToTenant` impone scopes a consultas, asigna la empresa al crear y rechaza modificaciones de empresa. Una consulta sin contexto lanza excepción en vez de devolver todo.
6. Policies y Gates comprueban la operación permitida.
7. Claves foráneas compuestas bloquean relaciones entre recursos de empresas diferentes.

`User`, `Tenant` y `Permission` son entidades centrales y deliberadamente no tienen scope global: el inicio de sesión todavía no tiene un tenant confiable. **Toda consulta administrativa de usuarios debe incluir tenant_id explícito.** Los endpoints de equipo y resumen ya lo hacen y tienen pruebas. No se usa `withoutGlobalScopes` en endpoints. Ningún acceso SaaS excepcional está implementado: en Fase 5 necesitará un flujo separado, motivo, autorización, vencimiento y auditoría.

En futuras colas, cachés, archivos, canales y exportaciones se incluirá el tenant: claves `tenant:{id}:…`, rutas privadas por empresa y trabajos serializados con su empresa. El worker deberá entrar al contexto solo durante la ejecución y limpiarlo al finalizar. Un scope Eloquent no sustituye esa revisión de accesos.

## Identidad y autorización

SPA con cookies de sesión cifradas y HttpOnly, renovación del identificador al entrar/registrarse, invalidación al salir y CSRF. El navegador obtiene `/sanctum/csrf-cookie` antes de cada escritura y envía `X-XSRF-TOKEN`. Se usa la estrategia de [Sanctum para SPA](https://laravel.com/docs/13.x/sanctum), sin tokens en localStorage. Tokens de dispositivos móviles se introducirán con alcance y revocación en Fase 6; hoy no se emiten.

Registro transaccional: empresa → roles → propietario → sucursal → ajustes/versionado → auditoría. Las semillas contienen únicamente catálogo técnico de permisos, sin restaurantes o ventas ficticias. Rol propietario protegido; otros roles pueden crearse y actualizarse, sin delegar permisos que el actor no tenga ni editar su propio rol activo. La asignación y alta de empleados pertenece a Fase 3.

Recuperación usa el broker de Laravel, tokens de un solo uso, respuesta genérica y contraseña mínima de 12 caracteres con mayúsculas, minúsculas y número. Al restablecer se revocan las sesiones existentes. Rate limiting persistido mediante la caché de base de datos. PIN, bloqueo de pantalla, verificación de correo y MFA quedan pendientes.

## Studio desde el comienzo

`workspace_settings` mantiene el tema publicado y una revisión. `theme_versions` conserva el historial, con `schema_version`. La publicación bloquea la fila, verifica revisión, actualiza el tema, inserta la nueva versión y audita en una transacción. Una revisión obsoleta devuelve 409; no se sobrescribe silenciosamente.

El esquema actual admite exclusivamente colores hexadecimales, modo y estilo de bordes. Form Requests validan el contrato [theme.v1.json](schemas/theme.v1.json). React aplica variables permitidas; no interpreta HTML, código, CSS arbitrario o funciones. Restaurar una versión carga una vista previa y publicar crea una versión nueva. No se modifica el historial anterior.

Fase 4 añadirá diseños por rol/dispositivo con un árbol de componentes `{type, version, props, children}`. Cada `type` deberá estar en un registro del servidor y del cliente (ej. `sales-summary`, `quick-action`, `product-grid`). Propiedades con esquemas por componente; acciones limitadas a un catálogo autorizado y evaluadas de nuevo en backend. Los permisos y módulos de suscripción se calculan siempre en servidor y no se pueden cambiar mediante layouts. Importaciones con schema y versión, límites de tamaño y profundidad; migraciones explícitas entre versiones. Borrador/publicación, undo/redo, drag-and-drop y documentos aún no existen.

## Integridad financiera e inventario: diseño para Fases 2 y 3

El primer bloque de Fase 2 ya guarda productos/categorías reales. Precio y costo se validan como cadenas decimales positivas de hasta 15 enteros y 4 fracciones, persistidas en DECIMAL(19,4). ProductResource solo entrega costo con catalog.costs. Búsqueda con patrones escapados, parámetros SQL y páginas de hasta 50 registros. Cada edición verifica revisión bajo bloqueo de fila y escribe auditoría en la misma transacción. No hay endpoint de borrado: se cambia el estado activo/disponible.

Los precios pertenecen a la moneda de la empresa. El guardado de productos exige la moneda que muestra el cliente y la compara con la actual bajo bloqueo de empresa; una pantalla obsoleta devuelve 409. Cambiar moneda con productos existentes se rechaza para no reinterpretar importes. El formato monetario del navegador usa BigInt y partes de Intl; no convierte el precio a float ni calcula cobros.

La suite se ejecutó tanto en SQLite como en MariaDB 10.4.32. scripts/test-mysql.php crea un esquema con nombre aleatorio y pasa su configuración al subproceso sin imprimir secretos. Tests/TestCase verifica la marca del esquema antes de permitir pruebas SQL con RefreshDatabase. La nueva política de continuidad conserva el esquema al terminar y prohíbe DROP DATABASE; los resultados históricos anteriores a esta política sí utilizaron limpieza. MySQL 8, CI y pruebas de concurrencia/carga aún requieren validación específica.

Servicios de aplicación y transacciones para venta/pago/movimiento. Los precios se conservan en order_items inmutables; la venta copia configuración e importes globales de impuesto/descuento. Los cambios del catálogo no alteran recibos anteriores. Dinero `DECIMAL(19,4)`; cantidades actuales de pedido enteras y futuras de inventario `DECIMAL(19,6)`; cálculos con aritmética decimal en PHP, sin `float`. El circuito en efectivo define dos decimales half-up y exige confirmar el modo de cálculo, sin determinar automáticamente régimen o tasas legales.

Confirmar una venta en efectivo exige caja abierta, autorización, bloqueos, revisiones y clave idempotente. Las devoluciones crean compensaciones enlazadas al pago original. Nunca borrado físico financiero. Pagos mixtos manuales y devoluciones parciales están implementados; confirmación de proveedores requiere integración. Inventario futuro con kardex inmutable, recetas versionadas, conversiones de unidades y consumos reproducibles. Prohibir stock negativo o permitirlo será una regla explícita con permisos y auditoría. Eventos se publicarán después del commit; para entrega fiable se usará outbox transaccional e inbox de deduplicación.

## Medios privados y variantes implementados

Las imágenes se guardan en un disco local privado catalog, con path generado por servidor que incluye empresa/producto y UUID. El upload usa Form Requests, límites de bytes/dimensiones, MIME y recodificación GD (JPEG/PNG/WebP). No se aceptan enlaces externos ni SVG; no se sirven bytes originales o metadatos. Las respuestas autenticadas usan nosniff y private/no-store. No publicar el disco ni crear symlink a public. En despliegue necesita volumen persistente y respaldo junto con MySQL; S3 privado y antivirus de archivos adicionales no están implementados.

Base y filesystem no comparten una transacción. Primero se prepara/escribe un archivo nuevo; bajo bloqueo de producto se verifica revisión, actualiza la referencia y audita. Si falla, se intenta limpiar el archivo nuevo. El archivo anterior se elimina después del commit; fallos de limpieza quedan en logs y pueden dejar huérfanos, no referencias rotas intencionales. Un corte de proceso entre escritura y commit puede dejar huérfanos; una tarea de reconciliación periódica queda pendiente. Al cambiar la imagen, cambia el identificador de image_url.

Variantes: servicio SaveVariant bloquea empresa y producto, verifica moneda y product_revision, comprueba identificadores compartidos, guarda y aumenta la revisión del producto con auditoría. SKU/barcode se mantienen únicos en cada tabla por índice y entre tablas mediante comprobación serializada en servidor. Bindings anidados limitan el hijo al producto/empresa. Las respuestas de costo están protegidas igual que en productos. Se conserva la base como referencia y toda futura venta deberá seleccionar variante si el producto tiene presentaciones, sin sustituir automáticamente su precio.

Los editores capturan moneda/revisión al abrirse; no toman una revisión nueva automáticamente por refetch mientras mantienen campos antiguos. La selección de fotografía también fija su revisión. Las colisiones devuelven 409 y requieren revisar datos antes de volver a guardar.

## Caja y pedidos implementados en 0.4

Los servicios CashOperations, CreateOrder y ChangeOrderState ejecutan comandos bajo IdempotentOperation: validación/autorización, transacción y bloqueo de empresa, comprobación de clave y hash canónico de payload, operación, auditoría y registro idempotente. Se bloquean además los recursos afectados. El bloqueo por empresa limita capacidad; medir antes de optimizar la granularidad. Las claves se retienen sin vencimiento automático y su replay vuelve a autorizar y devuelve el recurso actual.

Cada caja tiene active_session_id con FK compuesta a una sesión de esa misma caja. Apertura, movimientos y cierre son atómicos. La revisión de sesión protege un conteo basado en datos antiguos. CashMovement, OrderItem, OrderEvent e IdempotencyRecord rechazan actualización/borrado por modelo; no existen rutas para modificar su historia. Las restricciones y servicios no autorizan SQL directo de clientes.

El servidor usa BCMath y cadenas DECIMAL(19,4), comprueba límites y nunca calcula dinero mediante float. El cierre admite diferencia negativa; egresos no superan el esperado. Pedidos guardan snapshots y exigen variante cuando exista, producto/categoría disponibles, revisión y precio esperados. Cantidades actuales enteras de 1 a 999; cantidades fraccionarias de inventario quedan para su dominio. Una entrega no genera ingreso de caja; cobrar es un comando separado desde 0.5. Moneda inmutable después de productos, sesiones o pedidos.

La UI retiene UUID y payload exactos mientras un formulario incierto permanece montado. El usuario reintenta explícitamente sin modificar campos; cerrar o recargar puede perder el formulario. No hay almacenamiento persistente, sincronización ni tiempo real. Permisos operativos abarcan sucursales del tenant; asignación granular de empleados posterior. Véanse reglas y límites en [OPERATIONS.md](OPERATIONS.md).

Las pruebas en SQLite son funcionales: su afinidad NUMERIC puede redondear importes extremos. MariaDB/MySQL con DECIMAL es la referencia de persistencia y la suite SQL temporal verifica los límites; no se declara SQLite un motor financiero offline preparado.

## Venta en efectivo implementada en 0.5

SalesSetting se crea sin configurar; la persona con sales.configure debe confirmar modo de impuesto, tasa y redondeo. SaleTotals redondea subtotal global half-up a dos decimales, resta descuento fijo autorizado, calcula/redondea un impuesto adicional y exige total positivo. No soporta impuestos incluidos/múltiples por producto. La cotización es de lectura; CollectCash recalcula bajo bloqueo y compara revisiones de pedido/configuración/caja y total esperado antes de confirmar.

CollectCash utiliza IdempotentOperation y una transacción que guarda Sale, Payment, CashMovement income por total neto, incremento de revisión del pedido, secuencia interna y auditoría. Un fallo de auditoría revierte todo. La unicidad tenant/order impide un segundo cobro incluso con otra clave. El recibido y cambio permanecen en Payment; no se registra todo el recibido como ingreso neto. Los snapshots de empresa/sucursal/importes y las líneas inmutables del pedido permiten reproducir el recibo.

RefundCash agrega una devolución total y un egreso bajo bloqueo, verifica fondos esperados y caja abierta de la misma sucursal/moneda, conserva pago/importes y cambia estado a refunded. Se admite otra sesión posterior; solo una devolución por venta. Pedidos vendidos no se cancelan, y su preparación sigue separada del pago. Las FKs compuestas enlazan venta/pedido/sucursal, pago o devolución/caja/movimiento, y actores del tenant.

Las listas/detalles de ventas usan sales.view; cobrar, configurar, descontar y devolver tienen permisos separados. Impresión del recibo mediante navegador y CSS específico, sin adaptador de hardware ni emisión fiscal. Pagos declarados por el operador; no hay pasarela o verificación externa. Contrato y límites en [SALES.md](SALES.md).

## Métodos de pago manuales implementados en 0.6

PaymentMethod y SavePaymentMethod reutilizan el contexto de tenant, revisión, auditoría e idempotencia administrativa. Código/tipo inmutables, nombre/estado editables y efectivo principal siempre activo. Cada pago conserva método/nombre/tipo/revisión, provenance=operator y referencia; jamás se anuncia como confirmado por proveedor. Se conserva el servicio CollectCash como entrada compatible para las API anteriores, ampliando su selección de método.

CashLedger centraliza verificación de sesión abierta/sucursal/moneda/revisión. Métodos cash registran ingreso/egreso neto; non_cash incrementan revisión de la sesión operativa, sin cambiar expected_amount ni crear CashMovement. Los no efectivos exigen importe exacto y referencia. RefundCash toma el tipo histórico, no el método activo actual; exige referencia no efectiva o fondos si efectivo. La migración 000006 permite movimiento nullable y agrega FK compuesta al método, sin cambiar importes de ventas anteriores. Su reversión automática se rechaza para no perder historia financiera.

La prueba de navegador crea/usa/archiva un método, comprueba su nombre histórico, registra devolución y cierra caja con el mismo efectivo esperado. Abonos/mixtos y conciliación se incorporarán sobre estas entidades, no con otra plataforma de ventas.

## Abonos y lotes mixtos implementados en 0.7

RecordPayments es el servicio compartido por CollectCash y AddPayments. La primera operación conserva su API y admite payment_amount opcional; las posteriores usan revisión de venta y saldo esperado, sin recalcular precios/impuestos originales. Se verifican suma positiva, saldo y cada método antes/durante un lote transaccional. Un fallo de línea posterior/auditoría revierte todas las escrituras. La revisión de sesión inicial se avanza internamente por línea bajo bloqueo de empresa/venta.

SaleBalance suma cadenas de payments/refunds con BCMath, evitando SUM monetario de SQLite. Sale guarda total histórico inmutable y solo permite estado/revisión/updated_at. Estados partially_paid/paid/refunded, con saldo pendiente y cancelado explícitos. No se confunde dinero entregado antes del cambio con importe aplicado. Se conservan los aliases singulares del primer pago/devolución y se agregan arrays históricos ordenados.

RefundCash compensa los remanentes de los pagos originales por sus métodos, exige revisión para ventas abonadas/múltiples/parcialmente devueltas y referencia por remanente no efectivo. Se enlazan devoluciones con FK tenant/sale/payment y se cierra el saldo nunca cobrado sin devolverlo. Migración 000007 agrega revisión/vínculos y retira unicidades de un solo pago por venta sin modificar importes anteriores. Desde 0.9 PartialRefund/RecordRefunds permiten selección parcial con límite acumulado; migración 000009 retira unicidad por pago. SaleBalance separa total original, neto, pagos y saldo sin crear deuda al devolver. Ver REFUNDS.md.

La UI permite primer abono, lote con uno o varios métodos, saldo e historial, reintento explícito con payload congelado y recibo móvil/impreso. La consulta de ventas es necesaria para el seguimiento de abonos; se conserva el cobro completo para un operador sin sales.view. No hay proveedores externos ni conciliación bancaria. Las listas cargan pagos asociados para calcular saldos exactos; medir tamaño/carga y evolucionar paginación/lecturas agregadas antes de producción.

## Ajustes voluntarios y porcentuales implementados en 0.8

SaleAdjustmentRules comparte validación entre cotización y cobro; SaleTotals calcula porcentaje half-up sobre subtotal redondeado, conserva valor/tipo/importe derivado y tip/base elegidos. El fijo anterior sigue compatible. Propinas inicialmente deshabilitadas, modo explícito de base en configuración, permiso sales.tips y confirmación de voluntariedad comprobados otra vez en servicio antes de crear venta. Confirmación e importes quedan en snapshot y auditoría.

La configuración modifica solo nuevos cálculos. El total no se cambia después del primer pago; AddPayments rechaza campos de ajuste. La UI separa borrador/aplicado/consentimiento, exige actualizar la cotización y compara revisiones/total al confirmar; la aritmética final sigue en BCMath. SaleAdjustments evita duplicar el editor dentro de CheckoutPage. No hay tasas legales, propinas automáticas, liquidación a empleados ni identificación de qué parte de cada abono es propina.

Migración 000008 agrega campos y copia el descuento fijo anterior como metadato, sin alterar importes. Los recibos anteriores conservan resultado y los nuevos desglosan porcentaje/propina. ADJUSTMENTS.md define fórmula, ejemplos y límites.

## Offline y dispositivos futuros

Cliente local SQLite y cola de comandos con UUID/ULID, `tenant_id`, sucursal, dispositivo, revisión y clave idempotente. Sincronización con acknowledgements, reintentos exponenciales y dead-letter. Pedidos: comandos de dominio; inventario y pagos: reconciliación con servidor, sin reemplazar saldos con «última escritura gana». Conflictos de precio/stock/caja necesitan resolución visible. No cachear respuestas privadas globalmente ni prometer pagos offline de proveedores que no los soportan. La web actual muestra desconexión y exige acceso al servidor; no tiene service worker ni cola offline.

Hardware se integrará mediante adaptadores de escritorio: impresora térmica ESC/POS (USB/red, driver o puente local), cajón mediante puerto de impresora, lector de barras HID, básculas con protocolo comprobado, pantallas vía navegador/KDS. Cada dispositivo necesita modelo, protocolo, permisos del SO y pruebas físicas. Tickets de 58/80 mm requieren calibración. Hoy no se envía información a dispositivos.

DIAN tendrá un adaptador de proveedor, estados y documentos separados de la venta interna, pruebas de habilitación y numeración real. No hay integración, certificación ni facturación electrónica implementadas. Los planes provisionales y módulos serán tablas y permisos comerciales evaluados en backend en Fase 5, sin restricciones codificadas en la UI.

## Operación y despliegue

En desarrollo, Vite sirve la SPA y hace proxy de API/cookies a Laravel. En producción, Nginx/Apache sirve `frontend/dist` con fallback a index y envía `/api`, `/sanctum` a `backend/public/index.php`. Exponer únicamente esos directorios; nunca `.env`, vendor, logs o raíz del repositorio. HTTPS, cookies Secure, debug desactivado, APP_KEY persistente, permisos mínimos de DB, backups cifrados y restauraciones comprobadas. Los procesos de cola y Reverb se desplegarán supervisados cuando haya tareas y eventos que los utilicen.

Antes de cualquier lanzamiento comercial: pruebas completas MySQL, CI, análisis de dependencias, observabilidad, política de retención, recuperación ante fallos, revisión de autorización y pruebas de carga. No se declara esta primera base lista para producción.
