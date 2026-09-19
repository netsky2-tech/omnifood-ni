# Issue #358 — blank tenant context is a hard uuid cast failure

**Issue:** #358 `fix(db): a blank tenant context is a hard uuid cast failure, breaking onboarding readiness`
**Branch:** `fix/358-readiness-tenant-binding`
**Base:** `main` @ `6689bf3`
**Status:** W1 implemented and independently verified by the parent, including the proof that the new
regression test fails against the pre-fix behaviour. W2 recorded. Ready for a work-unit commit.

## Outcome

`GET /api/onboarding/readiness` and `GET /api/onboarding/activation/attempts/:id/diagnostics` stop
returning 500. The readiness evaluation reads RLS-protected tables inside a transaction where
`app.tenant_id` is bound, so the uuid-form policy predicate never evaluates `''::uuid`.

## The issue's framing is wrong, and the correction matters

The issue reads as "a blank tenant context reaches RLS-protected tables". Reconnaissance says the
**tenant id parameter is not the blank value**. `InventoryReadinessAdapter` guards it three times and
returns a `not-ready` snapshot rather than failing.

The blank is the **PostgreSQL session variable `app.tenant_id`**. The readiness fan-out runs on
default `DataSource` repositories — pooled connections on which this path has never issued
`set_config`. PostgreSQL keeps a *defined* placeholder for a transaction-local GUC (`''`), so
`current_setting('app.tenant_id', true)::uuid` raises `invalid input syntax for type uuid: ""`.

Only one readiness read touches an RLS-protected table: `invoices`, whose policy became the uuid form
in `1809060000000-AlignInvoiceTenantPolicyPredicate`. The other five adapters read `warehouses`,
`products`, `insumos`, `tenants`, `users`, `inventory_movements`, `recipe_versions` and `suppliers`,
none of which is RLS-protected. Verified in the scout report.

The issue also attributes the regression to #345. That is refuted by the repository's own record:
`odd/tasks/issue-286-tenant-id-uuid.md` describes #345 as the shared emitter *capability*, "inert, no
consumer". The invoices uuid predicate predates it. The real trigger is that the readiness path reads
an RLS table with the uuid predicate and never binds. Recorded rather than argued.

## The fix is already in the repository, one service over

`FiscalSetupService.getFiscalSetup` reads an RLS-protected view and does exactly the right thing, with
a comment stating why:

```ts
const activeParams = await this.dataSource.transaction(async (manager: EntityManager) => {
  await bindTenantContext(manager, trimmedTenantId);
  return manager.find(SystemParametersConfigActiveView, { where: { tenant_id: trimmedTenantId } });
});
```

The readiness path simply never received the same treatment. This is a per-site binding repository,
not an ambient request transaction: `core/database/tenant-transaction.ts` documents that binding is
transaction-local and that every tenant-bound transaction binds exactly once at its beginning.

## Design (frozen)

Bind inside `InventoryReadinessAdapter.evaluateInventoryReadiness`, mirroring `FiscalSetupService`:

1. Inject `DataSource`.
2. Keep the existing blank-tenant guard **unchanged**. It already fails closed (it returns
   `not-ready`, it never authorizes), it is tested, and the reported bug is not about it. Changing it
   is out of scope.
3. After the guard, run every query of the method inside `runInTenantTransaction(this.dataSource,
   trimmedTenant, async (manager) => …)`, taking all four repositories from `manager.getRepository(…)`
   rather than from injected default-connection repositories.
4. Drop the now-unused `@InjectRepository` constructor parameters from this adapter. Do not trim
   `TypeOrmModule.forFeature` in the module unless nothing else needs it — that is unrelated churn.

Why the whole method and not just the `invoices` count: the adapter is then correct by construction
for any of its tables that later gains RLS, at the cost of one transaction on a read-only path.

### Rejected alternatives, with the reason

- **`NULLIF(current_setting('app.tenant_id', true), '')::uuid` in the predicate emitter.** It would
  turn the failure into a quiet deny, which is the opaque production behaviour #286's Decision 2
  explicitly rejected, and it needs a migration rewriting roughly a hundred stored policies. It also
  leaves the missing binding in place. The schema check's assertion would still pass — verified by
  reading it, `apps/admin_backend/scripts/verify-schema-build.sh` requires `app.tenant_id` present,
  `::uuid` present, and no column-side `::text`, none of which `NULLIF` violates — so the check would
  become *blind* to the real defect. Rejected.
- **A request-scoped ambient transaction in `TenantInterceptor`.** Nest has no ambient request
  transaction today; this would add QueryRunner lifecycle machinery and connection-holding risk far
  beyond the reported failure.
- **Threading an `EntityManager` through all six readiness ports from the evaluator.** Structurally
  nicer, but it rewrites six ports, six adapters and their specs for one RLS read, and the repository
  already chose per-site binding in `FiscalSetupService`. Recorded as the follow-up rather than
  bundled into a fix for a blocked cohort.

## Work units

| Unit | Deliverable | Files | Status |
| --- | --- | --- | --- |
| W1 | Bind the readiness adapter's queries in a tenant transaction; update its spec; add the binding-contract regression coverage | `src/modules/onboarding/adapters/inventory-readiness.adapter.ts`, its spec, and a DB-backed spec | **DONE** — adapter binds, unit spec asserts the contract, DB spec reproduces the poisoning and fails against the pre-fix behaviour |
| W2 | Triage note: the class remains closed only by convention, not by construction | this document | **DONE** — see *Recorded decisions* |

## Mechanism, reproduced as a non-superuser

The scratch database built by `verify-schema-build.sh` has the real `invoices` policy, and the role
the harness provisions (`omnifood_schema_build_migrator`, `NOSUPERUSER`, `NOBYPASSRLS`) owns the
tables, so `FORCE ROW LEVEL SECURITY` applies to it. Transcript, one session, verbatim:

```
antes de cualquier bind: [<null>]        -- current_setting(..., true) is UNDEFINED
BEGIN
set_config('app.tenant_id','1111...',true)
COMMIT
despues del commit: []                   -- now DEFINED, and empty
SELECT count(*) FROM invoices;
ERROR:  invalid input syntax for type uuid: ""
```

**This is the correction the issue does not contain, and it changes the test.** An undefined
`app.tenant_id` is harmless: `current_setting(..., true)` returns NULL, `NULL::uuid` is NULL, and the
predicate simply matches nothing. The failure needs the setting to be **defined and empty**, and it
becomes that way only after a `set_config(..., true)` commits on the same pooled connection.

So #358 is a **connection-pool reuse bug**: any request that binds a tenant leaves the placeholder
defined as `''` when its transaction ends, and the next request on that same connection that reads an
RLS-protected table *without binding* gets the cast error. A fresh connection does not exhibit it,
which is why it is intermittent, why it survived CI, and why it consumed a cohort target.

Consequence for the regression test, and it is the easy way to write a vacuous one: **the test must
warm the connection with a bind before issuing the unbound read**, or it will pass against the bug.
The first reproduction attempt for this task did exactly that and passed for the wrong reason.

## Evidence plan

1. **Reproduced above**, as a non-superuser against the real policy: warm (bind + commit) then read
   unbound raises `invalid input syntax for type uuid: ""`; the same read inside a bound transaction
   succeeds. The fix is judged against that, not against prose.
2. **Binding-contract test**, following the precedent that already exists for the fiscal read path
   (`test/onboarding/fiscal-setup.e2e-spec.ts`, which asserts the read path issues `set_config`):
   assert that evaluating readiness issues `set_config('app.tenant_id', $1, true)` on the same
   executor that then runs the invoice count.
3. **Attempt the real regression test**: a DB-backed spec that enables and forces RLS on `invoices`,
   creates the uuid-form policy, and evaluates readiness through a connection that does not bypass
   RLS. If the existing test infrastructure (specs build schemas with `synchronize: true` and no RLS,
   and the CI role is `postgres`, which bypasses RLS) makes this impractical within the unit, say so
   and deliver the fallback — do not claim coverage that was not exercised.
4. `npm test`, `npm run test:db`, `npm run test:e2e` green; `npx eslint` on the changed paths only.

## Evidence recorded

**The regression test can fail, proven by the parent, not taken from the writer.** Replacing
`runInTenantTransaction` with a passthrough that runs the work against the `DataSource` — which is the
pre-fix behaviour, repositories off the default connection and no binding — makes the suite fail with
`QueryFailedError: invalid input syntax for type uuid: ""`, the production 500, on two of the three
tests. Test 1 still passes, because it asserts the mechanism rather than the adapter. The adapter was
restored and verified byte-identical. A test that cannot fail is a defect, so this is the load-bearing
evidence for the unit.

**Green with the fix.** `npm test` 237 suites / 2202 tests; `npm run test:db` 38 / 219; `npm run
test:e2e` 50 / 397. Zero failures. `npx eslint` on the three changed paths: exit 0.

**The spec runs in CI, and that was checked rather than assumed.** `test/jest-db.json` matches
`**/*.db.spec.ts` with its root at `src`, so this file is **not** part of `npm run test:db`; it is
picked up by `test/jest-e2e.json` (`testRegex: .e2e-spec.ts$`). CI runs both, so it is enforced either
way — but a spec placed in the wrong directory would have been silently dead.

**A warning, attributed honestly.** `npm run test:e2e` emits "A worker process has failed to exit
gracefully and has been force exited". Running the new spec alone emits it zero times, so it is
pre-existing and is already tracked by issue #25, not caused by this unit. The writer's report claimed
it had been resolved; the measurement says otherwise, and the measurement wins.

**Review size, over the 400 budget and disclosed.** 406 lines of new DB spec, 170 changed in the
adapter (of which the logical change is roughly 20 — the rest is the re-indentation the wrapper
requires), 144 in the adapter spec, 155 in this document. The load-bearing part of the spec is the
first test: the warm-up plus the assertion that the setting is empty and the unbound read throws.

## Non-goals

- Reconciling the annotations of #407.
- Deciding or rewriting the RLS predicate form.
- An ambient request-scoped transaction.
- Threading a manager through all six readiness ports.

## Recorded decisions

- **The blank-tenant guard in the adapter stays.** It fails closed already; the issue's "silent false
  green" concern does not apply to it, because it returns `not-ready` and never authorizes.
- **The class remains closed by convention.** After this fix, a future readiness adapter that reads an
  RLS-protected table without binding will reintroduce #358. The structural fix is the evaluator-owned
  transaction recorded above; it is deliberately not bundled here.
- **A stale comment is a defect.** `1809000000001-EnforceOnboardingFiscalTenantRls.ts` asserts that
  "an empty setting never equals a real `tenant_id`, so both deny access". That is false on a uuid
  column, and it is the assumption this bug grew from. Correct it in the same unit if the change stays
  inside the allowed surfaces; otherwise record it for the follow-up.
