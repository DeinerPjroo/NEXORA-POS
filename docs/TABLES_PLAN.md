# Salones y mesas · 2.4

A0.25, B0.26 y C0.27 integrados y verificados. Contratos en DINING_LAYOUTS.md, DINING_OPERATIONS.md y DINING_RESERVATIONS.md; resultados dirigidos en PROJECT_STATE/PROGRESS. Padre2.4 completo, fase2 aún continúa con dashboard2.5.

Continuar sobre terminal POS0.24. Alcance original REQUIREMENTS6.4: varios salones, mesas configurables con forma/tamaño/rotación/color/capacidad, arrastre y elementos decorativos/paredes/puertas/divisiones, distribución persistida, ocupación, unión/separación, traslado de pedidos, meseros y reservas. No marcar padre2.4 completo hasta verificar estos bloques.

- A: configuración tenant/sucursal de salones y mesas con revisión/archivo/auditoría; editor visual con geometría y objetos permitidos, persistencia y selección por sucursal. Sin HTML/CSS/código libre. Controles accesibles además de arrastre; geometría acotada y schema versionado. No anunciar ocupación operativa antes de B.
- B: sesiones/ocupación reales, mesas unidas/separadas, asignación de usuarios autorizados como meseros y traslado de pedidos con historial. Integración POS en restaurante; proteger conflictos concurrentes y referencias tenant/branch/room/table. No modificar líneas/importes históricos ni duplicar recibos al mover mesas.
- C: reservas con zona/horarios/capacidad y conflictos reales, estados/revisión/UUID/auditoría e integración con ocupación. Mantener consultas y archivo paginados.

Reutilizar contexto de sucursal, usuarios/permisos, comandos de pedido/cobro y transacciones existentes. Separar configuración, ocupación e historia financiera; cualquier extensión de cuentas/división por productos requiere su propio contrato monetario y pruebas críticas. No simular empleados, reservas, cocina o cobros.

Por incremento: integrar UI/API, migración segura si corresponde, pruebas afectadas de permisos/tenant/FK/revisiones/concurrencia y dinero cuando cambie, recorrido Chromium/revisión visual del editor y commit/push. Protocolo optimizado de AGENTS; no releer fases ajenas ni repetir suites generales por rutina.
