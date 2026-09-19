# Issue #412 — change_log.user_id is uuid while non-uuid actors are written

**Issue:** #412 `fix(db): change_log.user_id is uuid while activation.service.ts writes non-uuid actors`
**Branch:** `fix/412-change-log-actor-model`
**Base:** `main` @ `ba296cb`
**Status:** implemented and verified by the parent, including the two non-vacuous proofs (the CHECK rejecting
both-set and neither-set rows, and the drift convergence). Ready for a work-unit commit.

## Outcome

`change_log.user_id` becomes nullable, a sibling `actor_ref` column carries the logical actor, and a
CHECK constraint makes exactly one of the two mandatory. `ChangeLogService.log` takes a typed actor, so
no call site can put a terminal id or a logical marker into a user column. The production failure — audit
inserts aborting with `invalid input syntax for type uuid` — disappears, the entity stops lying, and its
line leaves the column-type manifest.

## Why now

Found while implementing #407 (PR #413). Retyping `change_log.user_id` to `uuid` broke two DB specs and
one e2e spec with `invalid input syntax for type uuid: "term-warn-01"` and `"SYSTEM_RECONCILER"`. That is
not fixture fallout: `1794000000000-CreateChangeLogTable` creates the column as `user_id UUID NOT NULL`
and no later migration touches it, while the service writes non-uuid actors into it. Those audit inserts
fail against every migration-built database; only the entity's varchar declaration plus
`synchronize: true` fixtures kept CI green.

## The model is already specified by the repository

`docs/onboarding/onboarding_architecture_spec.md` defines the audit metadata as
**`actorUserId / SYSTEM_RECONCILER`** — a union of a human actor and a *logical* actor:

```
Metadata mínima:
  tenant context
  actorUserId / SYSTEM_RECONCILER
  sessionId
  ...

Para transiciones state-based sin actor humano directo:
  actor = SYSTEM_RECONCILER
```

and it names `SYSTEM_FINALIZER` for `openedBy`/`closedBy`. So the actor is **not** a user id that
sometimes holds a sentinel; it is a discriminated value. Deciding the column shape from that is
engineering, not a domain decision, which is why this unit does not open with a question.

## Measured — the 13 call sites

| Site | Actor today |
| --- | --- |
| `activation.service.ts:376` | `actorUserId \|\| 'SYSTEM'` |
| `activation.service.ts:548` | `effectiveTerminalId` — a **terminal id in a user column** |
| `activation.service.ts:738`, `:753` | `actorUserId \|\| 'SYSTEM_FINALIZER'` |
| `activation.service.ts:854` | `actorUserId \|\| 'SYSTEM_RECONCILER'` |
| `activation.service.ts:977` | `'SYSTEM_RECONCILER'` |
| `activation.service.ts:1089` | `actorUserId \|\| 'SUPPORT_OPERATOR'` |
| `catalog.service.ts:169`, `:222`, `:263` | `user.userId` — a real user |
| `product.service.ts:186`, `:264`, `:301` | `user.userId` — a real user |

The logical vocabulary is therefore `SYSTEM`, `SYSTEM_FINALIZER`, `SYSTEM_RECONCILER`,
`SUPPORT_OPERATOR`, plus a terminal id. `change_log.user_id` is read through the entity only
(`findByTarget` from the diagnostics route); **no query filters on it**, so nullability is low risk.

## Design (frozen)

**1. Migration `1809170000000-ExplicitChangeLogActor.ts`** (free timestamp; verified).

- `ALTER TABLE change_log ALTER COLUMN user_id DROP NOT NULL`
- `ADD COLUMN IF NOT EXISTS actor_ref varchar(64) NULL`
- **Converge drifted rows**: move any `user_id` whose text is not uuid-shaped into `actor_ref` and null
  it, so a `synchronize`-provisioned database holding `'SYSTEM'` converges instead of blocking the
  constraint. This mirrors what #286 and #404 established: a migration must converge environments that
  already drifted, not only a fresh build.
- Add `change_log_actor_exactly_one` CHECK: `(user_id IS NULL) <> (actor_ref IS NULL)`.
- Guard every step so re-application is a no-op (constraint presence checked in `pg_constraint`), and
  make `down()` fail closed if any `actor_ref` row exists rather than silently dropping actor identity.
- `CreateChangeLogTable1794000000000` is **not** in `partial_ledger_names`, so this migration does not
  re-run in scenario 2 — but it is written to survive it anyway.

**2. Entity.** `user_id: string | null` as `@Column({ type: 'uuid', nullable: true })`; new
`actor_ref: string | null` as `@Column({ type: 'varchar', length: 64, nullable: true })`.

**3. `ChangeLogService.log` takes a discriminated actor**, so the illegal state is unrepresentable at the
call site rather than caught by the database:

```ts
export type AuditActor = { userId: string } | { ref: string };
```

Exactly one column is written. A blank or missing actor is rejected **before any SQL**, in the style
`resolveTenantContextId` already sets.

**4. The 13 call sites** become `{ userId: actorUserId }` or, for the `||` forms,
`actorUserId ? { userId: actorUserId } : { ref: 'SYSTEM_RECONCILER' }` — never a sentinel in a uuid
field. The terminal at `:548` becomes `{ ref: effectiveTerminalId }`.

**5. Manifest.** Delete `change_log.user_id|character varying|uuid` (62 → 61) and run the schema check.

## The one question this unit does not settle

`activation.service.ts:548` attributes a failed activation check to the **terminal** rather than to a
user or the system. This design preserves that intent by recording it as a non-human actor reference,
which is the narrowest reading of the existing code and of the spec's "actor" language. If a terminal is
meant to be context rather than an actor, the value belongs in `changes` instead — raised in the PR
rather than decided silently, because unlike the column shape it is a semantic choice.

## Work units

| Unit | Deliverable | Status |
| --- | --- | --- |
| W1 | Migration, entity, service and the 13 call sites | **DONE** |
| W2 | Converge a drifted clone and prove it, plus the manifest line removal | **DONE** — proven in a real-Postgres spec |

## Evidence recorded

**Schema check, both scenarios, exit 0:**

```
entity columns compared : 963      <- 962 + the new actor_ref column
column-type drifts      : 61
column-type manifest    : 61
column-type unlisted    : 0
column-type stale       : 0
drift class type        : 55
drift class length      : 0
drift class abstract    : 6
```

The count moved 962 → 963 because the entity gained `actor_ref`, which the migration also creates, so it
is compared and agrees. The drift count moved 62 → 61 because `change_log.user_id` is now genuinely
`uuid` on both sides, which is the point: the manifest line could be deleted because the annotation
stopped lying, not because it was suppressed.

**The CHECK can fail, proven against real Postgres.** Both-set and neither-set rows are rejected with
`violates check constraint "change_log_actor_exactly_one"`, and a row with exactly one actor is accepted
in both directions. The spec asserts the constraint name, so it cannot pass for an unrelated error.

**The drifted path converges, proven against real Postgres.** A varchar `user_id` holding `'SYSTEM'`
becomes `actor_ref = 'SYSTEM'` with `user_id` NULL.

**The migration refuses to truncate actor identity.** A guard the brief did not ask for and that the
implementation added on its own: if a drifted value cannot fit in `actor_ref varchar(64)`, `up()` throws
`CHANGE_LOG_ACTOR_REF_TOO_LONG` naming the offending values instead of silently truncating who performed
the change. `down()` likewise fails closed while any row carries an actor reference. Both are covered by
tests.

**Suites green.** `npm test` 239 suites / 2218 tests; `npm run test:db` 39 / 221; `npm run test:e2e`
50 / 397. The `activation.service.db.spec.ts` cases ONB1.7C and ONB1.7D–F — the ones that produced
`"term-warn-01"` and `"SYSTEM_RECONCILER"` in #407 — now pass **with the entity declaring the truth**,
which is the whole point of the unit. `npx eslint` clean on the changed paths.

**Review size, over the 400 budget and disclosed.** 707 lines of new files (migration 204, its unit spec
209, its real-Postgres spec 219, the service spec 75) plus 104 insertions / 28 deletions across 8
modified files. The load-bearing surface is the migration's 204 lines; the three specs are the proof
obligations, and the unit spec asserts behaviour rather than SQL strings (only 2 string assertions), so
it is not a change-detector. Splitting was considered and rejected: the migration alone leaves the bug
unfixed and the entity plus service alone would write a column the migration has not created yet, so
they are chained, not stacked.

**One fixture was relying on the lie.** `activation.service.db.spec.ts` passed `'user-support-specialist'`
as an actor. The production boundary is `ActivationController.getActorUserId`, which returns
`req.user.id`/`sub` (a uuid) or `'SYSTEM'`; the literal was an artefact of the varchar world the entity
described. It is now a uuid, and the test still verifies the same override and the same audit entry.

## Non-goals

- `audit_logs.user_id` (a different table; no sentinel writer found, not in scope).
- Any change to what the audit trail records beyond the actor representation.
- The remaining manifest classes: #408 (6 enums), #409 (48 timestamps), #410 (`audit_logs.id`).
