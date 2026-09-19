# Issue #405 — Column-type ratchet in the schema build check

**Issue:** #405 `feat(db): assert entity column types in the schema build check, not only their existence`
**Branch:** `feat/column-type-ratchet`
**Base:** `main` @ `346f212`
**Status:** W1 implemented, independently verified, and fixed for one HIGH finding (see *Independent
verification*). W2 triage recorded. No column reconciled. Ready for a work-unit commit.

## Outcome

`apps/admin_backend/scripts/verify-schema-build.sh` asserts the **type** of every entity-declared
column against the schema the migrations build — not only that the column exists, and not only for
`tenant_id`. It fails on **new** drift and on a **stale** manifest entry, and it is enabled from the
first commit by seeding a reviewed manifest with the current, measured divergence set. No column is
reconciled by this unit.

## Scope, re-measured rather than inherited

Issue #405 records **73** mismatches; its own class table sums to **69**. Neither is reproducible
against `346f212`, so the numbers below were re-measured on a schema built by
`verify-schema-build.sh` itself (962 entity columns, 1003 schema columns, 1 view entity excluded).

| Class | Count | Composition |
| --- | --- | --- |
| Type | **66** | 48 `timestamp` → `timestamptz`; 10 `String` → `uuid`; 6 `enum` → `varchar`; 1 `uuid` → `varchar` (`audit_logs.id`); 1 `varchar` → `uuid` (`cash_movements.shift_id`) |
| Length only | **19** | `String`/`varchar` declared unbounded against a `varchar(32\|64\|128\|255)` created by the migration |
| Abstract declared | **6** | 5 `Number` → `integer`, 1 `Date` → `timestamp` (all bare `@Column()` reflections) |
| **Total** | **91** | precision-only: 0; unknown declared types: 0 |

Three corrections to the issue's measurement, each a way the earlier probe was wrong:

1. **`text` → array ×2 is a false positive.** `security_profiles.custom_permissions` and
   `production_batch_history.movement_references` declare `@Column({ type: 'text', array: true })`,
   which *is* `text[]`. The earlier probe ignored `column.isArray`; the extractor must not.
2. **The 7th `enum`/`varchar` case is already reconciled.** It was `products.product_type`, closed by
   `1809160000000-ReconcileProductsProductType` (#404). Three enum cases remain unseen only because
   they belong to tables whose entities are the authority; all 6 are listed below.
3. **`enumName` is empty in this codebase.** TypeORM 0.3.28 exposes no `enumName` for these
   declarations (verified: 15 enum columns, 0 with `enumName`). The comparison therefore compares the
   **kind** — declared `enum` against a schema `USER-DEFINED` type with `pg_type.typtype = 'e'` —
   rather than an enum name. Enum *identity* is deliberately out of scope: the names in this schema
   are migration-authored (`cash_movement_type_enum`, not `cash_movements_type_enum`) and are not
   derivable.

The user decided, before implementation: **one flat ratchet with all 91 entries**, rather than
keeping length or the abstract cases as non-failing reports. A report that cannot fail is the defect
issue #286's C.6 already paid for once.

## Design (frozen)

### 1. Entity side — extend the extractor

A sibling of `collect_entity_tenant_types()` emits, for every column of every **non-view** entity
(`entityMetadata.tableType === "regular"`), one line per column:

```
<table>.<column>|<declaredCanonical>
```

Normalization table, applied in the extractor, declared type → canonical SQL:

| Declared (`column.type`) | Canonical |
| --- | --- |
| `String`, `varchar`, `character varying` | `character varying` |
| `Boolean`, `boolean`, `bool` | `boolean` |
| `int`, `integer`, `int4` | `integer` |
| `smallint` | `smallint` |
| `bigint`, `int8` | `bigint` |
| `decimal`, `numeric` | `numeric` |
| `float`, `double precision` | `double precision` |
| `timestamp`, `timestamp without time zone` | `timestamp without time zone` |
| `timestamptz`, `timestamp with time zone` | `timestamp with time zone` |
| `date` | `date` |
| `jsonb` | `jsonb` |
| `json` | `json` |
| `text` | `text` |
| `uuid` | `uuid` |
| `simple-array` | `text` |
| `enum` | `enum` |
| `Number`, `Date` | **left as-is** — abstract, see below |

Then: if `column.isArray`, append `[]`; if the canonical is `character varying` and `column.length`
is set, append `(N)`.

**Abstract types.** `Number` and `Date` are what TypeORM reflects for a bare `@Column()`. They are
*not* normalized: the issue requires that they be reported rather than decided, and the check cannot
know whether the author meant `integer` or `numeric`, `timestamp` or `timestamptz`. They stay in the
manifest as a named class, so they are ratcheted (a new one, or a changed schema type, fails) without
the check inventing an intent. Note for the triage: all 6 currently coincide with TypeORM's own
driver resolution, so this is an intent question, not a live defect.

**Fail closed.** Any declared type that is neither in the table nor in `{Number, Date}` **aborts the
extractor** with the table, column and type name. Nothing is silently skipped.

### 2. Schema side

`information_schema.columns` joined to `pg_type`, canonicalized to the same vocabulary:
`USER-DEFINED` with `typtype = 'e'` → `enum`; `ARRAY` → the element type plus `[]`; `character
varying` → plus `(character_maximum_length)` when set; everything else as its `data_type`.

### 3. Comparison

Join the two sides on `table.column`; a line whose declared and actual canonicals differ is a
divergence. Both failure directions are computed with `comm`, exactly like the tenant ratchet:

- **unlisted (new drift):** a divergence the manifest does not list → FAIL.
- **stale entry:** a manifest line matching no divergence → FAIL. This is what makes the ratchet
  tighten instead of merely not regress.

The printed report splits the divergence set into its three classes (`type`, `length`, `abstract`),
derived from the two canonical strings, so triage can read it without grepping. The class is *not*
part of the manifest line — it is a function of the line.

### 4. Manifest

`apps/admin_backend/scripts/schema-column-type-manifest.txt`, seeded with all **91** entries in the
form `<table>.<column>|<declared>|<actual>`, with the same header conventions as
`schema-tenant-type-manifest.txt` (comments and blank lines ignored; additions require a separately
approved baseline-change decision; the list only moves downward).

### 5. Wiring

Both scenarios run the new collector, report and fail gates. `SCHEMA_CHECK_DB` is unchanged; CI needs
no change, because the workflow already runs the script.

## Work units

| Unit | Deliverable | Files | Status |
| --- | --- | --- | --- |
| W1 | Extractor, normalization table, comparison with both directions, seeded 91-entry manifest, header documentation, fail gates in both scenarios | `scripts/verify-schema-build.sh`, `scripts/schema-column-type-manifest.txt` (new) | **DONE** — green in both scenarios, both RED directions and the count guard proven to fire, manifest equal to an independent re-derivation |
| W2 | Triage of the three real defect classes, recorded as evidence and proposed follow-ups. **No column is reconciled.** | this document | **DONE** — see *W2 — triage of the real defects* |

W1 is one review unit. It is a single script plus a data file; splitting the check from its manifest
would leave the check red at every intermediate commit.

## Evidence recorded

All runs on the frozen candidate, scenario 1 and scenario 2 unless stated.

**Green.** `bash scripts/verify-schema-build.sh` → exit 0, both scenarios identical:

```
entity columns compared : 962
column-type drifts      : 91
column-type manifest    : 91
column-type unlisted    : 0
column-type stale       : 0
drift class type        : 66
drift class length      : 19
drift class abstract    : 6
```

**Both failure directions, and the count guard, proven to fire.** RED direction 1 (delete
`audit_logs.id|uuid|character varying`) → exit 1, `unlisted` 1, the line named in the report. RED
direction 2 (append `zzz_nonexistent.zzz|uuid|uuid`) → exit 1, `column-type stale` 1, the bogus line
named. Count guard (restrict the schema-side extraction to exclude `audit_logs`) → exit 1:
`the schema-side type extraction emitted 987 row(s) but public holds 1003 column(s)`. Every
perturbation was restored and the restored file verified byte-identical.

**Manifest content.** The 91 committed lines are byte-identical to an independent re-derivation
built outside the script (TypeORM metadata from `dist` + `information_schema` + its own
normalization, arrays and numeric precision included). Negative anchors: the two `array: true`
columns are absent, no `tenant_id` line, no `products.product_type` line. The schema side emits
1003 of 1003 public columns with 0 `unresolved:` markers.

**Counter-label collision, found by the parent and fixed.** The first implementation printed
`unlisted (new drift)` and `stale manifest entries` in the new block, which are the tenant ratchet's
labels too, so one report showed two different numbers under one name. The new block's labels are
now `column-type unlisted` and `column-type stale`.

## Independent verification

Delegated to `gentle-ai-verify` (read-only, adversarial, no access to the script's own functions).
Its first pass returned **FAIL** with one HIGH finding, which was correct and is the reason this
section exists.

**HIGH — array columns were silently never compared.** The `pg_type` join was restricted to
`nspname = 'public'`, but built-in array types live in `pg_catalog`. For the two `ARRAY` columns the
join produced no row, `t.typname` was NULL, `'array:' || NULL || '[]'` collapsed the whole
concatenation to NULL, psql printed an empty field, and the blank-line filter deleted the row. The
extraction emitted 1001 of 1003 columns; the `_text` / `_int4` / `_uuid` / `_varchar` arms were dead
code; and `entity columns compared : 962` overstated the compared count by 2. An array divergence —
an entity declaring `integer[]` over a `text[]` column — would have passed silently. This is the
"a check that cannot fail is a defect" class that C.6 already paid for once.

**Fix (all three layers, so the class cannot return).** The join now uses the type's own namespace
(`nspname = c.udt_schema`); the array arms read `c.udt_name` directly so they do not depend on the
join at all; the whole CASE is wrapped in `COALESCE(..., 'unresolved:<data_type>:<udt_name>')` so an
unresolvable type becomes a visible divergence instead of a deleted line; and a count guard fails
loudly when the extraction does not carry exactly every public column. Verified after the fix: 1003
of 1003 rows, both array keys present as `text[]`, 0 `unresolved`, and the manifest unchanged at 91
(they match).

**MEDIUM — numeric precision/scale was ignored**, so `numeric` and `numeric(12,2)` compared equal.
Latent only (0 such divergences today), closed at zero manifest cost: both sides now canonicalize
`numeric(P,S)`. Timestamp precision is deliberately *not* canonicalized (every timestamp column here
is precision 6, and treating a default as an explicit `(6)` needs an equivalence rule); recorded in
the script header.

**Confirmed by that pass, not assumed.** Unknown declared types fail loudly rather than dropping the
column; a column absent from the schema is caught hard by the pre-existing existence check; the
`awk` join is a hash join so ordering is irrelevant; the manifest's `sed` comment-stripping cannot
eat a real entry today (no entry contains `#`); the new gates are present in both scenarios; the
diff is additive; the pre-existing tenant-ratchet failure message is byte-identical; and the `fail()`
hoist fixed a latent bug (the header check called `fail` before defining it, which would have exited
127 instead of printing the message).

## W2 — triage of the real defects

No column is reconciled by this unit. The three defect classes, with the evidence a follow-up needs.

**A. 10 columns declared `String` over a schema `uuid`, plus 1 declared `varchar(100)` over `uuid`.**
`change_log.user_id`, `change_log.target_id` (`src/modules/audit/entities/change-log.entity.ts`, bare
`@Column()`); `audit_logs.usuario_autorizador_id` (`src/modules/identity/entities/audit-log.entity.ts`);
`inventory_kardex.insumo_id` (`inventory-movement.entity.ts`, `@Column({ name: 'insumo_id' })`);
`production_order_lines.insumo_id`; `recipe_details.insumo_id`; `shrinkage_details.insumo_id`;
`recipes.ingredientId` (`recipe.entity.ts`); `invoices.user_id`; `invoice_items.product_id`.
`cash_movements.shift_id` is the odd one: `@Column({ type: 'varchar', length: 100 })` while the
bootstrap (`1759000000002`) creates `shift_id uuid NOT NULL`, and `idx_cm_tenant_shift (tenant_id,
shift_id)` indexes it. Mechanism: the annotation is untruthful, so a `synchronize`-provisioned
database would create the wrong type — the exact drift mechanism #286 closed for `tenant_id`, one
level up. Reads usually survive because PostgreSQL infers the parameter type from the column.

**B. 6 columns declared `enum` over a schema `varchar`.**
`customer_point_transactions.transaction_type`, `.origin`, `.type`
(`customer-point-transaction.entity.ts`, `@Column({ type: 'enum', enum: ... })`);
`inventory_kardex.movement_type`; `kardex_recalculate_queue.status`;
`promotions.type` (`promotion.entity.ts`, with a `default`). All six are unbounded
`character varying` in the built schema. This is `products.product_type` verbatim, whose
reconciliation needed `1809160000000` plus a fail-closed guard that counts rows whose value is not a
member. Nine other enum columns are correctly backed by real enum types, so the migration style
already exists here; these six are the stragglers.

**C. `audit_logs.id`.** Entity declares `@PrimaryGeneratedColumn('uuid')`
(`audit-log.entity.ts:23`); the bootstrap creates `id bigserial PRIMARY KEY`; and
`1793000000000-AlterAuditLogIdToUuid` **converts it to `varchar`**
(`ALTER TABLE audit_logs ALTER COLUMN id TYPE varchar USING id::varchar`, default
`gen_random_uuid()::varchar`) despite its name, with a `down()` that restores `bigint`. The schema
ends with `audit_logs.id character varying` and `audit_logs_pkey` on it. Blast radius is small:
`pg_constraint` shows **no** foreign key referencing `audit_logs`, and the only other index is
`uq_audit_stream_sequence_active`. A human must decide between the entity becoming `varchar`,
correcting the migration's name and default, or the column becoming `uuid`; the third option touches
the DGI audit trail and needs a data-aware migration.

**D. 19 length-only.** `String`/`varchar` declared unbounded over `varchar(32\|64\|128\|255)`; same
mechanism and same follow-up as A.

**E. 6 abstract.** Bare `@Column()` on a `number`/`Date` property. The schema agrees with TypeORM's
own driver resolution (`integer`, `timestamp without time zone`), so these are an intent question,
not a live defect.

**F. 48 timestamp.** Bare `@CreateDateColumn()`/`@UpdateDateColumn()` resolve to `timestamp without
time zone`; migrations write `timestamptz` in 40 of 42 places. The largest class and the only one
with a real semantic gap (instant vs wall-clock). Deferred by the recorded decision below.

Follow-ups, opened on request after this unit was committed: **#407** the annotation sweep (A + D, 30
columns — the schema is right, the entities are wrong, so no migration is needed), **#408** the six
enums (B), **#409** the 48 timestamp convergence (F), **#410** `audit_logs.id` (C). None of them is
reconciled by this unit.

## Non-goals

- Reconciling any of the 91 divergences.
- Deciding the timestamp split in code (48 entities and/or 40 migrations). The ratchet holds it; the
  decision is recorded below and deferred.
- Enum identity (member lists) or enum-name comparison.
- Touching `.github/workflows/`.

## Recorded decisions

- **The 48 timestamp cases are held as drift, not normalized away.** Deciding that a bare
  `@CreateDateColumn()` *means* `timestamptz` would hide the split instead of fixing it, and would
  make a genuinely `timestamp`-declared column invisible. The convergence is a code change — 48
  entities adopting an explicit `timestamptz`, or the migrations adopting `timestamp` — and belongs
  to its own slice. Issue #405 acceptance criterion 4 is answered by this record, not by the check.
- **Enum comparison is kind-based, not name-based**, for the reason recorded under Scope point 3.
- **Length is part of the type for this ratchet.** `character varying` and `character varying(64)`
  are different SQL types with different insert behaviour, so the manifest carries both axes. This is
  where the "73" and the measured 91 diverge most: 19 of the 91 are length-only.
