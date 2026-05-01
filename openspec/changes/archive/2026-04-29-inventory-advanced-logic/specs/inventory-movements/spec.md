# Delta for Inventory Movements

## MODIFIED Requirements

### Requirement: Real-time Stock Discount
Each sale MUST trigger a proportional stock discount of Insumos based on the product's recipe. The system MUST handle recursive sub-recipes.
(Previously: Recursive handling was omitted)

#### Scenario: Stock discount after sale
- GIVEN a "Capuccino" with recipe (18g Coffee, 200ml Milk) and current stock (1000g Coffee, 2000ml Milk)
- WHEN a sale for 1 "Capuccino" is completed
- THEN the new stock MUST be 982g Coffee and 1800ml Milk.

#### Scenario: Nested recipe discount
- GIVEN a "Vanilla Latte" using "Vanilla Syrup" (Sub-recipe)
- WHEN a sale for "Vanilla Latte" is completed
- THEN all base Insumos (Sugar, Water, etc.) MUST be discounted.

### Requirement: PAR Levels & Alertas
The system MUST allow defining minimum stock levels (PAR) and trigger alerts when stock falls below them via the Alert Service.
(Previously: Alert service trigger was not specified)

#### Scenario: PAR alert
- GIVEN "Leche" with PAR level 2000ml and current stock 2100ml
- WHEN a sale reduces stock to 1900ml
- THEN the system MUST trigger a "Low Stock" alert through the Alert Service.
