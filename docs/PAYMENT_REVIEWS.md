# Revisión manual de pagos no efectivos (0.14)

Ventas → Historial de pagos → **Registrar revisión** permite declarar una comprobación humana de un pago no efectivo. No contacta banco/pasarela ni confirma un cobro electrónicamente. Tampoco cambia pagos, ventas, devoluciones o caja. No es un reporte de liquidaciones/comisiones del proveedor.

## Declaración y estados

- **Revisado manualmente (matched):** importe observado igual al neto actual del pago; referencia de soporte obligatoria. No se rellena el importe automáticamente.
- **Diferencia declarada (difference):** observado distinto del neto, referencia y motivo obligatorios. Diferencia = observado − neto, firmada con BCMath y cuatro decimales almacenados. Valores observados no negativos, hasta 15 enteros y dos decimales; neto cero también puede revisarse.
- **Pendiente de revisión (pending):** motivo obligatorio, sin importe observado/diferencia; referencia opcional. Una nueva declaración pendiente conserva todas las anteriores.
- **Requiere nueva revisión (stale):** última declaración matched/difference corresponde a una revisión anterior de la venta. Se deriva al consultar; no se modifica la declaración histórica.
- Efectivo indica revisar en caja y no admite este comando. Consulta/revisión siguen el método original aunque luego se renombre o archive.

El operador confirma expresamente su declaración. Se guardan actor/nombre, fecha, moneda, versión por pago, revisión de venta, neto de ese momento, estado, observado/diferencia, referencia, motivo y procedencia operator. No hay edición, borrado ni etiqueta de proveedor confirmado.

## Concurrencia, permisos y reintento

sales.view permite leer estado e historial; sales.reconcile permite registrar. La nueva capacidad se concede automáticamente solo a propietarios existentes; otros roles anteriores requieren asignación explícita. La creación de nuevas empresas conserva su política de roles iniciales.

Cada comando exige UUID, sale_revision, review_revision (última versión, inicialmente 0), expected_net_amount y review_confirmed aceptado. Servidor bloquea empresa/venta y compara las tres precondiciones. Conflictos 409 requieren consultar datos actuales y abrir otra declaración. Estado incompatible con importe o datos incompletos responde 422. Actor/empresa derivan de sesión; cash/procedencia/confirmación de proveedor no son entradas autorizadas.

La revisión no incrementa Sale.revision. Nuevos pagos/devoluciones/cierre sí la cambian y dejan obsoleta una declaración matched/difference anterior, conservadoramente para todos los pagos de esa venta. La vista identifica qué revisión de venta sustentaba cada declaración. La fecha de consulta de pagos sigue siendo la fecha original del pago, no la de la revisión.

Revisión, auditoría y registro idempotente confirman o revierten juntos. Se comprueba permiso antes del replay. UUID/payload exactos devuelven la declaración histórica ya creada; si la venta cambió luego, el estado consultado sigue stale. La UI congela contenido tras una respuesta incierta y reintenta exactamente mientras permanece abierta; no hay recuperación persistente tras recargar/cerrar.

## API y almacenamiento

- POST finance/payments/{payment}/reviews: idempotency_key, sale_revision, review_revision, expected_net_amount, status, observed_amount (null/omitido si pending), reference, notes y review_confirmed.
- GET finance/payments/{payment}/reviews?page=1: historial descendente, diez por página, sales.view. Las respuestas exponen snapshot del actor sin datos de credenciales ni saldos de caja.
- GET finance/payments añade review_status=pending|matched|difference|stale, con filtro real antes de paginar. Estos filtros seleccionan solo no efectivos; método cash junto a un estado devuelve vacío. Resumen sigue siendo solo de página/moneda.
- Cada fila incluye review_status, review_revision y latest_review. Una fila sin declaración es pending. Latest-of-many usa ID estable; versión correlativa única tenant/payment/version bajo bloqueo.

Migración 000014 añade payment_reviews y permiso técnico. FKs compuestas tenant/sale/payment, tenant/branch/sale y tenant/actor, unique tenant/payment/version; modelos append-only, sin endpoints de edición/borrado. El descenso rechaza borrar historia automáticamente. Los importes operativos existentes no se reescriben.

## Verificación

175 pruebas / 1818 aserciones correctas en SQLite y MariaDB, con nexora_test_d5020cb6b079dcf8 conservada. Diez casos nuevos verifican idempotencia y autorización de replay, inmutabilidad financiera, filtros/última declaración, diferencias ±centavos, límites, neto cero, devolución/obsolescencia, rollback y FK/tenant. SQLite NUMERIC conserva sus límites de precisión de persistencia; MariaDB DECIMAL es la referencia financiera.

Suite completa 17 Playwright aprobada (10.4 min). El recorrido nuevo prueba respuesta perdida, reintento exacto sin duplicado, conflicto tras devolución, diferencia y consulta histórica móvil. Capturas finales revisadas, migración/doctor/DDL/build/TypeScript/Prettier/Pint/Composer correctos; resultados en PROGRESS/PROJECT_STATE.
