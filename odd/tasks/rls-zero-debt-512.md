# ODD Feature: #512 — Zero-Debt Transaction-Path RLS (`audit_logs`, `audit_integrity_alerts`, `cashier_sessions`)
Branch: `feat/rls-zero-debt-512` | Issue: `#512` | Risk: `item 1, item 2` (PostgreSQL RLS migrations + multi-tenant security isolation)

## Specs
- **S1** (`audit_logs` `direct:SI` + call-site bindings): Bind `AuditController.getStreamHead`, `AuditController.pushLogs`, and `AuditIntegrityService.runNightly` to `runInTenantTransaction`. Add idempotent migration `1811200000000-EnforceAuditLogsAndIntegrityAlertsRls` enabling `ENABLE` + `FORCE ROW LEVEL SECURITY` on `audit_logs` with `SELECT` and `INSERT` policies only (append-only trigger `trg_audit_logs_immutable` preserved; no `UPDATE`/`DELETE` policy surface).
- **S2** (`audit_integrity_alerts` `direct:SIU` + per-tenant nightly scan): Refactor `AuditIntegrityService.runNightly` to list tenants from `tenants` and scan/upsert `audit_integrity_alerts` per-tenant inside `runInTenantTransaction`. Enable `ENABLE` + `FORCE ROW LEVEL SECURITY` on `audit_integrity_alerts` with `SELECT`, `INSERT`, `UPDATE` policies (`direct:SIU`).
- **S3** (`cashier_sessions` `direct:SIUD` + entity + backfill): Honor founder decision #1 ("`cashier_sessions`: add and backfill `tenant_id`, classify `direct`"). Add TypeORM entity `CashierSession` (`tenant_id: uuid`) matching `verify-schema-build.sh` entity/schema invariant, and idempotent migration `1811300000000-EnforceCashierSessionsRls` adding + backfilling `tenant_id uuid`, enabling `ENABLE` + `FORCE ROW LEVEL SECURITY` and `SELECT`/`INSERT`/`UPDATE`/`DELETE` policies (`direct:SIUD`).
- **S4** (Zero-debt manifest, scenario-2 replay, and real-PG two-tenant `NOSUPERUSER NOBYPASSRLS` proofs): Promote all 3 entries in `apps/admin_backend/scripts/schema-rls-coverage-manifest.txt` (`debt` count = **0**), register both migrations in `scripts/verify-schema-build.sh` scenario-2 `partial_ledger_names`, update `test/audit/audit-logs-read-rls.db.e2e-spec.ts`, and prove with real PostgreSQL `NOSUPERUSER NOBYPASSRLS` two-tenant tests that unbound sees 0, tenant-local CRUD works, foreign inserts fail, and cross-tenant update/delete affect 0 rows.
- **S5** (Full backend gate & independent verification): Run `verify-schema-build.sh`, `npm run test:db`, `npm run build`, targeted E2E (`audit-logs-read-rls`, `audit-stream-reanchor`), and independent `gentle-ai-verify`.

## Tasks
- [x] **T1** (`S1, S2`) Bind `AuditController` (`getStreamHead`, `pushLogs`) and `AuditIntegrityService.runNightly` (per-tenant loop) to `runInTenantTransaction` + unit/DB tests — route: inline — commit: `537750b6`
- [x] **T2** (`S1, S2`) Add migration `1811200000000-EnforceAuditLogsAndIntegrityAlertsRls.ts` + real-PG `NOSUPERUSER NOBYPASSRLS` two-tenant proof — route: inline — commit: `7a018ea9`
- [x] **T3** (`S3`) Add `CashierSession` entity (`tenant_id: uuid`) + migration `1811300000000-EnforceCashierSessionsRls.ts` + real-PG two-tenant proof — route: inline — commit: `836ac77d`
- [x] **T4** (`S4`) Promote manifest to **0 `debt`**, register scenario-2 replay in `verify-schema-build.sh`, update `audit-logs-read-rls.db.e2e-spec.ts`, and run full `verify-schema-build.sh` + DB & E2E proofs (all PASSED) — route: inline — commit: `pending`
- [ ] **T5** (`S5`) Run independent `gentle-ai-verify`, push & open PR closing `#512` — route: verify — commit: pending

## Log
- **L1** (user, verbatim): `Vamos con #512 (RLS en rutas transaccionales restantes)`
