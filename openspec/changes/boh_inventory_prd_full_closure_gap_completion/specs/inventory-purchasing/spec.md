# Delta for inventory-purchasing

## ADDED Requirements

### Requirement: FX and CPP Receiving Visibility

The system MUST require invoice date and currency on purchase documents, SHALL show the BCN rate used for USD invoices, and MUST preview resulting NIO unit cost and CPP impact before posting.

#### Scenario: Reviewing a USD purchase
- GIVEN a purchase is entered in USD
- WHEN the operator reaches receiving review
- THEN the system SHALL show invoice date, BCN rate source, converted NIO unit cost, and projected CPP change
- AND posting MUST use those reviewed values.

### Requirement: Purchase Receiving Batch Capture and Design Compliance

Purchase receiving screens MUST support per-line batch/expiry capture for eligible items and MUST comply with `docs/DESIGN.md` for forms, lists, chips, buttons, and critical post confirmations.

#### Scenario: Receiving mixed items
- GIVEN a purchase contains batch-managed and non-batch items
- WHEN the operator reviews lines
- THEN only eligible lines SHALL require lot/expiry inputs
- AND the screen SHALL use visible labels, 48px hit targets, flat borders, and tabular numerals for quantity and cost columns.
