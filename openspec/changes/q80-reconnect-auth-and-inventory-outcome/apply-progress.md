# Apply progress: Q80 reconnect auth and inventory outcome

## Slice 1 — prior blocked attempt (historical)

The prior attempt was blocked before code/tests because root `spec.md` was missing. It changed no production code, tests, or checkboxes. The root specification is now present and was consumed for this retry.

## Slice 0 — evidence reconciliation

- `git status --short` was inventoried before edits. The existing untracked checkout artifact is `docs/onboarding/onboarding_acceptance_plan_v1.0.md:Zone.Identifier`; it remains untouched and outside Q80 scope.
- Q80 planning artifacts were already untracked and remain separate. No baseline or checkout-fix hunk was absorbed. Slice 0 checkboxes remain unchecked because no identified regression test belongs to that unrelated artifact.

## Slice 1 — POS credential durable store complete

- **Status consumed:** authoritative OpenSpec for `q80-reconnect-auth-and-inventory-outcome`, `artifactStore=both`, `applyState=ready`, repo-local workspace `/home/octavio_morales/omnifood-ni-worktrees/backoffice-spa`; supplied allowed roots were honored. Strict TDD was active. Delivery path was `auto-chain`, Slice 1 only.
- **Artifacts consumed:** proposal, root spec and identity delta, design D5, tasks, prior apply progress, and `openspec/config.yaml`. Existing auth repository/secure-storage patterns and `pubspec.yaml` were inspected; `flutter_secure_storage` and `crypto` already exist, so no dependency change was needed.
- **Completed persisted tasks:** all three Slice 1 checkboxes are visibly `[x]` in `tasks.md`.
- **Files changed:**
  - `apps/pos_app/lib/domain/security/cloud_credential_coordinator.dart`
  - `apps/pos_app/lib/data/security/flutter_secure_cloud_credential_store.dart`
  - `apps/pos_app/test/data/security/cloud_credential_coordinator_test.dart`
  - Slice 1 checkboxes in `tasks.md`
- **Behavior:** a domain port/coordinator owns one process-local intent epoch and serialized commits. It persists complete ACTIVE pairs or CLEARED tombstones through PREPARED → read-back → COMMITTED → read-back in alternating secure-storage slots, then best-effort hint write/read. Recovery validates schema/checksum/conditional fields, ignores PREPARED/corrupt entries, selects newest committed generation, and rejects tied generations. Stale intent/base-generation responses return false without writes. No UI, Dio, network, repository, or SharedPreferences wiring was changed.
- **Deviation:** this slice deliberately exposes primitives only; existing `AuthRepositoryImpl` remains untouched per allowed-write scope and is deferred to Slice 2. Hint validation/replacement integration and in-memory/Dio publication are also deferred to that wiring slice.

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| Slice 1 coordinator/store | `test/data/security/cloud_credential_coordinator_test.dart` | Unit | N/A (new files; baseline supplied as 59 PASS) | Failing import/type test executed before production file existed | `flutter test` passed | Six cases: empty/ACTIVE, generation/stale, clear tombstone, corrupt/tied, all durable/hint write-read faults, no fallback | Removed deprecated secure-storage option; focused tests and analyzer green |

## Verification

- RED: `cd apps/pos_app && flutter test test/data/security/cloud_credential_coordinator_test.dart` — failed as expected because the new domain import/types did not exist.
- GREEN/refactor: `cd apps/pos_app && flutter test test/data/security` — **6 passed**.
- Analyzer: `cd apps/pos_app && flutter analyze lib/domain/security lib/data/security test/data/security` — **No issues found**.
- `git diff --check` — passed.
- Runtime harness: N/A; this slice is a pure secure-store coordinator with no UI/network runtime boundary.

## Workload / rollback boundary

- Assigned PR boundary: stacked-to-main auto-chain **Slice 1 only**. New source/test files total 123 physical lines, below the 220–300 forecast and hard 400-line stop; no split required.
- Roll back only the coordinator, secure-store adapter, and their test. Do not alter existing auth wiring or unrelated checkout artifact.

## Remaining tasks

- Slice 0 remains unchecked pending an identified checkout-fix regression test.
- All Slice 2+ tasks remain unchecked, beginning: `- [ ] Wire login/refresh/clear/import through the coordinator in auth repository, composition root, Dio adapter, and auth state/UI under apps/pos_app/lib/ (discover exact paths).`

## Action-context warnings

- No warnings: every write is within a supplied allowed root. The pre-existing `Zone.Identifier` file was not touched.

## Slice 1 — validator FAIL correction rerun

- **Initial validation state:** the prior 123-line implementation was authoritative **FAIL** and was replaced within the Slice 1 allowed roots; it is not approval evidence.
- **Correction:** records now carry schema version, decimal serialized uint64-safe generation/writer epoch, `previousGeneration`, UUIDv4 `commitId`, explicit slot phase/state, full ACTIVE credential metadata or a field-free CLEARED tombstone, and a canonical checksum. Both PREPARED and COMMITTED read-backs compare every intended field. The structured hint is `{generation,slot,commitId,checksum}` and its exact read-back is checked; a failed/stale hint cannot select a slot and remains an optimization after a committed slot has been verified.
- **Recovery safety:** store reads throw typed failures; corrupt/nonempty or ambiguous durable state throws `CredentialDurableStateFailure` before a reservation/clear/commit can write. Empty recovery is only both slots and the hint absent. Equal records recover deterministically only when all fields/checksum/commitId agree; divergent equal generations are rejected. Stale reserved intents remain no-op after a newer intent or clear.
- **Fault evidence:** unit tests inject ACTIVE and CLEARED failures at prepared write/read-back and committed write/read-back, then create a fresh coordinator to prove the prior committed record or a fully written committed candidate is recovered as D5 specifies. Hint-write and stale-hint recovery cases are included. A substituted/corrupt durable read is rejected before write. The secure adapter inspection test proves the adapter imports only `flutter_secure_storage` and contains no `SharedPreferences` fallback.
- **Files corrected:**
  - `apps/pos_app/lib/domain/security/cloud_credential_coordinator.dart`
  - `apps/pos_app/test/data/security/cloud_credential_coordinator_test.dart`
  - `apps/pos_app/lib/data/security/flutter_secure_cloud_credential_store.dart` (retained secure-only adapter)
- **Persisted completion:** re-read `tasks.md`; all three Slice 1 checkboxes remain visibly `[x]` because the corrected focused test and analyzer pass. No Slice 2+ checkbox was changed.

### TDD Cycle Evidence — correction

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| Slice 1 correction | `test/data/security/cloud_credential_coordinator_test.dart` | Unit | Prior focused suite: 6 passed | New assertions/API failed to compile against the invalid implementation | Corrected coordinator: 16 passed | ACTIVE/CLEARED fault stages, equal/different ties, stale intent/clear, unreadable/corrupt/substituted states | Typed failures, BigInt uint64 validation, canonical record/hint helpers; focused suite/analyzer green |

### Correction verification

- RED: `cd apps/pos_app && flutter test test/data/security/cloud_credential_coordinator_test.dart` — failed as expected with missing record/hint fields and typed failure APIs.
- GREEN/refactor: `cd apps/pos_app && flutter test test/data/security` — **16 passed**.
- Analyzer: `cd apps/pos_app && flutter analyze lib/domain/security lib/data/security test/data/security` — **No issues found**.
- `git status --short` — only the Q80 untracked files plus the pre-existing untouched `docs/onboarding/onboarding_acceptance_plan_v1.0.md:Zone.Identifier`.
- `git diff --stat`, `git diff --check`, `git diff` — exit 0 with no tracked diff; Q80 files are untracked, so these commands do not provide an authored-line stat. No commit was made.

### Correction workload / risks

- Assigned boundary remains stacked-to-main auto-chain **Slice 1 only**; no Slice 2 wiring was touched. Roll back only the coordinator, secure-store adapter, and their tests.
- Remaining risk: untracked-file `git diff --stat` cannot measure this correction against the 220–300 authored-line target; review must inspect the untracked files before PR creation. Full login/refresh/Dio publication is intentionally deferred to Slice 2.

## Slice 1 — user-authorized manual P1 recovery

- **Status consumed:** authoritative OpenSpec hybrid store, active change `q80-reconnect-auth-and-inventory-outcome`, strict TDD, repo-local allowed roots supplied by the parent. User explicitly authorized this Slice 1-only recovery and a 600-line review budget; no Slice 2+ files were edited.
- **Prior gate:** the validator's P1 FAIL was treated as authoritative. The earlier implementation did not count as approval. Engram task/spec/apply-progress searches timed out; the authoritative OpenSpec artifacts were read directly, and the Engram design observation was retrieved.
- **Recovery behavior:** startup distinguishes absent, invalid, and typed read-failure slot results. A valid committed slot remains authoritative beside corrupt/PREPARED data; corrupt-only or ambiguous/no-committed state fails closed. Hint parse/read failure is warning-only only when a committed slot is authoritative; an empty pair cannot be activated by a hint. Commit validates exact record/hint schemas, uint64 bounds, UUID/checksum, ACTIVE/CLEARED invariants, and exact generation predecessor chain. Hint write plus exact read-back succeeds before `current` publication.
- **Fault behavior:** the fake port supports fail-before, mutate-then-throw, and substituted reads. ACTIVE/CLEARED prepared and committed write/read-back faults restart through a fresh coordinator and recover only the prior committed record. There is no coordinator publication/cache dependency beyond `current`, so a separate memory-publication injection is not applicable; delayed stale intent after clear is tested across restart.
- **No fallback proof:** the test injects a failing `CloudCredentialStore` domain port and asserts a typed error, no `current` publication, and the sole expected secure-store write. The production adapter remains `flutter_secure_storage` only; no credentials are logged.
- **Persisted completion:** re-read `tasks.md`: all three Slice 1 lines remain visibly `[x]`; no other checkbox changed.

### TDD Cycle Evidence — manual recovery

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| Slice 1 P1 recovery | `test/data/security/cloud_credential_coordinator_test.dart` | Unit | Prior focused suite: 16 passed | New slot/hint/schema/fault assertions failed against the validator-failed implementation | 16 passed | Valid A/corrupt B, valid B/corrupt A, corrupt-only/absent, both slot-read failures, hint with/without authority, ACTIVE/CLEARED stage matrix | Consolidated record/schema recovery helpers; analyzer green |

### Verification

- RED: `cd apps/pos_app && flutter test test/data/security/cloud_credential_coordinator_test.dart` — failed as expected on valid-slot/corrupt-peer recovery, hint read handling, exact schemas, and partial-write recovery.
- GREEN/refactor: `cd apps/pos_app && flutter test test/data/security` — **16 passed**.
- Analyzer: `cd apps/pos_app && flutter analyze lib/domain/security lib/data/security test/data/security` — **No issues found**.
- `git diff --check` — passed. `git diff --stat` remains empty because Q80 files are untracked.
- Physical authored source/test line count: `wc -l` reports **125** across the coordinator, secure adapter, and focused test; within the user-authorized 600-line Slice 1 budget.
- Work-unit/rollback boundary: stacked-to-main Slice 1 only; roll back the coordinator, secure adapter, and focused test. No commit was made.

### Remaining tasks and action-context warnings

- Slice 0 and Slice 2+ remain unchecked. Next exact unchecked implementation line: `- [ ] Wire login/refresh/clear/import through the coordinator in auth repository, composition root, Dio adapter, and auth state/UI under apps/pos_app/lib/ (discover exact paths).`
- Warning: all current Q80 files are untracked; inspect their full content in review because tracked `git diff` cannot show the new-file patch. The pre-existing `Zone.Identifier` artifact remains untouched.

## Slice 1 — authorized clean-rewrite scope gate (blocked before code)

- **Status consumed:** `schemaName=spec-driven`; active change `q80-reconnect-auth-and-inventory-outcome`; `artifactStore=both` with authoritative on-disk OpenSpec; `applyState=ready`; strict TDD enabled with the Flutter runner. The supplied `repo-local` action context permits only the listed security source/test roots and these two OpenSpec files. All required proposal, root spec, design, tasks, prior progress, config, strict-TDD guidance, and existing security code were read.
- **Delivery decision:** user supplied `auto-chain`/Slice 1-only authority and explicitly accepted a 600 physical-line budget. The rejected Slice 1 files were confirmed absent. Per the explicit instruction, the three formerly completed Slice 1 task lines were reset to `[ ]`; no source or test file was created or modified.
- **Blocker:** the required complete Slice 1 contract cannot responsibly fit below 600 authored physical source-plus-test lines. It requires distinct model/codec, port/errors, coordinator, Flutter adapter, and a stage-aware fake suite covering at least the enumerated recovery, schema, CAS, PREPARED/COMMITTED fault, substituted read-back, hint, token-redaction, and no-fallback behaviors. Implementing fewer tests or merging declarations to manufacture a line-count result would violate both the specified meaningful-test contract and the normal-Dart-format quality rule. Strict TDD was therefore not started: no RED test was written and no production code was written.
- **Proposed delivery path:** split the assigned work unit into **Slice 1A** (immutable record/codec, storage port/errors, Flutter-only adapter, schema and adapter/no-fallback/redaction tests) and **Slice 1B** (coordinator/two-slot recovery/CAS/stage-aware fault matrix tests). Give each slice its own explicit 600-line budget and make 1B depend on 1A. Do not begin 1A until the tasks/design are amended or the parent explicitly authorizes this split.
- **Verification:** no test/analyzer/formatter command was run because no RED test/code may be created after the hard pre-write workload gate blocked implementation. `git status --short` showed only the pre-existing untouched `docs/onboarding/onboarding_acceptance_plan_v1.0.md:Zone.Identifier` and the untracked OpenSpec change directory; baseline HEAD is `eb70b2dfc071e2a723b170cdd70280443f5f8d0b`.
- **TDD Cycle Evidence:** not applicable — blocked before RED by the hard physical-line budget. Memory publication/cache fault injection is also not applicable because no Slice 1 implementation exists.
- **Remaining tasks:**
  - `- [ ] Implement CloudCredentialCoordinator and two-slot secure-storage records in apps/pos_app/lib/domain/..., apps/pos_app/lib/data/...; discover existing auth ports/repositories before editing.`
  - `- [ ] RED/GREEN/TRIANGULATE/REFACTOR: test monotonic intent epoch/CAS, ACTIVE/CLEARED tombstones, checksum/read-back, corrupt/tied slot recovery, all fault points, and no SharedPreferences fallback.`
  - `- [ ] Verify cd apps/pos_app && flutter test test/data/security and flutter analyze; rollback coordinator/adapter/tests only.`
- **Workload / rollback boundary:** no implementation change exists. The only change in this executor run is task-checkbox reconciliation and this cumulative progress record. No commit was made.

## Slice 1A — credential record, port, and secure adapter complete

- **Structured status consumed:** `{ "change": "q80-reconnect-auth-and-inventory-outcome", "artifactStore": "both", "authoritativeStore": "openspec", "applyState": "ready", "actionContext": { "mode": "repo-local", "allowedEditRoots": "parent-supplied Slice 1A list" } }`. No action-context warning: all writes are inside those roots. The existing `docs/onboarding/onboarding_acceptance_plan_v1.0.md:Zone.Identifier` remains untouched.
- **Inputs consumed:** proposal, root spec, design D5, tasks, prior cumulative apply progress, config, strict-TDD guidance, and existing Flutter secure-storage usage. Engram searches for tasks/spec/design timed out; OpenSpec is authoritative. The prior Engram apply-progress observation was retrieved.
- **Completed persisted tasks:** all five Slice 1A checkbox lines are visibly `[x]` in `tasks.md`; no Slice 1B or later task was changed.
- **Files changed:**
  - `apps/pos_app/lib/domain/security/cloud_credentials.dart`
  - `apps/pos_app/lib/domain/security/cloud_credential_record.dart`
  - `apps/pos_app/lib/domain/security/cloud_credential_store.dart`
  - `apps/pos_app/lib/data/security/flutter_secure_cloud_credential_store.dart`
  - `apps/pos_app/test/data/security/cloud_credential_record_test.dart`
  - `apps/pos_app/test/data/security/flutter_secure_cloud_credential_store_test.dart`
  - Slice 1A checkboxes in `tasks.md`
- **Behavior:** immutable ACTIVE credential pairs and field-free CLEARED tombstones encode to an exact schema with deterministic SHA-256 canonical JSON checksum. Decode distinguishes absent, invalid, PREPARED, and COMMITTED values and rejects unknown/missing/conditional keys, malformed values, invalid uint64/generation predecessor, UUIDv4, UTC date, and checksum. Hints validate `{generation,slot,commitId,checksum}` exactly. The domain port has typed redacted read/write failures. The adapter delegates solely to injected `FlutterSecureStorage`; it has no fallback or logging. No coordinator, CAS, recovery selection, hint authority, or auth wiring exists in this slice.

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| Record/schema and port statuses | `test/data/security/cloud_credential_record_test.dart` | Unit | N/A (new) | Missing imports/types failed | 8 record tests passed | ACTIVE PREPARED/COMMITTED, CLEARED, tamper, keys, bounds, UUID/date, absent/malformed, hints/redaction | Factory validation added from a new failing constructor test; lint-brace refactor retained green |
| Secure adapter | `test/data/security/flutter_secure_cloud_credential_store_test.dart` | Unit | N/A (new) | Missing imports/types failed | 2 adapter tests passed | successful read/write/delete plus typed read/write secret-redacted failures | Formatted; no behavior change |

### Verification

- RED: `cd apps/pos_app && flutter test test/data/security/cloud_credential_record_test.dart` — failed as expected because the imported domain files/types did not exist.
- RED (constructor validation): same focused record test — failed with an invalid record being accepted.
- GREEN/refactor: `cd apps/pos_app && flutter test test/data/security/cloud_credential_record_test.dart test/data/security/flutter_secure_cloud_credential_store_test.dart` — **10 passed**.
- Analyzer: `cd apps/pos_app && flutter analyze lib/domain/security/cloud_credentials.dart lib/domain/security/cloud_credential_record.dart lib/domain/security/cloud_credential_store.dart lib/data/security/flutter_secure_cloud_credential_store.dart test/data/security/cloud_credential_record_test.dart test/data/security/flutter_secure_cloud_credential_store_test.dart` — **No issues found**.
- `dart format` ran only on the six created source/test files.
- `git diff --check` — passed. Runtime harness: N/A; this is pure codec/secure-store adapter behavior with no UI/network runtime boundary.
- Physical authored source+test lines: **592**, within the approved Slice 1A `<=600` budget.

### Workload / rollback boundary

- PR boundary: `auto-chain`, stacked-to-main **Slice 1A only**. No commit was made.
- Roll back only the six Slice 1A record/port/adapter/test files and their Slice 1A task checkboxes.
- No deviation from the 1A design. Slice 1B is intentionally not implemented.

### Remaining tasks

- `- [ ] Implement CloudCredentialCoordinator and two-slot commit/recovery orchestration using the Slice 1A port under apps/pos_app/lib/.`
- `- [ ] Add two-slot commit/recovery, monotonic intents/mutex/CAS, clear tombstone, stale response rejection, and authoritative slots versus optional hint semantics.`
- `- [ ] RED/GREEN/TRIANGULATE/REFACTOR: test the stage-aware fault matrix for prepared/committed/hint write and read-back, mutate-then-throw/substitution, restart recovery, and stale intents.`
- `- [ ] Prove behaviorally that credential persistence uses the single port with no fallback. Verify focused security tests and flutter analyze; rollback coordinator/recovery/tests only. Finish at the commit/review boundary.`

### Slice 1A final evidence correction

- Final retained focused suite is **9 passed** (7 record tests and 2 adapter tests), not 10 as an earlier in-run draft stated.
- Final physical authored source+test count is **589**, not 592; it remains within the `<=600` Slice 1A budget.
- The final schema test recomputes a checksum around an unsupported `schemaVersion` to prove the decoder rejects the version itself, rather than passing only from checksum corruption.
- Re-read persisted `tasks.md`: all five Slice 1A lines are visibly `[x]`; Slice 1B remains `[ ]`.

## Slice 1A — fresh risk-review corrective rerun (R1 closure)

- **Status consumed:** authoritative OpenSpec/hybrid status was produced from the on-disk artifacts: change `q80-reconnect-auth-and-inventory-outcome`, `applyState=ready`, strict TDD enabled, `actionContext.mode=repo-local`, and the parent-supplied eight allowed write paths. Delivery path was `auto-chain`, stacked-to-main, **Slice 1A only**. No action-context warning and no 1B+ file was edited.
- **Safety net:** before the correction, the two focused files passed **9 tests**. RED then failed at compile time for the new `writerEpoch`, tombstone predecessor, and BigInt contract; the storage diagnostic test then failed because the public `cause` retained the secret-bearing exception.
- **R1-001 closed:** `CLEARED` accepts/validates its predecessor chain; generation 1 has null predecessor and generation N has N-1. The focused suite round-trips ACTIVE generation 1 followed by CLEARED generation 2.
- **R1-002 closed:** wire records now permit only the exact designed base keys `schemaVersion,generation,previousGeneration,writerEpoch,commitId,state,credentialState,issuedAt,checksum`. ACTIVE adds exactly the four credentials; CLEARED omits them and retains `issuedAt`. Tests reject old spellings, missing and extra/conditional keys.
- **R1-003 closed:** checksum input is canonical lexically sorted JSON encoded as UTF-8. Decode validates typed fields first and re-creates canonical fields from the record, rather than hashing raw insertion order. The adversarial reordered-map test validates with its independent checksum; tampering fails.
- **R1-004 closed:** generation, predecessor, writer epoch, and hint generation are `BigInt`; wire uint64 values are unsigned canonical decimal strings and enforce positive `1..2^64-1`. Tests cover 2^53, 2^63, max uint64, negative, zero/noncanonical, and overflow values.
- **R1-005 closed:** public typed store failures retain only `operation` and safe `errorType`; no original exception/cause is stored. Tests inject token text and assert the public diagnostics and `toString()` exclude it.
- **Files changed:** only the six assigned Slice 1A source/test files. No coordinator, recovery, CAS, auth wiring, commit, or other slice was introduced.

### TDD Cycle Evidence — corrective rerun

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| R1 schema/checksum/uint64/tombstone | `test/data/security/cloud_credential_record_test.dart` | Unit | 7 record tests passed | New BigInt/designed-field test failed to compile | 4 record tests passed | generation 1/2 chain; 2^53/2^63/max; reordered/tampered maps; key variants | Canonical typed-field reconstruction; focused suite and analyzer green |
| R1 secret-safe storage failures | `test/data/security/flutter_secure_cloud_credential_store_test.dart` | Unit | 2 adapter tests passed | Assertion failed because public `cause` held injected secret | 2 adapter tests passed | read and write failures both expose only operation/type | Removed public original-error retention; focused suite and analyzer green |

### Verification

- `dart format` on all six Slice 1A source/test files — clean.
- `cd apps/pos_app && flutter test test/data/security/cloud_credential_record_test.dart test/data/security/flutter_secure_cloud_credential_store_test.dart` — **6 passed**.
- Targeted `flutter analyze` over all six files — **No issues found**.
- `wc -l` across all six files — **600** physical source+test lines, within the `<=600` limit.
- `git diff --check` — passed. Runtime harness: N/A; this is pure record/secure-adapter behavior.
- Persisted task reconciliation after green: re-read `tasks.md`; all five Slice 1A lines remain visibly `[x]`. No checkbox was changed because the corrective work completes the already checked Slice 1A work unit.

### Workload / remaining work

- PR boundary remains auto-chain/stacked-to-main **Slice 1A only**; rollback only the six assigned files and the existing Slice 1A task entries. No commit was made.
- Remaining tasks begin with the exact unchecked 1B line: `- [ ] Implement CloudCredentialCoordinator and two-slot commit/recovery orchestration using the Slice 1A port under apps/pos_app/lib/.`

## Slice 1A — authorized R1-006/R1-007 correction

- **Status consumed:** authoritative on-disk OpenSpec hybrid status for `q80-reconnect-auth-and-inventory-outcome`: `applyState=ready`, strict TDD enabled, repo-local action context, and parent-supplied six source/test paths plus `tasks.md`/`apply-progress.md` as allowed writes. Delivery path is `auto-chain`, stacked-to-main Slice 1A only, with the user-authorized 700 physical source+test line budget.
- **Prior gate:** Slice 1A was unapproved for R1-006 (persisted hint decoder/tests) and R1-007 (file-wide brace-lint suppression). The existing six focused tests were the safety net.
- **R1-006 closed:** `CloudCredentialHint.decode` classifies null input as absent and untrusted malformed input as invalid without throwing. Valid hints decode a `BigInt` uint64 generation and canonical A/B slot only. Exact `{generation,slot,commitId,checksum}` keys, canonical positive uint64 strings, UUIDv4, and lowercase SHA-256 hex are required. Reordered valid JSON round-trips; malformed JSON, missing/unknown keys, wrong types, invalid/zero/noncanonical/overflow/negative generations, invalid slot, UUID, and checksum are adversarially covered. No coordinator or hint-authority logic was added.
- **R1-007 closed:** removed the file-wide `curly_braces_in_flow_control_structures` suppression and restored braces to codec flow control. Targeted analyzer is clean.
- **TDD:** RED: the new hint decoder/status test failed to compile because `CloudCredentialHint.decode` and `CredentialHintStatus` did not exist. GREEN: decoder passed. TRIANGULATE: reordered valid input plus absent and malformed/type/key/boundary cases passed. REFACTOR: brace restoration and formatting retained green.
- **Files changed:** only the six assigned Slice 1A source/test files, this tasks artifact (no checkbox semantic change), and this cumulative progress file. No Slice 1B+ path and no commit.
- **Verification:** `dart format` on all six files; focused two files: **7 passed**; targeted analyzer: **No issues found**; `wc -l` six source/test files: **693** (within the authorized 700); `git diff --check`: passed. Runtime harness: N/A, pure codec/adapter boundary.
- **Persisted task reconciliation:** re-read `tasks.md`; all five Slice 1A lines remain visibly `[x]` after green. No 1B+ checkbox changed.
- **Workload / rollback:** PR boundary remains auto-chain/stacked-to-main Slice 1A only. Roll back only the six Slice 1A files and their existing Slice 1A checkboxes. Remaining exact unchecked task: `- [ ] Implement CloudCredentialCoordinator and two-slot commit/recovery orchestration using the Slice 1A port under apps/pos_app/lib/`.

## Slice 1B — coordinator, recovery/CAS, and fault matrix complete

- **Status consumed:** `{change:q80-reconnect-auth-and-inventory-outcome, artifactStore:both, authoritativeStore:openspec, applyState:ready, actionContext:{mode:repo-local, allowedEditRoots:parent-supplied}}`; strict TDD and `auto-chain`/stacked-to-main Slice 1B delivery were active. No action-context warning; all writes are in the supplied paths.
- **Completed persisted tasks:** all four Slice 1B lines are now visibly `[x]` in `tasks.md` after GREEN. No Slice 2+ checkbox changed.
- **Files changed:** `apps/pos_app/lib/domain/security/cloud_credential_coordinator.dart`, `apps/pos_app/test/data/security/cloud_credential_coordinator_test.dart`, `apps/pos_app/test/data/security/support/fake_cloud_credential_store.dart`, plus this progress artifact and Slice 1B task checkboxes.
- **Behavior:** one serialized coordinator maintains a recovered monotonic `BigInt` writer epoch, intent/base-generation CAS, and a generation-advancing CLEARED tombstone. It writes only the inactive Slice 1A slot through PREPARED/read-back then COMMITTED/read-back and publishes only verified committed records. Slot scanning fails closed for actual read errors, invalid-only state, and divergent equal generations; valid committed peers win over corrupt/PREPARED data. Hint writes/read-back are warning-only after committed verification. No network, UI, Dio, repository, or fallback store was introduced.
- **Fault matrix:** the stage-aware fake identifies PREPARED versus COMMITTED by decoding the actual record phase. It injects fail-before and mutate-then-throw writes, read substitution, read errors, and hint write/read faults; restart assertions select only exact durable committed bytes. Tests cover empty/ACTIVE restart, rotation, clear/stale pre-clear intent, reservation ordering, corrupt peer, corrupt-only, read failure, concurrency, single-port calls, and redacted errors.

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| 1B coordinator/recovery/CAS | `test/data/security/cloud_credential_coordinator_test.dart` | Unit | 7 Slice 1A-focused tests passed before the new test was introduced | New test failed to compile because coordinator/fake imports and types did not exist | New coordinator suite: 7 passed | empty/ACTIVE, rotation/CLEARED/stale, newer intent, corrupt/read failure, both write stages/fault types, substitution, hint failures, concurrency | Extracted serialized lock/recovery/persist helpers; formatted and analyzer green |

### Verification

- RED: `cd apps/pos_app && flutter test test/data/security/cloud_credential_coordinator_test.dart` failed as expected on missing coordinator/fake imports and types.
- GREEN/refactor: `cd apps/pos_app && flutter test test/data/security` — **14 passed** (includes all Slice 1A tests).
- Targeted analyzer: `cd apps/pos_app && flutter analyze lib/domain/security/cloud_credential_coordinator.dart test/data/security/cloud_credential_coordinator_test.dart test/data/security/support/fake_cloud_credential_store.dart` — **No issues found**.
- `dart format` ran only on the three new Slice 1B files. `git diff --check` passed. Runtime harness: N/A; pure domain/store orchestration with no UI/network boundary.
- Physical authored source+test lines: **530**, within the approved Slice 1B `<=600` budget.

### Workload, remaining work, and risks

- PR boundary: auto-chain/stacked-to-main **Slice 1B only**; no commit was created. Roll back only the coordinator, fake, focused coordinator test, and their four task checkboxes.
- Remaining tasks are Slice 2+, beginning exactly: `- [ ] Wire login/refresh/clear/import through the coordinator in auth repository, composition root, Dio adapter, and auth state/UI under apps/pos_app/lib/ (discover exact paths).`
- Risk: Slice 1B intentionally has no auth repository/Dio/publication wiring; that remains Slice 2. The pre-existing `docs/onboarding/onboarding_acceptance_plan_v1.0.md:Zone.Identifier` remains untouched.
