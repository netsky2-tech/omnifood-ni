# Apply Progress: JD Remaining Fixes

**Status**: In Progress
**PR Slice**: PR3: Sales Integrity & Backend
**Mode**: Strict TDD

## TDD Cycle Evidence
| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.1 | `test/domain/models/inventory/batch_deduction_test.dart` | Unit | N/A (new) | ✅ Written | ✅ Passed | ✅ 2 cases | ✅ Clean |
| 1.2 | `test/domain/models/inventory/inventory_movement_test.dart` | Unit | N/A (new) | ✅ Written | ✅ Passed | ✅ 2 cases | ✅ Clean |
| 1.3 | `test/data/models/inventory/movement_entity_test.dart` | Unit | N/A (new) | ✅ Written | ✅ Passed | ➖ Single | ✅ Clean |
| 1.4 | `test/data/database/inventory_database_test.dart` | Integration | ✅ 1/1 | ✅ Written | ✅ Passed | ➖ Single | ✅ Clean |
| 1.5 | `test/data/mappers/inventory_mapper_test.dart` | Unit | N/A (new) | ✅ Written | ✅ Passed | ✅ 2 cases | ✅ Clean |
| 1.6 | `test/data/repositories/inventory/inventory_repository_impl_test.dart` | Unit | ✅ 2/2 | ✅ Written | ✅ Passed | ➖ Single | ✅ Clean |
| 1.7 | `test/data/database/sales_database_test.dart` | Integration | N/A (new) | ✅ Written | ✅ Passed | ➖ Single | ✅ Clean |
| 2.1 | `test/domain/services/inventory/movement_engine_fifo_test.dart` | Unit | ✅ 5/5 | ✅ Written | ✅ Passed | ✅ 2 cases | ✅ Clean |
| 2.2 | `test/domain/services/inventory/movement_engine_fifo_test.dart` | Unit | ✅ 5/5 | ✅ Written | ✅ Passed | ✅ 2 cases | ✅ Clean |
| 2.3 | `test/domain/services/inventory/movement_engine_fifo_test.dart` | Unit | ✅ 5/5 | ✅ Written | ✅ Passed | ✅ 2 cases | ✅ Clean |
| 3.1 | `test/data/database/sales_transaction_integrity_test.dart` | Integration | ✅ 1/1 | ✅ Written | ✅ Passed | ➖ Single | ✅ Clean |
| 3.2 | `test/data/database/sales_transaction_integrity_test.dart` | Integration | ✅ 1/1 | ✅ Written | ✅ Passed | ✅ 2 cases | ✅ Clean |
| 3.3 | `test/data/database/sales_database_test.dart` | Integration | ✅ 1/1 | ✅ Written | ✅ Passed | ➖ Single | ✅ Clean |
| 4.2 | `modules/sales/services/invoices.service.spec.ts` | Unit | ✅ 3/3 | ✅ Written | ✅ Passed | ✅ 2 cases | ✅ Clean |
| 5.1 | `test/ui/features/inventory/shrinkage/shrinkage_view_test.dart` | Widget | N/A (new) | ✅ Written | ✅ Passed | ➖ Single | ✅ Clean |
| 5.2 | `test/ui/features/inventory/shrinkage/shrinkage_view_test.dart` | Widget | N/A (new) | ✅ Written | ✅ Passed | ➖ Single | ✅ Clean |
| 5.3 | `test/ui/features/inventory/shrinkage/shrinkage_view_test.dart` | Widget | N/A (new) | ✅ Written | ✅ Passed | ➖ Single | ✅ Clean |
| 5.4 | `test/ui/features/inventory/shrinkage/shrinkage_view_test.dart` | Widget | N/A (new) | ✅ Written | ✅ Passed | ➖ Single | ✅ Clean |

## Tasks
- [x] 1.1 Create `BatchDeduction` domain model
- [x] 1.2 Add `batchDeductions` field to `InventoryMovement`
- [x] 1.3 Add `batch_deductions` column to `MovementEntity`
- [x] 1.4 Add migration to `AppDatabase`
- [x] 1.5 Update `InventoryMapper`
- [x] 1.6 Add `findByIds` to `InsumoDao` and `inventoryRepository`
- [x] 1.7 Add `updateSyncStatusForIds` to `InvoiceDao`
- [x] 2.1 Refactor `MovementEngineImpl._buildMovements` for bulk loading
- [x] 2.2 Implement FIFO batch consumption logic in `_buildMovements`
- [x] 2.3 Ensure `batchDeductions` are attached to movements
- [x] 2.4 Test: Verify `_buildMovements` executes exactly 1 repository call for all recipe ingredients
- [x] 2.5 Test: Verify FIFO logic exhausts batches in expiration date order and records deductions
- [x] 3.1 Update `SalesTransactionDao.executeSaleTransaction` to insert `SALE_CREATED` audit entry inside the transaction
- [x] 3.2 Implement cumulative total validation in `SalesRepositoryImpl.createCreditNote` (Enforced in DAO)
- [x] 3.3 Refactor `SalesRepositoryImpl.markAsSynced` to use `invoiceDao.updateSyncStatusForIds`
- [x] 3.4 Test: Verify `SALE_CREATED` audit entry is rolled back if sale persistence fails
- [x] 3.5 Test: Verify credit note rejection when `existing_totals + new_total > original_invoice_total`
- [x] 4.1 Update `SyncInvoiceDto` in `apps/admin_backend/src/modules/sales/dto/sync-invoice.dto.ts` for items/payments
- [x] 4.2 Implement child entity reconciliation using TypeORM `upsert` in `InvoicesService.syncInvoices`
- [x] 4.3 Test: Verify backend re-sync of existing invoice updates items/payments status via `ON CONFLICT`
- [x] 5.1 Add `isLoading` check to disable "REGISTRAR" button in `apps/pos_app/lib/ui/features/inventory/shrinkage/shrinkage_view.dart`
- [x] 5.2 Implement `dispose()` for `qtyController` and `reasonController` in `ShrinkageView`
- [x] 5.3 Replace `DropdownButtonFormField` with a searchable autocomplete widget for insumo selection
- [x] 5.4 Test: Verify search filtering logic in the new autocomplete widget

## Notes
- Task 2.1 and 2.4 are partially covered by `test/domain/services/inventory/movement_engine_fifo_test.dart`.
- Task 2.2 and 2.5 are covered by `test/domain/services/inventory/fifo_logic_test.dart` and `movement_engine_fifo_test.dart`.
- Renamed `_processRecipe` to `_buildMovements` to align with design and improve clarity.
- For Task 3.2, validation was moved to `SalesTransactionDao.executeSaleTransaction` to ensure atomicity and prevent race conditions between validation and insertion.
- Task 3.3: `markAsSynced` now accepts `List<String>` and uses a single SQL update.
- Task 4.2: Switched to `repository.upsert` to comply with `ON CONFLICT` requirement and ensure items/payments are reconciled.
- Task 5.1-5.4: Implemented in `ShrinkageView` with `Autocomplete` and `StatefulBuilder` to ensure UI reactivity. Added widget tests covering filtering and loading states.

