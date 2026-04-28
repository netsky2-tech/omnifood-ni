# Proposal: Inventory & Recipe Module

## Goal
Implement the core inventory management system for the Coffee Pilot, enabling recipe-based stock discounting using an event-sourced (adjustment log) approach.

## Capabilities

### New Capabilities
- **Ingredient Management**: Create and track raw ingredients with units of measure (e.g., oz, ml, units).
- **Recipe Definition**: Link Products to Ingredients with specific quantities.
- **Stock Tracking**: Calculate current stock based on a log of adjustments (Sales, Purchases, Waste).

## Technical Strategy
We will implement this in the `pos_app` (Flutter) first, ensuring it works completely offline with SQLite.

### 1. Entities (Domain)
- `Ingredient`: id, name, unitOfMeasure.
- `Product`: id, name, basePrice.
- `RecipeItem`: productId, ingredientId, quantity.
- `InventoryAdjustment`: id, ingredientId, delta, reason (sale, purchase, adjustment), timestamp.

### 2. Persistence (Data)
- Use **Floor** for SQLite entities and DAOs.
- Define a `CurrentStock` view or helper method in the Repository that aggregates `InventoryAdjustment` records.

### 3. Logic
- When a `Sale` event occurs, the system will look up the `Recipe` for each item and insert `InventoryAdjustment` records with negative deltas.

## Risks
- Version mismatch in `floor` (already handled in bootstrap).
- Ensuring data consistency during rapid sales.

## Rollback Plan
Remove the newly created domain models and repository interfaces.
