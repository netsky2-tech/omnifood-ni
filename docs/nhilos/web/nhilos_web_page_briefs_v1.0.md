# NHILOS — Page Briefs de la Web

## Control del documento

| Campo | Valor |
|---|---|
| Documento | `nhilos_web_page_briefs_v1.0.md` |
| Versión | 1.7 |
| Estado | WORKING DRAFT — briefs del home, `/precios/`, hub `/software-pos/` y hub fiscal `/facturacion-dgi/` escritos; resto de páginas P0 internas pendientes |
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

#### H1: `Sistema POS en Nicaragua que sigue vendiendo sin internet`

> **Actualizado v1.4 (2026-11-16):** H1 generalizado por decisión del founder (coherencia con posicionamiento v2; `sistema POS Nicaragua` es keyword validada). La keyword exacta `sistema POS para restaurante en Nicaragua` queda como primary de la página interna futura `/software-pos/restaurantes/`.

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

#### H1: `Precio de sistema POS para restaurante en Nicaragua: planes desde US$49 al mes`

Contenido: keyword exacta + un renglón — precios públicos, sin llamar para saber cuánto cuesta. El cuerpo habla de negocio (no solo restaurante): los precios son por suscripción de negocio, no por puesto ni por terminal. *Por qué: la arquitectura asigna esta primary a `/precios/`; la transparencia total (precio + setup + letra pequeña) es el gap confirmado del SERP — ningún competidor local publica precio y alcance juntos.*

#### H2: `¿Cuánto cuesta NHILOS POS?`

Contenido: respuesta directa en las primeras líneas — Esencial US$49/mes con setup US$149, Operación US$89 con setup US$250, Pro US$149 con setup US$450; Enterprise por cotización. Suscripción mensual por negocio; precios netos en USD con referencia BCN, IVA aparte. *Por qué: es la pregunta #1 del avatar ("¿Cuánto al mes?") y candidato a featured snippet con la pregunta exacta; quien escanea decide en 10 segundos si sigue leyendo.*

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

#### H2: `¿El setup de US$149 a US$450 es un casco?`

Contenido: qué compra el setup — carga inicial del catálogo, enrolado y configuración de terminales, configuración fiscal con el RUC y la autorización DGI del negocio, capacitación del equipo y acompañamiento en el primer turno real; el cronograma real viene en la cotización. Es pago único y no reembolsable, dicho tal cual. El hardware se compra aparte y es del cliente; la mensualidad nunca lo incluye. *Por qué: desarma el miedo al lock-in con el alcance exacto — el fee compra implementación, no exclusividad; coincide con la respuesta G7 del FAQ GEO del home.*

#### H2: `¿Necesito comprar equipo especial?`

Contenido: NHILOS POS opera en terminales táctiles Android; si ya tienes equipo se evalúa y si no, se cotiza el kit con proveedores locales. Precios de hardware **no se publican en esta página** hasta validarlos con al menos dos proveedores locales. *Por qué: objeción de hardware del comprador; el detalle de kits y compatibilidades es de `/software-pos/hardware/` cuando exista — aquí solo la regla (aparte, Android, se cotiza) para no duplicar ni adelantar precios no validados.*

#### H2: `¿Puedo empezar pequeño y crecer después?`

Contenido: Esencial es la entrada real, no un señuelo — se empieza en modo simple (reventa, stock y métricas) y se activa el control que el negocio pida (recetas, insumos, kardex) en el mismo sistema; la escalera Esencial → Operación → Pro agrega packs, terminales y reportes sin cambiar de producto. El alcance exacto al subir de plan se confirma en la cotización. *Por qué: objeción "mi negocio es pequeño" del avatar y el posicionamiento v2 (escalera de control continua); convierte la tarifa de entrada en argumento, no en disculpa.*

#### H2: `Preguntas frecuentes sobre los precios de NHILOS POS`

Contenido: acordeón con schema `FAQPage` sobre las preguntas exactas — ¿Cuánto cuesta NHILOS POS al mes?, ¿El precio es por negocio o por terminal? (por negocio), ¿Qué incluye el setup y por qué se cobra aparte?, ¿Puedo pagar en córdobas? (precios en USD con referencia BCN, netos, IVA aparte), ¿Hay descuentos o promociones? (no se publican descuentos ni urgencia; la condición final sale de la cotización), ¿Qué pasa si dejo de pagar?, ¿Necesito comprar equipo? *Por qué: el patrón FAQ ya captura snippets en el cluster (home); las preguntas de precio repetidas en WhatsApp se responden una vez aquí.*

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

## 5. Briefs pendientes (P0 internas)

| Página | Grupo | Estado |
|---|---|---|
| `/software-pos/` | G2 (hub) | Brief escrito — v1.6 §3 |
| `/software-pos/restaurantes/` | G2 | Pendiente — hereda la jerarquía del home al separar páginas |
| `/software-pos/food-parks/` | G1 | Pendiente |
| `/software-pos/sin-internet/` | G8 | Pendiente |
| `/facturacion-dgi/` | G6 | Brief escrito — v1.7 §4 |
| `/facturacion-dgi/restaurantes/` | G6 | Pendiente |
| `/inventario/` | G9 | Pendiente |
| `/inventario/restaurantes/` | G9 | Pendiente |
| `/precios/` | G13 | Brief escrito — v1.5 §2 |
| `/demo/` | G14 | Pendiente |

---

## 6. Change log

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
