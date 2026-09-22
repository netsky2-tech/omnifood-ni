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

Status: in progress; T1 dependency satisfied by `b23a8b7`. T2.S1 is committed
as `5bbefe5`; T2.S2a is committed as `26342d2`; T2.S2b is committed as
`25496f7`; T2.S3a is GREEN, independently verified, and committed as
`f37b572`; T2.S3b is GREEN, independently verified, and committed as
`7f14d63`; T2.S4 is in progress. **S1 must NOT be deployed alone**: the S1 policies intentionally
make the still-unbound runtime paths fail closed, so S2 (session/idempotency
service binding on the same transaction/manager) has to land in the same release
before any deploy. Deploy remains unauthorized while S3/S4 onboarding debt is
open.

Implementation route: delegated direct. Trigger evidence: understanding the
onboarding/activation path requires mapping more than four migration, service,
repository, and DB-test surfaces before the bounded multi-file writer starts.

Delivery slices:

1. **T2.S1 — session/idempotency policies (completed: `5bbefe5`):**
   migration-built RED, ENABLE+FORCE and command-appropriate policies for
   `onboarding_sessions` and `onboarding_idempotency_records`, plus atomic
   manifest promotion.
2. **T2.S2 — session/idempotency binding (completed):** split into two bounded,
   deployment-coupled work units: **S2a** binds `OnboardingSessionService`
   (`26342d2`); **S2b** binds `OnboardingIdempotencyCoordinator` (`25496f7`).
   Both replace vacuous synchronize/superuser tests and are independently verified.
3. **T2.S3 — template/import/legacy policies (in progress):** split into two
   bounded work units. **S3a** protects template/provenance tables
   (`onboarding_template_applications`, `onboarding_template_seed_links`,
   `legacy_onboarding_migration_receipts`) — completed as `f37b572`; **S3b** is
   implemented and GREEN on the worktree for import/integrity tables
   (`legacy_import_integrity_reports`, `product_import_sessions`,
   `staging_importacion_productos`) — completed as `7f14d63`. Each migration
   atomically promotes its manifest entries and joins scenario-2 replay.
4. **T2.S4 — template/import/legacy binding (in progress):** bind every affected
   production flow and prove activation/import behavior under the runtime-shaped role.

S1 and S2 must both land before any deploy; S1 alone intentionally makes unbound
runtime paths fail closed. No privacy/consent table exists in the current schema, so
there is no fabricated target for that vocabulary.

Next step (T2 entry point): **T2.S4** — bind the import/integrity production
flows (`ImportStagingService`, `LegacyImportIntegrityReportService`, and the
related legacy flow) on the same transaction/manager vocabulary; S3a and S3b
leave no binding debt behind (no service binding belongs to a policies slice).

- [x] RED: migrate the existing onboarding session/idempotency DB tests away from
      `synchronize: true`/superuser and reproduce cross-tenant visibility under the
      runtime-shaped role. (S2a session spec 7/1 RED; S2b idempotency spec 4/1 RED.)
- [x] Add ENABLE+FORCE and command-appropriate policies for onboarding, template,
      import, and legacy onboarding tables required by fresh-tenant setup.
      (S1, S3a, and S3b complete; no privacy/consent schema target exists.)
- [ ] Preserve authorized provisioning through an explicit transaction boundary;
      do not keep broad visibility to accommodate seeds.
- [x] Prove tenant-local SELECT/INSERT/UPDATE/DELETE and reject foreign writes.
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

T2.S2a evidence (implemented, independently verified, committed as `26342d2`;
NOT deployed):

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
  schema verifier, controllers, and unrelated services untouched. Functional
  commit `26342d2` was created locally; no push, PR, deploy, staging mutation,
  provisioning, or Q80 operation.
- Next step: T2.S2b — bind `OnboardingIdempotencyCoordinator` through the
  same transaction/manager pattern and replace its vacuous DB test; S2a and
  S2b must land together before any deploy.

T2.S2b evidence (implemented, independently verified, committed as `25496f7`;
NOT deployed):

- Route: delegated direct implementation on the same S1/S2a migration-built
  fixture vocabulary. Three files touched:
  `src/modules/onboarding/services/onboarding-idempotency.coordinator.ts`,
  `src/modules/onboarding/services/onboarding-idempotency.coordinator.spec.ts`,
  `test/onboarding/onboarding-idempotency.db.e2e-spec.ts` (plus this evidence).
- Binding shape: `acquireLease` now runs its lookup/insert/reclaim inside one
  canonical `runInTenantTransaction` (repository resolved from the transaction
  manager after the transaction-local parameterized `app.tenant_id` binding);
  the public params object is unchanged. `completeSuccess`/`completeFailure`
  keep their positional signatures and gain an optional trailing `tenantId`:
  with a supplied `EntityManager` they bind `app.tenant_id` on that exact
  manager (never a nested transaction), mutate through the manager's
  repository, and without one they open one canonical tenant transaction
  bound to the explicit tenant, or to the tenant discovered from the record
  when the connection can see it (legacy 2-arg callers). An explicit blank
  tenant fails fast with `TenantContextRequiredError` before any SQL; a
  hidden or unreadable completion target fails closed with a non-disclosing
  `ConflictException` (no blind zero-affected mutation). No tenant-id WHERE
  clauses were added as an RLS substitute; idempotency semantics
  (tenant-keyed uniqueness, lease ownership/expiry, FAILED_RETRYABLE vs
  FAILED_FINAL replay, payload/error shape, atomic transitions) are preserved.
- Strict RED (behavioral, observed): the rewritten DB e2e spec was authored
  and run BEFORE the binding, compiling against the then-unbound coordinator
  on the migration-built fixture's table-non-owner `NOSUPERUSER NOBYPASSRLS`
  runtime role: 4 failed / 1 passed. Failures were RLS-behavioral, not
  compile/config: `new row violates row-level security policy for table
  "onboarding_idempotency_records"` on the pooled INSERT for acquire, and a
  blank-tenant call reaching PostgreSQL (`invalid input syntax for type
  uuid: ""`) instead of failing closed. One test-design artifact was fixed
  before counting the RED (raw SQL rows typed as the entity).
- GREEN (through the production coordinator, same spec, same role): 6/6 —
  role/catalog non-ownership, tenant-local acquire + caller-bound-manager
  success completion + ALREADY_COMPLETED replay with cached result,
  same-key isolation across tenants (B's active lease does not block A; two
  rows for one key) with forged cross-tenant completion rejected and B's row
  byte-verified unchanged, blank-tenant and unbound-completion fail-closed
  with B's row unchanged, no-manager completion through the coordinator's own
  bound transaction, and the lease matrix (active-lease conflict, integrity
  conflict, expired-lease reclaim attemptCount 2, retryable-failure replay
  attemptCount 3, final-failure BadRequest replay).
- Unit spec (ordering/fail-fast proofs are unit-level GREEN evidence; the
  behavioral RED above carries the strict-TDD obligation): 17/17 — each
  protected operation proven to bind `TENANT_CONTEXT_SET_CONFIG_SQL` before
  its first repository access, to resolve the repository from the transaction
  manager (pooled repository never touched), to reuse a provided manager
  without opening a nested transaction, to open exactly one transaction on
  the no-manager path, to fail fast on blank tenants before any SQL or repo
  access, to prevent protected access when the in-transaction binding fails
  or the transaction fails to open, and all pre-existing idempotency
  semantics re-covered.
- TRIANGULATION defect found and fixed during GREEN: an unbound pooled read
  can ERROR (not merely return zero rows) once the connection has ever
  served a transaction-local `set_config` binding — PostgreSQL keeps the
  custom parameter defined as `''` after that transaction ends (observed
  after both ROLLBACK and COMMIT), so the S1 policy predicate's `'' ::uuid`
  cast fails. The coordinator's legacy discovery probe therefore catches
  discovery failures and fails closed with the non-disclosing
  `ConflictException` instead of mutating blind; a dedicated unit case covers
  it. WARNING for S3/S4 (pre-existing, systemic, outside this slice): every
  unbound pooled SELECT on any tenant-RLS table shares this hazard once the
  pool has served a bound transaction — fail-closed, but erroring instead of
  zero rows.
- Verification (all observed, one at a time): `npx jest
  src/modules/onboarding/services/onboarding-idempotency.coordinator.spec.ts
  --runInBand` → 17/17; `npx jest --config ./test/jest-e2e.json --runInBand
  onboarding-idempotency.db.e2e-spec` → RED 4 failed/1 passed pre-binding,
  6/6 post-binding; `npm run test:db` → 45 suites / 256 tests passed;
  `npm run build` → clean; `SCHEMA_CHECK_DB=omnifood_schema_build_test bash
  scripts/verify-schema-build.sh` → PASS both scenarios (coverage 79/79:
  direct 34, parent-owned 5, global 8, debt 32, failures 0); `git diff
  --check` → clean. Independent follow-up also ran the only legacy two-argument
  completion callers: `onboarding-fault-injection.db.e2e-spec` → 6/6 and
  `onboarding-74-scenarios-normative.db.e2e-spec` → 9/9.
- Authored lines: ~1100 across the three code files (coordinator ~316
  rewritten, unit spec ~536, DB e2e spec ~646 incl. replaced lines). Exceeds
  the ~400 advisory bound; the excess is test surface preserved for
  correctness; the coordinator's behavioral diff is small and additive.
- Rollback boundary: the three code paths plus this evidence; reverting them
  restores the committed S2a state (`cf5c7b6` worktree baseline) without
  touching migrations, schema, or data.
- No side effects: session service/tests, migrations, manifest, schema
  verifier, controllers, sibling e2e specs (fault-injection, 74-scenarios —
  which the additive signatures keep source-compatible), and unrelated
  services untouched. Functional commit `25496f7` was created locally; no push,
  PR, deploy, staging mutation, provisioning, or Q80 operation.
- Next step: T2.S3 — template/import/legacy policies; S2b leaves no binding
  debt behind.

T2.S3a evidence (implemented, independently verified, committed as `f37b572`;
NOT deployed):

- Route: delegated direct implementation on the same S1/S2a migration-built
  fixture vocabulary. Three code/config files touched:
  `src/migrations/1809230000000-EnforceOnboardingTemplateRls.ts`,
  `src/migrations/1809230000000-EnforceOnboardingTemplateRls.spec.ts`,
  `test/onboarding/onboarding-template-rls.db.e2e-spec.ts` (plus the manifest,
  the schema verifier, and this evidence). Exactly three direct-tenant tables
  are in scope: `onboarding_template_applications`,
  `onboarding_template_seed_links`, `legacy_onboarding_migration_receipts`.
- Migration shape: ENABLE + FORCE RLS and one command-specific policy per
  command (`{table}_tenant_{select|insert|update|delete}`) per table, with the
  canonical USING/WITH CHECK halves (SELECT/DELETE/UPDATE USING, INSERT and
  UPDATE WITH CHECK, UPDATE both) carrying the per-table predicate resolved
  through `resolveTenantRlsPredicate` (uuid form after rebinds
  1809080000000/1809140000000; a partial-ledger re-run still resolves AS IT
  IS). `up()` is idempotent (DROP POLICY IF EXISTS + catalog-guarded CREATE);
  `down()` drops exactly its twelve policies and removes FORCE while keeping
  ENABLE — no table drop, truncate, or delete. No service binding belongs to
  S3a; S4 binds the flows.
- Strict RED (behavioral, observed): the DB e2e spec was authored and run
  BEFORE the migration existed (it imports nothing from it, so there were no
  compile/config/fixture errors), building the schema with the full migration
  set minus this slice: 6 failed / 3 passed on the table-non-owner
  `NOSUPERUSER NOBYPASSRLS` runtime role. Behavioral failures across all three
  tables: RLS disabled/unforced (structural pg_class/pg_policies facts),
  unbound role saw both tenants' rows, tenant A saw B's rows (and B saw A's,
  triangulation), a foreign-tenant INSERT was ACCEPTED (resolved instead of
  rejected — the missing WITH CHECK shape), and a cross-tenant UPDATE touched
  tenant B's row. 3 passed pre-migration were the seed/role-shape test and
  the own-tenant CRUD proofs, which RLS must not break.
- GREEN (same spec after adding migration 1809230000000): 9/9 — each table
  structurally protected (relrowsecurity + relforcerowsecurity true and
  exactly the four command-specific policies per table), unbound role sees
  zero rows everywhere, tenant-local SELECT/INSERT/UPDATE/DELETE works per
  table (own-tenant INSERT proven as fresh tenant C, so no unique constraint
  masks the WITH CHECK), foreign INSERT rejected with row-level security
  error, and cross-tenant UPDATE/DELETE affect zero rows. All observations
  run in rolled-back transactions bound with the production
  `TENANT_CONTEXT_SET_CONFIG_SQL`.
- Unit spec: 13/13 — exact three-table scope (no other ALTER TABLE target),
  one independent predicate resolution per table (including the mixed
  uuid/varchar case), 15 uuid predicate halves with no text-form leakage,
  command-semantics placement of USING/WITH CHECK, drop-before-create and
  catalog-guarded CREATE idempotency, and down() safety (exactly its policies,
  FORCE removed, ENABLE kept, no DISABLE/TRUNCATE/DROP TABLE/DELETE).
- Manifest promotion (atomic with the migration in this work unit): the three
  target entries moved debt→direct; counters updated 34→37 direct and 32→29
  debt (classified stays 79).
- Runtime harness wiring: `EnforceOnboardingTemplateRls1809230000000` added
  exactly once to scenario-2 `partial_ledger_names` with
  `expected_deleted_rows` 28→29, so the DB replay of this migration is
  observed in the same work unit.
- Verification (all observed, one at a time): unit `npx jest
  src/migrations/1809230000000-EnforceOnboardingTemplateRls.spec.ts
  --runInBand` → 13/13; DB e2e `npx jest --config ./test/jest-e2e.json
  --runInBand onboarding-template-rls` → RED 6 failed/3 passed
  pre-migration, then 9/9; `npm run test:db` → 45 suites / 256 tests passed;
  `npm run build` → clean; `SCHEMA_CHECK_DB=omnifood_schema_build_test bash
  scripts/verify-schema-build.sh` → PASS both scenarios, ledger rows removed
  29 (expected 29), coverage 79/79 classified (direct 37, parent-owned 5,
  global 8, debt 29, failures 0); `git diff --check` → clean.
- Authored lines: ~890 across the three code files (migration 124, unit spec
  215, DB e2e 530) plus ~10 manifest/verifier lines. The e2e exceeds a minimal
  proof deliberately: per-table policy-shape proofs (own CRUD, foreign-insert
  rejection, cross-tenant update/delete zero rows) must cover each of the
  three tables or the slice could ship with one table silently unprotected.
- Rollback boundary: the three code files plus the three manifest promotions,
  the one partial-ledger entry/count change, and this evidence; removing them
  restores the committed S2b state (`4450b37` worktree baseline) without
  touching application data or the S1/S2 migrations/services.
- No side effects: S1/S2 migrations/tests/services, import/integrity target
  tables, controllers, and sibling e2e specs untouched. Functional commit
  `f37b572` was created locally; no push, PR, deploy, staging mutation,
  provisioning, or Q80 operation.
- Next step: T2.S3b — import/integrity
  tables (`legacy_import_integrity_reports`, `product_import_sessions`,
  `staging_importacion_productos`) with the same migration/proof shape and
  atomic manifest promotion.

T2.S3b evidence (implemented, independently verified, committed as `7f14d63`;
NOT deployed):

- Route: delegated direct implementation on the same S3a migration/proof
  vocabulary. Three code/config files touched:
  `src/migrations/1809240000000-EnforceOnboardingImportRls.ts`,
  `src/migrations/1809240000000-EnforceOnboardingImportRls.spec.ts`,
  `test/onboarding/onboarding-import-rls.db.e2e-spec.ts` (plus the manifest,
  the schema verifier, and this evidence). Exactly three direct-tenant tables
  are in scope: `legacy_import_integrity_reports`,
  `product_import_sessions`, `staging_importacion_productos`.
- Migration shape: identical to S3a — ENABLE + FORCE RLS and one
  command-specific policy per command
  (`{table}_tenant_{select|insert|update|delete}`) per table, with the
  canonical USING/WITH CHECK halves carrying the per-table predicate resolved
  through `resolveTenantRlsPredicate` (uuid form after rebinds
  1809070000000/1809140000000; a partial-ledger re-run still resolves AS IT
  IS). `up()` is idempotent (DROP POLICY IF EXISTS + catalog-guarded CREATE);
  `down()` drops exactly its twelve policies and removes FORCE while keeping
  ENABLE — no table drop, truncate, or delete. No service binding belongs to
  S3b; S4 binds `ImportStagingService`,
  `LegacyImportIntegrityReportService`, and the related legacy flow.
- Strict RED (behavioral, observed): the DB e2e spec was authored and run
  BEFORE the migration existed, building the schema with the full migration
  set minus this slice: 6 failed / 3 passed on the table-non-owner
  `NOSUPERUSER NOBYPASSRLS` runtime role. Behavioral failures across all
  three tables: RLS disabled/unforced (structural pg_class/pg_policies
  facts), unbound role saw both tenants' rows, tenant A saw B's rows (and B
  saw A's, triangulation), a foreign-tenant INSERT was ACCEPTED (the missing
  WITH CHECK shape), and a cross-tenant UPDATE touched tenant B's row. 3
  passed pre-migration were the seed/role-shape test and the own-tenant CRUD
  proofs, which RLS must not break. (An earlier 7/2 run had a fixture-caused
  session-id mismatch; the seed was fixed and the clean behavioral RED is
  the observed 6/3 — no compile/config/fixture failure stands in the RED.)
- GREEN (same spec after adding migration 1809240000000): 9/9 — each table
  structurally protected (relrowsecurity + relforcerowsecurity true and
  exactly the four command-specific policies per table), unbound role sees
  zero rows everywhere, tenant-local SELECT/INSERT/UPDATE/DELETE works per
  table (own-tenant INSERT proven as fresh tenant C), foreign INSERT
  rejected with a row-level security error, and cross-tenant UPDATE/DELETE
  affect zero rows. Constraint shapes handled explicitly so they never mask
  the RLS verdict: staging's uq_staging_importacion_tenant_token_ordinal is
  satisfied with per-proof fresh tokens and row_ordinal 1, staging's uuid id
  (no DB default) is supplied explicitly, `product_import_sessions` seeds
  carry `source_hash` (its only NOT NULL column without a default), and the
  integrity report's jsonb/boolean/status NOT NULL columns all carry
  migration defaults.
- Unit spec: 13/13 — exact three-table scope (no other ALTER TABLE target),
  one independent predicate resolution per table (including the mixed
  uuid/varchar case), 15 uuid predicate halves with no text-form leakage,
  command-semantics placement of USING/WITH CHECK, drop-before-create and
  catalog-guarded CREATE idempotency, and down() safety (exactly its
  policies, FORCE removed, ENABLE kept, no DISABLE/TRUNCATE/DROP
  TABLE/DELETE).
- Manifest promotion (atomic with the migration in this work unit): the
  three target entries moved debt→direct; counters updated 37→40 direct and
  29→26 debt (classified stays 79).
- Runtime harness wiring: `EnforceOnboardingImportRls1809240000000` added
  exactly once to scenario-2 `partial_ledger_names` with
  `expected_deleted_rows` 29→30, and the harness observed the replay:
  "ledger rows removed: 30 (expected 30)".
- Verification (all observed, one at a time): unit `npx jest
  src/migrations/1809240000000-EnforceOnboardingImportRls.spec.ts
  --runInBand` → 13/13; DB e2e `npx jest --config ./test/jest-e2e.json
  --runInBand onboarding-import-rls` → RED 6 failed/3 passed pre-migration,
  then 9/9; `npm run test:db` → 45 suites / 256 tests passed; `npm run
  build` → clean; `SCHEMA_CHECK_DB=omnifood_schema_build_test bash
  scripts/verify-schema-build.sh` → PASS both scenarios, ledger rows removed
  30 (expected 30), coverage 79/79 classified (direct 40, parent-owned 5,
  global 8, debt 26, failures 0); `git diff --check` → clean.
- Authored lines: ~856 across the three code files (migration 123, unit spec
  215, DB e2e 518) plus ~10 manifest/verifier lines.
- Rollback boundary: the three code files plus the three manifest
  promotions, the one partial-ledger entry/count change, and this evidence;
  removing them restores the committed S3a state (`d0ad81c` worktree
  baseline) without touching application data or the S1/S2/S3a
  migrations/tests/services or template/provenance targets.
- No side effects: S1/S2/S3a migrations/tests/services, template/provenance
  targets, controllers, and sibling e2e specs untouched. Functional commit
  `7f14d63` was created locally; no push, PR, deploy, staging mutation,
  provisioning, or Q80 operation.
- Next step: T2.S4 — bind `ImportStagingService`,
  `LegacyImportIntegrityReportService`, and the related legacy flow before
  any deploy.

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
| T2 | S1 `5bbefe5`; S2a `26342d2`; S2b `25496f7`; S3a `f37b572`; S3b `7f14d63`; S4 pending | S1: unit `npx jest src/migrations/1809220000000-EnforceOnboardingSessionRls.spec.ts --runInBand` → 13/13; DB e2e `npx jest --config ./test/jest-e2e.json --runInBand onboarding-session-rls` → RED 6 failed/3 passed pre-migration, then 9/9. S2a: unit `onboarding-session.service.spec.ts` → 18/18; DB e2e `onboarding-session.db.e2e-spec` → RED 7 failed/1 passed pre-binding, then 8/8. S2b: unit `onboarding-idempotency.coordinator.spec.ts` → 17/17; DB e2e `onboarding-idempotency.db.e2e-spec` → RED 4 failed/1 passed pre-binding, then 6/6; legacy callers 6/6 and 9/9. S3a: unit `1809230000000-EnforceOnboardingTemplateRls.spec.ts` → 13/13; DB e2e `onboarding-template-rls` → RED 6 failed/3 passed pre-migration, then 9/9; harness both scenarios PASS (direct 37, debt 29, total 79, failures 0, ledger replay 29/29). S3b: unit `1809240000000-EnforceOnboardingImportRls.spec.ts` → 13/13; DB e2e `onboarding-import-rls` → RED 6 failed/3 passed pre-migration, then 9/9; harness both scenarios PASS (direct 40, debt 26, total 79, failures 0, ledger replay 30/30). Full DB 45 suites/256; build clean; `git diff --check` clean | S1–S3b behavioral RED/GREEN observed, independently verified, and committed; S4 pending |
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
