# Delta for inventory-recursive-bom

## ADDED Requirements

### Requirement: Historical Version Binding in Explosion
Recursive BOM explosion MUST resolve components using the recipe version bound to the originating business document.

#### Scenario: Historical sale replay
- GIVEN a sale references recipe version V3
- WHEN recursive explosion is recalculated for audit
- THEN all sub-recipe traversals SHALL use V3-linked versions, not current active versions

### Requirement: Deterministic Multi-Level Expansion
The system SHALL produce deterministic base-insumo totals at `NUMERIC(14,4)` across repeated runs.

#### Scenario: Repeated explosion comparison
- GIVEN the same recipe snapshot and quantity
- WHEN explosion runs multiple times
- THEN expanded insumo totals SHALL match exactly at 4 decimals
