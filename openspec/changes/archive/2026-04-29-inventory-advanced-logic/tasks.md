# Tasks: Advanced Inventory Logic

## Phase 1: Foundation

- [ ] 1.1 Create `lib/domain/services/alerts/alert_service.dart` with `notifyLowStock` interface.

## Phase 2: Core Implementation (Movement Engine Refactor)

- [ ] 2.1 Refactor `MovementEngineImpl` to use a private recursive method `_processRecipe(String productId, double multiplier, int depth)`.
- [ ] 2.2 Implement recursion depth protection (limit = 5) in `_processRecipe`.
- [ ] 2.3 Implement PAR level check logic after Insumo stock updates.
- [ ] 2.4 Add in-memory alert deduplication logic to `MovementEngineImpl`.

## Phase 3: Testing & Verification

- [ ] 3.1 Unit Test (RED): Verify `MovementEngine` descales a 3-level nested recipe.
- [ ] 3.2 Unit Test (RED): Verify circular dependency throws an error or stops at max depth.
- [ ] 3.3 Unit Test (RED): Verify `AlertService` is called when stock < parLevel.
- [ ] 3.4 Unit Test (RED): Verify alerts are deduplicated (not called twice for same insumo in same session).
- [ ] 3.5 Verify all tests GREEN after implementation.
