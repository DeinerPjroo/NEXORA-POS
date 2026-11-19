# Denegaciones de acceso · 0.32

AuditDeniedAccess se sitúa después de autenticación y antes de límites de ruta, versión MFA, contexto y bindings. Captura únicamente el identificador autenticado en un atributo interno de Request. Al terminar la respuesta registra401/403/404/423/429 para rutas API protegidas; el actor puede haberse cerrado por versión de sesión obsoleta. Sin identidad autenticada o ruta reconocida no atribuye una empresa a partir de parámetros, cookies sin autenticar o cabeceras del cliente.

Acciones: access.unauthorized, access.denied, access.unavailable, access.locked y access.limited. Descripciones estáticas en español; metadata contiene solo status, method y plantilla de ruta del servidor. No incorpora valores de bindings, ID ajeno, URL/query/firmas, cuerpo, motivo del usuario, correo, credenciales, PIN, TOTP o códigos de recuperación. Un404 no distingue recurso inexistente de recurso ajeno. Actor/empresa se resuelven de la identidad global validada y TenantContext se restaura al terminar.

La escritura sucede en terminate, después de resolver respuesta y revertir transacciones fallidas del dominio. No altera status, permisos, idempotencia ni importes. Un fallo del destino de auditoría conserva el rechazo y emite un aviso de servidor solo con clase de excepción; un fallo adicional de logging tampoco concede acceso. Esto no relaja la auditoría transaccional obligatoria de comandos exitosos, que sigue provocando rollback si falla.

Muestreo para contener saturación: una fila por actor/plantilla/método/status cada60 segundos y presupuesto de20 filas por actor/minuto. No es un registro individual de todos los intentos ni un SIEM. Eventos especializados de login/PIN/MFA existentes siguen vigentes y no se duplican aquí. Éxitos, validaciones422 ordinarias, invitados y rutas desconocidas no generan eventos de empresa en este mecanismo.

Reutiliza audit_logs, audit.view y la actividad de Vista general; no agrega tablas, permisos, dependencias ni otra pantalla. Lectores sin audit.view no reciben historial; lectores autorizados solo reciben su empresa, con la ventana existente de ocho eventos. Protección/retención centralizada y supervisión de logs siguen en operación/despliegue, sin anunciar certificación ni auditoría externa.

Pruebas específicas: aislamiento/cuerpo y firmas omitidos,404 equivalente/muestreo,423/401/429, topes por actor, contexto restaurado, lectura propia, rollback de datos con rechazo retenido y fallo de auditoría sin cambiar403. Chromium ejecuta una denegación real, verifica metadata sin secretos y consulta el evento en la interfaz existente.

Referencia: [OWASP, Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html), para fallos de autorización, omisión de secretos y conservación del comportamiento cuando falla logging.
