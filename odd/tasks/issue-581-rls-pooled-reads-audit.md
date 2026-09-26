# Issue #581 — Pooled reads vs RLS-forced direct tables: audit + fixes + gate

Status: in progress · Branch: `fix/581-rls-pooled-reads-audit` (worktree `issue-581-rls-audit`, base `main` @ `663d8414`)

## Problem

Pooled (unbound) repository reads of `direct` RLS-forced tables return zero rows in production (runtime role NOBYPASSRLS) while working in dev — the local postgres superuser bypasses RLS and masks every one. Audit (2026-09-25, exploration agent) found **16 unbound sites: 12 reads + 4 writes**, of which **9 reads are production-broken today** (8 reporting/export endpoints silently return empty).

## Audit facts

- Manifest: `apps/admin_backend/scripts/schema-rls-coverage-manifest.txt` — **64 direct entries** (48 SIUD, 10 SI, 6 SIU; the issue's "63" predates the last ratchet), 5 parent-owned, 8 global, 3 debt. Spot-check vs migrations: no discrepancies.
- The only unbound `invoices` reads are the report/export services; `InvoicesService` CRUD/sync paths are all bound (`withTenantBoundTransaction`).
- `audit_logs` and `audit_integrity_alerts` are `debt` (no RLS by founder decision, #512 T3 slice 7): their unbound access works today and becomes production-broken the moment they are promoted. Bind them now to make promotion safe.
- Full classification (BOUND/UNBOUND/SAFE-NO-TENANT per site) lives in the audit transcript; the P0 sites are restated below.

## P0 inventory (production-broken today, `invoices` direct:SIUD)

| Site | Service.method | Endpoint |
|------|----------------|----------|
| `sales-reports.service.ts:68` | getDashboard | GET /sales/reports/dashboard |
| `sales-reports.service.ts:101` | getHourlySales | GET /sales/reports/hourly-sales |
| `sales-reports.service.ts:132` | getTopProducts | GET /sales/reports/top-products |
| `sales-reports.service.ts:161` | getCashierPerformance (invoice read; user read already bound in stage 12d) | GET /sales/reports/cashier-performance |
| `fiscal-reports.service.ts:78` | getMonthlySummary | GET /fiscal-reports/monthly-summary |
| `fiscal-reports.service.ts:133` | getVoidedInvoices | GET /fiscal-reports/voided-invoices |
| `fiscal-reports.service.ts:197` | getSequenceAudit | GET /fiscal-reports/sequence-audit |
| `sales-export.service.ts:92` | exportSalesBook | GET /sales/export/sales-book |

(9 sites — getCashierPerformance counts one invoice read + the already-bound user read.)

P1: `inbound-sync.service.ts` `fetchUserDeltas` pooled fallback (`entityManager?.getRepository(User) ?? this.userRepository`) — make the bound manager required, matching fetchProductDeltas/fetchInsumoDeltas/fetchRecipeDeltas.

P2 (audit `debt` tables, bind now): `audit-trail.service.ts` (3 reads + 1 write), `supervisor-override.service.ts` `logOverrideAudit` (write outside transaction), `user.service.ts` `logAction` pooled fallback.

P3 (deferred, structural): `audit-integrity.service.ts` nightly cron is INTENTIONALLY unbound multi-tenant (founder decision #512 T3 slice 7). Do not bind now; when audit tables are promoted, the cron must iterate tenants with one `runInTenantTransaction` per tenant. Doc-only follow-up.

## Decisions

- **D1 — Fix pattern**: `runInTenantTransaction(this.dataSource, tenantId, (manager) => manager.getRepository(Invoice).find(...))` for report/export services (same as the stage-12d user-read fix already in getCashierPerformance). No behavior change in dev (superuser) — the change is only that production gets rows.
- **D2 — Bind debt-table access now** (slices 4–6) so the future audit-tables promotion (#512 T3 slice 7) does not silently break identity endpoints.
- **D3 — Gate = Option A**: one DB e2e per fixed endpoint, connecting as a `NOSUPERUSER NOBYPASSRLS` role (pattern already used by 8+ e2e specs), asserting non-empty results with seeded data. Option B (dev default non-superuser role) and Option C (lint rule) are recorded as future investments, not in this issue.
- **D4 — No manifest changes**: 64-entry manifest is correct; this issue adds no tables.

## Work units (each = one work-unit commit, tests green before commit)

| WU | Content | Sites |
|----|---------|-------|
| WU1 | P0 report/export fixes (slices 1–3) + unit spec updates | 9 reads |
| WU2 | P1 inbound-sync user deltas: manager required (slice 7) | 1 fallback |
| WU3 | P2 audit-trail/supervisor-override/user-service binding (slices 4–6) | 4 reads + 3 writes |
| WU4 | Gate: NOBYPASSRLS e2e per fixed endpoint (Option A) + CI integration | 8 endpoints |

## Known merge risk (out of scope here)

The `feat/dashboard-v2` branch has large uncommitted rewrites of `sales-reports.service.ts` (AG-08 reporting semantics, ~151 lines). Whichever of the two PRs lands second absorbs the conflict; the binding changes here are mechanical wrappers, so prefer landing this one first if possible.

## Acceptance criteria

1. Zero UNBOUND-POOLED reads/writes of direct:SIUD tables in `src/` (audit list resolved; P3 cron documented as intentional).
2. All fixed endpoints return data under a NOBYPASSRLS role in e2e (gate green; red before fix for at least one representative endpoint).
3. Full backend suite green; work-unit commits.

Found by: stage-12d verification (PR #580); systematic audit 2026-09-25. Refs #556 #559 #512.
