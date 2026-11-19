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

## Log

**L1 — pedido original (verbatim).**
> "Dale, procedamos. Es importante que las demas páginas lleven la misma calidad visual, motion, tokens y diseño del home. Sin ser repetitivos pero manteninedo ese estilo, dinamismo, smoothness y variacion en los diseños entre secciones."

**L2 — estado del repo al abrir.**
`main` en `c5a4b2f9`. El build (`scripts/build-nhilos-web.mjs`) copia **un solo** `ENTRY` a `index.html` y post-procesa ese archivo; el artboard del home tiene 1455 líneas y su bloque `<style>` es la única fuente de tokens del sitio. Sitemap generado en el build. Pruebas del home: 16/16.
