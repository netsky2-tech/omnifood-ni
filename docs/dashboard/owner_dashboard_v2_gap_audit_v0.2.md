# NHILOS POS — Owner Dashboard V2 Gap Audit

**Document:** `owner_dashboard_v2_gap_audit_v0.2.md`  
**Version:** 0.2  
**Status:** EVIDENCE-VERIFIED / READY FOR PRD DRAFTING  
**Date:** 2026-09-23  
**Scope:** Owner/Manager Backoffice Dashboard  
**Implementation:** This document authorizes no implementation. It is the verified gap baseline that the Dashboard V2 PRD must convert into a product contract.

---

## 1. Objective

Audit the current NHILOS Owner Dashboard against the real product, codebase, reporting surface, design system and offline-first constraints, with one goal:

> Turn the current sales-summary screen into an owner decision surface without inventing metrics, weakening fiscal correctness, hiding data staleness, or duplicating specialized report modules.

A useful Dashboard V2 must allow an owner to answer quickly:

- How much did I sell?
- Is that result better or worse than a relevant comparison period?
- How many transactions produced it?
- What was the average ticket?
- What did those sales cost?
- What gross margin did they produce?
- Which products, hours and payment methods explain the result?
- What operational, fiscal or security conditions require attention?
- Are the numbers complete, or is POS data still pending synchronization?

---

## 2. Evidence base

This audit uses:

- the supplied rendered Dashboard screenshot;
- `owner_dashboard_execution_roadmap.md`;
- `DESIGN_BACKOFFICE.md`;
- `master_execution_roadmap.md`;
- `Product_Requirement_Document_v2.md`;
- `prd_modulo_ventas.md`;
- `prd_gestion_inventario.md`;
- `prd_onboarding.md`;
- `prd_audit_trail.md`;
- `prd_procesamiento_pago_datafonos.md`;
- `audit_evidence_pass.md`, a read-only code-level verification of the audit claims.

### 2.1 Documentation drift

The older owner-dashboard roadmap describes the React owner application as not yet implemented. That statement is no longer current: the screenshot and code evidence show a working backoffice shell and dashboard.

Therefore the roadmap remains useful for architecture, security and KPI-contract intent, but not as authority for the current frontend implementation state.

### 2.2 Evidence-pass corrections incorporated

The code-level evidence pass materially corrected three assumptions from v0.1:

1. **Tips are not reporting-ready.** Tip behavior exists in POS/receipt flows, but invoice/payment/sync/report DTOs carry no tip field. Dashboard tips require an end-to-end data-path remediation.
2. **Freshness is a real backend feature gap.** The current freshness badge uses `generatedAt`, which is only report generation time. No terminal last-seen, stream completeness or sync-state endpoint exists.
3. **Inventory reporting is a separate bounded context.** COGS, Kardex, valuation and alerts are exposed under `inventory/reports`, not the sales reporting controller.

The evidence pass also confirmed that regime-aware fiscal rendering, hourly sales, top products, stock alerts, void summaries, sequence anomalies, COGS and shrinkage can be consumed from existing endpoints today.

---

## 3. Current rendered state

The current Dashboard exposes:

- `Ventas Brutas`;
- `Ticket Promedio`;
- `Impuestos (IVA)`;
- `Descuentos`;
- `Métodos de Pago`;
- `Resumen de Ventas`;
- date range;
- `Actualizado HH:mm` freshness badge.

Observed UX characteristics:

- four equally weighted KPI cards;
- no trend indicators;
- no period-over-period comparison;
- no charts;
- no profitability context;
- no inventory insight;
- no exception center;
- no sales-by-hour or product contribution;
- no tax-regime-aware card composition;
- no tip intelligence;
- no verified sync completeness;
- weak empty-state behavior when values are all zero.

The screen is clean, but it behaves like a static report summary rather than an executive control surface.

---

## 4. Current dashboard API shape

The current dashboard calls exactly:

`GET /sales/reports/dashboard?startDate=&endDate=`

The response currently exposes:

- `grossSales`;
- `netTaxableSales`;
- `totalTax`;
- `totalDiscounts`;
- `invoiceCount`;
- `ticketAverage`;
- `paymentMethodsBreakdown { cashNio, cashUsd, cardNio, cardUsd, other, totalNio }`;
- `startDate`;
- `endDate`;
- `generatedAt`.

The current rendered Dashboard maps almost one-to-one to these fields.

Existing hooks/routes for `hourly-sales`, `top-products` and `cashier-performance` already exist, but are used on the Sales page rather than Dashboard.

---

## 5. Classification vocabulary

| Status | Meaning |
|---|---|
| **KEEP** | Current behavior is valid; only refinement is needed. |
| **REDESIGN** | Capability exists but presentation/semantics are weak. |
| **ADD** | Capability is absent from Dashboard. |
| **CONDITIONAL** | Render only when tenant configuration or business mode makes it relevant. |
| **CONTRACT GAP** | Product/API semantics are not sufficiently fixed. |
| **BLOCKED / DATA GAP** | Product need is valid, but required persistence/sync/reporting data does not exist end-to-end. |
| **FUTURE** | Valuable but should not block Dashboard V2. |

Priority:

- **P0:** trust/correctness/product-readiness blocker;
- **P1:** substantial owner-value improvement;
- **P2:** advanced/deferred analytics.

---

## 6. Verified gap matrix

| ID | Capability | Verified current state | Target | Status | Priority |
|---|---|---|---|---|---|
| DG-01 | Sales KPI | `grossSales` exists | Executive sales KPI with approved semantics + comparison | REDESIGN | P0 |
| DG-02 | Average ticket | Exists | Add trend/comparison context | REDESIGN | P0 |
| DG-03 | Ticket count | Exists only as secondary text | First-class KPI/context | ADD | P0 |
| DG-04 | IVA card | Always rendered | Regime-aware fiscal slot | CONDITIONAL | P0 |
| DG-05 | Discounts | Exists | Amount + ratio + trend | REDESIGN | P1 |
| DG-06 | Payment methods | Static list | Payment-mix visualization | REDESIGN | P1 |
| DG-07 | Sales summary | Duplicates top KPIs | Profitability/fiscal contextual summary | REDESIGN | P1 |
| DG-08 | Date range | Exists; presets partially available | Add explicit comparison semantics | KEEP / EXTEND | P0 |
| DG-09 | Freshness | `generatedAt` only | COMPLETE / STALE / PARTIAL / UNKNOWN | CONTRACT GAP / BACKEND FEATURE | P0 |
| DG-10 | Sales trend | Missing | Time series + comparison | ADD | P0 |
| DG-11 | Hourly sales | Endpoint/hook exists | Dashboard chart | ADD | P1 |
| DG-12 | Top products | Endpoint/hook exists | Dashboard contribution view | ADD | P1 |
| DG-13 | COGS | Inventory endpoint exists | Executive COGS metric | ADD | P1 |
| DG-14 | Gross margin | No aggregate field | Amount + percentage under approved COGS contract | CONTRACT GAP / ADD | P0 |
| DG-15 | Merma | `shrinkageCogsNio` exists | Loss summary + trend/drill-down | ADD | P1 |
| DG-16 | Stock alerts | Endpoint exposes counts | Attention-required summary | ADD | P1 |
| DG-17 | Tips | POS/receipt only; not persisted to reporting | Tip KPIs after data remediation | BLOCKED / DATA GAP | P1 |
| DG-18 | Voids | Summary endpoint exists | Exception signal | ADD | P1 |
| DG-19 | Card reconciliation | Per-payment state exists; no summary endpoint | Pending reconciliation signal | CONTRACT GAP / ADD | P1 |
| DG-20 | Audit/security | Raw query routes only | Executive risk summary | CONTRACT GAP / ADD | P1 |
| DG-21 | Staff performance | Route/hook exists | Contextual analytics | CONDITIONAL | P2 |
| DG-22 | Loyalty analytics | Domain exists; dashboard analytics absent | Owner loyalty analytics | FUTURE | P2 |
| DG-23 | Business-mode profile | No dashboard profile contract | QSR / Restaurant / Retail composition | CONTRACT GAP | P1 |
| DG-24 | Empty states | Zero-heavy screen | Explicit no-data/partial/error states | REDESIGN | P1 |
| DG-25 | Drill-down | Limited | Every insight links to source module | ADD | P1 |

---

## 7. KPI contract gaps

Dashboard V2 must not expose attractive numbers whose meaning changes between screens.

The PRD must define an authoritative KPI dictionary.

### 7.1 Sales

For **Gross Sales**, define:

- included invoice states;
- whether values include tax;
- discount treatment;
- void/cancel treatment;
- refund treatment if later supported;
- tip exclusion.

For **Net Sales**, define:

- exact formula;
- relationship to discounts/promotions;
- tax inclusion/exclusion;
- void/cancel handling.

For **Ticket Count**, define:

- what counts as a completed ticket;
- whether split bills create multiple business tickets or one source transaction for KPI purposes;
- void/cancel treatment.

For **Average Ticket**, define:

- numerator;
- denominator;
- split-payment behavior;
- split-bill behavior;
- tip exclusion.

### 7.2 COGS and gross margin

Current inventory reporting exposes:

- `totalCogsNio`;
- `salesCogsNio`;
- `shrinkageCogsNio`.

A gross-margin presentation is technically composable today from sales + inventory endpoints, but there is a historical-range alignment risk: sales ranges use invoice timestamps while COGS ranges use inventory-movement timestamps.

Therefore the PRD must decide:

- whether shrinkage belongs inside displayed COGS or separately;
- whether gross margin uses `salesCogsNio` or `totalCogsNio`;
- historical alignment expectations;
- zero-sales behavior;
- whether frontend composition is acceptable or a dedicated aggregate contract is required later.

Suggested baseline for product review:

`Gross Margin Amount = Net Sales - approved COGS basis`

`Gross Margin % = Gross Margin Amount / Net Sales × 100`

No net profit/P&L/EBITDA is allowed in V2 because expense accounting is not modeled sufficiently.

### 7.3 Discounts

At minimum expose:

- amount;
- percentage over an approved pre-discount base;
- optional split between promotion-driven and manual discounts when evidence is complete.

---

## 8. Fiscal-regime adaptation

### 8.1 Current problem

The current dashboard always gives a premium KPI slot to `Impuestos (IVA)`.

That is not valid for every tenant profile.

### 8.2 Verified implementation path

Regime is already stored in fiscal configuration and exposed by the guarded, tenant-bound:

`GET /onboarding/fiscal-setup`

Therefore regime-aware rendering requires **no schema change**.

### 8.3 Required behavior

For a Régimen General / explicit-IVA profile, Dashboard may show:

- taxable sales;
- exempt sales;
- IVA generated;
- fiscal exceptions.

For Cuota Fija or another profile where a dashboard IVA KPI is not meaningful:

- do not render `IVA = C$0.00` as if it were a useful executive measure;
- reuse that slot for a business metric such as Tickets, Gross Margin, COGS or Tips when applicable;
- optionally show a subtle fiscal context label such as `Régimen fiscal: Cuota Fija`.

For unknown/incomplete fiscal setup:

- do not guess;
- show a configuration warning and avoid authoritative tax conclusions.

**Status: P0 — frontend composition over existing API.**

---

## 9. Voluntary tips

The POS contains tip behavior, but Dashboard V2 cannot report tips today.

Verified gaps:

- `Invoice` has no tip field;
- `Payment` has no tip field;
- `SyncInvoiceDto` has no tip field;
- report DTOs have no tip field;
- POS customer-facing total includes tip, but the synced invoice excludes it.

### 9.1 Required remediation before any dashboard KPI

1. Persist tip data in the local transaction model under an approved definition.
2. Carry it through sync contracts.
3. Persist it in cloud invoice/payment data.
4. Aggregate it in reporting.
5. Only then expose dashboard analytics.

### 9.2 Target behavior after remediation

For Restaurant/Hybrid tenants with tips enabled:

- total tips;
- tipped-ticket participation rate;
- average tip;
- tip rate over eligible base;
- optional waiter/shift drill-down.

Tips must remain visibly separate from sales/revenue.

For tenants where tips do not apply, omit the widget.

**Status: P1 — BLOCKED / DATA GAP.**

---

## 10. Comparison and trends

No backend comparison endpoint exists. Existing report DTOs represent one period.

Dashboard V2 can query the current range and a comparison range independently and compute the delta client-side.

Current sales date parsing is consistently anchored to `America/Managua` / `-06:00`. Product must formally approve that as the reporting timezone rather than relying on implementation accident.

Suggested comparison rules for PRD approval:

- single day → same weekday previous week;
- arbitrary multi-day range → immediately preceding equal-duration range;
- month-to-date → same elapsed range previous month.

Every comparison must support:

- current value;
- previous value;
- absolute delta where useful;
- percentage/percentage-point delta where mathematically valid;
- safe behavior when prior period is zero/unavailable.

**Status: P0 — frontend-capable once semantics are approved.**

---

## 11. Charting gap

The backoffice design system already defines chart colors and conventions, but Recharts is not installed in the current owner-dashboard package.

Dashboard V2 chart work therefore includes a dependency/bundle/accessibility decision.

### 11.1 P0 chart

**Sales Trend**

Purpose: answer whether sales are rising/falling and how the selected period compares.

### 11.2 P1 charts

**Sales by Hour**

The backend route/hook already exists. Use it to expose rush-hour distribution.

**Payment Mix**

Replace the current static payment list with a composition view while preserving original currency and NIO accounting-equivalent semantics.

**Top Products**

The backend route/hook already exists. Minimum columns/visual signals:

- product;
- units;
- sales;
- share of sales.

Do not rank products by margin until historical cost semantics are proven.

### 11.3 Visual rules

- Navy for primary series;
- green for positive/comparison meaning only;
- red only for negative/critical meaning;
- never use color as the sole signal;
- provide accessible tooltip/value alternatives;
- use tabular figures;
- render explicit no-data states instead of meaningless flat charts.

---

## 12. Profitability insight

NHILOS already has the domain foundation for useful operational profitability:

- CPP;
- BOM/recipe consumption;
- inventory movements;
- COGS reports;
- shrinkage/merma.

Recommended V2 block:

- Net Sales;
- approved COGS basis;
- Gross Margin Amount;
- Gross Margin %;
- Merma.

This is one of the strongest differentiators available to NHILOS because it connects sales with operational cost rather than showing revenue alone.

**Boundary:** no net profit or P&L.

---

## 13. Attention Required

The dashboard should aggregate exceptions, not force owners to inspect every module manually.

### 13.1 Frontend-ready signals

**Stock alerts**

Inventory alerts already expose:

- critical count;
- warning count;
- negative count.

**Voids**

Fiscal void reporting already exposes:

- total voided count;
- total voided amount.

**Fiscal sequence anomalies**

Sequence audit already exposes:

- `hasGaps`;
- missing sequence list;
- duplicate sequence list.

### 13.2 Backend contract still required

**Pending card reconciliation**

Per-payment `reconciliationStatus` exists, but there is no dashboard summary endpoint for count/amount.

**Audit/security summary**

Raw audit query routes exist, but no executive aggregation exists for critical/warning events.

### 13.3 Severity

Recommended categories:

- Critical — financial/fiscal/security integrity risk;
- Warning — operational degradation or follow-up needed;
- Info — awareness only.

The Dashboard must deep-link to the responsible module. It is not the place to resolve the underlying workflow.

---

## 14. Sync freshness — P0 correctness gap

The current badge displays `generatedAt` from the dashboard response.

That means:

> “the server generated this report at time T”

It does **not** mean:

> “all POS business data is complete through time T”.

No backend infrastructure currently exists for:

- terminal last-seen tracking;
- stream completeness;
- per-stream lag;
- tenant sync-state aggregation.

Dashboard V2 needs a real contract with at least:

### COMPLETE
All required streams are complete through time `T`.

### STALE
The data was complete, but lag exceeds the accepted threshold.

### PARTIAL
Some required streams are current while others are pending.

### UNKNOWN
Completeness cannot be established.

A fresh HTTP response must never be presented as proof of fresh business data.

**Status: P0 — backend schema/metadata + endpoint + frontend.**

---

## 15. Payment insight

The current payment card is structurally correct but inefficient.

Target Dashboard V2 should expose:

- payment composition;
- amount by method;
- percentage mix;
- original currency where operationally meaningful;
- NIO accounting/base equivalent for consolidated totals.

Pending reconciliation belongs in `Attention Required`, not hidden inside the payment mix.

**Status: P1 — payment mix frontend-ready; reconciliation summary requires backend.**

---

## 16. Product performance

Top-products data is already exposed and wired elsewhere in the owner web app.

Dashboard V2 should surface a compact product-contribution widget.

Minimum:

- product;
- units;
- sales;
- share of sales.

Later, after cost semantics are fully trusted:

- COGS;
- gross margin;
- gross margin percentage;
- menu-engineering style analysis.

**Status: P1 — base widget frontend-only.**

---

## 17. Staff performance

Cashier-performance reporting exists and a frontend hook already consumes it outside Dashboard.

Possible future/conditional metrics:

- tickets handled;
- net sales;
- average ticket;
- tips after tip data remediation;
- voids/overrides;
- discounts.

Avoid simplistic “best employee” scoring: shift length, station, hours worked and table assignment distort raw totals.

**Status: P2 — conditional.**

---

## 18. Loyalty analytics

Loyalty exists as a domain, but Dashboard V2 should not block on owner-facing loyalty analytics.

Future candidate metrics:

- loyalty-linked sales;
- active customers;
- earn vs redeem activity;
- reward redemption count;
- repeat-customer contribution.

These require their own KPI semantics.

**Status: P2 — future.**

---

## 19. Empty / partial / failure states

The current all-zero screenshot highlights a UX problem: a page full of `C$0.00` looks broken even when correct.

Dashboard V2 must distinguish:

### No sales in selected period

Show a clear no-sales state and suppress meaningless charts.

### New tenant / insufficient history

Show that trends/comparisons are unavailable because there is not yet enough history.

### Data pending sync

Do not present zeros as confirmed when completeness is unknown/partial.

### Widget-level API failure

A failed inventory or audit widget must not collapse sales KPIs.

**Status: P1 — frontend behavior.**

---

## 20. Business-mode adaptation

Dashboard composition should be profile-driven, not forked into unrelated applications.

### Restaurant / Hybrid

Prioritize:

- sales;
- tickets;
- average ticket;
- gross margin;
- tips after remediation;
- hourly demand;
- top products;
- waiter/shift insight;
- voids/reconciliation.

### QSR / Coffee / Food Park

Prioritize:

- sales;
- tickets/hour;
- average ticket;
- gross margin;
- top products;
- rush hours;
- stock critical;
- discount/promotion contribution.

### Retail-compatible future profile

Prioritize:

- sales;
- units per ticket;
- average ticket;
- gross margin;
- top SKUs;
- stock critical;
- inventory valuation.

**Status: P1 — product contract required.**

---

## 21. Design-system audit

The current UI is broadly aligned with the approved backoffice identity.

### KEEP

- navy sidebar;
- green active accent;
- clean card surfaces;
- restrained visual language;
- date selector position;
- desktop-first composition.

### UNDERUSED

The design system already specifies:

- KPI trend formatting;
- chart colors;
- date presets;
- desktop KPI grid;
- chart layouts;
- auto-refresh guidance;
- WCAG 2.1 AA;
- tabular numeric figures.

Dashboard V2 does **not** need a new visual identity. It needs to implement more of the existing one and add the missing charting dependency.

---

## 22. Backend/data readiness summary

### Frontend-ready over existing APIs

- ticket count;
- regime-aware IVA slot;
- discounts ratio/trend once semantics are fixed;
- payment mix;
- sales comparisons using two range queries;
- hourly sales;
- top products;
- COGS;
- shrinkage/merma;
- stock alerts;
- void summaries;
- fiscal sequence anomaly summaries.

### Genuine backend/data work

- sync freshness/completeness;
- tip persistence + sync + cloud reporting;
- card-reconciliation summary;
- audit/security executive summary.

### Architecture decision later

Gross margin may be composed client-side from sales + inventory reports or served by a dedicated aggregate contract. This audit intentionally does not freeze that decision.

---

## 23. Tenant isolation and security

Code-level verification found the currently relevant report routes protected by:

- `AuthGuard`;
- `RolesGuard`;
- `TenantInterceptor`;
- `@GetTenantId()`;
- explicit tenant predicates.

RLS defense-in-depth was also confirmed on inspected invoice and inventory tables.

No cross-tenant path was found in the reviewed Dashboard V2 source routes.

Therefore existing routes are not blocked on a new isolation proof for this audit phase.

Any **new** Dashboard V2 endpoint must preserve the same tenant-bound pattern and receive equivalent isolation evidence before exposure.

Invoices remain immutable; Dashboard V2 must not introduce fiscal mutation workflows.

---

## 24. Target information architecture

Conceptual only:

```text
Dashboard
├── Context Bar
│   ├── Date range
│   ├── Comparison range
│   ├── Business / Fiscal context
│   └── Sync freshness / completeness
│
├── Executive KPI Strip
│   ├── Sales
│   ├── Tickets
│   ├── Average Ticket
│   ├── Gross Margin
│   └── Conditional KPI
│       ├── IVA
│       ├── Tips (after remediation)
│       └── COGS
│
├── Performance
│   ├── Sales Trend
│   ├── Hourly Sales
│   ├── Top Products
│   └── Payment Mix
│
├── Operational Profitability
│   ├── Net Sales
│   ├── COGS
│   ├── Gross Margin
│   └── Mermas
│
└── Attention Required
    ├── Inventory
    ├── Payments / Reconciliation
    ├── Voids / Audit
    ├── Fiscal
    └── Sync
```

The PRD must decide behavior and priorities before architecture or exact layout is frozen.

---

## 25. Priority remediation matrix

### P0 — trust and correctness

| ID | Requirement |
|---|---|
| P0-01 | Approve KPI dictionary. |
| P0-02 | Approve `America/Managua` / `-06:00` as reporting timezone and date-boundary contract. |
| P0-03 | Define void/cancel/refund treatment per KPI. |
| P0-04 | Define tip separation from sales, even though tip reporting is not yet implemented. |
| P0-05 | Approve COGS/gross-margin terminology and basis. |
| P0-06 | Define fiscal-regime widget rules. |
| P0-07 | Design complete/stale/partial/unknown freshness persistence + endpoint + UI contract. |
| P0-08 | Define comparison-period semantics. |
| P0-09 | Add sales trend after semantics are approved. |
| P0-10 | Preserve verified isolation for existing routes and require equivalent proof for every new endpoint. |

### P1 — owner decision value

| ID | Requirement |
|---|---|
| P1-01 | Promote ticket count into executive context. |
| P1-02 | Add hourly sales. |
| P1-03 | Add top products. |
| P1-04 | Redesign payment mix. |
| P1-05 | Add COGS / gross-margin presentation. |
| P1-06 | Add merma summary. |
| P1-07 | Remediate tip persistence/sync/reporting, then add tip KPIs. |
| P1-08 | Add Attention Required. |
| P1-09 | Add reconciliation summary endpoint, then surface pending vouchers. |
| P1-10 | Surface void summary; add audit/security summary contract. |
| P1-11 | Add stock-critical signal. |
| P1-12 | Define business-mode dashboard profiles. |
| P1-13 | Implement no-data/partial/error states. |
| P1-14 | Add drill-down destinations. |

### P2 — advanced analytics

| ID | Requirement |
|---|---|
| P2-01 | Cashier/waiter analytics. |
| P2-02 | Promotion attribution. |
| P2-03 | Loyalty analytics. |
| P2-04 | Product margin/menu-engineering matrix. |
| P2-05 | Historical anomaly detection. |
| P2-06 | Multi-branch roll-up after branch aggregation is formally modeled. |

---

## 26. Explicit non-goals

Dashboard V2 does not include:

- net profit;
- P&L;
- EBITDA;
- expense accounting;
- payroll;
- predictive AI forecasting;
- automatic purchasing;
- employee ranking/scoring;
- tax advice;
- editing historical fiscal documents;
- resolving reconciliation workflows directly from Dashboard;
- replacing dedicated Sales/Inventory/Fiscal pages;
- changing the POS offline-first authority model.

---

## 27. Decisions the PRD must fix

1. Primary sales KPI name/formula.
2. Ticket-count definition.
3. Average-ticket formula.
4. Default comparison period.
5. Reporting timezone.
6. Discount denominator and inclusion rules.
7. Tip semantics and separation from sales.
8. COGS basis.
9. Merma relationship to displayed COGS.
10. Gross-margin formula and terminology.
11. Fiscal-regime rendering rules.
12. Business-mode widget profiles.
13. Freshness states and thresholds.
14. Attention-required severity/inclusion rules.
15. Empty/partial/unknown-data behavior.
16. Widget drill-down destinations.
17. Default date preset.
18. OWNER vs MANAGER dashboard visibility.
19. Whether gross margin is composed client-side or served by an aggregate endpoint.
20. Tip data ownership across POS, sync and cloud.
21. Reconciliation summary contract.
22. Audit/security summary contract.

---

## 28. Remaining evidence before implementation

The structural code-level evidence pass is complete.

Before implementation batches open, use deterministic fixtures to verify:

### Financial/reporting fixture

- known sales;
- discounts;
- taxes;
- COGS;
- shrinkage;
- split payments;
- voids;
- product rankings.

Tips enter this fixture only after the data-path remediation exists.

### Fiscal profiles

At minimum:

- Régimen General;
- Cuota Fija;
- mixed/exempt scenario where supported.

### Sync states

After freshness infrastructure exists:

- complete;
- stale;
- partial;
- unknown;
- reconnect/catch-up.

### UX states

- normal sales day;
- zero-sales period;
- high-alert state;
- large dataset;
- tablet layout;
- mobile read-only layout.

---

## 29. Audit Definition of Done

The code-level verification requested by the original audit is complete.

- [x] Current Dashboard API response shape recorded.
- [x] Sales/inventory/fiscal report routes verified.
- [x] Fiscal-regime data path confirmed.
- [x] Tip data path confirmed and classification corrected.
- [x] Freshness implementation status confirmed.
- [x] Existing V2 report routes checked for tenant isolation.
- [x] Frontend-only vs backend-required gaps differentiated.
- [x] Chart-library dependency confirmed.
- [x] COGS/shrinkage path confirmed, including timestamp-alignment risk.
- [x] Reconciliation/audit summary gaps confirmed.
- [x] No implementation architecture frozen prematurely.

Remaining gate:

- [ ] Product approves this v0.2 as the authoritative gap baseline for the Dashboard V2 PRD.

---

## 30. Final conclusion

NHILOS does not primarily have a cosmetic Dashboard problem.

It has a **decision-density and trust-contract problem**.

The current implementation proves the shell, basic sales reporting, date filtering and payment summary. The codebase already contains enough additional reporting capability to deliver a materially stronger Dashboard without rebuilding the analytics backend from scratch.

The evidence pass also prevents an important planning error: not everything is frontend work.

### Frontend-heavy improvements already supported

- regime-aware IVA;
- ticket count;
- comparison deltas;
- hourly sales;
- top products;
- payment mix;
- COGS/shrinkage;
- stock alerts;
- voids;
- sequence anomalies.

### Real backend/data work

- trustworthy sync freshness;
- tips reporting path;
- card reconciliation summary;
- audit/security summary.

The correct sequence is:

1. approve this verified gap baseline;
2. write `owner_dashboard_v2_prd.md` with fixed KPI semantics and conditional behavior;
3. produce the Architecture Spec only after the product contract is stable;
4. then build an execution roadmap that separates frontend composition from true backend/data remediation.

**Recommended next artifact:** `owner_dashboard_v2_prd.md`.
