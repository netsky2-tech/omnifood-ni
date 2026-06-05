# Delta for identity

## ADDED Requirements

### Requirement: Inventory BOH RBAC Enforcement

The system MUST enforce inventory permissions consistently across backend guards and POS BOH actions for view, create, approve, acknowledge, and report operations.

#### Scenario: Authorized manager opens count approval
- GIVEN a manager has `inventory.count.approve`
- WHEN the manager opens a count variance for approval
- THEN the backend MUST authorize the request
- AND the POS SHALL enable the approval action.

#### Scenario: Unauthorized operator attempts BOH approval
- GIVEN an operator lacks `inventory.count.approve`
- WHEN the operator opens the same count variance
- THEN the backend MUST return forbidden
- AND the POS MUST hide or disable the approval control with an access reason.

### Requirement: Inventory Discoverability and Design Compliance

Any BOH inventory surface shown to an authorized user MUST follow `docs/DESIGN.md` as binding source-of-truth: flat layout, 1-2px borders, no shadows, Inter typography, tabular numerals for quantities/costs, and 48px minimum hit targets.

#### Scenario: Authorized user sees inventory workspace entry
- GIVEN a user has at least one BOH inventory permission
- WHEN the user opens navigation
- THEN the system SHALL show only the inventory destinations permitted for that user
- AND each destination SHALL use the design-system states for primary, secondary, and critical actions.
