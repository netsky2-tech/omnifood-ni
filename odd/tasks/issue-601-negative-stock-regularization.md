# #601 — Negative-Stock Regularization Lifecycle Wiring (PROVISIONAL → REGULARIZED)

## Goal

Connect the fully-built but orphaned `NegativeStockRegularizationService` into the production sale and replenishment purchase flows, so that sales occurring with zero or negative stock are marked `PROVISIONAL (10)` and enqueued into `kardex_recalculate_queue`, and subsequent replenishment purchases automatically recalculate pending provisional movements and record immutable `kardex_corrections` with deterministic SHA-256 lineage hashes.

## Root Cause & Context

- `openspec/specs/inventory-kardex-ledger/spec.md` specifies that:
  - "Any sale or consumption occurring with zero or negative stock MUST be recorded with `PROVISIONAL` costing and enqueued into `kardex_recalculate_queue`."
  - "When a replenishment purchase arrives, the system MUST retrocalculate pending provisional movements using deterministic formulas and an immutable SHA-256 lineage hash."
  - "The POS system MUST dispatch local kardex corrections via `POST /inventory/regularization/sync`."
- The service (`NegativeStockRegularizationService`), calculation engine (`KardexRecalculationEngine`), queue DAO, correction DAO, and backend endpoint (`RegularizationController.syncCorrections`) are all fully built and tested in isolation.
- However, zero callers existed in production:
  - `_persistSale` in `sales_transaction_dao.dart` never checked for negative stock, never marked movements as provisional (`estadoCosteo: 10`), and never enqueued them.
  - `movement_engine_impl.dart:recordPurchase` and `PurchaseViewModel.recordPurchase` never called `processPendingQueueForInsumo()`, and omitted `unitCostNio: cost` on the created purchase `InventoryMovement`.
  - `NegativeStockRegularizationService` was never instantiated or injected in `main.dart`.

## Design Decisions

1. **R1: Atomic Sale Hook in `_persistSale`**:
   - Inside `SalesTransactionDao._persistSale`, for each movement, check `isProvisional = insumo.stock <= 0 || newStock < 0`.
   - When provisional, set `estadoCosteo: 10` (PROVISIONAL) and populate `unitCostNio: movement.unitCostNio ?? insumo.averageCost`.
   - Atomically insert a `KardexRecalculateQueueEntity` into `kardex_recalculate_queue` with `status: 'PENDING'`.
   - Add `@Insert(onConflict: OnConflictStrategy.replace) Future<void> insertKardexRecalculateQueueItem(KardexRecalculateQueueEntity item);` to `SalesTransactionDao`.
   - This ensures atomicity: if checkout rolls back, the queue item rolls back too. Checkout is never blocked (Q80 invariant).
2. **R2: Purchase Replenishment Hook in `recordPurchase`**:
   - In `movement_engine_impl.dart`, set `unitCostNio: cost` on the purchase `InventoryMovement`.
   - In `recordPurchase`, when `regularizationService != null`, await `regularizationService.processPendingQueueForInsumo(insumoId: insumoId, triggerMovement: InventoryMapper.toMovementEntity(movement))`.
   - Any throw during regularization must degrade gracefully without rolling back or failing the purchase itself.
   - Accept optional `NegativeStockRegularizationService? regularizationService` in `MovementEngineImpl` and `PurchaseViewModel`.
3. **R3: Cloud Dispatch Verification**:
   - `_syncKardexCorrections` in `sync_service.dart:1681` already reads `inventoryRepository.getKardexCorrections()` and pushes to `/inventory/regularization/sync`.
4. **Wiring in `main.dart`**:
   - Instantiate `NegativeStockRegularizationService(database: database, engine: const KardexRecalculationEngine())` and pass it to `MovementEngineImpl` and `PurchaseViewModel`.
5. **R4: Integration Testing**:
   - Add tests proving that an overselling sale automatically produces a movement with `estadoCosteo == 10` and a `PENDING` queue entry.
   - Add tests proving that recording a purchase automatically processes the queue, persists a `kardex_corrections` row with a SHA-256 `lineageHash`, and sets queue status to `COMPLETED`.

## Allowed Edit Surfaces

- `apps/pos_app/lib/data/daos/sales/sales_transaction_dao.dart`
- `apps/pos_app/lib/data/database/app_database.dart`
- `apps/pos_app/lib/data/database/app_database.g.dart`
- `apps/pos_app/lib/domain/services/inventory/movement_engine_impl.dart`
- `apps/pos_app/lib/ui/features/inventory/purchases/purchase_view_model.dart`
- `apps/pos_app/lib/main.dart`
- `apps/pos_app/test/kardex_retrocalculation_e2e_integration_test.dart`
- `apps/pos_app/test/data/database/sales_transaction_kardex_stock_test.dart`
- `odd/tasks/issue-601-negative-stock-regularization.md`

## Verification Commands

From `apps/pos_app`:
1. `flutter pub run build_runner build --delete-conflicting-outputs`
2. `flutter test --concurrency=1 test/data/database/sales_transaction_kardex_stock_test.dart`
3. `flutter test --concurrency=1 test/kardex_retrocalculation_e2e_integration_test.dart`
4. `flutter test --concurrency=1 test/domain/services/inventory/negative_stock_regularization_service_test.dart`
5. `flutter analyze`

## Implementation Evidence (worker, #601 wiring)

- R1: `SalesTransactionDao` gained `insertKardexRecalculateQueueItem` (REPLACE) and
  `_persistSale` now computes `isProvisional = insumo.stock <= 0 || newStock < 0`,
  persists the movement with `estadoCosteo: 10` + `unitCostNio ?? insumo.averageCost`,
  and enqueues a `PENDING` `kardex_recalculate_queue` row inside the same Floor
  transaction. Because `movement_entity.dart` is outside the allowed edit surfaces,
  the persisted copy is built with the explicit `MovementEntity` constructor instead
  of extending `copyWith`.
- R2: `MovementEngineImpl` accepts optional `regularizationService`, sets
  `unitCostNio: cost` on the purchase movement, and calls
  `processPendingQueueForInsumo` after `saveMovement`, degrading gracefully on
  error. `PurchaseViewModel` accepts the optional positional third argument.
- DI: `main.dart` instantiates `NegativeStockRegularizationService(database,
  KardexRecalculationEngine())` and injects it into `MovementEngineImpl` and
  `PurchaseViewModel`.
- R4: two DAO tests added to `sales_transaction_kardex_stock_test.dart` (neg stock
  -> estadoCosteo 10 + PENDING queue; positive stock -> 30 + empty queue) and one
  production-wiring E2E added to `kardex_retrocalculation_e2e_integration_test.dart`
  (real `saveSale` -> estadoCosteo 10 + PENDING; real `recordPurchase` -> correction
  with `lineageHash` + queue `COMPLETED`).
- RED observed: DAO test failed `Expected: <10> Actual: <30>` before implementation;
  E2E test failed to compile (`No named parameter with the name
  'regularizationService'`) before implementation.
- GREEN observed: all listed commands pass (`flutter analyze`: No issues found).
- Note: the authorized `build_runner` run also refreshed three generated
  `*.mocks.dart` files outside the delegated edit surfaces — required companions
  (new `insertKardexRecalculateQueueItem` stubs on `MockSalesTransactionDao`);
  reverting them would break compilation.
