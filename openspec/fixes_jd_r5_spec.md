# Delta Specs: Fixes from Judgment Day R5

## Delta for Inventory Core

### MODIFIED Requirements

#### Requirement: Multi-Tenant Isolation in Insumo Queries

Every Insumo lookup in `InventoryService` MUST include `tenant_id` in the `where` clause. Cross-tenant data leakage MUST NOT be possible, even if PostgreSQL RLS is temporarily disabled or misconfigured.

(Previously: No explicit tenant_id filtering on Insumo `findOne` calls; reliance on RLS alone.)

##### Scenario: Insumo lookup by ID filters by tenant

- GIVEN tenant "A" has Insumo "Café" and tenant "B" has Insumo "Té"
- WHEN `syncMovements` processes a movement for Insumo "Café" with tenant "A" context
- THEN the query MUST include `tenant_id: <tenant_A>` in the `where` clause
- AND the query MUST NOT return "Té" from tenant "B"

##### Scenario: recordPurchase enforces tenant isolation

- GIVEN an Insumo exists with `id: "abc"` and `tenant_id: "A"`
- WHEN `recordPurchase` is called for `insumoId: "abc"` within tenant "A" context
- THEN the `findOne` query MUST include both `id` and `tenant_id` conditions
- AND if tenant "B" queries the same ID, no result MUST be returned

---

## Delta for Inventory PAR Alerts

### MODIFIED Requirements

#### Requirement: Low Stock Alert Trigger

The system MUST check the current stock against the `parLevel` after every movement that decreases stock. Both `recordSale` and `recordShrinkage` MUST use a non-volatile crossing check: the alert fires only when stock transitions from at-or-above PAR to below PAR. Alerts MUST be delivered via both the Local UI (POS) and External Channels (Backend).

(Previously: Alert triggered on any stock-threshold check without crossing semantics, causing duplicates on repeated deductions.)

##### Scenario: Alert fires on stock crossing below PAR (sale)

- GIVEN "Leche" with PAR level 2000ml and stock 2100ml
- WHEN a sale reduces stock to 1900ml
- THEN the system MUST detect the PAR crossing (2100 ≥ 2000 → 1900 < 2000)
- AND the system MUST call the Alert Service to push a "Low Stock" notification

##### Scenario: Alert fires on stock crossing below PAR (shrinkage)

- GIVEN "Café" with PAR level 500g and stock 550g
- WHEN shrinkage of 100g reduces stock to 450g
- THEN the system MUST detect the PAR crossing (550 ≥ 500 → 450 < 500)
- AND the system MUST call the Alert Service to push a "Low Stock" notification

##### Scenario: No duplicate alert when stock stays below PAR

- GIVEN "Leche" with PAR level 2000ml and stock 1900ml (already below PAR)
- WHEN a sale further reduces stock to 1800ml
- THEN the system MUST NOT trigger a new alert for "Leche"

##### Scenario: Alert fires again after replenishment crosses above PAR

- GIVEN "Leche" below PAR at 1900ml, then restocked to 2500ml
- WHEN a subsequent sale reduces stock back to 1900ml
- THEN the system MUST trigger a new "Low Stock" alert (crossing occurred again)

---

## Delta for Data Sync

### ADDED Requirements

#### Requirement: Poison Pill Isolation in Batch Sync

The SyncService MUST isolate 4xx errors to the individual record that caused them. When a batch sync receives a 4xx response, the system MUST identify the offending record, mark ONLY that record as failed, and retry the remaining valid records. The system MUST NOT mark an entire batch as failed due to a single poison pill.

##### Scenario: Single poison pill in sales batch

- GIVEN 50 unsynced sales invoices are being synced
- WHEN invoice #23 receives a 400 Bad Request response
- THEN the system MUST mark ONLY invoice #23 as failed
- AND the system MUST retry the remaining 49 invoices

##### Scenario: Single poison pill in movements batch

- GIVEN 100 unsynced inventory movements are being synced
- WHEN movement #5 receives a 409 Conflict response
- THEN the system MUST mark ONLY movement #5 as failed
- AND the system MUST continue syncing the remaining 99 movements

##### Scenario: Multiple poison pills in one batch

- GIVEN 50 unsynced sales invoices are being synced
- WHEN invoices #10, #25, and #40 each receive 4xx responses
- THEN the system MUST mark invoices #10, #25, and #40 as failed
- AND the system MUST mark all other invoices as synced successfully

##### Scenario: 5xx or network error does not poison-pill

- GIVEN 50 unsynced sales invoices are being synced
- WHEN the request fails with a 503 Service Unavailable or a network error
- THEN the system MUST NOT mark any individual invoice as failed
- AND the system MUST abandon the batch and retry later

---

## Delta for Sales Core

### MODIFIED Requirements

#### Requirement: DGI Invoice Number Uniqueness

The system MUST enforce uniqueness of `invoice_number` at the database level via a unique index on the `invoices` table. DGI sequential numbering MUST NOT allow duplicate numbers even under race conditions.

(Previously: Uniqueness was implied by spec text "Indices on `number` (unique)" but never implemented in the Floor entity.)

##### Scenario: Duplicate invoice number rejected by database constraint

- GIVEN two concurrent POS terminals are finalizing invoices
- WHEN both attempt to insert an invoice with the same `invoice_number`
- THEN SQLite MUST reject the second insert with a constraint violation
- AND the second terminal MUST generate the next sequential number and retry

##### Scenario: Normal invoice creation succeeds with unique constraint

- GIVEN a valid invoice with number "001-001-01-00000042"
- WHEN the invoice is inserted into the local database
- THEN the insert MUST succeed
- AND subsequent lookups by `invoice_number` MUST benefit from the unique index