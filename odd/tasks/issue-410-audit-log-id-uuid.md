# Issue #410 — audit_logs.id is varchar while the entity declares a uuid primary key

**Issue:** #410 `fix(db): audit_logs.id is varchar in the schema while the entity declares a uuid primary key`
**Branch:** `fix/410-audit-log-id-uuid`
**Base:** `main` @ `5a6b9d0`
**Status:** implemented and verified by the parent, including the trigger proof and the guard's failure. Ready
for a work-unit commit.

## Outcome

`audit_logs.id` becomes `uuid`, matching its own entity and the intent its migration's name already
recorded. The migration converges databases whose ids are all uuid-shaped and **fails closed, naming
them**, on databases that still hold the numeric ids `1793000000000` produced. The manifest line is
deleted (55 → 54).

## Why now

It is the only divergence in the manifest whose subject is a **primary key**, and the triage flagged it
as worth its own look. The column-type ratchet (#406) lists it; #407 excluded it precisely because it is
not a lying annotation.

## Measured

1. **The entity already says uuid.** `@PrimaryGeneratedColumn('uuid') id: string`
   (`src/modules/identity/entities/audit-log.entity.ts:23`).
2. **The bootstrap says bigint.** `1759000000001-CreateBootstrapIdentityTables.ts:98` creates
   `id bigserial PRIMARY KEY`, and its own header records why: "`audit_logs.id` is `bigint` here because
   1793000000000 converts it to…" — naming the later migration.
3. **`1793000000000-AlterAuditLogIdToUuid.ts` converts it to `varchar`, not uuid.** Its `up()` is
   `ALTER TABLE audit_logs ALTER COLUMN id TYPE varchar USING id::varchar` with
   `SET DEFAULT gen_random_uuid()::varchar`. **The name records the intent; the body implements
   something else.** That is a mistake in the migration, not a decision in the domain: the default it
   chose already generates a uuid.
4. **The schema today** is `character varying` with `(gen_random_uuid())::character varying`.
5. **Nothing references the key.** `pg_constraint` has **zero** foreign keys pointing at `audit_logs`, and
   the only other index on the table is `uq_audit_stream_sequence_active (tenant_id, device_id, user_id,
   sequence_no) WHERE forensic_status = 'ACTIVE'`.
6. **A fresh build has no legacy data.** The bootstrap creates the table and `1793000000000` converts it
   in the same run, so on a migration-built-from-empty database the table holds 0 rows and every id
   generated afterwards is a uuid. The legacy numeric ids can only exist in a database that already had
   audit rows when `1793000000000` was applied.

## The one real risk, and how it is handled

`USING id::varchar` on `bigint` yields `'1'`, `'2'`, … — so a long-lived database can hold **numeric
strings** that `USING id::uuid` cannot convert. Audit rows are append-only
(`trg_audit_logs_immutable`, a `BEFORE UPDATE OR DELETE` trigger raising
`'audit_logs is append-only: UPDATE/DELETE are forbidden'`), so rewriting those ids is not an option and
must not be attempted.

Therefore the migration **fails closed**: it counts ids whose text is not uuid-shaped, and if there are
any it throws naming up to 10 of them and converts nothing. A database with legacy ids stops with an
actionable message that a human resolves; it is never silently rewritten.

**Verified rather than assumed: the immutability trigger does not block the conversion.** It is a
`BEFORE UPDATE OR DELETE` **row trigger**, and it does not fire for a table rewrite. The strongest
evidence is in this repository's own history: slice C's rebind altered `inventory_kardex.tenant_id` —
a rewrite — while `inventory_kardex` carries its own `BEFORE UPDATE` immutability trigger, and the
harness passes. The unit proves it directly anyway, because a wrong assumption here would ship a
migration that cannot run.

## Design (frozen)

Migration `1809190000000-MakeAuditLogIdUuid.ts`, following `1809160000000-ReconcileProductsProductType`:

- Read the column; **no-op** if the table has no `id` column or if it is already `uuid` (idempotent).
- Throw, naming the type, if it is neither a string type nor uuid — never guess.
- **Guard:** count rows where `id::text !~ '^[0-9A-Fa-f]{8}-…{12}$'`. If any, throw
  `AUDIT_LOG_ID_NOT_A_UUID` naming up to 10 offenders with their row counts, stating that they predate
  `1793000000000` and that audit rows are append-only so the migration will not rewrite them.
- `ALTER COLUMN id DROP DEFAULT` → `ALTER COLUMN id TYPE uuid USING id::uuid` →
  `SET DEFAULT gen_random_uuid()` (no cast).
- `down()` restores exactly the state the misnamed migration left: `DROP DEFAULT`,
  `TYPE character varying USING id::varchar`, `SET DEFAULT gen_random_uuid()::varchar`. It is a
  reversal of what this migration changed, not an endorsement of it.

**A hazard recorded, not fixed:** the `down()` of `1793000000000` restores `bigint`, which would fail on
uuid values. Editing an old migration fixes nothing on databases that already ran it — the ledger is
keyed by name — so it is recorded here and left alone.

## Work units

| Unit | Deliverable | Status |
| --- | --- | --- |
| W1 | The migration with its guard, plus the manifest line | **DONE** |
| W2 | Proof that the immutability trigger does not block the rewrite, and that the guard can fail | **DONE** |

## Evidence recorded

**Schema check, both scenarios, exit 0:**

```
entity columns compared : 963
column-type drifts      : 54
column-type manifest    : 54
column-type unlisted    : 0
column-type stale       : 0
drift class type        : 48
drift class length      : 0
drift class abstract    : 6
```

55 → 54 as planned.

**The immutability trigger does not block the conversion, and the test proves it cannot have been
defeated.** Three rows are inserted before the migration, the conversion runs with
`trg_audit_logs_immutable` in place, and all three survive as valid uuids with their data intact; the
trigger is still present afterwards and a subsequent `UPDATE` is still rejected with
`audit_logs is append-only`. So the rewrite carried the rows **and** left the guard intact. This settles
by measurement a question that a wrong assumption would have shipped as a migration that cannot run.

**The guard fails closed.** A synthetic legacy row holding `'1'` makes `up()` throw
`AUDIT_LOG_ID_NOT_A_UUID` naming `'1' (1 row(s))` and explaining the append-only rule, converts nothing,
and leaves the column `character varying`.

**The default is honest afterwards.** `column_default` is exactly `gen_random_uuid()` with no `::varchar`
cast, and an insert with no id receives a valid uuid.

**Idempotent, and reversible.** A second `up()` leaves the converged shape untouched; `down()` restores
`character varying` with the cast default the misnamed migration left, and the row survives the
round-trip.

**Suites green.** `npm test` 242 suites / 2244 tests; `npm run test:db` 41 / 238; `npm run test:e2e`
50 / 397. `npx eslint` clean on the new paths.

**Review size.** 593 lines across three new files — migration 155, mocked spec 175, real-Postgres spec
263. Over the 400 budget as a single unit, but unlike #408 there is no dependency that forbids a split:
the migration alone is 155 lines and each spec is its own reviewable artifact. If the reviewer wants it,
the natural split is the migration plus its real-Postgres proof, then the mocked spec.

**Not fixed, recorded.** `1793000000000`'s own `down()` restores `bigint`, which would fail on uuid
values. Editing an old migration fixes nothing on databases that already recorded it — the ledger is
keyed by name — so it stays as it is and the hazard is written into the new migration's header.

## Non-goals

- Rewriting legacy numeric ids; a human decides what those rows mean.
- Renaming `1793000000000`; migration names are immutable once recorded in a ledger.
- The 48 timestamp divergences (#409).
