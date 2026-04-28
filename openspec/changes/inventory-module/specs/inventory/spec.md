# Inventory Specification

## Purpose
Define the behavioral requirements for ingredient management, recipe definitions, and stock tracking using an adjustment-based (event-sourced) model.

## Requirements

### Requirement: Ingredient Definition
The system MUST allow the creation of Ingredients with a name and a Unit of Measure (UOM).

#### Scenario: Successful Ingredient Creation
- GIVEN a user provides a name "Coffee Beans" and UOM "oz"
- WHEN the creation is requested
- THEN the system MUST store the ingredient with a unique identifier

### Requirement: Recipe Association
The system MUST allow linking a Product to one or more Ingredients with a required quantity.

#### Scenario: Define Recipe for a Product
- GIVEN a Product "Latte" exists
- AND an Ingredient "Coffee Beans" exists
- WHEN the user assigns 2oz of "Coffee Beans" to "Latte"
- THEN the system MUST store this link as a Recipe Item

### Requirement: Stock Calculation from Adjustments
The current stock of an ingredient MUST be calculated as the sum of all its adjustments (deltas).

#### Scenario: Accurate Stock Retrieval
- GIVEN an Ingredient has adjustments: [+10, -2, -3]
- WHEN the current stock is requested
- THEN the system MUST return 5

### Requirement: Automatic Inventory Discount on Sale
When a Product is sold, the system MUST automatically create negative Inventory Adjustments for every ingredient in its recipe.

#### Scenario: Sale Triggers Stock Reduction
- GIVEN a Product "Latte" has a recipe of 2oz "Coffee Beans"
- AND the current stock of "Coffee Beans" is 10oz
- WHEN a sale of 1 "Latte" is recorded
- THEN the system MUST insert an Inventory Adjustment of -2oz for "Coffee Beans"
- AND the calculated stock MUST be 8oz
