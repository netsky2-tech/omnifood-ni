# Auditoría externa del sitio web NHILOS POS

**Dominio:** nhilospos.com  
**Versión:** 1.0  
**Baseline de medición:** 2026-11-20, 23:20–00:10 (America/Managua)  
**Alcance:** las 9 páginas públicas del sitio  
**Assets del baseline:** `/assets/site.6f196a9a75.css` (44 853 B), `/assets/site.114c60a775.js`  
**Método:** navegación real en Chromium 1243 (build de Playwright), con viewports 320/360/390/430 y 1440 px, DPR 1–3, caché deshabilitada, perfiles de red Fast 3G (150 ms RTT / 1.6 Mbps) y Slow 3G (400 ms RTT / 400 kbps). Sin datos de campo (CrUX/Lighthouse RUM): todas las cifras son de laboratorio y reproducibles.

---

## 0. Nota de baseline: el sitio cambió durante la auditoría

Entre la primera captura y la medición final se detectó un redeploy. Varios hallazgos de la fase de exploración ya están corregidos en producción y **no** figuran como problemas abiertos en este informe. Se dejan registrados para que no se vuelvan a auditar y para que quede la evidencia de que alguien está ejecutando cambios en paralelo.

| Ítem | Antes (captura inicial) | Estado en el baseline |
|---|---|---|
| `/precios/` en móvil | `scrollWidth` 521 px en 320/360/390/430 (la página entera se dibujaba al ~75 %) | Exacto en los 4 viewports |
| Canonical del home | `https://www.nhilospos.com/` | `https://nhilospos.com/` |
| HSTS | Ausente | `max-age=31536000; includeSubDomains` |
| CSP | Ausente | Hash-based, `frame-ancestors 'self'`, `object-src 'none'` |
| X-Frame-Options / COOP / CORP | Ausentes | `SAMEORIGIN` / `same-origin` / `same-origin` |
| `/precios/`: "La entrada incluye una terminal táctil" | Contradecía el resto de la página | Eliminado |
| `/demo/`: el food park "ve la operación desde el panel web" | Contradecía `/software-pos/food-parks/` | Reescrito |
| Rutas crudas "(/implementacion/, en preparación)" | Visibles en texto | Eliminadas |
| Tag "Vende lo que compra" | Error gramatical | "Mostrador y reventa" |

Consecuencia práctica: **cualquier informe previo a este baseline está vencido**. El plan de acción de la sección 12 parte del estado actual, no del histórico.

---

## 1. Resumen ejecutivo

El sitio está por encima de la media del mercado local en dos dimensiones que casi nadie trabaja: **rigor normativo** (facturación DGI e inventario se explican separando norma, práctica y estado real del sistema) y **disciplina de front-end** (una sola CSS, cero dependencias de terceros en el camino crítico, JS propio de ~5 KB gzip, CLS ≤ 0.02, TBT ≤ 39 ms). No es un sitio genérico hecho con plantilla.

Los problemas que quedan son tres, en orden de costo para el negocio:

1. **Peso de fuentes (P1).** El 57–74 % de cada página son tipografías, y nueve de los archivos son copias idénticas de tres. Es el único problema serio de performance y se corrige en una tarde.
2. **Capa de copy sobreoptimizada (P1).** La FAQ repite lo que el cuerpo ya respondió y 47 de 64 respuestas arrancan con la fórmula "En Nicaragua,". Eso diluye la ventaja real del producto y lee robótico justo en las páginas que deben convertir.
3. **Detalles de accesibilidad y consistencia (P2).** El menú de escritorio no se abre con teclado, el riel lateral consume los primeros 12 tab-stops sin mostrar su etiqueta al enfocar, el menú móvil no cambia de icono ni bloquea el scroll, y dos páginas no tienen animación de entrada.

Veredicto: **listo para tráfico, no listo para escalar inversión en pauta** hasta resolver fuentes y copy.

### Tabla de severidad

| ID | Hallazgo | Sev. | Esfuerzo | Impacto |
|---|---|---|---|---|
| F-01 | 9 archivos de fuente = 3 únicos (≈220 KB duplicados por visita) | P1 | Bajo | Alto |
| F-02 | Los videos arrancan sin mirar la red; se abortan a los 20–25 s en 3G | P1 | Bajo | Alto |
| F-03 | FAQ duplicada + prefijo "En Nicaragua," en 47 de 64 respuestas | P1 | Medio | Alto |
| F-04 | `/software-pos/restaurantes/`: 4 frases rotas por enlaces eliminados ("…completos en.") | P1 | Bajo | Medio |
| F-05 | `logo.png` de 2160² renderizado a 32² (90 KB) | P2 | Bajo | Medio |
| F-06 | Nav de escritorio inaccesible por teclado (`.nav-group-label` es un `<span>`) | P2 | Bajo | Medio |
| F-07 | Capturas ilegibles: 1440×900 dibujado a 487×304; 1080×2316 a 228×487; sin zoom | P2 | Medio | Alto |
| F-08 | Hero de 402×811 px para 260×525 CSS (borroso en pantallas 2x) | P2 | Medio | Medio |
| F-09 | Home duplica el modelo de precios completo (3 veces el mismo dato) | P2 | Medio | Medio |
| F-10 | Riel lateral: 12 tab-stops sin etiqueta visible al enfocar | P3 | Bajo | Bajo |
| F-11 | Menú móvil: icono estático y sin bloqueo de scroll | P3 | Bajo | Bajo |
| F-12 | `access-control-allow-origin: *` en respuestas HTML | P3 | Bajo | Bajo |
| F-13 | Sin SPF; sin CAA; sin DNSSEC (DMARC sí existe) | P2 | Bajo | Medio |
| F-14 | Comentarios internos ("CLAIM GUARD", "pending route") en HTML público | P3 | Bajo | Bajo |
| F-15 | `media/` con 19.7 MB de archivos que ninguna página referencia | P3 | Bajo | Bajo |
| F-16 | Sin `srcset`/AVIF en ninguna imagen | P2 | Medio | Medio |
| F-17 | Motion inconsistente: `food-parks` con 0 animaciones de entrada | P3 | Bajo | Bajo |
| F-18 | Formulario de demo: si falla el JS, envía nombre y teléfono por GET | P3 | Bajo | Bajo |

---

## 2. Metodología y limitaciones

**Instrumentos.** Chromium headless (Playwright 1243) controlado con `puppeteer-core` 23.11.1; CDP `Network.emulateNetworkConditions` + `Network.setCacheDisabled`; `PerformanceObserver` para LCP/CLS/long tasks; medición de bytes con `Network.loadingFinished.encodedDataLength`.

**Escenarios.**

- Móvil: 390×844, DPR 3, `isMobile`, `hasTouch` (equivalente a un gama media Android).
- Móvil pequeño: 320/360/430 px para overflow.
- Escritorio: 1440×900, DPR 1.
- Red: Fast 3G y Slow 3G con latencia real; sin throttling de CPU (el objetivo era aislar el peso de bytes, no el costo de parseo).

**Limitaciones declaradas.**

- Sin datos de campo (CrUX, Search Console). No se afirma nada sobre Core Web Vitals de usuarios reales.
- No se ejecutó un lector de pantalla real; la evaluación de a11y es por inspección de DOM, orden de tabulación efectivo y cálculo de contraste.
- `dig` no está instalado en el host: las consultas DNS se hicieron por DNS-over-HTTPS (Google Resolver).
- Las zonas con gradiente o textura no se pudieron medir por contraste automático; se revisaron visualmente.
- El sitio se editó durante la auditoría; ver sección 0.

---

## 3. Mapa del sitio y arquitectura de información

| Ruta | H1 | Secciones | CTA primaria del hero | Schema |
|---|---|---|---|---|
| `/` | El POS que sigue vendiendo cuando el internet se cae | 15 | Solicitar una demo | Organization, SoftwareApplication, FAQPage |
| `/software-pos/` | Sistema POS en Nicaragua: el control de tu venta, a la medida de tu negocio | 9 | Solicitar una demo con tu operación real | Organization, Breadcrumb, FAQPage |
| `/precios/` | Precio de un sistema POS en Nicaragua: planes desde US$49 al mes | 12 | Solicitar una demo por WhatsApp | Organization, Breadcrumb, FAQPage |
| `/facturacion-dgi/` | Sistema de facturación DGI en Nicaragua: la mecánica que exige la DT 09-2007 | 11 | Ver división de responsabilidad (ancla) | Organization, Breadcrumb, FAQPage |
| `/inventario/` | Sistema de inventario en Nicaragua: cada venta descuenta lo que consumió | 9 | Ver cómo sale el costo (ancla) | Organization, Breadcrumb, FAQPage |
| `/demo/` | Demo de NHILOS POS: qué recibes y cómo se coordina | 9 | Completar datos para la demo | Organization, Breadcrumb, FAQPage |
| `/software-pos/sin-internet/` | Sistema POS sin internet: qué pasa cuando la red se cae, paso a paso | 9 | Solicitar una demo | Organization, Breadcrumb, FAQPage |
| `/software-pos/restaurantes/` | Sistema POS para restaurante: cada plato vendido descuenta sus ingredientes | 8 | Solicitar una demo con tu menú | Organization, Breadcrumb, FAQPage |
| `/software-pos/food-parks/` | Software para food park: tu puesto con su catálogo, su cobro y su factura | 9 | Solicitar una demo | Organization, Breadcrumb, FAQPage |

**Observaciones de arquitectura.**

- La jerarquía es correcta: producto → precio → dos pilares de cumplimiento (DGI, inventario) → dos segmentos → demo. El menú repite ese orden y no hay callejones sin salida.
- El home es la página más larga (**20 472 px en móvil = 24 pantallas de 844 px**). En datos móviles, a 400 kbps, eso es una visita que dura minutos.
- Las páginas de segmento (`restaurantes`, `food-parks`) son las más pesadas en copy y las que menos CTA ofrecen en el cuerpo.
- El blog/guías no existe todavía: hay rutas pendientes comentadas en el código (`/software-pos/caja/`, `/inventario/restaurantes/`, `/software-pos/multisucursal/`). Ver F-04.

---

## 4. Contenido y copy

### 4.1 Lo que está bien (no tocar)

- **El marco normativo está resuelto con un nivel que no se ve en el mercado local.** `/inventario/` separa explícitamente "Norma (obligación del negocio)", "Práctica de rubro" y "Estado actual del sistema", cita Ley 822 art. 44, Reglamento art. 33 y NIC 2 §23-25, y reconoce lo que el sistema **no** hace: "Hoy el sistema no registra autorizaciones escritas de cambio de método ni genera las hojas firmadas del inventario físico anual". Eso es exactamente lo que exige `docs/inventario_marco_normativo.md` (R-01..R-07) y es un activo comercial.
- **Honestidad operativa.** "En evaluación · no prometido" para impresión externa; "no, hoy la coordinación entre varias terminales sin conexión no forma parte del sistema actual"; la demo se coordina sin presión comercial. Esto construye confianza mejor que cualquier superlativo.
- **Voz concreta.** Casi no hay adjetivos vacíos. Las frases hablan de turnos, arqueos, correlativos, merma. Es el tono correcto para un dueño de negocio que decide con el contador al lado.

### 4.2 Sobreoptimización SEO: "En Nicaragua"

Conteo en el baseline:

| Página | "Nicaragua" | Preguntas FAQ | Respuestas con prefijo "En Nicaragua," / "Sí: en Nicaragua," / "No: en Nicaragua," |
|---|---|---|---|
| `/demo/` | 19 | 7 | 4 |
| `/facturacion-dgi/` | 30 | 7 | 7 |
| `/precios/` | 23 | 7 | 7 |
| `/inventario/` | 23 | 7 | 7 |
| `/software-pos/food-parks/` | 20 | 6 | 6 |
| `/software-pos/restaurantes/` | 24 | 7 | 7 |
| `/software-pos/sin-internet/` | 22 | 7 | 5 |
| `/software-pos/` | 29 | 6 | 4 |
| `/` | 35 | 10 | 0 |
| **Total** | **225** | **64** | **47** |

**Problema.** El patrón "En Nicaragua, …" al inicio de cada respuesta es un molde mecánico. Se lee como texto escrito para un robot, y Google dejó de premiar la densidad de keyword hace años: hoy la repetición exacta es más riesgo de calidad que ventaja.

**Regla propuesta.** Una de cada tres respuestas menciona el país; el resto habla del negocio, del turno, del contador. Mantener "Nicaragua" en `<title>`, `<h1>`, primer párrafo y una sola FAQ por página. El resto, sin prefijo.

### 4.3 Duplicación cuerpo → FAQ

En casi todas las páginas la sección de preguntas frecuentes vuelve a preguntar lo que el cuerpo ya respondió con más detalle. Ejemplos verificados:

| Página | Pregunta del FAQ | Ya respondida arriba |
|---|---|---|
| `/demo/` | "¿Cuánto dura?" / "¿Necesito preparar algo?" / "¿Qué pasa después?" / "¿Con qué datos se muestra?" | El cuerpo tiene secciones con esos mismos títulos y respuestas más largas |
| `/precios/` | "¿Qué incluye el precio?" y "¿El hardware está incluido?" | Ya están en las tarjetas de plan y en la nota de condiciones |
| `/inventario/` | "¿Cómo descuenta el inventario al vender?" | Es el `lead` y la primera sección |
| `/software-pos/` | "¿Qué es un sistema POS…?" | Es el H2 de la sección anterior |

**Problema.** El lector recorre la página, entiende, y al final encuentra una versión resumida de lo mismo. Además alarga el home y las páginas de dinero justo antes del CTA.

**Regla propuesta.** La FAQ solo responde objeciones que el cuerpo no cubre (precio final, contrato, datos, soporte, migración, hardware, contador) y enlaza al cuerpo cuando la respuesta ya está. Si la pregunta está en el cuerpo, se elimina del FAQ.

### 4.4 El modelo de precios aparece tres veces en el home

El home incluye planes, packs, add-ons, condiciones y una FAQ que repite las cifras. Resultado: el bloque de planes aparece tres veces en `/`, y en `/precios/` el precio se repite 17 veces («US$49») y 22 veces («US$149»). Para el usuario, el home deja de tener un motivo para visitar `/precios/`; para el negocio, se multiplican los lugares donde un precio desactualizado puede quedar huérfano.

**Propuesta.** El home muestra la escalera (desde US$49/mes), una frase de qué incluye y un CTA a `/precios/`. El detalle de packs, add-ons y condiciones vive solo en `/precios/`. Un solo lugar que actualizar.

### 4.5 Errores puntuales verificados

| Ubicación | Texto visible | Problema |
|---|---|---|
| `/software-pos/restaurantes/` | "Valuación, conteos físicos y control de merma se trabajan completos en." | Frase rota: se eliminó el enlace y quedó el "en" (fuente: `design/nhilos-web-foundation/12-restaurantes.html:1304`) |
| `/software-pos/restaurantes/` | "El cierre de caja detallado se amplía en la guía de cierre de caja y arqueo." | Pierde el destino del enlace (`12-restaurantes.html:1232`) |
| `/software-pos/restaurantes/` | "…la posee tu negocio como contribuyente." / "…se evalúa aparte en su alcance correspondiente." | Igual: enlaces eliminados, frases sin destino (`:1402`, `:1428`) |
| Todo el sitio | "ver planes y precios de NHILOS POS ." | Espacio antes del punto final; 25 casos, la mayoría después de enlaces en línea |
| Todo el sitio | `<!-- pending route: /inventario/restaurantes/ -->` y similares | 34 marcas internas viajan al HTML público |
| `/software-pos/sin-internet/` | "Guías dedicadas por segmento: restaurante y food park ." | Quedó el espacio doble tras quitar los enlaces |
| `/software-pos/` | Hero: "Punto de venta local-first · Nicaragua" | Jerga en inglés en el eyebrow principal |

**Nota sobre el hero del home.** "local-first" aparece entre 2 y 10 veces por página. El comprador objetivo (pulpería, cafetería, food park) no lee "local-first": lee "funciona sin internet". Mantener el término en la página técnica o en el pie, y usar el beneficio en el H1/eyebrow.

### 4.6 Densidad y longitud

- Home: 2 113 palabras visibles. Es aceptable para una landing, pero con el 20 472 px móviles el usuario necesita más anclas de escaneo y menos párrafos de 100 palabras.
- `/inventario/`: el párrafo de "Estado actual del sistema" supera las 110 palabras y contiene tres ideas jurídicas distintas. Es el párrafo más importante de la página y el más difícil de leer. Partirlo en tres viñetas.
- Los `h2` de `/precios/` son 11 y compiten entre sí; tres de ellos podrían ser `h3` dentro de una misma sección.

---

## 5. Conversión

| Página | CTA primaria | CTA secundaria | Comentario |
|---|---|---|---|
| `/` | Solicitar una demo | Ver cómo funciona | Correcto |
| `/software-pos/` | Solicitar una demo con tu operación real | Hablar por WhatsApp | Correcto |
| `/precios/` | Solicitar una demo por WhatsApp | Ver el sistema en detalle | Correcto |
| `/facturacion-dgi/` | **Ver división de responsabilidad** (ancla) | Ver paso a paso de anulación | La demo queda al final de la página |
| `/inventario/` | **Ver cómo sale el costo** (ancla) | Ver el marco legal | Igual |
| `/demo/` | Completar datos para la demo | Escribir directo por WhatsApp | Correcto |
| `/software-pos/sin-internet/` | Solicitar una demo | Escribir por WhatsApp | Correcto |
| `/software-pos/restaurantes/` | Solicitar una demo con tu menú | Escribir por WhatsApp | La primaria usa `btn-on-dark` sobre fondo claro: revisar contraste real |
| `/software-pos/food-parks/` | Solicitar una demo | Hablar por WhatsApp | Correcto |

**Hallazgo.** Las dos páginas de cumplimiento (facturación e inventario) —que son las que reciben búsquedas de mayor intención y las que un contador va a leer— no ofrecen la demo en el hero. El visitante tiene que recorrer 10 secciones para encontrar el CTA.

**Propuesta.** Regla única: **una CTA primaria por página, siempre "Solicitar una demo" (WhatsApp)**, y una secundaria que sea ancla interna. En las páginas de cumplimiento, la primaria puede ser "Revisar mi caso con un especialista".

**Otros puntos de fuga.**

- Home: 4 tarjetas de segmento, solo 2 son enlaces (`restaurantes`, `food-parks`). Las otras dos parecen clicables y no lo son.
- La frase "ver planes y precios de NHILOS POS" se repite 17 veces como texto de enlace idéntico. Además de ser malo para SEO (anchor text sobreoptimizado), es un callejón sin salida para lectores de pantalla que navegan por enlaces.

---

## 6. Motion, video y capturas

### 6.1 Inventario real de motion

No hay Three.js. No hay GSAP. Cero canvas. El movimiento del sitio es:

- Keyframes CSS: `heroMetaIn`, `bezelEnter`, `chipIn`.
- `.reveal` / `.stagger` con `IntersectionObserver` y `transition-delay: calc(var(--stagger-i) * 70ms)`.
- Un riel lateral (`spine`) con progreso de lectura.
- Videos `<video muted playsinline preload="metadata">` que arrancan por JS a los 1150 ms y se pausan entre sí.

| Página | Elementos con `reveal` | Videos | Animación de hero |
|---|---|---|---|
| `/` | 22 | 1 | Sí |
| `/software-pos/` | 16 | 2 | Sí |
| `/precios/` | 17 | 0 | Sí |
| `/facturacion-dgi/` | 17 | 0 | Sí |
| `/inventario/` | 17 | 1 | Sí |
| `/demo/` | 10 | 0 | Sí |
| `/software-pos/sin-internet/` | 8 | 1 | Sí |
| `/software-pos/restaurantes/` | 10 | 1 | Sí |
| `/software-pos/food-parks/` | **0** | 1 | **No** |

**Hallazgo.** `food-parks` no tiene ni una animación de entrada: es la única página que se siente "estática" al navegar desde el home. No es un bug, es una inconsistencia de producción.

### 6.2 Recomendación explícita: no agregar WebGL

La pregunta natural es "¿y si le metemos Three.js o GSAP para que se vea más premium?". Mi respuesta es **no**, por tres razones medibles:

1. La audiencia objetivo navega en Android de gama baja sobre 3G/4G limitada. Un bundle de Three.js son 150–600 KB y una GPU que esos equipos no tienen de sobra; el resultado sería un sitio que se ve peor (jank) justo en el mercado que se quiere conquistar.
2. El motion actual ya comunica lo que tiene que comunicar: entrada, jerarquía, progreso de lectura. No hay un problema narrativo que WebGL resuelva.
3. El costo de mantenimiento y el riesgo de regresión visual son altos para una web que hoy tiene CLS 0 y TBT de 0–39 ms.

Si se quiere "más lujo", el retorno está en otro lado: **capturas legibles, zoom, un video vertical bien comprimido y tipografía nítida**. Eso es lo que el usuario percibe como calidad.

### 6.3 Capturas: el problema no es el diseño, es la escala

Medición en `/software-pos/` a 1440 px:

| Figura | Caja | Imagen renderizada | Natural | `object-fit` |
|---|---|---|---|---|
| Captura de dashboard | 489×489 | 487×304 | 1440×900 | `contain` |
| Captura de terminal | 489×489 | 228×487 | 1080×2316 | `contain` |

- `.capture-media { aspect-ratio: 1/1 }` + `object-fit: contain` (`06-software-pos.html:227-228`) fuerza un cuadrado. Un dashboard 16:10 queda con ≈183 px de blanco repartidos arriba y abajo; una captura vertical de teléfono queda con ≈130 px de blanco a cada lado y se dibuja al 47 % del ancho disponible.
- En móvil el ratio cambia a `3/4` (`:229`), lo que mejora el teléfono pero empeora el dashboard.
- **No hay `lightbox`, zoom ni enlace a tamaño completo** en todo el sitio. La captura no se puede leer: el texto interno del dashboard se dibuja a ~5 px.
- Las cuatro capturas de `/software-pos/sin-internet/` comparten el mismo pie: "Captura real de la terminal · datos de demostración". Cuatro veces el mismo texto no aporta; cada pie debería decir qué se está viendo.

**Propuesta.** Contenedor con el ratio nativo de la imagen (16:10 para dashboard, 9:19.5 para teléfono), `object-fit: cover` solo si se recorta con intención, y un botón "Ampliar" que abra la imagen a tamaño completo. Una captura que no se lee no prueba nada.

### 6.4 Hero y logo

- `pos_hand_device_transparent.webp` mide **402×811 px** y se muestra a 260×525 CSS (`/`). En una pantalla 2x necesita 520×1050: se está **ampliando 1.29×**. En móvil se dibuja a 390 CSS de ancho, o sea 780 px físicos desde un original de 402: **1.94× de ampliación**. Por eso el texto de la pantalla del dispositivo se ve suave.
- `logo.png` es **2160×2160** y se dibuja a **32×32**: 90 KB por página para un favicon de header. Un SVG en línea o un WebP de 64×64 lo resuelve en ~2 KB.
- Ninguna imagen tiene `srcset`, `sizes` ni AVIF. Todo el sitio sirve WebP de tamaño único.

### 6.5 Video

- Los videos arrancan por JS a los 1150 ms **sin consultar la red** (`assets/site.js`, `armHeroVideo`). No hay chequeo de `navigator.connection.saveData` ni de `effectiveType`.
- Cuando el `IntersectionObserver` pausa un video, la descarga en curso se cancela: en 6 de 9 páginas aparecen `net::ERR_ABORTED` en los `.mp4`.
- En Slow 3G, `/software-pos/` tiene dos videos: uno ocupa el canal **20.2 s** y el otro **25.3 s** antes de abortarse con 0 bytes útiles. El evento `load` de esa página tarda **26.1 s**.
- Los posters existen y están bien hechos (720×1544, con el estado "EN COLA"). Ese es el activo que debería verse en 3G, no el video.

**Propuesta.** `preload="none"`, arranque solo si `effectiveType === '4g'` y no `saveData`, y nunca iniciar un video que se va a pausar por IO. El poster cubre el caso lento sin costo.

---

## 7. Performance

### 7.1 Números del baseline

**Fast 3G** (150 ms / 1.6 Mbps), caché fría:

| Página | FCP | LCP | load | KB | Req. | Fuentes | Imagen |
|---|---|---|---|---|---|---|---|
| `/` | 1.05 s | 1.47 s | 3.12 s | 447 | 14 | 257 | 159 |
| `/software-pos/` | 1.24 s | 1.94 s | 4.80 s | 533 | 15 | 340 | 161 |
| `/precios/` | 0.93 s | 1.40 s | 2.75 s | 461 | 13 | 340 | 90 |
| `/facturacion-dgi/` | 0.90 s | 1.37 s | 2.73 s | 462 | 13 | 340 | 90 |
| `/inventario/` | 0.96 s | 1.25 s | 3.82 s | 483 | 14 | 340 | 112 |
| `/demo/` | 0.70 s | 0.70 s | 2.34 s | 376 | 12 | 257 | 90 |
| `/sin-internet/` | 0.82 s | 0.82 s | 3.20 s | 425 | 13 | 257 | 139 |
| `/restaurantes/` | 0.76 s | 0.76 s | 3.73 s | 463 | 13 | 318 | 112 |
| `/food-parks/` | 0.68 s | 0.68 s | 3.69 s | 463 | 13 | 318 | 112 |

**Slow 3G** (400 ms / 400 kbps), caché fría:

| Página | FCP | LCP | load | KB |
|---|---|---|---|---|
| `/` | 2.95 s | 3.22 s | 11.60 s | 447 |
| `/software-pos/` | 2.76 s | 2.99 s | **26.10 s** | **872** |
| `/precios/` | 2.14 s | 2.37 s | 10.08 s | 461 |
| `/facturacion-dgi/` | 2.30 s | 3.35 s | 10.14 s | 462 |
| `/inventario/` | 2.58 s | 2.82 s | 12.48 s | 483 |
| `/demo/` | 1.51 s | 1.51 s | 8.41 s | 377 |
| `/sin-internet/` | 1.52 s | 1.52 s | 11.25 s | 425 |
| `/restaurantes/` | 1.60 s | 1.60 s | 11.99 s | 463 |
| `/food-parks/` | 1.73 s | 1.73 s | 12.04 s | 463 |

**Estabilidad:** CLS entre 0 y 0.0204 en las 18 mediciones. TBT entre 0 y 39 ms. El LCP es siempre texto (`P.lead` o `H1`), no la imagen del hero.

**Lectura.** El sitio no tiene un problema de JavaScript ni de layout. Tiene un problema de **bytes**. Y el byte está concentrado en un solo lugar.

### 7.2 El hallazgo de fuentes

```
1ad231aa… inter-400.woff2       85 068 B
1ad231aa… inter-500.woff2       85 068 B   ← mismo hash
1ad231aa… inter-600.woff2       85 068 B   ← mismo hash

341687ee… plus-jakarta-sans-600.woff2  21 728 B
341687ee… plus-jakarta-sans-700.woff2  21 728 B   ← mismo hash
341687ee… plus-jakarta-sans-800.woff2  21 728 B   ← mismo hash

bd4781a3… jetbrains-mono-500.woff2  11 624 B
bd4781a3… jetbrains-mono-700.woff2  11 624 B   ← mismo hash
```

Nueve URLs, tres binarios. Como las URLs son distintas, el navegador descarga las tres copias: **166 KB de Inter + 42 KB de Jakarta + 11 KB de Mono = ≈220 KB duplicados por visita**. Las fuentes son el 57–74 % del peso de cada página.

En Slow 3G el último `inter-600.woff2` termina a los **16.4 s**. El texto estaba esperando ese archivo duplicado. Ahí está el LCP.

Además, como los tres archivos de cada familia son idénticos, las jerarquías 400/500/600 y 600/700/800 no existen tipográficamente: se está pidiendo un peso que el archivo no tiene.

**Arreglo.**

1. Un archivo por familia con el rango real (`font-weight: 100 900` si es variable, o un solo peso si no lo es).
2. Subset Latin (los glifos que el sitio usa) con `unicode-range`.
3. Eliminar las declaraciones y `preload` redundantes.

Resultado esperado: de 340 KB a **≤ 120 KB** de fuentes, sin cambio visual perceptible.

### 7.3 Imágenes

- Sin `srcset`, sin AVIF, sin `sizes`. Todo WebP a tamaño único.
- `logo.png`: 90 KB para 32×32.
- `pos_03_catalogo_soho.webp`: 248 KB, termina a los 23.6 s en Slow 3G.
- Las capturas de dashboard pesan 90–110 KB cada una; a 487×304 renderizados, sobran píxeles y faltan píxeles a la vez (sobran para la caja, faltan para leer el contenido).

### 7.4 Presupuesto propuesto

| Recurso | Hoy | Objetivo |
|---|---|---|
| HTML | 12–16 KB | ≤ 20 KB |
| CSS | 45 KB | ≤ 45 KB |
| JS | 5 KB gzip | ≤ 10 KB |
| Fuentes | 257–340 KB | **≤ 120 KB** |
| Imagen LCP | 90–159 KB | ≤ 80 KB |
| **Total por página** | **376–872 KB** | **≤ 350 KB** |

Con ese presupuesto, el `load` en Slow 3G baja de 8–26 s a ~4–6 s, y el LCP de 3.2 s a ~2 s.

### 7.5 Cómo reproducirlo

```bash
# viewport 390x844 DPR3, caché off, Slow 3G
node /tmp/nhilos-audit/perf2.mjs
# desglose por request (fonts, imágenes, video)
node /tmp/nhilos-audit/diag.mjs
```

---

## 8. Accesibilidad

### 8.1 Bloqueante de teclado: el menú de escritorio

```html
<span class="nav-group-label">Producto</span>
```

Sin `tabindex`, sin `role="button"`, sin `aria-expanded`. El panel solo aparece por `:hover`/`:focus-within`, pero un `<span>` no recibe foco, así que `:focus-within` nunca se activa para el teclado. **Un usuario de teclado no puede llegar a "Software POS", "Sin internet", etc. desde el menú de escritorio.** En móvil el menú sí funciona (es un botón).

**Fix.** `<button class="nav-group-label" aria-expanded="false" aria-controls="…">` + mostrar el panel con `:focus-within` y con una clase `is-open` que el JS alterna con Enter/Space y Escape.

### 8.2 Riel lateral (`spine`)

- En escritorio, los 12 enlaces del riel son los **primeros 12 tab-stops** de la página.
- El riel es `opacity: 0; pointer-events: none` cuando no está activo, pero `opacity` no saca del orden de tabulación: se puede enfocar algo invisible.
- La etiqueta de cada número solo aparece en `:hover` (`::after { display: none }` → `:hover`). Al enfocar con teclado no se ve qué sección es.

**Fix.** `visibility: hidden`/`inert` mientras no esté activo, y mostrar `::after` también en `:focus-visible`.

### 8.3 Menú móvil

Lo que está bien: `aria-expanded` y `aria-label` se actualizan; cierra con Escape devolviendo el foco al botón; cierra al hacer clic fuera y al cambiar de tamaño.

Lo que falta:

- El icono **no cambia** al abrir: el `<svg>` de hamburguesa es idéntico con el menú abierto. Solo cambia el `aria-label`. Un usuario vidente no tiene señal de estado.
- No hay bloqueo de scroll: con el menú abierto se puede desplazar la página de 13 000 px detrás.
- No hay overlay ni cierre al tocar el fondo (solo `document` click, que en móvil compite con el scroll).

### 8.4 Contraste

Calculado sobre los tokens del sistema:

| Par | Ratio | AA normal (4.5) |
|---|---|---|
| `--web-text-muted` #5B6B7C sobre blanco | 5.47:1 | Cumple |
| #5B6B7C sobre `--web-bg-subtle` #F7F9FB | 5.19:1 | Cumple |
| `--web-emerald-700` #007A52 sobre blanco | 5.38:1 | Cumple |

No hay fallas sistémicas. Las zonas con gradiente y las imágenes de fondo quedaron fuera de la medición automática; revisadas visualmente, no se detectó texto ilegible.

### 8.5 Otros

- **Targets táctiles:** entre 2 y 8 enlaces por página con altura menor a 24 px (principalmente pie de página). El resto cumple 44 px.
- **Imágenes:** 0 imágenes sin `alt` en las 9 páginas.
- **Formulario de demo:** 15 campos, todos con `<label>`, los obligatorios con `required` y `aria-describedby` apuntando al error. Bien resuelto.
- **`prefers-reduced-motion`:** respetado en CSS y JS (los videos quedan en el primer frame, los reveals se desactivan).
- **Sin JS:** hay `<noscript>` que revela `.reveal`, `.stagger`, `.hero-in` y `.hilo-*`, y oculta el video del hero. Verificado visualmente: el contenido se ve.

---

## 9. SEO

**Lo que está bien.**

- Un solo `<h1>` por página, con la intención de búsqueda correcta.
- Canónicas absolutas y ahora todas en apex.
- `sitemap.xml` y `robots.txt` coherentes; sin rutas indexables de más.
- Schema JSON-LD en todas las páginas: `Organization`, `BreadcrumbList`, `FAQPage`. El home suma `SoftwareApplication`.
- 404 propio, con retorno HTTP 404 correcto.
- No hay `hreflang` (correcto: un solo país).

**Lo que conviene ajustar.**

1. **FAQ duplicada entre páginas.** La misma pregunta (p. ej. "¿Qué pasa si se cae el internet?") aparece en 4–5 páginas con respuestas casi idénticas. Para Google es contenido duplicado y diluye la página que debería rankear. Una pregunta, una página dueña, y enlaces desde el resto.
2. **Anchor text idéntico 17 veces:** "ver planes y precios de NHILOS POS". Variar el texto (y no usarlo como frase suelta al final de un párrafo).
3. **Títulos largos.** `/facturacion-dgi/` tiene 62 caracteres de título; correcto, pero el `h1` de la misma página tiene 96. El `h1` puede ser más corto y específico.
4. **El `<title>` del build no coincide con el de la página** en `food-parks` (el build declara "Software para food park en Nicaragua", la página publica "tu puesto, tu sistema"). Conviene una sola fuente de verdad para títulos y descripciones.
5. **Los pies de foto repetidos** ("Captura real de la terminal · datos de demostración") no aportan contexto ni a personas ni a buscadores de imágenes.

---

## 10. Seguridad

### 10.1 Cabeceras (estado actual)

| Cabecera | Estado | Valor |
|---|---|---|
| `Strict-Transport-Security` | Presente | `max-age=31536000; includeSubDomains` |
| `Content-Security-Policy` | Presente | `script-src` por hash, `style-src 'self' 'unsafe-inline'`, `frame-ancestors 'self'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `upgrade-insecure-requests` |
| `X-Frame-Options` | Presente | `SAMEORIGIN` |
| `Cross-Origin-Opener-Policy` | Presente | `same-origin` |
| `Cross-Origin-Resource-Policy` | Presente | `same-origin` |
| `X-Content-Type-Options` | Presente | `nosniff` |
| `Referrer-Policy` | Presente | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | Presente | bloquea cámara, micrófono, geolocalización, pago |
| `Access-Control-Allow-Origin` | **Presente y abierto** | `*` también en HTML |

**Comentarios.**

- La CSP por hash es una decisión excelente y poco común: permite `script-src` estricto sin `unsafe-inline`. El costo es que **cada script inline nuevo rompe la página** hasta que se recalcule el hash. Hay que documentarlo en el build o migrar a nonce.
- `style-src 'unsafe-inline'` es necesario mientras cada página lleve su propio `<style>`. No es un riesgo grave, pero conviene saberlo.
- `access-control-allow-origin: *` no explota hoy (no hay endpoints autenticados), pero si mañana se agrega un endpoint con cookies en el mismo origen, la política por defecto ya está abierta. Restringirlo a `/media/*` y `/assets/*` o eliminarlo.
- Falta `/.well-known/security.txt` (opcional, pero útil para reportes de vulnerabilidades).

### 10.2 TLS y transporte

- HTTP/2 y HTTP/3 (`alt-svc: h3`) activos.
- `http://` → `https://` con 301, tanto apex como `www`.
- Certificado de Google Trust Services (WE1), válido del 16 nov 2026 al 14 feb 2027.
- HSTS ya está; **no** se recomienda `preload` hasta tener la certeza de que ningún subdominio necesita HTTP.

### 10.3 DNS y correo

| Registro | Estado | Riesgo |
|---|---|---|
| DMARC | `p=quarantine; adkim=r; aspf=r; rua=mailto:dmarc_rua@onsecureserver.net` | Presente, pero… |
| SPF | **Ausente** | Sin SPF, DMARC no tiene de dónde alinear. Cualquiera puede intentar enviar como `@nhilospos.com`; el receptor no tiene una política explícita de rechazo |
| MX | **Sin registro en el apex** | No hay correo en el dominio: más razón para publicar `v=spf1 -all` |
| CAA | **Ausente** | Cualquier CA puede emitir certificados para el dominio |
| DNSSEC | **Sin DS** | Sin protección de integridad DNS |

**Acción concreta:** publicar `TXT @ "v=spf1 -all"` (el dominio no envía correo) y un `CAA 0 issue "pki.goog"` + `CAA 0 issuewild "pki.goog"`. Con eso se cierra la superficie de spoofing sin tocar nada del sitio.

### 10.4 Formulario

`<form>` sin `action`, `method="get"`, manejado por JS que hace `preventDefault` y abre `wa.me`. Con JS activo no hay riesgo: no se envía nada a un servidor. **Con JS desactivado o roto, el submit nativo navega con `?contactName=…&contactPhone=…` en la URL**, dejando nombre y teléfono en el historial y en los logs del proxy. Hay un bloque `<noscript>` con el WhatsApp directo, pero el formulario sigue ahí y sigue siendo enviable.

**Fix.** Bloquear el submit nativo (`onsubmit`/listener + `novalidate`) y ocultar el formulario dentro de `<noscript>`, dejando solo el enlace de WhatsApp.

### 10.5 Exposición de información

- No hay `.git`, `.env`, source maps, listados de directorio ni backups accesibles.
- `.env` devuelve 403 de Cloudflare; `/assets/` y `/media/` devuelven 404 en listado. Correcto.
- **Los comentarios HTML internos sí viajan al público**: `CLAIM GUARD`, rutas pendientes y referencias a briefs (`odd/tasks/…`). Son 34 marcas en 9 páginas. No es una vulnerabilidad, pero revela estrategia editorial y rutas no publicadas. Deben eliminarse en el build.

---

## 11. Mantenibilidad y DX

1. **19.7 MB de media sin usar.** El directorio `media/` tiene 68 archivos (22.5 MB); las páginas referencian 23 (2.9 MB). Hay `mp4` de 3–5 MB que nunca se sirven. Limpiar el directorio y agregar un chequeo en el build que falle si un archivo no está referenciado.
2. **Cada página lleva su propio `<style>`.** Eso explica por qué `07-precios.html` definía `.charge-row` localmente (y por qué su bug de overflow vivió solo en esa página). Los tokens están centralizados en `site.css`, pero los componentes no. Conviene mover los componentes de una sola página a la CSS global o a un partial por página.
3. **Los "claim guard" como comentario HTML son una buena idea en el lugar equivocado.** Deberían ser un lint de build: una lista de patrones prohibidos ("en tiempo real", "nunca pierdes una venta", "100 %") que falle el build si aparecen en el texto visible.
4. **No hay verificación de copy.** Un test de 20 líneas que falle si hay `" ."`, rutas `(/xxx/)` en texto visible, o `<!-- pending route` sin resolver, habría atrapado F-04 antes de publicar.
5. **Deriva de despliegue.** La deploy cambió a mitad de la auditoría y no hay un identificador visible de versión. Sugerencia: un `<meta name="build" content="…">` con el hash del build para poder comparar producción con `dist/` en segundos.
6. **Una sola fuente de verdad para títulos y descripciones.** Hoy `scripts/build-nhilos-web.mjs` declara títulos que la página puede sobrescribir. Elegir uno.

---

## 12. Plan de acción

### Fase 1 — Una tarde, impacto alto (hacer ya)

| # | Acción | Archivos | Verificación |
|---|---|---|---|
| 1 | Un archivo de fuente por familia + subset + `unicode-range`; borrar duplicados y `preload` redundantes | `assets/site.css`, `fonts/`, preloads de cada HTML | `perf2.mjs`: fuentes ≤ 120 KB |
| 2 | `logo.png` → SVG en línea o WebP 64×64 | todos los HTML | peso del logo ≤ 3 KB |
| 3 | Videos: `preload="none"`, arranque condicionado a `4g` y `!saveData`, nunca abortar | `assets/site.js`, HTML con `<video>` | 0 `ERR_ABORTED` en Slow 3G |
| 4 | Arreglar las 4 frases rotas de `restaurantes` y el `" ."` global | `12-restaurantes.html`, `13-food-parks.html`, resto | grep `[a-z] [.,]` = 0 |
| 5 | Filtrar comentarios internos en el build | `scripts/build-nhilos-web.mjs` | `grep -c "CLAIM GUARD\|pending route" dist/…` = 0 |
| 6 | Lint de copy en el build (`" ."`, rutas crudas, claims prohibidos) | build script | build falla con el caso de prueba |

### Fase 2 — Medio día, impacto en conversión

| # | Acción | Detalle |
|---|---|---|
| 7 | Reescribir la FAQ con la regla "una de cada tres menciona el país" | 8 páginas; máximo 1 pregunta duplicada por sitio |
| 8 | Home: reemplazar el modelo de precios completo por la escalera + CTA | `/` |
| 9 | Nav de escritorio accesible (botón, `aria-expanded`, Enter/Space/Escape) | `site.css`, `site.js`, HTML de nav |
| 10 | CTA primaria de demo en el hero de `/facturacion-dgi/` e `/inventario/` | 2 páginas |
| 11 | Tarjetas de segmento del home: las 4 enlazan | `/` |

### Fase 3 — Un día, calidad percibida

| # | Acción |
|---|---|
| 12 | `srcset`/`sizes` + AVIF; master del hero a 2x real (≥ 520×1050) |
| 13 | Capturas con ratio nativo + lightbox/zoom; pies específicos por captura |
| 14 | Motion consistente: entrada en `food-parks` (o decisión explícita de no tenerla) |
| 15 | Riel: `inert`/`visibility` cuando no está activo; etiqueta visible en `:focus-visible` |
| 16 | Menú móvil: icono de cierre + bloqueo de scroll |

### Fase 4 — Higiene

| # | Acción |
|---|---|
| 17 | `SPF -all`, `CAA`, evaluar DNSSEC |
| 18 | Quitar `access-control-allow-origin: *` de HTML |
| 19 | `security.txt` |
| 20 | Limpiar `media/` (19.7 MB) y agregar chequeo de referencias |
| 21 | `meta name="build"` + comparación automática `prod` vs `dist` |

### Checklist de aceptación

- [ ] Slow 3G: `load` ≤ 6 s y transferencia ≤ 350 KB en todas las páginas.
- [ ] Fuentes ≤ 120 KB y un solo binario por familia.
- [ ] 0 `ERR_ABORTED` de media en Slow 3G.
- [ ] 0 respuestas FAQ consecutivas que empiecen con "En Nicaragua,".
- [ ] 0 `" ."`, 0 rutas `(/…/)` en texto visible, 0 comentarios internos en `dist/`.
- [ ] Menú de escritorio operable solo con teclado.
- [ ] Las 4 capturas de dashboard legibles a tamaño completo (zoom disponible).
- [ ] Toda imagen con `srcset`; hero con master ≥ 2x del tamaño CSS.
- [ ] SPF y CAA publicados.
- [ ] CLS < 0.1 y TBT < 200 ms (ya se cumple; no romperlo).

---

## 13. Anexos

### A. Medición cruda

`/tmp/nhilos-audit/out/perf2.json` — 18 filas (9 páginas × 2 perfiles) con FCP, LCP, TTFB, DCL, load, CLS, TBT, requests, transferencia total y por tipo.

### B. Comandos reproducibles

```bash
# 1. Overflow por viewport (320/360/390/430)
node /tmp/nhilos-audit/m.mjs

# 2. Performance completa (9 páginas × Fast 3G / Slow 3G)
node /tmp/nhilos-audit/perf2.mjs

# 3. Desglose por request (/software-pos/ en Slow 3G)
node /tmp/nhilos-audit/diag.mjs

# 4. Geometría de capturas, header, menú móvil, formulario
node /tmp/nhilos-audit/dom.mjs && node /tmp/nhilos-audit/dom2.mjs

# 5. Cabeceras
curl -sI https://nhilospos.com/ | tr -d '\r'

# 6. DNS (sin dig en el host)
curl -s "https://dns.google/resolve?name=nhilospos.com&type=TXT"
curl -s "https://dns.google/resolve?name=_dmarc.nhilospos.com&type=TXT"
curl -s "https://dns.google/resolve?name=nhilospos.com&type=CAA"
```

### C. Archivos de referencia

| Ruta | Rol |
|---|---|
| `design/nhilos-web-foundation/05-home-geo.html` | Home, `<noscript>`, hero |
| `.../06-software-pos.html:222-229` | `.capture-frame` / `.capture-media` (1:1 y 3/4) |
| `.../07-precios.html` | Precios (el overflow ya corregido vivía aquí) |
| `.../11-sin-internet.html:36-42` | Comentario "CLAIM GUARD" (se publica) |
| `.../12-restaurantes.html:1232,1304,1402,1428` | Frases rotas por enlaces eliminados |
| `.../13-food-parks.html` | Página sin animaciones de entrada |
| `assets/site.css:8-15` | Las 9 declaraciones `@font-face` con 3 binarios |
| `assets/site.css:334-346` | Riel lateral (opacity 0, `display:none` ≤1024) |
| `assets/site.js` | `armHeroVideo`, IO de videos, menú móvil |
| `scripts/build-nhilos-web.mjs` | `PAGES`, títulos, pipeline |
| `dist/nhilos-web/_headers` | CSP/HSTS/CORS |
| `media/` | 68 archivos, 23 usados |

### D. Glosario

- **LCP:** Largest Contentful Paint, el momento en que se pinta el elemento más grande visible.
- **CLS:** Cumulative Layout Shift, cuánto salta el layout.
- **TBT:** Total Blocking Time, cuánto bloquea el JS al hilo principal.
- **Fast 3G / Slow 3G:** perfiles de red de Chrome DevTools (150 ms/1.6 Mbps y 400 ms/400 kbps).
- **DPR:** device pixel ratio; con DPR 3, 1 px CSS son 3 px físicos.

---

## 14. Registro de ejecución — Fase A (2026-11-23)

Fase A del plan: hero y bloque de prueba de producto. Cambios en `design/nhilos-web-foundation/05-home-geo.html`, `assets/site.css` y `assets/site.js`; el resto de páginas hereda header y capturas.

### Qué cambió

| Superficie | Antes | Después |
|---|---|---|
| Eyebrow del hero | "Punto de venta local-first · Nicaragua" | "Punto de venta para Nicaragua" (sin jerga en inglés) |
| Chips del hero | Dos chips genéricos flotando ("C$125.00 pedido en carrito", "Offline · cobro local activo") | Eliminados: la H1 y el lead ya sostienen el argumento |
| Terminal del hero | 260 px de ancho; atributos 768×1376 sobre un asset de 402×811 | 340 px; atributos reales 402×811 |
| Capturas del hilo | Cuatro miniaturas de 258×576 con el mismo pie y sin forma de ampliar | Enlaces `a.shot` que abren un `<dialog>` con la captura completa; pie específico por paso |
| Pie de captura | "Captura real de la terminal · datos de demostración" ×4 | "Paso 0N · <contenido> · datos de demostración" + `title` con la etiqueta de demostración |
| Marco de captura | 1080/2316 para las cuatro, incluidas las de 800×1280 | 1080/2316 uniforme; las de 800×1280 se letterboxean en navy |
| `.proof` (fiscal y kardex) | `height` de atributo 900 → caja 558×430 con letterbox | `height:auto` → 558×349, sin aire |
| Header | `rgba(255,255,255,.92)` + `blur(8px)` (ghosting visible) | `#FFFFFF` sólido, sin backdrop-filter |
| Hero móvil | Botones a ~50 % de ancho; punto de la nota desalineado | Botones a ancho completo (≤640 px); punto alineado a la primera línea |

### Lightbox

`<dialog>` nativo creado por `site.js`: foco atrapado por el navegador, cierre con Escape y clic en el backdrop, `html.shot-open { overflow:hidden }` para congelar el fondo y devolución del foco al enlace al cerrar. Sin JS, el mismo `href` abre la imagen sola: el enlace es el fallback, no un extra. Funciona con la CSP por hash porque el JS vive en el archivo compartido.

### Evidencia medida (Chromium 1243, build `2171a16b2690`)

- Cuatro marcos del hilo a 258×576 uniformes en 1440, 1024 y 768; sin desborde horizontal en 320, 390, 768, 1024 ni 1440.
- Hero: terminal 340×686; gap hero→`#que-es` cerrado a 0 entre bordes (144 px de padding total, antes 192).
- Header: `background-color: rgb(255,255,255)`, `backdrop-filter: none`.
- Lightbox a 320: 307×691 dentro de 320×844; a 390: 342×767. `overflow` del body `hidden` mientras está abierto; Escape cierra y devuelve el foco a `a.shot`.
- Sin JS: H1 y `.reveal` con opacidad 1 y el primer `a.shot` apuntando a `/media/pos_04_carrito_barra.webp`.
- `node --test` sobre los 12 archivos `nhilos-*.test.mjs`: **304 pruebas, 0 fallos** (incluye S9 sin IVA y la etiqueta de demostración del hilo).

### Publicado

`wrangler pages deploy dist/nhilos-web --project-name nhilos-web --branch main`, deploy `7dc01475`. Verificado en vivo contra `https://nhilospos.com`:

- Sirve `assets/site.c2ac36a39d.css` y `assets/site.53a3ef68a5.js`; 6 `data-shot` en el HTML.
- Header `rgb(255,255,255)`, cero chips, hero 340 px (312 en 390), `overflow-x` 0 en 1440 y 390.
- Lightbox en producción: abre con "Paso 01 · Catálogo y carrito", `overflow` del body `hidden`, Escape cierra y devuelve el foco a `.shot`.
- Hero móvil: H1 a 3 líneas, CTAs 350×52 a ancho completo, nota con el punto alineado, terminal asomando 69 px sobre el fold.

**Hallazgo nuevo (no introducido por Fase A):** Cloudflare inyecta dos scripts que la CSP por hash bloquea y deja dos errores en consola. El primero es el JS Detection de la zona (`__CF$cv$params`, `/cdn-cgi/challenge-platform/scripts/jsd/main.js`) con un hash que cambia por respuesta (`ray` distinto), así que no se puede hashear. El segundo es el beacon de Web Analytics (`static.cloudflareinsights.com`), que tampoco está en `script-src`. El sitio funciona; lo que se pierde es el JS Detection y la telemetría. Se resuelve desactivando Web Analytics y JS Detection en Cloudflare, no tocando la CSP (añadir `'unsafe-inline'` sería un retroceso). **Estado: diferido por el owner el 2026-11-23.** Se retoma como task propio; no bloquea nada.

### Pendiente
- Fuera de Fase A: spine 01-12, ritmo de las 15 secciones, 19.7 MB de media sin usar, SPF/CAA/DNSSEC, `access-control-allow-origin: *`.

---

## 15. Registro de ejecución — Fase B (2026-11-23)

Fase B: cerrar el home. Ritmo vertical de las secciones y jerarquía tipográfica del H1. Sin cambios de copy, de estructura ni de fondos.

### Diagnóstico medido (1440, antes)

| Par | Aire entre secciones | Lectura |
|---|---|---|
| precios → notas | 32 px | dentro del bloque |
| notas → packs | 192 px | igual que un bloque nuevo |
| packs → add-ons | 144 px | intermedio |
| add-ons → condiciones | 96 px | casi una subsección |

Tres valores distintos para cuatro continuaciones: el bloque de precios se leía como cinco secciones sueltas. Además, el `<em>` del H1 estaba en `--web-navy-800` (#003757), más claro que la tinta del título (#0B1924): la frase clave se veía atenuada, no enfatizada.

### Qué cambió

| Superficie | Antes | Después |
|---|---|---|
| Ritmo de continuación | 96 px sin clase propia | `.section-cont` = 48 px; `#packs` la usa |
| Notas de precios | 32/96 | 32/48 |
| Condiciones | 48/48 | 48/96 (cierra el bloque antes de FAQ) |
| `.hero h1 em` (home y hub) | `--web-navy-800` | `--web-emerald-700` (5.38:1, token AA para texto en claro) |
| Marcado del em | `<em>el internet se cae</em>` | `el <em>internet se cae</em>` para que el énfasis no parta de línea |

### Evidencia medida (build `bc2c66151d85`)

- Aire resultante: precios→notas 32; notas→packs 96; packs→add-ons 96; add-ons→condiciones 96; condiciones→FAQ 192. Dos niveles: 96 dentro del bloque, 192 entre bloques (2:1).
- Bloque de precios: 2 214 → 2 118 px (−96) sin perder contenido.
- Móvil 390: secciones 64/64, continuaciones 48/48, cierre 96; `overflow-x` 0; hero-media 312 px.
- Contraste del em: `#007A52` sobre `#FFFFFF` = 5.38:1 (AA); el texto es de 60 px, umbral 3:1.
- `node --test` sobre los 12 archivos `nhilos-*.test.mjs`: **304 pruebas, 0 fallos**.

### Publicado

Deploy `5209dc97` en `nhilos-web`. Verificado en vivo contra `https://nhilospos.com` a 1440 y 390: sirve `assets/site.8fd94f5439.css`, el `<em>` del H1 computa `rgb(0, 122, 82)` con texto "internet se cae", `#packs` 48 px de padding superior, `#condiciones` 96 px inferior y `overflow-x` 0 en ambos anchos.

### Pendiente observado en la misma pasada

- El asset `pos_hand_device_transparent.webp` corta el antebrazo en su propio borde derecho: a 1440 la mano termina en seco sobre el blanco. Es la foto, no el CSS. Requiere re-exportar el master o encuadrar con un degradado.
- Fuera de Fase B: spine 01-12, alternancia de fondos del bloque de precios (4 bandas), 19.7 MB de media sin usar, SPF/CAA/DNSSEC, `access-control-allow-origin: *`.

---

## 16. Estado del plan (2026-11-23)

Al abrir las fases restantes, la mayor parte del plan ya estaba ejecutada en el repo. Lo que sigue es el estado real, con la evidencia que lo sostiene.

| # | Acción | Estado | Evidencia |
|---|---|---|---|
| 1 | Fuentes, un binario por familia | cerrado | 3 archivos (24/37/38 KB = 99 KB), 3 `@font-face` |
| 2 | Logo | cerrado | `assets/logo-64.png`, 3 KB |
| 3 | Videos `preload="none"` | cerrado | 9 páginas publicadas; ningún `<video>` publicado con `metadata` |
| 4 | Frases rotas de restaurantes | cerrado | corregidas en fuente; el build falla con preposición suelta (`dangling`) |
| 5 | Comentarios internos | cerrado | el build elimina `<!-- … -->` del artefacto |
| 6 | Lint de copy en el build | cerrado | guardias `dangling`, `looseSpace` y título `PAGES` vs página |
| 7 | FAQ con regla de país | cerrado | "En Nicaragua," en 2 preguntas de precios y 4 de food-parks; en el resto, 0 |
| 8 | Precios del home: escalera en vez de planes | **abierto (decisión de producto)** | conviven la escalera (`#que-es`) y los 3 planes completos (`#precios`) |
| 9 | Nav de escritorio accesible | cerrado | `aria-expanded`, Escape, foco devuelto |
| 10 | CTA de demo en heroes de facturación e inventario | cerrado hoy | `/demo/` como primario en ambos; en 390 los 3 botones apilan, `overflow-x` 0, 52 px de alto |
| 11 | Las 4 tarjetas de segmento enlazan | cerrado hoy | food-parks → su página; restaurantes y cafeterías → restaurantes; tiendas → hub |
| 12 | `srcset`/`sizes` + AVIF | **abierto** | cero `srcset`; no hay variantes generadas |
| 13 | Capturas con ratio nativo + lightbox | cerrado (Fase A) | 4 marcos 1080/2316 y `<dialog>` |
| 14 | Motion en food-parks | **decisión: sin animación de entrada** | la página no usa `.reveal`; se sirve completa y se elimina el riesgo de contenido invisible si el JS falla |
| 15 | Riel inerte cuando no está activo | cerrado | `visibility:hidden` + `pointer-events:none`; etiqueta en `:focus-visible` |
| 16 | Menú móvil: cierre + scroll | cerrado | barras a X con `aria-expanded`; `body.is-menu-locked` |
| 17 | `SPF -all`, `CAA`, DNSSEC | **abierto (DNS, fuera del repo)** | TXT solo con verificación de Google; sin CAA; DMARC `p=quarantine` sí existe |
| 18 | Quitar `access-control-allow-origin: *` | **abierto (Cloudflare, fuera del repo)** | no está en `_headers`; lo inyecta el borde |
| 19 | `security.txt` | cerrado hoy | `/.well-known/security.txt`, contacto `soporte@`, expira 2027-11-23 |
| 20 | Limpiar `media/` | **abierto (decisión)** | 68 archivos, 23 MB, 24 sin referenciar |
| 21 | `meta name="build"` | cerrado | el build lo inyecta en cada página |

Deploys de esta pasada: `5401b772` (security.txt + enlaces de segmento) y `0fd79bac` (CTA de demo en los dos heroes).

### Decisión sobre food-parks (item 14)

No se le añade animación de entrada. Motivo: `.reveal` arranca en `opacity: 0` y depende de `site.js`; si el script falla a mitad, el contenido desaparece. El `<noscript>` cubre el caso de JS deshabilitado, no el de un fallo parcial. Para una página de segmento, aparecer completa es la opción correcta.

### Deuda conocida que el plan no cubría

- `.reveal` sin gate `.js`: mismo riesgo en las páginas que sí lo usan. El arreglo correcto es mover el estado inicial a `html.js .reveal`, no a `.reveal`.
- El asset del hero corta el antebrazo en su propio borde derecho (ver §15).
- `wrangler` no está en `devDependencies`: el deploy depende de la caché de `npx` y ya falló una vez al resolver una versión nueva.

---

## 17. Item 12 — `srcset`/AVIF (2026-11-24)

Cada captura publicada se sirve ahora con `<picture>`: un `<source>` AVIF, uno WebP y el original como fallback del `<img>`. Los anchos salen del ancho real de despliegue medido a 390 y 1440, no del nativo; ofrecer 1440 px de una captura que se pinta a 258 es pagar datos que nadie ve.

- 58 variantes (29 AVIF + 29 WebP) en `media/derived/`, 1,4 MB en disco.
- `picture { display: contents }` para que el envoltorio no cree caja y los selectores `.hero-media img`, `.shot img` y `.proof img` sigan aplicando.
- El `<img>` conserva sus atributos: el lightbox sigue abriendo el original (1080×2316) y cerrar con Escape sigue funcionando.

Peso de imágenes transferido con caché vacía, con scroll completo, antes (producción) y después (local):

| Página | 390 antes | 390 después | 1440 antes | 1440 después |
|---|---|---|---|---|
| `/` | 664 KB | 147 KB (−78 %) | 700 KB | 127 KB (−82 %) |
| `/software-pos/` | 647 KB | 147 KB (−77 %) | 647 KB | 166 KB (−74 %) |
| `/facturacion-dgi/` | 152 KB | 49 KB (−68 %) | 152 KB | 50 KB (−67 %) |
| `/inventario/` | 185 KB | 44 KB (−76 %) | 185 KB | 70 KB (−62 %) |

### El hero no lleva AVIF, y es a propósito

El primer intento generó AVIF para `pos_hand_device_transparent.webp` y el dispositivo apareció con un rectángulo negro: ffmpeg 7 + libaom escriben el AVIF en `yuv420p` aunque se pida `yuva420p` y el muxer `avif` no transporta el canal alfa. El WebP sí lo conserva. Esa imagen va solo en WebP (340/402 px); el resto en AVIF.

### Reproducir

`node scripts/web-images.mjs` regenera lo que falte o esté viejo (necesita ffmpeg; se busca en PATH y en `~/.local/opt/nhilos-audio/bin/`). El build no invoca ffmpeg: copia los derivados y falla con la pista `Ejecuta node scripts/web-images.mjs` si alguno no existe, así que desplegar no depende de la máquina.

### Deuda que queda

- El master del hero es 402 px: no hay 2x real. Para cumplir el 2x hay que reexportar la foto, no reescalar.
- `sizes` de los proofs declara 1150 px porque la medición inicial los vio a ancho completo; hoy se pintan a 558. Sobrestima en DPR 1. Se corrige la próxima vez que se toquen.

---

## 18. Item 8 — Precios del home (2026-11-24)

El home mostraba el catálogo completo: tres planes con listas de 8/4/6 ítems, packs, add-ons y condiciones. La sección de precios era, de facto, una segunda página de precios. Ahora muestra la escalera y manda al detalle.

- `#precios` conserva el `h2` que posiciona la pregunta ("¿Cuánto cuesta un sistema POS para restaurante en Nicaragua?") y pasa a tres tarjetas compactas: nombre, precio, setup y para quién. Sin listas de características.
- CTA secundario "Ver los planes en detalle" → `/precios/`.
- Se elimina `#packs` (dos tarjetas más una nota de tres frases); su contenido se resume en una línea que enlaza al detalle.
- Se conservan `#precios-notas` (claim fiscal DT 09-2007, qué es una terminal, enterprise), `#addons` y `#condiciones`.

### Por qué no se quitó todo

La guardia `S5` del test del home exige que **cada cifra del documento de precios congelado aparezca también en el home**. Al quitar add-ons, `US$10` desaparecía y el test falló. Ese test es una protección de negocio, no un estorbo: impide que una cifra quede huérfana entre el documento y el sitio. Se conservaron add-ons (dos filas) y condiciones (cuatro líneas, incluida "el setup no es reembolsable") en vez de debilitar la guardia.

### Efecto

| Viewport | Alto del home antes | Alto después | Diferencia |
|---|---|---|---|
| 1440 | 12 152 px | 11 638 px | −514 px |
| 390 | 19 896 px | 18 720 px | −1 176 px |

La sección de precios mide 714 px a 1440 y las tres tarjetas quedan a la misma altura (241 px). Sin overflow. 304/304 tests.

### Deuda que queda

- `/precios/` sigue repitiendo el precio (17 veces "US$49"): el detalle es su sitio, pero la repetición dentro de esa página merece su propia pasada.
- El CTA a `/precios/` es secundario porque el primario global es la demo; si el negocio prioriza la visita a precios, se invierte.

---

## 19. Item 20 — Limpieza de `media/`: no aplica (2026-11-24)

El plan asumía basura acumulada. Al medirla, no la hay.

- 45 archivos (19,7 MB) no se publican, y eso ya es correcto: el build solo copia lo que alguna página referencia.
- Cero duplicados exactos (sha256). Cero posters hasheados huérfanos.
- Los 8 videos no publicados (17,8 MB) están referenciados por tests (`nhilos-sin-internet-artboard.test.mjs`), dos briefs de contenido, dos tareas ODD y el artboard `04-sintesis-hibrida.html`: son material vivo, no restos.
- `media/logo.png` (91 KB) lo usan los artboards internos `01`–`04`; `favicon-512.png` es la fuente de los favicons publicados.

Conclusión: el objetivo real del item —que el dominio público no cargue material de trabajo— ya lo cumple el filtro de referencias del build. Borrar archivos rompería tests y documentación sin ahorrar un byte en producción.

La única limpieza que tendría sentido es sacar del repositorio los 17,8 MB de video a un almacenamiento externo. Eso es una decisión de infraestructura, no de código, y queda pendiente del owner.

---

## 20. Robustez y cadena de build (2026-11-25)

### Gate de motion

El registro de la auditoría (L6) dejaba una debilidad: con JS activo, si `site.js` fallaba a mitad, `.reveal` se quedaba en `opacity: 0` y el contenido no aparecía. El `<noscript>` cubría solo el caso de JS deshabilitado.

Ahora el build inyecta en el `<head>` un inline mínimo que:

1. Añade `js` a `<html>` antes del primer paint.
2. En `DOMContentLoaded`, si `site.js` no marcó `reveal-ready`, añade `reveal-fallback`.

El CSS gatea todos los estados ocultos con `html.js` (reveal, stagger, hero, chips, número del hilo) y `reveal-fallback` fuerza `opacity: 1`. Sin JS, nada se oculta. El hash del inline lo calcula el propio build, así que la CSP no se debilita.

Verificado con Playwright en cuatro escenarios: normal (20/20 reveals ocultos hasta el scroll, hero visible), sin JS (0 ocultos), `site.js` abortado (fallback, 0 ocultos) y `site.js` lanzando al inicio (fallback, 0 ocultos). Cero errores de consola.

### Cadena de deploy

- `wrangler@4.166.0` fijado en `devDependencies`: el deploy ya no depende de lo que resuelva `npx` (la 4.167.0 rompió el comando).
- `pnpm images:web` regenera las variantes; `pnpm build:web` construye; `pnpm deploy:web` publica.

### Nota de coordinación

El test `scripts/__tests__/nhilos-web-auditoria-2026-11-20.test.mjs` entró al repositorio desde otra sesión de trabajo y pasa 16/16 con el estado actual. No se duplicó ni se reescribió desde esta pasada.

### Pendiente para el cierre (no desplegado desde esta pasada)

- El `dist` local incluye este gate, pero **no** las siete capturas nuevas (`dsh_foodpark_*`, `pos_comideria_*`) que la otra sesión commiteó después: hay que reconstruir antes de publicar.
- `/facturacion-dgi/` e `/inventario/` sirven hoy **dos `btn-primary`** en el hero ("Solicitar una demo" a `/demo/` y "Revisar mi caso con un especialista" a WhatsApp). Es un cruce de dos decisiones, no una jerarquía: uno de los dos debe bajar a `btn-secondary`.
