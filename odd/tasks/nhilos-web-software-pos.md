# Feature: hub `/software-pos/` con paridad visual con el home

Publicar la página hub de la categoría reutilizando tokens, motion y calidad de
ejecución del home, con patrones de sección propios. Es la página que desbloquea
el re-encabezado del home (su H1 hoy retiene el término cabeza del hub).

Fuente de contenido vinculante: `docs/nhilos/web/nhilos_web_page_briefs_v1.0.md` §3.

## Specs

**S1 — Paridad visual (requisito del fundador, verbatim).**
> "Es importante que las demas páginas lleven la misma calidad visual, motion, tokens y diseño del home. Sin ser repetitivos pero manteninedo ese estilo, dinamismo, smoothness y variacion en los diseños entre secciones."

Interpretación vinculante: los *tokens* (color, tipografía, espaciado, radios, sombras, duraciones de animación) y el *comportamiento* (reveal al scroll, transiciones, focus visible, `prefers-reduced-motion`) son **idénticos** al home. Los *patrones de sección* **no** se repiten: una página que calca el orden del home es una falla de esta spec, no un cumplimiento.

**S2 — Contenido y jerarquía (verbatim desde el brief §3).**
La fuente es `nhilos_web_page_briefs_v1.0.md` §3: queries que el hub posee, queries que cede explícitamente a los hijos con dueño nombrado, jerarquía H1–H3, y las dos formas de operación (vende lo que compra / vende lo que cocina) en la primera pantalla. El worker lee §3 completo antes de escribir una línea.

**S3 — Claims vetados (verbatim, no negociable).**
Prohibido publicar: "factura electrónica", "cero multas", "sistema autorizado por la DGI", "con folio autorizado", "nunca pierdes una venta", "100% sincronizado", "solución integral", "transformación digital", "ecosistema", "Hardware real", KDS como capacidad vendible, impresión prometida, concurrencia LAN, caja compartida, vista consolidada de todas las marcas, exportación contable, multi-sucursal.

**S4 — Vocabulario interno (verbatim).**
> "No poner eso de los planes se habilitan por parte durante la puesta en marcha... Siento que se da a entender que lo daremos el producto completo y que le iremos agregando actualizaciones con el tiempo"

Nunca: números de issue, "entitlements", "go-live", "staging", "backlog", "TODO", "QA". Nada que suene a hoja de ruta: la página dice lo que el producto hace hoy.

**S5 — Paridad GEO (verbatim del sistema).**
Todo dato del JSON-LD es idéntico celda por celda al texto visible. Ya aplica al home y su prueba lo exige.

**S6 — El home no se degrada.**
El build deja de ensamblar una sola página. El CSS del home se extrae a un asset compartido para que ambas páginas usen la misma fuente de tokens. La página publicada del home debe quedar con el mismo aspecto y sus 16 pruebas en verde después del cambio.

## Tasks

| ID | Tarea | Ruta | Commit |
|---|---|---|---|
| T1 | Build multi-página + extracción del CSS compartido con nombre hasheado; home intacto y 16/16 | inline | `docs(web): build multi-pagina` |
| T2 | `06-software-pos.html`: contenido y jerarquía según brief §3, patrones de sección propios sobre los tokens del home | worker | `feat(web): hub software-pos` |
| T3 | JSON-LD, canonical, title/description, entrada de sitemap; `robots.txt` sin cambios | worker | — |
| T4 | Prueba del artboard nuevo: paridad H1/JSON-LD, claims vetados, vocabulario interno | worker | — |
| T5 | Verificación: build, 16/16 + nuevas, texto visible en vivo, capturas 1440 y 390 | parent | — |
| T6 | Experimento 3D acotado: una escena que explique el flujo compra → plato → kardex. Se descarta si no explica o si pasa el presupuesto de peso | worker (después de T2) | `feat(web): escena 3d del flujo` |
| T7 | Consolidar la bifurcación: la página plantea las dos formas **dos veces** (preguntas inertes en el hero y píldoras en `#formas`). Un solo control, en el hero, que además mueva la banda. Quitar la duplicación y el aire muerto del hero | worker | `fix(web): una sola bifurcacion` |
| T8 | **Densidad al nivel del home.** Siete defectos medidos en la página publicada: hero con columna vacía, conmutador sin retorno, tarjetas estiradas por capturas desparejas, `#entra-por-el-tuyo` plano, FAQ con diseño ajeno al home, `#nivel` con un vacío de media sección, y el libro de rutas con filas huecas | worker | `feat(web): densidad del hub` |

| T9 | Los tres huecos que sobreviven a T8: fila 01 del libro de rutas con el video solo y media fila vacía, y dos secciones de una sola columna (`¿Cuánto cuesta?`, `¿Necesito equipo especial?`) con media página vacía al lado | worker | `fix(web): cerrar los huecos del hub` |

### T9 — Lo que T8 no cerró

Medido sobre la página construida, no a ojo:

1. **Fila 01 del libro de rutas.** El video de la terminal ocupa ~240 px de una fila de 1440 y deja media fila vacía. Va en dos columnas: el texto a la izquierda, el video a la derecha con ancho acotado; la fila termina donde termina su contenido.
2. **`¿Cuánto cuesta un sistema POS en Nicaragua?`** Un párrafo de ~40 % de ancho y el resto vacío.
3. **`¿Necesito equipo especial?`** Igual. Las dos son preguntas de cierre y hoy parecen relleno.

**Corrección para 2 y 3:** son la misma clase de pregunta (condiciones de compra) y viven pegadas. Se resuelven como **una sección de dos columnas** —costo a la izquierda, equipo a la derecha— o, si se mantienen separadas, cada una gana su columna de contenido real. Prohibido rellenar con aire o con texto nuevo que afirme capacidades no vendidas.

**Aceptación:** a 1440 y a 390 ninguna de las tres deja más de ~120 px de vacío sin contenido, y la altura de cada sección se reporta antes y después.

### T8 — Diagnóstico de la página publicada (revisión del fundador + captura propia)

**Regla sistémica que las causa a casi todas:** hay celdas de grilla que se estiran para igualar a su vecina y no tienen con qué llenarse. El resultado no se lee como aire editorial, se lee como hueco. **Ninguna caja puede ser más alta que su contenido.**

1. **Hero, columna derecha vacía.** El fork y la nota de capturas viven en la misma columna con ~500 px entre ellos. Medido: el fork ocupa 2 líneas y la columna mide lo que el H1. **Corrección:** el fork pasa a ocupar la columna con dos filas de altura completa y tipografía grande (es el control principal de una página de ruteo); la nota va pegada debajo del fork, no al fondo de la columna.
2. **El conmutador no tiene retorno.** Al elegir una forma, la otra se atenúa y no hay manera de volver al estado neutro salvo eligiendo la otra. **Corrección:** elegir la forma activa la deselecciona; sin ninguna elegida, las dos tarjetas quedan en el mismo peso. `aria-pressed` pasa de booleano por botón a estado tri-valente gestionado en el contenedor.
3. **Tarjetas estiradas por capturas desparejas.** `#formas`: a la izquierda una captura de teléfono vertical altísima, a la derecha una del panel de escritorio. La derecha queda con media tarjeta vacía. **Corrección:** el medio de cada tarjeta vive en una caja de proporción fija (`aspect-ratio`) con `object-fit`, las tarjetas se alinean arriba (`align-items: start`) y no se estiran entre sí. Mismo tratamiento en móvil.
4. **`#entra-por-el-tuyo` plano.** Tres bloques de texto sueltos contra media página vacía a la derecha. Es la sección que **reparte el tráfico**: tiene que verse como un reparto. **Corrección:** tres tarjetas de altura propia en grilla de tres columnas (a una columna en móvil), cada una con número, nombre, una línea y su destino.
5. **FAQ con diseño ajeno.** Hoy es un acordeón `details/summary`. El fundador pide **el diseño del home**: grilla de celdas en dos columnas con borde. **Corrección:** mismo patrón `faq-cell` del home, misma retícula, mismo tratamiento de filetes. Mantener la paridad JSON-LD celda por celda.
6. **`#nivel` con vacío de media sección.** El bloque de la decisión de control deja un hueco grande con una cita suelta. **Corrección:** o se llena con una comparación real de los tres niveles (lo que cada uno controla) o se recorta a la altura de su contenido. Prohibido rellenar con aire.
7. **Libro de rutas con filas huecas.** Las filas 01/02/03 reservan altura de dos columnas y su nota derecha es de dos líneas. **Corrección:** la nota va en la misma fila que el título, la fila se ajusta al contenido, y el número manda la jerarquía.

**Criterio de aceptación de T8:** a 1440 y a 390, ninguna sección muestra una columna o celda con más de ~120 px de vacío sin contenido; el conmutador vuelve a neutro; las dos capturas de `#formas` tienen el mismo peso visual; el FAQ replica la retícula del home; y la página tiene al menos la densidad del home, no menos.

**Medir, no mirar a ojo:** capturar el sitio publicado a 1440 y a 390 por iframe de ancho fijo, y anotar la altura de cada sección antes y después. Un `--virtual-time-budget` alto o la captura sale con las animaciones a medias.

### T7 — Una sola bifurcación

**El defecto:** el hero pregunta «¿Vendes lo que compras?» / «¿Lo que vendes se cocina?» como texto sin acción (`06-software-pos.html:342-345`), y `#formas` vuelve a plantear la misma elección con píldoras `aria-pressed`. El hub es una página de ruteo: la bifurcación es su trabajo principal, y plantearla dos veces —la primera inerte— diluye el ruteo en vez de reforzarlo.

**La corrección:**
1. Las dos preguntas del hero pasan a ser **el control**: dos botones reales que fijan la forma de operación.
2. El control **mueve la banda**: al elegir, la columna correspondiente toma énfasis y la otra cede, y la página lleva el foco a `#formas` sin salto brusco.
3. **Se eliminan las píldoras de `#formas`**: un solo lugar para la misma decisión.
4. Sin JS, ambos botones son enlaces a `#formas` y las dos columnas se leen completas: la bifurcación sigue existiendo como contenido.
5. **Aire muerto del hero**: hoy quedan ~150 px vacíos entre la nota de capturas y la sección siguiente, tanto en 1440 como en 390. Se ajusta el padding, no se inventa contenido para llenarlo.

**No romper:** las 22 guardias, la paridad JSON-LD, el H1, ni las dos capturas reales. Home: 16/16.

**Verificar con medición real, no por vista:** captura a 1440 y a 390 mediante iframe de ancho fijo (`_m390.html` temporal), porque Chrome clampa el ancho a ~500 px y recorta sin avisar.

### T6 — Condiciones del experimento 3D

**Solo después de que T2 esté publicado y midiendo.** No bloquea la página.

**La escena tiene que explicar, no decorar.** Objetivo: el visitante arrastra un ítem desde la compra hasta el plato y ve el kardex moverse. Si la escena se anima sola sin intervención, es advertisement disfrazado y se descarta.

**Criterios de muerte, escritos antes de construir:**
1. Si quitar la escena no pierde información, no entra.
2. Presupuesto de peso: **≤120 KB** comprimidos para el chunk de three.js y la escena. Si se pasa, no entra.
3. Debe correr a 30 fps en un Android de gama media y respetar `prefers-reduced-motion` cayendo a un diagrama estático correcto.
4. Con JS apagado, el contenido de la sección sigue siendo legible y completo.

**Si se descarta, queda el diagrama estático** que ya sirve la página. El experimento nunca deja el sitio a medias.

## Log

**L1 — pedido original (verbatim).**
> "Dale, procedamos. Es importante que las demas páginas lleven la misma calidad visual, motion, tokens y diseño del home. Sin ser repetitivos pero manteninedo ese estilo, dinamismo, smoothness y variacion en los diseños entre secciones."

**L2 — estado del repo al abrir.**
`main` en `c5a4b2f9`. El build (`scripts/build-nhilos-web.mjs`) copia **un solo** `ENTRY` a `index.html` y post-procesa ese archivo; el artboard del home tiene 1455 líneas y su bloque `<style>` es la única fuente de tokens del sitio. Sitemap generado en el build. Pruebas del home: 16/16.

**L3 — dirección creativa del fundador (verbatim).**
> "Bien, recordemos sacar provecho de recursos, tenemos generacion de imagenes con antigravity, tenemos las herramientras de produccion de videos, ya tenemos three.js disponible y hemos hecho creaciones también, como un video de GTA como prueba. No hagamos una pagina aburrida si tenemos herramientas de sobra para darle vida. Tampoco es forzarlo pero si donde tenga sentido. Demonos paso a la creatividad"

**L4 — límites que la dirección creativa no levanta.** Trazados desde trabajo previo que falló: una imagen generada **nunca** se presenta como producto ni como cliente real (solo materia abstracta: papel, acero, vapor); ningún ticket renderizado puede parecer impreso; un visual que no explica se elimina. El tratamiento isométrico que se mató en la pieza de video es el precedente.

**L5 — decisión de secuencia (fundador, 2026-11-18).** Página primero, 3D después como experimento acotado. El argumento que se le presentó: el sitio ya pesa 21,3 MB con un video de 5,5 MB, y three.js suma ~150 KB más GPU en gama baja; el footage real rinde más por kilo. Queda registrado en T6 con criterios de muerte previos.

**L6 — T1 ejecutado (parent, inline).** `assets/site.css` (41.296 B, 317 reglas) y `assets/site.js` (12.380 B) extraídos del artboard del home con contenido byte a byte idéntico, publicados con hash, y `PAGES` reemplazó al `ENTRY` único. El bloque `<style>` del `<noscript>` se conservó en la página. Home verificado: 16/16, misma cascada.

**L7 — pausa del 2026-11-18 (fin de sesión).** El hub está **publicado** en `https://nhilospos.com/software-pos/` y verificado en vivo: 42/42 pruebas, build de 2,9 MB con 26 assets referenciados, cero jerga interna, cero claims vetados. T1 (build multi-página), T2 (hub), T7 (una sola bifurcación), T8 (densidad) y los dos clips reales están en `main`. **T9 corriendo** al momento de pausar: fila 01 del libro de rutas y las dos secciones de una columna. Al retomar: verificar T9 con capturas reales (iframe para 390), commitear, y decidir si el hub necesita su propia pasada de material —hoy tiene tres secciones con medios y el home seis—. Pendiente aparte: el experimento 3D (T6) y la pasada de material sobre el home.

**Aprendizajes que cuestan caro si se olvidan:** `var(--text-heading-lg)` no existe en `assets/site.css` y una regla con un token inexistente falla **en silencio** (el fork renderizaba a tamaño de cuerpo); verificar cada `var(--*)` contra el archivo antes de nombrarlo. Headless congela los reveal a media animación: inyectar el estado final antes de capturar. Chrome clampa el ancho de ventana a ~500 px y recorta sin avisar: medir 390 por iframe de ancho fijo.
