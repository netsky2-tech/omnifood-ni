# `/software-pos/restaurantes/` — la página del segmento que cocina

Ruta publicada `/software-pos/restaurantes/`, artboard `design/nhilos-web-foundation/12-restaurantes.html`. Fuente de verdad: `docs/nhilos/web/nhilos_web_page_briefs_v1.0.md` **§5** + la guía SEO de 7 pasos. Es la página que **posee** el término `restaurante` — y por eso es la única del sitio donde el segmento va en el H1.

**Pero "restaurante" aquí no significa restaurante grande.** Esta es la corrección del fundador que manda sobre todo el copy (S5b).

---

## 0. Encargo, límites y cómo trabajar

**Qué se construye:** una página nueva, hermana de las siete existentes, en una ruta de **tres niveles** (`/software-pos/restaurantes/`). Su trabajo: que quien cocina y vende se reconozca — sea un restaurante de mantel o una comidería de tres mesas — y que vea probado el diferenciador: **cada plato vendido descuenta sus ingredientes**.

**Qué NO se toca:**
- Las siete páginas existentes ni sus suites.
- `assets/site.css` y `site.js`, salvo patrones de sistema (spine, breadcrumb, `faq-cell`, `demo-tag`). Patrones nuevos → `<style>` de la página.
- El producto (`apps/`). Solo sitio web.

**Comandos:**
```
node --test scripts/__tests__/nhilos-restaurantes-artboard.test.mjs
node scripts/build-nhilos-web.mjs
```

**Cómo trabajar (no negociable):** test-first con RED probado; verificá el artefacto y no el mensaje del script; ninguna capacidad sin evidencia; no inventes material; el brief manda **salvo donde S5b lo amplía**.

---

## Specs

### S1. Página, ruta y fuente de verdad
Ruta `/software-pos/restaurantes/`; fuente `design/nhilos-web-foundation/12-restaurantes.html`; salida `dist/nhilos-web/software-pos/restaurantes/index.html`. **Ruta de tres niveles** (como `/software-pos/sin-internet/`): el build absolutiza `assets/`, `media/` y `fonts/` y **falla** si queda una referencia relativa. Entrada en `PAGES` con `url: "/software-pos/restaurantes/"`; registro en `design.json`.

### S2. Tono
Comercial-transaccional de segmento, sin miedo y sin urgencia. La página **opera**: `/inventario/` valúa, `/facturacion-dgi/` cumple, `/software-pos/sin-internet/` explica los límites, `/software-pos/caja/` hace el arqueo. Esta enuncia el beneficio y enlaza.

### S3. Keywords: la única página que posee el segmento
- **Primary:** `sistema POS para restaurante` — **literal en el H1** (regla del sitio: el segmento en la puerta de entrada **solo** en la página que lo posee; esta lo posee).
- Secundarias: `sistema POS para restaurante en Nicaragua`, `software para restaurantes Nicaragua`, `POS para restaurante`, `punto de venta para restaurante`.
- **Del avatar:** `sistema POS para restaurante pequeño en Nicaragua` — se responde con la escalera de control, **no** con una "versión lite" (S5b).
- **NO persigue, con dueño:** `sistema POS Nicaragua` → hub; `cierre de caja`, `arqueo` → `/software-pos/caja/`; `POS para bar` → bares; `comida rápida` → `/software-pos/comida-rapida/`; `inventario para restaurante`, `kardex` → `/inventario/restaurantes/` (mientras no exista, el método vive en `/inventario/`); `facturación DGI para restaurantes` → `/facturacion-dgi/restaurantes/`; `precio`, `cotización` → `/precios/`; `demo` → `/demo/`; `varias sucursales` → `/software-pos/multisucursal/`; `merma`, `costo de un platillo` → recursos.

### S4. Respuesta rápida en los primeros 150 px
> POS táctil local-first para restaurante: sigue cobrando sin internet y cada plato vendido descuenta sus ingredientes, receta por receta, con costo por plato. Bimoneda y correlativo DT 09-2007.

### S5. H1 (verbatim del brief)
`Sistema POS para restaurante: cada plato vendido descuenta sus ingredientes`

### S5b. **"Restaurante" no quiere decir restaurante grande** (decisión del fundador, vinculante)
Verbatim: *"a como puede ser restaurante, puede ser comiderias, foodparks con comida y negocios pequeños incluso, no necesariamente un restaurante grande."*

**Regla:** el copy **amplía dentro del segmento**, no fuera de él. El H1 se queda (es el término que se teclea y esta página lo posee), pero **todo el cuerpo reconoce al operador pequeño**. Obligatorio:
- Un bloque de reconocimiento que nombre **al menos cuatro** de estos formatos: **comidería**, **fritanga**, **comedor**, **puesto de comida**, **cafetería con cocina**, **food park con cocina**, **negocio que cocina en casa o en ventana**, **restaurante pequeño o mediano**.
- El bloque aparece **antes** del diferenciador: primero "esto es para mí", después "esto lo prueba".
- **Ejemplos con escala pequeña:** una o dos cajas, diez o veinte platos, una cocina y un mostrador. Nunca el restaurante de ochenta mesas.
- **La escalera del posicionamiento** se dice explícitamente: se empieza en modo simple y se activan recetas cuando el negocio lo pida. Un negocio pequeño no tiene que comprar el control de uno grande.
- **Prohibido asumir escala:** "sucursales", "franquicia", "varios salones", "salón VIP", "múltiples áreas", "equipo de meseros", "sommelier", "carta de vinos", ni cifras de mesas grandes.

**Este registro no es ajeno al sitio:** el home y `/precios/` ya usan **"pulpería"**, un término nicaragüense de negocio pequeño. "Comidería" y "fritanga" pertenecen a la misma habla y a la misma audiencia.

### S6. Jerarquía: 8 H2 y 4 H3 (el H3 de reconocimiento se suma a los tres del brief)
1. `¿Qué es NHILOS POS para tu restaurante?`
   - H3: `Comidería, fritanga o comedor: si cocinas, es tu página` **(nuevo, S5b)**
   - H3: `Mesa y mostrador en la misma operación`
2. `El diferenciador: recetas que descuentan insumos por plato vendido`
   - H3: `Qué pasa cuando cambia el precio de un insumo`
   - H3: `Modificadores sin romper la receta`
3. `¿Qué pasa cuando se cae el internet en hora pico?`
4. `Facturación que cumple la DT 09-2007 en cada comprobante`
5. `¿Cuánto cuesta un POS para tu restaurante?`
6. `Preguntas frecuentes sobre el POS para restaurantes`
7. `Solicita una demo con el menú de tu restaurante`

Contenido por sección: brief §5.4. Lo que no se puede omitir:
1 → definición en 100–150 palabras: POS táctil local-first para venta en mesa y mostrador, catálogo con recetas, cobro bimoneda, turnos con arqueo por usuario; y reventa (botellas, postres comprados) en modo simple dentro del mismo catálogo.
   H3 reconocimiento → S5b, con los formatos y la escalera.
   H3 mesa/mostrador → pedido en mesa o mostrador, modificadores rápidos, cobro bimoneda, arqueo firmado por usuario. **Sin despacho de comandas por red** (S8.1).
2 → la demostración: cada plato lleva su receta y cada venta descuenta sus ingredientes. Aquí va el clip (S12).
3 → respuesta condensada en palabras del home + la condición ("la terminal quedó configurada con tu catálogo") y el enlace a `/software-pos/sin-internet/`; **no** la lista completa.
4 → una línea de mecánica (consecutivo que no se puede saltar, nada se borra, anulación con motivo) + la división (la autorización la posee el contribuyente) + enlace al hub fiscal.
5 → orientación sin tabla: depende de terminales y de si activas recetas; los planes están en `/precios/`.
6 → S9.
7 → demo con escenario armado + WhatsApp.

### S7. Profundidad
Puede exceder las ~120 palabras por H2 del home: cada bloque responde una pregunta del operador (¿aguanta hora pico? ¿descuenta de verdad? ¿factura bien? ¿cuánto y cómo empiezo?). **El diferenciador se demuestra, no se lista.**

### S8. Guardia de claims: 10 prohibiciones (verbatim del brief §5.5)
1. **Despacho de comandas a cocina por red, pantallas de cocina (KDS) y coordinación entre terminales — NO.** No son capacidades vigentes (#993, #994). Formulación obligatoria, la misma del home: **"el pedido queda registrado"**, cada comanda con sus modificadores, **sin despacho ni impresora**.
2. **"Facturación impresa" / "imprime en cualquier ticketera" — NO.** La impresión externa no está implementada (#983); hoy solo la impresora integrada Sunmi/iPOS. Reemplazo obligatorio: **"factura con la mecánica que exige la DT 09-2007"**. Nunca "factura electrónica".
3. **"Sistema autorizado por la DGI" / "cero multas" / miedo fiscal — NO.** La autorización la posee el contribuyente. Ninguna venta con miedo.
4. **"Nunca pierdes una venta" / "100% sincronizado" / continuidad absoluta — NO.** Condicionada a terminal enrolada y catálogo cargado; sincronización eventual.
5. **Gestión de propinas como capacidad — NO.** No hay evidencia de producto en el repositorio; el tema es de `/software-pos/caja/` cuando exista y con verificación previa.
6. **Método de inventario detallado — NO aquí.** Kardex con costo promedio ponderado, merma teórica vs física, conteos y marco Ley 822 / NIC 2 son de `/inventario/`. Esta página enuncia el descuento por venta y el recálculo de costo, y enlaza.
7. **Tabla de precios y comparación de planes — NO.** Viven en `/precios/`; aquí solo orientación con anchor.
8. **Precios y kits de hardware, BYOD y su precio — NO.** Se cotiza; BYOD solo cuando la impresión externa esté aceptada.
9. **Exportación contable, consolidación multi-sucursal, integración bancaria, gestión de rutas — NO.** No se venden; nada que lea como hoja de ruta.
10. **Vocabulario interno — NO.** Nunca "entitlements", números de issue, "go-live", "multi-tenant", "outbox", ni "catálogo hidratado" sin su traducción del dueño (**"la terminal quedó configurada con tu catálogo"**).

**Y la guardia de escala de S5b**, que es nueva: nada que asuma un restaurante grande.

### S9. FAQ: 7 preguntas + `FAQPage` en paridad celda por celda
1. `¿Sirve para un restaurante con mesas y para llevar?`
2. `¿Cada plato descuenta sus ingredientes de verdad?`
3. `¿Qué pasa si cambia el precio de un insumo?`
4. `¿Y si se cae el internet en hora pico?` — una línea + enlace al hijo.
5. `¿Sirve para la DGI?` — línea de mecánica + división + enlace al hub fiscal.
6. `¿Mis muchachos lo aprenden rápido?` — capacitación incluida en la implementación, **alcance según el documento de precios** (no inventes horas).
7. `¿Cuánto cuesta al mes?` — una línea + enlace a `/precios/`.

**Regla GEO heredada:** entidad y mercado en la primera frase. **Cada respuesta visible idéntica carácter por carácter al `text` del JSON-LD** (comparando entidades HTML decodificadas: `&amp;` renderiza `&`).

### S10. Meta
- **Title (≤60):** `Sistema POS para restaurante en Nicaragua | NHILOS POS` — **54**.
- **Description (≤155):** `POS para restaurante que sigue cobrando sin internet: cada plato vendido descuenta sus ingredientes, con costo por plato. Demo con tu menú. NHILOS POS.` — **151**.
- `canonical` = `https://nhilospos.com/software-pos/restaurantes/`.

**No metas "comidería" en el title ni en la description:** el espacio de 60 caracteres es del término que se teclea. La amplitud se gana en el cuerpo, con su H3, y en el H1 que ya nombra al que cocina.

### S11. "Mesa" es una capacidad real — verificada, no heredada
El brief habla de venta "en mesa y mostrador" y **está verificado en código**: `RestaurantTableEntity` (con áreas, `table_number`, `capacity` y estados `DISPONIBLE/OCUPADA/POR_COBRAR/RESERVADA`), la vista `apps/pos_app/lib/ui/features/sales/tables/table_layout_view.dart` con **"Control de Mesas"**, y `sale_view.dart` pasando `tableId` al registrar la venta.

Consecuencia: la página **puede** hablar de mesas y del control de mesas. **No puede** ilustrarlo con una captura que no existe (S12) ni prometer plano de salón con reservas si no lo ves en esa vista.

### S12. Evidencia: lo que hay y lo que falta
| Sección | Pieza | Qué prueba | Límite |
|---|---|---|---|
| H2 2 (diferenciador) | `media/dsh_bom_recetas.13330051.mp4` + `dsh_bom_recetas_poster.7fa0d248.webp` | El costo de "Capuchino Vainilla 12oz" pasa de `C$24.50` **tachado** a `20`, con el aviso **"Costo recalculado en Kardex (NIC 2)"** | no muestra la venta ni el descuento de insumos; es el **recálculo**, no la venta |
| H2 2 (alternativa estática) | `media/dsh_16_recetas_bom.webp` | Tarjetas con "Costo receta: C$8.10" / "C$27.20", rendimiento, precio, "Receta v1 activa", "3 ingredientes" | lista estática, sin recálculo |
| H2 1 H3 mesa/mostrador | **NO EXISTE CAPTURA** | — | dejar `<!-- media-slot: control-mesas — falta captura del Control de Mesas con una mesa ocupada -->` |

**El clip de recetas ya se usa en el hub y en `/inventario/`.** Se usa aquí **porque es la única prueba real del diferenciador**, y con una diferencia: en el hub ilustra "los dos modos de vender", en `/inventario/` el recálculo del costo, y **aquí el costo por plato como decisión de menú**. El `alt` y el epígrafe deben hablar de esto último, no repetir el epígrafe de otra página. Etiqueta obligatoria: **"Grabación real del panel web · datos de demostración"**.

**Material ideal que falta (para la fase de capturas, no para esta entrega):**
1. **Control de Mesas** con una mesa OCUPADA y su pedido abierto — prueba la operación de mesa, hoy solo verificable en código.
2. **Una venta que descuenta insumos**, con la fila del kardex apareciendo después — prueba el diferenciador completo, no solo el recálculo.
3. **Un mostrador pequeño real** (comidería, fritanga, ventana de cocina) — el material que hoy no existe y que S5b pide: el segmento se reconoce en su escala, no en la de un restaurante de mantel.

### S13. Enlazado interno
**Saliente:** `/software-pos/` (breadcrumb + `BreadcrumbList` de 3 niveles), `/inventario/` (`control de inventario y kardex: recetas, insumos y merma`), `/facturacion-dgi/` (anchor del hub), `/software-pos/sin-internet/` (`cómo sigue la venta sin internet: POS sin conexión`), `/precios/` (`ver planes y precios de NHILOS POS`), `/demo/` (`solicitar una demo con el menú de tu restaurante`).
**Aún no existen** → **texto plano con comentario**: `/inventario/restaurantes/`, `/facturacion-dgi/restaurantes/`, `/software-pos/caja/`, `/software-pos/multisucursal/`. Cero enlaces rotos.

### S14. Medición (nombres exactos)
`restaurante_llega_recetas`, `restaurante_clip_costo` (reproducción del clip), `faq_restaurante_abre`, `cta_demo_restaurante`, `cta_whatsapp_restaurante` (UTM `utm_medium=restaurantes`). Sin analítica instalada: solo `data-event`.

### S15. Estructura técnica
Shell de las siete páginas: `<head>`, spine, breadcrumb `Inicio / Software POS / Restaurantes`, volver arriba, footer, WhatsApp. JSON-LD con `FAQPage`, `BreadcrumbList` (3 niveles) y `Organization`. Tokens solo existentes. Reveal visible sin JS; clip con `poster` y sin reproducción automática con `prefers-reduced-motion`.

### S16. Patrones de sección: inventar, no repetir
Ya usados (**no repetir**): hero con fork, ledger, banda comparativa, cinta de precio, líneas de tarifa, tabla de planes, fichas de plan, banda de riesgo, pares asegurados, tira de setup, píldoras de hardware, escalera, secuencia de anulación, tres capas normativas, tabla de división, fórmula del costo, par merma, tabla de packs, proceso en tres pasos horizontales, **par de honestidad** (qué sigue / qué no es instantáneo), **fila de segmentos** (demo), **bloque "lo que recibes / lo que no recibes"** (demo), **línea de tiempo del peor momento** (offline).

Candidatos propios de esta página: **diccionario de formatos** (cada formato con lo que ve: comidería, fritanga, comedor, food park con cocina, restaurante pequeño), **plato que se desarma** (receta → insumos → costo, mostrado como mecánica), **antes/después del cambio de precio de un insumo**. Nombralo en el commit; si no se puede nombrar ni mostrar un cambio de estado legible a 390 px, no va.

### S17. Suite propia, mínimo 27 guardias
1. H1 verbatim **con** segmento (aquí sí). 2. Los 8 H2 verbatim y en orden. 3. Los 4 H3 verbatim. 4. Title/description con límites y **sin** comidería/fritanga (S10). 5. Canonical + `og:title`. 6. Respuesta rápida en los primeros 150 px. 7. Las 10 prohibiciones de S8 ausentes. 8. **Anti-escala (S5b):** ausentes "sucursales", "franquicia", "varios salones", "salón VIP", "múltiples áreas", "sommelier", "carta de vinos". 9. **Reconocimiento (S5b):** al menos **cuatro** de los formatos pequeños presentes en el texto visible. 10. La escalera (modo simple → recetas) presente. 11. "El pedido queda registrado" para comandas; **cero "despacho"** y cero KDS. 12. Paridad `FAQPage` celda por celda. 13. Las 7 preguntas en orden. 14. **Cero "nunca pierdes", "100%", "instantáneo"**. 15. **Cero "catálogo hidratado" / "outbox"** sin traducción. 16. El clip referenciado existe con sus dimensiones/poster; etiqueta de demostración. 17. El **slot de control de mesas** documentado con `media-slot:` y **ninguna imagen haciéndose pasar por él**. 18. Rutas relativas en el artboard. 19. `faq-cell`/`demo-tag` reutilizados, sin patrones de S16 repetidos. 20. Todo `var(--*)` existe. 21. Cero rayas (—). 22. Voz: cero narración de sitio. 23. Vocabulario interno prohibido. 24. `PAGES` + `design.json` con la ruta de tres niveles. 25. Sin nombres de personas. 26. WhatsApp + CTA con el patrón del sitio. 27. **Cero voseo** ("vos", "tenés", "podés", "calcen"): el sitio habla de tú.

### S18. Voz y estilo
El copy habla de la operación del lector, nunca del sitio. Cero rayas. Cero vocabulario interno. `BOM` fuera del visible (puede ir en `alt`/`title` si una pantalla se llama así). **IVA:** solo el del cliente; nada sobre nuestro precio. **Cero voseo.** Nada que suene a hoja de ruta.

### S19. Accesibilidad y móvil
Objetivos ≥44×44. Contraste AA. Un clip con `poster`, `preload="metadata"` y `prefers-reduced-motion` respetado. Bandas medidas, no asumidas. Reveal `threshold: 0` + `rootMargin '0px 0px -8% 0px'`.

### S20. Test-first
Cada guardia nace roja contra un defecto real. En el reporte: por guardia, qué falló y por qué.

### S21. Build
**Debe** fallar si falta un asset, si la hoja no está hasheada o si queda una referencia relativa. Arreglá la causa; no desactives el guardia. **No publiques** sin autorización.

### S22. Commits
Conventional Commits en inglés, ~400 líneas por unidad, código + tests + doc juntos.

### S23. Definición de terminado
1. Artboard con 8 H2 y 4 H3. 2. Suite propia verde con RED probado. 3. Las siete suites existentes verdes (198 guardias). 4. Build sin fallar y la ruta de tres niveles emitida. 5. `PAGES` y `design.json` actualizados. 6. El clip auditado con su etiqueta; el slot de mesas documentado. 7. Reporte de cierre con lo omitido y su spec.

---

## Tasks

| ID | Specs | Ruta | Commit sugerido |
|---|---|---|---|
| T1 | S1, S15 | Artboard con shell, spine, breadcrumb de 3 niveles, tokens; `PAGES` + `design.json`; suite vacía | `feat(web): scaffold the restaurant segment page` |
| T2 | S5, S5b, S6 | H1, H2 1 y el H3 de reconocimiento con los formatos pequeños y la escalera | `feat(web): recognition block for kitchens of any size` |
| T3 | S6, S11 | H3 mesa y mostrador, con el control de mesas verificado y sin captura falsa | `feat(web): table and counter in one operation` |
| T4 | S6, S12 | H2 2 del diferenciador con el clip auditado y sus dos H3 | `feat(web): recipes that deduct per dish sold` |
| T5 | S6 | H2 3, 4 y 5: contingencia condensada, fiscal en una línea y costo orientado | `feat(web): contingency, invoicing and cost orientation` |
| T6 | S9, S10 | FAQ de 7 + `FAQPage` en paridad + meta + breadcrumb schema | `feat(web): restaurant FAQ with schema parity` |
| T7 | S17 | Suite completa, cada guardia en RED | `test(web): restaurant page guard suite` |
| T8 | S19, S20, S21 | Móvil medido, accesibilidad, build, capturas a 1440 y 390 | `fix(web): restaurant page mobile bands and build` |
| T9 | S23 | Reporte de cierre | — |

---

## Lo que se va a revisar (checklist del padre)

1. Los 8 H2 y 4 H3 **contra el brief**, palabra por palabra.
2. **Que el cuerpo no hable solo de restaurante grande:** voy a contar los formatos pequeños y a buscar cifras de escala.
3. Que la escalera (empezar simple, activar recetas) esté dicha como opción, no como carencia.
4. Que "el pedido queda registrado" sea la formulación de comandas, sin despacho ni KDS.
5. Que el clip esté descrito por lo que muestra (recálculo) y no como si mostrara la venta.
6. Que el slot de mesas esté documentado y **ninguna otra imagen se disfrace** de control de mesas.
7. Paridad GEO celda por celda, con entidades decodificadas.
8. Que la suite cace defectos inyectados: voy a colar "sucursales", un KDS, un "nunca pierdes" y un "vos".
9. Que las 198 guardias existentes sigan verdes y que la ruta de tres niveles resuelva.
10. Lectura completa de voz.

---

## Log

- **L1.** Pedido del fundador, verbatim: *"terminemos las paginas hijas y luego nos centramos en los clips/capturas/producciones, porque las que tenemos quizás no sean las mejores y debemos sacar unas más ideales. Prepara el odd para /restaurantes/, aquí me gustaría hacer énfasis que a como puede ser restaurante, puede ser comiderías, foodparks con comida y negocios pequeños incluso, no necesariamente un restaurante grande."* Las dos partes del pedido están recogidas: S5b para el énfasis, y S12 con la lista de material ideal para la fase siguiente.
- **L2.** Mapeo de la guía SEO de 7 pasos: **1 avatar** → el que cocina y vende, de la comidería al restaurante, con la operación como miedo real (hora pico) = S2, S5b; **2 keywords** → S3 (única página que posee el segmento); **3 arquitectura** → S1, S13 (ruta de tres niveles); **4 encabezados** → S6, en el orden reconocimiento → diferenciador → continuidad → fiscal → costo; **5 contenido** → S7, S8, S11; **6 FAQ para LLMs** → S9; **7 prototipo + schema** → S15, S16 + paridad de S9.
- **L3.** **"Mesa" verificado en código, no heredado del brief:** `RestaurantTableEntity` (áreas, número, capacidad, estados), `table_layout_view.dart` con "Control de Mesas" y `sale_view.dart` con `tableId`. La página puede afirmarlo; lo que no puede es ilustrarlo, porque **no hay captura** del control de mesas.
- **L4.** **El vocabulario nicaragüense de negocio pequeño ya está en el sitio:** "pulpería" aparece en el home y en `/precios/`. "Comidería" y "fritanga" pertenecen al mismo registro, así que S5b no introduce un cuerpo extraño: completa lo que ya existe.
- **L5.** El clip de recetas se usa por **tercera vez** (hub, inventario, aquí). Se admite porque es la única prueba real del diferenciador, con una condición: el epígrafe de esta página habla del **costo por plato como decisión de menú**, no repite el de las otras. Y queda anotado como deuda de material: lo ideal es una captura de la venta descontando insumos, no solo el recálculo.
- **L6.** Tres piezas de material ideal **no existen** y quedan para la fase que el fundador anunció: control de mesas con mesa ocupada, venta con descuento de insumos vista en el kardex, y **un mostrador pequeño real** (comidería, fritanga, ventana de cocina). La tercera es la que hace visible S5b: hoy todo el material del sitio muestra una cafetería de marca propia, no la escala del negocio pequeño.
- **L7.** Guardia 27: **cero voseo**. Se cazó a mano en el home y en `/demo/` en la revisión anterior; esta página lo lleva como guardia desde el principio, porque el registro del sitio es tuteo neutro.
