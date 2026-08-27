# Batch 9: Reportes Administrativos, Analítica de Ventas y Conciliación Fiscal DGI — OmniFood NI

This execution plan operationalizes the **Sales Reporting, Business Intelligence Analytics, and DGI Fiscal Reconciliation Module** for the central cloud platform (`apps/admin_backend`).

---

## 1. Authority, Traceability & Core Invariants

### Authoritative References
- **PRD Master v2**: §3.1 (FOH Sales & Checkout), §4.1 (Reporting & BOH Administration)
- **PRD Módulo de Ventas**: §3.3 (Cortes X/Z & Conciliación Fiscal)
- **Normativa DGI DT 09-2007**: Disposición Técnica sobre Sistemas Computarizados de Facturación (Inmutabilidad, Registro de Anulaciones, Desglose IVA 15%, y Correlatividad de Secuencias).

### Invariant & Integrity Rules
1. **INV-9.1 (Multi-Tenant Isolation)**: All sales reports and aggregated queries must strictly enforce `tenant_id` isolation at the PostgreSQL and TypeORM query runner level.
2. **INV-9.2 (DGI Net Sales & Void Exclusions)**: Gross sales, net taxable sales, and collected IVA (15%) must exclude voided/canceled invoices (`is_canceled = true`). Voided invoices must be audited separately with their cancellation reason (`void_reason`) and timestamp.
3. **INV-9.3 (Decoupled Currency Consolidation)**: The reporting engine computes base financials in NIO (`amount_nio`, `total`) while preserving separate currency volume breakdowns (`total_cash_nio`, `total_cash_usd`, `total_card_nio`, `total_card_usd`).
4. **INV-9.4 (Correlative Sequence Integrity)**: The fiscal sequence audit checks for sequential continuity of invoice numbers (`001-001-01-XXXXXXXX`) and flags any gaps/leaks in numbering.

---

## 2. Dependency DAG & Critical Path

```
                    ┌────────────────────────────────────────────────────────────┐
                    │ Slice 9.1: Sales Dashboard & Aggregated Analytics Engine   │
                    │ (Summary metrics, Hourly heatmap, Top items, Cashier rank) │
                    └─────────────────────────────┬──────────────────────────────┘
                                                  │
                                                  ▼
                    ┌────────────────────────────────────────────────────────────┐
                    │ Slice 9.2: DGI Fiscal Reconciliation & Sequence Audit API  │
                    │ (Monthly tax breakdown, Void audit, Sequence gap detection)│
                    └─────────────────────────────┬──────────────────────────────┘
                                                  │
                                                  ▼
                    ┌────────────────────────────────────────────────────────────┐
                    │ Slice 9.3: Structured Accounting Export (CSV / JSON)       │
                    │ (Libro de Ventas, Resumen Cortes Z, Exportador Contable)   │
                    └────────────────────────────────────────────────────────────┘
```

---

## 3. Detailed Vertical Slice Breakdown

---

### Slice 9.1: Dashboard de Ventas Consolidadas & Analítica Operativa ✅ COMPLETED
- **Goal:** Provide fast, aggregated sales analytics endpoints for managers and owners to visualize daily/period performance.
- **Touched Surfaces:**
  - `apps/admin_backend/src/modules/sales/dto/sales-reports.dto.ts`
  - `apps/admin_backend/src/modules/sales/services/sales-reports.service.ts`
  - `apps/admin_backend/src/modules/sales/controllers/reports.controller.ts`
  - `apps/admin_backend/src/modules/sales/sales.module.ts`
- **Endpoints:**
  - `GET /v1/sales/reports/dashboard?startDate=&endDate=`
    - Returns: `grossSales`, `netTaxableSales`, `totalTax`, `totalDiscounts`, `invoiceCount`, `ticketAverage`, `paymentMethodsBreakdown` (Cash NIO, Cash USD, Card, Mixed).
  - `GET /v1/sales/reports/hourly-sales?date=`
    - Returns: 24-hour distribution of sales volume and ticket counts for peak hour / rush detection.
  - `GET /v1/sales/reports/top-products?startDate=&endDate=&limit=`
    - Returns: Ranking of products by quantity sold and total revenue generated.
  - `GET /v1/sales/reports/cashier-performance?startDate=&endDate=`
    - Returns: Sales, total tickets, and ticket average grouped by `userId` / cashier.
- **Evidence Gate:** Unit tests for `SalesReportsService` and controller spec with 100% assertions passing.

---

### Slice 9.2: Reporte Fiscal DGI & Auditoría de Correlatividad ✅ COMPLETED
- **Goal:** Meet DGI DT 09-2007 compliance for monthly tax declarations and invoice integrity inspection.
- **Touched Surfaces:**
  - `apps/admin_backend/src/modules/sales/dto/fiscal-reports.dto.ts`
  - `apps/admin_backend/src/modules/sales/services/fiscal-reports.service.ts`
  - `apps/admin_backend/src/modules/sales/controllers/reports.controller.ts`
- **Endpoints:**
  - `GET /v1/sales/reports/fiscal/monthly-summary?year=&month=`
    - Returns: Monthly aggregated sales, total exempt sales, total taxable sales (15%), total IVA collected, total credit notes / returns.
  - `GET /v1/sales/reports/fiscal/voided-invoices?startDate=&endDate=`
    - Returns: Complete audit log of canceled invoices with original amount, `voidReason`, `canceledAt`, and `userId`.
  - `GET /v1/sales/reports/fiscal/sequence-audit?terminalId=&startDate=&endDate=`
    - Returns: Consecutive range verification (`startSequence`, `endSequence`, `expectedCount`, `actualCount`, `missingSequences: []`).
- **Evidence Gate:** Unit + integration tests validating DGI tax mathematical accuracy and gap detection.

---

### Slice 9.3: Exportación Contable Estructurada (CSV & JSON) ✅ COMPLETED
- **Goal:** Export normalized accounting books ("Libro de Ventas DGI" and "Resumen de Cortes Z") for external CPA / tax submission.
- **Touched Surfaces:**
  - `apps/admin_backend/src/modules/sales/services/sales-export.service.ts`
  - `apps/admin_backend/src/modules/sales/controllers/reports.controller.ts`
- **Endpoints:**
  - `GET /v1/sales/reports/export/sales-book?startDate=&endDate=&format=csv|json`
    - Formats daily sales register compliant with Nicaraguan accounting norms.
  - `GET /v1/sales/reports/export/z-reports?startDate=&endDate=&format=csv|json`
    - Aggregates daily Z-cuts with opening/closing cash balances, discrepancies, and DGI numbers.
- **Evidence Gate:** Export format verification tests with CSV header and value delimiter assertions.

---

## 4. Verification & Testing Strategy

1. **Unit Testing:**
   - Isolated tests for `SalesReportsService`, `FiscalReportsService`, and `SalesExportService` using mock TypeORM repositories.
2. **Integration / Controller Testing:**
   - Authorization guard verification (`RolesGuard` restricted to `OWNER` and `MANAGER`).
3. **Database Mathematical Precision:**
   - Verification that decimal precision in financial sums preserves 2 decimal places in NIO/USD calculations.
