# Nexora POS

**El futuro de tu restaurante.** Plataforma modular de gestión gastronómica con aislamiento por empresa y personalización propia.

El incremento **0.23.0** conecta el **terminal POS** con catálogo, carrito, caja, pedido, cobro y recibo existentes. Incluye variantes/preparaciones, combos/promociones, controles táctiles y recuperación de respuestas inciertas. Continúa inicio por permisos y ergonomía del terminal; mesas, pasarelas, cocina, inventario y facturación siguen pendientes. Reglas en [POS.md](docs/POS.md), [GALLERY.md](docs/GALLERY.md) y [PROMOTIONS.md](docs/PROMOTIONS.md).

## Entorno y requisitos

Verificado el 17 de noviembre de 2026 en Windows: PHP **8.3.31**, Composer **2.8.9**, Node **24.10.0**, npm **11.6.1**. PHP tiene PDO MySQL, PDO SQLite, BCMath, GD, mbstring, OpenSSL, cURL, fileinfo, XML y ZIP. Framework instalado: Laravel **13.43.0**, Sanctum **4.5.0**, React **19.3.1**, Vite **8.3.8**, Tailwind **4.3.5**. Las versiones exactas están en los archivos lock.

La conexión configurada en `backend/.env` ya funciona con **MariaDB 10.4.32 de XAMPP** en `127.0.0.1:3306`, usando el driver mysql de PDO. Las migraciones están aplicadas y la suite backend pasó también en una base temporal de ese servidor. Esto verifica MariaDB; la validación específica de MySQL 8 para despliegue continúa pendiente. Durante el trabajo se realizó un arranque normal de MariaDB al detectarlo detenido; no se repararon archivos de datos ni se modificaron otros proyectos.

## Instalar y ejecutar

Desde la raíz, en PowerShell:

```powershell
cd backend
composer install
# Solo si .env todavía no existe:
Copy-Item .env.example .env
php artisan key:generate
```

En esta entrega `.env` y la clave local ya fueron creados. **No copies el ejemplo ni regeneres la clave si ya configuraste tu entorno.** Edita localmente estas variables, sin compartir la contraseña en el repositorio:

```dotenv
DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=nexora_pos
DB_USERNAME=tu_usuario
DB_PASSWORD="tu_contraseña"
```

Crea una base nueva en MySQL Workbench, usando un usuario autorizado:

```sql
CREATE DATABASE nexora_pos CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

Si ya existe, selecciónala y revisa que sea la base destinada a Nexora. Después, desde `backend/`:

```powershell
php artisan config:clear
php artisan nexora:doctor
php artisan migrate --seed
php artisan serve --host=127.0.0.1 --port=8001
```

En una segunda terminal, desde la raíz:

```powershell
cd frontend
npm ci
npm run dev
```

Abre **http://127.0.0.1:5173/registro**, registra tu empresa y crea tu contraseña. No hay cuentas compartidas ni contraseñas predeterminadas. Usa siempre el mismo host (`127.0.0.1`) para la SPA y Laravel. Vite envía `/api` y `/sanctum` al backend mediante proxy y las sesiones usan cookies HttpOnly con protección CSRF.

El backend usa el puerto **8001** porque el 8000 lo ocupa otro proyecto local. Escribe el comando sin una barra `\` al final. Si indica que el puerto ya está ocupado, comprueba si Nexora sigue ejecutándose antes de iniciar otra instancia.

XAMPP provee PHP, pero no es necesario activar Apache para usar estos dos servidores locales. No abras la raíz del repositorio desde Apache: un despliegue PHP debe exponer exclusivamente `backend/public`.

## Pruebas

```powershell
cd backend
php artisan test
php vendor/bin/pint --test
```

PHPUnit usa SQLite **en memoria** y no toca MySQL. Las pruebas verifican registro atómico, aislamiento entre empresas, claves compuestas, permisos, suspensión, límites de acceso, validación visual, revisiones y recuperación de contraseña.

Para probar con el servidor MySQL/MariaDB configurado, desde la raíz:

```powershell
php scripts/test-mysql.php
```

El script crea una base temporal nueva de nombre aleatorio y ejecuta la suite. Necesita permiso CREATE DATABASE. Por la instrucción de continuidad, conserva la base aislada y muestra su nombre al terminar: nunca ejecuta DROP DATABASE ni reutiliza bases anteriores. No utiliza ni limpia tablas de la base de trabajo. Una guarda en TestCase impide ejecutar RefreshDatabase sobre una base SQL distinta de la generada por el script. No ejecutes PHPUnit apuntando manualmente a tu base real. Los esquemas conservados requieren administración posterior y consumen espacio.

Catálogo disponible en `/productos` y `/categorias`: categorías, productos, búsqueda, filtros, paginación, SKU/barcode y precios/costos precisos. Abre **Ver ficha y presentaciones** para subir una fotografía o crear variantes con precio y disponibilidad propios. Los permisos catalog.view/manage/costs se mantienen; otros roles se configuran desde Roles y permisos. El costo requiere permiso separado. El inventario automático sigue pendiente.

En la ficha, **Precios por sucursal y canal** configura reglas de la presentación única; **Ver precios** en cada variante abre sus reglas propias. El precio base se conserva. Al tomar pedido, cambiar sucursal/canal permite revisar los importes antes de aplicarlos, manteniendo notas, cantidades y opciones. Los pedidos anteriores conservan sus precios al cobrar. Contrato y prioridad en [CONTEXT_PRICES.md](docs/CONTEXT_PRICES.md).

**Horarios de disponibilidad** permite crear ventanas semanales y habilitar su aplicación. Comienza deshabilitado; habilitado sin ventanas activas deja el producto fuera de horario. Las fechas de vigencia corresponden al día de inicio y la zona se configura en Preferencias. Un cierre impide pedidos nuevos; un pedido guardado se puede preparar y cobrar después. Los formularios detectan cambios de zona mientras están abiertos.

Fotografías: JPEG, PNG o WebP, hasta 2 MB, entre 32 y 2048 px por lado. PHP necesita **GD con soporte JPEG/PNG/WebP** (verificado en XAMPP). El servidor vuelve a codificar las imágenes y elimina metadatos; no se aceptan SVG ni GIF. Se conservan en `backend/storage/app/catalog`, fuera del directorio público. No ejecutes storage:link para este disco; la API entrega la imagen únicamente a sesiones de su empresa con catalog.view. Incluye ese directorio en backups junto con la base; el disco local requiere un volumen persistente en despliegue.

```powershell
cd frontend
npm run check
npm run build
npm run format:check
npx playwright install chromium
npm run test:e2e
```

Playwright levanta sus propios servidores en **8011 y 5199**, usa exclusivamente `backend/database/e2e.sqlite` y fotografías en `.runtime/e2e-catalog`, sin modificar `.env`. Mantiene registros de prueba entre ejecuciones y genera correos únicos; un prefijo de caché por ejecución evita acumular los límites de intentos entre corridas. No reutiliza servidores ajenos ni ejecuta `migrate:fresh`. Las capturas de `docs/screenshots/` corresponden a este entorno de prueba, no a un restaurante real.

## Caja y pedidos

En **Caja** elige sucursal, abre la caja principal con su base y registra ingresos/egresos manuales con motivo. Cierra indicando el efectivo contado; quedan guardados el esperado y la diferencia firmada. Cada sucursal tiene una caja principal; puedes crear más con permiso cash.manage. Las sesiones cerradas y movimientos se conservan.

En **Pedidos → Nuevo pedido**, agrega productos, elige una presentación cuando tengan variantes y registra cantidades enteras, notas y referencia. El flujo permite pendiente → preparación → listo → entregado y cancelación con motivo antes de entregar. El servidor valida precios/revisiones y calcula importes usando **BCMath**; un cambio de catálogo no modifica pedidos anteriores.

Los permisos cash.view/manage/movements y orders.view/manage/cancel se configuran en Roles y permisos; tomar pedidos también requiere catalog.view. La migración concede las capacidades nuevas automáticamente solo a propietarios existentes. Registrar/entregar pedidos no aumenta la caja. Ante una respuesta perdida, mantén abierto el formulario y usa la opción de reintento para consultar la misma operación sin duplicarla; no hay cola offline ni persistencia del formulario al recargar. Consulta las [reglas operativas](docs/OPERATIONS.md).

## Ventas en efectivo

Primero entra en **Ventas → Configurar ventas** y confirma el cálculo: sin impuesto adicional automático o un porcentaje adicional sobre precios base. Se cobra a dos decimales con mitades hacia arriba. No se determina automáticamente el régimen tributario; los precios con impuestos incluidos y varios impuestos por producto no están soportados.

Abre una caja y entra en **Pedidos → detalle → Cobrar pedido**. Aplica descuento fijo autorizado, revisa total y método/caja. Puedes pagar el total o registrar un abono en **Importe de este pago** (requiere consulta de ventas para su seguimiento). Efectivo guarda recibido/cambio e ingreso por importe aplicado; no efectivo exige referencia e importe exacto del pago, sin cambio ni movimiento de efectivo. Cada pedido admite una sola venta con varios pagos, protegidos ante reintentos.

Desde **Ventas → Métodos de pago** puedes crear métodos de efectivo o no efectivos manuales, renombrarlos y desactivarlos con sales.configure. Código/tipo son inmutables y el efectivo principal permanece activo. Los recibos conservan nombre/tipo/referencia originales. Las devoluciones siguen el método histórico, incluso si fue desactivado; las no efectivas requieren referencia y no descuentan caja. Todos son registros del operador, sin confirmación de pasarela.

En **Ventas** puedes consultar/imprimir el recibo interno y registrar una **devolución total** con motivo y caja abierta con fondos suficientes, conservando la operación original. Permisos separados sales.view/collect/configure/discount/refund. No hay cobro electrónico ni factura DIAN; la impresión utiliza el navegador. Detalle de cálculo, devoluciones y límites en [SALES.md](docs/SALES.md).

En un recibo **Abonado**, **Agregar pagos** permite preparar un lote de uno o varios métodos y confirmar juntos. El servidor comprueba saldo/revisión y rechaza sobrepagos; solo los componentes de efectivo cambian la caja. **Devolución total** devuelve cada pago por su método y cancela el saldo nunca cobrado, sin devolver dinero no recibido. Recibos anteriores, pagos y total original se conservan. Reglas y ejemplo de cierre en [PAYMENTS.md](docs/PAYMENTS.md).

Al cobrar puedes elegir descuento fijo o porcentual, con motivo y permiso sales.discount. Las propinas empiezan deshabilitadas: habilítalas y confirma el tratamiento de base en Configurar ventas. Su importe es opcional y exige sales.tips y confirmación de que el cliente lo aceptó voluntariamente; no se agregan automáticamente. Los ajustes quedan fijados desde el primer pago y se muestran en el recibo. Reglas, ejemplo y límites en [ADJUSTMENTS.md](docs/ADJUSTMENTS.md).

## Correo, seguridad y producción

El modo local `MAIL_MAILER=log` escribe el enlace de recuperación en `backend/storage/logs/laravel.log`; **no envía correos**. Para entrega real configura SMTP y comprueba el transporte. No publiques logs ni archivos `.env`.

El proyecto sigue en desarrollo. Antes de producción: validar MySQL, completar pruebas con ese motor, configurar HTTPS y `SESSION_SECURE_COOKIE=true`, `APP_DEBUG=false`, dominio propio, SMTP, procesos de cola, copias de seguridad y restauración, monitoreo y revisión de seguridad. El proxy debe servir el frontend y `/api` + `/sanctum` bajo el mismo origen. Ver [arquitectura](docs/ARCHITECTURE.md).

## Documentación

- [Requerimientos completos del producto](docs/REQUIREMENTS.md)
- [Arquitectura y decisiones](docs/ARCHITECTURE.md)
- [Base de datos y modelo relacional](docs/DATABASE.md)
- [DDL para MySQL Workbench](docs/database/initial-schema.mysql.sql)
- [Sistema de diseño](docs/DESIGN_SYSTEM.md)
- [Contrato API](docs/API.md)
- [Reglas de caja y pedidos](docs/OPERATIONS.md)
- [Venta, cálculo y devolución en efectivo](docs/SALES.md)
- [Abonos y pagos mixtos](docs/PAYMENTS.md)
- [Descuentos y propinas voluntarias](docs/ADJUSTMENTS.md)
- [Roadmap](docs/ROADMAP.md), [progreso real](docs/PROGRESS.md) e [historial](docs/CHANGELOG.md)
- [Tareas](docs/TASKS.md), [estado estructurado](docs/PROJECT_STATE.json), [continuidad](docs/HANDOFF.md) y [decisiones](docs/DECISIONS.md)

Las carpetas `mobile/` y `desktop/` reservan productos futuros; todavía no contienen aplicaciones.

Combos fijos: crea un producto de tipo **Combo de composición fija**, abre su ficha y elige **Configurar reparto** y **Nuevo componente**. Al tomar el pedido, prepara cada unidad y revisa sus importes/perfiles antes de agregarlo. Las partes forman el precio del combo y conservan su historia al cobrar o devolver.
