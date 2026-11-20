# NHILOS — Page Briefs de la Web

## Control del documento

| Campo | Valor |
|---|---|
| Documento | `nhilos_web_page_briefs_v1.0.md` |
| Versión | 1.9 |
| Estado | WORKING DRAFT — briefs del home, `/precios/`, hub `/software-pos/`, hub fiscal `/facturacion-dgi/` y las cinco P0 restantes (restaurantes, food parks, sin internet, inventario, demo) escritos |
| Owner | Founder / Marketing |
| Audiencia | Founder, Marketing, Web, redactores |
| Propósito | Brief por página: keyword, intención, jerarquía de encabezados con contenido y por qué, objeciones, prueba, CTA y enlaces internos |
| Fecha | 2026-11-18 |
| Consumidor | Redacción de contenido y re-etiquetado del artboard `04-sintesis-hibrida.html` |

### Documentos relacionados (cadena de evidencia)

- [Arquitectura web y grupos transaccionales](./nhilos_web_seo_architecture_v1.0.md) — URLs y fases
- [Análisis SERP](./nhilos_web_serp_analysis_v1.0.md) — evidencia de mercado por grupo
- [Buyer avatar](./nhilos_web_buyer_avatar_v1.0.md) — comprador y objeciones
- [Oportunidades de keywords](./nhilos_web_keyword_opportunities_v1.0.md) — tabla priorizada

---

## 0. Decisión de posicionamiento: un sistema de ventas con control a la medida (2026-11-16, revisión 2)

**Decisión revisada (supera la versión gastronomía-hero):**

El eje del producto **no es el restaurante**: es la **venta local-first con nivel de control elegido por el negocio**. El código lo confirma por diseño (`ProductType` en `apps/admin_backend/src/modules/inventory/entities/product.entity.ts`):

- `SIMPLE` → **venta y reventa pura**: se compra y se vende tal cual, sin insumos ni recetas. Ventas, métricas, kardex básico y fiscal. Casos: misceláneas, tiendas, comercios de mostrador, y puestos de food park que venden producto de reventa (botanas, bebidas embotelladas).
- `COMPOUND` / `PREPARED` → **producción con control total**: receta BOM, descuento de insumos por venta, costeo, merma teórica vs física. Casos: restaurantes, cafeterías, cocina de food park.

**La escalera de valor es continua, no binaria:** un cliente puede empezar en modo simple y activar recetas cuando quiera; un food park puede tener puestos en ambos modos a la vez. El control detallado es **opcional, no un requisito de entrada**.

**Reglas de mensaje resultantes:**

1. **Hero de categoría amplia:** la web habla de "venta en mostrador local-first" para gastronomía Y comercio de reventa. La promesa unificadora: *un solo sistema cuyo control crece contigo — desde ventas y métricas simples hasta recetas, insumos y kardex completo, activando lo que tu negocio necesite*.
2. **La gastronomía sigue teniendo protagonismo de evidencia, no de encasillamiento:** recetas/BOM/kardex son la prueba técnica más fuerte y capturan la demanda medida (G2, G9), pero se presentan como el extremo superior de la escalera, no como la identidad del producto. Un dueño de miscelánea debe leer la home y sentirse incluido, no excluido.
3. **Keywords de retail reabiertas a evaluación:** con el producto cubriendo reventa, las queries tipo `sistema POS para tienda`, `punto de venta para miscelánea`, `sistema de inventario para tienda de conveniencia` **dejan de estar excluidas por fit** (la exclusión anterior asumía producto solo gastronómico). Pasan a "candidatas": se capturan en el siguiente export de Keyword Planner y se priorizan por demanda medida. No se crean URLs sin evidencia.
4. **Anti-encasillamiento en el copy:** evitar que cada encabezado diga "restaurante". Alternar: negocio, mostrador, commerce local, gastronomía. El H1 transitorio del home mantiene la keyword restaurante (demanda medida), pero el body habla del espectro.
5. **Evidencia demostrable:** el modo simple opera hoy (SOHO), por lo que mencionarlo es claim seguro bajo la regla de evidencia del avatar.

---

## 1. Brief — Home (`/`)

### 1.1 Datos del brief

| Campo | Valor |
|---|---|
| Keyword principal (transitoria en home) | `sistema POS para restaurante en Nicaragua` |
| Keywords secundarias | `sistema POS Nicaragua`, `punto de venta Nicaragua`, `POS sin internet`, `facturación DT 09-2007`, `sistema de inventario para restaurante`, `bimoneda córdobas dólares` |
| Intención | Comercial-transaccional: comparar y elegir sistema para comprar |
| Respuesta rápida (primeros 150 px) | POS táctil local-first para gastronomía y comercio de mostrador en Nicaragua; sigue vendiendo sin internet; correlativos inalterables DT 09-2007; bimoneda |
| Objeción principal | "¿Y si se cae el internet en plena venta?" |
| Objeción secundaria | "¿Sirve para la DGI?" (influenciador: contador) |
| Prueba | Clips reales S23 Ultra (caja, KDS, offline) + dashboard real NHILOS Market & Café; sin mockups |
| CTA | Solicitar una demo (primaria) + WhatsApp (secundaria) |
| Enlaces internos (cuando existan) | `/software-pos/`, `/facturacion-dgi/`, `/inventario/`, `/precios/`, `/demo/` |

### 1.2 Jerarquía de encabezados

> Nota de migración: al separar las páginas P0, esta jerarquía migra a `/software-pos/restaurantes/` y la home se re-encabeza con `sistema POS Nicaragua`. Los H2 usan keywords reales de búsqueda (validadas contra Keyword Planner parts 1–14 y el FAQ schema que rankea de Sabor Suite); los H3 resuelven objeciones y sub-ángulos.

#### H1: `El POS que sigue vendiendo cuando el internet se cae`

> **Actualizado v1.4 (2026-11-16):** H1 generalizado por decisión del founder (coherencia con posicionamiento v2; `sistema POS Nicaragua` es keyword validada). La keyword exacta `sistema POS para restaurante en Nicaragua` queda como primary de la página interna futura `/software-pos/restaurantes/`.
>
> **Actualizado v2.2 (2026-11-19):** re-encabezado ejecutado tras publicarse el hub. El término cabeza `sistema POS Nicaragua` queda en dueño del hub (§3) y la home cede su `<title>` (era `NHILOS POS · Sistema POS en Nicaragua`) al ángulo propio: `NHILOS POS · POS sin internet en Nicaragua`. El H1 deja de nombrar la categoría y vende la promesa: `El POS que sigue vendiendo cuando el internet se cae`. El cluster offline (`POS sin internet`, `punto de venta sin internet`) pertenece a la home mientras `/software-pos/sin-internet/` no existe; el long tail migra a esa hija cuando nazca. La meta description no cambió (ya respondía sin duplicar el title).

Contenido: keyword exacta + diferenciador en un renglón. La narrativa de marca ("no para cuando falla el internet") vive en el subhead, no en el H1 — el H1 debe contener lo que la gente teclea. *Por qué: respuesta de categoría en 2 segundos; ninguna competencia tiene keyword + diferenciador juntos en el H1.*

#### H2: `¿Qué es NHILOS POS y para quién es?`

Contenido: definición en 100–150 palabras — POS táctil local-first para restaurantes, cafeterías y food parks **y para comercios que venden productos de reventa** (tiendas de conveniencia, mostrador): gestiona venta simple sin recetas y venta de producción con recetas e insumos, según lo que tu negocio necesite. *Por qué: la intención de la query pide identificar el producto; la mención del modo reventa amplía el mercado addressed sin quitar protagonismo gastronómico — es capacidad nativa (`ProductType.SIMPLE`), no promesa nueva.*

> **H3: `Caja, cocina y mostrador en una sola operación`**
> Contenido: 3–4 bullets del flujo operativo (pedido → comanda → cobro bimoneda → turno). *Por qué: traduce la categoría a operación diaria.*

#### H2: `Un POS que funciona sin internet: cómo resiste tu negocio`

Contenido: arquitectura local concreta (terminal enrolado, catálogo hidratado, cola de sincronización) con el clip real de contingencia. *Por qué: segunda intención del cluster y gap confirmado — ningún competidor local documenta contingencia offline.*

> **H3: `Qué sigue funcionando cuando se cae la conexión`**
> Contenido: lista verificable (cobro, tickets correlativos, comandas a cocina) y qué se encola. *Por qué: objeción literal; límites honestos — regla de claims: "terminal enrolado y catálogo hidratado".*
>
> **H3: `Sincronización automática al reconectar`**
> Contenido: el outbox envía ventas e inventario al volver la red; captura real del badge. *Por qué: pregunta de seguimiento inmediata; captura long-tail.*

#### H2: `Facturación conforme a DT 09-2007: correlativos inalterables y anulaciones auditadas`

Contenido: mecánica fiscal — numeración consecutiva sin saltos, prohibición de borrado, motivo formal por anulación, libros exportables. *Por qué: intención informativa-transaccional del cluster; precisión verificable donde los 3 competidores sobreafirman "factura electrónica".*

> **H3: `¿Qué garantiza NHILOS y qué le corresponde a tu negocio ante la DGI?`**
> Contenido: la distinción exacta — mecánica = NHILOS; autorización (carta, código, numeración) = contribuyente. *Por qué: la objeción del contador que bloquea compras; nadie más puede responderla.*

#### H2: `Inventario, kardex y control de merma en tiempo real`

Contenido: descuento de insumos por plato vendido, kardex valorado CPP, merma teórica vs física; **y para productos de reventa, control de stock simple con métricas de venta sin recetas**. *Por qué: G9 es P0 por demanda y el gap más claro del mercado; la mención del modo simple cubre el caso SOHO con el mismo sistema.*

> **H3: `Kardex por receta: cada plato vendido descuenta sus insumos`**
> Contenido: demostración BOM con el clip real del recálculo de costo. *Por qué: convierte la feature más diferenciante en evidencia visible.*
>
> **H3: `Productos de reventa: ventas y métricas sin recetas`**
> Contenido: modo SIMPLE — alta de producto, precio, stock y reportes; ejemplo de negocio de mostrador. *Por qué: nuevo ángulo de captura sin competencia directa en la página; amplía el mercado sin diluir el hero gastronómico.*
>
> **H3: `Merma teórica vs física sin detener la operación`**
> Contenido: comparación automática contra conteos, alineada a Ley 822 / NIC 2. *Por qué: promesa que ningún competidor publica; enlace futuro a `/recursos/merma/`.*

#### H2: `Para food parks, cafeterías, restaurantes y comercios de mostrador`

Contenido: los cuatro escenarios en orden de protagonismo — food parks (multi-marca, cajas compartidas), restaurantes de alta rotación, cafeterías, y tiendas/comercios de reventa. *Por qué: el food park es posicionamiento sin dueño (G1); el mostrador cubre el avatar extendido; cada escenario con 2–3 líneas y prueba propia.*

> **H3: `Cobra en córdobas y dólares sin descuadres (bimoneda)`**
> Contenido: tasa BCN + tasa comercial, conciliación bimoneda de turnos. *Por qué: query local real y objeción práctica diaria.*
>
> **H3: `Roles y control por turno: cada evento deja rastro`**
> Contenido: PIN de caja, aperturas/cierres auditados, descuentos con permiso. *Por qué: captura "control de caja restaurante" (G3) sin crear la página aún.*

#### H2: `¿Cuánto cuesta un sistema POS para restaurante en Nicaragua?`

Contenido: precios cuando se definan (benchmark mercado $21–50/mes) + "cotización según operación"; nunca cifras inventadas. *Por qué: FAQ #1 del cluster y candidato a featured snippet con el encabezado-pregunta exacto.*

> **H3: `Qué incluye la implementación (y qué no)`**
> Contenido: alcance real — catálogo, enrolado, capacitación; "el tiempo depende de tu catálogo". *Por qué: honestidad contra el "24–48h" sin alcance de la competencia.*

#### H2: `Preguntas frecuentes sobre NHILOS POS`

Contenido: acordeón con preguntas reales de búsqueda (FAQPage schema): ¿Funciona sin internet?, ¿Cuánto cuesta?, ¿Sirve para la DGI?, ¿Necesito comprar equipo especial?, ¿Sirve para una tienda sin cocina o sin recetas? (nueva — responde el modo reventa), ¿Cuánto tarda implementar?, ¿Qué pasa con mis datos?. *Por qué: estructura que ya captura snippets en el cluster, con respuestas precisas donde Sabor sobreafirma; la pregunta de tienda cubre el nuevo ángulo.*

#### H2: `Solicita una demo con datos reales de tu operación`

Contenido: CTA final — demo + WhatsApp; formulario corto; datos de demo etiquetados. *Por qué: cierra el funnel con la conversión estándar del mercado (G14).*

### 1.3 Ventaja frente a los 3 competidores (resumen)

| Competidor | Su patrón | Cómo este brief lo supera |
|---|---|---|
| Sabor Suite | H1 con keyword + FAQ schema sólido; feature walls y sobreafirmación fiscal | Misma base técnica con límites verificables y offline documentado, no afirmado |
| SistecPOS | Página Nicaragua renderizada client-side: sin H1 crawleable; plantilla aún "DIAN Colombia" | HTML estático con encabezados crawleables |
| POS-Master | H1 = logo; H2 corporativos sin keyword; web legado | Cada H2 con keyword real de búsqueda; su activo (marcas clientes) se neutraliza con demostración en video real |

---

## 2. Brief — `/precios/` (G13)

> **Escrito 2026-11-18**, tras publicarse los precios congelados de [`docs/finance/estrategia_precios_nhilos_pos_v1.md`](../../finance/estrategia_precios_nhilos_pos_v1.md) (sección 4) en la home (copy v1.6, sección `#precios`). Regla de consistencia: esta página no puede contradecir la home ni el documento de precios — si un valor cambia, cambia en los tres documentos a la vez (misma regla de estabilidad que el FAQ GEO del home).

### 2.1 Datos del brief

| Campo | Valor |
|---|---|
| Keyword principal | `precio de sistema POS para restaurante en Nicaragua` (G13, arquitectura §5) |
| Keywords secundarias | `cotización de sistema POS en Nicaragua`, `comprar sistema de facturación para restaurante`, `cuánto cuesta un sistema POS en Nicaragua` (avatar §4.7), `sistema POS para negocio pequeño en Nicaragua` (consideración) |
| Intención | Transaccional de decisión: quien llega está comparando costos y quiere elegir sin llamar primero |
| Respuesta rápida (primeros 150 px) | Esencial US$49/mes (setup US$149) · Operación US$89 (setup US$250) · Pro US$149 (setup US$450) · Enterprise por cotización. Suscripción mensual por negocio, hardware aparte |
| Objeción principal | "¿Por qué cuesta más que el POS barato que vi en internet?" |
| Objeción secundaria | "¿Cuánto me va a salir y qué me cobran después?" (avatar §4.4, miedo al costo) |
| Prueba | Matriz de capacidades + precios congelados del documento de precios, con la letra pequeña visible; sin mockups, sin urgencia, sin descuentos |
| CTA | Solicitar una demo (primaria) + WhatsApp (secundaria) |
| Enlaces internos | `/demo/`, `/software-pos/`, `/facturacion-dgi/`, `/inventario/`, `/software-pos/hardware/` (cuando exista), home (breadcrumb) |

### 2.2 Intención y queries objetivo

Las queries vienen del [documento de keywords](./nhilos_web_keyword_opportunities_v1.0.md) y de la arquitectura (G13), no se inventan:

- **Primary:** `precio de sistema POS para restaurante en Nicaragua` — transaccional pura; la arquitectura asigna G13 completa a `/precios/` (regla anti-canibalización 6: precio, cotización y compra viven aquí; no se crean `/comprar/` ni `/cotizacion/`).
- **Secundarias:** `cotización de sistema POS en Nicaragua` y `comprar sistema de facturación para restaurante` (misma etapa de compra).
- **Del avatar:** `cuánto cuesta un sistema POS en Nicaragua` y `sistema POS para negocio pequeño en Nicaragua` — llegan con la objeción de costo y la de tamaño.
- **SERP (§9bis arquitectura):** veredicto GO — precios transparentes son raros en el cluster; la transparencia completa es el diferenciador de esta página.

### 2.3 Regla de profundidad de `/precios/`

> **El home vende; `/precios/` explica costos.** Esta página puede exceder las ~120 palabras por H2 del home, pero cada párrafo debe responder una pregunta que el comprador hace al decidir (precio, alcance, compromiso, hardware, crecimiento), no describir el producto. El detalle de método vive en las páginas de producto: cómo funciona el kardex y las recetas → `/inventario/`; la mecánica fiscal completa → `/facturacion-dgi/`; la operación offline → `/software-pos/` y `/software-pos/sin-internet/`. La tabla de precios es la respuesta, no el adorno.

### 2.4 Jerarquía de encabezados

Los H2 siguen el orden en que el comprador hace las preguntas: cuánto → qué incluye → qué cobra después → por qué tanto → compromiso → hardware → crecimiento → cierre. Los H3 resuelven sub-ángulos y objeciones.

#### H1: `Precio de un sistema POS en Nicaragua: planes desde US$49 al mes`

> **Sincronizado 2026-11-20.** El brief decía `Precio de sistema POS para restaurante en Nicaragua: planes desde US$49 al mes` y **la página publicada ya usa la versión neutra desde el 2026-11-19** (decisión del fundador al elegir el H1 híbrido). El brief es la fuente de verdad y estaba desactualizado: se alinea con lo publicado y con la regla de segmento neutro de §9.5 (la puerta de entrada no lleva segmento; el segmento se nombra en el cuerpo y en los hijos).

Contenido: keyword exacta + un renglón — precios públicos, sin llamar para saber cuánto cuesta. El cuerpo habla de negocio (no solo restaurante): los precios son por suscripción de negocio, no por puesto ni por terminal. *Por qué: la arquitectura asigna esta primary a `/precios/`; la transparencia total (precio + setup + letra pequeña) es el gap confirmado del SERP — ningún competidor local publica precio y alcance juntos.*

#### H2: `¿Cuánto cuesta NHILOS POS?`

Contenido: respuesta directa en las primeras líneas — Esencial US$49/mes con setup US$149, Operación US$89 con setup US$250, Pro US$149 con setup US$450; Enterprise por cotización. Suscripción mensual por negocio; precios en USD con referencia BCN para el cobro en córdobas. *Por qué: es la pregunta #1 del avatar ("¿Cuánto al mes?") y candidato a featured snippet con la pregunta exacta; quien escanea decide en 10 segundos si sigue leyendo.*

#### H2: `Planes y precios: qué incluye cada uno`

Contenido: tabla comparativa completa de los tres planes — mensual, setup, a quién va dirigido, terminales incluidas, cuentas owner y packs. *Por qué: quien llega a esta página está comparando; la tabla es el corazón de la decisión y debe coincidir número por número con la home (`#precios`) y con el documento de precios (§4).*

> **H3: `Esencial — US$49 al mes para empezar a vender y facturar`**
> Contenido: pulperías, kioscos, food trucks y cafeterías pequeñas; venta, catálogo, caja/turnos, doble tipo de cambio, inventario simple, portal del propietario, 2 cuentas owner, 1 terminal incluida. BYOD solo cuando el adaptador ESC/POS genérico (issue #983) esté aceptado físicamente — hasta entonces, la entrada es con terminal integrada. *Por qué: responde "¿puedo empezar pequeño?" y deja el límite de BYOD dicho una vez, con guardia de claim.*
>
> **H3: `Operación — US$89 al mes con un pack a elección`**
> Contenido: food parks, bares, cafeterías con mesa y tiendas medianas; todo lo de Esencial + un pack + clientes, promociones y lealtad. *Por qué: es el plan del avatar principal (food park / alta rotación); el pack se elige por operación, no por rubro.*
>
> **H3: `Pro — US$149 al mes con ambos packs y dos terminales`**
> Contenido: restaurantes, minimarkets y alto flujo; ambos packs, 2 terminales incluidas (3+ a US$29), 4 cuentas owner, reportes de margen y kardex valorizado, soporte prioritario. *Por qué: captura al comprador que ya sabe que necesita control de costos; el detalle del kardex no se explica aquí — enlaza a `/inventario/`.*
>
> **H3: `Enterprise — cotización con alcance validado`**
> Contenido: cadenas y requerimientos a medida; no es un plan de catálogo y se cotiza solo con alcance validado. *Por qué: honestidad — no fabricar un tier genérico ni un precio techo inventado.*

#### H2: `Packs de capacidad: Retail y Cocina, US$39 al mes cada uno`

Contenido: qué incluye realmente cada pack — Retail (kardex, costo promedio ponderado, proveedores, compras, conteos, mermas, alertas de stock, código de barras, lotes/vencimiento) y Cocina (recetas/BOM, subrecetas, modificadores, producción, combos, márgenes por plato, menú QR). Regla publicable: en Operación va un pack incluido y el segundo cuesta +US$29; en Pro van ambos; en Esencial un pack cuesta +US$39 (total US$88) y es válvula de escape — si necesitas un pack, casi conviene Operación por US$89 con promociones y lealtad incluidas. *Por qué: resuelve la objeción "¿qué incluyen los packs de verdad?" y la regla de canibalización del documento de precios (cotizar primero Operación) se convierte en consejo visible, no en truco interno. El detalle de método de cada pack enlaza a `/inventario/`.*

#### H2: `Add-ons: qué se cobra aparte de la mensualidad`

Contenido: terminal adicional US$40/mes (US$29 en Pro) con enrolamiento de US$75 — sincronizan por nube, sin LAN en tiempo real, dicho tal cual; cuenta owner adicional US$10/mes sobre las incluidas (2, o 4 en Pro). Los demás servicios (capacitación, OmniFood Care, sucursal adicional, migración extra) se cotizan según el documento de precios — sin cifras sueltas fuera de contexto. *Por qué: la objeción secundaria del avatar es literal — "¿qué me cobran después?"; responderla con la lista completa de cargos es la diferencia entre decidir aquí y abandonar por desconfianza.*

#### H2: `¿Por qué cuesta más que un POS barato?`

Contenido: comparación por categoría, nunca contra competidor nombrado — el piso del mercado es un POS de nube pura que no cubre offline ni mecánica fiscal; NHILOS no compite por precio, compite por riesgo fiscal (DT 09-2007), continuidad sin internet y control de costos. El costo real no es la mensualidad: es la venta perdida, la merma y la multa (marco del avatar). *Por qué: objeción principal de la página; la respuesta debe poder leerla el dueño y aceptarla el contador, sin tabla de precios ajenos ni cifras de terceros sin verificar.*

#### H2: `¿Qué pasa si dejo de pagar o quiero cancelar?`

Contenido: los términos de contrato (permanencia, renovación, qué se desactiva) se entregan por escrito en la cotización — la página no inventa términos ni promete "cancela cuando quieras". Lo que sí se afirma: tus datos son tuyos y los libros exportables salen cuando tu contador los pida (claim ya publicado en la home). *Por qué: miedo al proveedor del avatar ("¿y si desaparecen y quedo amarrado?"); el gating por plan es contractual y manual hasta cerrar #984 — prometer un comportamiento automático al dejar de pagar sería publicar una capacidad que no existe.*

#### H2: `¿Qué compra exactamente el setup?`

Contenido: qué compra el setup — carga inicial del catálogo, enrolado y configuración de terminales, configuración fiscal con el RUC y la autorización DGI del negocio, capacitación del equipo y acompañamiento en el primer turno real; el cronograma real viene en la cotización. Es pago único y no reembolsable, dicho tal cual. El hardware se compra aparte y es del cliente; la mensualidad nunca lo incluye. *Por qué: desarma el miedo al lock-in con el alcance exacto — el fee compra implementación, no exclusividad; coincide con la respuesta G7 del FAQ GEO del home.*

#### H2: `¿Necesito comprar equipo especial?`

Contenido: NHILOS POS opera en terminales táctiles Android; si ya tienes equipo se evalúa y si no, se cotiza el kit con proveedores locales. Precios de hardware **no se publican en esta página** hasta validarlos con al menos dos proveedores locales. *Por qué: objeción de hardware del comprador; el detalle de kits y compatibilidades es de `/software-pos/hardware/` cuando exista — aquí solo la regla (aparte, Android, se cotiza) para no duplicar ni adelantar precios no validados.*

#### H2: `¿Puedo empezar pequeño y crecer después?`

Contenido: Esencial es la entrada real, no un señuelo — se empieza en modo simple (reventa, stock y métricas) y se activa el control que el negocio pida (recetas, insumos, kardex) en el mismo sistema; la escalera Esencial → Operación → Pro agrega packs, terminales y reportes sin cambiar de producto. El alcance exacto al subir de plan se confirma en la cotización. *Por qué: objeción "mi negocio es pequeño" del avatar y el posicionamiento v2 (escalera de control continua); convierte la tarifa de entrada en argumento, no en disculpa.*

#### H2: `Preguntas frecuentes sobre los precios de NHILOS POS`

Contenido: acordeón con schema `FAQPage` sobre las preguntas exactas — ¿Cuánto cuesta NHILOS POS al mes?, ¿El precio es por negocio o por terminal? (por negocio), ¿Qué incluye el setup y por qué se cobra aparte?, ¿Puedo pagar en córdobas? (precios en USD; el cobro en córdobas usa la referencia BCN del día), ¿Hay descuentos o promociones? (no se publican descuentos ni urgencia; la condición final sale de la cotización), ¿Qué pasa si dejo de pagar?, ¿Necesito comprar equipo? *Por qué: el patrón FAQ ya captura snippets en el cluster (home); las preguntas de precio repetidas en WhatsApp se responden una vez aquí.*

#### H2: `Cotiza NHILOS POS con tu operación real`

Contenido: CTA final — demo (con escenario según tu tipo de negocio y tu prioridad) y WhatsApp directo; la cotización sale con cronograma real al finalizar la demo (bullets aprobados del copy v1.5 del home). *Por qué: la página existe para decidir sin llamar — y para que quien llama llegue con el costo ya entendido; cierra el funnel con la conversión estándar del mercado (G14).*

### 2.5 Guardia de claims: lo que `/precios/` NO publica

Lista vinculante. Cada punto es una promesa que existe en algún documento interno y que el producto **no puede sostener hoy**; se lista aquí para que no se publique por error, con su reemplazo si lo hay.

1. **"Facturación impresa" — NO publicar.** El documento de precios (§4) lista "facturación impresa DGI" dentro de Esencial, pero la impresión externa **no está implementada**: el adaptador ESC/POS genérico (issue #983) sigue abierto y solo Sunmi/iPOS integrados imprimen hoy. Reemplazo obligatorio, misma línea que la home (guardia del copy v1.6): "factura con la mecánica que exige la DT 09-2007". Nunca "factura electrónica" ni "facturación electrónica".
2. **"Sistema autorizado por la DGI" / "cero multas" — NO publicar.** La autorización (carta, código y numeración) la posee el contribuyente; NHILOS garantiza la mecánica normativa. Nada de urgencia fiscal ni miedo para vender.
3. **Precios de hardware y kits — NO publicar.** Los precios sugeridos del documento de precios (§5: US$99–149, US$299, US$289, US$749–899) son estimados pendientes de validar con al menos dos proveedores locales. La página solo dice: hardware aparte, Android, se cotiza.
4. **BYOD y su precio (US$25 de aprovisionamiento) — NO publicar.** BYOD queda habilitado solo cuando #983 esté aceptado físicamente; hasta entonces no se venden ni se anuncian precios BYOD.
5. **Exportación contable — NO publicar.** No existe (§3 del documento de precios); no va en ningún plan.
6. **Consolidación multi-sucursal / dashboard consolidado — NO publicar.** No existe; una sucursal adicional es una suscripción nueva sin consolidación automática. Tampoco prometer "todos tus locales desde el teléfono" en esta página.
7. **KDS, facturación electrónica XML/firma, integración bancaria automática y gestión de rutas — NO publicar.** Están en la lista "no se venden todavía" (§4 del documento de precios).
8. **Descuentos, promociones y urgencia — NO publicar.** Sin "solo esta semana", sin descuentos inventados, sin cifras de descuento anual (la regla del 10% es interna de negociación, no copy). La respuesta del FAQ es: no se publican promociones; la condición final sale de la cotización.
9. **Tabla comparativa contra competidor nombrado — NO publicar.** El benchmark interno (Neox, Nuxo, Fudo, Loyverse, Smart POS, POS-Master) es análisis de mercado con precios de terceros sin verificación vigente; nombrar competidor con precios hechos arriba o desactualizados está prohibido. La comparación por categoría del H2 "¿Por qué cuesta más?" no nombra marcas. La comparación honesta con metodología pertenece a `/comparativas/` (P1), no aquí.
10. **Términos de contrato no definidos — NO publicar.** "Sin permanencia", "cancela cuando quieras" o el comportamiento exacto al dejar de pagar no están definidos en el documento de precios; se responde con la cotización. El gating por plan es manual y contractual hasta cerrar #984 — no prometer desbloqueo automático de funciones por plan.
11. **SOHO fundador (US$79) — NO publicar.** Es continuidad de clientes existentes, no oferta pública; su mapeo es `Operación` con override `legacy.full`, no el plan de entrada.

### 2.6 Enlazado interno

**Entrante** (según arquitectura §7): home → `/precios/` desde su sección de precios; cada hub y cada página hija → `/precios/`; `/comparativas/` → `/precios/`; `/comparativas/pos-vs-excel/` → `/precios/`. Anchors descriptivos y variados ("ver planes y precios", "cuánto cuesta NHILOS POS"), nunca "click aquí" ni el mismo anchor exacto desde muchas páginas.

**Saliente:** `/demo/` (CTA primaria), `/software-pos/` (qué es el producto, para quien llegó directo por precio), `/facturacion-dgi/` (mecánica DT 09-2007 — el enlace que el contador quiere), `/inventario/` (detalle de los packs Retail y Cocina), `/software-pos/hardware/` cuando exista (kits y compatibilidad), home (breadcrumb). `BreadcrumbList` al construir la página, como el resto de internas.

### 2.7 Medición: qué se considera éxito

Eventos (GA4 o equivalente, todos legibles por nombre):

- `ver_planes_precios` — scroll hasta la tabla de planes (sección visible ≥75%).
- `cta_demo_precios` — clic en "Solicitar una demo".
- `cta_whatsapp_precios` — clic de WhatsApp con UTM `utm_medium=precios` para atribuir el canal.
- `faq_precios_abre` — apertura de cualquier ítem del FAQ.

Lecturas de éxito al checkpoint de 28 días (coincide con el primer checkpoint del baseline GSC 0/0 de la arquitectura §9bis):

- **≥60%** de las sesiones de `/precios/` llegan a la tabla de planes (la página retiene al que vino a decidir).
- **≥8%** de las sesiones generan clic a demo o WhatsApp (intención convertida en contacto).
- **GSC:** impresiones de las queries de precio atribuidas a `/precios/` — no a la home — en la revisión de 30–60 días. Si la home empieza a absorber las queries de precio, diferenciar el ángulo según la regla 9 de anti-canibalización de la arquitectura.
- Con un dominio nuevo (baseline 0 clics / 0 impresiones), se miden **tasas y primer movimiento** (impresiones > 0), no absolutos; los umbrales absolutos se fijan tras el primer checkpoint con datos reales.

### 2.8 Meta sugerida

- **Title (≤60):** `Precios de NHILOS POS en Nicaragua · Planes desde US$49`
- **Description (≤155):** `Esencial US$49, Operación US$89 y Pro US$149 al mes. Setups desde US$149. Suscripción por negocio, hardware aparte. Cotiza tu NHILOS POS.`

### 2.10 El costo de arranque se dice, no se calcula (2026-11-20, fundador)

**Verbatim:** *"lo que más me preocupaba es el pricing, que viéndolo desde los ojos de un prospecto o usuario no técnico, sea todo entendible y no parezca que hay varios cobros de un solo para poder contratar."*

**Regla:** la página publica, **en cada ficha de plan con precio**, el total de arranque como una cifra, sin que el lector sume:
- Esencial: **US$198** (US$149 de setup + primer mes de US$49). Después, solo US$49 al mes.
- Operación: **US$339** (US$250 + US$89). Después, solo US$89 al mes.
- Pro: **US$599** (US$450 + US$149). Después, solo US$149 al mes.
- Enterprise: **sin cifra**. Por cotización, con el alcance validado.

Y la sección de add-ons abre con la separación explícita: *"Nada de esto es obligatorio para empezar: el plan que elijas ya incluye lo necesario para vender. Se suma solo si tu operación lo pide."* Los cinco importes opcionales (terminal adicional, enrolamiento, cuenta de propietario, packs, terminal extra en Pro) dejan de compartir peso visual con los tres obligatorios.

**Guardia:** el total se **recalcula desde las cifras de la misma ficha**, no se escribe a mano. Si cambia el setup o la mensualidad, la guardia falla hasta que el total se corrija: es lo que impide que un día digan cosas distintas.

**Y un claim retirado en la misma pasada:** la página afirmaba *"Cada terminal se sincroniza por la nube: no necesitan una red local para trabajar juntas en tiempo real"*. Eso es la coordinación multi-terminal en tiempo real que se rechaza en todas las demás páginas. Queda en lo verdadero: cada terminal trabaja con su copia del catálogo y sube sus ventas cuando hay conexión.

### 2.9 Regla de impuestos: lo nuestro, no lo del cliente

**Ninguna página publica afirmaciones sobre IVA en NUESTROS precios** — ni "IVA incluido", ni "IVA aparte", ni "más IVA", ni "precios netos". Mientras NHILOS no esté inscrita como recaudador, no cobra IVA: esas formulaciones son falsas, y "neto" es la misma promesa con otra palabra. El precio publicado es la cifra que se cobra.

**Alcance — solo nuestro lado.** Aclaración del fundador, verbatim: *"es solo referente al IVA de nuestro lado; en el app, las capturas y demás es válido porque corresponde al cliente y al régimen si es cuota fija o régimen general. Solo es nuestro pricing/servicio."* Esta regla **no toca el producto**: el módulo fiscal calcula y muestra el IVA del negocio que factura —recaudado, neto a pagar, notas de crédito— porque esa es la obligación del contribuyente según el régimen en que tribute, no la nuestra. Tampoco tocan sus capturas ni sus `alt`: el IVA que aparece ahí es un dato verdadero del cliente y no debe "corregirse".

**Excepción declarada en las guardias.** S9 prohíbe la palabra en el texto visible y en el JSON-LD de estas tres páginas, y la frase de claim en todo el archivo; el `alt`/`title` de una captura puede nombrar IVA cuando la pantalla real lo muestra (verificado: *IVA Recaudado C$2,108.25* en el módulo Fiscal). Una página futura que explique el régimen del cliente (p. ej. `/facturacion-dgi/`) declara su propia versión de esta regla en su suite, con el mismo criterio: claim sobre precios prohibido, dato del cliente permitido.

Cuando NHILOS se inscriba, esta regla se reemplaza en la misma sesión en que cambie el estatus, y el texto nuevo se justifica contra el comprobante fiscal real.

## 3. Brief — `/software-pos/` (hub, G2 — término cabeza)

> **Escrito 2026-11-18.** El hub no es un home más largo: quien llega ya aceptó que necesita un sistema y está resolviendo **si esta categoría de producto resuelve su operación**. El hub responde tres cosas y se aparta: qué hace un POS por un negocio nicaragüense, cuál de las dos formas de operación es la suya, y a dónde ir después. El detalle de método es de los hijos; el hub orienta.

### 3.1 Datos del brief

| Campo | Valor |
|---|---|
| Keyword principal | `sistema POS Nicaragua` (término cabeza; regla de los hubs de la arquitectura §4) |
| Keywords secundarias | `punto de venta Nicaragua`, `software punto de venta Nicaragua`, `programa punto de venta Nicaragua` (arquitectura §5); queries de consideración de categoría del avatar: `cómo elegir un sistema POS`, `sistema POS para negocios de alta rotación` |
| Intención | Comercial de categoría y orientación: entender qué hace un POS y por dónde entrar; no es decisión de precio ni de segmento todavía |
| Respuesta rápida (primeros 150 px) | Un POS local-first que sigue cobrando sin internet, con el control que el negocio elija: venta y reventa simple, o recetas e insumos que se descuentan por plato; mecánica DT 09-2007 |
| Objeción principal | "¿Esto sirve para MI tipo de negocio?" (reconocerse en una de las dos formas de operación en la primera pantalla) |
| Objeción secundaria | "¿Por dónde empiezo si no sé qué necesito?" (el hub debe repartir, no vender un solo ángulo) |
| Prueba | Clips reales S23 Ultra (caja, offline, recetas) + capturas del dashboard real NHILOS Market & Café; sin mockups |
| CTA | Solicitar una demo (primaria) + WhatsApp (secundaria) |
| Enlaces internos | Hijos del hub (§3.6), `/precios/`, `/demo/`, `/facturacion-dgi/`, `/inventario/`, home (breadcrumb) |

### 3.2 Intención y queries objetivo

Las queries vienen del [documento de keywords](./nhilos_web_keyword_opportunities_v1.0.md) y de la arquitectura (mapa §5 y regla de los hubs §4); no se inventan:

- **Primary:** `sistema POS Nicaragua` — la arquitectura asigna el término cabeza al hub: *"ataca `sistema POS Nicaragua` (término cabeza; no compite con las páginas de segmento)"*. El veredicto SERP (§9bis) es GO competitivo pero ganable, con un gap explícito: nadie conecta local-first + mecánica fiscal + food park en una sola propuesta — exactamente el trabajo del hub.
- **Secundarias:** las variantes genéricas de punto de venta (`punto de venta Nicaragua`, `software punto de venta Nicaragua`, `programa punto de venta Nicaragua`) — mismas intención de categoría, misma página.
- **Del avatar (consideración de categoría):** `cómo elegir un sistema POS` y `sistema POS para negocios de alta rotación` — el buscador aún no nombró su segmento; esas preguntas las ordena el hub y las resuelve el enlace correcto al hijo.
- **Realidad honesta del set:** el hub tiene un set de keywords delgado, y así debe ser. Su trabajo SEO no es acumular long tail sino distribuir autoridad y orientar; la long tail vive en los hijos (regla 1: una keyword principal por URL).
- **Frontera con la home:** el H1 actual de la home contiene `sistema POS en Nicaragua` mientras la jerarquía del home es transitoria (nota de migración del brief §1.2: al separar las P0, la home se re-encabeza y la keyword restaurante migra a `/software-pos/restaurantes/`). Hasta ese re-encabezado, la home y el hub comparten término cabeza: se vigila en GSC con la regla 9 de anti-canibalización (revisión mensual; si la home absorbe las impresiones del término cabeza, se diferencia el ángulo — la home vende la promesa, el hub educa la categoría).

**Queries que el hub NO persigue, con dueño explícito** (regla 1 de anti-canibalización: no repetir la primary de un hijo; el hub no debe usar la misma keyword principal que un hijo):

| Query | Dueño |
|---|---|
| `sistema POS para restaurante` (+ `en Nicaragua`, `software para restaurantes Nicaragua`, `punto de venta para restaurante`) | `/software-pos/restaurantes/` |
| `software para food park` (+ `food court`, `en Managua`, `administración de food park`) | `/software-pos/food-parks/` |
| `sistema POS sin internet para restaurante`, `POS sin internet`, `punto de venta sin internet`, `sistema POS offline` | `/software-pos/sin-internet/` |
| `sistema de cierre de caja`, `arqueo de caja restaurante`, `control de caja restaurante` | `/software-pos/caja/` |
| `sistema POS para bar` | `/software-pos/bares/` |
| `software comida rápida` (+ mostrador, QSR) | `/software-pos/comida-rapida/` |
| `sistema POS con facturación DGI` | `/software-pos/facturacion-dgi/` |
| `kit punto de venta restaurante`, `terminal punto de venta`, `impresora térmica para POS` | `/software-pos/hardware/` |
| `sistema para varias sucursales de restaurante` | `/software-pos/multisucursal/` |
| `sistema de facturación DGI en Nicaragua`, `facturación DT 09-2007` | `/facturacion-dgi/` |
| `sistema de inventario Nicaragua`, `kardex de restaurante` | `/inventario/` |
| `precio de sistema POS...`, `cotización`, `comprar`, `cuánto cuesta un sistema POS en Nicaragua` | `/precios/` (regla 6: precio, cotización y compra viven ahí) |
| `demo de sistema POS para restaurante` | `/demo/` |
| `mejores puntos de venta para restaurantes`, `comparativa sistemas POS Nicaragua` | `/comparativas/` (regla 12) |
| `sistema POS para tienda / miscelánea` | Sin URL todavía: retail es **candidato** pendiente de demanda medida (decisión de posicionamiento §0.3); el hub nombra la forma de reventa en texto, sin crear página ni enlace a una que no existe |

### 3.3 Regla de profundidad del hub

> **El home vende, las internas explican, el hub orienta.** El hub puede exceder las ~120 palabras por H2 del home **solo en educación de categoría** — qué hace un POS para este tipo de negocio, qué cambia frente al cuaderno y el Excel, qué significa elegir el nivel de control. Cada párrafo debe responder una pregunta que el visitante se hace al aterrizar (¿esto es para mi operación? ¿qué nivel de control necesito? ¿por dónde entro?), no describir el producto. El detalle de método es de los hijos: los límites exactos de la contingencia offline → `/software-pos/sin-internet/`; la mecánica DT 09-2007 completa y la tabla "qué garantiza NHILOS vs qué posee tu negocio" → `/facturacion-dgi/`; kardex CPP, merma teórica vs física y el detalle de recetas → `/inventario/`. La tabla de precios → `/precios/`.

### 3.4 Jerarquía de encabezados

Los H2 siguen el orden en que el visitante hace las preguntas al aterrizar: ¿es para mi operación? → ¿qué hace un POS de verdad? → ¿cuánto control necesito? → ¿por dónde entro según mi negocio? → ¿y las tres objeciones grandes? → ¿cuánto y cómo probar? → cierre. Los H3 resuelven sub-ángulos y llevan los enlaces a los hijos con las queries de cada uno.

#### H1: `Sistema POS en Nicaragua: el control de tu venta, a la medida de tu negocio`

Contenido: keyword del término cabeza + la promesa unificadora del posicionamiento v2 en un renglón. Debajo del H1, dos líneas — una por forma de operación ("¿vendes lo que compras?" / "¿lo que vendes se cocina?") — para que el visitante se reconozca **en la primera pantalla**, antes del primer scroll. *Por qué: la arquitectura asigna el término cabeza al hub; el diferenciador (control a la medida) es la promesa que abarca ambos modos sin encasillar (regla de anti-encasillamiento §0.4: alternar negocio, mostrador, gastronomía — no todo dice restaurante).*

#### H2: `¿De qué tipo es tu negocio? Dos formas de vender, un mismo sistema`

Contenido: definición en 100–150 palabras con las dos formas de operación **en las palabras de la home** (no se parafrasea una decisión ya publicada): quien **vende lo que compra** (tienda, miscelánea, puesto que revende botanas y bebidas embotelladas) opera en modo simple — ventas, stock y métricas, sin recetas; quien **cocina lo que vende** (restaurante, cafetería, cocina de food park) activa recetas e insumos y cada plato vendido descuenta sus ingredientes. *Por qué: la pregunta real del visitante del hub es "¿resuelve mi operación?"; responderla con las dos formas nativas (`ProductType.SIMPLE` / `COMPOUND`–`PREPARED`) convierte la categoría en espejo — el dueño de miscelánea se incluye y el dueño de restaurante se reconoce, sin que ninguno lea el página del otro para saber si aplica.*

> **H3: `Vendes lo que compras: reventa y mostrador sin recetas`**
> Contenido: 3–4 líneas del modo simple — alta de producto con costo y precio, stock, arqueos, métricas del turno; ejemplo de mostrador. *Por qué: primer reconocimiento del espejo; es capacidad operativa hoy (caso SOHO), claim seguro bajo la regla de evidencia del avatar.*
>
> **H3: `Lo que se cocina: recetas, insumos y costo por plato`**
> Contenido: 3–4 líneas del modo producción — receta BOM, descuento de insumos por venta, costo por plato; sin entrar en kardex ni merma (eso es `/inventario/`). *Por qué: segundo reconocimiento; la prueba técnica más fuerte se enuncia, no se explica — el detalle enlaza hacia abajo.*
>
> **H3: `Los dos modos conviven: el caso food park`**
> Contenido: un puesto que revende en modo simple junto a una cocina con recetas, en el mismo sistema; el administrador ve la vista consolidada. *Por qué: la escalera es continua, no binaria (posicionamiento §0); el food park mixto es la evidencia de esa continuidad y el posicionamiento sin dueño (G1).*

#### H2: `¿Qué es un sistema POS y qué hace por tu negocio?`

Contenido: educación de categoría — el territorio exclusivo del hub. Qué hace un punto de venta moderno para un negocio de venta en mostrador en Nicaragua: cobrar rápido en córdobas y dólares, emitir tickets con consecutivo inalterable, registrar cada evento con usuario y hora, y convertir la operación en datos que el dueño puede leer (qué se vendió, qué quedó en stock, si la caja cuadró). Lo que cambia frente al statu quo del avatar (§4.8): Excel, cuaderno, POS fiscal viejo y "mi contador lo maneja". *Por qué: la query del término cabeza es de categoría, no de marca — quien llega aún no eligió NHILOS; ningún competidor local educa la categoría conectándola con offline + mecánica fiscal (gap confirmado del SERP §9bis), y el contenido profundo que el home no puede cargar por su regla de profundidad vive aquí.*

> **H3: `Qué cambia frente al cuaderno, el Excel o un POS fiscal viejo`**
> Contenido: la comparación contra el statu quo, nunca contra competidor nombrado — evidencia y auditoría donde hoy hay papel, datos que el contador recibe limpios, operación que no depende del internet. *Por qué: el avatar compite contra el statu quo antes que contra otro POS (§4.8); es la objeción implícita del visitante de categoría que aún duda de si necesita un sistema.*

#### H2: `¿Cuánto control necesitas? Elige el nivel, no aceptes uno fijo`

Contenido: la escalera de control como decisión del comprador — se empieza en modo simple y se activa recetas, insumos y kardex cuando el negocio lo pida, sin cambiar de producto; un food park puede tener puestos en ambos modos a la vez. *Por qué: es el eje del posicionamiento v2 y la respuesta a "¿y si mi negocio es pequeño?" del avatar (miedo al costo y a la complejidad): convierte la elección de control en argumento, no en obstáculo de entrada; diferencia a NHILOS de productos binarios que obligan a comprar de un nivel.*

#### H2: `Para qué negocios sirve: entra por el tuyo`

Contenido: 1–2 líneas de navegación honesta — cada segmento tiene su página con la operación detallada; el hub no repite ese contenido. *Por qué: este H2 es el corazón del trabajo de orientación del hub: reparte el tráfico por intención hacia el hijo correcto y distribuye autoridad de enlace con las queries de cada segmento como anchor (§3.6).*

> **H3: `Restaurantes de alta rotación`** → enlace `/software-pos/restaurantes/` con anchor `sistema POS para restaurante`
> Contenido: 2 líneas + prueba (clip de turno). *Por qué: G2 es P0 por demanda medida; el hijo hereda la jerarquía del home al separar páginas.*
>
> **H3: `Food parks y food courts`** → enlace `/software-pos/food-parks/` con anchor `software para food park`
> Contenido: 2 líneas (multi-marca, cajas compartidas, vista consolidada). *Por qué: P0 por avatar y posicionamiento; el H3 de convivencia de modos ya preparó el terreno.*
>
> **H3: `Cafeterías y comercios de mostrador`**
> Contenido: 2 líneas (modificadores por bebida, reventa simple). Cafetería con página dedicada aún no existe (G4 es P2, vive en `/facturacion-dgi/cafeterias/` cuando exista): se nombra el caso sin enlace roto, y el mostrador apunta a `/precios/` (Esencial es su plan de entrada) hasta que la evidencia de Planner justifique URL de retail. *Por qué: no se crean URLs sin evidencia (regla de datos de la arquitectura); el visitante de mostrador necesita un destino real hoy.*

#### H2: `Las tres preguntas que deciden: sin internet, DGI e inventario`

Contenido: navegación por objeción, una línea de respuesta orientativa por tema y el enlace al dueño del método — offline: la terminal enrolada sigue cobrando y sincroniza al reconectar (detalle y límites → `/software-pos/sin-internet/`); facturación: mecánica DT 09-2007 con consecutivo inalterable y anulación auditada; la autorización la posee tu negocio como contribuyente (método completo → `/facturacion-dgi/`); inventario: cada venta descuenta lo que consumió, en recetas o en stock simple (método → `/inventario/`). *Por qué: son las tres preguntas de WhatsApp del avatar (§4.6) y los tres clusters P0 de la arquitectura; el hub las responde en orientación y entrega el método al dueño de cada keyword, sin duplicarlo.*

> **H3: `Operación diaria con facturación: caja, bar y comida rápida`**
> Contenido: enlaces a los hijos de ángulo operativo con sus queries — `/software-pos/caja/` (`sistema de cierre de caja y arqueo`), `/software-pos/bares/` (`sistema POS para bar`), `/software-pos/comida-rapida/` (`software para comida rápida y mostrador`), `/software-pos/facturacion-dgi/` (`POS con facturación DGI en la operación diaria`). *Por qué: son hijos P1 del hub sin cabida natural en los H2 anteriores; la arquitectura §7 obliga al hub a enlazar a comida rápida, bares y restaurantes, y la regla 4 de anti-canibalización separa el ángulo operación (este hub) del ángulo cumplimiento (`/facturacion-dgi/`).*

#### H2: `¿Cuánto cuesta un sistema POS en Nicaragua?`

Contenido: una respuesta de orientación, no una tabla — depende de la operación (terminales, locales, si activas recetas); los planes públicos, setups y letra pequeña viven en `/precios/` con anchor `ver planes y precios de NHILOS POS`. *Por qué: la query de costo exacta es de `/precios/` (regla 6 de anti-canibalización: precio, cotización y compra viven ahí; regla 1: una primary por URL); duplicar la tabla dividiría la relevancia de las dos páginas y crearía un segundo lugar donde mantener los precios congelados sincronizados con la home — un riesgo de inconsistencia, no un beneficio.*

#### H2: `¿Necesito equipo especial?`

Contenido: la regla, no el catálogo — NHILOS POS opera en terminales táctiles Android; si ya tienes equipo se evalúa y si no, se cotiza el kit con proveedores locales. Precios y compatibilidades de hardware **no se publican aquí** (son de `/software-pos/hardware/` cuando exista, con precios validados). *Por qué: objeción de hardware del comprador; responder con la regla orienta sin adelantar precios no validados ni duplicar el futuro hijo de hardware.*

#### H2: `Preguntas frecuentes sobre sistemas POS en Nicaragua`

Contenido: acordeón con schema `FAQPage` sobre preguntas de categoría exactas — ¿Qué es un sistema POS local-first?, ¿Sirve para una tienda que no cocina?, ¿Funciona sin internet? (una línea + enlace al hijo), ¿Sirve para la DGI? (una línea de mecánica + división de autorización + enlace al hub fiscal), ¿Cuánto cuesta? (una línea + enlace a `/precios/`), ¿Se puede empezar simple y activar recetas después? *Por qué: el patrón FAQ ya captura snippets en el cluster (home); en el hub las respuestas son de orientación con entidad completa ("NHILOS POS") y mercado ("Nicaragua") en la primera frase — citables por LLMs según las reglas GEO del home — y cada respuesta de método termina en el enlace al dueño.*

#### H2: `Solicita una demo con datos reales de tu operación`

Contenido: CTA final — demo con escenario según el tipo de negocio y la prioridad + WhatsApp directo; el visitante del hub llega con la operación sin nombrar, así que el CTA pregunta antes de mostrar. *Por qué: cierra el funnel con la conversión estándar del mercado (G14); quien no identificó su segmento en el H2 de negocios entra por aquí sin pasar por un hijo.*

### 3.5 Guardia de claims: lo que `/software-pos/` NO publica

Lista vinculante, misma línea que la home (copy v1.6) y que `/precios/` (§2.5). Cada punto existe en algún documento interno y el producto **no puede sostenerlo hoy** o pertenece a otra página.

1. **"Facturación impresa" — NO publicar.** La impresión externa **no está implementada**: el adaptador ESC/POS genérico (issue #983) sigue abierto y solo Sunmi/iPOS integrados imprimen hoy. Reemplazo obligatorio: "factura con la mecánica que exige la DT 09-2007". Nunca "factura electrónica" ni "facturación electrónica".
2. **"Factura electrónica" / "sistema autorizado por la DGI" / "cero multas" — NO publicar.** Nicaragua opera facturación computarizada (SFC, DT 09-2007 + Ley 822 art. 143); no existe validación en línea y el término sería sobreafirmación. La autorización (carta, código y numeración) la posee cada cliente contribuyente; NHILOS garantiza solo la mecánica normativa. Nada de urgencia fiscal ni miedo para vender.
3. **"Nunca pierdes una venta" / "100% sincronizado" / continuidad absoluta — NO publicar.** La continuidad aplica a **terminal enrolada y catálogo hidratado**, y la sincronización es eventual, no instantánea. La fórmula condicionada de la arquitectura §2.1 manda ("cobra y factura aunque se caiga el internet" con sus condiciones); los límites exactos y qué se encola son de `/software-pos/sin-internet/`.
4. **Tabla de precios y comparación de planes — NO publicar.** La tabla completa, packs y add-ons viven en `/precios/` y en la home (`#precios`), sincronizados con el documento de precios congelado. Motivo: regla 6 de anti-canibalización (una etapa de compra, una URL) + regla de consistencia del brief de `/precios/` (cada tabla extra es un tercer lugar que puede desincronizarse). El hub enlaza con anchor descriptivo.
5. **Método fiscal detallado — NO publicar.** La mecánica completa de la DT 09-2007 (anulación paso a paso, libros, tabla garantiza/posee) es de `/facturacion-dgi/`; regla 4 de anti-canibalización (cumplimiento vs POS con DGI son ángulos distintos) y regla 1 (una primary por URL). El hub se queda en la línea de orientación del H2 de objeciones.
6. **Método de inventario detallado — NO publicar.** Kardex CPP, merma teórica vs física, conteos y alineación Ley 822 / NIC 2 son de `/inventario/` (regla 11: el inventario vende control de stock, la facturación se menciona). El hub enuncia el beneficio del descuento por venta y enlaza.
7. **Comparación contra competidor nombrado — NO publicar.** Las marcas (Sabor Suite, SistecPOS, POS-Master, Neox, Nuxo…) y sus precios son análisis interno con datos de terceros sin verificación vigente; la comparación honesta con metodología es de `/comparativas/` (regla 12). El hub compara contra el statu quo (Excel, cuaderno, POS fiscal viejo), nunca contra una marca.
8. **Precios y kits de hardware — NO publicar.** Estimados pendientes de validar con al menos dos proveedores locales; el detalle es de `/software-pos/hardware/` cuando exista. El hub solo dice: Android, aparte, se cotiza.
9. **Exportación contable, consolidación multi-sucursal automática y KDS — NO publicar.** Están en la lista "no se venden todavía" del documento de precios; existen solo como planes internos. La vista consolidada del food park **sí** puede mencionarse en su alcance operado hoy (él la usa como caso), sin prometer "todos tus locales desde el teléfono" ni dashboard consolidado de cadena.
10. **Queries de segmento como encabezados propios — NO usar.** Ningún H2 del hub lleva la primary de un hijo (`sistema POS para restaurante`, `software para food park`, `POS sin internet`, …): las queries de segmento aparecen solo como **anchor text de enlace** hacia el hijo dueño, no como títulos que compitan por la misma SERP (regla 1 de anti-canibalización).

### 3.6 Enlazado interno

**Entrante** (según arquitectura §7): home → `/software-pos/` desde su sección de producto; cada hijo del hub → `/software-pos/` (breadcrumb); `/comparativas/pos-vs-excel/` → `/software-pos/`. Anchors descriptivos y variados, nunca "click aquí" ni el mismo anchor exacto desde muchas páginas.

**Saliente — hacia abajo (hijos del hub), anchor con la query de cada uno:**

| Destino | Anchor | Nota |
|---|---|---|
| `/software-pos/restaurantes/` | `sistema POS para restaurante` | P0, existe en la ola 1 |
| `/software-pos/food-parks/` | `software para food park y food court` | P0, existe en la ola 1 |
| `/software-pos/sin-internet/` | `cómo sigue la venta sin internet: POS sin conexión` | P0, existe en la ola 1 |
| `/software-pos/caja/` | `sistema de cierre de caja y arqueo` | P1 — se añade al publicarse |
| `/software-pos/bares/` | `sistema POS para bar` | P1 — se añade al publicarse |
| `/software-pos/comida-rapida/` | `software para comida rápida y mostrador` | P1 — se añade al publicarse |
| `/software-pos/facturacion-dgi/` | `POS con facturación DGI en la operación diaria` | P1 — se añade al publicarse |
| `/software-pos/hardware/` | `kit y terminal punto de venta` | P1 — se añade al publicarse |
| `/software-pos/multisucursal/` | `sistema para varias sucursales` | P2 — se añade al publicarse |

Los H3 de los hijos no publicados aún no se escriben como enlaces (ni enlaces rotos ni páginas vacías); la sección de navegación del hub los incorpora al entrar cada hijo en producción, sin cambiar el resto del brief.

**Saliente — hacia arriba y lateral:** home (breadcrumb), `/precios/` (`ver planes y precios de NHILOS POS`), `/demo/` (CTA primaria `solicitar una demo con tu operación real`), `/facturacion-dgi/` (`mecánica de facturación DT 09-2007: qué garantiza el sistema y qué te corresponde a ti`), `/inventario/` (`control de inventario y kardex: recetas, insumos y merma`). `BreadcrumbList` al construir la página, como el resto de internas.

### 3.7 Medición: qué se considera éxito

Eventos (GA4 o equivalente, todos legibles por nombre):

- `hub_llega_formas` — scroll hasta el H2 de las dos formas de operación (sección visible ≥75%; mide si el reconocimiento cabe en la primera pantalla real).
- `hub_clic_hijo` — clic en cualquier enlace a hijo del hub, con parámetro del destino (`hijo=restaurantes`, `hijo=sin-internet`, …); es el evento que prueba el trabajo de orientación.
- `cta_demo_hub` — clic en "Solicitar una demo".
- `cta_whatsapp_hub` — clic de WhatsApp con UTM `utm_medium=hub-pos` para atribuir el canal.
- `faq_hub_abre` — apertura de cualquier ítem del FAQ.

Lecturas de éxito al checkpoint de 28 días (primer checkpoint del baseline GSC 0/0 de la arquitectura §9bis):

- **≥60%** de las sesiones llegan al H2 de las dos formas (el hub retiene al que vino a entender la categoría).
- **≥15%** de las sesiones generan al menos un `hub_clic_hijo` — el hub trabaja si reparte; un hub que solo convierte sin orientar está compitiendo con sus hijos, no sirviéndolos. El reparto entre hijos indica qué segmento domina y alimenta la priorización de las siguientes páginas.
- **≥6%** de las sesiones generan clic a demo o WhatsApp (intención convertida en contacto).
- **GSC:** impresiones de `sistema POS Nicaragua` y variantes genéricas atribuidas al hub — no a la home (frontera vigiada en §3.2). Si la home absorbe las impresiones del término cabeza, diferenciar el ángulo según la regla 9 de anti-canibalización; si un hijo absorbe una query de categoría, revisar que el hub no esté usando su primary como encabezado (regla 10 de la guardia).
- Con un dominio nuevo (baseline 0 clics / 0 impresiones), se miden **tasas y primer movimiento** (impresiones > 0), no absolutos; los umbrales absolutos se fijan tras el primer checkpoint con datos reales.

### 3.8 Meta sugerida

- **Title (≤60):** `Sistema POS en Nicaragua · NHILOS POS, venta local-first`
- **Description (≤155):** `Qué hace un sistema POS en Nicaragua y cómo elegir tu nivel de control: venta sin internet, mecánica DT 09-2007 y modo simple o recetas. NHILOS POS.`

## 4. Brief — `/facturacion-dgi/` (hub fiscal — DGI/DT 09-2007)

> **Escrito 2026-11-18.** Esta es la página con el **mayor riesgo de claim del sitio**: es donde el mercado entero sobreafirma ("factura electrónica DGI-NI", "sistema autorizado") y donde una sola palabra de más convierte un diferenciador en una promesa que el producto no puede sostener. Quien llega está preocupado: el dueño antes de una revisión, el dueño que heredó una numeración vieja, el contador que decide si el sistema le crea trabajo o se lo quita. El trabajo de la página es **reducir incertidumbre, no aumentarla**: explicar la norma en lenguaje llano nicaragüense, sostener la división mecánica/autorización a lo largo, y nunca deslizarse hacia "autorizado", "certificado", "aprobado" o "evita multas".

**Tono (vinculante):** sobrio, como un contador explicando una regla. Sin urgencia, sin miedo-venta, sin "multas" como gancho. El lector ya llegó preocupado; los adjetivos se cambian por hechos verificables.

### 4.1 Datos del brief

| Campo | Valor |
|---|---|
| Keyword principal | `sistema de facturación DGI en Nicaragua` (regla de los hubs, arquitectura §4) |
| Keywords secundarias | `facturación DGI Nicaragua`, `sistema de facturación Nicaragua` (mapa §5); `sistema de facturación DGI para pequeños negocios` (consideración, sin hijo dueño aún); `qué es la DT 09-2007 facturación` (informativa de norma — dueña aquí) |
| Intención | Híbrida informativa-transaccional: entender la norma y evaluar si el sistema sostiene el cumplimiento. Quien llega no compra por precio: compra por confianza. CTA suave |
| Respuesta rápida (primeros 150 px) | NHILOS garantiza la mecánica que exige la DT 09-2007: consecutivo inalterable, anulación solo con motivo auditado y libros exportables. La autorización —carta, código y numeración— la posee tu negocio como contribuyente. *(Frases exactas del home copy v1.6, FAQ G4 — esta página las sostiene a lo largo, no las cambia)* |
| Objeción principal | "¿Necesito autorización de la DGI y quién la tramita?" |
| Objeción secundaria | "¿Qué pasa si llega una revisión de la DGI?" (y la del contador: "¿este sistema me va a crear problemas?") |
| Prueba | Capturas reales del historial de comprobantes (correlativo visible) y del flujo de anulación con motivo; sin mockups; datos de demo etiquetados (arquitectura §2.1) |
| CTA | Solicitar una demo (primaria) + WhatsApp (secundaria), ambos suaves |
| Enlaces internos | home (breadcrumb), `/facturacion-dgi/restaurantes/` (al publicarse), `/precios/`, `/inventario/`, `/software-pos/`, `/demo/` |

### 4.2 Intención y queries objetivo

Las queries vienen del [documento de keywords](./nhilos_web_keyword_opportunities_v1.0.md), de la arquitectura (mapa §5, regla de hubs §4, regla 4 de anti-canibalización) y del [análisis SERP](./nhilos_web_serp_analysis_v1.0.md) (G6: "GO con precisión obligatoria"); no se inventan:

- **Primary:** `sistema de facturación DGI en Nicaragua` — asignada al hub por la regla de hubs de la arquitectura. Veredicto SERP: GO con precisión obligatoria — los que rankean son blogs de proveedores explicando pasos del SFC; el gap explotable es la guía honesta del SFC con los límites del sistema dichos de frente.
- **Secundarias del mapa §5:** `facturación DGI Nicaragua` y `sistema de facturación Nicaragua` — misma intención de cumplimiento, misma página.
- **De la tabla de keywords:** `sistema de facturación DGI para pequeños negocios` (consideración; sin hijo que la posea todavía) y la informativa `qué es la DT 09-2007 facturación` — la explicación de la norma es el territorio exclusivo de esta página: el home la adelanta en una línea (regla de profundidad) y ninguna otra URL la explica completa.
- **Cancelación:** la mecánica de anulación se explica completa en esta página (sección paso a paso). La query informativa `cómo anular una factura en la VET Nicaragua` pertenece al hijo de soporte `/facturacion-dgi/como-anular-factura-vet/` (P2): el hub nombra el tema y enlaza cuando el hijo exista, sin enlaces rotos.
- **Retención:** el documento de keywords **no registra una query medida de retención de comprobantes**. El tema se cubre dentro de la explicación de la norma (conservación de comprobantes y libros) sin crear un encabezado-target para una keyword que no existe en el dataset — regla de datos: no se crean encabezados para queries no medidas.

**Queries que esta página NO persigue, con dueño explícito** (regla 1 y regla 4 de anti-canibalización: cumplimiento vs POS-con-DGI son ángulos distintos):

| Query | Dueño |
|---|---|
| `software de facturación DGI para restaurantes`, `sistema de facturación DGI`, `facturación DT 09-2007`, `cómo facturar en la DGI Nicaragua restaurante` | `/facturacion-dgi/restaurantes/` (G6 hijo; la informativa de trámite es contenido educativo, no claim) |
| `sistema POS con facturación DGI`, `sistema POS con facturación DGI en Nicaragua` | `/software-pos/facturacion-dgi/` (G7 — operación diaria, no cumplimiento) |
| `sistema de facturación para cafetería en Nicaragua` | `/facturacion-dgi/cafeterias/` (G4, P2) |
| `cómo anular una factura en la VET Nicaragua` | `/facturacion-dgi/como-anular-factura-vet/` (P2; revisar con contador antes de publicar, según SERP §4) |
| `comprar sistema de facturación para restaurante` | `/precios/` (regla 6: la compra vive ahí) |
| `sistema de facturación electrónica para restaurantes` | **Sin URL, deliberadamente:** la facturación electrónica no se targetea ni se usa como claim (arquitectura §9bis: Nicaragua opera facturación computarizada; es un gap del mercado, no del producto) |
| `cómo evitar multas de la DGI`, `qué pasa si no facturo en Nicaragua` | **Sin dueño en esta página:** son miedo, no mecánica. Esta página no vende con multas. Si algún día se cubren, es contenido de recursos revisado con contador, nunca un gancho comercial |

### 4.3 Regla de profundidad y disciplina normativa

> **El home vende; `/facturacion-dgi/` explica la norma y sostiene la división.** Esta página puede exceder las ~120 palabras por H2 del home: cada párrafo debe responder una pregunta que el dueño preocupado se hace (¿mi factura es válida? ¿necesito autorización? ¿sirve mi numeración? ¿qué pasa si anulo? ¿qué muestro si llega una revisión?), no describir el producto. La operación diaria con facturación es de `/software-pos/facturacion-dgi/`; el ángulo restaurante es del hijo G6; el costo es de `/precios/`.

**Disciplina normativa (marco de `docs/inventario_marco_normativo.md`, aplicada al copy fiscal):** la página distingue tres capas — lo que la norma exige (verificado: DT 09-2007 y Ley 822 art. 143 según la cadena de evidencia del proyecto), lo que el rubro hace (declarado como práctica, no presentado como obligación) y decisiones de diseño propias (explicables, nunca disfrazadas de norma). Todo requisito normativo que **no esté verificado contra fuente en el repositorio** (por ejemplo, plazos legales de retención) se redacta como "confírmalo con tu contador" o se verifica contra la Gaceta antes de publicar — el mismo caveat de procedencia que el marco de inventario exige. Nada se eleva a norma por conveniencia comercial.

### 4.4 Jerarquía de encabezados

Los H2 siguen **el orden en que el dueño tiene el miedo**, no el orden de features: validez → autorización → numeración → anulación → qué exige la norma → división de responsabilidad → inspección → impresora → FAQ → cierre. Los H3 resuelven sub-ángulos.

#### H1: `Sistema de facturación DGI en Nicaragua: la mecánica que exige la DT 09-2007`

Contenido: keyword del término cabeza + la posición en dos líneas — la fórmula exacta del home (mecánica = NHILOS; autorización = contribuyente). Debajo, sin scroll, la aclaración "facturación computarizada, no factura electrónica". *Por qué: la regla de hubs asigna la primary aquí; la precisión es el diferenciador citable y el H1 debe contener lo que la gente teclea, no un adjetivo.*

#### H2: `¿La factura que emite NHILOS POS es válida ante la DGI?`

Contenido: respuesta directa en las palabras del dueño. En Nicaragua el régimen vigente es la facturación computarizada (Sistema de Facturación Computarizada, DT 09-2007 + art. 143 de la Ley 822); NHILOS opera dentro de ese régimen — y no pretende ser factura electrónica, que no existe como validación en línea en Nicaragua. La validez de tu facturación depende de dos cosas: que tu negocio tenga su autorización (eso es tuyo) y que el sistema cumpla la mecánica (eso lo garantiza NHILOS). *Por qué: el miedo #1, resuelto en la primera pantalla; mata de frente la confusión "factura electrónica" que los competidores sembraron en el mercado (hallazgo transversal del SERP).*

#### H2: `¿Necesito autorización de la DGI? ¿Quién la tramita?`

Contenido: sí — la autorización de facturación (la carta de autorización, el código y la numeración autorizada) la obtiene y la posee cada negocio como contribuyente. NHILOS no emite autorizaciones ni hace trámites: en la implementación (Paso 04) se registran el RUC y los datos de tu autorización para configurar el prefijo y el folio inicial desde el que el sistema empieza a numerar. *Por qué: la objeción principal; es la división que gana al contador y que ningún competidor responde con precisión.*

> **H3: `Qué es la carta de autorización, en palabras simples`**
> Contenido: explicación llana de la autorización del SFC para un sistema computarizado, con la instrucción explícita de confirmar los requisitos vigentes del trámite con el contador — la página no publica requisitos de trámite que el repositorio no tiene verificados contra fuente. *Por qué: el dueño que empieza de cero necesita la idea, no el manual; la humildad normativa es parte del tono.*

#### H2: `¿Sirve mi numeración actual o hay que empezar de cero?`

Contenido: el sistema no inventa numeración — empieza a numerar desde el folio inicial que tu autorización define. Lo que el sistema no hace: renumerar el pasado ni continuar folios de sistemas anteriores; esa continuidad la evalúa el contador junto con la implementación antes de la primera venta. *Por qué: miedo concreto del dueño que ya factura con otro sistema o en papel; la respuesta honesta evita prometer una migración de folios que no existe (guardia §4.5, punto 9).*

#### H2: `¿Qué pasa cuando hay que anular una factura? Paso a paso`

Contenido: el escenario completo, con captura real del flujo: (1) la factura nunca se elimina — no existe borrado en el sistema; (2) se pide la anulación con **motivo obligatorio** — sin motivo no avanza; (3) la autoriza un supervisor con su PIN (rol OWNER o MANAGER); (4) el sistema genera la **Nota de Crédito con folio correlativo propio**, vinculada a la factura original; (5) queda registrado quién, cuándo, por qué y desde qué terminal, y el evento es inmutable; (6) si la venta había descontado insumos o stock, la reversión es trazable en el kardex; (7) el contador exporta el detalle del periodo con sus notas de crédito. *Por qué: es el escenario que asusta y donde el producto realmente brilla — la anulación ordenada con rastro completo, contra el parche de borrar y seguir.*

> **H3: `Por qué una anulación bien hecha protege tu numeración`**
> Contenido: la secuencia sigue sin saltos — la factura anulada conserva su número (visible y marcada como anulada) y la nota de crédito lleva el suyo. *Por qué: conecta el miedo de anular con el miedo de "romper el correlativo"; ambas respuestas salen de la misma mecánica (PC-FISC-01/02).*

#### H2: `Lo que la DT 09-2007 le pide a la facturación computarizada`

Contenido: la norma explicada en lenguaje llano, con las tres mecánicas que el sistema implementa: **numeración consecutiva que no se puede alterar** (el sistema asigna el siguiente comprobante; no hay edición de folio ni saltos ni repeticiones), **anulación que exige motivo y deja rastro** (nada se borra; la cancelación es formal, autorizada y auditada) y **libros que se pueden exportar** (cuando el contador pide las ventas del periodo, salen del sistema). Todo requisito adicional de la disposición se enuncia solo si está verificado contra fuente; lo demás, con contador. *Por qué: la informativa `qué es la DT 09-2007 facturación` es dueña aquí; hoy esos pasos los explican blogs de terceros con claims imprecisos — esta es la guía honesta que el SERP confirmó como gap.*

#### H2: `Qué garantiza NHILOS y qué le corresponde a tu negocio`

Contenido: la tabla de dos columnas que el home adelanta en una línea y migra aquí completa (copy v1.0 → home FAQ → esta página). Cada celda de la izquierda tiene evidencia de código y prueba automatizada en el [product claim audit](../branding/claims/product_claim_audit_od02_v1.3.md); cada celda de la derecha es una obligación del contribuyente que ningún software puede absorber. *Por qué: el corazón de la página; el contador puede leerla y aceptarla celda por celda, y es el activo citable por LLMs (reglas GEO del home).*

| Garantiza NHILOS (mecánica, verificada en código) | Le corresponde a tu negocio (contribuyente) |
|---|---|
| Numeración consecutiva que no se puede saltar ni editar: el sistema asigna el siguiente comprobante, sin botón de edición de folio (`PC-FISC-01`) | Obtener y mantener tu autorización de facturación ante la DGI: la carta, el código y la numeración autorizada |
| Nada se borra: no existe eliminación física de facturas (`PC-FISC-02`) | Entregar el RUC y los datos de tu autorización para configurar prefijo y folio inicial (Paso 04 de implementación) |
| Anulación solo con motivo formal, autorizada con PIN de supervisor y registrada con quién, cuándo y por qué (`PC-FISC-02`, `PC-FISC-05`) | Emitir tus comprobantes en la forma autorizada a tu negocio — incluida la impresión del comprobante, que hoy depende del hardware del cliente |
| Nota de Crédito con folio correlativo propio, vinculada a la factura original (`PC-FISC-05`) | Conservar tus comprobantes y libros por el plazo legal — el plazo exacto lo confirma tu contador |
| Registro con fecha, hora, terminal y usuario de cada evento crítico (`PC-SEC-03`) | Entregar a tu contador la información del periodo: los libros exportables salen del sistema, la interpretación es del contador |
| Libros de ventas y reportes fiscales exportables cuando el contador los pida (`PC-DASH-04`) | Responder ante la DGI: la relación tributaria es del contribuyente; NHILOS no te representa ni hace trámites |
| El correlativo sigue operando sin internet y sincroniza en orden, sin duplicar, al reconectar (`PC-OFF-01/02/03`) | — |
| Validación algorítmica de cédula y RUC para evitar errores tipográficos — sintáctica, sin consulta al padrón en línea (`PC-FISC-03`) | — |

Nota bajo la tabla: esta división respeta la separación entre lo que la norma exige, lo que el rubro hace y decisiones de diseño propias — la misma disciplina de [`docs/inventario_marco_normativo.md`](../../inventario_marco_normativo.md) aplicada al copy fiscal.

#### H2: `¿Y si llega una revisión de la DGI?`

Contenido: sobrio, sin prometer resultados. Lo que puedes mostrar con el sistema: la secuencia completa sin saltos, cada anulación con su motivo y su responsable, y los libros del periodo exportables en limpio para el contador. Lo que el sistema no hace: responder por el negocio — la autorización, la conservación de comprobantes y la respuesta ante la DGI siguen siendo del contribuyente. Recomendación práctica: que tu contador prepare la carpeta; el sistema le entrega los datos ordenados. *Por qué: la pregunta que nadie teclea pero todos hacen por WhatsApp; responderla baja la temperatura sin vender miedo — y es el espejo de las páginas que vendieron con miedo y no pueden responderla.*

#### H2: `¿Qué pasa si uso una impresora que NHILOS no soporta?`

Contenido: estado honesto, sin promesa. Hoy la impresión integrada opera en terminales con impresora Sunmi/iPOS; la impresión externa del comprobante en ticketera genérica está en evaluación (issue #983) y **no se promete**. Lo que sí se afirma: el registro fiscal — correlativo, inmutabilidad, anulación auditada, libros exportables — no depende de la impresora; la emisión del comprobante en la forma autorizada es responsabilidad del negocio y se resuelve en la implementación con el hardware del cliente. El detalle de kits y compatibilidades es de `/software-pos/hardware/` cuando exista. *Por qué: la pregunta dura anticipada; responderla con estado real desactiva el claim "facturación impresa" prohibido y desarma la objeción del dueño con ticketera vieja sin prometer lo que no existe.*

#### H2: `Preguntas frecuentes sobre facturación DGI y DT 09-2007`

Contenido: acordeón con schema `FAQPage`, respuestas con entidad y mercado en la primera frase ("NHILOS POS…", "…en Nicaragua") según las reglas GEO del home: ¿NHILOS POS está autorizado por la DGI? (No — y la explicación exacta de la división: respuesta citable que ningún competidor se atreve a dar), ¿Necesito carta de autorización para facturar con sistema computarizado? (sí para el régimen SFC; el trámite es del contribuyente; confirma requisitos vigentes con tu contador), ¿Puedo anular una factura en NHILOS POS? (sí: motivo obligatorio, PIN de supervisor, Nota de Crédito con folio propio, sin borrado), ¿NHILOS POS es factura electrónica? (No: facturación computarizada, DT 09-2007 + art. 143 de la Ley 822; no hay validación en línea en Nicaragua), ¿Qué pasa con mi facturación si se cae el internet? (el correlativo sigue en la terminal enrolada; sincroniza al reconectar — detalle y límites → `/software-pos/sin-internet/`), ¿NHILOS POS imprime la factura en mi impresora? (estado honesto de #983), ¿Qué le entrego a mi contador? (libros exportables y notas de crédito del periodo). *Por qué: el patrón FAQ ya captura snippets en el cluster; aquí las respuestas precisas son el diferenciador — el "No" de la primera pregunta es la respuesta que el mercado no da.*

#### H2: `Solicita una demo con tu operación fiscal real`

Contenido: CTA suave — demo mostrando el historial de comprobantes y el flujo de anulación con datos etiquetados + WhatsApp directo. Quien llegó educándose convierte cuando ve su propio caso, no cuando le repiten la promesa. *Por qué: cierra el funnel con la conversión estándar del mercado (G14) sin romper el tono de la página.*

### 4.5 Guardia de claims: lo que `/facturacion-dgi/` NO publica

Lista vinculante. Es la página con más riesgo de claim del sitio: cada punto es una frase que el mercado usa y que este producto **no puede sostener hoy**, con su motivo.

1. **"Sistema autorizado / certificado / aprobado por la DGI" — NO publicar.** NHILOS no está registrado ni posee autorización DGI; la autorización (carta, código y numeración) la posee cada cliente contribuyente. Es la sobreafirmación que el mercado repite y la que esta página existe para no repetir.
2. **"Factura electrónica" / "facturación electrónica" / "XML firmado" / "CUFE" — NO publicar.** Nicaragua opera facturación computarizada (SFC, DT 09-2007 + Ley 822 art. 143); no existe validación en línea. La FE con XML/CUFE es futureware (Bloque 19 del roadmap; `PC-FISC-04` NOT_IMPLEMENTED). El término correcto es "facturación computarizada".
3. **"Cero multas" / "evita multas" / "protege de sanciones" / "pasa cualquier inspección" — NO publicar.** Ningún software puede garantizar un resultado ante la DGI: el cumplimiento es del contribuyente. Además, vender con miedo está vetado en el tono de la página; las queries de multas se rechazan (§4.2).
4. **"Facturación impresa" / "imprime tu factura DGI en cualquier impresora" — NO publicar.** La impresión externa del comprobante **no está implementada**: el adaptador ESC/POS genérico (issue #983) sigue abierto y hoy solo imprime la impresora integrada de terminales Sunmi/iPOS. Reemplazo obligatorio, misma línea que la home (copy v1.6): "factura con la mecánica que exige la DT 09-2007". La pregunta de la impresora se responde con estado honesto (H2 dedicado), nunca con promesa.
5. **"Validación de RUC en línea contra el padrón de la DGI" — NO publicar.** La validación es sintáctica y algorítmica (`PC-FISC-03`); no existe consulta en vivo al padrón en Nicaragua.
6. **"Cumplimiento total DGI" / "100% conforme" — NO publicar.** Regla vinculante de la arquitectura §2.1: la posición exacta es mecánica normativa + autorización del contribuyente; ningún porcentaje.
7. **"Hacemos el trámite ante la DGI por ti" / "te conseguimos la autorización" — NO publicar.** NHILOS registra en la implementación los datos de una autorización que el cliente obtiene y posee; no representa al contribuyente ni gestiona trámites.
8. **Plazos legales de retención con años o número de artículo — NO publicar** hasta verificarse contra fuente oficial (Gaceta), misma disciplina del caveat de procedencia del marco normativo de inventario. Mientras no esté verificado: "el plazo de conservación lo confirma tu contador".
9. **"Continuamos o migramos tu numeración anterior" — NO publicar.** El sistema empieza desde el folio inicial configurado con tu autorización; no renumera ni absorbe folios de sistemas previos. La continuidad la evalúa el contador con la implementación.
10. **Anulación automática o sin autorización — NO publicar.** La anulación exige motivo y PIN de supervisor (`PC-FISC-02/05`); prometer una anulación "de un clic sin permisos" contradiría la mecánica que la página vende.
11. **"Cómo anular una factura en la VET" como contenido de esta página — NO aquí.** Es un trámite del contribuyente, no un claim de producto; vive en el hijo de soporte P2 `/facturacion-dgi/como-anular-factura-vet/`, revisado con contador antes de publicar (SERP §4).

### 4.6 Enlazado interno

**Entrante** (según arquitectura §7): home → `/facturacion-dgi/`; hub `/software-pos/` → `/facturacion-dgi/` con el anchor ya definido en §3.6 ("mecánica de facturación DT 09-2007: qué garantiza el sistema y qué te corresponde a ti"); FAQ del home ("¿Sirve para la DGI?") → aquí con anchor descriptivo; `/inventario/` → aquí cuando exista (el lado fiscal de la venta). Anchors descriptivos y variados, nunca "click aquí" ni el mismo anchor exacto desde muchas páginas.

**Saliente:** home (breadcrumb, con `BreadcrumbList` al construir la página); `/facturacion-dgi/restaurantes/` con anchor `software de facturación DGI para restaurantes` (P0, ola 1 — se añade al publicarse, sin enlaces rotos); `/facturacion-dgi/como-anular-factura-vet/` (P2, ídem); `/precios/` (`ver planes y precios de NHILOS POS` — el costo se cierra allí, regla 6); `/inventario/` (`control de inventario y kardex` — la mitad física de una revisión: conteos y kardex son de la página de inventario, no de esta); `/software-pos/` (`qué es NHILOS POS: venta local-first` — quien llegó por la norma y aún no sabe qué es el producto); `/software-pos/sin-internet/` (límites exactos de la continuidad offline, desde el FAQ); `/demo/` (CTA primaria).

### 4.7 Medición: qué se considera éxito

Eventos (GA4 o equivalente, todos legibles por nombre):

- `facturacion_llega_division` — scroll hasta la tabla garantiza/corresponde (sección visible ≥75%): prueba que el lector llega al corazón de la página.
- `facturacion_anulacion_lee` — scroll hasta el paso a paso de anulación.
- `faq_facturacion_abre` — apertura de cualquier ítem del FAQ.
- `cta_demo_facturacion` — clic en "Solicitar una demo".
- `cta_whatsapp_facturacion` — clic de WhatsApp con UTM `utm_medium=facturacion-dgi` para atribuir el canal.

Lecturas de éxito al checkpoint de 28 días (primer checkpoint del baseline GSC 0/0 de la arquitectura §9bis):

- **≥60%** de las sesiones llegan a la tabla de división — la página sostiene la línea hasta el final y no abandona en el camino.
- **≥50%** de las sesiones que llegan a la división llegan también al paso a paso de anulación — el escenario que retiene al que vino preocupado.
- **≥5%** de las sesiones generan clic a demo o WhatsApp — umbral deliberadamente menor que `/precios/`: parte del tráfico es de contadores con intención informativa cuya conversión es indirecta (recomiendan al dueño); por eso la división precisa y el FAQ son el activo, no el CTA.
- **GSC:** impresiones de `sistema de facturación DGI en Nicaragua`, `facturación DGI Nicaragua` y `qué es la DT 09-2007` atribuidas a esta página — no a la home. Frontera vigiada: el FAQ DGI del home puede absorber las impresiones (regla 9 de anti-canibalización, revisión mensual; si la home absorbe, diferenciar el ángulo).
- Con un dominio nuevo (baseline 0 clics / 0 impresiones), se miden **tasas y primer movimiento** (impresiones > 0), no absolutos; los umbrales absolutos se fijan tras el primer checkpoint con datos reales.

### 4.8 Meta sugerida

- **Title (≤60):** `Facturación DGI Nicaragua: mecánica DT 09-2007 | NHILOS`
- **Description (≤155):** `Facturación DGI Nicaragua: mecánica DT 09-2007 — correlativo inalterable, anulación auditada y libros exportables. La autorización es de tu negocio.`

## 5. Brief — `/software-pos/restaurantes/` (G2)

> **Escrito 2026-11-18.** Esta página hereda la jerarquía del home al separar las páginas P0 (nota de migración del brief §1.2): la keyword restaurante migra aquí y la home se re-encabeza. Quien llega ya nombró su negocio: está resolviendo **si este sistema sostiene la operación de un restaurante con recetas y mesas**. El diferenciador de la página no es una lista de features: es que **cada plato vendido descuenta sus ingredientes** — la velocidad, la bimoneda y el arqueo existen para sostener esa prueba en hora pico.

### 5.1 Datos del brief

| Campo | Valor |
|---|---|
| Keyword principal | `sistema POS para restaurante` (G2, arquitectura §5) |
| Keywords secundarias | `sistema POS para restaurante en Nicaragua`, `software para restaurantes Nicaragua`, `POS para restaurante`, `punto de venta para restaurante` (mapa §5); `sistema POS para restaurante pequeño en Nicaragua` (consideración, tabla de keywords) |
| Intención | Comercial-transaccional de segmento: comparar sistemas para el restaurante y elegir |
| Respuesta rápida (primeros 150 px) | POS táctil local-first para restaurante: sigue cobrando sin internet y cada plato vendido descuenta sus ingredientes — receta por receta, con costo por plato. Bimoneda y correlativo DT 09-2007 |
| Objeción principal | "¿Y si se cae el internet el sábado a mediodía en plena fila?" |
| Objeción secundaria | "¿De verdad descuenta los insumos por plato, o es solo un registro?" (escepticismo sobre el diferenciador) |
| Prueba | Clips reales S23 Ultra (caja, recálculo de costo en recetas, contingencia offline) + capturas del dashboard real NHILOS Market & Café etiquetadas como datos de demostración; sin mockups |
| CTA | Solicitar una demo (primaria) + WhatsApp (secundaria) |
| Enlaces internos | `/software-pos/` (breadcrumb), `/inventario/` y `/inventario/restaurantes/` (al publicarse), `/facturacion-dgi/` y `/facturacion-dgi/restaurantes/` (al publicarse), `/software-pos/sin-internet/`, `/software-pos/caja/` (al publicarse), `/precios/`, `/demo/` |

### 5.2 Intención y queries objetivo

Las queries vienen de la [tabla de keywords](./nhilos_web_keyword_opportunities_v1.0.md), del mapa §5 y de la regla de hubs de la arquitectura §4; no se inventan:

- **Primary:** `sistema POS para restaurante` — asignada a esta página por el mapa §5. Veredicto SERP (§9bis): GO con diferenciación — el cluster más saturado; los gaps confirmados son offline-first real y precios transparentes. El precio vive en `/precios/`; el offline-first real y el descuento por plato son el contenido de esta página.
- **Secundarias del mapa §5:** `sistema POS para restaurante en Nicaragua`, `software para restaurantes Nicaragua`, `POS para restaurante`, `punto de venta para restaurante` — misma intención de segmento, misma página.
- **Del avatar (consideración):** `sistema POS para restaurante pequeño en Nicaragua` — se responde con la escalera de control (empezar en modo simple y activar recetas), no con una promesa de "versión lite"; el costo se cierra en `/precios/`.

**Queries que esta página NO persigue, con dueño explícito** (regla 1 de anti-canibalización; el detalle de cada dueño en la arquitectura §5–§6):

| Query | Dueño |
|---|---|
| `sistema POS Nicaragua`, `punto de venta Nicaragua` | `/software-pos/` (hub, término cabeza) |
| `sistema de cierre de caja`, `arqueo de caja restaurante`, `control de caja restaurante`, `programa de caja para restaurante` | `/software-pos/caja/` (G3, P1) |
| `sistema POS para bar` | `/software-pos/bares/` (G5, P1) |
| `software comida rápida`, `punto de venta comida rápida` | `/software-pos/comida-rapida/` (G17, P1) |
| `sistema de inventario para restaurante`, `control de inventario restaurante`, `kardex de restaurante`, `inventario de cocina para restaurante`, `sistema POS inventario`, `sistema para restaurante con recetas y costos` | `/inventario/restaurantes/` (G9; mientras el hijo no se publique, el método vive en `/inventario/` y esta página solo enuncia el beneficio) |
| `sistema de inventario y facturación para restaurante` | `/inventario/restaurantes/` (nota de deduplicación de la arquitectura §3) |
| `software de facturación DGI para restaurantes`, `facturación DT 09-2007`, `cómo facturar en la DGI Nicaragua restaurante` | `/facturacion-dgi/restaurantes/` (G6) |
| `sistema POS con facturación DGI` | `/software-pos/facturacion-dgi/` (G7, P1) |
| `precio de sistema POS para restaurante en Nicaragua`, `cotización`, `comprar`, `cuánto cuesta un sistema POS en Nicaragua` | `/precios/` (regla 6) |
| `demo de sistema POS para restaurante` | `/demo/` (G14) |
| `mejores puntos de venta para restaurantes`, `comparativa sistemas POS Nicaragua` | `/comparativas/` (G16, regla 12) |
| `sistema para varias sucursales de restaurante` | `/software-pos/multisucursal/` (G11, P2) |
| `cómo controlar la merma en un restaurante`, `cómo calcular el costo de un platillo` | `/recursos/merma/` y `/recursos/costeo-recetas/` (P2; informativas, no claims de página) |

### 5.3 Regla de profundidad de `/software-pos/restaurantes/`

> **Esta página opera; `/inventario/` valúa y `/facturacion-dgi/` cumple.** La página puede exceder las ~120 palabras por H2 del home: cada bloque responde una pregunta del operador de restaurante (¿aguanta hora pico? ¿descuenta de verdad? ¿factura bien? ¿cuánto y cómo empiezo?). El **diferenciador se demuestra, no se lista**: recetas que descuentan insumos por plato vendido, con clip real del recálculo de costo. El método de valuación (kardex CPP, merma teórica vs física, conteos, marco Ley 822 / NIC 2) es de `/inventario/` y de `/inventario/restaurantes/` al publicarse; la mecánica fiscal completa y la tabla garantiza/corresponde son de `/facturacion-dgi/`; los límites exactos de la contingencia offline son de `/software-pos/sin-internet/`; el arqueo y el cierre son de `/software-pos/caja/` (P1).

### 5.4 Jerarquía de encabezados

Los H2 siguen el orden en que el operador pregunta: reconocimiento → el diferenciador demostrado → continuidad → fiscal → costo → FAQ → cierre. Los H3 resuelven sub-ángulos.

#### H1: `Sistema POS para restaurante: cada plato vendido descuenta sus ingredientes`

Contenido: keyword exacta + el diferenciador en un renglón. El cuerpo habla de restaurantes de alta rotación y de cafeterías con cocina, y de la variante `en Nicaragua` en el subhead y el primer H2. *Por qué: la arquitectura asigna esta primary aquí; el H1 lleva lo que se teclea y el diferenciador que ningún competidor del cluster demuestra — el gap del SERP es offline-first real y precios, y el descuento por plato es la prueba técnica que lo sostiene.*

> **Actualizado 2026-11-20 (decisión del fundador).** *"A como puede ser restaurante, puede ser comiderías, foodparks con comida y negocios pequeños incluso, no necesariamente un restaurante grande."* El H1 se queda —es el término que se teclea y esta página lo posee— pero **el cuerpo amplía dentro del segmento**: un bloque de reconocimiento nombra comidería, fritanga, comedor, puesto de comida, cafetería con cocina, food park con cocina y negocio que cocina en casa o en ventana, **antes** del diferenciador. Los ejemplos usan escala pequeña (una o dos cajas, diez o veinte platos) y se prohíbe asumir escala ("sucursales", "franquicia", "varios salones", "salón VIP", "múltiples áreas", "carta de vinos"). La escalera se dice como opción, no como carencia: se empieza en modo simple y se activan recetas cuando el negocio lo pida. El registro no es ajeno al sitio: el home y `/precios/` ya usan "pulpería", otro término nicaragüense de negocio pequeño.

#### H2: `¿Qué es NHILOS POS para tu restaurante?`

Contenido: definición en 100–150 palabras — POS táctil local-first para venta en mesa y mostrador: catálogo con recetas, cobro bimoneda en córdobas y dólares, turnos con arqueo por usuario; y productos de reventa (botellas, postres comprados) operando en modo simple dentro del mismo catálogo. *Por qué: la intención pide identificar el producto para ESTE negocio; la mención del modo simple es capacidad nativa (`ProductType.SIMPLE`, decisión de posicionamiento §0) y refleja la operación real de un restaurante que también revende.*

> **H3: `Comidería, fritanga o comedor: si cocinas, es tu página`**
> Contenido: los formatos reales nombrados seguidos, con lo que ve cada uno: comidería o comedor de barrio (plato del día, una o dos cajas); fritanga o puesto de comida (alta rotación, venta rápida, recetas cortas); cafetería con cocina (bebidas y platos en el mismo catálogo); food park con cocina (catálogo por puesto, cada cocina con sus recetas); restaurante pequeño o mediano (mesas y mostrador). Cierra con la escalera: se empieza en modo simple y las recetas se activan cuando el negocio lo pida, sin comprar el control de uno grande. *Por qué: quien lee "restaurante" y tiene seis mesas o una ventana a la calle necesita reconocerse en la primera pantalla; el material del sitio muestra hoy una cafetería de marca propia, y esta es la página donde el segmento se abre a la escala real del mercado.*

> **H3: `Mesa y mostrador en la misma operación`**
> Contenido: 3–4 bullets del flujo — pedido en mesa o mostrador, modificadores rápidos, cobro bimoneda, arqueo firmado por usuario al cerrar turno. Sin promesa de despacho de comandas por red (guardia §5.5.1). *Por qué: traduce la categoría a la operación diaria del restaurante sin adelantar capacidades que no están vigentes.*

#### H2: `El diferenciador: recetas que descuentan insumos por plato vendido`

Contenido: la demostración — cada plato lleva su receta (BOM) y cada venta descuenta sus ingredientes: los gramos de café del capuchino, los insumos del plato del día. Aquí va el clip real del recálculo de costo. *Por qué: es la objeción secundaria respondida con evidencia visible, no con adjetivos; ningún competidor del cluster lo demuestra en video real (SERP §9bis).*

> **H3: `Qué pasa cuando cambia el precio de un insumo`**
> Contenido: el costo por plato se recalcula con la compra nueva — el margen se revisa antes de que el contador lo descubra a fin de mes. *Por qué: sub-pregunta real del operador que costea; conecta el diferenciador con la decisión de precio del menú.*
>
> **H3: `Modificadores sin romper la receta`**
> Contenido: agregados y sustituciones sobre el plato base, con su efecto en el descuento de insumos. *Por qué: es la diferencia entre una receta de libro y una receta que sobrevive al servicio real; pregunta concreta de quien ya usó otro POS.*

#### H2: `¿Qué pasa cuando se cae el internet en hora pico?`

Contenido: respuesta condensada en las palabras del home — la terminal tiene el catálogo cargado y sigue cobrando; el ticket sale con su correlativo; al volver la red, todo se sincroniza en orden. La fórmula condicionada ("terminal enrolada y catálogo hidratado", dicho en lenguaje del dueño: la terminal quedó configurada con tu catálogo) y el límite honesto; la lista completa de qué sigue y qué no es de `/software-pos/sin-internet/` con anchor `cómo sigue la venta sin internet: POS sin conexión`. *Por qué: la objeción principal; el home ya probó el clip — aquí va la respuesta del segmento con enlace al dueño del método, sin duplicarlo.*

#### H2: `Facturación que cumple la DT 09-2007 en cada comprobante`

Contenido: numeración consecutiva que no se puede saltar, nada se borra, anulación solo con motivo auditado; y la división en una línea — la autorización (carta, código y numeración) la posee tu negocio como contribuyente. La mecánica completa y la tabla garantiza/corresponde viven en `/facturacion-dgi/` (anchor `mecánica de facturación DT 09-2007: qué garantiza el sistema y qué te corresponde a ti`); el ángulo restaurante del cumplimiento, en `/facturacion-dgi/restaurantes/` al publicarse. *Por qué: la objeción del contador está en el proceso de compra de todo restaurante; responderla en una línea precisa y entregar el método al dueño evita canibalizar el hub fiscal (regla 4).*

#### H2: `¿Cuánto cuesta un POS para tu restaurante?`

Contenido: respuesta de orientación — depende de terminales y de si activas recetas; los planes públicos (Esencial, Operación, Pro) con setups viven en `/precios/` con anchor `ver planes y precios de NHILOS POS`; para un restaurante con recetas y dos terminales, el plan Pro es el que trae ambos packs y las terminales incluidas — dicho sin tabla duplicada. *Por qué: la pregunta de costo se responde orientando, no copiando la tabla (regla 6 de anti-canibalización y riesgo de desincronización de la guardia del hub §3.5.4); el operador llega al costo ya convencido del diferenciador.*

#### H2: `Preguntas frecuentes sobre el POS para restaurantes`

Contenido: acordeón con schema `FAQPage`, respuestas con entidad y mercado en la primera frase (reglas GEO del home): ¿Sirve para un restaurante con mesas y para llevar?, ¿Cada plato descuenta sus ingredientes de verdad?, ¿Qué pasa si cambia el precio de un insumo?, ¿Y si se cae el internet en hora pico? (una línea + enlace al hijo), ¿Sirve para la DGI? (línea de mecánica + división de autorización + enlace al hub fiscal), ¿Mis muchachos lo aprenden rápido? (capacitación incluida en la implementación, alcance según el documento de precios), ¿Cuánto cuesta al mes? (una línea + enlace a `/precios/`). *Por qué: el patrón FAQ captura snippets en el cluster; aquí las respuestas nombran el caso restaurante completo y cada una de método termina en el enlace al dueño.*

#### H2: `Solicita una demo con el menú de tu restaurante`

Contenido: CTA final — demo con escenario armado según tu tipo de negocio y tu prioridad + WhatsApp directo; cotización con cronograma real al finalizar la demo (bullets aprobados del copy v1.5 del home). *Por qué: cierra el funnel con la conversión estándar del mercado (G14); el operador convierte cuando ve su carta, no una presentación genérica.*

### 5.5 Guardia de claims: lo que `/software-pos/restaurantes/` NO publica

Lista vinculante, misma línea que la home (copy v1.8), `/precios/` (§2.5), el hub (§3.5) y el hub fiscal (§4.5).

1. **Despacho de comandas a cocina por red, pantallas de cocina (KDS) y coordinación entre terminales — NO publicar.** El despacho a cocina y la concurrencia por red local no son capacidades vigentes (#993 y #994 abiertos). Ya reconciliado en el home: el paso 02 del hilo dice «El pedido queda registrado — Cada comanda se registra en el sistema con sus modificadores, sin papeles ni notas a mano», sin despacho ni impresora, con su `CLAIM GUARD (#993/#983)`. Esta página debe mantener esa misma formulación: el pedido se registra, no se despacha por red. Nunca KDS como capacidad.
2. **"Facturación impresa" / "imprime en cualquier ticketera" — NO publicar.** La impresión externa no está implementada (#983 abierto); hoy solo imprime la impresora integrada de terminales Sunmi/iPOS. Reemplazo obligatorio: "factura con la mecánica que exige la DT 09-2007". Nunca "factura electrónica".
3. **"Sistema autorizado por la DGI" / "cero multas" / miedo fiscal — NO publicar.** La autorización la posee el contribuyente; NHILOS garantiza la mecánica normativa. Ninguna venta con miedo.
4. **"Nunca pierdes una venta" / "100% sincronizado" / continuidad absoluta — NO publicar.** Continuidad condicionada a terminal enrolada y catálogo cargado; sincronización eventual, no instantánea. Los límites exactos son de `/software-pos/sin-internet/`.
5. **Gestión de propinas como capacidad — NO publicar.** No hay evidencia de producto en el repositorio; el tema pertenece a `/software-pos/caja/` cuando exista y solo con verificación previa contra el producto.
6. **Método de inventario detallado — NO publicar aquí.** Kardex CPP, merma teórica vs física, conteos y el marco Ley 822 / NIC 2 son de `/inventario/` y de `/inventario/restaurantes/`; esta página enuncia el descuento por venta y el recálculo de costo (con clip) y enlaza. La guardia de valuación específica está en §8.5.
7. **Tabla de precios y comparación de planes — NO publicar.** Viven en `/precios/` y en la home, sincronizados con el documento de precios congelado; aquí solo orientación con anchor.
8. **Precios y kits de hardware, BYOD y su precio — NO publicar.** Hardware aparte, Android, se cotiza; BYOD solo cuando la impresión externa esté aceptada físicamente. El detalle es de `/software-pos/hardware/` cuando exista.
9. **Exportación contable, consolidación multi-sucursal, integración bancaria y gestión de rutas — NO publicar.** No se venden todavía; nada que lea como hoja de ruta.
10. **Vocabulario interno — NO usar.** Nunca "entitlements", números de issue, "go-live", "multi-tenant", "outbox", "catálogo hidratado" sin la traducción del dueño ("la terminal quedó configurada con tu catálogo"), ni frases de roadmap: la página describe lo que el producto hace hoy.

### 5.6 Enlazado interno

**Entrante:** home (hilo operativo, al separar las P0 con anchor `sistema POS para restaurante en Nicaragua`); hub `/software-pos/` → aquí con el anchor definido en §3.6 (`sistema POS para restaurante`); `/comparativas/` → aquí cuando exista (regla 12). Anchors descriptivos y variados, nunca "click aquí" ni el mismo anchor exacto desde muchas páginas.

**Saliente:** `/software-pos/` (breadcrumb, con `BreadcrumbList` al construir la página); `/inventario/` con anchor `control de inventario y kardex: recetas, insumos y merma`, y `/inventario/restaurantes/` al publicarse con anchor `sistema de inventario para restaurante` (sin enlaces rotos); `/facturacion-dgi/` con el anchor de §3.6 del hub; `/facturacion-dgi/restaurantes/` al publicarse con anchor `software de facturación DGI para restaurantes`; `/software-pos/sin-internet/` con anchor `cómo sigue la venta sin internet: POS sin conexión`; `/software-pos/caja/` al publicarse (P1); `/precios/` (`ver planes y precios de NHILOS POS`); `/demo/` (CTA primaria `solicitar una demo con el menú de tu restaurante`).

### 5.7 Medición: qué se considera éxito

Eventos (GA4 o equivalente, todos legibles por nombre):

- `restaurante_llega_recetas` — scroll hasta el H2 del diferenciador (sección visible ≥75%).
- `restaurante_clip_costo` — reproducción del clip de recálculo de costo (la prueba del diferenciador).
- `faq_restaurante_abre` — apertura de cualquier ítem del FAQ.
- `cta_demo_restaurante` — clic en "Solicitar una demo".
- `cta_whatsapp_restaurante` — clic de WhatsApp con UTM `utm_medium=restaurantes`.

Lecturas de éxito al checkpoint de 28 días (primer checkpoint del baseline GSC 0/0 de la arquitectura §9bis):

- **≥60%** de las sesiones llegan al H2 de recetas (la página retiene al que vino a evaluar el diferenciador).
- **≥30%** de las sesiones reproducen el clip de costo — el diferenciador se prueba, no se declara.
- **≥8%** de las sesiones generan clic a demo o WhatsApp.
- **GSC:** impresiones de `sistema POS para restaurante` y variantes atribuidas a esta página — no a la home ni al hub. Fronteras vigiadas: la home mantiene menciones naturales de restaurante hasta su re-encabezado, y el hub no usa esta primary como encabezado (guardia del hub §3.5.10). Si otra URL absorbe las impresiones, diferenciar el ángulo según la regla 9 de anti-canibalización (revisión mensual).
- Con un dominio nuevo (baseline 0 clics / 0 impresiones), se miden **tasas y primer movimiento** (impresiones > 0), no absolutos; los umbrales absolutos se fijan tras el primer checkpoint con datos reales.

### 5.8 Meta sugerida

- **Title (≤60):** `Sistema POS para restaurante en Nicaragua | NHILOS POS`
- **Description (≤155):** `POS para restaurante que sigue cobrando sin internet: cada plato vendido descuenta sus ingredientes, con costo por plato. Demo con tu menú. NHILOS POS.`

## 6. Brief — `/software-pos/food-parks/` (G1)

> ### 6.0 Corrección de fondo: quién es el cliente (2026-11-20, fundador, vinculante)
>
> **Verbatim:** *"No me gusta el enfoque que le dimos a /food-parks/, porque se entiende como que el producto se lo vendemos al foodpark como tal, y ellos gestionan cada kiosco/puesto. Cuando no es así, nosotros le vendemos a los negocios del foodpark directamente. Por ejemplo el cliente que tenemos que es cafetería, tiene su puesto en un foodpark, pero le ofrecimos el servicio directamente a él, no a los que gestionan el foodpark en general."*
>
> **El modelo correcto, y lo que el resto de este apartado debe respetar:**
>
> 1. **El food park no es el cliente. Es el lugar.** El cliente es **el negocio que opera un puesto**, con su RUC, su catálogo, su caja, sus turnos y sus reportes.
> 2. **Nadie gestiona los puestos del park.** No existe el papel de "administrador del park" que compra para todos, ni una suscripción por park, ni un panel que consolide las ventas de los puestos. Esas tres cosas se retiran del brief y de la página.
> 3. **Cada negocio del park contrata lo suyo.** Dos puestos del mismo patio son dos clientes distintos del sistema, aunque compartan local.
> 4. **Lo que la página vende es independencia dentro de un lugar compartido:** no dependes de la caja del park, ni de su contabilidad, ni de su criterio de numeración. Tu puesto emite lo suyo.
> 5. **El park importa por lo que cambia en la operación**, no por quién lo administra: espacio pequeño, fila continua, varios giros en el mismo patio, energía y red compartidas que fallan juntas.
>
> **Queda derogado** por contradicción con lo anterior, en todo el apartado §6:
> - la fórmula del administrador del park como "techo aprobado" (§6.3 y §6.4 H2 2), y su H3 de roles;
> - "una suscripción por park, sus propios puestos y sus propias marcas" (§6.0 original y §6.1);
> - la tabla de estructuras fiscales que hace del park un emisor posible (§6.9), salvo la fila que dice que **cada negocio emite lo suyo**, que es la única real;
> - la guardia §6.5.5 en su forma original: el precio **sí es por negocio**, que es exactamente lo que publica `/precios/`.
>
> **H1 corregido:** `Software para food park: tu puesto con su catálogo, su cobro y su factura`
> Mantiene la query (`software para food park`) y cambia el sujeto: no el park, **tu puesto**.
>
> **Mapa de H2 corregido (8, verbatim):**
> 1. `¿Qué es NHILOS POS para tu puesto en un food park?`
>    - H3: `Tu puesto es el negocio: catálogo, cobro y turno propios`
>    - H3: `Tres puestos o veinte: el park también es pequeño`
> 2. `Lo que no tienes que compartir con el park`
>    - H3: `Tu cajero responde a ti, no a la administración del patio`
> 3. `Puestos que revenden y cocinas que preparan, en el mismo patio`
> 4. `¿Qué pasa cuando se cae el internet en el park?`
> 5. `Facturación por puesto conforme a la DT 09-2007`
> 6. `¿Cuánto cuesta si estás en un food park?`
> 7. `Preguntas frecuentes sobre el software para food park`
> 8. `Solicita una demo con el menú de tu puesto`
>
> **Guardia nueva, de clase:** la página **no puede** decir "administrador del park", "el park contrata", "una suscripción por park", "los puestos del park llegan al panel", "vista del park", ni "gestión de locatarios". Y **debe** afirmar, al menos una vez y en el primer bloque, que el puesto es el negocio y que el park es el lugar.
>
> **El meta cambia con el sujeto.** Title y description vigentes en §6.8 quedan derogados; el nuevo texto vive en el ODD de la página (T1).



> **Escrito 2026-11-18, después de la auditoría de claims del home (copy v1.8).** Es la página del segmento primario del avatar y del posicionamiento (P0 por avatar, no por volumen). **Regla de consistencia vinculante:** el home v1.8 acotó el claim del food park a **"una suscripción por park, sus propios puestos y sus propias marcas"** y retiró "vista consolidada de todas las marcas" y "cajas compartidas" — esta página usa exactamente ese alcance y no lo ensancha. La fórmula aprobada del administrador es la del FAQ G6 del home: *el administrador del park ve su operación desde el panel web, y las ventas de todos llegan al panel cuando la conexión está disponible*. El KDS no se vende (#993) y no aparece.

### 6.1 Datos del brief

| Campo | Valor |
|---|---|
| Keyword principal | `software para food park` (G1, arquitectura §5) |
| Keywords secundarias | `sistema POS para food park`, `sistema POS para food court`, `administración de food park`, `software para food park en Managua` (mapa §5); `software para food park con múltiples puestos` y `POS para food park vs POS tradicional` (consideración, tabla de keywords) |
> ⚠️ **Derogado por §6.0:** el park es el lugar donde el negocio vende, no el cliente. No hay administrador que compre por los puestos.
| Intención | Comercial-transaccional de segmento: el dueño o administrador del park evalúa si un sistema cubre la operación multi-marca |
> ⚠️ **Derogado por §6.0:** el park es el lugar donde el negocio vende, no el cliente. No hay administrador que compre por los puestos.
| Respuesta rápida (primeros 150 px) | Un sistema para todo el park: cada puesto con su catálogo y su cobro, el administrador ve la operación desde el panel web. Puestos de reventa y cocinas con recetas conviven en el mismo sistema. Correlativo DT 09-2007 |
| Objeción principal | "¿Cada puesto necesita su propio sistema y su propia suscripción?" |
| Objeción secundaria | "¿Puede el administrador ver lo que pasa en el park sin complicar a cada locatario?" |
| Prueba | Clips reales S23 Ultra (caja, contingencia offline) + capturas del panel web con datos de demostración etiquetados (provenance aprobado: NHILOS Market & Café); sin mockups |
| CTA | Solicitar una demo (primaria) + WhatsApp (secundaria) |
| Enlaces internos | `/software-pos/` (breadcrumb), `/software-pos/sin-internet/`, `/inventario/` y `/inventario/food-parks/` (al publicarse), `/facturacion-dgi/`, `/software-pos/comida-rapida/` (al publicarse), `/precios/`, `/demo/` |

### 6.2 Intención y queries objetivo

Las queries vienen de la tabla de keywords, del mapa §5 y del grupo G1 de la arquitectura; no se inventan:

- **Primary:** `software para food park` — asignada a esta página. Veredicto SERP (§9bis): GO como posicionamiento — ningún competidor nicaragüense targetea "food park/food court"; la página es dueña de una intención sin competencia directa.
- **Secundarias del mapa §5:** `sistema POS para food park`, `sistema POS para food court` (misma intención — nota de deduplicación de la arquitectura), `administración de food park`, `software para food park en Managua` (variante local que no crea página propia: regla 3 — sin dirección, caso o contenido diferencial no hay `/managua/`; la página menciona Managua como mercado, sin caso local inventado).
- **De consideración:** `software para food park con múltiples puestos` — es literalmente lo que la página explica (catálogo por puesto, cobro por terminal). `POS para food park vs POS tradicional` — la comparación food-park-vs-genérico es el contenido natural de esta página (la comparativa genérica de marcas es de `/comparativas/`, regla 12); se responde contra el statu quo del park (caja de un solo rubro, cuaderno por locatario), nunca contra marca nombrada.

**Queries que esta página NO persigue, con dueño explícito:**

| Query | Dueño |
|---|---|
| `sistema POS Nicaragua` y variantes de categoría | `/software-pos/` (hub) |
| `software comida rápida`, `punto de venta comida rápida` (QSR, mostrador, frito) | `/software-pos/comida-rapida/` (G17, regla 10: food park agrupa puestos, QSR agrupa comida rápida — enlaces recíprocos con anchors distintos) |
| `software de inventario para food park`, `inventario para food park` | `/inventario/food-parks/` (G10, P2; mientras no exista, el método vive en `/inventario/`) |
| `sistema para varias sucursales de restaurante`, `sistema para varios locales`, `reportes de ventas por sucursal` | `/software-pos/multisucursal/` (G11, P2 — una cadena de locales no es un food park; no confundir las dos intenciones) |
| `POS sin internet`, `sistema POS offline` | `/software-pos/sin-internet/` (G8) |
| `sistema de facturación DGI en Nicaragua`, `facturación DT 09-2007` | `/facturacion-dgi/` (hub fiscal) |
| `precio`, `cotización`, `comprar` | `/precios/` (regla 6) |
| `demo de sistema POS para restaurante` | `/demo/` (G14) |

### 6.3 Regla de profundidad de `/software-pos/food-parks/`

> ⚠️ **Derogado por §6.0:** el park es el lugar donde el negocio vende, no el cliente. No hay administrador que compre por los puestos.
> **Esta página muestra el park operando dentro del alcance aprobado del home v1.8 — ni un claim más.** Cada bloque responde una pregunta del administrador o del dueño del park (¿cómo opera cada puesto? ¿qué ve el administrador? ¿qué pasa si un puesto cocina y otro revende? ¿y sin internet? ¿cuánto para todo el park?). Lo que NO entra: vista consolidada multi-marca como promesa, caja compartida entre puestos, coordinación por red local, KDS, dashboards de cadena — ninguno es capacidad vigente. El método offline es de `/software-pos/sin-internet/`; el método de inventario por puesto es de `/inventario/`; la mecánica fiscal es de `/facturacion-dgi/`.

### 6.4 Jerarquía de encabezados

#### H1: `Software para food park: tu puesto con su catálogo, su cobro y su factura`

Contenido: keyword exacta + el alcance aprobado en un renglón. El cuerpo desarrolla la fórmula del home v1.8: una suscripción por park, sus propios puestos y sus propias marcas. *Por qué: intención sin competencia directa en la SERP; el H1 lleva la query y la promesa exacta que el producto puede sostener — ni "todas las marcas consolidadas" ni "caja compartida".*

#### H2: `¿Qué es NHILOS POS para tu puesto en un food park?`

Contenido: definición en 100–150 palabras — el park contrata una suscripción como negocio; cada puesto opera con su catálogo y su cobro en su terminal; los puestos de reventa (botanas, bebidas embotelladas) trabajan en modo simple y las cocinas activan recetas e insumos: ambos modos conviven en el mismo sistema. *Por qué: responde la objeción principal ("¿un sistema por puesto?") desde la primera pantalla y refleja la escalera continua del posicionamiento §0 sin prometer nada que no opere hoy.*

> **H3: `Tu puesto es el negocio: catálogo, cobro y turno propios`**
> Contenido: la operación por terminal — catálogo propio, cobro bimoneda, arqueo por turno y usuario. *Por qué: traduce el modelo a la operación diaria del puesto.*

#### H2: `Lo que no tienes que compartir con el park`

Contenido: la fórmula exacta del FAQ G6 del home, sin ensancharla — el administrador del park ve su operación desde el panel web, y las ventas de los puestos llegan al panel cuando la conexión está disponible. Lo que la página no dice: "vista consolidada de todas las marcas", "todos tus parks desde el teléfono", "dashboard de cadena" (guardia §6.5). *Por qué: es la objeción secundaria; responderla con la fórmula aprobada mantiene el home y esta página sincronizados — un claim ensanchado aquí sería un tercer alcance que desincronizar.*

> **H3: `Tu cajero responde a ti, no a la administración del patio`**
> Contenido: separación de roles entre la administración del park y la operación del puesto (portal del propietario, habilitado al terminar la puesta en marcha según las condiciones publicadas del home). Sin prometer permisos finos que no estén publicados. *Por qué: pregunta de gobernanza real de un park; la respuesta queda dentro del alcance de roles ya publicado.*

#### H2: `Puestos que revenden y cocinas que preparan, en el mismo patio`

Contenido: el caso mixto — un puesto en modo simple junto a una cocina con recetas e insumos; el control se activa por puesto, no por park. El detalle del descuento por receta enlaza a `/inventario/` con anchor `control de inventario y kardex: recetas, insumos y merma`. *Por qué: es la continuidad de la escalera (posicionamiento §0) aplicada al segmento donde más se nota; diferencia a NHILOS de un POS de un solo modo.*

#### H2: `¿Qué pasa cuando se cae el internet en el park?`

Contenido: cada terminal enrolada sigue cobrando con su catálogo cargado y emite el ticket con su correlativo; al volver la red, las ventas sincronizan al panel en orden. Respuesta condensada — la lista de qué sigue y qué no es de `/software-pos/sin-internet/` con el anchor del hub §3.6. Sin promesa de coordinación entre terminales sin conexión (guardia §6.5). *Por qué: en un park el apagón de red es el peor escenario del sábado; responderlo con la fórmula condicionada, no con continuidad absoluta.*

#### H2: `Facturación por puesto conforme a la DT 09-2007`

Contenido: cada comprobante que emite cada puesto sigue la misma mecánica — numeración consecutiva inalterable, anulación solo con motivo auditado, libros exportables; la autorización la posee el contribuyente que emite. La mecánica completa es de `/facturacion-dgi/`. **No se explica en esta página cómo se autoriza fiscalmente cada locatario frente al park** — es una definición del negocio que esta página no inventa (ver bandera en el informe del brief). *Por qué: el comprador de un park pregunta por el correlativo de cada puesto; la respuesta segura es la mecánica, no un arreglo de autorizaciones que el producto no define hoy.*

#### H2: `¿Cuánto cuesta si estás en un food park?`

Contenido: la suscripción es del negocio (el park), no por puesto ni por marca; las terminales adicionales son add-on con enrolamiento, según lo publicado en `/precios/` con anchor `ver planes y precios de NHILOS POS`. Sin cifras propias ni "precio por locatario" inventado. *Por qué: responde la objeción de costo con la estructura de precios publicada — el riesgo de inventar una regla de precios por puesto es publicar algo que el documento de precios no dice.*

#### H2: `Preguntas frecuentes sobre el software para food park`

Contenido: acordeón con schema `FAQPage` (respuestas con entidad y mercado en la primera frase): ¿Cada puesto necesita su propio sistema? (no: una suscripción por park, puestos propios en el mismo sistema), ¿Puede el administrador ver la operación del park? (fórmula exacta del FAQ G6 del home), ¿Un puesto que revende y una cocina pueden usar el mismo sistema? (sí: modos que conviven), ¿Qué pasa con la facturación de cada puesto? (mecánica DT 09-2007; autorización del contribuyente + enlace al hub fiscal), ¿Funciona sin internet? (fórmula condicionada + enlace al hijo), ¿Cuánto cuesta para el park? (suscripción por negocio + terminales como add-on + enlace a `/precios/`). *Por qué: las preguntas del park son distintas a las del restaurante — el FAQ las responde en su vocabulario y deja el método al dueño de cada cluster.*

#### H2: `Solicita una demo con el menú de tu puesto`

Contenido: CTA final — demo con escenario armado según tu tipo de negocio y tu prioridad + WhatsApp directo; cotización con cronograma real al finalizar la demo. *Por qué: cierra el funnel con la conversión estándar (G14); el escenario demostrado con varios puestos es la prueba que el park necesita.*

### 6.5 Guardia de claims: lo que `/software-pos/food-parks/` NO publica

1. **"Cajas compartidas" / "una sola caja central para todo el park" / "caja común entre puestos" — NO publicar.** El home v1.8 retiró el claim: la caja compartida entre puestos no es capacidad del sistema. Cada terminal cobra lo suyo. Si la operación del cliente la exige, es conversación de implementación, no claim de página.
2. **"Vista consolidada de todas las marcas" / "todos tus parks desde el teléfono" / "dashboard de cadena" — NO publicar.** La consolidación multi-sucursal no se vende (documento de precios, lista "no se venden todavía") y el home v1.8 la retiró. Reemplazo único: la fórmula del FAQ G6 del home (administrador ve la operación del park desde el panel web; ventas llegan cuando la conexión está disponible). Esta fórmula es el techo — no se reescribe más alta en esta página.
3. **Coordinación entre terminales por red local / LAN en tiempo real — NO publicar.** No es capacidad vigente (#994). Cada terminal opera por su lado y sincroniza al reconectar.
4. **KDS / pantallas de cocina / despacho de comandas por red — NO publicar.** No se vende (#993). En un food park la tentativa de prometer "la cocina de cada puesto ve su comanda" es alta: prohibida.
> ⚠️ **Derogado por §6.0:** el park es el lugar donde el negocio vende, no el cliente. No hay administrador que compre por los puestos.
5. **Suscripción por puesto o por locatario con precio — NO publicar.** Los precios son por negocio (el park); terminales adicionales como add-on según `/precios/`. Inventar una regla de precios por locatario contradiría el documento de precios congelado.
6. **Arreglo fiscal del park vs locatarios (quién factura, quién está autorizado) — NO especificar.** La página se queda en la mecánica DT 09-2007 y en la división mecánica/autorización del hub fiscal; cómo se autoriza cada locatario es definición del negocio que no está en los documentos y que esta página no inventa.
7. **Caso local de Managua — NO inventar.** La variante `en Managua` se menciona como mercado; sin dirección, caso o contenido local real no hay claims de presencia ni hijo `/managua/` (regla 3 de anti-canibalización).
8. **Estándar transversal — NO publicar:** "facturación impresa" (#983), "factura electrónica", "sistema autorizado por la DGI", "cero multas", "nunca pierdes una venta", "100% sincronizado", precios de hardware o BYOD, exportación contable, y ningún vocabulario interno ("entitlements", números de issue, "go-live") ni frases de roadmap.

### 6.6 Enlazado interno

**Entrante:** home (tarjeta de escenarios, anchor `software para food park en Nicaragua`); hub `/software-pos/` → aquí con el anchor de §3.6 (`software para food park y food court`); `/comparativas/` → aquí cuando exista. Anchors descriptivos y variados.

**Saliente:** `/software-pos/` (breadcrumb, `BreadcrumbList` al construir); `/software-pos/sin-internet/` (anchor del hub §3.6 — límites exactos de la contingencia); `/inventario/` (`control de inventario y kardex: recetas, insumos y merma`) y `/inventario/food-parks/` al publicarse con anchor `software de inventario para food park` (sin enlaces rotos); `/facturacion-dgi/` (`mecánica de facturación DT 09-2007: qué garantiza el sistema y qué te corresponde a ti`); `/software-pos/comida-rapida/` al publicarse — enlace recíproco food court ↔ QSR con anchors distintos (regla 10); `/precios/` (`ver planes y precios de NHILOS POS`); `/demo/` (CTA primaria).

### 6.7 Medición: qué se considera éxito

Eventos (GA4 o equivalente, todos legibles por nombre):

- `foodpark_llega_puestos` — scroll hasta el H2 de cómo opera cada puesto (sección visible ≥75%).
- `foodpark_admin_lee` — scroll hasta el H2 del administrador (el corazón de la objeción secundaria).
- `faq_foodpark_abre` — apertura de cualquier ítem del FAQ.
- `cta_demo_foodpark` — clic en "Solicitar una demo".
- `cta_whatsapp_foodpark` — clic de WhatsApp con UTM `utm_medium=food-parks`.

Lecturas de éxito al checkpoint de 28 días:

- **≥60%** de las sesiones llegan al H2 de operación por puesto.
- **≥40%** de las sesiones llegan al H2 del administrador — la página funciona si el que evalúa gobernanza encuentra su respuesta.
- **≥8%** de las sesiones generan clic a demo o WhatsApp.
- **GSC:** impresiones de `software para food park` y variantes (food court, administración) atribuidas a esta página. Fronteras vigiadas: el hub (que la nombra en su H3 con anchor) y la home (tarjeta de escenarios). Regla 9 de anti-canibalización, revisión mensual.
- Con un dominio nuevo, se miden **tasas y primer movimiento** (impresiones > 0), no absolutos; umbrales absolutos tras el primer checkpoint con datos reales.

### 6.8 Meta sugerida

- **Title (≤60):** `Software para food park en Nicaragua | NHILOS POS`
- **Description (≤155):** `Un sistema para todo el food park: cada puesto con su catálogo y su cobro, y la operación visible en el panel web. Pide una demo. NHILOS POS.`

> ⚠️ **Derogado por §6.0:** el park es el lugar donde el negocio vende, no el cliente. No hay administrador que compre por los puestos.
### 6.9 Quién factura en un food park: no es una decisión de producto

> **Renumerado 2026-11-20.** Era el segundo `6.6` del apartado (el primero es *Enlazado interno*), el mismo defecto de numeración que el §8 arrastra con dos `8.6`. El contenido no cambió: solo el número.

**Resuelto 2026-11-18 por análisis, no por preferencia.** Rige el principio de que **quien vende es quien factura**: el sistema no elige al emisor, lo registra. De ahí salen tres estructuras y sólo dos son soportables hoy:

| Estructura del park | Quién emite | ¿Soportado hoy? |
|---|---|---|
> ⚠️ **Derogado por §6.0:** el park es el lugar donde el negocio vende, no el cliente. No hay administrador que compre por los puestos.
| El park es dueño de sus marcas y factura todo bajo su RUC | El park, con su autorización | **Sí** — un tenant, un establecimiento, una serie |
| Cada locatario independiente tiene su RUC y vende lo suyo | Cada locatario, con la suya | **Sí** — una suscripción por locatario |
| Caja compartida que cobra y factura **por cuenta de terceros** | Ambiguo | **No** — depende de #994 (topología) y de quién emite |

**Lo que la página dice:** las dos primeras, describiendo quién emite en cada una. **Lo que la página no dice:** que la tercera exista. Un park que quiera cobrar por sus locatarios es un caso a definir antes de venderse, no una capacidad del producto.

**Frontera con #994:** la topología multi-terminal (varias cajas, coordinación, series) tampoco es capacidad vigente. Esta página no promete ni cajas compartidas ni coordinación entre puestos.

## 7. Brief — `/software-pos/sin-internet/` (G8)

> **Escrito 2026-11-18.** La página del diferenciador y de la objeción #1 del avatar ("¿Qué pasa si se cae?"): P0 por diferenciador, no por volumen. Su trabajo es **explicar qué pasa de verdad** — la venta se completa en la terminal, el correlativo fiscal sigue avanzando, el ticket sale, y la sincronización llega después — y ser honesta sobre lo que no es instantáneo. La lista "qué sigue funcionando / qué se encola" migrada del home (tabla v1.0→v1.1 del copy) es la semilla de esta página: aquí se despliega completa. El artboard actual de esta URL promete "100%", "todo" e "instantáneo": **esos términos se retiran al reescribir** (tabla de reuso de la arquitectura §4.1).

### 7.1 Datos del brief

| Campo | Valor |
|---|---|
| Keyword principal | `sistema POS sin internet para restaurante` (G8, arquitectura §5) |
| Keywords secundarias | `POS sin internet`, `punto de venta sin internet`, `sistema POS offline` (mapa §5); `sistema POS que funcione sin internet en Nicaragua` (consideración, tabla de keywords) |
| Informativa dueña aquí | `cómo funciona un POS offline` — la explicación del mecanismo es contenido de esta página, no de un recurso (tabla de keywords, prioridad 3) |
| Intención | Comercial de diferenciador con capa informativa: entender qué pasa realmente sin conexión y decidir si el sistema aguanta el peor escenario |
| Respuesta rápida (primeros 150 px) | Cuando la red se cae, la venta se completa en la terminal: cobra en córdobas o dólares, emite el ticket con su correlativo consecutivo y queda registrada. Al volver el internet, todo llega al panel web en orden, sin duplicar. La condición: la terminal quedó configurada con tu catálogo |
| Objeción principal | "¿Se pierden las ventas mientras no hay internet?" |
| Objeción secundaria | "¿Y la facturación — no se rompe el correlativo?" (influenciador: contador) |
| Prueba | Clip real de contingencia offline (S23 Ultra) + captura del badge de sincronización al reconectar; simulador offline del artboard reutilizable; datos de demostración etiquetados |
| CTA | Solicitar una demo (primaria) + WhatsApp (secundaria) |
| Enlaces internos | `/software-pos/` (breadcrumb), `/software-pos/restaurantes/`, `/software-pos/food-parks/`, `/facturacion-dgi/`, `/precios/`, `/demo/` |

### 7.2 Intención y queries objetivo

Las queries vienen de la tabla de keywords y del mapa §5; no se inventan:

- **Primary:** `sistema POS sin internet para restaurante` — asignada a esta página. Veredicto SERP (§9bis): GO fuerte — solo jugadores internacionales explican el concepto; ningún POS local lo posee.
- **Secundarias del mapa §5:** `POS sin internet`, `punto de venta sin internet`, `sistema POS offline` — misma intención, misma página (regla 2: no se crea una URL por variante).
- **De consideración:** `sistema POS que funcione sin internet en Nicaragua` — la versión local de la misma pregunta; se responde en el cuerpo con mercado y condición explícitos.
- **Informativa dueña aquí:** `cómo funciona un POS offline` — el mecanismo (venta local, cola de salida, sincronización en orden) se explica en esta página en lenguaje del dueño; es el contenido que ninguna URL del sitio puede explicar mejor, y el activo citable para LLMs (reglas GEO del home).

**Queries que esta página NO persigue, con dueño explícito:**

| Query | Dueño |
|---|---|
| `sistema POS para restaurante` y variantes de segmento | `/software-pos/restaurantes/` (G2 — esta página es el diferenciador, no la página del restaurante) |
| `software para food park`, `food court` | `/software-pos/food-parks/` (G1) |
| `sistema de facturación DGI en Nicaragua`, `facturación DT 09-2007` | `/facturacion-dgi/` (hub fiscal — aquí solo la línea del correlativo sin conexión) |
| `sistema de cierre de caja`, `arqueo` | `/software-pos/caja/` (G3, P1) |
| `kit punto de venta`, `terminal punto de venta` (incluida la pregunta de batería/equipo) | `/software-pos/hardware/` (G12, P1) |
| `sistema POS local vs sistema POS en la nube`, `comparativa sistemas POS Nicaragua` | `/comparativas/` (G16, P1 — `pos-local-vs-nube/`) |
| `precio`, `cotización`, `comprar` | `/precios/` (regla 6) |
| `demo de sistema POS para restaurante` | `/demo/` (G14) |
| `sistema POS para tienda / miscelánea` | Sin URL todavía: retail es candidato pendiente de demanda medida (posicionamiento §0.3); la página habla de "negocio de mostrador" en el cuerpo sin crear encabezado-target de retail |

### 7.3 Regla de profundidad de `/software-pos/sin-internet/`

> **Esta página es el método del offline — la única URL donde la contingencia se explica completa.** Puede exceder las ~120 palabras por H2 del home y del hub: cada bloque responde una pregunta del peor momento (¿qué pasa a media venta? ¿qué sigue? ¿qué no es instantáneo? ¿y el correlativo? ¿y si se daña la terminal?). La regla de honestidad manda sobre el marketing: cada lista "qué sí / qué no" se verifica contra el clip y la operación antes de publicar, y lo no instantáneo se dice con la misma claridad que lo que sí funciona. Ningún otro contenido del sitio duplica esta explicación — el home la condensa en una línea y el hub en una línea de orientación.

### 7.4 Jerarquía de encabezados

Los H2 siguen el orden del peor momento: la escena → qué sigue → qué no es instantáneo → facturación → pérdida → la condición → terminal dañada → FAQ → cierre.

#### H1: `Sistema POS sin internet: qué pasa cuando la red se cae, paso a paso`

> **Actualizado 2026-11-20.** El H1 decía `Sistema POS sin internet para restaurante: …` y esta es una página de **capacidad**, no de segmento: la contingencia funciona igual en un restaurante, una cafetería, un food park o un mostrador. Es el mismo defecto que se corrigió en §9: el segmento en la puerta de entrada. La query se conserva en el H2 siguiente, que la contiene literal.

#### H2: `Sistema POS sin internet para restaurante, cafetería, food park o mostrador`

Contenido: una línea por caso sobre qué sigue funcionando sin red —restaurante con recetas (descuento de insumos y correlativo), cafetería o panadería (venta y vitrina), food park (cobro por puesto), mostrador (venta simple)—, cerrando con que la mecánica es la misma y lo que cambia es la operación, no la contingencia. Aquí vive la frase exacta que se busca: `sistema POS sin internet para restaurante`. *Por qué: la query segmento-calificada entra por un encabezado sin encasillar la página, y el lector de otro rubro se reconoce en la misma línea.*

Contenido: keyword exacta + la promesa de explicación honesta. La continuidad se enuncia con sus condiciones en el primer H2, no como título absoluto. *Por qué: el diferenciador del sitio merece su propia URL (P0 por objeción, arquitectura §3); el H1 promete lo que la página entrega — el mecanismo completo — porque ningún competidor local documenta contingencia offline (gap confirmado del SERP).*

#### H2: `¿Qué pasa cuando se cae el internet a media venta?`

Contenido: la escena del avatar (sábado 12:30, fila, red caída) resuelta en concreto: la venta se completa en la terminal — cobra en córdobas o dólares, emite el ticket con su correlativo consecutivo y queda registrada en el equipo. Aquí va el clip real de contingencia. *Por qué: responder el miedo #1 del avatar con la escena exacta que él vive; el clip prueba, el texto traduce.*

> **H3: `Qué sigue funcionando sin conexión`**
> Contenido: la lista verificable migrada del home (v1.0→v1.1) — cobro bimoneda, ticket con correlativo, catálogo cargado, registro local de la venta y del turno. Cada ítem verificado contra clip u operación antes de publicar. *Por qué: la objeción literal; una lista verificable es la diferencia entre prometer y demostrar — y es el bloque que ningún competidor publica.*
>
> **H3: `Qué no es instantáneo (y cuándo llega)`**
> Contenido: la honestidad de la página — la sincronización al panel web es eventual: las ventas quedan en la cola de salida del dispositivo y llegan al panel al reconectar, en orden y sin duplicar. Mientras no hay conexión, el panel no se actualiza y la gestión web queda en pausa. Cada terminal opera por su lado: la coordinación entre terminales sin conexión no es parte del sistema hoy. *Por qué: la regla vinculante de la arquitectura §2.1 (no "100% sincronizado", no "instantáneo"); decir el límite de frente es lo que hace creíble todo lo demás — y desactiva la sobreafirmación que el artboard actual de esta URL contiene.*

#### H2: `¿Y la facturación sin internet? El correlativo no se rompe`

Contenido: el correlativo fiscal sigue avanzando en la terminal sin saltos ni repeticiones, y sincroniza en orden al reconectar sin duplicar (mecánica `PC-OFF-01/02/03` del hub fiscal). La división completa mecánica/autorización es de `/facturacion-dgi/` con anchor `mecánica de facturación DT 09-2007: qué garantiza el sistema y qué te corresponde a ti`. *Por qué: la objeción secundaria — la que bloquea al contador; responderla aquí con la línea exacta y entregar el método al hub fiscal (regla 4).*

#### H2: `¿Se pierden las ventas mientras no hay internet?`

Contenido: respuesta directa — las ventas quedan registradas primero en la terminal (en la cola de salida del dispositivo) y suben al panel al volver la red, en orden y sin duplicar. Sin promesa de "nunca pierdes una venta": la fórmula es la venta **completada en la terminal**, con la condición de la siguiente sección. *Por qué: la objeción principal; la respuesta exacta que el dueño puede contarle a su cajera. La fórmula condicionada de la arquitectura §2.1 manda sobre cualquier titular absolutista.*

#### H2: `La condición honesta: la terminal quedó configurada con tu catálogo`

Contenido: la continuidad aplica a terminal enrolada y catálogo hidratado, dicho en lenguaje del dueño — la terminal debe estar configurada a tu negocio y con su catálogo cargado; eso lo valida la implementación antes de quedar en producción (fórmula exacta del FAQ G3 del home). Qué significa en la práctica: el enrolamiento y la carga de catálogo son parte de la puesta en marcha, no un ajuste de emergencia. *Por qué: la fórmula condicionada es la posición pública del proyecto (arquitectura §2.1 y §5); publicarla aquí completa es lo que permite usar el diferenciador sin sobreafirmar en ninguna otra página.*

#### H2: `¿Y si se daña la terminal?`

Contenido: se recupera enrolándola de nuevo y sincronizando el catálogo; las ventas que no llegaron a la nube están en la cola de salida del equipo (fórmula del FAQ G9 del home). La pregunta de qué equipo y de la batería es de `/software-pos/hardware/` cuando exista — aquí solo la recuperación de datos. *Por qué: el miedo de continuidad incluye el equipo; responder la recuperación cierra el círculo sin prometer resistencia física que no se ha probado.*

#### H2: `Preguntas frecuentes sobre el POS sin internet`

Contenido: acordeón con schema `FAQPage` (entidad y mercado en la primera frase): ¿Cómo funciona un POS offline? (el mecanismo en 3 líneas — la informativa dueña aquí), ¿Se pierden las ventas sin internet?, ¿Puedo facturar sin conexión? (correlativo local + enlace al hub fiscal), ¿Cuándo veo las ventas en mi panel? (eventual, al reconectar, en orden), ¿Funciona con varias terminales al mismo tiempo sin internet? (honesto: cada terminal por su lado; coordinación sin conexión no es parte del sistema hoy), ¿Y si se va la luz? (el apagón eléctrico no es el apagón de red: la terminal necesita energía — sin prometer autonomía que depende del equipo), ¿Qué necesito para que funcione sin internet? (la condición del enrolamiento). *Por qué: el FAQ del diferenciador es el activo citable para LLMs preguntando por POS offline en Nicaragua; cada respuesta lleva su límite — la precisión es el diferenciador, como en el hub fiscal.*

#### H2: `Solicita una demo y mira la contingencia con tu operación`

Contenido: CTA final — demo con el escenario de contingencia mostrado en vivo + WhatsApp directo; cotización con cronograma real al finalizar la demo. *Por qué: el diferenciador se decide viéndolo; la demo con el clip en vivo es la conversión natural de esta página (G14).*

### 7.5 Guardia de claims: lo que `/software-pos/sin-internet/` NO publica

Es la página donde la sobreafirmación es más tentadora y más dañina: el diferenciador entero depende de que el límite se diga bien.

1. **"100% sincronizado" / "todo se sincroniza" / "instantáneo" / "tiempo real" — NO publicar.** La sincronización es eventual (al reconectar, en orden, sin duplicar); el artboard actual de esta URL usa estos términos y se retiran al reescribir (tabla de reuso de la arquitectura §4.1). La gestión web y el panel quedan en pausa sin conexión — dicho, no ocultado.
2. **"Nunca pierdes una venta" / "cero pérdida" / "no paras nunca" — NO publicar.** La fórmula condicionada de la arquitectura §2.1 manda: la continuidad aplica a terminal enrolada y catálogo cargado. H1 absolutistas ("la venta no se detiene") sin condición en el cuerpo, tampoco.
3. **Coordinación entre terminales sin internet / cajas conectadas por red local — NO publicar.** No es capacidad vigente (#994). Cada terminal opera por su lado; la respuesta honesta del FAQ es un "no, hoy", y se escribe como tal.
4. **"Funciona sin luz" / autonomía eléctrica — NO publicar.** El avatar confunde apagón de red con apagón eléctrico; la página aclara la diferencia y no promete batería ni autonomía que dependen del equipo. La pregunta de equipo es de `/software-pos/hardware/`.
5. **"Facturación impresa" sin conexión / "imprime el ticket en cualquier ticketera" — NO publicar.** Impresión externa no implementada (#983); hoy solo imprime la impresora integrada Sunmi/iPOS. El ticket que la página promete es el de terminal integrada.
6. **Mecánica fiscal ampliada — NO publicar aquí.** El correlativo sin conexión y la sincronización en orden son de esta página; el resto de la mecánica DT 09-2007 (anulación paso a paso, libros, tabla garantiza/corresponde) es de `/facturacion-dgi/` (regla 4 de anti-canibalización).
7. **KDS y despacho a cocina sin conexión — NO publicar.** No se vende (#993); en contingencia menos que nunca.
8. **Vocabulario interno — NO usar en texto visible.** "Outbox" no existe para el lector: la palabra aprobada es "la cola de salida del dispositivo" (FAQ G9 del home); "enrolada" e "hidratado" aparecen solo con su traducción del dueño. Nunca "entitlements", números de issue ni "go-live".
9. **Datos no verificados — NO publicar.** Cada ítem de las listas "qué sí / qué no" se valida contra clip u operación real antes de publicar (regla de evidencia del avatar §7); si un ítem no tiene evidencia, sale de la lista.

### 7.6 Enlazado interno

**Entrante:** home (sección "Un POS que funciona sin internet", anchor `cómo funciona NHILOS POS sin internet`); hub `/software-pos/` → aquí con el anchor de §3.6 (`cómo sigue la venta sin internet: POS sin conexión`); `/software-pos/restaurantes/` y `/software-pos/food-parks/` → aquí desde sus H2 de contingencia; FAQ del home ("¿Funciona sin internet?") → aquí; `/facturacion-dgi/` → aquí desde su FAQ (límites de la continuidad); `/comparativas/` → aquí cuando exista (regla 12). Anchors descriptivos y variados.

**Saliente:** `/software-pos/` (breadcrumb, `BreadcrumbList` al construir); `/facturacion-dgi/` (anchor del hub §3.6 — el correlativo es fiscal); `/software-pos/restaurantes/` (`sistema POS para restaurante`) y `/software-pos/food-parks/` (`software para food park y food court`) — quien llegó por el miedo necesita ver su segmento; `/software-pos/hardware/` al publicarse (equipo y batería); `/precios/` (`ver planes y precios de NHILOS POS`); `/demo/` (CTA primaria).

### 7.7 Medición: qué se considera éxito

Eventos (GA4 o equivalente, todos legibles por nombre):

- `offline_llega_escena` — scroll hasta el H2 de la escena a media venta (sección visible ≥75%).
- `offline_listas_lee` — scroll hasta los H3 "qué sigue / qué no es instantáneo" (el bloque de honestidad).
- `faq_offline_abre` — apertura de cualquier ítem del FAQ.
- `cta_demo_offline` — clic en "Solicitar una demo".
- `cta_whatsapp_offline` — clic de WhatsApp con UTM `utm_medium=sin-internet`.

Lecturas de éxito al checkpoint de 28 días:

- **≥60%** de las sesiones llegan a la escena; **≥40%** llegan a las listas de honestidad — la página funciona si el lector ve también el límite, no solo la promesa.
- **≥6%** de las sesiones generan clic a demo o WhatsApp — umbral menor que la página de segmento: parte del tráfico llega educándose sobre el concepto offline y convierte después en otra página.
- **GSC:** impresiones de `sistema POS sin internet para restaurante`, `POS sin internet`, `punto de venta sin internet`, `sistema POS offline` y `cómo funciona un POS offline` atribuidas a esta página. Fronteras vigiadas: la home (H2 propio de offline) y el hub. Regla 9 de anti-canibalización, revisión mensual; si la home absorbe las impresiones, diferenciar el ángulo (la home promete, esta página explica).
- Con un dominio nuevo, se miden **tasas y primer movimiento** (impresiones > 0), no absolutos; umbrales absolutos tras el primer checkpoint con datos reales.

### 7.8 Meta sugerida

- **Title (≤60):** `POS sin internet en Nicaragua: qué pasa cuando cae la red` — **57 caracteres**. *(El anterior medía **61** y excedía su propio límite.)*
- **Description (≤155):** `La venta se completa en la terminal: cobra, emite el ticket con su correlativo y sincroniza al reconectar, en orden. Mira cómo funciona sin internet.`

## 8. Brief — `/inventario/` (hub de inventario)

> **Escrito 2026-11-18.** El hub de inventario ataca el término cabeza del cluster (`sistema de inventario Nicaragua`) y sostiene la disciplina normativa del marco de inventario (`docs/inventario_marco_normativo.md`): distingue **NORMA** (lo que la ley exige — Ley 822 art. 44, su Reglamento art. 33, NIC 2 §23–25), **PRÁCTICA** (cómo lo hace el rubro, declarada como tal) y **DECISIÓN del sistema** (explicable, nunca disfrazada de norma). Esta es, junto con el hub fiscal, la página con más riesgo de sobreafirmación de valuación: el sistema costea por costo promedio ponderado y **no** compara contra precio de mercado — cualquier claim que lo diga de otro modo incumple el marco. El marco declara brechas abiertas (R-01, R-02, R-06; R-05 parcial): la página presenta el marco como lo que el negocio debe cumplir y la posición real del sistema, sin vestir brechas de capacidad.

### 8.1 Datos del brief

| Campo | Valor |
|---|---|
| Keyword principal | `sistema de inventario Nicaragua` (regla de los hubs, arquitectura §4) |
| Keywords secundarias | `software de inventario Nicaragua`, `sistema kardex Nicaragua` (mapa §5); `sistema POS con control de inventario y merma` (consideración, tabla de keywords) |
| Intención | Híbrida comercial-informativa: entender cómo se controla un inventario con sistema (vs Excel/cuaderno) y evaluar el método — quien llega quiere saber de dónde sale el número, no solo el beneficio |
| Respuesta rápida (primeros 150 px) | Cada venta descuenta lo que consumió — el plato por su receta, el producto de reventa por su stock —, con kardex y costo promedio ponderado, conteos y merma teórica vs física. El marco que exige la ley (Ley 822 art. 44, Reglamento art. 33, NIC 2) explicado; la valuación fiscal la cierra tu contador |
| Objeción principal | "¿De dónde sale el costo que me muestra el sistema?" (desconfianza en el número) |
| Objeción secundaria | "¿Esto le sirve a mi contador o es solo para la caja?" (influenciador: contador) |
| Prueba | Clip real del recálculo de costo en recetas + capturas del kardex y de una sesión de conteo con datos de demostración etiquetados; sin mockups |
| CTA | Solicitar una demo (primaria) + WhatsApp (secundaria) |
| Enlaces internos | home (breadcrumb), `/inventario/restaurantes/` y `/inventario/food-parks/` (al publicarse), `/facturacion-dgi/`, `/software-pos/`, `/precios/`, `/demo/`, `/recursos/merma/` y `/recursos/costeo-recetas/` (al publicarse) |

### 8.2 Intención y queries objetivo

Las queries vienen del mapa §5, de la regla de hubs §4 y de la tabla de keywords; no se inventan:

- **Primary:** `sistema de inventario Nicaragua` — asignada al hub por la regla de hubs. El SERP del cluster restaurante (G9) es GO fuerte con gap confirmado (nadie ofrece merma teórica vs física sin conteo manual); el hub sostiene el término cabeza y entrega el segmento a sus hijos.
- **Secundarias del mapa §5:** `software de inventario Nicaragua`, `sistema kardex Nicaragua`.
- **De consideración:** `sistema POS con control de inventario y merma` — la combinación POS+inventario es la operación real del producto; se responde aquí y en los hijos.

**Queries que este hub NO persigue, con dueño explícito:**

| Query | Dueño |
|---|---|
| `sistema de inventario para restaurante`, `control de inventario restaurante`, `inventario de restaurante`, `kardex de restaurante`, `inventario de cocina para restaurante`, `sistema POS inventario` | `/inventario/restaurantes/` (G9, P0 — el hijo dueño del segmento; el hub no usa su primary como encabezado) |
| `sistema de inventario y facturación para restaurante` | `/inventario/restaurantes/` (nota de deduplicación de la arquitectura §3) |
| `software de inventario para food park`, `inventario para food park` | `/inventario/food-parks/` (G10, P2) |
| `cómo controlar la merma en un restaurante`, `cómo calcular la merma de un restaurante`, `cómo llevar inventario de un restaurante`, `cómo calcular el costo de un platillo` | `/recursos/merma/` y `/recursos/costeo-recetas/` (P2 — informativas de recurso, no claims de página de producto) |
| `sistema de facturación DGI en Nicaragua`, `facturación DT 09-2007` | `/facturacion-dgi/` (regla 11: el inventario vende control de stock; la facturación se menciona) |
| `sistema POS para restaurante`, `sistema POS Nicaragua` | `/software-pos/restaurantes/` y `/software-pos/` (hub POS) |
| `precio`, `cotización`, `comprar` | `/precios/` (regla 6) |
| `demo de sistema POS para restaurante` | `/demo/` (G14) |
| `sistema de inventario para tienda / conveniencia / miscelánea` | Sin URL todavía: retail es candidato pendiente de demanda medida (posicionamiento §0.3); el hub nombra el modo reventa en texto, sin encabezado-target de retail |

### 8.3 Regla de profundidad y disciplina normativa

> **Este hub orienta y sostiene el marco; los hijos detallan el método por segmento.** El hub puede exceder las ~120 palabras por H2 del home en dos terrenos: educación de método (de dónde sale el costo, qué es el descuento por venta, qué es la merma teórica vs física) y educación del marco normativo (qué exige la ley al inventario de un negocio). **Disciplina de capas, obligatoria en todo el copy:** lo que la ley exige se enuncia con su fuente (Ley 822 art. 44; Reglamento de la Ley 822, art. 33; NIC 2 §23–25) y como obligación del negocio; lo que el rubro hace se declara como práctica; lo que el sistema hace se declara como posición actual del producto — y donde el marco declara una brecha abierta (R-01: sin comparación contra precio de mercado; R-02: sin registro de autorización de cambio de método; R-05 parcial: conteos sin listas firmadas por hoja; R-06: sin exportación para la Administración), la página no promete la capacidad. La valuación fiscal la cierra el contador del negocio con sus libros; el sistema lleva el registro operativo.

### 8.4 Jerarquía de encabezados

#### H1: `Sistema de inventario en Nicaragua: cada venta descuenta lo que consumió`

Contenido: keyword del término cabeza + el beneficio mecánico en un renglón. *Por qué: la regla de hubs asigna la primary aquí; el diferenciador del cluster es el descuento automático — el gap confirmado del SERP es la merma teórica vs física sin conteo manual.*

#### H2: `¿Qué es NHILOS POS para tu inventario?`

Contenido: definición en 100–150 palabras — el inventario vive dentro del POS: cada venta descuenta en el momento, en receta (lo que se cocina) o en stock simple (lo que se revende), sin hojas de cálculo ni conteo nocturno para saber qué hay. *Por qué: la intención pide entender el método antes que el segmento; los dos modos son la escalera del posicionamiento §0 aplicada al inventario.*

> **H3: `Productos que se preparan: recetas e insumos`**
> Contenido: receta BOM, descuento por venta, subrecetas; el clip real del recálculo de costo. *Por qué: la prueba técnica más fuerte; se demuestra, no se declara.*
>
> **H3: `Productos que se revenden: stock simple`**
> Contenido: modo simple — alta con costo y precio, stock, alertas; ejemplo de mostrador. *Por qué: cubre al comprador de reventa que busca "sistema kardex" sin cocina.*

#### H2: `¿De dónde sale el costo? El kardex y el costo promedio ponderado`

Contenido: el kardex registra cada entrada con su costo y cada salida con el costo promedio ponderado del momento; los reportes de valorización salen de ahí. En el pack Retail el kardex se publica como "kardex, costo promedio ponderado"; **"kardex valorizado" es el diferenciador del plan Pro** (regla de precios del home v1.8) — esta página lo usa con esa precisión de plan. El método de valuación completo por segmento es de los hijos. *Por qué: la objeción principal es literal — de dónde sale el número; mostrar el kardex con su clip responde con el registro, no con un adjetivo.*

#### H2: `Lo que la ley exige a tu inventario (y cómo se cumple)`

Contenido: el marco en lenguaje llano, con las tres capas declaradas — **NORMA:** la Ley 822 (art. 44) pide valuar al **menor entre el costo y el precio de mercado**, admite costo promedio, FIFO y UEPS, y exige **autorización por escrito de la Administración Tributaria** para cambiar de método; el Reglamento (art. 33) pide **inventario físico al fin del año** con **listas firmadas y fechadas por hoja** por quienes contaron, y registros disponibles ante la Administración si se usa otro sistema; NIC 2 (§23–25) pide identificación específica para bienes no intercambiables y la misma fórmula para inventarios similares (y bajo NIC 2, UEPS no es admisible). **PRÁCTICA:** la rotación FEFO/FIFO por lote es práctica de rubro, no norma. **El sistema hoy:** lleva el registro operativo — kardex con costo promedio ponderado, descuento por venta, sesiones de conteo y merma teórica vs física — y **sí** compara contra un precio de mercado declarado por insumo con fecha de vigencia, valuando al menor y registrando el castigo; **no** registra la autorización de cambio de método ni emite listas firmadas por hoja, y la conformidad del caso concreto la cierra el contribuyente con su contador. *Por qué: la informativa del marco es territorio de esta página — hoy nadie la explica con fuentes y sin sobreafirmar; es el activo citable por contadores y LLMs, y la única forma honesta de tocar la valuación (guardia §8.5). Fuentes citadas como las lee el marco; la aplicación al caso concreto se confirma con el contador.*

> **H3: `Qué hace el sistema y qué le corresponde a tu negocio y a tu contador`**
> Contenido: la división en dos columnas, misma disciplina que la tabla del hub fiscal — izquierda: registro operativo verificado (kardex CPP, descuento por venta, sesiones de conteo, merma teórica vs física, lotes y vencimiento del pack Retail, y la valuación al menor entre costo y un precio de mercado declarado por insumo con vigencia, con castigo registrado); derecha: la conformidad fiscal del caso concreto, la autorización escrita de cambio de método, el inventario físico anual con listas firmadas y la respuesta ante la Administración. Cada celda de la izquierda verificada contra el producto antes de publicar. *Por qué: la división es el formato que el contador puede aceptar celda por celda; replicar el patrón del hub fiscal mantiene la coherencia de sitio y hace citable la página.*

#### H2: `Merma teórica vs física, sin detener la operación`

Contenido: la comparación automática contra conteos — lo que la receta dice que debía usarse contra lo que el conteo encuentra; alineada a la disciplina de control que el marco exige. El detalle por segmento en `/inventario/restaurantes/` al publicarse; el recurso educativo en `/recursos/merma/` (P2). *Por qué: el gap confirmado del SERP del cluster; ningún competidor lo publica — es el H2 que captura la intención "control de inventario y merma".*

#### H2: `¿Y la facturación? Cada venta descuenta y emite su comprobante`

Contenido: una línea de unión — la venta que descuenta insumos es la misma venta que emite el comprobante con correlativo DT 09-2007; la mecánica fiscal es de `/facturacion-dgi/` (regla 11: la facturación se menciona, no se convierte en la primary de esta página). *Por qué: la query "sistema de inventario y facturación" existe y el comprador pregunta por la unión; responderla en una línea y entregar cada método a su dueño evita canibalizar el hub fiscal.*

#### H2: `¿Cuánto cuesta el control de inventario?`

Contenido: respuesta de orientación — el control vive en los packs de capacidad: Retail (kardex, costo promedio ponderado, proveedores, compras, conteos, mermas, alertas, código de barras, lotes/vencimiento) y Cocina (recetas/BOM, subrecetas, producción, márgenes por plato), US$39 al mes cada uno según plan; "kardex valorizado" y reportes de margen son del plan Pro. La tabla completa en `/precios/` con anchor `ver planes y precios de NHILOS POS`. *Por qué: el comprador de inventario pregunta por el pack, no por el plan completo; orientar sin duplicar la tabla mantiene los precios congelados en un solo lugar sincronizado.*

#### H2: `Preguntas frecuentes sobre el sistema de inventario`

Contenido: acordeón con schema `FAQPage` (entidad y mercado en la primera frase): ¿Cómo descuenta el inventario al vender? (receta o stock simple), ¿De dónde sale el costo? (kardex y costo promedio ponderado), ¿El sistema cumple la Ley 822 para la valuación? (respuesta precisa: valúa al menor entre costo y el precio de mercado que declares por insumo con su fecha de vigencia, y registra el castigo; la conformidad del caso concreto la firma el contador — la división completa en el H2 del marco), ¿Puedo cambiar de método de valuación en el sistema? (la ley exige autorización escrita de la Administración; el sistema no promete ese registro hoy — conversación con el contador), ¿Qué es la merma teórica vs física? (definición llana + qué compara el sistema), ¿Sirve si no tengo recetas? (modo simple), ¿Cuánto cuesta? (packs + enlace a `/precios/`). *Por qué: las preguntas de valuación se responden con la división, no con un sí que el producto no puede sostener; el FAQ es citable por contadores.*

#### H2: `Solicita una demo con tu inventario real`

Contenido: CTA final — demo con el kardex, el descuento por receta y un conteo con datos de demostración etiquetados + WhatsApp directo; cotización con cronograma real al finalizar la demo. *Por qué: el método se decide viendo el número salir del registro; cierra el funnel con la conversión estándar (G14).*

### 8.5 Guardia de claims: lo que `/inventario/` NO publica

La lista más estricta del sitio junto con la fiscal: cada punto viene de una brecha declarada en el marco normativo (`docs/inventario_marco_normativo.md` §4).

1. **"Cumple la Ley 822 art. 44 en la valuación" — NO publicar como propiedad automática.** El sistema valúa al menor entre costo y un precio de mercado **que el negocio declara** por insumo con fecha de vigencia, y registra el castigo; sin precio declarado, la referencia es el último costo de compra. Se describe el mecanismo (que es real y verificable) y se dice de quién depende mantenerlo; la conformidad del caso concreto la firma el contador. Prohibido el "cumple" absoluto, igual que el "autorizado por la DGI".
2. **"Cambio de método de valuación con autorización DGI registrada en el sistema" — NO publicar.** No existe superficie ni entidad para registrar la autorización (R-02, brecha). La ley exige autorización por escrito para cambiar de método: se enuncia como obligación del negocio, nunca como función.
3. **"Listas de conteo firmadas y fechadas por hoja" / "el conteo emite el artefacto del art. 33" — NO publicar.** Existen sesiones de conteo, pero no emiten ese artefacto (R-05, parcial). El inventario físico anual y sus listas son del negocio con su contador.
4. **"Entrega a la DGI los registros del Reglamento art. 33" / exportación para la Administración — NO publicar.** No existe esa exportación (R-06, brecha). Los libros y reportes que existen se describen solo por lo que son (ventas, valorización, COGS, kardex).
5. **"Kardex valorizado" en contexto Esencial/Retail — NO publicar.** En el pack Retail el kardex se publica como "kardex, costo promedio ponderado"; "kardex valorizado" y reportes de margen son del plan Pro (regla de precios del home v1.8). Mezclar el término entre planes desincroniza la página con `/precios/` y la home.
6. **UEPS mal explicada — NO publicar.** Si se menciona el marco, la mención es exacta: la Ley 822 admite costo promedio, FIFO y UEPS; bajo NIC 2 la UEPS no es admisible. El sistema hoy opera costo promedio ponderado; no se ofrece UEPS ni se afirma que "solo FIFO y promedio son legales".
7. **FEFO/rotación por lote como obligación legal — NO publicar.** Es práctica de rubro (marco §5): se declara como práctica si se menciona, nunca como norma.
8. **"Merma cero" / "control total de la merma" / "inventario exacto siempre" — NO publicar.** La claim es merma teórica vs física (comparación), no resultado garantizado; y la comparación depende de que las recetas estén bien definidas — dicho tal cual si hace falta.
9. **"Inventario en tiempo real entre sucursales" / consolidación multi-local — NO publicar.** La consolidación no se vende; el hub de inventario no promete lo que la guardia del food park prohíbe.
10. **Estándar transversal — NO publicar:** "facturación impresa" (#983), "factura electrónica", "sistema autorizado por la DGI", "cero multas", "nunca pierdes una venta", "100% sincronizado", precios de hardware o BYOD, KDS, y ningún vocabulario interno ("entitlements", números de issue, "R-01"–"R-07" como texto visible, "CPP" sin traducir a "costo promedio ponderado", "go-live") ni frases de roadmap.

### 8.6 Enlazado interno

**Entrante:** home (sección "Inventario que se descuenta solo", anchor `sistema de inventario en Nicaragua`); hub `/software-pos/` → aquí con el anchor de §3.6 (`control de inventario y kardex: recetas, insumos y merma`); `/software-pos/restaurantes/` y `/software-pos/food-parks/` → aquí desde sus bloques de recetas; `/facturacion-dgi/` → aquí cuando exista (la mitad física de una revisión: conteos y kardex). Anchors descriptivos y variados.

**Saliente:** home (breadcrumb, `BreadcrumbList` al construir); `/inventario/restaurantes/` al publicarse con anchor `sistema de inventario para restaurante` y `/inventario/food-parks/` al publicarse con anchor `software de inventario para food park` (sin enlaces rotos — se añaden al entrar en producción); `/facturacion-dgi/` (anchor del hub fiscal — la mitad fiscal de cada venta); `/software-pos/` (`qué es NHILOS POS: venta local-first` — quien llegó por inventario y aún no sabe qué es el producto); `/precios/` (`ver planes y precios de NHILOS POS` — packs y planes); `/recursos/merma/` y `/recursos/costeo-recetas/` al publicarse (P2, informativas); `/demo/` (CTA primaria).

### 8.7 Medición: qué se considera éxito

Eventos (GA4 o equivalente, todos legibles por nombre):

- `inventario_llega_kardex` — scroll hasta el H2 del kardex y el costo (sección visible ≥75%).
- `inventario_marco_lee` — scroll hasta el H2 del marco normativo (el bloque de división).
- `faq_inventario_abre` — apertura de cualquier ítem del FAQ.
- `cta_demo_inventario` — clic en "Solicitar una demo".
- `cta_whatsapp_inventario` — clic de WhatsApp con UTM `utm_medium=inventario`.

Lecturas de éxito al checkpoint de 28 días:

- **≥60%** de las sesiones llegan al H2 del kardex (el comprador de inventario busca el método).
- **≥35%** de las sesiones llegan al bloque del marco — el contenido normativo retiene al contador y al dueño que desconfía del número.
- **≥6%** de las sesiones generan clic a demo o WhatsApp.
- **GSC:** impresiones de `sistema de inventario Nicaragua`, `software de inventario Nicaragua` y `sistema kardex Nicaragua` atribuidas a esta página — no a la home. Fronteras vigiadas: la home (H2 de inventario) y el hub POS. Regla 9 de anti-canibalización, revisión mensual; las queries de segmento (`para restaurante`) deben empezar a moverse al hijo cuando se publique — si quedan en el hub, revisar que el hub no esté usando la primary del hijo como encabezado.
- Con un dominio nuevo, se miden **tasas y primer movimiento** (impresiones > 0), no absolutos; umbrales absolutos tras el primer checkpoint con datos reales.

### 8.8 Meta sugerida

- **Title (≤60):** `Sistema de inventario en Nicaragua · Kardex y merma | NHILOS`
- **Description (≤155):** `Cada venta descuenta lo que consumió: kardex con costo promedio ponderado, conteos y merma teórica vs física. El marco legal, explicado. Pide una demo.`

### 8.6 R-01: la decisión de producto que cambia lo que esta página puede prometer

**Verificado 2026-11-18 contra el código, no contra la documentación.** R-01 (Ley 822 art. 44) **no es una brecha**: el mecanismo está entregado. `InventoryValuationService` expone `setMarketPrice` (precio de mercado por insumo con fecha de vigencia) y `applyLowerOfCostWritedown` (castigo con asiento compensatorio `VALUATION_WRITEDOWN`), y el controller de reportes tiene las dos rutas vivas: `POST /inventory/reports/valuation/market-price` y `POST /inventory/reports/valuation/writedown`.

El único matiz honesto: **la referencia estricta depende de que alguien declare el precio de mercado**. Si un insumo no tiene precio de mercado cargado con su vigencia, la referencia vuelve a ser el último costo de compra del kardex — la aproximación declarada del marco. Por eso el estado real es *parcial con mecanismo*, no *brecha*.

Consecuencias para esta página:

1. **La página sí puede describir el mecanismo**: precio de mercado declarado por insumo con fecha de vigencia, valuación al menor entre costo y mercado, y el castigo registrado con su asiento. Es una capacidad real y un diferenciador que ningún competidor publica.
2. **No puede decir "cumple la Ley 822 art. 44"** como propiedad automática del sistema: el cumplimiento depende de que el negocio mantenga sus precios de mercado declarados y de cómo lo trate su contador. Se describe el mecanismo; la conformidad del caso concreto la firma el contador.
3. **La aproximación por último costo se publica como respaldo explícito**, no como la única verdad: qué pasa cuando no hay precio de mercado cargado.
4. **R-02, R-05 y R-06 siguen siendo brechas declaradas** y no se prometen: registro de autorización de la DGI para cambio de método, listas firmadas y fechadas por hoja, y exportación de registros y conteos para la Administración.
5. **R-03, R-04 y R-07 tampoco se prometen** (restricción por naturaleza y uso, identificación específica, admisibilidad de UEPS): dependen del modelo de valuación configurable de la tarea R16.

> **Regla de redacción para esta página:** se describe el método que el sistema ejecuta hoy y se nombra la norma que lo rige, con su fuente. Si una capacidad no está en producción, no aparece como propiedad del producto: aparece, si acaso, como el estado real y lo que le corresponde al contador.

## 9. Brief — `/demo/` (G14)

> **Escrito 2026-11-18.** La página de conversión: quien llega ya decidió mirar el producto y quiere saber **qué pasa cuando la pide** — qué recibe, cómo se coordina, con qué datos se muestra, qué tiene que preparar. No es una página de educación ni de precios: es la respuesta a "¿y si pido la demo, qué me espera?". Las reglas del tono mandan: sin urgencia artificial, sin "cupos limitados", sin cuentas regresivas. **Decisión de producto del 2026-11-18:** la demo es **personalizada**, y por eso el formulario **sí** recoge contexto del negocio (rubro, qué le cuesta hoy la operación, cuántas cajas opera) — no para enriquecer un lead, sino porque una demo armada con esos datos muestra el producto funcionando en la operación del comprador. Se mantienen los bullets aprobados del home (v1.5): "Escenario armado según tu tipo de negocio y tu prioridad" y "Cotización con cronograma real al finalizar la demo". Sigue prohibida la duración en minutos: la demo se ajusta al prospecto, no a un reloj. Sí se publica un plazo de respuesta: **menos de 24 horas hábiles**.

### 9.1 Datos del brief

| Campo | Valor |
|---|---|
| Keyword principal | `demo de sistema POS para restaurante` (G14, arquitectura §5) |
| Keywords secundarias | `solicitar demo sistema POS`, `demo sistema POS Nicaragua` (mapa §5) |
| Intención | Transaccional de conversión: pedir la demo o decidir pedirla en esta misma visita |
| Respuesta rápida (primeros 150 px) | Pides la demo y te contactamos por el canal que elegiste. Ves NHILOS POS en un escenario armado según tu tipo de negocio y tu prioridad, con datos de demostración etiquetados. La cotización con cronograma real sale al finalizar. Te confirmamos en menos de 24 horas hábiles, con lo que nos cuentes de tu negocio y de lo que te cuesta hoy |
| Objeción principal | "¿Me van a perseguir con llamadas y presión de venta?" |
| Objeción secundaria | "¿Es una presentación genérica o se muestra con mi operación?" |
| Prueba | El propio flujo descrito con veracidad + bullets aprobados del home v1.5; datos de demostración etiquetados con provenance aprobado (NHILOS Market & Café) |
| CTA | Formulario corto (primaria) + WhatsApp directo (secundaria) |
| Enlaces internos | home (breadcrumb), `/precios/`, `/software-pos/`, `/facturacion-dgi/`, `/inventario/`, `/implementacion/` (al publicarse) |

### 9.2 Intención y queries objetivo

Las queries vienen del mapa §5 y de la regla 7 de anti-canibalización (demo e implementación viven separadas: preventa vs postventa); no se inventan:

- **Primary:** `demo de sistema POS para restaurante` — asignada a esta página, **en el H2 de segmentos de §9.4 y no en el H1** (decisión 2026-11-20: la puerta de entrada queda de segmento neutro). La home, el hub y todas las páginas P0 enlazan aquí como CTA: la mayoría del tráfico es navegación interna, no búsqueda — la query medida es la puerta orgánica, no el volumen principal.
- **Secundarias del mapa §5:** `solicitar demo sistema POS`, `demo sistema POS Nicaragua`.
- **Realidad honesta del set:** la página tiene un set de keywords delgado por diseño — su trabajo es convertir la intención que las otras páginas crearon, no acumular long tail.

**Queries que esta página NO persigue, con dueño explícito:**

| Query | Dueño |
|---|---|
| `instalar sistema POS en mi restaurante`, `instalación sistema POS Nicaragua` | `/implementacion/` (G15, P1 — regla 7: demo es preventa, instalación es postventa; no se mezclan en una URL) |
| `precio de sistema POS para restaurante en Nicaragua`, `cotización`, `comprar`, `cuánto cuesta` | `/precios/` (regla 6 — el costo se cierra allí; aquí solo el anchor) |
| `comparativa sistemas POS Nicaragua`, `mejores puntos de venta` | `/comparativas/` (G16, regla 12) |
| `sistema POS para restaurante`, `software para food park`, `POS sin internet`, `sistema de inventario Nicaragua` | Sus páginas dueñas (G2, G1, G8, hub de inventario) — el enlace desde cada una trae la intención; esta página no las repite como encabezados |
| `sistema de facturación DGI en Nicaragua` | `/facturacion-dgi/` (hub fiscal) |

### 9.3 Regla de profundidad de `/demo/`

> **Esta página describe el proceso, no el producto.** Cada bloque responde una pregunta del que está a un clic de pedir (¿qué recibo? ¿cómo se coordina? ¿cuánto tengo que esperar? ¿con qué datos? ¿qué preparo? ¿qué pasa después?). Nada de descripciones de features (son de las páginas dueñas) ni de tablas de precios (son de `/precios/`). La veracidad es la regla de profundidad: si un dato del proceso no está decidido (por ejemplo la duración), la página no lo publica — describe lo que sí está definido y enlaza el resto. El plazo de respuesta (**menos de 24 horas hábiles**) y la condición de costo ("se coordina sin compromiso") sí están decididos y se publican.

### 9.4 Jerarquía de encabezados

#### H1: `Demo de NHILOS POS: qué recibes y cómo se coordina`

Contenido: keyword exacta + la promesa de proceso claro. *Por qué: la query es de proceso; el H1 responde la pregunta del que duda entre pedir la demo o seguir comparando — saber qué pasa al pedir la convierte.*

> **Actualizado 2026-11-20 (decisión del fundador).** El H1 original (`Demo de sistema POS para restaurante: qué recibes y cómo se coordina`) **encasillaba la página en restaurantes**: habría sido la única de las seis con un segmento en el H1, cuando la home, el hub, `/precios/`, `/facturacion-dgi/` y `/inventario/` son de segmento neutro; el home nombra los segmentos solo **dentro del texto**, en conjunto. Además se contradecía con §9.2, que asigna `sistema POS para restaurante` a `/software-pos/restaurantes/`. La query segmento-calificada sigue siendo objetivo —no tiene otro dueño y su intención es de proceso— y se gana en un **H2 de segmentos** (siguiente bloque), donde además muestra la amplitud.

#### H2: `¿Qué es la demo de NHILOS POS?`

Contenido: definición corta — una demostración del sistema en un escenario armado según tu tipo de negocio y tu prioridad (bullet aprobado del home v1.5): venta en mostrador, contingencia sin internet, recetas con descuento de insumos, bimoneda — según lo que tu operación pida. No es una presentación de slides ni una grabación genérica. *Por qué: la objeción secundaria se resuelve en la primera pantalla; "escenario según tu operación" es exactamente el bullet aprobado, sin adorno.*

#### H2: `Demo de sistema POS para restaurante, cafetería, food park o mostrador`

Contenido: los cuatro casos nombrados seguidos, con una línea del control que ve cada uno: restaurante con recetas (descuento por plato y recálculo de costo); cafetería o panadería (recetas y vitrina); food park (catálogo por puesto y cobro por terminal); tienda o mostrador (modo simple, sin recetas). Cierra con que es **el mismo sistema con el control ajustado a tu negocio**, y que un mostrador simple no necesita recetas. Aquí vive la frase exacta que se busca: `Demo de sistema POS para restaurante`. *Por qué: la query segmento-calificada entra por un encabezado —no por la puerta de entrada—, y la misma línea que la nombra impide que el lector de una cafetería o un park crea que la página no es para él.*

> **H3: `Qué se muestra según tu tipo de negocio`**
> Contenido: los tres escenarios en una línea cada uno — restaurante con recetas (descuento por plato y recálculo de costo), food park (catálogo por puesto y cobro por terminal), tienda o mostrador (modo simple); más la contingencia sin internet, que se muestra en vivo si es tu prioridad. *Por qué: el comprador reconoce su caso antes de pedir; los escenarios son los mismos de la home — sin inventar demos segmentadas que no estén armadas.*

#### H2: `¿Cómo se coordina y cuánto hay que esperar?`

Contenido: el proceso real — pides la demo por el formulario o por WhatsApp directo; te confirmamos por el canal que elegiste **en menos de 24 horas hábiles** y se agenda contigo. Sin urgencia artificial: sin "cupos limitados", sin cuentas regresivas, sin descuento por pedir hoy. *Por qué: la objeción principal es la presión de venta, y responderla describiendo un proceso sin ganchos es más creíble que cualquier gancho. El plazo es un compromiso decidido (2026-11-18) y verificable: si no se cumple, se corrige el proceso, no la frase.*

> **H3: `¿Cuánto dura la demo?`**
> Contenido: respuesta honesta — no se publica una duración en minutos porque la demo se arma con tu operación: el rubro, lo que te cuesta hoy y cuántas cajas operas definen qué se muestra y cuánto se profundiza. Lo que sí se afirma: la cotización con cronograma real sale al finalizar la demo (bullet aprobado). *Por qué: acá la ausencia de una cifra no es un vacío, es la promesa de la página — una demo personalizada no puede tener duración fija sin dejar de ser personalizada.*

#### H2: `¿Qué necesito preparar?`

Contenido: lo mínimo — saber qué vendes, cuántas cajas operas y si cocina o solo mostrador (las tres preguntas del CTA del home). No hay que enviar el menú, el Excel ni ningún archivo antes: la carga del catálogo real es parte de la implementación, no de la demo. *Por qué: el miedo a "tengo que dejar todo listo" frena la conversión; responder "tres respuestas, nada más" quita la fricción sin prometer una migración en la demo.*

#### H2: `¿Con qué datos se muestra el sistema?`

Contenido: la demo opera con datos de demostración, etiquetados como tales — provenance aprobado del home ("Operación real capturada de NHILOS Market & Café · datos de demostración"). Nada de tus datos reales entra en la demo, y ninguna captura se presenta como operación de un cliente sin etiqueta. *Por qué: la regla de evidencia del avatar (§7) es vinculante; publicar capturas sin etiqueta sería maquillar demo como caso real — el error que ninguna otra página del sitio se permite.*

#### H2: `¿Qué pasa después de la demo?`

Contenido: la cotización con cronograma real sale al finalizar la demo (bullet aprobado) — con el alcance exacto de setup, terminales y packs según tu operación. Los precios públicos viven en `/precios/` con anchor `ver planes y precios de NHILOS POS`; la implementación es la etapa siguiente y vive en `/implementacion/` cuando exista (regla 7: etapas separadas). Sin compromiso y sin permanencia prometida: los términos de contrato no están definidos y no se inventan (misma guardia que `/precios/` §2.5.10). *Por qué: el que pide la demo quiere saber qué viene después; responder "cotización real al finalizar" es el bullet aprobado y la verdad — ni "te inscribes ahí mismo" ni un embudo oculto.*

#### H2: `Preguntas frecuentes sobre la demo`

Contenido: acordeón con schema `FAQPage` (entidad y mercado en la primera frase): ¿La demo tiene costo? (se coordina sin compromiso — la frase aprobada del FAQ G2 del home; sin prometer "gratis", condición no definida), ¿Cuándo me contactan? (en menos de 24 horas hábiles), ¿Cuánto dura? (sin duración publicada: se arma con tus datos), ¿Necesito preparar algo? (qué vendes, cuántas cajas, cocina o mostrador), ¿Veo el sistema con mi tipo de negocio? (sí: escenario según tu tipo y prioridad), ¿Los datos de la demo son reales? (datos de demostración etiquetados), ¿Qué pasa después? (cotización con cronograma real al finalizar). *Por qué: las preguntas de proceso repetidas en WhatsApp se responden una vez aquí; el FAQ de proceso es citable y reduce la fricción del formulario.*

#### H2: `Pide tu demo`

Contenido: el formulario con los cuatro campos base — nombre, negocio, tipo de negocio y WhatsApp — más un bloque de contexto: **rubro, qué te cuesta hoy la operación y cuántas cajas operas**, con un campo abierto corto opcional. El WhatsApp es el canal por el que se coordina la demo: se pide porque se usa. Alternativa permanente: WhatsApp directo con el número publicado. *Por qué: el contexto no es enriquecimiento de lead — es lo que permite armar la demo con la operación del comprador en vez de un guion genérico; tres preguntas cortas cuestan menos que una demo que no le habla de su negocio. Siguen fuera el RUC, el correo obligatorio y el presupuesto.*

### 9.5 Guardia de claims: lo que `/demo/` NO publica

1. **Urgencia artificial — NO publicar.** Ni "últimos cupos", ni "solo esta semana", ni cuentas regresivas, ni descuento por pedir hoy, ni "agenda antes de que suba el precio". La página vende proceso claro, no escasez — y la escasez inventada contradiría el tono de todo el sitio.
2. **Duración de la demo en minutos — NO publicar.** La demo es personalizada (decisión 2026-11-18): anunciar una cifra rompe esa promesa, porque el compromiso deja de ser "armada con tu operación" y pasa a ser "cabe en 30 minutos". La respuesta es que se ajusta a tu negocio, no a un reloj.
3. **"Sin datos de tarjeta" — NO publicar.** No aprobado por producto (regla de aprobaciones v1.5 del home).
4. **"Demo gratis" / "prueba gratuita" — NO publicar.** La condición de costo de la demo no está definida en los documentos; la frase aprobada es "se coordina sin compromiso" (FAQ G2 del home). Prometer "gratis" inventaría una oferta que no existe.
5. **Plazos más rápidos que el aprobado — NO publicar.** El compromiso es **menos de 24 horas hábiles** (decisión 2026-11-18). Nada de "en 15 minutos", "de inmediato" ni "el mismo día": prometer menos de lo que una sola persona puede sostener convierte el plazo en una fuente de reclamos. Si la operación mejora de forma medible, el plazo se acorta aquí y en el FAQ a la vez.
6. **"La demo incluye tu catálogo real" / migración de datos en la demo — NO publicar.** La carga del catálogo y la migración son parte de la implementación (el setup cubre el alta con plantillas y una sesión; la migración extra se cotiza aparte). La demo muestra datos de demostración etiquetados.
7. **"Sin compromiso / sin permanencia" como término de contrato — NO publicar.** "Sin compromiso" se usa solo como la frase aprobada de coordinación de la demo; los términos de contrato no están definidos y no se inventan (guardia de `/precios/` §2.5.10).
8. **Campos que no sirven a la demo — NO pedir.** Los cuatro campos base (nombre, negocio, tipo, WhatsApp) más el bloque de contexto: rubro, qué te cuesta hoy la operación y cuántas cajas operas (decisión 2026-11-18: la demo se arma con esos datos). Siguen prohibidos el RUC, el correo obligatorio, el número de teléfono adicional, el presupuesto y cualquier pregunta que solo cualifique al lead sin cambiar lo que se muestra en la demo.
9. **Capturas o métricas sin etiqueta — NO publicar.** Todo dato mostrado es de demostración y lleva su etiqueta (regla de evidencia); el provenance aprobado es la nota "NHILOS Market & Café · datos de demostración".
10. **Estándar transversal — NO publicar:** "facturación impresa" (#983), "factura electrónica", "sistema autorizado por la DGI", "cero multas", "nunca pierdes una venta", "100% sincronizado", precios de hardware o BYOD, KDS, exportación contable, y ningún vocabulario interno ("entitlements", números de issue, "go-live") ni frases de roadmap. La demo muestra lo que el producto hace hoy.

### 9.6 Enlazado interno

**Entrante (según arquitectura §7):** home → `/demo/` desde su CTA final; cada página P0 → `/demo/` como CTA primaria con su anchor de contexto (`solicitar una demo con el menú de tu restaurante` en `/software-pos/restaurantes/`, `solicitar una demo con la operación de tu park` en `/software-pos/food-parks/`, `solicitar una demo y mira la contingencia con tu operación` en `/software-pos/sin-internet/`, `solicitar una demo con tu inventario real` en `/inventario/`); el hub y `/facturacion-dgi/` → `/demo/` con su CTA estándar. Anchors descriptivos y variados, nunca "click aquí" ni el mismo anchor exacto desde muchas páginas.

**Saliente:** home (breadcrumb, `BreadcrumbList` al construir); `/precios/` (`ver planes y precios de NHILOS POS` — el costo se cierra allí); `/software-pos/` (`qué es NHILOS POS: venta local-first` — quien llegó directo a la demo y aún no conoce el producto); `/facturacion-dgi/` y `/inventario/` (los dos métodos que el comprador suele verificar antes de decidir); `/implementacion/` al publicarse (`instalar sistema POS en mi restaurante` — la etapa siguiente, separada por regla 7).

### 9.7 Medición: qué se considera éxito

Eventos (GA4 o equivalente, todos legibles por nombre):

- `demo_form_inicia` — primer campo del formulario enfocado (diagnóstico de abandono).
- `demo_form_envia` — envío del formulario (la conversión primaria del sitio).
- `demo_whatsapp_clic` — clic de WhatsApp con UTM `utm_medium=demo`.
- `demo_prepara_lee` — scroll hasta el H2 de qué preparar (la fricción que la página desactiva).
- `faq_demo_abre` — apertura de cualquier ítem del FAQ.

Lecturas de éxito al checkpoint de 28 días:

- **≥50%** de las sesiones llegan al formulario (la página de conversión retiene al que llegó a pedir).
- **≥15%** de las sesiones generan `demo_form_envia` o `demo_whatsapp_clic` — umbral superior al resto del sitio: quien llegó aquí ya decidió mirar.
- **Tasa de abandono del formulario** (`demo_form_inicia` sin `demo_form_envia`) **<50%** — si sube, el problema es el formulario o la promesa, y se corrige aquí antes que en ninguna otra página.
- **GSC:** impresiones de `demo de sistema POS para restaurante` y variantes atribuidas a esta página. Frontera esperada: la mayor parte del tráfico llega por navegación interna (CTAs de todas las páginas), no por búsqueda — eso es correcto y no es canibalización; solo la porción orgánica se mide en GSC.
- Con un dominio nuevo, se miden **tasas y primer movimiento** (impresiones > 0), no absolutos; umbrales absolutos tras el primer checkpoint con datos reales.

### 9.8 Meta sugerida

- **Title (≤60):** `Demo de NHILOS POS: qué recibes y cómo se coordina` — **50 caracteres**, espeja el H1, sin segmento. *(El anterior, `Demo de NHILOS POS · Sistema POS para restaurante en Nicaragua`, medía **62** contra un límite de 60 y además encasillaba; un cambio resolvió las dos cosas.)*
- **Description (≤155):** `Pide tu demo de NHILOS POS: escenario según tu tipo de negocio, datos de demostración y cotización con cronograma real al finalizar. Sin compromiso.`

## 10. Briefs pendientes (P0 internas)

| Página | Grupo | Estado |
|---|---|---|
| `/software-pos/` | G2 (hub) | Brief escrito — v1.6 §3 |
| `/software-pos/restaurantes/` | G2 | Brief escrito — v1.8 §5 |
| `/software-pos/food-parks/` | G1 | Brief escrito — v1.8 §6 |
| `/software-pos/sin-internet/` | G8 | Brief escrito — v1.8 §7 |
| `/facturacion-dgi/` | G6 | Brief escrito — v1.7 §4 |
| `/facturacion-dgi/restaurantes/` | G6 | Pendiente |
| `/inventario/` | G9 | Brief escrito — v1.8 §8 |
| `/inventario/restaurantes/` | G9 | Pendiente |
| `/precios/` | G13 | Brief escrito — v1.5 §2 |
| `/demo/` | G14 | Brief escrito — v1.8 §9 |

---

## 11. Change log

| Versión | Fecha | Cambio | Autor |
|---|---|---|---|
| 1.0 | 2026-11-16 | Brief del home con jerarquía H1–H3 completa, decisión de posicionamiento (gastronomía hero + reventa como capacidad nativa) y tabla de briefs pendientes | Equipo NHILOS |
| 1.1 | 2026-11-16 | Revisión de posicionamiento: un sistema de ventas con control a la medida (SIMPLE→producción como escalera continua); retail reabierto a evaluación keyword; anti-encasillamiento en copy. Principio: la arquitectura SEO manda sobre el artboard (prototipo de diseño/media) | Equipo NHILOS |
| 1.2 | 2026-11-16 | Copy completo del home redactado y documentado en [`nhilos_web_home_copy_v1.0.md`](./nhilos_web_home_copy_v1.0.md) según esta jerarquía — fuente para el rediseño de la web publicada | Equipo NHILOS |
| 1.3 | 2026-11-16 | Regla de profundidad añadida al copy (v1.1): el home vende, no explica — ≤120 palabras por H2, jerga técnica vetada, contenido profundo migrado a FAQ/páginas internas P0 | Equipo NHILOS |
| 1.4 | 2026-11-16 | H1 de la home generalizado (decisión founder): keyword restaurante migra a la página interna futura | Equipo NHILOS |
| 1.5 | 2026-11-18 | Brief de `/precios/` (G13) escrito tras publicarse los precios congelados: queries G13/avatar, jerarquía H1–H3 en orden de decisión, 6 objeciones resueltas, guardia de claims (impresión #983, hardware sin validar, BYOD, exportación contable, multi-sucursal, contrato, SOHO), enlazado según arquitectura §7 y medición legible alineada al checkpoint GSC | Equipo NHILOS |
| 1.6 | 2026-11-18 | Brief del hub `/software-pos/` (G2, término cabeza) escrito: queries del hub y reparto explícito de las que quedan en los hijos, jerarquía H1–H3 por las preguntas del comprador con las dos formas de operación (vende lo que compra vs lo que se cocina) en la primera pantalla, educación de categoría como territorio propio, guardia de claims (impresión #983, factura electrónica, autorización DGI, hardware, exportación contable/multi-sucursal/KDS, queries de segmento como encabezados), enlazado a los 9 hijos con anchor por query según arquitectura §7 y medición legible (clic a hijo como prueba de orientación) | Equipo NHILOS |
| 1.7 | 2026-11-18 | Brief del hub fiscal `/facturacion-dgi/` escrito: queries propias y rechazadas con dueño explícito (incluida la negativa deliberada a "facturación electrónica" y a las queries de multas), jerarquía H1–H3 ordenada por el miedo del dueño (validez → autorización → numeración → anulación → norma → división → inspección → impresora), tabla garantiza/corresponde con cada celda defensible (PC-FISC-01..05, PC-SEC-03, PC-DASH-04), paso a paso de anulación, respuesta honesta de impresión (#983), disciplina NORMA/PRÁCTICA/DECISIÓN del marco normativo aplicada al copy fiscal, guardia de claims fiscal vinculante (11 puntos con motivo), enlazado según arquitectura §7 y medición legible | Equipo NHILOS |
| 1.8 | 2026-11-18 | Los cinco briefs P0 restantes escritos, siguiendo la anatomía y la disciplina de claims de §2–§4: `/software-pos/restaurantes/` (§5, hereda la jerarquía del home; diferenciador = recetas que descuentan insumos por plato, demostrado con clip; guardia de KDS/LAN #993/#994 y reconciliación pendiente del "comanda a cocina" del copy lean del home), `/software-pos/food-parks/` (§6, alcance exacto del home v1.8: una suscripción por park, sus propios puestos y marcas; guardia de "cajas compartidas", "vista consolidada", KDS y arreglo fiscal park/locatarios), `/software-pos/sin-internet/` (§7, el método offline completo con sus límites honestos; guarda las listas "qué sí / qué no" migradas del home; prohibiciones de "100% sincronizado", "instantáneo" y apagón eléctrico), `/inventario/` (§8, hub con disciplina NORMA/PRÁCTICA/DECISIÓN del marco normativo: división sistema/contador con las brechas R-01/R-02/R-05/R-06 no prometidas como capacidad; "kardex valorizado" solo Pro) y `/demo/` (§9, página de conversión de proceso: bullets aprobados del home v1.5, formulario de cuatro campos, sin urgencia ni SLA no medido). Tabla de pendientes actualizada; secciones renumeradas (pendientes → §10, change log → §11) | Equipo NHILOS |
| 1.9 | 2026-11-18 | **Cuatro decisiones de producto resueltas y la quinta por análisis.** `/demo/` (§9): la demo es personalizada, así que el formulario recoge contexto del negocio (rubro, qué cuesta hoy, cuántas cajas) en vez de quedarse en cuatro campos — el contexto no califica al lead, arma la demo; se publica plazo de respuesta de menos de 24 horas hábiles y el costo queda en "se coordina sin compromiso"; la duración sigue sin publicarse, ahora por coherencia con la personalización y no por falta de dato. `/software-pos/food-parks/` (§6.6 nuevo): quién factura en un park se resuelve por el principio de que quien vende es quien factura — dos estructuras soportadas, la caja compartida que factura por cuenta de terceros no se ofrece. `/inventario/` (§8.6 nuevo): R-01 **no era una decisión pendiente sino un hallazgo** — el mecanismo ya estaba entregado (`setMarketPrice` + `applyLowerOfCostWritedown` con sus dos rutas vivas) y tanto el marco normativo como el brief lo daban por brecha; corregido: la página describe el mecanismo, no promete el "cumple" absoluto, y publica la aproximación por último costo como respaldo cuando no hay precio de mercado declarado. R-02, R-05 y R-06 siguen como brechas declaradas; R-03, R-04 y R-07 dependen de R16. **Corrección de método:** una bandera de un worker se verifica contra el artefacto actual antes de actuar sobre ella — la de "comanda a cocina" ya estaba resuelta en el home v1.8, y el estado de R-01 estaba resuelto en el código | Equipo NHILOS |

### v2.0 — Metodología vinculante y regla de voz (2026-11-19, fundador)

Toda página hija se construye con el proceso de 7 pasos de la guía SEO (avatar → keywords → arquitectura → encabezados → contenido → FAQ para LLMs → prototipo + schema); los briefs de este documento son el producto de esos pasos y **la guía dicta la estructura real de la página**. Regla de voz agregada y fijada por guardia: el copy habla de la operación del lector, nunca del sitio ("esta página orienta y reparte" es narración de arquitectura de información, prohibida); jerga de ingeniería (BOM) prohibida en copy visible y JSON-LD. Corregido en el hub (7 frases) y el home (2).

### v2.1 — Auditoría de contenido de /precios/ (2026-11-19, fundador)

Correcciones sobre la página publicada: H2 del setup de "es un casco" (palabra sin significado para el lector) a "¿Qué compra exactamente el setup?"; OmniFood Care es nombre interno del proyecto y no va en la página (ahora "plan de soporte extendido"); la regla de packs se publica como consejo de compra sin aritmética de totales (el "total US$88" sonaba a doble cobro); terminal integrada se describe por lo que el comprador recibe, no por el estado del roadmap (#983); "dicho tal cual" eliminado (narración de sitio); la comparación con el POS barato se reescribe como escenarios de riesgo, no como regaño. Guardia S6 afinada: la impresora integrada de la terminal física es hardware vendido y se puede nombrar; lo vetado es prometer impresión externa (#983).

### v2.3 — Sin afirmaciones de IVA (2026-11-19, fundador)

NHILOS no está inscrita como recaudador de IVA, así que ni "IVA incluido" ni "IVA aparte" son verdad: se retiraron las seis afirmaciones que había (cinco en `/precios/`, una en la home) y "netos" salió con ellas, porque es la misma promesa con otra palabra. Lo que queda es el hecho útil: precios en USD y, para el cobro en córdobas, la referencia del BCN del día. Regla permanente en §2.9 con su excepción declarada (el `alt` de la captura fiscal, donde el IVA es dato del cliente). Guardia S9 en los tres suites, probada en RED contra los seis textos retirados.

### v2.4 — `/demo/` sale del encasillamiento en restaurantes (2026-11-20, fundador)

Observación del fundador, verbatim: *"veo que estamos encasillando en restaurantes de nuevo en este contenido para la demo"*. Con el brief, `/demo/` habría sido la única de las seis páginas con un segmento en el H1. Se corrigieron tres cosas: **H1 neutro** (`Demo de NHILOS POS: qué recibes y cómo se coordina`), **H2 de segmentos** nuevo que conserva la query exacta y nombra restaurante, cafetería, food park y mostrador, y **title neutro de 50 caracteres** (el anterior medía 62 contra un límite de 60). El H3 `Qué se muestra según tu tipo de negocio` mantiene su texto y pasa a colgar del H2 de segmentos. Se detectó además una **contradicción interna** de §9.2 (asignaba `sistema POS para restaurante` a otro dueño mientras lo usaba como primary del H1) y quedó resuelta. Guardias nuevas en la suite de la página: ningún segmento puede entrar al H1 ni al title, y la query debe existir en un H2.

### v2.5 — Auditoría de encasillamiento en todos los briefs (2026-11-20)

Medición pedida tras la corrección de §9: se revisó **cada H1, title y description** del documento buscando el defecto del segmento en la puerta de entrada y los límites de longitud. Cuatro hallazgos, todos corregidos:

| Sección | Hallazgo | Corrección |
|---|---|---|
| §2 `/precios/` | El brief seguía con el H1 de restaurante; **la página publicada es neutra desde el 2026-11-19** | Brief alineado con lo publicado |
| §7 `/sin-internet/` | **Página de capacidad con segmento en el H1** (`…para restaurante…`); sus H2 ya eran neutros | H1 neutro + **H2 de segmentos** que conserva la query literal |
| §7 `/sin-internet/` | Title de **61** contra límite de 60 | Title de 57, neutro |
| §5 `/restaurantes/` | Description de **156** contra límite de 155 | 151, mismo sentido |

§5 y §6 conservan el segmento en el H1 **a propósito**: son las páginas dueñas del segmento (`/software-pos/restaurantes/`, `/software-pos/food-parks/`). La regla que queda escrita: **el segmento en la puerta de entrada solo es correcto en la página que lo posee**; en las demás, se nombra en el cuerpo o en un H2 de segmentos.

### v2.6 — "Restaurante" no significa restaurante grande (2026-11-20, fundador)

Verbatim: *"a como puede ser restaurante, puede ser comiderías, foodparks con comida y negocios pequeños incluso, no necesariamente un restaurante grande."* §5 gana un **bloque de reconocimiento** (H3 nuevo en §5.4) que nombra comidería, fritanga, comedor, puesto de comida, cafetería con cocina, food park con cocina y negocio que cocina en casa o en ventana, **antes** del diferenciador; y una guardia de escala: prohibido "sucursales", "franquicia", "varios salones", "salón VIP", "múltiples áreas" y cualquier cifra de mesas grandes. Los ejemplos usan una o dos cajas y diez o veinte platos. El sitio ya usaba "pulpería" en el home y en `/precios/`, así que el registro es el mismo. La sesión de capturas que viene tiene su primer objetivo aquí: **falta material de un mostrador pequeño real**, porque todo el actual muestra una cafetería de marca propia.

### v2.7 — el park también es pequeño, y "catálogo por puesto" se precisa (2026-11-20)

**Amplitud, del fundador:** *"a como puede ser restaurante, puede ser comiderias, foodparks con comida y negocios pequeños incluso, no necesariamente un restaurante grande."* El §6 gana un bloque de reconocimiento (H3 nuevo en §6.4) que nombra park de tres o cuatro puestos, patio de comidas familiar, plaza de comidas, food court de centro comercial, park con locatarios independientes y park con un puesto que cocina y otro que revende; y una guardia de escala que prohíbe "cadena de parks", "varios parks", "gerente de operaciones", "departamento de sistemas", "gestión de contratos de locación", "administración de arrendamientos", "control de acceso del centro comercial", "flujo de visitantes" y cualquier cifra de veinte puestos. La simetría que sirve al park pequeño ya estaba en el documento: un park del mismo dueño no necesita la historia de locatarios, porque es una suscripción con sus puestos y sus categorías.

**Precisión contra el código:** `CatalogValue` es un catálogo maestro de valores (unidad de medida, categoría, tipo de producto) y `Product` solo lleva `category_code`; no existe puesto, marca ni catálogo propio por puesto, ni una terminal limitada a una parte del catálogo. Por eso "cada puesto con su catálogo" —que el H1 y el home ya publicado usan— significa **un catálogo por negocio, organizado por puesto mediante categorías**, y así se explica en el primer H2. Queda prohibido el sentido fuerte: "catálogo independiente", "catálogo aparte", "inventario por puesto", "stock por puesto", "almacén por puesto", la misma familia que la guardia G28 de `/restaurantes/`.

**Numeración:** el segundo `6.6` pasa a `6.9`.

### v2.8 — el food park es el lugar, no el cliente (2026-11-20, fundador)

Verbatim en §6.0. El apartado §6 se escribió sobre el comprador equivocado: asumía que el park contrata y administra los puestos. **NHILOS le vende a cada negocio del park directamente**, como al cliente cafetería que tiene su puesto en un patio y contrató su propio servicio. Derogados: la fórmula del administrador del park como techo, "una suscripción por park", el H3 de roles park/locatario, la tabla fiscal que hacía del park un emisor posible y la guardia que prohibía hablar de precio por negocio. El H1 cambia de sujeto: del park a **tu puesto**. Guardia nueva de clase: nada de administrador del park, gestión de locatarios ni consolidación del patio. La misma corrección alcanza al home (tarjeta de segmentos y FAQ, ambos publicados con el modelo viejo) y a la suite de la página, que tenía el modelo incorrecto escrito como requisito.

### v2.9 — el costo de arranque se dice, no se calcula (2026-11-20, fundador)

§2.10: cada ficha publica el total de arranque como cifra única (US$198 / US$339 / US$599) y los add-ons abren con "nada de esto es obligatorio". Además se retiró un claim de coordinación multi-terminal en tiempo real que se había colado en `/precios/`, la única página donde las guardias de ese claim no estaban puestas.
