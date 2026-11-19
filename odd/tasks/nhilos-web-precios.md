# nhilos-web-precios

Página `/precios/` (G13): la primera de las siete hijas, construida con la guía SEO de 7 pasos como metodología vinculante. Brief: `docs/nhilos/web/nhilos_web_page_briefs_v1.0.md` §2 (v1.5, tres rondas de claims).

## Specs

- **S1.** «Vamos a seguir esa metodología en todas las paginas que hagamos, justo como hicimos con la HOME» y «esa guía es la que dicta como estará estructurada la página realmente» (fundador, 2026-11-19). La estructura de la página sale de la guía: intención de búsqueda → jerarquía del brief §2.4 verbatim y en orden (H1 `Precio de sistema POS para restaurante en Nicaragua: planes desde US$49 al mes` + diez H2), respuesta rápida en los primeros 150 px, FAQ con `FAQPage` al final.
- **S2.** «arranca con /precios/ aplicando la guía» (fundador, 2026-11-19). Artboard `design/nhilos-web-foundation/07-precios.html`, tokens y motion exclusivamente de `assets/site.css`/`site.js` — cero CSS duplicado — y patrones de sección que NO repitan el home ni el hub.
- **S3.** Regla de profundidad §2.3: «El home vende; `/precios/` explica costos» — cada párrafo responde una pregunta de compra (precio, alcance, compromiso, hardware, crecimiento), nunca describe el producto ni narra el sitio.
- **S4.** Regla de voz (ODD del hub S7, aplicada): cero narración de sitio, cero jerga de ingeniería (BOM → «recetas e insumos»), vocabulario interno prohibido. Fijada por guardia.
- **S5.** Regla de consistencia §2: los números coinciden número por número con la home (`#precios`) y con `docs/finance/estrategia_precios_nhilos_pos_v1.md` §4 — Esencial US$49/149, Operación US$89/250, Pro US$149/450, Enterprise por cotización, packs US$39 (+US$29 segundo en Operación), terminal adicional US$40 (US$29 en Pro) + US$75 enrolamiento, owner US$10/mes.
- **S6.** Refusals del brief §2 obligatorios: sin descuentos ni urgencia, sin términos de contrato inventados («cancela cuando quieras» prohibido), sin precios de hardware hasta validar dos proveedores, sin cifras sueltas de servicios cotizables, BYOD solo con el guard del adaptador ESC/POS (#983), comparación por categoría nunca contra competidor nombrado.
- **S7.** JSON-LD verbatim idéntico al texto visible, celda por celda (FAQPage + BreadcrumbList), paridad fijada por guardia.
- **S8.** Entrada en `PAGES` de `scripts/build-nhilos-web.mjs` (sitemap incluido), rutas absolutas de media/fonts, build verde con las 3 suites.

## Tasks

| ID | Specs | Ruta | Commit |
|---|---|---|---|
| T1 | S1–S8 | worker | `feat(web): página /precios/ con la guía de 7 pasos` |
| T2 | S1–S8 | parent | revisión en canvas del fundador, despliegue y verificación en vivo |

## Log

- **L1.** «Indicame bien como sacar la captura con terminal real para hacer lo del hero. Y si, arranca con /precios/ aplicando la guía» (fundador, 2026-11-19). La captura del hero quedó documentada en `docs/nhilos/web/nhilos_web_media_capture_brief_v1.0.md` (camino A inmediato con el loop real existente, camino B con cámara para el upgrade) y la página arranca con este documento.
- **L2.** Metodología vinculante y regla de voz declaradas por el fundador el mismo día (verbatim en S1 y S4); briefs actualizados a v2.0.
- **L3.** T1 ejecutado (worker, 2026-11-19). Artboard `07-precios.html` nuevo (hermano de 05/06: shell compartido, breadcrumb Inicio / Precios, JSON-LD Organization + BreadcrumbList + FAQPage), entrada en `PAGES` (`precios/index.html` → `/precios/`, sitemap automático) y suite nueva `nhilos-precios-artboard.test.mjs` (24 guardias, RED observado antes del GREEN). Patrones de sección propios: cinta de respuesta rápida en el hero (los 4 planes antes del primer H2), líneas de tarifa tipo tarifario, tabla comparativa completa, fichas de plan, filas de packs con regla publicable, lista de cargos con precio publicado, banda oscura de riesgo por categoría (sin marcas), pares asegurados, tira de pasos del setup, píldoras de la regla de hardware (aparte / Android / se cotiza), escalera de planes; único componente de sistema reutilizado: la retícula `faq-cell`. Paridad numérica fijada por guardia contra el conjunto congelado (49/149, 89/250, 149/450, packs 39/29/88, terminal 40/29, enrolamiento 75, owner 10). Nota para revisión: S1 dice «diez H2» pero el brief §2.4 contiene **once** verbatim; la fuente vinculante es la jerarquía del brief y así se construyó y fijó la guardia. Build verde: 80/80 en las tres suites (home 23, hub 33, precios 24), 3 páginas en `npm run build:web`. Medido a 1440 y 390 (iframe de ancho fijo) con reveal congelado: overflowX 0 en ambos, respuesta rápida a 761 px (1440) y 1142 px (390).
