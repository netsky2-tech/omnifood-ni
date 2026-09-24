# NHILOS POS — Owner Dashboard V2 Architecture Specification

**Document:** `owner_dashboard_v2_architecture_spec.md`  
**Version:** 0.2  
**Status:** EVIDENCE-REFINED / TARGETED CODE VERIFICATION REQUIRED  
**Date:** 2026-09-23  
**Product authority:** `owner_dashboard_v2_prd_v1.0.md` — APPROVED / AUTHORITATIVE  
**Evidence authority:** `owner_dashboard_v2_gap_audit_v0.3.md` + `audit_evidence_pass.md`  
**Scope:** Backend reporting/read models, POS sync metadata, tip data path, owner-dashboard frontend composition, security, migrations, observability and tests required to implement Dashboard V2.  
**Non-authority:** This specification does not reopen product semantics fixed by the PRD.

**v0.2 evidence refinement:** The prior Dashboard evidence pass has been applied directly to this
architecture. Findings already proven by that audit are treated as fixed; unsupported implementation
details remain explicit gates rather than assumptions. This revision also hardens freshness so cloud
completeness is derived from server-observed sync acknowledgements, not self-reported client ACK state.

---

# 1. Purpose

This document translates the approved Dashboard V2 product contract into an implementable architecture.

It answers:

- where each KPI is calculated;
- which existing routes are reused;
- which DTOs require additive semantic fields;
- which new routes are required;
- how Net Sales semantics remain consistent across every widget;
- how Sales and Inventory remain separate bounded contexts while Gross Margin is composed safely;
- how Dashboard freshness is proven in an offline-first system;
- how voluntary tips become reportable without corrupting historical data;
- how partial failures remain isolated;
- how OWNER/MANAGER visibility is enforced server-side;
- how tenant isolation and PostgreSQL RLS are preserved;
- how migrations remain backward-compatible with older POS versions;
- how evidence is produced before the feature is accepted.

The architecture is deliberately incremental.

Dashboard V2 must reuse the existing reporting platform wherever the existing semantics are trustworthy and introduce new infrastructure only for capabilities that the evidence pass proved are genuinely missing.

---

# 2. Architectural context

## 2.1 Existing platform

Relevant deployed/application surfaces:

```text
┌───────────────────────────┐
│      Flutter POS          │
│ SQLite / offline-first    │
│ Outbox + cloud sync       │
└─────────────┬─────────────┘
              │ authenticated device sync
              ▼
┌───────────────────────────┐
│ NestJS admin_backend      │
│ PostgreSQL + RLS          │
│                           │
│ Sales                     │
│ Inventory                 │
│ Fiscal                    │
│ Identity / Audit          │
│ Onboarding / Settings     │
│ Sync                      │
└─────────────┬─────────────┘
              │ JWT / tenant-bound reporting APIs
              ▼
┌───────────────────────────┐
│ React Owner Dashboard     │
│ Vite + TypeScript         │
│ TanStack Query            │
│ Tailwind + shadcn/ui      │
└───────────────────────────┘
```

The current Dashboard calls a single sales summary endpoint, while hourly sales, top products and cashier performance already exist elsewhere in the owner application. Inventory reporting is independently exposed under `inventory/reports`.

## 2.2 Current verified gaps

True backend/data gaps:

- synchronization freshness/completeness;
- tip persistence and reporting;
- card reconciliation summary;
- audit/security executive summary;
- sales trend route;
- explicit Net Sales semantic fields where legacy DTO names are ambiguous.

Mostly frontend/composition gaps:

- regime-aware fiscal slot;
- comparisons;
- ticket count prominence;
- payment mix visualization;
- hourly sales;
- top products;
- COGS;
- merma;
- stock alerts;
- void summary;
- fiscal sequence anomaly;
- empty/partial/error states;
- drill-down.

---

# 3. Architecture principles

## AP-01 — Preserve bounded contexts

Dashboard is a composition surface, not a new business domain.

Sales continues to own:

- invoices;
- completed-ticket semantics;
- discounts;
- taxes;
- payments;
- tips;
- void reporting;
- card reconciliation.

Inventory continues to own:

- COGS;
- Kardex;
- shrinkage/merma;
- stock alerts.

Identity/Audit continues to own:

- audit events;
- authorization-sensitive security summaries.

Sync/Operations owns:

- device synchronization checkpoints;
- stream completeness;
- freshness state.

Onboarding/Fiscal Settings owns:

- fiscal regime/configuration.

Dashboard frontend composes those read models.

## AP-02 — No cross-domain Dashboard “god endpoint”

Dashboard V2 will **not** introduce one endpoint that synchronously aggregates Sales + Inventory + Fiscal + Audit + Sync.

A bounded-context-specific composition endpoint inside Sales remains an allowed future optimization if
profiling proves that several Sales widgets need one consistent snapshot or repeated scans become
materially expensive. That optimization must not pull Inventory/Audit/Sync ownership into Sales.

Rationale:

- preserves bounded-context ownership;
- preserves widget-level failure isolation;
- lets Sales remain usable if Inventory/Audit is degraded;
- avoids coupling unrelated query latencies;
- allows TanStack Query to cache and refetch independently;
- reduces blast radius of changes.

Cross-domain derived metrics such as Gross Margin are composed in the owner client from authoritative domain responses.

A future server-side materialized executive read model is allowed only if profiling later demonstrates a real scalability need. It is not part of V2 architecture.

## AP-03 — Product semantics override legacy field names

Legacy fields remain backward-compatible, but Dashboard V2 consumes new explicit semantic fields.

No existing field is silently redefined.

Example:

- `grossSales` keeps its existing meaning for legacy consumers;
- Dashboard V2 uses explicit `netSalesNio`.

## AP-04 — Business timestamps, not ingestion accidents

Reports must represent the business period in which the underlying sale or movement occurred.

A delayed sync must not move a Tuesday sale into Wednesday simply because cloud ingestion happened Wednesday.

## AP-05 — Unknown is not zero

Missing, partial or legacy-uncaptured information remains unknown/partial.

The architecture must never coerce unavailable tips, incomplete sync streams or failed Inventory reports into financial zeroes.

## AP-06 — Additive migration first

Cloud/POS migrations are additive and backward-compatible.

Older POS clients remain able to sync during rollout.

## AP-07 — Financial calculations use fixed precision

Authoritative database calculations use PostgreSQL `NUMERIC`.

Client-side derived calculations use decimal arithmetic, not raw IEEE-754 `number` math for financial formulas.

## AP-08 — Sync completeness is server-authoritative

A POS device may report what it has produced and what remains pending, but it cannot authoritatively
declare that the cloud received a sequence.

The cloud derives `acceptedThroughSequence` from its own successful, idempotent ingestion path.
Freshness compares that server-observed acknowledgement against the device's produced watermark.

A heartbeat is evidence of liveness and local queue state; it is not proof of cloud ingestion by itself.

---

# 4. Architecture decision summary

| ID | Decision |
|---|---|
| AD-01 | Dashboard data is composed client-side from bounded-context read APIs; no cross-domain god endpoint. |
| AD-02 | Existing Sales report DTOs are extended additively with explicit Net Sales semantics; legacy fields remain. |
| AD-03 | Introduce a dedicated Sales Trend route because no current route supports arbitrary bucketed trend data. |
| AD-04 | Introduce a shared backend `ReportingPeriod` resolver using America/Managua and half-open UTC query bounds. |
| AD-05 | Hourly Sales and Top Products must be reconciled to the same Net Sales semantics as the executive KPI. |
| AD-06 | Gross Margin is composed client-side from Sales Net Sales + Inventory `salesCogsNio`; no new gross-margin endpoint in V2. |
| AD-07 | Sale COGS range alignment is based on the originating sale business timestamp, not cloud ingestion timestamp. |
| AD-08 | Freshness uses authenticated per-device/per-stream produced watermarks plus **server-observed contiguous ingestion acknowledgements** and heartbeats. |
| AD-09 | Freshness is read from a new Operations/Sync endpoint; current `generatedAt` remains only report metadata and cannot participate in completeness derivation. |
| AD-10 | Tips are persisted as immutable sale-time snapshots; legacy records remain `NULL`/unknown rather than backfilled to zero. |
| AD-11 | Payment-level tip components are persisted so Payment Mix can reconcile actual money collected. |
| AD-12 | Add Sales reconciliation-summary and Audit executive-summary read endpoints; no new resolution workflow in Dashboard. |
| AD-13 | Recharts is adopted for Dashboard V2 charts and loaded lazily. |
| AD-14 | TanStack Query remains authoritative for server state; URL search params own date-range/comparison UI state. |
| AD-15 | Widget failures are isolated at query/component boundary; auth/tenant failures remain page-level. |
| AD-16 | New tables/routes receive explicit tenant predicates, RLS and real-PostgreSQL isolation tests. |

## 4.1 Evidence disposition inherited from the previous audit

Already verified and therefore **not reopened**:

- current Dashboard calls `GET /sales/reports/dashboard`;
- `grossSales` and `netTaxableSales` have different semantics and V2 requires explicit Net Sales naming;
- hourly-sales and top-products routes/hooks exist;
- Inventory COGS/alerts routes exist in a separate bounded context;
- fiscal regime is already readable from the existing fiscal-setup endpoint;
- freshness infrastructure does not exist today;
- tips are not persisted through invoice/payment/sync/reporting today;
- void and sequence summaries are already consumable;
- reconciliation summary and Audit executive summary do not exist;
- existing reviewed report routes are tenant-scoped with explicit predicates/RLS evidence;
- Recharts is not currently installed.

Still requiring **targeted code evidence**:

- exact persisted economic semantics of `invoice_items`;
- exact current Kardex source-reference fields in implemented entities;
- authoritative Device Sync registry/lifecycle shape;
- existence or absence of a monotonic Outbox cursor;
- authoritative cloud source for QSR/Restaurant/Hybrid mode;
- existing granular cost-view permission capability;
- persisted-vs-derived Audit severity;
- exact current payment amount semantics relative to tip.

---

# 5. Target logical architecture

```text
                            ┌──────────────────────────────┐
                            │  Owner Dashboard V2         │
                            │  React + TanStack Query      │
                            └──────────────┬───────────────┘
                                           │
                     independent query keys│
      ┌──────────────────────┬──────────────┼───────────────┬──────────────────┐
      ▼                      ▼              ▼               ▼                  ▼
┌──────────────┐      ┌─────────────┐ ┌────────────┐ ┌──────────────┐ ┌────────────────┐
│ Sales Reports│      │ Inventory   │ │ Fiscal /   │ │ Audit Summary │ │ Sync Freshness │
│              │      │ Reports     │ │ Settings   │ │              │ │                │
│ summary      │      │ COGS        │ │ regime     │ │ critical/warn│ │ stream states  │
│ trend        │      │ alerts      │ │ voids      │ │ latest class │ │ checkpoints    │
│ hourly       │      │ shrinkage   │ │ sequence   │ └──────────────┘ └────────────────┘
│ top products │      └─────────────┘ └────────────┘
│ payment mix  │
│ reconciliation
└──────┬───────┘
       │
       │ tip-enabled invoice/payment snapshots
       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ PostgreSQL                                                                  │
│ invoices / items / payments / inventory_kardex / audit / sync checkpoints │
│ explicit tenant predicates + RLS                                           │
└─────────────────────────────────────────────────────────────────────────────┘
       ▲
       │
       │ POS sales + inventory deltas + audit + sync checkpoint heartbeat
       │
┌──────┴──────────────────────────────────────────────────────────────────────┐
│ Flutter POS / SQLite / Outbox                                               │
│ sale-time tip snapshot + monotonic sync sequence/checkpoint metadata        │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

# 6. Shared reporting-period architecture

Dashboard V2 depends on identical **calendar boundary interpretation** across Sales and Inventory. The actual business timestamp used for each domain remains domain-owned and must map to the same selected local period.

## 6.1 `ReportingPeriod`

Introduce a shared backend value object/service in a common reporting package.

Logical contract:

```ts
type ReportingPeriod = {
  timezone: 'America/Managua';
  localStartDate: string;       // YYYY-MM-DD
  localEndDate: string;         // YYYY-MM-DD, inclusive to the user
  startInclusiveUtc: Date;
  endExclusiveUtc: Date;
};
```

Responsibilities:

- parse/validate user date inputs;
- interpret them as Managua calendar dates;
- return half-open UTC boundaries `[start, end)`;
- include the complete selected end date;
- reject inverted/invalid ranges;
- provide bucket helpers for hour/day/week/month when needed.

## 6.2 No duplicated date parsing

`SalesReportsService`, `InventoryReportsService`, Trend, Voids and Audit Summary must not each implement their own timezone/date-boundary parser.

Existing date helpers should be consolidated behind the shared resolver without breaking existing routes.

## 6.3 Comparison range

Comparison-range calculation remains a pure owner-client concern because current/previous ranges are queried independently.

Create a tested pure utility:

```text
features/dashboard/domain/comparison-period.ts
```

Rules mirror the PRD:

- day → previous same weekday;
- multi-day → immediately previous equal-duration range;
- MTD → same elapsed prior-month range;
- YTD → same elapsed prior-year range;
- clamp invalid calendar dates.

The result is serialized back as local `YYYY-MM-DD` ranges and the backend remains authority for conversion to UTC.

---

# 7. Shared Sales reporting semantics

A central Sales reporting semantic primitive is required so that KPI, trend, hourly and product reports cannot drift apart.

## 7.1 `SalesReportingSemantics`

Introduce/reuse one Sales-module service/helper responsible for:

- completed-sale predicate;
- tenant predicate;
- non-void predicate;
- Net Sales expression;
- Pre-discount Sales expression;
- ticket counting;
- tax totals;
- discount totals;
- average-ticket formula;
- canonical sale business timestamp.

Conceptual rules:

```text
completed sale     = finalized invoice AND not canceled/void
net sales          = SUM(invoice.subtotal) under approved historical semantics
pre-discount sales = net sales + discounts
ticket count       = COUNT(completed finalized sale documents)
average ticket     = net sales / ticket count
```

The implementation must use historical persisted invoice values, never current catalog/tax rules.

## 7.2 Current Sales Dashboard route

Keep:

`GET /sales/reports/dashboard?startDate=&endDate=`

Extend response **additively**:

```ts
interface SalesDashboardReportDto {
  // Legacy — retained
  grossSales: number;
  netTaxableSales: number;
  ticketAverage: number;
  invoiceCount: number;

  // V2 explicit semantics
  netSalesNio: number;
  preDiscountSalesNio: number;
  completedTicketCount: number;
  averageTicketNetNio: number | null;
  totalTaxNio: number;
  totalDiscountsNio: number;

  paymentMethodsBreakdown: PaymentMethodsBreakdownDto;
  reportingPeriod: ReportingPeriodMetadataDto;
  generatedAt: string;
}
```

Rules:

- no legacy field is removed or silently redefined;
- V2 frontend must not use `grossSales` as Net Sales;
- `averageTicketNetNio = null` when denominator is zero;
- money calculations are performed in PostgreSQL `NUMERIC`/backend decimal-safe logic before serialization.

## 7.3 Deprecation documentation

Mark legacy ambiguous fields in TypeScript/JSDoc as deprecated for new Dashboard work.

They remain until all known existing consumers migrate.

No removal belongs in Dashboard V2.

---

# 8. Sales Trend architecture

No current endpoint provides arbitrary time-bucket trend data.

Add:

`GET /sales/reports/trend`

Parameters:

```text
startDate=YYYY-MM-DD
endDate=YYYY-MM-DD
bucket=AUTO|HOUR|DAY|WEEK|MONTH
```

`AUTO` is preferred by Dashboard.

Response:

```ts
interface SalesTrendReportDto {
  reportingPeriod: ReportingPeriodMetadataDto;
  bucket: 'HOUR' | 'DAY' | 'WEEK' | 'MONTH';
  points: Array<{
    bucketStart: string;       // offset-aware/local presentation timestamp
    netSalesNio: number;
    completedTicketCount: number;
  }>;
  generatedAt: string;
}
```

## 8.1 Bucket strategy

Backend `AUTO`:

- one calendar day → HOUR;
- 2–60 days → DAY;
- >60 days → WEEK or MONTH based on point-count budget.

The frontend may request a specific supported bucket when required by UX.

## 8.2 Net Sales invariant

Trend uses exactly the same Sales reporting semantic primitive as the executive summary.

No independent `SUM(total)` logic is permitted.

## 8.3 Empty buckets

The API may return only occupied buckets.

The frontend fills missing calendar buckets with zero **only after the overall Sales stream is known complete**.

If Sales freshness is partial/unknown, the chart does not fabricate zeroes for missing buckets.

---

# 9. Hourly Sales normalization

Existing:

`GET /sales/reports/hourly-sales`

is reused.

Architecture requirement:

- route/service must use the shared completed-sale predicate;
- V2 must receive an explicit `netSalesNio` value per hour;
- if the legacy DTO currently exposes an ambiguously named sales amount, retain it and add the explicit field.

Example additive point:

```ts
{
  hour: 13,
  netSalesNio: 8250.50,
  completedTicketCount: 31,

  // legacy fields may remain
}
```

For multi-day ranges, Dashboard may aggregate an average/profile by hour in the client only if the endpoint semantics already represent the requested date range correctly. Otherwise backend grouping is preferred.

---

# 10. Top Products normalization

Existing:

`GET /sales/reports/top-products`

is reused only after Net Sales reconciliation.

## 10.1 Required response semantics

V2 product row:

```ts
interface TopProductV2Dto {
  productId: string;
  productName: string;
  quantity: number;
  netSalesNio: number;
  netSalesSharePct?: number; // may be client-derived
}
```

## 10.2 Discount allocation invariant

A product report must sum to Dashboard Net Sales for the same period, subject only to documented rounding.

Implementation precedence:

1. **Preferred:** use an existing persisted post-discount, pre-tax line subtotal if the current invoice-item model already stores it.
2. If invoice-level discounts remain unallocated, use deterministic proportional allocation.

Fallback allocation:

```text
allocatable base =
  post-line-discount, pre-tax line bases

invoice-level residual discount allocation =
  line base / total eligible line base × residual invoice discount
```

Requirements:

- calculations at minimum 4 decimal places;
- line-level result cannot be negative;
- rounding residue assigned deterministically to the largest eligible base, tie-broken by stable line ID;
- sum of allocated line net values must equal invoice Net Sales;
- modifiers/extras that belong to a product line remain part of that line's economic base;
- test with mixed taxable/exempt items before acceptance.

If current persisted invoice items already contain the authoritative final line net subtotal, this fallback is not used.

---

# 11. Payment Mix architecture

Payment Mix is settlement/cash-flow reporting, not Net Sales.

## 11.1 Current route

The existing dashboard payment breakdown may continue to supply the V2 base if its payment rows reconcile to completed invoices.

Extend naming additively where needed:

```ts
interface PaymentMethodsBreakdownV2Dto {
  cashNio: number;
  cashUsdOriginal: number;
  cashUsdAppliedNio: number;
  cardNio: number;
  cardUsdOriginal: number;
  cardUsdAppliedNio: number;
  otherNio: number;

  collectedTotalNio: number | null;
  settlementCoverage: 'COMPLETE' | 'PARTIAL' | 'LEGACY_UNKNOWN';
}
```

Exact field mapping should preserve existing DTO fields for current consumers.

## 11.2 Period rule

Payment Mix is selected by the **source completed invoice business period**, not the eventual cloud ingestion date.

## 11.3 Tips

Once tip data remediation is complete:

```text
payment collected total
= sale/tax amount applied by payment
+ payment.tipComponentNio
```

Invoice Net Sales remains tip-exclusive.

For historical periods with incomplete tip capture:

- `settlementCoverage` is not COMPLETE;
- the UI must not label the computed amount `Total cobrado`.

---

# 12. Gross Margin / Inventory composition

Architecture decision: **client composition**.

No new cross-domain gross-margin endpoint is introduced in V2.

## 12.1 Source queries

Sales:

`GET /sales/reports/dashboard`

Inventory:

`GET /inventory/reports/cogs?from=&to=`

Use:

- `sales.netSalesNio`;
- `inventory.salesCogsNio`;
- `inventory.shrinkageCogsNio`.

Client calculation:

```text
grossMarginAmount = netSalesNio - salesCogsNio
grossMarginPct =
  netSalesNio > 0
    ? grossMarginAmount / netSalesNio × 100
    : null
```

Use decimal arithmetic.

## 12.2 Why client composition

- Sales can render if Inventory fails;
- permissions can omit cost queries entirely;
- bounded contexts remain independent;
- current Inventory API already exposes the necessary aggregates;
- avoids introducing a Dashboard-only cross-domain data service prematurely.

## 12.3 Historical range alignment

The evidence pass identified a real alignment risk because Sales and COGS are currently anchored to different timestamp families.

V2 requirement:

> `salesCogsNio` must be attributed to the same originating sale business period used by Net Sales.

Preferred implementation:

- for `SALIDA_VENTA`/equivalent Kardex movements, join/filter using the stable source invoice/ticket identifier and the invoice business timestamp used by Sales reporting;
- shrinkage continues to use the merma/business movement timestamp;
- purchases/other movement types remain irrelevant to Sales COGS.

The Inventory domain documentation already requires a source-document identifier on Kardex movements,
so the architecture is aligned with the intended model. However, that does **not** prove the current
implemented entity/migration exposes the same stable sale reference.

If targeted code verification shows the implemented Kardex lacks a reliable sale reference,
implementation must stop and introduce an immutable `sourceBusinessAt`/source reference migration
before Gross Margin can be accepted.

Cloud insertion timestamp must not be used as the fallback because delayed offline sync would shift COGS into the wrong reporting period.

---

# 13. Fiscal regime composition

No new schema is required.

Reuse:

`GET /onboarding/fiscal-setup`

The Dashboard profile resolver consumes `regime` and any existing authoritative tax-presentation settings.

## 13.1 No duplicated regime state

Do not copy `regime` into a Dashboard table or browser-persisted tenant profile.

Cache the existing endpoint through TanStack Query.

## 13.2 Fiscal slot resolver

Frontend pure resolver:

```ts
resolveExecutiveSlot({
  operationMode,
  fiscalSetup,
  permissions,
  tipCoverage,
  dataAvailability
})
```

This decides whether the fifth KPI slot is:

- IVA/fiscal;
- COGS;
- Tips;
- another PRD-approved fallback.

Rendering logic must be deterministic and unit-tested.

---

# 14. Business-mode profile source

Dashboard must not maintain a second operation-mode setting.

Use the authoritative tenant operation-mode configuration already used by QSR/Restaurant/Hybrid behavior.

Architecture requirement:

- if the current cloud settings API already exposes it, reuse it;
- if not, add the existing value to an appropriate guarded Settings/Tenant read DTO;
- do not create a Dashboard-specific persisted profile.

The owner frontend derives presentation profile from:

```text
operation mode
+ fiscal regime
+ permissions
+ data capability/coverage
```

---

# 15. Card reconciliation summary

Add a read-only Sales reporting endpoint:

`GET /sales/reports/card-reconciliation-summary`

No new reconciliation write workflow is introduced.

Response:

```ts
interface CardReconciliationSummaryDto {
  pendingCount: number;
  pendingAmountNio: number;
  oldestPendingAt: string | null;
  generatedAt: string;
}
```

## 15.1 Scope

This summary is **outstanding-state scoped**, not date-range scoped.

Reason:

An unresolved voucher from yesterday remains operationally relevant today.

The Dashboard selected sales period must not hide unresolved reconciliation debt.

The UI labels this as current outstanding state, not as “for selected period”.

## 15.2 Query

Filter:

- tenant;
- card payments;
- reconciliation status = pending;
- non-deleted/non-invalid records according to current payment lifecycle.

Do not return:

- full card numbers;
- CVV;
- magnetic/chip data;
- unnecessary authorization payload.

## 15.3 Indexing

Verify an index equivalent to:

```text
(tenant_id, reconciliation_status, created_at)
```

If an adequate current index exists, reuse it.

---

# 16. Audit/security executive summary

Add a read-only endpoint under the existing Audit/Identity reporting surface, for example:

`GET /identity/audit/summary?startDate=&endDate=`

The final route should follow current module naming conventions.

Response:

```ts
interface AuditExecutiveSummaryDto {
  criticalCount: number;
  warningCount: number;
  latestHighSeverity: {
    occurredAt: string;
    category: string;
    severity: 'CRITICAL' | 'WARNING';
  } | null;
  generatedAt: string;
}
```

## 16.1 No raw forensic payload

The executive endpoint does not return before/after payload bodies or sensitive event details.

Drill-down routes to the existing Audit surface.

## 16.2 Severity source

The Audit PRD already defines the product taxonomy `CRITICAL / WARNING / INFO`, so the V2 summary must
reuse that taxonomy.

What remains unproven is **storage shape**.

Implementation gate:

- if severity is currently persisted as a stable field, aggregate it;
- otherwise centralize the existing event-type → risk-level classification in one `AuditRiskClassifier`
  and use it both for raw audit display and summary.

Do not maintain two independent severity maps.

## 16.3 Period

Audit executive summary follows the selected Dashboard reporting period.

---

# 17. Freshness architecture

Freshness is a new cross-cutting operational capability.

It must answer:

> Has the cloud received and acknowledged everything the active POS devices say should exist for each stream?

It must **not** infer freshness from the timestamp of the last sale.

## 17.1 Logical streams

Minimum Dashboard logical streams:

- `SALES`
- `INVENTORY`
- `AUDIT`

Tips ride the `SALES` transport/reporting stream after tip remediation unless the actual sync implementation proves they use an independent transport stream.

Fiscal void/sequence reporting depends on `SALES`.

Payment/reconciliation reporting depends on `SALES`.

Configuration/fiscal setup is cloud-authoritative and is not treated as a POS sync stream.

## 17.2 Device set

Tenant-level completeness is the worst state across all **active sync-participating devices**.

Do not build a second device registry for Dashboard.

Use the existing authoritative Device Sync provisioning/credential registry.

Rules:

- active provisioned device → participates;
- explicitly deactivated/revoked device → excluded;
- no time-based automatic exclusion merely because a device stopped heartbeating;
- reprovisioning must create a new device identity/generation rather than resetting monotonic sequence under the same identity;
- the authoritative registry must expose an explicit active/revoked/deactivated lifecycle; absence of heartbeat alone never deactivates a device.

## 17.3 POS monotonic stream sequence

Each outbound logical stream requires a stable monotonic local sequence.

Conceptual local outbox metadata:

```text
stream
localSequence BIGINT
eventId UUID
businessOccurredAt
syncState
```

The existing product documentation describes Outbox/client-timestamp ordering, but the prior evidence
pass did not prove a monotonic cursor exists. A timestamp is insufficient as a completeness cursor.

Therefore V2 planning assumes a local stream-sequence migration is required **unless targeted code
verification proves an equivalent monotonic cursor already exists**.

## 17.4 Server-observed sync acknowledgement

Every outbound V2 sync item for a freshness-tracked stream carries:

```ts
interface SyncSequencedEnvelope {
  stream: 'SALES' | 'INVENTORY' | 'AUDIT';
  streamSequence: number;
  eventId: string;
  businessOccurredAt: string;
  // existing domain payload follows
}
```

The server updates stream ingestion state **only after** the corresponding event is accepted
idempotently by the authoritative sync/domain ingestion path.

Server-owned state:

```text
acceptedThroughSequence
```

means the highest **contiguous** sequence known to be durably accepted.

Rules:

- duplicate `eventId` / already accepted sequence remains idempotent;
- `sequence == acceptedThrough + 1` can advance the contiguous watermark;
- a forward gap cannot be treated as complete merely because a higher sequence arrived;
- a lower/replayed sequence cannot regress state.

If the current sync architecture can guarantee strict ordered delivery and retry, the implementation
may avoid a separate received-gap table. If it permits out-of-order acceptance, the backend needs
enough sparse-receipt state to close gaps before advancing `acceptedThroughSequence`.

## 17.5 Device checkpoint / heartbeat protocol

Add an authenticated lightweight device endpoint:

`POST /v1/sync/checkpoint`

Authentication:

- Device Sync credential;
- tenant and device identity derived from the credential;
- client cannot supply/override tenant authority.

Payload:

```ts
interface DeviceSyncCheckpointRequest {
  protocolVersion: 1;
  streams: Array<{
    stream: 'SALES' | 'INVENTORY' | 'AUDIT';
    producedSequence: number;
    pendingCount: number;
    oldestPendingBusinessAt?: string | null;
    lastProducedBusinessAt?: string | null;
  }>;
  clientObservedAt?: string; // diagnostic only, never freshness authority
}
```

The device does **not** authoritatively report `acknowledgedSequence`.

The server combines this produced watermark with its own `acceptedThroughSequence`.

## 17.6 Validation and completeness assertion

For each stream:

```text
producedSequence >= 0
pendingCount >= 0
producedSequence does not regress for the same device generation
acceptedThroughSequence is server-owned
```

A device-stream can assert complete only when:

```text
pendingCount == 0
AND acceptedThroughSequence == producedSequence
AND checkpoint/heartbeat is trusted and current
```

If:

```text
acceptedThroughSequence < producedSequence
```

the stream is incomplete regardless of what the client believes.

If the client reports `pendingCount > 0` while `acceptedThroughSequence == producedSequence`,
treat the state as INCOMPLETE/contradictory and emit an operational metric rather than COMPLETE.

## 17.7 Checkpoint persistence

New cloud hot-state table, logical name:

`device_sync_stream_checkpoints`

Recommended columns:

```text
id UUID PK
tenant_id UUID NOT NULL
device_id UUID/VARCHAR NOT NULL
device_generation UUID/VARCHAR NOT NULL
stream VARCHAR NOT NULL

produced_sequence BIGINT NOT NULL
accepted_through_sequence BIGINT NOT NULL
pending_count INTEGER NOT NULL

oldest_pending_business_at TIMESTAMPTZ NULL
last_produced_business_at TIMESTAMPTZ NULL

server_received_at TIMESTAMPTZ NOT NULL
protocol_version SMALLINT NOT NULL

created_at TIMESTAMPTZ NOT NULL
updated_at TIMESTAMPTZ NOT NULL
```

Unique:

```text
(tenant_id, device_id, device_generation, stream)
```

Add RLS by `tenant_id`.

`accepted_through_sequence` is mutated by successful sync ingestion, not trusted from heartbeat input.

No historical heartbeat log is required for V2 correctness; operational metrics/logging provide
history. If later SLA analytics require heartbeat history, add it separately rather than bloating
the hot-state table.

## 17.8 Quiet-store correctness

Freshness age is:

```text
now(server) - server_received_at of confirmed checkpoint
```

not:

```text
now - last sale time
```

Thus:

- zero activity + current empty-outbox heartbeat = current;
- no heartbeat for >5m + previously complete = stale;
- fresh heartbeat with pending events = incomplete/partial.

## 17.9 Device cadence

While online and authenticated:

- send checkpoint after a successful sync cycle;
- also send a lightweight heartbeat/checkpoint on an interval shorter than the 5-minute freshness target;
- recommended operational cadence: approximately 2 minutes while the app is active/operational.

This is not a business-data poll and carries no sale payload.

## 17.10 Server stream state

Per tenant/device/stream derive:

```text
CURRENT
  checkpoint fresh <= 5m
  AND pendingCount == 0
  AND acceptedThroughSequence == producedSequence

STALE
  checkpoint older than 5m
  AND last checkpoint asserted complete

INCOMPLETE
  checkpoint trusted
  BUT pendingCount > 0 OR ack < produced

UNKNOWN
  no trusted checkpoint
  OR inconsistent/corrupt metadata
```

## 17.11 Tenant Dashboard state

Aggregate all required streams/devices:

```text
COMPLETE
  all required device-stream states CURRENT

STALE
  all are provably complete (CURRENT or STALE)
  AND at least one is STALE

PARTIAL
  at least one required state is INCOMPLETE or UNKNOWN
  AND at least one other required state is usable/trustworthy

UNKNOWN
  no required stream has trustworthy completeness
  OR metadata is globally contradictory
```

A widget can still render if **its own dependency streams** are trustworthy.

Example:

```text
SALES CURRENT
INVENTORY INCOMPLETE
AUDIT CURRENT

Overall = PARTIAL
Sales KPIs = usable
Gross Margin = unavailable/partial
Stock alerts = unavailable/partial
Audit summary = usable
```

## 17.12 Freshness read endpoint

Add an owner-facing operational endpoint:

`GET /operations/sync/freshness`

Guards:

- normal browser AuthGuard;
- OWNER/MANAGER according to report access policy;
- tenant derived from verified JWT.

Response:

```ts
interface DashboardFreshnessDto {
  overall: 'COMPLETE' | 'STALE' | 'PARTIAL' | 'UNKNOWN';
  thresholdSeconds: number; // 300
  completeThrough: string | null;
  streams: Array<{
    stream: 'SALES' | 'INVENTORY' | 'AUDIT';
    state: 'CURRENT' | 'STALE' | 'INCOMPLETE' | 'UNKNOWN';
    completeThrough: string | null;
    oldestCheckpointAt: string | null;
    pendingCount: number | null;
    affectedDeviceCount: number;
  }>;
  generatedAt: string;
}
```

`completeThrough` for a COMPLETE tenant is conservatively the oldest required confirmed checkpoint timestamp across active devices/streams.

For PARTIAL state, do not emit one misleading global complete-through time; use per-stream metadata.

---

# 18. Voluntary tip data-path remediation

Tips are required for Restaurant/Hybrid production readiness.

The architecture must preserve sale-time meaning and distinguish legacy unknown data from explicit zero tips.

## 18.1 Core rule

Never backfill historical missing tip data to `0`.

`NULL` means:

> this sale predates trustworthy tip capture or arrived through a legacy sync contract.

`0` means:

> tip capture was supported and the sale explicitly had no tip.

## 18.2 POS local sale snapshot

Add/reuse immutable sale-level fields:

```text
tipAmountNio            NUMERIC(14,4) NULL for legacy, explicit >=0 for V2
tipEligibleBaseNio      NUMERIC(14,4) NULL for legacy
tipDataVersion          SMALLINT NULL for legacy, 1 for V2
```

Persist at finalization/checkout.

Do not recompute old values from current catalog/tax rules.

If the existing local sale entity uses different naming, map to its conventions; semantics are authoritative.

## 18.3 Payment tip allocation

The prior evidence pass proves current Payment/reporting models have no tip field, but it does **not**
prove whether today's generic payment amount already includes or excludes the locally collected tip.
Architecture must therefore avoid deriving historical `Total cobrado` from current Payment rows until
AG-08 maps the implemented semantics.

For V2-captured sales, each payment must explicitly preserve its tip component.

Logical fields:

```text
tipComponentOriginal    NUMERIC(...) NULL
tipComponentNio         NUMERIC(14,4) NULL
```

The existing payment currency identifies the original currency.

Invariant for V2-captured sale:

```text
SUM(payment.tipComponentNio)
= invoice.tipAmountNio
within approved rounding tolerance
```

For a single payment, the complete tip component belongs to that payment.

For split payments, the POS allocates the actual tip portion across payment records according to the checkout allocation flow; the cloud must receive the resulting immutable allocation rather than guessing later.

## 18.4 Cloud persistence

Add nullable fields to `invoices` and `payments` matching the logical snapshots.

Migration rules:

- existing rows remain NULL;
- no historical backfill to zero;
- new v2-capable POS payload explicitly sends zero where no tip applies;
- columns remain nullable during backward-compatibility window.

## 18.5 Sync DTO

Extend `SyncInvoiceDto` additively:

```ts
tipAmountNio?: number | null;
tipEligibleBaseNio?: number | null;
tipDataVersion?: number | null;
```

Extend payment sync items:

```ts
tipComponentOriginal?: number | null;
tipComponentNio?: number | null;
```

Legacy payload missing fields → persist `NULL`, not `0`.

## 18.6 Server validation

For V2 records:

- tip amount >= 0;
- eligible base >= 0;
- payment tip components >= 0;
- payment component sum reconciles to invoice tip within decimal rounding tolerance;
- invoice/payment tenant and ticket relationships remain valid;
- sync idempotency remains based on existing transaction identity, not tip fields.

A validation failure rejects the malformed sync item according to existing batch semantics; it must not silently discard only the tip while accepting a financially inconsistent sale.

## 18.7 Tip reporting coverage

Add tip metrics to Sales reporting only with explicit coverage metadata:

```ts
interface TipReportCoverageDto {
  state: 'COMPLETE' | 'PARTIAL' | 'NONE';
  capturedTicketCount: number;
  eligibleTicketCount: number;
  coverageStart?: string | null;
}
```

Summary fields:

```ts
totalTipsNio: number | null;
tippedTicketCount: number | null;
averageTipNio: number | null;
tipEligibleBaseNio: number | null;
tipRatePct: number | null;
tipCoverage: TipReportCoverageDto;
```

Rules:

- COMPLETE only if every applicable completed ticket in range has trustworthy V2 tip capture;
- PARTIAL if mixed legacy/new;
- NONE if no applicable trustworthy data;
- Dashboard does not interpret PARTIAL/NONE as zero.

## 18.8 Void/cancellation

A voided/canceled invoice does not contribute:

- Net Sales;
- tip KPIs;
- completed-ticket denominator.

If current business flow requires a reversal transaction for a previously settled tip, reporting must follow the authoritative cancellation/reversal state rather than mutating historical tip snapshot values.

---

# 19. Frontend composition architecture

## 19.1 Server state

TanStack Query v5 remains the only server-state cache.

Do not mirror API responses into Zustand.

## 19.2 URL state

Date range and optional comparison controls are encoded in URL search params.

Benefits:

- refresh-safe;
- browser back/forward;
- shareable support/debug links;
- no duplicated global state.

Example conceptual URL:

```text
/dashboard?range=today
/dashboard?start=2026-09-01&end=2026-09-23
```

The comparison range is derived deterministically rather than persisted unless a future custom-comparison UX is added.

## 19.3 Query-key policy

Every Dashboard query key includes:

- tenant context;
- endpoint/domain;
- selected reporting range when period-bound;
- any bucket/limit parameter.

Examples:

```text
['dashboard','sales-summary',tenant,start,end]
['dashboard','sales-trend',tenant,start,end,bucket]
['dashboard','cogs',tenant,start,end]
['dashboard','stock-alerts',tenant]
['dashboard','freshness',tenant]
```

Current-state operational queries such as stock alerts, reconciliation and freshness do not inherit the sales range unless their underlying product semantics are period-bound.

## 19.4 Parallelism

Queries are started independently.

Do not use a page-level `Promise.all` that turns one widget failure into a complete Dashboard failure.

Suggested query groups:

### Core
- Sales summary current;
- Sales summary comparison;
- fiscal setup/profile;
- freshness.

### Sales analytics
- trend current;
- trend comparison;
- hourly;
- top products.

### Cost
- COGS current;
- COGS comparison if Gross Margin trend is displayed;
- inventory alerts.

### Attention
- void summary;
- sequence audit;
- reconciliation summary;
- audit summary.

## 19.5 Conditional queries

Do not request data the user cannot see.

Examples:

- Manager lacks cost permission → do not call COGS;
- profile does not support tips → do not call/render tip fields beyond existing summary;
- Audit widget not permitted → query disabled.

## 19.6 Derived ViewModel layer

Components do not contain financial formulas.

Create pure dashboard-domain selectors, for example:

```text
features/dashboard/domain/
  comparison-period.ts
  dashboard-profile.ts
  dashboard-metrics.ts
  dashboard-freshness.ts
  attention-items.ts
```

`dashboard-metrics.ts` owns client-side formulas:

- Gross Margin;
- Gross Margin %;
- comparison deltas;
- discount rate;
- shares/percentages.

## 19.7 Decimal arithmetic

Use the existing project decimal utility if one is already standardized.

If none exists, add a small fixed-precision library such as `decimal.js-light` for Dashboard-derived financial arithmetic.

Do not calculate margin/discount percentages using uncontrolled binary floating point and then rely on display rounding to hide errors.

---

# 20. Charting architecture

Adopt `recharts`, consistent with the existing backoffice design-system specification.

## 20.1 Loading

Chart components are lazy-loaded from the Dashboard feature bundle.

Do not force Recharts into the initial authentication/shell bundle.

## 20.2 Components

Suggested wrappers:

```text
SalesTrendChart
HourlySalesChart
PaymentMixChart
TopProductsChart/List
```

Wrap Recharts behind NHILOS components so future chart-library changes do not leak through the feature.

## 20.3 Accessibility

Every chart wrapper provides:

- visible textual headline/summary;
- accessible labels;
- tooltip values;
- non-color direction/state indicators;
- reduced-motion behavior;
- empty-state fallback.

Charts are supplemental representations of numeric values, not the sole carrier of meaning.

---

# 21. Failure isolation model

## 21.1 Failure classes

### Global/fatal

- unauthorized/expired session;
- unresolved tenant context;
- server explicitly reports tenant mismatch.

Result:

- existing global auth/tenant failure behavior.

### Core Sales failure

If Sales summary fails:

- Executive KPI strip enters error state;
- Sales-dependent charts enter error/unavailable;
- independent operational widgets may remain visible if safe.

### Inventory failure

- Sales remains;
- COGS/Gross Margin/Merma/stock-dependent widgets fail locally.

### Audit failure

- Attention panel shows Audit subsection unavailable;
- other alerts remain.

### Freshness failure

Freshness becomes UNKNOWN.

Do not hide the failure and pretend COMPLETE.

## 21.2 Stale cache during refetch

TanStack Query may keep previous valid data visible during refetch.

UI requirements:

- mark as `Actualizando…`;
- never combine old current-range data with a new range label without an updating indicator;
- derived metrics update atomically only when all required inputs for that derived metric correspond to the same query range.

## 21.3 Error boundaries

Use widget/section error boundaries for rendering faults in addition to query error states.

---

# 22. Attention Required composition

Attention Required is a frontend composition of independent domain summaries.

## 22.1 Scope classes

### Current-state alerts
Not filtered by selected sales date:

- stock alerts;
- pending reconciliation;
- sync freshness.

### Selected-period alerts
Follow selected Dashboard range:

- voids;
- audit/security counts;
- period-specific fiscal sequence inspection where supported.

Each card/subitem must communicate its scope to avoid implying that outstanding reconciliation is “today-only”.

## 22.2 Normalization

Convert domain responses to:

```ts
interface AttentionItem {
  id: string;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  source: 'SYNC' | 'INVENTORY' | 'PAYMENTS' | 'FISCAL' | 'AUDIT';
  title: string;
  detail?: string;
  count?: number;
  amountNio?: number;
  occurredAt?: string;
  href: string;
}
```

## 22.3 Ordering

Stable order:

1. Critical;
2. Warning;
3. Info.

Within equal severity:

- newest/highest operational relevance first using explicit source ordering;
- no machine-learning/risk score in V2.

---

# 23. Permissions architecture

UI hiding is not authorization.

## 23.1 Sales

Use existing OWNER/MANAGER reporting guards.

## 23.2 Cost visibility

COGS/Gross Margin requires server-side cost-report permission.

The previous evidence pass proved the reviewed reporting routes are currently guarded by role/tenant
controls, but it did **not** prove a cost-specific report permission is enforced.

Implementation gate:

- verify whether the existing granular permission matrix already contains an appropriate cost visibility capability;
- reuse it if present and bind `inventory/reports/cogs` to it;
- otherwise add one capability to the existing permission system rather than inventing a Dashboard-only role.

Suggested semantic capability name (adapt to existing conventions):

`VIEW_INVENTORY_COSTS`

OWNER has it by default.

MANAGER follows tenant permission configuration.

The `inventory/reports/cogs` route must enforce the capability server-side.

## 23.3 Audit/security

Audit summary follows existing audit-view permission policy.

## 23.4 Frontend

Permission context controls query `enabled` and widget composition, but backend remains authoritative.

---

# 24. Tenant isolation and RLS

Every new cloud table and route is tenant-bound.

## 24.1 Browser routes

New browser-facing routes use:

- `AuthGuard`;
- `RolesGuard`/granular permission guard as applicable;
- `TenantInterceptor`;
- `@GetTenantId()`;
- explicit tenant predicate.

## 24.2 Device checkpoint route

`POST /v1/sync/checkpoint` uses device authentication.

Rules:

- tenant derived from verified device credential;
- device identity derived from verified credential/provisioning;
- ignore/reject any client-provided tenant identifier;
- checkpoint upsert predicate includes tenant + device + stream.

## 24.3 RLS

New `device_sync_stream_checkpoints` table:

- RLS enabled;
- application DB role does not bypass RLS;
- tenant policy uses transaction-bound `app.tenant_id` or the established equivalent.

## 24.4 Tests

Real PostgreSQL two-tenant tests are mandatory for:

- freshness read;
- checkpoint writes;
- reconciliation summary;
- audit summary;
- tip reporting after migration.

A valid Tenant A credential/JWT must never see Tenant B rows or aggregates.

---

# 25. Database migration strategy

## 25.1 Migration group A — Sync freshness

Cloud:

- create `device_sync_stream_checkpoints`;
- add unique/indexes;
- enable RLS/policy.

POS:

- add local monotonic stream sequence only if current Outbox lacks an equivalent;
- no sale/inventory business record rewrite.

Initial state:

- no backfill;
- tenant freshness = UNKNOWN until active devices submit trusted checkpoints.

## 25.2 Migration group B — Tips

Cloud invoice:

- nullable tip amount;
- nullable eligible base;
- nullable tip data version.

Cloud payment:

- nullable original tip component;
- nullable NIO tip component.

POS sale/payment:

- additive equivalent local fields.

Backfill:

- none;
- existing rows remain NULL.

## 25.3 Migration group C — Indexes

Only add indexes justified by verified query plans.

Candidates:

- reconciliation `(tenant_id, reconciliation_status, created_at)`;
- checkpoint unique + `(tenant_id, stream, server_received_at)`;
- audit `(tenant_id, severity/event_type, created_at)` where the current schema supports it.

Do not add speculative wide indexes before `EXPLAIN ANALYZE` evidence.

## 25.4 Reversibility

Schema down migrations may remove newly added nullable columns/tables only before dependent production data becomes authoritative.

Once new tip records/checkpoints are live production evidence, rollback strategy is application rollback with preserved data, not destructive down-migration.

---

# 26. Backward compatibility

## 26.1 Old owner frontend

Legacy fields/routes remain valid.

## 26.2 Old POS

Older clients omit new tip/checkpoint fields.

Backend behavior:

- old sales continue syncing;
- tip fields persist NULL;
- a legacy device that cannot emit V2 stream watermarks prevents its dependent streams from being
  declared COMPLETE;
- do not reject legacy sync solely because tip/checkpoint fields are absent during compatibility window.

## 26.3 Restaurant/Hybrid release gate

A Restaurant/Hybrid tenant cannot be declared Dashboard V2 production-ready until all active sales devices support the tip/reporting and checkpoint protocols required by the PRD.

QSR/Retail tenants may proceed without tip support where tips are inapplicable, but freshness support remains P0.

## 26.4 Additive DTO evolution

No existing report field is removed in V2.

New explicit semantic fields are additive.

---

# 27. Observability

## 27.1 Backend metrics

Track per route:

- request count;
- error count;
- p50/p95 latency;
- DB query duration where available.

Dashboard-specific:

- freshness overall state distribution;
- checkpoint age by stream;
- rejected checkpoint count/reason;
- devices with no checkpoint;
- tip coverage state;
- reconciliation pending count;
- audit-summary failures.

## 27.2 Privacy

Do not log:

- full invoice payloads;
- tokens;
- PINs/TOTP;
- full card data;
- raw sensitive audit payloads.

Use privacy-safe tenant/device pseudonyms in operational logs.

## 27.3 Frontend telemetry

Capture:

- widget query failures by widget/error class;
- full-page Dashboard failures;
- chart render errors;
- unknown/partial freshness exposure counts.

Do not transmit sensitive financial row-level data merely for frontend telemetry.

---

# 28. Performance architecture

## 28.1 Query independence

Core Sales summary should not wait for:

- COGS;
- Audit;
- Inventory alerts;
- reconciliation.

## 28.2 Refetch cadence

Recommended:

### Business report queries
- `staleTime`: approximately 2 minutes where current behavior already uses it;
- background refetch: 5 minutes;
- refetch on explicit date change/manual refresh.

### Freshness metadata
- poll more frequently than full business reports, e.g. ~60 seconds;
- client can age the returned checkpoint locally between polls.

This does not refresh full financial reports every minute.

## 28.3 Request deduplication

TanStack Query keys ensure shared Sales/Inventory hooks do not duplicate identical requests within the app.

## 28.4 DB query budgets

Before GA, profile:

- 1 day;
- 30 days;
- year-to-date;
- high-volume tenant fixture.

Trend aggregation must be performed in SQL/backend grouping, not by shipping invoice rows to the browser.

---

# 29. Recommended code organization

Names are architectural guidance and may adapt to existing repository conventions.

## 29.1 Backend

```text
apps/admin_backend/src/
├── common/
│   └── reporting/
│       ├── reporting-period.ts
│       └── reporting-period.spec.ts
│
├── modules/sales/
│   ├── controllers/reports.controller.ts
│   ├── services/
│   │   ├── sales-reports.service.ts
│   │   ├── sales-reporting-semantics.service.ts
│   │   └── card-reconciliation-report.service.ts
│   └── dto/
│       ├── sales-reports.dto.ts
│       └── sales-trend.dto.ts
│
├── modules/inventory/
│   └── services/inventory-reports.service.ts
│
├── modules/sync/
│   ├── controllers/
│   │   ├── sync-checkpoint.controller.ts
│   │   └── sync-freshness.controller.ts
│   ├── entities/device-sync-stream-checkpoint.entity.ts
│   ├── services/sync-checkpoint.service.ts
│   └── dto/
│       ├── sync-checkpoint.dto.ts
│       └── sync-freshness.dto.ts
│
└── modules/identity-or-audit/
    └── audit-summary reporting extension
```

The actual Audit module location must follow the current codebase rather than creating a duplicate module.

## 29.2 Owner frontend

```text
apps/owner_dashboard/src/features/dashboard/
├── api/
│   ├── use-dashboard-sales.ts
│   ├── use-dashboard-trend.ts
│   ├── use-dashboard-inventory.ts
│   ├── use-dashboard-attention.ts
│   └── use-dashboard-freshness.ts
│
├── components/
│   ├── executive-kpi-grid.tsx
│   ├── sales-trend-chart.tsx
│   ├── hourly-sales-chart.tsx
│   ├── top-products.tsx
│   ├── payment-mix.tsx
│   ├── profitability-card.tsx
│   ├── attention-required.tsx
│   └── freshness-banner.tsx
│
├── domain/
│   ├── comparison-period.ts
│   ├── dashboard-metrics.ts
│   ├── dashboard-profile.ts
│   ├── dashboard-freshness.ts
│   └── attention-items.ts
│
└── pages/
    └── dashboard-page.tsx
```

---

# 30. Test strategy

## 30.1 Backend unit tests

### Reporting period
- Managua local-day boundaries;
- inclusive user end date → exclusive UTC boundary;
- leap day;
- month-end clamping.

### Sales semantics
- Net Sales excludes tax;
- discounts;
- canceled invoice;
- zero ticket;
- split-payment does not multiply ticket count.

### Trend
- bucket boundaries;
- zero/occupied bucket behavior;
- same totals as summary.

### Product allocation
- invoice-level discount allocation;
- rounding residue;
- modifiers;
- mixed line bases;
- grouped product totals sum to Net Sales.

### Freshness reducer
- CURRENT;
- STALE;
- INCOMPLETE;
- UNKNOWN;
- multi-device worst-state;
- quiet store heartbeat.

### Tip validation
- explicit zero;
- legacy NULL;
- payment allocation sum;
- invalid negative values;
- partial coverage.

## 30.2 PostgreSQL integration tests

Use real PostgreSQL for:

- RLS;
- numeric aggregation;
- timezone grouping;
- sales/inventory historical alignment;
- reconciliation summary;
- audit summary;
- checkpoint upsert monotonicity.

Two tenants in the same test DB are mandatory.

## 30.3 POS tests

- new sale writes explicit tip snapshot;
- zero-tip sale writes explicit `0`, not NULL;
- migrated historical sale remains NULL;
- split-payment tip components reconcile;
- sync DTO preserves fields;
- old/legacy payload remains accepted;
- checkpoint heartbeat with empty outbox;
- pending outbox produces INCOMPLETE state;
- monotonic stream sequence survives app restart.

## 30.4 Frontend unit/component tests

- Dashboard profile resolution;
- Cuota Fija hides inappropriate IVA card;
- Manager cost permission hides cost widgets and disables query;
- comparison zero denominator;
- Gross Margin decimal math;
- PARTIAL stream disables only dependent widgets;
- stale/unknown copy;
- widget failure isolation;
- no-sales state;
- chart accessibility fallback.

## 30.5 E2E acceptance fixture

One deterministic fixture should reconcile:

```text
invoice totals
discounts
tax
payments
tips
invoice items
inventory sale movements
merma
voids
reconciliation status
audit events
sync checkpoint state
```

Expected Dashboard totals are committed with the fixture.

This fixture becomes the primary regression artifact for the V2 KPI contract.

---

# 31. Acceptance evidence matrix

| PRD requirement | Architecture evidence |
|---|---|
| Net Sales | Shared Sales semantics + additive DTO + fixture |
| Tickets | Completed-sale predicate |
| Average Ticket | Backend explicit field / fixture |
| Comparison | Pure comparison-period tests + two queries |
| Fiscal profile | Existing fiscal-setup query + profile resolver |
| Sales Trend | New trend endpoint |
| Hourly | Existing route normalized to Net Sales |
| Top Products | Existing route + deterministic net allocation |
| Payment Mix | Settlement DTO + tip coverage |
| Gross Margin | Sales + Inventory composition + aligned business timestamp |
| Merma | Existing shrinkage aggregate |
| Stock alerts | Existing endpoint |
| Voids | Existing endpoint |
| Sequence anomaly | Existing endpoint |
| Reconciliation | New summary endpoint |
| Audit/security | New executive summary |
| Freshness | New device checkpoint persistence/protocol/read endpoint |
| Tips | POS/cloud nullable snapshot + sync + coverage |
| Partial failure | Independent TanStack Query/error boundaries |
| Cost permissions | Backend permission + conditional query |
| Tenant isolation | Explicit predicates + RLS + two-tenant DB tests |

---

# 32. Rollout strategy

## Phase 1 — Semantic-safe read model

Before visual expansion:

- add explicit Net Sales fields;
- normalize hourly/top products;
- implement ReportingPeriod;
- add trend endpoint;
- reconcile deterministic fixture.

No freshness/tip claim is exposed yet.

## Phase 2 — Freshness foundation

- checkpoint table;
- device endpoint;
- POS heartbeat;
- owner freshness endpoint;
- replace cosmetic `generatedAt` badge.

Dashboard V2 must not be called trustworthy before this phase passes.

## Phase 3 — Owner-value composition

- KPI grid;
- comparisons;
- charts;
- COGS/Gross Margin;
- merma;
- stock;
- voids;
- sequence;
- payment mix.

## Phase 4 — Attention backend summaries

- reconciliation summary;
- audit/security summary.

## Phase 5 — Restaurant/Hybrid tip readiness

- POS tip persistence;
- payment allocation;
- sync DTO;
- cloud schema;
- reporting coverage;
- Dashboard tip widgets;
- settlement reconciliation tests.

## Phase 6 — Pilot / GA evidence

- two-tenant isolation;
- SOHO/pilot-like production fixture;
- offline/reconnect freshness scenarios;
- accessibility;
- performance profiling;
- runbook/telemetry.

The later Execution Roadmap may split these phases into smaller mergeable slices; this document does not define PR sizes or sequencing IDs.

---

# 33. Rollback and recovery

## 33.1 Frontend

Dashboard V2 visual route can revert to the existing Dashboard while backend additive fields remain.

## 33.2 Sales DTOs

Additive fields remain harmless to old consumers.

Do not rollback by changing legacy field meanings.

## 33.3 Freshness

If checkpoint reporting fails:

- Dashboard freshness degrades to UNKNOWN;
- do not fall back to `generatedAt`.

## 33.4 Tips

If Dashboard tip reporting must be disabled:

- preserve captured tip data;
- hide/disable the widget;
- do not delete tip columns or rewrite historical invoices.

## 33.5 New summary routes

Failure disables the relevant Attention subsection, not the whole Dashboard.

---

# 34. Architecture risks

| Risk | Mitigation |
|---|---|
| Legacy Sales field ambiguity leaks into V2 | Add explicit semantic fields; shared Sales semantics service. |
| Top Products does not reconcile after invoice discounts | Verify final line net fields; otherwise deterministic allocation. |
| Offline delayed sync shifts COGS period | Attribute sale COGS by originating sale business timestamp. |
| Fresh heartbeat lies about cloud ACK state | Device reports produced/pending only; server owns contiguous `acceptedThroughSequence`. |
| Device disappears and blocks tenant forever | Explicit device deactivate/revoke in authoritative device registry; never silent timeout exclusion. |
| Legacy tip rows appear as zero | Nullable capture fields + coverage metadata. |
| Split payments lose tip settlement allocation | Persist payment-level tip components. |
| Too many Dashboard requests | Independent caching, SQL aggregation, lazy secondary widgets; profile before creating cross-domain read model. |
| Manager sees cost via direct API | Server-side granular permission on COGS route. |
| Widget failure crashes page | independent queries + widget error boundaries. |
| Recharts inflates initial bundle | lazy-load chart feature. |
| Multi-tenant regression in new tables | RLS + explicit predicates + real PostgreSQL two-tenant tests. |

---

# 35. Architecture evidence audit — v0.2

The previous Dashboard audit resolves several architectural assumptions but does **not** contain
enough code evidence to close all implementation-shape gates. The correct disposition is below.

| Gate | Current disposition | Evidence-backed conclusion | Required next verification |
|---|---|---|---|
| **AG-01 Top Product line economics** | **OPEN / narrowed** | Domain docs expose line subtotal and invoice-level discounts; prior audit proves Top Products route exists, but not exact current `invoice_items` net semantics. | Inspect current invoice-item entity/migration + Top Products query. If final post-discount/pre-tax line net is absent, use §10 deterministic allocation. |
| **AG-02 Sale → Kardex source link** | **PARTIAL** | Inventory domain contract requires `documento_origen_id`/source document linkage, but prior audit did not verify the current implemented Kardex entity shape. | Inspect entity/migrations/report query; prove stable link to source invoice/ticket and use sale business timestamp for Sales COGS. |
| **AG-03 Device registry** | **OPEN** | Project implementation context establishes Device Sync provisioning/credentials, but the prior file audit does not prove lifecycle fields/source of active devices. | Inspect Device Sync credential/provisioning entities and revoke/deactivate semantics. |
| **AG-04 Outbox monotonic cursor** | **OPEN; assume ADD until disproven** | Existing docs prove Outbox/client-timestamp ordering, not a monotonic completeness cursor. | Inspect local Outbox schema. If no equivalent cursor exists, implement stream sequence from §17.3. |
| **AG-05 Operation mode source** | **OPEN** | QSR/Restaurant/Hybrid evaluator exists at product/implementation level, but persistence/cloud-read authority is not evidenced. | Inspect persisted tenant/settings source and current API. |
| **AG-06 Cost permission** | **PARTIAL; likely extension** | Reporting route role/tenant guards are verified; cost-specific authorization is not. | Inspect permission matrix/guards. Bind existing capability or add `VIEW_INVENTORY_COSTS` equivalent. |
| **AG-07 Audit severity** | **PARTIAL** | CRITICAL/WARNING/INFO taxonomy is authoritative in Audit PRD; persisted severity is not evidenced. | Inspect audit entity/query. Persisted field → aggregate; otherwise centralize classifier. |
| **AG-08 Payment amount semantics** | **OPEN / isolated** | Tip absence in Invoice/Payment/Sync DTO is verified; exact meaning of existing payment amount relative to locally collected tip is not. | Inspect POS checkout persistence + sync mapping + backend Payment entity. Do not label historical payment totals `Total cobrado` before this map is proven. |

## 35.1 Gates removed from further debate

The following are considered closed architectural inputs because the prior evidence pass already proved them:

- fiscal regime is available through an existing guarded endpoint;
- current `generatedAt` is report-generation time only;
- no freshness backend exists;
- tips require end-to-end data remediation;
- COGS exposes `salesCogsNio` and `shrinkageCogsNio`;
- stock/void/sequence summaries are frontend-consumable;
- reconciliation and Audit executive summaries require new read contracts;
- existing reviewed report routes are tenant-bound;
- comparisons can be made with two period queries;
- Recharts requires a dependency addition.

These findings must not be reopened by implementation agents without contradictory code evidence.

---

# 36. Architecture Definition of Done

This specification may be promoted to:

> **APPROVED / AUTHORITATIVE ARCHITECTURE FOR OWNER DASHBOARD V2**

when:

- [ ] the eight dispositions in §35 are closed with targeted code evidence;
- [ ] no architecture decision contradicts the PRD;
- [ ] Net Sales semantics are centralized;
- [ ] ReportingPeriod is shared across relevant report services;
- [ ] freshness protocol uses server-observed contiguous ACK state and can prove a quiet-but-synchronized device current;
- [ ] multi-device freshness has a deterministic active-device source;
- [ ] tip legacy NULL vs explicit zero is preserved;
- [ ] sale-time tip eligible base remains reproducible;
- [ ] Gross Margin period alignment is technically provable;
- [ ] Manager cost authorization is server-side;
- [ ] new tables/routes have RLS/isolation strategy;
- [ ] backward compatibility with old POS/frontend is documented;
- [ ] test/migration/rollback evidence is executable.

---

# 37. v0.2 audit conclusion

The architecture is structurally aligned with the authoritative PRD and the previous Dashboard evidence
pass. No product decision needs reopening.

The most important correction in v0.2 is the freshness trust boundary: the device can report its
produced watermark and local pending state, but the cloud must own the accepted contiguous watermark.
Without that correction, a buggy/replayed client heartbeat could falsely certify completeness.

The prior audit also narrows the remaining work substantially. Eight gates remain, but they are now
small code-shape checks rather than open product/architecture design questions.

This document should remain non-authoritative until those targeted checks are run.

---

# 38. Next artifact after architecture approval

After this specification is audited and approved, produce:

> `owner_dashboard_v2_execution_roadmap.md`

The roadmap should convert the architecture into small evidence-gated slices, separating:

1. semantic/reporting normalization;
2. freshness foundation;
3. frontend executive composition;
4. attention summaries;
5. tip data-path remediation;
6. pilot/acceptance/hardening.

Implementation should not begin as one monolithic “Dashboard V2” batch.
