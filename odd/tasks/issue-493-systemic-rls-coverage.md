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
- [x] Commit as one conventional work unit and record the commit below.
      Functional work unit: `b23a8b7` (`fix(db): add systemic RLS coverage ratchet`).

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

Status: in progress; T1 dependency satisfied by `b23a8b7`. T2.S1 is GREEN,
independently verified, and committed as `5bbefe5`; T2.S2a is implemented and
verified but NOT yet committed; S2b–S4 remain pending. **S1 must NOT be deployed
alone**: the S1 policies intentionally make the still-unbound runtime paths
fail closed, so S2 (session/idempotency service binding on the same
transaction/manager) has to land in the same release before any deploy.

Implementation route: delegated direct. Trigger evidence: understanding the
onboarding/activation path requires mapping more than four migration, service,
repository, and DB-test surfaces before the bounded multi-file writer starts.

Delivery slices:

1. **T2.S1 — session/idempotency policies (completed: `5bbefe5`):**
   migration-built RED, ENABLE+FORCE and command-appropriate policies for
   `onboarding_sessions` and `onboarding_idempotency_records`, plus atomic
   manifest promotion.
2. **T2.S2 — session/idempotency binding (in progress):** split into two bounded,
   deployment-coupled work units: **S2a** binds `OnboardingSessionService` and
   replaces its vacuous synchronize/superuser test (implemented, verified, not
   committed — see S2a evidence below); **S2b** does the same for
   `OnboardingIdempotencyCoordinator`. Both must land before deploy.
3. **T2.S3 — template/import/legacy policies:** cover the remaining six direct
   onboarding debt tables and promote them atomically in the manifest.
4. **T2.S4 — template/import/legacy binding:** bind every affected production flow
   and prove activation/import behavior under the runtime-shaped role.

S1 and S2 must both land before any deploy; S1 alone intentionally makes unbound
runtime paths fail closed. No privacy/consent table exists in the current schema, so
there is no fabricated target for that vocabulary.

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

T2.S1 evidence (implemented, independently verified, committed as `5bbefe5`):

- Route: delegated direct implementation; new migration
  `1809220000000-EnforceOnboardingSessionRls.ts` covers exactly
  `onboarding_sessions` and `onboarding_idempotency_records` — ENABLE+FORCE
  RLS plus command-specific `{table}_tenant_{select,insert,update,delete}`
  policies whose predicate is resolved per table through the shared
  `resolveTenantRlsPredicate` (uuid form post-rebind). The SQL is idempotent by
  construction (DROP POLICY IF EXISTS + catalog-guarded CREATE); DB-observed
  replay of this migration in scenario 2 was later proven by the verifier-
  requested partial-ledger correction (see "Verifier correction" below).
  `down()` drops only the four policies per table and removes FORCE,
  keeping ENABLE; never touches tables or rows.
- Verifier correction (evidence-only, MEDIUM, no correctness defect found):
  the independent verifier caught that the prior scenario-2 PASS did not
  actually replay `EnforceOnboardingSessionRls1809220000000`, because
  `scripts/verify-schema-build.sh` removed only a hardcoded 27-name
  partial-ledger list that predates the new migration. Correction applied:
  added `EnforceOnboardingSessionRls1809220000000` to the scenario-2
  `partial_ledger_names` list and bumped the expected ledger-row removals
  from 27 to 28; no other harness semantics changed. Re-run of the canonical
  harness then showed, in scenario 2, `ledger rows removed: 28 (expected 28)`
  followed by the actual TypeORM replay
  (`Migration EnforceOnboardingSessionRls1809220000000 has been executed
  successfully.`) after the ledger-row delete — the idempotent re-application
  is now DB-observed, not merely inferred. Both scenarios PASS with coverage
  manifest tables 79, classified 79, direct 34, debt 32, failures 0.
- Strict RED (behavioral, observed): the migration-built DB e2e spec
  `test/onboarding/onboarding-session-rls.db.e2e-spec.ts` was authored and
  run BEFORE the migration/manifest promotion against the full migration set
  fixture with the table-non-owner `NOSUPERUSER NOBYPASSRLS` runtime role:
  6 failed / 3 passed — no RLS on either table, unbound role counted 2 rows,
  tenant A saw tenant B's rows and vice versa, a foreign-tenant INSERT was
  accepted, and tenant A's UPDATE/DELETE touched tenant B's rows. Test-design
  artifacts were fixed first (unique-constraint masking on the insert
  probes, DML-RETURNING result shape) so the recorded RED is purely
  behavioral.
- GREEN: after the migration + atomic manifest promotion, the same spec runs
  9/9 (structural catalog facts, unbound sees zero, tenant-local visibility
  both directions, own insert accepted, foreign insert rejected, own
  update/delete works, cross-tenant update/delete affect zero rows).
  Triangulation covers the tenant-B side and own-row DML.
- Authored lines: ~717 (migration 115, unit spec 210, DB e2e spec 392, plus
  4/4 manifest line changes). This exceeds the ~400 advisory bound; the
  excess is test surface (two tables x full command matrix x two tenants)
  preserved for correctness rather than dropped.
- Runtime harness: `SCHEMA_CHECK_DB=omnifood_schema_build_test bash
  scripts/verify-schema-build.sh` — PASS in both scenarios after the
  verifier-requested partial-ledger correction (28 ledger rows removed and the
  new migration actually re-executed in scenario 2); coverage manifest
  tables 79, classified 79, direct 34, parent-owned 5, global 8, debt 32,
  failures 0.
- Rollback boundary: the six T2.S1 paths in commit `5bbefe5`; reverting the
  new migration, its spec, the DB proof, the two manifest promotions, the
  scenario-2 harness entry, and this evidence restores the T1 baseline without
  deleting or modifying application data.
- WARNING: S2 binding (same transaction/manager, replace vacuous
  synchronize/superuser tests) must land before any deploy — S1 alone
  intentionally fails the unbound runtime paths closed.

T2.S2a evidence (implemented and verified in the working tree; NOT committed,
NOT deployed — commit remains a user decision):

- Route: delegated direct implementation on the same S1 migration-built
  fixture vocabulary. Three files touched:
  `src/modules/onboarding/services/onboarding-session.service.ts`,
  `src/modules/onboarding/services/onboarding-session.service.spec.ts`,
  `test/onboarding/onboarding-session.db.e2e-spec.ts` (plus this evidence).
- Binding shape: the injected `OnboardingSession` repository is kept as the
  DI-stable handle to the request DataSource (its constructor signature is
  unchanged, so the untouched
  `test/onboarding/onboarding-idempotency.db.e2e-spec.ts` still compiles);
  every protected-table access now opens `runInTenantTransaction` and
  resolves the repository from that exact transaction manager after
  `app.tenant_id` is bound with the transaction-local parameterized
  `set_config`. No tenant-id SQL filters were added as an RLS substitute.
  Public API, optimistic-lock predicate/message, idempotent session start,
  write-once `onboardingStartedAt`, and lifecycle monotonicity are preserved
  verbatim inside the transactions; blank tenant ids now fail fast with
  `TenantContextRequiredError` before any SQL (fail-closed improvement).
- Strict RED (behavioral, observed): the rewritten DB e2e spec
  `test/onboarding/onboarding-session.db.e2e-spec.ts` was authored and run
  BEFORE the production binding, constructing the then-unbound service on the
  migration-built fixture's table-non-owner `NOSUPERUSER NOBYPASSRLS` runtime
  role: 7 failed / 1 passed. Failures were RLS-behavioral, not
  compile/config: `new row violates row-level security policy for table
  "onboarding_sessions"` on the service's INSERT, seeded sessions invisible
  to unbound reads (null), concurrent starts 0 fulfilled, and a blank-tenant
  call reaching PostgreSQL (`invalid input syntax for type uuid: ""`)
  instead of failing closed. One test-design artifact was fixed before
  counting the RED (the runtime DataSource needed the entity metadata
  registered — `EntityMetadataNotFoundError` — without `synchronize`).
- GREEN (through the production service, same spec, same role): 8/8 —
  role/catalog non-ownership, tenant-local create + idempotent re-start
  (write-once startedAt, version 2, exactly one row), tenant-local reads
  (A sees only A, B sees only B), optimistic-lock success then stale-version
  `ConflictException` with the persisted row verified via the superuser, a
  forged cross-tenant binding (B's row id claimed under A's tenant) rejected
  with zero rows affected, `saveSession` persisting only the bound tenant,
  blank-tenant fail-closed with a non-disclosing message, and concurrent
  starts producing exactly one session.
- Unit spec (RED not applicable — ordering/fail-fast proofs are unit-level
  GREEN evidence for the same change; the behavioral RED above carries the
  strict-TDD obligation): 18/18 — each protected operation proven to bind
  `TENANT_CONTEXT_SET_CONFIG_SQL` before its first repository access, to
  resolve the repository from the transaction manager (pooled repository
  never touched), to fail fast with `TenantContextRequiredError` before any
  SQL or repository access on a blank tenant, to prevent protected access
  when binding fails inside the transaction or the transaction fails to
  open, and all pre-existing lifecycle/optimistic-lock contracts re-covered.
- Verification (all observed, one at a time): `npx jest
  src/modules/onboarding/services/onboarding-session.service.spec.ts
  --runInBand` → 18/18; `npx jest --config ./test/jest-e2e.json --runInBand
  onboarding-session.db.e2e-spec` → RED 7/1 pre-binding, 8/8 post-binding;
  `npm run test:db` → 45 suites / 256 tests passed; `npm run build` → clean;
  `SCHEMA_CHECK_DB=omnifood_schema_build_test bash
  scripts/verify-schema-build.sh` → PASS both scenarios (coverage 79/79:
  direct 34, parent-owned 5, global 8, debt 32, failures 0);
  `git diff --check` → clean.
- Authored lines: ~800 across the three code files (service ~165, unit spec
  ~470, DB e2e spec ~465 incl. replaced lines). Exceeds the ~400 advisory
  bound; the excess is test surface (two specs rewritten from vacuous to
  runtime-shaped) preserved for correctness; the service diff itself is
  small.
- Rollback boundary: the three code paths plus this evidence; reverting them
  restores the committed S1 state (`5bbefe5`) and the pre-S2a task record
  without touching migrations, schema, or data.
- No side effects: idempotency coordinator/tests, migrations, manifest,
  schema verifier, controllers, and unrelated services untouched; no commit,
  push, PR, deploy, staging mutation, provisioning, or Q80 operation.
- Next step: T2.S2b — bind `OnboardingIdempotencyCoordinator` through the
  same transaction/manager pattern and replace its vacuous DB test; S2a and
  S2b must land together before any deploy.

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
| T1 | `b23a8b7` | unit: `npx jest src/core/database/tenant-rls-coverage.spec.ts --runInBand` → 18/18 passed; DB: `npx jest --config ./test/jest-db.json --runInBand tenant-rls-coverage` → 5/5 passed; suite: `npm run test:db` → 45 suites / 256 tests passed; harness: `SCHEMA_CHECK_DB=omnifood_schema_build_test bash scripts/verify-schema-build.sh` → PASS both scenarios, coverage 79/79 classified (32 direct, 5 parent-owned, 8 global, 34 debt), failures 0; `git diff --check` → clean | RED observed: `onboarding_idempotency_records` and `onboarding_sessions` surfaced as unclassified tenant-bearing tables (1 failed, 4 passed). GREEN and independent verification observed; T1 complete. |
| T2 | S1 `5bbefe5`; S2a implemented (uncommitted); S2b–S4 pending | S1: unit `npx jest src/migrations/1809220000000-EnforceOnboardingSessionRls.spec.ts --runInBand` → 13/13; DB e2e `npx jest --config ./test/jest-e2e.json --runInBand onboarding-session-rls` → RED 6 failed/3 passed pre-migration, then 9/9. S2a: unit `onboarding-session.service.spec.ts` → 18/18; DB e2e `onboarding-session.db.e2e-spec` → RED 7 failed/1 passed pre-binding (RLS-behavioral), then 8/8; suite `npm run test:db` → 45 suites / 256 tests; build clean; harness PASS both scenarios (direct 34, debt 32, total 79, failures 0); `git diff --check` clean | S1 behavioral RED and GREEN observed and committed; S1 scenario-2 replay DB-observed post-correction; S2a behavioral RED and GREEN observed, uncommitted; S2b–S4 pending |
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
- Side effects: none outside the six authorized paths. Functional commit `b23a8b7`
  was created locally. No production migration, push, PR, deploy, staging mutation,
  provisioning, or Q80 operation.
- Rollback boundary: only the six authorized paths; removing/reverting them
  returns to `88dd778` without touching migrations or runtime behavior.

## Deferred backlog

- Physical Q80 L1-06, runtime L2, restart recovery, and first-business go/no-go remain
  in the readiness todo; they are not absorbed into #493.
- Approved issues #489–#492 remain outside the readiness critical path unless runtime
  evidence promotes one into a blocker.
