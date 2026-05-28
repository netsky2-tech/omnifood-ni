# Delta for Identity

## MODIFIED Requirements

### 1.2 Authorization (RBAC)

- **Roles**:
  - `OWNER`: Full access to all business data, settings, and staff management.
  - `MANAGER`: Can authorize overrides (anulaciones, discounts), manage shifts, and view daily reports.
  - `CASHIER`: Can perform sales, take payments, and perform cash counts (arqueos).
  - `WAITER`: Can take orders and send them to the kitchen. Limited to their own tables.

- **Permissions**: 
  - Every sensitive action (e.g., `VOID_INVOICE`) must check if the current user has the required permission or request a Manager PIN override.
  - The system MUST restrict WAITER from opening or closing the cash register (S-RBAC-01).
  - The system MUST block CASHIER and WAITER from voiding or canceling invoices (S-RBAC-04).
  - The system MUST block CASHIER and WAITER from accessing X/Z reports via the UI and via direct backend API routes (S-RBAC-05).
  - Offline-first fallback: If offline, the POS MUST enforce role limitations using locally synced role data.
  - Generic Denial: Unauthorized actions MUST yield generic denial messages without leaking existence of restricted data or privileges.
  - Backend Enforcement: Admin backend MUST apply declarative `@Roles()` guards on routes, returning `403 Forbidden` for unauthorized roles.

(Previously: Listed roles and a general rule about sensitive actions without specific explicit UI/route gating for waitstaff/cashiers)

#### Scenario: S-RBAC-01 Mesero no abre/cierra caja
- GIVEN the current user has the WAITER role
- WHEN they attempt to open or close the cash drawer
- THEN the POS MUST deny access
- AND present a generic denial message or prompt for a Manager PIN override

#### Scenario: S-RBAC-04 Void/anulación bloqueada para Cajero/Mesero
- GIVEN the current user has the CASHIER or WAITER role
- WHEN they attempt to void an invoice
- THEN the POS MUST deny the action
- AND prompt for a Manager PIN override to proceed

#### Scenario: S-RBAC-05 Reportes X/Z inaccesibles por UI y ruta directa para Cajero/Mesero
- GIVEN the current user has the CASHIER or WAITER role
- WHEN they attempt to access X or Z reports via the POS UI
- THEN the system MUST hide or completely disable the reports module
- AND WHEN they attempt to access the corresponding backend API route directly
- THEN the backend MUST reject the request with a `403 Forbidden` error without leaking data existence

## Out of Scope
The following items are explicitly deferred to Wave 2 and MUST NOT be implemented in this delta:
- Wave 1B audit log DB-level immutability proof.
- Anti-tampering lock mechanism.
- PIN algorithm policy migration (bcrypt to Argon2/PBKDF2).
- Performance benchmark P99 for login/audit.
- Cash model B power-loss closure.
