# Progress: Gestión de Inventario Inteligente

## PR 1: Core Domain & Engine Setup
- [x] Create `MovementEngine` interface and basic implementation for BOM calculations.
- [x] Implement `ProcessSaleInventoryUseCase` to orchestrate BOM breakdown.
- [x] **TDD**: Unit tests for BOM calculations (raw material requirements vs. product quantity).

## PR 2: Inventory DAO & Transaction Handling
- [x] Modify `apps/pos_app/lib/data/daos/inventory/inventory_dao.dart` adding `@transaction` method `processInventoryMovements`.
- [x] **TDD**: Integration tests for atomic rollback scenarios (ensure no partial stock deduction on error).

## PR 3: Sales Integration (Refactoring SalesRepositoryImpl)
- [x] Integrate `ProcessSaleInventoryUseCase` into `SalesRepositoryImpl`.
- [x] **TDD**: Unit tests for end-to-end sales deduction flow (Sale -> BOM Calculation -> DAO).

## PR 4: Sync & Backend Logic
- [x] Implement conflict-resolution sorting (timestamp ASC) in `apps/admin_backend/src/modules/inventory/inventory.service.ts`.
- [x] Extend `SyncService` in Flutter and NestJS to handle `InventoryMovement` synchronization.
- [x] **TDD**: Unit tests in backend for chronological sorting of movements.

## PR 5: Shrinkage Implementation
- [x] Implement `ShrinkageView` (Flutter) replacing existing shell.
- [x] Implement `ShrinkageViewModel` with form validation.
- [x] **TDD**: Widget tests for `ShrinkageView` (assert input validation and VM interaction).

## PR 6: Cost Recalculation & Reversals
- [x] Implement `ReverseSaleInventoryUseCase` for handling cancellations (DGI compliance).
- [x] Implement `CostCalculatorService` in NestJS for theoretical cost update on purchase events.
- [x] **TDD**: Unit tests for reversal movement generation and cost recalculation logic.

### TDD Cycle Evidence
| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 4.1 | `inventory.service.spec.ts` | Unit | ✅ 3/3 | ✅ Written | ✅ Passed | ✅ 3 cases | ✅ Clean |
| 4.2 | `sync_service_test.dart` | Unit | N/A (new) | ✅ Written | ✅ Passed | ➖ Single | ✅ Clean |
| 4.2 | `inventory_repository_impl_test.dart` | Unit | N/A (new) | ✅ Written | ✅ Passed | ➖ Single | ✅ Clean |
| 4.3 | `inventory.service.spec.ts` | Unit | ✅ 4/4 | ✅ Written | ✅ Passed | ✅ 2 cases | ✅ Clean |
| 5.1 | `shrinkage_view_test.dart` | Widget | N/A (new) | ✅ Written | ✅ Passed | ✅ 2 cases | ✅ Clean |
| 6.1 | `reverse_sale_inventory_use_case_test.dart` | Unit | N/A (new) | ✅ Written | ✅ Passed | ✅ 1 case | ✅ Clean |
| 6.2 | `cost-calculator.service.spec.ts` | Unit | N/A (new) | ✅ Written | ✅ Passed | ✅ 3 cases | ✅ Clean |
| 6.3 | `inventory.service.spec.ts` | Unit | ✅ 5/5 | ✅ Written | ✅ Passed | ✅ 2 cases | ✅ Clean |

