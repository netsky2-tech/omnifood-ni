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

### Requirement: BCN FX Conversion by Invoice Date
Purchases entered in USD MUST convert to NIO using the official BCN exchange rate for the invoice emission date.

#### Scenario: Holiday purchase in USD (UC-01)
- GIVEN a USD invoice dated on a holiday
- WHEN purchase is posted
- THEN the system SHALL resolve BCN rate for that date from cache or approved source and convert unit cost to NIO

### Requirement: NIO-Only CPP Update
The CPP algorithm MUST execute only in NIO and persist resulting CPP at `NUMERIC(14,4)`.

#### Scenario: Mixed-currency purchases
- GIVEN prior stock with CPP in NIO and a new USD purchase
- WHEN conversion is applied
- THEN CPP recalculation SHALL use NIO values only and persist new CPP at 4 decimals
