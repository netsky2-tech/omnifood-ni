# Tasks: Inventory Management Implementation

## Phase 1: Foundation (Entities & DB)

### Backend (NestJS)
- [x] 1.1 Create `src/modules/inventory/entities/insumo.entity.ts` with RLS.
- [x] 1.2 Create `src/modules/inventory/entities/product.entity.ts`.
- [x] 1.3 Create `src/modules/inventory/entities/recipe.entity.ts` and `inventory-movement.entity.ts`.
- [x] 1.4 Register entities in `AppModule`.

### POS App (Flutter)
- [x] 1.5 Create domain models in `lib/domain/models/inventory/`: `insumo.dart`, `recipe.dart`, `movement.dart` (Freezed).
- [x] 1.6 Create persistence entities in `lib/data/models/inventory/` (Floor).
- [x] 1.7 Create DAOs in `lib/data/daos/inventory/`: `insumo_dao.dart`, `recipe_dao.dart`, `movement_dao.dart`.
- [x] 1.8 Register new entities and DAOs in `lib/data/database/app_database.dart`.
- [x] 1.9 Run `build_runner` to generate Floor and Freezed code.

## Phase 2: Core Logic (Movement Engine)

- [x] 2.1 Implement `MovementEngine` in `lib/domain/services/inventory/` to handle recipe breakdown and stock updates.
- [x] 2.2 Add logic to `MovementEngine` for "Weighted Average Cost" updates.
- [x] 2.3 Implement `InventoryRepository` implementation in `lib/data/repositories/inventory_repository_impl.dart`.
- [x] 2.4 Implement `InventoryService` in NestJS for CRUD and WAC calculation.

## Phase 3: Integration & Sync

- [x] 3.1 Create `InventoryController` in NestJS with sync endpoints.
- [x] 3.2 Add "Real-time discount" call to a (mock) Sale feature in POS to verify `MovementEngine` integration.
- [x] 3.3 Implement DGI reversal logic: trigger `recordReversal()` when a sale is canceled.

## Phase 4: Testing (Verification)

- [x] 4.1 Unit Test: Verify `MovementEngine` correctly breaks down a recipe into Insumo discounts.
- [x] 4.2 Integration Test: Verify `Kardex` entries are correctly created for each transaction type in Floor.
- [x] 4.3 E2E Test: Verify stock levels in POS after a simulated sale match expected results (Scenario: Stock discount after sale).
- [x] 4.4 Verify DGI compliance: Sale cancellation must revert stock (Scenario: Reversing stock on cancellation).
