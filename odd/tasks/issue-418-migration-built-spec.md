# Issue #418 — DB specs build their schema with synchronize, hiding drift production has

**Issue:** #418 `chore(testing): DB specs build schema with synchronize, hiding drift that production has`
**Branch:** `chore/418-migration-built-spec`
**Base:** `main` @ `ab5e818`
**Status:** implemented and independently verified by the parent, including the mutation RED. Ready for a
work-unit commit.

## Outcome, scoped deliberately

**One** DB spec builds its schema by running the migration set, as a role that does not bypass RLS, with
the cost **measured** rather than argued. The issue allows the honest answer to be "not worth it for all
42 specs, but worth it for the ones that exercise RLS", so the measurement is the deliverable and the
conversion is how it is obtained.

## Why now

Three production bugs shipped through this hole — #286, #358, #412 — for the same reason: the entity is
the test's schema source, so a lying annotation makes the test construct a schema production does not
have. The column-type ratchet (#406) now covers the annotation half. **Nothing covers the fixture half.**

## Measured before designing

- **One full migration set costs ≈ 2–2.5 s.** The whole harness — `npm run build` plus **two** migration
  runs plus every verification query — takes **11.87 s**, and `npm run build` alone is **6.93 s**. So the
  marginal cost of converting a spec is a couple of seconds plus role/schema provisioning, not tens.
- **`npm run test:db` is 42 suites** running `--runInBand`; `test:e2e` is 50. Neither total is recorded
  anywhere, so the converted spec's own runtime is the number to capture.
- **The migration set mostly survives a non-`public` `search_path`.** Nearly every policy and type guard
  filters on `current_schema()`, and `tenant-rls-policy.ts` never mentions `public`. Two exceptions,
  both load-bearing below.

## The two constructs that dictate the helper's shape

1. **`CREATE EXTENSION "uuid-ossp"` has no `SCHEMA` clause** (`1759000000003-CreateBootstrapExtensions.ts:28`),
   so the extension lands in `public` and `uuid_generate_v4()` — used by
   `1788000000000-CreateImportStagingTable.ts` — only resolves if `public` is on the `search_path`. Every
   existing scratch-schema harness appends `, public`; that is not cosmetic. A converted spec whose
   `search_path` omits it fails.
2. **The bootstrap enum guards hardcode `n.nspname = 'public'`** (`1759000000001:58`,
   `1759000000002:72,86,100,119`, `1759000000004:54`). Under a scratch `search_path` the guard never
   sees the type it just created, so it re-issues `CREATE TYPE`: fine once, `type already exists` on a
   re-run in the same schema. Harmless for a one-shot build, and it must be **documented in the helper**
   rather than discovered by the next person who tries to reuse the schema.
3. `down()` hardcodes `public` in the bootstrap migrations, so the helper is **up-only** and says so.

## Design (frozen)

**1. A reusable helper**, following `src/modules/identity/human-authorization/runtime/ohac-publication-db.fixture.ts`
— the existing pattern that already does schema + `search_path` + restricted role + real migrations by
`.up()` — extended to the **full** migration set, which nobody has done yet:

- create `CREATE SCHEMA "<prefix>_<uuid>"` on the admin connection;
- ensure `uuid-ossp` exists as the administrator (the harness's provisioning model: extensions are
  infrastructure, the migration role never needs extension privileges);
- create a `LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS` role, grant schema usage and
  create, and pin its `search_path` to `"<schema>", public` — `ALTER ROLE … SET search_path` like the
  existing fixture, so pooled connections resolve unqualified SQL;
- run the full migration set **as that role**, and return `{ dataSource/manager, schema, role, teardown }`;
- tear down with `DROP SCHEMA … CASCADE` and `DROP ROLE`.

Prefer TypeORM's own executor over calling `.up()` one by one if it works under a pinned `search_path`;
if it does not, apply `.up()` in order and say so. Either way, the migrations — not the entities — are
the schema's source.

**2. Convert exactly one spec: `test/onboarding/readiness-tenant-binding.db.e2e-spec.ts`.** It is the
right first target and the alternatives are worse:

- It **uses `synchronize: true`**, which is the defect, and it is the #358 regression whose own header
  documents that synchronize hides RLS.
- It **hand-writes the `invoices` RLS policy** today. After the conversion the policies come from the
  migrations, so the spec stops asserting against a copy of reality.
- `src/modules/onboarding/services/activation.service.db.spec.ts` and
  `test/onboarding/onboarding-readiness.db.e2e-spec.ts` create **no policy and use no restricted role**,
  so converting them would not demonstrate the RLS benefit that justifies the work.
- `src/migrations/1806000000000-…db.spec.ts` is the smallest diff but it already runs a real migration
  and hand-builds its tables, so it does not have the problem this issue is about.

Drop `synchronize: true`, drop the hand-written policy, keep the restricted role for the reads, and keep
the #358 assertions — the poisoned-pool reproduction and the fixed-path success must still hold, which is
the proof that the conversion did not weaken the regression test it is built on.

**3. Assert the schema is real.** The issue's criterion is explicit: the converted spec must assert that
`pg_policies` contains rows, so RLS is genuinely exercised rather than assumed. With migrations the
policy set is the real one, so this is a stronger assertion than the hand-written copy it replaces.

**4. Measure.** Record, for this spec: the migration-built setup wall-clock, the old `synchronize` setup
wall-clock, the spec's total runtime before and after, and the resulting recommendation for the rest.

**5. Prove the spec can fail on entity/schema drift.** The ratchet's manifests are now **empty**, so there
is no live divergence to point at and the demonstration must be a **mutation**: add an entity-driven
assertion scoped to the columns this spec depends on — comparing the TypeORM metadata's declared type
against `information_schema` for the migration-built schema — then mutate one entity annotation to the
wrong type, show the spec goes **red**, and revert byte-identically. The precedent is recorded in
`odd/tasks/issue-286-slice-b1.md:159`. Without this the conversion is only a schema change; with it, the
spec demonstrably catches what CI could not.

## Stop condition

The fixtures are the risk: the spec currently seeds tenants, users, products and an invoice through entity
repositories against a `synchronize` schema, and a migration-built schema enforces the real `NOT NULL`s,
foreign keys, enum members and the XOR actor constraint. **If making the fixtures satisfy the real schema
turns into more than a handful of edits, or reaches beyond this spec's own file and the helper, stop and
report the list.** The measurement is the deliverable; the conversion is how it is obtained, and "the
fixture cost is N files and here they are" is a legitimate and useful result for this issue.

## Evidence recorded

**The converted spec passes, and the #358 regression is intact on a migration-built schema.** Its five
tests, all green in ~4.6 s: the drift assertion, the real `pg_policies` assertion, the poisoned-pool
reproduction, the fixed-path readiness evaluation, and the blank-tenant guard. The `synchronize: true`
call and the hand-written `invoices` policy and view are gone — the policies now come from the
migrations, so the spec stopped asserting against a copy of reality.

**The mutation RED, reproduced by the parent.** `Invoice.user_id` changed from `uuid` to `varchar`:

```
✕ declares the same column types the migration-built schema has: entity metadata vs
  information_schema for every column this spec depends on
    + "invoices.user_id: entity declares character varying, migrations built uuid"

Tests: 1 failed, 4 passed, 5 total
```

The other four still pass **under the lie**, which is precisely the invisibility this assertion closes —
that is the demonstration, not the failure. The mutation was reverted byte-identically (`git diff`
empty).

**Measured cost, timed rather than estimated.**

| | |
| --- | --- |
| Migration-built setup | **1958–2177 ms** per run (migrations alone 1799–2019 ms) |
| Old `synchronize` setup | **405 ms** |
| Spec runtime | **2.824 s → 4.722–4.832 s**, a marginal **+1.9–2.0 s** per converted suite |

The prediction from the harness held: one full migration set is ≈ 2 s, so the cost is the migration run
plus role and schema provisioning, not tens of seconds.

**The recommendation, and it is the point of the issue: convert the RLS-exercising stragglers, not the
suite.** Converting all 42 `test:db` suites at +1.9 s each under `--runInBand` would add roughly **+80 s
to a 27.4 s suite**, and 26 of the `synchronize: true` specs create no policy and use no restricted role,
so they would gain nothing for that price. Two are worth it: `src/modules/sales/services/invoices.service.db.spec.ts`
(hand-writes its policies — the strongest candidate) and
`src/modules/fulfillment/services/fulfillment-retention.service.db.spec.ts`, together ≈ **+3.8 s**. The
OHAC runtime specs already run real migrations through the existing OHAC fixture and are not targets.

**Three gotchas the helper surfaced, and the third is the instructive one.** None was predicted:

- The bootstrap enum guards hardcode `n.nspname = 'public'`, so in a scratch schema they see `public`'s
types, skip creating their own, and a later `ALTER TYPE products_product_type_enum` resolves to
`public` and fails with `must be owner`.
- An explicit `GRANT CONNECT` on the shared database blocks `DROP ROLE` through `pg_shdepend`. `CONNECT`
is `PUBLIC` by default, so the grant was dropped and the teardown revokes before dropping.
- **The workaround for the first one broke CI, and only CI could show it.** The first iteration
pre-created that enum in the scratch schema *unconditionally*. Locally that is necessary, because the
provisioned `public` makes the guard skip. In CI the database is fresh, `public` has no such type, the
guard correctly issues `CREATE TYPE` into the scratch schema, and it collides with the pre-created copy:
`QueryFailedError: type "products_product_type_enum" already exists`, five tests red. The three suites
passed locally on the broken version too.

The fix mirrors `public`'s enum types into the scratch schema **only where they exist in `public`** and
not in the scratch schema, owned by the migration role. The clone list is empty in a fresh database and
nine long in a provisioned one. Both were then verified by running the spec against a freshly created
`omnifood_418_fresh` **and** against the provisioned `omnifood` — one environment passing would have
proven nothing, since that is exactly how the first version shipped.

The lesson generalizes past this helper: **a workaround conditioned on one environment's state is a bug
in the other, and local green is not evidence when the condition is environmental.**

All three are documented in the helper. Same lesson as the column-type ratchet: the traps that matter are
the ones only a real run reveals.

**Suites green.** `npm test` 243 suites / 2251 tests (8 skipped); `npm run test:db` 42 / 243;
`npm run test:e2e` 50 / **399** — two more than before, which are the new drift and `pg_policies`
assertions. `npx eslint` clean on both changed files.

**Review size.** 795 lines across two files: a 275-line helper and a converted spec whose diff is
+226/−112. Over the 400 budget, and this time there is no clean seam — the assertion only means anything
in a spec that builds from migrations, so the helper and its one consumer are one artifact.

## Non-goals

- Converting more than one spec.
- Unifying the 40+ divergent `withIsolatedSchema` copies; that is a separate, mechanical change and doing
  it here would bury the measurement.
- Making the full migration set idempotent under a scratch `search_path` (the bootstrap enum guards).
  Recorded, not fixed.
