# Delta for Sales Module Core (FOH)

## ADDED Requirements

### Requirement: Fiscal and Offline Regression Preservation
Offline sales MUST remain locally committed in SQLite with immutable DGI identity and sequential numbering, and reconnect processing MUST preserve invoice identity, tenant isolation, idempotency, and replay safety.

#### Scenario: DGI and offline regression
- GIVEN a cashier completes a sale while offline
- WHEN the sale is committed locally and later replayed online
- THEN its original sequential DGI number and immutable invoice identity MUST be preserved
- AND replay MUST not create a second invoice or movement.

#### Scenario: Inventory outcome is auditable
- GIVEN a sale has an explicit inventory outcome, including `APPLIED_INVENTORY_PENDING` or `APPLIED_NO_INVENTORY_IMPACT`
- WHEN the invoice is finalized or synchronized
- THEN the invoice/audit trail MUST retain that outcome and its reason alongside the DGI invoice identity.

#### Scenario: Pending inventory is not silently backfilled
- GIVEN a prepared or compound sale was finalized as `APPLIED_INVENTORY_PENDING` because no published recipe existed
- WHEN a recipe is later published
- THEN the historical sale MUST retain its original outcome
- AND any historical remediation MUST require an explicit append-only Inventory, Kardex, or audit command.
