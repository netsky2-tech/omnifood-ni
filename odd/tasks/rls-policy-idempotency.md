# RLS Policy Idempotency

## Goal

Make every `CREATE POLICY` in the migration set safe to re-apply, so an environment whose migration ledger has gaps can complete a migration run instead of failing on the first policy that already exists.

Closes #285.

## Authority and constraints

- Continues the work started in the schema bootstrap: four migrations were guarded there, the rest were listed in #285.
- Migrations are the source of truth; the change wraps existing statements and must not alter a policy definition.
- Idempotency is mandatory because existing environments hold these policies without a matching ledger row. That is exactly how a developer database ends up with a partial ledger: the missing rows are migrations that failed on re-run.
- PostgreSQL has no `CREATE POLICY IF NOT EXISTS`, so the guard is a catalog check against `pg_policies`.
- No fiscal or business data is touched; this work only changes how policies are created.

## Measured scope

**16 migrations, 50 `CREATE POLICY` statements in source, 90 executed policies.**

The issue recorded 44 policies in 12 migrations; two corrections came from measuring properly:

- The newer human-authorization migrations, merged after the issue was written, added four more files.
- Several migrations build their policies inside a loop over tables or commands, so the number of policies that actually run is far higher than the number of statements in the source. Counting source lines understates the work by almost half.

| Group | Migrations | Executed policies |
| --- | --- | --- |
| Inventory, catalog and sync | `1768000000000`, `1776000000000`, `1780000000000`, `1782000000000`, `1784000000000`, `1785000000000` | 34 |
| Devices and product mapping | `1802000000000`, `1806000000000`, `1807000000000`, `1808000000000` | 14 |
| Identity, RLS and onboarding | `1809000000000`, `1809000000001`, `1809010000000`, `1809020000000`, `1809040000000`, `1809050000000` | 42 |

Already guarded, from the earlier work: `1781000000000`, `1785000000000-AddTenantCapabilityEvent`, `1794000000001`, `1795000000000`.

## The established pattern

Each policy is wrapped, with its definition unchanged:

```sql
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = current_schema()
      AND tablename = '<table>'
      AND policyname = '<policy>'
  ) THEN
    CREATE POLICY <policy> ON <table> ...;
  END IF;
END $$;
```

## Dependency DAG

1 -> 2 -> 3.

Task 3 depends on 1 and 2 because the harness can only assert the re-application path once the statements are guarded.

## Tasks

### Task 1: Guard the inventory, catalog and sync policies

- **Status:** done
- **Goal:** Wrap the policies in the six data-layer migrations.
- **Acceptance:** each policy definition is byte-identical apart from the wrapper; the build passes.
- **Commit:** pending

### Task 2: Guard the device, mapping, identity and onboarding policies

- **Status:** done
- **Goal:** Wrap the policies in the ten remaining migrations.
- **Dependencies:** Task 1 (shared pattern).
- **Acceptance:** as Task 1.
- **Commit:** pending

### Task 3: Prove re-application in the harness

- **Status:** done
- **Goal:** Extend the partial-ledger scenario so it actually re-runs these migrations, rather than trusting inspection.
- **Dependencies:** Tasks 1 and 2.
- **Acceptance:** scenario 2 deletes a ledger row for every guarded migration, re-applies the set, and still reports every entity table and column present; the expected-row assertion is updated to match.
- **Commit:** pending
- **Evidence:** the scenario now removes **26** ledger rows (was 10) and re-applies cleanly. Scenario 1 reports 75 entity tables and 953 entity columns, 0 missing; scenario 2 reports the same with 0 missing.
- **Integrity check:** every `CREATE POLICY`, `USING` and `WITH CHECK` fragment was compared before and after, normalising the trailing semicolon and whitespace. 106 added against 105 removed, and the single difference is one template-literal line that lost its opening backtick because it now lives inside a `DO $$` block. No policy definition changed.

## Decisions

- 2026-04-18: Guard the statements rather than documenting a manual repair path, because the failure only appears in environments that already exist and those are the ones that must migrate cleanly.

## Evidence log

- 2026-04-18: All 16 migrations guarded; harness extended to 26 ledger rows; both scenarios PASS; build clean.
- 2026-04-18: A note recorded for a future decision, not acted on here: several of these migrations still issue `DROP POLICY IF EXISTS` before creating a policy, carrying deliberate reset semantics for divergent existing policies. With a guard in place the drop only runs when it was already a no-op, so it is redundant rather than harmful. Removing it is a separate decision because the reset behaviour may be intentional.
