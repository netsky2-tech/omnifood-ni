# Apply Progress: JD Remaining Fixes

**Status**: In Progress
**PR Slice**: PR2: Inventory Engine Refactor
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

## Notes
- Task 2.1 and 2.4 are partially covered by `test/domain/services/inventory/movement_engine_fifo_test.dart`.
- Task 2.2 and 2.5 are covered by `test/domain/services/inventory/fifo_logic_test.dart` and `movement_engine_fifo_test.dart`.
- Renamed `_processRecipe` to `_buildMovements` to align with design and improve clarity.

