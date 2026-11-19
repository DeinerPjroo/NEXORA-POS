# Concurrencia financiera

1-OPS-B usa dos procesos PHP y conexiones SQL independientes, coordinados por una barrera después de arrancar Laravel. Reutiliza los comandos financieros existentes: no duplica su lógica ni cambia reglas o importes de producción.

Ejecutar desde raíz `php scripts/test-mysql.php '--filter=FinancialConcurrencyTest|MfaConcurrencyTest'`. El runner crea un esquema aleatorio y lo conserva; el worker CLI rechaza bases sin nombre y marca de aislamiento. SQLite omite estas pruebas y no demuestra concurrencia SQL.

Cobertura: mismo UUID produce una sola venta/recibo/pago/efecto de caja; UUID distintos no recobran un pedido; apertura única; abonos limitados al saldo; devoluciones limitadas al pago sin reabrir deuda; dos ventas no sobregiran caja compartida; UUID aislado por empresa; recursos ajenos inaccesibles; permiso revocado se comprueba antes del replay. La regresión MFA conserva consumo único de TOTP y recuperación.

Verificado localmente en MariaDB: 9 pruebas / 121 aserciones, esquema `nexora_test_34e4b943644faf6c` conservado. CI selecciona estos casos al cambiar el worker o la clase común. Esta verificación comprueba carreras concretas; no constituye una prueba de carga o capacidad de producción.
