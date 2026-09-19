# Issue #286 — Phase 2 slice B2: OHAC / human authorization

**Parent plan (plan of record):** `odd/tasks/issue-286-tenant-id-uuid.md`
**Sibling slice:** `odd/tasks/issue-286-slice-b1.md` (merged as #360 → #361 → #363 → #364)
**Issue:** [#286](https://github.com/netsky2-tech/omnifood-ni/issues/286)
**Base:** `origin/main` @ `6163986`
**Status:** authorized 2026-09-19, planned, no code written.

## Scope — measured from the catalog, not from the plan's counts

Nine tables, **22 policies**, verified against `pg_policies` in the built schema:

| Table | Policies | Names |
| --- | --- | --- |
| `human_auth_policy_epochs` | 2 | select, insert |
| `human_auth_policy_snapshots` | 2 | select, insert |
| `human_auth_recovery_events` | 2 | select, insert |
| `human_auth_recovery_tokens` | 3 | select, insert, update |
| `human_auth_rollout_cohorts` | 3 | select, insert, update |
| `human_auth_tenant_publication_state` | 3 | select, insert, update |
| `human_auth_terminal_ack_floor` | 3 | select, insert, update |
| `human_auth_terminal_ack_history` | 2 | select, insert |
| `human_auth_verification_events` | 2 | select, insert |

The naming convention is `{table}_tenant_{command}`. The append-only tables carry select+insert only; the mutable ones add update. No view depends on any of these columns (the repository has exactly one view, and slice B1 rebound it).

Ratchet: this slice removes **9 lines** from `schema-tenant-type-manifest.txt` (25 → 16).

## The re-run class — enumerated in one pass

Every migration in the harness's fixed partial-ledger list that recreates a policy for an OHAC table, with its predicate form today:

| File | Tables | Policies | Predicate today |
| --- | --- | --- | --- |
| `1809000000000-CreateHumanAuthorizationCore.ts` | `human_auth_policy_epochs`, `human_auth_terminal_ack_history`, `human_auth_terminal_ack_floor` | 7 | bare, one constant |
| `1809010000000-CreateHumanAuthorizationRecovery.ts` | `human_auth_recovery_tokens`, `human_auth_recovery_events` | 5 | bare, one constant |
| `1809020000000-CreateHumanAuthorizationObservability.ts` | `human_auth_verification_events`, `human_auth_rollout_cohorts` | 5 | bare, one constant |
| `1809040000000-CreateHumanAuthorizationTenantPublicationState.ts` | `human_auth_tenant_publication_state` | 3 | bare, one constant |
| `1809050000000-CreateHumanAuthorizationPolicySnapshots.ts` | `human_auth_policy_snapshots` | 2 | bare, one constant |

**Five of five, and all five are in `partial_ledger_names`** (verified against `verify-schema-build.sh`). `1809030000000-AddHumanAuthorizationAttemptResetGeneration` creates no policy and is not in the list, so it is not in the class. Because every one of these files applies a single constant to several tables, **each needs the resolver called once per table**, the same rule slice B1's link 2 followed — a shared resolution across tables is the shape that produced the Unit 0b guard gap.

## Preflight — the fixture census, done on the correct class

Slice B1 was delegated with the claim "no fixture needs changing", based on a grep for `synchronize: true` plus the entity class names. It was wrong: two fixtures referenced those entities **through helper functions**, so the class names never appeared in the file the grep read, and the red run produced seven failures. The checkable class is **"a fixture that synchronize-builds from an entity whose `tenant_id` type changes"**, not "a fixture that names the entity".

Measured for B2 on the current base:

1. **23 files use `synchronize: true`; none of them mentions any `HumanAuth*` entity class** — checked by searching the whole file, not just its imports, and separately by intersecting the two file lists. **The B1 failure class does not repeat here.**
2. `src/modules/identity/human-authorization/runtime/ohac-publication-db.fixture.ts` runs the **real** migrations `180902`/`180903`/`180904`/`180905` through their `up()`, and hand-creates only `users` and `security_profiles`, already with `tenant_id uuid`. Its two consumers (`staff-policy-snapshot-publisher.db.spec.ts`, `ohac-publication-rls.db.spec.ts`) pass `randomUUID()` tenants, which are valid UUIDs. **No change expected** — but it is the file to watch, because it seeds the very tables this slice rebinds.
3. **No `tenant_id::text` comparison exists anywhere under `human-authorization/` or `identity/services/`**, so there is no query written for the varchar form to break or to silently lose the index.
4. **Registered divergence, deliberately not fixed here:** `src/modules/identity/services/user.service.db.spec.ts:61-62` hand-builds `human_auth_tenant_publication_state` with `tenant_id varchar(128) PRIMARY KEY`. Unlike B1's case this fixture will **not fail** — it hand-writes its DDL instead of deriving it from an entity, so after this slice it keeps passing against a schema shape that no longer exists. Converting it is not a one-line change: that spec's whole fixture world is text-typed (`users.tenant_id text`, `audit_logs.tenant_id text`, literal `'tenant-1'` seeds), so it is its own unit. Recorded here so the divergence is visible rather than forgotten.

## Shape — two links, and the slice split in two

Slice B1's first link (the shared emitter with view support, plus the entity/schema assertion) is already merged, so B2 has **two** links, and the slice itself is split because 22 policies plus 9 entities is over the 400-line budget by measurement, not by estimate.

| Link | Contents | Green standalone? |
| --- | --- | --- |
| **B2.1 — earlier migrations** | The five files above resolve the predicate **per table** through `resolveTenantRlsPredicate`. Behaviour-neutral: every column is still varchar, so the resolver returns the text form. | Must be, yes |
| **B2.2 — slice part 1** | 5 tables / 12 policies: `human_auth_policy_epochs`, `human_auth_terminal_ack_history`, `human_auth_terminal_ack_floor`, `human_auth_recovery_tokens`, `human_auth_recovery_events`. Plus their entities. Manifest −5. | Yes, after B2.1 |
| **B2.3 — slice part 2** | 4 tables / 10 policies: `human_auth_verification_events`, `human_auth_rollout_cohorts`, `human_auth_tenant_publication_state`, `human_auth_policy_snapshots`. Plus their entities. Manifest −4. | Yes, after B2.1 |

The earlier-migrations link is load-bearing and must land first; reversed, scenario 2 goes red. Splitting the slice is safe because each migration drops, alters and recreates **its own tables'** policies inside its own transaction, and the ratchet shrinks in two reviewed steps.

Migration timestamps `1809100000000` (B2.2) and `1809110000000` (B2.3) are free.

## Work units

| # | Task | Acceptance evidence |
| --- | --- | --- |
| **B2.1** | Five earlier migrations resolve per table, one resolution per table, header comments corrected where they assert the varchar rationale. | Specs assert one resolution per table and both directions per file; harness green in both scenarios with **no counter moved** (all columns still varchar) |
| **B2.2** | Migration `1809100000000` rebinding 5 tables / 12 policies through the emitter, authored from `pg_policies` structural columns; 5 entities to `uuid`; manifest −5. | **DONE** — 23 → 18 columns, `uuid tenant_id tables` 42 → 47, `entity uuid mismatches 0`, `RLS policies 102`. Harness green in both scenarios; specs 5/5; `test:db` 36/200; `test:e2e` 49/392; `npm test` 227 suites / 2091 tests. |
| **B2.3** | Migration `1809110000000` rebinding 4 tables / 10 policies; 4 entities; manifest −4. | Same, ending at `non-uuid tenant columns 25` |
| **B2.4** | Independent verification out of the catalog, not out of the specs: column types, every policy's `qual`/`with_check` in the target form with no column-side `::text`, and `EXPLAIN` as a **non-bypassing role** showing `Index Cond` on the composite keys (`human_auth_terminal_ack_floor` and `human_auth_tenant_publication_state` are keyed on `tenant_id`, so their index behaviour is worth its own look). | Catalog output and plan lines in this document |

Each unit closes with one work-unit commit and its own pull request, chained in the order above.

## Review budget

Calibration from slice B1, measured: the migration plus spec pair for 20 policies cost **599 lines** (236 + 363), entities cost 2 lines each, and the manifest 1 line per entry. The spec, not the policy rows, dominates.

| Unit | Expectation | Measured at close |
| --- | --- | --- |
| B2.1 | ~300–400 | **564** (513 spec + 51 implementation across 10 files) — **over budget, disclosed** |
| B2.2 | ~350–400 | **471** (441 spec + 30 implementation across 9 files) — over budget, disclosed |
| B2.3 | ~300–350 | |

If either slice unit lands over 400 the overage is disclosed in the pull request body rather than hidden, and a spec is never split from the migration it pins. **But the split was chosen so that disclosure should not be needed** — slice B1's L3a needed it at 664 lines for 20 policies, which is the measurement this split is based on.

## Evidence log

| Unit | Commit | Evidence |
| --- | --- | --- |
| B2.1 | `da8e3b9` | Five migrations resolve per table through `resolveTenantRlsPredicate`. **Structural finding: none of the five applies a shared constant through a loop** — the constant was declared *inside* each file's private `enableTenantRls` helper, which `up()` calls once per table, so the resolution sits once per table by construction (`Core.ts:188`, `Recovery.ts:184`, `Observability.ts:126`, `PublicationState.ts:83`, `PolicySnapshots.ts:98`). No header comment in the five asserted the varchar rationale; the explanation moved to each resolution site instead. Harness exit 0 in both scenarios with **no counter moved** (`34/34`, `text casts 0`, `unlisted 0`, `stale 0`, `RLS policies 102`), the evidence that this link is inert while every column is still varchar. Specs: 5 suites / 62 tests, each stubbing the `information_schema` read to drive the declared type and pinning both emitted forms per table, plus fail-closed cases for a missing column and an unsupported type. Merged as `48c591a` (#368), rebased onto `main` after the slice B1 chain landed. |
| B2.2 | _(this commit)_ | `1809100000000` rebinds `human_auth_policy_epochs`, `human_auth_terminal_ack_history`, `human_auth_terminal_ack_floor`, `human_auth_recovery_tokens` and `human_auth_recovery_events` — 5 tables, 12 policy rows authored from the catalog — plus their five entity declarations. Ratchet **23 → 18**. Harness exit 0 in both scenarios with exactly the predicted movement: `non-uuid tenant columns 18`, `manifest 18`, `unlisted 0`, `stale 0`, `uuid col text casts 0`, `uuid tenant_id tables 47`, `entity uuid mismatches 0`, `RLS policies 102`. `human_auth_terminal_ack_floor` keeps its `@PrimaryColumn` while losing `length`, because `(tenant_id, terminal_id)` is that table's primary key. |

**A sixth spec class found by this unit, and the one that proves the value of the entity assertion.** `src/modules/identity/human-authorization/entities/human-auth-entities.spec.ts` is a conformance spec: it asserts each entity's `[property, databaseName, type, nullable]` rows against what the migrations declare. Five of its tests failed on the type change, which is the spec doing its job — it pinned `varchar` for the five columns being rebound. Exactly five of its nine `tenant_id` rows were updated to `uuid`; the four tables still on varchar keep theirs, and the separate `varchar` width assertion for the publisher tables still passes. This is the verification this unit wants, not an obstacle to it: the entity and the migration are checked against each other by machine.

**A correction this slice had to absorb, found by the writer rather than by me.** The counters `uuid tenant_id tables` and `entity uuid mismatches` **do not exist on this base**: they were added to `verify-schema-build.sh` by slice B1's first link, which is still an open pull request. This document's work-unit table originally required them, which would have asked the worker for evidence the harness cannot print. The observable set here is `non-uuid tenant columns`, `tenant-type manifest`, `unlisted (new drift)`, `stale manifest entries`, `uuid col text casts`, `RLS policies` and `forced-RLS tables`, and the numbers above are corrected to those.

Basing B2 on `main` rather than on B1's unmerged chain is deliberate — the slices are independent, and stacking seven pull requests would entangle them. The consequence is exactly this: B1's assertions are absent here, so **the entity conversions in B2.2 and B2.3 are pinned by the harness only after B1 merges**; until then, the agreement they must satisfy (uuid column, uuid entity) is what those units deliver by construction.

## Process hazards carried from slice B1

- **`npm run lint` in `apps/admin_backend` is `eslint --fix`.** It rewrote 48 unrelated tracked files during B1 and exited 0 while doing it. Verify lint with a direct `npx eslint <paths>` call, never with the package script.
- **A green measured against a superseded base is not evidence about what will merge.** `origin/main` moved three times during B1 (and twice more after it). Rebase and re-measure before reporting.
- **A spec that pins generated SQL strings cannot show that a view kept its isolation option, or that a recreated policy still uses its index.** Those come out of the catalog, and the RLS plan evidence must be taken as a role that does not bypass RLS or the qual is absent for the wrong reason.
- **Retarget a stacked chain in order after each merge.** Deleting a parent branch before retargeting closes its child, and that state is terminal.

## Open items carried, not resolved here

- The stray `owner-dashboard` Cloudflare Pages project, verified with no hostname pointing at it.
- Backup/restore: no restore rehearsal and no R2 automation. For a system holding DGI invoices an unrestored backup is not a backup.
- The 19 private `requireTenant` copies — they already answer 401, so consolidating them is mechanical and has no open question.
- `user.service.db.spec.ts`'s hand-built OHAC schema (see the preflight), and the ~75 local branches whose deletion criterion is pull request state rather than ancestry.
- In flight by the operator, not by this slice: PR #365 (`feat/ohac-epoch-materialization-service`) touches OHAC and will move `main`.

## Relevant files

- `apps/admin_backend/src/core/database/tenant-rls-policy.ts` — the shared emitter and `resolveTenantRlsPredicate`; unchanged by this slice, consumed by it.
- `apps/admin_backend/src/migrations/1809080000000-RebindOnboardingFiscalTenantColumns.ts` — slice B1's slice migration, the template.
- `apps/admin_backend/src/migrations/1809000000000`..`1809050000000` — the five files link B2.1 makes type-aware.
- `apps/admin_backend/scripts/verify-schema-build.sh` — the check that finds every defect of this class; `partial_ledger_names` defines the re-run class.
- `apps/admin_backend/scripts/schema-tenant-type-manifest.txt` — the ratchet, 25 → 16.
- `apps/admin_backend/src/modules/identity/human-authorization/runtime/ohac-publication-db.fixture.ts` — the fixture that runs the real migrations and seeds these tables.
