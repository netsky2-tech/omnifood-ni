# Auditoría del sitio publicado — 2026-11-20

Crawl completo de las nueve páginas con navegador real (puppeteer + chromium), ~60 capturas
desktop/móvil, y verificación de layout, accesibilidad, headers, TLS, DNS, redirecciones y copy.
Instrumentos y salidas del crawl: `/tmp/nhilos-audit/`.

## Specs

S1. Ninguna página desborda el viewport en 320, 360, 390 ni 430 px, y la tira de planes
    envuelve en lugar de imprimir "EsencialUS$49/mesSetup US$149".
    *Medido: `/precios/` medía 521 px en todo móvil.*
S2. El sitio declara una sola forma de la URL: canonical apex en las nueve páginas.
S3. Toda promesa de coordinación multi-terminal en tiempo real queda fuera del sitio.
S4. Ninguna página publica rutas internas crudas ni anuncia páginas "en preparación"
    cuando ya existen.
S5. Toda cifra de cargo puede envolver; toda pista de rejilla con texto lleva `minmax(0, …)`.
S6. Headers de seguridad servidos en producción: HSTS, nosniff, X-Frame-Options,
    Referrer-Policy, COOP, CORP, Permissions-Policy y CSP con hashes de scripts inline.
S7. Las respuestas de FAQ no abren todas con la misma fórmula geográfica, y no repiten
    el cuerpo de la sección que las precede.
S8. La media publicada se ve nítida en pantalla 2x.

## Tasks

| ID | Spec | Route | Estado |
|----|------|-------|--------|
| T1 | S1, S5 | inline | hecho — `a7b25bb5`: nowrap fuera, `minmax(0, 1fr)`, 0 desbordes en 36 combinaciones |
| T2 | S2 | inline | hecho — `a7b25bb5`: nueve canonicals apex + S14 de clase |
| T3 | S3 | inline | hecho — `ccfeaeff` (/precios/) y `a7b25bb5` (/demo/) |
| T4 | S4 | inline | hecho — `a7b25bb5` |
| T5 | S6 | inline | hecho — `_headers` generado en el build, CSP enforcing verificado en preview |
| T6 | S7 | worker | pendiente — ~40 respuestas abren con "En Nicaragua," |
| T7 | S8 | founder + worker | pendiente — hero 402×811 y capturas dibujadas al 37 % |
| T8 | S6 (DNS) | founder | pendiente — SPF, CAA, DNSSEC y quitar `ACAO: *` |

## Log

L1 (fundador, verbatim, 2026-11-20): *"Ya hecho: crawl de las 9 páginas, ~60 capturas
(desktop/móvil), y checks de layout, a11y, headers, TLS, DNS, redirects y copy. Hallazgo P0
(medido, no supuesto): /precios/ desborda a 521px en todo móvil (verificado a 320/360/390/430).
El culpable es .charge-row .c-amount: { white-space: nowrap } … Corrección de un supuesto mío:
el sitio sí cubre no-JS con un <noscript> … Retiro ese P0."*

L2: el P0 era real y tenía **dos** causas, no una: el `nowrap` sobre una frase de 501 px y el
apilado móvil `grid-template-columns: 1fr`, que es `minmax(auto, 1fr)` y por lo tanto toma el
min-content del hijo como piso. Corregir solo el `nowrap` habría dejado la pista inflable.

L3: T3 pedía retirar "tiempo real" de `/precios/`; el crawl lo vio y el commit `ccfeaeff` ya lo
había retirado. Sí quedaba el mismo modelo en `/demo/`, que nadie había mirado: la administración
del food park "viendo la operación". Es la página que el reencuadre de food parks olvidó.

L4: los tests fijaban el defecto: cuatro aserciones exigían `https://www.nhilospos.com` en tres
páginas mientras las otras seis usaban apex. Se corrigieron las cuatro y se reemplazó la regla
por página con una guardia de clase (S14) que fija la forma completa de la URL.

L5: T5 arrancó en *report-only* y se verificó en preview: 0 violaciones, 0 desbordes. Al pasar a
enforcing, los hashes del header se comprobaron contra el HTML servido, bloque por bloque.
`upgrade-insecure-requests` se retiró de la política porque no aplica en report-only.

L6: se retira del P0 la cobertura no-JS: el `<noscript>` de `05-home-geo.html:236` revela
`.reveal`, `.stagger` y el hero. Queda como debilidad menor si `site.js` falla con JS activo.

## Segunda pasada — lectura completa del informe externo (2026-11-20)

Leído `docs/nhilos/web/nhilos_web_auditoria_externa_v1.0.md` entero. Nueve hallazgos no
estaban en las tres notas del fundador y ocho siguen abiertos.

### Cerrado en esta pasada

| Hallazgo (sección) | Estado |
|---|---|
| S8.1 menú de escritorio inalcanzable con teclado | `01250882` — botón con aria-expanded, Enter/Espacio/Escape |
| S8.2 la espina roba los 12 primeros tabs | `01250882` — visibility:hidden inactiva, tooltip en :focus-visible |
| S8.3 menú móvil sin estado visible ni bloqueo de scroll | `01250882` — icono en cruz, scroll bloqueado |
| S10.4 formulario filtra nombre y teléfono sin JS | `01250882` — emisor type=button, formulario oculto sin JS |
| S9.4 título de food-parks distinto en build y página | `fabf6187` — el build falla por deriva |
| S4.5 espacio antes del punto | `fabf6187` — lint de build, probado en rojo |
| S11.5 sin identificador de versión | `fabf6187` — `<meta name="build">`, verificado en producción |
| S9.4 fuentes/pies y S4.5 "en preparación" | commits anteriores |

### Abierto, con dueño

| Hallazgo | Dueño | Nota |
|---|---|---|
| S4.6 el párrafo jurídico de /inventario/ supera 110 palabras | parent | hecho (worker 2026-11-20) — tres viñetas sin perder una palabra; guardia en la suite de auditoría |
| S5 CTA de demo ausente en el hero de /facturacion-dgi/ y /inventario/ | parent | hecho (worker 2026-11-20) — CTA primaria de WhatsApp "Revisar mi caso con un especialista" en ambos hero, con utm_medium por página; las anclas internas quedan como secundarias. Sin potentialAction en el JSON-LD de estas páginas, nada que espejar |
| S5 dos de las cuatro tarjetas de segmento parecen clicables y no lo son | parent | hecho (worker 2026-11-20) — cafeterías y tiendas vuelven a bloques de texto (el árbol tenía enlaces en borrador); lift solo en las tarjetas con enlace real |
| S5 ancla "ver planes y precios de NHILOS POS" 17 veces idéntica | parent | hecho (worker 2026-11-20, con parent-issued surfaces ampliadas) — los enlaces no-FAQ de las nueve páginas varían por contexto (hrefs intactos), la frase queda 3 veces solo dentro de respuestas FAQ, y la guard S16 fija el tope de 3 por texto de enlace del cuerpo en todo el sitio |
| S6.1 /food-parks/ sin una sola animación de entrada | parent | única página que se siente estática |
| S6.3 capturas en caja 1/1 con object-fit contain y sin zoom | parent | el texto interno se dibuja a ~5 px |
| S7.3 sin srcset/sizes ni AVIF | T4 | 2.9 MB de media referenciada |
| S8.5 enlaces de pie con altura menor a 24 px | parent | hecho (worker 2026-11-20) — línea de contacto a 24 px en escritorio y enlaces de pie a 44 px en táctil, sin mover la grilla en escritorio |
| S9.1 la misma pregunta FAQ en 4–5 páginas | decisión | "una pregunta, una página dueña" |
| S11.1 45 archivos de media sin referenciar | parent | no llegan al usuario; es higiene de repo |
| S11.2 cada página lleva su propio `<style>` | refactor | por eso el bug de /precios/ vivió en una sola página |
| S11.3 las claim guard como comentario en vez de lint | parent | el comentario ya no viaja; falta el lint |
| S10.1 `Access-Control-Allow-Origin: *` | infra | `_headers` agrega, no borra: necesita Worker |
| S10.3 SPF, CAA y DNSSEC | fundador | panel de Cloudflare y registrador |
| S6.4 hero 402×811 ampliado 1.94× en móvil | fundador | requiere captura real nueva (U5) |

### Descartado a propósito

- **WebGL/Three.js/GSAP (S6.2).** Coincide con la recomendación del informe y con la
  decisión previa: la audiencia navega en Android de gama baja sobre 3G.
- **HSTS `preload` (S10.2).** No se pone hasta saber que ningún subdominio necesita HTTP;
  es difícil de deshacer y el informe mismo lo advierte.
- **`security.txt`.** Necesita una dirección real de reporte y el dominio no tiene correo
  (sin MX). Publicar un contacto que no recibe nada es peor que no publicarlo.

### Tercera pasada — worker, seis fixes de la auditoría (2026-11-20)

Hero de las dos páginas de cumplimiento con WhatsApp como primaria (palabrao del informe:
"Revisar mi caso con un especialista"), anclas internas conservadas; tarjetas de segmento
sin enlace reducidas a bloques de texto (los enlaces de borrador se retiran a pedido de la
delegación); anchor de precios variado por contexto en las páginas permitidas y, con las
superficies que el parent aprobó después, en las cuatro restantes: los seis textos de enlace
que superaban el tope (demo, WhatsApp, mecánica fiscal, inventario, offline, precios) quedan
a 3 instancias exactas sitio, donde tres de ellas viven dentro de respuestas FAQ que el parent
mandó no tocar; guard S16 de clase (tope 3 por texto de enlace del cuerpo, navegación fuera).
Párrafo de estado
dividido en tres viñetas con el texto íntegro; taps del pie a 24/44 px; brief con la segunda
`8.6` renumerada a `8.9` (renumerar a `8.7` habría creado un nuevo duplicado con la sección
de medición) y `foodpark_admin_lee` renombrado a `foodpark_llega_independencia` con nota de
quiebre de serie. Guardias de las seis correcciones en
`scripts/__tests__/nhilos-web-auditoria-2026-11-20.test.mjs` (RED observado, luego GREEN).
