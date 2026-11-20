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
