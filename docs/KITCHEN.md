# Nexora Kitchen

Fase3.1 se divide en incrementos integrados: A configuración de estaciones; B rutas de productos y comandas derivadas de pedidos con snapshots; C eventos Reverb privados por empresa/sucursal y recuperación tras reconexión; D estados configurables, prioridades, temporizadores, avisos e historial. Impresión física requiere adaptadores/hardware de fase6; no se simula impresión enviada.

3.1-A configura estaciones por sucursal: nombre, color, tiempo objetivo de1–1440 minutos y archivo reversible. No se crean estaciones ficticias. La lista tiene filtros de sucursal/estado/nombre y paginación. kitchen.view consulta, kitchen.manage guarda; propietarios existentes reciben ambos mediante migración000028. El servidor conserva tenant, sucursal inicial, revisión y UUID; nombres únicos incluso archivados por sucursal, FK compuesta y scope que falla cerrado. No se eliminan filas.

POST/PUT kitchen-stations reutilizan IdempotentOperation, bloqueo de empresa, auditoría transaccional y Gate antes del replay. Una edición exige revisión; conflicto409 no pisa cambios ajenos. La SPA reutiliza useOperation para conservar UUID/DTO exactos tras respuesta incierta y conserva el snapshot del editor fuera de la lista. La ruta /cocina/estaciones admite lector propio sin acceso a ventas/caja; los permisos se vuelven a comprobar en API.

El tiempo configurado es un objetivo de preparación, no una duración real ya medida. Los temporizadores y el flujo de comandas se incorporan en B/D; Reverb no está instalado ni anunciado en A. La configuración de cocina no modifica pedidos, impuestos, pagos ni movimientos de caja.

Verificación A cerrada: cobertura backend/SQL/build anterior conservada. Chromium creación/archivo/móvil y lector/403 aprobados entre ejecuciones dirigidas (20.5s/20.1s), con capturas de configuración. El test espera logout y envía Origin para Sanctum. Padre3.1 y fase3 continúan en progreso; siguiente rutas/comandas.

3.1-B implementada: rutas por producto individual/sucursal con revisión de producto, archivo y FK tenant/sucursal/estación. Los combos usan sus componentes. Enviar desde POS guarda primero el pedido y despacha únicamente order_items no enviados; una restricción única impide duplicados. Sin ruta activa se rechaza todo el envío. Cada estación recibe snapshots de nombres, cantidades, variante, notas/preparaciones y tiempo objetivo; no precios ni impuestos. Nuevas adiciones generan otra comanda sobre el mismo pedido.

Kitchen usa estados Nuevas → En preparación → Terminadas → Entregadas, revisión/UUID/auditoría y sincronización del pedido solo cuando terminan todas las estaciones y no quedan líneas sin enviar. Cancelar pedido cancela comandas activas, conservando historial; mientras tenga comandas, el estado se gestiona desde cocina. Contadores usan fechas de servidor, no datos ficticios. El tablero consulta datos reales cada cinco segundos; Reverb privado sigue pendiente en C. Los estados configurables/prioridades/avisos de D no se anuncian completos.

B verificada con ocho casos nativos cubiertos entre ejecuciones y MariaDB8/120 (14f1e841cf9e51dc conservado); comprobación adicional de paginación de rutas1/27. Chromium kitchen-flow1 pasó: rutas desde UI, envío POS/respuesta perdida, estado con respuesta perdida, temporizador, notas, entrega y una sola comanda, saldo de caja intacto. Captura KDS revisada. Migración000029 aplicada sin cambiar .env/APP_KEY ni crear datos de restaurante; DDL actualizado. Sin suites completas.


## Sincronizacion privada (3.1-C)

Reverb y Echo existentes notifican cambios con `refresh=true` sin datos de negocio en canales privados por empresa/sucursal. Autorizacion POST `broadcasting/auth` con Sanctum/CSRF, MFA, bloqueo, kitchen.view y BranchAccess; GET `kitchen/realtime?branch_id=...` devuelve solo conexion publica autorizada. Los eventos salen despues del commit; rollback/replay no notifican y una caida de transporte no invalida el comando. El tablero recupera datos desde la API al evento y al reconectar; conserva respaldo cada5s. Bloquear, salir o cambiar sucursal desconecta; Studio no conecta.

Para habilitar en un entorno: configurar `BROADCAST_CONNECTION=reverb`, `REVERB_APP_ID`, `REVERB_APP_KEY` y `REVERB_APP_SECRET` propios, host/puerto/esquema y origenes permitidos segun `.env.example`; iniciar `php artisan reverb:start` desde backend. En desarrollo local el ejemplo usa127.0.0.1:8085; produccion requiere servicio supervisado/TLS y configuracion propia. No se modifica el .env de usuario ni se afirma servicio productivo activo. Log/null conservan la consulta periodica.

Verificacion dirigida: Workflow12, transporte caido1, autorizacion3; Chromium real1/40.5s con consulta5s suspendida, reconexion tras cambio desde otra sesion y bloqueo. Ejecutar este caso con `NEXORA_E2E_REVERB=1` y `npx playwright test e2e/kitchen-realtime.spec.ts --trace=off`; runner inicia Reverb aislado8086 y usa exclusivamente e2e.sqlite. Estados configurables/prioridades/avisos siguen en3.1-D.
