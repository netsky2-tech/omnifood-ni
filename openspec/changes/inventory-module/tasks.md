# Tasks: Inventory & Recipe Module

## Phase 1: Domain Entities (Core)
- [ ] 1.1 Create `apps/pos_app/lib/domain/models/ingredient.dart` (Plain entity).
- [ ] 1.2 Create `apps/pos_app/lib/domain/models/product.dart` (Plain entity).
- [ ] 1.3 Create `apps/pos_app/lib/domain/models/recipe_item.dart` (Join entity).
- [ ] 1.4 Create `apps/pos_app/lib/domain/models/inventory_adjustment.dart` (Delta entity).

## Phase 2: Repository Interfaces
- [ ] 2.1 Create `apps/pos_app/lib/domain/repositories/inventory_repository.dart` (Interface).

## Phase 3: Data Layer (Floor/SQLite)
- [ ] 3.1 Create Floor entity tables in `apps/pos_app/lib/data/models/` for all 4 domain entities.
- [ ] 3.2 Create `apps/pos_app/lib/data/database.dart` with initial schema and DAOs.
- [ ] 3.3 Implement `InventoryRepositoryImpl` in `apps/pos_app/lib/data/repositories/`.

## Phase 4: Business Logic
- [ ] 4.1 Implement stock calculation logic (sum of deltas) in the Repository implementation.
- [ ] 4.2 Create a `ProcessSaleUseCase` that inserts adjustments based on recipes.

## Phase 5: Verification & Tests
- [ ] 5.1 Write unit tests for stock calculation logic.
- [ ] 5.2 Write integration tests for SQLite DAOs.
- [ ] 5.3 Verify automatic stock discounting on a simulated sale.
