# Issue #286 — Phase 2 slice B1: Onboarding & fiscal

**Parent plan (plan of record):** `odd/tasks/issue-286-tenant-id-uuid.md`
**Issue:** [#286](https://github.com/netsky2-tech/omnifood-ni/issues/286)
**Base:** `main` @ `5f333208e40b209d56dba399408f21d6ee645f8a`
**Status:** authorized 2026-09-18, planned, no code written yet.

## Decisions taken for this slice

Recorded from the user on 2026-09-18, before any write:

1. **Slice B splits into B1 (this document) and B2.** B1 = Onboarding & fiscal, 10 tables / 21 policies. B2 = OHAC / human authorization, 9 tables / 22 policies, planned separately. Measured justification: slice A cost 1,701 review-facing lines for 27 policies over 3 pull requests; slice B's 43 policies plus one extra earlier migration plus the view lands at ~1,550–1,850 lines and 4–6 PRs. One slice of that size is a queue, not a review unit.
2. **The entity declarations are fixed inside the slice that converts their column, plus a detector.** Not deferred, not smuggled in. Without the detector this recreates exactly the drift class #286 exists to kill.
3. **Local branch hygiene stays untouched** (77 local branches; 49 have a merged pull request and only 14 are ancestors of `origin/main`). The measured criterion is recorded in "Open items" below so it can be executed later as its own reversible step.

## Scope — measured against sources, not against the plan's counts

Verified in `apps/admin_backend` by a read-only mapping pass. The plan's 10 tables / 21 policies hold exactly; the difference from slice A is **three** things, not one.

| # | What | Where |
| --- | --- | --- |
| 1 | 5 tables × 4 policies created by one migration from a **single shared predicate constant** applied in a loop | `1809000000001-EnforceOnboardingFiscalTenantRls.ts:33`, `:74-118` |
| 2 | `sys_parametros_config` carries the only **view** in the repository, which must be dropped and recreated inside the same transaction | `1784000000000-CreateSystemParametersConfig.ts:56-70` (policy), `:76-91` (view) |
| 3 | 4 tables with **no policies and no FORCE RLS**, column change only | `onboarding_sessions`, `onboarding_idempotency_records`, `onboarding_template_applications`, `onboarding_template_seed_links` |

Tables and policies in B1:

| Table | Policies | Created by |
| --- | --- | --- |
| `onboarding_activation_attempts` | 4 | `1809000000001` |
| `onboarding_activation_check_results` | 4 | `1809000000001` |
| `onboarding_activation_follow_ups` | 4 | `1809000000001` |
| `onboarding_telemetry_events` | 4 | `1809000000001` |
| `fiscal_config_revisions` | 4 | `1809000000001` |
| `sys_parametros_config` | 1 (`ALL`) | `1784000000000` |
| `onboarding_sessions` | 0 | — |
| `onboarding_idempotency_records` | 0 | — |
| `onboarding_template_applications` | 0 | — |
| `onboarding_template_seed_links` | 0 | — |

Ratchet: this slice removes **11 lines** from `scripts/schema-tenant-type-manifest.txt` (10 columns + the view line), leaving **23** entries.

## The view, measured

`v_sys_parametros_config_active` is the **only** view in the repository sources (exhaustive case-insensitive search for `CREATE [OR REPLACE] [MATERIALIZED] VIEW` under `src` returns one hit). It is created `WITH (security_invoker = true)` at `1784000000000:76-91`, and **no `GRANT`, `OWNER TO` or other privilege statement on it exists anywhere in the tree**, so there is nothing else to reproduce.

Its `_RETURN` rule depends on `sys_parametros_config.tenant_id` with `deptype = n`, which blocks the `ALTER`. The forced order is therefore:

```text
DROP POLICY  ->  DROP VIEW  ->  ALTER COLUMN  ->  CREATE VIEW  ->  CREATE POLICY
```

`CREATE OR REPLACE VIEW` alone is **not** sufficient: the view must be dropped first, because its existence is what blocks the type change. The shared emitter currently has no concept of a view, so that capability is this slice's first link.

## Shape — three links, `L3` split

Slice A's load-bearing order is preserved: shared capability first (inert), earlier migrations made type-aware second (provably behaviour-neutral while every column is still varchar), the slice last. `L3` is split because a 21-policy migration plus the view plus 10 entity conversions does not fit the 400-line budget.

| Link | Contents | Green standalone? |
| --- | --- | --- |
| **L1 — capability** | View support in the shared emitter (`tenant-rls-policy.ts`) + the entity/schema consistency assertion in `verify-schema-build.sh`. Inert: no migration consumes either yet. | Must be, yes |
| **L2 — earlier migrations** | `1809000000001` resolves the predicate **per table** (one resolution per table, never one shared across tables) and `1784000000000` resolves its own predicate. Behaviour-neutral: every column is still varchar, so the resolver returns the text form. | Must be, yes |
| **L3a — onboarding/fiscal rebind** | The 9 non-view tables: 20 policies + 4 policy-less columns, plus their **entities** converted to `uuid`. | Yes |
| **L3b — `sys_parametros_config` + view** | 1 table, 1 policy, the view drop/recreate, its entity. Isolates the view so the view cannot hide inside a large migration diff. | Yes, after L3a |

Reversed, `L2` goes red and a red link stops being a review unit.

## The re-run class — enumerated in one pass

Scenario 2 of `verify-schema-build.sh` deletes a fixed 27-row ledger list (`partial_ledger_names`, `:389-395`) and re-runs the migration set against a schema where the slice's `ALTER` has already been applied. Every migration in that list that recreates a policy for a B1 table must therefore be type-aware. The class for B1, complete:

| File | Table(s) | Predicate today |
| --- | --- | --- |
| `1784000000000-CreateSystemParametersConfig.ts` | `sys_parametros_config` | bare — **and creates the view** |
| `1809000000001-EnforceOnboardingFiscalTenantRls.ts` | the 5 onboarding/fiscal policy tables | bare, one constant shared by 5 tables |

**Two of two, `L2` is exactly these.** The six migrations slice A made type-aware touch no B1 table, so B1 adds no work there. This enumeration was done in one pass precisely because slice A found its six serially, one check failure at a time.

Table-creation migrations that need no change (they enable RLS but create no policy, and are not in the partial-ledger list): `1800000000000-CreateActivationCoreTables.ts`, `1801000000000-CreateOnboardingTelemetryEvents.ts`, `1799000000000-CreateFiscalConfigRevisions.ts`, `1796000000000`, `1797000000000`.

## The entity detector — design and its measured complication

Two declaration shapes exist for `tenant_id`, and they do not mean the same thing:

| Shape | Example | TypeORM's declared type |
| --- | --- | --- |
| Plain column | `activation-attempt.entity.ts:23` `@Column({ name: 'tenant_id', type: 'varchar', length: 128 })` | `varchar(128)` |
| Relation join column | `system-parameters-config.entity.ts:26` `@JoinColumn({ name: 'tenant_id' })` | **`uuid`** — derived from `Tenant`'s primary key |

So `system-parameters-config.entity.ts` *already* reports `uuid` while its column is still `varchar`, and an assertion of the form "every entity must declare `tenant_id` as uuid" would start red for a reason unrelated to #286.

**Assertion semantics (symmetric with assertion D's scoping):** for every table whose `tenant_id` is **uuid in the built schema**, the entity that declares that table must declare `tenant_id` as uuid. Assertion D is scoped to uuid columns because on a varchar column every working policy deparses as `(tenant_id)::text = ...` and the check would flag 94 policies for a reason that does not exist; this assertion is scoped for the same class of reason.

**Requirement: `L1` lands green.** If the assertion exposes a pre-existing mismatch the writer must stop and report it as a finding rather than silently widening the slice to unrelated tables. A mismatch on a table slice A already rebound is a slice-A leftover and belongs in the report.

The assertion must be proven able to fail by mutation in the scratch database, the same way the four existing layers were.

## Work units

| # | Task | Acceptance evidence |
| --- | --- | --- |
| **B1.1** | Emitter view support in `src/core/database/tenant-rls-policy.ts`: a target may carry views to drop before the `ALTER` and recreate after, in the forced order, inside the caller's transaction. Emitter spec extended. | `up()`, `down()` and the view ordering asserted by SQL-text spec; the harness stays green in both scenarios (no consumer yet) |
| **B1.2** | Entity/schema consistency assertion in `scripts/verify-schema-build.sh`, scoped per the design above, in **both** scenarios. | Green on the current tree (entities and schema agree wherever the column is uuid); RED captured by reverting one entity to `varchar`; the mutation reverted afterwards |
| **B1.3** | `1809000000001`: replace the single `TENANT_PREDICATE` constant with one `resolveTenantRlsPredicate(queryRunner, table)` resolution **per table**. Spec updated. | Spec asserts five distinct resolutions, one per table; behaviour-neutral — the harness is green in both scenarios and every column is still varchar |
| **B1.4** | `1784000000000`: resolve its own predicate through the shared seam. The view DDL stays as-is here (it is not a policy). Spec updated. | Same shape as B1.3; harness green in both scenarios |
| **B1.5** | Slice migration (L3a) rebinding the 9 non-view tables through `rebindTenantColumns`, with authored `(table, policy_name, cmd, using, check)` rows taken from `pg_policies` **structural** metadata. Their entities converted to `uuid`. Manifest shrinks by 9. | Harness green in both scenarios; `uuid col text casts: 0`; entity assertion still green; spec pins the emitted DDL |
| **B1.6** | Slice migration (L3b): `sys_parametros_config` policy + view drop/recreate via B1.1's capability, entity converted, manifest shrinks by 2. | Harness green in both scenarios; `EXPLAIN` evidence that the recreated policies keep the index; the view present with `security_invoker = true` afterwards |
| **B1.7** | Independent verification, not the writer's word: catalog read showing the fourteen... the recreated predicates in the target form, the view definition unchanged in shape, and `EXPLAIN` before/after on a rebound table. | Evidence in the task document, measured separately from the spec |

Every unit closes with one work-unit commit on its own branch, Conventional Commit message, tests and docs alongside the behaviour. The commit identity is recorded here as evidence.

## Review budget

Slice A's measured rates are the calibration: 27 policies → 1,701 review-facing lines (emitter 684, earlier migrations 353, slice 664), with **specs dominating** (402 of the emitter's 684) and the earlier-migration fixes next.

| Unit | Expectation | Measured at close |
| --- | --- | --- |
| B1.1 + B1.2 (L1) | ~300–450 | |
| B1.3 + B1.4 (L2) | ~250–350 | |
| B1.5 (L3a) | ~500–700 → **likely needs its own split** | |
| B1.6 (L3b) | ~200–300 | |

Overages are disclosed in the pull request body rather than hidden, and a spec is never split from the implementation it pins.

## Evidence log

Filled as units close. Empty means nothing has been measured yet.

| Unit | Commit | Evidence |
| --- | --- | --- |
| — | — | — |

## Open items carried, not resolved here

- **Local branch hygiene.** 77 local branches. Ancestry is unusable as a criterion: `git merge-base --is-ancestor origin/main` reports "NO" for squash-merged branches and would leave 49 dead branches untouched while resolving only 14. The measured criterion is **pull request state** (`gh pr list --state all`), excluding branches checked out in a worktree. Not to be executed without an explicit decision.
- **`main` divergence claim was false.** `main` and `origin/main` are the same commit `5f33320` (0/0). `78d6235` is an ancestor. What is stale is the `staging-deployment` worktree, detached at `4a9efea`, 40 commits behind.
- **Two long-standing pendings, unchanged:** the stray `owner-dashboard` Cloudflare Pages project (verified with no hostname pointing at it) and the backup/restore decision — no restore rehearsal and no R2 automation, so for a system holding DGI invoices an unrestored backup is not a backup.

## Relevant files

- `apps/admin_backend/src/core/database/tenant-rls-policy.ts` — the shared emitter and `resolveTenantRlsPredicate`; one place the predicate can be wrong. L1 adds view support.
- `apps/admin_backend/src/migrations/1809070000000-RebindInventoryKardexTenantColumns.ts` — slice A's migration, the template for B1.5.
- `apps/admin_backend/src/migrations/1809000000001-EnforceOnboardingFiscalTenantRls.ts` — 20 of the 21 policies; the per-table resolution lands here.
- `apps/admin_backend/src/migrations/1784000000000-CreateSystemParametersConfig.ts` — `sys_parametros_config` policy and the only view.
- `apps/admin_backend/scripts/verify-schema-build.sh` — the four-layer check in two scenarios; L1 adds the entity assertion, B1.5/B1.6 must keep both scenarios green.
- `apps/admin_backend/scripts/schema-tenant-type-manifest.txt` — the ratchet; 34 entries now, 23 after B1.
- `apps/admin_backend/src/modules/onboarding/entities/**`, `src/modules/inventory/entities/system-parameters-config.entity.ts` — the entity conversions.
