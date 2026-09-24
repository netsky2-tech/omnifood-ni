# NHILOS POS — Owner Dashboard V2 Product Requirements Document

**Document:** `owner_dashboard_v2_prd.md`  
**Version:** 1.0  
**Status:** APPROVED / AUTHORITATIVE PRODUCT CONTRACT FOR OWNER DASHBOARD V2  
**Date:** 2026-09-23  
**Scope:** Owner/Manager Backoffice Dashboard  
**Authority:** `owner_dashboard_v2_gap_audit_v0.3.md`  
**Implementation:** This PRD is the authoritative product contract for Dashboard V2. It defines behavior, KPI semantics, conditional rendering, states, priorities and acceptance criteria. It does **not** define database tables, endpoint topology, persistence strategy, frontend component architecture or implementation batches.

---

# 1. Product objective

Dashboard V2 turns the current NHILOS sales-summary screen into an **owner decision surface**.

The Dashboard must let an authorized owner or manager understand, within seconds:

- how much the business sold;
- whether that result improved or deteriorated against a meaningful comparison period;
- how many completed tickets produced those sales;
- the average economic value per ticket;
- the cost directly associated with sold goods;
- the resulting gross margin;
- which hours, products and payment methods explain the result;
- whether relevant operational, fiscal, payment or security conditions require attention; and
- whether the displayed information is complete or still pending POS synchronization.

The Dashboard is not a replacement for Sales, Inventory, Fiscal, Audit or Payments.

Its job is:

> **Detect, summarize and route.**

Specialized modules remain responsible for detailed investigation and resolution.

---

# 2. Product problem

The current Dashboard is clean and operational, but behaves primarily as a static report summary.

It currently exposes:

- Ventas Brutas;
- Ticket Promedio;
- Impuestos (IVA);
- Descuentos;
- Métodos de Pago;
- Resumen de Ventas;
- date range;
- an “Actualizado HH:mm” badge.

The verified Gap Audit identified five product-level problems:

1. KPI semantics are not sufficiently explicit and one current label is materially misleading.
2. The Dashboard does not provide trends or comparison context.
3. It underuses existing Sales and Inventory reporting capabilities.
4. It does not surface operational exceptions requiring owner attention.
5. It presents report-generation time as if it could represent business-data freshness.

Dashboard V2 must solve those problems without turning the page into an overloaded reporting cockpit.

---

# 3. Source-of-truth principles

Dashboard V2 must obey the following product invariants.

## 3.1 Offline-first truth

The POS remains the operational source of truth while disconnected.

The cloud Dashboard is an eventually consistent management view.

Therefore:

- the Dashboard must never imply completeness that cannot be proven;
- fresh HTTP/API responses do not imply fresh business data;
- stale, partial and unknown states are valid product states, not technical errors.

## 3.2 Fiscal immutability

Dashboard V2 is read-oriented.

It must not:

- edit historical invoices;
- renumber fiscal documents;
- silently recalculate historical tax values from current rules;
- create fiscal correction workflows;
- convert Dashboard alerts into hidden mutation paths.

## 3.3 Tenant isolation

Every value rendered belongs only to the authorized tenant context.

Any new V2 backend contract must preserve the same isolation guarantees as existing report routes.

## 3.4 Decision density over decoration

Charts and cards exist only when they answer a management question.

Dashboard V2 must not become a collection of decorative charts or duplicate every specialized report page.

---

# 4. Users and permissions

## 4.1 OWNER

OWNER has access to the full Dashboard V2, subject only to data availability and tenant configuration.

OWNER can see:

- sales;
- tickets;
- average ticket;
- discounts;
- tax/fiscal context;
- COGS;
- gross margin;
- shrinkage/merma;
- payment mix;
- operational alerts;
- void summaries;
- synchronization state;
- future tip analytics after the data path exists.

## 4.2 MANAGER

MANAGER can access Dashboard V2 if allowed by the existing reporting/access model.

The Dashboard must respect existing granular permissions.

If a MANAGER is not authorized to view sensitive cost information:

- COGS;
- gross margin;
- inventory valuation;

those widgets must be omitted rather than replaced with zeros or masked fake values.

Dashboard V2 does not introduce a new permission framework.

## 4.3 CASHIER / WAITER

Dashboard V2 is not a tactical POS surface for these roles.

No new Dashboard access is introduced for CASHIER or WAITER by this PRD.

---

# 5. Scope

Dashboard V2 includes:

- authoritative KPI semantics;
- period comparison;
- sales trend;
- ticket count;
- average ticket;
- regime-aware fiscal composition;
- discounts context;
- payment mix;
- hourly sales;
- top products;
- COGS;
- gross margin;
- shrinkage/merma;
- Attention Required;
- stock alerts;
- void summary;
- fiscal sequence anomaly summary;
- synchronization freshness/completeness;
- pending card reconciliation summary;
- audit/security executive summary;
- voluntary tip analytics after end-to-end data remediation;
- profile-driven Dashboard composition;
- no-data, partial-data and widget-failure states;
- drill-down into specialized modules.

---

# 6. Non-goals

Dashboard V2 does not include:

- net profit;
- P&L;
- EBITDA;
- general-ledger accounting;
- expense accounting;
- payroll;
- tax advice;
- predictive AI forecasting;
- automatic purchasing;
- employee ranking/scoring;
- loyalty analytics as a release blocker;
- promotion-attribution analytics as a release blocker;
- multi-branch corporate BI before branch aggregation is formally modeled;
- reconciliation resolution directly inside Dashboard;
- inventory adjustment directly inside Dashboard;
- historical fiscal mutation;
- replacing Sales, Inventory, Fiscal, Audit or Payments detail pages.

---

# 7. Product terminology

The following terms are authoritative for this PRD.

## 7.1 Completed Ticket

A **Completed Ticket** is a finalized business sale that qualifies for sales reporting and is not void/canceled.

Rules:

- split payment does not create additional tickets;
- payment method count does not affect ticket count;
- if a split-bill flow creates multiple independently finalized fiscal/business sale documents, **each finalized resulting document counts as one Completed Ticket**;
- the original table/order/check from which those finalized documents were produced is not an additional Completed Ticket unless it is itself finalized as a sale document;
- voided/canceled tickets do not count toward completed-ticket metrics;
- open/held tickets do not count.

Refund semantics are deferred until a refund domain is formally supported.

## 7.2 Net Sales

**Net Sales** is the primary executive sales KPI.

Product definition:

> Sales after discounts/promotions, excluding tax, excluding voluntary tips, and excluding voided/canceled transactions.

Conceptually:

`Net Sales = Pre-discount Sales - Discounts`

before tax and tips.

Dashboard V2 must not use the current `grossSales` field as the primary KPI merely because it already exists.

The current implementation has a verified mismatch:

- existing `grossSales` is post-discount and post-tax;
- the current UI labels it `Ventas Brutas`.

Dashboard V2 must correct that mismatch.

**Cross-widget invariant:** every Dashboard visualization that claims to represent sales revenue
(Sales KPI, Sales Trend, Hourly Sales, Top Products revenue/share) must use the same approved
**Net Sales** semantics defined here. Existing endpoints may be reused only if their monetary
values reconcile to this contract; otherwise Architecture must adapt the reporting contract rather
than allowing different screens/widgets to use different meanings of “sales”.

## 7.3 Pre-discount Sales

**Pre-discount Sales** is the economic base before discounts, excluding tax and tips.

For current verified report semantics, this base is derivable as:

`Net Sales + Total Discounts`

subject to fixture reconciliation before implementation acceptance.

## 7.4 Total Discounts

Total monetary value removed from the pre-discount base through approved discount/promotion mechanisms.

Dashboard display:

- amount;
- percentage of Pre-discount Sales.

Formula:

`Discount Rate = Total Discounts / Pre-discount Sales × 100`

When Pre-discount Sales is zero:

- percentage is shown as `—`;
- never show `0%` if the denominator is undefined.

## 7.5 Average Ticket

**Average Ticket** is:

`Net Sales / Completed Tickets`

Rules:

- tax excluded;
- voluntary tips excluded;
- split payment does not change denominator;
- voided/canceled tickets excluded;
- if Completed Tickets is zero, display `—`, not `C$0.00` as if it were a measured average.

## 7.6 Sales COGS

For gross-margin purposes, Dashboard V2 uses **Sales COGS**, not shrinkage-inclusive total COGS.

Product basis:

> Direct inventory cost attributable to completed sales for the selected reporting period.

Current implementation candidate: `salesCogsNio`.

Historical alignment between sales timestamps and inventory-movement timestamps must pass deterministic fixture verification before V2 acceptance.

## 7.7 Shrinkage / Merma

Merma is reported separately from Sales COGS.

Current implementation candidate: `shrinkageCogsNio`.

Dashboard V2 must not silently fold merma into Gross Margin.

## 7.8 Gross Margin / Margen Bruto de Venta

Dashboard V2 uses **Margen Bruto de Venta** as a managerial sales-performance metric. It is not presented as statutory/accounting net profit and does not silently absorb operational merma.

**Gross Margin Amount / Margen Bruto de Venta**

`Net Sales - Sales COGS`

**Gross Margin % / Margen Bruto %**

`Gross Margin Amount / Net Sales × 100`

Rules:

- if Net Sales is zero, percentage is `—`;
- merma is displayed separately as an operational-loss indicator;
- the approved cost basis is **Sales COGS (`salesCogsNio`)**, subject to deterministic historical-alignment fixtures;
- this metric is gross margin on completed sales, not net profit;
- Dashboard must never label Gross Margin as “Ganancia” or “Utilidad Neta”.

## 7.9 Taxes / IVA

Tax values are historical amounts recorded by the sales/fiscal domain.

Dashboard does not recalculate past invoices using the tenant's current tax configuration.

Fiscal presentation is conditional on the tenant fiscal profile.

## 7.10 Voluntary Tips

Tips are never part of:

- Net Sales;
- Gross Margin;
- Average Ticket;
- tax-exclusive sales KPIs.

Tips are a separate financial flow.

Tip KPIs remain unavailable until the required POS → sync → cloud → reporting data path exists.

---

# 8. Reporting timezone

Dashboard V2 standard reporting timezone is:

> **America/Managua (`UTC-06:00`)**

All date-range interpretation, comparison ranges and chart bucketing use that timezone unless the product later introduces tenant-specific reporting timezone configuration.

The timezone must be visible where ambiguity matters, but should not create visual noise in every widget.

---

# 9. Default date and comparison behavior

## 9.1 Default date preset

Dashboard V2 defaults to:

> **Hoy**

This is a fixed V2 product decision.

Rationale:

The Dashboard is the owner's operational starting point, while longer historical analysis remains accessible through presets and Sales reports.

This Dashboard-specific default intentionally supersedes the generic backoffice design-system example of `Últimos 30 días`.

## 9.2 Available presets

At minimum:

- Hoy;
- Ayer;
- Últimos 7 días;
- Últimos 30 días;
- Este mes;
- Mes anterior;
- Este año;
- Personalizado.

## 9.3 Default comparison rules

### Single-day range

Compare with:

> same weekday one week earlier.

Example:

Tuesday vs previous Tuesday.

### Arbitrary multi-day range

Compare with:

> immediately preceding equal-duration range.

### Month-to-date

Compare with:

> same elapsed calendar range in previous month.

### Year-to-date

Compare with:

> same elapsed calendar range in previous year.

## 9.4 Calendar-day semantics

Date selections represent **local calendar days in America/Managua**.

User-visible ranges are inclusive of the selected start and end dates. Implementations may use
half-open technical boundaries internally, but the full selected end date must be included.

For month/year comparison ranges where the equivalent prior calendar date does not exist
(for example, a 31st day or leap-day edge case), the comparison range clamps to the last valid
calendar day without extending its duration beyond the intended comparable period.

## 9.5 Comparison edge cases

If the previous period is zero or unavailable:

- show absolute current value;
- comparison percentage becomes `—`;
- explanatory copy may state `Sin base comparable`.

Do not render artificial `+100%`/infinite growth.

---

# 10. Dashboard composition

Dashboard V2 uses four information layers.

## 10.1 Context Bar

Contains:

- selected date range;
- comparison context;
- fiscal/business profile context where relevant;
- synchronization freshness/completeness state.

## 10.2 Executive KPI Strip

Maximum default density: **5 primary KPI slots**.

Recommended baseline:

1. Net Sales
2. Completed Tickets
3. Average Ticket
4. Gross Margin
5. Conditional Context KPI

The fifth slot is tenant/profile-aware.

Possible values:

- IVA / fiscal metric where meaningful;
- COGS;
- Tips only after DG-17 remediation and only where applicable.

The Dashboard must not render a meaningless zero-valued fiscal card merely to preserve a fixed grid.

## 10.3 Performance

Contains:

- Sales Trend;
- Sales by Hour;
- Top Products;
- Payment Mix.

## 10.4 Management / Exceptions

Contains:

- Operational Profitability;
- Attention Required;
- synchronization state.

---

# 11. Executive KPI requirements

## FR-KPI-01 — Net Sales

The primary visual KPI is `Ventas Netas`.

It displays:

- current value;
- comparison delta;
- comparison label;
- optional compact trend cue/sparkline if supported without visual clutter.

It must not display tax-inclusive `grossSales` under the label `Ventas Brutas`.

## FR-KPI-02 — Completed Tickets

Display:

- ticket count;
- comparison delta.

Do not bury ticket count as small text below Sales.

## FR-KPI-03 — Average Ticket

Display:

- current value;
- comparison delta;
- `—` when no completed tickets exist.

## FR-KPI-04 — Gross Margin

Display:

- percentage as primary value;
- amount as supporting value;
- comparison preferably in percentage points for the margin percentage.

Example:

`61.4%`
`C$29,780`
`+1.9 pp vs martes anterior`

## FR-KPI-05 — Conditional Fiscal/Business Slot

The fifth executive slot adapts to tenant context.

Rendering order is defined by product profile, not by whichever API responds first.

No layout hole should remain when a widget is inapplicable.

---

# 12. Fiscal-regime behavior

## FR-FISCAL-01 — Regime source

Dashboard uses the tenant's existing fiscal configuration.

It must not infer fiscal behavior from UI labels or hardcoded client constants.

## FR-FISCAL-02 — Régimen General / explicit IVA profile

When the fiscal configuration indicates that explicit IVA reporting is meaningful, the conditional executive slot may show historical IVA generated for the selected period.

The exact label must match the fiscal configuration semantics.

## FR-FISCAL-03 — Cuota Fija / non-IVA executive profile

Dashboard does not show a premium KPI card saying:

`IVA C$0.00`

solely because the field exists.

Instead:

- omit the IVA KPI;
- use the slot for a relevant business metric;
- optionally show subtle context such as `Régimen fiscal: Cuota Fija`.

This PRD does **not** assert that “Cuota Fija means IVA is always zero”.

Tax display follows tenant fiscal configuration.

## FR-FISCAL-04 — Unknown/incomplete fiscal configuration

If fiscal setup cannot be reliably determined:

- no authoritative IVA conclusion is presented;
- show a non-destructive configuration warning;
- provide drill-down to Fiscal/Settings where appropriate.

## FR-FISCAL-05 — Additional fiscal breakdown

Taxable vs exempt sales or other fiscal breakdowns may be added only when the underlying reporting contract is verified.

They are not assumed to be frontend-ready by this PRD.

---

# 13. Discounts

## FR-DISC-01 — Discount summary

Display:

- total discounts;
- discount rate;
- comparison delta.

## FR-DISC-02 — Denominator

Use approved Pre-discount Sales.

## FR-DISC-03 — Attribution

Promotion-driven vs manual-discount attribution is deferred until the reporting evidence is complete.

Do not infer attribution from incomplete metadata.

---

# 14. Sales Trend

## FR-CHART-01 — Primary chart

Dashboard V2 includes a Sales Trend chart.

Purpose:

> Explain the selected period over time and provide visual comparison context.

## FR-CHART-02 — Granularity

Suggested presentation behavior:

- single day → hourly;
- 2–60 days → daily;
- longer ranges → weekly/monthly aggregation as product readability requires.

Exact bucketing may be finalized in Architecture/implementation as long as period semantics remain faithful.

## FR-CHART-03 — Series

Required:

- current-period Net Sales;
- comparison-period Net Sales when available.

The chart must not silently fall back to tax-inclusive `grossSales` or any endpoint-specific
definition that conflicts with §7.2.

Optional control:

- ticket count view/toggle.

## FR-CHART-04 — No-data

If there are no sales:

- do not render a meaningless flat zero line;
- render an explicit no-sales state.

---

# 15. Sales by Hour

## FR-HOURLY-01

Expose hourly demand for ranges where hourly interpretation is meaningful.

For long ranges, the product may show averaged distribution by hour rather than thousands of raw points.

## FR-HOURLY-02

Purpose:

- identify rush hours;
- identify weak periods;
- support staffing and production decisions.

## FR-HOURLY-03

Existing hourly-sales reporting should be reused unless Architecture proves a different aggregation is necessary.

Before acceptance, its monetary series must reconcile to the same **Net Sales** semantics used by
the executive Sales KPI. Reuse of an existing endpoint does not override the KPI contract.

---

# 16. Top Products

## FR-PRODUCT-01 — Base view

Display a compact contribution view containing:

- product;
- units;
- Net Sales contribution;
- share of Net Sales.

Existing Top Products reporting may be reused only after its sales value reconciles to the
Dashboard Net Sales definition. A tax-inclusive product ranking must not coexist with a pre-tax
executive Net Sales KPI under the same Dashboard contract.

## FR-PRODUCT-02 — Ranking

Default rank:

> Net Sales contribution.

Quantity-based sorting may be offered as a user action.

## FR-PRODUCT-03 — Margin

Do not rank products by margin in Dashboard V2 core until historical product cost semantics are proven for:

- variants;
- modifiers;
- recipes;
- missing inventory-impact cases;
- historical snapshots.

Product-margin analysis remains P2.

---

# 17. Payment Mix

## FR-PAY-01 — Composition

Replace the current static payment list with a more efficient payment-composition view.

Payment Mix is a **cash-flow/settlement view**, not a sales-revenue KPI.

Display:

- method;
- amount;
- percentage of authoritative collected payment value;
- original currency where operationally relevant;
- NIO accounting/base equivalent for consolidated comparison.

For Restaurant/Hybrid profiles, once tip remediation is complete, Payment Mix must reconcile to
the actual settlement flow including tip amounts where the payment instrument collected them.
Tips remain separate from Net Sales even when they are part of the money collected.

## FR-PAY-02 — Split payments

Split payments contribute to each payment method proportionally.

They do not affect ticket count.

## FR-PAY-03 — Currency

Never add raw USD and NIO amounts without conversion semantics.

## FR-PAY-04 — Reconciliation

Pending voucher reconciliation is not hidden in Payment Mix.

It belongs in Attention Required.

A payment mix with unresolved cloud tip semantics must not be labeled `Total cobrado` unless the
underlying payment data is proven to include the complete collected amount.

---

# 18. Operational Profitability

## FR-PROFIT-01 — Block

Dashboard V2 includes an Operational Profitability block containing:

- Net Sales;
- Sales COGS;
- Gross Margin Amount / Margen Bruto de Venta;
- Gross Margin %;
- Merma / Impacto de Merma.

## FR-PROFIT-02 — COGS basis

Use **Sales COGS (`salesCogsNio`)** for Margen Bruto de Venta.

Display Merma (`shrinkageCogsNio`) separately as an operational-loss indicator.

Dashboard V2 does not use shrinkage-inclusive `totalCogsNio` as the Gross Margin denominator/basis.

## FR-PROFIT-03 — Historical alignment

If selected-range COGS cannot be reconciled reliably with sales due to timestamp alignment:

- do not present Gross Margin as authoritative;
- show an unavailable/degraded state;
- provide explanatory copy rather than an invented number.

## FR-PROFIT-04 — Language

Allowed:

- Costo de Ventas;
- Margen Bruto;
- Merma.

Not allowed:

- Ganancia Neta;
- Utilidad Neta;
- Beneficio Neto;
- EBITDA.

---

# 19. Attention Required

Attention Required summarizes actionable exceptions.

It does not resolve them.

Each item must:

- communicate what happened;
- communicate severity;
- communicate magnitude/count where useful;
- deep-link to the responsible module.

## 19.1 Severity

### Critical

Use when there is a material fiscal, financial, security or integrity risk.

Candidate examples:

- fiscal sequence gap/duplicate requiring investigation;
- critical audit/security events;
- sync state where data integrity cannot be established and the owner could make materially wrong decisions.

### Warning

Use for operational follow-up.

Candidate examples:

- critical/low stock counts;
- negative inventory conditions where supported;
- pending card reconciliations;
- elevated merma;
- stale sync;
- void activity requiring review.

### Info

Use for awareness without urgent action.

## 19.2 Existing frontend-ready signals

### Stock

Use current inventory alert counts:

- critical;
- warning;
- negative.

### Voids

Use:

- voided count;
- voided amount.

### Fiscal sequence

Use:

- has gaps;
- missing sequence list;
- duplicate sequence list.

## 19.3 Backend-required signals

### Pending card reconciliation

Required aggregate product contract:

- pending count;
- pending amount;
- oldest pending age;
- optional terminal/acquirer grouping in detail module.

### Audit/security executive summary

Required aggregate product contract:

- critical event count;
- warning event count;
- selected-period trend/count;
- most recent high-severity event category;
- deep-link to Audit.

The Dashboard must not dump raw forensic logs into the executive page.

---

# 20. Synchronization freshness/completeness

This is a P0 trust feature.

## FR-SYNC-01 — States

Dashboard V2 defines four user-visible states:

### COMPLETE

All required Dashboard data streams have a confirmed completeness watermark/checkpoint through timestamp `T`.

Display example:

`Datos completos hasta 9:54 p. m.`

### STALE

Completeness was established, but the last complete business timestamp exceeds the acceptable freshness window.

Display example:

`Datos desactualizados · completos hasta 9:21 p. m.`

### PARTIAL

Some required streams are current and others are incomplete/pending.

Display example:

`Información parcial · ventas actualizadas, inventario pendiente`

### UNKNOWN

The system cannot establish completeness.

Display example:

`No se puede verificar la completitud de los datos`

## FR-SYNC-02 — Required streams

At minimum, freshness must model the streams actually used by the rendered Dashboard widgets.

If Sales is complete but Inventory is partial:

- Sales KPIs may remain visible;
- Gross Margin/COGS dependent widgets must show partial/unavailable state;
- the overall Dashboard context must indicate partial completeness.

## FR-SYNC-03 — Freshness threshold

Dashboard V2 adopts an initial platform freshness target of **5 minutes**.

The age is measured from the last **confirmed completeness watermark / synchronization checkpoint**
for the required stream, not from the timestamp of the last sale or inventory movement.

Therefore a quiet store with no transactions for 30 minutes can still be COMPLETE/current if its
sync checkpoint/heartbeat proves that there are no pending events.

Product rules:

- COMPLETE/current: every required rendered stream has a confirmed completeness checkpoint ≤ **5 minutes** old;
- STALE: required streams are complete, but the oldest required completeness checkpoint is > **5 minutes** old;
- PARTIAL: one or more required rendered streams cannot prove completeness while others can;
- UNKNOWN: completeness metadata is unavailable, contradictory or cannot be trusted.

The 5-minute target is a V2 platform default and must not be hardcoded independently by individual
widgets. Architecture may centralize it as a server/platform configuration. Per-tenant freshness
SLAs are out of scope.

## FR-SYNC-04 — Report generation time

`generatedAt` may remain available as technical metadata but must not be labeled as synchronization freshness.

## FR-SYNC-05 — Auto-refresh

Default dashboard refresh cadence:

> every 5 minutes

Manual refresh remains available.

No auto-refresh should interrupt active modal/form interactions.

---

# 21. Voluntary Tips

Tips are a **required Dashboard V2 capability for Restaurant/Hybrid production profiles**.
They remain blocked until the data model/sync/reporting path is remediated.

QSR/Retail profiles where tips are not applicable are not blocked by this requirement.

## 21.1 Required data semantics

The persisted/synchronized tip data must preserve enough information to report:

- tip amount;
- source completed ticket;
- event/business timestamp sufficient for reporting-period assignment;
- waiter/shift relationship when available;
- cancellation/void/reversal behavior;
- original currency and accounting equivalent where applicable;
- the tip-eligible base or immutable inputs needed to reproduce the sale-time TipEngine basis without using future/current rules.

This PRD does not prescribe the persistence schema.

## 21.2 KPI behavior after remediation

Applicable profiles may show:

- Total Tips;
- Tipped Ticket Participation;
- Average Tip;
- Tip Rate.

### Tipped Ticket Participation

`Tickets with tip > 0 / eligible completed tickets × 100`

### Average Tip

`Total Tips / tipped completed tickets`

### Tip Rate

`Total Tips / sale-time tip-eligible base × 100`

The denominator must match the same eligible base used by the POS TipEngine when the sale was
closed. Dashboard reporting must not recompute old tip eligibility using current tax, discount or
catalog rules.

## 21.3 Separation

Tips are never merged into Net Sales.

## 21.4 Inapplicable profile

If tips are disabled/not applicable:

- omit tip widgets;
- do not render zero-value placeholders.

---

# 22. Business-mode profiles

Dashboard V2 uses one component system with product-driven composition.

It must not fork into independent dashboard applications.

## 22.1 Restaurant / Hybrid profile

Prioritize:

- Net Sales;
- Completed Tickets;
- Average Ticket;
- Gross Margin;
- Tips (required once the profile is production-ready under Dashboard V2);
- hourly demand;
- Top Products;
- Payment Mix;
- Attention Required;
- waiter/shift drill-down as P2.

## 22.2 QSR / Coffee / Food Park profile

Prioritize:

- Net Sales;
- Completed Tickets;
- Average Ticket;
- Gross Margin;
- hourly demand;
- Top Products;
- stock critical;
- discount context;
- Payment Mix.

## 22.3 Retail-compatible profile

Future-compatible composition:

- Net Sales;
- Completed Tickets;
- units per ticket;
- Average Ticket;
- Gross Margin;
- Top SKUs;
- stock critical;
- inventory valuation.

Retail-specific enhancements do not block Dashboard V2 for the initial hospitality/QSR scope.

---

# 23. Empty, partial and failure states

## FR-STATE-01 — No sales

When the selected period contains no completed sales:

- state clearly `No hay ventas en este período`;
- Completed Tickets may show `0`;
- Net Sales may show `C$0.00`;
- Average Ticket shows `—`;
- Gross Margin % shows `—`;
- suppress meaningless charts;
- keep useful alerts/freshness visible.

## FR-STATE-02 — New tenant / insufficient history

Show:

`Aún no hay historial suficiente para comparar este período.`

Do not fabricate comparison deltas.

## FR-STATE-03 — Partial sync

Never convert unknown data into zeros.

Widgets dependent on incomplete streams show an explicit partial/unavailable state.

## FR-STATE-04 — Widget failure isolation

A failed Inventory request must not make Sales KPIs disappear.

A failed Audit summary must not collapse the entire Dashboard.

Widget-level failure states are required.

## FR-STATE-05 — Full page failure

Use a page-level failure only when core Dashboard context cannot be established at all, such as authorization/tenant context failure.

---

# 24. Drill-down behavior

Every insight must have a defined destination.

| Dashboard insight | Destination |
|---|---|
| Sales KPI / Sales Trend | Sales |
| Hourly Sales | Sales |
| Top Products | Sales / product performance view |
| Payment Mix | Sales / payments |
| Pending reconciliation | Payment reconciliation workflow |
| COGS / Gross Margin | Inventory / COGS |
| Merma | Inventory / merma/Kardex |
| Stock alerts | Inventory alerts |
| Voids | Fiscal / voided invoices |
| Sequence anomaly | Fiscal / sequence audit |
| Fiscal configuration warning | Fiscal / Settings |
| Audit/security alert | Audit |
| Sync issue | System/sync diagnostic surface when available |

Dashboard drill-down is navigation, not mutation.

---

# 25. Visual and interaction requirements

Dashboard V2 must use the existing NHILOS backoffice design system.

## 25.1 Brand

Keep:

- navy navigation;
- green active/success accent;
- restrained white/neutral surfaces;
- semantic red/warning/info colors;
- Inter typography;
- tabular numeric figures.

## 25.2 Charts

The product allows adding a charting dependency.

Implementation must preserve:

- accessibility;
- bundle discipline;
- responsive behavior;
- design tokens.

No charting library is mandated by this PRD.

## 25.3 Color semantics

- Navy: primary quantitative series;
- green: positive/comparison/success meaning;
- red: negative/critical meaning;
- warning amber: caution/follow-up;
- neutral gray: baseline/reference.

Color is never the only signal.

## 25.4 Responsive

### Desktop

Full Dashboard experience.

### Tablet

Full read experience with responsive reflow.

### Mobile

Read-oriented summary.

Complex analytical interactions may simplify, but critical information and freshness state remain accessible.

---

# 26. Data/API product contracts still required

This PRD intentionally does not dictate endpoint topology.

Architecture must determine the best implementation for each contract.

## 26.1 Freshness contract

Must support:

- tenant-level state;
- stream-level completeness;
- last complete business timestamp;
- partial/unknown behavior.

## 26.2 Card reconciliation summary

Must support at least:

- pending count;
- pending amount;
- oldest pending age.

## 26.3 Audit/security summary

Must support at least:

- critical count;
- warning count;
- recent high-severity category;
- selected-period boundaries.

## 26.4 Tip reporting path

Must persist and aggregate tips end-to-end.

## 26.5 Gross Margin composition

Architecture must decide between:

- browser composition from Sales + Inventory reporting; or
- dedicated aggregate report contract.

Product outcome must remain identical.

---

# 27. Performance expectations

Dashboard V2 must feel like an executive control surface, not a collection of slow reports.

Product expectations:

- core Sales KPIs should become usable independently of slower secondary widgets;
- secondary widget failure must not block core KPIs;
- date-range changes must provide visible loading feedback;
- cached prior values may remain visible during refetch if clearly marked as updating;
- Dashboard should avoid unnecessary full-page loading resets.

Exact latency/SLO values belong in Architecture/Acceptance planning unless already established globally.

---

# 28. Accessibility requirements

Minimum:

- WCAG 2.1 AA;
- keyboard-accessible date/comparison controls;
- focus visibility;
- accessible chart alternatives;
- screen-reader labels for trend direction;
- color-independent severity signaling;
- `prefers-reduced-motion`;
- layout survives text scaling up to 200%;
- numeric meaning must be available in text, not only graphics.

---

# 29. Product acceptance scenarios

## AC-01 — Normal Régimen General sales day

Given:

- a synchronized Régimen General tenant;
- completed sales;
- discounts;
- COGS;
- no critical alerts;

Dashboard must show:

- Net Sales;
- Tickets;
- Average Ticket;
- Gross Margin;
- applicable fiscal KPI;
- Sales Trend;
- Hourly Sales;
- Top Products;
- Payment Mix;
- complete freshness state.

## AC-02 — Cuota Fija tenant

Given a tenant fiscal configuration where explicit IVA KPI is not meaningful:

Dashboard must:

- not render a meaningless `IVA C$0.00` executive card;
- show relevant business KPI in that slot;
- retain subtle fiscal context;
- avoid inferring unsupported tax conclusions.

## AC-03 — Discounts

Given known Net Sales and Discounts:

Dashboard must calculate:

`Pre-discount Sales = Net Sales + Discounts`

and:

`Discount Rate = Discounts / Pre-discount Sales`.

Fixture totals must reconcile.

## AC-04 — Zero-sales day

Given zero completed tickets:

Dashboard must:

- show Net Sales = C$0.00;
- Tickets = 0;
- Average Ticket = `—`;
- Gross Margin % = `—`;
- show no-sales state;
- suppress meaningless sales charts;
- continue showing relevant operational alerts.

## AC-05 — Period comparison

Given current Tuesday and previous Tuesday fixture data:

Dashboard must compare those periods by default for a single-day range.

When previous value is zero:

- no infinite percentage is shown.

## AC-06 — COGS / Margin

Given deterministic Sales and Inventory fixtures:

Dashboard Gross Margin must reconcile to:

`Net Sales - Sales COGS`.

Merma must remain separate.

## AC-07 — Partial Inventory sync

Given Sales complete and Inventory partial:

Dashboard must:

- keep valid Sales widgets visible;
- mark overall state PARTIAL;
- mark Gross Margin/COGS dependent widgets unavailable/partial;
- not substitute zeros.

## AC-08 — Stale complete sync

Given all streams were complete 20 minutes ago:

Dashboard must show STALE, not COMPLETE.

## AC-09 — Unknown sync

Given no completeness metadata:

Dashboard must show UNKNOWN.

It must not use `generatedAt` as a substitute.


## AC-09A — Quiet store with current sync checkpoint

Given:

- no new sales or inventory movements for 30 minutes;
- required stream checkpoints/heartbeats are current within 5 minutes;
- no pending outbox/sync work exists;

Dashboard must remain COMPLETE/current.

Lack of business activity alone must not produce STALE.

## AC-10 — Stock attention

Given inventory critical-count > 0:

Attention Required shows the stock condition with warning/critical semantics and links to Inventory.

## AC-11 — Fiscal sequence anomaly

Given `hasGaps = true`:

Attention Required exposes the anomaly and links to Fiscal sequence audit.

## AC-12 — Voids

Given voided transactions:

Attention Required displays count/amount without treating voids as sales.

## AC-13 — Pending reconciliation

After the summary contract exists, pending voucher count/amount appears in Attention Required and links to reconciliation.

## AC-14 — Tips after remediation

Given Restaurant/Hybrid mode and valid tip reporting:

- Tip Total is separate from Net Sales;
- Average Ticket excludes tips;
- Gross Margin excludes tips;
- participation/rate calculations reconcile to the sale-time TipEngine eligible base;
- Payment Mix reconciles to actual settlement totals including collected tip amounts where applicable.

## AC-15 — Tip-inapplicable tenant

Given tips disabled/not applicable:

No tip card is rendered.

## AC-16 — Widget API failure

Given Top Products fails but Sales Dashboard succeeds:

- core Dashboard remains usable;
- Top Products shows local failure state;
- no full-page crash occurs.

## AC-17 — Permission-limited Manager

Given a Manager can access sales reporting but lacks cost visibility:

- sales widgets render;
- COGS/Gross Margin widgets are omitted;
- no sensitive numeric values are leaked.

---

# 30. Release gates

Dashboard V2 cannot be approved for production until the following are satisfied.

## Gate A — KPI contract

- [ ] Net Sales semantics reconciled with real fixtures.
- [ ] Ticket Count semantics reconciled.
- [ ] Average Ticket reconciled.
- [ ] Discount Rate reconciled.
- [ ] COGS basis approved.
- [ ] Gross Margin approved.
- [ ] void/cancel handling verified.
- [ ] reporting timezone verified.

## Gate B — Fiscal profiles

- [ ] Régimen General fixture.
- [ ] Cuota Fija fixture.
- [ ] mixed/exempt fixture where supported.
- [ ] no unsupported tax assumption encoded in UI.

## Gate C — Freshness

- [ ] COMPLETE tested.
- [ ] STALE tested.
- [ ] PARTIAL tested.
- [ ] UNKNOWN tested.
- [ ] reconnect/catch-up tested.
- [ ] `generatedAt` no longer masquerades as sync freshness.

## Gate D — Owner-value widgets

- [ ] Sales Trend.
- [ ] Hourly Sales.
- [ ] Top Products.
- [ ] Payment Mix.
- [ ] COGS/Gross Margin.
- [ ] Merma.
- [ ] Stock alerts.
- [ ] Voids.
- [ ] Fiscal sequence anomaly.

## Gate E — Backend-remediation widgets

- [ ] reconciliation summary contract;
- [ ] audit/security summary contract;
- [ ] tip persistence/sync/reporting for any Restaurant/Hybrid profile declared production-ready under Dashboard V2.

## Gate F — Resilience and access

- [ ] tenant isolation proof for every new endpoint;
- [ ] Manager permission behavior;
- [ ] widget-level failures;
- [ ] zero/no-history states;
- [ ] tablet behavior;
- [ ] mobile read summary;
- [ ] accessibility baseline.

---

# 31. V2 priority contract

## P0 — required for trustworthy Dashboard V2

- KPI dictionary;
- reporting timezone;
- sales-label/formula correction;
- ticket count;
- average-ticket semantics;
- fiscal-regime composition;
- comparison semantics;
- Sales Trend;
- COGS/Gross Margin semantics;
- sync freshness/completeness;
- isolation preservation;
- correct no-data/partial-data behavior.

## P1 — required for full owner-value target

- Hourly Sales;
- Top Products;
- Payment Mix;
- Merma;
- Stock Attention;
- Voids;
- Fiscal sequence anomaly;
- pending reconciliation summary;
- audit/security summary;
- tip remediation and analytics for production-ready Restaurant/Hybrid profiles;
- business-profile composition;
- drill-down destinations.

## P2 — deferred

- cashier/waiter analytics;
- promotion attribution;
- loyalty analytics;
- product-margin/menu-engineering matrix;
- anomaly detection;
- multi-branch roll-up.

---

# 32. Product decisions fixed by this PRD

This PRD resolves the decision list from the verified Gap Audit as follows:

1. **Primary sales KPI:** Net Sales, post-discount, pre-tax, excluding tips and voids.
2. **Ticket Count:** finalized non-void business/fiscal tickets; split payments do not multiply count.
3. **Average Ticket:** Net Sales / Completed Tickets.
4. **Default comparison:** same weekday previous week for a single day; equal preceding range otherwise.
5. **Reporting timezone:** America/Managua / UTC-06:00.
6. **Discount denominator:** Pre-discount Sales.
7. **Tips:** always separate from sales; blocked until end-to-end reporting exists.
8. **COGS basis for margin:** Sales COGS (`salesCogsNio`), subject to deterministic historical-alignment acceptance.
9. **Merma:** displayed separately from Sales COGS; it does not reduce Dashboard Margen Bruto de Venta.
10. **Gross Margin:** Net Sales - Sales COGS; percentage over Net Sales.
11. **Fiscal rendering:** driven by fiscal configuration; no hardcoded regime inference.
12. **Business-mode profiles:** one Dashboard system with conditional composition.
13. **Freshness states:** COMPLETE / STALE / PARTIAL / UNKNOWN, based on stream completeness checkpoints/heartbeats, with a 5-minute V2 platform target.
14. **Attention severity:** Critical / Warning / Info.
15. **Empty/partial/unknown behavior:** explicit states; never substitute unknown with zero.
16. **Drill-down:** navigate to specialized module; no executive-page mutation.
17. **Default date preset:** Hoy; this supersedes the generic design-system 30-day example.
18. **Visibility:** OWNER full; MANAGER subject to existing granular report/cost permissions.
19. **Gross-margin endpoint strategy:** intentionally deferred to Architecture.
20. **Tip ownership/persistence strategy:** intentionally deferred to Architecture; Dashboard V2 requires sale-time semantics to remain reproducible and Restaurant/Hybrid GA requires the end-to-end reporting path.
21. **Reconciliation summary:** required product contract; endpoint shape deferred.
22. **Audit/security summary:** required product contract; endpoint shape deferred.

---

# 33. PRD audit decisions resolved

The closing PRD audit resolved the six remaining product questions:

1. **Freshness threshold:** keep **5 minutes** as the initial Dashboard V2 platform target, but measure it from a confirmed completeness checkpoint/heartbeat rather than the last business transaction. The value is centralized, not hardcoded per widget.
2. **Split-bill counting:** when split-bill produces multiple independently finalized sale/fiscal documents, each finalized document counts as one Completed Ticket. The originating table/order is not an extra ticket unless separately finalized.
3. **COGS basis:** use `salesCogsNio` as the Dashboard sales-cost basis for Margen Bruto de Venta, subject to deterministic timestamp-alignment acceptance.
4. **Merma:** keep `shrinkageCogsNio` outside Margen Bruto de Venta and display it separately as operational loss.
5. **Tips release scope:** tip reporting is mandatory before a Restaurant/Hybrid profile can be declared production-ready on Dashboard V2. It does not block QSR/Retail profiles where tips are inapplicable.
6. **Default date:** `Hoy` is the authoritative Dashboard default and supersedes the generic `Últimos 30 días` design-system example.

The audit also added three closure corrections:

- sales-revenue semantics must be consistent across KPI, trend, hourly and Top Products widgets;
- freshness age is based on sync completeness, so a quiet store does not become stale merely because no sale occurred;
- Payment Mix is a settlement view and, for Restaurant/Hybrid V2, must reconcile tip-inclusive money collected while tips remain excluded from Net Sales.

There are no remaining product questions blocking PRD approval.

---

# 34. Definition of Done for PRD approval

This PRD is promoted to:

> **Version 1.0 — APPROVED / AUTHORITATIVE PRODUCT CONTRACT FOR OWNER DASHBOARD V2**

Closure status:

- [x] all six former open product questions are resolved;
- [x] every P0 KPI has an unambiguous formula/behavior;
- [x] the current `Ventas Brutas` semantic mismatch is explicitly corrected by the Net Sales contract;
- [x] sales-revenue semantics are consistent across executive and analytical widgets;
- [x] fiscal rendering contains no unsupported legal/tax inference;
- [x] tips are classified as required backend/data remediation for Restaurant/Hybrid production readiness;
- [x] freshness behavior is defined around completeness checkpoints, not report-generation or transaction timestamps;
- [x] COGS/Margen Bruto de Venta and merma semantics are fixed;
- [x] P0/P1/P2 boundaries are accepted;
- [x] non-goals are accepted;
- [x] no implementation architecture has been prematurely fixed.

Any future change to the semantics in §§7–10, 18, 20–21 or 32 is a product-contract change and requires explicit PRD revision rather than an implementation-only decision.

---

# 35. Next artifact

After PRD approval, produce:

> `owner_dashboard_v2_architecture_spec.md`

The Architecture Spec should translate this product contract into:

- query/composition strategy;
- report DTO changes;
- new backend summary contracts;
- freshness persistence/state derivation;
- tip data-path remediation;
- frontend query/cache boundaries;
- partial-failure model;
- charting dependency decision;
- tenant/RLS enforcement;
- test strategy;
- migration strategy;
- backwards compatibility.

Only after the Architecture Spec is approved should NHILOS produce the Dashboard V2 execution roadmap.
