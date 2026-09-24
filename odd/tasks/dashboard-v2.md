# Dashboard V2 — audit-driven redesign (regime-aware)

**Trigger:** Owner request — redesign the owner dashboard applying
`docs/dashboard/owner_dashboard_v2_gap_audit.md`, including the tax-regime dynamization
(#544) inside the same job.

**Branch:** `feat/dashboard-v2`
**Base:** `main` @ `a9a381d4`
**Status:** in progress

## Governing constraint

The audit is status `PROPOSED / AUDIT BASELINE` and states: *"No implementation is authorized by
this document."* It defines its own phase gate (§31 DoD): a code-level evidence pass, a KPI
contract, and a PRD (`owner_dashboard_v2_prd.md`) before implementation. This feature follows that
discipline: evidence first, decisions second, PRD third, implementation batches after.

## Scope

- In: the whole owner dashboard (`apps/owner_dashboard/src/features/dashboard/**` and its backend
  report endpoints), the audit's gap inventory (DG-01…DG-25), the P0/P1 remediation matrix.
- In: absorbing #544 (regime-aware fiscal slot = audit DG-04) into this feature.
- Out: #545 tip persistence (prerequisite for audit DG-17 tips KPI; separate feature), #543
  pricesIncludeTax decision, fiscal computation changes, POS changes, multi-sucursal, P2 analytics
  (cashier scoring, loyalty, promotion attribution), net profit/P&L (audit §28 non-goals).

## Tasks

### Task 1 — Commit the audit baseline

- **Status:** done
- **Goal:** The audit document is versioned as the entry artifact of this feature.
- **Commits:** pending
- **Evidence:** pending

### Task 2 — Evidence pass (audit §31 DoD, code-level)

- **Status:** in progress
- **Goal:** Verify every audit claim against the real codebase: current dashboard API response
  shape, backend reporting routes that exist (hourly, top-products, cashier), freshness semantics
  actually implemented, tax-regime availability to the dashboard, tip data path POS→sync→backend,
  COGS/merma report availability, tenant isolation of the aggregate routes, design-system tokens
  actually present.
- **In scope:** read-only mapping; a written evidence record appended to this file or as
  `docs/dashboard/audit_evidence_pass.md`.
- **Acceptance:** every DG-* item gets a verdict: confirmed / already-exists (audit wrong) /
  requires-backend-work / requires-contract-decision. Known already: #545 proves tips do NOT reach
  the backend (audit §8's "implemented in the platform" is POS-only — a §31 classification error to
  record); #544 proves `SalesDashboardReportDto` carries no regime.
- **Commits:** pending
- **Evidence:** pending

### Task 3 — Distill PRD decisions for the product owner

- **Status:** pending
- **Goal:** Convert audit §29's 16 decisions into a minimal decision set: which have obvious answers
  from code/conventions, which genuinely need the owner (KPI naming, comparison defaults, tip
  semantics, drill-down destinations, OWNER vs OWNER/MANAGER visibility, default date preset).
- **Acceptance:** the owner answers in one sitting; no open product decision blocks the PRD.
- **Commits:** pending
- **Evidence:** pending

### Task 4 — Write `owner_dashboard_v2_prd.md`

- **Status:** pending
- **Goal:** Authoritative product contract: KPI dictionary with formulas, regime presentation
  rules, comparison semantics, freshness contract, composition (audit §26), states, acceptance
  criteria. No DB/query architecture decisions (audit §24 stays open until after PRD).
- **Commits:** pending
- **Evidence:** pending

### Task 5 — Implementation batches (P0 slice first)

- **Status:** pending
- **Goal:** Reviewable batches: (a) regime-aware KPI strip + freshness contract, (b) comparison +
  trend chart, (c) performance explanation widgets (hourly, top products, payment mix), (d)
  attention-required panel + empty states. Each batch with tests, design-system compliance (§21-22)
  and tenant-isolation proof for any new query path (§25).
- **Commits:** pending
- **Evidence:** pending
