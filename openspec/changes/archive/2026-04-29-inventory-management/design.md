# Design: Inventory Management Implementation

## Technical Approach
Implement a Domain-Driven design where the `Inventory` domain manages the lifecycle of Insumos and Recipes. The logic for stock reduction resides in a `MovementEngine` (Domain Service) shared across the POS application to ensure consistency during offline sales.

## Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Recipe Logic Location** | Domain Service in POS | Better than DB triggers for handling complex sub-recipes and unit conversions in Dart. |
| **Costing Method** | Weighted Average Cost (WAC) | Industry standard for retail/food; calculated on backend during purchase sync. |
| **Persistence** | Append-only Kardex | Ensures DGI-compliant audit trail. Stocks are updated as projections of the Kardex or materialized columns for performance. |

## Data Flow
1. **POS Sale**: `SaleAction` -> `MovementEngine` -> (Recipe Breakdown) -> `Kardex` Insert -> `Insumo` Stock Update.
2. **Purchase**: `Admin Panel` -> `InventoryService` -> `WAC Calculation` -> `Update Insumo Cost` -> `Sync to POS`.

## File Changes

### Admin Backend (`apps/admin_backend`)
- `src/modules/inventory/entities/`: `insumo.entity.ts`, `product.entity.ts`, `recipe.entity.ts`, `inventory-movement.entity.ts`.
- `src/modules/inventory/`: `inventory.module.ts`, `inventory.service.ts`, `inventory.controller.ts`.

### POS App (`apps/pos_app`)
- `lib/domain/models/inventory/`: `insumo.dart`, `recipe.dart`, `inventory_movement.dart`.
- `lib/data/models/inventory/`: `insumo_entity.dart`, `recipe_entity.dart`, `movement_entity.dart`.
- `lib/data/daos/inventory/`: `insumo_dao.dart`, `recipe_dao.dart`, `movement_dao.dart`.
- `lib/domain/services/inventory/`: `movement_engine.dart` (The core logic).
- `lib/data/database/app_database.dart`: Register new entities/DAOs.

## Interfaces / Contracts

### Insumo (Domain)
```dart
@freezed
class Insumo with _$Insumo {
  const factory Insumo({
    required String id,
    required String name,
    required String consumptionUom,
    required double stock,
    required double averageCost,
    required double? parLevel,
  }) = _Insumo;
}
```

### Movement Engine (Contract)
```dart
abstract class MovementEngine {
  Future<void> recordSale(String productId, int quantity);
  Future<void> recordPurchase(String insumoId, double quantity, double cost);
  Future<void> recordShrinkage(String insumoId, double quantity, String reason);
}
```

## Testing Strategy
| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit (Domain) | WAC calculation, Recipe breakdown | Pure Dart/TS tests with mocks. |
| Integration | Stock updates and Kardex consistency | Floor/TypeORM in-memory DB tests. |
| E2E | Completing a sale and verifying stock in UI | Playwright (Admin) / Flutter Integration Test. |

## Migration / Rollout
- **Phase 1**: Infrastructure & Core Insumos.
- **Phase 2**: Recipes & Sale Triggers.
- **Phase 3**: Purchases & Sync.
