# Design: Fixes from Judgment Day R5

## Technical Approach

Fix 4 critical production issues identified in Judgment Day R5: (1) Add explicit tenant filtering to Insumo queries for defense-in-depth, (2) Isolate poison pill records in batch sync, (3) Standardize PAR crossing alerts using non-volatile checks, and (4) Add unique constraint on invoice_number for DGI compliance.

---

## Architecture Decisions

| Decision | Options | Tradeoffs | Choice |
|----------|---------|-----------|--------|
| **Tenant Isolation Strategy** | A) RLS only, B) Explicit filtering, C) Both | A) Risky if RLS disabled, B) Defense-in-depth with minimal overhead, C) Slightly more verbose queries | **C) Explicit filtering + RLS** for defense-in-depth |
| **Poison Pill Isolation** | A) Mark entire batch failed, B) Binary search to find culprit, C) Individual retry per record | A) Current broken behavior, B) Complex to implement, C) Simpler but more HTTP requests | **B) Binary search approach** - log(n) complexity to isolate 4xx errors |
| **PAR Alert Crossing Check** | A) `_alertedInsumos` Set, B) Non-volatile crossing check (prevStock >= PAR && newStock < PAR) | A) Volatile (lost on restart), B) Deterministic from movement data | **B) Non-volatile crossing check** using previousStock from movement |
| **Invoice Uniqueness** | A) Application-level check, B) DB unique index | A) Race conditions possible, B) Guarantees DGI compliance | **B) DB unique index** via Floor `@Index` annotation |

---

## Data Flow

### Poison Pill Isolation (Binary Search)

```
Batch Sync Request (50 records)
         │
         ▼
    POST /sync
         │
    ┌────┴────┐
 4xx Error?   5xx/Network?
    │            │
    ▼            ▼
Binary Search   Retry Later
Isolate 1 record
         │
    ┌────┴────┐
Retry 25      Retry 25
 (success)   (4xx? → split again)
         │
Mark failed: 1 record only
Mark synced: 49 records
```

### PAR Alert Crossing Flow

```
recordSale/recordShrinkage
         │
         ▼
Create Movement with previousStock
         │
         ▼
_checkParAlert(insumo, previousStock, newStock)
         │
         ▼
    previousStock >= parLevel && newStock < parLevel?
         │
    ┌────┴────┐
   Yes        No
    │          │
    ▼          ▼
Fire Alert   Silent
```

---

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `apps/admin_backend/src/modules/inventory/inventory.service.ts` | Modify | Add `tenant_id` to all `findOne` queries (lines 32-34, 99-101) |
| `apps/pos_app/lib/data/services/sync_service.dart` | Modify | Replace batch-failure logic with binary search isolation for 4xx errors |
| `apps/pos_app/lib/domain/services/inventory/movement_engine_impl.dart` | Modify | Add `previousStock` parameter to `_checkParAlert`; update `recordSale` and `recordShrinkage` to pass crossing data |
| `apps/pos_app/lib/data/models/sales/invoice_entity.dart` | Modify | Add `@Index(unique: true, value: ['number'])` annotation |

---

## Interfaces / Contracts

### Backend: InventoryService Query Contract
```typescript
// BEFORE (vulnerable):
where: { id: insumoId }

// AFTER (secure):
where: { id: insumoId, tenant_id: tenantId }
```

### POS: SyncService Poison Pill Contract
```dart
// New method signature
Future<void> _syncBatchWithPoisonIsolation<T>({
  required List<T> records,
  required Future<void> Function(List<T>) sendBatch,
  required Future<void> Function(String id) markFailed,
  required Future<void> Function(List<String> ids) markSynced,
  required String Function(T) getId,
})
```

### POS: PAR Alert Check Contract
```dart
// BEFORE:
Future<void> _checkParAlert(Insumo insumo, double newStock)

// AFTER:
Future<void> _checkParAlert(Insumo insumo, double previousStock, double newStock)

// Crossing logic:
final bool wasAboveOrAtPar = previousStock >= insumo.parLevel!;
final bool isNowBelowPar = newStock < insumo.parLevel!;
if (wasAboveOrAtPar && isNowBelowPar) { /* fire alert */ }
```

### POS: Invoice Entity Index
```dart
// Add to InvoiceEntity class:
@Entity(
  tableName: 'invoices',
  indices: [
    Index(value: ['number'], unique: true)
  ],
)
```

---

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | `InventoryService` tenant filtering | Mock repository calls, verify where clauses include tenant_id |
| Unit | Binary search poison isolation | Inject mock HTTP responses, verify only failing record marked |
| Unit | PAR crossing logic | Test matrix: above→below (alert), below→below (silent), above→above (silent) |
| Integration | Invoice unique constraint | Attempt duplicate inserts, verify SQLite throws constraint error |
| E2E | End-to-end sync with poison pill | Create 50 invoices, inject 400 error on #23, verify 49 sync |

---

## Migration / Rollout

1. **Backend**: Deploy tenant filtering first - safe additive change
2. **POS App**: Invoice unique index requires:
   - Database migration: `ALTER TABLE` to add unique constraint
   - Conflict resolution: If duplicates exist, regenerate numbers for duplicates
3. **Sync Logic**: Poison pill fix can deploy independently
4. **PAR Alerts**: Update existing records only on new movements

**Rollback**: All changes are additive except invoice constraint. If rollback needed, remove unique index via migration.

---

## Open Questions

- [ ] Should poison pill retries have exponential backoff before binary search?
- [ ] How to handle existing duplicate invoice_numbers in deployed databases?
