# Tasks: Gestión de Inventario Inteligente

This file outlines the implementation tasks for the Inventory Management module. 
Strategy: `auto-chain` (Stacked PRs). 
Mode: `Strict TDD` (Tests must precede or accompany every logical change).

## Review Workload Forecast
The implementation is broken into 6 logical slices. Each slice is designed to be small (under 400 changed lines) to ensure high review quality and adhere to the cognitive budget.

### PR 1: Core Domain & Engine Setup
- [x] Create `MovementEngine` interface and basic implementation for BOM calculations.
- [x] Implement `ProcessSaleInventoryUseCase` to orchestrate BOM breakdown.
- [x] **TDD**: Unit tests for BOM calculations (raw material requirements vs. product quantity).

### PR 2: Inventory DAO & Transaction Handling
- [x] Modify `apps/pos_app/lib/data/daos/inventory/inventory_dao.dart` adding `@transaction` method `processInventoryMovements`.
- [x] **TDD**: Integration tests for atomic rollback scenarios (ensure no partial stock deduction on error).

### PR 3: Sales Integration (Refactoring SalesRepositoryImpl)
- [x] Integrate `ProcessSaleInventoryUseCase` into `SalesRepositoryImpl`.
- [x] **TDD**: Unit tests for end-to-end sales deduction flow (Sale -> BOM Calculation -> DAO).

### PR 4: Sync & Backend Logic
- [x] Implement conflict-resolution sorting (timestamp ASC) in `apps/admin_backend/src/modules/inventory/inventory.service.ts`.
- [x] Extend `SyncService` in Flutter and NestJS to handle `InventoryMovement` synchronization.
- [x] **TDD**: Unit tests in backend for chronological sorting of movements.

### PR 5: Shrinkage Implementation
- [x] Implement `ShrinkageView` (Flutter) replacing existing shell.
- [x] Implement `ShrinkageViewModel` with form validation.
- [x] **TDD**: Widget tests for `ShrinkageView` (assert input validation and VM interaction).

### PR 6: Cost Recalculation & Reversals
- [ ] Implement `ReverseSaleInventoryUseCase` for handling cancellations (DGI compliance).
- [ ] Implement `CostCalculatorService` in NestJS for theoretical cost update on purchase events.
- [ ] **TDD**: Unit tests for reversal movement generation and cost recalculation logic.
