# Tasks: Batch & FIFO Tracking
## Phase 1: Foundation (Entities & DB)

- [x] 1.1 Create `src/modules/inventory/entities/batch.entity.ts` (NestJS).
- [x] 1.2 Update `InventoryModule` to register `Batch`.
- [x] 1.3 Create `lib/data/models/inventory/batch_entity.dart` (Floor).
- [x] 1.4 Create `lib/data/daos/inventory/batch_dao.dart`.
- [x] 1.5 Register entities/DAOs in `AppDatabase`.
- [x] 1.6 Run `build_runner`.

## Phase 2: Core Logic (FIFO Consumption)

- [x] 2.1 Refactor `InventoryService.recordPurchase` to create `Batch` records.
- [x] 2.2 Implement FIFO deduction logic in `InventoryService` (Backend).
- [x] 2.3 Implement FIFO deduction logic in `MovementEngineImpl` (POS).

## Phase 3: Presentation (UI)

- [ ] 3.1 Create `BatchViewModel` and `BatchManagementView` (POS).
- [ ] 3.2 Update `InsumoView` to show batch details/expiration.

## Phase 4: Testing & Verification

- [x] 4.1 Unit Test (RED): Verify oldest batch is consumed first.
- [x] 4.2 Integration Test (RED): Verify multi-batch stock exhaustion.
- [x] 4.3 Verify all tests GREEN.
