# Specification: Inventory Core

## Purpose
Manage the basic definition of items in the system, distinguishing between raw materials (Insumos) and sellable products, and provide real-time inventory stock valuation and health reporting.

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

### Requirement: Inventory Valuation and Stock Projections (Slice 4.1)
The system MUST provide real-time inventory valuation reports calculating total value in NIO ($\text{stock} \times \text{averageCost}$) for positive balances, and classify inventory health metrics (items with stock, items under minimum stock threshold, and items in negative stock).

#### Scenario: Querying inventory valuation report
- GIVEN active insumos with various stock levels and CPPs
- WHEN the manager requests the inventory valuation report
- THEN the system SHALL return the total valuation in NIO, total items count, low-stock count, and per-item stock and CPP breakdown

### Requirement: Cost of Goods Sold (COGS) Reporting (Slice 4.2)
The system MUST calculate Cost of Goods Sold (COGS) across configurable time periods, aggregating direct sales consumption and shrinkage losses while deducting cancellations and returns, providing item-level contribution percentages.

#### Scenario: Generating periodic COGS report
- GIVEN finalized sales and shrinkage movements within a date range
- WHEN the manager requests the COGS report for that period
- THEN the system SHALL return the total COGS in NIO, direct sales COGS, shrinkage COGS, and per-insumo consumption breakdown with relative cost percentages

### Requirement: Real-Time Stock Minimum & Critical Alerts (Slice 4.4)
The system MUST evaluate insumo stock levels in real time and categorize stock alerts into severity tiers (`CRITICAL` for depleted items at 0, `NEGATIVE_STOCK` for negative balances requiring physical audit or retrocalculation, and `WARNING` for items below configured minimum thresholds), computing dynamic suggested reorder quantities based on target par levels.

#### Scenario: Real-time stock alert evaluation and reorder suggestions
- GIVEN active insumos with varying balances and operational thresholds
- WHEN stock drops to or below minimum stock or becomes depleted/negative
- THEN the system SHALL categorize alerts by severity, prioritize urgent items first, and compute suggested reorder quantities targeting par levels


