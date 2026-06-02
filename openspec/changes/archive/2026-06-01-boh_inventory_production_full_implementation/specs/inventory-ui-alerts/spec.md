# Delta for inventory-ui-alerts

## ADDED Requirements

### Requirement: Role-Targeted Forensic Alerts
The system MUST route high-value inventory alerts to admin users and SHOULD show contextual non-blocking alerts to operators.

#### Scenario: Operator vs admin visibility
- GIVEN a high-value manual adjustment was posted
- WHEN alerts are dispatched
- THEN admins SHALL receive push/email forensic alerts and operators SHALL see contextual in-app notice

### Requirement: Alert Payload Integrity
Inventory alert payloads MUST include movement type, item, amount, valuation, actor, and origin document references.

#### Scenario: Auditing an alert
- GIVEN an alert is opened from UI
- WHEN details are displayed
- THEN auditors SHALL be able to trace the originating movement and document without extra lookup
