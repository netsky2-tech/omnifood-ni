# Dashboard V2 — audit-driven redesign (regime-aware)

**Trigger:** Owner request — redesign the owner dashboard applying
`docs/dashboard/owner_dashboard_v2_gap_audit.md`, including the tax-regime dynamization
(#544) inside the same job.

**Branch:** `feat/dashboard-v2`
**Base:** `main` @ `a9a381d4`
**Status:** in progress — audit chain closed through v0.3 (`e61fe291`); PRD v1.0 + architecture
spec v0.2 imported as inputs (`735a429b`); gates verified, spec at v0.3 (`7013023f`); execution
roadmap v1.0 issued (`d8e5aa7d`); **Batch 1 (reporting semantics foundation) implemented** on top
of the post-#592 bound reads after realigning the branch with main (`437ebc34`).

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

- **Status:** done. Superseded-in-part by the owner's re-audit v0.2 (Task 2b).
- **Goal:** Verify every audit claim against the real codebase; produce verdicts per DG-* item.
- **Commits:** `78532c4d`
- **Evidence:** `docs/dashboard/audit_evidence_pass.md` — complete verdict table. Headlines: the
  regime-aware slot (DG-04) is frontend-only (`GET /onboarding/fiscal-setup` exposes `regime`);
  hourly/top-products/cashier endpoints and hooks exist but were never wired into the dashboard;
  freshness is cosmetic and its contract needs backend schema+endpoint; tips are POS-only (audit
  §8 classification error, blocked by #545); gross margin computable client-side from two existing
  endpoints (alignment caveat on COGS date params); Recharts not installed; `KpiCard` already
  supports `trend`; all routes tenant-safe with RLS. Corrections recorded against audit §8, §13,
  §23.

### Task 2b — Re-audit v0.2 reconciliation

- **Status:** done
- **Goal:** Verify the owner-provided scoped re-audit (`owner_dashboard_v2_gap_audit_v0.2.md`)
  against the evidence pass; confirm or refute its claims; record any new finding.
- **Commits:** `39c179df`
- **Evidence:** v0.2 incorporates all three evidence-pass corrections faithfully (tips
  BLOCKED/DATA GAP, freshness = backend feature, inventory as separate bounded context). Its DoD
  checklist (§29) is fully checked except the product-approval gate. Consistency spot-checks
  passed (`reconciliationStatus` exists per-payment only; regime endpoint; -06:00 anchoring).
  **New finding from the spot-check:** `grossSales` is computed as Σ `inv.total`
  (`sales-reports.service.ts:88`) — post-discount, **post-tax** — while `netTaxableSales` is Σ
  `inv.subtotal` (post-discount, pre-tax, L89). The current "Ventas Brutas" label therefore
  includes IVA; the KPI dictionary must resolve the naming/semantics mismatch (feeds §7.1 and
  decision 1 of §27). Pre-discount base is derivable client-side as
  `netTaxableSales + totalDiscounts` (pre-tax) for the discount ratio.

### Task 2c — Architecture spec gate pass (AG-01..AG-08)

- **Status:** done — explorer pass + adversarial verification
- **Goal:** Close or narrow the eight gates of architecture spec §35 with targeted code evidence.
- **Commits:** this commit
- **Evidence:** `docs/dashboard/arch_spec_gate_pass.md` — verified dispositions: AG-01 and AG-04
  CLOSED (deterministic line allocation already exists; the sales stream already carries the
  `source_sequence` watermark), AG-02 NARROWED to the sales-invoice movement timestamp (generic
  inventory sync/counts/production already stamp business time), AG-05 NARROWED to a read endpoint
  (mode lives in topology JSON), AG-03/AG-06/AG-07/AG-08 OPEN as prescribed build-out. Two explorer
  findings corrected by adversarial verification: the AG-02 "no timestamp override" premise was
  refuted (per-flow), and AG-08's mechanism was restated — cash over-tender with unnetted
  `changeGiven`, not tips (tips never reach payments; `grandTotalWithTip` is display-only).
  Downstream: #545's reconciliation motivation needs restating; the over-tender defect is new and
  not covered by #545.

### Task 3 — Distill PRD decisions for the product owner

- **Status:** done (superseded) — the owner authored and approved the PRD v1.0 externally
  (`owner_dashboard_v2_prd_v1.0.md`, imported at `735a429b`).

### Task 4 — Architecture spec final version

- **Status:** done (v0.3 issued; APPROVED promotion gated on §36 build-out items)
- **Goal:** Promote the spec on verified evidence without overstating.
- **Commits:** this commit
- **Evidence:** `owner_dashboard_v2_architecture_spec_v0.3.md` — status GATE-VERIFIED / READY FOR
  EXECUTION ROADMAP; §35 dispositions replaced with the verified ones; §36 marked `[x]` only where
  evidence closes the item; §37 rewritten. APPROVED promotion remains gated on the four OPEN gates
  (AG-03 registry, AG-06 cost permission, AG-07 severity, AG-08 reporting net).

### Task 5 — Execution roadmap (`owner_dashboard_v2_execution_roadmap.md`)

- **Status:** done (`d8e5aa7d`)
- **Evidence:** eight evidence-gated batches matching spec §38; sequencing constraints from the
  gate pass recorded (AG-06 before margin widgets; Batch 1 semantics before any V2 widget).

### Batch 1 — Reporting semantics foundation (backend)

- **Status:** done (`3a13c094`…`51b69c11`)
- **Integration incident:** the branch forked 154 commits before main's #592 (tenant-bound report
  reads). WIP written against pooled reads was reset, main merged with conflicts resolved to
  main's versions, and the service/spec changes semantically re-ported so every report read keeps
  the `runInTenantTransaction` manager executor. `fix(repo)` commit untracks the self-referential
  `node_modules` symlink that `47aff9b2` committed onto main (breaks toolchains on checkout).
- **Delivered:** `core/reporting/ReportingPeriod` + `SalesReportingSemantics` (committed with the
  merge); additive `SalesDashboardReportDto` V2 fields + `reportingPeriod` metadata; AG-08
  changeGiven netting (NIO/USD legs); AG-02 invoice business timestamp on the four sale-driven
  movement creations.
- **Evidence:** jest 44 suites / 693 pass / 1 skip (incl. #592 binding guards and 4 ported
  behavior tests with the 200−63→137 case); `tsc --noEmit` at the 16 pre-existing errors
  (unrelated test file); eslint clean on batch lines (4 pre-existing prettier errors remain on
  untouched lines 348–448 of `invoices.service.ts`, owned by main).
- **Not run:** DB e2e suites (no local Postgres in this pass); the #592 NOBYPASSRLS gate covers the
  executors we preserved unchanged.

### Batch 2 — Comparison-period utility (frontend)

- **Status:** done (`421ac50b`)
- **Delivered:** pure `resolveComparisonPeriod` (presets today/yesterday/last7/last30/thisMonth/
  prevMonth/thisYear + explicit local ranges; injectable `now`; UTC-space calendar math; strict
  `TypeError` on malformed/impossible/inverted input). Previous range never overlaps current.
- **Product flag:** PRD §9.3 leaves complete-month presets undefined; implemented as
  calendar-anchored MoM (Nov 1–30 vs Oct 1–30 with clamping), not a sliding window. Comment
  corrected after review (the original worker comment claimed a false overlap property for the
  alternative reading). Needs founder confirmation, not blocking Batch 4.
- **Evidence:** vitest 25/25 (leap 2028-02-29 YTD+MTD, 31st clamping both directions, year
  boundaries, rejection paths); `oxlint` clean on the new module; `tsc -b` shows only the
  **pre-existing** main-owned error `setup-center-view.tsx(718,76)` (last touched by `cb1844e7`).
- **Known environmental failures:** dashboard typecheck red on `setup-center-view.tsx` since main
  (not introduced here); dashboard uses `oxlint`, not eslint.

### Batch 3 — Freshness foundation (backend)

- **Status:** done (`bf58a15e`)
- **Delivered:** `sync-health/` — pure `deriveSyncFreshness` (4-state rollup per PRD §20, quiet
  store COMPLETE, conservative `lastCompleteAt`), `DASHBOARD_FRESHNESS_THRESHOLD_MINUTES` config
  (default 5, fail-closed), tenant-bound service (single transaction, `set_config` first-statement
  guards per #592), `GET /operations/sync/freshness` (route per spec §17.12), canonical `human`
  transport declaration in the route-registry ratchet.
- **No new tables:** receipts + `STAGED_FUTURE` outbox rows already prove watermarks and gaps;
  a hole below the watermark is physically unreachable under strict ordered acceptance — PARTIAL
  derives from staged-ahead evidence only. No heartbeats were invented.
- **Incidents:** a duplicate delegation briefly collided with the still-running original writer;
  the duplicate stopped with zero writes (single-writer discipline held). Parent's combined
  sales+core run caught the unclassified-route ratchet the worker's scoped run missed.
- **Evidence:** sync-health 4 suites / 31 tests; sales+core combined 48 suites / 725 (1 pre-existing
  skip); tsc delta 0 (16 known); eslint 0 problems on all touched files.
- **Product follow-ups (non-blocking):** active-but-never-synced device holds tenant at PARTIAL
  (§17.2 intended — confirm posture); terminal `label` falls back to device id (AG-03 display-name
  residual).

### Batch 4 — Executive KPI strip + fiscal profile (frontend)

- **Status:** done (`d8ec30d1`) — **closes #544** (permanent zeroed IVA card under cuota fija).
- **Delivered:** `dashboard-api.ts` (V2 wire normalization + `fetchFiscalSetup`), `kpi-deltas.ts`
  (pure, `previous <= 0 → null`, never fake +100%), `use-dashboard-kpis.ts` (comparison ranges via
  Batch-2 resolver, per-part failure flags), `kpi-strip.tsx` (4-card Cuota Fija / 5th IVA slot
  only on explicit `REGIMEN_GENERAL`, FR-FISCAL-04 warning → `/settings`, em-dash on null ticket
  average, "sin actividad", error isolation). Margin card fetched from existing
  `/inventory/reports/cogs` both periods — no deferral. Legacy KPI grid removed from
  `dashboard-page.tsx`; `grossSales` survives only in Resumen de Ventas (spec §7.3).
- **Test retargets:** `dashboard.test.tsx` + `w2-sales.test.tsx` legacy-card assertions moved to
  the V2 matrix under a surgical Option-A grant (the removal IS the #544 fix).
- **Evidence:** 13 new strip cases; full dashboard suite 70 files / 934 pass / 4 skip / 0 fail;
  `tsc -b` only the known `setup-center-view.tsx` error; oxlint clean.
- **Baseline recaptured for future batches:** dashboard `vitest run` 70/934/4 (was 63/824/4 before
  batches 2–4 landed); backend `sales+core` 48 suites / 725 (1 skip).
- **Product flag:** PRD §9.3 gap for complete-month comparison presets implemented as
  calendar-anchored MoM (see Batch 2) — founder confirmation still pending.
