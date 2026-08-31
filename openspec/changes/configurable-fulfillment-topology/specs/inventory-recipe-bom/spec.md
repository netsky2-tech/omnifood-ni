# Delta for inventory-recipe-bom

## ADDED Requirements

### Requirement: BOM Uses the Canonical Kardex
Recipe consumption MUST resolve only through the canonical Kardex authority and MUST NOT maintain a parallel product or ingredient stock ledger. A product without a BOM MUST be handled by its explicit inventory policy rather than recipe explosion.

#### Scenario: Recipe sale
- GIVEN a product has a valid BOM and RECIPE_BOM policy
- WHEN one unit is sold
- THEN resolved component quantities SHALL be appended as Kardex consumption movements.

#### Scenario: No-BOM product
- GIVEN a product has no BOM and DIRECT_STOCK policy
- WHEN it is sold
- THEN recipe processing SHALL not invent components and the direct product movement SHALL be used.
