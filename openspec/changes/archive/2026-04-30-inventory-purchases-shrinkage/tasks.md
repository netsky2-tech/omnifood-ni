# Tasks: Inventory Purchases & Shrinkage

## Phase 1: Backend Implementation

- [x] 1.1 Create `PurchaseService` and `ShrinkageService` in `src/modules/inventory/`.
- [x] 1.2 Implement `recordPurchase` with conversion factor logic (NestJS).
- [x] 1.3 Create `PurchaseController` and `ShrinkageController` with endpoints.
- [x] 1.4 Register new services/controllers in `InventoryModule`.

## Phase 2: Domain/Data & Integration

- [x] 2.1 Update `InventoryRepository` in POS to support Purchase/Shrinkage entities.
- [x] 2.2 Add `Purchase` and `Shrinkage` domain models in Flutter (Freezed).
- [x] 2.3 Implement Kardex logging for purchases and shrinkage in the backend.

## Phase 3: Presentation (UI)

- [x] 3.1 Create `PurchaseView` and `PurchaseViewModel` (POS).
- [x] 3.2 Create `ShrinkageView` and `ShrinkageViewModel` (POS).
- [x] 3.3 Add navigation routes and integration tests for form submissions.

## Phase 4: Testing & Verification

- [x] 4.1 Unit Test (RED): Verify `InventoryService` purchase logic with conversion factors.
- [x] 4.2 Integration Test (RED): Verify WAC recalibration after multiple purchases.
- [x] 4.3 E2E Test (RED): Verify Kardex movement logs after purchase/shrinkage via API.
- [x] 4.4 Verify all tests GREEN.
