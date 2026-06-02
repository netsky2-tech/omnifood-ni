# Tasks: BOH Inventory Production Full Implementation

## Review Workload Forecast
| Field | Value |
|---|---|
| Estimated changed lines | 2200-3200 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR1→PR2→PR3→PR4→PR5 |
| Delivery strategy | ask-on-risk (from ask-always) |
| Chain strategy | feature-branch-chain |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

### Suggested Work Units
| Unit | Goal | Likely PR | Notes |
|---|---|---|---|
| 1 | Migration + entities | PR 1 | Additive rollout, `NUMERIC(14,4)` |
| 2 | CPP + kardex tx engine | PR 2 | `SERIALIZABLE` + lock `insumos` |
| 3 | Recipe/BOM + production/shrinkage | PR 3 | Include soft-expiry traceability |
| 4 | Topology sync + FOH hooks | PR 4 | GZIP batch envelope flow |
| 5 | Flutter wiring + tests/docs | PR 5 | Floor positional `@transaction` |

## Phase 0: Scope Lock
- [x] 0.1 Add `openspec/changes/boh_inventory_production_full_implementation/acceptance-matrix.md` mapping PRD/UCs to scenarios.

## Phase 1: Migration & Ledger
- [x] 1.1 Create `apps/admin_backend/src/migrations/*-BohInventoryLedgerFoundation.ts` with append-only ledger, outbox, receipts, alerts, and `NUMERIC(14,4)`.
- [x] 1.2 Update `apps/admin_backend/src/modules/inventory/entities/*.ts` for insumo, kardex, production, shrinkage, recipe version/detail.

## Phase 2: CPP Concurrency
- [x] 2.1 Implement movement posting in `inventory-movement.service.ts` using `DataSource.transaction('SERIALIZABLE')` + `SELECT ... FOR UPDATE`.
- [x] 2.2 Implement BCN FX-by-date and NIO-only CPP in `inventory-purchase.service.ts`.

## Phase 3: Recipe/BOM
- [x] 3.1 Implement immutable recipe versions in `recipe*.entity.ts` and `recipe.service.ts`.
- [x] 3.2 Implement deterministic recursive explosion in `bom-explosion.service.ts`.

## Phase 4: Production & Expiry
- [x] 4.1 Implement atomic consume+receipt flows in `production.service.ts` and `production-order*.entity.ts`.
- [x] 4.2 Implement valuation traceability + soft expiry in `batch-costing.service.ts` (no strict FIFO depletion).

## Phase 5: Shrinkage/Corrections
- [x] 5.1 Implement typed shrinkage in `shrinkage.service.ts` + entities with 4-decimal costs.
- [x] 5.2 Implement compensating-only corrections in `inventory-adjustment.service.ts`.

## Phase 6: Topology Sync
- [x] 6.1 Use one outbox structure for both topologies; branch transport by `ROLE=EDGE_SERVER|STANDALONE`.
- [x] 6.2 Implement 500-record GZIP JSON Batch Envelope in `apps/pos_app/lib/data/services/sync_service.dart` to POST `/api/v1/sync/batch` and bulk UPDATE on 200.

## Phase 7: FOH & Alerts
- [x] 7.1 Update `apps/admin_backend/src/modules/sales/services/invoices.service.ts` to emit immutable `SALE`/`SALE_CANCEL` intents.
- [x] 7.2 Implement role-targeted forensic alerts in `forensic-alert.service.ts` and inventory ViewModels.

## Phase 8: Flutter Offline Wiring
- [x] 8.1 Update `apps/pos_app/lib/data/database/app_database.dart` and current inventory DAOs for implemented scope (insumos/products/recipes/movements/purchases/suppliers/warehouses/uom/batches); keep Floor `@transaction` methods positional-only.
- [x] 8.2 Add Freezed models in `apps/pos_app/lib/domain/models/inventory/*.dart` and `ChangeNotifier` ViewModels in `lib/ui/features/inventory/**`.

## Phase 9: Verification & Docs
- [x] 9.1 RED→GREEN→REFACTOR Jest tests for concurrent CPP, idempotent replay, production atomicity, FOH cancel reversal.
- [x] 9.2 Add Flutter repository/widget tests for offline outbox ordering and update openspec UAT evidence + PR slicing notes.
