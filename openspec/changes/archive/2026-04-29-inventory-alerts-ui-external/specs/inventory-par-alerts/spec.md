# Delta for Inventory PAR Alerts

## MODIFIED Requirements

### Requirement: Low Stock Alert Trigger
The system MUST check the current stock against the `parLevel` after every movement that decreases stock. Alerts MUST be delivered via both the Local UI (POS) and External Channels (Backend).
(Previously: Delivery channels were not specified)

#### Scenario: Triggering alert on sale
- GIVEN "Leche" with PAR level 2000ml and stock 2100ml
- WHEN a sale reduces stock to 1900ml
- THEN the system MUST call the Alert Service to push a "Low Stock" notification to the POS UI
- AND the event SHALL be flagged for external delivery during next sync.
