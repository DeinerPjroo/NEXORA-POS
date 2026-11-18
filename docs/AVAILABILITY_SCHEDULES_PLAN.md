# Horarios de disponibilidad · diseño 2.2-C2

Plan del incremento posterior a precios0.17, no capacidad publicada. Fuente: REQUIREMENTS6.6, TASKS2.2-C2 y CATALOG_ADVANCED_PLAN. Reutilizar catálogo, revisiones, archivo, auditoría/UUID y OrderPlan; no requiere proveedor externo ni paquetes nuevos.

## Comportamiento esperado

Cada producto puede activar un horario semanal, heredado por sus presentaciones y preparaciones. Inicialmente está deshabilitado: conserva la disponibilidad manual existente. Activarlo limita la venta a la unión de sus ventanas activas; activado sin ventanas activas significa fuera de horario, no abierto todo el día. La UI debe explicar/confirmar esta consecuencia. Estado manual, categoría/padre, variante y perfil tributario siguen siendo restricciones adicionales; un horario abierto no los reactiva.

Una ventana tiene nombre, día de inicio ISO1–7, hora inicial/final HH:mm, indicador explícito de fin al día siguiente, vigencia inicial/final de fecha opcional y estado/revisión. Mismo día exige final mayor que inicio. Día siguiente exige final menor o igual a inicio; igualdad significa24horas explícitas. No interpretar igualdad sin ese indicador como día entero. Fin excluyente e inicio incluyente, precisión de minuto; los segundos actuales se comparan contra límites reales del minuto. Ventanas superpuestas se unen, no generan prioridades ni descuentos.

La vigencia se aplica a la fecha local de inicio de la ventana. Ejemplo: viernes22:00–sábado02:00, vigente hasta ese viernes, permite sábado01:00 y termina a las02:00. Debe comprobarse también la fecha anterior al evaluar la madrugada. Se usan reloj real del servidor y zona IANA actual de empresa, sin cambiar APP_TIMEZONE ni timestamps SQL. En cambios de horario de verano se evalúa la hora local de pared: una hora repetida satisface ambas ocurrencias y una hora inexistente no ocurre. No prometer una próxima transición calculada hasta probarla correctamente.

Cambiar la zona empresarial modifica la interpretación de horarios futuros; la UI de preferencias debe advertirlo si existen horarios activados. No se modifican pedidos guardados. No incluye excepciones festivas, reserva futura ni programación de precios/promociones; se desglosan después si el alcance los requiere.

## Datos y comandos

Migración incremental siguiente, sin reescribir migraciones publicadas: bandera de horario habilitado en producto y tabla product_availability_windows con tenant/producto, campos de ventana, revisión/estado y timestamps. FK compuesta tenant/product; índices para consultas por producto/estado. Los nombres/hora/vigencia son datos validados, no expresiones. Sin borrar ventanas anteriores. Acotar ventanas activas por producto para evaluación y conservar archivadas con paginación; límite propuesto28, documentado en UI/servidor/pruebas.

Comandos de habilitación y alta/edición/archivo bajo bloqueo Tenant/producto, Policy catalog.manage antes del replay, revisión de producto/ventana y UUID, moneda/contexto de configuración coherentes y auditoría atómica. Cada cambio incrementa Product.revision. Lectura catalog.view; ningún costo se filtra a lectores. No confundir revisión de ventana con la de todo el producto. Formularios conservan revisiones originales y UUID/cuerpo ante respuesta incierta.

## Lectura y pedido

Un resolvedor central recibe un instante y zona, carga ventanas activas por lote y devuelve estado/motivo/zona/instante evaluado. Menú y ficha muestran fuera de horario de forma visible; no confiar en reloj del navegador ni únicamente deshabilitar botones. Mantener la semántica del filtro manual de disponibilidad existente y explicar el estado derivado del horario. Las variantes heredan el horario del producto sin otro selector truncado.

OrderPlan comprueba de nuevo la hora real bajo bloqueo al previsualizar y registrar, antes de calcular importes; una cotización previa no reserva disponibilidad. Si cierra entre preview/envío, rechazar sin pedido parcial y permitir corregir carrito. Al registrar, guardar snapshot nullable con instante UTC, zona, modo habilitado, revisión y ventanas coincidentes suficientes para explicar la aceptación; no reconstruir historia de horarios anteriores. El replay de UUID registrado devuelve el pedido original aunque haya cerrado después. Preparar, entregar, cobrar, abonar o devolver pedidos guardados no comprueba horario actual ni cambia su precio.

## Aceptación antes de publicar

- SQLite/MariaDB: migración/FK/aislamiento, rangos de hora/día/fecha, límites, medianoche/vigencia/día anterior y zona distinta de SQL; pruebas con reloj congelado y casos de horario de verano.
- Archivo/reactivación/modo sin ventanas, estado manual/categoría/variante/impuestos, permisos/revisión/UUID/rollback y consultas por lote. Límites de lista y archivados conservados.
- Preview y registro comparten resolución; intervalo fin excluyente, cierre entre ambos y rechazo atómico. Precio contextual y adicionales siguen sus reglas y revisiones. Replay/snapshots/cobro/devoluciones no cambian al cerrar el horario.
- UI/API conectadas para configurar días/horas/vigencia, mostrar zona/motivo en menú y tratar conflicto sin perder preparaciones. Prueba Chromium determinista sin cambiar reloj global del servidor ni esperar al minuto real; fixture aislado solo si es necesario y sin endpoint de producción para controlar hora.
- Para Chromium, preferir ventanas explícitas de24horas para los siete días y luego archivo/desactivación administrativa para comprobar cierre. Reservar límites exactos de minuto/vigencia/DST al backend con reloj congelado. Así no hace falta un reloj especial del servidor E2E.
- Build/formato/DDL/doctor, regresión completa, capturas escritorio/móvil y documentación de contrato/resultados; commit/push normal antes de combos2.2-D.
