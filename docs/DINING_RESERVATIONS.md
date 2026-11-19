# Reservas de mesas · 0.27

Completa2.4-C sobre configuración0.25 y ocupación0.26. Reservas persistentes por empresa/sucursal, sin cobros ni notificaciones simuladas.

dining.reserve autoriza consultar datos de contacto, agendar, editar, cancelar o marcar inasistencia. Llegada exige además dining.operate; enlace a atención requiere dining.view. Propietarios existentes reciben el nuevo permiso; otros roles se configuran desde Roles. Un rol de recepción puede empezar directamente en /salones/reservas sin acceso a caja, pedidos ni ocupación.

API dining-reservations GET/POST, .../{id} GET/PUT y .../{id}/state POST; dining/reservation-tables GET paginado. Listado por sede/estado/nombre y día de la empresa, paginado. El día se calcula desde la zona vigente consultada en base de datos y se convierte a la zona de almacenamiento app.timezone. Fechas JSON en UTC; fecha/zona originales de reserva conservadas.

Formulario captura expected_timezone, horarios ISO8601 con segundos y desplazamiento explícito, revisión y UUID. Servidor comprueba que la hora local y el desplazamiento correspondan a esa zona; rechaza horas inexistentes. UI usa Intl y exige elegir desplazamiento cuando una hora se repite. Un cambio de zona empresarial mientras se edita devuelve409. No reinterpretar reservas históricas al cambiar la zona.

Inicio futuro dentro de un año; duración real15min..12h, personas1..100 y1..20 mesas activas de salones activos en la misma sucursal, con revisión de mesa y capacidad conjunta suficiente. Ventanas [inicio, fin): reservas contiguas permitidas. Cruces sobre cualquier mesa se rechazan bajo Tenant lock; cuentan pendientes y llegadas cuya atención siga abierta. Mesas actualmente ocupadas pueden reservarse para un horario futuro; eso no libera la atención existente.

Reprogramar avanza revisión y archiva asignaciones previas sin borrarlas. Cancela/inasistencia liberan ventana sin borrar reserva; inasistencia solo después del final. Mientras haya reservas pendientes futuras no se archiva salón/mesa ni se reduce capacidad de mesa. Nombres y asignaciones históricas se conservan.

Llegada manual desde30min antes del inicio hasta el final. Reutiliza DiningOccupancy para abrir una atención real con personas/mesas/mesero autorizado. Si las mesas siguen ocupadas, devuelve409 y conserva reserva pendiente. Nueva ocupación normal no puede tomar una mesa con reserva pendiente en curso; editar una atención conserva las mesas que ya tenía. Reserva/atención/membresías/eventos/UUID/auditorías confirman o revierten juntos. Reintentar llegada no duplica atención.

Estados booked → arrived/cancelled/no_show, sin borrar historia ni cambiar estados finales. Llegada guarda dining_session_id; atención y pedidos/cobros posteriores usan0.26. Cerrar esa atención libera la ocupación y permite reutilizar el horario restante; no marca pagos ni libera deuda automáticamente.

UI lazy /salones/reservas con filtros, agrupación de mesas, contactos, horario/zona, estados y acceso a atención. Captura revisiones iniciales y preserva DTO/UUID ante respuesta incierta; modales se mantienen aunque refetch retire una fila del filtro actual. No se crean clientes ficticios, cobros, SMS ni correos.

Resultados exactos y esquemas SQL conservados en PROJECT_STATE/PROGRESS. Migración000025 usa DATETIME para horarios, con zona de almacenamiento explícita, sin valores cero implícitos de TIMESTAMP de MariaDB.
