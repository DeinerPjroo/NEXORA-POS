# Impuestos por producto (0.12)

## Configuración y uso

En Ventas → Perfiles de impuestos, crear un perfil con nombre, precio incluido/adicional y de uno a cinco impuestos paralelos. Nombre/tasa explícitos por componente, tasa de 0 a 100 con hasta cuatro decimales; sin cascadas ni expresiones. No se asignan tasas o un régimen legal. Crear exige UUID; editar/archivar exige revisión y sales.configure. Sin borrado.

Asignar un perfil en el editor del producto (catalog.manage); las variantes heredan el perfil del producto. La selección conserva la revisión del perfil. Una API anterior que omita la asignación la conserva, no la borra. Sin perfil, el producto no agrega impuestos en el modo por producto; esto no declara una exención legal.

En Configurar ventas, activar **Perfiles de impuestos por producto** y confirmar. Los modos globales none/exclusive/inclusive siguen disponibles. En modo por producto, no se usa una tasa global adicional. Si hay pedidos anteriores sin snapshot todavía no cobrados/cancelados, se exige resolverlos bajo el modo global antes de activar; no se adivinan sus tasas ni se borran pedidos.

## Snapshots y cambios

Cada línea nueva de pedido copia perfil/nombre/revisión/modo/tasas. La revisión de perfil se comprueba junto a producto/precio al registrar el pedido, incluso si el producto no cambió de revisión. Cambiar un perfil afecta pedidos futuros; no reinterpreta pedidos ya registrados. Archivar un perfil asignado bloquea nuevos pedidos de ese producto hasta elegir un perfil activo o retirar la asignación explícitamente. Los pedidos anteriores conservan su copia.

La venta guarda calculation_version=3 y tax_breakdown inmutable con asignaciones/base/componentes por línea y propina. Los modos globales conservan versiones 1/2. Abonos, partes iguales y devoluciones usan el total confirmado y no recotizan impuestos. Las devoluciones compensan pagos; no son notas fiscales ni distribución tributaria de productos devueltos.

## Cálculo y centavos

1. Redondear subtotal global half-up a dos decimales y calcular descuento fijo/porcentual como antes.
2. Distribuir los centavos de subtotal entre líneas en proporción a sus importes originales de cuatro decimales mediante mayores restos, desempate por orden/id de línea. Distribuir descuento global sobre esos subtotales con el mismo método. Las sumas coinciden exactamente y ningún descuento excede su línea.
3. Exclusive: base de línea = subtotal asignado − descuento asignado. Calcular cada impuesto paralelo sobre esa base, redondear half-up cada componente y sumarlo al importe.
4. Inclusive: extraer base con la suma de tasas, redondear base una vez y obtener impuesto total por diferencia. Distribuir sus centavos entre componentes según tasas/mayores restos, desempate por orden del perfil; no añadirlo otra vez. Todos cero produce componentes cero sin división por cero.
5. Total = subtotal redondeado − descuento + propina + impuestos adicionales. Los incluidos ya forman parte del importe. El recibo separa impuestos incluidos/adicionales y conserva el detalle.

CentAllocation usa enteros BCMath como cadenas, cocientes/restos exactos y posiciones estables. Solo la cantidad de centavos restantes (menor que el número de pesos) pasa a int; los importes nunca pasan a float/int. Límites DECIMAL controlados; el navegador usa BigInt solo en borradores, no confirma impuestos.

Ejemplo probado con tasas ficticias 8 % + 2 %: precios 100.0050 adicional, 110.0050 incluido y 10.0050 sin perfil. Subtotal global 220.02 distribuido 100.01 / 110.01 / 10.00. Descuento 22.00 distribuido 10.00 / 11.00 / 1.00. Impuesto adicional 9.00 e incluido 9.00; base 189.02 y total final 207.02, sin doble adición del incluido.

## Propina explícita

Si queda fuera del cálculo, se agrega su importe aceptado sin impuestos. Si participa en modo por producto, la empresa debe elegir y confirmar un perfil específico para propina. No se infiere de los productos. El perfil incluido extrae impuesto del importe aceptado; el adicional calcula impuestos que se suman. Permiso sales.tips y consentimiento positivo se mantienen; importe cero no crea línea de propina.

La configuración conserva snapshot del perfil de propina hasta confirmar una nueva selección. Editar/archivar el catálogo de perfiles no reescribe esa política ya confirmada ni ventas anteriores. Al seleccionar/guardar un perfil se valida revisión/estado actual. La UI explica esta estabilidad. No se distribuyen propinas a empleados.

En el ejemplo anterior, propina 5.25 con perfil incluido 8 % + 2 % produce base 4.77 e impuesto incluido 0.48, componentes 0.38 / 0.10. Total final 212.27. Si se elige perfil adicional para esa propina, se añaden 0.53 y el total sería 212.80.

## API, migración y pruebas

GET/POST tax-profiles y PUT tax-profiles/{taxProfile}; listas paginadas/búsqueda, lectores catalog.view solo activos y administradores sales.configure todos. Contexto de empresa en servidor, índices/FKs compuestos, transacción/auditoría y reintento de creación sin duplicación. ProductRequest acepta tax_profile_id/tax_profile_revision; OrderRequest acepta expected_tax_revision por línea. No aceptar scripts, fórmulas o tasas de impuesto desde el cliente que cobra.

Migración 000012 crea tax_profiles, FK products→perfil y JSONs de snapshots en order_items/sales_settings/sales. No modifica importes ni inventa snapshots en pedidos antiguos; campos anteriores quedan null. Rollback destructivo de historia rechazado.

Pruebas backend de mezcla incluido/adicional/ausencia, distribución/centavos/extremos/overflow/cinco tasas, perfiles cero, descuentos completos con propina, revisión/archivado, snapshots, tenant/FK/permisos, validación estricta, auditoría, abonos/partes/devolución y versiones anteriores. Chromium aprobó perfiles→asignación→política de propina→pedido→cambio/archivado de perfil→cobro/partes/mixto→historia intacta→devolución→cierre. Verificación completa: 158/1526 SQLite/MariaDB, 15 Playwright (12.5 min), migración/doctor/DDL/build/TypeScript/Prettier/Pint/Composer/captura correctos.

La nueva prueba usa fixture de empresa ficticia creado por CLI y entra mediante login real. El script solo acepta el archivo SQLite canónico backend/database/e2e.sqlite, exige marca explícita y rechaza configuración en caché/otro driver/ruta/URL. No crea endpoints ni desactiva límites; los recorridos de registro originales siguen probando la UI y sus validaciones.
