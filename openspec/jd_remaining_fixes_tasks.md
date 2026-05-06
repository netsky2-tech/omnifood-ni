# Tasks: JD Remaining Fixes

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 700 - 900 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (Data) → PR 2 (Logic) → PR 3 (Sales/BE) → PR 4 (UI) |
| Delivery strategy | auto-chain |
| Chain strategy | feature-branch-chain |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Data Infrastructure | PR 1 | Base branch: tracker; Models, Entities, DAOs, Migration |
| 2 | Inventory Logic | PR 2 | Base branch: PR 1; FIFO, Bulk queries, Movement Engine |
| 3 | Sales Integrity & BE | PR 3 | Base branch: PR 2; Audit, Credit Notes, Sync, Backend |
| 4 | UI Enhancements | PR 4 | Base branch: PR 3; Shrinkage form guards, Autocomplete |

## Phase 1: Data Foundations (Infrastructure)

- [x] 1.1 Create `BatchDeduction` domain model in `apps/pos_app/lib/domain/models/inventory/batch_deduction.dart`
- [x] 1.2 Add `batchDeductions` field to `InventoryMovement` domain model
- [x] 1.3 Add `batch_deductions` column (TEXT) to `MovementEntity` in `apps/pos_app/lib/data/models/inventory/movement_entity.dart`
- [x] 1.4 Add migration to `AppDatabase` for `batch_deductions` column in `apps/pos_app/lib/data/database/app_database.dart`
- [x] 1.5 Update `InventoryMapper` to handle `batchDeductions` JSON serialization/deserialization
- [x] 1.6 Add `findByIds(List<String> ids)` to `InsumoDao` and implement in `InventoryRepository`
- [x] 1.7 Add `updateSyncStatusForIds(List<String> ids, String status)` to `InvoiceDao`

## Phase 2: Inventory Engine Refactor (FIFO & Performance)

- [x] 2.1 Refactor `MovementEngineImpl._buildMovements` to use `inventoryRepository.getInsumosByIds` for bulk loading
- [x] 2.2 Implement FIFO batch consumption logic in `_buildMovements` calling `getBatchesForConsumption`
- [x] 2.3 Ensure `batchDeductions` are attached to generated `InventoryMovement` records
- [x] 2.4 Test: Verify `_buildMovements` executes exactly 1 repository call for all recipe ingredients
- [x] 2.5 Test: Verify FIFO logic exhausts batches in expiration date order and records deductions

## Phase 3: Sales Integrity & Performance (Integrity)

- [x] 3.1 Update `SalesTransactionDao.executeSaleTransaction` to insert `SALE_CREATED` audit entry inside the transaction
- [x] 3.2 Implement cumulative total validation in `SalesRepositoryImpl.createCreditNote`
- [x] 3.3 Refactor `SalesRepositoryImpl.markAsSynced` to use `invoiceDao.updateSyncStatusForIds`
- [x] 3.4 Test: Verify `SALE_CREATED` audit entry is rolled back if sale persistence fails
- [x] 3.5 Test: Verify credit note rejection when `existing_totals + new_total > original_invoice_total`

## Phase 4: Backend Sync Reconciliation (Infrastructure)

- [x] 4.1 Update `SyncInvoiceDto` in `apps/admin_backend/src/modules/sales/dto/sync-invoice.dto.ts` for items/payments
- [x] 4.2 Implement child entity reconciliation using TypeORM `upsert` in `InvoicesService.syncInvoices`
- [x] 4.3 Test: Verify backend re-sync of existing invoice updates items/payments status via `ON CONFLICT`

## Phase 5: UI UX Guards (UX)

- [x] 5.1 Add `isLoading` check to disable "REGISTRAR" button in `apps/pos_app/lib/ui/features/inventory/shrinkage/shrinkage_view.dart`
- [x] 5.2 Implement `dispose()` for `qtyController` and `reasonController` in `ShrinkageView`
- [x] 5.3 Replace `DropdownButtonFormField` with a searchable autocomplete widget for insumo selection
- [x] 5.4 Test: Verify search filtering logic in the new autocomplete widget
