# Delta for Sales-Core

## ADDED Requirements

### Requirement: Cashier Session Models

The system MUST support two operational models for `CashierSession`: `CAJA_CENTRAL` (Centralized Cashier) and `CARTERA_MESERO` (Waiter Wallet), ensuring cash auditing logic correctly reflects the active model.

#### Scenario: Opening a Centralized Cashier session
- GIVEN a cashier initiates a shift
- WHEN the session is created with the `CAJA_CENTRAL` model
- THEN all cash transactions MUST be routed to the central cash drawer
- AND the session balance MUST reflect central cash.

#### Scenario: Opening a Waiter Wallet session
- GIVEN a waiter initiates a shift
- WHEN the session is created with the `CARTERA_MESERO` model
- THEN all cash transactions MUST be tracked against the individual waiter's wallet
- AND the session balance MUST reflect only the waiter's collections.

#### Scenario: Active shift default migration
- GIVEN there is an ongoing active shift prior to this update
- WHEN the system applies the new session logic
- THEN the active shift MUST default to the `CAJA_CENTRAL` model to prevent disruptions.
