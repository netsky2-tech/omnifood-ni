# Tasks: Fixes from Judgment Day R5

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 180-280 |
| 400-line budget risk | Low |
| Chained PRs recommended | Yes |
| Suggested split | PR1 (backend tenant) → PR2 (invoice index) → PR3 (PAR alert) → PR4 (poison pill) |
| Delivery strategy | auto-chain |
| Chain strategy | feature-branch-chain |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Add tenant_id filtering to Insumo queries in InventoryService | PR 1 | Base: main; defensive layer |
| 2 | Add unique index on invoice_number in InvoiceEntity | PR 2 | Base: main; DGI compliance |
| 3 | Implement non-volatile PAR crossing check in movement engine | PR 3 | Base: main; fix alert duplicates |
| 4 | Implement binary search poison pill isolation in sync service | PR 4 | Base: main; isolate 4xx errors |

---

## Phase 1: Backend Tenant Isolation

- [x] 1.1 Modify `apps/admin_backend/src/modules/inventory/inventory.service.ts` — add `tenant_id` to `findOne` calls in `syncMovements` (lines 99-101)
- [x] 1.2 Modify `apps/admin_backend/src/modules/inventory/inventory.service.ts` — add `tenant_id` to `findOne` calls in `recordPurchase` (lines 33-35)
- [x] 1.3 Write unit test: verify `findOne` queries include both `id` and `tenant_id` in where clause

---

## Phase 2: POS Invoice Uniqueness

- [x] 2.1 Modify `apps/pos_app/lib/data/models/sales/invoice_entity.dart` — add `@Index(value: ['number'], unique: true)` to `@Entity` annotation
- [x] 2.2 Run code generation: `flutter pub run build_runner build --delete-conflicting-outputs`
- [x] 2.3 Write integration test: attempt duplicate invoice insert, verify SQLite constraint error

---

## Phase 3: PAR Alert Crossing Check

- [ ] 3.1 Modify `apps/pos_app/lib/domain/services/inventory/movement_engine_impl.dart` — update `_checkParAlert` signature to accept `previousStock` parameter
- [ ] 3.2 Modify `movement_engine_impl.dart` — update `recordSale` to pass `previousStock` when creating Movement
- [ ] 3.3 Modify `movement_engine_impl.dart` — update `recordShrinkage` to pass `previousStock` when creating Movement
- [ ] 3.4 Implement crossing logic: `if (previousStock >= parLevel && newStock < parLevel) fire alert`
- [ ] 3.5 Write unit test: verify alert fires on above→below crossing, silent on below→below, silent on above→above

---

## Phase 4: Poison Pill Isolation

- [ ] 4.1 Modify `apps/pos_app/lib/data/services/sync_service.dart` — create `_syncBatchWithPoisonIsolation` method with binary search logic
- [ ] 4.2 Update `syncUnsyncedSales` to use the new poison isolation method
- [ ] 4.3 Update `syncUnsyncedMovements` to use the new poison isolation method
- [ ] 4.4 Handle 4xx → binary search to isolate failing record
- [ ] 4.5 Handle 5xx/network error → mark batch for retry later (no individual failures)
- [ ] 4.6 Write unit test: inject mock 400 error on record #23 in batch of 50, verify only #23 marked failed

---

## Phase 5: Verification

- [ ] 5.1 Verify all specs scenarios pass (see `openspec/fixes_jd_r5_spec.md`)
- [ ] 5.2 Run full test suite: `flutter test` and `npm test`
- [ ] 5.3 Verify sync logic end-to-end with poison pill scenario