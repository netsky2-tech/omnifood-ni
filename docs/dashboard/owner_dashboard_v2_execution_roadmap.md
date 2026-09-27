# NHILOS POS — Owner Dashboard V2 Execution Roadmap

**Document:** `owner_dashboard_v2_execution_roadmap.md`
**Version:** 1.0
**Status:** ACTIVE — implementation plan derived from approved authorities
**Date:** 2026-09-24
**Product authority:** `owner_dashboard_v2_prd_v1.0.md` (APPROVED)
**Architecture authority:** `owner_dashboard_v2_architecture_spec_v0.3.md` (GATE-VERIFIED)
**Evidence:** `audit_evidence_pass.md`, `arch_spec_gate_pass.md`
**Task board:** `odd/tasks/dashboard-v2.md`

---

## 1. Rules of engagement

1. **Evidence-gated slices.** No batch starts before its dependencies' evidence exists. Each batch
   closes with focused suites green, typecheck clean, and a work-unit commit with conventional
   message. Tests are written first where logic changes (repo TDD convention).
2. **Additive backend contract.** No legacy response field is removed or redefined (spec §7.2).
   The V2 frontend must not use `grossSales` as Net Sales.
3. **No reopen without contradictory code evidence.** §35.1 of the architecture spec and the
   verified gate pass (AG-01..AG-08) are fixed inputs.
4. **Tenant isolation proof** accompanies every new endpoint (PRD Gate F; spec §23/§25): guards +
   explicit predicates + two-tenant test where a new table is introduced.
5. **Fiscal immutability.** No batch mutates historical invoices or fiscal documents; migrations
   are additive.
6. **Review load.** Every batch targets ≤400 changed lines of review-relevant code; oversized
   slices are split, not merged.

## 2. Batch DAG

```
B1 semantics ──┬──> B3 freshness ──┐
               │                    ├──> B8 acceptance/hardening
B2 client periods ──> B4 KPI strip ──> B6 attention ──┘
               │         │
               │         └──> B5 performance charts
               │
B5 (independent chart dep) 
B7 tips (independent; blocks Restaurant/Hybrid GA only)
```

Critical path: B1 → B4 → B5. B3, B6, B7 are parallelizable after their inputs exist.

---

## Batch 1 — Reporting semantics foundation (backend)

**Satisfies:** PRD Gate A; spec §6, §7; AC-03, AC-06 (partially), AG-02 fix, AG-08 reporting net.

**In scope:**
1. `ReportingPeriod` shared value object (spec §6.1): Managua-calendar parsing, half-open UTC
   boundaries `[start, end)` inclusive of the selected end date, validation, bucket helpers.
   Consolidate `SalesReportsService` date helpers behind it (no route contract change).
2. `SalesReportingSemantics` (spec §7.1): completed-sale predicate (finalized, not void),
   Net Sales, Pre-discount Sales, ticket count, average ticket (null when zero tickets), tax and
   discount totals — all from historical persisted invoice values.
3. Dashboard route extended **additively** per spec §7.2: `netSalesNio`,
   `preDiscountSalesNio`, `completedTicketCount`, `averageTicketNetNio: number | null`,
   `totalTaxNio`, `totalDiscountsNio`, `reportingPeriod` metadata. Legacy fields retained.
4. **AG-02 fix:** stamp the sale business timestamp on the sales-invoice inventory movement path
   (`invoices.service.ts:1378,1464,1691,2191`) from the invoice `created_at`. No schema change.
5. **AG-08 reporting net:** payment breakdown aggregation nets `changeGiven`; document the
   approximation for historical rows.
6. **Credit-note semantics recorded:** current netting includes credit notes in sales totals (no
   `type` filter) — keep behaviour, document it as the approved historical semantics in the
   semantics service; flagged to product if contradiction arises.

**Evidence to close:** fixture-driven unit/DB tests reconciling Net Sales, Pre-discount Sales,
Average Ticket and discount rate against known totals (PRD AC-03); movement-timestamp test for
AG-02; payment-net test for AG-08; two-tenant proof for any new query path.

**Out of scope:** frontend changes; comparison endpoints (client-side per spec §6.3).

---

## Batch 2 — Client period + comparison utilities (frontend)

**Satisfies:** spec §6.3; PRD §9, AC-05.

**In scope:** pure, unit-tested `features/dashboard/domain/comparison-period.ts` (day → same
weekday previous week; multi-day → preceding equal range; MTD/YTD elapsed with calendar clamping);
comparison-range serialization to local `YYYY-MM-DD` for the existing endpoints.

**Evidence to close:** rule-table unit tests including leap-day and 31st clamping; zero-previous
behaviour (`—`, never `+100%`).

---

## Batch 3 — Freshness foundation (backend)

**Satisfies:** spec §17.3, §33; PRD §20, Gate C; AG-03, AG-04.

**In scope:**
1. Device registry (AG-03): additive entity (or credential extension) with presence fields +
   active-device query; revocation preserved; RLS + two-tenant test.
2. Freshness endpoint: per-stream `acceptedThroughSequence` watermark computed from existing sync
   receipts (AG-04 confirmed schema-ready); COMPLETE/STALE/PARTIAL/UNKNOWN derivation; 5-minute
   threshold as centralized server configuration (PRD FR-SYNC-03); quiet-store stays COMPLETE
   (AC-09A).
3. `generatedAt` remains technical metadata only (FR-SYNC-04).

**Evidence to close:** state-matrix tests (complete/stale/partial/unknown/reconnect per PRD Gate C);
isolation proof for the new endpoint/table.

---

## Batch 4 — Executive KPI strip + fiscal profile (frontend)

**Satisfies:** PRD §10.2, §11, §12; AC-01, AC-02, AC-04, AC-17; #544.

**In scope:**
1. `GET /onboarding/fiscal-setup` consumption for the regime (FR-FISCAL-01); conditional fifth slot
   (IVA meaningful vs Cuota Fija vs unknown warning per FR-FISCAL-02..04).
2. KPI strip: `Ventas Netas` hero (FR-KPI-01, never `grossSales` as Net Sales), Completed Tickets
   (FR-KPI-02), Average Ticket with `—` (FR-KPI-03), Gross Margin (FR-KPI-04 — client-side
   composition from dashboard `netSalesNio` + `/inventory/reports/cogs` `salesCogsNio`, the
   composition strategy confirmed frontend-ready by the evidence pass; margin widgets are gated on
   the AG-06 cost permission from Batch 5 landing first, per AC-17).
3. Comparison deltas wired to Batch 2 utilities; `Sin base comparable` behaviour.
4. Widget-level failure isolation (FR-STATE-04/05) and empty states (FR-STATE-01..03).

**Evidence to close:** component tests for regime matrix and states; AC-02/AC-04/AC-17 scenarios;
#544 closes when the Cuota Fija behaviour ships.

---

## Batch 5 — Performance charts (frontend + one backend endpoint)

**Satisfies:** PRD §14–17; Gate D widgets.

**In scope:**
1. Recharts dependency added lazy-loaded (spec §11 bundle discipline).
2. **New daily sales series endpoint** (2–60 day granularity) built on `ReportingPeriod` +
   `SalesReportingSemantics` — single-day trend reuses the existing hourly route. Cross-widget
   invariant: trend/hourly/top-products use the same Net Sales semantics (PRD §7.2).
3. Sales Trend (FR-CHART-01..04), Sales by Hour (existing route), Top Products (existing route;
   revenue semantics reconciled per AG-01), Payment Mix redesign (FR-PAY-01..04, changeGiven net
   from Batch 1).

**Evidence to close:** chart data reconciliation tests vs dashboard totals; no-data chart states.

---

## Batch 6 — Attention Required (frontend + two backend contracts)

**Satisfies:** PRD §19; AC-10, AC-11, AC-12, AC-13.

**In scope:**
1. Frontend-ready signals wired: stock alerts, voids, sequence anomalies (existing endpoints).
2. **Reconciliation summary contract** (PRD 26.2): pending count/amount/oldest age.
3. **Audit severity + summary contract** (AG-07, PRD 26.3): additive `severity` column with
   deterministic ingestion classifier; summary endpoint; RLS + two-tenant test.
4. Severity model Critical/Warning/Info; deep-links only (PRD §24), no mutation.

---

## Batch 7 — Tip data-path remediation (#545)

**Satisfies:** PRD §21; Gate E; AC-14. Blocks Restaurant/Hybrid GA only.

**In scope:** POS tip persistence (with sale-time eligible-base snapshot per PRD 21.1), sync DTO,
cloud additive columns, aggregation, then KPI widgets for applicable profiles only. Sale-time
reproducibility invariant (PRD 21.2); legacy rows NULL + coverage metadata (spec §33.4).

**Closure record (Batch 8 pass):** DONE — slice 1 `122e1a21` (backend tip schema + sync DTO),
slice 2 `53ca5cbd` (POS persistence + sync payload), slice 3 `2b9e1482` (reporting aggregation +
`tipsSummary` on the V2 report + `TipsSummaryCard`). AC-14/AC-15 proven in the Batch 8 frontend
acceptance suite; behavior owned by `dashboard-v2-tips.spec.tsx`.

---

## Batch 8 — Pilot acceptance and hardening

**Satisfies:** PRD §29–30 (AC-01..AC-17, Gates A–F).

**In scope:** deterministic fixtures (sales/discounts/COGS/voids/rankings); fiscal-profile
fixtures (Régimen General, Cuota Fija, mixed); sync-state matrix tests; two-tenant proofs for
every new route; UX states (zero-sales, high-alert, large dataset, tablet, mobile); accessibility
baseline (WCAG 2.1 AA per PRD §28); staging deployment and pilot verification.

**Closure record (this pass):** DONE for the test/evidence scope —
- `apps/owner_dashboard/src/__tests__/dashboard-v2-acceptance.spec.tsx` (22 tests): AC-01..AC-06,
  AC-10..AC-17 over deterministic fixtures; full dashboard suite 74 files / 1017 pass / 4 skip.
- `apps/admin_backend/test/sales/dashboard-v2-acceptance.db.e2e-spec.ts` (13 tests, live
  Postgres, migration-built schema, NOBYPASSRLS runtime role): two-tenant isolation (Gate F) for
  all five new dashboard endpoints + AC-08 (20-min complete → STALE) + AC-09A (quiet store with
  fresh checkpoints → COMPLETE) + backend AC-03 reconciliation.
- AC placement note: AC-08/AC-09A live in the backend proof (no frontend freshness-state
  consumer exists yet; generatedAt must not signal completeness per FR-SYNC-04). The frontend
  freshness-state surface remains an open follow-up.
- Not covered here (human/infra-owned): staging deployment, pilot verification, dedicated WCAG
  2.1 AA audit, large-dataset/tablet/mobile soak UX.

---

## 3. Sequencing constraints (from the gate pass)

- **AG-06 before any margin widget** (AC-17): Batch 5's margin surfaces land after Batch 6's
  permission work or behind the permission flag.
- **Batch 1 before any V2 widget**: the frontend must never read `grossSales` as Net Sales.
- **AG-04 watermark (closed) unblocks Batch 3**; AG-03 registry is Batch 3's only real build.
- **AG-02 timestamp fix lands in Batch 1** so COGS alignment fixtures (AC-06) are testable.
- **#545 does not block QSR/Retail scope** (PRD 21/33.5); it gates Restaurant/Hybrid GA.

## 4. Definition of done (per batch)

- Focused suites green + typecheck + lint (check-only scoped runs; `npm run lint` is `--fix` and
  must not be used as a check).
- Work-unit commit(s), conventional format, no Co-Authored-By trailers.
- Task board (`odd/tasks/dashboard-v2.md`) updated with evidence and any failed/skipped check.
- PRD/spec contradiction check: any mismatch stops the batch and returns to product/architecture.
