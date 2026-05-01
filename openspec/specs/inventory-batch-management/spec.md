# Specification: Inventory Batch Management

## Purpose
Track inventory at the batch level for perishable items to enable FIFO consumption and expiration monitoring.

## Requirements

### Requirement: Batch Creation
The system MUST create a new batch record upon every purchase of an `isPerishable` item.

#### Scenario: Auto-batch creation on purchase
- GIVEN an Insumo "Leche" (isPerishable: TRUE)
- WHEN a purchase of 10L with expiration "2026-05-30" is recorded
- THEN the system MUST create a new `Batch` record with the expiration date and stock balance of 10L.

### Requirement: Batch Management
The system MUST allow editing batch details or manually adjusting stock.

#### Scenario: Manually adjusting batch
- GIVEN a batch with 5L of "Leche"
- WHEN the user adjusts the batch stock to 4.5L due to spoilage
- THEN the batch stock SHALL be updated to 4.5L AND an adjustment movement recorded.
