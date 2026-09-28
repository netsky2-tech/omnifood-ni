# #524 — Real previousStock and newStock on the Frozen Kardex Path

## Goal

Ensure inventory movements persisted during sales, voids, and credit notes carry genuine `previousStock` and `newStock` values reflecting the actual insumo balance transitions, eliminating the `0 → 0` display in the on-device Kardex ledger.

## Root Cause & Context

- On the frozen (`SALE_TIME_V1`) sale path, `_frozenMovements` (`sales_repository_impl.dart:383`) constructs `MovementEntity` with `previousStock: 0, newStock: 0`. This is appropriate at preparation time, because the ambient balance at that moment may not match the transaction time balance.
- However, inside the atomic Floor `@transaction` in `sales_transaction_dao.dart`:
  - `_persistSale` (lines ~285-305) reads `insumo.stock`, computes `newStock = insumo.stock + movement.quantity`, and updates `InsumoEntity(stock: newStock)`. But it inserts `movement` without setting `previousStock` or `newStock`.
  - `executeSaleTransaction` (credit note restocks, lines ~320-340) computes `newStock` and updates the insumo, but inserts `movement` with zeros.
  - `executeVoidTransaction` (cancellation/void reversals, lines ~400-425) computes `newStock` and updates the insumo, but inserts `movement` with zeros.
- As a result, the `inventory_movements` SQLite table stores `0` for both columns on all frozen-path transactions.
- The POS Kardex screen (`kardex_view_model.dart:271-272`) reads these columns directly, rendering `0 → 0` for all sales.

## Design Decisions

1. **Transaction-Time Stock Capture (K1)**:
   Inside `_persistSale`, `executeSaleTransaction`, and `executeVoidTransaction`, the inserted movement is populated with:
   - `previousStock: insumo.stock` (freshly read from SQLite inside the transaction)
   - `newStock: newStock` (`insumo.stock + movement.quantity`)
2. **Deterministic Insumo Ordering (K2)**:
   In all three transaction methods, before iterating movements, order them deterministically by `(insumoId, id)`. When a single sale contains multiple lines consuming the same insumo (e.g. 2 different dishes with Mozzarella), the sequential processing inside the SQLite transaction ensures:
   `movement[n].previousStock == movement[n-1].newStock`, and `movement[last].newStock == insumo.stock`.
3. **Replay Determinism Contract Preserved**:
   `executeFulfillmentSaleTransaction` computes `_checkoutHash` on the input `movements` parameter (lines 208 and 253). By inserting `movement.copyWith(previousStock: insumo.stock, newStock: newStock)` into the database while leaving the input `movements` collection unmutated, the payload hash remains identical between first execution and subsequent replay checks.
4. **Historical Audit Immobility (K5)**:
   `inventory_movements` is protected by `BEFORE UPDATE OR DELETE` immutability triggers (`migrations.dart:76-100`). Historical rows with `0, 0` are immutable pre-fix provenance; they are deliberately NOT rewritten.
5. **Purchase Extension Cleanup (K3)**:
   In `purchase_view_model.dart`, update `PurchaseX.toMovement({double previousStock = 0.0})` to compute `newStock = previousStock + quantity` and remove the outdated `Should be` comments.

## Allowed Edit Surfaces

- `apps/pos_app/lib/data/models/inventory/movement_entity.dart`
- `apps/pos_app/lib/data/daos/sales/sales_transaction_dao.dart`
- `apps/pos_app/lib/ui/features/inventory/purchases/purchase_view_model.dart`
- `apps/pos_app/test/integration/authority_hydration_kardex_integration_test.dart`
- `apps/pos_app/test/data/database/sales_transaction_kardex_stock_test.dart`
- `odd/tasks/issue-524-frozen-kardex-real-stock.md`

## Verification

From `apps/pos_app`:
1. `flutter test --concurrency=1 test/data/database/sales_transaction_kardex_stock_test.dart`
2. `flutter test --concurrency=1 test/integration/authority_hydration_kardex_integration_test.dart`
3. `flutter test --concurrency=1 test/data/daos/fulfillment_persistence_dao_test.dart`
4. `flutter test --concurrency=1`
5. `flutter analyze`

## Execution Record (2026-07-23)

- RED observed before implementation:
  - Integration fence: `Expected: <10.0> Actual: <0.0>`
    (`authority_hydration_kardex_integration_test.dart:333`).
  - New DAO tests: `Expected: <10.0> Actual: <0.0>` (K4 sale, replay),
    `Expected: <8.0> Actual: <0.0>` (K4-void); credit-note case was a
    fixture fix (unique `invoice_number`) before it could exercise the path.
- GREEN observed after implementation: 8/8 passing across the two focused
  files; replay determinism accepted the identical second checkout with
  `previousStock/newStock` persisted and stock applied exactly once.
- Verification results:
  1. new DAO test file: All tests passed (4 tests).
  2. integration fence: All tests passed (4 tests, incl. #519 counter-case).
  3. `fulfillment_persistence_dao_test.dart`: All tests passed (8 tests).
  4. full suite `flutter test --concurrency=1`: 2303 pass with intermittent
     LOADING failures in unrelated UI/domain files that vary per run
     (business_profile_view_model, cloud_sync_status_badge, then
     ohac_delivery_dao, stock_alerts_view_model, catalog_type); every one
     passes when run individually — pre-existing full-suite load flakiness,
     not caused by this change.
  5. `flutter analyze`: No issues found.
  6. `git status --porcelain`: only the six allowed surfaces touched.
- Implementation notes: K1/K2/K3 applied as designed; input movement
  collections stay unmutated (verified by assertions on the input objects),
  `_checkoutHash` replay identity preserved; K5 untouched (no migration of
  historical `0, 0` rows).
