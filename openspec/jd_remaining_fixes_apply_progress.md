# Apply Progress: JD Remaining Fixes

**Status**: In Progress
**PR Slice**: PR1: Data Foundations & DAOs
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

## Tasks
- [x] 1.1 Create `BatchDeduction` domain model
- [x] 1.2 Add `batchDeductions` field to `InventoryMovement`
- [x] 1.3 Add `batch_deductions` column to `MovementEntity`
- [x] 1.4 Add migration to `AppDatabase`
- [x] 1.5 Update `InventoryMapper`
- [x] 1.6 Add `findByIds` to `InsumoDao` and `inventoryRepository`
- [x] 1.7 Add `updateSyncStatusForIds` to `InvoiceDao`
