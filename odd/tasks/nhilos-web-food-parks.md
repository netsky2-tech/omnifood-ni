# `/software-pos/food-parks/` — la página del park, de tres puestos para arriba

Ruta `/software-pos/food-parks/`, artboard `design/nhilos-web-foundation/13-food-parks.html`. Fuente: brief **§6** + la guía SEO de 7 pasos. Segunda y última hija de segmento; su H1 **sí lleva el segmento**, porque lo posee.

Dos cosas manda esta página: **el alcance aprobado del home v1.8** (ni un claim más) y la amplitud del fundador — un food park también puede ser **tres puestos y una misma familia**.

---

## 0. Encargo y límites

**Qué se construye:** la página del park en una ruta de **tres niveles**. Su trabajo: que el dueño o administrador entienda qué cubre una suscripción por park y qué no, sin que ningún claim se ensanche más allá de lo aprobado.

**Qué NO se toca:** las ocho páginas publicadas ni sus suites; `assets/site.css` y `site.js` (salvo spine, breadcrumb, `faq-cell`, `demo-tag`); nada de `apps/`.

```
node --test scripts/__tests__/nhilos-food-parks-artboard.test.mjs
node scripts/build-nhilos-web.mjs
```

---

## Specs

### S1. Ruta, fuente y build
`/software-pos/food-parks/` → `dist/nhilos-web/software-pos/food-parks/index.html`. Ruta de tres niveles: el build absolutiza `assets/`, `media/`, `fonts/` y **falla** si sobrevive una referencia relativa. Entrada en `PAGES` + registro en `design.json`.

### S2. Tono
Comercial-transaccional de segmento, para quien **evalúa gobernanza**: dueño o administrador del park. Sin miedo, sin lenguaje corporativo, sin hojas de ruta.

### S3. Keywords
- **Primary:** `software para food park` — literal en el H1.
- Secundarias: `sistema POS para food park`, `sistema POS para food court`, `administración de food park`, `software para food park en Managua`, `software para food park con múltiples puestos`, `POS para food park vs POS tradicional`.
- **Managua se menciona como mercado, nunca como caso local inventado** (sin dirección, sin cliente, sin hijo `/managua/`).
- **NO persigue:** `sistema POS Nicaragua` → hub; `comida rápida` → `/software-pos/comida-rapida/`; `inventario para food park` → `/inventario/food-parks/` (mientras no exista, el método vive en `/inventario/`); `varias sucursales`, `varios locales`, `reportes por sucursal` → `/software-pos/multisucursal/` — **una cadena no es un park**; `POS sin internet` → `/software-pos/sin-internet/`; `precio`, `cotización` → `/precios/`; `demo` → `/demo/`.

### S4. Respuesta rápida en los primeros 150 px
> Un sistema para todo el park: cada puesto con su catálogo y su cobro, el administrador ve la operación desde el panel web. Puestos de reventa y cocinas con recetas conviven en el mismo sistema. Correlativo DT 09-2007.

### S5. H1 (verbatim del brief)
`Software para food park: cada puesto con su catálogo y su cobro, en un solo sistema`

### S5b. Qué significa "su catálogo" — resuelto contra el código, no supuesto
**Verificado:** `CatalogValue` es un catálogo maestro de **valores** (unidad de medida, categoría de inventario, tipo de producto de venta), no un catálogo de productos por puesto. `Product` tiene `category_code` y **no tiene** puesto, marca ni catálogo propio. Ninguna terminal se limita a una parte del catálogo. Conclusión: **un catálogo por negocio, organizado por puesto mediante categorías.**

**Regla vinculante (el H1 se queda, el cuerpo lo precisa):**
- El H1 y el home v1.8 dicen "cada puesto con su catálogo y su cobro". La página **explica una sola vez, en el primer H2**, que el catálogo es uno y se organiza por puesto: cada puesto tiene su sección, con sus platos y sus precios, y su propia terminal para cobrar.
- **Prohibido:** "catálogo independiente", "catálogo aparte", "cada puesto con su propio catálogo aislado", "inventario por puesto", "stock por puesto", "almacén por puesto". Es la misma familia de G28 de `/restaurantes/`.
- **Prohibido:** prometer precios distintos por puesto como característica "aislada"; los precios son del producto, y eso sí es real.

### S5c. Un park también son tres puestos (amplitud, decisión del fundador)
Precedente del fundador en `/restaurantes/`: *"puede ser comiderías, food parks con comida y negocios pequeños incluso, no necesariamente un restaurante grande."* Aplicado al park:
- Un bloque de reconocimiento nombra **al menos tres** de estos formatos: **park de tres o cuatro puestos**, **patio de comidas familiar** (un solo dueño, varios puestos), **plaza de comidas**, **food court de centro comercial**, **park con locatarios independientes**, **park con un puesto que cocina y otro que revende**.
- **Prohibido asumir escala corporativa:** "cadena de parks", "varios parks", "gerente de operaciones", "departamento de sistemas", "gestión de contratos de locación", "administración de arrendamientos", "control de acceso del centro comercial", "flujo de visitantes", "20 puestos".
- **La simetría que sirve al park pequeño:** el propio brief resuelve que hay dos estructuras soportadas (S7). Un park del mismo dueño **no necesita la historia de locatarios**: una suscripción, sus puestos, sus categorías. La página lo dice así, sin obligarlo a pasar por la gobernanza de un mall.

### S6. Jerarquía: 8 H2 y 3 H3 (verbatim del brief §6.4)
1. `¿Qué es NHILOS POS en un food park?`
   - H3: `Cada puesto: su catálogo, su cobro, su turno`
   - H3 (nuevo, S5c): `Tres puestos o veinte: el park también es pequeño`
2. `¿Cómo opera el administrador del park?`
   - H3: `Roles: el administrador administra, el locatario opera`
3. `Puestos que revenden y cocinas que preparan, en el mismo park`
4. `¿Qué pasa cuando se cae el internet en el park?`
5. `Facturación por puesto conforme a la DT 09-2007`
6. `¿Cuánto cuesta para todo el park?`
7. `Preguntas frecuentes sobre el POS para food parks`
8. `Solicita una demo con la operación de tu park`

Contenido por sección: brief §6.4. Lo que no se puede omitir:
1 → definición de 100 a 150 palabras: el park contrata **una suscripción como negocio**; cada puesto opera su sección del catálogo y cobra en su terminal; la reventa en modo simple y las cocinas con recetas conviven; aquí va la precisión de S5b.
   H3 puestos → catálogo por puesto (sección), cobro bimoneda, arqueo por turno y usuario.
   H3 nuevo → S5c, con los formatos y la simetría del park pequeño.
2 → **la fórmula exacta del FAQ del home, sin ensancharla**: *el administrador del park ve su operación desde el panel web, y las ventas de los puestos llegan al panel cuando la conexión está disponible.* Este es el **techo**: no se reescribe más alto.
   H3 roles → administración del park vs operación del puesto; portal del propietario habilitado al terminar la puesta en marcha, como publica el home.
3 → el caso mixto: un puesto en modo simple junto a una cocina con recetas; el control **se activa por puesto, no por park**. El detalle de recetas y kardex enlaza a `/inventario/`.
4 → cada terminal enrolada sigue cobrando con su catálogo cargado y su correlativo; al volver la red las ventas suben en orden. **Sin coordinación entre terminales** (S8.3). Límites completos → `/software-pos/sin-internet/`.
5 → **cada comprobante de cada puesto sigue la misma mecánica**: numeración consecutiva inalterable, anulación solo con motivo auditado; la autorización la posee el contribuyente que emite; la mecánica completa es de `/facturacion-dgi/`. **No se explica cómo se autoriza fiscalmente cada locatario frente al park** (S8.6).
6 → la suscripción es del negocio, **no por puesto ni por marca**; las terminales adicionales son add-on con enrolamiento, según `/precios/`. Sin cifras propias ni "precio por locatario".
7 → S9.
8 → demo con escenario armado según la operación del park + WhatsApp.

> **Contradicción del brief, declarada (no resuelta en silencio).** El contenido del H2 5 menciona *"libros exportables"*, y la guardia §6.5.8 prohíbe *"exportación contable"* como parte del estándar transversal. Son dos reglas del mismo documento que apuntan a cosas distintas pero que en la página se confunden. **Resolución de esta spec:** no se promete exportación de ninguna clase hasta verificar contra el producto si el libro de ventas es exportable. Se dice lo que sí está verificado: la numeración es consecutiva e inalterable y cada anulación queda auditada. Si el producto exporta libros, se abre una spec aparte con la evidencia — no se publica por analogía.

### S7. Las dos estructuras fiscales: la respuesta a "¿un sistema por puesto?"
El brief lo resolvió y aquí **es la pieza que más convence**, porque contesta la objeción principal sin inventar nada:
- **El park es dueño de sus marcas y factura todo:** un negocio, una autorización, una serie. Soportado.
- **Cada locatario independiente factura lo suyo:** cada uno con su suscripción y su autorización. Soportado.
- **Caja compartida que factura por cuenta de terceros: no se publica como capacidad.** Depende de la topología multi-terminal (#994) y de quién emite; es conversación de implementación.

La página dice **quién emite en las dos primeras**; no insinúa la tercera. **No especifica** el arreglo fiscal entre park y locatarios (S8.6).

### S8. Guardia de claims: 8 prohibiciones (verbatim del brief §6.5)
1. **"Cajas compartidas" / "una sola caja central para todo el park" / "caja común entre puestos" — NO.** No es capacidad; cada terminal cobra lo suyo.
2. **"Vista consolidada de todas las marcas" / "todos tus parks desde el teléfono" / "dashboard de cadena" — NO.** Reemplazo único: la fórmula del administrador de S6. **Es el techo, no se reescribe más alto.**
3. **Coordinación entre terminales por red local / LAN en tiempo real — NO.** #994 abierto. Cada terminal por su lado, sincroniza al reconectar.
4. **KDS / pantallas de cocina / despacho de comandas por red — NO.** #993. En un park la tentación es máxima: prohibida.
5. **Suscripción por puesto o por locatario con precio — NO.** Los precios son por negocio; las terminales adicionales son add-on, y el detalle es de `/precios/`.
6. **Arreglo fiscal park vs locatarios (quién factura, quién está autorizado) — NO especificar.** Solo la mecánica DT 09-2007 y la división mecánica/autorización.
7. **Caso local de Managua — NO inventar.**
8. **Estándar transversal:** "facturación impresa" (#983), "factura electrónica", "sistema autorizado por la DGI", "cero multas", "nunca pierdes una venta", "100% sincronizado", precios de hardware o BYOD, exportación contable, vocabulario interno, números de issue, frases de hoja de ruta.

**Más las guardias nuevas de esta página:** S5b (nada de catálogo o inventario aislado por puesto) y S5c (nada de escala corporativa).

### S9. FAQ: 6 preguntas + `FAQPage` en paridad celda por celda
Las seis del brief §6.4, en su vocabulario y en su orden:
1. `¿Cada puesto necesita su propio sistema?` — no: una suscripción por park, puestos propios en el mismo sistema.
2. `¿Puede el administrador ver la operación del park?` — **la fórmula exacta del home**, sin ensanchar.
3. `¿Un puesto que revende y una cocina pueden usar el mismo sistema?` — sí: modos que conviven.
4. `¿Qué pasa con la facturación de cada puesto?` — mecánica DT 09-2007 + autorización del contribuyente + enlace al hub fiscal.
5. `¿Funciona sin internet?` — fórmula condicionada + enlace al hijo.
6. `¿Cuánto cuesta para el park?` — suscripción por negocio + terminales add-on + enlace a `/precios/`.

**GEO heredada:** entidad y mercado en la primera frase (`En Nicaragua, ...`). **Respuesta visible idéntica carácter por carácter al `text` del JSON-LD**, con entidades decodificadas: `&amp;` renderiza `&`.

### S10. Meta
- **Title (≤60):** `Software para food park en Nicaragua | NHILOS POS` — **49**.
- **Description (≤155):** `Un sistema para todo el food park: cada puesto con su catálogo y su cobro, y la operación visible en el panel web. Pide una demo. NHILOS POS.` — **130**.
- `canonical` = `https://nhilospos.com/software-pos/food-parks/`.

### S11. Evidencia
| Sección | Pieza | Qué prueba | Límite |
|---|---|---|---|
| H2 1 | `media/dsh_bom_recetas.13330051.mp4` + poster | recálculo del costo por plato | es un panel de **un** negocio; no prueba varios puestos |
| H2 3 | `media/dsh_16_recetas_bom.webp` | recetas con costo por plato | estática |
| H2 4 | `media/pos_offline_cola_sync_poster.cf458b78.webp` | venta cobrada con la cola en 1 | un terminal |
| H2 1/2 | **NO EXISTE** captura de dos puestos ni del panel con ventas de dos puestos | — | `<!-- media-slot: dos-puestos — falta captura de dos terminales o del panel con ventas de dos puestos -->` |

**Regla:** ninguna pieza actual prueba el park. La página lo asume: usa las capturas para lo que sí prueban (recetas, cobro, cola) y **documenta el slot** de lo que falta. Etiqueta obligatoria: **"datos de demostración"**.

**Material ideal para la fase de capturas:** dos terminales cobrando a la vez con catálogos distintos por categoría, y el panel del administrador mostrando ventas de ambos puestos.

### S12. Enlazado interno
**Saliente:** `/software-pos/` (breadcrumb + `BreadcrumbList`), `/software-pos/sin-internet/` (anchor del hub), `/inventario/` (`control de inventario y kardex: recetas, insumos y merma`), `/facturacion-dgi/` (anchor del hub), `/precios/` (`ver planes y precios de NHILOS POS`), `/demo/` (CTA).
**No existen todavía** → texto plano con comentario: `/inventario/food-parks/`, `/software-pos/comida-rapida/`, `/software-pos/multisucursal/`. Cero enlaces rotos.

### S13. Medición (nombres exactos)
`foodpark_llega_puestos`, `foodpark_admin_lee`, `faq_foodpark_abre`, `cta_demo_foodpark`, `cta_whatsapp_foodpark` (UTM `utm_medium=food-parks`).

### S14. Estructura y schema
Shell de las ocho páginas: spine, breadcrumb `Inicio / Software POS / Food parks`, volver arriba, footer, WhatsApp. JSON-LD con `FAQPage`, `BreadcrumbList` de 3 niveles y `Organization`. Tokens existentes solo. Reveal sin JS.

### S15. Patrones: inventar
Ya usados, **no repetir**: hero con fork, ledger, banda comparativa, cinta de precio, líneas de tarifa, fichas de plan, banda de riesgo, pares asegurados, tira de setup, píldoras, escalera, secuencia de anulación, tres capas, tabla de división, fórmula del costo, par merma, tabla de packs, proceso horizontal, par de honestidad, fila de segmentos, bloque lo-que-recibes, línea de tiempo del peor momento, **diccionario de formatos** y **plato que se desarma** (restaurantes).

Candidatos propios: **mapa del park** (puestos con su modo: reventa en simple, cocina con recetas, y qué cobra cada uno), **tabla de las dos estructuras fiscales** (S7) —nombrada como tabla de quién emite—, y **frontera de lo que el panel ve y lo que no**. Si no se puede nombrar ni mostrar un cambio de estado legible a 390 px, no va.

### S16. Suite propia, mínimo 26 guardias
1. H1 verbatim con segmento. 2. Los 8 H2 verbatim y en orden. 3. Los 3 H3 verbatim. 4. Title y description en límite. 5. Canonical + `og:title`. 6. Respuesta rápida en los primeros 150 px. 7. Las 8 prohibiciones de S8 ausentes. 8. **S5b:** "catálogo es uno y se organiza por puesto" presente; y "catálogo independiente/aparte", "inventario por puesto", "stock por puesto", "almacén por puesto" ausentes. 9. **S5c:** al menos tres formatos de park presentes; "cadena de parks", "gerente de operaciones", "20 puestos", "control de acceso", "arrendamientos" ausentes. 10. La fórmula del administrador **verbatim de S6.2**, sin ensanchar. 11. Cero "caja compartida", "caja central", "caja común". 12. Cero "consolidada", "dashboard de cadena", "todas las marcas juntas". 13. Cero KDS/despacho/pantalla de cocina. 14. Las dos estructuras de S7 presentes y la tercera **no** como capacidad. 15. Paridad `FAQPage` celda por celda. 16. Las 6 preguntas del brief en orden. 17. Cero "nunca pierdes", "100%", "instantáneo". 18. Cero "catálogo hidratado"/"outbox". 19. Media existente con dimensiones, poster y etiqueta de demostración. 20. Slot de dos puestos documentado y ninguna imagen disfrazada. 21. Rutas relativas en el artboard. 22. `faq-cell`/`demo-tag` reutilizados sin repetir patrones. 23. Todo `var(--*)` existe. 24. Cero rayas visibles, cero vocabulario interno, cero nombres de personas, cero IVA propio. 25. `PAGES` + `design.json` con la ruta. 26. **Cero voseo.**

### S17. Voz
Habla de la operación del lector, nunca del sitio. Cero rayas. `BOM` fuera del visible. Nada de "módulo", "entitlements", números de issue. **Cero voseo.** Nada que suene a hoja de ruta.

### S18. Accesibilidad y móvil
≥44×44, contraste AA, `prefers-reduced-motion`, bandas medidas a 390 y 1440, reveal `threshold: 0`.

### S19. Test-first y build
Cada guardia nace roja contra un defecto real o inyectado; en el reporte, por guardia, qué falló. El build **debe** fallar si falta un asset, si la hoja no está hasheada o si queda una referencia relativa. **No publiques** sin autorización.

### S20. Commits y terminado
Conventional Commits en inglés, ~400 líneas por unidad. Terminado cuando: artboard con 8 H2 y 3 H3; suite verde con RED probado; las ocho suites existentes verdes; build emite la ruta de tres niveles; `PAGES` y `design.json` al día; media auditada con slot documentado; reporte de cierre con lo omitido.

---

## Tasks

| ID | Specs | Ruta | Commit sugerido |
|---|---|---|---|
| T1 | S1, S14 | Artboard con shell, spine, breadcrumb; `PAGES` + `design.json`; suite vacía | `feat(web): scaffold the food park segment page` |
| T2 | S5, S5b, S5c, S6 | H1, H2 1 con la precisión del catálogo y el H3 de amplitud | `feat(web): one catalog by puesto, the park at any size` |
| T3 | S6, S7 | H2 2 con la fórmula del administrador y el H3 de roles; tabla de las dos estructuras | `feat(web): who invoices in a food park` |
| T4 | S6, S11 | H2 3 y 4 con la evidencia auditada y el slot documentado | `feat(web): mixed puestos and the offline saturday` |
| T5 | S9, S10 | FAQ 7 + paridad + meta + breadcrumb schema | `feat(web): food park FAQ with schema parity` |
| T6 | S16 | Suite completa, cada guardia en RED | `test(web): food park page guard suite` |
| T7 | S18, S19, S20 | Móvil medido, accesibilidad, build, capturas | `fix(web): food park mobile bands and build` |
| T8 | S20 | Reporte de cierre | — |

---

## Checklist del padre

1. Los 8 H2 y 3 H3 contra el brief, palabra por palabra.
2. **Que la fórmula del administrador no crezca ni una palabra** — es el techo.
3. Que S5b esté dicho claro y una sola vez: catálogo uno, organizado por puesto.
4. Que S5c nombre al menos tres escalas y no asome lenguaje de cadena o de mall.
5. Que la tercera estructura fiscal **no** aparezca como capacidad.
6. Paridad GEO celda por celda con entidades decodificadas.
7. Defectos inyectados: "caja compartida", "vista consolidada", un KDS, "cadena de parks", "catálogo independiente" y un "vos".
8. Las ocho suites existentes verdes y la ruta de tres niveles resolviendo.
9. Lectura completa de voz.

---

## Log

- **L1.** Pedido del fundador, verbatim: *"terminemos las paginas hijas y luego nos centramos en los clips/capturas/producciones"*, y sobre el énfasis: *"a como puede ser restaurante, puede ser comiderias, foodparks con comida y negocios pequeños incluso, no necesariamente un restaurante grande."* Recogido así: el park también es pequeño (S5c).
- **L2.** Guía SEO de 7 pasos mapeada: avatar → el dueño o administrador que evalúa gobernanza (S2); keywords → S3; arquitectura → S1, S12 (tres niveles); encabezados → S6; contenido → S7, S8; FAQ para LLMs → S9; prototipo y schema → S14, S15.
- **L3.** **"Cada puesto con su catálogo" verificado contra el código, no supuesto.** `CatalogValue` es catálogo maestro de valores (unidad, categoría, tipo), no un catálogo de productos por puesto; `Product` tiene `category_code` y no tiene puesto, marca ni catálogo propio; ninguna terminal se limita a una parte del catálogo. Resultado: **un catálogo por negocio, organizado por puesto por categorías**. El H1 del brief y el home ya publicado dicen "catálogo por puesto" y **no se cambian**: se precisan en el primer H2 (S5b), y se prohíbe la lectura fuerte ("catálogo independiente", "inventario por puesto"), que es la misma familia de G28 en `/restaurantes/`.
- **L4.** **El home publicado ya usa esa frase dos veces** ("cada puesto con su catálogo y su cobro" en la tarjeta de segmentos, y "maneja el catálogo por puesto y el cobro por terminal" en el FAQ). Por eso esta página **no puede contradecirlo ni ensancharlo**: precisa el significado. El brief §6.4 ya lo fijaba como "alcance aprobado del home v1.8", y aquí se cumple.
- **L5.** **Segundo defecto de numeración del brief:** §6 tiene **dos §6.6** (Enlazado interno y Quién factura en un food park), igual que §8 tiene dos §8.6. Se renumera el fiscal a **§6.9** sin cortar contenido, en el mismo commit que este ODD.
- **L6.** **Ninguna pieza actual prueba un park:** las capturas son de un negocio, una terminal. La página usa lo que sí prueban (recetas, cobro, cola de salida) y **documenta el slot** de dos puestos. El material ideal queda anotado para la fase de capturas: dos terminales cobrando a la vez con secciones distintas y el panel con ventas de ambos puestos.
- **L7.** Regla del segmento respetada: esta página **posee** food park, así que el segmento va en el H1; y el cuerpo lo abre, no lo encasilla (S5c).
- **L8. Mi ODD inventó dos encabezados y se comió dos reales.** Escribí el H2 7 como "Preguntas frecuentes sobre el software para food park" y el 8 como "Solicita una demo con los puestos de tu park", sin haber leído esos bloques del brief: los reales son **"Preguntas frecuentes sobre el POS para food parks"** y **"Solicita una demo con la operación de tu park"**. Y faltaban **"Facturación por puesto conforme a la DT 09-2007"** y **"¿Cuánto cuesta para todo el park?"**. El brief tiene **8 H2**, no 6. Corregido en S6, S16, S20 y el checklist, con la verificación de cada cadena contra el brief en el reporte. Es el mismo error que cometí con "8 H2" en `/restaurantes/`: el número y los títulos se copian del documento, no de la memoria.
- **L9. El FAQ son seis preguntas, no siete.** El brief §6.4 las enumera: sistema por puesto, qué ve el administrador, revender y cocinar juntos, facturación por puesto, sin internet, cuánto cuesta. Mis siete eran invención.
- **L10. Contradicción del brief declarada:** el H2 5 menciona "libros exportables" y §6.5.8 prohíbe "exportación contable". No se publica exportación hasta verificar el producto; se dice solo lo verificado.
- **L12. Corrección de fondo del fundador (2026-11-20): el food park es el lugar, no el cliente.** Verbatim: *"se entiende como que el producto se lo vendemos al foodpark como tal, y ellos gestionan cada kiosco/puesto. Cuando no es así, nosotros le vendemos a los negocios del foodpark directamente. Por ejemplo el cliente que tenemos que es cafetería, tiene su puesto en un foodpark, pero le ofrecimos el servicio directamente a él, no a los que gestionan el foodpark en general."*
  **Qué estaba mal en esta spec, no solo en la página:** S5c asumía que el park es el comprador; el H2 2 "¿Cómo opera el administrador del park?" y su H3 de roles eran invención de un papel que no existe en el modelo; la tabla de S7 hacía del park un emisor posible; y la suite tenía el modelo incorrecto escrito como **requisito**, así que habría rechazado la versión correcta. Ese último punto es el más grave: un test que exige el modelo equivocado no protege nada, lo perpetúa.
  **Corregido:** brief §6.0 con la derogación explícita y §6.4 con el H1 y los 8 H2 nuevos (el sujeto pasa del park a *tu puesto*); página reescrita; home corregido en la tarjeta de segmentos y en el FAQ (visible + JSON-LD, paridad 10/10); hub corregido en su puente de comparación; suite reescrita con guardia de clase que prohíbe "administrador del park", "el park contrata", "suscripción por park", "vista del park", "gestión de locatarios" y exige la afirmación del modelo.
  **Una frase mía, retirada en la revisión:** el FAQ afirmaba que *"los reportes de la administración del patio no incluyen lo que vende tu puesto"*. Eso describe las herramientas de un tercero que no es nuestro cliente y no lo podemos saber. Queda en lo verificable: *"ninguna otra cuenta del sistema ve lo que vende tu puesto"*.
- **L13. El evento de medición `foodpark_admin_lee` conserva el nombre** porque es interno y renombrarlo rompe la serie histórica; su sección ya no habla de un administrador. Deuda anotada para la próxima revisión de nombres de eventos.
