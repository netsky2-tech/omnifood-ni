# NHILOS — Page Briefs de la Web

## Control del documento

| Campo | Valor |
|---|---|
| Documento | `nhilos_web_page_briefs_v1.0.md` |
| Versión | 1.4 |
| Estado | WORKING DRAFT — brief del home completo; briefs de páginas P0 internas pendientes |
| Owner | Founder / Marketing |
| Audiencia | Founder, Marketing, Web, redactores |
| Propósito | Brief por página: keyword, intención, jerarquía de encabezados con contenido y por qué, objeciones, prueba, CTA y enlaces internos |
| Fecha | 2026-11-16 |
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

## 2. Briefs pendientes (P0 internas)

| Página | Grupo | Estado |
|---|---|---|
| `/software-pos/` | G2 (hub) | Pendiente |
| `/software-pos/restaurantes/` | G2 | Pendiente — hereda la jerarquía del home al separar páginas |
| `/software-pos/food-parks/` | G1 | Pendiente |
| `/software-pos/sin-internet/` | G8 | Pendiente |
| `/facturacion-dgi/` | G6 | Pendiente |
| `/facturacion-dgi/restaurantes/` | G6 | Pendiente |
| `/inventario/` | G9 | Pendiente |
| `/inventario/restaurantes/` | G9 | Pendiente |
| `/precios/` | G13 | Bloqueado hasta definir valores de precios |
| `/demo/` | G14 | Pendiente |

---

## 3. Change log

| Versión | Fecha | Cambio | Autor |
|---|---|---|---|
| 1.0 | 2026-11-16 | Brief del home con jerarquía H1–H3 completa, decisión de posicionamiento (gastronomía hero + reventa como capacidad nativa) y tabla de briefs pendientes | Equipo NHILOS |
| 1.1 | 2026-11-16 | Revisión de posicionamiento: un sistema de ventas con control a la medida (SIMPLE→producción como escalera continua); retail reabierto a evaluación keyword; anti-encasillamiento en copy. Principio: la arquitectura SEO manda sobre el artboard (prototipo de diseño/media) | Equipo NHILOS |
| 1.2 | 2026-11-16 | Copy completo del home redactado y documentado en [`nhilos_web_home_copy_v1.0.md`](./nhilos_web_home_copy_v1.0.md) según esta jerarquía — fuente para el rediseño de la web publicada | Equipo NHILOS |
| 1.3 | 2026-11-16 | Regla de profundidad añadida al copy (v1.1): el home vende, no explica — ≤120 palabras por H2, jerga técnica vetada, contenido profundo migrado a FAQ/páginas internas P0 | Equipo NHILOS |
| 1.4 | 2026-11-16 | H1 de la home generalizado (decisión founder): keyword restaurante migra a la página interna futura | Equipo NHILOS |
