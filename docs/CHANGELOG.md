# Historial de cambios

## 0.4.0 · 2026-11-17

- Cajas por sucursal, apertura única, movimientos manuales, cierre y arqueo con diferencia firmada. Sin edición o borrado del historial.
- Pedidos con productos/variantes, precios y nombres históricos, notas, filtros, preparación, entrega y cancelación motivada.
- Importes calculados con BCMath, límites de DECIMAL, revisión de caja/pedido, auditoría y claves idempotentes por empresa.
- Reintento del mismo envío ante respuesta perdida; recorrido Chromium comprueba que no duplica aperturas.
- Permisos operativos, referencias compuestas, caja principal para sucursales nuevas/existentes y bloqueo de moneda desde el primer registro monetario.
- Migración aplicada en MariaDB; 68 pruebas backend y 416 aserciones aprobadas tanto en SQLite como en un esquema temporal MariaDB.
- Pedidos separados de ventas/pagos: entregar no registra ingresos, impuestos, recibo ni factura. Reglas en OPERATIONS.md.

## 0.3.0 · 2026-11-17

- Ficha de producto con fotografía privada, vista previa, sustitución y retirada.
- Validación de formato/tamaño/dimensiones y recodificación GD de JPEG/PNG/WebP; rutas generadas por servidor y acceso autenticado.
- Variantes por producto con SKU/barcode, precio/costo DECIMAL y disponibilidad propia; desactivación sin borrar historia.
- Códigos verificados entre productos y variantes bajo bloqueo de empresa, relación compuesta y paginación.
- Revisiones compartidas del producto para datos, fotografía y variantes. Los formularios conservan la versión con la que se abrieron.
- Pruebas de seguridad de archivos, aislamiento, referencias entre productos y edición desde dos pestañas.
- API de imágenes responde 401 al perder sesión también sin cabecera JSON; almacenamiento y caché de E2E aislados del entorno de trabajo.
- Migración aplicada y esquema MySQL Workbench actualizado.

## 0.2.0 · 2026-11-17

- Categorías y productos conectados a API, con búsqueda, filtros, paginación, edición y estados.
- Precios/costos DECIMAL(19,4), valores enviados como cadenas y visualización sin conversión a float.
- SKU y códigos de barras únicos por empresa, claves compuestas y costos protegidos por permiso.
- Revisiones de catálogo, auditoría transaccional y protección ante cambios de moneda.
- Migración aplicada en MariaDB 10.4.32 y suite validada en una base SQL temporal independiente.
- Pruebas adicionales de catálogo, aislamiento, precisión monetaria y recorrido móvil.
- Nueva documentación de catálogo; se mantiene pendiente POS, caja y cobros reales.

## Corrección de arranque local · 2026-11-17

- Puerto predeterminado de Laravel cambiado a 8001; el 8000 está ocupado por el proyecto Horizonte.
- Proxy de Vite, APP_URL, dominios de Sanctum y comandos de arranque alineados con el nuevo puerto.
- Sin detener ni modificar el proceso del otro proyecto.

## 0.1.0 · 2026-11-17

- Inspección de carpeta vacía, herramientas locales y compatibilidad de versiones.
- Documentación del requerimiento completo y arquitectura por dominios/fases.
- Inicialización Laravel 13 / Sanctum y React 19 / TypeScript / Vite 8 / Tailwind 4.
- Registro empresarial transaccional, sesiones con cookies/CSRF, límites de acceso, recuperación y revocación de sesiones.
- Contexto de empresa derivado de la identidad, scopes que fallan cerrado y FKs compuestas.
- Sucursales, roles dinámicos, catálogo de permisos y auditoría administrativa.
- Interfaz en español con resumen real del espacio, consulta de equipo, configuración y navegación adaptable.
- Identidad visual persistida por empresa, vista previa, historial y control de revisión.
- Migraciones y exportación reproducible de DDL para modelado en MySQL Workbench.
- Pruebas backend y E2E en bases SQLite exclusivas; conexión del MySQL del usuario pendiente de configuración.

No se declara completada toda la Fase 1 ni implementadas fases posteriores.
