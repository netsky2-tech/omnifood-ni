# Delta for inventory-core

## ADDED Requirements

### Requirement: Negative Stock Policy for Food Operations
The system MUST allow temporary negative stock for configured food items and SHALL record the movement using the latest known CPP.

#### Scenario: Sale at theoretical zero stock (UC-03)
- GIVEN an item configured to allow negative stock and current stock is 0.0000
- WHEN a sale consumes 1.5000 units
- THEN stock SHALL become -1.5000 and the movement SHALL be valued at the latest CPP

#### Scenario: Blocked negative stock for restricted item
- GIVEN an item configured to disallow negative stock
- WHEN a movement would produce stock below 0.0000
- THEN the system SHALL reject the movement with a policy error

### Requirement: Acceptance Matrix Traceability
The system MUST map inventory operations to UC-01..UC-05 acceptance anchors for automated verification.

#### Scenario: Executing acceptance tests
- GIVEN CI acceptance suite runs
- WHEN test evidence is produced
- THEN each UC anchor SHALL reference at least one executable scenario
