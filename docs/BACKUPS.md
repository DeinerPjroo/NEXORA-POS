# Respaldos privados y restauración

Comandos administrativos CLI; no se ofrecen por HTTP ni a roles empresariales. Requieren PHP ZIP con AES-256 y clientes mysqldump/mysql compatibles con el servidor. El respaldo comprende todas las empresas de esta instalación, SQL InnoDB, catálogo local y APP_KEY/APP_PREVIOUS_KEYS/cipher. No incluye .env, credenciales de proveedores ni configuración del servidor. Los objetos SQL personalizados (vistas, triggers, rutinas, eventos) se rechazan para evitar una copia silenciosamente incompleta.

Preparar un directorio privado fuera del proyecto y de la raíz web. En Windows restringir ACL al operador/servicio; chmod no sustituye ACL de Windows. Guardar la contraseña aleatoria de 32 o más caracteres separada del archivo. No pasarla por argumentos ni guardarla en Git: los comandos la solicitan sin mostrarla. Todas las entradas ZIP usan AES-256; un manifiesto cifrado verifica SHA-256 y se rechazan rutas inseguras, duplicados y entradas sin cifrar. Los nombres de archivos ZIP son visibles; su contenido está cifrado.

Antes del respaldo: poner la aplicación en mantenimiento, detener workers y esperar peticiones/escrituras en curso. No ejecutar migraciones ni modificar imágenes mientras se copia. `--drained` confirma que el operador completó este paso; el comando no lo presume ni detiene servicios compartidos automáticamente. Mantenimiento solo no termina trabajos ya iniciados.

```powershell
cd backend
php artisan down --retry=60
# Detener workers propios y esperar las operaciones en curso.
php artisan nexora:backup 'C:\Users\USUARIO\NexoraBackups' --drained --dump='C:\xampp\mysql\bin\mysqldump.exe'
php artisan up
```

El snapshot SQL usa single-transaction/quick, sin bloquear tablas, sin bases globales, y se elimina el SQL temporal al terminar el cifrado. Los directorios generados son nuevos; nunca se sobrescribe un respaldo. Copiar el ZIP cifrado a almacenamiento externo privado y comprobar su restauración periódicamente; una única copia en el mismo disco no cubre pérdida del equipo. Programación, retención y almacenamiento remoto dependen del entorno y no se anuncian configurados.

```powershell
php artisan nexora:restore 'C:\Users\USUARIO\NexoraBackups\nexora-...\backup.zip' 'C:\Users\USUARIO\NexoraRestores' --client='C:\xampp\mysql\bin\mysql.exe'
```

Siempre genera `nexora_restore_<aleatorio>` mediante CREATE sin IF NOT EXISTS y un directorio nuevo. Requiere al operador SQL crear esquemas/usuarios y conceder permisos; importa con una cuenta aleatoria temporal, limitada al esquema nuevo, y elimina únicamente esa cuenta al finalizar. El cliente usa binary-mode y deshabilita LOCAL INFILE. Una instrucción que señale otra base no obtiene permiso aunque el administrador que inicia la restauración lo tenga. Solo restaurar archivos propios y confiables. Ninguna ruta ejecuta DROP DATABASE ni reutiliza un esquema previo.

Se conserva restore.json, catálogo, SQL y keys.json en el destino privado; también pueden quedar copias parciales ante fallo. Son sensibles. La aplicación conserva .env, base y clave actuales. Validar conteos, importes, pertenencia, archivos y descifrado en una instalación separada antes de planificar un cambio de entorno. El comando no activa la copia ni migra sus datos automáticamente. Conservar las claves originales: regenerarlas impide recuperar MFA y otros secretos históricos.

Verificación en desarrollo: archivo cifrado/contraseña/rutas/manifiesto/comandos4 pruebas19 aserciones aprobadas. Restauración SQL local detectó error Aria176 al conceder permisos en tablas internas de MariaDB; no se reparó el servidor compartido. La prueba SQL de recorrido completo y de cuenta restringida se valida en MySQL8.4 aislado mediante CI antes de dar1-OPS-C por completado.

Referencias: [mysqldump y consistencia](https://dev.mysql.com/doc/refman/8.0/en/mysqldump.html), [cifrado ZIP](https://www.php.net/manual/en/ziparchive.setencryptionname.php), [binary-mode del cliente](https://dev.mysql.com/doc/refman/8.0/en/mysql-command-options.html).
