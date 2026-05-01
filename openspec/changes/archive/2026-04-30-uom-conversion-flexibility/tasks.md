# Tasks: UOM Conversion Flexibility

## Phase 1: Backend Implementation

- [x] 1.1 Create `src/modules/inventory/entities/uom-conversion.entity.ts`.
- [x] 1.2 Register `UomConversion` in `InventoryModule`.
- [x] 1.3 Update `PurchaseService.recordPurchase` to accept `uomConversionId` and use dynamic factor.

## Phase 2: Domain/Data & Infrastructure (Flutter)

- [x] 2.1 Create `lib/domain/models/inventory/uom_conversion.dart`.
- [x] 2.2 Create `lib/data/models/inventory/uom_conversion_entity.dart` (Floor).
- [x] 2.3 Create `lib/data/daos/inventory/uom_conversion_dao.dart`.
- [x] 2.4 Register entities/DAOs in `AppDatabase`.
- [x] 2.5 Run `build_runner`.

## Phase 3: Presentation (UI)

- [x] 3.1 Update `PurchaseView` to show `UomConversion` dropdown.
- [x] 3.2 Update `InsumoView` to manage conversion factors list.
- [x] 3.3 Update `PurchaseViewModel` to load UOM conversions and calculate based on selected factor.

## Phase 4: Testing & Verification

- [x] 4.1 Unit Test (RED): Verify `PurchaseService` with multiple conversion factors.
- [x] 4.2 Integration Test (RED): Verify conversion in DB.
- [x] 4.3 Verify all tests GREEN.
