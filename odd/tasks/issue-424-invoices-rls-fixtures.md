# Issue #424 — invoices DB spec must use production RLS predicates

**Issue:** #424 `test(db): invoices.service.db.spec.ts asserts an RLS predicate production does not have`
**Branch:** `chore/424-final-invoices-fixture`
**Base:** `main` @ `5da4267`
**Status:** implementation and independent verification complete; commit and PR authorized

## Objective

Convert the final inline `synchronize: true` fixture in `invoices.service.db.spec.ts` to the migration-built schema helper. The spec must exercise the RLS policies and trigger behavior production receives from migrations, without hand-written policy copies.

## Problem and current state

The file originally had four independent inline fixtures that built entity-derived schemas and installed text-form RLS predicates by hand. PR #426 converted three and stopped at the fourth because a real migration-built INSERT into `inventory_kardex` exposed #425 (`hashtext(uuid)`). PR #427 fixed that production trigger defect and is merged in base `5da4267`.

The remaining fixture is the credit-note restock replay test near the former `synchronize: true` site around line 719. Its conversion must preserve the behavioral assertion rather than weaken it to accommodate the migrated schema.

## Scope

- Edit only `apps/admin_backend/src/modules/sales/services/invoices.service.db.spec.ts` for production/test behavior.
- Replace the fourth inline schema/role/policy setup with `createMigrationBuiltSchemaFixture()` following the three converted fixtures already in the file.
- Confirm no hand-written `CREATE POLICY` / RLS enable-force setup remains; #426 had already removed the file's remaining policy DDL before this final fixture conversion.
- Preserve the credit-note restock replay assertions and report any behavior changed by the production uuid predicate or migrated constraints.
- Assert the real policies are present if the converted fixture does not already share the file's migration-policy proof.
- Verify against both the provisioned `omnifood` database and a fresh database condition, plus the schema-build ratchet.

## Constraints

- Offline-first: this test validates cloud replay behavior but must not alter local SQLite source-of-truth semantics.
- DGI: credit-note provenance and invoice immutability assertions must remain intact; no invoice deletion path may be introduced.
- Do not modify production service logic unless a newly surfaced production defect is proven and separately authorized.
- Stop and report if migration-built fixture fallout requires edits outside this spec or the already-existing helper.
- No commit or PR until the work unit is verified and delivery is explicitly authorized.

## Testing mode

- **Mode:** TDD enabled.
- **Source:** repository `AGENTS.md`.
- **Prior RED:** the first conversion attempt of this exact fixture failed on a real migrated schema with `function hashtext(uuid) does not exist`, producing issue #425 rather than being bypassed.
- **Current requirement:** apply the fixture conversion on top of merged #425, observe GREEN without weakening the credit-note/running-balance assertions, then run focused and schema checks.

## Delivery forecast

- Expected authored change: under 250 lines because the helper and three sibling conversions already exist.
- Strategy: `single-pr`; the user authorized one commit and PR after reviewing the measured 112-line code diff, below the 400-line threshold.
- Route: delegated direct writer because the fixture is non-trivial and previous attempts established migration-specific fallout; edit surface remains one spec file.

## Tasks

- [x] **T1 — Convert the fourth invoice fixture**
  - Replace its inline `synchronize` schema with `createMigrationBuiltSchemaFixture()`.
  - Confirm the prior #426 conversions already left no hand-written RLS DDL in the file.
  - Keep the credit-note restock replay behavior and production RLS enforcement meaningful.
  - Confirm no `synchronize: true`, `CREATE POLICY`, or fixture-owned `ENABLE|FORCE ROW LEVEL SECURITY` remains in the file.
  - Record any fixture changes required by real NOT NULL, FK, enum, or trigger constraints.
  - Route: delegated `gentle-ai-worker`; exact edit surface is the invoice DB spec.

- [x] **T2 — Verify both database conditions and schema integrity**
  - Run the focused DB spec against provisioned `omnifood`.
  - Run it against a freshly created database condition.
  - Run `verify-schema-build.sh`, focused ESLint, and `test:no-only`.
  - Record exact outcomes and independent verification plan.

## Acceptance criteria

- All four original inline `synchronize` fixtures are gone.
- No hand-written RLS DDL remains in `invoices.service.db.spec.ts`.
- The fourth fixture uses the migration-built helper and the credit-note restock replay assertion remains behaviorally equivalent or stronger.
- Any text-predicate→uuid-predicate fallout is reported with a concrete reason.
- Focused tests pass in both database conditions and the schema-build ratchet remains green.

## Progress and evidence

- #426 merged the first three fixture conversions and intentionally reverted the fourth when it exposed #425. Its merged state already contained no `CREATE POLICY` or RLS enable-force DDL; the fourth conversion therefore confirms that invariant rather than deleting additional policy statements.
- #427 / `5da4267` fixed #425 with real migration-built INSERT and running-balance enforcement coverage.
- The fourth fixture now uses `createMigrationBuiltSchemaFixture()`. Real-schema fallout required an `INITIAL_STOCK` kardex baseline because the running-balance trigger derives opening balance from ledger history, not `insumos.stock`; this matches production seeding.
- Writer verification and independent verification both passed against provisioned and fresh databases, schema-build ratchets, ESLint, and `test:no-only`.
- Independent verification found no blockers and requested two low-risk tightenings: assert the numeric 0→10→8→9 transitions explicitly, and guarantee `fixture.close()` runs even if caller `DataSource.destroy()` throws. Both were applied and independently re-verified.
- The final ledger assertion checks exact pg driver values for all three transitions while preserving credit-note provenance, duplicate replay, and invoice-count assertions.
- Teardown now always invokes `fixture.close()` after attempting `dataSource.destroy()` and does not swallow failures.
- Final verification evidence:
  - provisioned `omnifood`: 6/6 tests passed;
  - fresh `template0` database: 6/6 tests passed and database removed;
  - schema build: both scenarios passed; 102 policies and every drift counter zero;
  - focused ESLint: clean (writer, independent verifier, and parent spot-check);
  - `test:no-only`: passed;
  - no migration-built role, schema, or fresh test database leaked.
- Final code diff is 87 additions / 25 deletions in the invoice DB spec; tracker is the only other changed file. The work remains below the 400-line review threshold.

## Next step

Create the authorized work-unit commit and PR. After checks pass and merge is explicitly confirmed, close #424 and return to the measured #418 scope.
