# Issue #493 — Systemic Tenant RLS Coverage

## Objective

Close the systemic class where tenant-owned PostgreSQL tables can exist without
`ENABLE ROW LEVEL SECURITY`, `FORCE ROW LEVEL SECURITY`, or an approved isolation
classification. Restore the Q80 first-business readiness path without weakening
runtime-role, offline-first, DGI, or multi-tenant invariants.

Issue: <https://github.com/netsky2-tech/omnifood-ni/issues/493>

## Authority and observed blocker

- The founder selected **correct RLS first** before resuming physical L1-06.
- Staging runs current `main` as `omnifood_runtime`, a non-superuser role with
  `NOBYPASSRLS`.
- Staging has all 85 migrations, but several tenant-owned tables have no RLS.
- With a synthetic unrelated tenant bound, the runtime role could count the one
  live `onboarding_sessions` row.
- Q80 identity, toolchain, current deployment, and staging reachability otherwise
  passed preflight.

No L1-06 evidence may be claimed until the critical slices below are deployed and
reverified on staging.

## Constraints

- Strict TDD with migration-built PostgreSQL and a table non-owner,
  `NOSUPERUSER NOBYPASSRLS` role.
- Unknown tenant-bearing tables fail schema verification.
- Direct tenant isolation, parent-owned isolation, and reviewed pre-tenant/global
  exceptions are distinct contracts; do not force one invalid generic policy onto
  all three.
- Runtime serving credentials never own schema objects and never bypass RLS.
- Missing tenant context fails closed and never reveals another tenant's existence.
- No data deletion or fiscal-document mutation. DGI cancellation remains
  `is_canceled` only.
- Keep each review slice near 400 authored changed lines. Split migrations/tests by
  coherent domain when the bound would otherwise be exceeded.
- Push, PR creation, merge, staging deployment, tenant provisioning, and L1-06 are
  separate user decisions.

## Dependency DAG

```text
S0 classification + coverage ratchet
  -> S1 onboarding/activation RLS
      -> staging critical-path probe
          -> L1-06 physical enrollment
  -> S2 first-business transaction domains
      -> runtime L2 + restart recovery
  -> S3 remaining domains + explicit exceptions
      -> final staging coverage probe
          -> first-business go/no-go
```

S1 and S2 may share the S0 vocabulary but must not write the same migration or test
surface concurrently. S3 starts only after S1/S2 reveal the real exception set.

## Tasks

### T1 — Add the authoritative schema coverage ratchet

Status: completed

- [x] RED: add a migration-built schema test that fails on an unclassified public
      base table and specifically reproduces the missing-RLS class.
- [x] Define one deterministic classification source for direct tenant tables,
      parent-owned tables, global/pre-tenant exceptions, and prohibited/unclassified
      tables.
- [x] GREEN: make schema verification fail for unknown tenant-bearing tables and for
      direct tables missing ENABLE/FORCE/policies, while recording current debt
      explicitly rather than hiding it.
- [x] TRIANGULATE: prove a synthetic new tenant table is rejected and an approved
      platform-global table is accepted.
- [x] REFACTOR: reuse existing tenant-RLS predicate/test helpers; do not introduce a
      parallel policy vocabulary.
- [x] Run focused migration/schema checks and `git diff --check`.
- [ ] Commit as one conventional work unit and record the commit below.
      (Commit itself is a separate user decision; all verification is green.)

Implementation route: classification semantics live in one dependency-free module
(`src/core/database/tenant-rls-coverage.ts`); the reviewed manifest
(`scripts/schema-rls-coverage-manifest.txt`) stores one `table|classification` line
per migration-built public base table; `scripts/verify-schema-build.sh` collects the
structural catalog facts (tenant column, ENABLE, FORCE, policy count) in both
scenarios and hands them to the compiled dist module, so the shell gate, the unit
spec, and the migration-built DB spec share one vocabulary. Existing predicate-form
and deny-all checks are unchanged.

Classification baseline (79 public base tables): 32 direct, 5 parent-owned
(`invoice_item_modifiers`, `invoice_payments`, `production_order_lines`,
`security_profiles`, `shrinkage_details` — no tenant_id, tenant-bearing parent FK),
8 global (`migrations`, `tenants`, `industry_templates` + `template_*` family,
`inventory_bcn_fx_rates`, `credit_note_provenance_rls_baseline`), and 34 explicit
debt entries, including `onboarding_sessions` and `onboarding_idempotency_records`
which T2 promotes, and `cashier_sessions` (no tenant_id and no tenant-bearing FK:
real isolation debt, not global).

Expected surfaces: schema-build verifier, one reviewed classification manifest or
module, focused tests, this task record. No production migration in this task.

### T2 — Enforce onboarding and activation critical-path RLS

Status: pending; depends on T1.

Next step (T2 entry point): promote `onboarding_sessions` and
`onboarding_idempotency_records` from `debt` to `direct` in
`scripts/schema-rls-coverage-manifest.txt` in the same slice that adds ENABLE+FORCE
and command-appropriate policies — the stale-debt ratchet makes the manifest entry
fail until the migration and the promotion land together.

- [ ] RED: migrate the existing onboarding session/idempotency DB tests away from
      `synchronize: true`/superuser and reproduce cross-tenant visibility under the
      runtime-shaped role.
- [ ] Add ENABLE+FORCE and command-appropriate policies for onboarding, template,
      import, and legacy onboarding/privacy tables required by fresh-tenant setup.
- [ ] Preserve authorized provisioning through an explicit transaction boundary;
      do not keep broad visibility to accommodate seeds.
- [ ] Prove tenant-local SELECT/INSERT/UPDATE/DELETE and reject foreign writes.
- [ ] Prove activation attempt creation and priming still work with bound RLS.
- [ ] Run focused backend unit, DB, migration, build, and diff checks.
- [ ] Commit as bounded domain work units and record commits below.
- [ ] Re-run the safe staging catalog probe after an explicitly authorized deploy.

### T3 — Enforce first-business transaction-path isolation

Status: pending; depends on T1 and the classification learned from T2.

- [ ] Cover direct-tenant catalog, customer, cash, inventory, sales-support, audit,
      and forensic-alert tables reached by selling and synchronization.
- [ ] Add parent-FK isolation for child tables without `tenant_id`; prevent foreign
      attachment on write.
- [ ] Preserve append-only audit/Kardex and sync idempotency semantics.
- [ ] Add migration-built two-tenant tests for each policy shape, grouped by domain.
- [ ] Run focused domain suites plus backend build and diff checks.
- [ ] Commit each reviewable domain slice and record commits below.

### T4 — Close exceptions, staging evidence, and resume Q80 readiness

Status: pending; depends on T2 and T3.

- [ ] Resolve remaining tenant domains and every pre-tenant/global exception with an
      explicit threat model and alternative isolation test.
- [ ] End with no unclassified public base table.
- [ ] Deploy only after explicit authorization, then rerun the catalog/RLS probe with
      safe counts and no identifiers.
- [ ] Update stale L1/L2/cutover evidence with observed facts.
- [ ] Resume `odd/tasks/terminal-enrollment-path.md` L1-06 only after the critical
      staging gate is green.

## Evidence ledger

| Task | Commit(s) | Verification | Result |
|---|---|---|---|
| T1 | pending (work-unit commit deferred to explicit user decision) | unit: `npx jest src/core/database/tenant-rls-coverage.spec.ts --runInBand` → 18/18 passed; DB: `npx jest --config ./test/jest-db.json --runInBand tenant-rls-coverage` → 5/5 passed; suite: `npm run test:db` → 45 suites / 256 tests passed; harness: `SCHEMA_CHECK_DB=omnifood_schema_build_test bash scripts/verify-schema-build.sh` → PASS both scenarios, coverage 79/79 classified (32 direct, 5 parent-owned, 8 global, 34 debt), failures 0; `git diff --check` → clean | RED observed: `onboarding_idempotency_records` and `onboarding_sessions` surfaced as unclassified tenant-bearing tables (1 failed, 4 passed). GREEN observed: all five checks pass; T1 implementation complete. |
| T2 | pending | pending | pending |
| T3 | pending | pending | pending |
| T4 | pending | pending | pending |

### T1 evidence

- RED (preserved, pre-interruption): the migration-built DB spec run found
  `onboarding_idempotency_records` and `onboarding_sessions` as unclassified
  tenant-bearing tables — 1 failed, 4 passed — reproducing the missing-RLS class
  that staging exposed on `onboarding_sessions`.
- GREEN: unit suite 18/18; DB suite 5/5 after recording the two onboarding tables
  as explicit `debt` ratchet entries (fixture debt, recorded not hidden).
- Authored lines: this continuation authored ~330 lines (manifest 132; verifier
  +142; task record ~55); the preserved pre-interruption files carry the rest of
  the T1 surface (classifier 303, unit spec 270, DB spec 363), for ~1265 authored
  lines across the six authorized paths. The surface was pre-authorized as three
  files plus manifest/verifier/task record; the T2/T3 slices stay well under the
  ~400-line review bound because they only add migrations and domain tests.
- Runtime harness: command 4 is the disposable two-scenario schema harness
  (scenario 1 empty-database rebuild; scenario 2 partial-ledger re-run); the
  coverage gate runs in both and fails on unclassified tables, direct tables
  missing tenant_id/ENABLE/FORCE/policy, tenant-bearing global/parent-owned,
  stale manifest entries, and stale debt. Observed counters, both scenarios:
  manifest tables 79, classified 79 (direct 32, parent-owned 5, global 8,
  debt 34), failures 0; the gate also caught and failed a real defect during
  bring-up (boolean spelling drift in the catalog feed), proving it fails
  closed rather than passing vacuously.
- Side effects: none outside the six authorized paths. No production migration,
  commit, push, PR, deploy, staging mutation, provisioning, or Q80 operation.
- Rollback boundary: only the six authorized paths; removing/reverting them
  returns to `88dd778` without touching migrations or runtime behavior.

## Deferred backlog

- Physical Q80 L1-06, runtime L2, restart recovery, and first-business go/no-go remain
  in the readiness todo; they are not absorbed into #493.
- Approved issues #489–#492 remain outside the readiness critical path unless runtime
  evidence promotes one into a blocker.
