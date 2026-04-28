## Exploration: Inventory & Recipe Module

### Current State
The project has the basic apps scaffolded but no business logic. The `apps/pos_app` directory has layers for `domain` and `data`, but they are currently empty.

### Affected Areas
- `apps/pos_app/lib/domain/models/` — For entities: `Ingredient`, `Product`, `RecipeItem`.
- `apps/pos_app/lib/domain/repositories/` — For `IIngredientRepository` and `IProductRepository`.
- `apps/pos_app/lib/data/models/` — For Floor entities (Database models).
- `apps/pos_app/lib/data/repositories/` — For Floor-based implementations.

### Approaches
1. **Direct Stock Update** — Decrement stock in the `Ingredient` table immediately when a sale is finalized.
   - Pros: Simple to implement.
   - Cons: Hard to reconcile if multiple terminals update the same ingredient offline. Risk of negative stock without audit trail.
   - Effort: Low

2. **Event-Sourced Inventory (Adjustment Log)** — Instead of just a "quantity" column, we store `InventoryAdjustment` records (e.g., +100oz from Purchase, -2oz from Latte Sale).
   - Pros: Built-in audit trail, easier to resolve sync conflicts, resilient for offline-first.
   - Cons: Requires more complex queries to get "current stock" (sum of adjustments).
   - Effort: Medium

### Recommendation
Use **Approach 2 (Event-Sourced Inventory)**. Given our "Offline-First or Muerte" principle, storing adjustments (deltas) is far more robust for eventually consistent systems. We can use a cached "CurrentStock" view or table for performance if needed.

### Risks
- Query performance for large adjustment logs (can be mitigated with snapshots).
- Complexity in handling recipes with multiple ingredients during the adjustment generation.

### Ready for Proposal
Yes.
