# Delta for inventory-master-data-ui

## ADDED Requirements

### Requirement: BOH Master Data Closure Workspace

The system MUST provide BOH list/detail flows for suppliers, warehouses, and items that expose operational status, sync state, and inventory attributes needed to complete PRD workflows.

#### Scenario: Reviewing an item record
- GIVEN a user opens an inventory item detail
- WHEN the item is batch-managed or perishable
- THEN the screen SHALL show warehouse, batch policy, PAR values, and sync status
- AND the user SHALL be able to navigate to related purchases, batches, and recipes when permitted.

### Requirement: Master Data Design Compliance

All BOH master-data screens MUST comply with `docs/DESIGN.md`: minimalist flat styling, visible labels, 48px minimum interactive controls, sharp data grids where density matters, and primary/secondary/tertiary color usage only by system meaning.

#### Scenario: Editing supplier and warehouse forms
- GIVEN a user opens a BOH form
- WHEN the user edits text or numeric fields
- THEN labels MUST remain visible above inputs
- AND focus, buttons, chips, and tables SHALL match the design-system interaction rules.
