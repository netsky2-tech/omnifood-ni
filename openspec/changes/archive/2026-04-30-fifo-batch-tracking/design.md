# Design: Batch & FIFO Tracking Implementation

## Technical Approach
Implement batch tracking by introducing a `Batch` entity that links to `Insumo`. The `MovementEngine` is refactored to query available batches ordered by `expirationDate` ASC when processing sales of perishable items. Purchases automatically generate new `Batch` records.

## Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Hybrid Tracking** | Conditional logic (`isPerishable`) | Optimizes performance: only track complexity where needed. |
| **FIFO Selection** | Expiration Date | Simplest and most reliable standard for perishable items. |
| **Batch Atomicity** | DB Transactions | Prevents race conditions where two sales consume the same batch incorrectly. |

## Data Flow
`PurchaseEntry` ──▶ `Batch` (Create)
`SaleEntry`     ──▶ `MovementEngine` ──▶ `BatchDao` (Query oldest) ──▶ `Update Batch`

## File Changes

### Admin Backend
- `src/modules/inventory/entities/batch.entity.ts`: New entity.
- `src/modules/inventory/purchase.service.ts`: Update to create `Batch` on purchase.
- `src/modules/inventory/inventory.service.ts`: Add FIFO batch deduction logic.

### POS App
- `lib/domain/models/inventory/batch.dart`: Domain model (Freezed).
- `lib/data/models/inventory/batch_entity.dart`: Floor entity.
- `lib/data/daos/inventory/batch_dao.dart`: CRUD operations for batches.
- `lib/domain/services/inventory/movement_engine_impl.dart`: Integrate FIFO deduction.

## Interfaces / Contracts

### Batch (Domain)
```dart
@freezed
class Batch with _$Batch {
  const factory Batch({
    required String id,
    required String insumoId,
    required String batchNumber,
    required DateTime expirationDate,
    required double stock,
  }) = _Batch;
}
```

## Testing Strategy
| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | Batch selection | Verify oldest batch is returned for FIFO deduction. |
| Integration | Stock exhaustion | Verify sale consumes multiple batches sequentially. |
| Integration | Expiration trigger | Verify sale throws error if stock is expired (future safety). |

## Migration / Rollout
- **Migration**: Run script to create initial batches for current items (optional, can start fresh).
- **Rollout**: Toggle `isPerishable` for critical items.
