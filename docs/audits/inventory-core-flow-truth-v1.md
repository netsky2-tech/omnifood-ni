# Núcleo de inventario — Verdad del flujo real (v1)

**Fecha:** 2026-08-27 · **Base verificada:** `main` @ `12a5336c` · **Ámbito:** insumos, recetas/BOM, kardex, costos/CPP, márgenes, producción, perecederos y mermas.
**Método:** ejercitar el flujo completo contra **PostgreSQL 16 real** con **RLS `FORCE`** y triggers append-only, a través del **backend vivo** (no de los specs).
**Documento de trabajo:** `odd/tasks/nucleo-inventario-verificacion.md` (specs, hipótesis H1–H8, log L1–L15).

> Este documento responde a una pregunta concreta: **¿el núcleo de compra/receta/producción/venta/inventario funciona de verdad?** La respuesta corta: **los mecanismos centrales están bien construidos; lo que falla son las fronteras**, y los cinco defectos principales son invisibles para las pruebas existentes.

---

## 1. Por qué esta verificación era necesaria

El producto se ejercitó hasta hoy solo con **productos simples**, así que el flujo con recetas, insumos, producción y perecederos nunca se recorrió end-to-end. Los documentos afirmaban lo contrario: `docs/plans/inventory/inventory_roadmap.md` declaraba **"Cerrado"** el BOM recursivo multi-nivel con detección de ciclos, el costeo teórico con margen bruto, la producción atómica y la sincronización determinista.

El problema era la **capa de evidencia**:

| Hecho medido | Evidencia |
|---|---|
| De **44 specs** del módulo de inventario, **solo 4** corren contra Postgres real | `insumo-response.db.spec.ts`, `product.service.db.spec.ts`, `purchase-document-response.db.spec.ts`, `kardex-retrocalculation-e2e.spec.ts` |
| El esquema local estaba **4 migraciones atrás de `main`** y **sin `uom_catalog`** | `omnifood` en `1809640000000`; faltaban `1809650000000`, `1809750000000`, `1809850000000` (crea `uom_catalog`), `1809900000000` |
| El **fixture de pruebas** está construido con `factor = 1`, sin recetas, sin compras y sin lotes | 29 insumos con `purchaseUom = consumptionUom`; 8 productos **todos `SIMPLE`**; 0 recetas; 0 compras; 0 lotes |

Es decir: **ni las pruebas ni el fixture ejercitaban el flujo que este documento verifica**, y ninguna corrida local había usado nunca el esquema de `main`.

Esto además es la demostración empírica de una lección ya registrada en `odd/tasks/soho-estado-y-pendientes.md` §5.2: *para algo que escribe en un esquema real con constraints, RLS o triggers, el test contra base real es el único que cuenta.*

---

## 2. Entorno de verificación

| Elemento | Valor |
|---|---|
| Base | `omnifood_rig` (**aislada**; no se tocaron `omnifood` ni `omnifood_test`) |
| Esquema | 127 migraciones, 87 tablas, `uom_catalog` con 28 entradas |
| Endurecimiento | triggers de inmutabilidad del kardex activos; **RLS `relforcerowsecurity = true`** en `insumos`, `inventory_kardex`, `recipes`, `batches` |
| Backend | `:3100` contra el rig (`DB_DATABASE=omnifood_rig PORT=3100 node dist/main.js`) |
| Tenant | `e05bf002-b1d3-45f2-a46a-3592e1cc1431`, slug `pilot-caf---pruebas`, OWNER `sofia@omnifood.ni` |
| Transporte de escritura | `SyncTransportGuard` (token de dispositivo) — ver §3 |

**Hallazgo de infraestructura:** todos los escritos del núcleo están detrás de `SyncTransportGuard`, es decir exigen **credencial de dispositivo**, no token de usuario: `purchases` (`inventory-movement.controller.ts:240`), `shrinkage` (`:403`), `count-sessions` (`:443`), `production-orders/close` (`:464`), `recipes/versions` (`:486`), `movements/sync` (`:150`). Con token de OWNER solo son alcanzables el preview de compra, la compra manual y la corrección. **Los specs que "prueban" esas rutas mockean la propia guarda** (p. ej. `test/sales/sync-batch.e2e-spec.ts` hace `overrideGuard(SyncTransportGuard)` **y** mockea `InvoicesService`), así que verifican cableado, no comportamiento.

---

## 3. Registro del flujo paso a paso

Cada paso se ejecutó contra el backend vivo y se contrastó contra la base. Los valores son los **observados**.

### 3.1 Configuración de insumos y unidades — ⛔ roto

- `POST /api/insumos` con `{purchaseUom:"lb", consumptionUom:"kg", conversionFactor:1}` → **HTTP 201, aceptado**. El spec `S3` manda rechazar exactamente ese caso (factor 1 con UOM distintas = conversión no configurada).
- La guarda existe (`uom-catalog.ts:299-373`) pero vive en `PurchaseService`, **servicio sin consumidores**; ni la escritura de insumos ni la ruta de compra viva la invocan.

### 3.2 Compra — ⚠️ correcta en FX y corrección, ⛔ rota en conversión

**Lo correcto (verificado):**
- La compra es **atómica**: `SERIALIZABLE` + lock + binding RLS (`inventory-purchase.service.ts:317-346`), con kardex `ENTRADA_COMPRA` y creación de lote para perecederos en la misma transacción.
- **FX BCN oficial correcto**: compra USD con `fxRateMode:"official"` resolvió `36.6243` para `2026-10-01` con fuente `"Official BCN rate by invoice date"`. La caché `inventory_bcn_fx_rates` tenía **una sola fila, creada en el instante de la consulta** → **fetch real por fecha exacta, sin fallback**, y falla cerrado si no la encuentra (`fx-rate-resolver.service.ts:62`). Cumple la decisión D2.
- **Corrección compensatoria correcta**: `POST /inventory/purchases/:id/correction` crea documento `PURCHASE_CORRECTION` y un asiento `ADJUSTMENT` de `-10.0000` con **`compensation_for_kardex_id` apuntando al asiento original** (`:499-545`).

**Lo roto — H1, el factor de conversión se ignora:** insumo `purchaseUom=lb`, `consumptionUom=kg`, `conversionFactor=0.4536`; compra de 10 lb a C$100/lb.

| Campo persistido | Sistema | Correcto |
|---|---|---|
| `inventory_kardex.quantity` | **10.0000** | 4.5360 kg |
| `inventory_kardex.unit_cost_nio` | **100.0000** | 220.4586 NIO/kg |
| `inventory_kardex.average_cost_after_nio` | **100.0000** | 220.4586 |
| `insumos.stock` = `existencia_actual` | **10.0000** | 4.5360 |
| `insumos.costo_promedio_nio` | **100.0000** | 220.4586 |

Causa: `CostCalculatorService.calculatePurchaseUnitCostNio` (`cost-calculator.service.ts:186-203`) devuelve `entryUnitCost` (o `× bcnRate`) **sin dividir por el factor**, y `calculatePurchaseCpp` (`:96-123`) hace `projectedStock = previousStock + entryQuantity`, sumando la cantidad de **compra** a un stock llevado en unidades de **consumo**. `buildPreview` (`inventory-purchase.service.ts:703-739`) tampoco lee `purchaseUom` ni `conversionFactor`.

**Confirmado en las dos rutas**: la compra manual (`/purchases/manual`) **y** la de dispositivo (`/purchases`, la que usa el POS en producción).

**Matiz que hace el daño peor, no menor:** el **valor total coincide** (10 × 100 = 4.536 × 220.4586 = C$1000), porque un factor puro conserva el valor. La distorsión está en **cantidad** y **costo unitario** — que son justamente los que alimentan el descargue de recetas, las alertas de par/stock mínimo y el costo del plato. Y como el kardex es **inmutable por trigger**, el asiento queda **congelado**: solo se remedia con movimiento compensatorio.

### 3.3 Recetas / BOM — ⛔ la sub-receta se pierde, el multi-nivel es código muerto

- La guarda de tipo de producto **funciona**: un producto `SIMPLE` se rechaza con HTTP 400 y mensaje accionable (*"…no admite recetas: una receta requiere un producto de tipo Compuesto o Preparado. Corrija el tipo del producto en Catálogo → tipo de producto."*).
- El prorrateo de **merma técnica funciona**: grosor 50 con `technicalShrinkPct: 10` → `quantity = 45.0000`.
- El ciclo de versiones existe (`publication_state`, `origin`, `publishRecipeVersion`).

**H3 — la sub-receta se persiste como insumo apuntando a un producto.** Receta creada con dos componentes declarados explícitamente: uno `INSUMO` (insumo real, `componentUom:"g"`) y uno `SUB_RECIPE` (producto `PREPARED`, `componentUom:"porcion"`). Resultado en `recipe_details`:

| `insumo_id` | `ingredient_type` | `ingredient_name` | `component_uom` |
|---|---|---|---|
| `05e90cc0…` (insumo real) | `INSUMO` | `''` | `''` |
| `6e80db28…` (**producto**) | **`INSUMO`** | **`''`** | **`''`** |

Verificado: `6e80db28…` tiene `es_insumo = 0` y `es_producto = 1`. Causa: `recipe.controller.ts:209-213` mapea cada componente a `{insumoId, grossQuantity, technicalShrinkPct}` y **descarta `ingredientType` y `componentUom`**; `recipe.service.ts:170-183` deja `ingredient_type` en su default `'INSUMO'`. La versión quedó **`PUBLISHED` con `is_active = true`**.

**Agravante de esquema:** `recipe_details` **no tiene columna `sub_recipe_id`** — el diseño es polimórfico sobre `insumo_id` + `ingredient_type`. Al descartar el tipo, **ninguna otra columna guarda la verdad**: el mal etiquetado es irrecuperable.

**Consecuencia (dinero, silenciosa):** `invoices.service.ts:1752-1756` registra `Skipping FOH movement due to unresolved insumo ${insumoId} (policy: reject/log+skip)` y acto seguido hace **`continue`**. **El texto dice "reject" pero el código nunca rechaza: siempre saltea.** La venta se cobra, nadie se bloquea, y los insumos de la sub-receta **nunca salen del inventario**.

**H5 — el BOM multi-nivel no está conectado.** `explodeRecursive` (`bom-explosion.service.ts:44`) tiene **cero callers en todo el repositorio**. La ruta productiva usa siempre `explode()` de un solo nivel: `invoices.service.ts:1982`, `production.service.ts:263` y `:443`, `shrinkage.service.ts:176`.

### 3.4 Producción — ⛔ HTTP 500 (bloqueante)

Escenario completo y satisfacible: insumo perecedero con lote real de 50 kg, receta de 1 kg por unidad, cierre pidiendo 5 kg.

```
TypeError: expirationDate.getTime is not a function
    at BatchCostingService.isSoftExpired (batch-costing.service.js:47)
    at BatchCostingService.buildValuationTrace (batch-costing.service.js:37)
    at ProductionService.postProductionClose (production.service.js:299)
```

**Causa raíz:** `batches.expiration_date` es de tipo PostgreSQL **`date`**, así que el driver devuelve un **string**; el contrato declara `expirationDate?: Date` (`batch-costing.service.ts:11`) y `isSoftExpired` llama `.getTime()` (`:82`); `production.service.ts:294` y `:468` pasan `batch.expiration_date` sin convertir. **La transacción revierte y no se postea nada.**

**Alcance:** falla **siempre que algún componente consuma de un lote** — es decir, para todo componente perecedero, que es la razón de existir de la producción. La pre-elaboración de sub-recetas **nunca funcionó**.

**Lo que sí está bien en esta etapa:** el servidor **recalcula** el costo unitario en vez de confiar en el POS (`producedUnitCostNio = totalConsumedValueNio / actualQuantity`, `:503-506`); los campos `totalConsumedCostNio`/`producedUnitCostNio` que envía el POS se **ignoran**. El escalado de componentes es correcto (18 g/unidad × 10 = `required 180`, según el propio mensaje de error). La idempotencia por stream con recibo append-only funciona.

**Nota de arquitectura:** `producedInsumoId` es un **insumo**, mientras el dashboard modela la sub-receta como producto **`PREPARED`**. **Las dos mitades del producto no coinciden en qué es una sub-receta** — raíz compartida de H3 y de este tramo. Además la ruta perdió su guarda de autorización humana (`inventory-movement.controller.ts:456-463`, decisión del fundador 2026-09-21): hoy se apoya **solo en la identidad del dispositivo**.

### 3.5 Venta → descargue — ✅ correcta; la anulación descuenta bien pero no deja rastro de auditoría

**Con receta: correcta.** Venta de 5 unidades de un producto cuya receta usa 1 kg por unidad:

- Respuesta honesta: `status ACCEPTED`, `code APPLIED`, `inventoryOutcome APPLIED`, `retryable false`, con `acknowledgedMovementCorrelationIds`.
- Kardex: `SALE` de `-5.0000` a `unit_cost_nio 100.0000` (CPP vigente), `stock_before 50 → stock_after 45`. Insumo 50 → 45.

**Sin receta: correcta y honesta.** Venta de un producto `SIMPLE`:
```
code: APPLIED_NO_INVENTORY_IMPACT
inventoryOutcome: APPLIED_NO_INVENTORY_IMPACT
inventoryOutcomeReason: {code: "NO_EXPLICIT_INSUMO_MAPPING", lines: ["e3dc1fa3…"]}
acknowledgedMovementCorrelationIds: []
```
Kardex: **36 filas antes y 36 después.** Cero movimientos. **El backend nombra la causa y la línea.** Importante: esto **descarta** que el síntoma de SOHO (INSUMOS vacío, badge rojo "SIN STOCK") sea un contrato de backend mentiroso; es la UI que no refleja este outcome (issue **#73a**).

**Anulación (H4 confirmada, alcance acotado).** El stock se restituye correctamente (`SALE_CANCEL +5.0000`, de 45 a 50), pero el vínculo de auditoría queda nulo:

| asiento | `compensation_for_kardex_id` | `origin_movement_id` | `origin_invoice_item_id` | `sale_correlation_id` |
|---|---|---|---|---|
| `SALE` | NULL | NULL | `3abef1a3…` | `fe06443b…` |
| `SALE_CANCEL` | **NULL** | **NULL** | **NULL** | `5ce08c66…` |

Causa: `resolveCompensatedMovementId` (`invoices.service.ts:1907-1923`) busca `type: SALE, reason: 'invoice:<id>'`, pero el asiento `SALE` se crea (`:1787-1814`) **sin `reason`** (solo `sourceDocumentId = 'invoice:<id>'`), y `origin_invoice_item_id` se anula a propósito para todo lo que no sea `SALE` (`:1805-1806`). El spec ve coincidencia porque mockea `findOne` devolviendo `{id:'2001'}`.

*Refinamiento posterior (L32):* `reason` es un **getter/setter sobre `sourceDocumentId`** (`inventory-movement.entity.ts:93-99`) — **la misma columna**, no una columna propia —, así que ese filtro **no puede coincidir nunca**. La causa no es "falta setear `reason`", es que **se filtra por una propiedad que no existe como columna**; el arreglo es filtrar por `sourceDocumentId`.

**Grado honesto: el efecto de stock y de costo es correcto; el defecto es de auditabilidad, no de dinero.** Lo único que ata ambos asientos es el `source_document_id` compartido. Ante una consulta forense o DGI ("qué movimiento revirtió esta venta"), el ledger no da la respuesta explícita.

### 3.6 Costos, valorización y márgenes — ✅ correctos; ⛔ el margen no tiene superficie

- **Valorización exacta:** `GET /inventory/reports/valuation` → `totalValuationNio 155870`, 33 ítems, 32 con stock; la base devuelve `155870.0000` y 32 ítems con stock. Coincide ítem por ítem. (Propaga fielmente la distorsión de H1: no es su bug, es H1 saliendo por otra superficie.)
- **COGS correcto y con guarda honesta:** `inventoryCoverage: {status:"UNAVAILABLE", costedSalesCount:0, uncostedSalesCount:1, reasonCodes:["NO_EXPLICIT_INSUMO_MAPPING"]}` — declara que el período **no es confiable** y por qué, en vez de mostrar un cero limpio.
- **Alertas funcionan:** `criticalCount 1` con `suggestedReorderQuantity` y mensaje de reabastecimiento.

**H8 confirmada — el costo teórico y el margen por plato no tienen superficie humana:**
- `calculateRecipeTheoreticalCost` (`cost-calculator.service.ts:128`) tiene **cero callers** en todo el repositorio.
- `calculateDraftTheoreticalCost` (`recipe_view_model.dart:411`) lo llama **solo su propio test** (`recipe_view_model_test.dart:201`).
- `recipe_view.dart` no muestra costo ni margen (cero ocurrencias de `margin|margen|theoretical|cost`).
- Dashboard web: solo la etiqueta de pestaña `{id:"cogs", label:"COGS / Margen"}` (`inventory-page.tsx:36`).

El requisito *"Dynamic Theoretical Costing and Profit Margins"* de `openspec/specs/inventory-recipe-bom/spec.md` está **implementado y correcto en ambos lados, pero desconectado**. Capacidad terminada que nadie puede ver.

**El contraste CPP POS vs cloud — el hallazgo más peligroso de toda la verificación:**
- El POS **convierte bien** al autorar: `quantityInBaseUnit` por el factor y `unitCostNio = (unitCost × bcnRate) / factor` (`purchase_view_model.dart:282-287`). Su CPP proyectado es correcto y **es lo que ve el dueño**.
- Pero por el sync manda **crudo**: `'quantity': purchase.quantity`, `'unitCost': purchase.unitCost` (`sync_service.dart:2349-2350`).
- Y el backend no divide por el factor (H1).

Con `factor = 0.4536`: la pantalla dice *4.536 kg a 220.4586 NIO/kg* y el ledger guarda *10 kg a 100 NIO/kg*. **El operador ve el número correcto y el registro fiscal queda mal.** Nadie tiene motivo para dudar de la pantalla.
(Asimetría reveladora: para **movimientos** el POS sí envía `unitCostNio` cuando existe —`sync_service.dart:2679-2686`—; para **compras** no.)

### 3.7 Perecederos — ⛔ orden de consumo divergente; el vencimiento no dispara nada

- **Captura de lotes funciona:** la compra con `lotCode`/`receivedDate`/`expirationDate` crea la fila en `batches` con `remaining_stock` y `cost` a 4 decimales.
- **El vencimiento se guarda corrido un día:** enviado `2026-12-31` → guardado **`2026-12-30`**. Misma familia que T4-1: `production.service.ts:643`/`:655` envuelven en `new Date(...)` mientras `:409`/`:418` asignan el string crudo, con `date` como tipo y zona UTC-6.

**H6 — los dos lados consumen los lotes en orden distinto:**
- **Backend** (`batch-costing.service.ts:33-46`): demota los vencidos y entre los no vencidos ordena por **`left.batchId.localeCompare(right.batchId)`** → orden **lexicográfico de UUID**, **arbitrario respecto del tiempo**. **No es FIFO ni FEFO.**
- **POS** (`batch_dao.dart:6`): `ORDER BY expiration_date ASC` → **FEFO real**.

Con lotes de distinto costo, **el orden decide el costo del consumo**, y por lo tanto el costo unitario producido, el COGS y el margen.

**Interacción crítica:** `buildValuationTrace` se llama **solo desde producción** (`production.service.ts:286` y `:460`); la venta no consume lotes (descuenta stock agregado al CPP). Por lo tanto **H6 está hoy enmascarada por el 500 de T4-1**: el camino divergente es inalcanzable. **Arreglar T4-1 expone H6**, así que ese fix debe incluir un test que fije el orden de consumo.

**El vencimiento se expone, pero pasivamente:**
- POS `purchase_view.dart:474-483`: chip por lote con `'Vencido'` / `'Por vencer'` / `'FIFO'`.
- POS `shrinkage_view.dart:211-213`: selector de lote con `batchNumber • expirationDate • remainingStock`.
- **Sin alerta proactiva en ningún lado:** cero ocurrencias de `expir|vencim` en `inventory-reports.service.ts` y su DTO; ningún servicio de alerta por vencimiento; cero en la feature de alertas del POS. No hay lista ni reporte de "por vencer".
- El reporte de kardex del backend **no expone lote**: la vista cloud del ledger no tiene dimensión de lote.

El `Purpose` de `openspec/specs/inventory-batch-management/spec.md` promete *"FIFO consumption and expiration monitoring"*: **la mitad de monitoreo no existe.**

### 3.8 Mermas, ajustes y umbral forense — ⛔ merma rota; conteo correcto; umbral inexistente

**Merma: HTTP 500 en las dos rutas** (insumo y plato):

```
QueryFailedError: null value in column "source_document_id" of relation
"inventory_kardex" violates not-null constraint
    at shrinkage.service.js:73   (merma de insumo)
    at shrinkage.service.js:142  (merma de plato)
```

Los dos asientos (`shrinkage.service.ts:95-107` y `:201-213`) setean `sourceDocumentType: 'SHRINKAGE'` pero **nunca `sourceDocumentId`**, y la columna es `NOT NULL` **desde la fundación del ledger** (`1766000000000-BohInventoryLedgerFoundation.ts:19`). **No es regresión: la merma nunca pudo escribir un movimiento de kardex.** El stock no cambia y no hay asiento.

Ironía estructural: el código **sí** tiene referencia documental (`originDocumentRef: 'shrinkage:${movement.id}'`), pero la deriva del `movement.id` que no existe porque el insert es lo que falla.

**Conteo físico: correcto.** `POST /inventory/count-sessions` con teórico 50 y contado 30 → `{movementsCreated: 1, skippedExisting: false}`; kardex `ADJUSTMENT -20.0000` a `unit_cost_nio 100.0000`, `total_cost_nio 2000.0000`, `50 → 30`; `source_document_type: 'AJUSTE_CONTEO'` con **`source_document_id` correctamente seteado**. Reenvío idéntico → `{movementsCreated: 0, skippedExisting: true}`: **idempotencia por documento funciona**. UC-04 operativo.

**Contraste revelador:** `count-session.service.ts:126-135` setea `sourceDocumentId: sessionId`; el `ShrinkageService`, sobre **la misma tabla** y con el **mismo requisito**, no. Esto prueba que es una **omisión por sitio de llamada**, no una imposibilidad arquitectónica — barato de arreglar, pero también significa que **"el módulo funciona" no es una generalización válida**.

**H7 — el umbral forense no existe en la práctica, en dos capas:**
1. El dispatcher es un **no-op literal** (`inventory.module.ts:129-132`): `useValue: { dispatchToAdmins: async () => Promise.resolve() }` → las alertas se persisten y **nunca llegan a nadie**.
2. El **único** caller de `forensicAlertService.create` en producción es `shrinkage.service.ts:252`, **dentro de la transacción que siempre falla** → la alerta es **inalcanzable**. Y ningún camino de conteo o ajuste llama a `create`, aunque el umbral (`HIGH_VALUE_INVENTORY_ALERT_THRESHOLD_NIO = 1500`, `forensic-alert.service.ts:19`) incluye `AJUSTE_CONTEO` y `AJUSTE_MANUAL` entre los tipos que califican.

**Confirmado empíricamente:** un ajuste de conteo de **C$2,000** (33% sobre el umbral) produjo **cero alertas forenses** (0 antes, 0 después).

**Requisito sin efecto:** `warehouseId`/`warehouseName` son obligatorios en el DTO pero **nunca se validan ni se usan**; el rig no tiene ningún almacén y el conteo funcionó igual.

---

## 4. Mapa de brechas priorizado

Prioridad por **riesgo de dinero/correctitud** y, en segundo término, por **grado de no-ejercicio** (cuántas veces se probó el camino antes de esta verificación).

### P0 — dinero o escritura imposible

| # | Brecha | Evidencia | Impacto | Cómo se confirmó |
|---|---|---|---|---|
| 1 | **La conversión de unidades se ignora en la compra** (H1) | `cost-calculator.service.ts:186-203`, `:96-123`; `inventory-purchase.service.ts:703-739` | Cantidad y costo unitario distorsionados ×factor; **congelados** en el kardex inmutable. Envenena recetas, alertas de par y costo del plato | Empírico, ambas rutas (manual y dispositivo) |
| 2 | **La merma está rota al 100%** | `shrinkage.service.ts:95-107`, `:201-213` vs `1766000000000-…:19` | La pérdida de inventario **no se puede registrar**; sin ella no hay control de mermas ni deducción fiscal | Empírico: 500 en ambas rutas, stock sin cambios |
| 3 | **El cierre de producción falla siempre con perecederos** | `batch-costing.service.ts:11`, `:82`; `production.service.ts:294`, `:468`, `:299` | La pre-elaboración de sub-recetas **nunca funcionó**. **Al arreglarlo expone H6** | Empírico: 500 con lote disponible (50 kg, se piden 5) |
| 4 | **La sub-receta se persiste como insumo apuntando a un producto** (H3) | `recipe.controller.ts:209-213`; `recipe.service.ts:170-183` | Descuento incompleto **silencioso** en venta (el mensaje dice "reject", el código saltea); BadRequest en producción. **Irrecuperable**: `recipe_details` no tiene `sub_recipe_id` | Empírico: `recipe_details` con `ingredient_type='INSUMO'` y UUID de producto |
| 5 | **La guarda de UOM no está cableada** (H2) | `uom-catalog.ts:299-373` vs `insumo.controller.ts`, `purchase-manual.dto.ts` | Conversiones inválidas entran al sistema y distorsionan stock/CPP | Empírico: HTTP 201 y compra comprometida |

### P1 — correctitud, auditabilidad o capacidad inexistente

| # | Brecha | Evidencia | Impacto | Cómo se confirmó |
|---|---|---|---|---|
| 6 | **El vínculo de anulación es nulo** (H4) | `invoices.service.ts:1907-1923` vs `:1787-1814`, `:1805-1806` | Efecto de stock correcto; **auditoría inexistente**: no se puede saber qué movimiento revirtió una venta | Empírico: 3 columnas de vínculo en NULL |
| 7 | **El orden de consumo de lotes difiere POS vs cloud** (H6) | `batch-costing.service.ts:33-46` vs `batch_dao.dart:6` | Costo del consumo, costo producido, COGS y margen divergentes para la misma operación. **Enmascarado por #3** | Código (ambos lados); ejercicio bloqueado por #3 |
| 8 | **El vencimiento se corre un día** | `production.service.ts:643`, `:655` vs `:409`, `:418`; columna `date` | Cambia el orden de consumo y las alertas de vencimiento | Empírico: `2026-12-31` → `2026-12-30` |
| 9 | **El umbral de auditoría forense no existe** (H7) | `inventory.module.ts:129-132`; único caller en `shrinkage.service.ts:252` | El requisito de alerta al administante ante ajuste > C$1,500 no opera. **Dos capas de falla** | Empírico: C$2,000 de ajuste → cero alertas |
| 10 | **El margen por plato no tiene superficie** (H8) | `cost-calculator.service.ts:128` (0 callers); `recipe_view_model.dart:411` (solo su test) | Capacidad terminada y desconectada: el dueño no puede ver rentabilidad por plato | Código + ausencia verificada en las vistas |
| 11 | **El BOM multi-nivel está muerto** (H5) | `bom-explosion.service.ts:44` (0 callers) | El roadmap lo declara "Cerrado"; en producción no se usa | Código: cero callers en el repositorio |

### P2 — menores, pero reales

| # | Brecha | Evidencia |
|---|---|---|
| 12 | El `payloadHash` del cliente es decorativo | `production.service.ts` calcula el suyo; el campo del DTO nunca se lee |
| 13 | Errores de validación **permanentes** marcados `retryable: true` | Respuesta de `/v1/sync/batch` con UUID inválido |
| 14 | `warehouseId`/`warehouseName` obligatorios sin efecto | `count-session.service.ts` no los lee |
| 15 | Etiqueta equivocada: la merma crea `alertType: 'HIGH_VALUE_COUNT_ADJUSTMENT'` | `shrinkage.service.ts:255` |
| 16 | El reporte de kardex no expone lote | `inventory-reports.dto.ts` sin `batch`/`lote` |
| 17 | El roadmap se contradice a sí mismo (6b/6c "Cerrado" y "No iniciado" en tablas distintas) | `docs/plans/inventory/inventory_roadmap.md`; el código sostiene "implementado" |
| 18 | El esquema local está 4 migraciones atrás de `main` y sin `uom_catalog` | `omnifood` en `1809640000000` |
| 19 | Los "e2e" de ruta mockean la guarda **y** el servicio | `test/sales/sync-batch.e2e-spec.ts`; `kardex-retrocalculation-e2e.spec.ts` usa `mockDataSource` |

---

## 5. Lo que funciona (verificado, no asumido)

Es importante decirlo con la misma precisión: **los mecanismos centrales están bien construidos.**

- **Compra atómica** con `SERIALIZABLE`, lock, binding RLS, identidad fiscal, kardex y lote para perecederos en una sola transacción.
- **FX BCN oficial**: fetch real por fecha exacta, caché, y **falla cerrado sin fallback** (cumple D2).
- **Corrección compensatoria de compra**: append-only con `compensation_for_kardex_id` correctamente seteado; rechaza una segunda corrección del mismo documento.
- **Versionado de recetas** con ciclo draft/publish y **guarda de tipo de producto** con mensaje accionable en español.
- **Prorrateo de merma técnica** correcto.
- **Descargue de venta por BOM al CPP vigente**, con snapshot de costo congelado por asiento.
- **Venta sin receta**: `APPLIED_NO_INVENTORY_IMPACT` explícito y con la línea señalada. El backend no miente.
- **Valorización exacta** contra la base.
- **COGS con guarda de cobertura honesta** (`UNAVAILABLE` en vez de un cero limpio).
- **Alertas de stock** operativas, con cantidad de reabastecimiento sugerida.
- **Conteo físico** correcto, con `source_document_id` bien seteado e **idempotencia por documento**.
- **Inmutabilidad real**: triggers de append-only y running-balance activos; **RLS `FORCE`** en las tablas del núcleo.
- **Idempotencia y secuencia** por stream con recibos append-only.

---

## 6. Causa raíz sistémica

Los cinco defectos P0 **no son cinco bugs independientes**. Cuatro de ellos comparten una sola forma:

| | Contrato en el código | Contrato real en Postgres | Dónde queda el test |
|---|---|---|---|
| #1 | `entryQuantity` = unidades de consumo | el payload trae unidades de compra | el mock alimenta el valor que el código espera |
| #3 | `expirationDate: Date` | columna `date` → **string** | el mock entrega un `Date` |
| #2 | `sourceDocumentId` omitido | **`NOT NULL` desde el día uno** | el mock no instala constraints |
| #6 | busca `reason: 'invoice:<id>'` | la fila guarda `source_document_id` | el mock devuelve la fila esperada |

**El contrato de TypeScript y el esquema real discrepan, y el mock se pone del lado del código.** Una suite completamente verde es compatible con un sistema que no puede escribir una sola merma, que no puede cerrar una producción y que distorsiona el costo de cada compra con conversión.

Además, dos brechas de diseño de producto cruzan todo el núcleo:
- **No hay un modelo único de sub-receta**: el dashboard la modela como producto `PREPARED` y la producción como insumo (`producedInsumoId`). H3 y buena parte de #3/#4 nacen de ahí.
- **El POS y el cloud no comparten los mismos números**: distinto CPP (T6-1), distinto orden de lotes (H6), distinta dimensión de lote (el POS muestra lotes, el reporte cloud no).

---

## 7. Por qué los 44 specs no lo vieron

| Patrón | Ejemplo |
|---|---|
| El spec mockea la capa que falla | `production.service.spec.ts:229,345,402` mockea `expiration_date: new Date()`; `batch-costing.service.spec.ts:16,23,56,63` arma candidatos con `expirationDate: new Date(...)` |
| El "e2e" de ruta mockea guarda y servicio | `test/sales/sync-batch.e2e-spec.ts` (`overrideGuard(SyncTransportGuard)` + `InvoicesService` mockeado) |
| El spec "e2e" es unitario por dentro | `kardex-retrocalculation-e2e.spec.ts` usa `mockDataSource` |
| El mock devuelve la fila que el código espera | `invoices.service.spec.ts:1955-1972`: `findOne.mockResolvedValue({id:'2001'})` |
| Cobertura real sí existe, pero en otro camino | `invoices.service.db.spec.ts` (8/8 verde) cubre nota de crédito, RLS, secuencias y `discount_origin`, pero **no** el descargue de venta normal ni el vínculo de `SALE_CANCEL` |

---

## 8. Orden de remediación propuesto

> **No es parchear cinco campos.** Parchear de a uno deja la misma suite verde y la misma clase de bug viva.

**Paso 1 — Paridad de contrato + evidencia real (habilita todo lo demás).**
- Auditar **cada `INSERT` a `inventory_kardex`** contra las columnas `NOT NULL` del esquema. El caso de la merma demuestra que el vecino de al lado puede estar bien: hay que ir sitio por sitio, no módulo por módulo.
- Alinear los tipos de fecha: una columna `date` no puede mapearse a `Date` sin transformer, o debe migrarse a `timestamptz`. Y unificar el tratamiento (hoy conviven `new Date(...)` y el string crudo en el mismo archivo).
- **Una prueba DB-level por endpoint de escritura del núcleo**, que afirme efectos observables (stock, CPP, asiento, vínculo) contra Postgres real. Con RLS `FORCE` y los triggers puestos, como el rig de esta verificación.

**Paso 2 — Desbloquear las dos operaciones imposibles, juntas.**
- #2 (merma) y #3 (producción) en el mismo lote, **con el test que fija el orden de consumo de lotes**, porque el fix de #3 expone H6 (#7). Si no, se cambia el costeo de producción en silencio.

**Paso 3 — Decisión de producto: el modelo único de sub-receta.**
#4 y #5, y buena parte de #3, se resuelven eligiendo: **o el tipo viaja y se valida en la frontera** (`ingredientType` + `componentUom` hasta `recipe_details`, con la columna que falta), **o el esquema deja de ser polimórfico**. Esto no es una decisión de código.

**Paso 4 — La conversión de unidades de punta a punta.**
#1: decidir dónde se convierte (que el POS envíe la cantidad base y el costo por unidad base, o que el backend divida por el factor) y **qué hacer con los asientos ya distorsionados** — recordando que el kardex es inmutable y la única salida es compensación.

**Paso 5 — El resto (P1/P2) en lotes revisables**, empezando por #9 (auditoría forense, que es requisito del PRD y de cumplimiento) y #10 (margen por plato, que es el valor de negocio más directo de todo este núcleo).

---

## 9. Límites de esta verificación

Lo que este documento **no** afirma:

- **La producción no se pudo medir end-to-end** (#3): el costo unitario derivado está verificado **por lectura de código**, no empíricamente. El camino queda bloqueado hasta el fix.
- **El POS no se ejecutó.** Las afirmaciones sobre el lado POS (H6 en `batch_dao.dart`, la conversión en `purchase_view_model.dart`, el payload en `sync_service.dart`) son **lectura de código**, no ejecución.
- **El estado de SOHO en producción no se verificó.** En la **copia local**, el tenant SOHO tiene 0 insumos, 0 recetas y 0 movimientos de kardex, lo que sugeriría que estos defectos **todavía no le costaron dinero al cliente**. **Falta confirmarlo contra Railway** antes de afirmarlo.
- **En este rig existe un artefacto creado con H1 vigente**: los asientos de `ZZ TEST Harina lb->kg VALIDO` y `ZZ TEST Harina lb-compra kg-consumo` quedaron con la cantidad distorsionada. Son datos de prueba, no hay nada que reparar.

---

## 10. Anexo: artefactos

| Artefacto | Ubicación |
|---|---|
| Especificación, hipótesis H1–H8, tareas T1–T9 y log L1–L15 | `odd/tasks/nucleo-inventario-verificacion.md` |
| Auditoría read-only previa (mapa de código) | Engram `inventory-core-truth-main` (obs. 10145) |
| Hallazgos confirmados en el rig | Engram `inventory-core-hallazgos-rig` (10147) |
| Por etapa | Engram `nucleo-inventario-verificacion/{t3-recetas, t4-produccion-bug, t5-venta, t6-costos-margenes, t7-perecederos, t8-mermas, t8-conteo, avance}` |
