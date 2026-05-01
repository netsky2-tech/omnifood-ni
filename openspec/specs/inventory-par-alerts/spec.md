# Specification: Inventory PAR Alerts

## Purpose
Notify the business when stock levels reach safety thresholds to prevent stockouts.

## Requirements

### Requirement: Low Stock Alert Trigger
The system MUST check the current stock against the `parLevel` after every movement that decreases stock. Alerts MUST be delivered via both the Local UI (POS) and External Channels (Backend).

#### Scenario: Triggering alert on sale
- GIVEN "Leche" with PAR level 2000ml and stock 2100ml
- WHEN a sale reduces stock to 1900ml
- THEN the system MUST call the Alert Service to push a "Low Stock" notification to the POS UI
- AND the event SHALL be flagged for external delivery during next sync.

### Requirement: Alert Deduplication
The system SHOULD avoid sending duplicate alerts for the same item within a short period or until stock is replenished.

#### Scenario: No duplicate alert
- GIVEN "Leche" has already triggered a "Low Stock" alert and remains below PAR
- WHEN another sale further reduces stock
- THEN the system SHOULD NOT trigger a new alert for "Leche".
