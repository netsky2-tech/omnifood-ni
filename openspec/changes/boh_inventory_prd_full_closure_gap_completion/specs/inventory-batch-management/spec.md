# Delta for inventory-batch-management

## ADDED Requirements

### Requirement: Expiry Capture and FIFO Review UX

The system MUST let BOH users capture lot code, received date, and expiration date during receiving, and SHALL expose FIFO pick order plus near-expiry state before any batch adjustment or production/consumption decision.

#### Scenario: Receiving a perishable purchase
- GIVEN a perishable item is being received
- WHEN the operator records batch metadata
- THEN the system MUST persist lot code, received date, expiration date, and quantity
- AND the review screen SHALL show FIFO order and expired/near-expiry chips.

#### Scenario: Reviewing before manual adjustment
- GIVEN multiple active batches exist for one item
- WHEN the operator prepares a batch adjustment
- THEN the system SHALL display current FIFO sequence and affected valuations
- AND the operator MUST select the exact batch being adjusted.

### Requirement: Batch Workspace Design Compliance

Batch review and adjustment screens MUST comply with `docs/DESIGN.md`, including flat sections, outlined tables, Inter typography, tabular numerals for stock/value, 56px table rows, and full-width critical modals for destructive confirmations.

#### Scenario: Confirming a batch write-off
- GIVEN the user starts a destructive batch adjustment
- WHEN the confirmation modal opens
- THEN the modal MUST use the critical design-system treatment
- AND all numeric fields SHALL render in tabular figures.
