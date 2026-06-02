# Delta for inventory-batch-management

## ADDED Requirements

### Requirement: Batch-Aware Production and Consumption
Batch-managed items MUST keep per-batch balances consistent with aggregate stock after purchases, production receipts, and consumption outflows.

#### Scenario: Production receipt into batch-managed sub-recipe
- GIVEN a sub-recipe item is batch-managed
- WHEN production receipt is posted
- THEN the system SHALL create or update a batch record and align aggregate stock with batch totals

### Requirement: Batch Cost Traceability
Each batch-affecting movement SHALL preserve valuation metadata at `NUMERIC(14,4)` for audit and FIFO usage.

#### Scenario: Consuming from multiple batches
- GIVEN two batches are partially consumed by one sale
- WHEN movement posts
- THEN the ledger SHALL capture per-batch consumed quantity and valuation at 4 decimals
