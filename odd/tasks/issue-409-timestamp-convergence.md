# Issue #409 — converge the timestamp divergences to timestamptz

**Issue:** #409 `fix(db): decide and converge the 48 timestamp/timestamptz divergences`
**Branch:** `fix/409-timestamp-convergence`
**Base:** `main` @ `5a6b9d0`
**Status:** implemented and verified by the parent. The ratchet lands at **5** entries, all of them the genuinely
ambiguous `Number` reflections. Ready for a work-unit commit.

## Outcome

**One instant type in the whole schema.** Every entity timestamp annotation becomes an explicit
`timestamptz`, the ten columns the migrations created as `timestamp without time zone` are converted,
and the manifest falls from 54 to **5** — leaving only the genuinely ambiguous `Number` reflections.

## Why now

It is the largest class in the manifest (48 of 91 when the ratchet landed) and the last one, and it is
acceptance criterion 4 of #405: the split had to be decided rather than left as an artifact of which
decorator someone typed.

## Measured — it is an accident, not a convention

- **166 of the 176 timestamp columns in the built schema are `timestamptz`.** The migrations write
  `timestamptz` in 40 of 42 places.
- What declares `timestamp` is almost entirely a bare `@CreateDateColumn()` / `@UpdateDateColumn()`,
  which TypeORM resolves to `timestamp` **without** time zone. Thirty-eight are bare decorators and two
  are explicit `@Column({ type: 'timestamp' })`.
- **Ten schema columns are `timestamp without time zone`, and the split runs through single tables**:
  `invoices.created_at` is naive while `invoices.updated_at` is aware; `tenants`, `users` and
  `security_profiles` are naive on `created_at`/`updated_at` while everything newer is aware;
  `production_batch_history.operation_date` and `invoice_payments.reconciled_at` are naive.

The ten, verified against the built schema:

```
invoice_payments.reconciled_at      invoices.created_at
production_batch_history.created_at production_batch_history.operation_date
security_profiles.created_at        security_profiles.updated_at
tenants.created_at                  tenants.updated_at
users.created_at                    users.updated_at
```

A naive `created_at` beside an aware `updated_at` in the same row is not a domain decision; it is which
migration created which column.

**A trap the plan has to avoid:** 57 columns declare `timestamp` but only **48** are drifts. The other
**nine already match the schema** as naive. Changing their annotations without migrating their columns
would not fix anything — it would **create** nine new divergences. That is why this unit is one
decision with two halves, not a find-and-replace.

## The decision, and the one fact it rests on

**User decision, taken: converge everything to `timestamptz`, interpreting the naive values as UTC.**

The interpretation matters and is not a detail. Those columns were written by `now()` into a
`timestamp` column, so the stored value is in the **session's** time zone at insert time. The
conversion uses `AT TIME ZONE 'UTC'`, which is only correct if the server ran UTC. It nearly always
does, and the user confirmed it; this document records that the whole unit rests on it.

## Design (frozen)

**1. Annotations — 58 declarations across the entity files.** Every decorator that resolves to
`timestamp` becomes an explicit `{ type: 'timestamptz' }`:

- 38 bare `@CreateDateColumn()` / `@UpdateDateColumn()` → `@CreateDateColumn({ type: 'timestamptz' })`
  and its update sibling;
- 2 explicit `@Column({ type: 'timestamp' })` (`invoice.entity.ts:32`,
  `production-batch-history.entity.ts:72`) → `timestamptz`;
- the 9 columns that currently match as naive (`invoices.created_at`,
  `production_batch_history.created_at`, `.operation_date`, `security_profiles.created_at`,
  `.updated_at`, `tenants.created_at`, `.updated_at`, `users.created_at`, `.updated_at`) → explicit
  `timestamptz`, because their columns are being converted below;
- `invoice_payments.reconciled_at`, currently a bare `@Column({ name: 'reconciled_at', nullable: true })`
  on a `Date` property → `{ type: 'timestamptz', name: 'reconciled_at', nullable: true }`. It was in the
  manifest as the `abstract` class; deciding it is an instant removes it from that class too.

Preserve every other option on each decorator (`nullable`, `name`, `default`, `precision`).

**2. Migration `1809200000000-ConvergeNaiveTimestamps.ts`**, for the ten columns:
`ALTER TABLE t ALTER COLUMN c TYPE timestamptz USING c AT TIME ZONE 'UTC'`. Per target: read the column,
**no-op** if it is already `timestamptz` or the table/column is absent (idempotent), and **throw naming
the type** if it is neither `timestamp without time zone` nor `timestamptz` — never guess. `down()`
reverses with `AT TIME ZONE 'UTC'` in the other direction.

No fail-closed value guard is needed here, and that is a deliberate difference from #408: the
conversion is total on every input, so there is no unrecognized value to refuse. The guard-shaped
obligation is different — **row counts must be preserved**, and that is asserted.

**3. Manifest.** Delete the 48 `timestamp without time zone | timestamp with time zone` lines **and**
the `invoice_payments.reconciled_at|Date|timestamp without time zone` line: **54 → 5**, the five
`Number` → `integer` reflections, which stay reported rather than decided.

## The five that remain, and why they stay

`users.security_version`, `audit_logs.sequence_no`, `kardex_recalculate_queue.attempts`,
`recipe_versions.version_number`, `sys_parametros_config.version` are bare `@Column()` on a `number`
property, which TypeORM resolves to `integer`. The issue requires them to be **reported, not decided**,
so they stay in the manifest as the `abstract` class. Declaring them `{ type: 'integer' }` would empty
the manifest, since the schema already is `integer` — noted as a one-line follow-up rather than done
here, because "Number could be integer or numeric" is exactly the question the issue said the check
must not answer on its own.

## Work units

| Unit | Deliverable | Status |
| --- | --- | --- |
| W1 | The 58 annotations across the entity files | **DONE** — 33 files, zero fixture fallout |
| W2 | The migration for the ten naive columns, plus the manifest | **DONE** |

## Evidence recorded

**Schema check, both scenarios, exit 0 — the resting state of the whole ratchet:**

```
entity columns compared : 963
column-type drifts      : 5
column-type manifest    : 5
column-type unlisted    : 0
column-type stale       : 0
drift class type        : 0
drift class length      : 0
drift class abstract    : 5
```

54 → 5. `drift class type` and `drift class length` are now **zero**, and what remains is exactly the
five bare `@Column()` on a `number` property that the issue requires reported rather than decided:
`audit_logs.sequence_no`, `kardex_recalculate_queue.attempts`, `recipe_versions.version_number`,
`sys_parametros_config.version`, `users.security_version`.

**The nine-column trap was closed, and the counter proves it.** `unlisted: 0` is the evidence: had an
annotation been changed without its column being converted, those nine would have appeared as new drift.
The two halves were applied together, which is the only way this unit is green.

**The UTC interpretation is demonstrated against real Postgres, not asserted.** A naive
`'2026-01-15 10:00:00'` inserted before the migration reads back as `'2026-01-15 10:00:00+00'` — the
wall clock preserved and labelled UTC, not shifted. `down()` reads the same value back naive.

**Row counts preserved** for all six converted tables, before and after.

**Idempotent**, `down()` reverses cleanly, absent tables and unexpected types are handled without
guessing.

**Zero fixture fallout.** All three suites pass with **no spec edits at all**, which was the open question
of this unit: changing 58 annotations changes what `synchronize` builds. `npm test` 243 suites / 2251
tests; `npm run test:db` 42 / 243; `npm run test:e2e` 50 / 397. `npx eslint` clean.

**Review size.** 33 modified files at +58 / −107 (the deletions are the manifest lines) plus 608 new
lines of migration and specs. Over the 400 budget as one unit, and — unlike #408 and #410 — the halves
are **not independently green**: the annotations alone create nine unlisted divergences, and the
migration alone leaves 49 stale manifest lines. Any split needs sequencing rather than a naive cut, so
it is recorded as an option for the reviewer rather than pre-empted.

## Non-goals

- The five `Number` reflections.
- Any other column type.
