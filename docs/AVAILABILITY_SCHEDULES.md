# Horarios de disponibilidad · 0.18

Cada producto puede habilitar ventanas semanales de venta, heredadas por sus presentaciones y preparaciones. El horario empieza deshabilitado para conservar el comportamiento previo. Habilitado sin ventanas activas significa fuera de horario; deshabilitarlo conserva las ventanas y deja de aplicar esta restricción.

Disponibilidad manual, categoría/padre, presentación y perfil tributario siguen aplicándose. Una ventana abierta no reactiva un producto agotado ni una presentación archivada. El filtro existente `availability` mantiene su significado manual; `sellable` añade el resultado del horario. Las listas de variantes conservan sus flags manuales: la restricción heredada se consulta en el producto y se exige al registrar.

## Ventanas y reloj

Una ventana tiene nombre, día ISO 1–7, inicio/final HH:mm, indicador explícito de fin al día siguiente, fechas opcionales de vigencia y estado/revisión. Hasta 28 ventanas activas por producto; archivadas conservadas y paginadas. Solapes forman una unión, sin prioridad ni precio especial.

- Inicio incluyente y final excluyente, con límites de minuto. A las 12:00:00 ya no aplica una ventana que termina a las 12:00.
- Mismo día exige final mayor que inicio. Día siguiente exige final menor o igual a inicio; igualdad representa un día local completo.
- La vigencia se compara con la fecha local de inicio de la ventana. Viernes 22:00–sábado 02:00, vigente hasta ese viernes, incluye sábado 01:00 y excluye sábado 02:00. También se evalúa la fecha anterior para la madrugada.
- Se usa el reloj real del servidor y la zona IANA actual de empresa. Una hora repetida por cambio estacional tiene la misma elegibilidad en sus dos ocurrencias; una hora inexistente no ocurre. Un día local completo puede durar 23 o 25 horas transcurridas en esas transiciones.

No cambia APP_TIMEZONE ni los timestamps SQL. Cambiar zona empresarial reinterpreta ventanas futuras; preferencias explica este efecto. No se reescriben pedidos anteriores. No hay excepciones festivas, reserva de disponibilidad, programación de precios ni predicción de próxima apertura.

## Administración y API

La ficha muestra horarios y estado al consultar. Se pueden crear/editar/archivar ventanas y habilitar/deshabilitar su aplicación por separado. Los formularios conservan revisión original, moneda, zona al abrir y UUID/cuerpo exactos ante respuesta incierta mientras permanecen abiertos. Lectura con `catalog.view`; escritura con `catalog.manage`.

- `GET products/{product}/availability-windows`: `status=active|inactive`, `page`, `per_page` hasta 50. Diez por página predeterminadas. Devuelve ventanas y metadatos `enabled`, `product_revision`, `availability_context`.
- `POST .../availability-windows`: UUID, `product_revision`, `currency`, `expected_timezone`, `name`, `weekday`, `start_time`, `end_time`, `ends_next_day`, `valid_from`, `valid_until`, `is_active`. Fechas nullable en formato YYYY-MM-DD. No acepta tenant/product/variant como autoridad de entrada.
- `PUT .../availability-windows/{availabilityWindow}`: los mismos campos y `revision` de ventana. Puede cambiar el intervalo futuro conservando ID e historia del pedido.
- `PUT products/{product}/availability-policy`: UUID, `product_revision`, `currency`, `expected_timezone`, `enabled`. Responde política/revisión actuales, también al reintentar un comando registrado.

SaveAvailability comprueba Policy antes del replay y usa IdempotentOperation, bloqueo de empresa/producto, contexto monetario/revisiones y auditoría atómica. Bajo ese bloqueo exige que expected_timezone coincida con la zona actual de empresa: un formulario abierto antes de cambiarla debe actualizarse, sin reinterpretar silenciosamente las horas. El replay registrado conserva su cuerpo anterior y no vuelve a ejecutar esa escritura. Cada cambio incrementa Product.revision; editar una ventana incrementa su revisión. Los bindings y FK compuesta impiden referencias a otro producto/tenant. No hay eliminación por API.

## Lectura y registro

AvailabilitySchedule carga ventanas activas por lote y evalúa un instante compartido en la zona empresarial. El recurso de producto devuelve `availability_context`: versión, habilitación, resultado/motivo, zona, instante UTC, revisión de producto y ventanas coincidentes con fecha de inicio. La UI muestra fuera de horario en catálogo/menú y consulta el menú cada 30 segundos mientras está activo. Es el estado al consultar; puede cambiar antes de enviar.

OrderPlan verifica otra vez la disponibilidad al previsualizar y registrar, bajo el bloqueo de empresa y con un instante común para todas las líneas. Un cierre entre preview y envío rechaza el pedido completo sin filas parciales. No se reserva el intervalo al añadir al carrito. Un conflicto conserva sus preparaciones; al reabrir se pueden revisar precios/revisiones sin perder notas ni cantidades. No se reemplazan opciones ni se registra un pedido cerrado simulando disponibilidad.

## Historia y compatibilidad

La migración 000018 añade bandera de producto, product_availability_windows y `order_items.availability_snapshot` JSON nullable. El snapshot guarda el contexto evaluado y los datos/revisiones de ventanas coincidentes. Las líneas anteriores permanecen null; no se infiere una hora de comprobación pasada. El descenso se rechaza para preservar historia.

Un UUID registrado devuelve su pedido aunque después cierre el horario o se archiven ventanas. Preparar, entregar, cobrar, abonar, dividir o devolver usa el pedido guardado sin comprobar otra vez el horario. El detalle/cobro/recibo muestra la comprobación histórica de los productos que tenían horario habilitado; los productos sin horario no añaden una línea visual innecesaria. Precios, adicionales, impuestos y saldos conservan sus reglas anteriores.

## Verificación

Backend: 222 pruebas y 2475 aserciones correctas en SQLite y MariaDB 10.4.32, incluida la suite previa. Casos de límites/medianoche/vigencia, día completo/solapes/DST, validación, límites/páginas, revisiones/UUID/permisos/tenant/FK/rollback, formulario con zona obsoleta, elegibilidad después de cambiar fotografía y cierre después del preview con snapshot/replay/cobro/devolución. Esquema final nexora_test_33d1dfbc81b8ea36 conservado junto a los intermedios 5c1f38d30adbbf2e (220/2450) y 35a6f4251e6a3c52 (221/2464), todos con prefijo nexora_test_. Suite completa de 21 Playwright aprobada en 22.4 minutos; recorrido final C2 con expected_timezone y captura administrativa limpia aprobado en 2.4 minutos. Build/formato/doctor/DDL correctos y capturas de escritorio/móvil revisadas; resultados en PROGRESS/HANDOFF.
