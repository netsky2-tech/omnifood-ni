# Rol

Actúa como un **Senior Frontend Engineer + Senior Product Designer especializado en SaaS B2B, sistemas administrativos, ERP, POS y dashboards empresariales**, con especial atención a:

- UI/UX profesional.
- Responsive Design.
- Arquitectura visual.
- Design Systems.
- Accesibilidad.
- Usabilidad.
- Consistencia.
- Estados de interacción.
- Navegación.
- Formularios empresariales.
- Tablas y visualización de datos.
- Rendimiento percibido.
- Microinteracciones.
- Experiencia móvil, tablet y desktop.
- Calidad visual propia de software comercial listo para producción.

El sistema ya se encuentra desarrollado y publicado. **No estás creando una interfaz desde cero.**

Tu objetivo es revisar el frontend existente y llevarlo desde su estado actual a una experiencia que pueda presentarse profesionalmente a un primer cliente, eliminando comportamientos, inconsistencias y detalles visuales que hagan que el producto parezca un prototipo, MVP improvisado o desarrollo junior.

---

# Objetivo principal

Quiero que el dashboard transmita inmediatamente:

- Solidez.
- Profesionalismo.
- Consistencia.
- Madurez del producto.
- Claridad.
- Buen diseño.
- Rapidez.
- Confianza.
- Sensación de software empresarial terminado.

Debe sentirse como un producto SaaS comercial, no como una plantilla administrativa adaptada parcialmente.

La prioridad no es introducir efectos visuales llamativos, sino conseguir una interfaz:

> limpia, coherente, predecible, rápida, responsiva, cómoda y visualmente profesional.

---

# PRINCIPIO FUNDAMENTAL

No hagas cambios superficiales aislados.

Quiero una **auditoría sistemática de toda la experiencia UI/UX**.

Antes de modificar código:

1. Analiza la arquitectura actual.
2. Identifica framework, librerías y componentes utilizados.
3. Identifica layout principal.
4. Identifica sistema de navegación.
5. Identifica breakpoints.
6. Identifica componentes compartidos.
7. Identifica estilos globales.
8. Identifica variables/tokens existentes.
9. Identifica componentes duplicados.
10. Identifica comportamientos inconsistentes.
11. Identifica problemas de responsive.
12. Identifica problemas de accesibilidad.
13. Identifica problemas de interacción.
14. Identifica problemas visuales.
15. Identifica deuda técnica relacionada con UI.

No sustituyas componentes ni agregues dependencias innecesariamente si la infraestructura actual permite resolver correctamente el problema.

No rompas lógica de negocio existente.

---

# FASE 1 — AUDITORÍA COMPLETA

Realiza primero una inspección exhaustiva del proyecto.

Debes revisar, como mínimo:

## 1. Layout global

Analiza:

- Sidebar.
- Header / Topbar.
- Área principal de contenido.
- Footer si existe.
- Breadcrumbs.
- Contenedores.
- Anchuras máximas.
- Márgenes.
- Padding.
- Scroll.
- Posicionamiento sticky/fixed.
- Z-index.
- Alturas.
- Overflow.
- Espaciado entre secciones.

Comprueba si el contenido se adapta correctamente desde pantallas grandes hasta móviles pequeños.

Evita valores rígidos que provoquen:

- overflow horizontal;
- contenido cortado;
- superposición;
- scrolls dobles;
- espacios muertos;
- elementos fuera de pantalla.

---

# 2. Sidebar y navegación

Haz una revisión especialmente rigurosa del menú lateral.

Debe funcionar profesionalmente en:

- Desktop expandido.
- Desktop colapsado.
- Tablet.
- Móvil.

### Desktop

Al expandir y colapsar el sidebar:

- El layout debe reajustarse correctamente.
- No debe producir saltos visuales.
- El contenido no debe quedar debajo del sidebar.
- Las transiciones deben ser suaves pero rápidas.
- El ancho expandido y colapsado debe ser consistente.
- Debe existir una alineación clara entre iconos.
- Los textos no deben aparecer cortados durante la animación.
- El estado activo debe ser inequívoco.
- Los submenús deben comportarse correctamente.

### Logo

Debe existir una estrategia explícita para el logo.

Cuando el sidebar está expandido:

- mostrar versión completa de marca cuando corresponda.

Cuando está colapsado:

- mostrar isotipo, logomark o versión compacta;
- mantener reservado el espacio correspondiente;
- evitar saltos verticales;
- evitar deformaciones;
- evitar que los elementos del menú cambien arbitrariamente de posición.

El encabezado del sidebar debe conservar dimensiones coherentes en ambos estados.

### Mobile

En móvil el sidebar debe convertirse en:

- drawer;
- offcanvas;
- overlay lateral;

según lo que mejor encaje con la arquitectura existente.

Cuando se abra:

- debe existir backdrop;
- debe bloquear correctamente el scroll del body cuando corresponda;
- debe cerrarse mediante botón;
- debe cerrarse mediante backdrop;
- debe soportar Escape cuando corresponda;
- debe gestionar correctamente focus;
- no debe quedar parcialmente visible.

**Muy importante:**

Cuando el usuario selecciona una opción del menú y se produce una navegación, el menú móvil debe cerrarse automáticamente.

También debe cerrarse correctamente cuando:

- cambia la ruta;
- se entra en un módulo;
- se navega mediante un submenú;
- se utiliza navegación interna equivalente.

No quiero que el usuario tenga que cerrar manualmente el menú después de navegar.

---

# 3. Header / Topbar

Revisa:

- logo si aplica;
- botón hamburger;
- título de página;
- breadcrumbs;
- perfil;
- avatar;
- menú del usuario;
- selector de empresa/sucursal si existe;
- notificaciones;
- acciones rápidas;
- logout.

En pantallas pequeñas:

- priorizar información;
- evitar saturación;
- ocultar o compactar elementos secundarios;
- impedir solapamientos;
- evitar textos cortados incorrectamente.

Los controles deben conservar áreas táctiles cómodas.

---

# 4. Responsive Design completo

No evalúes únicamente desktop y mobile.

Revisa al menos:

- 320 px.
- 360 px.
- 375 px.
- 390 px.
- 414 px.
- 480 px.
- 768 px.
- 820 px.
- 1024 px.
- 1280 px.
- 1366 px.
- 1440 px.
- 1920 px.

La aplicación debe comportarse correctamente en:

- teléfonos pequeños;
- teléfonos grandes;
- tablet vertical;
- tablet horizontal;
- laptops;
- monitores desktop;
- pantallas grandes.

No implementes media queries arbitrarias módulo por módulo si puede resolverse mediante una estrategia consistente de breakpoints.

---

# 5. Sistema de espaciado

Audita:

- margin;
- padding;
- gaps;
- alturas;
- separación entre títulos;
- separación entre tarjetas;
- separación entre formulario y acciones;
- separación entre filtros y tablas.

Evita valores aparentemente aleatorios como:

13px, 19px, 27px, 31px,

salvo que exista una razón específica.

Construye o reutiliza un sistema coherente, por ejemplo basado en múltiplos consistentes.

El objetivo es conseguir ritmo visual.

---

# 6. Tipografía

Audita:

- familia tipográfica;
- tamaños;
- pesos;
- line-height;
- jerarquía;
- contraste;
- títulos;
- subtítulos;
- labels;
- textos auxiliares;
- placeholders;
- botones;
- tablas.

Debe existir claramente una jerarquía:

- Page Title.
- Section Title.
- Card Title.
- Body.
- Label.
- Helper text.
- Caption.

Evita:

- demasiados font-weight diferentes;
- textos excesivamente pequeños;
- títulos gigantes;
- uso inconsistente de negrita.

---

# 7. Colores

Analiza el sistema de colores completo.

Debemos contar como mínimo con tokens consistentes para:

- background principal;
- surface;
- surface secundaria;
- borders;
- primary;
- primary hover;
- primary active;
- secondary;
- success;
- warning;
- danger;
- info;
- texto principal;
- texto secundario;
- texto deshabilitado.

No introduzcas colores arbitrarios en componentes individuales.

Reutiliza variables CSS, theme tokens o sistema equivalente.

Debemos poder modificar posteriormente la identidad visual desde un punto central.

---

# 8. Bordes, sombras y elevación

Unifica:

- border-radius;
- border colors;
- shadows;
- elevation.

Evita dashboards donde cada card parece pertenecer a un framework distinto.

No abuses de sombras.

La jerarquía debe basarse principalmente en:

- spacing;
- surfaces;
- borders;
- typography;
- elevation ligera.

---

# 9. Botones

Audita absolutamente todos los botones.

Debe existir consistencia entre:

- Primary.
- Secondary.
- Outline.
- Ghost.
- Danger.
- Icon button.

Revisa:

- tamaño;
- padding;
- iconos;
- alineación;
- hover;
- active;
- focus;
- disabled;
- loading.

Una acción destructiva no debe parecer una acción primaria normal.

Botones del mismo nivel de importancia deben tener el mismo tratamiento visual.

---

# 10. Inputs y formularios

Esta es una aplicación empresarial: los formularios son críticos.

Audita:

- inputs;
- selects;
- autocomplete;
- textarea;
- checkbox;
- radio;
- switch;
- date picker;
- time picker;
- currency;
- numeric fields;
- search;
- uploads.

Cada campo debe gestionar correctamente:

- label;
- placeholder;
- helper text;
- required;
- disabled;
- readonly;
- focus;
- validation;
- error;
- success cuando corresponda.

Los errores deben explicar el problema.

Evitar depender exclusivamente del color rojo.

Revisa también navegación por teclado.

---

# 11. Formularios responsive

En desktop pueden existir layouts de varias columnas.

En móvil:

- reorganizar columnas;
- respetar orden lógico;
- mantener labels legibles;
- evitar inputs demasiado pequeños;
- mantener botones accesibles;
- eliminar overflow horizontal.

No reduzcas simplemente toda la interfaz.

El layout debe reorganizarse.

---

# 12. Tablas

Las tablas son uno de los elementos más importantes de un dashboard empresarial.

Audita:

- headers;
- sorting;
- filtros;
- búsqueda;
- paginación;
- selección;
- acciones;
- estados;
- densidad;
- alineación;
- números;
- fechas;
- moneda.

Analiza específicamente responsive.

No permitas simplemente que una tabla de 12 columnas desborde la pantalla sin estrategia.

Según cada caso aplica una solución apropiada:

- scroll horizontal controlado;
- columnas prioritarias;
- ocultación progresiva;
- cards en mobile;
- detalle expandible;
- menú de acciones;
- sticky columns;
- sticky header.

Mantén accesible siempre la información principal.

---

# 13. Acciones dentro de tablas

Evita llenar cada fila con múltiples botones grandes.

Cuando existan muchas acciones considera:

- acción primaria visible;
- menú contextual `...`;
- dropdown;
- icon buttons con tooltip.

Debemos reducir ruido visual.

---

# 14. Cards

Audita todas las cards.

Deben compartir:

- padding;
- border;
- border-radius;
- heading;
- spacing;
- tratamiento de actions;
- background;
- shadow.

Evita nesting excesivo de cards dentro de cards.

---

# 15. Dashboard principal

Evalúa específicamente la página principal.

Debe existir una jerarquía evidente entre:

- KPIs;
- gráficos;
- información operativa;
- alertas;
- tareas pendientes;
- accesos rápidos.

Los KPIs deben ser fácilmente escaneables.

Si existen números:

- usar formato correcto;
- alinear unidades;
- mantener consistencia decimal;
- formatear moneda adecuadamente.

---

# 16. Estados de carga

No quiero pantallas que parezcan congeladas.

Revisa todas las peticiones asíncronas.

Debe existir una estrategia consistente:

- skeletons;
- spinners;
- loaders;
- estados inline;

dependiendo del contexto.

Evita bloquear toda la pantalla por una operación pequeña.

---

# 17. Empty States

Toda vista sin datos debe tener un estado vacío diseñado.

Nunca mostrar simplemente:

`No data`

o una tabla vacía.

Cuando corresponda incluir:

- explicación;
- siguiente acción;
- CTA.

Ejemplo conceptual:

“No hay productos registrados todavía.”

“Crear primer producto”.

---

# 18. Error States

Implementa presentación clara para:

- errores de API;
- permisos;
- datos inexistentes;
- conexión;
- timeout;
- error inesperado.

Los errores no deben mostrar detalles técnicos al usuario final.

---

# 19. Feedback de acciones

Toda acción importante debe tener feedback.

Por ejemplo:

- Guardando...
- Guardado correctamente.
- Error al guardar.
- Eliminado correctamente.
- Actualización realizada.

Utiliza:

- toast;
- inline feedback;
- modal;

según corresponda.

Evita que un usuario pulse varias veces una acción porque no sabe si se ejecutó.

---

# 20. Confirmaciones

Las operaciones destructivas deben pedir confirmación cuando corresponda.

Ejemplos:

- eliminar;
- anular;
- cancelar;
- cerrar;
- borrar registros;
- restaurar;
- acciones irreversibles.

Evita modales genéricos como:

“¿Está seguro?”

Proporciona contexto sobre lo que ocurrirá.

---

# 21. Modales y dialogs

Audita:

- tamaño;
- responsive;
- padding;
- títulos;
- footer;
- botones;
- backdrop;
- scroll interno;
- cierre;
- focus;
- Escape.

Un modal grande debe adaptarse en mobile.

No permitir que los botones queden fuera del viewport.

---

# 22. Dropdowns, popovers y tooltips

Comprueba:

- posicionamiento;
- viewport collision;
- z-index;
- overflow;
- interacción táctil;
- cierre al seleccionar;
- cierre al hacer click fuera;
- teclado.

Los tooltips no deben utilizarse como reemplazo de labels necesarias.

---

# 23. Iconografía

Audita consistencia.

No mezclar arbitrariamente:

- distintas familias;
- distintos stroke-width;
- iconos outlined y filled;
- tamaños diferentes.

Los iconos deben tener propósito.

Evita ornamentación innecesaria.

---

# 24. Navegación y orientación

En todo momento el usuario debe entender:

- dónde está;
- en qué módulo;
- qué entidad está viendo;
- cómo volver;
- cuál es la acción principal.

Revisa:

- estado activo del sidebar;
- títulos;
- breadcrumbs;
- tabs;
- subtítulos;
- navegación secundaria.

---

# 25. Páginas CRUD

Evalúa al menos estos patrones:

### Listado

- título;
- descripción cuando sea útil;
- filtros;
- search;
- CTA principal;
- tabla;
- paginación.

### Crear

- breadcrumbs/back;
- título;
- formulario;
- acciones.

### Editar

- identificación clara del registro;
- guardar;
- cancelar;
- dirty state cuando corresponda.

### Detalle

- datos organizados;
- acciones;
- secciones;
- historial si existe.

Todo CRUD similar debe compartir el mismo patrón.

---

# 26. Filtros

Los filtros deben:

- ser comprensibles;
- poder limpiarse;
- indicar cuando están activos;
- mantener una estructura consistente.

Si existen muchos filtros:

- utilizar panel;
- drawer;
- popover;
- filtros avanzados.

En móvil no deben ocupar toda la pantalla permanentemente.

---

# 27. Search UX

Revisa:

- icono;
- placeholder;
- debounce;
- botón limpiar;
- estado vacío;
- loading.

Evita ejecutar peticiones innecesarias por cada pulsación cuando no corresponda.

---

# 28. Paginación

Debe ser responsive.

No mostrar veinte números de página en mobile.

Evaluar:

- anterior;
- siguiente;
- página actual;
- tamaño de página;
- total de elementos.

---

# 29. Estados hover / focus / active

Toda interfaz interactiva debe responder visualmente.

Audita:

- botones;
- links;
- sidebar;
- dropdowns;
- table rows;
- cards interactivas;
- selects;
- icon buttons.

Desktop necesita hover.

Teclado necesita focus visible.

Touch necesita estados adecuados.

---

# 30. Accesibilidad

Audita siguiendo buenas prácticas WCAG.

Revisar:

- contraste;
- focus;
- navegación teclado;
- labels;
- aria;
- semantic HTML;
- buttons vs divs clickeables;
- headings;
- alt text;
- dialogs;
- menus;
- form errors.

No eliminar outline de focus sin reemplazarlo por uno adecuado.

---

# 31. Touch targets

En dispositivos táctiles, botones, links e icon buttons deben tener dimensiones cómodas.

No crear controles minúsculos difíciles de pulsar.

Especial atención a:

- X de modales;
- menú hamburger;
- acciones de tabla;
- dropdowns;
- paginación.

---

# 32. Scroll

Revisa:

- scroll general;
- scroll horizontal;
- scroll dentro de dialogs;
- sidebar;
- tablas;
- body locking.

Evita scrolls anidados innecesarios.

---

# 33. Persistencia de estado

Evalúa qué estados conviene conservar entre navegaciones o recargas.

Por ejemplo:

- sidebar expandido/colapsado;
- tema;
- empresa;
- sucursal;
- filtros relevantes;
- tamaño de página.

No persistir indiscriminadamente.

---

# 34. Rutas y navegación

Comprueba que:

- navegación no provoque flashes;
- sidebar marque ruta activa correctamente;
- submenú correspondiente se expanda;
- mobile sidebar se cierre al navegar;
- rutas profundas mantengan contexto.

---

# 35. Microinteracciones

Introduce únicamente microinteracciones que mejoren percepción y comprensión.

Ejemplos:

- transición sidebar;
- dropdown;
- modal;
- hover;
- loader;
- toast.

Deben ser:

- rápidas;
- sutiles;
- funcionales.

No quiero animaciones decorativas propias de landing pages.

---

# 36. Rendimiento percibido

Identifica:

- renders innecesarios;
- cambios de layout;
- loaders bloqueantes;
- imágenes pesadas;
- componentes excesivamente grandes;
- tablas lentas.

Optimiza cuando sea pertinente sin reescribir innecesariamente todo el sistema.

---

# 37. Consistencia semántica

Revisa nombres de acciones.

No quiero encontrar simultáneamente:

- Nuevo
- Crear
- Agregar
- Añadir
- Registrar

para exactamente el mismo patrón funcional sin justificación.

Define terminología consistente.

---

# 38. Fechas, moneda y números

Audita formatos.

Deben respetar locale y necesidades del negocio.

Mantener consistencia para:

- moneda;
- separador decimal;
- miles;
- fechas;
- horas;
- porcentajes;
- cantidades.

---

# 39. Responsive del contenido

Busca explícitamente:

- textos truncados;
- botones que saltan;
- grids rotos;
- campos desalineados;
- cards con alturas incorrectas;
- tablas imposibles de usar;
- headers saturados;
- breadcrumbs gigantes;
- modales fuera del viewport;
- dropdowns cortados;
- tooltips fuera de pantalla.

---

# 40. Estados disabled / readonly / permissions

Los elementos sin permiso deben manejarse coherentemente.

Determina en cada caso si corresponde:

- ocultar;
- deshabilitar;
- mostrar explicación.

No dejar controles aparentemente disponibles que después produzcan error de autorización.

---

# 41. Autenticación

Si existen:

- login;
- forgot password;
- reset password;
- logout;
- session expired;

también deben entrar en la auditoría visual.

El diseño del login debe pertenecer al mismo producto.

---

# 42. Página 404 / 403 / errores

Diseña correctamente cuando existan.

No mostrar únicamente texto técnico.

---

# 43. Design System

A medida que encuentres inconsistencias, consolida un sistema visual reutilizable.

Centraliza en la arquitectura existente:

- spacing;
- typography;
- colors;
- radius;
- shadows;
- breakpoints;
- sizing;
- transitions;
- z-index.

No debes simplemente “arreglar pantallas”.

Debes reducir la posibilidad de que futuras pantallas vuelvan a presentar inconsistencias.

---

# 44. Componentización

Identifica componentes repetidos.

Por ejemplo:

- PageHeader.
- SectionHeader.
- EmptyState.
- DataTable.
- FilterBar.
- ConfirmDialog.
- FormField.
- StatusBadge.
- LoadingState.
- ErrorState.
- Pagination.
- ActionMenu.

Si ya existen componentes compartidos, mejora los existentes.

No dupliques soluciones.

---

# 45. Densidad visual

Este es un sistema administrativo.

No debe parecer:

- una landing page;
- una aplicación móvil ampliada;
- un dashboard con espacios gigantes.

Busca una densidad equilibrada:

- suficientemente compacta para trabajar;
- suficientemente espaciada para leer.

---

# 46. Jerarquía de acciones

En cada página debe quedar claro:

- Acción principal.
- Acciones secundarias.
- Acciones destructivas.

No utilizar cinco botones con el mismo peso visual.

---

# 47. Mobile UX real

No evalúes móvil únicamente reduciendo Chrome.

Piensa como un usuario que opera con el dedo.

Revisa:

- navegación;
- formularios;
- tablas;
- dropdowns;
- dialogs;
- teclado virtual;
- bottom viewport;
- scroll;
- acciones;
- inputs.

Si una operación frecuente resulta incómoda en teléfono, corrígela.

---

# 48. Tablet UX

Presta atención especial a tablet.

Muchos dashboards funcionan bien en 1440 px y bien en 375 px, pero se rompen entre 700–1100 px.

Revisa particularmente:

- sidebar;
- header;
- grids;
- formularios;
- tablas.

---

# 49. Browser testing

Comprueba al menos compatibilidad razonable con motores actuales:

- Chromium.
- Safari/WebKit.
- Firefox.

No utilices soluciones frágiles dependientes de un comportamiento no estándar.

---

# 50. Dark mode

Si actualmente existe dark mode:

audítalo completamente.

Si NO existe:

NO lo implementes simplemente porque parezca moderno.

No constituye una prioridad salvo que forme parte de los requisitos actuales.

---

# FASE 2 — CLASIFICACIÓN

Después de la auditoría, clasifica los hallazgos en:

### P0 — Crítico

Problemas que:

- rompen responsive;
- impiden operaciones;
- generan overlay;
- causan navegación defectuosa;
- producen contenido inaccesible;
- afectan datos o flujo.

### P1 — Alto

Problemas claramente perceptibles para cliente:

- sidebar incorrecto;
- inconsistencias fuertes;
- malas jerarquías;
- formularios deficientes;
- tablas problemáticas;
- layout amateur.

### P2 — Medio

Problemas de:

- spacing;
- typography;
- hover;
- feedback;
- consistencia.

### P3 — Polish

Detalles finales:

- microinteracciones;
- transiciones;
- refinamiento visual.

---

# FASE 3 — PLAN DE IMPLEMENTACIÓN

Antes de tocar grandes cantidades de código genera un plan por lotes.

Ejemplo:

## Batch 1 — Foundations

- tokens;
- breakpoints;
- layout;
- typography;
- spacing.

## Batch 2 — Shell

- sidebar;
- header;
- responsive;
- navegación.

## Batch 3 — Componentes comunes

- buttons;
- inputs;
- modals;
- dropdowns;
- alerts;
- badges.

## Batch 4 — Data UX

- tables;
- pagination;
- filters;
- search;
- empty/loading/error states.

## Batch 5 — Forms / CRUD

- create;
- edit;
- detail;
- validation.

## Batch 6 — Mobile + Tablet

- revisión transversal.

## Batch 7 — Accessibility

- teclado;
- focus;
- semantics;
- contrast.

## Batch 8 — Polish + QA

- inconsistencias restantes;
- animaciones;
- browser testing;
- regresiones.

Puedes ajustar el número de batches según la arquitectura real.

---

# FASE 4 — IMPLEMENTACIÓN

Una vez identificado el problema, procede a corregirlo.

No quiero solamente recomendaciones.

Quiero implementación.

Durante los cambios:

- conserva arquitectura existente cuando sea razonable;
- refactoriza cuando reduzca deuda técnica;
- evita duplicación;
- utiliza componentes compartidos;
- utiliza tokens;
- respeta tipado;
- respeta lint;
- respeta convenciones del repositorio.

No alteres lógica del negocio salvo que sea estrictamente necesario para corregir UX.

---

# FASE 5 — VERIFICACIÓN POR COMPONENTE

Después de modificar cada componente importante debes comprobar sus estados.

Por ejemplo para un botón:

- normal;
- hover;
- active;
- focus;
- disabled;
- loading.

Para input:

- empty;
- filled;
- focus;
- validation error;
- disabled;
- readonly.

Para sidebar:

- desktop expanded;
- desktop collapsed;
- tablet;
- mobile closed;
- mobile opened;
- navegación;
- submenu;
- route change.

---

# FASE 6 — PRUEBA DE RUTAS REPRESENTATIVAS

No necesitas revisar solamente Home.

Selecciona páginas representativas de distintas categorías:

- dashboard;
- listado;
- detalle;
- creación;
- edición;
- página con tabla grande;
- página con formulario largo;
- página con modal;
- página con filtros;
- login si corresponde.

Utilízalas como matriz de regresión.

---

# FASE 7 — QA FINAL

Antes de considerar terminado el trabajo realiza nuevamente una auditoría general.

Busca especialmente:

- horizontal overflow;
- alignment;
- clipping;
- incorrect z-index;
- duplicate scroll;
- broken focus;
- inconsistent typography;
- inconsistent spacing;
- inconsistent buttons;
- dead states;
- console warnings;
- runtime errors.

---

# COMPORTAMIENTOS ESPECÍFICOS QUE YA HE DETECTADO

Además de tu propia auditoría, actualmente existen problemas que debes tratar expresamente:

### Responsive

El dashboard actualmente no presenta una experiencia responsive suficientemente profesional.

Debes corregirlo transversalmente.

### Sidebar móvil

Actualmente el usuario abre el menú móvil, entra a un módulo y el menú permanece abierto.

Debe cerrarse automáticamente al navegar.

### Sidebar desktop

Debes revisar completamente la experiencia expandida/colapsada.

### Logo

Actualmente no existe una correcta reserva del espacio del logo entre estados collapsed/expanded.

Debes crear una solución estructural para evitar saltos de layout.

No quiero hacks como márgenes condicionales arbitrarios por pantalla.

---

# CRITERIO VISUAL

Quiero una estética empresarial moderna.

Referencias conceptuales:

- Linear.
- Stripe Dashboard.
- Vercel.
- GitHub.
- Atlassian.
- Shopify Admin.
- sistemas ERP modernos.

NO significa copiarlos.

Significa adoptar principios como:

- jerarquía clara;
- consistencia;
- interfaces silenciosas;
- buen spacing;
- excelente tipografía;
- feedback inmediato;
- navegación predecible.

---

# EVITAR

No quiero:

- gradientes innecesarios;
- glassmorphism;
- sombras exageradas;
- cards para absolutamente todo;
- iconos decorativos;
- emojis;
- animaciones largas;
- colores chillones;
- border-radius exagerado;
- botones enormes;
- interfaces tipo landing page;
- efectos visuales que sacrifiquen productividad;
- responsive basado únicamente en ocultar elementos.

Este es software empresarial.

---

# DEFINICIÓN DE TERMINADO

La tarea NO estará terminada simplemente porque:

- el sidebar funcione;
- ya no exista overflow;
- la versión móvil “se vea”.

Se considera terminada cuando exista una experiencia transversal coherente.

Como mínimo:

- [ ] Layout global consistente.
- [ ] Responsive completo.
- [ ] Sidebar profesional.
- [ ] Mobile drawer profesional.
- [ ] Cierre automático del menú tras navegación.
- [ ] Logo correctamente tratado en collapsed/expanded.
- [ ] Header responsive.
- [ ] Sistema de spacing consistente.
- [ ] Tipografía consistente.
- [ ] Colores centralizados.
- [ ] Buttons estandarizados.
- [ ] Inputs estandarizados.
- [ ] Formularios responsive.
- [ ] Tablas utilizables en mobile.
- [ ] Modales responsive.
- [ ] Dropdowns correctos.
- [ ] Loading states.
- [ ] Empty states.
- [ ] Error states.
- [ ] Feedback de acciones.
- [ ] Confirmaciones.
- [ ] Navegación coherente.
- [ ] Accesibilidad básica sólida.
- [ ] Focus states.
- [ ] Touch targets adecuados.
- [ ] Componentes compartidos.
- [ ] Sin overflow horizontal accidental.
- [ ] Sin errores visuales entre breakpoints.
- [ ] Sin regresiones funcionales.
- [ ] Sin errores nuevos de consola.
- [ ] Build exitoso.
- [ ] Lint/typecheck correctos cuando existan.

---

# FORMA DE TRABAJO

Quiero que trabajes de forma autónoma.

No me preguntes qué elemento debes revisar a continuación si puedes determinarlo inspeccionando el proyecto.

Cuando encuentres un problema:

1. Identifica su causa raíz.
2. Busca dónde se origina.
3. Determina si es local o sistémico.
4. Si es sistémico, corrígelo a nivel de sistema/componente.
5. Implementa.
6. Comprueba regresiones.
7. Continúa.

No resuelvas síntomas cuando puedes resolver la causa.

---

# MUY IMPORTANTE: NO SOBRERREFACTORIZAR

No conviertas esta auditoría en una reescritura completa del frontend.

Antes de reemplazar algo, pregúntate:

> ¿Podemos conseguir el mismo resultado profesional mejorando correctamente la arquitectura existente?

Si sí, conserva la infraestructura actual.

Solo realiza refactors importantes cuando exista una justificación clara en:

- mantenibilidad;
- consistencia;
- responsive;
- accesibilidad;
- eliminación de duplicación.

---

# REPORTE DE PROGRESO

Antes de comenzar la implementación quiero un resumen breve con:

1. Arquitectura UI encontrada.
2. Principales problemas.
3. Problemas sistémicos.
4. Problemas responsive.
5. Deuda visual.
6. Deuda de componentes.
7. Priorización P0/P1/P2/P3.
8. Batches que implementarás.

Después comienza directamente con la implementación.

No detengas el trabajo únicamente para entregarme el análisis.

---

# REPORTE FINAL

Cuando termines entrega:

## Cambios realizados

Resumen por área.

## Componentes modificados

Lista de componentes relevantes.

## Problemas corregidos

Explicar brevemente los principales.

## Responsive

Indicar qué estrategias y breakpoints quedaron implementados.

## UX

Indicar mejoras en interacción.

## Accessibility

Indicar mejoras aplicadas.

## Design System

Indicar tokens/componentes consolidados.

## Deuda pendiente

Solo si queda algo justificadamente fuera de alcance.

## Validaciones

Informar resultado de:

- build;
- lint;
- typecheck;
- tests;
- revisión responsive;
- errores de consola.

---

# ÚLTIMO CRITERIO

Cuando tengas que decidir entre dos soluciones, elige la que un equipo senior implementaría en un SaaS B2B que será mantenido durante varios años.

No optimices únicamente para “que funcione”.

Optimiza para:

**que funcione bien, sea coherente, pueda mantenerse y se perciba como un producto profesional.**