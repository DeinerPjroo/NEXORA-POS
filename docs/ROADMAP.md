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

1. Catálogo con fotografía privada y variantes ya implementado y migrado. La conexión MariaDB funciona y la suite pasó en un esquema temporal independiente.
2. Añadir CI y validación específica de MySQL 8; mantener pruebas SQL aisladas con scripts/test-mysql.php.
3. Completar endurecimiento de identidad: verificación de correo, auditoría de autorización denegada, MFA/PIN y bloqueo según prioridad de operación.
4. Continuar Fase 2: definir caja/sesiones, pedido vs venta, impuestos/redondeo, estados e idempotencia antes de implementar un circuito de venta real. Para productos con variantes, exigir la selección de una presentación activa y disponible; el precio base queda como referencia.

## Dependencias incorporadas por necesidad

Recharts al existir estadísticas comerciales; dnd-kit para editor de mesas y Studio; Reverb con KDS; Zustand si el estado transitorio de editores lo justifica. React Native, Expo, Electron y adaptadores de impresión en Fase 6. No instalar por adelantado herramientas sin uso actual.
