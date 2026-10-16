# Núcleo de inventario — Verdad del flujo real (v2)

**Fecha:** 2026-10-15  
**Rama candidata:** `feat/inventory-count-session-persistence` @ `6e2ceb58` (90 commits sobre `origin/main` = `c95cfd86`)  
**Base verificada:** `omnifood_rig` (PostgreSQL 16 real, 137 migraciones, RLS `FORCE` en las 9 tablas del núcleo, triggers de inmutabilidad del kardex activos).  
**Backend:** vivo en `:3100` (`DB_DATABASE=omnifood_rig PORT=3100`).  
**Dashboard:** vivo en `:5174` desde el worktree (`VITE_API_URL=http://127.0.0.1:3100`), tenant `pilot-caf---pruebas.localhost`.  
**Navegador:** Chromium real vía Playwright live (`e2e/inventory-live.live.spec.ts` → **8/8 pasan**).  
**Documentos de trabajo:** `odd/tasks/nucleo-inventario-verificacion-pre-integracion.md` (verificación V1–V13) y `odd/tasks/nucleo-inventario-remediacion-pre-integracion.md` (remediación R1–R14).  
**Supera a:** `docs/audits/inventory-core-flow-truth-v1.md` (2026-08-27, `main@12a5336c`).

---

## 1. V1 vs V2 — De la radiografía al cierre sin deuda

La verificación v1 (`inventory-core-flow-truth-v1.md`) diagnosticó el estado del núcleo en agosto de 2026 y encontró que **los mecanismos estaban bien diseñados pero las fronteras rotas**, dejando el flujo de producción bloqueado con HTTP 500 y cinco defectos P0 sin resolver.

Esta corrida v2 responde a la instrucción del fundador del proyecto:

> *"Se cierra antes de integrar, no dejemos deudas tecnicas en el camino"*  
> *"Que esa valuación sea correcta y podamos garantizar un control de inventario y costos reales a nuestros clientes."*

La v2 no se limitó a medir: **remedió y midió en vivo cada brecha encontrada**, cerrando 14 tareas de remediación (R1–R14) con pruebas deterministas `RED → GREEN` y re-medición empírica en el rig contra base de datos real.

### Cuadro comparativo: los 10 puntos de la v1

| Eje / Hipótesis | Estado en la v1 (agosto 2026) | Estado en la v2 (octubre 2026) | Cierre |
|---|---|---|---|
| **H1** — Factor de conversión en la compra | ⛔ **CONFIRMADO ROTO**: 10 lb @ C$100 entraban como 10 kg @ C$100. Stock 2.2× inflado, CPP subestimado. | ✅ **CERRADO Y MEDIDO**: la compra convierte cantidad (`q × factor`) y costo (`c ÷ factor`) antes del cost calculator. Entran 4.5360 kg @ C$220.4586/kg. | `85ecae20`, R1 |
| **H2** — Guarda de conversión de UOM | ⛔ **CONFIRMADO ROTO**: `POST /insumos` con `lb→kg` factor 1 daba **201**. La guarda sólo la llamaba el seed. | ✅ **CERRADO Y MEDIDO**: `POST` y `PUT /insumos` rechazan con **400** (`Factor inválido...`). Tolerancia atada a la precisión `numeric(12,4)` (`1e-4`). | `9d52e0a4`, `c333178b`, R1 |
| **H3** — Receta descarta tipo y unidad | ⛔ **CONFIRMADO ROTO**: el form enviaba `SUB_RECIPE` y `componentUom`, el controller los descartaba y persistía `INSUMO` con `NULL`. | ✅ **CERRADO Y MEDIDO**: `recipe.controller` y `createNewVersion` persisten `ingredient_type`, `component_uom` y `reference_version_id`. Medido en API viva. | `87ff8836`, R6 |
| **H4** — Compensación de anulación | ⛔ **CONFIRMADO ROTO**: `compensation_for_kardex_id` siempre `NULL`. El camino vivo con `flowType` no enlazaba y el legacy consultaba un getter. | ✅ **CERRADO Y MEDIDO**: anulación enlazada a la venta (`cancel 54 -> sale 53`). Corregida la consulta a la columna real `sourceDocumentId`. | `32ed1184`, R2 |
| **H5** — Explosión multi-nivel | ⛔ **CONFIRMADO ROTO**: `explodeRecursive` tenía **cero llamadores productivos**. | ✅ **CERRADO Y MEDIDO**: `explodeWithSubRecipes` cableado en producción, merma y venta viva. 3 niveles probados en rig consumiendo 6 unidades hoja. | `e9948dc1` (R4), `56e3b022` (R11) |
| **H6** — FEFO: stock vs lotes | ⛔ **CONFIRMADO ROTO**: la venta descontaba `stock` pero **nunca tocaba `batches`**. Stock 32 vs lotes 60. | ✅ **CERRADO Y MEDIDO**: `SALE` descuenta lotes por FEFO con `drawBatchOutflow` y guarda traza; `SALE_CANCEL` restaura los mismos lotes con `restoreBatchInflow`. | `4e3429ac`, `3e8d6207`, R3 |
| **H7** — Alerta forense >C$1.500 | ⛔ **CONFIRMADO ROTO**: dispatcher no-op; el conteo ni siquiera chequeaba el umbral. Falso aviso al operador. | ✅ **CERRADO Y MEDIDO**: `ForensicAlertEmailDispatcher` despacha email real vía puerto hexagonal `EMAIL_PORT`; `CountSessionService` dispara la alerta en varianzas altas. | `ef67c042`, R7 |
| **H8** — Margen teórico por plato | ⛔ **CONFIRMADO ROTO**: `calculateRecipeTheoreticalCost` con **cero llamadores**. Dashboard sólo mostraba margen agregado. | ✅ **CERRADO Y MEDIDO**: `TheoreticalCostService` expone `/dish-margins` y `/theoretical-cost`. Superficie humana `/dish-margins` operativa en dashboard. | `f192dcfd`, `09c1df8b`, R8 |
| **T4-1** — Cierre de producción en perecedero | ⛔ **BLOQUEADO CON HTTP 500**: `TypeError: expirationDate.getTime is not a function`. | ✅ **CERRADO Y MEDIDO**: `calendar-day.ts` maneja ISO strings puros. Cierre real descuenta lote perecedero `10.0000 → 6.0000` con HTTP 200. | Medido V4, confirmado R4/R5 |
| **T4-2** — Corrimiento de fecha de vencimiento | ⛔ **BLOQUEADO**: `2026-12-31` se guardaba como `2026-12-30` por zona horaria. | ✅ **CERRADO Y MEDIDO**: `toCalendarDay` toma los 10 primeros caracteres sin conversión. Fechas idénticas en compras y producción. | Medido V2 y V4 |

---

## 2. El patrón descubierto: la capacidad huérfana

El hallazgo de mayor valor de esta auditoría no fue un bug aislado de cálculo, sino un **patrón arquitectónico recurrente**:

> **Una capacidad de dominio estaba correctamente implementada, cubierta por su propio spec unitario, y ningún camino productivo la invocaba.**

Las pruebas unitarias pasaban al 100% porque probaban la *función aislada*, mientras que el *cableado en el sistema real* estaba ausente. Se descubrieron y cerraron **8 apariciones exactas** de este patrón:

1. **H2 (Guarda UOM)**: `validateInsumoConversion` existía y estaba testeada; sólo la llamaba un script de seed. La ruta `POST /insumos` guardaba conversiones incoherentes en silencio. → *Cerrada en R1 (`9d52e0a4`).*
2. **H5 (Multi-nivel)**: `explodeRecursive` tenía detección de ciclos y profundidad; la venta, producción y merma usaban `explode()` plano de 1 nivel. → *Cerrada en R4 (`e9948dc1`).*
3. **H4 (Compensación)**: `resolveCompensatedMovementId` existía en código legacy; el camino con `flowType` (usado por el POS moderno) no lo llamaba, y cuando se llamó, falló porque consultaba un getter (`reason`) en lugar de la columna (`sourceDocumentId`). → *Cerrada en R2 (`32ed1184`).*
4. **H6 (Lotes en venta)**: `drawBatchOutflow` existía para mermas; el flujo de ventas lo salteaba por completo. → *Cerrada en R3 (`3e8d6207`).*
5. **V4-3 (CPP de producción)**: `applyProductionMovement` reescribía el promedio histórico sin recalcularlo, dejando el producto terminado con costo cero en los reportes de valuación. → *Cerrada en R5 (`1ede60e2`).*
6. **H7 (Dispatcher forense)**: `FORENSIC_ALERT_DISPATCHER` estaba inyectado como un stub vacío `() => Promise.resolve()`, y el conteo no llamaba al evaluador de umbral. → *Cerrada en R7 (`ef67c042`).*
7. **R12 / R-01 (Costo o mercado)**: `InventoryValuationService` tenía implementado el castigo por mercado y su `.db.spec` lo probaba; ninguna ruta HTTP permitía fijar precio de mercado ni disparar el asiento compensatorio. → *Cerrada en R12 (`54ff635e`).*
8. **H8 (Costo teórico)**: `calculateRecipeTheoreticalCost` existía en el calculador; cero rutas y cero componentes de UI lo mostraban. → *Cerrada en R8 (`f192dcfd`, `09c1df8b`).*

---

## 3. Matriz de los 12 ejes: evidencia de medición

Cada celda de la matriz de escenarios definida en `nucleo-inventario-verificacion-pre-integracion.md` fue probada empíricamente contra el backend vivo y Postgres real:

| Eje | Caso | Resultado en V2 | Evidencia de medición |
|---|---|---|---|
| **Unidad de compra vs consumo** | Misma UOM (factor 1) | ✅ CORRECTO | Insumo UND→UND opera con factor 1. |
| | UOM distintas con factor 1 | ✅ RECHAZA (400) | `POST /insumos` con `lb→kg, factor:1` rechaza con `Factor inválido... el catálogo establece 0.45359237`. |
| | Factor ≠ 1 (lb → kg) | ✅ CONVIERTE | Compra 10 lb @ C$100 entra a stock como 4.5360 kg @ C$220.4586/kg. |
| | Corrección de compra | ✅ SEPARA UOM | Corrección genera documento por -10 lb (factura) y movimiento por -4.5360 kg (consumo). |
| **Moneda y FX** | Moneda local (NIO) | ✅ CORRECTO | Entradas directas en C$ sin conversión. |
| | USD oficial BCN por fecha | ✅ CORRECTO | 100 USD al 2026-10-01 entra a CPP 366.2430 (tasa BCN 36.6243). |
| | USD fecha sin tasa oficial | ✅ FALLA CERRADO | Fecha `2099-01-01` devuelve 404 explícito sin inventar tasas. |
| **Impuesto (IVA)** | Costo sin IVA (neto) | ✅ ACEPTADO | Insumo con tasa 15% acepta `costIncludesIva=false` y valúa a costo neto. |
| | Costo con IVA declarado | ✅ RECHAZA (400) | Insumo con tasa 15% rechaza `costIncludesIva=true` con fórmula de desagregado (NIC 2). |
| | Costo con IVA sin declarar | ✅ RECHAZA (400) | Insumo con tasa 15% rechaza compra sin declaración (fail-closed). |
| | Insumo exento / sin tasa | ✅ INERTE | Insumo sin tasa declarada acepta compra sin exigir declaración de IVA. |
| **Componente de receta** | INSUMO simple | ✅ CORRECTO | Venta y producción descuentan insumos base. |
| | SUB_RECIPE (1 nivel) | ✅ CORRECTO | Venta viva y producción resuelven componentes intermedios. |
| | SUB_RECIPE (3 niveles) | ✅ CONVIERTE | Producción de padre (1) × SubA (2) × SubB (3) descuenta 6 unidades del insumo hoja. |
| | Ciclo circular (A → B → A) | ✅ RECHAZA (400) | `POST /recipes/products/:id/versions` rechaza ciclo al CREAR antes de persistir. |
| **Tipo de producto** | SIMPLE | ✅ `noImpact` | Respeta el catálogo de SOHO sin tocar inventario de forma forzada. |
| | COMPOUND con receta | ✅ DESCARGA | Venta viva descuenta insumos de la receta publicada activa. |
| | PREPARED (producción) | ✅ PRODUCE | Cierre de orden crea insumo producido y descuenta componentes. |
| **Perecederos y FEFO** | Con vencimiento | ✅ EXACTO | Lotes guardan día calendario exacto sin corrimiento de zona horaria. |
| | Descuento de lotes en venta | ✅ FEFO CON TRAZA | Venta descuenta del lote más próximo a vencer y registra en `batch_outflow_traces`. |
| | Anulación restaura lote | ✅ EXACTO | `SALE_CANCEL` lee la traza y repone existencias en el lote exacto original. |
| | Invariante stock == lotes | ✅ SOSTENIDO | `insumos.stock == SUM(batches.remaining_stock)` comprobado antes y después de venta. |
| **Producción** | Lote perecedero | ✅ CONSUME | Cierre consume lote perecedero origen sin error de fecha. |
| | CPP de insumo producido | ✅ VALÚA | Producido entra al CPP con su costo unitario de producción (de 0 pasa a C$100). |
| | Secuencia monotónica | ✅ RIGUROSA | Replay de órdenes exige continuidad de `sourceSequence` por terminal. |
| **Venta y descargue** | Descargue normal | ✅ APLICA | Venta descuenta stock de insumos según componentes. |
| | Anulación con compensación | ✅ ENLAZADA | Asiento de cancelación lleva `compensation_for_kardex_id` apuntando a la venta. |
| **Valuación** | Menor entre costo o mercado | ✅ REGLADO | `POST /valuation/market-price` fija referencia; `POST /valuation/writedown` aplica castigo `VALUATION_WRITEDOWN` (quantity 0, costo negativo). |
| | Idempotencia de castigo | ✅ IDEMPOTENTE | Repetir el cierre de valuación para la misma fecha saltea los insumos ya ajustados. |
| **Mermas y conteo** | Umbral forense (>C$1.500) | ✅ NOTIFICA | Merma o ajuste de conteo >C$1.500 genera alerta en `forensic_alerts` y despacha email vía `EMAIL_PORT`. |
| | Conteo físico persistido | ✅ ENLAZADO | `count_sessions` y `count_session_entries` guardan líneas con actor y fecha; kardex enlazado. |
| | Lista firmable DGI | ✅ PDF BINARIO | `GET .../printable-list` entrega stream binario `%PDF-1.3` (1 página lista para firmar). |
| **Camino** | Formulario Dashboard | ✅ 8/8 LIVE | Playwright live sobre navegador real cubre insumos, compras, productos y márgenes. |
| | API viva / POS sync | ✅ VALIDADO | Rutas de sync por credencial de dispositivo probadas en rig. |
| **Aislamiento** | RLS `FORCE` dos tenants | ✅ HERMÉTICO | Tenant B arranca en 0; B crea insumos que A no ve; reportes de B no suman datos de A. |

---

## 4. Detalle de las remediaciones ejecutadas (R1–R14)

### R1 — UOM: Validación en catálogo y conversión en compra
- **Problema:** Un insumo `lb→kg` con factor 1 entraba con 201; la compra de 10 lb entraba como 10 kg a C$100, inflando el stock 2.2× y subestimando el costo.
- **Solución:**
  1. `InsumoController` invoca `validateInsumoConversion` al crear y al editar campos de UOM. Mapea a 400.
  2. La tolerancia del ancla universal se sincronizó con `numeric(12,4)` (`1e-4` en `uom-catalog.ts`).
  3. `InventoryPurchaseService.buildPreview` convierte `entryQuantity = q × factor` y `entryUnitCost = c ÷ factor`. El `PurchaseDocument` queda en unidades de factura; el movimiento de kardex y el lote entran en unidades de consumo.
- **Commits:** `9d52e0a4`, `85ecae20`, `c333178b`, `94ef3045`.

### R2 — Venta: Compensación de anulación enlazada
- **Problema:** En el flujo vivo con `flowType`, la anulación dejaba `compensation_for_kardex_id` en NULL; además, `resolveCompensatedMovementId` filtraba por `reason`, que era un getter y hacía fallar la consulta de TypeORM.
- **Solución:** Se corrigió la consulta para filtrar por la columna real `sourceDocumentId: "invoice:" + invoiceId` y se asignó el ID resultante en `appendV1Movement`.
- **Commits:** `32ed1184`, `a7ab1be0`.

### R3 — Venta y anulación: Descuento de lotes con traza
- **Problema:** La venta no tocaba los saldos de los lotes; el stock y la suma de lotes divergían permanentemente. Al anular, no había forma de saber qué lote devolver.
- **Solución:**
  1. Se creó la tabla tenant-scoped `batch_outflow_traces` (migración `1810010000000`, RLS `direct:SI`).
  2. `drawBatchOutflow` guarda en la traza qué lote y cuánto consumió cada venta por FEFO.
  3. Nueva función `restoreBatchInflow` lee la traza de la venta compensada y restituye el stock a los mismos lotes exactos.
- **Commits:** `4e3429ac`, `3e8d6207`, `8349ea11`.

### R4 & R11 — Recetas: Explosión multi-nivel completa
- **Problema:** `explodeRecursive` no tenía llamadores. Las rutas usaban `explode()` de 1 nivel. Además, en la venta viva, `classifyLegacySyncTime` tiraba 400 al encontrar un `SUB_RECIPE` porque buscaba el ID en la tabla de insumos.
- **Solución:**
  1. `BomExplosionService.explodeWithSubRecipes` orquesta la recursión resolviendo la receta publicada activa de cada sub-receta.
  2. Se ramificó en producción, merma y venta legacy para no afectar recetas de un solo nivel.
  3. Se inyectó `BomExplosionService` en `SaleInventoryOutcomeService` para que la venta viva arme bindings contra los insumos hoja finales.
- **Commits:** `e9948dc1` (R4), `56e3b022` (R11).

### R5 — Producción: Costo promedio del insumo producido
- **Problema:** Al cerrar una orden de producción, el insumo producido recibía el stock pero su `costo_promedio_nio` quedaba en 0.0000. Los reportes de valuación lo tasaban en cero.
- **Solución:** `applyProductionMovement` recalcula el promedio ponderado cuando `quantity > 0` (entrada de producción): `(prevStock * prevCpp + qty * unitCost) / newStock`. Las salidas dejan el promedio intacto.
- **Commits:** `1ede60e2`, `38be1cd9`.

### R6 — Recetas: Persistencia de tipo, unidad y referencia
- **Problema:** `RecipeForm` enviaba `ingredientType`, `componentUom` y `referenceVersionId`, pero `recipe.controller` los descartaba y `createNewVersion` los guardaba como `INSUMO`, `NULL`, `NULL`.
- **Solución:** Se extendió `RecipeComponentInput` y se persistieron los campos en `recipe_details`.
- **Commits:** `87ff8836`, `92b950d5`.

### R7 — Mermas y conteo: Notificación real de alertas forenses
- **Problema:** El dispatcher de alertas >C$1.500 era un stub vacío, engañando al operador con un mensaje que decía que el admin había sido notificado. El conteo físico no evaluaba el umbral.
- **Solución:** Se implementó `ForensicAlertEmailDispatcher` sobre el puerto hexagonal `EMAIL_PORT` (consola/Resend) y se cableó el chequeo de umbral en `CountSessionService`.
- **Commits:** `ef67c042`, `141d4248`.

### R8 — Superficies humanas: Costo teórico y margen por plato
- **Problema:** `calculateRecipeTheoreticalCost` no tenía consumidores. El dashboard no tenía vista de márgenes por plato.
- **Solución:**
  1. Backend: `TheoreticalCostService` expone `GET /inventory/reports/dish-margins` y `GET /inventory/reports/theoretical-cost`.
  2. Frontend: Nueva página `/dish-margins` en el dashboard con tabla de costo, precio, margen bruto y % por plato, más listado de recetas no valuadas con su causa.
- **Commits:** `f192dcfd` (backend), `09c1df8b` (UI).

### R9 — IVA: Carga neta garantizada por el sistema
- **Problema:** No existía tratamiento de IVA en inventario; cargar costo bruto sobrevalúa 15% las existencias (NIC 2).
- **Solución (decisión del fundador):**
  1. Migración `1810020000000` agrega `iva_rate_pct numeric(7,4)` a `insumos`.
  2. `recordPurchase` exige declaración `costIncludesIva`. Si el insumo declara IVA: sin declaración → 400; con IVA → 400 (con la fórmula de desagregado); costo neto → 201 aceptado.
  3. Frontend: en compras, si el insumo tiene IVA, aparece caja de advertencia y deshabilita el submit ante costo con IVA.
- **Commits:** `484be56e` (backend), `d26e5edf` + `6e2ceb58` (UI + e2e live).

### R10 — Corrección de compras: Separación de unidades
- **Problema:** `correctPurchase` usaba la cantidad del movimiento (consumo) para el documento de corrección, mezclando unidades de factura con costos unitarios de compra.
- **Solución:** El documento de corrección toma `-originalDocument.quantity` (unidad de factura) y el movimiento compensatorio toma `-originalMovement.quantity` (unidad de consumo).
- **Commits:** `ef3d1e00`, `a1b47b9b`.

### R12 — Valuación: Menor entre costo y mercado (R-01 / Ley 822)
- **Problema:** La capacidad de castigo a valor de mercado no tenía endpoints HTTP; la norma fiscal no era alcanzable.
- **Solución:** Se expusieron las rutas `POST /inventory/reports/valuation/market-price` y `POST /inventory/reports/valuation/writedown`. Probado en rig: insumo de C$350 baja a C$300, genera asiento `VALUATION_WRITEDOWN` por -C$300 y es estrictamente idempotente.
- **Commits:** `54ff635e`, `6ff34e0b`.

### R13 — Conteo físico: Lista firmable en PDF binario
- **Problema:** `GET .../printable-list` devolvía un `Buffer` con passthrough `@Res`, serializándolo a JSON (`{"type":"Buffer","data":[...]}`).
- **Solución:** Se cambió el retorno a `StreamableFile` con headers `application/pdf` y `inline; filename=...`. Probado en wire: entrega documento binario `%PDF-1.3` de 1 página.
- **Commit:** `7d2946ab`.

### R14 — Recetas: Detección de ciclos al crear
- **Problema:** La guarda de dependencia circular sólo existía en la ingestión POS; el formulario web permitía persistir ciclos A ↔ B, fallando recién al intentar consumir.
- **Solución:** `createNewVersion` ejecuta `assertNoCircularDependency` antes de guardar cualquier versión. Probado en rig: rechaza auto-referencia A → A y ciclo cruzado B → A con 400.
- **Commit:** `8ef3a78a`.

---

## 5. Receta verificada para réplica del entorno de pruebas

Para reproducir estas verificaciones en cualquier sesión o máquina de desarrollo:

```bash
# 1. Base de datos del rig (PostgreSQL)
# Aplicar migraciones completas hasta la 1810020000000
DB_DATABASE=omnifood_rig npm run migration:run:prod

# 2. Backend NestJS (puerto 3100, apuntando al rig, con CORS del tenant)
cd .worktrees/r19-count-session/apps/admin_backend
DB_DATABASE=omnifood_rig PORT=3100 \
CORS_ALLOWED_ORIGINS="http://pilot-caf---pruebas.localhost:5174" \
node dist/main.js

# 3. Dashboard Vite (puerto 5174, ejecutado DESDE EL WORKTREE)
cd .worktrees/r19-count-session/apps/owner_dashboard
VITE_API_URL=http://127.0.0.1:3100 npm run dev -- --port 5174 --strictPort

# 4. Suite Playwright live contra el rig (8 tests completos)
cd .worktrees/r19-count-session/apps/owner_dashboard
NHILOS_LIVE_E2E=1 \
NHILOS_LIVE_BASE=http://pilot-caf---pruebas.localhost:5174 \
NHILOS_LIVE_API=http://127.0.0.1:3100 \
npx playwright test -c playwright.live.config.ts inventory-live
```

### Verdades de entorno documentadas:
1. **El slug del tenant proviene del primer subdominio**: `NHILOS_LIVE_BASE` debe ser `http://pilot-caf---pruebas.localhost:5174`. Usar `localhost` a secas hace fallar la resolución de tenant y no muestra el login.
2. **CORS estricto en el backend**: Si el origen del frontend no está exactamente en `CORS_ALLOWED_ORIGINS`, el preflight `OPTIONS` responde pero el navegador nunca emite el `POST` (login mudo).
3. **Catálogo de UOM por tenant**: El formulario de insumo lee `catalog_values` del tenant (`GET /catalogs/UOM`), no la tabla global `uom_catalog`. El tenant debe tener sus unidades sembradas para habilitar los selects.
4. **Throttle de login en memoria**: El endpoint `/identity/login` tiene límite de 5 intentos por IP por minuto. Las suites e2e deben compartir una sesión autenticada (`beforeAll`) en lugar de loguear por cada prueba individual.

---

## 6. Estado final y veredicto de pre-integración

- **Suites backend:** 358 suites pasadas, **4,239 tests unitarios e integración en verde** (0 fallos).
- **Suites live dashboard:** **8 de 8 pruebas e2e en navegador real pasando** (13.6s).
- **Cumplimiento normativo:**
  - `R-01` (Menor entre costo o mercado): **CABLEADO Y MEDIDO** (R12).
  - `R-05` / `R-06` (Listas físicas firmadas por hoja): **BINARIO PDF ENTREGADO** (R13).
  - `NIC 2` (Exclusión de IVA recuperable del costo): **GUARDA Y DECLARACIÓN EN FORMA Y API** (R9).
  - `DGI 09-2007` (Disciplina de identidad y RUC no borrable): **VERIFICADO EN RIG** (V12).
- **Deuda técnica:** **CERO**. Ningún hallazgo medido quedó diferido o declarado como deuda tolerable.

**Veredicto:** El candidato de integración `feat/inventory-count-session-persistence` (@ `6e2ceb58`) **está listo para merge a `main`** y para empaquetarse en el próximo release del POS, con la garantía empírica de que el núcleo de inventario, valuación y costos funciona de acuerdo a la ley y a los requerimientos de negocio de OmniFood NI.
