# NHILOS POS — Owner Dashboard V2 Gap Audit

**Document:** `owner_dashboard_v2_gap_audit.md`  
**Version:** 0.1  
**Status:** PROPOSED / AUDIT BASELINE  
**Date:** 2026-09-23  
**Scope:** Owner/Manager Backoffice Dashboard only  
**Implementation:** **No implementation is authorized by this document.** This audit identifies gaps, fixed product constraints, evidence requirements, and the target decision surface required before a Dashboard V2 PRD is written.

---

## 1. Purpose

This document audits the current NHILOS Owner Dashboard against:

1. the dashboard currently rendered in production/pilot UI;
2. the existing NHILOS backoffice design system;
3. the documented reporting, inventory, fiscal, audit, payments, loyalty, and synchronization capabilities;
4. the platform's offline-first and multi-tenant invariants; and
5. the product objective of turning the backoffice from a passive report page into a useful **owner decision surface**.

The objective is **not** to make the current screen “more attractive”.

The objective is to determine what must change so that an owner can rapidly answer:

- How much did I sell?
- Is that better or worse than a relevant comparable period?
- How many transactions produced those sales?
- What is my ticket average?
- What did those sales cost me?
- What gross margin did I generate?
- What products, hours, people, and payment methods explain the result?
- What operational or fiscal conditions need my attention?
- Are the numbers complete, or is some POS data still pending synchronization?

---

## 2. Authority and evidence reviewed

### 2.1 Rendered product evidence

The supplied Dashboard screenshot dated **2026-09-23** is treated as direct evidence of the currently rendered UI.

Observed current widgets:

- `Ventas Brutas`
- `Ticket Promedio`
- `Impuestos (IVA)`
- `Descuentos`
- `Métodos de Pago`
- `Resumen de Ventas`
- date-range picker
- “Actualizado HH:mm” status indicator

Observed current characteristics:

- four equally weighted KPI cards;
- no trends or period-over-period comparison;
- no charts;
- no inventory or margin insight;
- no exception/attention surface;
- no product mix;
- no sales-by-hour view;
- no tip metrics;
- no tax-regime-aware presentation;
- no explicit data completeness/freshness semantics;
- substantial unused vertical space.

### 2.2 Product and architecture documentation reviewed

Primary sources:

- `owner_dashboard_execution_roadmap.md`
- `DESIGN_BACKOFFICE.md`
- `master_execution_roadmap.md`
- `Product_Requirement_Document_v2.md`
- `prd_modulo_ventas.md`
- `prd_gestion_inventario.md`
- `prd_onboarding.md`
- `prd_audit_trail.md`
- `prd_procesamiento_pago_datafonos.md`

### 2.3 Important documentation drift

`owner_dashboard_execution_roadmap.md` describes the React owner application as not yet implemented and classifies the web shell as future work.

That statement is now stale.

The supplied screenshot proves that a functional backoffice shell and dashboard already exist.

Therefore:

> **The execution roadmap remains useful as architecture and contract evidence, but it is no longer authoritative for current frontend implementation status.**

Dashboard V2 work must not blindly execute the older W1/W2 assumptions as if no UI exists. It must audit and extend the implementation now present.

---

## 3. Audit method and status vocabulary

Each capability is classified with one of the following statuses:

| Status | Meaning |
|---|---|
| **KEEP** | Current behavior is useful and should remain with minor refinement only. |
| **REDESIGN** | Capability exists, but its presentation or semantics are insufficient. |
| **ADD** | Required capability is absent from the current dashboard. |
| **CONDITIONAL** | Must be rendered only when tenant configuration/business mode makes it relevant. |
| **CONTRACT GAP** | Data may exist, but product semantics/API shape/completeness rules are not sufficiently defined. |
| **FUTURE** | Valuable capability, but should not block Dashboard V2. |
| **REMOVE FROM DEFAULT** | Current dashboard element should not occupy default executive-dashboard space. |

Priorities:

- **P0:** required before Dashboard V2 can be considered trustworthy/product-ready;
- **P1:** major owner-value improvement for V2;
- **P2:** later optimization/advanced analytics.

---

# 4. Executive diagnosis

The current dashboard is **functionally valid but strategically shallow**.

It behaves as a compact sales summary rather than an owner command center.

The largest gaps are not cosmetic. They are:

1. **No temporal context.**  
   A number without comparison tells the owner what happened, but not whether performance improved or deteriorated.

2. **No profitability context.**  
   NHILOS already has CPP, COGS-oriented inventory reporting and mermas, but the dashboard exposes none of that business value.

3. **No operational exceptions.**  
   Critical stock, voids, pending voucher reconciliation, sync lag, audit warnings, and similar conditions are scattered across modules rather than surfaced where the owner begins.

4. **Tax presentation is static.**  
   `Impuestos (IVA)` is shown as a universal KPI even though onboarding supports different contribution regimes such as Cuota Fija and Régimen General.

5. **Restaurant intelligence is incomplete.**  
   Voluntary tips are implemented in the platform but absent from the dashboard.

6. **The freshness indicator is ambiguous.**  
   “Actualizado 09:57 p. m.” does not tell the owner whether the browser refreshed, whether the backend generated the report, or whether all terminal data is synchronized.

7. **The design system is underused.**  
   The documented backoffice design already defines KPI trends, charts, responsive grids, date presets and chart colors. The current screen implements only a small subset.

---

# 5. Current dashboard capability audit

| ID | Capability | Current state | Target state | Status | Priority |
|---|---|---|---|---|---|
| DG-01 | Gross/net sales KPI | Gross sales exists | Primary executive sales KPI with comparison and clear formula | REDESIGN | P0 |
| DG-02 | Ticket average | Exists | Keep, add trend and ticket count context | REDESIGN | P0 |
| DG-03 | Ticket count | Only appears as small text under gross sales | First-class KPI or secondary value | ADD | P0 |
| DG-04 | IVA KPI | Always rendered | Regime-aware fiscal slot | CONDITIONAL | P0 |
| DG-05 | Discounts | Exists | Show amount + % of pre-discount eligible sales + trend | REDESIGN | P1 |
| DG-06 | Payment methods | Static text list | Payment mix visualization + drill-down | REDESIGN | P1 |
| DG-07 | Sales summary | Duplicates top-level values | Replace with profitability/fiscal contextual summary | REDESIGN | P1 |
| DG-08 | Date range | Exists | Keep presets + custom range + comparable-period semantics | KEEP / EXTEND | P0 |
| DG-09 | Data freshness | Timestamp exists | Complete/stale/partial/unknown sync contract | CONTRACT GAP | P0 |
| DG-10 | Sales trend chart | Missing | Time-series sales + comparison | ADD | P0 |
| DG-11 | Hourly sales | Missing | Sales/tickets by hour | ADD | P1 |
| DG-12 | Top products | Missing | Ranked product contribution view | ADD | P1 |
| DG-13 | COGS | Missing | Executive cost-of-sales metric | ADD | P1 |
| DG-14 | Gross margin | Missing | Amount + percentage, terminology approved | CONTRACT GAP / ADD | P0 |
| DG-15 | Mermas | Missing | Loss amount + trend + drill-down | ADD | P1 |
| DG-16 | Inventory alerts | Missing | Action-required summary | ADD | P1 |
| DG-17 | Tips | Missing | Tip total, rate, participation, average | ADD | P1 |
| DG-18 | Voids / cancellations | Missing | Exception card, not vanity KPI | ADD | P1 |
| DG-19 | Pending card reconciliation | Missing | Action-required item | ADD | P1 |
| DG-20 | Audit/security alerts | Missing | Critical/warning exception feed | ADD | P1 |
| DG-21 | Cashier/waiter performance | Missing | Drill-down analytics, contextual to mode | CONDITIONAL | P2 |
| DG-22 | Loyalty performance | Missing | Later owner analytics | FUTURE | P2 |
| DG-23 | Business-mode adaptation | Missing | QSR / Restaurant / Retail widget composition | CONTRACT GAP | P1 |
| DG-24 | Empty states | All-zero dashboard is visually dead | Guided, informative empty/no-sales state | REDESIGN | P1 |
| DG-25 | Drill-down navigation | Minimal/no visible drill-down affordance | Every insight links to responsible module | ADD | P1 |

---

# 6. KPI semantics gaps

The existing execution roadmap correctly identified a critical dependency that remains unresolved for Dashboard V2:

> KPI names, formulas, inclusions, cancellation treatment, timezone, gross-margin terminology, and shrinkage-inclusive COGS semantics require an explicit approved contract.

Dashboard V2 must not introduce attractive numbers whose meaning changes between screens.

## 6.1 Mandatory KPI dictionary

Before implementation, the PRD or a linked KPI contract must define at minimum:

### Sales metrics

**Gross Sales**
- exact included document states;
- whether discounts are pre/post value;
- whether tips are excluded;
- whether taxes are included;
- void/cancel treatment;
- refund treatment if/when supported.

**Net Sales**
- exact formula;
- relationship to discounts, promotions, taxes, tips and cancellations.

**Ticket Count**
- what qualifies as a ticket;
- `PAID` only vs other terminal states;
- cancellation treatment.

**Average Ticket**
- numerator;
- denominator;
- handling of split payments;
- handling of split bills;
- tips excluded/included.

### Cost and margin

**COGS**
- inventory movements included;
- relationship to BOM, CPP, production/sub-recipes and historical snapshots;
- whether operational shrinkage/merma is included in COGS or reported separately.

**Gross Margin Amount**

Recommended semantic baseline:

`Net Sales - COGS`

subject to Finance/Product approval.

**Gross Margin %**

Recommended semantic baseline:

`Gross Margin / Net Sales * 100`

subject to zero-sales behavior and approved COGS semantics.

### Discounts

At minimum:

- amount;
- percentage of relevant gross/pre-discount sales;
- promotion-driven vs manual discount when evidence allows.

### Tips

Tips must remain financially distinct from sales.

Minimum metrics:

- total voluntary tips;
- % of eligible tickets with tip;
- average tip per tipped ticket;
- tip rate over eligible consumption base.

No “revenue” or “sales” KPI may silently include voluntary tips unless the product contract explicitly defines and labels that view.

---

# 7. Tax-regime adaptation gap

## 7.1 Current problem

The screenshot always reserves one of four premium KPI slots for:

`IMPUESTOS (IVA)`

This assumes IVA is always a meaningful executive metric.

However, fiscal onboarding already models contribution-regime selection and distinguishes examples such as:

- Cuota Fija
- Régimen General

The dashboard must therefore derive fiscal presentation from tenant fiscal configuration.

## 7.2 Required rendering policy

### Régimen General / IVA-applicable profile

Eligible dashboard fiscal signals may include:

- taxable net sales;
- exempt sales;
- IVA generated;
- discounts;
- fiscal exceptions/voids.

### Cuota Fija or profile where explicit IVA KPI is not applicable

The executive KPI strip must **not** show a meaningless `IVA = C$0.00` card.

The slot should be reassigned to a business metric, for example:

- Tickets
- Gross Margin
- Tips
- COGS

The dashboard may display a discrete context label:

`Régimen fiscal: Cuota Fija`

### Unsupported/unknown fiscal configuration

Do not guess.

Render a safe state such as:

`Configuración fiscal pendiente de validar`

and avoid presenting tax calculations as authoritative until the tenant fiscal contract is complete.

## 7.3 Gap classification

**P0 — CONDITIONAL + CONTRACT GAP**

The dashboard requires a normalized presentation profile derived from fiscal configuration rather than scattered UI checks.

Suggested concept:

`DashboardFiscalPresentationProfile`

This is a product concept only at audit stage; this document does not prescribe implementation architecture.

---

# 8. Voluntary tips gap

The master roadmap records voluntary-tip capability as implemented in Batch 16.x, including restaurant-mode evaluation and split-bill flows.

The current dashboard does not expose tip intelligence.

## Required V2 behavior

For restaurant/hybrid tenants where tips are enabled:

- show total tips for selected period;
- keep tips separate from sales;
- show tip participation rate;
- show tip rate over eligible base;
- optionally show average tip;
- provide drill-down to waiter/shift detail when data integrity is proven.

For QSR/retail tenants where tips are disabled/not used:

- do not render empty tip cards by default.

## Status

**P1 — ADD + CONDITIONAL**

---

# 9. Trend and comparison gap

## 9.1 Current problem

All principal values are snapshots.

Examples:

- `Ventas Brutas C$0.00`
- `Ticket Promedio C$0.00`
- `Descuentos C$0.00`

There is no indication of change.

## 9.2 Required comparison model

Every principal KPI should support, when mathematically meaningful:

- absolute current-period value;
- percentage/point change;
- comparison label;
- neutral state where previous period is zero or unavailable.

Comparison semantics must be deterministic.

Suggested defaults:

### Single-day range
Prefer:

`vs same weekday previous week`

over blindly comparing against yesterday for highly day-sensitive hospitality operations.

### Multi-day range
Prefer:

`vs immediately preceding equivalent-duration period`

### Month-to-date
Prefer:

`vs same elapsed range in prior month`

The exact comparison rules must be approved in the PRD/KPI contract.

## Status

**P0 — ADD**

---

# 10. Charting and visual analytics gap

The current dashboard has no charts despite the backoffice design system already defining Recharts conventions.

Charts should answer a question. They must not be decoration.

## 10.1 Required V2 chart set

### A. Sales trend — P0

Primary visualization.

Supports:

- sales over time;
- comparison series;
- optional ticket-count overlay/toggle;
- tooltips with exact values;
- timezone disclosure.

### B. Sales by hour — P1

Purpose:

- identify rush hours;
- understand weak periods;
- support staffing/production decisions.

Existing documentation indicates an hourly-sales reporting route exists.

### C. Payment mix — P1

Prefer horizontal bars or donut when composition is the question.

Must preserve:

- original payment currency where relevant;
- NIO accounting equivalent where totals are aggregated;
- split-payment semantics.

### D. Product contribution — P1

Top products by:

- revenue;
- quantity;
- optional gross margin when cost semantics are reliable.

Avoid ranking by a metric whose denominator/cost completeness is not proven.

## 10.2 Chart rules

- Use NHILOS primary Navy for principal series.
- Use green for positive/comparison/success only where semantically valid.
- Red must indicate negative/critical meaning, not decoration.
- Never encode state by color alone.
- All charts require accessible labels/tooltips.
- Numerical values use tabular figures.
- Zero-data state must not render a meaningless flat chart.

---

# 11. Profitability insight gap

NHILOS already documents:

- CPP;
- BOM/recipe consumption;
- Kardex;
- COGS-oriented reports;
- mermas;
- production batches.

The executive dashboard currently exposes none of this.

## 11.1 Required owner summary

A compact “Operational profitability” block should be considered for V2:

- Net Sales
- COGS
- Gross Margin
- Gross Margin %
- Mermas

## 11.2 Explicit boundary

Dashboard V2 must **not** show:

- net profit;
- P&L;
- EBITDA;
- expense-based profitability;

unless an expense/accounting domain exists and is contractually complete.

The older owner-dashboard roadmap explicitly identifies this as out of scope.

## Status

**P0 contract for terminology; P1 for UI exposure.**

---

# 12. Action-required / exception surface gap

The dashboard should not force owners to inspect each bounded context to discover risk.

A V2 executive dashboard needs an **Atención requerida** region.

## Candidate signals already supported by documented platform capabilities

### Inventory
- stock critical/low;
- material negative-stock situations where applicable;
- abnormal merma.

### Payments
- pending card/voucher reconciliation;
- manual reconciliation overrides.

### Sales / audit
- voided invoices;
- unusual/manual discounts;
- manual cash drawer events;
- reopened shifts;
- supervisor overrides.

### Security
- critical/warning audit events;
- repeated failed authorization attempts.

### Fiscal
- sequence anomaly;
- fiscal configuration issue;
- future Fiscal Sentinel warnings only when that capability is actually implemented/accepted.

### Synchronization
- terminal stale;
- stream partial;
- unknown completeness;
- unsynchronized data.

## 12.1 Severity model

Recommended UI categories:

- **Critical** — action can affect financial/fiscal/security integrity;
- **Warning** — operational degradation or follow-up required;
- **Info** — awareness, no urgent intervention.

This aligns naturally with the existing Audit Trail risk taxonomy.

## 12.2 Rule

The dashboard is an aggregator of exceptions.

It should not become the workflow where those exceptions are resolved.

Each item should deep-link to its responsible module.

## Status

**P1 — ADD**

---

# 13. Sync freshness and trust gap

This is a P0 correctness issue.

## 13.1 Current problem

The screenshot shows:

`Actualizado 09:57 p. m. (CST)`

That label is insufficient for an offline-first platform.

It does not distinguish among:

- UI fetch time;
- report generation time;
- backend data timestamp;
- POS sync timestamp;
- last complete sync across required streams.

## 13.2 Required states

Dashboard V2 must differentiate:

### COMPLETE
All required streams are complete through time `T`.

Example:

`Datos completos hasta 9:54 p. m.`

### STALE
Data was previously complete but lag exceeds approved threshold.

Example:

`Información desactualizada · última sincronización completa hace 28 min`

### PARTIAL
Some streams have synchronized and others have not.

Example:

`Información parcial · ventas actualizadas, inventario pendiente`

### UNKNOWN
Completeness cannot be established.

Example:

`No se puede verificar la completitud de los datos`

## 13.3 Important rule

A fresh HTTP response is not evidence of fresh business data.

## Status

**P0 — CONTRACT GAP**

This must be solved before new charts and comparisons are treated as authoritative.

---

# 14. Payment insight gap

## 14.1 Current state

The current `Métodos de Pago` card displays a static list:

- Efectivo NIO
- Efectivo USD
- Tarjeta NIO
- Tarjeta USD
- Otros

This is valid but low-information-density.

## 14.2 Required V2 model

Expose:

- payment composition;
- total by method;
- relevant original currency;
- accounting/base equivalent;
- percentage mix.

Potential categories:

- cash;
- card;
- transfer/QR when supported by normalized data;
- other.

Do not merge currencies without explicitly using an approved accounting conversion.

## 14.3 Reconciliation intelligence

Pending voucher reconciliation belongs in `Atención requerida`, not hidden inside payment totals.

## Status

**P1 — REDESIGN**

---

# 15. Product performance gap

Existing roadmap evidence references a `/top-products` reporting route.

The current dashboard does not use it.

## Minimum V2 product panel

Columns:

- product;
- units;
- sales;
- share of sales.

Optional later:

- COGS;
- gross margin;
- gross margin %.

## Guardrail

Do not expose margin ranking until:

- cost snapshots are trustworthy for the selected historical period;
- recipe/variant/modifier cost treatment is complete;
- missing inventory-impact cases are represented explicitly.

## Status

**P1 — ADD**

---

# 16. Staff / waiter performance gap

A documented cashier-performance route exists, and restaurant-mode/waiter settlement capabilities exist.

This is useful but should not displace core executive indicators.

Potential P2 analytics:

- tickets handled;
- net sales;
- average ticket;
- tips;
- voids/overrides;
- discounts.

## Guardrail

This must remain factual operational reporting.

Avoid simplistic “best employee” scoring because sales volume can be driven by shift assignment, hours worked, station, table allocation, or business mode.

## Status

**P2 — CONDITIONAL**

---

# 17. Loyalty insight gap

Loyalty exists in the platform, but the dashboard currently exposes no owner analytics.

Dashboard V2 should not block on loyalty analytics.

Future candidate KPIs:

- loyalty-linked sales;
- enrolled/active customers;
- earn vs redeem activity;
- reward redemption count;
- repeat-customer contribution.

These metrics require their own semantic contract and should not be improvised from ledger balances.

## Status

**P2 — FUTURE**

---

# 18. Empty-state gap

The screenshot is a zero-sales state and illustrates a major UX weakness.

A dashboard with twelve `C$0.00` values feels broken even when it is technically correct.

## Required states

### A. No sales in selected period

Show:

- clear “No hay ventas en este período” state;
- preserve only useful zero KPIs;
- hide meaningless charts;
- offer previous-range/preset actions.

### B. New tenant / no historical data

Show onboarding-oriented explanation:

`Aún no hay datos suficientes para tendencias.`

### C. Data pending sync

Do **not** show zeros as if confirmed.

Show partial/stale/unknown state.

### D. Error loading one widget

Use widget-level failure isolation.

One failed inventory widget must not collapse the complete sales dashboard.

## Status

**P1 — REDESIGN**

---

# 19. Dashboard composition gap

The current four-card equal-weight strip implies all four metrics carry equal executive importance.

They do not.

## 19.1 Recommended hierarchy

### Level 1 — Executive KPIs
4–6 values maximum:

- Net/Gross Sales according to approved naming
- Tickets
- Average Ticket
- Gross Margin
- one conditional slot: IVA or Tips/COGS depending on profile

### Level 2 — Performance explanation
- Sales Trend
- Sales by Hour
- Top Products
- Payment Mix

### Level 3 — Management exceptions
- Attention Required
- Inventory/Merma
- Voids/Overrides
- Pending reconciliation
- Sync/fiscal health

### Level 4 — Drill-down
Deep analysis stays in:

- Sales
- Inventory
- Fiscal
- Loyalty
- Audit/Users
- Payments

## 19.2 Anti-pattern to avoid

Do not turn the dashboard into a wall of 15 independent KPI cards.

The dashboard must summarize and prioritize, not duplicate every report module.

---

# 20. Business-mode adaptation gap

The platform supports operational-mode concepts such as QSR, Restaurant and Hybrid.

Dashboard V2 should use one composition framework with conditional slots.

## Restaurant / Hybrid

Prioritize:

- sales;
- tickets;
- average ticket;
- gross margin;
- tips;
- waiter/shift insight;
- hourly demand;
- top products;
- voids/reconciliation.

## QSR / Coffee / Food Park

Prioritize:

- sales;
- tickets/hour;
- average ticket;
- gross margin;
- top products;
- rush hours;
- stock critical;
- discount/promotion contribution.

## Retail

Future-compatible profile:

- sales;
- units per ticket;
- average ticket;
- gross margin;
- top SKUs;
- stock critical;
- inventory valuation.

## Status

**P1 — CONTRACT GAP**

The dashboard should be profile-driven rather than forked into unrelated products.

---

# 21. Design-system compliance audit

The current UI is broadly aligned with the NHILOS backoffice visual identity:

### KEEP

- navy sidebar;
- green active accent;
- clean card surfaces;
- Inter-like data-oriented typography;
- restrained visual language;
- date selector placement;
- desktop-first layout.

### UNDERUSED

The design system already specifies:

- KPI trend indicators;
- chart colors and Recharts conventions;
- date presets;
- 4-column desktop KPI grid;
- chart layouts;
- auto-refresh behavior;
- WCAG 2.1 AA;
- tabular numeric figures.

Dashboard V2 does not need a new visual identity.

It needs a richer implementation of the design system already approved.

### Required refinement

- stronger visual hierarchy between hero KPI and supporting KPIs;
- more intentional card density;
- charts only where analytical value exists;
- semantic status chips;
- improved empty states;
- better use of whitespace by content grouping rather than oversized blank canvas.

---

# 22. Accessibility and responsive gaps

Dashboard V2 must preserve the backoffice contract:

- desktop-first;
- tablet-friendly;
- mobile read-only/basic;
- WCAG 2.1 AA minimum.

Required chart accessibility:

- values must be accessible without relying exclusively on graphics;
- color must not be the sole status signal;
- keyboard focus on interactive chart controls;
- `prefers-reduced-motion`;
- responsive tooltip alternatives;
- tabular numerals.

P0/P1 charts must degrade gracefully into readable summaries on narrow screens.

---

# 23. Backend/data capability audit

Based on the existing owner-dashboard execution roadmap, the following reporting capabilities are already documented in backend:

### Sales/reporting
- dashboard summary;
- hourly sales;
- top products;
- cashier performance;
- monthly fiscal summary;
- voided invoices;
- fiscal sequence audit;
- sales-book export;
- Z-report export.

### Inventory
- valuation;
- COGS;
- Kardex;
- alerts.

### Existing platform domains relevant to Dashboard V2
- advanced promotions;
- loyalty;
- audit events;
- voucher reconciliation;
- voluntary tips;
- production;
- mermas;
- split bills;
- waiter settlement.

## Important conclusion

The platform has significantly more domain capability than the current dashboard exposes.

However:

> **Existence of a domain capability does not prove that an aggregated, historical, tenant-safe Dashboard V2 DTO already exists for it.**

Dashboard V2 requires a code-level evidence pass before the PRD claims that every proposed widget is frontend-only.

---

# 24. API aggregation gap

The previous dashboard roadmap states that existing backend endpoints should be reused.

That remains a good default, but Dashboard V2 introduces a new question:

> Should the browser issue many independent analytical requests, or should an executive-summary composition endpoint aggregate stable dashboard data?

This audit does **not** decide the architecture.

The Architecture Spec must evaluate:

- network request count;
- independent widget caching;
- shared date-range semantics;
- tenant transaction guarantees;
- freshness metadata;
- partial-failure handling;
- query load;
- synchronization completeness;
- backward compatibility.

Do not create a “god endpoint” merely for convenience.

Do not make 15 browser requests if they all require the same expensive scan and consistency boundary.

## Status

**Architecture decision required after PRD.**

---

# 25. Security and tenant-isolation carry-forward

Dashboard V2 must not weaken previously established controls.

Non-negotiable invariants:

- verified JWT tenant identity remains authorization authority;
- UI slug/host is context, not authorization;
- explicit tenant predicates remain;
- PostgreSQL RLS remains defense-in-depth;
- read analytics cannot cross tenants;
- invoices remain immutable;
- the dashboard cannot introduce fiscal mutation workflows.

New widget development is blocked if tenant isolation is not proven on the underlying query path.

---

# 26. Recommended target information architecture

Conceptual structure only:

```text
Dashboard
├── Context Bar
│   ├── Date range
│   ├── Comparison range
│   ├── Business/Fiscal context
│   └── Sync freshness/completeness
│
├── Executive KPI Strip
│   ├── Sales
│   ├── Tickets
│   ├── Average Ticket
│   ├── Gross Margin
│   └── Conditional KPI
│       ├── IVA
│       ├── Tips
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
    ├── Payments/Reconciliation
    ├── Voids/Audit
    ├── Fiscal
    └── Sync
```

This is not a final wireframe.

The PRD should define behavior and priority before implementation locks layout details.

---

# 27. Priority remediation matrix

## P0 — Trust and semantics

| ID | Requirement |
|---|---|
| P0-01 | Approve Dashboard KPI dictionary. |
| P0-02 | Approve reporting timezone and boundary semantics. |
| P0-03 | Define cancellation/void/refund treatment per KPI. |
| P0-04 | Define tip separation from sales. |
| P0-05 | Define COGS/gross-margin semantics. |
| P0-06 | Define fiscal-regime presentation rules. |
| P0-07 | Implement/verify complete-stale-partial-unknown freshness contract. |
| P0-08 | Add period comparison semantics. |
| P0-09 | Add sales trend visualization with reliable historical data. |
| P0-10 | Verify tenant isolation for every data source used by V2. |

## P1 — Owner decision value

| ID | Requirement |
|---|---|
| P1-01 | Add ticket count as meaningful first-class context. |
| P1-02 | Add hourly sales. |
| P1-03 | Add top products. |
| P1-04 | Redesign payment mix. |
| P1-05 | Add COGS/gross-margin presentation. |
| P1-06 | Add merma summary. |
| P1-07 | Add tips for applicable profiles. |
| P1-08 | Add attention-required panel. |
| P1-09 | Add pending voucher reconciliation signal. |
| P1-10 | Add void/audit exception signal. |
| P1-11 | Add stock-critical signal. |
| P1-12 | Define business-mode widget profiles. |
| P1-13 | Implement meaningful empty/partial/error states. |
| P1-14 | Add drill-down navigation from widgets. |

## P2 — Advanced analytics

| ID | Requirement |
|---|---|
| P2-01 | Cashier/waiter performance analytics. |
| P2-02 | Promotion attribution. |
| P2-03 | Loyalty analytics. |
| P2-04 | Product margin matrix/menu engineering. |
| P2-05 | Historical anomaly detection. |
| P2-06 | Multi-sucursal benchmark/roll-up when branch model is ready. |

---

# 28. Explicit non-goals for Dashboard V2

The next PRD should preserve these exclusions unless separately approved:

- net profit;
- P&L;
- expense accounting;
- payroll;
- predictive AI forecasting;
- automatic purchasing;
- employee scoring;
- tax advice;
- replacing Fiscal reports with the Dashboard;
- resolving payment reconciliation directly from the executive dashboard;
- editing historical fiscal documents;
- changing POS offline-first authority;
- implementing multi-sucursal corporate BI before branch aggregation is formally modeled.

---

# 29. Decisions that must be fixed in the PRD

The audit recommends that the Dashboard V2 PRD explicitly decide:

1. Primary sales KPI name and formula.
2. Ticket-count definition.
3. Average-ticket formula.
4. Default comparison period.
5. Reporting timezone.
6. Tip inclusion/exclusion semantics.
7. Gross-margin/COGS terminology.
8. Merma relationship to COGS.
9. Fiscal-regime widget rules.
10. Business-mode widget profile rules.
11. Freshness thresholds.
12. Action-required severity and inclusion rules.
13. Empty/partial/unknown-data behavior.
14. Widget drill-down destinations.
15. Default date preset.
16. Whether Dashboard V2 is OWNER-only or OWNER/MANAGER with identical or differentiated visibility.

---

# 30. Evidence required before implementation

A PRD approval alone is insufficient.

Before implementation batches are opened, obtain evidence for:

### Data
- fixture with known sales totals;
- known discounts;
- known taxes;
- known tips;
- known COGS;
- known mermas;
- known split payments;
- known voids;
- known product rankings.

### Fiscal profiles
At least:

- Régimen General tenant;
- Cuota Fija tenant;
- exempt/mixed-tax scenario where supported.

### Sync
Test:

- fully synchronized tenant;
- stale terminal;
- partial stream;
- unknown completeness;
- reconnect and catch-up.

### Multi-tenant
Two-tenant proof for all aggregate routes used by Dashboard V2.

### UX
Test:

- normal sales day;
- zero-sales range;
- high-alert state;
- large dataset;
- tablet layout;
- mobile read-only layout.

---

# 31. Definition of Done for the audit phase

This Gap Audit can be promoted from `PROPOSED` when:

- [ ] Product agrees with the gap inventory.
- [ ] No current capability is incorrectly classified as absent.
- [ ] The existing codebase is checked against all P0/P1 data assumptions.
- [ ] The tax-regime behavior is confirmed against the actual fiscal configuration model.
- [ ] The tip data path from POS → sync → backend reporting is confirmed.
- [ ] The current dashboard API response shape is recorded.
- [ ] Sync freshness/completeness implementation status is confirmed.
- [ ] The KPI contract questions are transferred to the Dashboard V2 PRD.
- [ ] No architecture implementation decision is prematurely frozen in the audit.

---

# 32. Final audit conclusion

NHILOS does **not** primarily have a visual-design problem in its Owner Dashboard.

It has a **decision-density problem**.

The current dashboard successfully proves that the shell, navigation, date filtering, basic sales summary and payment summary can be presented cleanly. Those parts should be preserved.

The platform underneath already contains substantially richer capabilities: sales analytics, inventory/CPP/COGS, mermas, audit events, voucher reconciliation, promotions, loyalty, tips and offline synchronization.

Dashboard V2 should expose that value selectively, without becoming a report dump.

The highest-priority remediation is:

1. make the numbers trustworthy through explicit KPI and sync-freshness contracts;
2. make fiscal presentation tenant-aware;
3. introduce comparison and trends;
4. expose gross-margin/cost context;
5. surface operational exceptions;
6. adapt restaurant-specific signals such as voluntary tips;
7. preserve drill-down into specialized modules rather than overloading the dashboard.

**Recommended next artifact:**

`owner_dashboard_v2_prd.md`

That PRD should convert this audit into an authoritative product contract covering behavior, KPI semantics, conditional rendering, dashboard composition, states, interactions and acceptance criteria—without yet deciding database tables, query architecture or implementation slices.
