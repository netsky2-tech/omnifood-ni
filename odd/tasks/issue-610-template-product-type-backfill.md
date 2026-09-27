# #610 Part A — Backfill product_type for products created from an industry template

## What is left after #609, #612, #617 and #618

The code path is already correct: `industry-template.service.ts:383` creates applied
template products with `product_type: this.resolveTemplateProductType(source)`, and
`:541-552` returns `COMPOUND` for a template row carrying recipe items (and raises a
contradiction error if such a row also declares `SIMPLE`). So a template applied from
today onward produces `COMPOUND` products.

What is left is data: products created by an earlier application. Measured on the
pilot database:

```
rv.origin         | rv.suggestion_state | p.product_type | products
INDUSTRY_TEMPLATE | SUGGESTED           | SIMPLE         |  10      <- this unit
MANUAL            | CONFIRMED           | SIMPLE         |  10      <- NOT this unit (#611)
```

The 10 template rows sit in tenant `founder-pilot-q80-1788570657384-9d26201a`. Since
#612 shipped, **publishing any of their recipes fails**: the guard rejects a live recipe
on a `SIMPLE` product. So these tenants are stuck in the exact state #523 was built to
avoid — suggestions that exist and cannot be published, with an error message that tells
the operator to change a type they did not choose.

## Scope: 10 rows, mechanical, no judgment

Promote `products.product_type` from `SIMPLE` to `COMPOUND` **only** where the product
has an `INDUSTRY_TEMPLATE`-origin recipe version carrying at least one recipe item.

The criterion is the same signal the application code uses (`resolveTemplateProductType`
infers compound from the presence of recipe items). It is not a guess about the business:
the template authored a bill of materials for that product, which is the definition of
`COMPOUND` in this platform.

Deliberately excluded:

- **`MANUAL`-origin recipes.** Those 10 `SIMPLE` products in SOHO are #611. A human typed
  them; only the operator can say whether the item is a dish or resale. Promoting them
  would be us deciding a business fact, and #611's 17 already-sold invoice lines make
  that consequential.
- Products without recipe items on the template version. If a template suggested a recipe
  with zero components there is nothing proving the item is prepared.
- Anything already `COMPOUND`, `PREPARED` or `VARIANT_PARENT`.

## Migration shape — follow `1809160000000-ReconcileProductsProductType.ts`

That file is the repo's precedent for reconciling this exact column, and it establishes
the rules this migration inherits:

1. **Reconcile, review, never coerce.** It reads state before deciding and returns
   untouched when already converged, so a re-run is a no-op.
2. **Fail closed with an actionable message**, naming rows, rather than letting Postgres
   raise a bare enum error.
3. **Never rewrite a value it is guessing at** — the precedent refuses to infer a product
   type at all. This migration may only move `SIMPLE -> COMPOUND` on the proven criterion,
   and must name what it did.

Id: `1809510000000-BackfillTemplateProductTypes.ts` (`1809500000000` is the highest in
`main`; T1 took that slot).

### up()

- Counts candidates first. If zero, log and return (no-op on databases that never applied
  a template, which is most of them — including SOHO).
- Updates `SIMPLE` -> `COMPOUND` for products matching the criterion, scoped by the join to
  `recipe_versions.origin = 'INDUSTRY_TEMPLATE'`.
- Must not touch `updated_at` in a way that pretends an operator edited the row... follow
  whatever the entity expects; if `updated_at` is `@UpdateDateColumn`, letting it move is
  correct and honest (the row did change).
- Reports the number of rows promoted; the pilot number should be 10.

### down()

Reverses `COMPOUND -> SIMPLE` **only** for rows still matching the same criterion and still
untouched since — i.e. the same predicate, plus the product's template-suggested recipe is
still `SUGGESTED`. If an operator published or discarded the suggestion in the meantime, the
row is no longer ours to revert, and down() must leave it. Document that in the file header:
a blind reversal would silently re-orphan a recipe the operator made live.

## Invariants this unit must not violate

- **DGI / append-only:** no invoice, no `fiscal_*`, no recipe row is touched. Products are
  mutable entities in this domain; only documents and authority tables are immutable.
- **Offline-first:** this is a cloud-side repair of rows created through the cloud API. The
  POS does not carry `product_type` as its source of truth for these template products; if
  hydration/sync of product type turns out to be one-way in a way that leaves a POS device
  with `SIMPLE` after this migration, report it as a finding rather than expanding scope.
- **Multi-tenant:** the update is bounded by the join, never by a hardcoded tenant id. RLS
  applies to the connection; run through the same path the existing migration specs use.
- **No behavior change in application code.** One migration + its spec. Do not touch
  `industry-template.service.ts`, `recipe.service.ts` (that is #612's guard), or the dashboard.

## Verification (backend has CI, but run it locally first)

- `cd apps/admin_backend && npm ci`
- Spec for the migration, run the way existing migration specs run (follow
  `src/migrations/1809500000000-AddProductTypeToTemplateProducts.spec.ts` for the scratch
  database harness).
- `npx jest src/migrations` — all migration specs, to catch ordering or ledger effects.
- `npx jest` full suite. Baseline on `2cb6e3e0`: report the number you observe; do not
  assume the 3084 figure from an older base.
- `npx nest build`
- `npx eslint <the two new files>` — never `npm run lint`, it runs `--fix` over ~106
  unrelated files in this repo.
- If the repo's schema-drift verifier exists and covers migrations
  (`scripts/verify-schema-build.sh`), run it: this migration changes data, not schema, so
  it must report zero drift.

## Status log

- doc created at `2cb6e3e0`; scope measured on the pilot DB; writer not yet delegated.
- Part A implemented by writer: `1809510000000-BackfillTemplateProductTypes.ts`
  + spec (8 tests, mock-QueryRunner harness following the 1809500000000 spec).
  RED observed as TS2307 (module missing) before implementation; GREEN 8/8.
  Verified: `npx jest src/migrations` 526 passed / 7 skipped; `npx jest` 3092
  passed / 8 skipped (3 skipped suites are DB-dependent specs); `npx nest build`
  clean; `npx eslint` clean on both files; `scripts/verify-schema-build.sh`
  PASS both scenarios (zero drift) — also proves the migration runs cleanly
  from an empty database; `git status` shows only the two new files + this doc.
- Follow-up fix (same surfaces): the parent's contract omitted an
  `up()`-side `suggestion_state <> 'REJECTED'` filter; the writer flagged it,
  the parent confirmed it as a contract defect and specified the fix. A
  REJECTED suggestion is the operator's own "not prepared" answer; promoting
  on it would manufacture a COMPOUND product with no live recipe. CONFIRMED
  (published) still promotes. RED observed (2 new spec cases failing), then
  GREEN 10/10; `npx jest src/migrations` 528 passed / 7 skipped; eslint clean;
  `npx nest build` clean; `verify-schema-build.sh` PASS both scenarios (zero
  drift, changed SQL proven on an empty database); `git status` unchanged.
- Follow-up fix 2 (same surfaces): real-clone execution of the pilot DB found the
  reported count fabricated in EVERY database, not miscounted by one — TypeORM
  0.3.28's postgres driver returns UPDATE..RETURNING as a `[rows, rowCount]`
  tuple, so `promoted.length` was always 2 while the statement correctly wrote
  10 rows (data behaviour verified correct by direct psql on the clone; the
  `as Array<{id}>` cast hid the shape from the compiler, and the mock-QueryRunner
  spec structurally could not reproduce it). Fix: one shared `asReturnedRows()`
  helper (up + down) normalises both tuple and flat shapes; lying casts deleted;
  spec now returns the tuple shape for a 10-row population and asserts the log
  says 10 (a 2-row mock would have passed old code). RED observed (2 tuple-shape
  count guards failing: log said 2), then GREEN 11/11. Real-clone re-verification
  on scratch `omnifood_610_s3` (10 template products first set back to SIMPLE):
  `migration:run` logged `promoted 10 product(s)`, final state 23 SIMPLE /
  10 COMPOUND, single updated_at; `migration:revert` logged `reverted 10
  product(s)`, scratch left at 33 SIMPLE / 0 COMPOUND with the ledger row removed.
- Follow-up fix 3 (same surfaces, amends shipped commit d68a9318): independent
  verifier + parent experiment found the migration was a silent no-op in the
  production position — products, recipe_versions and recipe_details are all
  relrowsecurity AND relforcerowsecurity = true, the migration role is their
  table OWNER, no app.tenant_id is bound during migrations, so under FORCE the
  criterion sees ZERO rows (the earlier real-clone run proved nothing here: it
  connected as a bypassing superuser, so "promoted 10" was an artifact of a
  bypassing role). Fix per 1809180000000 precedent: NO FORCE / restore-FORCE
  bracket (finally-guarded) around all data work in BOTH up() and down(), over
  all three tables; header corrected (clone run = SQL execution + predicate
  proof, not production-role proof; REJECTED filter relabelled as forward-defence
  for the #523 T3 discard path — no discard endpoint exists today; down()
  over-revert of app-created COMPOUND rows documented, asserted, and bounded as
  transient; up/down SUGGESTED-CONFIRMED asymmetry named; unknown
  suggestion_state values risk named). RED observed (4 bracket tests failing:
  no NO FORCE emitted), then GREEN 16/16. Production-position experiment on
  omnifood_610_s5 (probe owner NOSUPERUSER NOBYPASSRLS NOLOGIN owns the three
  tables): criterion count under FORCE as postgres = 10 (bypass artifact path);
  as probe owner under FORCE = 0 (the d68a9318 production path: silent no-op);
  as probe owner after NO FORCE = 10 (the fixed bracket path); FORCE restored,
  s5 left as found. migration:run AS the probe owner skipped: the role is
  NOLOGIN and enabling it requires a password-bearing role, which the parent
  forbade pending explicit choice.
- Follow-up fix 4 (same surfaces): re-verification proved the bracket end-to-end
  in the production RLS position (drove the committed up() as a NOBYPASSRLS table
  owner: promoted 10, FORCE restored) and found five precision defects — findings
  1–3 trace to the parent's own instructions being overstated or wrong, not to
  writer drift: (1) the lift sat OUTSIDE the try, so a mid-lift throw skipped the
  finally and left lifted tables un-forced (saved only by transaction rollback —
  the header's "a throw can never leave a table deniable" claim was false as
  written); fixed by moving the lift inside the try with a caller-owned
  accumulator recording each table only after its NO FORCE ran, header sentence
  corrected (finally restores the subset lifted so far; rollback is the
  independent second net); (2) the header's "cannot lean on an ACCESS EXCLUSIVE
  lock argument — the UPDATE takes ROW EXCLUSIVE" was measurably wrong: the
  bracket's own ALTER TABLE takes ACCESS EXCLUSIVE on all three tables, so the
  precedent's exposure argument transfers — sentence rewritten with the verifier
  correction attributed; (3) the down() re-promotion bound was overstated:
  re-promotion holds while the suggestion is SUGGESTED or CONFIRMED and items
  remain, but a REJECTED suggestion (the #523 T3 discard path) is deliberately
  never re-promoted — bound stated precisely; (4) the no-op test's
  stringContaining('0') was vacuous (LOG_PREFIX contains 1809510000000) —
  replaced with an assertion on the real no-op message; (5) two branches gained
  coverage: mid-lift throw (restores exactly the already-lifted subset) and
  forced = false (no lift, no silent re-FORCE of a table the operator left
  un-forced). RED observed: the mid-lift-throw test failed against the old
  structure (finally never ran); the forced = false test and the de-tautologised
  assertion pass immediately (branch coverage/hardening, not behaviour change).
  GREEN 18/18; `npx jest src/migrations` 536 passed / 7 skipped; eslint clean;
  nest build clean; verify-schema-build.sh PASS both scenarios.
