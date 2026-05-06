# Delta Specs: JD Remaining Fixes

## Delta for sales-core

### MODIFIED Requirements

### Requirement: Transaction Processing

Cart management, price calculation, tax flexibility, DGI sequential numbering, **FIFO-aware inventory deduction**, and **atomic audit logging**.

- **FR-01.1**: Cart Management — add/remove products, adjust quantities. (unchanged)
- **FR-01.2**: Price Calculation — subtotal, dynamic Tax (IVA), and Total. (unchanged)
- **FR-01.3**: Tax Flexibility — support for tax exemptions and variable rates. (unchanged)
- **FR-01.4**: DGI Compliance — automatic sequential invoice numbering. (unchanged)
- **FR-01.5**: Inventory Integration — Real-time stock deduction via `MovementEngine` upon sale finalization. Movements for perishable insumos **MUST** carry `batchDeductions` indicating which batches were consumed and in what quantities.

(Previously: Inventory integration lacked FIFO batch tracking; movements carried no batch information.)

#### Scenario: Sale of perishable insumo with multiple batches

- GIVEN "Leche" has Batch B1 (2L, expires 2026-05-20) and Batch B2 (5L, expires 2026-06-20)
- WHEN a sale requiring 3L of "Leche" is finalized
- THEN the generated movement for "Leche" **MUST** include `batchDeductions` specifying: B1 deducted 2L, B2 deducted 1L
- AND the remaining stock of B1 **MUST** be 0 and B2 **MUST** be 4L

### MODIFIED Requirements

### Requirement: Fiscal Integrity

- **FR-03.1**: No-Deletion Policy — invoices can only be voided (`is_canceled = true`), never deleted. (unchanged)
- **FR-03.2**: Voiding Logic — requires a reason and creates a reversal movement. (unchanged)
- **FR-03.3**: Tax Audit — maintain the tax rate applied at the moment of sale. (unchanged)
- **FR-03.4**: **Audit Atomicity** — `SALE_CREATED` audit entry **MUST** be logged inside the same database transaction as the sale data. If the transaction rolls back, the audit entry **MUST NOT** persist.

(Previously: Audit log was written outside the transaction, allowing ghost audit entries on rollback.)

#### Scenario: Audit entry absent on rollback

- GIVEN a sale finalization that fails due to a DB constraint violation
- WHEN the transaction rolls back
- THEN no `SALE_CREATED` audit entry **MUST** exist in the audit log

## ADDED Requirements

### Requirement: Credit Note Total Validation

The system **MUST** reject any credit note whose cumulative total (including prior credit notes for the same original invoice) exceeds the original invoice total.

#### Scenario: Credit note exceeding original invoice rejected

- GIVEN Invoice INV-001 with total C$1,000 and no existing credit notes
- WHEN a credit note for C$1,200 is created against INV-001
- THEN the system **MUST** reject the operation with an appropriate error

#### Scenario: Second credit note exceeding remaining balance rejected

- GIVEN Invoice INV-001 with total C$1,000, and an existing credit note for C$600
- WHEN a second credit note for C$500 is created against INV-001
- THEN the system **MUST** reject the operation (600 + 500 > 1,000)

### Requirement: Bulk Sync Marking

The `markAsSynced` operation for invoices **MUST** use a single SQL `WHERE id IN (...)` statement per batch instead of iterating individual updates.

#### Scenario: Batch of 10 invoices synced

- GIVEN 10 invoices successfully synced to the cloud
- WHEN `markAsSynced` is called with 10 invoice IDs
- THEN exactly 1 SQL statement **MUST** be executed (not 10 individual UPDATEs)

---

## Delta for inventory-batch-management

### ADDED Requirements

### Requirement: Batch Consumption in Sale Flow

`getBatchesForConsumption` **MUST** be called by the movement engine for every perishable insumo during sale processing. The resulting `BatchDeduction` list **MUST** be persisted alongside the movement record.

#### Scenario: Perishable insumo consumed via FIFO

- GIVEN "Leche" (isPerishable: TRUE) has batches B1 (2L) and B2 (5L)
- WHEN a sale deducts 3L
- THEN `getBatchesForConsumption("Leche", 3.0)` is called and its deductions attached to the movement

### Requirement: Batch Stock Restoration on Reversal

When a sale is voided or a credit note is issued, the system **MUST** restore stock to the original batches using the `batchDeductions` recorded on the reversal movement, not to a flat sum.

#### Scenario: Voiding a sale restores batch stock

- GIVEN a sale that deducted 2L from B1 and 1L from B2
- WHEN the sale's invoice is voided
- THEN B1 stock increases by 2L AND B2 stock increases by 1L

---

## Delta for inventory-shrinkage

### ADDED Requirements

### Requirement: Shrinkage Form UX Guards

The shrinkage recording form **MUST** prevent duplicate submissions and ensure proper resource lifecycle.

- **Button Disable Guard**: The "REGISTRAR" button **MUST** be disabled (`null` onPressed) while `isLoading == true`.
- **Controller Disposal**: `qtyController` and `reasonController` **MUST** be disposed when the dialog is closed.
- **Searchable Insumo Selection**: The `DropdownButtonFormField<String>` for insumo selection **MUST** be replaced with a searchable autocomplete widget that filters the insumo list as the user types.

#### Scenario: Button disabled during submission

- GIVEN the shrinkage form is open and the user taps "REGISTRAR"
- WHEN `isLoading` transitions to `true`
- THEN the "REGISTRAR" button **MUST** be non-interactive until `isLoading` returns to `false`

#### Scenario: Searchable autocomplete filters insumos

- GIVEN the insumo list contains ["Leche", "Limón", "Lechuga"]
- WHEN the user types "Lech" in the autocomplete field
- THEN the filtered options shown **MUST** be ["Leche", "Lechuga"]

---

## Delta for inventory-movements

### MODIFIED Requirements

### Requirement: Real-time Stock Discount

Each sale **MUST** trigger a proportional stock discount of Insumos based on the product's recipe. For perishable items, stock **MUST** be deducted using FIFO (First-In, First-Out) logic based on expiration dates, and `batchDeductions` **MUST** be attached to movement records. Recipe ingredient lookups **MUST** use a single bulk query (`getInsumosByIds`) per `_buildMovements` invocation instead of per-ingredient queries.

(Previously: FIFO logic was specified but not wired; ingredients were loaded one-by-one causing N+1 queries.)

#### Scenario: FIFO deduction with batch tracking (unchanged)

- GIVEN "Leche" has two batches: B1 (Expires: 2026-05-20, Stock: 2L), B2 (Expires: 2026-06-20, Stock: 5L)
- WHEN a sale requires 3L of "Leche"
- THEN the system **MUST** fully exhaust B1 (2L) AND deduct the remainder (1L) from B2 AND attach `batchDeductions` to the movement

#### Scenario: Bulk ingredient loading

- GIVEN a recipe with 5 insumo ingredients
- WHEN `_buildMovements` processes the recipe
- THEN exactly 1 bulk repository call (`getInsumosByIds`) **MUST** be made for all 5 ingredients (not 5 individual calls)

#### Scenario: Reversal restores batch stock

- GIVEN a sale movement with `batchDeductions`: [B1: 2L, B2: 1L]
- WHEN the sale is voided
- THEN the reversal movement **MUST** reference the original deductions and B1 stock increases by 2L, B2 stock increases by 1L

### Requirement: Kardex Auditoría (unchanged)

Every movement **MUST** be recorded in an inalterable Kardex log, including batch deduction metadata when applicable.

(Previously: Metadata was implicit; batch deductions were not mentioned.)

#### Scenario: Kardex entry with batch metadata

- GIVEN a sale that deducted from batches B1 and B2
- WHEN the Kardex entry is created
- THEN it **MUST** include `batchDeductions` metadata listing each batch ID and amount deducted

---

## Delta for infrastructure

### ADDED Requirements

### Requirement: Invoice Child Entity Reconciliation

`syncInvoices` on the admin backend **MUST** reconcile child entities (items and payments) for existing invoices. When a previously-synced invoice is updated (e.g., cancellation), the system **MUST** diff and upsert changed items and payments rather than only updating top-level invoice fields.

#### Scenario: Invoice cancellation syncs items status

- GIVEN an invoice INV-001 was previously synced with 2 items and 1 payment
- WHEN the same invoice is re-synced with `isCanceled: true`
- THEN the invoice record **MUST** be updated AND items/payments **MUST** be diffed and upserted using `ON CONFLICT DO UPDATE`

#### Scenario: New item added to existing invoice

- GIVEN invoice INV-001 was synced with 2 items
- WHEN a re-sync payload includes 3 items (2 existing + 1 new)
- THEN the new item **MUST** be inserted AND existing items **MUST** remain unchanged