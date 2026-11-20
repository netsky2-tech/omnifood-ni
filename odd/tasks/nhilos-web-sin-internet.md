# `/software-pos/sin-internet/` — la página del diferenciador

Ruta publicada `/software-pos/sin-internet/`, artboard `design/nhilos-web-foundation/11-sin-internet.html`. Fuente de verdad: `docs/nhilos/web/nhilos_web_page_briefs_v1.0.md` **§7** + la guía SEO de 7 pasos. Es la página donde la sobreafirmación es **más tentadora y más dañina**: el diferenciador entero depende de que el límite se diga bien.

---

## 0. Encargo, límites y cómo trabajar

**Qué se construye:** una página nueva, hermana de las seis existentes. Explica **el mecanismo completo** de la continuidad offline: qué pasa a media venta, qué sigue funcionando, qué no es instantáneo, qué pasa con el correlativo, qué se pierde y qué no, cuál es la condición y qué pasa si el equipo se daña.

**Qué NO se toca:**
- Las seis páginas existentes ni sus suites.
- `assets/site.css` y `site.js`, salvo patrones que ya son sistema (spine, breadcrumb, `faq-cell`, `demo-tag`). Patrones nuevos → `<style>` de la página.
- El producto (`apps/`). Solo sitio web.

**Comandos:**
```
node --test scripts/__tests__/nhilos-sin-internet-artboard.test.mjs
node --test scripts/__tests__/nhilos-home-artboard.test.mjs
node scripts/build-nhilos-web.mjs
```

**Cómo trabajar (no negociable):** test-first con RED probado; verificá el artefacto y no el mensaje de tu script; **ninguna capacidad sin evidencia**; no inventes material; el brief manda.

---

## Specs

### S1. Página, ruta y fuente de verdad
Ruta `/software-pos/sin-internet/`; fuente `design/nhilos-web-foundation/11-sin-internet.html`; salida `dist/nhilos-web/software-pos/sin-internet/index.html`. **Ojo con la profundidad de la ruta:** es una página **hija del hub**, así que el build debe emitirla en `software-pos/sin-internet/index.html` y las referencias relativas del artboard resuelven distinto a las de una página de primer nivel. El build absolutiza `assets/`, `media/` y `fonts/` y falla si queda una referencia relativa: no lo desactives. Entrada en `PAGES` con `url: "/software-pos/sin-internet/"`; registro en `design.json`.

### S2. Tono y regla de honestidad (verbatim del brief §7.3)
> **La regla de honestidad manda sobre el marketing:** cada lista "qué sí / qué no" se verifica contra el clip y la operación antes de publicar, y **lo no instantáneo se dice con la misma claridad que lo que sí funciona.**

### S3. Keywords: una primary y dueños explícitos
- **Primary:** `sistema POS sin internet para restaurante` — **literal en el H2 de segmentos, nunca en el H1 ni en el title** (regla del sitio: el segmento en la puerta de entrada solo en la página que lo posee; esta página es de capacidad).
- Secundarias: `POS sin internet`, `punto de venta sin internet`, `sistema POS offline`, `sistema POS que funcione sin internet en Nicaragua`.
- **Informativa dueña aquí:** `cómo funciona un POS offline` — el mecanismo es territorio exclusivo de esta página; ninguna otra URL lo explica completo.
- **NO persigue, con dueño:** segmentos → `/software-pos/restaurantes/` y `/software-pos/food-parks/`; `facturación DGI` → `/facturacion-dgi/` (aquí solo la línea del correlativo); `cierre de caja`, `arqueo` → `/software-pos/caja/`; `kit`/`terminal`/batería → `/software-pos/hardware/`; `local vs nube`, `comparativa` → `/comparativas/`; `precio`, `cotización` → `/precios/`; `demo` → `/demo/`.

### S4. Respuesta rápida en los primeros 150 px
> Cuando la red se cae, la venta se completa en la terminal: cobra en córdobas o dólares, emite el ticket con su correlativo consecutivo y queda registrada. Al volver el internet, todo llega al panel web en orden, sin duplicar. La condición: la terminal quedó configurada con tu catálogo.

Fijate que la condición **ya aparece en la primera pantalla**: eso es deliberado y no se puede posponer al final.

### S5. H1 (neutro, decidido 2026-11-20)
`Sistema POS sin internet: qué pasa cuando la red se cae, paso a paso`

### S6. Jerarquía: 8 H2 y 2 H3, verbatim y en este orden
1. `Sistema POS sin internet para restaurante, cafetería, food park o mostrador`
2. `¿Qué pasa cuando se cae el internet a media venta?`
   - H3: `Qué sigue funcionando sin conexión`
   - H3: `Qué no es instantáneo (y cuándo llega)`
3. `¿Y la facturación sin internet? El correlativo no se rompe`
4. `¿Se pierden las ventas mientras no hay internet?`
5. `La condición honesta: la terminal quedó configurada con tu catálogo`
6. `¿Y si se daña la terminal?`
7. `Preguntas frecuentes sobre el POS sin internet`
8. `Solicita una demo y mira la contingencia con tu operación`

Contenido por sección: brief §7.4. Lo que no se puede omitir:
1 → una línea por caso sobre qué sigue funcionando sin red, cerrando con que **la mecánica es la misma y lo que cambia es la operación**.
2 → la escena del avatar (sábado 12:30, fila, red caída) resuelta en concreto; aquí va el clip real (S13).
   H3 "qué sigue" → lista verificable: cobro bimoneda, ticket con correlativo, catálogo cargado, registro local de la venta y del turno. **Cada ítem verificado o fuera.**
   H3 "qué no es instantáneo" → la sincronización es **eventual**: las ventas quedan en **la cola de salida del dispositivo** y llegan al panel al reconectar, en orden y sin duplicar; mientras no hay conexión **el panel no se actualiza y la gestión web queda en pausa**; **cada terminal opera por su lado** — la coordinación entre terminales sin conexión no es parte del sistema hoy.
3 → el correlativo sigue en la terminal sin saltos ni repeticiones y sincroniza en orden sin duplicar; la división mecánica/autorización es de `/facturacion-dgi/`.
4 → respuesta directa: la venta queda registrada primero en la terminal y sube al volver la red. **Sin "nunca pierdes una venta":** la fórmula es la venta **completada en la terminal**, con la condición de la sección 5.
5 → la continuidad aplica a **terminal enrolada y catálogo cargado**, en lenguaje del dueño: la terminal debe estar configurada a tu negocio y con su catálogo; eso lo valida la implementación antes de producción.
6 → se recupera enrolándola de nuevo y sincronizando el catálogo; las ventas que no llegaron están en la cola de salida del equipo. La pregunta de equipo y batería es de hardware.
7 → S10.
8 → demo con la contingencia en vivo + WhatsApp.

### S7. Profundidad
Puede exceder las ~120 palabras por H2 del hub: **es la única URL donde la contingencia se explica completa**. Cada bloque responde una pregunta del peor momento. El home condensa una línea y el hub una línea de orientación: **nada de lo que aquí se explique puede repetirse allí**.

### S8. Guardia de claims: 9 prohibiciones (verbatim del brief §7.5)
1. **"100% sincronizado" / "todo se sincroniza" / "instantáneo" / "tiempo real" — NO.** La sincronización es **eventual** (al reconectar, en orden, sin duplicar). El panel queda en pausa sin conexión: **dicho, no ocultado**.
2. **"Nunca pierdes una venta" / "cero pérdida" / "no paras nunca" — NO.** Manda la fórmula condicionada. Tampoco H1 absolutistas sin condición en el cuerpo.
3. **Coordinación entre terminales sin internet / cajas en red local — NO.** No es capacidad vigente (#994). La respuesta honesta del FAQ es **"no, hoy"**.
4. **"Funciona sin luz" / autonomía eléctrica — NO.** El apagón eléctrico **no** es el apagón de red: la terminal necesita energía. Nada de batería ni autonomía.
5. **"Facturación impresa" sin conexión / "imprime en cualquier ticketera" — NO.** Hoy solo imprime la impresora integrada Sunmi/iPOS (#983 abierto). El ticket que la página promete **es el de terminal integrada**.
6. **Mecánica fiscal ampliada — NO aquí.** El correlativo sin conexión y la sincronización en orden sí; anulación paso a paso, libros y tabla garantiza/corresponde son de `/facturacion-dgi/`.
7. **KDS y despacho a cocina sin conexión — NO.** No se vende (#993); en contingencia menos.
8. **Vocabulario interno — NO en texto visible.** **"Outbox" no existe para el lector:** la palabra aprobada es **"la cola de salida del dispositivo"**. "Enrolada" e "hidratado" solo con su traducción del dueño. Ni "entitlements", ni números de issue, ni "go-live".
9. **Datos no verificados — NO.** Cada ítem de las listas se valida contra clip u operación; **si no tiene evidencia, sale de la lista**.

**Y las heredadas del sitio:** "factura electrónica", "sistema autorizado por la DGI", "cero multas", "solución integral", "ecosistema", "transformación digital", precios de hardware o BYOD, y ninguna frase de roadmap.

### S9. FAQ: 7 preguntas + `FAQPage` en paridad celda por celda
1. `¿Cómo funciona un POS offline?` — el mecanismo en 3 líneas (la informativa dueña aquí).
2. `¿Se pierden las ventas sin internet?` — registradas en la terminal; suben al reconectar.
3. `¿Puedo facturar sin conexión?` — correlativo local + enlace al hub fiscal.
4. `¿Cuándo veo las ventas en mi panel?` — eventual, al reconectar, en orden.
5. `¿Funciona con varias terminales al mismo tiempo sin internet?` — **"no, hoy"**: cada terminal por su lado.
6. `¿Y si se va la luz?` — el apagón eléctrico no es el de red: la terminal necesita energía; sin prometer autonomía.
7. `¿Qué necesito para que funcione sin internet?` — la condición del enrolamiento y el catálogo cargado.

**Regla GEO heredada:** entidad y mercado en la primera frase. **Cada respuesta visible idéntica carácter por carácter al `text` del JSON-LD**; toda edición se replica en el mismo commit. **Cada respuesta lleva su límite.**

### S10. Meta
- **Title (≤60):** `POS sin internet en Nicaragua: qué pasa cuando cae la red` — **57 caracteres**, sin segmento.
- **Description (≤155):** `La venta se completa en la terminal: cobra, emite el ticket con su correlativo y sincroniza al reconectar, en orden. Mira cómo funciona sin internet.` — **149**.
- `og:title`/`og:description` espejados; `canonical` = `https://nhilospos.com/software-pos/sin-internet/`.

### S11. Ninguna captura por defecto salvo las dos asignadas
El brief define la prueba como clip real + badge de sincronización. **No agregues una tercera "para llenar"**, y **no uses las dos grabaciones sin auditar** que existen en `media/` (`pos_offline_live_loop.mp4`, `pos_offline_narrative_loop.mp4`): no están auditadas y no se publican sin abrirlas y ver qué muestran.

### S12. El "simulador offline del artboard" **no existe**
El brief §7.1 lo menciona como material reutilizable. **Verificado: no hay simulador offline en el sitio** (el home muestra un clip, no un componente interactivo). Por lo tanto:
- **No es requisito.** La página se construye con las dos piezas reales de S13.
- Si alguien decide construirlo, pasa por el criterio de siempre: se puede **nombrar**, muestra un **cambio de estado** (red caída → venta cobrada → sincronizada), es **legible a 360 px**, y si quitarlo no pierde información, se quita. Además es un componente interactivo nuevo: **no** se introduce sin autorización.

### S13. Evidencia real auditada (leída fotograma a fotograma)
| Sección | Archivo | Duración / dims | Lo que se ve **literalmente** | Lo que **no** prueba |
|---|---|---|---|---|
| H2 2 (la escena) | `media/pos_offline_venta_exitosa.30ccc3cc.mp4` (+ `pos_offline_venta_exitosa_poster.ea6487ab.webp`) | 4,96 s | Catálogo con "Total: C$ 95.00 · 1 producto agregado"; **badge naranja de cola con "2"**; al final, barra verde **"Venta procesada con éxito"** | **no** muestra la sincronización; la barra de estado **no es legible** a tamaño publicado (ver abajo) |
| H2 2 / H3 "qué no es instantáneo" (sincronización) | `media/pos_offline_cola_sync_loop.97aa1094.mp4` (14,73 s) y su poster `pos_offline_cola_sync_poster.cf458b78.webp` | composición editada | Icono **verde de nube con check** y el rótulo **"06 · SINCRONIZADO — Se sincronizó sola · Nadie tocó nada"** | es una **pieza editada con rótulos propios**, no una grabación cruda: sus captions son afirmaciones ya escritas, no evidencia neutra |

**Regla crítica de la barra de estado:** en el clip de la venta, los indicadores de red aparecen tachados, pero **a 390 px no se leen**. Por eso **la prueba de "sin red" no es la barra de estado**: es el **badge de cola con 2 pendientes junto a una venta exitosa**. El `alt` describe eso. **Prohibido escribir que la captura muestra "sin señal"**, porque en el tamaño publicado el usuario no puede comprobarlo.

**El clip de sincronización ya se usa en el home** (`#offline`). Reusarlo aquí en **movimiento** repetiría el mismo material en dos páginas. Preferencias, en orden: **1)** usar el **poster** (una imagen) para el momento de sincronización y reservar el movimiento para la escena de la venta; **2)** si se usa el clip, el rótulo horneado obliga al epígrafe a ser coherente con él, y hay que declararlo.

**Etiquetas de honestidad:** toda pieza lleva su etiqueta. Para la grabación de la venta: **"Grabación real de la terminal · datos de demostración"**. Para la pieza editada de sincronización: **"Grabación real editada · datos de demostración"** — la palabra *editada* no es opcional cuando la pieza trae rótulos.

### S14. Enlazado interno
**Saliente:** `/software-pos/` (breadcrumb + `BreadcrumbList`), `/facturacion-dgi/` (el correlativo es fiscal), `/software-pos/restaurantes/` y `/software-pos/food-parks/` **como texto plano con comentario** (no existen todavía), `/software-pos/hardware/` (texto plano), `/precios/`, `/demo/` (CTA primaria). Cero enlaces rotos.

### S15. Medición (nombres exactos)
`offline_llega_escena`, `offline_listas_lee`, `faq_offline_abre`, `cta_demo_offline`, `cta_whatsapp_offline` (UTM `utm_medium=sin-internet`). Sin analítica instalada: solo `data-event`, sin scripts de terceros.

### S16. Estructura técnica compartida
Shell de las seis páginas: `<head>`, spine, breadcrumb `Inicio / Software POS / Sin internet`, volver arriba, footer, WhatsApp. JSON-LD con `FAQPage`, `BreadcrumbList` (3 niveles) y `Organization`. Tokens solo existentes. Reveal con el patrón del sitio y **visible sin JS**.

### S17. Patrones de sección: inventar, no repetir
Ya usados (**no repetir**): hero con fork, ledger, banda comparativa, cinta de precio, líneas de tarifa, tabla de planes, fichas de plan, banda de riesgo, pares asegurados, tira de setup, píldoras de hardware, escalera, secuencia de anulación, tres capas normativas, tabla de división, fórmula del costo, par merma teórica/física, tabla de packs, proceso en tres pasos.
`faq-cell` y `demo-tag` **sí** se reutilizan. Candidatos propios: **línea de tiempo del peor momento** (12:30 red caída → venta cobrada → reconexión → panel actualizado), **dos columnas "qué sigue / qué no es instantáneo"** (el par de honestidad, que es el corazón de la página), **condición con casilla** (terminal enrolada + catálogo cargado). Nombralo en el commit.

### S18. Suite propia, mínimo 26 guardias
1. H1 verbatim y **sin segmento**. 2. Los 8 H2 verbatim y en orden. 3. Los 2 H3 verbatim. 4. Title/description con límites. 5. Canonical + `og:title`. 6. Respuesta rápida en los primeros 150 px **incluyendo la condición**. 7. Las 9 prohibiciones ausentes. 8. Claims heredados ausentes. 9. **Cero "100%", "instantáneo", "tiempo real", "todo se sincroniza"**. 10. **Cero "nunca pierdes", "cero pérdida", "no paras"**. 11. **"Outbox" ausente**; "cola de salida del dispositivo" presente. 12. Paridad `FAQPage` celda por celda. 13. Las 7 preguntas en orden. 14. La respuesta de multi-terminal dice **"no, hoy"** (o equivalente explícito), nunca "sí". 15. La sección de luz distingue apagón eléctrico de apagón de red. 16. El `alt` de la venta **no afirma "sin señal" ni "sin internet" desde la barra de estado**; describe el badge de cola y la barra de éxito. 17. Etiqueta "datos de demostración" en cada pieza, con **"editada"** donde corresponda. 18. Ninguna pieza sin auditar referenciada (`pos_offline_live_loop`, `pos_offline_narrative_loop`). 19. Rutas relativas en el artboard. 20. `faq-cell`/`demo-tag` reutilizados y sin patrones repetidos. 21. Todo `var(--*)` existe. 22. Cero rayas (—). 23. Voz: cero narración de sitio. 24. Vocabulario interno prohibido. 25. `PAGES` con la ruta de **tres niveles** + `design.json`. 26. Sin nombres de personas; WhatsApp y CTA como las demás.

### S19. Voz y estilo
El copy habla de la operación del lector, nunca del sitio. Cero rayas. Cero vocabulario interno. `BOM` fuera del visible. **IVA:** si aparece, es el del cliente (su régimen), nunca una afirmación sobre nuestro precio. Nada que suene a hoja de ruta.

### S20. Accesibilidad y móvil
Objetivos ≥44×44 (el spine ya lo resuelve). Contraste AA. Un clip tiene un `poster` y `preload="metadata"`; con `prefers-reduced-motion`, **sin reproducción automática** y con el poster visible. Bandas medidas, no asumidas. Reveal `threshold: 0` + `rootMargin '0px 0px -8% 0px'`.

### S21. Rendimiento
Solo se publica el media referenciado. El clip está en 328 KB: no lo reemplaces por un render nuevo ni agregues un tercero.

### S22. Test-first
Cada guardia nace roja contra un defecto real. En el reporte: por guardia, qué falló y por qué.

### S23. Build
El build **debe** fallar si falta un asset, si una hoja no está hasheada o si una página publicada conserva referencias relativas. **No publiques** sin autorización.

### S24. Commits
Conventional Commits en inglés, ~400 líneas por unidad, código + tests + doc juntos.

### S25. Definición de terminado
1. Artboard con 8 H2 y 2 H3. 2. Suite propia verde con RED probado. 3. Las seis suites existentes verdes (home 24, hub 36, precios 25, fiscal 27, inventario 26, demo al publicarse). 4. Build sin fallar y la ruta de **tres niveles** emitida. 5. `PAGES` y `design.json` actualizados. 6. Las dos piezas auditadas, con etiqueta y `alt` que no exceda lo que muestran. 7. Reporte de cierre con lo omitido y su spec.

---

## Tasks

| ID | Specs | Ruta | Commit sugerido |
|---|---|---|---|
| T1 | S1, S16 | Artboard con shell, spine, breadcrumb de 3 niveles, tokens; `PAGES` + `design.json`; suite vacía | `feat(web): scaffold the offline page artboard` |
| T2 | S5, S6, S3 | H1 neutro, H2 1 de segmentos y H2 2 (la escena) con el clip auditado | `feat(web): the offline scene with real footage` |
| T3 | S6, S8 | Los dos H3 del par honestidad (qué sigue / qué no es instantáneo) | `feat(web): what keeps working and what is not instant` |
| T4 | S6, S8 | H2 3, 4 y 5: correlativo, pérdida y la condición | `feat(web): correlativo, sales and the honest condition` |
| T5 | S6, S12 | H2 6 (terminal dañada) y H2 8 (CTA), sin simulador | `feat(web): damaged terminal and demo close` |
| T6 | S9, S10 | FAQ de 7 + `FAQPage` en paridad + meta + breadcrumb schema | `feat(web): offline FAQ with schema parity` |
| T7 | S18 | Suite completa, cada guardia en RED | `test(web): offline page guard suite` |
| T8 | S20, S21, S23 | Móvil medido, reduced-motion, build, capturas a 1440 y 390 | `fix(web): offline page mobile bands and build` |
| T9 | S25 | Reporte de cierre | — |

---

## Lo que se va a revisar (checklist del padre)

1. Los 8 H2 y 2 H3 **contra el brief**, palabra por palabra.
2. Que **no** haya entrado ninguna forma de "instantáneo", "100%", "tiempo real" ni "todo se sincroniza", **incluidos sinónimos** ("al toque", "automático y al instante").
3. Que la condición (terminal enrolada + catálogo cargado) esté en la primera pantalla **y** en el cuerpo.
4. Que la multi-terminal diga **no** con claridad y sin "próximamente".
5. Que la sección de luz **separe** apagón eléctrico de apagón de red.
6. **Voy a abrir las dos piezas** y compararlas con su `alt` y su epígrafe.
7. Que el `alt` de la venta no afirme "sin señal" desde la barra de estado.
8. Que el poster se use donde corresponde y el clip donde aporta.
9. Que la suite cace defectos inyectados: voy a colar un "instantáneo", un "nunca pierdes una venta" y un "outbox".
10. Que las 138 guardias existentes sigan verdes y que la ruta de tres niveles resuelva sus assets.

---

## Log

- **L1.** Pedido del fundador, verbatim: *"Preparalo ya"* — tras la auditoría de encasillamiento (v2.5 del brief), que ya dejó el H1 y el title de esta página corregidos. Implementación fuera de esta sesión (Antigravity) y revisión posterior con defectos inyectados, como las tres anteriores.
- **L2.** Mapeo de la guía SEO de 7 pasos: **1 avatar** → peor momento (sábado 12:30, fila, red caída) = S2, S6; **2 keywords** → S3 con la primary en el H2 de segmentos y la informativa `cómo funciona un POS offline` como territorio propio; **3 arquitectura** → S1 (ruta de **tres niveles**, primera del sitio), S14; **4 encabezados** → S6, en el orden del peor momento; **5 contenido** → S7, S8; **6 FAQ para LLMs** → S9, cada respuesta con su límite; **7 prototipo + schema** → S16, S17 + paridad de S9.
- **L3.** **Auditoría de las piezas antes de escribir** (lección L9 del home). `pos_offline_venta_exitosa` (4,96 s): la escena termina en **"Venta procesada con éxito"** con el **badge de cola en "2"**; no muestra la sincronización. `pos_offline_cola_sync_loop` (14,73 s): es una **pieza editada** con rótulo horneado **"06 · SINCRONIZADO — Se sincronizó sola · Nadie tocó nada"**, no una grabación cruda.
- **L4.** **La barra de estado no sirve como prueba.** Los indicadores de red aparecen tachados en el clip, pero **no se leen a 390 px**. La prueba honesta de "sin red" es el badge de cola con 2 pendientes junto a una venta exitosa. Escribir "la captura muestra sin señal" sería afirmar algo que el lector no puede comprobar en pantalla: el mismo defecto que el epígrafe del lote de leche en `/inventario/`.
- **L5.** **El "simulador offline" del brief no existe.** Verificado: no hay componente interactivo offline en el sitio; el home usa un clip. Se retira de los requisitos y, si alguien lo quiere construir, pasa por el criterio de 4 pruebas y por autorización (es un componente nuevo).
- **L6.** El clip de sincronización **ya lo usa el home** en `#offline`. Regla: el movimiento se reserva para la escena y el momento de sincronización va con el **poster**; si se usa el clip, su rótulo horneado obliga a que el epígrafe sea coherente y la etiqueta diga **"editada"**.
- **L7.** Dos piezas de `media/` **no están auditadas** (`pos_offline_live_loop.mp4`, `pos_offline_narrative_loop.mp4`). No se usan sin abrirlas y ver qué muestran; la guardia 18 falla si aparecen referenciadas.
- **L8.** Esta es la **primera página del sitio en una ruta de tres niveles** (`/software-pos/sin-internet/`). El build ya absolutiza `assets/`, `media/` y `fonts/` y falla ante una referencia relativa, pero es el primer caso donde la profundidad de la URL podría morder de nuevo: está declarado como riesgo en S1 y verificado en la guardia 25.
