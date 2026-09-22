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
`7f14d63`; T2.S4 is complete in the worktree (S4a/S4b/S4c committed as
`41a14a9`/`008749a`/`2e2e626`; S4d observed RED→GREEN, uncommitted). **S1 must NOT be deployed alone**: the S1 policies intentionally
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
4. **T2.S4 — template/import/legacy binding (complete, S4d uncommitted):** four bounded work
   units: **S4a** binds `IndustryTemplateService.applyTemplate` and the newly
   discovered `TemplatePreviewService.buildPreview` seed-link read (completed:
   `41a14a9`); **S4b** binds
   `LegacyTemplateRecipeScanService`; **S4c** binds `ImportStagingService`; **S4d**
   binds `LegacyImportIntegrityReportService` (all four completed). Every unit requires a migration-built
   runtime-role application-path proof before deploy.

S1 and S2 must both land before any deploy; S1 alone intentionally makes unbound
runtime paths fail closed. No privacy/consent table exists in the current schema, so
there is no fabricated target for that vocabulary.

Founder decisions for S4: include `TemplatePreviewService.buildPreview` in this
change because it reads the newly protected seed-link table and would otherwise be
a known deploy regression; preserve `ImportStagingService.commitImport` post-commit
onboarding start/reconcile semantics rather than expanding atomicity in #493.

Next step: ~~T2.S4a~~, ~~T2.S4b~~, ~~T2.S4c~~, and ~~T2.S4d~~ implemented and
observed green in the worktree. **T2 remains IN PROGRESS**: the S4d unit is
uncommitted (parent-owned), the activation-attempt/priming proof and the
final consolidated check re-run/commit boxes are still open, and the
post-deploy staging probe requires explicit authorization. Deploy remains
unauthorized and staging evidence is T4. S3a and S3b leave no policy debt
behind.

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

Checklist reconciliation (evidence correction): T2 stays IN PROGRESS with only
the genuinely completed boxes checked. The activation-attempt/priming proof
has not been run as a proof and stays unchecked; the commit box stays
unchecked until the parent commits the S4d unit; the provisioning-boundary,
final consolidated check, and post-deploy staging boxes remain open until
their evidence exists.

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
- Next step: ~~T2.S4 — bind `ImportStagingService`,
  `LegacyImportIntegrityReportService`, and the related legacy flow before
  any deploy.~~ S4a complete (below); S4b next.

#### T2.S4a evidence (implemented, independently verified, committed; deploy
unauthorized):

- Scope: `IndustryTemplateService.applyTemplate` and
  `TemplatePreviewService.buildPreview` — the two production flows touching
  the FORCE-RLS tables `onboarding_template_applications`,
  `onboarding_template_seed_links`, and the already-protected
  `onboarding_sessions` (S1 policies). Both services were bounded by the
  founder decisions recorded for S4 (preview included; commitImport
  atomicity untouched).
- Binding: `applyTemplate` replaced its bare `this.dataSource.transaction`
  with `runInTenantTransaction(this.dataSource, trimmedTenant, ...)` — same
  manager-resolved repositories, unique-violation retry, `selectionHash`,
  idempotent replay/`summary_json`, conflict semantics, result shape, and
  public signature preserved. `buildPreview` wrapped its seed-link/insumo/
  product reads in ONE `runInTenantTransaction` using ONLY manager-scoped
  repositories (`manager.getRepository`); the pooled repositories are never
  touched inside the bound path; output shape and error semantics preserved.
  A new `DataSource` constructor argument was added to
  `TemplatePreviewService` (Nest resolves it by class; the three direct
  construction sites were updated).
- Fail-closed: both services now call `resolveTenantContextId` up front, so
  a blank tenant raises `TenantContextRequiredError` before even the global
  template lookup and without opening a transaction — the established S2
  contract (the previous local `BadRequestException` guards are superseded).
- Strict RED (behavioral, observed): the new migration-built DB e2e spec
  `test/onboarding/industry-template-application.db.e2e-spec.ts` was
  authored and run BEFORE the binding change, on the committed migrations
  (1809230000000 already applied — schema untouched, `synchronize: false`):
  6 failed / 4 passed with the table-non-owner `NOSUPERUSER NOBYPASSRLS`
  runtime role. RLS-caused failures: unbound `applyTemplate` denied on the
  `onboarding_template_applications` INSERT ("new row violates row-level
  security policy"), unbound session read denied (own session unresolved →
  BadRequest), unbound `buildPreview` reading its own seeded seed link as
  NEW (row invisible), and the five binding-dependent GREEN assertions
  failing for lack of a bound context. 4 passed pre-binding were the raw
  role/policy probes and the blank-tenant fail-closed path, which the
  binding must not break.
- GREEN (same spec after binding): 9/9 — tenant-local apply succeeds with
  exact counts (CAFETERIA: 7 insumos, 5 products, 5 recipes, 4 UOM
  conversions) and one APPLIED application row with `summary_json`; replay
  of the same idempotency key returns the stored summary with zero duplicate
  writes (1 application, 17 seed links); a session-linked apply resolves the
  bound own session and rejects a foreign tenant's session; foreign tenant
  rows remain non-disclosing and unmutated (bound foreign probe sees exactly
  its own single application); a mid-flow failure (admin-added CHECK probe
  on the scratch schema) rolls back application, seed-link, and catalog
  writes with nothing persisted; preview returns the bound tenant's payload
  (own link EXISTING_LINKED, own name-match EXISTING_UNLINKED, foreign rows
  invisible/NEW); blank tenant fails closed for both services.
- Unit specs: `industry-template.service.spec.ts` 16/16 and
  `industry-template-safe-cutover.spec.ts` 8/8 (added: bind-before-first-
  protected-access ordering via `TENANT_CONTEXT_SET_CONFIG_SQL`,
  manager-scoped-repository-only access, blank-tenant
  `TenantContextRequiredError` with no transaction and no set_config SQL,
  binding-failure propagation with no protected write);
  `template-preview.service.spec.ts` 10/10 (same new ordering/scope/fail-
  fast/binding-failure cases plus re-covered preview behaviors).
- Verification (all observed, one at a time): `npx jest
  src/modules/onboarding/services/industry-template.service.spec.ts
  src/modules/onboarding/services/industry-template-safe-cutover.spec.ts
  --runInBand` → 22/22; `npx jest
  src/modules/onboarding/services/template-preview.service.spec.ts
  --runInBand` → 10/10; `npx jest --config ./test/jest-e2e.json --runInBand
  industry-template-application` → RED 6 failed/4 passed pre-binding, then
  9/9; `npm run test:db` → 45 suites / 256 tests passed; `npm run build` →
  clean; `SCHEMA_CHECK_DB=omnifood_schema_build_test bash
  scripts/verify-schema-build.sh` → PASS both scenarios (direct 40, debt 26,
  total 79, failures 0); `git diff --check` → clean.
- Authored lines: ~700 across five code files (service binding ~45, unit
  spec additions ~150, preview spec rewrite 311, DB e2e 558) — no
  migration, manifest, schema verifier, session/idempotency, import,
  integrity, or controller changes.
- Rollback boundary: the five code files plus this evidence; removing them
  restores the committed S3b state (`7f14d63`) without touching schema,
  data, or any S1–S3b artifact.
- No side effects: migrations, manifest, schema verifier,
  session/idempotency services, import/integrity services, and controllers
  untouched; no commit, push, PR, deploy, staging mutation, provisioning,
  or Q80 operation.
- Independent verification (VERIFIED): all six gates green; the appended
  `DataSource` argument was confirmed DI-safe because it is the LAST
  constructor parameter, every class provider and direct construction site
  passes it last, and no `useFactory` registration exists for either service.
  Two LOW findings recorded: (a) the blank-tenant error for these two flows
  changed from the local `BadRequestException` (400) to the
  `TenantContextRequiredError` (401) that the bound-service family already
  establishes in S2a/S2b — intentional convergence, but a user-visible HTTP
  status change for blank-tenant callers; (b) one e2e test title still read
  "captures behavioral RED" while asserting the GREEN bound result. Finding
  (b) was corrected post-verification as a string-only test-title change and
  the focused e2e command was re-run green (9/9); no assertion or behavior
  changed. One INFO note was also confirmed harmless: a probe comment says
  "set_config + rollback" while that probe transaction commits; the
  transaction-local discard effect is identical and the probe uses a
  disposable pool.
- Next step: ~~T2.S4b~~ completed in the worktree (evidence below); **T2.S4c** —
  bind `ImportStagingService` on the same transaction/manager vocabulary with
  a migration-built application-path proof.

#### T2.S4b evidence (implemented, independently verified, committed;
deploy still unauthorized)

Scope: bind `LegacyTemplateRecipeScanService.scanAndRemediate` — the last
template-path flow still using pooled/unbound repositories against protected
tables (`onboarding_sessions`, `invoice_items`,
`legacy_onboarding_migration_receipts`).

- RED (new migration-built runtime-role spec
  `test/onboarding/legacy-template-recipe-scan.db.e2e-spec.ts` run against
  the COMMITTED unbound service on the committed policy migrations; 5
  failed / 2 passed, all behavioral): blank tenant still raised the local
  `BadRequestException('Tenant ID is required')` instead of
  `TenantContextRequiredError`; the unbound scan could not persist any
  receipt (`new row violates row-level security policy for table
  "legacy_onboarding_migration_receipts"`) while the recipe-version UPDATE
  had already committed through a pooled autocommit write — the atomicity
  defect observed directly (recipe left DRAFT/SUGGESTED with zero receipts);
  the usage and operational proofs degraded silently (protected
  `invoice_items`/`onboarding_sessions` reads invisible to the unbound
  pool, so a used recipe and an activated tenant's unused recipe were both
  routed to auto-MOVE_TO_DRAFT before the denied receipt insert). The raw
  runtime-role probe and the foreign-tenant untouched assertion passed in
  both phases, as designed.
- GREEN (same spec after binding): 7/7 — bound tenant scan migrates its own
  unused template recipe to DRAFT and retains unknown provenance without
  mutation, persisting exactly two tenant-local receipts; a used template
  recipe stays PUBLISHED through the bound `invoice_items` count (tenant
  with no session); an activated tenant's unused recipe stays PUBLISHED
  through the bound `onboarding_sessions` read; a foreign tenant's recipe
  is never read, mutated, or receipted by other tenants' scans; blank
  tenant fails closed with `TenantContextRequiredError` before any SQL;
  mutation + receipts commit or roll back together (admin REVOKE/GRANT of
  INSERT on the receipts table forces the receipt write to fail mid-scan
  and the recipe UPDATE rolls back with it; after re-grant the same scan
  succeeds end to end).
- Service change: appended `DataSource` LAST (S4a precedent, DI-safe); the
  whole scan runs inside ONE `runInTenantTransaction` — `app.tenant_id`
  bound before the first protected read, recipe-version/save,
  session, invoice-item, receipt, and global-template reads all resolved
  from the transaction manager; the five pooled repository injections are
  preserved (DI surface untouched, no reorder/removal) but never used for
  protected data; blank tenant fails fast via `resolveTenantContextId`;
  `RecipeOrigin`/publication-state semantics, `userDecision` handling, the
  unknown-provenance rule, the three counters, receipt shape,
  `LegacyScanReport` shape, and the public signature are unchanged;
  `firstSuccessfulSaleAt` is only ever read, never invented or set.
- Unit spec (`legacy-template-recipe-scan.service.spec.ts`) 8/8: added
  bind-before-first-protected-access ordering via
  `TENANT_CONTEXT_SET_CONFIG_SQL`, manager-scoped repository resolution for
  all four protected repositories, single-transaction proof
  (`dataSource.transaction` exactly once), blank-tenant fail-fast before
  any transaction or SQL, binding-failure and transaction-open-failure
  propagation with zero writes; existing behaviors re-covered through the
  transaction manager mock; the one direct `new` construction site updated
  to pass the `DataSource` last.
- Verification (all observed, one at a time): `npx jest
  src/modules/onboarding/services/legacy-template-recipe-scan.service.spec.ts
  --runInBand` → 8/8; `npx jest --config ./test/jest-e2e.json --runInBand
  legacy-template-recipe-scan` → RED 5 failed/2 passed pre-binding, then
  7/7; sibling suites `onboarding-template-cutover` → 5/5 and
  `onboarding-w9` → 4/4 (constructor/DI regressions none; all five e2e
  testing modules already provide `DataSource`, so no e2e edits were
  needed); `npm run test:db` → 45 suites / 256 tests passed; `npm run
  build` → clean; `SCHEMA_CHECK_DB=omnifood_schema_build_test bash
  scripts/verify-schema-build.sh` → PASS both scenarios (direct 40, debt
  26, total 79, failures 0); `git diff --check` → clean.
- Authored lines: ~800 across four files (service binding ~60 net, unit
  spec rewrite ~330, DB e2e ~560) plus this record — no migration,
  manifest, schema verifier, template apply/preview, session/idempotency,
  import, integrity service or controller changes; `onboarding.module.ts`
  needed no edit (class provider registration unchanged, `DataSource`
  resolvable as in S4a).
- Known error-contract change (same as S4a, intentional): blank-tenant
  callers now get `TenantContextRequiredError` (HTTP 401 via the exception
  filter) instead of the previous `BadRequestException` (400).
- Rollback boundary: the four code files plus this evidence; removing them
  restores the committed S4a state (`41a14a9`) without touching schema,
  data, or any S1–S4a artifact.
- No side effects: migrations, manifest, schema verifier, template
  apply/preview, session/idempotency, import, and integrity services and
  controllers untouched; no push, PR, deploy, staging mutation,
  provisioning, or Q80 operation.
- Independent verification (VERIFIED): all nine gates green. Confirmed the
  five injected repositories have zero `this.<repo>` uses inside the bound
  path (only `this.dataSource`), the REVOKE/GRANT receipt-failure injector
  genuinely rolls back the preceding recipe UPDATE, `DataSource` appended
  last keeps module providers and both `new` sites correct, and
  semantics/counters/receipt shapes plus the read-only
  `firstSuccessfulSaleAt` are unchanged. Residual risk recorded,
  non-blocking and owned by T3: `recipe_versions` (like
  `industry_templates`/`template_*`) carries no RLS in this migration set,
  so its cross-tenant safety is the explicit `tenant_id` filter plus
  single-transaction atomicity rather than an independent DB guard; T3 must
  add that defense in depth. RED was not re-observed by the verifier (only
  its diff-level consistency); the writer's observed RED stands as
  recorded.
- Next step: ~~T2.S4c~~ completed and committed (evidence below); **T2.S4d**
  follows; T2 remains in progress and deploy remains unauthorized.

### T2.S4c — ImportStagingService tenant binding (independently verified)

Status: implemented in the worktree, observed RED→GREEN, NOT committed (the
parent owns terminal git actions); T2 remains in progress.

- Scope honored: only the service, its unit spec, the mocked e2e spec, the
  new migration-built e2e spec, and this record changed. Migrations, manifest,
  schema verifier, template/session/idempotency/integrity services and
  controllers untouched.
- Behavioral RED (observed BEFORE the binding change, on committed migrations
  `008749a` state): new spec
  `apps/admin_backend/test/onboarding/import-staging.db.e2e-spec.ts` run on
  the migration-built schema with the fixture's NOSUPERUSER/NOBYPASSRLS
  runtime role → 4 failed / 2 passed — all three uploads failed with
  `QueryFailedError: new row violates row-level security policy for table
  "staging_importacion_productos"`, and the foreign-tenant preview failed
  with `NotFoundException` from RLS-invisible staged rows. Compile/config
  failures: none. The two passing tests (raw non-owner probe, blank-tenant
  fail-closed) are the control group.
- Service change: `uploadRawCsv`, `uploadBatch`, `commitImport`, `getPreview`
  and `getFailedRows` now run entirely inside ONE `runInTenantTransaction` —
  `app.tenant_id` bound on the transaction manager before the first protected
  access. The pooled `productRepo.find` duplicate-detection reads moved
  INSIDE the transaction (`manager.find(Product)`) so the RLS-debt `products`
  table shares the bound manager for forward correctness (T3); staging,
  session, receipt, and preview product reads are all manager-scoped. The
  `pooledRepo.create(...)` + `manager.save(...)` pattern is gone: sessions and
  receipts are created via `manager.create(...)`, so no write mixes
  connections. Optional-dependency null-safety preserved (`sessionRepo`,
  `receiptRepo`, `onboardingSessionService`, `onboardingStateReconciler`
  guards unchanged; session/receipt writes still skipped when absent; the
  founder decision stands — `ensureOnboardingStarted` + `reconcile` remain
  AFTER the commit transaction, best-effort, not atomic).
- Preserved semantics: READY/COMMITTED/PARTIALLY_COMMITTED lifecycle,
  REPLACE/SKIP/FAIL duplicate policy, ALL_OR_NOTHING rollback, AC-24
  zero-defaults, receipt payload/shape, preview payload, Spanish row error
  messages, and every public signature. Known error-contract change (same as
  S4a/S4b, intentional): blank-tenant callers now get
  `TenantContextRequiredError` (HTTP 401) instead of `BadRequestException`
  (400), failing fast before any SQL in every public method.
- Unit spec 22/22: added bind-before-first-protected-access ordering via
  `TENANT_CONTEXT_SET_CONFIG_SQL`, exactly-one-transaction/one-binding per
  public method, zero pooled-repository use across all five flows,
  manager-scoped session/receipt creation, blank-tenant fail-fast before any
  SQL, binding-failure and transaction-open-failure propagation with zero
  writes, and optional-dependency-absent behavior; existing behavior
  re-covered through the transaction manager mock (`mockManager` gained the
  `query` shape; getPreview/getFailedRows mocks moved from pooled repos to
  `mockManager.find/findOne`).
- Mocked e2e (`import-staging.e2e-spec.ts`): only added `query` to the mocked
  transaction manager (3 lines) — all 11 tests pass unchanged.
- Migration-built e2e 6/6 (GREEN): full batch journey (upload → preview →
  commit → failed rows) with duplicate REPLACE (currentPrice 120 proves the
  manager-scoped product read), AC-24 zero defaults, receipt written with the
  commit, PARTIALLY_COMMITTED for error-bearing batches and COMMITTED for the
  error-free CSV flow; raw-CSV journey; ALL_OR_NOTHING zero-write rollback;
  foreign-tenant staging/session/product non-disclosure and non-mutation with
  a disposable bound probe; blank-tenant fail-closed with zero writes.
- Verification (all observed, one at a time): `npx jest
  src/modules/onboarding/services/import-staging.service.spec.ts --runInBand`
  → 22/22; `npx jest --config ./test/jest-e2e.json --runInBand
  import-staging.db.e2e-spec` → RED 4 failed/2 passed pre-binding, then 6/6;
  `npx jest --config ./test/jest-e2e.json --runInBand
  onboarding-import-cutover` → 7/7; `... onboarding-security-isolation` →
  6/6; `npm run test:db` → 45 suites / 256 tests passed; `npm run build` →
  clean; `SCHEMA_CHECK_DB=omnifood_schema_build_test bash
  scripts/verify-schema-build.sh` → PASS both scenarios (direct 40, debt 26,
  total 79, failures 0); `git diff --check` → clean.
- Authored lines: ~1120 across four files (DB e2e ~640, unit spec +330,
  service net ~91 insertions/39 deletions ignoring re-indentation — the raw
  diff is larger because moved blocks re-indent inside the transaction
  callbacks; mocked e2e +3) plus this record.
- Rollback boundary: the four code files plus this record; reverting restores
  the committed S4b state (`008749a`) without touching schema, data, or any
  S1–S4b artifact.
- No side effects: migrations, manifest, schema verifier, template,
  session/idempotency/integrity services and controllers untouched; no push,
  PR, commit, deploy, staging mutation, provisioning, or Q80 operation.
- Independent verification (VERIFIED): all nine gates green. Confirmed one
  bind plus one transaction per public method with the bind first; zero
  pooled-repository use for protected data; every optional collaborator
  guarded; the five public signatures unchanged; `ALL_OR_NOTHING` rollback
  proven positively by admin-side zero counts on products, receipts, and
  staged rows with the session left READY rather than by absence of an
  exception; and the founder decision honored (`ensureOnboardingStarted` and
  `reconcile` still run after the commit transaction resolves). Residual
  risks recorded, non-blocking: `products` remains RLS debt until T3 so its
  reads are a no-op today under the bound manager, and there is no
  same-name cross-tenant product collision test yet (T3 must add it); the
  post-commit onboarding start/reconcile stays intentionally non-atomic, so
  a post-commit failure leaves the commit persisted; and the blank-tenant
  contract changed to `TenantContextRequiredError` as in S4a/S4b.
- Next step: ~~T2.S4c~~ completed and committed (evidence below); **T2.S4d**
  implemented and observed green in the worktree (uncommitted); T2 remains
  IN PROGRESS — deploy remains unauthorized, staging evidence is T4.

### T2.S4d — LegacyImportIntegrityReportService tenant binding (last mandatory T2 binding)

Status: implemented in the worktree, observed RED→GREEN→REFACTOR-clean, NOT
committed (the parent owns terminal git actions); T2 is recorded honestly as
IN PROGRESS below — deploy remains unauthorized and staging evidence is T4.

- Scope honored: only the service, its unit spec, the new migration-built e2e
  spec, a two-line fixture fix in `onboarding-import-cutover.db.e2e-spec.ts`,
  and this record changed. Migrations, manifest, schema verifier, template,
  session/idempotency/staging services and controllers untouched. The
  `onboarding-security-isolation.db.e2e-spec.ts` surface needed no change
  (it mocks the integrity service; observed 6/6 unchanged).
- Behavioral RED (observed BEFORE the binding change, on committed migrations
  `d525bf0c` state): new spec
  `apps/admin_backend/test/onboarding/legacy-import-integrity.db.e2e-spec.ts`
  run on the migration-built schema with the fixture's NOSUPERUSER/NOBYPASSRLS
  runtime role → **8 failed / 2 passed** — both generate flows failed with
  `new row violates row-level security policy for table
  "legacy_import_integrity_reports"`, expire silently expired ZERO rows
  (staging reads invisible), remediate/accept failed at the scan step with the
  same RLS denial, reconcile failed with `NotFoundException: Onboarding session
  not found` (session invisible), the rollback-poison proof failed on the RLS
  denial instead of the poison guard, and blank-tenant still threw
  `BadRequestException` instead of `TenantContextRequiredError`. Compile/config
  failures: none. The two passing tests (raw non-owner probe, foreign-tenant
  isolation) are the control group. Unit spec RED: 18 failed / 3 passed (the
  passing three are behaviors that already exist: unknown-report, missing
  session, optional-sessionRepo-absent).
- Service change: `generateIntegrityReport`, `expireIncompatibleLegacyStaging`,
  `remediateReportWithInventoryCommand`, `acceptReportAsIs` and
  `reconcileLegacyBaselineSession` now run entirely inside ONE
  `runInTenantTransaction` — `app.tenant_id` bound on the transaction manager
  before the first protected access. Every protected read/write (staging,
  reports, receipts, onboarding sessions, and the RLS-debt `products` scan
  read) resolves from the transaction manager; the pooled constructor
  repositories stay part of the DI surface (S4a precedent) but are never used
  for protected data. Report+receipt writes that were two separate pooled
  statements now commit or roll back atomically inside the bound transaction.
  `kardexStockFor` was refactored to take the CALLER'S bound manager instead
  of opening its own transaction (it had exactly one caller, so no standalone
  path was kept); the kardex aggregate shares the caller's snapshot and
  atomicity boundary.
- Preserved semantics: report payload/status/severity aggregation,
  threshold and discrepancy math, expiry lifecycle transitions and Spanish
  row message, accept-as-is rationale rules,
  `reconcileLegacyBaselineSession` setting `legacyBaseline=true` /
  `measurementEligible=false` and NEVER writing `firstSuccessfulSaleAt`, the
  kardex-failure log-and-continue catch, error messages, optional
  `sessionRepo` null-safety (`Session repository unavailable` guard kept, now
  checked before any SQL), and every public signature. Known error-contract
  change (same as S4a/S4b/S4c, intentional): blank-tenant callers now get
  `TenantContextRequiredError` before any SQL in every public method.
- Known pre-existing decision-receipt gap (recorded honestly, NOT fixed by
  S4d): only `remediateReportWithInventoryCommand` short-circuits on an
  already-REMEDIATED report (no second receipt); `acceptReportAsIs` has NO
  `ACCEPTED_AS_IS` short-circuit, so a repeat call writes a second receipt
  for the same report. This predates S4d and is unchanged by it; follow-up
  candidate for T3/T4 or a separate issue.
- Intentional fail-closed consequence (documented): because the kardex read
  now shares the caller's transaction, a hard kardex SQL failure aborts the
  whole scan transaction instead of degrading to `kardexStock 0` — the
  pre-S4d tolerated path (own transaction + pooled insert) is exactly the
  "quietly wrong integrity report" #358 diagnosed, and the catch remains in
  place to log the cause. The cutover spec's `synchronize: true` fixture was
  missing `inventory_kardex` (production always has it); registering
  `InventoryMovement` in its entity list is a fixture-shape fix, not a
  behavior change. Proof of the fail-closed consequence (observed, not
  asserted): the new migration-built revoked-SELECT e2e case, which provokes
  a hard `permission denied` on `inventory_kardex` for the runtime role and
  shows the scan rolling back to admin-side zero counts; plus the observable
  fact that the cutover fixture only passed once `inventory_kardex` was
  registered. The JS catch remains but can no longer recover the shared
  transaction — it can only log.
- Unit spec 21/21: added bind-before-first-protected-access ordering via
  `TENANT_CONTEXT_SET_CONFIG_SQL`, exactly-one-transaction/one-binding per
  public method, zero pooled-repository use across all five flows,
  caller-provided-manager kardex reuse (one transaction, kardex SQL on the
  bound manager), same-transaction report+receipt writes, receipt-failure
  propagation, blank-tenant fail-fast before any SQL in all five methods,
  binding-failure and transaction-open-failure propagation with zero writes,
  and optional-sessionRepo-absent behavior; existing behavior re-covered
  through the transaction manager mock (`mockManager` gained the `query`
  shape; all pooled-repo mocks moved to `mockManager.find/findOne/create/
  save`).
- Migration-built e2e 11/11 (GREEN): runtime-role non-owner/non-bypass raw
  probe; blank-tenant fail-closed; REVIEW_REQUIRED scan with observed writes
  (productStock 50 vs kardex 30, discrepancy 20, kardex evidence present)
  persisting report+receipt atomically; CLEAN scan with its CLEAN receipt;
  expiry updating two incompatible rows (sparing the compatible one) with the
  per-session receipt atomically; remediation short-circuit observed (one
  remediation receipt after two calls; accept-as-is has no such
  short-circuit — pre-existing gap recorded above); accept-as-is atomic;
  `reconcileLegacyBaselineSession` setting the baseline flags while a REAL
  seeded `first_successful_sale_at` is preserved verbatim with its receipt;
  mid-flow receipt-write failure (poison trigger) rolling back report AND
  receipt to admin-side zero counts with staging still COMMITTED; a hard
  kardex read failure inside the shared transaction (revoked-SELECT probe)
  failing closed with zero orphaned reports/receipts and unchanged
  staging/session state, then succeeding once privileges are restored;
  foreign tenant rows invisible and unmutated with a bound cross-tenant probe.
- Verification (all observed, one at a time; re-run after the evidence
  corrections): `npx jest
  src/modules/onboarding/services/legacy-import-integrity-report.service.spec.ts
  --runInBand` → 21/21 (the kardex-failure case now asserts honest
  poisoned-transaction propagation); `npx jest --config ./test/jest-e2e.json
  --runInBand legacy-import-integrity` → RED 8 failed/2 passed pre-binding,
  then 11/11 (including the new revoked-SELECT kardex fail-closed probe);
  `... onboarding-import-cutover` → 7/7 (after the two-line fixture fix);
  `npm run test:db` → 45 suites / 256 tests; `npm run build` → clean;
  `git diff --check` → clean.
- Authored lines: ~1800 across four files (DB e2e 800, unit spec ~805
  changed, service net ~150 insertions/120 deletions ignoring re-indentation
  of moved blocks, cutover fixture +2) plus this record.
- Rollback boundary: the four code files plus this record; reverting restores
  the committed S4c state (`2e2e6262`) without touching schema, data, or any
  S1–S4c artifact.
- No side effects: migrations, manifest, schema verifier, template,
  session/idempotency/staging services and controllers untouched; no push,
  PR, commit, deploy, staging mutation, provisioning, or Q80 operation.
- T2 status (honest): the four S4 bindings (S4a `41a14a9`, S4b `008749a`,
  S4c `2e2e626`, S4d observed here) plus S1–S3b RLS policies are all
  observed green in this worktree, but **T2 remains IN PROGRESS**: the S4d
  unit is uncommitted (parent-owned), the activation-attempt/priming proof
  and the final consolidated check re-run/commit boxes are still open, and
  the post-deploy staging probe requires explicit authorization. Deploy
  remains unauthorized and staging evidence remains T4. The `products` table
  remains RLS debt explicitly deferred to T3.
- Next step: complete the remaining open T2 checklist boxes (activation/
  priming proof, final consolidated checks, the parent-owned commit, then
  the authorized staging probe) before T3 — first-business transaction-path
  isolation — starts.

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
| T2 | S1 `5bbefe5`; S2a `26342d2`; S2b `25496f7`; S3a `f37b572`; S3b `7f14d63`; S4a `41a14a9`; S4b `008749a`; S4c `2e2e626`; S4d observed in the worktree (uncommitted) | S1: unit `npx jest src/migrations/1809220000000-EnforceOnboardingSessionRls.spec.ts --runInBand` → 13/13; DB e2e `npx jest --config ./test/jest-e2e.json --runInBand onboarding-session-rls` → RED 6 failed/3 passed pre-migration, then 9/9. S2a: unit `onboarding-session.service.spec.ts` → 18/18; DB e2e `onboarding-session.db.e2e-spec` → RED 7 failed/1 passed pre-binding, then 8/8. S2b: unit `onboarding-idempotency.coordinator.spec.ts` → 17/17; DB e2e `onboarding-idempotency.db.e2e-spec` → RED 4 failed/1 passed pre-binding, then 6/6; legacy callers 6/6 and 9/9. S3a: unit `1809230000000-EnforceOnboardingTemplateRls.spec.ts` → 13/13; DB e2e `onboarding-template-rls` → RED 6 failed/3 passed pre-migration, then 9/9; harness both scenarios PASS (direct 37, debt 29, total 79, failures 0, ledger replay 29/29). S3b: unit `1809240000000-EnforceOnboardingImportRls.spec.ts` → 13/13; DB e2e `onboarding-import-rls` → RED 6 failed/3 passed pre-migration, then 9/9; harness both scenarios PASS (direct 40, debt 26, total 79, failures 0, ledger replay 30/30). S4a: units `industry-template.service.spec.ts`+`industry-template-safe-cutover.spec.ts` → 22/22, `template-preview.service.spec.ts` → 10/10; DB e2e `industry-template-application` → RED 6 failed/4 passed pre-binding, then 9/9; full DB 45 suites/256; build clean; harness PASS; `git diff --check` clean. S4b: unit `legacy-template-recipe-scan.service.spec.ts` → 8/8; DB e2e `legacy-template-recipe-scan` → RED 5 failed/2 passed pre-binding, then 7/7; siblings `onboarding-template-cutover` 5/5, `onboarding-w9` 4/4; full DB 45 suites/256; build clean; harness PASS; `git diff --check` clean | S1–S3b behavioral RED/GREEN observed, independently verified, and committed; S4a committed, S4b observed in the worktree (uncommitted, unverified independently); S4c: unit `import-staging.service.spec.ts` → 22/22; DB e2e `import-staging.db.e2e-spec` → RED 4 failed/2 passed pre-binding (staging INSERT denied by RLS, preview NotFoundException from invisible rows), then 6/6; siblings `onboarding-import-cutover` 7/7, `onboarding-security-isolation` 6/6; full DB 45 suites/256; build clean; harness PASS; `git diff --check` clean — S4c behavioral RED/GREEN observed, independently verified, and committed. S4d: unit `legacy-import-integrity-report.service.spec.ts` → 21/21; DB e2e `legacy-import-integrity.db.e2e-spec` → RED 8 failed/2 passed pre-binding (report/receipt inserts denied by RLS, staging/session reads invisible, blank tenant `BadRequestException`), then 11/11 after the evidence corrections (including the revoked-SELECT kardex fail-closed probe); siblings `onboarding-import-cutover` 7/7, `onboarding-security-isolation` 6/6 (observed pre-correction, surface untouched); full DB 45 suites/256; build clean; `git diff --check` clean — S4d behavioral RED/GREEN observed in the worktree, uncommitted; T2 remains IN PROGRESS pending the S4d commit, the activation/priming proof, and the final consolidated check re-run |
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
