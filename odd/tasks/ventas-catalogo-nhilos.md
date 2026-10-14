# Catálogo de Ventas POS: imagen protagonista y cumplimiento NHILOS

La card del catálogo de ventas desperdicia el 52% de su superficie (medido en S23: card 170×207 dp con imagen de 36×36 dp) y la pantalla no cumple varios apartados del estándar NHILOS POS. Entregable: card y grilla rediseñadas con la foto como protagonista, más el pase de cumplimiento (§12.6, §13, §28, §29, §34.1, §42, §46, §47) en la superficie de ventas. Nada de facturación, dominio ni DGI.

**Base:** `main` @ `d32da0f4`. Rama de trabajo: `feat/ventas-catalogo-nhilos`.
**Evidencia de partida:** captura ADB del S23 (`R5CWB2LQJDJ`, 1080×2316 @ density 450 → 384×823.5 dp) en la UI de ventas, medida pixel a pixel: padding 10 dp, `crossAxisSpacing` 8, `maxCrossAxisExtent` 180 → **2 columnas** de 170×207 dp (Card margin 4 dp por lado), imagen 36 dp, badge de promo `deepOrange`.
**Cierre:** commits de unidad de trabajo sobre la rama + capturas antes/después del S23 + tests focalizados en verde.

## Specs

- **S1** — "hay margen de mejora en el tamaño de imagen y los espacios que ocupan cada elemento de la card, hay bastante espacio en blanco que se puede aprovechar".
- **S2** — "OJO: estamos en un s23 con resulucion distinta al Q80 con el que estuvimos trabajando, importante tomar esto en cuenta para que se adapte bien la UI".
- **S3** — "Todo lo que aplique de los nhilos standard, la idea es que la UI completa de ventas cumpla con los principios".
- **S4** — "Compilá, instalá y capturá antes/después" en el S23 (`R5CWB2LQJDJ`).
- **S5** — Geometría elegida (opción A): "La foto ocupa el ancho completo de la card en 1:1, con el nombre (2 líneas) y el precio en una banda compacta debajo. Sin espacio muerto."

### Objetivos medibles derivados de S1/S2/S5

| # | Objetivo | Medición de aceptación |
|---|---|---|
| S6 | Imagen 1:1 al ancho completo de la card, esquinas superiores recortadas al radio de la card (12 dp) | S23: imagen 108 dp (304 px ≈ 300 px de origen, factor 1.01×) |
| S7 | Cero espacio muerto dentro de la card | altura de card = imagen + pie; la diferencia entre contenido y celda < 2 dp |
| S8 | Columnas adaptativas por ancho **y densidad**: la columna extra aparece cuando el material de 300 px lo exige | S23 (384 dp @ 2.8125) = 3 · teléfono 360 dp @ 3 = 3 · terminal 360 dp @ 1.5 = 2 · Q80 (533 dp @ 1.5) = 3 · tablet 800 dp = 4 (igual que antes) |
| S9 | Ningún cuadro de imagen amplifica el material de origen más de 1.15× | `cardWidth × dpr / 300 ≤ 1.15` en cada dispositivo soportado |
| S10 | Pie de card: nombre a 2 líneas con elipsis, precio tabular; sin overflow de layout | test de widget a textScale 1.0 sin excepciones de overflow |

### Cumplimiento del estándar aplicado a esta pantalla (S3)

| # | Apartado | Requisito verificado |
|---|---|---|
| S11 | §12.6 | Fallback de 2 niveles (glifo de categoría → monograma) escalado al tamaño de la imagen; badge de promo flotante arriba-derecha, sin tapar información del producto |
| S12 | §42.1 / §42.7 / §42.2 | Cero hex fuera de la paleta vigente (se elimina `Colors.deepOrange`), radios 12/8/4 dp, color = estado y no decoración |
| S13 | §13.1 / §13.2 / §29 | Pista de búsqueda declara nombre y SKU; "sin datos" ≠ "sin resultados"; limpiar el filtro es fácil |
| S14 | §28.1 / §47 | Sin loader de página completa para datos locales (SQLite): esqueleto ligero de grilla |
| S15 | §34.1 / §12.3 / §39 | Números tabulares en todo monto del carrito; plural correcto en el contador de productos |
| S16 | §46 | Target ≥48 dp por card y etiqueta accesible de la card completa ("agregar producto, precio") |
| S17 | §14.1–§14.3 | Filtro por categoría con estado visible, reset explícito y persistencia mientras se está en la pantalla |
| S18 | §48 | Chips construidos con `ChoiceChip`, el patrón de chips ya usado en la suite POS |

### Contratos que NO se rompen

- **S19** — Formatos y copy existentes que se conservan literal: `'C$ ${...toStringAsFixed(2)}'`, `'2x1'`, `'-${...}%'`, `'PROMO'`, `'VER CARRITO'`, `'CARRITO'`, `'Carrito vacío'`, `'Total: C$ ...'`.
- **S20** — Cero cambios en el pipeline de imágenes (`product-image-field.tsx` sigue en 300×300 px): el rediseño se adapta a esa resolución, no la modifica.
- **S21** — Fuera de alcance (se reporta como hallazgo/next step, no se toca): diálogos de cobro/split/propina, `SnackBar` sobre la barra de carrito (§32.1, requiere política app-wide), promoción de las capturas nuevas a `nhilos_pos_media_inventory_v1.0.md` (archivo con cambios sin commitear de otro workstream).

## Tasks

| ID | Spec | Route | Commit |
|---|---|---|---|
| T1 | S1, S5–S7, S9–S12, S16, S19, S20 | Card y grilla: imagen 1:1 protagonista, pie compacto, fallback proporcional, badge de promo con tokens, bandas de columnas, `Semantics` | ⏳ |
| T2 | S3, S13, S14 | Estados de la pantalla: esqueleto de carga local, "sin datos" vs "sin resultados" con reset | ⏳ |
| T3 | S3, S15 | Precisión del carrito: tabular en precios de línea, plural del contador, vacío válido | ⏳ |
| T4 | S3, S13, S17, S18 | Filtro por categoría con `ChoiceChip` + estado en `SaleViewModel` | ⏳ |
| T5 | S4 | Evidencia: tests focalizados + capturas antes/después (S23) + verificación de geometría en Q80/V2s | ⏳ |

## Log

- **L1** — "Recientemente actualizamos la parte de productos para poder agregar imagenes, y estas imagenes mostrarlas en el POS, en las cards de ventas, todo ha funcionado bien, pero hay margen de mejora en el tamaño de imagen y los espacios que ocupan cada elemento de la card, hay bastante espacio en blanco que se puede aprovechar. De paso implementamos los nhilos standard principles y experiencia del POS en esta pantalla de ventas. Te dejé la app abierta en la UI de ventas, para que veas como se ve actualmente y basado en ello hagamos las mejoras"
- **L2** — "Tienes mi dispositivo con la UI abierta para que validez"
- **L3** — "OJO: estamos en un s23 con resulucion distinta al Q80 con el que estuvimos trabajando, importante tomar esto en cuenta para que se adapte bien la UI"
- **L4** — Decisiones: geometría = opción A (imagen nítida adaptativa); alcance = "Todo lo que aplique de los nhilos standard, la idea es que la UI completa de ventas cumpla con los principios"; validación = build + install + capturas antes/después en el S23.
- **L5** — Medición de partida por ADB sobre el S23 (1080×2316, density 450). Confirmado: `isHandheld` = true (384 dp). Calibración exacta con el campo de búsqueda (40 dp = 112 px) y el borde de la AppBar (y=249). Grilla real: `crossAxisExtent` = 364 dp (padding 10), `crossAxisCount` = ceil(364/188) = 2, celda 178 dp, card 170×207 dp. Imagen 36 dp = 21% del ancho de card; 109 dp (52%) de la card son espacio vacío. El "tercer borde" del borde derecho de la captura es el asa del panel lateral de Samsung, no una columna del grid: fila 2 no lo tiene y la aritmética del delegate lo descarta.
- **L6** — Restricción dura del origen: `product-image-field.tsx` recorta a 1:1 y redimensiona a 300×300 px WebP. En el S23 (dpr 2.8125) el cuadro nítido máximo es 106.7 dp, así que el hero de ancho completo exige 3 columnas en esa pantalla; con 2 columnas la foto se ampliaría 1.5× (borrosa).
- **L7** — Q80 calibrado con la captura `pos_03_catalogo_soho.png` (800×1280 @ 1.5): campo de búsqueda 40 dp = 59 px → 533×853 dp; 3 columnas de 157.8×192.4 dp. Sunmi V2s: 320 dp → 2 columnas.
- **L8** — Riesgo de instalación descartado: `android/key.properties` apunta a `~/.keys/nhilos-upload.jks`, la firma del APK instalado es `[a7d56b0b]`, así que un build release local instala encima conservando los datos locales (catálogo, turno y activación intactos).
- **L9** — Corrección de S9 durante T1: el criterio original (`imagen(dp) × dpr ≤ 300 px`) no se sostiene en el S23 (108 dp × 2.8125 = 303.75 px). El criterio honesto y verificable es la amplificación ≤ 1.15×, que deja al S23 en 1.01× (indistinguible) y descarta las 2 columnas por 1.48×.
- **L10** — Hallazgo de densidad: a 360 dp —el ancho de teléfono Android más común— con densidad 3, la banda de 2 columnas habría amplificado la foto 1.48×. La geometría pasó a ser consciente del `devicePixelRatio`: el ancho objetivo de tarjeta se deriva del presupuesto de foto (`300 × 1.15 / dpr`, acotado entre 96 dp y 180 dp) y el número de columnas sale de ahí, igual que lo haría `SliverGridDelegateWithMaxCrossAxisExtent`. Verificado: 360 dp @ dpr 3 → 3 columnas (1.00×), 360 dp @ dpr 1.5 → 2 columnas, tablet 800 dp @ dpr 1 → 4 columnas (idéntico al comportamiento previo).
- **L11** — El `Card` de Flutter aplica 4 dp de margen por lado dentro de su propia caja: `ProductCard` ocupa la celda completa y la tarjeta visible es `celda − 8 dp`. Los tests de geometría comparan contra `cardWidth` (la tarjeta visible), no contra la caja del widget.
