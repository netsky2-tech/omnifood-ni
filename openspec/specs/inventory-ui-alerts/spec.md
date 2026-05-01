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
