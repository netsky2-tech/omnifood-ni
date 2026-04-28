# Design: Inventory & Recipe Module

## Technical Approach
Implement an event-sourced inventory system where current stock is derived from a log of adjustments (`InventoryAdjustment`). This approach ensures robust offline synchronization and full auditability of stock movements. The implementation will follow Clean Architecture, separating the pure domain models from the SQLite (Floor) data models.

## Architecture Decisions

### Decision: Event-Sourced vs. State-Based Inventory
| Option | Choice | Rationale |
|--------|--------|-----------|
| State-Based (Quantity column) | Adjustment Log (Event-Sourced) | Adjustment logs are easier to reconcile in multi-terminal offline environments (Rule #4) and provide a built-in audit trail for DGI compliance. |

### Decision: Many-to-Many Recipe Mapping
| Option | Choice | Rationale |
|--------|--------|-----------|
| List of Ingredients in Product | `RecipeItem` Join Entity | A join entity allows for complex recipes with specific quantities and follows relational best practices for SQLite. |

## Data Flow
1. **Sale Recorded**: `SaleUseCase` triggers.
2. **Recipe Lookup**: `InventoryRepository` retrieves `RecipeItems` for the sold products.
3. **Log Adjustments**: `InventoryRepository` inserts `InventoryAdjustment` records with negative deltas.
4. **Stock Update**: ViewModels listen to the `InventoryRepository` and recalculate stock by summing all adjustments.

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `lib/domain/models/ingredient.dart` | Create | Pure domain entity for ingredients. |
| `lib/domain/models/product.dart` | Create | Pure domain entity for products. |
| `lib/domain/models/recipe_item.dart` | Create | Entity linking Product and Ingredient. |
| `lib/domain/models/inventory_adjustment.dart` | Create | Entity for stock movements (deltas). |
| `lib/data/models/ingredient_table.dart` | Create | Floor entity for ingredients. |
| `lib/data/models/product_table.dart` | Create | Floor entity for products. |
| `lib/data/models/recipe_item_table.dart` | Create | Floor entity for recipes (junction table). |
| `lib/data/models/inventory_adjustment_table.dart` | Create | Floor entity for adjustments. |
| `lib/data/database.dart` | Create | Floor database definition. |

## Interfaces / Contracts

```dart
abstract class IInventoryRepository {
  Future<double> getStockForIngredient(String ingredientId);
  Future<void> addAdjustment(InventoryAdjustment adjustment);
  Stream<double> watchStockForIngredient(String ingredientId);
  Future<List<RecipeItem>> getRecipeForProduct(String productId);
}
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | Stock Calculation | Test that sum of adjustments [+10, -2, -3] equals 5. |
| Integration | Recipe Logic | Verify that saving a sale inserts the correct number of adjustments in SQLite. |
| E2E | Offline Resilience | Verify stock is correct after multiple simulated offline sales. |

## Migration / Rollout
No migration required. This is the first implementation of the inventory schema.

## Open Questions
- [ ] Should we cache the "Current Stock" in a separate table for performance? (Recommendation: Start with raw sum, optimize later if needed).
