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
