# Operación real de mesas · 0.26

2.4-B conecta ocupación, unión/separación, meseros y pedidos al POS. Las reservas siguen en2.4-C.

dining.operate autoriza operaciones; dining.view permite consultar mesas/atenciones. Propietarios existentes reciben el nuevo permiso; Roles permite asignarlo a usuarios existentes. Un mesero es un usuario activo de esta empresa con dining.operate; se consultan únicamente id/nombre, sin inventar fichas de empleados ni procesos de RRHH.

DiningSession pertenece a una sucursal y agrupa1..20 mesas activas de salones activos de la misma sede. Cada mesa exige revisión de configuración al seleccionarla; personas1..100 sin superar capacidad conjunta. La clave generada occupied_table es única por empresa mientras released_at sea null: impide ocupar simultáneamente la misma mesa incluso por SQL directo. Tenant lock, revisión de atención y UUID serializan comandos. Las membresías liberadas y eventos se conservan.

Unir/separar reemplaza el conjunto activo: retirar una mesa libera su membresía, añadir crea otra; nunca borra historia. No une automáticamente dos atenciones abiertas ni mezcla cuentas financieras: se pueden trasladar pedidos sin venta entre ellas. Una mesa ocupada no se edita/archiva y un salón ocupado no se archiva; el plano puede reorganizarse sin modificar los pedidos.

API: dining-sessions GET/POST; .../{id} GET/PUT; .../{id}/close POST; dining-rooms/{id}/occupancy GET; dining/available-tables y dining/waiters GET paginados. Detalle conserva eventos (últimos50 en respuesta) y hasta100 pedidos por atención. Listas de atenciones paginadas, filtro sede/estado. Los lectores sin orders.view no reciben pedidos ni detalles de eventos de pedido.

OrderRequest admite dining_session_id/revision opcionales para dine_in; las operaciones sin mesa anteriores siguen válidas. Gate dining.operate antes del replay. CreateOrder comprueba atención abierta/sucursal/revisión bajo la transacción existente, conserva snapshot inicial de mesas y avanza revisión de atención. Los precios, impuestos y cobros usan los servicios existentes.

orders/{id}/dining-transfer POST exige dining.operate/orders.manage/orders.view, revisión de pedido/origen/destino y atención abierta de la misma sede. Solo pedidos sin venta y sin cancelar. Cambia asociación y revisión, agrega eventos en ambas atenciones; conserva líneas, importes y snapshot inicial. Un checkout con revisión anterior queda obsoleto. Una venta nunca se traslada.

Cerrar exige cobrar o cancelar todos los pedidos: una venta con balance_due positivo impide cierre. Reutiliza SaleBalance/BCMath y bloqueo de empresa compartido con cobros. Pagar no libera mesas automáticamente: el operador confirma cierre. Cerrar no cobra, devuelve dinero ni cambia ventas/pagos/caja. Replay exacto sigue disponible aunque la atención ya esté cerrada.

UI: ocupación del salón, /salones/atenciones (abiertas/cerradas), /salones/atenciones/:id con agrupación/mesero/cierre/actividad/traslado. POS /pos/atenciones/:id captura contexto inicial; selector de atención al tomar pedidos dine_in. Refetch no adopta revisiones silenciosamente ni desmonta formularios inciertos; el traslado se conserva fuera de la lista de pedidos para sobrevivir a su actualización.

Validación dirigida y resultados exactos en PROJECT_STATE/PROGRESS. No se ejecutan suites generales por rutina; no se declara padre2.4 completo antes de reservas.
