# Tasks: Inventory Master Data & UI Base

## Phase 1: Foundation (Backend & DB)

- [x] 1.1 Create `Supplier` and `Warehouse` entities in NestJS with RLS.
- [x] 1.2 Update `Insumo` and `Product` entities in NestJS with `warehouse_id` and `is_perishable`.
- [x] 1.3 Update `Insumo` and `Product` Floor entities in POS app.
- [x] 1.4 Create `Supplier` and `Warehouse` Floor entities and DAOs in POS app.
- [x] 1.5 Register new entities in `AppDatabase` (Flutter) and `AppModule` (NestJS).
- [x] 1.6 Run `build_runner` for Floor/Freezed generation.

## Phase 2: Domain & Data (Infrastructure)

- [x] 2.1 Update `InventoryRepository` interface and implementation in POS.
- [x] 2.2 Implement CRUD logic for Suppliers and Warehouses in `InventoryRepositoryImpl`.
- [x] 2.3 Correct `InventoryService` in NestJS to apply `conversionFactor` in `recordPurchase`.

## Phase 3: Presentation (UI Features)

- [x] 3.1 Create `SupplierViewModel` and `SupplierView` in `lib/ui/features/inventory/suppliers/`.
- [x] 3.2 Create `WarehouseViewModel` and `WarehouseView` in `lib/ui/features/inventory/warehouses/`.
- [x] 3.3 Create `InsumoViewModel` and `InsumoView` (Manage Items) in `lib/ui/features/inventory/items/`.
- [x] 3.4 Wire routes in `main.dart`.

## Phase 4: Testing & Verification

- [x] 4.1 Unit Test: CRUD state management in new ViewModels.
- [x] 4.2 Integration Test: Verify `conversionFactor` logic in `recordPurchase` (Backend).
- [x] 4.3 UI Smoke Test: Verify form validation and submission in POS.
