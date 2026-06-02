# Specification: Inventory Core

## Purpose
Manage the basic definition of items in the system, distinguishing between raw materials (Insumos) and sellable products.

## Requirements

### Requirement: Item Categorization
The system MUST support three types of items:
1. **Insumo**: Raw material not sold directly (e.g., coffee beans).
2. **Simple Product**: Item bought and sold without modification (e.g., bottled water).
3. **Compound Product**: Final product created from a recipe (e.g., Capuccino).

#### Scenario: Registering a new Insumo
- GIVEN a user with OWNER or MANAGER role
- WHEN they create an item as "Insumo" with name "Granos de Café" and UOM "gramos"
- THEN the item SHALL be stored with an initial stock of 0 and no sell price.

### Requirement: Unit of Measure (UOM)
The system MUST support dual UOMs for Insumos: one for purchasing (e.g., Saco 50lb) and one for consumption (e.g., gramos).

#### Scenario: Defining dual UOM
- GIVEN an existing Insumo "Leche"
- WHEN the user sets purchase UOM as "Galón" and consumption UOM as "ml" with conversion factor 3785
- THEN the system SHALL allow recording purchases in gallons and recipes in ml.

### Requirement: Negative Stock Policy for Food Operations
The system MUST allow temporary negative stock for configured food items and SHALL record the movement using the latest known CPP.

#### Scenario: Sale at theoretical zero stock (UC-03)
- GIVEN an item configured to allow negative stock and current stock is 0.0000
- WHEN a sale consumes 1.5000 units
- THEN stock SHALL become -1.5000 and the movement SHALL be valued at the latest CPP

#### Scenario: Blocked negative stock for restricted item
- GIVEN an item configured to disallow negative stock
- WHEN a movement would produce stock below 0.0000
- THEN the system SHALL reject the movement with a policy error

### Requirement: Acceptance Matrix Traceability
The system MUST map inventory operations to UC-01..UC-05 acceptance anchors for automated verification.

#### Scenario: Executing acceptance tests
- GIVEN CI acceptance suite runs
- WHEN test evidence is produced
- THEN each UC anchor SHALL reference at least one executable scenario
