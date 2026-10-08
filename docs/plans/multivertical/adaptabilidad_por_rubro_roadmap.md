# Roadmap de Adaptabilidad por Rubro (Multivertical) — OmniFood NI

Plan de **fundamentos** para que OmniFood sirva a más de un rubro (cafetería, restaurante, minimarket, ferretería, retail electrónico) sin reescribir el dominio cada vez. **No es greenfield**: el producto ya tiene kardex inmutable, costeo CPP con FX BCN, proveedores, compras, conteos, mermas, sync offline determinista y multi-tenant con RLS. Lo que falta no es funcionalidad de rubro: son **las costuras** que permiten declarar un rubro en lugar de programarlo.

> Autoridad del documento: este roadmap **ordena la Fase 0 (cimientos) antes de cualquier épica de rubro**. La dirección de producto fue decidida el 2026-10-08: retail serializado **y** no serializado, con multi-sucursal y multi-bodega.

Issues que este plan materializa: **#818** (dimensión de ubicación, multi-bodega, transferencias), **#819** (perfil de rubro, capas de capacidad, superficies declarativas) y **#820** (crédito a clientes, cartera y cobro). Alcance y capacidades todavía sin decidir: **#821** (módulos de industria del rubro).

Benchmark de industria que fundamenta D14–D17 y el mapa de módulos: [`benchmark_industria_retail.md`](./benchmark_industria_retail.md).

---

## Decisiones confirmadas

Cerradas antes de implementación. Los batches referencian estas reglas en lugar de reabrirlas.

| ID | Decisión | Impacto |
|----|----------|---------|
| **D1** | **Rubro = conjunto de capacidades con nombre**, no una enumeración cerrada. `CAFETERIA` es un bundle, no un valor de enum que obligue a un release para agregar `FERRETERIA`. | #819 |
| **D2** | **Autoridad única del perfil.** Un documento de perfil versionado, hasheable y append-only, con RLS y lock transaccional, proyectado al POS por el canal fiscal existente. Se reutiliza el patrón ya probado de `tenant_capability_event` (append-only, revisionado, OWNER-only, RLS, advisory lock), que **no** es un sistema de entitlements y sí una forma correcta de almacenar estado de capacidad. | #819, #520 |
| **D3** | **Adaptabilidad = configuración de dominio + superficies declarativas.** `AGENTS.md` reserva Hexagonal para integraciones externas (DGI, bancos, hardware): los adaptadores de rubro viven en el borde (persistencia cloud del perfil, persistencia local del POS, renderizadores de superficie), nunca como puertos que atraviesan el dominio. | #819 |
| **D4** | **El rubro es ortogonal a la fiscalidad.** IVA, ISC, numeración DT 09-2007 y obligaciones DGI **no** se parametrizan por rubro. Un rubro no cambia la corrección fiscal. | #539, #520 |
| **D5** | **Ubicación es dimensión de primera clase del kardex.** La transferencia son **dos movimientos** (envío y entrada) con **estado en tránsito** explícito; nunca un UPDATE. | #818 |
| **D6** | **No especulación.** Un seam se construye cuando hay **dos casos reales** que lo exigen y evidencia en código de que el modelo actual no puede representarlos. Tres casos ya lo exigen: SOHO (BOM/modificadores/KDS/mesas), Telcmax (identidad por unidad, ubicaciones, sin cocina), minimarket (nada de comida, sin serie). | Transversal |
| **D7** | **El ítem declara sus dimensiones de control**: identidad por unidad (serie/IMEI), lote/vencimiento, ubicación, receta/BOM. Reemplaza booleanos dispersos por una taxonomía que un rubro nuevo declara. | #819, #818 |
| **D8** | **Serie y condición de pago son dimensiones del documento fiscal**, no convenciones de prefijo. `dgi_prefix` es libre, por dispositivo, y hoy nada impide que dos terminales usen la misma "serie". | #520, #532 |
| **D9** | **IMEI/serie NO es requisito de la DGI** (research 2026-10-08: DT 09-2007 y FAQ de la DGI exigen "cantidad y clase de bienes", no identidad por unidad). La serialización es épica de **dominio**, sin reloj legal corriendo. | Fase 3 |
| **D10** | **ISC no aplica a la reventa del minorista.** Art. 150 LCT / art. 104 Reglamento: el ISC afecta "únicamente su importación y su primera enajenación"; los sujetos pasivos son fabricante/productor, ensamblador e importador. Un minorista que compra a distribuidores regionales **no** lo traslada en su factura. Se vuelve requisito solo si servimos a un importador o primer enajenante. | Fase 5 (condicional) |
| **D11** | **Un solo contrato canónico de movimientos entre POS y backend.** Hoy el backend declara 10 tipos y el POS 6: el POS no puede expresar `ENTRADA_COMPRA`, `SALE_CANCEL`, `CREDIT_NOTE_RESTOCK` ni `INITIAL_STOCK`. `ADJUSTMENT` conflaciona ambos signos. Un vocabulario distinto a cada lado del canal determinista es un defecto de contrato, no un detalle de nombres. | #818 |
| **D12** | **"Defectuoso" no es un tipo de movimiento: es una ubicación/estado.** Un equipo defectuoso es un activo en otro estado, no una pérdida. Va a una ubicación de cuarentena; el reclamo al proveedor es un documento aparte y la baja, si ocurre, se registra cuando el proveedor responde. | #818 |
| **D13** | **Cartera y cobro es un contexto declarado, no implementado.** Se declara ahora porque su huella fiscal es la condición contado/crédito (0.5): diseñar 0.5 sin deudor obliga a re-migrar el documento fiscal después, contra documentos emitidos. | #820 |
| **D14** | **El vocabulario de eventos sigue el modelo GS1 de tres partes** (bizStep / disposition / bizTransaction), no una lista plana de tipos. Corrige la taxonomía propuesta inicialmente en #818 y evita dialectos privados. | #818, #821 |
| **D15** | **La custodia serializada nunca se resuelve por last-write-wins.** Toda ambigüedad va a una **cola de reconciliación** con decisión humana, conservando ambos registros financieros. Se apoya en el patrón de alertas ya existente; falta generalizarlo. | #818, #819 |
| **D16** | **Kit comercial ≠ receta.** Un kit descarga componentes y tiene precio propio; una receta produce un ítem. `COMPOUND` está atado a la rama de recetas (`recipe.service.ts:36,43`), así que **no** sirve para kits. | #821 |
| **D17** | **Grado/condición es atributo de la instancia, no de la clase.** Habilita usados, refurbished y mercancía con empaque dañado con un solo mecanismo. | #821 |
| **D18** | **El producto es POS de tienda física.** Multi-canal (web/marketplace sobre un stock compartido) queda **fuera de alcance** por decisión del 2026-10-08, no aplazado. Consecuencia de diseño: la disponibilidad **no** necesita nacer reservable entre canales, lo que simplifica la proyección de existencias de la Fase 2. | #821 Q1 |
| **D19** | **Apartado con prima y cuotas es una capacidad propia**, no parte de cartera. Tiene ciclo de vida propio (reserva del equipo, prima, calendario de cuotas, vencimiento, mora) y por lo tanto superficie y roles propios. GS1 ya norma el hecho como bizStep `reserving`. Comparte el libro de cuenta corriente con cartera, pero no es un modo de ella. | #820, #821 Q2 |
| **D20** | **Postventa se limita a garantía por unidad y RMA a proveedor.** El **servicio técnico** (ticket, técnico, repuestos, cotización) queda **fuera de alcance**: no es core ni plugin por ahora. Consecuencia: el estado de una unidad en garantía se modela con ubicación de cuarentena + bizStep `staging_outbound`/`shipping`/`receiving` y documento `rma`, sin un módulo de taller. | #818, #821 Q3 |

---

## Estado actual verificado (truth pass — 2026-10-08)

Auditoría de solo lectura. Cada fila es evidencia leída, no supuesta.

| Seam | Existe hoy | Falta | Evidencia |
|------|-----------|-------|-----------|
| Perfil de rubro | 3 canales descoordinados: `template_code` (solo siembra datos), `OPERATION_MODE` (solo checkout POS, 3 valores de comida), SQLite local del POS | Campo vertical canónico; capa de capacidades persistida; algo que lea el perfil para layouts | `1787000000000-CreateIndustryTemplatesAndDefaults.ts:65-70`; `tenant_config_service.dart:12-21`; `tenant_operation_mode.dart:11-19`; `tenant.entity.ts:10-37` |
| Taxonomía de ítem | `product_type` (`SIMPLE/COMPOUND/PREPARED/VARIANT_PARENT`), `inventoryPolicy` (`recipeBom/directStock/notTracked`), `is_perishable`, `uom` | Dimensiones declaradas (serie, lote, ubicación, receta) como modelo, no como booleanos | `product.entity.ts:12-70`; `product.dart:22-30` |
| Ubicación | `warehouses` como maestro **plano** sin jerarquía; `warehouse_id` como **etiqueta** nullable en producto/insumo; kardex **sin columna de ubicación**; sin tabla de existencias por ubicación; sin entidad/línea/tránsito de transferencia; `MovementType` sin `TRANSFER` | Todo el modelo de ubicación | `warehouse.entity.ts:13-31`; `product.entity.ts:32`; `insumo.entity.ts:35`; `inventory-movement.entity.ts:11-22,37` |
| Superficies | Nav y KPIs en arrays literales filtrados solo por rol/costo/régimen; POS con rutas estáticas; KDS incondicional; vocabulario de comida en todas las apps | Perfil declarativo que filtre superficies por capacidad | `sidebar.tsx:37-57`; `rbac.ts:44-61`; `kpi-strip.tsx:197-260`; `main.dart:867-947`; `app_drawer.dart:184-199` |
| Fiscal (dimensiones) | Numeración monótona e inalterable contra DELETE; nota de crédito con numeración y reversión en el mismo documento | Serie por sucursal (DT 09-2007 3.1); condición contado/crédito (1.7); inmutabilidad ante UPDATE; back-entry de contingencia (3.3) | Ver #520 D5, #532, #533 F3, #539 y los comentarios de auditoría del 2026-10-08 |
| Movimientos | Kardex con 10 tipos en backend y **6 en el POS**; `ADJUSTMENT` sin dirección; sin valor de transferencia | Un contrato canónico compartido; vocabulario alineado a GS1 (bizStep/disposition/bizTransaction); transferencia como agregado con estados | `inventory-movement.entity.ts:11-22`; `inventory_movement.dart:7-14` |
| Crédito y cobro | `PaymentMethod` sin instrumento de crédito; `payment_status` admite `partial` sin deudor | Cartera, límites, plazos, vencimientos, antigüedad, recibos de caja numerados, apartado/cuotas | #820; `payment.dart:6` |

**Lo que ya sirve y no hay que tocar:** kardex append-only con `stock_before/after`, costo unitario/total y costo promedio posterior; CPP en NIO con FX BCN por fecha de factura; factura de compra con identidad fiscal y correcciones compensatorias; proveedores con crédito; conteos físicos con replay idempotente; mermas; UoM binaria con conversiones; sync offline determinista con idempotencia y secuencia por origen.

---

## Los cuatro seams

| Seam | Contrato | Dónde vive | Implementaciones |
|------|----------|------------|------------------|
| **VerticalProfile** | Documento de capacidades versionado y hasheable por tenant, con revisión y auditoría | Cloud (autoridad) + proyección al POS por el canal fiscal; persistencia local en el POS | Un bundle por rubro: `CAFETERIA`, `RESTAURANTE`, `MINIMARKET`, `FERRETERIA`, `RETAIL_ELECTRONICO` |
| **ItemControlDimensions** | Cada ítem declara qué dimensiones controla: identidad por unidad, lote/vencimiento, ubicación, receta/BOM | Dominio (`product`/`insumo`), con validación por capacidad | Producto de cafetería (BOM, perecedero), celular (unidad + ubicación), abarrote (solo ubicación) |
| **LocationModel** | Existencias como proyección `(ítem, ubicación)` reconstruible del kardex; transferencia = envío + entrada + tránsito | Dominio de inventario + sync offline | Un nodo (tenant actual), jerarquía central → sucursales → bodegas de sucursal |
| **SurfaceProfile** | Mapa declarativo `capacidad → clave de superficie` para nav, KPI strip, drawer/rutas del POS, vocabulario de recibo | Cada app (dashboard, POS), leyendo el mismo perfil | Superficie de cafetería (KDS, mesas), superficie de retail (series, garantía, sin cocina) |

---

## Taxonomía de eventos y movimientos (D11, D12, D14)

El vocabulario canónico se toma del estándar, no se inventa. GS1 EPCIS + CBV 2.0 separa **tres** cosas que el diseño inicial mezclaba:

| Parte | Qué responde | Valores normados (extracto) |
|-------|--------------|-----------------------------|
| **bizStep** | qué ocurrió | `receiving`, `shipping`, `retail_selling`, `cycle_counting`, `stock_taking`, `inspecting`, `repairing`, `replacing`, `reserving`, `consigning`, `sampling`, `destroying`, `commissioning`, `holding`, `staging_outbound` |
| **disposition** | en qué estado quedó el objeto | `sellable`, `in_transit`, `quarantined`, `damaged`, `returned` |
| **bizTransaction** | el documento que lo respalda | `inv`, `po`, `desadv`, `recadv`, `rma` |

Consecuencias de diseño:

1. **El documento no es el movimiento.** `DEVOLUCION_A_PROVEEDOR` o `ENVIO_A_GARANTIA` mezclan paso y documento: el paso es `staging_outbound`/`shipping`/`receiving`/`inspecting`, y el documento es un `rma`. Por eso `returning` **no** es un bizStep válido: una devolución es una cadena de eventos.
2. **`SGTIN = GTIN + serie`**: la industria distingue **clase** de producto (lo que se vende) de **instancia identificada** (la unidad que se posee). `products` es la clase; la instancia no existe. Esa distinción es la que impide que una unidad esté en dos ubicaciones a la vez.
3. **`disposition` pertenece a la unidad/ubicación, no al movimiento**, así que `in_transit` y `quarantined` no requieren tipos nuevos. Esto reemplaza el argumento de D12 por uno respaldado en estándar.

Estado actual verificado: **los dos lados declaran dominios distintos para el mismo enum**. Backend, 10 valores (`inventory-movement.entity.ts:11-22`); POS, 6 (`inventory_movement.dart:7-14`). `ADJUSTMENT` conflaciona entrada y salida, y no existe ningún valor de transferencia.

---

## Crédito a clientes, cartera y cobro (D13)

Estado actual verificado: **no existe**. `PaymentMethod` es `cash, card, qr, points` (`payment.dart:6`) — sin instrumento de crédito. `payment_status` admite `partial`, así que el estado financiero de una factura es representable, pero **no hay deudor**: sin saldo por cliente, sin límite, sin plazo, sin vencimiento, sin antigüedad de saldos. `customers` existe pero es de identidad/fidelización.

Consecuencia: una venta a crédito hoy solo puede expresarse como una factura con `payment_status = pending`. Nadie puede responder quién debe, cuánto, ni desde cuándo.

Acoplamiento fiscal que obliga a declararlo ahora: una venta a crédito activa la condición contado/crédito de DT 09-2007 **1.7**, que hoy no existe en el modelo y cuyo recibo imprime `Condicion: Contado` hardcodeado. **Cartera es el consumidor principal de la dimensión fiscal 0.5**, no un módulo financiero aparte. Además, DT 3.2 exige que el **recibo de caja** cumpla los requisitos de una factura, incluyendo desglose de IVA: la cobranza produce documentos fiscales con numeración propia.

Cimientos a declarar (implementar después): cliente como entidad de crédito (límite, plazo, bloqueo); libro de cuenta corriente **append-only** con cargos y abonos inmutables y saldo como proyección reconstruible —mismo invariante que el kardex—; instrumento de pago `crédito`; vencimiento **en el cargo**, no derivado de la fecha de factura; y la **tensión offline** (un límite vive en la nube y la venta ocurre sin red) resuelta con caché versionada, fail-closed por encima del umbral y excepción por autorización humana, reutilizando el patrón de `human_authorization`.

---

## Reglas de oro (invariantes)

1. **Un rubro se declara, no se programa.** Si agregar un rubro requiere tocar código de dominio, el seam está mal.
2. **Nada de `if (rubro)` en el dominio.** La condicional por rubro dentro de un servicio de dominio es el síntoma; la capacidad es la solución.
3. **Lo ausente es feature, no bug.** Un rubro sin serie no ve series; no ve "series deshabilitadas".
4. **El rubro no cambia la fiscalidad** (D4). IVA 15%, ISC cuando aplique por rol tributario, y DT 09-2007 se cumplen igual en todos los rubros.
5. **El kardex sigue sagrado.** Append-only, sin DELETE ni UPDATE, correcciones por movimiento compensatorio de signo opuesto. La ubicación no es una excepción.
6. **El contrato offline manda.** Toda configuración de rubro debe caber en el canal determinista de sync, versionada y hasheable, para que un dispositivo re-aprovisionado reproduzca la misma superficie.
7. **Autoridad única.** Un dato de configuración tiene un solo dueño. Tres canales para "rubro" es el defecto actual; agregar un cuarto es el error a evitar.
8. **Un seam sin test de contrato es cosmético.** Si no hay una prueba que falle al agregar un rubro con código, el seam no existe.
9. **La custodia serializada nunca se resuelve por last-write-wins** (D15). Si el mismo equipo se vende dos veces offline, se conservan **ambos** registros financieros y la ambigüedad va a una cola de reconciliación con decisión humana. Nunca se borra una venta.
10. **El vocabulario de eventos se hereda del estándar** (D14). Un valor interno se mapea a un bizStep publicado, o se marca explícitamente como extensión local con motivo.

---

## Fases

### Fase 0 — Cimientos (bloqueante de todo lo demás)

Esta fase es exactamente lo pedido: dejar asentadas bases, interfaces y adaptadores **antes** de tocar features de rubro.

| # | Slice | Entregable | Issue | Talla |
|---|-------|-----------|-------|-------|
| 0.1 | **VerticalProfile + capacidades** | Campo canónico, documento versionado hasheable, capa de capacidades con revisión y auditoría, proyección al POS offline, reconciliación del triple actual | #819 | L |
| 0.2 | **ItemControlDimensions** | Taxonomía declarada de dimensiones de control; migración de `product_type`/`inventoryPolicy`/`is_perishable` a declaración; validación por capacidad | #819 | M |
| 0.3 | **LocationModel (diseño + modelo)** | Diseño del kardex dimensional, jerarquía de ubicaciones, existencia como proyección `(ítem, ubicación)`, transferencia con tránsito, impacto en el contrato de sync | #818 | L |
| 0.4 | **SurfaceProfile** | Filtrado declarativo de nav, KPI strip, drawer/rutas del POS y vocabulario de recibo; KDS deja de ser incondicional | #819 | M |
| 0.5 | **Dimensiones fiscales** | `serie` por sucursal (DT 09-2007 3.1) y condición contado/crédito (1.7); endurecer inmutabilidad ante UPDATE; autoridad de numeración | #520, #532, #539, #533 | M |
| 0.6 | **Contrato canónico de eventos y movimientos** | Un solo vocabulario POS↔backend alineado a GS1 (bizStep/disposition/bizTransaction), con `disposition` en la unidad/ubicación y no en el movimiento; incluye la cola de reconciliación de conflictos de custodia (D15) | #818, #821 | M |

**Gate de Fase 0 (falsable):** declarar `FERRETERIA` debe requerir **solo configuración y datos** — sin cambio en servicios de dominio, sin `if` por rubro, sin migración. Si el gate no pasa, la Fase 0 no cerró y ninguna feature de rubro debe empezar.

**Restricción de 0.3:** puede diseñarse completo en Fase 0, pero su **implementación** vive en Fase 2. La razón es que 0.3 toca el activo más delicado del sistema y no debe implementarse a la par de un cambio de superficies.

### Fase 1 — Retail no serializado (una sucursal)

El rubro más cercano a lo que ya existe: minimarket, ferretería, accesorios, repuestos. Habilita el primer cliente ancla sin multi-sucursal.

- Producto retail: marca/modelo y atributos estructurados; variantes con SKU y precio propios; **SKU/código de barras en la nube** (hoy solo existen en el POS local y el delta de sync los omite); imágenes; historial de precios.
- Verificación funcional del flujo completo en un rubro sin receta: compra → costo CPP → traslado (cuando exista) → venta → kardex → reporte.

### Fase 2 — Multi-sucursal / multi-bodega operativo

Implementación de #818 sobre el diseño de 0.3: **transferencia como agregado con estados** (DRAFT → DISPATCHED → IN_TRANSIT → RECEIVED → CLOSED, con conciliación de ambos tramos; un tramo sin pareja nunca se vuelve disponible en silencio), **ubicación de cuarentena** para equipos defectuosos o en garantía (D12), conteos por ubicación, políticas de stock negativo y umbrales por ubicación, reportes y valorización por ubicación.

### Fase 3 — Serialización

Identidad por unidad (IMEI/serie) sobre las dimensiones ya declaradas en 0.2: estado por unidad (en bodega / vendido / devuelto), asociación a factura, garantía y trazabilidad de devolución, RMA de proveedor. Sin bloqueo legal (D9). El diseño debe mantener el kardex como libro de cantidades, con movimientos de cantidad 1 por unidad.

### Fase 4 — Crédito a clientes, cartera y cobro

Implementación de #820 sobre el seam declarado en Fase 0: cliente como entidad de crédito con límite, plazo y bloqueo; libro de cuenta corriente append-only con saldo como proyección reconstruible; abonos y recibos de caja con numeración propia (DT 3.2); vencimiento en el cargo y antigüedad de saldos; cobranza y mora como capacidades separadas. El **apartado con prima y las cuotas** entra acá como capacidad propia (GS1 lo normaría como `reserving`), igual que el **trade-in / buy-back** como compra a cliente con grado (#821, Q2 y Q4).

### Fase 5 — Postventa y condicionales

- **Garantía por unidad y RMA a proveedor** (#821, M5 y M7): la garantía se registra sobre la instancia identificada de la Fase 3, y el RMA es un **documento** con seguimiento, no un movimiento de inventario. El servicio técnico queda fuera (D20), así que la unidad en garantía vive en cuarentena con trazabilidad de eventos.
- **Listas de precios** por cliente, volumen y periodo (#821, M3).
- **Kits comerciales** (D16) y **CxP formal** (#821, M4 y M8), según decidan Q5 y el alcance.
- **No-goals confirmados**: multi-canal (D18) y activación con operadora más comisiones (#821, Q7) no entran en este plan.

- **ISC** (D10): solo si el tenant importa o es primer enajenante.
- **Ciclo de orden de compra / recepción parcial**: decisión fundadora previa lo excluyó; reabrir solo con evidencia de un cliente que lo necesite.
- **Contingencia DT 3.3** (back-entry de facturas manuales): gap conocido y documentado; requiere decisión de negocio además de código.
- **Factura electrónica XML / firma digital**: es el Bloque 19 del roadmap maestro, ortogonal a este plan.

---

## Matriz de capacidades por rubro

| Capacidad | Cafetería | Restaurante | Minimarket | Ferretería | Retail electrónico |
|---|---|---|---|---|---|
| Receta / BOM | Req. | Req. | — | — | — |
| Modificadores | Req. | Req. | — | — | — |
| KDS / cocina | Req. | Req. | — | — | — |
| Mesas / salón | Opc. | Req. | — | — | — |
| Propinas | Req. | Req. | — | — | — |
| Lote / vencimiento | Req. | Req. | Opc. | Opc. | — |
| Multi-ubicación | Opc. | Opc. | Req. | Req. | Req. |
| Identidad por unidad (serie/IMEI) | — | — | — | Opc. | Req. |
| Garantía / RMA | — | — | — | Opc. | Req. |
| Crédito a clientes | — | — | Opc. | Req. | Req. |

Regla: cada fila es una **capacidad** (D1), y cada columna un **bundle declarado** (D2). Ninguna celda debe resolverse con código de dominio.

---

## Presupuesto de revisión y riesgo

| Fase | Talla | Riesgo principal | Mitigación |
|---|---|---|---|
| 0.1 VerticalProfile | L | Cuarta fuente de verdad si no se retira el triple actual | D2 + D7: autoridad única y migración explícita del triple |
| 0.2 ItemControlDimensions | M | Romper items vivos al migrar booleanos a dimensiones | Migración con backfill y regla de no coercionar lo existente |
| 0.3 LocationModel (diseño) | L | Diseñar de más para rubros hipotéticos | D6: solo los tres casos reales documentados |
| 0.4 SurfaceProfile | M | Filtrar mal y esconder algo que el negocio necesita | Test de contrato de superficie por rubro |
| 0.5 Dimensiones fiscales | M | Tocar numeración fiscal de un tenant vivo | #532: hacerlo **ahora**, con un solo tenant y sin documentos que reconciliar; después es una migración sobre datos fiscales emitidos, y "los números impresos no se pueden des-duplicar" |
| 0.6 Contrato de eventos | M | Adoptar vocabulario estándar sobre datos vivos | Mapeo con alias, sin renombrar historia: los valores existentes conservan su significado |
| Fase 2 implementación | L | Romper el kardex append-only | D5: transferencia como agregado con estados; tramos sin pareja quedan en excepción, nunca disponibles |
| Fase 4 cartera | L | Prometer crédito sin poder cobrar | Capacidades separadas: vender a crédito y cobrar son superficies y roles distintos |

**Asimetría temporal (de #532):** dos de estos se vuelven **estrictamente más caros** más tarde, porque su corrección requiere migrar datos fiscales o maestros vivos: la autoridad de numeración (0.5) y el maestro de ítems versionado (0.2). El resto se puede posponer sin penalidad. Eso ordena la Fase 0 internamente: **0.5 y 0.2 primero**.

---

## Diferidos y no-goals

- **No-goal confirmado por decisión (2026-10-08):** multi-canal — el producto es POS de tienda física (D18).
- **No-goal confirmado por decisión (2026-10-08):** servicio técnico / taller. Postventa se limita a garantía por unidad y RMA (D20).
- **No-goal confirmado por decisión (2026-10-08):** activación con operadora y comisiones; queda como frontera de un rubro telecom que no se persigue.
- **No-goal:** registro genérico de plugins, carga dinámica de módulos o rutas de código por tenant.
- **No-goal:** reescribir el core en hexagonal (D3).
- **No-goal:** divergencia fiscal por rubro (D4).
- **Diferido:** multi-nivel de sub-recetas, empaques y aprobaciones (deuda ya registrada en el roadmap de inventario).
- **Diferido:** precio por sucursal / listas de precios (abrir issue si un cliente lo pide).

---

## Cómo revisar este plan

1. Lee **Decisiones confirmadas** y **Estado actual verificado** antes de proponer cualquier implementación.
2. Verifica que cada slice declare qué **seam** implementa y cuál es su **test de contrato**.
3. No inicies Fase 1+ mientras el **gate de Fase 0** no pase.
4. Si una propuesta introduce un `if` por rubro en el dominio, rechazala: viola la regla de oro 2.
5. Si una propuesta construye un seam sin dos casos reales, rechazala: viola la regla de oro de D6.
6. Antes de agregar un módulo, verificá en [`benchmark_industria_retail.md`](./benchmark_industria_retail.md) si es **piso del rubro** (paridad) o **diferenciación**. El piso se paga una vez; la paridad no es estrategia (F5).
7. Si una propuesta inventa un nombre de evento o movimiento, rechazala salvo que declare el bizStep publicado al que mapea (regla de oro 10).
