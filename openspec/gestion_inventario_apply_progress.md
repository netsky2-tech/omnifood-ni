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

