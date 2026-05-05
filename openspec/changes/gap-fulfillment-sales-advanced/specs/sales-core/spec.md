# Delta for Sales Module Core (FOH)

## ADDED Requirements

### Requirement: FR-04: Advanced Item Metadata

Each `InvoiceItem` MUST support metadata for specialized retail/food service scenarios.

- **Variants**: MUST support a `variantId` if the product has multiple versions (e.g., Size: Large).
- **Modifiers**: MUST support a list of `selectedModifiers` (e.g., Extra Cheese).
- **Notes**: MUST support a `notes` field for custom instructions (e.g., "Well done").

#### Scenario: Sale with Modifiers and Notes

- GIVEN a product "Latte" with modifier "Soy Milk"
- WHEN the user adds "Latte" to cart with "Soy Milk" and note "Low foam"
- THEN the `InvoiceItem` record MUST include the modifier ID and the custom note.

### Requirement: FR-05: Sales History Browser

The system MUST provide a UI to browse and search for past invoices.

- **Search**: MUST support searching by Invoice Number.
- **Details**: MUST show all items, taxes, and payments for a selected invoice.
- **Action**: MUST allow initiating a Return (Nota de Crédito) directly from an invoice's detail view.

#### Scenario: Browsing History for Returns

- GIVEN the user is in the "Sales History" screen
- WHEN the user selects invoice "001-001-01-00000042"
- THEN the system MUST display all items and total amount
- AND provide a "DEVOLUCIÓN" button that pre-fills the return flow.

### Requirement: FR-06: Local Variant/Modifier Management

The POS MUST allow authorized users to manage product options locally.

- **Variants**: Add/Edit/Remove size/flavor variants and their price adjustments.
- **Modifiers**: Add/Edit/Remove extra ingredients/options and their prices.

#### Scenario: Adding a new Modifier locally

- GIVEN a product "Pizza"
- WHEN the user adds a new modifier "Anchovies" with price \$2.00
- THEN the modifier MUST be available for selection in the POS Grid.

## MODIFIED Requirements

### Requirement: FR-03: Fiscal Integrity

The system MUST maintain absolute integrity of the fiscal sequence.
- **No-Deletion Policy**: Invoices can only be voided (`is_canceled = true`), never deleted.
- **Invoice Types**: The system MUST distinguish between `regular` invoices and `creditNote` documents.
- **Traceability**: Credit Notes MUST store the `relatedInvoiceId` to maintain the audit trail of the reversal.

(Previously: Invoices can only be voided, never deleted. Numeración is sagrada.)

#### Scenario: Issuing a Credit Note

- GIVEN an existing regular invoice "001-001-01-00000001"
- WHEN the user performs a return (Devolución)
- THEN a new invoice of type `creditNote` MUST be created
- AND it MUST have a unique sequential number
- AND it MUST reference the original invoice ID.

### Requirement: 5. Backend Sync

The synchronization mechanism MUST transmit the full state of the sales aggregate to the central server.
- **Payload**: The payload MUST include the invoice header (`type`, `relatedInvoiceId`), all items (with `variantId`, `notes`), and their respective `modifiers`.
- **Consistency**: The server MUST atomistically persist the invoice and all related sub-entities.

(Previously: The payload includes invoice header, items, and payments.)

#### Scenario: Syncing an Invoice with Modifiers

- GIVEN a local invoice with 2 items and 3 modifiers
- WHEN the sync worker executes
- THEN the backend MUST receive and store the invoice, items, and the modifiers in their respective tables.
