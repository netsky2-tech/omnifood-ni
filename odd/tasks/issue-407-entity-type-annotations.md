# Issue #407 — correct the 30 entity column-type annotations that diverge from the schema

**Issue:** #407 `fix(db): correct the 30 entity column-type annotations that diverge from the schema`
**Branch:** `fix/407-entity-type-annotations`
**Base:** `main` @ `6689bf3` (includes the #405 ratchet, PR #406)
**Status:** implemented — **29 of the 30** retypes landed. `change_log.user_id` is deliberately excluded and
its manifest line kept; see *Outcome and the one deliberate exclusion*. The bug that retype exposed is
issue #412.

## Outcome

The 11 entity columns that declare `String`/`varchar` over a schema `uuid` column, and the 19 that
declare an unbounded `varchar` over a schema `varchar(n)` column, are retyped so the entity tells the
truth about the schema. Their lines are deleted from
`apps/admin_backend/scripts/schema-column-type-manifest.txt`, which must take it from 91 entries to 61.

**No migration is needed.** In both classes the built schema is right and the entity is wrong.

## Why now

The ratchet merged in #406 now measures this class and holds it as a manifest. The manifest moves in one
direction only, and a corrected column whose line was not deleted fails the build, so this unit is
exactly the ratchet tightening for the first time.

It is not cosmetic. An entity that declares `String` over a `uuid` column, or `varchar` over a
`varchar(64)`, is a false statement about the schema, and a `synchronize`-provisioned database would
create the wrong type — the drift mechanism #286 spent three slices closing for `tenant_id`, one level
up.

## The worklist is the manifest, not this issue

```
cd apps/admin_backend
grep '|uuid$' scripts/schema-column-type-manifest.txt                          # the 11
grep -E '\|[^|()]+\|[^|]+\([0-9]+\)$' scripts/schema-column-type-manifest.txt  # the 19
```

**The 11 — schema `uuid`, entity `character varying`:** `change_log.user_id` and `change_log.target_id`
(`src/modules/audit/entities/change-log.entity.ts`); `audit_logs.usuario_autorizador_id`
(`src/modules/identity/entities/audit-log.entity.ts`); `inventory_kardex.insumo_id`
(`src/modules/inventory/entities/inventory-movement.entity.ts`, `@Column({ name: 'insumo_id' })`);
`production_order_lines.insumo_id`; `recipe_details.insumo_id`; `shrinkage_details.insumo_id`;
`recipes.ingredientId`; `invoices.user_id`; `invoice_items.product_id`; and `cash_movements.shift_id`
(`src/modules/sales/entities/cash-movement.entity.ts`, `@Column({ type: 'varchar', length: 100 })`,
while the bootstrap `1759000000002` creates `shift_id uuid NOT NULL` and `@Index(['tenant_id',
'shift_id'])` indexes it).

**The 19 — schema `varchar(n)`, entity unbounded:** `change_log.action` (64), `.target_type` (64),
`.user_email` (255); `audit_logs.forensic_status` (32); `inventory_sync_receipts.inventory_policy_version`
(64), `.inventory_outcome` (64); `staging_importacion_productos.matched_by` (32), `.target_product_id`
(128); `legacy_import_integrity_reports.status` (64), `.reviewed_by` (128); `product_import_sessions.status`
(64), `.parser_contract_version` (32), `.source_hash` (64), `.file_name` (255), `.commit_mode` (32),
`.duplicate_policy` (32); `invoices.inventory_policy_version` (64), `.inventory_outcome` (64);
`invoice_items.inventory_snapshot_version` (64).

## Design (frozen)

1. Retype each declaration so the canonical declared type equals the schema's: `{ type: 'uuid' }` for
   the eleven; `{ length: n }` (or the explicit `varchar` plus length) for the nineteen. Preserve any
   `name:` mapping and any `nullable`, `default` or index options already present.
2. Do **not** touch the schema and do **not** add a migration. If a column's *schema* type looks wrong
   instead — for the nineteen, the length could be the mistake rather than the annotation — stop and
   report it. The ratchet's premise is that the built schema is the authority, and that premise is only
   worth anything if a disagreement about it is surfaced rather than silently decided.
3. Delete exactly the 30 manifest lines that were corrected. Deleting a line whose column was not
   actually fixed is a `stale` failure, which is the ratchet working.
4. Run the suites. A retype can legitimately break a fixture that inserted a non-uuid string into a
   newly-`uuid` column; that fixture was relying on the lie. Fix it, and record every one.

## Blast-radius gate — measure before going wide

Retyping to `uuid` changes what `synchronize: true` fixtures create, so DB specs that seed string
literals into those columns will start failing. **Measure that fallout before fixing it.** If the
fixture work is more than a handful of small edits, or it reaches outside the modules that own these
entities, stop and report the list instead of continuing: this unit must not turn into a sweeping
fixture refactor across the suite. The parent decides whether to split it.

## Work units

| Unit | Deliverable | Status |
| --- | --- | --- |
| W1 | The `uuid` annotations, plus any fixture fallout they cause | **DONE** — 10 of the 11; `change_log.user_id` excluded on purpose |
| W2 | The 19 length annotations, plus any fixture fallout they cause | **DONE** |

## Outcome and the one deliberate exclusion

**29 retypes landed, and the manifest goes 91 → 62.** The counts are `drift class type: 56`,
`length: 0`, `abstract: 6` (56 + 0 + 6 = 62). The plan predicted `type: 36`; that was the plan's
error, not the implementation's — 66 type drifts minus 10 retyped ones is 56, and 36 + 0 + 6 does not
sum to 61. The worker reported the measurement instead of bending the prose to the plan, which is the
behaviour that makes this kind of plan worth writing.

**`change_log.user_id` is excluded, and excluding it was the point of the blast-radius gate.**
Retyping it to `uuid` — which is what the entity should say — produced `QueryFailedError: invalid
input syntax for type uuid: "term-warn-01"` and `"SYSTEM_RECONCILER"` in two DB specs, and a 500 on
`POST /reconcile-convergence` in e2e. That is not fixture fallout. `1794000000000-CreateChangeLogTable`
creates the column as `user_id UUID NOT NULL` and no later migration touches it, while
`activation.service.ts` writes non-uuid actors into it at four call sites, one of which stores a
**terminal id in a user column**. Those audit inserts fail against every migration-built database, and
only the entity's varchar lie plus `synchronize: true` fixtures kept CI green.

The entity therefore keeps the wrong declaration and the manifest keeps its line, with a comment
saying why. Making the annotation truthful here is not a one-line change: the fix is a decision about
what the audit trail records for a system or a terminal actor. Recorded as **issue #412** rather than
decided in this unit.

**Fixture fallout, as the gate asked.** Two spec files needed edits, both inside the five modules:
`invoices.service.db.spec.ts` (string literals seeded into `invoices.user_id` and
`invoice_items.product_id`, now uuid) and `activation.service.db.spec.ts` (15 actor-id arguments that
flow into `invoices.user_id` through the verification-sale fixture). Nothing reached outside the
modules that own these entities.

## Evidence recorded

**Schema check, both scenarios, exit 0:**

```
entity columns compared : 962
column-type drifts      : 62
column-type manifest    : 62
column-type unlisted    : 0
column-type stale       : 0
drift class type        : 56
drift class length      : 0
drift class abstract    : 6
```

**The ratchet still fails, proven twice and in the correct direction.** A plan error corrected here:
removing a manifest line for a column that is *still* diverging produces `unlisted`, not `stale`
(`batches.created_at` → `unlisted: 1`, exit 1). `stale` is produced by a line whose column no longer
diverges — adding `change_log.user_id|character varying|uuid` back temporarily, now that its column
*is* fixed in a hypothetical, gives `stale: 1`. Both lines were restored.

**Suites green.** `npm test` 237 suites / 2201 tests; `npm run test:db` 38 / 219; `npm run test:e2e`
49 / 394. `npx eslint` on the changed paths exits 0.

**Review size.** 16 files, 80 insertions / 73 deletions — 153 lines, inside the 400 budget. Fourteen
are one-line entity annotations; the manifest carries the deletions plus the exclusion comment.

## Non-goals

- The 6 enum columns (#408).
- The 48 timestamp divergences (#409).
- `audit_logs.id` (#410).
- Touching the schema or adding a migration.
