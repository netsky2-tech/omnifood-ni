# Dashboard V2 — Review Round 2 (owner acceptance feedback)

Status: IN PROGRESS · Branch: `fix/dashboard-v2-review-round-2` · Base: main @ 47af5452
Basis: owner screenshot review + my own regime audit. 8 owner items + 4 self-identified gaps.

## Resolved product decisions (binding, from the user)

1. **#4 Attention Required = exceptions only.** The authoritative PRD is **not** changed.
   AC-11 reads `Given hasGaps = true` — it is conditional and already only mandates the row
   when there is a gap. §19 defines the panel as "actionable exceptions". The code comment
   citing "AC-11 requires the healthy Info row" is a misreading and must be corrected.
   - `hasGaps = true` → show the Secuencia fiscal row. `hasGaps = false` → show nothing.
   - audit `criticalCount > 0 || warningCount > 0` → show. info-only → show nothing.
   - zero exceptions → **hide the whole panel** (no "todo bien" card); the reclaimed space is
     more valuable to the owner and keeps the panel's signal strong.
   - Fix secondary wireframe/spec surfaces that render `✓ Secuencia sin gaps` or a healthy
     audit row (`ui_wireframe_reference.md` §1 line 32, delta table row 3), because that
     representation contradicts §19 — not AC-11.
2. **#3 `inventoryCoverage` contract on `GET /inventory/reports/cogs`.** Coverage is NOT
   freshness and NOT "the endpoint answered". Freshness asks "did the cloud receive everything";
   coverage asks "can we establish a cost for every relevant sale in the period". A tenant can
   be freshness COMPLETE and coverage PARTIAL (e.g. `APPLIED_NO_INVENTORY_IMPACT` or no cost basis).
   - Shape: `{ status: 'COMPLETE'|'PARTIAL'|'UNAVAILABLE', costedSalesCount, uncostedSalesCount, reasonCodes? }`
   - `reasonCodes`: `MISSING_INVENTORY_IMPACT`, `MISSING_COST_BASIS`, `UNRESOLVED_SOURCE_DOCUMENT`, `INCOMPLETE_SYNC`
   - Never infer coverage from `salesCogsNio`. `salesCogsNio` stays the financial value;
     `inventoryCoverage` is the trust evidence. Two different concepts.
   - Frontend: COMPLETE + COGS 0 → margin renders, even 100%. PARTIAL → `—` + "Costos incompletos".
     UNAVAILABLE → `—` + "Costo de ventas no disponible". Never turn PARTIAL/UNAVAILABLE into zero.
3. **#6 Rentabilidad Operativa renders only with the cost grant** (`inventory:cost_view` / OWNER,
   the existing AC-17 gate). The grid **reflows naturally** into the freed space; we never invent
   a KPI to fill a card.

## Ratified late decisions (round 2b — after WU2/WU6 landed)

Discovered while verifying WU2's coverage asymmetry report, and confirmed in code rather than assumed:
`SalesReportingInvoiceRow` (`sales-reporting-semantics.ts:35-49`) **carries no `type` field at all**, so the
reporting semantics module has never been able to distinguish a credit note from a sale. That omission is
the common root of three defects:

1. `isCompletedSaleRow` is only `!row.isCanceled`, so a credit note increments `completedTicketCount`
   and sits in the Average Ticket denominator. `sales-reporting-semantics.spec.ts:142` pins this as
   intended: 1 sale of 2000 + 1 credit note of -500 → `netSalesNio 1500`, `completedTicketCount 2`,
   `averageTicketNetNio 750`. Netting the **amounts** is correct and stays; counting the refund
   document as a **customer ticket** is not. Live KPI the owner reads as a real sales count, so it is
   fixed in this round rather than filed as a separate issue.
2. Coverage filters `inv.type = 'regular'` (`inventory-reports.service.ts:178`) while sales totals filter
   only `isCanceled: false`. Two definitions of "a sale" in one panel.
3. `APPLIED_NO_INVENTORY_IMPACT` / `NO_EXPLICIT_INSUMO_MAPPING` was credited as an authoritative zero cost.

**Ratified semantics (owner, verbatim intent).** No single generic `isRelevantSale` — a shared predicate
would create a false equivalence between revenue, ticket count and cost evidence. Three named predicates:
- `isRevenueAffectingDocument(invoice)` — a credit note participates, with its persisted sign.
- `isCompletedTicketDocument(invoice)` — a credit note does **not** count, and never enters the
  Average Ticket denominator.
- `isCogsCoverageRelevantSale(invoice)` — sales whose direct cost NHILOS must be able to prove; NOT
  "every document that affects revenue".

Required fixture: 2 regular sales of C$100 + 1 credit note of -C$50 → Net Sales C$150, Completed Tickets 2,
Average Ticket C$75. Document the asymmetry deliberately and add contract tests so it cannot be
re-unified by accident.

**Coverage flip (ratified).** `NO_EXPLICIT_INSUMO_MAPPING` degrades coverage — absence of a mapping is not
evidence of zero cost. It becomes its own reason code and increments `uncostedSalesCount`.
- COMPLETE only when every coverage-relevant sale has an authoritative cost.
- PARTIAL = mix of costed and uncosted. UNAVAILABLE = no relevant sale can be costed.
- A future legitimate zero-cost product requires an **explicit** domain declaration
  (`inventoryTracking = NONE` / `costingMode = NONE` or approved equivalent). Never derive "non-stock"
  from the absence of a mapping. Until that distinction exists, PARTIAL is preferred over publishing a
  false margin.

## Verified findings (exploration evidence)

| # | Finding | Evidence |
|---|---|---|
| G1 | `Resumen de Ventas` renders `Impuestos`/`Ventas Netas Gravables` statically → `Impuestos C$0.00` forever for Cuota Fija (backend rate is literally 0.0) | `dashboard-page.tsx:141-150`, `fiscal-setup.service.ts:47` |
| G2 | `Régimen fiscal: …` context label never rendered (owner PRD §FR-FISCAL-03, wireframe §1 row 1) | `grep "Régimen fiscal"` → 0 hits |
| G3 | `CARD_GRID` fixed 4 cols → 5th IVA card wraps alone; 3-card MANAGER/Cuota-Fija strip leaves a hole (FR-KPI-05 "no layout hole") | `kpi-strip.tsx:124` |
| G4 | `isFiscalPending` exposed but unconsumed → Régimen General paints 4 cards then jumps to 5 | `use-dashboard-kpis.ts:121` |
| 2 | Top Products share denominator is the **listed sum**, not period Net Sales. The copy admits it. | `chart-domain.ts:203,209`; `top-products-chart.tsx:77` |
| 3 | Margin is 100% whenever COGS responds 0 — no data/unavailable distinction exists on the wire today | `use-dashboard-kpis.ts:101`, `kpi-deltas.ts:29` |
| 7 | Backend **already** nets `changeGiven` server-side; a 137/200/63 test exists. Missing: the owner's exact 200/500/300 case. | `sales-reports.service.ts:146-149`, `...service.spec.ts:478` |
| tips | **Premise outdated.** Tips do persist: checkout snapshot → sync DTO → invoice columns → report aggregate. Absent widget is correct data-driven behaviour (`tipCoverage.recordedInvoicesCount > 0`), not a dead feature. | `sale_view_model.dart:1247`, `sync-invoice.dto.ts:386`, `invoice.entity.ts:150`, `sales-reports.service.ts:205` |

## Dispatch state (2026-09-26)

Running in parallel — five file-disjoint surfaces, single writer each:

| Unit | Task id | Surfaces |
|---|---|---|
| WU2 backend coverage | `muj1i8uq-b-aks4` | `inventory-reports.dto.ts`, `inventory-reports.service.ts` + spec |
| WU4 attention exceptions | `muj1ir6p-c-hikv` | `use-attention-signals.ts`, `attention-band.tsx`, attention spec, wireframe |
| WU6 top-products share | `muj1jxob-d-vl8u` | `sales-reports.dto.ts`, `sales-reports.service.ts` + spec, `chart-domain.ts`, `top-products-chart.tsx`, `sales/types.ts`, charts spec |
| WU8 freshness date | `muj1kgi6-e-bls4` | `freshness-badge.tsx`, freshness spec, `dashboard-api.ts` |
| WU1 strip layout | `muj1lmch-f-6tpw` | `kpi-strip.tsx`, `use-dashboard-kpis.ts`, `dashboard-page.tsx`, strip spec |

Deferred, serialized on purpose:
- **WU7** waits for WU6 — both edit `sales-reports.service.spec.ts`; running them together would be a concurrent write on one file.
- **WU3** waits for WU2 (needs the shipped coverage contract) and WU1 (both touch `kpi-strip.tsx`/`use-dashboard-kpis.ts`).
- **WU5** waits for WU3 (Rentabilidad Operativa consumes the gated margin) and WU1 (both touch `dashboard-page.tsx`).
- **WU9** last — shares `chart-domain.ts` with WU6 and `dashboard-page.tsx` with WU1/WU5.

Added by the round 2b decisions:
- **WU10** three named predicates in `sales-reporting-semantics.ts` + carry `type` into the row + ticket
  fixture + contract tests. Must NOT edit `sales-reports.service.spec.ts` (WU7 owns it) — report needed
  changes there instead.
- **WU11** coverage flip to `NO_EXPLICIT_INSUMO_MAPPING` → uncosted, built on WU10's
  `isCogsCoverageRelevantSale`. Depends on WU10; owns `inventory-reports.service.ts`.
- WU3 additionally waits on WU11, so its copy can name PARTIAL/UNAVAILABLE reasons the backend can
  actually emit.

## Work units (ordered; A batch is file-disjoint and runs in parallel)

- **WU1 (A)** Strip layout + regime context + fiscal pending — `kpi-strip.tsx`, `use-dashboard-kpis.ts`, `dashboard-page.tsx`, `dashboard-v2-strip.spec.tsx`
- **WU2 (A)** Backend `inventoryCoverage` — `inventory-reports.dto.ts`, `inventory-reports.service.ts`, its spec
- **WU3 (B, needs WU2)** Frontend margin coverage gate — `inventory-api.ts`, `use-dashboard-kpis.ts`, `kpi-deltas.ts`, `kpi-strip.tsx`
- **WU4 (A)** Attention exceptions-only + scope chips — `use-attention-signals.ts`, `attention-band.tsx`, `dashboard-v2-attention.spec.tsx`, `ui_wireframe_reference.md`
- **WU5 (C, needs WU3)** Rentabilidad Operativa replaces Resumen de Ventas — `dashboard-page.tsx`, `dashboard.test.tsx`, `w2-sales.test.tsx`
- **WU6 (A)** Top Products share denominator — `chart-domain.ts`, `top-products-chart.tsx`, `performance-band.tsx`, charts spec
- **WU7 (A)** Backend regression tests (payment over-tender 200/500/300 + top-products netRevenueNio not item.total) — `sales-reports.service.spec.ts`
- **WU8 (A)** Freshness watermark date + unified caption — `freshness-badge.tsx`, freshness spec
- **WU9 (A)** Presentation polish — Y-axis `C$`, `-C$0.00` → `C$0.00`, drop redundant Periodo footer

## Corrections to the owner's premises (evidence, not opinion)

- **#7 Payment Mix**: the over-tender defect is already fixed server-side and already tested. `sales-reports.service.ts:146-149` nets `changeGiven`, and `sales-reports.service.spec.ts:478` proves it with a 137/200/63 fixture. What is genuinely missing is the owner's exact 200/500/300 case, so WU7 adds that rather than re-fixing a closed defect.
- **#3 delayed sync**: the ingestion-time attribution is already corrected and already tested. All four invoice→inventory sites (`invoices.service.ts:1655, 1743, 1978, 2479`) stamp `new Date(invoice.createdAt)` under an explicit AG-02 comment, and `invoices.service.spec.ts:1052` asserts it with a `businessCreatedAt` that differs from wall-clock now. The `new Date()` at `sale-inventory-remediation.service.ts:275` is an AuditLog row, not a movement. So the live half of #3 is the coverage contract, not the timestamp path.
- **Tips**: the premise that tips are display-only and discarded at checkout is outdated — tips persist end to end (`sale_view_model.dart:1247` snapshot at checkout → `sync-invoice.dto.ts:386` → `invoice.entity.ts:150` → `sales-reports.service.ts:205`). They intentionally never reach `Payment`: PRD §21.3 puts them outside the sales total. The widget is absent because `isTipsSummaryApplicable` is data-driven on `tipCoverage.recordedInvoicesCount > 0`, and no QSR/Restaurant profile field exists on `Tenant` to gate it. Nothing to fix here; the fixture simply has no tipped invoices in the period.

## Closed (verified by the parent, not only by the writer's report)

- **WU8 freshness** — `npx vitest run src/__tests__/dashboard-v2-freshness.spec.tsx` → 23/23. Parent read `freshness-badge.tsx` directly: conditional same-Managua-day compact form vs `d mmm, h:mm a.` full form, single shared `TIME_ZONE`, injectable `now`, `"(CST)"` removed. Backend finding that reframed the item: staleness is **unbounded** (state only compares watermark age to `thresholdMinutes`), so a store closed for days yields STALE with a days-old watermark — the missing date was guaranteed to mislead precisely in the scenario the widget exists to warn about.
- **WU6 top products share** — charts spec 34/34. Parent independently confirmed the reconciliation holds by construction rather than by fixture luck: `salesRowNetSales(row)` is `round2(subtotal)` per invoice, and `allocateInvoiceLineNetSales` distributes that same subtotal across lines over the same `isCanceled = false` bounded set, so Σ numerators === denominator.
- **WU4 attention exceptions-only** — attention spec 15/15; authoritative PRD confirmed untouched by `git diff`.
- **WU2 backend `inventoryCoverage`** — 375 tests / 41 suites. Coverage is a *fact about sales*, not about money: never derived from `salesCogsNio`.
- **WU10 three named predicates** — reporting suite 68/68; sales+inventory 767/70 suites. Parent independently confirmed the two claims that made this real: (a) the **previous** daily-series parity test was **vacuous** — its credit-note fixture row had no `type` field, so it behaved as a regular sale (verified against `git show HEAD`); now a *typed* credit note must actually change the series; (b) average ticket corrected to **1500** (1500/1), not 2000 — the worker escalated the parent's arithmetic error instead of silently editing the expectation. PRD §7.5 formula confirmed from the authoritative doc, and `Invoice.type` verified to be a plain column (no `select: false`) loaded by all three producers.
- **WU7 backend regression pinning** — 33/33, `+373` insertions with **zero deletions** in `sales-reports.service.spec.ts` (verified: only assertions added, production untouched). Owner's literal 200/500/300 fixture → `cashNio === 200` with `not.toBe(500)` guards, USD analogue, and `netRevenueNio ≠ totalRevenue` proven by a fixture where net (450/350) differs from tax-inclusive (510/410) *by construction*. Honest reporting: declared **no RED run** (pinning already-correct behaviour, production out of its surfaces) and **refused to invent** a defect for the cross-currency change case (USD tender with NIO change leaves `cashUsd` at full tender *by design* — the till keeps USD and pays out NIO).
- **WU11 coverage policy flip** — 378/41 suites, `tsc` clean outside the pre-existing base failure. `APPLIED_NO_INVENTORY_IMPACT` / `NO_EXPLICIT_INSUMO_MAPPING` is now **uncosted** (absence of a mapping is not evidence of zero cost); the ad-hoc SQL `inv.type = 'regular'` filter was replaced by the shared `isCogsCoverageRelevantSale`. Parent verified the risk: `salesInvoices` is consumed **only** by the coverage block while money aggregation iterates `movements` alone, so widening that read cannot contaminate `totalCogsNio` / `salesCogsNio` / `shrinkageCogsNio` / `items`.
  **Blast radius (owner-signed consequence):** fully mapped menu → `COMPLETE` (unchanged); any unmapped SIMPLE product → **`PARTIAL` → the dashboard stops showing Margen Bruto for that tenant until insumos are mapped**; 100% unmapped SIMPLE → `UNAVAILABLE`. `SIMPLE` is the `Product` entity default and onboarding templates classify recipe-less rows as `SIMPLE`, so unmapped products are structurally the most common shape. **The hidden-margin path is now the common path**, which is why WU3 was briefed to treat the "Sin costo" copy as the primary surface, not an edge case. Repo could not quantify prevalence (no seed sets `product_type` or insumo mappings) — reported as circumstantial rather than inflated into a number.
- **WU1 strip layout / regime / flash** — G2 regime label from the backend profile only, G4 consumes the previously-dead `isFiscalPending`, G3 grid reflow. **G3 was re-fixed by the parent after receiving it:** the worker used `repeat(auto-fit, minmax(10rem,1fr))` and flagged in its own `risks` that 5 tiles still wrapped 4+1 at `lg`. Checked the arithmetic against the real layout (`sidebar.tsx:232` 260px expanded, `app-layout.tsx:63` `lg:p-8`): at a 1024px viewport the strip is ~700px and five 10rem tracks plus gaps need 864px — **the orphan survived in exactly the flagship matrix (OWNER + Régimen General)**. `auto-fit` cannot save it: it only collapses tracks empty across the *whole* grid, and row 1 keeps four of them open. Five equal tracks would need ~132px per card, which clips `C$48,520.50` at `text-3xl`.
  **Real fix: a 6-track field at `lg`** (6 divides into both a 3-row and a 2-row). Five tiles lay out `[2,2,2] + [3,3]` = 6 tracks + 6 tracks, **no hole and no orphan at legible widths**; at `xl` (1280px → ~956px) each tile returns to one track, which is the single 5-across row the wireframe §2 draws. 3 and 4 tiles divide their own count and carry no spans.
  **Trap the parent nearly shipped:** first wrote `lg:col-span-${n}` interpolated. Tailwind does not emit a utility whose name it cannot see literally in source — the CSS would have been empty and the layout broken while the class-name test stayed green. Converted to complete literal strings and **verified the compiled CSS**: `.lg\:grid-cols-6`, `.lg\:col-span-2`, `.lg\:col-span-3`, `.xl\:grid-cols-5`, `.xl\:col-span-1`, `.sm\:grid-cols-3` all present in `dist/assets/*.css`.
  **Two cross-spec breaks only the full suite could see** (no focused worker run would): `dashboard-v2-attention.spec.tsx:573` asserted `lg:grid-cols-4` for a 3-tile matrix — the assertion *was* the hole; now asserts `sm:grid-cols-3` and `not.toContain(lg:grid-cols-4)`. And `w2-sales.test.tsx:138` asserted `/CST/`, which WU8 removed deliberately; that test was additionally **date-dependent** (injected no `now`), so it was rewritten as three deterministic cases: same local day → clock only, earlier day → date + clock, and never `CST/EST/CDT/EDT`. Full frontend suite: **76 files, 1067 passed, 4 skipped**. Skeleton now uses the 4-tile grid (the modal case) instead of promising a shape still unknown.

### Cross-file break WU4 could not fix (outside its surfaces)

`dashboard-v2-acceptance.spec.tsx` pinned the removed `attention-healthy` contract in **three** sites, not the two WU4 reported. Fixed directly by the parent (one file, already-decided contract):
- AC-01 "renders every PRD §29 widget" → asserts the panel is absent when every signal is healthy.
- AC-13 "shows 'Todo en orden' only when…" → renamed and rewritten to assert the whole panel is hidden.
- **AC-16 widget-isolation (the third site WU4 could not see)**: it used the *presence* of `attention-band` as its liveness probe. That proxy is now invalid — a healthy signal set legitimately renders nothing. Rather than weaken it to `not.toBeInTheDocument()`, the test now forces a real `hasGaps = true` exception so the panel must render, proving the stronger property that a data-bearing Attention panel survives a sibling widget's API failure. Acceptance spec 25/25.

## Corrección de premisas: el brief de WU5 lo escribió el padre sin verificar

El worker de WU5 devolvió `interaction_required` en lugar de inventar, y tenía razón en las cuatro. **Premisas falsas introducidas por mí al redactar el brief desde las notas de revisión del owner** — la misma clase de aserción sin inspección que este batch lleva todo el día cazando en el PRD y en los reportes, pero cometida por el orquestador:

| Afirmé | Verificado en el repo |
|---|---|
| chart-card "Resumen de Ventas" con 4 datos y sin delta | tarjeta de **texto** estática en `dashboard-page.tsx:156-186` (Gravables / Impuestos / Descuentos / Brutas), al lado de `TipsSummaryCard`. Sin gráfico, sin delta, sin footer |
| las 4 gráficas dicen `vs. 7 días previos` con período equivocado | el string **no existe** en `apps/owner_dashboard/src/`. La comparación es una serie punteada "periodo anterior"; el único label real es `comparisonLabel()` en `kpi-strip.tsx`, ya derivado del resolver |
| renombrar el subtítulo de nav en `sales-reports-page.tsx` | `src/features/sales-reports/` **no existe**; los features son auth, catalog, customers, dashboard, fiscal, inventory, loyalty, menu-qr, onboarding, promotions, recipes, sales, settings, users |
| `ReportSummary.totalOperationalCostsNio`, serie diaria de COGS y opex | `grep` total: **cero ocurrencias** en todo `apps/`. El sistema no captura gastos operativos en ningún extremo |

**Consecuencia de diseño:** "Rentabilidad **Operativa**" es incalculable aquí; util = neto − opex no tiene operandos, y el subtítulo "incluye gastos operativos declarados" que yo había dictado habría sido **literalmente falso**. Un gráfico de tres series diarias exigiría endpoints nuevos, que el propio brief prohibía. Lo resuelto con el owner: **Option A** (tarjeta RENTABILIDAD — Margen Bruto, que el wireframe §1:40–45 ya especifica con datos existentes) + **Descuentos se traslada a la tarjeta FLUJOS SEPARADOS** (§1:41–47, feedback #9).

**Dato que la corrección reveló:** `snapshot.totalDiscountsNio` no se renderiza en **ninguna** parte del dashboard hoy — su único hogar era la tarjeta que el owner quiere retirar. Retirarla sin darle nueva casa habría hecho desaparecer un KPI real del negocio, no solo copy legado. Ventas Brutas e Impuestos sí sobreviven (páginas Ventas y Fiscal).

**Lección operativa:** todo brief que contenga nombres de símbolo, rutas de archivo o cadenas de UI debe salir de un `grep` propio, no de notas de revisión. Las Parts 2 y 3 de WU5 se retiran como premisas sin objetivo.

- **WU3 gate de margen por cobertura** — 55 tests / 4 archivos, `tsc -b` y build limpios. Gate puro (`evaluateMarginGate`) con tabla de verdad total y fail-closed: ratio (y delta `pp`) solo con `inventoryCoverage.status === 'COMPLETE'` en el período que describe — el delta exige además `COMPLETE` en el período anterior, porque una base no autoritativa no es comparable. Monto `C$` se conserva en `PARTIAL` y se oculta en `UNAVAILABLE`. Copy "Sin costo" por `reasonCodes` en orden de emisión del backend, jamás el código crudo. Normalización fail-closed en `inventory-types.ts` (status desconocido, contajes no finitos → null; códigos desconocidos se filtran). Semántica de conteo de tarjetas preservada: una tarjeta gateada conserva su slot; solo AC-17 cambia el conteo.
  **Hallazgo de WU3 verificado por mí:** `salesCogsNio` no es demostrablemente autoritativo en `UNAVAILABLE`, así que ocultar el monto allí es correcto. Leí el loop: agrega **todo** movimiento `SALE` de la ventana, y la contrapartida `SALE_CANCEL`/`CREDIT_NOTE_RESTOCK` solo existe si el POS emitió un documento `SALE_CANCEL` aparte (`invoices.service.ts:1574,1904`, gateado por `record.documentType`). El flag `isCanceled` lo fija el POS: se persiste tal cual desde el cable en `invoices.service.ts:2522` (`isCanceled: dto.isCanceled ?? false`, campo opcional en `sync-invoice.dto.ts:281`). **Corregido por la segunda validación (hallazgo Q7-b): este párrafo citaba `fiscal-reports.service.ts:158` como el único escritor del backend, y es falso** — esa línea es un **filtro de lectura** (`whereClause.isCanceled: true` del reporte de anuladas), no una escritura. Misma clase de cita falsa que esta ronda venía a limpiar, ubicada en el párrafo que pretendía haberla limpiado. Por tanto una cancelación **sin** documento de reverso dejaría COGS sobrestado — riesgo de acoplamiento, no bug demostrado, registrado para seguimiento.
  **Rotura cruzada que WU3 declaró y yo era el dueño:** `dashboard-v2-strip.spec.tsx:536` esperaba `61.4%` con un mock de `fetchCogs` sin campo de cobertura → gateaba cerrado. El riesgo estaba en MI archivo (lo reescribí al refactorizar G3). Corregido: `cogsPayload` ahora declara cobertura explícita (default `COMPLETE 12/0`), acepta `null` para modelar un cable antiguo sin el campo, y el test de cero-ventas fija `COMPLETE 0/0` conforme a la tabla de WU2 (período vacío ≠ desconocido). 25/25 verdes.
- **WU12 — base de costo cero.** **ABIERTO POR EL PADRE, no por un reporte.** Leyendo la tabla de verdad de WU3 contra el backend encontré que el P0 #4 del owner **reentra por otra puerta** que el flip de WU11 no cerró.
  **Corrección de cronología exigida por la validación independiente (hallazgo D5):** esta entrada citaba `hasMovementCostBasis` (`inventory-reports.service.ts:50-55`) como si fuera código preexistente. **No lo es y nunca lo fue.** `git log --all -S hasMovementCostBasis` no devuelve ningún commit de código: el helper existió únicamente como estado *intermedio sin commitear* de este mismo lote (nacido con WU2/WU11, renombrado por WU12 antes de congelar). Un lector que busque ese símbolo en base o en HEAD no lo encuentra, y eso ya pasó. Lo que sigue describe el defecto de ese borrador intermedio, detectado antes de la congelación.
  El borrador era contradictorio en sí mismo:
  ```ts
  if (mov.totalCostNio != null) return true;   // acepta 0
  return qty > 0 && unitCostNio != null && unitCostNio !== 0;  // la rama de fallback SÍ exige no-cero
  ```
  `totalCostNio` se pinta como cantidad × costo unitario (`invoices.service.ts:1731,1966,2468`) y `Insumo.averageCost` es `decimal` con **`default: 0`** (`insumo.entity.ts:66-71`). Un insumo creado sin compra registrada produce `totalCostNio = 0`, que hoy cuenta como **costado** → `COMPLETE` → **Margen Bruto 100.0% con delta fabricado**, exactamente la queja del owner. El único test de `MISSING_COST_BASIS` usa `totalCostNio: null` (`spec:669`); el cero no está cubierto en ningún lado.
  **No es un cambio de política, es la política de WU11 aplicada al caso que dejó fuera:** un `averageCost` de default 0 es *ausencia de evidencia*, no *evidencia de costo cero*. WU12 exige costo real no nulo para cantidad no nula, y añade `ZERO_COST_BASIS` como código distinto de `MISSING_COST_BASIS` porque las dos reparaciones operativas son distintas (registrar el costo del insumo vs. mapear insumos), con copy español accionable. **Los campos de dinero no se tocan** — un insumo sin precio aporta 0 de costo de verdad; esto cambia solo la *confianza*, y hay aserción de regresión que lo fija.
  **Consecuencia que hay que decir clara: ningún tenant recién onboarded mostrará % de Margen Bruto hasta que alguien registre un costo de compra.** Misma forma que la consecuencia WU11 que el owner ya firmó, y por eso la nota debe ser accionable y no alarmista.

## Validación independiente posterior a la entrega (ronda de verificación)

El lote se commiteó, pusheó y abrió PR **antes** de que existiera un receipt de revisión: `gentle_review` `START` falló determinísticamente con `candidate-view-invalid` sobre este candidato (`lineage_created: false`, `mutation_performed: false`), y re-inspeccionado devolvió el mismo plan. La vista candidata estaba fáctica y verificablemente correcta (mismo target identity, 39 rutas, árbol del tree idéntico), así que el rechazo es del proveedor, no del diff. Como sustituto honesto de la captura nativa se corrió una **validación técnica independiente de solo lectura** sobre `origin/main..HEAD`, que **no es un receipt**.

La validación reprodujo las suites (frontend 81 archivos / 1111 verdes, backend 295 suites / 3109 verdes, `tsc` 0 y 16 preexistentes, build limpio) y confirmó que el dinero, el aislamiento por tenant, la tabla de verdad de cobertura, la gating AC-17, el denominator de Top Products, la aritmética del grid de 6 pistas (vista en el CSS compilado) y el signed-zero son correctos. También refutó dos afirmaciones que **yo** había escrito en el cuerpo del PR: el conteo frontend era 81/1111 (no 80/1105) y oxlint pasó de **4 a 5** avisos (no «5 antes = 5 después» como yo escribí); el extra es el fast-refresh aceptado de `rentabilidad-card.tsx`. Corregido aquí y en el PR. **La segunda ronda de validación (sobre los commits de remediación) añadió cinco precisiones más: Q1-a y Q1-b (la dirección del error no era afirmable y `dashboard-types.ts` decía lo contrario), Q1-c (el tile seguía sin la caveat de completitud: la divergencia D1 persistía a medias), Q3-a (mi justificación "Postgres numeric" era falsa para contadores enteros en memoria), Q4-a (`null` tiene dos orígenes, no uno), Q5-a (mi claim de mutación estaba sobredimensionado), Q7-a (este mismo archivo seguía conteniendo los números que decían estar corregidos) y Q7-b (otra cita falsa persistente). Todas corregidas en la remediación de segunda generación.**

Defectos hallados y su disposición:

| Hallazgo | Qué es | Disposición |
|---|---|---|
| **D1** (medium) | `Rentabilidad` mostraba Costo de ventas y Margen bruto en `PARTIAL` **sin ninguna nota**: la única caveat exigía `!showAmounts`, rama muerta en `PARTIAL`. Con `part ≠ 100%` de costo probado, el margen pintado era la cifra completa del período. | **Corregido.** La caveat pasa a renderizarse siempre que el gate esté cerrado, con copy distinto por estado. La copia "Sin costo" se movió a `coverage-notes.ts` y **la comparten el tile y la tarjeta**: la causa raíz era dos superficies con dos niveles de honestidad para el mismo gate. **Dirección del error: afirmada y luego REFUTADA (Q1-a/Q1-b).** La primera versión sostenía que el margen mostrado era límite *superior*. Cierto para la forma `PARTIAL` sola (ingreso dentro, costo fuera). No cierto del número en general: una factura cancelada **sin** su `SALE_CANCEL` hace lo contrario — su ingreso sale de `netSalesNio` (`isRevenueAffectingDocument` exige `!isCanceled`) mientras su costo queda en `salesCogsNio`, que agrega todo movimiento `SALE` de la ventana sin join de cancelación. Dos formas alcanzables empujan en sentidos opuestos y cuál aplica depende del invariante de reversión que este repo **no tiene probado** (Riesgo de seguimiento). La caveat queda en lo único demostrable: *la cifra no es el margen real del período*, sin dirección. `dashboard-types.ts` decía además "lower-bound", contradiciendo a la caveat dentro del mismo lote. Mutación verificada, **con el alcance corregido (Q5-a)**: suprimir la caveat hace fallar el test nuevo. Mi claim original decía que también hacía fallar al de `UNAVAILABLE`; eso solo ocurre borrando **el bloque gateado entero**, que no es la mutación relevante — restaurar el código pre-fix (caveat fuera, nota `UNAVAILABLE` dentro) falla **solo** el test nuevo. El test de `UNAVAILABLE` no es canario de D1. Añadida paridad tile↔tarjeta (Q1-c) y aserción que **prohíbe** reintroducir dirección. |
| **D2** (low) | `normalizeInventoryCoverage` usaba `toFiniteNumber`, que coacciona `null` y `""` a `0` (ambos finitos). Un payload deforme `{status: "COMPLETE", costedSalesCount: null, uncostedSalesCount: null}` se aceptaba como **`COMPLETE 0/0`**, que **abre** el gate de ratio. El doc del módulo afirmaba lo contrario. | **Corregido.** Contador validado explícitamente (`toKnownCount`): finito, entero, ≥ 0, cadena no vacía aceptada porque Postgres `numeric` llega como texto. El doc del módulo ahora describe la razón de no coaccionar. |
| **D3** (low) | La lectura de facturas de cobertura no tenía ninguna aserción sobre su `WHERE`; una edición futura que quite `inv.tenant_id` dejaría el suite verde. | **Cubierto** con un test de pinning sobre los predicados y el parámetro de tenant. **Honesto: este test pasó en el primer intento** — fija conducta existente, no caza un defecto presente. |
| **D4** (low, **decisión de producto**) | Ticket promedio divide `netSalesNio` (documentos que afectan ingreso, incluye notas de crédito netadas) sobre `completedTicketCount` (documentos completados, las excluye). No es el promedio de los tickets contados: con 1 venta C$100 y 1 nota −C$150 da **−C$50.00**. | **Sin cambio de código.** Es la fórmula literal de PRD §7.5 (`Net Sales / Completed Tickets`), y el PRD es contrato congelado. El comportamiento es conforme; lo que está en disputa es el PRD, no esta implementación. Escalado al owner. |
| **D5** (low) | Doc citaba un símbolo inexistente con número de línea. | **Corregido** arriba, con la cronología real. |
| **D6** (low) | Toda venta `APPLIED_NO_INVENTORY_IMPACT` se etiquetaba `NO_EXPLICIT_INSUMO_MAPPING` por el string de outcome. Pero esa rama también cubre ventas **sin líneas** (`sale-inventory-outcome.service.ts:330`, `reason: null`), donde "mapea los insumos" no es una reparación posible. | **Corregido.** El código de razón ahora sale del hecho grabado en la factura (`recordedInventoryReasonCode`); sin razón registrada se emite `MISSING_COST_BASIS`. La decisión de **confianza no cambia** (sigue sin costear); solo la guía operativa. |

Sospechas no confirmadas, registradas sin tocar código:

- **S1 — cuota > 100 % es alcanzable con datos normales.** `percentOf` no topa y el denominator es *net*. Con A = C$1,000, B = C$800 y una nota de crédito de −C$900 sobre B, Net Sales = C$900 y la cuota de A es **111.1 %**. No es un caso raro: es una consecuencia directa de dividir una parte *bruta neta de su propio producto* sobre un total *netea devoluciones ajenas*. **No se topa a 100 %**: toparla fabricaría una cuota que los datos no sostienen. Queda como decisión de presentación del owner (mostrar 111.1 %, o retirar la columna cuando la suma de los listados excede el denominador).
- **S2 — `COMPLETE 0/0` abre el ratio.** `evaluateMarginGate` abre `ratio` en `COMPLETE` sin mirar contajes. Requiere un período con `netSalesNio > 0` y `salesCogsNio = 0` con cobertura `COMPLETE`, y `grossMargin` ya devuelve `null` cuando `netSales <= 0`, así que la variante trivial está cubierta; la variante no trivial necesita una nota de crédito de subtotal positivo, que no se pudo demostrar que se persista.
- **S3** — `Rentabilidad` toma `Ventas netas` del snapshot del KPI y `Costo de ventas` de su propia query; en la app ambas resuelven la misma clave de caché, así que solo divergirían si el dedupe se rompiera. Sin defecto demostrado.

Lección de proceso que hay que registrar sin adornos: **el orden correcto es congelar → revisar → receipt → entregar.** Este batch invirtió los dos últimos pasos porque tomé "commit + PR ahora" como autorización para entregar sin receipt. Pi no acuña autoridad de entrega (commit/push/PR siguen política del repo con o sin RDD), así que el PR no es inválido; pero reportarlo como revisado sí lo habría sido.

## Riesgo de seguimiento registrado (no corregido en este batch)

El netting de COGS de una factura cancelada depende de que el POS emita un documento `SALE_CANCEL` **separado**; `isCanceled = true` por sí solo no revierte el movimiento de kardex. Si algún camino de cancelación marca la factura sin producir el reverso, `salesCogsNio` queda sobrestado para ese período. No se demostró que exista tal camino; queda como candidato a issue con evidencia de `sale-inventory-outcome.service.ts:336` y `invoices.service.ts:1574`.

## Cierres de la segunda tanda

- **WU3 gate de margen por cobertura** — 55 tests / 4 archivos, `tsc -b` y build limpios. Gate puro (`evaluateMarginGate`) y total: ratio (y delta `pp`) solo con `inventoryCoverage.status === 'COMPLETE'` en el período que describe — el delta exige además `COMPLETE` en el anterior, porque una base no autoritativa no es comparable. Monto `C$` se conserva en `PARTIAL`, oculto en `UNAVAILABLE`. Normalización fail-closed en `inventory-types.ts` (status desconocido, contajes no finitos → null; códigos desconocidos se filtran). Copy "Sin costo" por `reasonCodes` en orden de emisión del backend, jamás el código crudo. Semántica de conteo preservada: una tarjeta gateada conserva su slot; solo AC-17 cambia el conteo.
  **Hallazgo verificado por el padre:** `salesCogsNio` no es demostrablemente autoritativo en `UNAVAILABLE`, así que ocultar el monto allí es correcto — el loop agrega **todo** movimiento `SALE` de la ventana.
  **Rotura que WU3 declaró y que era del padre:** `dashboard-v2-strip.spec.tsx:536` esperaba `61.4%` con un mock de `fetchCogs` sin cobertura → gateaba cerrado. `cogsPayload` ahora declara cobertura explícita (default `COMPLETE 12/0`), acepta `null` para modelar un cable antiguo sin el campo, y el test de cero-ventas fija `COMPLETE 0/0` (período vacío ≠ desconocido).
- **WU5 — Rentabilidad y Flujos (RESCOPEADO).** El brief original del padre estaba mal (ver "Corrección de premisas"). Entregado el rescopo que eligió el owner: **Option A** + Descuentos a FLUJOS SEPARADOS. `rentabilidad-card.tsx` nuevo, `Resumen de Ventas` retirado, banda inferior con reflow a 1 columna sin grant, `Ver →` a `/sales` (ruta existente, no inventada). El % de margen consume el `MarginGate` de WU3: sin cobertura no degrada a `0` fabricado. **Ninguna cadena dice "operativa"/"gastos"/"declarados"** salvo la fila `Mermas (operativa)` que ya dibujaba el wireframe. Parts 2 y 3 retiradas como premisas sin objetivo; verificados los captions de las 4 gráficas: ninguno afirma un período equivocado. El delta `↑0.4pp` del wireframe **no se renderiza** — `snapshot.deltas` no tiene delta de descuentos y WU5 se negó a inventarlo; quedó como gating note en el wireframe §4. Denominador de Descuentos: `preDiscountSalesNio` (FR-DISC-02), no `netSalesNio`.
- **WU12 — Base de costo cero.** `hasMovementCostBasis` → `classifySaleCostEvidence`, que distingue `costed` / `zero` / `missing` por venta; `qty === 0` nunca evidencia costo. Nuevo `ZERO_COST_BASIS` en la unión del DTO, en el orden de emisión (justo tras `MISSING_COST_BASIS`), espejado en `inventory-types.ts` (si no, la nota degradaba en silencio) y con nota propia en español accionable. **Dinero intacto, verificado por el padre:** el único `+` del diff que menciona `salesCogsNio` es un comentario; las líneas de agregación no aparecen tocadas. Backend 381/41 suites, frontend 22/22. **Ninguna expectativa existente hubo que flippear**: el único test previo de `MISSING_COST_BASIS` usaba `null`, no `0` — la política vieja del cero nunca estuvo fijada por un test; el agujero era puro.
  **Consecuencia firmada:** todo tenant recién onboarded con recetas mapeadas y sin compras de proveedor pasa de `Margen Bruto 100.0%` fabricado a `PARTIAL`/`UNAVAILABLE` con `—` y nota accionable, hasta que alguien registre un costo de compra.

## Roturas cruzadas de WU5 (corregidas por el padre; ningún escritor las veía)

WU5 entregó una lista línea por línea de lo que rompió en archivos ajenos. **Acertó en todas menos una causa.**

1. **`dashboard-v2-strip.spec.tsx` (mío) — 4 fallos G2.** `TypeError: Cannot destructure property 'basename' of useContext(...) as it is null`: la `RentabilidadCard` introduce un `Link` de react-router que solo se monta con grant de costo, y mis tests G2 son los únicos que montan `DashboardPage` como OWNER con grant. Fix: `MemoryRouter` en `renderPage()` — el contexto que la página siempre tiene en producción — no aflojar la aserción.
2. **`dashboard.test.tsx` (superficie de WU3, cerrado).** `getAllByText("Ventas Brutas")` ×2 → `not.toBeInTheDocument()` (WU5 retiró la única superficie del dashboard que lo renderizaba), y `renders Resumen de Ventas…` → `renders the Flujos separados band…` afirmando presencia de uno y ausencia del otro. 10/10.
3. **`dashboard-v2-tips.spec.tsx` (fuera de TODA lista, ni de WU5 ni de WU3).** Cinco fallos por un solo cambio semántico: la card **ahora siempre existe** porque Descuentos la mantiene viva. Quienes afirmaban `queryByTestId("tips-summary-card")).not.toBeInTheDocument()` medían en verdad la ausencia del bloque de **propinas** → re-escritos a card presente + `Total Propinas` ausente. El test de em-dashes contaba 2 y ahora son 4 (la fila Descuentos añade dos): se le pasan inputs de descuento explícitos para que siga midiendo los dos nulls de propinas en vez de aflojar la cuenta.
4. **`dashboard-v2-acceptance.spec.tsx`.** AC-15 usaba `waitFor(getByTestId("tips-summary-card"))` como **barrera de vida**, exactamente la trampa que corregí en AC-16 al abrir el batch: ahora la card existe sin datos, el test competía con las queries y leía `snapshot === null` (franja en skeleton, Descuentos en `—`). Arreglado esperando el estado asentado (`kpi-strip-skeleton` ausente), no la presencia del contenedor.
5. **`dashboard-v2-attention.spec.tsx` (heredado de WU4/WU3).** Su `cogsPayload()` no traía `inventoryCoverage` y el gate de WU3 lo lee: `61.4%` pasó legítimamente a `—`. Cubierto con `COMPLETE` explícito.

**Dos autocríticas del fix del padre:** (a) el primer intento en AC-15 añadió una aserción sobre `C$0.00` que resultó **frágil y arbitraria** — el fixture compartido de acceptance tiene `totalDiscountsNio: 1564.95`, no cero; la guarda honesta de §21.4 es "el bloque de propinas no aparece", no "ningún C$0.00 en la página". (b) Estas roturas **solo se ven en la suite completa**: WU5 validó correctamente sus dos specs + `tsc -b` y aun así dejó 11 fallos en cuatro archivos que no podía tocar. La orden "no corras la suite completa" protege del ruido ajeno pero elimina la única red que detecta breaks entre unidades; con escritores concurrentes es un costo real, no una omisión del worker.

## Estado de validación integrada (tras WU1–WU12, sin WU9)

- Frontend: **79 archivos, 1097 tests verdes, 4 saltados**. `npx tsc -b` exit 0. `npm run build` limpio.
- Backend: **295 suites, 3112 tests verdes**. Permanecen solo los 16 errores `tsc` preexistentes de base en `test/inventory/batch_6b_baseline_validation.spec.ts`.
- Oxlint: 3 avisos preexistentes + **1 nuevo** `rentabilidad-card.tsx:67` (fast-refresh: hook y componente en el mismo archivo). Se anota y se acepta como estilo del repo; no se reestructura el archivo de otra unidad al cierre del batch.

## WU9 — Pulido de presentación (última unidad)

Entregado. Ejes de dinero (`sales-trend` Y, `hourly` Y, `top-products` X) con el formatter compartido `formatNio`; ejes de unidades (horas `HH:00`, `214 u`) sin prefijo. `compactNio` quedó huérfano y eliminado (verificado: cero referencias). Cero con signo normalizado **en el formatter compartido**, no en cada call site.

**El defecto del `-C$0.00` era real, verificado en runtime por el padre**, no teórico: `Intl.NumberFormat("es-NI", {style:"currency", currency:"NIO"})` imprime `-C$0.00` para `-0` y para `-0.001`. Y la regla es correcta en el borde que importa: `-0.01` **conserva** su signo (`unsignedZeroAtDisplayPrecision` solo interviene cuando el valor redondea a cero a precisión de display), así que un descuento o reembolso negativo real no se aplana.

**Footer `Periodo:` eliminado** tras verificar la condición de parada que puse en el brief: el trigger del `DateRangePicker` renderiza `AAAA-MM-DD—AAAA-MM-DD` visible, así que la atribución temporal permanece en pantalla. El footer eliminado mostraba el eco del rango *del servidor*; el picker muestra el rango *solicitado* — diferencia que hoy no existe pero que ya no se refleja (riesgo aceptado).

**Decisión de producto del owner (registrada porque es suya, no del worker ni del padre):** se pidió elegir entre `C$48,520.50` (precisión exacta, eje 88px), `C$49k` (compacto recuperando `compactNio` con prefijo) y `C$48,520` (sin centavos, `allowDecimals={false}`). El owner eligió **`C$48,520.50` tal como está**, con los dos efectos aceptados explícitamente: el eje de dinero pasa de 48 a 88px (≈40px de área de gráfico por gráfica) y `allowDecimals` no está configurado, así que un tick fraccional puede imprimir centavos (`C$12,130.13`). **No es un olvido: es la elección.**

Nota de proceso: el brief de WU9 decía "reutiliza el mismo formatter del resto del dashboard", y eso es lo que empujó a `formatNio` en los ejes y dejó `compactNio` huérfano. La forma compacta era la que el repo ya usaba para ejes; si el owner quisiera unidad + magnitud de un vistazo, la opción B (`C$49k`) requiere reintroducir un formatter compacto con prefijo.

## Validación integrada final (batch completo WU1–WU12)

- Frontend: **81 archivos, 1114 tests verdes, 4 saltados** (77/1050 en `origin/main`; la tanda entregó 1111 y la remediación sumó +3). `npx tsc -b` exit 0. `npm run build` limpio.
- Backend: **295 suites, 3112 tests verdes, 8 saltados** (3084 en `origin/main`). Solo permanecen los 16 errores `tsc` preexistentes de base en `test/inventory/batch_6b_baseline_validation.spec.ts`.
- Oxlint: **4 en `origin/main`, 5 en HEAD**. Mi claim anterior era falso en ambas mitades, y la segunda validación lo precisó: el quinto aviso lo introdujo `33dbe877` (fast-refresh en `rentabilidad-card.tsx`, que exporta hook y componente como `dashboard-api.ts`), así que contra la base del rango revisado `343359d4` es **5 → 5**. Aceptado como estilo del repo; no proviene de WU9.

## Estado del árbol al entregar

La rama `fix/dashboard-v2-review-round-2` no parte de `origin/main`: trae dos commits ajenos al batch (`9a924c4a` y `5eb8069c`, auditoría de claims nhilos OD-02 + brief web) que no están en `origin/main`. Para que el PR contenga **solo** el trabajo de revisión round 2, el batch se comitea aquí y se **cherry-pickia** a una rama nueva basada en `origin/main`; los commits nhilos quedan intactos en esta rama, sin rebase destructivo ni trabajo huérfano.

## Corrección al reporte de WU11: la prevalencia SÍ estaba medida, en #611

WU11 reportó que no podía cuantificar cuán comunes son los productos SIMPLE sin mapear y lo dejó como evidencia circunstancial (default de `product_type` + clasificación de plantillas). **Se equivocó de sitio, no de dirección: el repo no lo medía, pero un issue abierto sí.** #611 —"Publicada y decorativa: 10 productos SIMPLE con recetas PUBLISHED/activas y cero mapeo de insumos venden sin consumir stock"— trae consulta SQL medida sobre la base de datos de desarrollo: **10 productos** en exactamente la forma que WU11 describía, ya en `PUBLISHED`/`is_active`.

Consecuencia directa sobre este batch: esos 10 productos son precisamente la población que el flip pasa de `COMPLETE` (costo cero "autoritativo") a `PARTIAL`/`UNAVAILABLE`, así que el cambio es visible en desarrollo desde el primer render. **No es un riesgo teórico ni una franja rara: está medido.** Y #518 ("resale products deduct no stock — product↔insumo mapping has no create path") explica por qué la población existe y no se puede reparar desde la UI hoy: no hay camino de creación del mapeo.

Esto no revertiza ninguna decisión: la consecuencia la firmó el owner, y el copy "Sin costo" con motivo accionable era ya la superficie principal de WU3. Sí sube la urgencia de #518: sin un camino para crear el mapeo, la nota del dashboard dice "mapea insumos" y hoy no hay dónde hacerlo.

## Out of scope

- Delivery (push/PR) stays the owner's call per unit.
- No POS/DGI changes: tips persistence verified working, nothing to fix.
