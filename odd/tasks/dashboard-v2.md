# Dashboard V2 — audit-driven redesign (regime-aware)

**Trigger:** Owner request — redesign the owner dashboard applying
`docs/dashboard/owner_dashboard_v2_gap_audit.md`, including the tax-regime dynamization
(#544) inside the same job.

**Branch:** `feat/dashboard-v2`
**Base:** `main` @ `a9a381d4`
**Status:** in progress — Tasks 1-2 done (`c197ca9c`, evidence pass committed). Task 3: distilling
the PRD decision set for the owner.

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
- **Commits:** `c197ca9c` (`docs(dashboard): import the owner dashboard V2 gap audit baseline`)
- **Evidence:** `docs/dashboard/owner_dashboard_v2_gap_audit.md` (1303 lines, PROPOSED / AUDIT
  BASELINE). Zone.Identifier Windows metadata stream removed before commit; file verified UTF-8,
  no CRLF, 34,698 bytes.

### Task 2 — Evidence pass (audit §31 DoD, code-level)

- **Status:** done
- **Goal:** Verify every audit claim against the real codebase; produce verdicts per DG-* item.
- **Commits:** pending (with the evidence document)
- **Evidence:** `docs/dashboard/audit_evidence_pass.md` — complete verdict table. Headlines: the
  regime-aware slot (DG-04) is frontend-only (`GET /onboarding/fiscal-setup` exposes `regime`);
  hourly/top-products/cashier endpoints and hooks exist but were never wired into the dashboard;
  freshness is cosmetic and its contract needs backend schema+endpoint; tips are POS-only (audit
  §8 classification error, blocked by #545); gross margin computable client-side from two existing
  endpoints (alignment caveat on COGS date params); Recharts not installed; `KpiCard` already
  supports `trend`; all routes tenant-safe with RLS. Corrections recorded against audit §8, §13,
  §23.

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
