# Specification: Inventory Recursive BOM

## Purpose
Ensure that compound products containing other compound products (sub-recipes) are correctly descaled into their base raw materials (Insumos).

## Requirements

### Requirement: Sub-Recipe Descaling
The system MUST recursively traverse recipes until all base Insumos are identified and descaled.

#### Scenario: Sale of a product with nested sub-recipe
- GIVEN a "Vanilla Latte" that uses 50ml of "Vanilla Syrup" (Sub-recipe)
- AND "Vanilla Syrup" uses 10g of "Sugar" and 40ml of "Water" (Insumos)
- WHEN a sale for 1 "Vanilla Latte" is recorded
- THEN the system MUST discount 10g of Sugar and 40ml of Water from stock.

### Requirement: Circular Dependency Protection
The system MUST prevent infinite loops caused by circular recipe definitions.

#### Scenario: Circular recipe detection
- GIVEN Product A depends on Product B
- AND Product B depends on Product A
- WHEN descaling Product A
- THEN the system MUST throw an error or stop at a maximum depth (e.g., 5 levels) to prevent a crash.
