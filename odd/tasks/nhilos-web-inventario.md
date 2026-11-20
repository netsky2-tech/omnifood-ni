# `/inventario/` — hub de inventario del sitio NHILOS POS

Ruta publicada `/inventario/`, artboard `design/nhilos-web-foundation/09-inventario.html`. Fuente de verdad: `docs/nhilos/web/nhilos_web_page_briefs_v1.0.md` **§8** + `docs/inventario_marco_normativo.md` (R-01…R-07) + la guía SEO de 7 pasos. Junto con el hub fiscal, **la página con más riesgo de sobreafirmación de valuación**: aquí es donde el mercado dice "cumple la Ley 822" y donde una frase de más convierte una brecha en una propiedad del producto.

---

## 0. Encargo, límites y cómo trabajar

**Qué se construye:** una página nueva, hermana de `05-home-geo.html`, `06-software-pos.html`, `07-precios.html` y `08-facturacion-dgi.html`. Explica **de dónde sale el número** (método, kardex, costo promedio ponderado) y sostiene la disciplina de tres capas del marco normativo.

**Qué NO se toca:**
- Las cuatro páginas existentes ni sus suites (`nhilos-{home,software-pos,precios,facturacion-dgi}-artboard.test.mjs`).
- `design/nhilos-web-foundation/assets/site.css` y `site.js`, salvo patrones que ya son sistema (spine, breadcrumb, botones, `faq-cell`, `demo-tag`). Los patrones nuevos van en un `<style>` de la página, dentro del artboard.
- El producto (`apps/`). Esta tarea es solo sitio web.
- El IVA del cliente en pantallas, capturas y `alt` (regla del brief §2.9: la prohibición es sobre **nuestros precios**).

**Comandos** (desde la raíz del repo):
```
node --test scripts/__tests__/nhilos-inventario-artboard.test.mjs   # tu suite
node --test scripts/__tests__/nhilos-facturacion-dgi-artboard.test.mjs  # no debe romperse
node scripts/build-nhilos-web.mjs
```

**Cómo trabajar (no negociable):**
1. **Test-first.** El guardia se escribe antes que la sección y **se ve fallar** (RED).
2. **Verificá el artefacto, no el mensaje de tu script.** Si algo dice "listo", abrí el archivo y comprobalo.
3. **Ninguna capacidad sin evidencia.** Si no podés verificar una celda contra código, **quitá la fila**; no la suavices con adjetivos.
4. **No inventes material.** Solo capturas reales; cero mockups, cero HTML que simule una pantalla.
5. **El brief manda** sobre esta spec.

---

## Specs

### S1. Página, ruta y fuente de verdad
- Ruta `/inventario/`; fuente `design/nhilos-web-foundation/09-inventario.html`; salida `dist/nhilos-web/inventario/index.html`.
- Entrada en `PAGES` (`scripts/build-nhilos-web.mjs`) con `source`, `out`, `url: "/inventario/"`, `title`; registro del artboard en `design/nhilos-web-foundation/design.json`.
- El artboard referencia `assets/site.css` y `assets/site.js` **en relativo**; el build los absolutiza y hashea.

### S2. Tono y disciplina de tres capas (verbatim del brief §8)
> **Este hub orienta y sostiene el marco; los hijos detallan el método por segmento.**

Obligatorio en **todo** el copy:
- **NORMA** — se enuncia con su fuente (Ley 822 art. 44; Reglamento de la Ley 822 art. 33; NIC 2 §23–25) y **como obligación del negocio**.
- **PRÁCTICA** — lo que el rubro hace, declarado como práctica.
- **DECISIÓN / estado del sistema** — lo que el producto hace hoy, explicable, **nunca disfrazado de norma**.

Ninguna capa se mezcla con otra en la misma frase.

### S3. Keywords: una primary y dueños explícitos (brief §8.1–8.2)
- **Primary:** `sistema de inventario Nicaragua` — literal en el H1.
- Secundarias propias: `software de inventario Nicaragua`, `sistema kardex Nicaragua`, `sistema POS con control de inventario y merma`.
- **NO persigue, con dueño:** `sistema de inventario para restaurante` y toda la familia de restaurante (`control de inventario restaurante`, `kardex de restaurante`, `inventario de cocina`, `sistema POS inventario`) → `/inventario/restaurantes/`; `* para food park` → `/inventario/food-parks/`; `cómo controlar la merma`, `cómo calcular el costo de un platillo` → `/recursos/merma/` y `/recursos/costeo-recetas/`; `sistema de facturación DGI` → `/facturacion-dgi/`; `sistema POS para restaurante` → `/software-pos/restaurantes/`; `precio`, `cotización` → `/precios/`; `demo` → `/demo/`.
- **Retail** (`inventario para tienda / conveniencia / miscelánea`): **sin URL todavía**. El modo reventa se nombra en texto, **nunca como encabezado-target**.
- **Regla dura:** el hub **no usa como encabezado** la primary de su hijo de restaurante.

### S4. Respuesta rápida en los primeros 150 px (verbatim, con corrección de puntuación declarada)
> Cada venta descuenta lo que consumió, el plato por su receta, el producto de reventa por su stock, con kardex y costo promedio ponderado, conteos y merma teórica vs física. El marco que exige la ley (Ley 822 art. 44, Reglamento art. 33, NIC 2) explicado; la valuación fiscal la cierra tu contador.

**Corrección declarada:** el brief usa rayas (`— el plato por su receta… —`). El sitio las prohíbe (S19), así que la puntuación pasa a comas y **las palabras no cambian**.

### S5. H1 (verbatim)
`Sistema de inventario en Nicaragua: cada venta descuenta lo que consumió`

### S6. Jerarquía: 8 H2 y 3 H3, verbatim y en este orden
1. `¿Qué es NHILOS POS para tu inventario?`
   - H3: `Productos que se preparan: recetas e insumos`
   - H3: `Productos que se revenden: stock simple`
2. `¿De dónde sale el costo? El kardex y el costo promedio ponderado`
3. `Lo que la ley exige a tu inventario (y cómo se cumple)`
   - H3: `Qué hace el sistema y qué le corresponde a tu negocio y a tu contador`
4. `Merma teórica vs física, sin detener la operación`
5. `¿Y la facturación? Cada venta descuenta y emite su comprobante`
6. `¿Cuánto cuesta el control de inventario?`
7. `Preguntas frecuentes sobre el sistema de inventario`
8. `Solicita una demo con tu inventario real`

Contenido por sección: brief §8.4, punto por punto. Lo que no se puede omitir:
1 → definición en 100–150 palabras: el inventario vive dentro del POS; cada venta descuenta en el momento, en receta o en stock simple. Los dos modos son la escalera del posicionamiento.
2 → el kardex registra cada entrada con su costo y cada salida al **costo promedio ponderado** del momento; los reportes de valorización salen de ahí. **"Kardex valorizado" es del plan Pro**; en Retail el término publicado es "kardex, costo promedio ponderado" (ver S12).
3 → el marco en tres capas (S2) con las fuentes citadas; **el sistema hoy** lleva el registro operativo y **sí** valúa al menor entre costo y un precio de mercado declarado por insumo con fecha de vigencia, registrando el castigo; **no** registra la autorización de cambio de método ni emite listas firmadas por hoja.
4 → la comparación automática contra conteos: lo que la receta dice que debía usarse contra lo que el conteo encuentra. La comparación **depende de que las recetas estén bien definidas** — decilo.
5 → una línea de unión: la venta que descuenta insumos es la misma que emite el comprobante; el método fiscal es de `/facturacion-dgi/`.
6 → el control vive en los packs: **Retail** (kardex, costo promedio ponderado, proveedores, compras, conteos, mermas, alertas, código de barras, lotes/vencimiento) y **Cocina** (recetas/BOM, subrecetas, producción, márgenes por plato), **US$39 al mes cada uno** según plan; "kardex valorizado" y reportes de margen son del plan **Pro**. La tabla completa vive en `/precios/`.
7 → S10.
8 → demo con kardex, descuento por receta y un conteo, datos etiquetados, + WhatsApp.

### S7. Profundidad
El hub puede exceder las ~120 palabras por H2 del home en dos terrenos y **solo** en dos: educación de método (de dónde sale el costo, qué es el descuento por venta, qué es la merma teórica vs física) y educación del marco normativo. Fuera de eso, la disciplina del home.

### S8. Guardia de claims: 10 prohibiciones (verbatim del brief §8.5)
1. **"Cumple la Ley 822 art. 44 en la valuación" como propiedad automática — NO.** El sistema valúa al menor entre costo y un precio de mercado **que el negocio declara** por insumo con fecha de vigencia, y registra el castigo; sin precio declarado, la referencia es el último costo de compra. Se describe el mecanismo; la conformidad del caso concreto la firma el contador. Prohibido el "cumple" absoluto, igual que el "autorizado por la DGI".
2. **"Cambio de método de valuación con autorización DGI registrada en el sistema" — NO.** No existe superficie ni entidad para registrarla (R-02). La ley exige autorización por escrito: obligación del negocio, nunca función.
3. **"Listas de conteo firmadas y fechadas por hoja" / "el conteo emite el artefacto del art. 33" — NO.** Existen sesiones de conteo; no emiten ese artefacto (R-05, parcial).
4. **"Entrega a la DGI los registros del Reglamento art. 33" / exportación para la Administración — NO.** No existe (R-06).
5. **"Kardex valorizado" en contexto Esencial o Retail — NO.** En Retail el kardex se publica como "kardex, costo promedio ponderado"; "kardex valorizado" es de **Pro**.
6. **UEPS mal explicada — NO.** La mención exacta: la Ley 822 admite costo promedio, FIFO y UEPS; bajo NIC 2 la UEPS no es admisible. El sistema opera **costo promedio ponderado**; no ofrece UEPS y **no** se afirma que solo FIFO y promedio sean legales.
7. **FEFO / rotación por lote como obligación legal — NO.** Es **práctica de rubro**: se declara como práctica si se menciona.
8. **"Merma cero" / "control total de la merma" / "inventario exacto siempre" — NO.** La claim es la **comparación** teórica vs física, no un resultado garantizado.
9. **"Inventario en tiempo real entre sucursales" / consolidación multi-local — NO.** No se vende.
10. **Estándar transversal — NO:** "facturación impresa", "factura electrónica", "sistema autorizado por la DGI", "cero multas", "nunca pierdes una venta", "100% sincronizado", precios de hardware o BYOD, KDS, y **ningún vocabulario interno**: ni números de issue, ni **"R-01"…"R-07" como texto visible**, ni **"CPP" sin traducir** a "costo promedio ponderado", ni "entitlements", "go-live", "backlog", "sprint", "hotfix". Nada que suene a hoja de ruta.

### S9. La división de responsabilidad (H2 3, H3)
Dos columnas, misma disciplina que el hub fiscal:
- **Izquierda, registro operativo verificado**: kardex con costo promedio ponderado, descuento por venta, sesiones de conteo, merma teórica vs física, lotes y vencimiento del pack Retail, y la valuación al menor entre costo y un precio de mercado declarado por insumo con vigencia, con castigo registrado.
- **Derecha**: la conformidad fiscal del caso concreto, la autorización escrita de cambio de método, el inventario físico anual con listas firmadas, y la respuesta ante la Administración.

**Cada celda de la izquierda se verifica contra el producto antes de publicar.** Ver S11 para el estado real de R-01: el mecanismo existe (código y rutas), y **ninguna captura lo muestra**.

### S10. FAQ: 7 preguntas verbatim + `FAQPage` en paridad celda por celda
1. `¿Cómo descuenta el inventario al vender?` — receta o stock simple.
2. `¿De dónde sale el costo?` — kardex y costo promedio ponderado.
3. `¿El sistema cumple la Ley 822 para la valuación?` — **respuesta precisa**: valúa al menor entre costo y el precio de mercado que declares por insumo con su fecha de vigencia, y registra el castigo; la conformidad del caso concreto la firma el contador.
4. `¿Puedo cambiar de método de valuación en el sistema?` — la ley exige autorización escrita de la Administración; **el sistema no promete ese registro hoy**; conversación con el contador.
5. `¿Qué es la merma teórica vs física?` — definición llana + qué compara el sistema.
6. `¿Sirve si no tengo recetas?` — modo simple.
7. `¿Cuánto cuesta?` — packs + enlace a `/precios/`.

**Regla GEO heredada:** entidad y mercado en la primera frase ("NHILOS POS…", "…en Nicaragua"). **Cada respuesta visible idéntica carácter por carácter al `text` del JSON-LD**; toda edición se replica en el mismo commit.

### S11. Estado real del producto: verificá, no repitas lo que diga un documento
- **R-01 no es una brecha: el mecanismo está entregado.** `InventoryValuationService.setMarketPrice` (`inventory-valuation.service.ts:182`) fija el precio de mercado por insumo con fecha de vigencia; `applyLowerOfCostWritedown` (`:333`) dispara el castigo con asiento compensatorio; las rutas viven en `inventory-reports.controller.ts`: `POST valuation/market-price` y `POST valuation/writedown`.
- **Pero ninguna captura lo muestra** (verificado, S13). Por eso: se describe el mecanismo y **no se ilustra con una pantalla que no lo prueba**.
- **Siguen siendo brechas y no se prometen:** R-02 (registro de autorización de cambio de método), R-05 parcial (listas firmadas por hoja), R-06 (exportación para la Administración). R-03, R-04 y R-07 tampoco se prometen.
- Si encontrás una contradicción entre un documento del repo y el código, **gana el código** y anotalo en el reporte.

### S12. Paridad de precios con `/precios/` (congelada por guardia)
- Packs: **US$39 al mes cada uno** (Retail, Cocina).
- **"Kardex valorizado"** y reportes de margen: **plan Pro**.
- La tabla completa **no se duplica** aquí: se enlaza (`ver planes y precios de NHILOS POS`).
- Guardia: los importes que menciones deben ser un subconjunto exacto de los que publica `/precios/`; si `/precios/` cambia, esta página falla y hay que sincronizarla.

### S12b. Meta (verbatim del brief §8.8)
- **Title (≤60):** `Sistema de inventario en Nicaragua · Kardex y merma | NHILOS`
- **Description (≤155):** `Cada venta descuenta lo que consumió: kardex con costo promedio ponderado, conteos y merma teórica vs física. El marco legal, explicado. Pide una demo.`
- `og:title` y `og:description` espejan el title y la description; `canonical` = `https://nhilospos.com/inventario/`.
- Comprobá los límites en el test: 60 y 155 caracteres. Si el brief cambia una de las dos, la guardia de la suite falla y hay que resincronizar **en el brief, no solo en la página**.

### S13. Evidencia real: qué prueba cada archivo (auditado leyendo cada uno)
| Sección | Archivo | Dimensiones | Qué se ve **literalmente** en pantalla | Qué **no** prueba |
|---|---|---|---|---|
| H2 2 (costo y kardex) | `media/dsh_15_inventario.webp` | 1440×900 | Pestaña **Valoración**: "VALORACIÓN TOTAL C$29,175.00", "TOTAL ITEMS 6", "CON STOCK 6", "STOCK BAJO 0"; columnas ITEM / UOM / **STOCK / COSTO PROM. / VALORACIÓN** con seis insumos (Café en Grano Tostado, Leche Entera, Plátano Verde, Pulpa de Pitahaya, Quesillo, Sirop Vainilla) | ni sesión de conteo, ni campo de precio de mercado, ni castigo |
| H2 2 (movimientos) | `media/dsh_23_kardex_movimientos.webp` | 1440×900 | Pestaña **Kardex**, filtros (Venta, Anulación Venta, Compra, Mermas, Producción, Ajuste, Reversión, **Castigo por valuación**, Stock inicial), "Mostrando 1-7 de 7 movimientos", columnas Fecha / Item / UOM / Tipo / Cant. / **Costo Unit. / ANTES / DESPUÉS**, filas de Mermas (−50, −500) y cinco de Venta con 45,000→44,860 | **ninguna fila de castigo ejecutada** (solo el filtro existe); el Costo Unit. es el promedio, **no** un precio de mercado |
| H3 1 (recetas) — prueba en video | `media/dsh_bom_live_loop.mp4` (+ `media/dsh_bom_recetas_poster.7fa0d248.webp`) | clip corto | Pantalla **Recetas y BOM**; el costo de "Capuchino Vainilla 12oz" pasa de `C$24.50` **tachado** a `20`, con el aviso **"Costo recalculado en Kardex (NIC 2)"** | no muestra edición de precio de insumo a mano ni el kardex del lote |
| H3 1 alternativa estática | `media/dsh_16_recetas_bom.webp` | 1440×900 | Tarjetas con "Costo receta: C$8.10" (Café Americano), "C$27.20" (Capuchino), Rendimiento, UOM, Precio, "Receta v1 activa", "3 ingredientes" | **ningún recálculo**: lista estática |

**No existe captura verificada de una sesión de conteo con cantidades ingresadas**, ni del campo de precio de mercado, ni de un castigo ejecutado. Para la sección de merma (H2 4) **no inventes ni reutilices una pantalla que no lo prueba**: dejá el slot documentado con `<!-- media-slot: conteo-sesion — falta captura de una sesión de conteo con cantidades -->` y escribí la sección con texto.

**Alt:** describe lo que se ve, con las palabras reales de la pantalla. **No** atribuyas a una captura lo que no muestra: el filtro "Castigo por valuación" **no** es un castigo ejecutado; la columna "COSTO PROM." **no** es precio de mercado. Etiqueta obligatoria junto a cada captura o video: **"datos de demostración"**.

**El clip ya se usa en el hub** para la forma de vender con recetas. Reusarlo aquí es legítimo **solo** porque prueba otra cosa (el recálculo del costo); el `alt` y el epígrafe deben hablar del recálculo, no de "dos formas de vender".

### S14. Enlazado interno
**Saliente:** `/` (breadcrumb + `BreadcrumbList`), `/facturacion-dgi/` (la mitad fiscal de cada venta), `/software-pos/` (`qué es NHILOS POS: venta local-first`), `/precios/` (`ver planes y precios de NHILOS POS`), `/demo/` (CTA primaria).
**Aún no existen** y van como **texto plano con comentario**: `/inventario/restaurantes/` (anchor `sistema de inventario para restaurante`), `/inventario/food-parks/`, `/recursos/merma/`, `/recursos/costeo-recetas/`. **Cero enlaces rotos.**

### S15. Medición (nombres exactos)
`inventario_llega_kardex`, `inventario_marco_lee`, `faq_inventario_abre`, `cta_demo_inventario`, `cta_whatsapp_inventario` (UTM `utm_medium=inventario`). Si no hay analítica instalada, dejá los `data-event` y **no** agregues scripts de terceros.

### S16. Estructura técnica compartida
Shell idéntico a las otras cuatro: mismo `<head>` base, spine, breadcrumb `Inicio / Inventario`, volver arriba, footer, WhatsApp. JSON-LD con `FAQPage`, `BreadcrumbList` y `Organization`.
**Tokens:** solo `var(--*)` que existan en `assets/site.css`. Un token inventado ya rompió este proyecto en silencio.
**Motion:** patrón de reveal existente; todo elemento con reveal debe verse sin JS.

### S17. Patrones de sección: inventar, no repetir
Ya usados (**no repetir**): hero con fork (hub POS), ledger de tres filas, banda comparativa a-vs-b, cinta de precio, líneas de tarifa, tabla comparativa de planes, fichas de plan (precios), banda oscura de riesgo, pares asegurados, tira de setup, píldoras de hardware, escalera de crecimiento, secuencia numerada de anulación (fiscal), banda de tres capas normativas (fiscal), tabla de división (fiscal).
`faq-cell` **sí** se reutiliza. Todo lo demás es nuevo. Candidatos que este contenido pide: **fórmula del costo** (entrada → costo promedio → salida, mostrada como mecánica), **par merma teórica vs física** (dos números que se comparan), **tabla de packs por capacidad**. Nombralo en el commit; si no se puede nombrar ni mostrar un cambio de estado legible a 390 px, no va.

### S18. Suite propia (`scripts/__tests__/nhilos-inventario-artboard.test.mjs`)
Desde cero, un test por regla, cada uno **RED** antes de cumplirlo. Mínimo 26:
1. H1 verbatim. 2. Los 8 H2 verbatim y en orden. 3. Los 3 H3 verbatim. 4. Title/description verbatim con límites. 5. Canonical + `og:title`. 6. Respuesta rápida en los primeros 150 px. 7. Las 10 prohibiciones de S8 ausentes. 8. Claims heredados ausentes. 9. **"R-01"…"R-07" ausentes del texto visible y del JSON-LD**. 10. **"CPP" ausente** (debe decir "costo promedio ponderado"). 11. Paridad `FAQPage` celda por celda. 12. Las 7 preguntas presentes y en orden. 13. La tabla de división con sus dos columnas. 14. **Paridad de precios con `/precios/`** (subconjunto exacto). 15. **"kardex valorizado" solo en contexto Pro** — y ausente en el contexto Retail. 16. Capturas referenciadas existen con sus dimensiones reales. 17. Etiqueta "datos de demostración" en cada captura/video. 18. **El `alt`/epígrafe del kardex no afirma que muestra un castigo ejecutado ni un precio de mercado**. 19. **No hay ninguna captura citada como sesión de conteo** (no existe). 20. Rutas relativas en el artboard. 21. `faq-cell` reutilizado y ningún patrón de S17 repetido. 22. Todo `var(--*)` existe en `site.css`. 23. Cero rayas (—). 24. Voz: cero narración de sitio. 25. Vocabulario interno prohibido. 26. `PAGES` + `design.json`; WhatsApp y CTA como en las otras páginas; sin nombres de personas.

### S19. Voz y estilo (vinculante)
- El copy habla de **la operación del lector**, nunca del sitio ni de cómo está organizado.
- Cero rayas (—). Cero vocabulario interno. Ningún nombre viejo de proyecto.
- `BOM` **no** aparece en texto visible ni JSON-LD (sí puede ir en `alt`/`title` si una pantalla real se llama así — aquí la pantalla se llama "Recetas y BOM", así que **solo** en `alt`).
- **IVA:** esta página no vende precios; si aparece, es el del cliente (su régimen), nunca una afirmación sobre nuestro precio ("IVA incluido", "aparte", "netos" = prohibidos).
- Nada que suene a hoja de ruta.

### S20. Accesibilidad y móvil
Objetivos táctiles ≥44×44 (el spine ya lo resuelve en `site.css`: no lo pises). Contraste AA. **Bandas de ancho medidas, no asumidas**: si una rejilla de capturas no se lee a 800 px, no la pongas en dos columnas ahí. Reveal con `threshold: 0` + `rootMargin '0px 0px -8% 0px'`.

### S21. Rendimiento
Solo se publica el media referenciado (el build lo hace). No agregues clips ni fuentes nuevas. El clip de recetas ya está commiteado: reusalo, no lo reemplaces por un render nuevo.

### S22. Test-first con RED probado
Cada guardia nace roja contra un defecto real. En el reporte final: por guardia, qué falló y por qué.

### S23. Build
`node scripts/build-nhilos-web.mjs` **debe** fallar si falta un asset, si una hoja no está hasheada, o si una página publicada conserva una referencia relativa a `assets/`/`media/`/`fonts/`. Arreglá la causa; no desactives el guardia. **No publiques** sin autorización.

### S24. Commits
Conventional Commits **en inglés**, ~400 líneas por unidad, código + tests + doc juntos.

### S25. Definición de terminado
1. Artboard completo con 8 H2 y 3 H3. 2. Suite propia verde, cada guardia probada en RED. 3. Las cuatro suites existentes verdes (home 24, hub 36, precios 25, fiscal 27). 4. Build sin fallar y `dist/nhilos-web/inventario/index.html` existe. 5. `PAGES` y `design.json` actualizados. 6. Capturas reales, dimensiones reales, etiqueta de demostración, y **ninguna afirmación que una captura no pruebe**. 7. Slot de conteo documentado si falta. 8. Reporte de cierre: qué se implementó, qué se omitió y por qué (con la spec citada).

---

## Tasks

| ID | Specs | Ruta | Commit sugerido |
|---|---|---|---|
| T1 | S1, S16 | Artboard nuevo con shell, spine, breadcrumb, tokens; `PAGES` + `design.json`; suite vacía | `feat(web): scaffold the inventory page artboard` |
| T2 | S5, S6 | H1 y H2 1 con sus dos H3 (receta vs stock simple) y el clip del recálculo | `feat(web): inventory page intro and the two selling modes` |
| T3 | S6, S11, S13 | H2 2: kardex y costo promedio ponderado con las dos capturas auditadas | `feat(web): kardex and weighted average cost, with real evidence` |
| T4 | S2, S9 | H2 3 y su H3: las tres capas del marco y la tabla de división | `feat(web): the normative framework in three layers` |
| T5 | S6, S13 | H2 4: merma teórica vs física, sin captura inventada | `feat(web): theoretical vs physical shrinkage` |
| T6 | S6, S12 | H2 5 y 6: la unión con facturación y los packs, con paridad de precios | `feat(web): billing bridge and pack pricing` |
| T7 | S10 | FAQ de 7 + `FAQPage` en paridad + meta + breadcrumb schema | `feat(web): inventory FAQ with schema parity` |
| T8 | S18 | Suite completa, cada guardia en RED | `test(web): inventory page guard suite` |
| T9 | S20, S21, S23 | Móvil medido, accesibilidad, build, capturas a 1440 y 390 | `fix(web): inventory page mobile bands and build` |
| T10 | S25 | Reporte de cierre | — |

---

## Lo que se va a revisar (checklist del padre)

1. Los 8 H2 y 3 H3 **contra el brief**, palabra por palabra.
2. Que cada prohibición de S8 esté ausente **y** que no haya un sinónimo nuevo ("conforme a la ley" sin fuente, "cumplimiento garantizado", etc.).
3. Que ninguna captura esté atribuida a algo que no muestra: **voy a leer cada imagen**.
4. Que la sección de merma no tenga una captura de conteo inventada.
5. Paridad GEO celda por celda, y paridad de precios con `/precios/`.
6. **"Kardex valorizado" solo donde corresponde al plan Pro.**
7. Que la suite nueva cace un defecto inyectado: voy a romper una H2, colar un "cumple la Ley 822" y cambiar una respuesta solo en el visible.
8. Que las 112 guardias existentes sigan verdes.
9. Que el build no publique media huérfano y que las rutas se resuelvan como el navegador.
10. Lectura completa de voz: ninguna frase que hable de la página en vez de la operación.

---

## Log

- **L1.** Pedido del fundador, verbatim: *"si pasa todas las pruebas, respeto la guia 7 rebisamos bien los textos, puedes desplegar"* (deploy de `/facturacion-dgi/`, hecho) y *"si, prepara el odd"* para esta página. La implementación se ejecuta fuera de esta sesión (Antigravity) y vuelve al padre para revisión con defectos inyectados, igual que la fiscal.
- **L2.** Mapeo de la guía SEO de 7 pasos: **1 avatar** → brief §8.1 (quien desconfía del número y el contador que lo valida) = S2; **2 keywords** → S3 con dueños y la prohibición de usar la primary del hijo; **3 arquitectura** → S1, S14 (hub de inventario, término cabeza); **4 encabezados** → S6; **5 contenido** → S7, S9, S11; **6 FAQ para LLMs** → S10 con entidad y mercado en la primera frase; **7 prototipo + schema** → S6, S11, S12, S16, S17 + paridad de S10.
- **L3.** Auditoría de material hecha **antes** de escribir la spec (lección L9: la evidencia se elige por lo que la pantalla muestra). Verificado leyendo cada archivo: `dsh_15_inventario` muestra la pestaña Valoración con columnas **COSTO PROM.** y VALORACIÓN (C$29,175.00 sobre 6 ítems); `dsh_23_kardex_movimientos` muestra el kardex con ANTES/DESPUÉS y un filtro **"Castigo por valuación"** pero **ninguna fila de castigo ejecutada**; `dsh_16_recetas_bom` es una lista estática con "Costo receta"; y **`dsh_bom_live_loop.mp4` sí prueba el recálculo**: el costo del Capuchino pasa de `C$24.50` tachado a `20` con el aviso **"Costo recalculado en Kardex (NIC 2)"**.
- **L4.** **No existe captura de sesión de conteo con cantidades**, ni de campo de precio de mercado, ni de castigo ejecutado. El brief §8.1 pide "capturas del kardex y de una sesión de conteo": la segunda no existe, así que la sección de merma va con texto y el slot queda documentado con `media-slot:`. Mejor un hueco declarado que una pantalla que prueba otra cosa.
- **L5.** R-01 verificado **contra el código, no contra la documentación**: `setMarketPrice` (`inventory-valuation.service.ts:182`), `applyLowerOfCostWritedown` (`:333`), y las rutas `POST valuation/market-price` y `POST valuation/writedown` en `inventory-reports.controller.ts`. El mecanismo es real; la página lo describe y **no lo ilustra** porque no hay pantalla que lo pruebe. R-02, R-05 parcial y R-06 siguen siendo brechas y no se prometen.
- **L6.** Paridad de precios congelada: `/precios/` publica "Retail y Cocina, US$39 al mes cada uno" y "kardex valorizado" en contexto Pro. Esta página no duplica la tabla: enlaza, y una guardia compara el subconjunto de importes.
- **L7.** **Defecto del brief, para que nadie lo herede:** hay **dos secciones numeradas §8.6** ("Enlazado interno" y "R-01: la decisión de producto…"). La segunda es la más importante del documento y aparece después de §8.8. La spec cita el contenido, no el número; conviene renumerar el brief cuando se toque.
- **L8.** Corrección de puntuación declarada en S4: el brief usa rayas y el sitio las prohíbe. Cambia la puntuación, no las palabras.
- **L9.** La verificación del propio documento antes de entregarlo cazó una omisión: **faltaba la spec de meta** (title, description, canonical) y la suite de S18 la exige. Se agregó como S12b en vez de renumerar, para que el número viejo —si alguien ya lo citó— no apunte a otra regla. Es el mismo control que se le pide al implementador: comprobar el artefacto, no el mensaje de éxito.
