# Specification: Inventory Purchasing

## Purpose
Track vendor purchases to maintain accurate stock levels and manage procurement costs.

## Requirements

### Requirement: Purchase Recording
The system MUST record every purchase of Insumos/Products from a Supplier, applying conversion factors to stock.

#### Scenario: Registering a purchase with conversion
- GIVEN a "Café" (Purchase UOM: Saco 50lb, Consumption UOM: g, Conversion: 22680)
- WHEN a purchase of 1 Saco is recorded from "Café del Norte"
- THEN stock MUST increase by 22680g AND the purchase MUST be linked to "Café del Norte".

### Requirement: Weighted Average Cost (WAC) Update
The system MUST recalculate the WAC of an item upon each purchase based on the new cost and quantity.

#### Scenario: Updating WAC
- GIVEN an Insumo with current stock 100g at cost $0.05/g ($5 total)
- WHEN a purchase of 100g at cost $0.07/g ($7 total) is recorded
- THEN the new WAC MUST be $0.06/g (($5 + $7) / 200g).
