# Delta for Sales Core

## MODIFIED Requirements

### FR-01: Transaction Processing

- **Cart Management**: Add/remove products, adjust quantities.
- **Price Calculation**: Subtotal, dynamic Tax (IVA), and Total.
- **Tax Flexibility**: Support for tax exemptions (Exento) and variable rates per product or globally (e.g., tax-free holidays).
- **DGI Compliance**: Automatic assignment of sequential invoice numbers based on authorized range.
- **Inventory Integration**: Real-time stock deduction via `MovementEngine` upon sale finalization.
- **Discount Control (S-RBAC-02)**: The system MUST restrict CASHIER and WAITER from applying direct discounts unless a Manager PIN override is provided.
- **Override Lockout (S-PIN-06)**: When a supervisor provides a PIN override for a restricted action (e.g., discount, void, or UI bypass), the system MUST unlock that capability for a single transaction or single action only. Re-authorization MUST be required for any subsequent restricted actions.

(Previously: Covered cart, price, tax, DGI, and inventory integration without explicit discount access control or supervisor override lockout rules)

#### Scenario: S-RBAC-02 Cajero no aplica descuentos directos
- GIVEN the current user is a CASHIER or WAITER
- WHEN they attempt to apply a discount to an invoice item or subtotal
- THEN the POS MUST block the action
- AND prompt for a Manager PIN override
- AND prevent the discount from being applied if the override fails or is canceled

#### Scenario: S-PIN-06 Desbloqueo por única transacción
- GIVEN a CASHIER has successfully obtained a Manager PIN override to perform a restricted action (e.g., applying a discount)
- WHEN the cashier completes that specific transaction
- AND attempts a second restricted action on a new transaction
- THEN the POS MUST require a new Manager PIN override
- AND MUST NOT reuse the previous override authorization state

## Out of Scope
The following items are explicitly deferred to Wave 2 and MUST NOT be implemented in this delta:
- Wave 1B audit log DB-level immutability proof.
- Anti-tampering lock mechanism.
- PIN algorithm policy migration (bcrypt to Argon2/PBKDF2).
- Performance benchmark P99 for login/audit.
- Cash model B power-loss closure.
