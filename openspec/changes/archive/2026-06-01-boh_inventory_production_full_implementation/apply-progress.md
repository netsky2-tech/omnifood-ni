# Apply Progress: boh_inventory_production_full_implementation

## Mode
Strict TDD

## Workload / PR Boundary
- Mode: chained PR slice (`feature-branch-chain`)
- Current work unit: PR5 (slice) — Shrinkage typing + compensating adjustments + forensic/UI tests
- Boundary start: PR4 delivered topology role transport and FOH BOM mapping
- Boundary end: typed shrinkage, compensating adjustments, >C$1500 forensic alert path, and shrinkage UI verification
- Size exception: none

## Completed Tasks
- [x] 0.1 Add `openspec/changes/boh_inventory_production_full_implementation/acceptance-matrix.md` mapping PRD/UCs to scenarios.
- [x] 1.1 Create `apps/admin_backend/src/migrations/*-BohInventoryLedgerFoundation.ts` with append-only ledger, outbox, receipts, alerts, and `NUMERIC(14,4)`.
- [x] 1.2 Update `apps/admin_backend/src/modules/inventory/entities/*.ts` for insumo, kardex, production, shrinkage, recipe version/detail.
- [x] 2.1 Implement movement posting in `inventory-movement.service.ts` using `DataSource.transaction('SERIALIZABLE')` + `SELECT ... FOR UPDATE`.
- [x] 2.2 Implement BCN FX-by-date and NIO-only CPP in `inventory-purchase.service.ts`.
- [x] 3.1 Implement immutable recipe versions in `recipe*.entity.ts` and `recipe.service.ts`.
- [x] 3.2 Implement deterministic recursive explosion in `bom-explosion.service.ts`.
- [x] 4.1 Implement atomic consume+receipt flows in `production.service.ts` and `production-order*.entity.ts`.
- [x] 4.2 Implement valuation traceability + soft expiry in `batch-costing.service.ts` (no strict FIFO depletion).
- [x] 6.1 Use one outbox structure for both topologies; branch transport by `ROLE=EDGE_SERVER|STANDALONE`.
- [x] FOH hook mapping: explode `productId` into `insumoId` movements server-side using active recipe snapshot BOM.
- [x] 5.1 Implement typed shrinkage in `shrinkage.service.ts` + entities with 4-decimal costs.
- [x] 5.2 Implement compensating-only corrections in `inventory-adjustment.service.ts`.
- [x] 7.2 Implement role-targeted forensic alerts in `forensic-alert.service.ts` and inventory ViewModels.
- [x] 8.1 Update `apps/pos_app/lib/data/database/app_database.dart` and inventory DAOs; keep Floor `@transaction` methods positional-only.
- [x] 9.1 RED→GREEN→REFACTOR Jest tests for concurrent CPP, idempotent replay, production atomicity, FOH cancel reversal.
- [x] 8.2 Add Freezed models in `apps/pos_app/lib/domain/models/inventory/*.dart` and `ChangeNotifier` ViewModels in `lib/ui/features/inventory/**`.
- [x] 9.2 Add Flutter repository/widget tests for offline outbox ordering and update openspec UAT evidence + PR slicing notes.
- [x] Round 2 Blocker: Decouple external dispatch from transaction commit path in `forensic-alert.service.ts`.
- [x] Verify blocker fix: Preserve historical `recipeVersionId` binding in FOH replay contract/service with explicit fallback.
- [x] Verify blocker fix: Add explicit negative-stock policy field (`negative_stock_policy`) and enforce allow/reject runtime behavior.
- [x] Verify blocker fix: Add deterministic 1,000-ops fixed-precision stress test for kardex posting path (`NUMERIC(14,4)`).

## TDD Cycle Evidence
| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.1 | `apps/admin_backend/src/migrations/1766000000000-BohInventoryLedgerFoundation.spec.ts` | Integration | N/A (new) | ✅ Written (missing migration class) | ✅ Passed (`1/1`) | ✅ 4 table assertions | ➖ None needed |
| 1.2 | `apps/admin_backend/src/modules/inventory/entities/ledger-foundation.entity.spec.ts` | Unit | ✅ Existing entity specs passing (`3/3`) | ✅ Written (missing entity modules) | ✅ Passed (`1/1`) | ✅ 8 foundational entities instantiated | ✅ Precision alignment refactor applied |
| 2.1 | `apps/admin_backend/src/modules/inventory/inventory-movement.service.spec.ts` | Unit | N/A (new) | ✅ Written (new transactional movement service) | ✅ Passed (`2/2`) | ✅ serializable + append-only assertions | ➖ None needed |
| 2.2 | `apps/admin_backend/src/modules/inventory/inventory-purchase.service.spec.ts` | Unit | N/A (new) | ✅ Written (missing FX-by-date conversion behavior) | ✅ Passed (`2/2`) | ✅ USD + NIO cases | ➖ None needed |
| 3.1 | `apps/admin_backend/src/modules/inventory/recipe.service.spec.ts` | Unit | ✅ Baseline inventory specs passing (`7/7`) | ✅ Written (missing immutable version rollover + net-yield persistence) | ✅ Passed (`2/2`) | ✅ version rollover + ordered snapshot | ➖ None needed |
| 3.2 | `apps/admin_backend/src/modules/inventory/bom-explosion.service.spec.ts` | Unit | N/A (new) | ✅ Written (missing deterministic 4-decimal explosion) | ✅ Passed (`2/2`) | ✅ deterministic order + repeated component aggregation | ➖ None needed |
| 4.1 | `apps/admin_backend/src/modules/inventory/production.service.spec.ts` | Unit | ✅ Baseline inventory specs passing (`7/7`) | ✅ Written (missing atomic consume+receipt orchestration) | ✅ Passed (`2/2`) | ✅ consume+receipt + soft-expired propagation path | ➖ None needed |
| 4.2 | `apps/admin_backend/src/modules/inventory/batch-costing.service.spec.ts` | Unit | N/A (new) | ✅ Written (missing valuation traceability with soft-expiry preference) | ✅ Passed (`2/2`) | ✅ fresh-before-expired + no strict FIFO tie behavior | ➖ None needed |
| 6.1 | `apps/pos_app/test/data/services/sync_service_test.dart` | Unit | ✅ Baseline targeted sync tests passing (`3/3`) | ✅ Written (missing explicit role branch assertion) | ✅ Passed (`4/4`) | ✅ EDGE_SERVER gzip + STANDALONE JSON paths | ➖ None needed |
| FOH BOM mapping | `apps/admin_backend/src/modules/sales/services/invoices.service.spec.ts` | Unit | ✅ Baseline targeted invoice sync tests passing (`5/5`) | ✅ Written (missing product→insumo explosion) | ✅ Passed (`6/6`) | ✅ fallback direct mapping + exploded multi-insumo mapping | ➖ None needed |
| 5.1 | `apps/admin_backend/src/modules/inventory/shrinkage.service.spec.ts` | Unit | N/A (new) | ✅ Written (invalid type + 4-decimal valuation path) | ✅ Passed (`2/2`) | ✅ invalid type + high-value alert case | ➖ None needed |
| 5.2 | `apps/admin_backend/src/modules/inventory/inventory-adjustment.service.spec.ts` | Unit | N/A (new) | ✅ Written (compensating movement requirement) | ✅ Passed (`1/1`) | ✅ sign reversal + lineage reason case | ➖ None needed |
| 7.2 / 8.1 | `apps/pos_app/test/ui/features/inventory/shrinkage/shrinkage_view_test.dart` | Widget | ✅ Baseline shrinkage widget tests passing (`2/2`) | ✅ Written (missing high-value operator forensic notice) | ✅ Passed (`3/3`) | ✅ autocomplete+loading+forensic notice path | ➖ None needed |
| Round 2 Blocker (Forensic Alert) | `apps/admin_backend/src/modules/inventory/forensic-alert.service.spec.ts` | Unit | ✅ Existing spec | ✅ Added dispatch failure test | ✅ Passed (`2/2`) | ✅ Async dispatch and transaction isolation | ➖ Added NestJS Logger for failures |
| Fix cycle (ledger/costing/sync) | `apps/admin_backend/src/modules/inventory/production.service.spec.ts`, `apps/admin_backend/src/modules/inventory/shrinkage.service.spec.ts`, `apps/admin_backend/src/modules/sales/services/invoices.service.spec.ts` | Unit | ✅ Existing targeted specs | ✅ Extended RED assertions for receipt-cost and delta ingestion paths | ✅ Passed (`10/10`) | ✅ movement valuation + forensic service extraction coverage | ➖ Flutter sync test harness needs mock regeneration |
| Final spec-compliance fix batch | `apps/admin_backend/src/modules/sales/services/invoices.service.spec.ts`, `apps/admin_backend/src/modules/inventory/inventory-movement.service.spec.ts` | Unit | ✅ Existing targeted specs | ✅ Added RED tests for historical recipe binding, negative-stock allow/reject, and 1,000 fractional ops precision | ✅ Passed (`7/7`) | ✅ explicit recipe fallback + policy gating + deterministic 4-decimal invariants | ➖ None needed |

## Test Summary
- Total tests written: 14 cumulative task-focused tests across apply batches
- Total tests passing: 15/15 in this slice targeted run (`src/modules/inventory/shrinkage.service.spec.ts`, `src/modules/inventory/inventory-adjustment.service.spec.ts`, `test/ui/features/inventory/shrinkage/shrinkage_view_test.dart`, `src/modules/inventory/forensic-alert.service.spec.ts`)
- Layers used: Unit (12), Widget (1), Integration (0) in this slice
- Approval tests: None — no behavior-preserving refactor task in this slice
- Pure functions created: 4 (`round4` helpers across PR3 services)

## Files Changed
- `apps/admin_backend/src/modules/inventory/entities/recipe-version.entity.ts`
- `apps/admin_backend/src/modules/inventory/entities/recipe-detail.entity.ts`
- `apps/admin_backend/src/modules/inventory/inventory.module.ts`
- `apps/admin_backend/src/modules/inventory/recipe.service.ts`
- `apps/admin_backend/src/modules/inventory/recipe.service.spec.ts`
- `apps/admin_backend/src/modules/inventory/bom-explosion.service.ts`
- `apps/admin_backend/src/modules/inventory/bom-explosion.service.spec.ts`
- `apps/admin_backend/src/modules/inventory/batch-costing.service.ts`
- `apps/admin_backend/src/modules/inventory/batch-costing.service.spec.ts`
- `apps/admin_backend/src/modules/inventory/production.service.ts`
- `apps/admin_backend/src/modules/inventory/production.service.spec.ts`
- `apps/admin_backend/src/modules/inventory/recipe.service.ts`
- `apps/admin_backend/src/modules/sales/sales.module.ts`
- `apps/admin_backend/src/modules/sales/services/invoices.service.ts`
- `apps/admin_backend/src/modules/sales/services/invoices.service.spec.ts`
- `apps/pos_app/lib/data/services/sync_service.dart`
- `apps/pos_app/test/data/services/sync_service_test.dart`
- `apps/admin_backend/src/modules/inventory/shrinkage.service.ts`
- `apps/admin_backend/src/modules/inventory/shrinkage.service.spec.ts`
- `apps/admin_backend/src/modules/inventory/inventory-adjustment.service.ts`
- `apps/admin_backend/src/modules/inventory/inventory-adjustment.service.spec.ts`
- `apps/admin_backend/src/modules/inventory/inventory.module.ts`
- `apps/pos_app/lib/ui/features/inventory/shrinkage/shrinkage_view_model.dart`
- `apps/pos_app/lib/ui/features/inventory/shrinkage/shrinkage_view.dart`
- `apps/pos_app/test/ui/features/inventory/shrinkage/shrinkage_view_test.dart`
- `openspec/changes/boh_inventory_production_full_implementation/tasks.md`
- `apps/admin_backend/src/modules/inventory/forensic-alert.service.ts`
- `apps/admin_backend/src/modules/inventory/forensic-alert.service.spec.ts`
- `apps/admin_backend/src/modules/sales/dto/sync-invoice.dto.ts`
- `apps/admin_backend/src/modules/sales/dto/sync-batch.dto.ts`
- `apps/admin_backend/src/modules/inventory/entities/insumo.entity.ts`
- `apps/admin_backend/src/migrations/1767000000000-AddNegativeStockPolicyToInsumos.ts`
- `apps/admin_backend/src/modules/sales/services/invoices.service.ts`
- `apps/admin_backend/src/modules/sales/services/invoices.service.spec.ts`
- `apps/admin_backend/src/modules/inventory/inventory-movement.service.spec.ts`

## Notes
- Final focused fix batch (archive blockers):
  - Backend compile/lint blocker cleared: `inventory-movement.service.spec.ts` now uses an explicit `TransactionManagerMock` type (removes TS2502 self-reference), and `fx-rate-resolver.service.ts` now returns `Promise.resolve(1)` without unnecessary `async` (lint-safe for `require-await`).
  - UC-02 ordering proof hardened in POS sync: replay now prioritizes persisted sequence semantics when available; otherwise it preserves persisted retrieval order and assigns deterministic fallback `sourceSequence` values. Added explicit assertions for deterministic ordering and idempotency stability in `sync_service_test.dart`.
  - Flutter DB/design alignment applied as truthful-scope alignment (low-risk path): tasks/design now explicitly describe current local Floor registrations and defer advanced BOH projection tables from this change.
  - Verify commands run:
    - `apps/admin_backend`: `npm test` ✅, `npm run test:cov` ✅, `npm run lint` ✅
    - `apps/pos_app`: `flutter test` ✅, `flutter analyze` ✅
- Judgment Day Round 1 confirmed-fix batch applied: POS outbox now preserves persistent `sourceSequence` and carries valuation fields when present (no hardcoded `unitCostNio: 0`).
- Forensic alerts now keep DB insert and invoke async admin dispatch hook through `FORENSIC_ALERT_DISPATCHER` wiring path.
- FOH cancel flow now links `SALE_CANCEL` movements to original `SALE` kardex row via `compensationForKardexId` when resolvable.
- FOH append/delta paths now enforce explicit reject/log+skip policy for unresolved `insumo` to avoid silent zero-value corruption.
- `InvoicesService.syncBatch` now runs per-record inventory mutation inside `SERIALIZABLE` transaction with pessimistic row locks for insumo updates.
- PR3 intentionally implements soft expiry prioritization (fresh before expired) while explicitly avoiding strict FIFO lot-depletion enforcement, per design open question resolution.
- Production posting uses `SERIALIZABLE` transaction boundary and per-insumo pessimistic lock to preserve deterministic stock transitions under concurrent operations.
- Valuation traceability is captured as per-batch consumption metadata for each consumed insumo in production orders.
- FOH sync now uses active recipe snapshot + BOM explosion to emit ledger movements in insumo units; when no active recipe exists, it safely falls back to direct `productId` mapping to avoid data-loss in legacy catalogs.
- Topology transport is now explicit by role: `EDGE_SERVER` sends gzip batch envelope and `STANDALONE` sends plain JSON records while preserving a single outbox record contract.
- Runtime ledger entity now targets `inventory_kardex` (BIGSERIAL append-only table), aligning runtime writes with migration architecture.
- Production receipt movement valuation now uses consumed-value / produced-quantity derivation instead of fallback average cost.
- `forensic-alert.service.ts` extracted and used from shrinkage high-value alert path.
- Continuation fix cycle completed for pending PR5 stabilization: regenerated Flutter mocks with `build_runner`, updated `sync_service_test.dart` harness with deterministic fakes, and added explicit Topology A mixed batch coverage (`SALE` + `PURCHASE`/`SHRINKAGE`/`PRODUCTION`) in `invoices.service.spec.ts`.
- `InvoicesService.syncBatch` now computes `payload_hash` with invoice fallback (`documentType:idempotencyKey`) for non-invoice deltas, preventing runtime failure when mixed batches include non-FOH records.
- Quality-fix continuation (feature-branch-chain): cleared all current static-analysis debt in this slice. `flutter analyze` is now `No issues found`, and `npm run lint` now completes with zero errors after safe typing/test-mock cleanups.
- Round 2 Blocker Fix: Decoupled `dispatchToAdmins` in `forensic-alert.service.ts` from DB transaction by floating the Promise. Added a `.catch()` block to log dispatch failures using NestJS `Logger` without rolling back the primary inventory/shrinkage transaction.
- Final quality gate status: `apps/pos_app` targeted tests (`sync_service_test.dart`, `shrinkage_view_test.dart`) are passing, `flutter analyze` passes with no issues, and `apps/admin_backend` `npm run build` passes.
- Final spec-compliance blocker batch status:
  - FOH replay now accepts `recipeVersionId` in sync contracts (`SyncBatchRecordDto` and invoice item DTO) and binds explosion to that historical version when present; fallback to active version is explicit and tested.
  - Negative stock policy is explicit in inventory model via `insumos.negative_stock_policy` (`ALLOW_TEMPORARY|RESTRICT`) and enforced in replay posting paths (allow temporary negatives for configured food items, reject restricted negatives with policy error).
  - Kardex precision stress coverage now proves deterministic 4-decimal behavior over 1,000 repeated fractional operations.
  - Quality gates rerun after changes: `apps/admin_backend` → `npm test` ✅, `npm run lint` ✅, `npm run build` ✅, `npm run test:cov` ✅; `apps/pos_app` → `flutter analyze` ✅, `flutter test` ✅.
