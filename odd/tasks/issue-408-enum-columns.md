# Issue #408 — reconcile the six enum columns the migrations created as varchar

**Issue:** #408 `fix(db): reconcile the six enum columns the migrations created as varchar`
**Branch:** `fix/408-enum-columns`
**Base:** `main` @ `94d274f`
**Status:** implemented and verified by the parent, including the RLS-visibility proof and the three suites.
Ready for a work-unit commit.

## Outcome

Six columns whose entity declares a real PostgreSQL enum, but which the migrations created as
unbounded `varchar`, become real enum columns. Their lines leave the column-type manifest, which goes
**61 → 55**. Two live defects the reconnaissance surfaced are fixed with them: a writer that bypasses
its mapper, and a domain enum missing a value that the seed already uses.

## Why now

`products.product_type` was this exact defect and it needed its own migration (`1809160000000`) plus a
fail-closed value guard. That recipe is the model. The column-type ratchet (#406) now lists these six,
so they are measured rather than unknown.

## The recipe, and the three ways it does not fit

`1809160000000-ReconcileProductsProductType.ts` is single-table, single-column, with a **constant
default**: read the column, no-op when the table is absent or the type is already right, refuse a
non-text column, `CREATE TYPE` guarded on `pg_type`, count rows whose value is not a member and throw
naming up to 10 offenders, `DROP DEFAULT`, `ALTER … TYPE … USING col::text::enum`, `SET DEFAULT`. Its
guard is a guard, not a coercion: it never rewrites a value.

Copied six times verbatim it would be wrong three ways:

1. **It hard-codes a default.** Two of the six are nullable with **no** default
   (`transaction_type`, `origin`) — inventing one would change the schema. Verified against the built
   schema: `origin`/`transaction_type` `nullable=YES default=(none)`; the other four carry
   `'earn'`, `'PENDING'`, `'buyXGetYFree'`, and `movement_type` is NOT NULL with none.
2. **Two of the tables are FORCE ROW LEVEL SECURITY** (`inventory_kardex`,
   `kardex_recalculate_queue`), and the recipe's fail-closed count is a plain `SELECT`. The migration
   role owns those tables but FORCE RLS subjects the owner too, and no `app.tenant_id` is bound, so
   `tenant_id = current_setting('app.tenant_id', true)::uuid` is NULL and the count sees **zero rows**.
   **The guard would be vacuous on exactly the two tables where an enum conversion most needs it** —
   the C.6 lesson again. Fixed below.
3. **One column contradicts its own enum** (below), so a faithful conversion is not possible without
   touching a writer.

## The two defects the reconnaissance surfaced, and the decisions taken

**A. `transaction_type` stores uppercase while its enum is lowercase.** In
`src/modules/loyalty/services/loyalty-ledger.service.ts` the same input reaches two columns:

```ts
transaction_type: dto.transactionType,                   // raw — callers pass 'EARN', 'REDEEM', 'ADJUST', 'REVERSAL'
type: toLegacyPointTransactionType(dto.transactionType),  // mapped → 'earn', the enum's member
```

Both columns declare `PointTransactionType`, whose members are **lowercase**. Converting
`transaction_type` to that enum without fixing the writer would break **every** loyalty ledger write.
**User decision, taken:** fix the writer to map through the existing `toLegacyPointTransactionType`,
and let the migration normalize case narrowly — a value whose case-folded form **is** a member is
rewritten (`'EARN'` → `'earn'`), and anything else still fails closed naming the offender. This is
narrower than "never rewrite": it touches case only, and only when the value is already a member.

**B. The seed writes a `movement_type` that is not a member.** `src/scripts/seed-test-data.ts:617`
inserts `'INITIAL_STOCK'`, absent from `MovementType`. **User decision, taken:** add it to the domain —
the TypeScript enum in `inventory-movement.entity.ts` and the PostgreSQL enum — because an initial
stock load is semantically distinct from `ADJUSTMENT`. Because the type does not exist yet, this costs
nothing at creation time: the member is simply part of the `CREATE TYPE`.

## Design (frozen)

**One migration, `1809180000000-ReconcileEnumColumns.ts`**, with a per-target descriptor table rather
than six near-copies — the differences above are exactly the fields a parameterization must carry
(`table`, `column`, `enumType`, `members`, `defaultMember: string | null`, `caseFold: boolean`).

| Table | Column | Enum type | Members | Default | Case-fold |
| --- | --- | --- | --- | --- | --- |
| `customer_point_transactions` | `transaction_type` | `customer_point_transactions_transaction_type_enum` | `earn, redeem, adjust, reversal` | none | **yes** |
| `customer_point_transactions` | `origin` | `customer_point_transactions_origin_enum` | `POS, CLOUD` | none | no |
| `customer_point_transactions` | `type` | `customer_point_transactions_type_enum` | `earn, redeem, adjust, reversal` | `earn` | no |
| `inventory_kardex` | `movement_type` | `inventory_kardex_movement_type_enum` | `SALE, SALE_CANCEL, PURCHASE, ENTRADA_COMPRA, SHRINKAGE, PRODUCTION, CREDIT_NOTE_RESTOCK, ADJUSTMENT, REVERSAL, INITIAL_STOCK` | none | no |
| `kardex_recalculate_queue` | `status` | `kardex_recalculate_queue_status_enum` | `PENDING, PROCESSING, COMPLETED, BLOCKED, FAILED` | `PENDING` | no |
| `promotions` | `type` | `promotions_type_enum` | `buyXGetYFree, percentageDiscount, fixedDiscount, comboPackage` | `buyXGetYFree` | no |

**Naming is derived from evidence, not guessed:** every existing enum type in this schema is
`<table>_<column>_enum` (`users_role_enum`, `cash_movement_type_enum`, `products_product_type_enum`,
`loyalty_programs_status_enum`, …), and no entity sets `enumName`, so this is also TypeORM's default.
Two columns of the same table sharing a TypeScript enum still get their own type, matching the
convention.

**Per target, in order:** read the column → no-op if the table/column is absent → no-op if
`udt_name` is already the enum type (idempotent re-application) → refuse a non-text column loudly →
`CREATE TYPE` guarded on `pg_type`/`current_schema()` → **count non-members and fail closed naming up
to 10 offenders, with the count actually seeing every row** → `DROP DEFAULT` → `ALTER … TYPE … USING`
(`lower(col)::text::enum` when `caseFold`, else `col::text::enum`) → restore the default **only when
the descriptor declares one**.

**The RLS fix, which is the part that must not be skipped.** For a table with
`relforcerowsecurity = true`, temporarily `ALTER TABLE … NO FORCE ROW LEVEL SECURITY` around the count
and the conversion, and **restore `FORCE` in a `finally`** so a failure cannot leave the table
deniable. With FORCE off the owner bypasses RLS and the count sees all rows. This adds no exposure the
conversion does not already imply, since the `ALTER COLUMN … TYPE` takes an `ACCESS EXCLUSIVE` lock on
the same table. Document the reason in the migration, because a reader will otherwise assume the guard
works.

**`down()`** restores `varchar` and the pre-existing default per descriptor, and is a no-op when the
column is not the enum type. It never deletes rows or touches policies.

**The writer fix.** `loyalty-ledger.service.ts` passes `transaction_type` through
`toLegacyPointTransactionType`, exactly as `type` already does.

**The domain addition.** `MovementType` in `inventory-movement.entity.ts` gains
`INITIAL_STOCK = 'INITIAL_STOCK'`.

**The manifest.** Delete the six lines (`schema-column-type-manifest.txt:32,33,34,44,54,63`).

## Work units

| Unit | Deliverable | Status |
| --- | --- | --- |
| W1 | The migration with its descriptor table and the RLS-safe guard | **DONE** |
| W2 | The writer fix, the `INITIAL_STOCK` member, and the manifest lines | **DONE** |

## Evidence recorded

**Schema check, both scenarios, exit 0:**

```
entity columns compared : 963
column-type drifts      : 55
column-type manifest    : 55
column-type unlisted    : 0
column-type stale       : 0
drift class type        : 49
drift class length      : 0
drift class abstract    : 6
```

61 → 55 as planned: the six enum lines are gone because the columns are genuinely enums, not because they
were suppressed.

**The RLS guard is not vacuous, and the test proves both halves.** For `inventory_kardex` the spec creates
the table as a `NOBYPASSRLS` probe role with FORCE, asserts `current_user` is that role, and asserts the
count is **0** — the row is invisible to its own owner under FORCE, which is exactly what would make a
naive guard pass silently. Then the migration runs, sees the row, converts the column, restores FORCE,
and the row survives with its value. `kardex_recalculate_queue` gets the same treatment plus `down()`.
A third case proves FORCE is restored **even when the guard throws**. This is the strongest evidence in
the unit: it demonstrates the failure mode exists and that the fix handles it.

**The guard fails for all six.** Each target throws `ENUM_COLUMN_VALUE_NOT_A_MEMBER` naming the offender
with its row count and converts nothing — `'REFUND'`, `'WEB'`, `'TRANSFER'`, `'MYSTERY'`, `'QUEUED'`,
`'flashSale'`.

**Both case directions.** An uppercase `transaction_type` member converges to its lowercase member; a
value that is a member in no case still fails closed.

**Decision B landed.** A `movement_type` row holding `INITIAL_STOCK` converts successfully.

**The writer fix is two lines and its blast radius was checked.** `transaction_type` now goes through
`toLegacyPointTransactionType`, exactly as `type` already did. Every reader of the column already
lowercases before comparing (`redemption.service.ts:270`, `:275`, `loyalty-profit-aware.service.ts:146`,
`:159`, `:196`), and `customers.service.ts:121` already wrote the lowercase member — so lowercase was the
convention and uppercase was the bug. The one pass-through, `reversedFrom: movement.transaction_type` at
`redemption.service.ts:309`, sits inside the `commercialSnapshot` JSONB and **is read by nothing**; it is
historical metadata, not an API contract. Three db specs updated their stored-value expectations to
lowercase; that is the fix being observed, not a test bent to pass.

**Suites green.** `npm test` 241 suites / 2235 tests; `npm run test:db` 40 / 233; `npm run test:e2e`
50 / 397. `npx eslint` clean on the changed paths.

**Review size — 3.5× the budget, and the honest breakdown.** Four new files: the migration 353 lines,
its mocked unit spec 417, its real-Postgres spec 538, and a service spec 106. Modified files are trivial
(6 files, +7 / −11). The mocked spec overlaps the DB spec on the happy paths but carries branches the DB
spec cannot reach cheaply: a table the schema does not have, a column type it refuses to convert, the
assertion that no `INSERT`/`UPDATE`/`DELETE` is ever emitted, and the not-FORCE tables being left alone.

**Splitting was considered and the safe seam is not the obvious one.** The writer fix cannot land after
the conversion: converting `transaction_type` to lowercase members while the writer still writes
uppercase would break every loyalty ledger write in production. So the migration and the writer fix are
chained. A 5 + 1 split is possible instead — the five columns without a case contradiction, then
`transaction_type` — and the reviewer can ask for it; this document records it as an option rather than
a decision taken.

## Non-goals

- `transaction_type` values that are not members in any case; they fail closed and a human decides.
- `audit_logs.id` (#410) and the 48 timestamp divergences (#409).
- Rewriting any value other than its case.

## Open item recorded, not decided

`origin` is written raw with no validation (`loyalty-ledger.service.ts:119`). Every observed caller
passes a member, so the conversion is safe today, but nothing prevents a future caller from writing
outside the set. The enum now does: that is the point. No further action in this unit.
