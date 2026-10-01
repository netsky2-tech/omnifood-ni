# Go-Live Plan — Measured Remaining Work (SOHO Founder Pilot)

Authority: `odd/plans/founder-pilot-execution-plan.md` (stale snapshot, 2026-09-27), the owner
directives (D-1…D-21), `odd/tasks/founder-pilot-acceptance-freeze.md` (FREEZE-01…08, complete),
`odd/tasks/go-live-decisions.md` (DEC-1…3), and `#531` (acceptance fence). This file is an ODD
execution projection of the measurement run on 2026-09-30 at `22bfc376`; OpenSpec/PRD remain the
authority.

## Why this file exists

The execution plan is a **3-day-old snapshot** and overstates the critical path: units it lists as
open (#525 void UI, #547 reprint, B1d DGI authorization number, #524, #601, #521 S1/S2) are
shipped in code. This file records what was **measured**, not what the plan claims.

## Measured contradictions (close as acts, G6)

| Plan claim | Measured reality |
| --- | --- |
| Void UI missing (P0 blocker) | Shipped: `ANULAR FACTURA` + reason + capability permissions; `#525` still OPEN |
| Reprint "planned, not built" | Shipped: immutable snapshot `25c66510` + REIMPRESIÓN `a768f15a`; `#547` OPEN |
| `dgi_authorization_code` zero consumers | Printed on the ticket (B1d); the plan's P0 fiscal blocker is closed in code |
| Batch 6 "no issue exists" | `#589` existed and was closed as a deferral |
| D-14 "the POS does not issue credit notes" | Superseded: the POS issues them (#673); DEC-1 gives a shared cursor; DEC-3 keeps them out of sync |
| 19 private `requireTenant` copies | 29 in the current tree |
| Plan references D-12…D-19 | The plan has **zero** occurrences of them; they live only in commit history |

## Blockers that ARE real (measured)

1. **`#522` Finding 1** — `GET /sales/reports/x|z` are literal stubs returning `{status:'ok'}` behind
   RBAC (`reports.controller.ts:179-189`); a test pins the stub. The accountant's first-week
   deliverable reconciles against nothing.
2. **`#526`/B5a** — the numbering tripwire *advances* instead of refusing with an operator-visible
   state; `FISCAL_SEQUENCE_RECOVERY_REQUIRED` (D-6's named state) does **not exist** (0 grep hits).
   This is the "legal on day 30" gate.
3. **B0.5** — the report indexes do not exist (`invoices(tenant_id, created_at)`,
   `inventory_kardex(tenant_id, timestamp)`); no `EXPLAIN` evidence was ever recorded.
4. **B4a** — `saveProductOptions` (`inventory_repository_impl.dart:162-183`) is delete→insert with
   separate awaits, no `@transaction`: a partial failure empties a product's options.
5. **`customer_point_transactions.units` int→decimal** — unmigrated in both runtimes (loyalty ledger).
6. **`#522` Finding 2** — credit notes fail closed on device transport (deliberate; DSI-6 owns it).
   Recorded, not "fixed" here.

## Work units

### G1 — `#522` Finding 1: real X and Z fiscal reports
- Status: **DONE** — PR #738 (`13e01e27`), issue #737 closed.
- Both stubs replaced by real, tenant-scoped aggregates in `SalesExportService`: `/x` = partial
  reading of an OPEN shift (`closesShift: false`, never flips), `/z` = closed-shift close view with
  per-shift fiscal totals + a **reconciliation blocker signal** (reports do not hard-fail; the hard
  block belongs to the close action). `exportZReports` was refactored onto a shared
  `getZReportRows` with its behavior preserved (verified hunk-by-hunk).
- Rulings recorded in code: shift-keyed aggregation (no invented fiscal-day semantics), tenant
  reads through `runInTenantTransaction` with an explicit `tenant_id`, repository `.find()` only,
  DTOs all-optional, RBAC untouched.
- Verification: **APPROVE, 0 blocking**; 4 should-fixes closed with mutation proofs — credit-note
  netting now pinned in both X and Z, `terminalId` narrowing pinned, the e2e tenant-isolation test
  given real teeth (foreign-tenant fixtures), and a **latent numeric bug fixed**: X's
  `salesByMethod` net now mirrors the AG-08 conversion for USD change (`sales-reports.service.ts:145-159`).
  Full suite 3,368 pass; `test:db` 294/294; e2e `--runInBand` 690/690; build + `npx eslint` clean.

### G2 — `#526`/B5a: refuse instead of advance, with the named state
- Status: **DONE** — delivered in two chained units:
  - **G2a (backend)**: PR #748 (`d5856979`), issue #747 closed. Optional `proposedSequence` on
    `GET /onboarding/terminals/priming`. Tripwire refuses `<= N` with 409
    `FISCAL_SEQUENCE_RECOVERY_REQUIRED` naming the conflicting number. Extracts trailing digit run
    (fixing prefix concatenation bug), fails closed on unreadable MAX.
  - **G2b (POS)**: PR #754 (`f7bd7a9e`), issue #753 closed. Removed auto-bump write in
    `ActivationControlledSaleRunner` (stops with named state, leaving `dgi_current_number` untouched
    per AC-3). Proposes cursor at priming. Surfaces operator-visible Spanish blocker naming the
    conflicting number (AC-2). Pinned AC-6 double-boot monotonicity.

### G3 — B0.5: report indexes + EXPLAIN evidence
- Status: **DONE** — PR #757 (`54f76417`), issue #756 closed.
- Additive migration `1809530000000-AddReportIndexes` adds `idx_invoices_tenant_created_at` on
  `invoices(tenant_id, created_at)` and `idx_inventory_kardex_tenant_occurred_at` on
  `inventory_kardex(tenant_id, occurred_at)`.
- Real PostgreSQL `EXPLAIN (FORMAT JSON)` test with `enable_seqscan = off` proves the planner
  uses Index Scan on production report query shapes; verified discriminating against index removal.
- Clean DDL-only; full DB suite passes (299/299).

### G4 — B4a: `saveProductOptions` in one transaction
- Status: **DONE** — PR #760 (`106f38ae`), issue #759 closed.
- Added `ProductDao.replaceProductOptions` with `@transaction` (positional arguments only per
  AGENTS.md / design §13 constraint).
- `InventoryRepositoryImpl.saveProductOptions` delegates to the new method, eliminating loose,
  uncoordinated delete/insert calls. Rollback test proves that an insertion failure preserves
  previous options instead of silently emptying the product.

### G5 — `units` int→decimal (loyalty ledger, both runtimes)
- Status: PENDING / EVALUATED
- Evaluated as low-medium risk (drift <=0.5 pt/tx only on fractional points, which SOHO does not emit).
  Can be safely run or deferred post-pilot.

### G6 — Acts: close what is done, refresh the plan
- Status: **DONE** (this entry).
- Issue #525 closed with evidence (UI in `sales_history_view.dart:388`, `void_decision.dart`, atomic reversals).
- Issue #547 closed with evidence (D-13 `fiscal_header_snapshot` in `25c66510`, call site in `sales_history_view.dart:351`, `*** REIMPRESIÓN ***` in `receipt_layout_formatter.dart`).
- Execution plan updated to reflect real delivered state.

## Owner / physical lanes (not code — recorded so they are not lost)

- Owner decisions: authorized consecutivo/series + authorization letter number/date (D-4/D-16/D-21);
  confirm Q4 (DT 09-2007 currency / Cuota Fija); accept the deferred risks in writing (per `#531`).
- Field runs never executed: `#534` queries, one day of capacity/latency (B0.6), `#525` AC-4,
  `#526` AC-9 Scenario A, contingency-stop prep P5(a)/(b), on-device QR + physical ticket, real RUC.

## Release / deploy lane (coordinate with the release-signing session)

- **`main` still silently debug-signs release APKs** (`build.gradle.kts:51-52` fallback) and the root
  `.gitignore` lacks keystore rules; the fix lives on unmerged `feat/release-signing-baseline`
  (`48cf3334`, `3c4b6334`). Any APK cut from `main` today is unrecoverable in the field.
- `HUMAN_AUTHORIZATION_RECOVERY_PEPPER` must be set before the next backend deploy (`#732`).
- Staging cutover §12 gate is unchecked; **no production cutover plan exists** (the runbook excludes
  production explicitly) — the pilot's target environment is an open owner decision.

## Evidence log

(updated per unit: commit, PR, issue, authored lines, test counts, verification findings)
