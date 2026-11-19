# Configuración y distribución de salones · 0.25

2.4-A implementa configuración. Operación2.4-B integrada en0.26: ver DINING_OPERATIONS.md. Reservas2.4-C siguen pendientes.

Cada salón pertenece a una sucursal estable y cada mesa al salón/sucursal de su empresa. Consultas con dining.view, comandos con dining.manage antes del replay. Propietarios existentes reciben ambos permisos en migración; otros roles se configuran desde Roles. Listas paginadas, búsqueda y archivo conservan registros; nombres únicos por sucursal/salón incluso archivados. Archivar salón no cambia flags de sus mesas.

API: dining-rooms GET/POST; dining-rooms/{id} GET/PUT; .../tables GET/POST y .../tables/{id} PUT; .../layout PUT. Detalle incluye hasta48 mesas activas y objetos del plano. UUID, revisión de salón y auditoría comparten transacción bajo bloqueo de empresa. Editar mesa exige también su revisión. Respuesta incierta se reintenta con DTO/UUID originales; duplicar clave con otro contenido o revisión obsoleta devuelve409.

Plano schema1 de1000×700. Cada mesa incluye id/x/y/width/height/rotation y debe aparecer exactamente una vez; ningún ID ajeno. Enteros, ancho/alto32..240, rotación0..359, rectángulo base dentro del plano; círculo/cuadrado con dimensiones iguales. Rotación visual alrededor del centro, recortada al borde del plano. No se comprueban colisiones: el usuario distribuye el espacio.

Hasta100 objetos con UUID, tipo wall/door/divider/decoration, etiqueta80, color hexadecimal y geometría acotada. Campos anidados ajenos rechazados; no HTML/CSS/URLs/scripts. Capacidad de mesa1..30, nombre50, formas circle/square/rectangle, color hexadecimal. Los elementos guardados no expresan disponibilidad operativa.

UI lazy /salones y /salones/:id con permisos. Editor SVG permite arrastre y controles numéricos accesibles de posición/tamaño/rotación; selección por lista/teclado, objetos y colores. Captura revisión inicial al abrir y no la sustituye por refetch. Cambios en lote al guardar; ante409 conserva borrador; ante respuesta incierta bloquea cambios y permite reintentar exactamente el comando original.

Verificación: SQLite7/129 y MariaDB dirigida5/54 (nexora_test_90a6782dbfaa84e4 conservada), registro/roles4/23; Chromium3/1.3min más lector403 final1/19.8s, build/TypeScript/Pint/Prettier y revisión visual desktop/móvil. Migración000023 aplicada y DDL exportado sin conexión. Sin suites generales ni cambios de cálculos financieros.
