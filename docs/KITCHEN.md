# Nexora Kitchen

Fase3.1 se divide en incrementos integrados: A configuración de estaciones; B rutas de productos y comandas derivadas de pedidos con snapshots; C eventos Reverb privados por empresa/sucursal y recuperación tras reconexión; D estados configurables, prioridades, temporizadores, avisos e historial. Impresión física requiere adaptadores/hardware de fase6; no se simula impresión enviada.

3.1-A configura estaciones por sucursal: nombre, color, tiempo objetivo de1–1440 minutos y archivo reversible. No se crean estaciones ficticias. La lista tiene filtros de sucursal/estado/nombre y paginación. kitchen.view consulta, kitchen.manage guarda; propietarios existentes reciben ambos mediante migración000028. El servidor conserva tenant, sucursal inicial, revisión y UUID; nombres únicos incluso archivados por sucursal, FK compuesta y scope que falla cerrado. No se eliminan filas.

POST/PUT kitchen-stations reutilizan IdempotentOperation, bloqueo de empresa, auditoría transaccional y Gate antes del replay. Una edición exige revisión; conflicto409 no pisa cambios ajenos. La SPA reutiliza useOperation para conservar UUID/DTO exactos tras respuesta incierta y conserva el snapshot del editor fuera de la lista. La ruta /cocina/estaciones admite lector propio sin acceso a ventas/caja; los permisos se vuelven a comprobar en API.

El tiempo configurado es un objetivo de preparación, no una duración real ya medida. Los temporizadores y el flujo de comandas se incorporan en B/D; Reverb no está instalado ni anunciado en A. La configuración de cocina no modifica pedidos, impuestos, pagos ni movimientos de caja.

Verificación A en curso: SQLite módulo/fundamento31/158 y MariaDB módulo5/47 aprobados; compilación/TypeScript y migración000028 correctos. Navegador y revisión visual dirigidos pendientes al preparar este documento. No se ha completado el padre3.1 ni la fase3.
