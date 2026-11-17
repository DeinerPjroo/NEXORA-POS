# PROYECTO: NEXORA POS — EL FUTURO DE TU RESTAURANTE

## 1. Contexto general

Quiero desarrollar un software comercial de gestión integral de restaurantes llamado **Nexora POS**, cuyo eslogan oficial es **"El futuro de tu restaurante"**.

El proyecto está inspirado en sistemas de gestión de restaurantes como RestiPOS y SambaPOS, pero quiero construir una plataforma mucho más moderna, profesional, escalable, dinámica, intuitiva y personalizable.

El principal diferenciador de Nexora POS será que cada cliente podrá personalizar prácticamente todos los aspectos de su sistema sin necesidad de tener conocimientos de programación.

La filosofía del producto es que el software debe adaptarse al restaurante y no el restaurante al software.

El sistema será diseñado para comercializarse mediante suscripciones y podrá ser utilizado por diferentes tipos de establecimientos:

- Restaurantes.
- Pizzerías.
- Cafeterías.
- Hamburgueserías.
- Bares.
- Heladerías.
- Panaderías.
- Negocios de comidas rápidas.
- Franquicias.
- Restaurantes con múltiples sucursales.

No quiero desarrollar un proyecto académico, un prototipo básico ni un CRUD convencional. Quiero construir un producto comercial real, competitivo y preparado para crecer.

## 2. Identidad de marca

- Nombre de la marca: Nexora.
- Nombre del software: Nexora POS.
- Eslogan: El futuro de tu restaurante.
- Personalidad: tecnológica, innovadora, elegante y profesional.
- Estilo visual: moderno, futurista y minimalista.

Paleta de colores corporativa inicial:

- Azul oscuro: #0B101E.
- Azul eléctrico: #31D9FC.
- Violeta: #8271FF.
- Blanco: #FFFFFF.
- Gris claro: #F4F6F9.

Estos colores serán los predeterminados de Nexora, pero deberán poder ser modificados por cada establecimiento dentro de su espacio de trabajo.

## 3. Tecnologías del proyecto

Utilizar las siguientes tecnologías:

### Frontend web

- React.
- TypeScript.
- Vite.
- Tailwind CSS.
- Lucide Icons.
- React Router.
- TanStack Query.
- Zustand para el estado global cuando sea necesario.
- Recharts para estadísticas.
- dnd-kit para las funciones de arrastrar y soltar.

### Backend

- Laravel.
- PHP.
- API REST.
- Laravel Sanctum para autenticación.
- Laravel Reverb para comunicación en tiempo real.
- Jobs, Events, Listeners y Queues cuando sea necesario.
- Validaciones mediante Form Requests.
- Policies y Middleware para autorización.
- Servicios para encapsular la lógica de negocio.

### Base de datos

- MySQL.
- MySQL Workbench para diseño y administración.
- XAMPP como entorno de desarrollo local.
- Migraciones, modelos, seeders y factories de Laravel.

### Aplicación móvil

En una fase posterior:

- React Native.
- Expo.
- TypeScript.
- SQLite para almacenamiento local.

### Aplicación de escritorio

En una fase posterior:

- Electron.
- SQLite.
- Integración con impresoras térmicas.
- Compatibilidad con Windows.
- Operación sin conexión a internet y sincronización posterior.

Antes de instalar dependencias, verificar la compatibilidad de las versiones disponibles en el entorno local.

## 4. Arquitectura general

Implementar una arquitectura modular, mantenible, escalable y multi-tenant.

El proyecto deberá permitir que múltiples empresas utilicen la misma plataforma, manteniendo sus datos completamente aislados.

Cada empresa contará con:

- Sus propias sucursales.
- Empleados.
- Productos.
- Inventarios.
- Ventas.
- Clientes.
- Reportes.
- Configuraciones.
- Identidad visual.
- Roles y permisos.
- Reglas de negocio.
- Módulos habilitados.

Un restaurante nunca debe poder acceder a información perteneciente a otro restaurante.

El aislamiento multi-tenant deberá garantizarse desde el backend y no solamente mediante filtros visuales en el frontend.

La estructura general propuesta es:

```text
nexora-pos/
  backend/
  frontend/
  mobile/
  desktop/
  docs/
  README.md
  AGENTS.md
  .gitignore
```

Las aplicaciones móvil y de escritorio se desarrollarán posteriormente.

Organizar el código por dominios y responsabilidades, evitando archivos excesivamente grandes, duplicación de código y dependencias innecesarias.

## 5. Ecosistema Nexora

Diseñar el sistema para que en el futuro pueda contar con los siguientes productos integrados:

- Nexora POS: punto de venta.
- Nexora Kitchen: gestión de cocina.
- Nexora Go: aplicación móvil para meseros.
- Nexora Manager: administración empresarial.
- Nexora Studio: editor avanzado de personalización.
- Nexora Cloud: almacenamiento y sincronización.
- Nexora Menu: menú digital mediante QR.
- Nexora Delivery: gestión de domicilios.

Todos deberán compartir una infraestructura central y comunicarse de manera segura.

## 6. Módulos funcionales

### 6.1. Autenticación y seguridad

- Inicio de sesión.
- Registro de empresas.
- Recuperación de contraseña.
- Gestión de sesiones.
- Autenticación mediante PIN para operaciones rápidas.
- Bloqueo de pantalla.
- Roles y permisos dinámicos.
- Historial de accesos.
- Auditoría de acciones.
- Protección contra accesos no autorizados.

### 6.2. Dashboard administrativo

- Ventas del día.
- Ventas mensuales.
- Ganancias estimadas.
- Gastos.
- Pedidos activos.
- Mesas ocupadas.
- Productos más vendidos.
- Horarios con mayores ventas.
- Métodos de pago utilizados.
- Rendimiento de empleados.
- Alertas de inventario.
- Gráficos interactivos.
- Comparación entre periodos.
- Widgets personalizables.

### 6.3. Punto de venta

- Interfaz optimizada para pantallas táctiles.
- Catálogo de productos.
- Búsqueda rápida.
- Categorías personalizadas.
- Productos favoritos.
- Carrito de pedidos.
- Modificación de cantidades.
- Observaciones por producto.
- Ingredientes adicionales.
- Eliminación de ingredientes.
- Variaciones de tamaño.
- Combos y promociones.
- Descuentos.
- División de cuentas.
- Unión de cuentas.
- Traslado de pedidos.
- Pagos parciales.
- Pagos con múltiples métodos.
- Pedidos para llevar.
- Pedidos en mesa.
- Domicilios.
- Impresión de recibos.
- Cancelaciones autorizadas.
- Reembolsos.

### 6.4. Gestión de mesas y salones

Implementar un editor visual interactivo que permita:

- Crear múltiples salones.
- Agregar y eliminar mesas.
- Arrastrar mesas libremente.
- Cambiar tamaño y rotación.
- Utilizar mesas redondas, cuadradas y rectangulares.
- Personalizar nombres y colores.
- Definir capacidad de personas.
- Agregar elementos decorativos.
- Representar paredes, puertas y divisiones.
- Crear una distribución similar al establecimiento real.
- Visualizar estados de ocupación.
- Unir y separar mesas.
- Transferir pedidos entre mesas.
- Asignar meseros.
- Gestionar reservas.

Guardar las distribuciones visuales en la base de datos.

### 6.5. Gestión de cocina — Kitchen Display System

- Recepción de pedidos en tiempo real.
- Comandas digitales.
- Estaciones de preparación.
- Separación de pedidos por áreas.
- Temporizadores.
- Indicadores de retraso.
- Priorización de pedidos.
- Observaciones especiales.
- Notificaciones visuales y sonoras.
- Historial de preparación.
- Impresión automática de comandas.
- Estados de preparación personalizables.

Ejemplos de estaciones:

- Pizzas.
- Hamburguesas.
- Parrilla.
- Bebidas.
- Frituras.
- Postres.

Cada restaurante podrá configurar sus propias estaciones.

### 6.6. Productos y menú

- Categorías y subcategorías.
- Productos con imágenes.
- Precios de venta.
- Costos.
- Variantes.
- Tamaños.
- Ingredientes.
- Adicionales.
- Combos.
- Promociones.
- Horarios de disponibilidad.
- Productos agotados.
- Códigos de barras.
- Precios por sucursal.
- Precios por canal de venta.

### 6.7. Inventario y recetas

- Gestión de materias primas.
- Gestión de productos terminados.
- Unidades de medida.
- Entradas y salidas.
- Compras.
- Traslados entre sucursales.
- Control de desperdicios.
- Control de vencimientos.
- Alertas de stock mínimo.
- Kardex.
- Inventarios físicos.
- Ajustes de inventario.
- Recetas por producto.
- Subrecetas.
- Descuento automático de ingredientes según las ventas.
- Cálculo de costos.
- Márgenes de ganancia.
- Historial de movimientos.

Por ejemplo, al vender una pizza, el sistema deberá descontar automáticamente la cantidad correspondiente de harina, queso, salsa y demás ingredientes según su receta configurada.

### 6.8. Caja y finanzas

- Apertura de caja.
- Cierre de caja.
- Arqueo.
- Ingresos.
- Egresos.
- Gastos operativos.
- Retiros de efectivo.
- Base inicial de caja.
- Historial de movimientos.
- Diferencias de caja.
- Métodos de pago personalizados.
- Propinas.
- Descuentos.
- Reembolsos.
- Reportes financieros.
- Impresión de cierres.
- Reporte de cantidades vendidas por producto.

### 6.9. Empleados

- Registro de empleados.
- Roles personalizados.
- Permisos granulares.
- Turnos laborales.
- Control de asistencia.
- Registro de horas.
- Comisiones.
- Rendimiento.
- Historial de acciones.
- Asignación por sucursales.

Roles predeterminados:

- Superadministrador de Nexora.
- Propietario.
- Administrador.
- Cajero.
- Mesero.
- Cocinero.
- Repartidor.
- Encargado de inventario.

Los propietarios podrán crear roles adicionales y configurar sus permisos.

### 6.10. Clientes y fidelización

- Registro de clientes.
- Historial de compras.
- Direcciones.
- Puntos de fidelización.
- Cupones.
- Descuentos personalizados.
- Membresías.
- Preferencias.
- Campañas promocionales.

### 6.11. Domicilios

- Registro de pedidos.
- Asignación de repartidores.
- Estados de entrega.
- Zonas de cobertura.
- Tarifas personalizadas.
- Direcciones.
- Historial de entregas.
- Seguimiento.
- Métodos de pago.

### 6.12. Proveedores y compras

- Registro de proveedores.
- Órdenes de compra.
- Recepción de mercancía.
- Cuentas por pagar.
- Historial de compras.
- Comparación de precios.
- Actualización de inventario.
- Gestión de costos.

### 6.13. Reportes

- Ventas por fecha.
- Ventas por producto.
- Ventas por categoría.
- Ventas por empleado.
- Ventas por sucursal.
- Ventas por método de pago.
- Utilidades estimadas.
- Costos.
- Inventarios.
- Gastos.
- Cancelaciones.
- Descuentos.
- Rendimiento.
- Exportación a PDF y Excel.
- Reportes personalizados.
- Impresión de reportes.

### 6.14. Menú digital

- Generación de códigos QR.
- Menú público del restaurante.
- Personalización visual.
- Fotografías.
- Precios.
- Descripciones.
- Disponibilidad en tiempo real.
- Pedidos desde el teléfono del cliente.
- Identificación de mesas mediante QR.

### 6.15. Facturación

- Recibos.
- Facturas.
- Numeraciones.
- Impuestos configurables.
- Propinas.
- Datos comerciales.
- Formatos de impresión.
- Tickets de 58 mm y 80 mm.

Preparar la arquitectura para una futura integración de facturación electrónica con la DIAN en Colombia, sin simular una certificación ni una integración real que todavía no exista.

### 6.16. Gestión de sucursales

- Creación de sucursales.
- Administradores independientes.
- Inventarios independientes.
- Configuraciones específicas.
- Precios por sucursal.
- Traslados de mercancía.
- Reportes consolidados.
- Configuraciones heredadas de la empresa principal.

## 7. Nexora Studio: motor de personalización integral

Este será el principal diferenciador comercial del software.

Desarrollar un editor visual sin código que permita a cada restaurante transformar su sistema según sus necesidades.

### Personalización de identidad visual

- Logotipo.
- Nombre comercial.
- Colores primarios y secundarios.
- Fondos.
- Degradados.
- Tipografías.
- Iconos.
- Bordes.
- Sombras.
- Tamaños.
- Temas claros y oscuros.
- Pantalla de inicio de sesión.

### Personalización de interfaces

- Arrastrar y soltar componentes.
- Cambiar posición de botones.
- Modificar tamaños.
- Agregar y eliminar widgets.
- Configurar barras laterales.
- Reorganizar los menús.
- Cambiar la distribución de productos.
- Ocultar elementos.
- Crear accesos rápidos.
- Diseñar dashboards personalizados.
- Crear botones con acciones permitidas.
- Guardar diferentes diseños.
- Configurar interfaces según el rol.
- Configurar interfaces según el dispositivo.

### Personalización funcional

- Activar y desactivar módulos.
- Crear métodos de pago.
- Crear estados de pedidos.
- Crear categorías.
- Crear estaciones de cocina.
- Personalizar roles.
- Crear campos adicionales.
- Configurar impuestos.
- Configurar descuentos.
- Configurar reglas de negocio.
- Personalizar flujos de trabajo.
- Crear automatizaciones mediante condiciones y acciones seguras.

### Personalización de documentos

Crear un editor visual para:

- Facturas.
- Recibos.
- Comandas.
- Reportes.
- Cierres de caja.
- Cotizaciones.

Permitir ajustar logotipos, textos, posición de elementos, tamaños, encabezados, pies de página y campos dinámicos.

### Características del editor

- Vista previa en tiempo real.
- Arrastrar y soltar.
- Deshacer y rehacer.
- Guardar borradores.
- Publicar cambios.
- Restaurar configuraciones predeterminadas.
- Historial de versiones.
- Importar y exportar configuraciones compatibles.
- Plantillas prediseñadas.
- Validación de componentes y configuraciones.

Las personalizaciones deberán almacenarse de forma estructurada y versionada en la base de datos.

Utilizar esquemas JSON validados para configuraciones visuales cuando sea conveniente.

Crear un motor de renderizado dinámico basado en un catálogo de componentes autorizados.

No permitir ejecución de código arbitrario proporcionado por los clientes.

Las personalizaciones no podrán vulnerar permisos, aislamiento de datos, integridad financiera ni restricciones legales.

## 8. Superadministrador de Nexora

Crear un panel independiente para los propietarios de la plataforma SaaS.

Este panel permitirá:

- Registrar empresas.
- Gestionar establecimientos.
- Administrar planes.
- Gestionar suscripciones.
- Activar y suspender cuentas.
- Configurar límites por plan.
- Administrar módulos disponibles.
- Consultar métricas generales.
- Gestionar solicitudes de soporte.
- Administrar plantillas predeterminadas.
- Publicar avisos.
- Consultar registros de errores.
- Gestionar actualizaciones.
- Auditar accesos administrativos.

Cualquier acceso excepcional a información de clientes deberá estar autorizado, restringido y auditado.

## 9. Modelo de negocio SaaS

Preparar el sistema para un modelo de suscripción mensual.

Planes iniciales propuestos:

**Básico — $49.900 COP mensuales**

- Punto de venta.
- Caja.
- Productos.
- Reportes básicos.

**Profesional — $99.900 COP mensuales**

- Funciones del plan básico.
- Cocina.
- Inventario.
- Personalización avanzada.

**Empresarial — $199.900 COP mensuales**

- Funciones del plan profesional.
- Múltiples sucursales.
- Automatizaciones.
- Soporte prioritario.

Estos precios son provisionales y deberán poder modificarse desde el panel de superadministración.

No codificar los planes ni sus restricciones directamente dentro de las interfaces.

## 10. Diseño UI/UX

Quiero un diseño visual de alta calidad, comparable con aplicaciones SaaS comerciales modernas.

Evitar interfaces genéricas, diseños anticuados y estilos que parezcan plantillas administrativas básicas.

Características visuales:

- Diseño limpio y elegante.
- Jerarquía visual clara.
- Animaciones suaves.
- Microinteracciones.
- Iconografía consistente.
- Feedback visual.
- Menús modernos.
- Sidebar plegable.
- Modales personalizados.
- Tablas interactivas.
- Skeleton loaders.
- Notificaciones toast.
- Estados vacíos.
- Manejo visual de errores.
- Diseño responsive.
- Modo claro y oscuro.
- Accesibilidad.
- Optimización para pantallas táctiles.

Cada módulo debe tener una interfaz diseñada específicamente para su propósito.

La pantalla de punto de venta debe priorizar la rapidez operativa y minimizar la cantidad de clics necesarios para registrar una venta.

## 11. Vistas del sistema

Contemplar como mínimo las siguientes vistas:

### Públicas

- Landing page comercial.
- Planes y precios.
- Inicio de sesión.
- Registro empresarial.
- Recuperación de contraseña.
- Configuración inicial del restaurante.

### Privadas

- Dashboard.
- Punto de venta.
- Mesas y salones.
- Editor de distribución de mesas.
- Pedidos.
- Historial de ventas.
- Cocina.
- Productos.
- Categorías.
- Recetas.
- Inventario.
- Movimientos de inventario.
- Compras.
- Proveedores.
- Clientes.
- Empleados.
- Roles y permisos.
- Caja.
- Cierre de caja.
- Gastos.
- Domicilios.
- Reservaciones.
- Reportes.
- Facturación.
- Menú digital.
- Sucursales.
- Notificaciones.
- Perfil.
- Configuraciones.
- Suscripción.
- Nexora Studio.

### Superadministración

- Dashboard global.
- Empresas.
- Planes.
- Suscripciones.
- Módulos.
- Plantillas.
- Soporte.
- Auditoría.
- Configuración global.

## 12. Base de datos

Diseñar una base de datos relacional profesional, normalizada y escalable.

Contemplar entidades para:

- Empresas.
- Sucursales.
- Usuarios.
- Empleados.
- Roles.
- Permisos.
- Productos.
- Categorías.
- Variantes.
- Ingredientes.
- Recetas.
- Inventarios.
- Movimientos de inventario.
- Proveedores.
- Compras.
- Clientes.
- Salones.
- Mesas.
- Reservaciones.
- Pedidos.
- Detalles de pedidos.
- Comandas.
- Estaciones de cocina.
- Ventas.
- Facturas.
- Pagos.
- Métodos de pago.
- Cajas.
- Sesiones de caja.
- Movimientos de caja.
- Gastos.
- Domicilios.
- Promociones.
- Planes.
- Suscripciones.
- Módulos.
- Configuraciones.
- Temas.
- Diseños de interfaces.
- Componentes.
- Plantillas de impresión.
- Campos personalizados.
- Automatizaciones.
- Notificaciones.
- Auditorías.

El listado es conceptual. Analizar las relaciones y determinar las tablas intermedias y adicionales necesarias.

Implementar:

- Claves primarias y foráneas.
- Índices.
- Restricciones de integridad.
- Transacciones.
- Timestamps.
- Aislamiento multi-tenant.
- Borrado lógico cuando corresponda.
- Tipos DECIMAL para valores monetarios.
- Prevención de duplicados.
- Historial de operaciones críticas.

No eliminar físicamente registros financieros históricos como mecanismo normal de cancelación.

Generar un modelo entidad-relación compatible con MySQL Workbench y documentar la estructura de la base de datos.

## 13. Funcionamiento sin internet

Preparar la arquitectura para permitir operaciones locales cuando no exista conexión a internet.

Contemplar:

- Almacenamiento local.
- Caché de productos.
- Cola de operaciones pendientes.
- Identificadores únicos.
- Sincronización automática.
- Resolución de conflictos.
- Prevención de pedidos duplicados.
- Estado de conexión.
- Reintentos.
- Idempotencia.
- Recuperación ante fallos.

La implementación completa del modo offline se realizará por etapas.

## 14. Integración con hardware

Preparar la arquitectura para integrar posteriormente:

- Impresoras térmicas.
- Impresoras de cocina.
- Lectores de códigos de barras.
- Cajones monederos.
- Pantallas táctiles.
- Pantallas de cocina.
- Pantallas para clientes.
- Básculas compatibles.
- Dispositivos móviles.

No simular integraciones físicas como si ya estuvieran funcionando. Documentar las dependencias y requisitos de cada dispositivo.

## 15. Seguridad y calidad

Aplicar buenas prácticas de desarrollo profesional:

- OWASP.
- Validación de entradas.
- Protección contra SQL Injection.
- Protección contra XSS.
- Protección contra CSRF cuando corresponda.
- Rate limiting.
- Contraseñas cifradas mediante hashing seguro.
- Gestión de secretos mediante variables de entorno.
- Autorización en el servidor.
- Aislamiento entre empresas.
- Copias de seguridad.
- Auditoría.
- Pruebas unitarias.
- Pruebas de integración.
- Pruebas end-to-end.
- Pruebas de aislamiento multi-tenant.
- Manejo de errores.
- Documentación de API.
- Optimización de consultas.

Priorizar siempre la integridad de las operaciones financieras y de inventario.

## 16. Etapas de desarrollo

Desarrollar el proyecto progresivamente.

### Fase 1: Cimientos del sistema

- Arquitectura.
- Estructura de carpetas.
- Backend Laravel.
- Frontend React.
- Conexión a MySQL.
- Autenticación.
- Empresas.
- Sucursales.
- Roles y permisos.
- Aislamiento multi-tenant.
- Sistema de diseño visual.
- Configuraciones iniciales.

### Fase 2: Operación básica del restaurante

- Dashboard.
- Productos.
- Categorías.
- Punto de venta.
- Mesas.
- Pedidos.
- Ventas.
- Pagos.
- Caja.

### Fase 3: Gestión avanzada

- Cocina.
- Inventario.
- Recetas.
- Proveedores.
- Compras.
- Empleados.
- Reportes.

### Fase 4: Nexora Studio

- Motor de personalización.
- Editor visual.
- Widgets.
- Temas.
- Interfaces dinámicas.
- Plantillas de impresión.
- Campos personalizados.
- Automatizaciones.

### Fase 5: Plataforma comercial

- Superadministración.
- Planes.
- Suscripciones.
- Gestión de módulos.
- Landing page comercial.

### Fase 6: Expansión

- Aplicación móvil.
- Aplicación de escritorio.
- Modo offline.
- Menú digital.
- Domicilios.
- Integraciones externas.
- Facturación electrónica.

## 17. Instrucciones para trabajar conmigo

Actúa como un equipo de desarrollo de software compuesto por:

- Arquitecto de software.
- Desarrollador senior full stack.
- Diseñador UI/UX.
- Especialista en bases de datos.
- Especialista en ciberseguridad.
- Ingeniero DevOps.
- Analista de requerimientos.
- Ingeniero de calidad.

Trabaja directamente sobre los archivos del proyecto.

Antes de realizar cambios:

1. Analiza los archivos y carpetas existentes.
2. Verifica las tecnologías instaladas.
3. Identifica posibles incompatibilidades.
4. Define una arquitectura adecuada.
5. Evita eliminar archivos existentes sin autorización.
6. No sobrescribas configuraciones importantes sin revisarlas.

Durante el desarrollo:

- Escribe código funcional y mantenible.
- Utiliza componentes reutilizables.
- No dejes funcionalidades críticas simuladas.
- No utilices datos estáticos como solución definitiva.
- Mantén conectado el frontend con el backend.
- Utiliza datos de prueba únicamente para desarrollo.
- Ejecuta pruebas.
- Corrige errores antes de continuar.
- Documenta las decisiones técnicas.
- No agregues dependencias innecesarias.
- Mantén toda la interfaz en español inicialmente.
- Utiliza COP como moneda predeterminada.
- Utiliza America/Bogota como zona horaria predeterminada.
- Prepara el sistema para otros idiomas y monedas.

Crear y mantener los siguientes documentos:

- AGENTS.md: instrucciones permanentes del proyecto.
- README.md: instalación y ejecución.
- docs/REQUIREMENTS.md: requerimientos.
- docs/ARCHITECTURE.md: arquitectura.
- docs/DATABASE.md: base de datos.
- docs/ROADMAP.md: planificación.
- docs/CHANGELOG.md: historial de cambios.
- docs/PROGRESS.md: progreso real del desarrollo.

## 18. Primera tarea

No intentes implementar todos los módulos simultáneamente.

Comienza analizando el entorno de trabajo y los archivos existentes.

Posteriormente:

1. Documenta los requerimientos completos de Nexora POS.
2. Define la arquitectura técnica.
3. Diseña la estructura del proyecto.
4. Establece la estrategia multi-tenant.
5. Diseña la base de datos inicial.
6. Crea el sistema de diseño visual.
7. Define el roadmap.
8. Inicializa el frontend y backend si todavía no existen.
9. Comienza la implementación de la Fase 1.
10. Verifica que los componentes implementados funcionen correctamente.

Quiero que desde el primer archivo se tenga presente la futura personalización integral de Nexora Studio.

No te limites a explicarme cómo hacerlo. Implementa las funcionalidades correspondientes directamente en el proyecto, de manera progresiva, segura y profesional.

El objetivo final es construir una plataforma comercial de gestión gastronómica que destaque por su tecnología, rendimiento, diseño y libertad de personalización.

**NEXORA POS — EL FUTURO DE TU RESTAURANTE.**
