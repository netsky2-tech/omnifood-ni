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

**Assertion semantics, one-directional (symmetric with assertion D's scoping):** for every base table whose `tenant_id` is **uuid in the built schema**, the entity that maps it must declare `tenant_id` as uuid. Assertion D is scoped to uuid columns because on a varchar column every working policy deparses as `(tenant_id)::text = ...` and the check would flag 94 policies for a reason that does not exist; this assertion is scoped for the same class of reason, and the census below shows why the scope is load-bearing rather than convenient.

### The census that decided the semantics (MEASURED)

TypeORM `DataSource.entityMetadatas` against the built scratch schema, 64 joined rows: **50 agree, 14 disagree**, and the 14 split into two directions that mean opposite things.

| Direction | Meaning | Count |
| --- | --- | --- |
| column `uuid` → entity declares varchar-ish | the column arrived, the entity was left behind — **a regression with no tracker** | 8 |
| column `varchar` → entity declares `uuid` (via the `tenant` relation) | the entity is already at the destination, the column is not — **the in-transit state the ratchet already tracks** | 6 |

Direction 1 (all 8 fixed by this unit, because the assertion cannot land green otherwise):

```
cash_movements                      (uuid -> varchar)  modules/sales/entities/cash-movement.entity.ts
cash_shift_sessions                 (uuid -> varchar)  modules/sales/entities/cash-shift.entity.ts
customer_loyalty_account_projection (uuid -> String)   modules/loyalty/entities/customer-loyalty-account-projection.entity.ts
datafonos_equipos                   (uuid -> String)   modules/sales/entities/datafono-equipo.entity.ts
inventory_remediation_receipts      (uuid -> varchar)  modules/inventory/entities/inventory-remediation-receipt.entity.ts   << slice-A leftover >>
inventory_sync_outbox               (uuid -> String)   modules/inventory/entities/inventory-sync-outbox.entity.ts           << slice-A leftover >>
inventory_sync_receipts             (uuid -> String)   modules/inventory/entities/inventory-sync-receipt.entity.ts           << slice-A leftover >>
production_batch_history            (uuid -> String)   modules/inventory/entities/production-batch-history.entity.ts          << slice-A leftover >>
```

**Four of the eight are slice-A leftovers: slice A rebound those columns and never touched the entities, and nothing could see it.** That is the finding this detector exists for, delivered by the census before a line of the assertion was written.

Direction 2 stays permitted and needs no new artifact, for a reason that is checkable: every one of those six columns is already a line in `schema-tenant-type-manifest.txt` (`catalog_values`, `customer_point_transactions`, `customers`, `legacy_import_integrity_reports`, `promotions`, `sys_parametros_config`). The slice that rebinds the column is the same slice that makes the entity truthful, and until then the ratchet already names the column. A second manifest would be a second tracker to empty for no additional detection.

Also measured, and worth recording: 30 entity files declare `tenant_id` twice in source — a plain `@Column` **and** a `@ManyToOne(() => Tenant) @JoinColumn({ name: 'tenant_id' })`. TypeORM folds them into **one** column metadata whose type is the relation-derived `uuid` (0 entities with two `tenant_id` column metadata). Any check written against entity source text instead of metadata would misread those 30.

The assertion must be proven able to fail by mutation in the scratch database, the same way the four existing layers were.

## Work units

| # | Task | Acceptance evidence |
| --- | --- | --- |
| **B1.1** | Emitter view support in `src/core/database/tenant-rls-policy.ts`: a target may carry views to drop before the `ALTER` and recreate after, in the forced order, inside the caller's transaction. Emitter spec extended. | `up()`, `down()` and the view ordering asserted by SQL-text spec; the harness stays green in both scenarios (no consumer yet) |
| **B1.2** | Entity/schema consistency assertion in `scripts/verify-schema-build.sh`, scoped per the design above, in **both** scenarios, plus the **8 direction-1 entity declarations** corrected to `uuid` (4 of them slice-A leftovers). | **DONE** — see the evidence log. `entity uuid mismatches: 0` in both scenarios; RED proven by mutation. |
| — | **Found by the unit, not in the plan:** `invoices.service.db.spec.ts` wrote the bare predicate form on `inventory_sync_receipts` while `synchronize: true` built that fixture's column from the entity, so correcting the entity made the fixture's own policy invalid (`uuid = text`). Fixed inside the unit by taking the predicate from the shared definition. | **DONE** — 36 db suites / 200 tests pass, was 9/10 suites. |
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
| B1.1 + B1.2 (L1) | ~300–450 | **B1.1 = 209** (`tenant-rls-policy.ts` +65/−3, spec +138, doc +147) and **B1.2 = 154** (harness +124/−2, 8 entities +8/−8, spec +20/−6) |
| B1.3 + B1.4 (L2) | ~250–350 | **272** (`1809000000001.ts` +22/−11 and its spec +111/−29; `1784000000000.ts` +14/−2 and its spec +82/−1) — 52 implementation, 220 spec |
| B1.5 (L3a) | ~500–700 → **likely needs its own split** | **664** (641 insertions / 23 deletions over 14 paths: migration 236, its spec 363, 9 entities 18, manifest −9, 2 fixtures +38/−5) — over the 400 budget, disclosed rather than split, for the same reason slice A disclosed its 664-line slice PR: the spec cannot be reviewed apart from the migration it pins |
| B1.6 (L3b) | ~200–300 | |

L1's landed cost is **below** the projection, which is the first time in this slice a plan estimate was not falsified. What made it cheap is that the emitter and the harness already existed: `L1` extended both instead of creating either.

Overages are disclosed in the pull request body rather than hidden, and a spec is never split from the implementation it pins.

## Evidence log

| Unit | Commit | Evidence |
| --- | --- | --- |
| L1 doc + B1.1 | `44a5e8b` | Emitter view support. `npx jest src/core/database/tenant-rls-policy.spec.ts` → 22/22. Harness exit 0, both scenarios, `uuid col text casts: 0`, ratchet `34/34`, `unlisted 0`, `stale 0`. Baseline before the unit was measured GREEN on the same tree at `5f33320` (27 s), so the green is attributable to the change rather than to the environment. |
| B1.2 | `b4c2842` | Assertion in both scenarios: `uuid tenant_id tables: 32`, `entity uuid mismatches: 0`. RED proven by mutation (reverting `inventory-sync-outbox.entity.ts` to the non-uuid form): exit 1 with the named row `inventory_sync_outbox|InventorySyncOutbox|uuid|String`. Mutation reverted byte-identically. `npm run test:db` → **36 suites / 200 tests pass**. Full harness exit 0 after the correction. |
| B1.3 + B1.4 (L2) | `070a17a` | Both earlier migrations resolve through `resolveTenantRlsPredicate`: one resolution per table inside `1809000000001`'s loop, one for `1784000000000`'s own table. RED captured per file by in-place reverts (6 failed for B1.3, 2 failed for B1.4), then restored. GREEN: 2 suites / 19 tests, including a mixed-type case that resolves one table to uuid and four to varchar in the same run and pins 5 uuid halves against 20 text halves — which is what proves the resolutions are independent rather than shared. Harness exit 0 in both scenarios with **no counter moved** (`34/34`, `text casts 0`, `unlisted 0`, `stale 0`, `entity uuid mismatches 0`), which is the evidence that this link is inert while every column is still varchar. |
| B1.5 (L3a) | `40f2cc6` | Nine columns to uuid, 20 authored policy rows verified at exactly 20 from the catalog, 9 entities converted, ratchet **34 → 25**. Harness exit 0 in both scenarios with the predicted movement: `non-uuid tenant columns 25`, `manifest 25`, `unlisted 0`, `stale 0`, `uuid col text casts 0`, `uuid tenant_id tables 41`, `entity uuid mismatches 0`, `RLS policies 102`. Migration spec 6/6. `npm run test:db` 36/200. `npm run test:e2e` 49/392. |

### What L3a falsified about this document

**The fixture census was wrong, and it was wrong in an instructive way.** This document's rule is to enumerate a class in one pass instead of discovering it serially. That discipline was applied to *test fixtures* by grepping for `synchronize: true` together with the onboarding entity class names — and it reported nothing, so the unit was delegated with "no fixture needs changing". The red run then produced seven failures in two e2e suites. Cause: those fixtures reference the entities **indirectly through helper functions**, so the class names never appear in the spec file the grep read. The checkable class is not "a fixture that names the entity" but **"a fixture that synchronize-builds from an entity whose tenant_id type changes"**, and indirection through an import is enough to hide it. It was found by a red run, not by inspection.

**"Change only the type on the entity declaration" was impossible.** TypeORM validates that a uuid column does not carry `length`, so the first harness run failed with `Column tenantId of Entity ActivationAttempt does not support length property`. All nine declarations therefore drop `length: 128` along with the type. The assertion this slice added is what produced that error — the detector earning its place on its first real use.

**An instability measured and left standing.** The writer's `npm run test:e2e` failed twice in four runs (6 suites / 32 tests, wall time 229 s against a normal ~41 s) and passed on re-run. Four subsequent runs across this branch and its parent were clean at 25–28 s. Observed twice, not reproduced in four attempts, and the failing runs were an order of magnitude slower — which points at machine-level contention rather than this branch. Recorded as observed instability with an unproven cause: not attributed, not dismissed.

**Re-measured after the base moved.** `origin/main` advanced from `5f33320` to `33d5379` (8 commits) while L1 was being written, so the branch was rebased and every result above re-taken on the new base: harness exit 0 with identical counts (`75` entity tables, `953` entity columns, `34/34` ratchet, `text casts 0`, `entity uuid mismatches 0`), `npm run test:db` 36/200. The 8 commits added no migration and no entity, which the re-run confirms rather than assumes.

## Process hazard found while verifying this slice

**`npm run lint` in `apps/admin_backend` is `eslint "{src,apps,libs,test}/**/*.ts" --fix`.** Running it as a verification step rewrote **48 tracked files** that have nothing to do with this slice — migrations, audit, onboarding controllers — and reformatted this slice's own spec, in a tree that was otherwise clean. It exits 0 regardless, so nothing signals the mutation.

The changes were reverted wholesale before the rebase, and the PR contains exactly the 13 intended paths. To verify lint without mutating the tree, call eslint directly on the paths in question without `--fix`; never run the package script as a check.

**A measurement that corrected this document, not the other way round.** This document first required the assertion to land green and told the writer to stop and report if it did not. The census then showed 14 disagreements in two opposite directions, which is what turned a one-directional gate plus eight one-line entity corrections into the design — instead of a second manifest tracking eight tables. The four slice-A leftovers among them are a finding about merged work, not about this unit.

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
