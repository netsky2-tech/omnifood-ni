# Design: Advanced Inventory Logic

## Technical Approach
Refactor the `MovementEngine` to handle multi-level recipes recursively and integrate an alerting mechanism for stock thresholds. This maintains the "Offline-First" principle by processing all logic locally in the domain layer.

## Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Recursion Depth** | Limit of 5 levels | Sufficient for complex food recipes (e.g., Dish -> Sauce -> Base) while preventing infinite loops. |
| **Alerting Interface** | `AlertService` port | Decouples the domain logic from specific UI notification implementations (Toasts, Push, etc.). |
| **Deduplication** | In-memory cache per session | Prevents flooding the user with multiple alerts for the same item during a single busy hour. |

## Data Flow

    [MovementEngine] ──(1) Record Sale/Reversal──▶ [_recursiveProcess]
           ▲                                           │
           │                                     (2) Loop Ingredients
           │                                           │
           │           ┌───────────────────────────────┴──────────────────────────────┐
           │           ▼                                                              ▼
           │      [Ingredient: Insumo]                                          [Ingredient: Product]
           │           │                                                              │
           │      (3) Update Stock                                               (4) Recurse
           │      (4) Check PAR Alert ────▶ [AlertService]                            │
           └──────────────────────────────────────────────────────────────────────────┘

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `lib/domain/services/alerts/alert_service.dart` | Create | New interface for stock notifications. |
| `lib/domain/services/inventory/movement_engine_impl.dart` | Modify | Implement recursion and alert hooks. |
| `test/domain/services/inventory/movement_engine_test.dart` | Modify | Tests for nested recipes and PAR triggers. |

## Interfaces / Contracts

### Alert Service
```dart
abstract class AlertService {
  void notifyLowStock(String insumoName, double currentStock, double parLevel);
}
```

### Movement Engine (Modified)
No signature changes, but internal logic becomes recursive.

## Testing Strategy
| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | Nested recursion (3 levels) | Mock repository to return multi-level recipes. |
| Unit | PAR alert trigger | Verify `AlertService` is called when `stock < parLevel`. |
| Unit | Circular dependency | Verify depth limit prevents infinite loops. |

## Migration / Rollout
No data migration required; logic is purely behavioral.
