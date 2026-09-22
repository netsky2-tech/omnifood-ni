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

Status: in progress

- [ ] RED: add a migration-built schema test that fails on an unclassified public
      base table and specifically reproduces the missing-RLS class.
- [ ] Define one deterministic classification source for direct tenant tables,
      parent-owned tables, global/pre-tenant exceptions, and prohibited/unclassified
      tables.
- [ ] GREEN: make schema verification fail for unknown tenant-bearing tables and for
      direct tables missing ENABLE/FORCE/policies, while recording current debt
      explicitly rather than hiding it.
- [ ] TRIANGULATE: prove a synthetic new tenant table is rejected and an approved
      platform-global table is accepted.
- [ ] REFACTOR: reuse existing tenant-RLS predicate/test helpers; do not introduce a
      parallel policy vocabulary.
- [ ] Run focused migration/schema checks and `git diff --check`.
- [ ] Commit as one conventional work unit and record the commit below.

Expected surfaces: schema-build verifier, one reviewed classification manifest or
module, focused tests, this task record. No production migration in this task.

### T2 — Enforce onboarding and activation critical-path RLS

Status: pending; depends on T1.

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
| T1 | pending | pending | pending |
| T2 | pending | pending | pending |
| T3 | pending | pending | pending |
| T4 | pending | pending | pending |

## Deferred backlog

- Physical Q80 L1-06, runtime L2, restart recovery, and first-business go/no-go remain
  in the readiness todo; they are not absorbed into #493.
- Approved issues #489–#492 remain outside the readiness critical path unless runtime
  evidence promotes one into a blocker.
