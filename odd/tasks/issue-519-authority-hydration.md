# #519 — Hydrate authority projections so real sales deduct inventory (Batch 3 / B3a)

Branch: `fix/519-kardex-server-comp` · Base: `origin/main` · Issue: #519 · Plan: Batch 3 (B3a)

## Facts verified in code (this session, not from the issue text)

| # | Fact | Evidence |
|---|---|---|
| F1 | `AuthorityHydrationService` has **zero** production references | `grep -rn "authority_hydration_service" apps/pos_app/lib/` → only its own file (class decl `:139`, ctor `:142`) |
| F2 | `sync_service` never reads the `recipeVersions` delta | `grep -n "recipeVersions\|recipe_versions" apps/pos_app/lib/data/services/sync_service.dart` → no matches; parsed keys are products/catalogValues/insumos/recipes/users/alerts/fiscalConfig (`:1693-1930`) |
| F3 | The POS does **not** send a `types` query param | `_pullInboundDeltas` builds `queryParams` with only `sinceVersion` + `terminalId` (`sync_service.dart:1652-1656`) → backend default type set applies |
| F4 | The backend default set includes `recipeversions`/`recipe_versions` and emits `deltas.recipeVersions` | `inbound-sync.service.ts:343-353`, `:159-168` |
| F5 | The backend **already** filters what it sends to active+published+effective versions, rejects ambiguous versions per product, and rejects components whose insumo is foreign | `inbound-sync.service.ts:567-647` |
| F6 | The frozen-movement engine exists and is correct | `sales_repository_impl.dart:344-382` `FrozenSaleInventoryMovementBoundary().derive(...)` → `APPLIED` writes `MovementEntity` rows; `suppressedNoInventoryImpact` / `suppressedInventoryPending` write none |
| F7 | With empty projections every line is `noImpact`/`pendingRecipe` | `sale_inventory_outcome_planner.dart:89-101` |
| F8 | `NegativeStockRegularizationService` is orphaned (no caller in `lib/`) | grep — definition only; `PurchaseViewModel.recordPurchase()` → `movementEngine.recordPurchase()` directly |
| F9 | `#518` resale mapping has **no** local create path; `mappingVersionId`/`insumoId` only arrive on the products delta | no `insertMapping*`/`createMapping*` in `apps/pos_app/lib/` |

## The shape mismatch (this is the actual work, not the wiring)

`AuthorityHydrationPayload.fromJson` expects a **flat** document; the sync delta is **nested** and uses different field names. Feeding the delta in unchanged does not "partially work" — it throws.

| Hydrator requires | Backend delta provides | Consequence |
|---|---|---|
| `recipeVersions[].effectiveFrom` (or `fechaInicioVigencia`), **required** | `effectiveAt` | `FormatException` → whole payload rejected |
| `insumos[].uom`, **required** | `purchaseUom` / `consumptionUom` (no `uom`) | `FormatException` |
| `components[]` at **root** | `components[]` **nested inside each version** | components silently `[]` → version with zero components |
| `components[].ordinal` | `componentOrdinal` | ordinal defaults to `0` for every line |
| `components[].componentName` | `ingredientName` | name silently `''` |
| `components[].quantityPerSaleUnit` not read; `grossQuantity` read | both present | ok (gross is the correct authority quantity) |

`insumos` is the sharpest one: the delta's insumo array carries `purchaseUom`/`consumptionUom`, and the local `InsumoEntity` has **no `tenantId` column at all** — so authority insumos cannot be rebuilt from the local table; they must come from the delta, which is also only incremental (a component may reference an insumo that did not change and is therefore absent from this page).

**Owner decision (2026-09-26, this session): the cloud asserts the fact, the POS never synthesizes it.** The POS does *not* fabricate an insumo identity from the component's denormalized `ingredientName`/`componentUom` — that is the invented-default pattern D-16 already burned us with. Instead the backend extends its own `recipeVersions` delta with the authority insumos each version's components reference. `fetchRecipeVersionDeltas` already loads exactly those insumo rows to validate eligibility (`inbound-sync.service.ts:628-647`) and then throws the data away; this decision recovers what is already in hand.

**Resulting contract — per-version closure, not a sibling delta key.** `InboundSyncRecipeVersionDto` gains `insumos: Array<{ id, tenantId, name, uom }>` scoped to the insumos its own components reference. Deliberate duplication across versions buys a fail-closed property: a version can never arrive with a component whose insumo fact is missing, independent of what the incremental `insumos` cursor happened to return. `uom` is the insumo's consumption UOM, stated by the backend — the POS stops guessing which of `purchaseUom`/`consumptionUom` the authority table means. Stock, cost and par levels stay in the existing `insumos` table; this closure carries identity facts only.

## Units

One PR: the backend producer and the POS consumer are one contract change; landing them apart leaves main with a half-wire.

| Unit | App | What | Files | Depends |
|---|---|---|---|---|
| **U1** | backend | Emit the per-version insumo closure: `InboundSyncRecipeVersionDto.insumos`, built from the `componentInsumos` the fetch already loads; fail closed if a referenced insumo is missing rather than emitting a partial closure | `src/modules/sales/dto/inbound-sync.dto.ts`, `src/modules/sales/services/inbound-sync.service.ts` + `inbound-sync.service.spec.ts` | — |
| **U2** | POS | `AuthorityDeltaAdapter`: nested version delta → flat `AuthorityHydrationPayload` — `effectiveAt`→`effectiveFrom`, `componentOrdinal`→`ordinal`, `ingredientName`→`componentName`, per-version `insumos`→root `insumos`, Date→ISO strings, single-tenant binding with cross-tenant rejection | `lib/data/services/authority_delta_adapter.dart` (new) + unit test | U1 |
| **U3** | POS | Wire it into `_pullInboundDeltas`: read `rawDeltas['recipeVersions']`, hydrate after the insumo/product handlers, report counts in `InboundSyncResult`, and **never** fail the pull on a hydration error | `lib/data/services/sync_service.dart` + test | U2 |
| **U4** | POS | Hydration observability: last hydration timestamp + record counts in `local_configs`, so "silently never hydrated" is distinguishable from "hydrated an empty catalog" | `sync_service.dart`, existing banner read path | U3 |
| **U5** | POS | Fail-closed guard (issue A3): a tenant-bound `prepared`/`compound` line gets a *distinct* reason — `AUTHORITY_UNHYDRATED` vs `MISSING_PUBLISHED_RECIPE`. This is the unit that stops the next bug of this class | `checkout_inventory_preparation_service.dart`, `sale_inventory_outcome_planner.dart` | U3, U4 |
| **U6** | POS | Integration test on a **migrated** DB seeded **through the sync path** (not `synchronize:true`, not `inMemoryDatabaseBuilder`, which skips migrations): one dish sale and one resale sale each produce kardex movements with non-zero `stock_before`/`stock_after` | `test/integration/…` (new) + migrated-DB helper | U2-U5 |

**Deliberately NOT in this change** (each needs its own issue, do not silently expand scope):
- **A4** `NegativeStockRegularizationService` wiring (F8) — separate lifecycle (`PROVISIONAL → REGULARIZED`, lineage hash), needs its own design review.
- **B3b** #524 movements carrying real stock levels; **B3c** backend ledger authority + idempotent compensation — server-side compensation alone does not protect the local kardex while offline, so it stays behind H1-H3.
- **Supersession/rebuild**: hydration is insert-if-absent with no supersession or delete path, so local authority rows accumulate. Today's read query (`publication_state='PUBLISHED' AND is_active=1 AND effective window`) makes staleness *correct-but-fat*, not wrong. Unbounded growth needs a rebuild strategy, not a patch.
- **#518** resale mapping create path (F9): SIMPLE resale items still depend on `mappingVersionId` arriving from the cloud.

## Invariants that must survive

- **Offline-first**: deduction must happen locally at checkout. A backend-only compensation fails this test (backend `appendV1Movement` runs only after sync, `invoices.service.ts:1203-1204`).
- **Checkout never blocked** (Q80): hydration failure must never prevent a sale. H2 logs and surfaces, it does not throw into checkout.
- **DGI append-only**: invoices untouched by this change.
- **Authority tables are immutable** by Floor triggers (`migrations.dart:76-100`, `BEFORE UPDATE`/`BEFORE DELETE` → `RAISE(ABORT)`); hydration may only insert.
- **`@transaction` DAO methods use positional arguments** (Floor codegen constraint).

## Verification bar

`flutter test --concurrency=1` on the touched suites + the full POS suite; `flutter analyze`; the A5 test must fail before H1/H2 land and pass after — that test is the regression fence.
