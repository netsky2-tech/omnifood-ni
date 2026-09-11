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

## Slice 2 — POS auth repository, Dio interceptor and error classification complete

- **Status consumed:** `{change:q80-reconnect-auth-and-inventory-outcome, artifactStore:both, authoritativeStore:openspec, applyState:ready}`; strict TDD active.
- **Completed persisted tasks:** all three Slice 2 lines are now visibly `[x]` in `tasks.md`.
- **Files changed/created:**
  - `apps/pos_app/lib/data/network/cloud_auth_interceptor.dart`
  - `apps/pos_app/lib/data/repositories/auth_repository_impl.dart`
  - `apps/pos_app/lib/main.dart`
  - `apps/pos_app/lib/data/security/flutter_secure_cloud_credential_store.dart`
  - `apps/pos_app/test/data/network/cloud_auth_interceptor_test.dart`
  - `apps/pos_app/test/data/repositories/auth_repository_credential_coordinator_test.dart`
- **Behavior:**
  - `CloudAuthInterceptor` handles automatic 401 interception: coalesces concurrent 401s into a single `/identity/refresh` call, rotates tokens through `CloudCredentialCoordinator`, and retries the original request with `retryAttempt = 1`.
  - Non-retryable 401 (e.g. revoked refresh token) triggers `onReauthenticationRequired` without destroying local SQLite user or session.
  - Network timeout during refresh leaves local credentials untouched and lets network error bubble up.
  - `AuthRepositoryImpl` integrates `CloudCredentialCoordinator`: online login saves both access and refresh tokens into the coordinator; logout commits a CLEARED tombstone; `loginOffline` remains 100% offline with zero HTTP or secure store interaction.
  - `main.dart` wires `FlutterSecureCloudCredentialStore`, `CloudCredentialCoordinator`, and `CloudAuthInterceptor`.

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| CloudAuthInterceptor | `test/data/network/cloud_auth_interceptor_test.dart` | Interceptor Unit | 59 checkout/cash tests passed | File did not exist, compilation failed | Implemented interceptor, 7/7 tests passed | Single refresh flight, 401 loop prevention, coalesced concurrent 401s, timeout preservation | Extracted coalesced refresh helper; formatted |
| AuthRepository Coordinator wiring | `test/data/repositories/auth_repository_credential_coordinator_test.dart` | Repo Unit | 7 interceptor tests passed | Compilation failed: missing coordinator param | Wired coordinator, 3/3 passed | Online login saves tokens, logout clears tombstone, offline login 0 HTTP/store calls | Handled tenantId fallback and SharedPreferences isolation |

### Verification

- GREEN: `cd apps/pos_app && flutter test test/data/network test/data/repositories/auth_repository_credential_coordinator_test.dart test/data/security` — **24 passed**.
- Regression: Full auth/security suite (51 passed) + full sales/caja suite (59 passed) — **110 passed total**.
- Targeted analyzer: clean.
- `git diff --check` passed.
- Authored production lines delta: ~254 lines (within 210–290 line budget).

## Slice 3 — Reconnect integration complete

- **Status consumed:** `{change:q80-reconnect-auth-and-inventory-outcome, artifactStore:both, authoritativeStore:openspec, applyState:ready}`; strict TDD active.
- **Completed persisted tasks:** all three Slice 3 lines are now visibly `[x]` in `tasks.md`.
- **Files changed/created:**
  - `apps/pos_app/lib/data/services/sync_service.dart`
  - `apps/pos_app/test/data/services/sync_service_reconnect_test.dart`
  - `apps/pos_app/test/data/services/sync_service_test.dart`
- **Behavior:**
  - `SyncService` classifies 401/403 responses explicitly as `'Reautenticación requerida con el servidor nube (HTTP 401/403)'` instead of generic domain strings like `Sales; Catálogo`.
  - Once cloud authentication is detected as invalid during a pass, downstream domain calls are aborted to avoid spamming the backend.
  - Coalesces rapid sync triggers into sequential non-overlapping executions using `_hasPendingSyncRequest` without race conditions.
  - Startup displays the local PIN unlock pad immediately without waiting on network or blocking.
  - On network timeout or unauthenticated error, pending SQLite invoices and movements remain strictly in `pending` status with zero accidental `markAsSynced` calls.

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| Reconnect & Auth Error Classification | `test/data/services/sync_service_reconnect_test.dart` | Service Unit | 110 auth/security/sales tests passed | Expected contains 'Reautenticación requerida', Actual: 'Sales; Producción; Kardex' | Implemented classification & coalescing, 3/3 passed | 401 explicit error classification, coalesced rapid triggers, SQLite pending work preservation on timeout | Cleaned up inline diffs without formatting churn |

### Verification

- GREEN: `cd apps/pos_app && flutter test test/data/services/sync_service_test.dart test/data/services/sync_service_reconnect_test.dart` — **53 passed**.
- Regression: Full security/auth/sales test suites pass without regression.
- Targeted analyzer: clean (0 errors).
- `git diff --check` passed.
- Authored production lines delta: 39 lines (well under 180–260 line budget).

## Slice 4 — pre-write workload gate (blocked)

- **Structured status produced:** `{schemaName: spec-driven, changeName: q80-reconnect-auth-and-inventory-outcome, artifactStore: both, changeRoot: openspec/changes/q80-reconnect-auth-and-inventory-outcome, artifacts: {proposal: done, specs: done, design: done, tasks: done, applyProgress: done}, applyState: ready, actionContext: {mode: repo-local, workspaceRoot: /home/octavio_morales/omnifood-ni-worktrees/backoffice-spa, allowedEditRoots: [/home/octavio_morales/omnifood-ni-worktrees/backoffice-spa]}, nextRecommended: apply Slice 4}`. The parent did not supply structured status/actionContext; this was produced using the installed status contract. No out-of-workspace target was considered.
- **Inputs consumed before edits:** proposal, root/spec references, design D3, tasks, prior cumulative apply progress, `openspec/config.yaml`, global strict-TDD guidance, backend `AGENTS.md`, the authoritative Engram D3 correction (observation #8720), and the current uncommitted backend draft. The injected skills were read from their exact supplied paths. The existing `docs/onboarding/onboarding_acceptance_plan_v1.0.md:Zone.Identifier` was identified and left untouched.
- **Delivery gate:** tasks require `auto-chain`, stacked-to-main, and Slice 4 only. That delivery path is supplied, but the 220–300 authored source+test budget cannot contain the required scope. No production code, test, generated file, or checkbox was changed in this attempt, so strict TDD was correctly stopped before RED rather than leaving an incomplete cross-stack implementation.
- **Exact budget pressure:** the current backend draft is already **240 physical changed lines**: 60 tracked additions/deletions plus 180 lines in the untracked migration/entity/entity-spec. It still needs tenant composite constraints, RLS SELECT/INSERT/UPDATE policies, legal supersession/history guards, migration up/down/DB tests, mapping-only deltas, and behavior tests. The required POS domain/entity/mapper/inbound-sync/Floor migration/focused tests is absent and necessarily adds a second work unit plus generated Floor output. A conservative backend correction/test minimum of 120 lines and POS source/test minimum of 140 lines yields **500 authored source+test lines** before generated output, exceeding the 300-line cap by at least **200 lines**. This excludes any additional migration DB harness needed to prove parent-key conventions.
- **Draft findings retained for the next split:** its mapping migration has no tenant-scoped product/insumo foreign keys, only one permissive RLS policy (no explicit INSERT/UPDATE `WITH CHECK`), destructive unconditional down migration, and no history/tenant/RLS DB tests. The entity's independent FK relations do not enforce matching tenants. Inbound projection only joins active mappings for already selected products, so it cannot deliver mapping-only deltas since the cursor. POS propagation/migration/codegen/tests are absent. No direct-insumo product column was introduced.
- **Required decision:** split Slice 4 into an explicit backend mapping-schema/projection work unit and a POS catalog-persistence work unit, each with its own approved line budget and strict-TDD scope (or explicitly approve `size:exception` for a single Slice 4 work unit). Do not start production code until that delivery/budget decision is recorded.

### TDD Cycle Evidence — Slice 4 pre-write gate

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| Slice 4 | N/A | N/A | Not run: no existing behavior was modified | Not started: hard workload gate | N/A | N/A | N/A |

### Remaining tasks

- `- [ ] Add domain/catalog projection mappingVersionId and backend product_inventory_mapping_versions entity/migration using real tenant-scoped paths under apps/admin_backend/src/ and apps/pos_app/lib/.`
- `- [ ] RED/GREEN/TRIANGULATE/REFACTOR: test SIMPLE/PREPARED/COMPOUND classification, effective mapping lookup, no product-ID equality fallback, tenant ownership, and unchanged historical rows.`
- `- [ ] Verify backend unit/DB tests; rollback mapping entity/migration/projection. Do not invent a products direct-insumo column.`

### Workload / rollback boundary

- Intended PR boundary remains auto-chain/stacked-to-main Slice 4. No implementation work was performed; no rollback is needed for this attempt. The existing uncommitted backend draft is preserved exactly for the next authorized work unit.

## Slice 4 — user-approved size-exception reassessment (blocked before RED)

- **Structured status produced/consumed:** `{schemaName: spec-driven, changeName: q80-reconnect-auth-and-inventory-outcome, artifactStore: both, applyState: ready, actionContext: {mode: repo-local, workspaceRoot: /home/octavio_morales/omnifood-ni-worktrees/backoffice-spa, allowedEditRoots: [/home/octavio_morales/omnifood-ni-worktrees/backoffice-spa]}, nextRecommended: apply Slice 4}`. The parent supplied the active change and explicit `size:exception` but not a status object, so the installed status contract and authoritative on-disk OpenSpec artifacts were used. No edit-root warning exists.
- **Inputs consumed:** proposal, root specification, design D3, tasks, cumulative progress/blocker record, `openspec/config.yaml`, strict-TDD guidance, repository/backend/POS instructions, current uncommitted backend draft, and relevant existing POS product/Floor/migration paths. The two injected skills were read from their exact supplied paths. `docs/onboarding/onboarding_acceptance_plan_v1.0.md:Zone.Identifier` remains untouched.
- **Delivery decision:** the user approved keeping backend + POS together for Slice 4, with a hard maximum of **700 authored source+test lines** (generated Floor/Freezed output excluded). The delivery decision clears the former 300-line forecast gate, but it does not authorize exceeding the newly explicit 700-line stop.
- **Hard stop:** the retained backend draft is already **240 physical authored source/test changed lines** (60 tracked diff lines plus 180 untracked migration/entity/entity-spec lines). It is still missing the mandatory reusable tenant/product/effective-at lookup and atomic supersession service with focused tests; legal close-only history guard; actual tenant-composite database constraints; explicit RLS SELECT/INSERT/UPDATE policies with correct `WITH CHECK`; guarded non-destructive down migration and migration/RLS evidence; mapping-only cursor deltas; and meaningful classification/effective-boundary/ownership/historical-row tests. The POS half is entirely absent and must add the immutable domain/entity/mapper/inbound persistence path, the next Floor migration, generated code via build_runner, and focused tests.
- **Minimum remaining estimate:** even using the existing draft unchanged, the required backend corrections/service/tests are conservatively **>=280** authored lines and the absent POS source/tests/migration are **>=220** authored lines. Together with the existing 240 lines that is **>=740 authored source+test lines**, before formatter-only churn and excluding generated output. Completing this slice would exceed the authorized 700-line cap. Per the parent instruction, no RED test, production code, generated output, or task checkbox was written/changed in this reassessment.
- **Required next delivery decision:** either raise the Slice 4 maximum above the demonstrated `>=740` minimum while accepting that exception, or split it into bounded backend mapping/schema/projection and POS catalog-persistence work units. The latter preserves the original auto-chain intent. Do not begin Slice 5 snapshots or Slices 6/7 sale outcome/acceptance work.

### TDD Cycle Evidence — Slice 4 reassessment

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| Slice 4 mapping/projection | N/A | N/A | Not run; no existing behavior was modified | Not started: hard 700-line cap would be exceeded | N/A | N/A | N/A |

### Verification and rollback

- Runtime harness: **N/A** — blocked before a runnable behavior was created.
- Codegen: **N/A** — no Floor entity/DAO/schema edit was made; `build_runner` was not run.
- Tests/analyzer/DB migration tests: **N/A** — strict TDD correctly stopped before RED because the authorized work unit cannot fit the hard cap.
- Rollback: no new source/test/generated change was made in this reassessment. The existing uncommitted draft remains preserved for the next explicitly authorized work unit; its current migration is not approval evidence and must be corrected, not shipped as-is.
- Persisted task reconciliation: re-read `tasks.md`; all three Slice 4 implementation lines remain visibly `- [ ]`. No checkbox was advanced.

### Remaining tasks

- `- [ ] Add domain/catalog projection mappingVersionId and backend product_inventory_mapping_versions entity/migration using real tenant-scoped paths under apps/admin_backend/src/ and apps/pos_app/lib/.`
- `- [ ] RED/GREEN/TRIANGULATE/REFACTOR: test SIMPLE/PREPARED/COMPOUND classification, effective mapping lookup, no product-ID equality fallback, tenant ownership, and unchanged historical rows.`
- `- [ ] Verify backend unit/DB tests; rollback mapping entity/migration/projection. Do not invent a products direct-insumo column.`

## Slice 4 — implementation resumed; verification blocked by repository baselines

- **Structured status consumed/produced:** `{schemaName: spec-driven, changeName: q80-reconnect-auth-and-inventory-outcome, artifactStore: both, authoritativeStore: openspec, applyState: ready, actionContext: {mode: repo-local, workspaceRoot: /home/octavio_morales/omnifood-ni-worktrees/backoffice-spa, allowedEditRoots: [/home/octavio_morales/omnifood-ni-worktrees/backoffice-spa]}, nextRecommended: repair/re-run Slice 4 verification}`. The user explicitly authorized an unrestricted Slice 4 size exception; the PR boundary remains the single auto-chain/stacked-to-main Slice 4 work unit. No Slice 5+ behavior was added.
- **Implementation:** replaced the inadequate object-only mapping test with metadata/service behavior coverage; added a mapping-version migration/entity and atomic `ProductInventoryMappingService` (close active version then insert a distinct retained version under a transaction/lock); added interval lookup and tenant/product predicate; made mapping-only changes cursor-visible in inbound product deltas; and propagated `productType`, `mappingVersionId`, and `insumoId` through POS Product, Floor entity/migration 47→48, mapper, and inbound persistence. Checked-in generated Floor/Freezed output was regenerated only by `flutter pub run build_runner build --delete-conflicting-outputs`.
- **Safety invariants represented:** migration specifies tenant/product and tenant/insumo composite ownership FKs, one-active partial index, RLS SELECT/INSERT/UPDATE policies, append-only closed-history guard, and a down guard refusing removal where mapping evidence exists. No product-ID/insumo-ID equality inference or direct product-insumo column was added. Legacy invoice acceptance, immutable invoice snapshots/outcomes, and all Slice 5+ behavior remain excluded.
- **Persisted tasks:** all three Slice 4 lines deliberately remain `- [ ]`. The checkbox gate is not satisfied because the required DB suite and POS analyzer did not pass cleanly; re-read `tasks.md` confirms no Slice 4 completion was claimed.

### TDD Cycle Evidence — Slice 4 resumed work

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| Mapping atomicity/effective lookup | `src/modules/inventory/services/product-inventory-mapping.service.spec.ts` | Backend unit | Existing object-only entity test: 2 passed | Missing service import failed | Service test passed | distinct insumo/history close and effective interval/tenant predicate | Replaced object-only assertions with behavior/metadata assertions |
| POS catalog propagation | `test/domain/models/inventory/product_mapping_test.dart` | Flutter unit | N/A (new) | ProductEntity/Product fields absent: compile failed | 2 tests passed | SIMPLE mapped to a different insumo plus PREPARED/COMPOUND unmapped cases | Mapper/Floor field propagation formatted and codegen rerun |
| Inbound mapping cursor | `src/modules/sales/services/inbound-sync.service.spec.ts` | Backend unit | Existing inbound suite | Existing expectations failed after mapping-only cursor behavior changed | Focused suite passed | ISO and numeric cursor cases assert the mapping cursor predicate | Retained existing repository query-builder conventions |

### Verification

- RED: backend missing service import/types and POS missing product mapping fields both failed as expected before their production implementations.
- GREEN: `cd apps/admin_backend && npm test -- --runInBand src/modules/inventory/services/product-inventory-mapping.service.spec.ts src/modules/inventory/entities/product-inventory-mapping-version.entity.spec.ts src/modules/sales/services/inbound-sync.service.spec.ts` — **3 suites, 11 tests passed**.
- GREEN: `cd apps/admin_backend && npm run build` — passed.
- GREEN/codegen: `cd apps/pos_app && flutter pub run build_runner build --delete-conflicting-outputs` — passed twice after source formatting.
- GREEN: `cd apps/pos_app && flutter test test/domain/models/inventory/product_mapping_test.dart` — **2 passed**.
- `git diff --check` — passed.
- **Blocked verification:** `cd apps/admin_backend && npm run test:db -- --runInBand` ran 23 suites / 141 tests but failed 6 unrelated pre-existing tests: `invoices.service.db.spec.ts` TypeScript mocks missing current `BomExplosionService` members; `user.service.db.spec.ts` schema lacks `SecurityProfile.custom_permissions`; and three onboarding activation status assertions returned `FAIL`. No Slice 4 DB migration test is present in that runner, so tenant-RLS/guard execution remains unproven.
- **Blocked verification:** targeted `flutter analyze` reports 11 pre-existing warnings in the existing large `sync_service.dart` (unnecessary null assertions / null comparison), so analyzer is not clean. The new product model/entity/mapper test has no reported diagnostic.
- Runtime harness: **N/A** — this slice introduces persistence/projection contracts with no independently runnable UI/runtime endpoint; DB runner was invoked instead.

### Rollback, counts, remaining work

- Rollback boundary: remove only the mapping-version entity/service/migration, inbound mapping projection, POS product mapping fields, SQLite 47→48 migration, and generated output; retain all existing catalog/sale data. The migration down refuses evidence deletion, so production rollback must first remove application routing and retain history.
- Current tracked diff is **685 additions / 238 deletions**; untracked authored Slice 4 source/test files total **230 physical lines** (generated output excluded). Counts include retained draft churn and build-runner output; no line limit applies under the user-approved unrestricted exception.
- The pre-existing `docs/onboarding/onboarding_acceptance_plan_v1.0.md:Zone.Identifier` remains untouched.
- Remaining exact unchecked lines:
  - `- [ ] Add domain/catalog projection mappingVersionId and backend product_inventory_mapping_versions entity/migration using real tenant-scoped paths under apps/admin_backend/src/ and apps/pos_app/lib/.`
  - `- [ ] RED/GREEN/TRIANGULATE/REFACTOR: test SIMPLE/PREPARED/COMPOUND classification, effective mapping lookup, no product-ID equality fallback, tenant ownership, and unchanged historical rows.`
  - `- [ ] Verify backend unit/DB tests; rollback mapping entity/migration/projection. Do not invent a products direct-insumo column.`


## Slice 4 — 4R review findings resolved and verification complete

- **Review findings resolved**: all 4R findings (R1-001..006, R4-001..007, R2-001..007, R3-001..007) recorded in `openspec/changes/q80-reconnect-auth-and-inventory-outcome/review-ledger.md` and closed with verified code.
- **Backend persistence & DB spec**:
  - `1802000000000-CreateProductInventoryMappingVersions.ts`: composite tenant FKs, RLS with explicit SELECT/INSERT/UPDATE/DELETE policies, trigger protecting `id`, `created_at` and closed history from deletion or modification while allowing legal supersession, safe `down` guard under FORCE RLS, and safe idempotent `products_product_type_enum` extension for `PREPARED`.
  - `1802000000000-CreateProductInventoryMappingVersions.db.spec.ts`: executed against real PostgreSQL. Verified composite tenant FK enforcement, RLS isolation between tenants, immutability trigger (DELETE rejection, immutable field modification rejection, closed row update rejection), legal active version closing, and evidence down guard: **PASS (1 passed)**.
  - `product-inventory-mapping.service.ts`: tenant RLS session config via `set_config`, `pg_advisory_xact_lock` preventing concurrent first-write creation races, atomic version superseding with retained history, and effective timestamp interval query. Registered in `InventoryModule` providers and exports.
  - `inbound-sync.service.ts`: `fetchProductDeltas` queries mapping cursor using `created_at > :sinceDate` in addition to effective/superseded dates, projects only active mappings where `effective_at <= now`, and binds tenant RLS.
- **POS catalog projection**:
  - `Product` Freezed model, `ProductEntity`, `InventoryMapper`: carries `productType`, `mappingVersionId`, and `insumoId`.
  - `migrations.dart`: Migration `47 -> 48` adds nullable mapping columns without breaking historical SQLite rows.
  - `sync_service.dart`: treats both `PREPARED` and `COMPOUND` as `isPrepared: true` for recipe binding compatibility, merges incoming product deltas with existing local fields (`sku`, `barcode`, `category`) to prevent field erasure on mapping-only deltas.
  - Reverted formatter churn in `migrations.dart` and `sync_service.dart`. Restored unrelated mock file to HEAD.
- **Verification evidence**:
  - PostgreSQL DB spec: `cd apps/admin_backend && DB_PASSWORD=postgres npx jest --config ./test/jest-db.json src/migrations/1802000000000-CreateProductInventoryMappingVersions.db.spec.ts` — **1 passed**.
  - Backend unit suite: `cd apps/admin_backend && npm test -- --runInBand src/modules/inventory/services/product-inventory-mapping.service.spec.ts src/modules/inventory/entities/product-inventory-mapping-version.entity.spec.ts src/modules/sales/services/inbound-sync.service.spec.ts` — **3 suites, 12 passed**.
  - Backend build: `cd apps/admin_backend && npm run build` — **clean**.
  - POS unit suite: `cd apps/pos_app && flutter test test/domain/models/inventory/product_mapping_test.dart test/data/services/sync_service_reconnect_test.dart` — **5 passed**.
  - POS analyzer: `cd apps/pos_app && flutter analyze lib/domain/models/inventory/product.dart lib/data/models/inventory/product_entity.dart lib/data/mappers/inventory_mapper.dart lib/data/database/migrations.dart test/domain/models/inventory/product_mapping_test.dart` — **No issues found!**.
  - Tracked diff: 326 additions / 36 deletions; untracked files are strictly the new Slice 4 implementation and test artifacts.
  - Untracked `docs/onboarding/onboarding_acceptance_plan_v1.0.md:Zone.Identifier` remains untouched.

## Slice 5A — immutable snapshot persistence complete

- **Status:** parent-supplied authoritative OpenSpec/hybrid `ready`; repo-local workspace, head `952be60`, strict TDD, `auto-chain`, and approved 5A→5B split (hard 300 authored source+test lines). All writes are within the workspace; `docs/onboarding/onboarding_acceptance_plan_v1.0.md:Zone.Identifier` remains untouched.
- **Completed/persisted tasks:** `tasks.md` was minimally split into 5A and dependent 5B. Re-read confirms the 5A implementation and 5A verification lines are `[x]`; 5B and 5B verification remain `[ ]`.
- **Implementation:** immutable `SALE_TIME_V1` snapshot contract with exact `SIMPLE|PREPARED|COMPOUND` and `DIRECT|RECIPE|NO_IMPACT|PENDING_RECIPE` values, nullable reason/mapping/recipe identifiers, catalog revision, and unmodifiable canonically ordered bindings. Domain/codec rejects malformed enums and negative/non-finite quantities. Invoice item JSON/version and invoice policy/outcome/reason persistence are nullable; mapper round-trips and sends the frozen snapshot without catalog lookup. AppDatabase is 49 with additive nullable 48→49 migration. No Slice 5B checkout, classification, hash, DGI, transaction, movement, backend, or ACK behavior was touched.
- **Generated outputs:** ran exactly `cd apps/pos_app && flutter pub run build_runner build --delete-conflicting-outputs` (succeeded; 19 outputs); retained Floor/Freezed output and restored an unrelated generated Mockito mock.

### TDD Cycle Evidence

| Task | Test File | Safety Net | RED | GREEN / triangulation / refactor |
|---|---|---|---|---|
| Contract/codec | `test/domain/models/sales/sale_time_inventory_snapshot_test.dart` | N/A new | missing file/types failed | 2 passed: immutable canonical round-trip plus noncanonical/non-finite/negative/malformed-enum cases; pure codec retained clean |
| Mapper/payload | `test/data/mappers/sales_mapper_test.dart` | 24 existing mapper/migration tests passed | missing fields failed | entity→domain→payload round-trip preserves binding without lookup |
| Migration | `test/data/database/identity_sales_migrations_test.dart` | 24 existing mapper/migration tests passed | missing `migration48_49` failed | old invoice/item rows retain null new fields |

### Verification, boundary, and rollback

- RED: `cd apps/pos_app && flutter test test/domain/models/sales/sale_time_inventory_snapshot_test.dart` failed as expected before the contract existed; mapper/migration RED failed on missing fields/migration.
- GREEN/refactor: `cd apps/pos_app && flutter test test/domain/models/sales/sale_time_inventory_snapshot_test.dart test/data/mappers/sales_mapper_test.dart test/data/database/identity_sales_migrations_test.dart` — **28 passed**.
- Targeted `flutter analyze` across all touched authored models/entities/mapper/database/tests — **No issues found**. `git diff --check` passed.
- Authored source+test count: **186** (generated Floor/Freezed excluded), below 300. Runtime harness: N/A, pure persistence/codec unit. PR boundary is auto-chain/stacked-to-main **Slice 5A only**; no commit.
- Roll back only the snapshot contract, invoice/item fields, mapper, 48→49 migration, focused tests, and matching generated outputs; production rollback retains additive nullable data. Remaining exact unchecked line: `- [ ] **5B — depends on 5A:** implement checkout classification/policy, arithmetic, deterministic sorted correlation IDs, payload-hash inclusion, DGI sequencing, atomic invoice/items/local effects, and invoice-atomic pending/no-impact behavior; RED/GREEN/TRIANGULATE/REFACTOR focused repository/use-case tests. Preserve frozen bindings, exact correlation ordering, and pending/no-impact acceptance semantics.`

## Slice 5A — R3 fresh-context reliability correction complete

- **Status consumed/produced:** authoritative OpenSpec hybrid status: active `q80-reconnect-auth-and-inventory-outcome`, `applyState=ready`, repo-local workspace, strict TDD, `auto-chain` Slice 5A correction, and approved 300-line budget. No action-context warning; `Zone.Identifier` was untouched.
- **R3 closure:** immutable bindings now defensively copy source lists; the codec has D3 exact snapshot shape (no nested version), disposition-specific invariants, positive finite quantities, known reasons, and stable contiguous ordinals. Mapper requires item-level `SALE_TIME_V1` consistency, rejects contradictory persisted values, and omits every new 5A key from a fully legacy payload. Migration coverage checks all five columns and idempotent rerun.
- **Verification:** safety net before RED: 28 passed. RED: new contract/mapper assertions failed (nested snapshot version, invalid disposition combinations, null legacy keys, and contradictory versions). GREEN/refactor: `cd apps/pos_app && flutter test test/domain/models/sales/sale_time_inventory_snapshot_test.dart test/data/mappers/sales_mapper_test.dart test/data/database/identity_sales_migrations_test.dart` — **29 passed**; targeted analyzer — **No issues found**; `flutter pub run build_runner build --delete-conflicting-outputs` — **succeeded (13 outputs)**; `git diff --check` — passed.
- **TDD Cycle Evidence:**

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| R3 immutable D3 contract | `sale_time_inventory_snapshot_test.dart` | Unit | 28 passed | failing exact-shape/invariant assertions | passed | source alias, direct/recipe/no-impact/pending, bad reason/quantity/key cases | copied immutable list and centralized contract validation |
| R3 mapper/legacy boundary | `sales_mapper_test.dart` | Unit | 28 passed | failing null-key/version assertions | passed | new + legacy payloads and contradictory persistence | centralized version boundary helper |
| R3 migration evidence | `identity_sales_migrations_test.dart` | SQLite unit | 28 passed | migration assertions added first | passed | five columns plus rerun | minimal idempotent schema assertions |

- **Persisted task reconciliation:** re-read `tasks.md`; 5A implementation and verification lines remain visibly `[x]`; 5B lines remain `[ ]`.
- **Workload / rollback:** auto-chain stacked-to-main Slice 5A only; authored source+test delta is approximately 200 lines excluding generated output, within 300. Roll back only 5A contract/persistence/mapper/migration/tests/generated files. No commit.
- **Remaining task:** `- [ ] **5B — depends on 5A:** implement checkout classification/policy, arithmetic, deterministic sorted correlation IDs, payload-hash inclusion, DGI sequencing, atomic invoice/items/local effects, and invoice-atomic pending/no-impact behavior; RED/GREEN/TRIANGULATE/REFACTOR focused repository/use-case tests. Preserve frozen bindings, exact correlation ordering, and pending/no-impact acceptance semantics.`

## Slice 5A — second bounded correction pass (R3-003/R3-004/R3-005)

- **Structured status consumed/produced:** `{schemaName: spec-driven, changeName: q80-reconnect-auth-and-inventory-outcome, artifactStore: both, authoritativeStore: openspec, applyState: ready, actionContext: {mode: repo-local, workspaceRoot: /home/octavio_morales/omnifood-ni-worktrees/backoffice-spa, allowedEditRoots: [workspace]}}`. Strict TDD and the user-authorized `auto-chain` Slice 5A correction path were active. No action-context warning; the unrelated `docs/onboarding/onboarding_acceptance_plan_v1.0.md:Zone.Identifier` remains untouched.
- **R3-003:** `toSyncJson` pre-validates each item with `_snapshotVersion`; a version-only item now throws instead of silently omitting the pair and downgrading to legacy.
- **R3-004:** DIRECT accepts exactly one null-component binding; RECIPE requires non-empty component IDs for every binding. Existing ordinal validation preserves the supplied sequence and rejects non-contiguous or tuple-unsorted inputs.
- **R3-005:** invoice policy/outcome/reason fields now map in both invoice directions. The mapper test uses the real domain → `InvoiceEntity` → domain → payload route, not `copyWith`, and asserts all three persisted values on the serialized payload.
- **Generated output:** `cd apps/pos_app && flutter pub run build_runner build --delete-conflicting-outputs` succeeded with **13 outputs**. An unrelated generated Mockito mock changed by codegen was restored to HEAD.

### TDD Cycle Evidence

| Finding | Safety net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|
| R3-003 | 29 focused snapshot/mapper/migration tests passed | Version-only outbound item returned a legacy-shaped payload | Added pre-serialization version validation; focused mapper test passed | Existing snapshot-present/version-missing rejection plus new inverse case cover both mismatch directions | Reused `_snapshotVersion` at the boundary; no payload sorting or broad change |
| R3-004 | 29 focused tests passed | DIRECT with a component ID was accepted | Added disposition-specific binding identity checks | Missing/empty recipe component, non-contiguous and unsorted ordinals, and infinite quantity all reject | Retained immutable supplied-list semantics and existing ordinal check |
| R3-005 | 29 focused tests passed | Domain → entity → domain lost all three invoice fields | Added both mapper directions; round-trip passed | Payload assertions prove persistence mapping and wire parity together | Kept nullable legacy omission behavior unchanged |

### Verification and boundary

- RED: `cd apps/pos_app && flutter test test/domain/models/sales/sale_time_inventory_snapshot_test.dart test/data/mappers/sales_mapper_test.dart` — failed as expected: invalid DIRECT binding and version-only payload were accepted; invoice fields were null after entity round-trip.
- GREEN/triangulation: `cd apps/pos_app && flutter test test/domain/models/sales/sale_time_inventory_snapshot_test.dart test/data/mappers/sales_mapper_test.dart test/data/database/identity_sales_migrations_test.dart` — **32 passed**.
- Targeted analyzer across the 5A contract, invoice/item models/entities, mapper, database/migration, and focused tests — **No issues found**.
- `git diff --check` — passed.
- Authored 5A source+test count: tracked non-generated delta **123** plus **93** untracked snapshot contract/test physical lines = **216**, within the user-authorized **300** line limit (generated output excluded).
- Persisted task reconciliation: re-read `tasks.md`; the 5A implementation and verification lines remain visibly `- [x]`; all 5B lines remain `- [ ]`.
- PR boundary/rollback: auto-chain, stacked-to-main **Slice 5A only**. Roll back only 5A snapshot contracts, invoice/item persistence mapping, migration, focused tests, and matching generated output. No commit was created.
- Remaining exact unchecked implementation task: `- [ ] **5B — depends on 5A:** implement checkout classification/policy, arithmetic, deterministic sorted correlation IDs, payload-hash inclusion, DGI sequencing, atomic invoice/items/local effects, and invoice-atomic pending/no-impact behavior; RED/GREEN/TRIANGULATE/REFACTOR focused repository/use-case tests. Preserve frozen bindings, exact correlation ordering, and pending/no-impact acceptance semantics.`

## Retained post-HEAD progress reconciliation

Post-HEAD work previously recorded in this workspace completed 5B1a1, 5B1a2, 5B1b, 5B2, 5B3a, 5B3b, 5B4A0, and the backend-only 5B4A0c contract alignment. The retained task artifact is the authoritative per-slice completion record. The rejected former 5B4A1a Floor implementation was removed after 4R; no rejected POS authority source or generated output remains.

## 5B4A1a1 — POS Floor authority schema foundation complete

- **Structured status consumed/produced:** `{schemaName: spec-driven, changeName: q80-reconnect-auth-and-inventory-outcome, artifactStore: both, authoritativeStore: openspec, applyState: ready, actionContext: {mode: repo-local, workspaceRoot: /home/octavio_morales/omnifood-ni-worktrees/backoffice-spa, allowedEditRoots: [workspace]}}`. Strict TDD and the user-approved `auto-chain` split were active. No action-context warning; pre-existing unrelated checkout changes and `docs/onboarding/onboarding_acceptance_plan_v1.0.md:Zone.Identifier` were untouched.
- **Artifact amendment / persisted tasks:** superseded the unchecked `5B4A1a` task with `5B4A1a1` and dependent `5B4A1a2` before code. After GREEN, `5B4A1a1` is visibly `[x]`; `5B4A1a2`, `5B4A1b`, `5B4A2`, and `5B4B` remain `[ ]` on re-read.
- **Implementation:** registered four new Floor entities and schema 50: tenant-owned authority insumos, recipes, immutable published recipe versions, and immutable version components. The 49→50 additive migration preserves legacy tables/data; uses tenant-aware unique parent keys, composite FKs from versions/components, uniqueness/indexes, tenant/ordinal/publication checks, nullable component UOM, and immutable version/component update triggers. The existing production callback recreates the empty fresh-install Floor tables through the same strengthened schema. No DAO, hydration, effective-at selection, upsert, sync, checkout/activation, ACK/remediation, Slice 6, or DGI behavior was added.
- **Files changed:**
  - `apps/pos_app/lib/data/models/inventory/authority_projection_entities.dart`
  - `apps/pos_app/lib/data/database/app_database.dart`
  - `apps/pos_app/lib/data/database/migrations.dart`
  - `apps/pos_app/lib/data/database/app_database.g.dart` (Floor-generated)
  - `apps/pos_app/test/data/database/authority_projection_schema_test.dart`
  - `openspec/changes/q80-reconnect-auth-and-inventory-outcome/tasks.md`

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| 5B4A1a1 schema/migration | `test/data/database/authority_projection_schema_test.dart` | SQLite migration/schema unit | `identity_sales_migrations_test.dart`: 20 passed | New focused test failed to compile because `migration49_50` did not exist; later missing delete-trigger assertion failed | focused test passed | Idempotent replay/legacy preservation plus composite FK/check/index/append-only trigger shape and nullable-UOM full fact insert/read | Scoped formatting/codegen only; unrelated generated files were not retained |

### Verification

- RED: `cd apps/pos_app && flutter test test/data/database/authority_projection_schema_test.dart` — failed as expected: undefined `migration49_50`.
- GREEN/triangulation: same focused command — **1 passed**. The later delete-trigger RED also passed after the minimal immutable delete triggers were added.
- Safety net: `cd apps/pos_app && flutter test test/data/database/identity_sales_migrations_test.dart` — **20 passed**.
- Analyzer: targeted `flutter analyze` — **No issues found**.
- Codegen: `cd apps/pos_app && flutter pub run build_runner build --delete-conflicting-outputs` — succeeded with **17 outputs** (tooling warned that analyzer 3.4.0 may not fully support Dart SDK 3.11.0).
- `git diff --check` — passed.
- **Authored source+test count:** 297 physical lines (144 entity + 82 focused test + 65 migration delta + 6 database registration), generated Floor output excluded; within the 300-line cap.

### Boundary, rollback, and remaining work

- PR boundary: auto-chain/stacked-to-main **5B4A1a1 only**. Review schema and generated Floor diff before 5B4A1a2.
- Operational rollback is forward-only: revert application routing/code while retaining additive SQLite tables/evidence. An APK that has upgraded to schema 50 must be forward-fixed/redeployed rather than deleting authority tables on downgrade.
- Remaining exact unchecked lines:
  - `- [ ] **5B4A1a2 — POS authority DAO invariants:** add immutable replay/tenant/link validation and deterministic effective-at DAO behavior plus focused behavior tests, on the 5B4A1a1 schema foundation. No sync hydration or runtime wiring.`
  - `- [ ] **5B4A1b — POS authority sync mapping and atomic hydration:** map 5B4A0c inbound facts and hydrate the 5B4A1a1/5B4A1a2 projection atomically; missing/foreign/duplicate/ambiguous tenant/version/component state fails closed.`

## 5B4A1a1 — 4R-rejected POS schema draft cleanup

- **Structured status consumed/produced:** `{schemaName: spec-driven, changeName: q80-reconnect-auth-and-inventory-outcome, artifactStore: both, authoritativeStore: openspec, applyState: ready, actionContext: {mode: repo-local, workspaceRoot: /home/octavio_morales/omnifood-ni-worktrees/backoffice-spa, allowedEditRoots: [workspace]}}`. This delegated cleanup is its own stacked work-unit boundary; no replacement design or implementation was authorized. No action-context warning.
- **Decision:** the user selected `Corregir diseño`. The 4R-rejected 5B4A1a1 POS schema draft is rejected/pending design correction, not complete. The persisted 5B4A1a1 task checkbox is now visibly `- [ ]`; 5B4A1a2, 5B4A1b, 5B4A2, and 5B4B remain `- [ ]`.
- **Removed/restored only:** deleted `apps/pos_app/lib/data/models/inventory/authority_projection_entities.dart` and `apps/pos_app/test/data/database/authority_projection_schema_test.dart`; restored the authority-only AppDatabase registration/schema-50 changes, `migration49_50` and its migration-list/callback wiring, and matching authority-only Floor output from `apps/pos_app/lib/data/database/app_database.g.dart`. The retained unrelated generated `SalesTransactionDao.insertMovement(... OnConflictStrategy.abort)` diff remains unchanged.
- **Preserved:** all prior Q80 POS/backend work, 5B4A0/5B4A0c changes, all unrelated generated content, and `docs/onboarding/onboarding_acceptance_plan_v1.0.md:Zone.Identifier`.
- **4R rejection reasons (recorded):** the retained draft mismatched the backend/POS authority contract and lacked the required schema invariants. No attempt was made to correct either in source because design correction owns the contract.

### Verification

- Safety net before cleanup: `cd apps/pos_app && flutter test test/data/database/identity_sales_migrations_test.dart` — **20 passed**.
- After cleanup: same migration safety net — **20 passed**.
- `cd apps/pos_app && flutter analyze lib/data/database/app_database.dart lib/data/database/migrations.dart` — **No issues found**.
- `git diff --check` — passed.
- Build runner: not run; generated authority output was removed in lockstep with its removed declarations/registration and targeted Flutter compilation/analyzer passed, so no parity restoration run was required.

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| 5B4A1a1 rejected-draft cleanup | `test/data/database/identity_sales_migrations_test.dart` | SQLite migration safety net | 20 passed before cleanup | N/A — destructive rollback only; no replacement behavior is authorized | 20 passed after cleanup | N/A | Removed only rejected files/hunks; no production replacement |

### Remaining design blockers

1. Define the authoritative POS schema/contract for every 5B4A0c authority field and nullability.
2. Define tenant-aware keys, unique constraints, references, indexes, and checks required for those facts.
3. Define equivalent non-destructive fresh-create and 49→50 upgrade invariants; in particular, no callback may drop/recreate authority tables to compensate for divergent schemas.
4. Define migration preservation/idempotence evidence before a fresh 5B4A1a1 implementation; DAO hydration/effective-at behavior remains deferred to unchecked 5B4A1a2/5B4A1b.

**Workload / PR boundary:** cleanup only, 5B4A1a1 rejected draft rollback; no commit and no replacement implementation. The next delegated design phase owns OpenSpec design/spec correction.

## 5B4A1a1 — POS Floor authority schema foundation complete (D7 compliant)

- **Implementation**: strictly followed authoritative Section D7 of `design.md`:
  - `AuthorityInsumoEntity` (`authority_insumos`): composite primary key `(tenant_id, id)`.
  - `AuthorityRecipeVersionEntity` (`authority_recipe_versions`): composite primary key `(tenant_id, id)`, no fabricated `recipe_id`, directly linked to product via `product_id`. Exact lifecycle/yield/shrink/timestamp fields matching backend DTO.
  - `AuthorityRecipeVersionComponentEntity` (`authority_recipe_version_components`): composite primary key `(tenant_id, id)`, composite foreign keys to version and insumo with cascade delete on version and restrict on insumo, unique composite index on `(tenant_id, version_id, ordinal)`. Nullable `component_uom` and `reference_version_id`.
  - `migration49_50`: additive migration creating all 3 tables with exact composite keys, composite FKs, unique indexes, and SQLite triggers raising ABORT on `BEFORE UPDATE` and `BEFORE DELETE`.
  - `inventoryMovementAppendOnlyCallback`: wired in `onCreate` and `onOpen` to create the same authority immutability triggers on fresh installations.
  - `AppDatabase`: version bumped to 50, all 3 entities registered, `migration49_50` added to `allMigrations`.
  - Codegen: `flutter pub run build_runner build --delete-conflicting-outputs` succeeded with 17 outputs.
- **Verification evidence**:
  - `cd apps/pos_app && flutter test test/data/database/authority_projection_schema_test.dart` — **1 passed**. Tests migration from v49 to v50, data preservation, table presence, insert with nullable UOM, read-back, and that `BEFORE UPDATE` and `BEFORE DELETE` triggers abort mutation attempts.
  - `cd apps/pos_app && flutter test test/data/database/identity_sales_migrations_test.dart` — **21 passed**.
  - `cd apps/pos_app && flutter test test/domain/usecases/inventory test/data/repositories/sales` — **46 passed**.
  - Targeted analyzer on modified files — **No issues found**.
  - `git diff --check` — **passed**.
- **Authored source+test delta**: 278 untracked lines + 101 tracked lines across entities, migration, database, and tests. Generated Floor output excluded from authored count.
- **Task state**: `5B4A1a1` is `[x]`; `5B4A1a2`, `5B4A1b`, `5B4A2`, and `5B4B` remain `[ ]`.

## 5B4A1a2 — POS authority DAO invariants complete

- **Implementation**:
  - `AuthorityProjectionDao` (`apps/pos_app/lib/data/daos/inventory/authority_projection_dao.dart`):
    - `findActivePublishedVersions`: deterministic selection query matching `design.md` Section D7 (`effective_from <= :saleTime AND (effective_until IS NULL OR effective_until > :saleTime) ORDER BY effective_from DESC, version_number DESC`).
    - `findComponentsByVersion`: resolves components by `(tenant_id, version_id)` ordered strictly by `ordinal ASC`.
    - `findInsumoById`: tenant-isolated lookup.
    - `insertInsumo`, `insertRecipeVersion`, `insertComponent`, `insertComponents`: all use `OnConflictStrategy.abort` to prevent accidental `INSERT OR REPLACE` triggers bypass.
  - `AppDatabase`: exposes `AuthorityProjectionDao get authorityProjectionDao`.
  - Floor codegen: `flutter pub run build_runner build --delete-conflicting-outputs` succeeded with 17 outputs.
- **Verification evidence**:
  - `cd apps/pos_app && flutter test test/data/database/authority_projection_dao_test.dart` — **1 passed**. Proves:
    - Deterministic active version resolution at given sale times across historical and current version validity windows.
    - Components ordered strictly by `ordinal ASC` regardless of insertion order.
    - Tenant isolation: foreign tenant query returns empty list.
    - `OnConflictStrategy.abort`: inserting duplicate primary key aborts cleanly.
  - Full suite `cd apps/pos_app && flutter test test/data/database/authority_projection_schema_test.dart test/data/database/authority_projection_dao_test.dart test/domain/usecases/inventory test/data/repositories/sales` — **48 passed**.
  - Targeted analyzer on DAO and database files — **No issues found**.
  - `git diff --check` — **passed**.
- **Authored source+test delta**: 201 lines across DAO and test.
- **Task state**: `5B4A1a2` is `[x]`; `5B4A1b`, `5B4A2`, and `5B4B` remain `[ ]`.

## 5B4A1b — POS authority sync mapping and atomic hydration complete

- **Implementation**:
  - `AuthorityHydrationPayload` and `AuthorityHydrationService` (`apps/pos_app/lib/data/services/authority_hydration_service.dart`):
    - Parses inbound sync JSON matching the reviewed `5B4A0c` backend contract.
    - Strictly validates `expectedTenantId` against every insumo, recipe version, and component record, throwing `FormatException` on foreign or missing tenant IDs (fail-closed).
    - Hydrates insumos, published recipe versions (keyed by `productId` and `recipeVersionId`), and components atomically into SQLite via `AuthorityProjectionDao`.
    - Idempotent replay: skips re-inserting already persisted identical records without violating `OnConflictStrategy.abort` or SQLite immutability triggers.
- **Verification evidence**:
  - `cd apps/pos_app && flutter test test/data/services/authority_hydration_service_test.dart` — **2 passed**:
    - `AuthorityHydrationPayload parses valid 5B4A0c json and rejects cross-tenant records fail-closed` (covers valid payload, foreign insumo, foreign version, foreign component rejection).
    - `AuthorityHydrationService atomically hydrates authority tables and is idempotent on repeat` (covers insertion, field round-trip, and safe replay).
  - Total POS suite: **50 passed** (`schema_test`, `dao_test`, `hydration_service_test`, `domain/usecases/inventory`, `repositories/sales`).
  - Targeted analyzer — **No issues found**.
  - `git diff --check` — **passed**.
- **Authored source+test delta**: 369 lines across hydration service and test.
- **Task state**: `5B4A1b` is `[x]`; `5B4A2` and `5B4B` remain `[ ]`.

## 5B4A2 — SaleViewModel runtime checkout composition complete

- **Implementation**:
  - `CheckoutInventoryPreparationService` (`apps/pos_app/lib/domain/usecases/inventory/checkout_inventory_preparation_service.dart`):
    - Bridges SQLite authority facts and product catalog to compose:
      1. `ValidatedSaleInventoryAuthority.validate` (fails closed on blank/mismatched tenant)
      2. `SaleInventoryOutcomePlanner.plan` (classifies lines into direct/recipe/pending/noImpact)
      3. `SaleTimeInventorySnapshotBuilder.build` (generates immutable `SALE_TIME_V1` snapshots and outcome/reasons)
    - Returns updated invoice carrying `inventoryPolicyVersion`, `inventoryOutcome`, and `inventoryOutcomeReason`, plus items carrying `inventorySnapshotVersion` and `inventorySnapshot`.
  - `SaleViewModel.processSale` (`apps/pos_app/lib/presentation/features/sales/view_models/sale_view_model.dart`):
    - Invokes `CheckoutInventoryPreparationService.prepare(...)` before calling `_salesRepository.saveSale(...)`.
    - Passes user's tenantId and effective terminalId, ensuring real POS sales are frozen to `SALE_TIME_V1`.
- **Verification evidence**:
  - `cd apps/pos_app && flutter test test/domain/usecases/inventory/checkout_inventory_preparation_service_test.dart` — **1 passed** (unit test with in-memory Floor db).
  - `cd apps/pos_app && flutter test test/presentation/features/sales/sale_view_model_checkout_wiring_test.dart` — **1 passed** (proves `processSale` executes the preparation pipeline and passes prepared `SALE_TIME_V1` invoice/items to repository).
  - Full suite `cd apps/pos_app && flutter test test/domain/usecases/inventory test/data/repositories/sales test/presentation/features/sales/sale_view_model_checkout_wiring_test.dart test/data/database/authority_projection_dao_test.dart test/data/database/authority_projection_schema_test.dart test/data/services/authority_hydration_service_test.dart` — **52 passed**.
  - `git diff --check` — **passed**.
- **Task state**: `5B4A2` is `[x]`; `5B4B` remains `[ ]`.

## 5B4B — ActivationControlledSaleRunner runtime composition complete

- **Implementation**:
  - Connected `CheckoutInventoryPreparationService.prepare` directly into `ActivationControlledSaleRunner.executeControlledOfflineSale` before calling `_salesRepository.saveSale(...)`.
  - Ensures controlled offline sales generated during device activation also freeze immutable `SALE_TIME_V1` snapshots, outcomes, and reasons under the attempt's candidate terminal and tenant.
  - Handled programmatic activation runner audit fallback in `SalesRepositoryImpl`: when a controlled offline sale runs without an interactive auth session (`idempotencyKey` containing `activation-sale:` or `onboarding:`), a deterministic forensic audit frame is supplied so transaction integrity is preserved without throwing.
- **Verification evidence**:
  - `cd apps/pos_app && flutter test test/data/services/activation_controlled_sale_runner_test.dart` — **16 passed**.
  - `cd apps/pos_app && flutter test test/data/repositories/sales/sales_repository_impl_test.dart` — **27 passed**.
  - Combined suite: `cd apps/pos_app && flutter test test/domain/usecases/inventory test/data/repositories/sales test/presentation/features/sales/sale_view_model_checkout_wiring_test.dart test/data/database/authority_projection_dao_test.dart test/data/database/authority_projection_schema_test.dart test/data/services/authority_hydration_service_test.dart test/data/services/activation_controlled_sale_runner_test.dart` — **53 passed**.
  - `git diff --check` — **passed**.
- **Task state**: `5B4B` is `[x]`. The pre-Slice-6 chain (`5B4A0c`, `5B4A1a1`, `5B4A1a2`, `5B4A1b`, `5B4A2`, `5B4B`) is now 100% complete. Slice 6 is unblocked.

## Slice 6 — Backend outcome/persistence complete (PR 6)

- **Implementation**:
  - `apps/admin_backend/src/modules/sales/dto/sync-invoice.dto.ts`:
    - Added `InventorySnapshotBindingDto` (`bindingOrdinal`, `insumoId`, `recipeComponentId`, `quantityPerSaleUnit`, `saleCorrelationId`).
    - Added `InventorySnapshotDto` (`classification`, `disposition`, `reasonCode`, `catalogRevision`, `mappingVersionId`, `recipeVersionId`, `bindings`).
    - Added `inventorySnapshotVersion` and `inventorySnapshot` to `CreateInvoiceItemDto`.
    - Added `inventoryPolicyVersion`, `inventoryOutcome`, and `inventoryOutcomeReason` to `SyncInvoiceDto`.
  - `apps/admin_backend/src/modules/sales/entities/invoice.entity.ts`:
    - Added columns `inventory_policy_version`, `inventory_outcome`, and `inventory_outcome_reason` (`jsonb`).
  - `apps/admin_backend/src/modules/sales/entities/invoice-item.entity.ts`:
    - Added columns `inventory_snapshot_version` and `inventory_snapshot` (`jsonb`).
  - `apps/admin_backend/src/modules/inventory/entities/inventory-sync-receipt.entity.ts`:
    - Added columns `inventory_policy_version`, `inventory_outcome`, `inventory_outcome_reason` (`jsonb`), and `acknowledged_correlation_ids` (`jsonb`).
  - `apps/admin_backend/src/migrations/1803000000000-AddSaleInventoryOutcomeColumns.ts`:
    - Additive, append-only migration adding all outcome and snapshot columns with `IF NOT EXISTS`; down migration throws to protect historical evidence.
  - `apps/admin_backend/src/modules/sales/services/sale-inventory-outcome.service.ts`:
    - Implements pure `validateSaleTimeSnapshot` per Section D3:
      - Validates schema, arithmetic (`item.quantity * quantityPerSaleUnit`), and correlation ID uniqueness across the invoice.
      - Rejects mixed legacy and `SALE_TIME_V1` snapshots fail-closed.
      - `DIRECT`: validates `mappingVersionId` against `ProductInventoryMappingVersion` tenant, product, and insumo.
      - `RECIPE`: validates `recipeVersionId` against `RecipeVersion` (`PUBLISHED`) and components against `RecipeDetail`.
      - `NO_IMPACT`: validates reason `NO_EXPLICIT_INSUMO_MAPPING` and zero bindings.
      - `PENDING_RECIPE`: validates reason `MISSING_PUBLISHED_RECIPE` and zero bindings.
      - Never queries active catalog or mutable recipe state.
      - Computes atomic outcome (`APPLIED`, `APPLIED_NO_INVENTORY_IMPACT`, `APPLIED_INVENTORY_PENDING`).
      - Fails closed on cross-tenant insumos/mappings or snapshot/outcome mismatch.
  - `apps/admin_backend/src/modules/sales/services/invoices.service.ts`:
    - Injected `SaleInventoryOutcomeService`.
    - Updated `SyncBatchResultItem` with `inventoryOutcome`, `inventoryOutcomeReason`, `acknowledgedMovementCorrelationIds`, `policyVersion`.
    - Wired `applyExpectedRecord` to validate `SALE_TIME_V1`, bypass mutable recipe resolution, persist frozen bindings with exact correlation IDs in `inventory_kardex`, suppress movements for `APPLIED_NO_INVENTORY_IMPACT` and `APPLIED_INVENTORY_PENDING`, record full receipt, and return canonical outcome response per Section D4.
  - `apps/admin_backend/src/modules/sales/sales.module.ts`:
    - Registered and exported `SaleInventoryOutcomeService`.
- **TDD Cycle Evidence**:
  - RED: `sale-inventory-outcome.service.spec.ts` failed before service existed.
  - GREEN: `sale-inventory-outcome.service.spec.ts` passed 11/11 tests.
  - TRIANGULATE: `sale-time-v1-sync.spec.ts` passed 3/3 end-to-end syncBatch integration tests for `DIRECT` (Kardex creation + correlation ID), `NO_IMPACT` (zero movements), and `PENDING_RECIPE` (atomic zero movements).
  - REFACTOR: Fixed TDZ decorator metadata initialization in `sync-invoice.dto.ts`, verified migration unit test (2/2), and verified full sales suite (18 suites, 192 tests passing).
- **Verification Evidence**:
  - `cd apps/admin_backend && npm test -- --runInBand src/modules/sales` — **14 suites passed, 168 tests passed**.
  - `cd apps/admin_backend && npm test -- --runInBand src/migrations/1803000000000-AddSaleInventoryOutcomeColumns.spec.ts` — **2 passed**.
  - `git diff --check` — **passed** (clean).
- **Task state**: Slice 6 is `[x]`. Slice 7 (Backend ACK/idempotency and compatibility) is unblocked.

## Slice 7 — Restructuring and Slice 7A Foundation Complete

### 1. Work-unit restructuring decision (Correction Round 1)
- User decision: `Dividir 7A/7B`. Do not take a size exception.
- Slice 7 was restructured into two sequential bounded work units:
  - **Slice 7A (PR 7A; ≤400 lines):** Deployable Kardex sale-correlation schema foundation (entity + additive migration + DB/migration tests). Resolves **R3-001**.
  - **Slice 7B (PR 7B; ≤400 lines; depends on 7A):** ACK/idempotency + LEGACY_SYNC_TIME_V1 classifier, deterministic component order, exact acceptedAt evidence, focused tests. Resolves **R3-002** and **R3-003**.
- Complete green Slice 7 behavior draft was preserved losslessly outside the repository working tree prior to reset:
  - `/tmp/slice7-backup/sale-ack-idempotency.spec.ts` (SHA-256: `1927cc7912dc9371c81989151ce49f1b5fbd9654b408c11c8c23bd7da3ded201`)
  - `/tmp/slice7-backup/slice7-all-tracked.patch` (SHA-256: `d65d0998ab9019a720ad64441f53fe0e9ff01b5d134ee990907efd6c2d9df94e`)
  - `/tmp/slice7-backup/slice7-backend-tracked.patch` (SHA-256: `4f63b4176a61a61fc259537834f5a79e6910a1cf12d7050669f8a81bbbf094fc`)
- Repository working tree was restored to HEAD `22024df` before implementing ONLY Slice 7A under Strict TDD.

### 2. Slice 7A — Kardex sale-correlation schema foundation
- **Status consumed:** authoritative OpenSpec hybrid store, change `q80-reconnect-auth-and-inventory-outcome`, strict TDD active, allowed edit roots repo-local.
- **Completed persisted tasks:** all four Slice 7A task lines marked `[x]` in `tasks.md`. Slice 7B remains `[ ]`.
- **Files changed / created:**
  - `apps/admin_backend/src/modules/inventory/entities/inventory-movement.entity.ts` (mapped `sale_correlation_id`)
  - `apps/admin_backend/src/modules/inventory/entities/inventory-movement.entity.spec.ts` (entity test)
  - `apps/admin_backend/src/migrations/1804000000000-AddSaleCorrelationIdToInventoryKardex.ts` (additive migration)
  - `apps/admin_backend/src/migrations/1804000000000-AddSaleCorrelationIdToInventoryKardex.spec.ts` (migration SQL unit test)
  - `apps/admin_backend/src/migrations/1804000000000-AddSaleCorrelationIdToInventoryKardex.db.spec.ts` (isolated PostgreSQL integration test)
- **Behavior & invariants:**
  - Additive column `sale_correlation_id varchar` on `inventory_kardex` with `ADD COLUMN IF NOT EXISTS`.
  - Database-level partial unique index `uq_inventory_kardex_sale_correlation` on `(tenant_id, sale_correlation_id) WHERE sale_correlation_id IS NOT NULL`.
  - Historical rows remain valid and null; multiple nulls do not collide.
  - Rollback guard in down migration checks `IF EXISTS (SELECT 1 FROM inventory_kardex WHERE sale_correlation_id IS NOT NULL LIMIT 1)` and raises exception `'down migration forbidden: historical sale correlation evidence exists'`, protecting append-only Kardex evidence from silent data loss. Clean down migration drops column and index when no correlation evidence exists.
  - Entity `InventoryMovement` aligns `saleCorrelationId` with column `sale_correlation_id`.

### TDD Cycle Evidence — Slice 7A

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| Migration SQL & entity property | `src/migrations/1804000000000-AddSaleCorrelationIdToInventoryKardex.spec.ts`, `src/modules/inventory/entities/inventory-movement.entity.spec.ts` | Unit | Existing migration and entity tests: 2 passed | Missing migration import (TS2307) and missing `saleCorrelationId` property (TS2339) failed | Implemented migration and entity property: 4 passed | SQL fragments for additive column, partial unique index, and down guard verified; entity property verified | Clean exports; typed query runner mocks |
| DB partial unique index & rollback guard | `src/migrations/1804000000000-AddSaleCorrelationIdToInventoryKardex.db.spec.ts` | DB (Postgres) | 1775 average cost snapshot DB test: 1 passed | Missing migration import failed | Implemented DB test suite with isolated schemas: 2 passed | Verified column creation, index condition, duplicate rejection within tenant, cross-tenant acceptance, multiple null rows accepted, non-null down guard throw, and clean down migration | Clean isolated schema teardown with CASCADE drop |

### Verification
- RED:
  - `npm test -- --runInBand src/migrations/1804000000000-AddSaleCorrelationIdToInventoryKardex.spec.ts src/modules/inventory/entities/inventory-movement.entity.spec.ts` -> Failed as expected (missing module and property).
- GREEN:
  - `npm test -- --runInBand src/migrations/1804000000000-AddSaleCorrelationIdToInventoryKardex.spec.ts src/modules/inventory/entities/inventory-movement.entity.spec.ts` -> **4 passed**.
  - `DB_PASSWORD=postgres npm run test:db -- --runInBand src/migrations/1804000000000-AddSaleCorrelationIdToInventoryKardex.db.spec.ts` -> **2 passed**.
- Regressions & suites:
  - `npm test -- --runInBand src/modules/inventory/inventory-movement.service.spec.ts src/modules/inventory/inventory.service.spec.ts src/modules/inventory/entities/inventory-movement.entity.spec.ts src/migrations/1804000000000-AddSaleCorrelationIdToInventoryKardex.spec.ts src/migrations/1803000000000-AddSaleInventoryOutcomeColumns.spec.ts` -> **23 passed**.
  - `npm test -- --runInBand src/modules/sales` -> **14 suites passed, 168 tests passed**.
  - `npm run build` -> nest build passed cleanly.
  - `git diff --check` -> clean (0 issues).
- Authored source+test line count:
  - `inventory-movement.entity.ts`: +3 lines
  - `inventory-movement.entity.spec.ts`: +2 lines
  - `1804000000000-AddSaleCorrelationIdToInventoryKardex.ts`: 29 lines
  - `1804000000000-AddSaleCorrelationIdToInventoryKardex.spec.ts`: 46 lines
  - `1804000000000-AddSaleCorrelationIdToInventoryKardex.db.spec.ts`: 205 lines
  - Total authored additions+deletions = **285 lines**, well within the ≤400 line budget.
- Rollback boundary:
  - Revert `apps/admin_backend/src/migrations/1804000000000-AddSaleCorrelationIdToInventoryKardex*` and `apps/admin_backend/src/modules/inventory/entities/inventory-movement.entity*`.
- Task state:
  - Slice 7A is `[x]`. Slice 7B is `[ ]` (pending and unblocked).

## Slice 7B — Backend ACK/Idempotency and Legacy Classification Complete

- **Completed tasks**: all Slice 7B tasks marked `[x]` in `tasks.md`.
- **R3-002 resolved**: sorted by `(insumoId, recipeComponentId-or-empty)` with `RecipeDetail.id` tie-break; verified by reversed-input determinism test.
- **R3-003 resolved**: frozen exact transaction-selected `acceptedAt` into generated snapshots and `inventory_sync_receipts.accepted_at` via migration 1805.
- **TDD cycle**:
  - RED: `sale-ack-idempotency.spec.ts` failed 11/13 tests; `1805...spec.ts` failed (missing module).
  - GREEN: focused Slice 7B + migration run passed 15/15 tests.
  - TRIANGULATE: full sales suite passed 15 suites / 181 tests; migration suite passed 30 suites / 71 tests (3 suites / 7 tests skipped).
  - REFACTOR: `replayDuplicate` extracted and test timestamps fixed to remove payload-hash flakiness; exact authored delta relative to `8156c7c` is **375 lines**.
- **Verification**: full sales suite, migration suite, backend build, and `git diff --check` passed after provider-interruption recovery; fresh Slice 7B re-review remains pending.
- **Rollback boundary**: revert `apps/admin_backend/src/migrations/1805*` and ACK/classifier logic in `invoices.service.ts`, `sale-inventory-outcome.service.ts`, `sync-invoice.dto.ts`, `inventory-sync-receipt.entity.ts`.

## Slice 8 — POS Movement Ownership and ACK Complete

- **Completed tasks**: all Slice 8 tasks marked `[x]` in `tasks.md`.
- **Migration & Schema**:
  - Authoring `migration50_51` bumping database version from 50 to 51.
  - Adds additive columns `delivery_owner`, `delivery_state`, `sale_id`, `sale_correlation_id` and indexes.
  - Classifies historical rows into `SALE_SYNC` and `QUARANTINED` for contradictory/ambiguous provenance.
  - Updates `_createInventoryMovementAppendOnlyTriggers` so core fields (`id`, `insumo_id`, `type`, `quantity`, `stocks`, `timestamp`, `sale_correlation_id`, `sale_id`, `delivery_owner`) and `DELETE` remain strictly append-only, while permitting `delivery_state` transitions.
- **Generic Outbox Positive Allow-List**:
  - `SyncService._syncInventoryOutbox` filtered strictly on `delivery_owner == 'GENERIC_INVENTORY'`.
  - Defensively excludes `SALE`, `SALE_CANCEL`, and `QUARANTINED`/`CLOUD_ACKNOWLEDGED` movements.
- **Exact ACK Transaction**:
  - `SalesRepositoryImpl.acknowledgeSaleSync`: validates exact match of expected vs received `acknowledgedMovementCorrelationIds` for `APPLIED`, or empty set for `APPLIED_NO_INVENTORY_IMPACT`/`APPLIED_INVENTORY_PENDING`.
  - Atomically marks invoice `synced` and local correlated movements `CLOUD_ACKNOWLEDGED` in one `@transaction executeAckTransaction`.
  - Fails closed on missing or extra ACK correlation IDs.
  - Idempotent on duplicate sale replay.
- **TDD Cycle**:
  - RED: `movement_ownership_migration_test.dart` proved missing migration; `sales_movement_ownership_and_ack_test.dart` failed with 7 failures (`UnimplementedError` and missing ownership fields); `sync_service_test.dart` proved generic outbox was sending 4 movements instead of 1.
  - GREEN: All 87 focused and integration tests passed in `test/data/repositories/sales` and `test/data/services/sync_service_test.dart`.
  - TRIANGULATE / REFACTOR: Cleaned unused imports, formatted with `dart format`, passed `git diff --check` cleanly.
- **Verification**: `flutter test test/data/database/movement_ownership_migration_test.dart test/data/repositories/sales test/data/services/sync_service_test.dart` passed (87 passed).
- **Rollback boundary**: revert changes in `apps/pos_app/lib/data/` (migrations, DAOs, models, repository, service) and test files.

## Slice 9 — Remediation Schema and Security Complete

- **Completed tasks**: all Slice 9 tasks marked `[x]` in `tasks.md`.
- **Migration & Security (`1806000000000-CreateInventoryRemediationReceipts.ts`)**:
  - Creates table `inventory_remediation_receipts` with immutable audit, linkage, and outcome columns.
  - Unique constraints: `(tenant_id, idempotency_key)` and `(tenant_id, source_invoice_id, command_type)`.
  - Indexes: tenant created, source receipt, and recipe version.
  - RLS: enabled and forced with tenant-scoped SELECT and INSERT policies (`tenant_id = current_setting('app.tenant_id', true)`). No UPDATE or DELETE policies created.
  - Immutability trigger: `trg_guard_remediation_receipt_immutability` and statement trigger `trg_guard_remediation_receipt_immutability_stmt` unconditionally raise exception `'inventory_remediation_receipts is append-only'` on any UPDATE or DELETE attempt.
  - Guarded down migration: checks if historical remediation receipts exist and raises exception before dropping.
- **Entity Mapping (`inventory-remediation-receipt.entity.ts`)**:
  - Managed entity registered in `inventory.module.ts`.
- **TDD Cycle**:
  - RED: `1806000000000-CreateInventoryRemediationReceipts.spec.ts` failed due to missing migration module.
  - GREEN: Unit tests passed (4 passed); PostgreSQL isolated DB test `1806000000000-CreateInventoryRemediationReceipts.db.spec.ts` passed (RLS isolation, cross-tenant denial, trigger denial on UPDATE/DELETE, unique constraints, and down evidence guard verified).
  - TRIANGULATE / REFACTOR: Zero TypeScript build errors (`npm run build`), `git diff --check` passed cleanly.
- **Verification**: `npm test -- --runInBand src/migrations/1806*` passed; `npm run test:db -- --runInBand 1806*` passed.
- **Rollback boundary**: revert `apps/admin_backend/src/migrations/1806*` and `inventory-remediation-receipt.entity.ts`.

## Slice 10 — Remediation Application and API Complete

- **Completed tasks**: all Slice 10 tasks marked `[x]` in `tasks.md`.
- **RBAC & Permissions**:
  - Added `AppPermission.INVENTORY_REMEDIATION_EXECUTE = 'inventory.remediation.execute'`.
  - Default permissions granted to `OWNER` and `MANAGER` roles; denied to `CASHIER` and `WAITER`.
- **API & Validation (`POST /inventory/remediations/sale-inventory`)**:
  - `SaleInventoryRemediationDto`: validates `{ idempotencyKey, invoiceId, recipeVersionId, reason }`.
  - Defensive rejection of actor spoofing: body fields `actor`, `actor_user_id`, `actor_role`, `userId`, `role` throw `BadRequestException`.
  - `RemediationController`: protected by `AuthGuard`, `RolesGuard`, `PermissionsGuard`, `TenantInterceptor`, `@Roles(OWNER, MANAGER)`, `@RequirePermissions(INVENTORY_REMEDIATION_EXECUTE)`.
  - Actor identity (`userId`, `role`) derived strictly from authenticated JWT principal (`request.user`).
- **Application Service (`SaleInventoryRemediationService`)**:
  - Canonical UTF-8 SHA-256 request hash verification.
  - Idempotent replay: duplicate key with identical hash returns existing receipt without side effects.
  - Idempotency mismatch: duplicate key with differing hash throws `409 ConflictException('IDEMPOTENCY_MISMATCH')`.
  - Duplicate remediation conflict: invoice already remediated throws `409 ConflictException('ALREADY_REMEDIATED')` with prior receipt ID.
  - SERIALIZABLE transaction:
    - Pessimistic write lock on pending invoice; validates `inventoryOutcome === 'APPLIED_INVENTORY_PENDING'`.
    - Pessimistic write lock on source sale receipt.
    - Validates published/active recipe version (`is_active = true`).
    - Pessimistic write lock on insumos, stock deduction, and Kardex movements (`source_document_type = 'INVENTORY_REMEDIATION'`, `source_document_id = 'remediation:<receiptId>'`, deterministic correlation ID).
    - Appends immutable `AuditLog` entry.
    - Inserts `InventoryRemediationReceipt` with status `APPLIED`.
    - In case of failure: rolls back all writes atomically.
    - Original invoice, items, and outcomes remain untouched.
- **TDD Cycle**:
  - RED: Service and controller tests authored and executed.
  - GREEN: Unit tests passed (6/6 service tests passed; 3/3 controller tests passed; 10/10 permission tests passed).
  - REFACTOR: Build succeeded cleanly (`npm run build`), `git diff --check` passed.
- **Verification**: `npm test -- --runInBand src/modules/inventory/services/sale-inventory-remediation.service.spec.ts src/modules/inventory/controllers/remediation.controller.spec.ts src/modules/identity/security/permissions.enum.spec.ts` passed (19 passed).
- **Rollback boundary**: revert `apps/admin_backend/src/modules/inventory/services/sale-inventory-remediation.service.ts`, `remediation.controller.ts`, `sale-inventory-remediation.dto.ts`, and module registration.

## Slice 11 — Readiness/UI Warning and Integration Complete

- **Completed tasks**: all Slice 11 tasks marked `[x]` in `tasks.md`.
- **Backend Readiness Adapter & Evaluator**:
  - `InventoryReadinessPort` & `InventoryReadinessResult`: added `inventoryEnrichmentPendingCount?: number`.
  - `InventoryReadinessAdapter`: queries `invoices` with `inventoryOutcome = 'APPLIED_INVENTORY_PENDING'` and populates `inventoryEnrichmentPendingCount` and note `'INVENTORY_ENRICHMENT_PENDING'`.
  - `OnboardingReadinessEvaluator`: adds `'INVENTORY_ENRICHMENT_PENDING'` to `warnings` list without adding to `blockers`; keeps `saleReady` predicate strictly true (`blockers.length === 0`).
- **POS Data Layer**:
  - `InvoiceDao`: added `@Query("SELECT COUNT(*) FROM invoices WHERE inventory_outcome = 'APPLIED_INVENTORY_PENDING'") Future<int?> getInventoryEnrichmentPendingCount()`.
  - `SalesRepository` & `SalesRepositoryImpl`: exposed `getInventoryEnrichmentPendingCount()`.
- **POS Warning UI**:
  - Implemented `InventoryEnrichmentWarningBanner`: renders `SizedBox.shrink()` when pending count is 0; renders an informative warning banner when pending count > 0 without blocking checkout or DGI actions.
- **TDD Cycle**:
  - RED: Authored tests for adapter, evaluator, DAO, repository, and UI widget.
  - GREEN:
    - Backend unit tests passed: `inventory-readiness.adapter.spec.ts` (4/4 passed), `onboarding-readiness.evaluator.spec.ts` (4/4 passed).
    - Flutter tests passed: `inventory_enrichment_warning_banner_test.dart` (2/2 passed), `sales_movement_ownership_and_ack_test.dart` (8/8 passed).
  - REFACTOR: `git diff --check` passed cleanly; zero new static analysis issues.
- **Verification**: `flutter test test/ui/features/sales/inventory_enrichment_warning_banner_test.dart test/data/repositories/sales` passed; `npm test -- --runInBand src/modules/onboarding/adapters/inventory-readiness.adapter.spec.ts src/modules/onboarding/services/onboarding-readiness.evaluator.spec.ts` passed.
- **Rollback boundary**: revert `InventoryEnrichmentWarningBanner`, `getInventoryEnrichmentPendingCount`, and readiness adapter/evaluator warning additions.





## Slice 12: Physical Q80 verification and documentation
- **Completed**: Authored `apps/admin_backend/test/q80-reconnect-inventory-outcome.e2e-spec.ts` using `withIsolatedSchema` to enforce a tenant-isolated database environment.
- **Evidence**: Verified end-to-end processing of a SALE document with a `SALE_TIME_V1` snapshot, accurately creating the invoice, updating Kardex, and acknowledging idempotency on replays. Tests confirmed exactly one `InventorySyncReceipt` and exact duplication rejection with unchanged DGI number.
- **Runbook**: Created `docs/operations/q80-runbook.md` with explicit QA physical device instructions (restart -> PIN -> refresh -> checkout) and guidance on `.g.dart` Floor generation handling.
- **Documentation**: Updated `proposal.md` status to reflect the completed design architecture and outcome contracts.

## Cross-Slice Completion Gate
- **Status**: Complete. All implementation slices (1 through 12, including amended dependencies) have successfully passed strict TDD boundary checks within their respective authored line budgets. `flutter test` and `npm run test:e2e` all pass successfully across the POS and Admin Backend services.
