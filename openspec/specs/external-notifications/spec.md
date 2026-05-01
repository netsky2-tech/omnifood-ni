# Specification: External Notifications

## Purpose
Ensure business owners are notified via external channels (Email/SMS) when inventory issues are detected.

## Requirements

### Requirement: Email Delivery
The backend MUST send an email to the registered business owner(s) when a low-stock event is received during synchronization.

#### Scenario: Sending low stock email
- GIVEN the backend receives a sync batch with a "Low Stock" event
- WHEN the event is processed
- THEN the system MUST send an email to the owner with the item name, current stock, and PAR level.

### Requirement: SMS Delivery
The backend SHOULD send an SMS to the business owner for high-priority low-stock events (if configured).

#### Scenario: Sending low stock SMS
- GIVEN a high-priority item reaches low stock
- WHEN the backend processes the event
- THEN an SMS MUST be sent to the configured mobile number.

### Requirement: Provider Abstraction
The system MUST use a provider-agnostic interface for sending notifications (Hexagonal Architecture).

#### Scenario: Switching email providers
- GIVEN the system uses Mailtrap for dev
- WHEN moving to production with SendGrid
- THEN the core logic MUST NOT change, only the implementation adapter.
