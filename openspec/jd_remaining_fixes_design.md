# Design: JD Remaining Fixes

## Technical Approach

This design addresses 9 issues across the POS Flutter app and NestJS backend, grouped into four domains:

1. **FIFO Batch Tracking** (CRITICAL): Connect perishable insumo batch consumption to sale movements
2. **Data Integrity** (3 issues): Credit note validation, audit atomicity, and child entity reconciliation
3. **Performance** (2 issues): Bulk sync marking and N+1 query elimination in `_buildMovements`
4. **UX/Resource Management** (3 issues): Shrinkage form guards and searchable autocomplete

All changes maintain strict TDD discipline and follow existing Clean Architecture patterns.

---

## Architecture Decisions

### Decision: Batch Deduction Storage Format

**Choice**: Store `batchDeductions` as JSON string in `MovementEntity.batchDeductions` field.

**Alternatives considered**:
- Separate table with foreign key to movement (rejected: adds complexity for offline-first sync)
- Normalized schema (rejected: SQLite join overhead for read-heavy Kardex)

**Rationale**: Floor supports `@TypeConverter` for JSON serialization. Single field keeps the movement atomic, aligns with SQLite's JSON1 extension support, and simplifies sync to backend.

### Decision: Transaction Scope for Sale Finalization

**Choice**: Extend `executeSaleTransaction` DAO method to include audit logging.

**Alternatives considered**:
- Repository-level transaction wrapper (rejected: DAOs already handle Floor `@transaction`)
- Separate audit service (rejected: would be outside DB transaction boundary)

**Rationale**: Floor's `@transaction` annotation on DAO methods creates proper SQLite transaction. Audit log must be inside same transaction as sale data to prevent ghost entries on rollback.

### Decision: Credit Note Validation Strategy

**Choice**: Validate cumulative total before creating credit note, inside the same DB transaction.

**Alternatives considered**:
- Application layer validation only (rejected: race conditions possible)
- Database CHECK constraint (rejected: requires complex SQL; validation logic is business rule)

**Rationale**: Query existing credit notes for the invoice, sum totals, and validate proposed credit note won't exceed original total. Must be atomic to prevent concurrent credit notes exceeding limit.

### Decision: Bulk Update Implementation

**Choice**: Add `markManyAsSynced(List<String> ids)` method to InvoiceDao with raw `UPDATE ... WHERE id IN (...)` query.

**Alternatives considered**:
- Repository batch wrapper (rejected: individual UPDATE calls still issued)
- TypeORM bulk save (backend only; this is Flutter POS change)

**Rationale**: Floor supports raw `@Query` with `IN` clause. Single SQL statement per batch reduces SQLite write overhead from N statements to 1.

### Decision: Child Entity Reconciliation Strategy

**Choice**: Use TypeORM `upsert()` with conflict detection on invoice items and payments during `syncInvoices`.

**Alternatives considered**:
- DELETE + INSERT (rejected: loses item-level audit trail)
- Manual diff and merge (rejected: overly complex for current requirements)

**Rationale**: PostgreSQL `ON CONFLICT DO UPDATE` handles the reconciliation efficiently. Preserves existing records, updates changed fields (like cancellation status), and inserts new items.

---

## Data Flow

### FIFO Batch Deduction Flow

```
Sale Finalization
       │
       ▼
┌──────────────────┐
│ processInventory │  (UseCase)
│   UseCase        │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ MovementEngine   │  getSaleMovements()
│   .getSaleMove.  │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ _buildMovements  │  NEW: calls getBatchesForConsumption()
│   (refactored)   │  for perishable insumos
└────────┬─────────┘
         │
    ┌────┴────┐
    ▼         ▼
getInsumos   getBatches
  ByIds      ForConsumption
    │            │
    └────┬───────┘
         ▼
┌──────────────────┐
│ InventoryMovement│  NEW: batchDeductions field
│   with batches   │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ executeSaleTrans │  persists movement + batch data
└──────────────────┘
```

### Credit Note Validation Flow

```
createCreditNote()
       │
       ▼
┌──────────────────┐
│ Query existing   │  SUM(total) WHERE relatedInvoiceId = X
│   credit notes   │  AND type = 'creditNote'
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Validate total   │  proposed + existing <= original.total
│   won't exceed   │
└────────┬─────────┘
         │
    ┌────┴────┐
    │         │
 Pass      Fail
  │           │
  ▼           ▼
Continue  Throw
          Exception
```

---

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `apps/pos_app/lib/domain/models/inventory/inventory_movement.dart` | Modify | Add `batchDeductions: List<BatchDeduction>?` field |
| `apps/pos_app/lib/data/models/inventory/movement_entity.dart` | Modify | Add `batchDeductions` JSON string column |
| `apps/pos_app/lib/domain/services/inventory/movement_engine_impl.dart` | Modify | Connect `getBatchesForConsumption` to `_buildMovements`; refactor to use `getInsumosByIds` |
| `apps/pos_app/lib/data/daos/sales/invoice_dao.dart` | Modify | Add `markManyAsSynced(List<String> ids)` with raw UPDATE query |
| `apps/pos_app/lib/data/daos/sales/sales_transaction_dao.dart` | Modify | Add audit log insertion inside `executeSaleTransaction` |
| `apps/pos_app/lib/data/repositories/sales/sales_repository_impl.dart` | Modify | Refactor `markAsSynced` to use bulk method; add credit note validation in `createCreditNote` |
| `apps/pos_app/lib/ui/features/inventory/shrinkage/shrinkage_view.dart` | Modify | Add loading guard to "REGISTRAR" button; dispose controllers; add searchable autocomplete widget |
| `apps/pos_app/lib/data/database/app_database.dart` | Modify | Add migration for `batchDeductions` column |
| `apps/admin_backend/src/modules/sales/services/invoices.service.ts` | Modify | Implement child entity reconciliation with `upsert` pattern |
| `apps/admin_backend/src/modules/sales/dto/sync-invoice.dto.ts` | Modify | Ensure items/payments arrays are properly typed for reconciliation |
| `apps/pos_app/lib/data/mappers/inventory_mapper.dart` | Modify | Handle `batchDeductions` JSON serialization |
| `apps/pos_app/lib/repositories/inventory/inventory_repository.dart` | Modify | Add `getInsumosByIds(List<String> ids)` contract |
| `apps/pos_app/lib/data/repositories/inventory/inventory_repository_impl.dart` | Modify | Implement `getInsumosByIds` using `insumoDao.findByIds` |
| `apps/pos_app/lib/data/daos/inventory/insumo_dao.dart` | Modify | Add `findByIds(List<String> ids)` query |

---

## Interfaces / Contracts

### BatchDeduction (domain)

```dart
@freezed
class BatchDeduction with _$BatchDeduction {
  const factory BatchDeduction({
    required String batchId,
    required double quantity,
  }) = _BatchDeduction;

  factory BatchDeduction.fromJson(Map<String, dynamic> json) => _$BatchDeductionFromJson(json);
}
```

### Updated InventoryMovement

```dart
@freezed
class InventoryMovement with _$InventoryMovement {
  const factory InventoryMovement({
    required String id,
    required String insumoId,
    required MovementType type,
    required double quantity,
    required double previousStock,
    required double newStock,
    required DateTime timestamp,
    String? reason,
    String? userId,
    List<BatchDeduction>? batchDeductions,  // NEW
  }) = _InventoryMovement;
}
```

### InvoiceDao Interface Addition

```dart
@dao
abstract class InvoiceDao {
  // ... existing methods ...

  @Query('UPDATE invoices SET sync_status = :status WHERE id IN (:ids)')
  Future<void> updateSyncStatusForIds(List<String> ids, String status);
}
```

### TypeORM Upsert Pattern (backend)

```typescript
// In syncInvoices service method
if (existing) {
  // Update invoice header
  await this.invoiceRepository.save({ ...existing, ...dto });

  // Upsert items
  if (dto.items?.length) {
    await this.invoiceItemRepository.upsert(
      dto.items.map(item => ({ ...item, invoiceId: dto.id })),
      ['id']
    );
  }

  // Upsert payments
  if (dto.payments?.length) {
    await this.paymentRepository.upsert(
      dto.payments.map(payment => ({ ...payment, invoiceId: dto.id })),
      ['id']
    );
  }
}
```

---

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | `_buildMovements` with batches | Mock repository to return perishable insumo + batches, verify `BatchDeduction` list populated correctly with FIFO order |
| Unit | `getInsumosByIds` bulk query | Verify single DAO call returns all requested insumos vs N individual calls |
| Unit | Credit note validation | Test edge cases: exactly at limit, over by 0.01, multiple credit notes summing to limit |
| Unit | `markManyAsSynced` | Mock verify single UPDATE query executed with correct IN clause |
| Integration | Sale transaction atomicity | Insert sale data that will fail constraint, verify no audit log entry exists after rollback |
| Integration | Batch restoration on void | Create sale with batch deductions, void it, verify batch stock restored to correct original batches |
| Widget | Shrinkage form guards | Pump widget, tap register, verify button disabled during loading; verify controllers disposed on pop |
| E2E | FIFO consumption flow | Full sale flow: create batches with different expiry dates, complete sale, verify correct batches deducted per Kardex |
| E2E | Child entity reconciliation | Sync invoice, modify items on POS, re-sync, verify backend items updated while preserving unmodified ones |

---

## Migration / Rollout

**Database Migration Required**: 
- Add `batch_deductions` TEXT column to `inventory_movements` table (nullable, default NULL)

**Migration Script** (SQLite):
```sql
ALTER TABLE inventory_movements ADD COLUMN batch_deductions TEXT;
```

**Rollout Strategy**:
1. Deploy backend child entity reconciliation first (backward compatible)
2. Deploy POS app update (existing movements have NULL batchDeductions, treated as non-perishable or legacy)
3. Run migration on existing POS databases

---

## Open Questions

- [ ] Should `batchDeductions` include expiration dates for audit trail, or just batch IDs and quantities?
- [ ] For credit notes: partial credit notes require item-level granularity — current spec assumes full invoice credit. Confirm if partial credit notes are MVP.
- [ ] Backend child entity reconciliation: should deletions be supported (e.g., item removed from invoice), or only additions/modifications?

