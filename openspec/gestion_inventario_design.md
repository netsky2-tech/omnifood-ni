# Design: Gestión de Inventario Inteligente

## Technical Approach

This change implements the intelligent inventory management module for OmniFood NI. We will introduce transaction-based stock deduction for offline POS sales and ensure DGI compliance by reversing stock on cancellations rather than deleting records. The synchronization logic will use event sourcing principles for eventual consistency, prioritizing older timestamps to handle conflicts gracefully. The frontend will feature a full MVVM-based Shrinkage (Mermas) screen, replacing the current empty shells.

## Architecture Decisions

### Decision: Local Inventory Deduction Implementation

**Choice**: Application-level transactions using Floor `@transaction` in Flutter, instead of SQLite database-level triggers.
**Alternatives considered**: SQLite triggers (e.g. `CREATE TRIGGER ... AFTER INSERT ON sale_items`).
**Rationale**: SQLite triggers hide business logic from the application domain, complicating debugging, testing (TDD), and Flutter state management. Application-level transactions using Floor `@transaction` ensure the domain layer orchestration explicitly handles the Bill of Materials (BOM) deduction, making the logic testable and observable by `ChangeNotifier` ViewModels.

### Decision: Synchronizing Inventory Movements

**Choice**: Conflict-free Event Append (Append-Only) with oldest-timestamp-first processing.
**Alternatives considered**: Traditional Last-Write-Wins (LWW) entity synchronization.
**Rationale**: Last-Write-Wins can cause silent stock anomalies in an offline-first system where simultaneous sales occur. An append-only event log (Movement log) ensures that every transaction is synchronized. The NestJS backend will sort movements by timestamp ascending and process them sequentially, allowing for accurate audits, even if it results in a temporary negative theoretical stock.

### Decision: Reverting Cancelled Sales

**Choice**: Generate compensatory `reversal` movements in the inventory ledger.
**Alternatives considered**: Deleting the original `sale` movement, or creating a positive `sale` movement.
**Rationale**: DGI strictly prohibits deleting records. Using a dedicated `reversal` type explicitly marks the transaction as an audit correction rather than a standard entry, simplifying reporting and variance tracking.

## Data Flow

    [Frontend: POS_APP]                              [Backend: ADMIN_BACKEND]
    
    Sale / Merma / Cancel                            
         │                                              
    (BOM Calculation)                                   
         │                                              
    [SQLite (Floor)] ────── Sync (REST API) ───────→ [NestJS Controller]
         │                                              │
    Local Stock                                     [Sort by Timestamp ASC]
    Updated                                             │
                                                    [TypeORM RLS]
                                                        │
                                                    PostgreSQL

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `apps/pos_app/lib/ui/features/inventory/shrinkage/shrinkage_view.dart` | Modify | Implement fully functional UI for registering Shrinkage (Mermas). |
| `apps/pos_app/lib/ui/features/inventory/shrinkage/shrinkage_view_model.dart` | Modify | Add business logic, form validation, and integrate with `InventoryRepository`. |
| `apps/pos_app/lib/data/daos/inventory/inventory_dao.dart` | Modify | Add `insertMovements` grouped in a `@transaction` method. |
| `apps/pos_app/lib/domain/usecases/inventory/process_sale_inventory_usecase.dart` | Create | Encapsulate BOM breakdown and trigger inventory deduction on sale. |
| `apps/pos_app/lib/domain/usecases/inventory/reverse_sale_inventory_usecase.dart` | Create | Create compensatory `reversal` movements when a sale is canceled. |
| `apps/admin_backend/src/modules/inventory/inventory.service.ts` | Modify | Add conflict resolution sorting movements by timestamp ASC. |
| `apps/admin_backend/src/modules/inventory/services/cost-calculator.service.ts` | Create | Recalculate theoretical cost on purchase events. |

## Interfaces / Contracts

```dart
// Flutter - Shrinkage Form State
@freezed
class ShrinkageFormState with _$ShrinkageFormState {
  const factory ShrinkageFormState({
    required String insumoId,
    required double quantity,
    required String reason,
    @Default(false) bool isSubmitting,
    String? error,
  }) = _ShrinkageFormState;
}

// Flutter - Transaction Signature (Floor)
@transaction
Future<void> processInventoryMovements(List<InventoryMovementEntity> movements) async {
    // Inserts movements and updates stock sequentially
}
```

```typescript
// NestJS - Conflict Resolution Contract
async function syncMovements(movements: CreateInventoryMovementDto[]): Promise<void> {
    // Sort oldest first for conflict resolution
    const sorted = movements.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    // Process sequentially inside transaction
}
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | Sales BOM Deduction | Test `ProcessSaleInventoryUseCase` mock responses. Assert correct calculation. |
| Unit | Sync Sorting | Test `inventory.service.ts` correctly sorts arrays before saving. |
| Integration | SQLite Floor Transaction | Test `InventoryDao` rolls back if a deduction fails. |
| Widget | Shrinkage UI | Mock `ShrinkageViewModel`. Assert inputs trigger `registerMerma` calls. |

## Migration / Rollout

No data migration required. New movement types and tables (if applicable) are already defined in the DTOs and Entities.

## Open Questions

- [ ] Does the DGI require the cancellation `reason` to follow a predefined list, or can it be free-text?
- [ ] Should the BOM logic reside strictly in the Flutter app or should the backend validate the stock calculation upon sync?