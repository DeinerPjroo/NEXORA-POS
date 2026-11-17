# Roadmap de Nexora POS

No hay fechas comerciales comprometidas. Cada etapa depende de pruebas e integridad de la anterior.

| Fase | Entregables | Condición de salida |
| --- | --- | --- |
| 1 · Cimientos | Laravel/React, MySQL, identidad, empresas, sucursales, permisos, aislamiento, diseño y preferencias | Registro completo y sesiones seguras, aislamiento probado con varias empresas, migraciones y pruebas sobre MySQL, instalación reproducible |
| 2 · Operación | Catálogo, dashboard comercial, POS, salones/mesas, pedidos, ventas, pagos y caja | Venta/pago/caja transaccionales, idempotencia, impuestos/rounding definidos, anulaciones compensatorias y E2E operativo |
| 3 · Gestión avanzada | KDS con Reverb, inventario/recetas, compras/proveedores, empleados y reportes | Consumos reproducibles, concurrencia, kardex íntegro, canales privados y métricas desde operaciones reales |
| 4 · Nexora Studio | Editor visual, layouts por rol/dispositivo, widgets, documentos, campos y automatizaciones | Schemas versionados, undo/redo, borradores/publicación, importación/exportación, acciones autorizadas y pruebas de contenido malicioso |
| 5 · Plataforma SaaS | Superadministración, planes/precios/módulos, suscripciones y landing comercial | Restricciones de plan en servidor, auditoría de acceso excepcional, cobro real con proveedor elegido y métricas sin datos ajenos expuestos |
| 6 · Expansión | Expo/React Native, Electron/SQLite, offline/sync, QR, domicilios, hardware y DIAN | Pruebas de fallos/conflictos, deduplicación, dispositivos físicos y habilitación real por integración |

## Siguiente incremento

1. Catálogo, caja, pedidos y venta/devolución con métodos manuales ya implementados y migrados. La conexión MariaDB funciona y la suite pasó en un esquema temporal independiente conservado. Alcance en OPERATIONS.md/SALES.md, tareas en TASKS.md y estado en PROJECT_STATE.json.
2. Añadir CI y validación específica de MySQL 8; mantener pruebas SQL aisladas con scripts/test-mysql.php.
3. Completar endurecimiento de identidad: verificación de correo, auditoría de autorización denegada, MFA/PIN y bloqueo según prioridad de operación.
4. Ampliar ventas: impuesto incluido global (2.1-E1), impuestos por producto (2.1-E2) y conciliación (2.1-F). Abonos/mixtos operan desde 0.7; porcentaje/propina voluntaria desde 0.8, devoluciones parciales desde 0.9 y partes iguales desde 0.10. División por productos/unión de cuentas sigue con POS/mesas. Verificar proveedores reales antes de anunciar confirmación electrónica.
5. Incorporar salones/mesas y asignaciones por sucursal; después abordar KDS y actualización en tiempo real con permisos y pruebas de concurrencia.

## Dependencias incorporadas por necesidad

Recharts al existir estadísticas comerciales; dnd-kit para editor de mesas y Studio; Reverb con KDS; Zustand si el estado transitorio de editores lo justifica. React Native, Expo, Electron y adaptadores de impresión en Fase 6. No instalar por adelantado herramientas sin uso actual.
