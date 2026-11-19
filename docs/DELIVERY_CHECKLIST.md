# Entrega operativa y pendientes externos

La entrega local cubre el núcleo de fase1 y la operación comercial de fase2. Fases3–6 continúan pendientes; no se anuncia el producto completo ni desplegado en producción.

| Control | Evidencia / estado |
| --- | --- |
| CI y selección pertinente | Runs44622299984 y44622476244 aprobados en GitHub; CI.md |
| Seguridad, permisos, tenant e integridad financiera | Cierre SQLite326/4094+2omitidas; MySQL8.4 ejecutó328 con327 aprobadas y reparación restante verificada en dirigido8/73; denegaciones, MFA y seguridad documentadas |
| Carreras reales SQL | MariaDB y MySQL8.4:9/121, incluyendo dinero, UUID, fondos, tenant, permisos y MFA |
| Navegador comercial/seguridad | Completa50/51 y caso restante de categorías corregido/aprobado dirigido en remoto; sin repetir interfaces ajenas |
| Respaldo y recuperación | MySQL8.4 CI44623608940:6/39, restauración completa y restricciones SQL aprobadas; ajuste final de rama dirigido antes de integrar. BACKUPS.md |
| Esquema MySQL | DDL generado desde migraciones en docs/database/initial-schema.mysql.sql; validación real de migraciones/FK en MySQL8.4 CI |
| Modelo EER Workbench | Workbench no disponible en ruta habitual del entorno. Importar DDL en un modelo nuevo y guardar/revisar .mwb cuando esté disponible; no ejecutar DDL de modelado sobre base operativa |
| Servidor MariaDB local | Error Aria176 en tablas internas de permisos detectado al GRANT durante restauración aislada. Reparación del servidor compartido pendiente; no se ejecutaron reparaciones ni se eliminaron esquemas |
| Producción | Pendiente entorno, dominio/HTTPS, supervisor, correo real y almacenamiento externo de respaldos; no hay despliegue productivo efectuado |

Antes de producción: exponer solo frontend/dist y backend/public, desactivar debug, configurar HTTPS/cookies Secure/orígenes exactos, conservar APP_KEY y claves anteriores, aplicar migraciones incrementales con respaldo restaurable y usar credenciales mínimas de aplicación distintas del operador de recuperación. No publicar .env, storage, vendor, volcados ni raíz del repositorio.

Entregas futuras verifican su impacto; suites completas corresponden a cierres de fase o cambios transversales. SMTP/recepción externa, pasarelas, hardware y DIAN requieren sus entornos reales. Reverb/colas se incorporan con KDS en fase3, sin anunciar tiempo real inexistente. Las listas anteriores registran resultados ejecutados y sus límites; las omisiones no son verificaciones.
