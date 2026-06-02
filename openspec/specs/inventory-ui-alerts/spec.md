# Specification: Inventory UI Alerts

## Purpose
Provide immediate visual feedback to the POS operator when an item's stock level falls below its PAR level.

## Requirements

### Requirement: Local Visual Notification
The POS app MUST display a non-blocking visual alert (e.g., Toast or Snackbar) when a low-stock event is triggered.

#### Scenario: Displaying toast on low stock
- GIVEN the POS user is on any screen
- WHEN the `MovementEngine` triggers a low-stock alert for "Granos de Café"
- THEN a visual notification MUST appear with the message "Alerta: Stock bajo en Granos de Café (Actual: 150g)".

### Requirement: Alert Persistence
The system SHOULD allow viewing active alerts until they are acknowledged or the session ends.

#### Scenario: Persistent alert in session
- GIVEN a low-stock alert was triggered
- WHEN the user navigates between features
- THEN the alert SHALL NOT be lost and should remain accessible or visible if configured.

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
