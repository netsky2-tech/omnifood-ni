# OHAC Transactional Publisher Task Projection

Authority: `openspec/changes/offline-human-authorization-credential/design.md` §4.1 rules 1-2 and 6, §4.2, §5.1, §11.2 decisions 16-18, and §11.3 gaps. This file is an ODD execution projection only; OpenSpec remains the authority.

Base: `origin/main` (`c42c0f4`, merged PRs #289, #291, #298)
Status: COMPLETE — P1, P2a-P2d, and P4 are merged; the P3-era delivery work shipped in `ohac-delivery.md`. Both open decisions below were resolved before the first source write.
Review budget: 400 changed lines per slice.

## Decisions already made (do not reopen)

- Rows 17 and 18 of design §11.2: terminal-agnostic snapshot plus on-pull per-terminal materialization, and fail-closed empty policy.
- Advisory lock precedent to mirror: `pg_advisory_xact_lock(hashtext($1))` as in `fulfillment/services/tenant-topology-revision.service.ts`.
- RLS must be bound by the publisher's own explicit transaction through `OhacTenantTransaction`, never by the interceptor alone.
- **Review-budget policy (user decision, applies to every remaining slice):** a unit may exceed the 400-line guard when the overage is real coverage. Keep the assertions and fixtures, and declare the exact line count plus what forced it in the pull request. Never use the exception to justify padding, duplicated coverage of shared code, or assertions that pass vacuously.
- **Phase status:** P1, P2a, P2b, P2c, P2d, and P4 are all MERGED. P3's backend half shipped as the delivery phase recorded in `ohac-delivery.md` (A1a/A1b, PRs #356/#365) after the design pass this file anticipated; its POS half is B1-B3 in `ohac-pos.md`, where B1a is merged.

## Open decisions

None. Both are resolved below.

### Resolved decisions

1. **Tenant-global sequence source (user decision):** derive it from the newest snapshot under the tenant advisory lock, `N = COALESCE(MAX(sequence), 0) + 1`. No counter table is provisioned, so no drift between a counter and real snapshots is possible; contiguity holds because the lock serializes publishers and the snapshot table is append-only with no delete path.
2. **`attempt_reset_generation` access (user decision):** map the column on `user.entity.ts` with its mapping spec, so the publisher reads it through the ORM instead of a second raw access path.

Both belong in design §11.2 as implementer-chosen rows and are folded into the P1 review unit so the authority doc stays current.

## Slices

### P1 — Tenant-global sequence and terminal-agnostic snapshot persistence

- Status: DONE and MERGED. Branch `feat/ohac-policy-snapshots`; work-unit commit `f58d827` on `f4fee0d`; PR #300 for approved issue #299 squash-merged into `main` as `364178a` with build, lint-and-test, Cloudflare, and GitGuardian all green.
- Additive migration provisioning the snapshot store for `(tenant_id, sequence)`, with forced RLS, append-only enforcement, and uniqueness on both `(tenant_id, sequence)` and `(tenant_id, digest)`.
- The snapshot carries no `terminal_id` and no `target_pos_build`, because both are per-terminal and are resolved at pull time by decision 17.
- The tenant-global sequence is derived from `MAX(sequence)` under the advisory lock, so the migration provisions no counter.
- Migration SQL-string spec in the existing `18090xx` style: 11 tests.
- Design §11.2 rows 19-20 for the two resolved decisions are part of this review unit.
- Evidence: focused Jest 11/11; all migration specs 133 passed with 3 pre-existing skipped suites; non-mutating ESLint, Prettier, `nest build`, and `git diff --check` all pass; independent verification PASS with no blockers; 301 review-facing lines.
- Known gap left to P4: the DDL is verified statically only, because `.db.spec.ts` files are excluded from the default Jest config and no database run was authorized.
- No entity, service, route, or module wiring in this slice.

### P2 — Publisher service and dirty-marker wiring

- TypeORM entities for the snapshot store and `human_auth_tenant_publication_state`, plus the `attempt_reset_generation` access chosen in open decision 2.
- Publisher service running inside `OhacTenantTransaction`: advisory lock on the tenant, marker read with revision CAS, source-record load, projection through the merged `projectStaffPolicyEpochV1`, snapshot insert, sequence advance, and dirty clear with `published_at` stamping.
- Strict-TDD unit coverage with a mocked transaction manager.
- Module registration in `human-authorization.module.ts`; no cross-module consumer yet.
- Dirty marking on the staff/profile mutation path belongs to this slice or an explicit sibling, never to the publisher.

### P2a — Publisher persistence mapping

- Status: DONE and MERGED as `df81abc` (PR #304, approved issue #301).
- Adds `HumanAuthPolicySnapshot` and `HumanAuthTenantPublicationState` mirroring migrations `1809050000000` and `1809040000000` column by column, plus the `User.attempt_reset_generation` mapping required by decision 20.
- Both entities registered in `HumanAuthorizationModule` and its module spec, seven to nine.
- Migration-owned artifacts stay undeclared and documented: the `sequence DESC` index ordering, the marker's mutation trigger, and the non-negative CHECK.
- `attempt_reset_generation` deliberately uses the repository's plain non-OHAC bigint convention rather than importing the OHAC `BIGINT_STRING` transformer, so the core identity entity keeps no dependency on the human-authorization module.
- **Runtime lesson (cost one CI cycle):** mapping a column on the shared `User` entity changes the ORM contract for every hand-built `users` fixture. `user.service.db.spec.ts` (two DDL blocks) and `test/support/fulfillment-test-db.helper.ts` had to be aligned; CI's `lint-and-test` caught it only in the DB-backed suite, which the default Jest config excludes.
- Evidence: entity spec 18/18, OHAC suite 101/101, identity entity specs 7/7, unit suite 1847 passed, DB suite 34/34 suites and 184/184 tests on a clean database, E2E 49 suites and 392 tests on a clean database, `scripts/verify-schema-build.sh` PASS with 953 entity columns declared and 0 missing, non-mutating ESLint, Prettier and `nest build` pass; independent verification PASS; 244 review-facing lines.
- Local environment note: the harness needs `dotenv` (an undeclared transitive dependency that `npm ci` hoists in CI but strict pnpm does not), so a local `node_modules` symlink was required to run it. No source or lockfile change.

### P2b — Terminal-agnostic snapshot projection (pure)

- Status: DONE and MERGED in two review units: extraction `293b4c2` (PR #308, issue #307) and projection `67427d3` (PR #309, issue #306).
- **Decision resolved at implementation time:** the v1 epoch contract rejects an empty `targetTerminalId` or `targetPosBuild` and its digest covers the whole body including both, so a terminal-agnostic snapshot cannot be a v1 epoch and cannot reuse its digest. The snapshot therefore has its own body shape and schema id `ohac.staff-policy-snapshot.v1`, digested with the same OHAC-C14N-1 helpers; per-terminal digests stay a pull-time concern.
- The shared entry projection was extracted to `projection/policy-entries.ts` first, so the epoch and snapshot projectors cannot drift on entry rules.
- Evidence: projection suite 30/30, OHAC suite 117/117, non-mutating ESLint, Prettier, `nest build`, diff check, and independent verification PASS. Sizes: extraction 212 lines, projection 411 lines (11 over the 400 guard, disclosed in the PR because the overage closed a verification-found coverage hole).
- Deliberate deduplication: shared entry rules are asserted once by the epoch spec that owns them; the snapshot spec keeps an integration proof plus every snapshot-specific branch.

### P2c — Publisher service

- Status: DONE and MERGED in two review units: source reads `fa00852` (PR #313, issue #312) and the publisher `2cd59a6` (PR #315, issue #310).
- Tenant-level cohort decision confirmed by the user: `ELIGIBLE` when an enabled cohort matches the publisher's own backend build, otherwise `DISABLED`; the exact POS/backend build pair stays a pull-time check in P3.
- **Design defect found by the implementing agent and corrected:** the planned idempotence check compared the projected digest against the newest snapshot's digest, which can never match because the projected digest covers its own chained sequence fields. The check is now replay-based: the publisher reprojects the freshly loaded records under the newest snapshot's own chain metadata and treats the publication as unchanged only when the replayed digest AND the cohort decision both match. Removing the check's scoped test override made the previous implementation fail, which is the RED that proves the fix.
- **Decision recorded as design row 23 (user-decided):** the replay-based comparison, plus the rule that a cohort-decision flip counts as a change because the decision is persisted per publication (§4.1 rule 2) and skipping it would leave the stored gate state stale. The per-terminal epoch path must inherit the same replay-based comparison when it lands, so decision 16's literal wording is superseded for the snapshot store.
- Tenant-scoped reads were extracted to `services/staff-policy-source-reader.ts` so the publisher keeps only the mechanism: advisory lock, marker materialize/read, sequence derivation, projection, insert, CAS clear, and the outcome union.
- Evidence: 11 suites and 140 tests pass; non-mutating ESLint, Prettier, `nest build`, and `git diff --check` pass; the full unit suite passes 212 suites and 1886 tests.
- **Review-workload exception accepted by the user and disclosed in PR #315:** the publisher is 690 review-facing lines (283 service + 374 spec) against the 400-line guard. Reaching 400 would have required cutting roughly half the outcome scenarios, so coverage was kept and the exception documented. The source reader landed separately at 218 lines.

### P2d — Dirty marking on the staff/profile mutation path

- Status: DONE and MERGED. Unit 1 (primitives) `a711002` (PR #317, issue #316); unit 2 (wiring) `3f18957` (PR #329, issue #318).
- **User decisions for this slice:** the three mutation paths that had no transaction (`create`, the non-sensitive `update` branch, `setCustomPermissions`) were wrapped so the mutation and its signal commit together, which also closed a latent atomicity gap where a failure after the user insert left a user without a profile; scope was the HTTP mutation routes only, with the `attempt_reset_generation` increment and the seed/provision scripts documented as out of scope.
- **Reconnaissance result that shaped the slice:** the policy-affecting columns are exactly `users.role`, `users.is_active`, `users.attempt_reset_generation`, `security_profiles.pin_hash`, and `security_profiles.custom_permissions`. `is_pin_enabled` is not projected. Refresh-token writes in `auth.service.ts` mutate `users` but never mark. `attempt_reset_generation` still has no writer anywhere.
- Unit 1 delivered the reusable tenant-context binding and the marker primitives; unit 2 wired all five paths, delegated the publisher's marker materialization to `readOrMaterializeMarker`, and fixed two fixture surfaces.
- **Fixture drift cost, twice:** the real-database spec needed the marker table added to its hand-built schemas (raw SQL ignores TypeORM's `schema` option, so it also needed `SET search_path`), and one end-to-end spec injected a `DataSource` mock with no `transaction` method. The e2e break was predicted statically by independent verification and then reproduced as the single failure of 392 end-to-end tests; running the full e2e suite locally is what proved no other fixture broke.
- Evidence: unit spec 16/16, identity+human-authorization 310/310, full unit suite 214 suites and 1918 tests, real-database suite 34 suites and 185 tests, full end-to-end suite 49 suites and 392 tests, non-mutating ESLint with 0 errors, Prettier, `nest build`, and `git diff --check` all pass. 747 review-facing lines, disclosed in the PR under the exception precedent the user accepted on the previous unit.
- Behaviour changes beyond added atomicity, each disclosed in the PR: the audit insert now shares the mutation's transaction on the three newly transactional paths; `create` hashes before the uniqueness check; a blank tenant id now surfaces as 400 instead of 404 or a foreign-key error; same-tenant mutations serialize their tails on the marker row.

### P4 — Database runtime coverage (`T-2`)

- Status: DONE and MERGED as `379f387` (PR #336, issue #332).
- Adds two real-database suites plus a shared fixture under `human-authorization/runtime/`: schema enforcement (RLS, append-only, marker guards) and publication behaviour (first publish, replay idempotence, chained sequence, concurrent publish, fail-closed, tenant scoping).
- The specs run the shipped migrations into a scratch schema and assert through a dedicated `NOSUPERUSER NOBYPASSRLS` role, because a superuser bypasses forced row-level security and would make every policy assertion vacuous.
- Evidence: runtime specs 15/15, full real-database suite 36 suites and 200 tests, OHAC suite 165 tests, non-mutating ESLint, Prettier, `nest build`, and `git diff --check` all pass. 869 review-facing lines, accepted under the real-coverage exception policy.
- **Measured finding worth carrying forward:** the advisory lock in the publisher is defensive redundancy, not the mechanism that makes concurrent publication safe. Removing the lock statement entirely leaves all six publisher database tests green, because marker materialization is a single `INSERT ... ON CONFLICT` that takes a row lock on the tenant's marker, so a competing publisher blocks there and then observes the marker already cleared. The lock stays because decision 16 mandates it and because depending on a row lock taken as a side effect would be an undocumented dependency. The concurrency test was strengthened to assert the outcome pair (one `published`, one `noop`) and is named for the behaviour it observes rather than for the lock it cannot discriminate. Recorded in a comment next to the lock.
- Review also caught two assertions that proved the wrong thing and they were fixed before delivery: the DELETE assertion proved a missing grant rather than default-deny, and the append-only claim outran what the statement-level trigger firing first can show.

### P3 — On-pull per-terminal materialization

- Materialize the per-terminal epoch row on that terminal's first pull from the canonical enrolled relation and the negotiated build, idempotent under the unique key.
- Status: DELIVERED on the backend as the delivery phase (`ohac-delivery.md`, A1a/A1b, PRs #356/#365) after the design pass this bullet anticipated; the POS half is B1-B3 in `ohac-pos.md`.

### P4 — Database runtime coverage (`T-2`) — DELIVERED

Superseded by the delivered unit recorded above (`379f387`, PR #336, issue #332): its two runtime suites cover RLS scoping, append-only enforcement, marker guards, and at-least-once idempotency, and the measurement it produced (the advisory lock is redundant) is recorded there. The database findings it produced are carried forward in `ohac-delivery.md` under A4.

## Evidence

- Reconnaissance at `main` `c88833a`: no terminal registry, no tenant-global sequence, no persisted per-terminal build, dirty marker without entity or module wiring, `attempt_reset_generation` unmapped, and no OHAC `.db.spec.ts` or e2e spec.
- Merged prerequisites: `6837032` (framework-free `UserRole`) and `c88833a` (projection, exactly 400 review-facing lines).
