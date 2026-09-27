# OHAC POS Delivery Task Projection

Authority: `openspec/changes/offline-human-authorization-credential/design.md` §4.1, §4.2, §5, §5.1, §6, §9, §11.4 decisions 24-29, §11.5 decisions 30-34, and §16.3. This file is an ODD execution projection only; OpenSpec remains the authority.

Base: `origin/main` (`ee305224`, merged PR #397). The authority landed first on `262088a2` (PR #395).
Status: IN PROGRESS — B1a (entities and migration) is merged; B1b (the DAOs) is the only open unit in B1.
App: `apps/pos_app` (Flutter). Unlike the backend half, this phase runs `flutter test`.

## Decisions already made (do not reopen)

- **Decision 30:** the POS reads its own package version at runtime through `package_info_plus` and sends it verbatim as the negotiated `posBuild`; when the version cannot be read it omits the negotiation parameters entirely, which is the fail-closed answer.
- **Decision 31:** the drain gate, its registration coupler, the blocked `ACK_SUBMITTING` transition, the `OHAC_ACK_DEFERRED_OUTBOX` reason, its bounded retries and its quarantine are implemented now as inert structure, exercised by a test registrant, and become load-bearing when the first assertion-bearing outbox exists.
- **Decision 32:** the POS half lands as separate review units, persistence first.
- **Decision 33:** the legacy verifier projection and login stay untouched; which path authenticates is an enablement decision.
- **Decision 34:** the attempt-state transaction shape is settled by evidence about the Floor generation pinned in `pubspec.yaml`, not by preference.

## Facts that shape the slices (observed on `262088a2`)

- The Dart value layer already parses `ohac.staff-policy-epoch.v1` and `ohac.assertion.v1`, and shares `fixtures/human-authorization/v1/` with the TypeScript conformance spec. `validateEpochAcceptance` is a pure predicate: tenant, terminal, build pair, strict-newer sequence, and chain continuation. Nothing stores or acts on an epoch.
- After B1a the five tables exist with their entities, but no Dart code can reach them: there is still no `daos/human_authorization/`, so no epoch read, no terminal-state singleton access, no attempt state, and no local event log reader.
- Schema version is 53 (`app_database.dart`) after B1a's `migration52_53`; migrations are top-level finals appended to `allMigrations` in `migrations.dart`, and they are tested by calling `migrationN_M.migrate(db)` against `sqflite_common_ffi`.
- Floor DAOs live in `lib/data/daos/<feature>/` (plural) and are exposed as abstract getters on `AppDatabase`; entities are registered in its `@Database` block (now at `version: 53`). B1b creates `lib/data/daos/human_authorization/` and adds its getters there.
- The pull is `_pullInboundDeltas` in `sync_service.dart`; it sends `sinceVersion` and the device id, writes `deltas.users` into `UserEntity` and `security_profiles`, and reads `fiscalConfig` from the raw body — which is where an OHAC member would be consumed too.
- The pull runs even when an earlier push domain failed, which is the concrete §5.1 loss path.
- Confidential note: no assertion-bearing outbox exists. Eleven pending-work structures exist and none carries an assertion or an epoch sequence, so the gate is inert until DSI-6.

## Slices

### B1 — OHAC persistence (POS)

Delivered in two units: B1a (entities and migration, `ee305224`) and B1b (DAOs).

#### B1a — Entities and migration

- Status: DONE and MERGED as `ee305224` (PR #397, issue #396).
- Five entities and `migration52_53`: the two immutable policy tables, the mutable terminal-state singleton, the durable attempt state, and the append-only local event log, with the schema version bumped to 53 and the Floor output regenerated.
- Immutability is enforced by triggers rather than by convention; the mutable tables stay writable and a test asserts that too, because a migration that made everything immutable would pass the refusal tests and break the feature. **Corrected by B1a.1:** the triggers existed only on the upgrade path, so a fresh install had none; this claim only became true with `b6339f3`.
- **The tests caught a real defect in my own first version:** SQLite triggers are row-level, so an empty table refuses nothing. The refusals now each have a row to refuse, and the test asserts the row survived.
- Evidence: the migration suite 8/8, the database and OHAC value-layer suites 129 tests, `flutter analyze` clean, and `build_runner` regenerated without conflicts. 672 authored lines under the real-coverage exception, excluding the 12 generated lines.
- **Decision 34 closed with evidence:** Floor 1.5.0 implements `@transaction` by opening `database.transaction(...)` and building a transaction-scoped database, so §6's callback shape is available and the attempt path can be one `@transaction` DAO method with positional arguments.


- Floor entities and DAOs for the immutable epoch and entry tables, the mutable terminal-state singleton, the durable attempt state, and the append-only local event log, following the conventions the security-profile and movement-sync-state features already use.
- One schema migration, guarded and idempotent, with immutability enforced by triggers where the design requires append-only.
- The migration is covered the way this app already covers migrations, and the OHAC value-layer tests stay green.
- **Decision 34 closed with evidence.** Floor 1.5.0 (the pinned generation) implements `@transaction` by opening `database.transaction(...)` on the sqflite executor and constructing a transaction-scoped database whose DAOs write inside it, which the generated code in `app_database.g.dart` shows directly and which this repository already relies on (`audit_log_dao.dart`, `sales_transaction_dao.dart`). The callback shape §6 describes is therefore available: the attempt path can be one `@transaction` DAO method whose verify, read, enforce, compare, update, increment, and append steps all run inside a single transaction. Per `AGENTS.md`, such a method must take positional arguments only.

#### B1a.1 — Fresh-install parity for the OHAC DDL

- Status: DONE and MERGED. Commit `b6339f3` on `fix/ohac-pos-install-parity`, rebased onto `origin/main` `a8c0b00`; published as issue #439 and PR #440; squash-merged into `main` as `0264fde` with every check green (`lint-and-test` 6m51s, `build-check`, Cloudflare Pages, GitGuardian) and the branch deleted. Found by the B1b reconnaissance, not by B1a's own suite — B1a's tests exercised the migration path only, which is exactly why the defect survived.
- **Defect:** `migration52_53` creates the two OHAC indexes and the six append-only triggers, but migrations only run in `onUpgrade`. A fresh install runs `onCreate`, which builds the five tables from the generated entity DDL and then calls `inventoryMovementAppendOnlyCallback` — and that callback created the inventory, authority, and topology triggers only. Every fresh database (every in-memory test database, and any clear-data reinstall) therefore had the five tables with no indexes and no immutability triggers, so `UPDATE` and `DELETE` on the three append-only tables succeeded. The indexes are also what make the per-user entry read and the per-terminal event read use an index at all.
- **Fix:** the index and trigger DDL moved into one shared function, `_ensureHumanAuthorizationLocalIndexesAndTriggers(DatabaseExecutor)`, called by both `migration52_53` and the callback's `onCreate` and `onOpen`. One source of truth, so the two paths cannot drift again. The SQL is byte-identical to the replaced block (confirmed by hashing the literals, not by eye).
- **Tests:** new `ohac_delivery_install_parity_test.dart` opens the database the way `main.dart` does — in-memory builder, `allMigrations` attached, callback registered — and asserts both indexes exist, that each refusal has a real row to refuse and the row survives, that the two mutable tables stay writable, and that a fresh database starts empty.
- Evidence: RED before the fix — the index list was empty and both the `UPDATE` and the `DELETE` were accepted; GREEN 5/5 including three randomized ordering seeds; the migration and inventory database suites 18/18; `flutter analyze` clean on both files; 49 insertions and 34 deletions in `migrations.dart` plus a 249-line test, with zero generated lines touched. 298 changed lines, under the 400-line guard.
- **Independent verification found one blocker in the test, fixed before the commit:** the file was only conditionally hermetic, because `await db.close()` was the last statement of each test and a failing assertion skipped it, leaving the opened `:memory:` database cached by path in sqflite so the next test reused it without running `onCreate`. This is not theoretical: forced into a probe, the old shape left the next test looking at a foreign marker table and a residual row. Close moved into `addTearDown`, and the five-tables test now asserts the tables are empty so a leak fails loudly instead of passing silently. Verified by observation on both shapes.
- Carried forward as an observation, deliberately not fixed here: `inventoryMovementAppendOnlyCallback.onCreate` calls `_createTopologyPersistenceTriggers` twice. Pre-existing, harmless because the statements are `IF NOT EXISTS`, and out of this unit's scope.

#### B1b — DAOs

- Status: DONE, commit `4dece9c` on `feat/ohac-pos-daos`, published as issue #443 and PR #444; awaiting CI and merge. 220 lines of source in five DAOs, 742 lines of tests, 10 lines of wiring — 972 authored lines against the 400-line guard, declared under the real-coverage exception.
- Five DAOs, one per table, under `apps/pos_app/lib/data/daos/human_authorization/`, exposed as `AppDatabase` getters, following the `security_profile_dao.dart` convention: `@dao abstract class`, positional Dart parameters, conflict handled by annotation rather than a raw `ON CONFLICT`, and append-only DAOs that declare no update and no delete at all.
- **Scope boundary, decided here:** primitives only. The two composite transactions the design describes — §5.2's atomic candidate (write the epoch with its entries, verify counts and digest, flip the terminal state to `ACK_SUBMITTING`, apply explicit resets, append lifecycle facts) and §6's attempt path — span several of these tables and belong to B2. B1b therefore adds **no `@transaction`**, and decision 34's closure is consumed by B2 rather than here.
- The terminal-state singleton and the attempt state expose a revision compare-and-set that returns the affected row count, so a lost race is `0` rows instead of a silent overwrite; the `revision = revision + 1` increment lives in SQL so it cannot be applied wrongly by a caller.
- Immutability is enforced by the triggers, never by the DAO. Because B1a.1 landed, those triggers now exist on the fresh-install path as well, so the DAO tests can assert the refusals for real instead of only through the migration path.
- Two Floor 1.5.0 generator constraints forced visible shapes, both documented in the source: a `@Query` UPDATE cannot return `Future<int>`, so the compare-and-set count is `Future<int?>`, which is never null in practice but is a weaker contract; and query parameters cannot be nullable, so clearing `locked_until` passes an empty string through `NULLIF(:newLockedUntil, '')`, unambiguous because that column holds an ISO-8601 instant. Latent asymmetry worth remembering: the normalization lives only in the compare-and-set, so `insertAttemptState` with an empty string would store it literally.
- **The ripple nobody predicted:** adding five getters to `AppDatabase` regenerated five tracked mockito files, because they mock `AppDatabase` and the new imports renumber mockito's `_i<n>` prefixes. That is 5958 changed lines of generated output for 972 authored lines. It is mechanical and independently confirmed to contain no non-OHAC change, and the mocks are load-bearing: without regeneration every later `build_runner` run leaves them dirty. The lesson is that on this app the cost of a DAO getter is not the getter.
- Evidence: RED before implementing failed on the missing getters rather than on a passing assertion; GREEN 20/20 DAO tests, 90/90 on `test/data/database/`, 72/72 on the five tests whose mocks changed, `flutter analyze` clean.
- **Independent verification found two real coverage gaps, both closed before the commit:** the non-null-to-null transition of `locked_until` was never exercised because the seeded row already started null, and the `id` tiebreak in the event ordering was never exercised because no two events shared `created_at`. It also found that both compare-and-set tests seeded `revision: 1`, so a `WHERE` comparing against the constant 1 would have passed by coincidence; the seeds are now 5, and the two new assertions were proved non-vacuous by mutating the generated SQL and watching exactly one test turn red each time. One doc comment attributing `findEntryForUser` to `index_human_auth_policy_entries_user` was also wrong — the four-column primary key serves it.

### B2 — Candidate state machine and acknowledgement client (POS)

Delivered in four units, because decision 32's single "state machine and acknowledgement client" slice is far larger than a review unit:

#### B2a — Terminal-state schema extension and its DAO

- Status: DONE, commit `1a64d51` on `feat/ohac-pos-terminal-state`, published as issue #446 and PR #447, all checks green (`lint-and-test` 7m37s, `build-check` 2m12s, Cloudflare, GitGuardian); awaiting merge. 966 authored lines (895 added, 71 removed) plus 107 generated, declared over the 400-line guard under the real-coverage exception. No `*.mocks.dart` changed: no entity was added to the `@Database` block and no `AppDatabase` getter was added.
- §4.2 names fields the merged table does not carry. `human_auth_terminal_state` today has only `state`, `active_sequence`, `active_digest`, `revision` and `updated_at`; it is missing the candidate sequence/digest, the server-confirmed floor, the negotiated builds and schemas, the integrity classification, and the local authorization sequence.
- Additive migration 53→54 plus the entity fields and the DAO transitions that write them. No state-machine logic: the transitions are persistence primitives, and the machine that chooses between them is B2b.
- **Forced by the authority, not a choice:** `local_authorization_sequence` belongs on the terminal state. §4.2 lists it there and §6 says the attempt transaction "increments terminal-local authorization sequence".
- **Open, flagged rather than silently decided:** B1a put a `local_authorization_sequence` on `human_auth_attempt_state` with a per-user doc comment. Two counters with the same name and different scopes is exactly how a future reader gets it wrong. Removing the attempt-state one needs a table rebuild in SQLite, so it is deliberately deferred with the question recorded instead of being dropped inside a schema unit.
- **Abstraction choice, declared:** the merged `updateTerminalStateIfRevisionMatches` is a seven-parameter compare-and-set. Extending it to cover every new field would produce a seventeen-parameter method. It is replaced by transition-shaped compare-and-sets — receive, submit, confirm, record-floor, mark-integrity — each of which sets only what its transition owns and keeps the `revision = revision + 1` increment in SQL.
- **Sentinel question settled by evidence, not by assumption:** the "no candidate" and "no integrity classification" states carry no `CHECK`. Verified against the pinned packages: Floor 1.5.0's `Entity` annotation exposes only `tableName`, `indices`, `foreignKeys`, `primaryKeys` and `withoutRowid`, and `ColumnInfo` exposes only `name`, so a fresh install could never build the constraint while an upgraded database would have it — the exact install-versus-upgrade drift B1a.1 had to repair. The pairing is a documented invariant enforced by tests.
- **One divergence between the paths is structurally unavoidable and now pinned:** SQLite cannot add a `NOT NULL` column without a default and Floor's entity DDL cannot declare one, so the upgraded table carries `DEFAULT` clauses that a fresh install cannot. Presence, type and nullability are identical, and it is unreachable from production because the entity constructor requires all ten fields and no hand-written `INSERT` exists. Both parity assertions compare **shape** (type, nullability, default) rather than names, precisely so a new divergence in either direction fails a test.
- Evidence: RED before implementing — the DAO suite failed to compile on the five undefined transitions and the database suite failed to load on the undefined `migration53_54`; GREEN 26/26 DAO tests, 94/94 database tests, 785/785 on `test/data/`, `flutter analyze` clean. The compare-and-set suite seeds `revision: 7` so a hardcoded comparison cannot pass, and compares all seventeen columns after every losing attempt to prove no partial application.
- **Independent verification confirmed the `CHECK` reasoning against the pinned packages and one reading of the state vocabulary:** `ACK_CONFIRMED` is deliberately never persisted. §5.4 says the POS "atomically records the receipt and promotes candidate to ACTIVE", and the spec delta names only three states, so it is a transient label rather than a missing state. It also found and this unit closed the weakest assertion: the parity tests asserted only column names, which would have passed while the two paths disagreed on a type or a nullability.
- Carried forward, not fixed here: `local_authorization_sequence = 0` and the `''` negotiated facts are customary sentinels rather than structurally impossible values — §7.2 permits the decimal string `"0"` and the design fixes no starting value, so the counter must be understood as starting at 1. And §5.4's acknowledgement receipt ID and server build have no column: only the server floor is persisted, so whether the receipt lands in the local event log is a question B2d must answer.

#### B2b — The pure state machine

- Status: DONE, commit `8b50ff5` on `feat/ohac-pos-state-machine`, published as issue #448 and PR #449, all checks green (`lint-and-test` 7m26s, `build-check` 2m5s, Cloudflare, GitGuardian); awaiting merge. 980 authored lines (376 source, 603 test, 33 tests) against the 400-line guard, declared under the real-coverage exception.
- `OhacTerminalPhase` with the freeze rule (frozen only in the ack state and under integrity loss — during `RECEIVE_PENDING` the old epoch still governs, per §5's table), `OhacIntegrityClassification` (the §9 vocabulary plus the empty-string no-fault), `OhacTerminalSnapshot` (the immutable row mirror the adapter will map into), and sealed decisions from `decideEpochReceive` and `decideReconciliation`. No database, no `@transaction`, no Dio.
- **The safety hole that verification caught, and why the tests could not:** `decideEpochReceive` classified only against the **candidate** pair, so an epoch at the **active sequence with a different digest** fell through to the stale branch and came back `OHAC_SEQUENCE_NOT_NEWER`. That is a same-sequence digest conflict against the epoch the terminal is asserting under — §9 calls it `ACK_INCONSISTENT` — so a terminal holding a body that conflicts with what the server publishes would have carried on asserting under it. The old test was named after staleness at the active sequence and asserted only the code, which is exactly why it could not tell the two readings apart. The order is now: duplicate no-op against either pair, then digest conflict against either pair, then stale, then accept at exactly `active + 1`, then gap; the conflict check must precede the stale branch, which is what swallowed it.
- **Presence is the sentinel pair, not the sequence alone:** the getters now require both halves, using a constant that had been declared and left unused, with each half-alone case pinned by a test.
- **It deliberately does not re-check identity, build or chain continuation.** `validateEpochAcceptance` owns those, and the snapshot carries no tenant, terminal, build or chain field, so duplication is structurally impossible rather than merely avoided. A known residual: the machine's stale branch keys on `snapshot.activeSequence` while the validator keys on the caller's `acceptedSequence`, so the two only align once the caller is written — and there is no caller yet.
- A test reads the machine's own source and asserts its imports, so the design's domain-policy boundary (§3's closing sentence, not §2) is enforced by a test instead of a comment. The epoch sequence is converted once through the existing Int64 guard, with a test that distinguishes a value `int.parse` would accept from one the guard rejects.
- **Design divergences reported rather than silently resolved:** §5.5's prose writes `ROLLBACK_DETECTED` where §9's table writes `LOCAL_ROLLBACK` (the machine follows §9, and `fromWire('ROLLBACK_DETECTED')` returns null); §5's table has no `INTEGRITY_LOSS` row even though it is a persisted phase, which comes from §5.5 and §9; and the entity's `state` doc comment lists `ACK_CONFIRMED`, which the machine cannot represent and the DDL would happily store, since `state` carries no constraint. The phase set is the union of §5.4 and §5.5 vocabulary with one exclusion each, which is worth an authority amendment.
- Carried forward: §5.5's "byte-identical active state remains intact" reduces to comparing the active digest against the floor digest, the strongest reading available while the machine holds no epoch payload; the byte-level comparison is an adapter concern.

#### B2c — Atomic candidate and pull consumption

Delivered in three units, because the original single slice hid both a structural blocker and three separable concerns.

##### B2c-1 — Consolidate the five DAOs into one

- Status: DONE, commit `ec1c290` on `feat/ohac-pos-candidate-transaction`, published as issue #451 and PR #452, all checks green (`lint-and-test` 6m42s, `build-check` 2m14s, Cloudflare, GitGuardian); awaiting merge.
- **The structural blocker, found by reconnaissance before any code was written:** the atomic five-table transaction was inexpressible. Floor 1.5.0's abstract `@dao` classes expose no constructor and no `database` field — the executor lives only on the generated private subclass, inside a `part` file, so it is unreachable from any DAO — and calling a DAO built over the outer database from inside a transaction **deadlocks rather than queues**, because sqflite holds `_rawLock` for the whole user transaction and the lock is non-reentrant. All twenty `@transaction` methods in this repository are consequently single-DAO, with the class declaring the writes for every table its transaction touches; `SalesTransactionDao` declaring the fulfillment, print and outbox inserts is that convention's fingerprint. So B1b's per-table decomposition and §5.2's transaction boundary could not coexist, and nobody had connected the two until now.
- **The choice, made by the user:** consolidate rather than keep five DAOs and bypass Floor with a service-level `sqflite` transaction, or add a coordinator that redeclares the compare-and-set SQL. Consolidation is the repository's own convention and keeps Floor's generated mappers; the cost is a refactor of merged code and a second round of mock churn.
- Nineteen methods moved verbatim into `OhacDeliveryDao`; `AppDatabase` went from five getters to one. Verified faithfully rather than approximately: normalizing comments and imports, the concatenation of the five deleted files diffs identical to the new one, with fourteen `@Query`, five `@Insert`, five `onConflict` strategies, seventy-nine SQL literal pieces and sixty bindings all matching and no doc line dropped. Counts did not move — 26/26 and 94/94, identical to the previous unit — and the only test edit is which getter a call goes through.
- **The consequence the following units must police:** one handle now exposes writers for all five tables where each handle previously exposed only its own, so the single-writer-per-table guarantee has moved from the type system into review. Nothing exploits it yet; there is still no non-test consumer.

##### B2c-2 — The atomic candidate transactions

- Two transactions, not one, and the reason is §5.1 rather than taste: the design says a deferred terminal **stays in `RECEIVE/PENDING`** with the old epoch governing, which is only possible if the receive is persisted before the flip is gated. So R writes the epoch with its entries, verifies counts and digest, and sets `RECEIVE_PENDING` with the candidate pair and the negotiated facts; S — gated by the drain gate in B3 — flips to `ACK_SUBMITTING`, applies explicit higher `attemptResetGeneration` resets, and appends lifecycle facts. §5.2's single-transaction description covers the ungated case, where S immediately follows R.
- This is the unit where §13's requirement to assert positional `@transaction` generation finally applies. It also needs the adapter mapping a Floor entity into `OhacTerminalSnapshot`, and the caller must align its `acceptedSequence` with the snapshot's active sequence — B2b left that unproven because no caller existed.

##### B2c-3 — Pull consumption

- Consumption of the `humanAuthorization` member of the pull including the explicit non-delivery statuses, and the negotiation parameters sent on the pull from the decision-30 version. Needs `package_info_plus`, which is not yet in `pubspec.yaml`.

#### B2d — Acknowledgement client and reconnect reconciliation

- The acknowledgement client against `POST /v1/sync/inbound/human-authorization/staff-policy/ack`, with the body carrying the claim and the negotiated facts only and identity taken from the device credentials rather than the body.
- Reconnect reconciliation for the two crash windows: a retry while `ACK_SUBMITTING`, and integrity loss.

### B3 — Drain gate and outbox registration (POS)

- The registry, the registration coupler, the blocked `ACK_SUBMITTING` transition, the `OHAC_ACK_DEFERRED_OUTBOX` reason, the bounded retry count, and the quarantine with operator visibility.
- Inert until a registrant exists, so its tests use a test registrant and state that plainly.
- DSI-6's credit-note outbox is the named future registrant.

### Out of scope for this phase

- The administrative PIN-attempt reset writer (`attempt_reset_generation`), tracked as its own issue.
- Any change to the legacy verifier projection or to login, per decision 33.
- Cohort enablement, which stays impossible until this phase is complete.

## Evidence

- Backend half merged: `0f35100`, `12796d59`, `10c67281`, `17083fb5`, `36ab5789`, `6a7163ab`, `42980f78`, `86228729`, `7f2b2b38`.
- POS authority merged: `262088a2` (PR #395, issue #394).
- POS B1a merged: `ee305224` (PR #397, issue #396).
- POS B1b (the DAOs): `4dece9c` on `feat/ohac-pos-daos`, issue #443, PR #444.
- POS B1a.1 (fresh-install DDL parity): `b6339f3` on `fix/ohac-pos-install-parity`, issue #439, PR #440, merged into `main` as `0264fde`. Rebased onto `origin/main` `a8c0b00` after 38 upstream commits; none of them touched the POS database layer or the backend human-authorization module, and the POS database suite is 90/90 on the new base. The branch was renamed from `feat/ohac-pos-daos` because this unit is a fix: one branch per review unit, named for the unit's type. B1b then took the `feat/ohac-pos-daos` name on a fresh branch off `main`.
- Branch state verified after the merge: `feat/ohac-pos-persistence` (tip `a73eb27`) is **tree-identical to `origin/main`** (`git diff --stat` is empty) but is **not an ancestor** of it, because PR #397 was squash-merged — so `git branch -d` cannot prove the merge and `git branch -D` would be required. The branch is still checked out in the `ohac-publisher-design` worktree, which is where these untracked trackers live, so the practical move on that worktree is `git checkout -B <new-branch> origin/main`, which keeps the untracked `odd/` files. The remote branch is already gone, leaving only the stale remote-tracking ref `origin/feat/ohac-pos-persistence`.
- Reconnaissance on `262088a2`: the value layer, the persistence surface, the sync client, the volatile PIN state, the eleven outboxes, the build identity gap, and the test blast radius.
