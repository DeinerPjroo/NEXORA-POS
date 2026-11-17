# Sistema de diseño Nexora

Identidad tecnológica, elegante y minimalista. La interfaz presenta únicamente capacidades existentes; las fases futuras se explican en «Acerca de Nexora» y no simulan pantallas de operación.

| Token inicial | Valor | Uso |
| --- | --- | --- |
| Marca oscura | #0B101E | Navegación y superficies de marca |
| Principal | #31D9FC | Acciones y acentos |
| Secundario | #8271FF | Identidad y referencias a Studio |
| Blanco | #FFFFFF | Superficie clara |
| Fondo | #F4F6F9 / derivado #F5F7FA | Lienzo claro |
| Texto | #182132 | Contenido principal |

El backend guarda el principal, secundario, modo claro/oscuro y bordes por empresa. El cliente aplica `--accent`, `--secondary`, `data-theme` y `data-radius`; el tema de la pantalla pública de acceso sigue siendo el global de Nexora hasta tener resolución segura de marca antes de autenticación. La personalización del login por empresa pertenece a Studio avanzado.

Tipografía de sistema Segoe UI / sans-serif: sin dependencia de fuentes externas. Escala visual con títulos de 25–32 px, párrafos y controles de 12–14 px, metadatos secundarios más pequeños. Lucide como iconografía única. Sidebar oscura y plegable en escritorio; menú móvil superpuesto. Tarjetas para sedes/roles, tablas para equipo, formulario para preferencias y editor con vista previa para identidad.

Componentes compartidos: Brand, Field, ErrorNotice, Loading, PageTitle, Submit, Modal y ToastProvider. TanStack Query gestiona estados pendientes/errores; la UI muestra errores reales de API en español. Dialog nativo aporta foco modal, Escape y semántica; botones de icono llevan nombre accesible. Controles asociados a label, enlace «Saltar al contenido», foco visible y respeto por prefers-reduced-motion. Colores con significado acompañados de texto/iconos. Aún no hay certificación formal de accesibilidad: hacen falta auditoría de contraste para colores personalizados, revisión con lector de pantalla y objetivos táctiles para pantallas POS de Fase 2.

La vista previa de Studio solo cambia valores permitidos dentro de su contenedor. Publicar hace la operación real en backend y actualiza el espacio. No se exponen opciones que ejecuten HTML/CSS/scripts del cliente. Los diseños avanzados se añadirán sobre un catálogo de componentes por esquema.

Capturas generadas mediante Playwright en desarrollo con datos de prueba: [acceso](screenshots/login-desktop.png), [resumen](screenshots/overview.png), [Studio oscuro](screenshots/studio-dark.png) y [Studio móvil](screenshots/studio-mobile.png).

Catálogo: tarjetas de producto con identidad de categoría, precio preciso, estado y costo visible según permiso. Filtros y paginación en servidor. Selector de categorías en diálogo con búsqueda/paginación, también dentro del editor de producto. Las tarjetas usan la fotografía guardada y un icono cuando todavía no existe. Capturas: [catálogo escritorio](screenshots/catalog-desktop.png) y [catálogo móvil](screenshots/catalog-mobile.png).

Desde 0.3, la tarjeta usa la fotografía del producto cuando existe y conserva el icono como estado vacío. «Ver ficha y presentaciones» abre una vista con imagen, datos base y tabla de variantes. Se puede seleccionar archivo y revisar antes de guardarlo; la tabla conserva su desplazamiento horizontal dentro del contenedor en móvil. Los costos siguen ocultos según permisos. Capturas de prueba: [ficha escritorio](screenshots/product-detail-desktop.png) y [ficha móvil](screenshots/product-detail-mobile.png).
