# Arquitectura técnica

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

La suite se ejecutó tanto en SQLite como en MariaDB 10.4.32. scripts/test-mysql.php crea un esquema con nombre aleatorio y pasa su configuración al subproceso sin imprimir secretos. Tests/TestCase verifica la marca del esquema antes de permitir pruebas SQL con RefreshDatabase. Al finalizar solo se elimina el esquema creado por esa ejecución. MySQL 8, CI y pruebas de concurrencia/carga aún requieren validación específica.

Servicios de aplicación y transacciones para venta/pago/movimiento. Precios e impuestos se copian como snapshots a cada detalle; los cambios del catálogo no alteran ventas anteriores. Dinero `DECIMAL(19,4)`; cantidades `DECIMAL(19,6)`; cálculos con aritmética decimal en PHP, sin `float`. Redondeo definido por moneda y política tributaria validada antes de implementar cobros.

Confirmar una venta requerirá caja abierta, autorización, bloqueo de registros necesarios, clave idempotente única por empresa/canal y sumas de pagos compatibles con el saldo. Anulaciones y devoluciones crearán operaciones compensatorias enlazadas al original. Nunca borrado físico financiero. Inventario con kardex inmutable, recetas versionadas, conversiones de unidades y consumos reproducibles. Prohibir stock negativo o permitirlo será una regla explícita con permisos y auditoría. Eventos se publicarán después del commit; para entrega fiable se usará outbox transaccional e inbox de deduplicación.

## Medios privados y variantes implementados

Las imágenes se guardan en un disco local privado catalog, con path generado por servidor que incluye empresa/producto y UUID. El upload usa Form Requests, límites de bytes/dimensiones, MIME y recodificación GD (JPEG/PNG/WebP). No se aceptan enlaces externos ni SVG; no se sirven bytes originales o metadatos. Las respuestas autenticadas usan nosniff y private/no-store. No publicar el disco ni crear symlink a public. En despliegue necesita volumen persistente y respaldo junto con MySQL; S3 privado y antivirus de archivos adicionales no están implementados.

Base y filesystem no comparten una transacción. Primero se prepara/escribe un archivo nuevo; bajo bloqueo de producto se verifica revisión, actualiza la referencia y audita. Si falla, se intenta limpiar el archivo nuevo. El archivo anterior se elimina después del commit; fallos de limpieza quedan en logs y pueden dejar huérfanos, no referencias rotas intencionales. Un corte de proceso entre escritura y commit puede dejar huérfanos; una tarea de reconciliación periódica queda pendiente. Al cambiar la imagen, cambia el identificador de image_url.

Variantes: servicio SaveVariant bloquea empresa y producto, verifica moneda y product_revision, comprueba identificadores compartidos, guarda y aumenta la revisión del producto con auditoría. SKU/barcode se mantienen únicos en cada tabla por índice y entre tablas mediante comprobación serializada en servidor. Bindings anidados limitan el hijo al producto/empresa. Las respuestas de costo están protegidas igual que en productos. Se conserva la base como referencia y toda futura venta deberá seleccionar variante si el producto tiene presentaciones, sin sustituir automáticamente su precio.

Los editores capturan moneda/revisión al abrirse; no toman una revisión nueva automáticamente por refetch mientras mantienen campos antiguos. La selección de fotografía también fija su revisión. Las colisiones devuelven 409 y requieren revisar datos antes de volver a guardar.

## Offline y dispositivos futuros

Cliente local SQLite y cola de comandos con UUID/ULID, `tenant_id`, sucursal, dispositivo, revisión y clave idempotente. Sincronización con acknowledgements, reintentos exponenciales y dead-letter. Pedidos: comandos de dominio; inventario y pagos: reconciliación con servidor, sin reemplazar saldos con «última escritura gana». Conflictos de precio/stock/caja necesitan resolución visible. No cachear respuestas privadas globalmente ni prometer pagos offline de proveedores que no los soportan. La web actual muestra desconexión y exige acceso al servidor; no tiene service worker ni cola offline.

Hardware se integrará mediante adaptadores de escritorio: impresora térmica ESC/POS (USB/red, driver o puente local), cajón mediante puerto de impresora, lector de barras HID, básculas con protocolo comprobado, pantallas vía navegador/KDS. Cada dispositivo necesita modelo, protocolo, permisos del SO y pruebas físicas. Tickets de 58/80 mm requieren calibración. Hoy no se envía información a dispositivos.

DIAN tendrá un adaptador de proveedor, estados y documentos separados de la venta interna, pruebas de habilitación y numeración real. No hay integración, certificación ni facturación electrónica implementadas. Los planes provisionales y módulos serán tablas y permisos comerciales evaluados en backend en Fase 5, sin restricciones codificadas en la UI.

## Operación y despliegue

En desarrollo, Vite sirve la SPA y hace proxy de API/cookies a Laravel. En producción, Nginx/Apache sirve `frontend/dist` con fallback a index y envía `/api`, `/sanctum` a `backend/public/index.php`. Exponer únicamente esos directorios; nunca `.env`, vendor, logs o raíz del repositorio. HTTPS, cookies Secure, debug desactivado, APP_KEY persistente, permisos mínimos de DB, backups cifrados y restauraciones comprobadas. Los procesos de cola y Reverb se desplegarán supervisados cuando haya tareas y eventos que los utilicen.

Antes de cualquier lanzamiento comercial: pruebas completas MySQL, CI, análisis de dependencias, observabilidad, política de retención, recuperación ante fallos, revisión de autorización y pruebas de carga. No se declara esta primera base lista para producción.
