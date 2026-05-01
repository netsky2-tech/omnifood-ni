# Specification: Inventory Movements & Kardex

## Purpose
Track every stock change, ensure data integrity, and provide audit history.

## Requirements

### Requirement: Real-time Stock Discount
Each sale MUST trigger a proportional stock discount of Insumos based on the product's recipe. For perishable items, stock MUST be deducted using FIFO (First-In, First-Out) logic based on expiration dates.
(Previously: FIFO logic was not defined)

#### Scenario: Stock discount after sale (FIFO)
- GIVEN "Leche" has two batches: B1 (Expires: 2026-05-20, Stock: 2L), B2 (Expires: 2026-06-20, Stock: 5L)
- WHEN a sale requires 3L of "Leche"
- THEN the system MUST fully exhaust B1 (2L) AND deduct the remainder (1L) from B2.

### Requirement: Kardex Auditoría
Every movement (Sale, Purchase, Shrinkage, Adjustment) MUST be recorded in an inalterable Kardex log, including metadata (e.g., Supplier ID for purchases, Reason for shrinkage).
(Previously: Metadata inclusion was implicit)

#### Scenario: Recording a Purchase with metadata
- GIVEN an Insumo "Agua" with stock 10
- WHEN a purchase of 50 units is recorded from "Café del Norte"
- THEN a Kardex entry of type "PURCHASE" MUST be created with supplier_id "Café del Norte" AND stock updated to 60.

#### Scenario: Recording Shrinkage with reason
- GIVEN "Leche" with stock 2000ml
- WHEN 500ml is recorded as waste for "Derramada"
- THEN a Kardex entry of type "SHRINKAGE" MUST be created with reason "Derramada".

### Requirement: DGI Compliance - Reversal
If an invoice is canceled, the system MUST automatically revert the stock descargo.

#### Scenario: Reversing stock on cancellation
- GIVEN a sale that discounted 200ml of Milk
- WHEN that sale's invoice is marked as "is_canceled"
- THEN the stock MUST increase by 200ml AND a Kardex entry of type "REVERSAL" MUST be created.

### Requirement: PAR Levels & Alertas
The system MUST allow defining minimum stock levels (PAR) and trigger alerts when stock falls below them via the Alert Service.

#### Scenario: PAR alert
- GIVEN "Leche" with PAR level 2000ml and current stock 2100ml
- WHEN a sale reduces stock to 1900ml
- THEN the system MUST trigger a "Low Stock" alert through the Alert Service.
