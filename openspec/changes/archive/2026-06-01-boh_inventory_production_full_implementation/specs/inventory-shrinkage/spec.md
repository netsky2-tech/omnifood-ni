# Delta for inventory-shrinkage

## ADDED Requirements

### Requirement: Typed Shrinkage Classification
Shrinkage records MUST require one of the approved categories: `VENCIMIENTO`, `DESECHO_COCINA`, `DETERIORO_BODEGA`, `CORTESIA_DEGUSTACION`.

#### Scenario: Invalid shrinkage type
- GIVEN an operator enters an unrecognized reason code
- WHEN the shrinkage is submitted
- THEN the system SHALL reject the record with validation error

### Requirement: Shrinkage Costing Precision
Shrinkage movements MUST value outflow at current CPP using `NUMERIC(14,4)` for quantity, unit cost, and total cost.

#### Scenario: Posting direct insumo shrinkage
- GIVEN insumo stock exists with current CPP
- WHEN 2.3456 units are shrunk
- THEN kardex outflow SHALL persist quantity and valuation at 4 decimals
