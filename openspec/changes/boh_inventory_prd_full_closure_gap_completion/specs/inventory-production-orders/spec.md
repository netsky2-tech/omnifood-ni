# Delta for inventory-production-orders

## ADDED Requirements

### Requirement: Production Order Operational Lifecycle

The system MUST persist production orders through draft, planned, confirmed-consumption, received-output, and closed states with recipe snapshot, planned vs actual yield, and operator audit references.

#### Scenario: Confirming a planned batch
- GIVEN a planned production order exists
- WHEN the operator confirms execution and receipt
- THEN the system SHALL persist consumed quantities, produced quantity, yield variance, and linked movement IDs
- AND the order SHALL advance without losing its original recipe snapshot.

#### Scenario: Yield shortfall
- GIVEN planned output exceeds actual output
- WHEN the operator closes the order
- THEN the system MUST keep the actual yield and variance reason
- AND costing SHALL remain truthful to consumed inputs and received output only.

### Requirement: Production Workspace Design Compliance

Production planning, confirmation, and trace views MUST comply with `docs/DESIGN.md`, including tabular numerals for quantities/costs, outlined status chips, no shadows, and full-width critical actions for irreversible posting.

#### Scenario: Reviewing planned vs actual production
- GIVEN a user opens a production detail view
- WHEN metrics are shown
- THEN the screen SHALL present plan, actual, variance, and cost figures with tabular alignment
- AND action hierarchy SHALL follow primary/secondary/tertiary design-system rules.
