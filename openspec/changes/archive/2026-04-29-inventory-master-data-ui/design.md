# Design: Inventory Master Data & UI Base

## Technical Approach
Refactor the inventory domain to include `Supplier` and `Warehouse` entities and implement a consistent MVVM UI pattern for management screens.

## Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Entity Linking** | Many-to-One | An Insumo belongs to one Warehouse. A Purchase is linked to one Supplier. |
| **Flexible Tracking** | `isPerishable` flag | Simple boolean to toggle complex FIFO logic (Cycle 3) without branching the domain. |
| **UI Pattern** | Feature-based MVVM | Follows existing structure in `lib/ui/features/` for maintainability. |

## Data Flow
`UI Form` ──▶ `ViewModel` ──▶ `Repository` ──▶ `DAO/SQLite` (Local) ──▶ `SyncWorker` ──▶ `API/PostgreSQL` (Cloud)

## File Changes

### Admin Backend
- `src/modules/inventory/entities/`: `supplier.entity.ts`, `warehouse.entity.ts`.
- `src/modules/inventory/entities/insumo.entity.ts`: Add `warehouse_id`, `is_perishable`.
- `src/modules/inventory/entities/product.entity.ts`: Add `warehouse_id`, `is_perishable`.

### POS App
- `lib/domain/models/inventory/`: `supplier.dart`, `warehouse.dart`.
- `lib/data/models/inventory/`: `supplier_entity.dart`, `warehouse_entity.dart`.
- `lib/data/daos/inventory/`: `supplier_dao.dart`, `warehouse_dao.dart`.
- `lib/ui/features/inventory/`: New feature folder with Views and ViewModels for Insumos, Suppliers, and Warehouses.

## Interfaces / Contracts

### Supplier (Domain)
```dart
@freezed
class Supplier with _$Supplier {
  const factory Supplier({
    required String id,
    required String name,
    String? phone,
    String? contactPerson,
    String? creditTerms,
  }) = _Supplier;
}
```

### Warehouse (Domain)
```dart
@freezed
class Warehouse with _$Warehouse {
  const factory Warehouse({
    required String id,
    required String name,
    String? description,
  }) = _Warehouse;
}
```

## Testing Strategy
| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | CRUD logic in VMs | Mock repository and verify state updates. |
| Integration | DB constraints | Verify foreign keys and RLS in SQLite/PostgreSQL. |
| UI | Navigation and Forms | Smoke test each management screen. |
