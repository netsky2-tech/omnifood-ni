# OHAC Completion — Finishing the Offline Human Authorization Credential

Authority: `openspec/changes/offline-human-authorization-credential/` (design.md, tasks.md, specs).
ODD execution projection only; OpenSpec remains the authority. Per-unit evidence history for the
merged B-phase lives in `odd/tasks/ohac-pos.md` — this file tracks the completion effort.

Scope decision (owner, this session): **full feature** — B2c-3b → B2d → B3 → Slice C → Slice D.
Without Slice C no assertion is ever emitted; without Slice D nothing verifies it. T-* (conformance,
migration runtime tests, Q80) and DEP-* (DSI-7/DSI-6/DSI-8, rollout thresholds) remain recorded
pendings outside this effort unless the owner extends it.

## Standing constraints (from the owner and prior sessions)

- Deliver automatically when green, after independent verification: issue (one `status:approved`,
  one `type:*` label) + PR + squash merge + branch delete. Show public text before publishing unless
  the format is already established.
- Subagents do the work: `gentle-ai-verify` for read-only mapping/verification (`gentle-ai-explore`
  is broken), `gentle-ai-worker` for bounded implementation. Never `npm run lint` (it is `--fix`).
- One review unit = one branch, named for the unit's type. Conventional Commits, no Co-Authored-By.
- 400-line guard; overruns declared under the real-coverage exception with exact counts.
- `flutter test` flake classifies by verbatim message (`WebSocketException: Invalid WebSocket upgrade
  request`), assertion failures counted separately, truncation-lost messages reported unclassified.
- Build-pair rule (in code since `a2dc0823`): `main` may carry the `ACK_SUBMITTING` flip before B3,
  but **no POS build containing it may be released before B3 lands in that same build pair**.

## Worktree / branch

- Worktree: `/home/octavio_morales/omnifood-ni-worktrees/ohac-b2c2-candidate-tx`
- Branch: `feat/ohac-pos-pull-consumption`, fast-forwarded to `origin/main` before unit 1.

## Units

### P0 — Prep
- Status: DONE
- Branch fast-forwarded `e9a9e7ff` → `origin/main` `1a90f237` (clean, `e9a9e7ff` is an ancestor;
  previous OHAC PRs merged preserving commits). Baseline: `flutter analyze` clean (5.5s);
  `flutter test test/data/` → **0 assertion failures**, exactly 1 loader failure classified by
  verbatim message: `Unable to connect to flutter_tester process: WebSocketException: Invalid
  WebSocket upgrade request` on `sync_service_device_transport_test.dart` — the known per-run flake.
- Scout mapping for U1 delivered via `gentle-ai-verify` (read-only, no writes).
- Fast-forward branch to `origin/main` (`1a90f237`), record baseline (`flutter analyze` + focused
  `test/data/` run) so later failures are attributable.

### U1 — B2c-3b: consume the `humanAuthorization` member
- Status: **MERGED as `b06597f4`** (PR #707, issue #706 closed). Branch
  `feat/ohac-pos-pull-consumption` deleted remotely. All checks green on the final tree
  (`lint-and-test` 9m41s, `build-check` 2m13s, Cloudflare, GitGuardian); merged 2026-09-30.
- Independent verification (`gentle-ai-verify`): **approve, 0 BLOCKING**, 4 SHOULD-FIX — all 4
  closed by the writer (negative sentinel pins; duplicate-branch strengthening with the
  row-level-impossibility documented, citing R's guards; mapper test 3 renamed to what it proves;
  unreachable `_guardedSequence` deleted and test 8 restated against the parser).
- Evidence: RED before GREEN (mapper 8/8, sync group 10/10, §13 positional 3/3); two mutation
  proofs (payload-verbatim, identity-from-epoch) + one more for the sentinel pin (M3), each restored
  byte-identical by sha256 (`8cbba9d9...`); `flutter analyze` clean; `test/data/` 1126 passing,
  0 assertion failures. Authored: production 392, tests 989, total 1381 — overage declared
  (3.5× the 400-line guard, real-coverage exception).
- Design decisions taken: (1) payload = canonical envelope (`canonicalizeOhac` bytes), provenance
  by byte-identity round trip + tamper test; (2) sentinel bridge `(0,'')→(0,'GENESIS')` at the
  acceptance boundary ONLY (frozen surfaces disagree — DAO test pins `''`, adapter test pins
  `'GENESIS'`; reconciliation recorded as a follow-up issue candidate); (3) sibling/inner
  sequence-digest mismatch fails closed.
- Recorded, not fixed: the `Duplicate` branch is not row-discriminable (R throws before writing in
  every duplicate state) — test pins the observable contract and states why; INTEGRITY_LOSS
  reconciliation is B2d scope.
- **Native review `review-00e9ef1e7fe66665` FAILED to produce a verdict**: tier medium, lens
  `review-reliability`, correction budget 200; three exact-slot relaunches all returned
  `pi-host-relay-transport-failure` / `reviewer-empty-output` / `stopReason: length` (~93s, 98s, 99s)
  — deterministic, not transient. Owner decision (this session): **deliver U1 on the independent
  verification above**; the native review did not run for this candidate and no authority was
  acknowledged.
- **Two CI facts worth keeping**: (1) the first CI run failed on a `?` null-aware map element the
  pinned analyzer 6.4.1 cannot parse (`sync_service_test.dart:3482`) even though the SDK parser
  accepts it — fixed with the repo's collection-if + `ignore: use_null_aware_elements` pattern, and
  `dart run build_runner build` now passes with zero generated churn; (2) two
  `activation_attempt_discovery_service_test.dart` tests failed on the old base `1a90f237` —
  they also fail on clean `main` at `b2ab6e7a` (same 2 of 2441) and are fixed at `bc5145cc`,
  unrelated to OHAC. Merging `origin/main` into the branch (owner-approved instead of rebase)
  turned the final run green: **2459+ tests passing**.
- Response side of the pull: the mapper that nobody has written (no production file constructs
  `OhacPolicyEpochEntity`/`OhacPolicyEntryEntity`), the four explicit statuses (`DELIVER`,
  `DISABLED`, `UPGRADE_REQUIRED`, `RECOVERY_REQUIRED`), the two absence outcomes
  (`not-participating`, `up-to-date`), `evaluateDeliveredEpoch`, transaction R, and the first
  terminal-state row creation path (`ensureTerminalState` already exists).
- Contract facts: `humanAuthorization` is a top-level sibling of `deltas`/`fiscalConfig`; `epoch`
  carries the payload with `sequence`/`digest` as siblings; the three non-DELIVER statuses carry
  none of those members. Backend envelope: `apps/admin_backend/src/modules/sales/dto/inbound-sync.dto.ts:337`.

### U2 — B2d: acknowledgement client and reconnect reconciliation
- Status: **MERGED as `bd6254df`** (PR #711, issue #710 closed). Branch `feat/ohac-pos-ack-client`
  deleted remotely. All checks green on the final tree (`lint-and-test` 8m8s, `build-check` 2m21s,
  Cloudflare, GitGuardian).
- Independent verification: **FIX-FIRST → all fixed**: 1 BLOCKING (`SEQUENCE_GAP` classified
  backwards as `LOCAL_ROLLBACK` — the backend defines it as claim-AHEAD-of-floor
  (`acknowledgement.ts:28`, `spec:97,115`), moved to `ACK_INCONSISTENT` with the §10 retryable
  reading recorded as a divergence; RED proven) + 2 SHOULD-FIX (idempotency-key collision
  property untested → collision test + pinned 64-hex golden + mutation proof; `Map.from` outside
  local try vs "never throws" docstring → `asObject()` guard + 2 containment tests, one RED-proven).
- Evidence: focused OHAC suites 98/98, sync 97/97, `flutter analyze` clean, `dart run build_runner
  build` clean (unchanged `git status`), full `test/data/` final **1173/1173** (4 loader flakes
  across 4 runs, all the verbatim known `WebSocketException` message, 0 assertion failures).
  4 mutation proofs, sha256 byte-identical restores. Authored: production 763 + tests 1,710 =
  **2,473 lines, 6.2× the guard, overage declared**.
- What shipped: pure 8-field ack builder + claim-derived idempotency key; migration 58→59
  (`ack_receipt_id`); atomic `confirmAcknowledgementWithReceipt` (receipt + floor + promotion +
  `OHAC_ACK_CONFIRMED` event in ONE CAS, §5 step 4); R→S→POST→cross-check→confirm flow; 409
  `resultCode` → §9 classification (fail closed on unmapped); phase-driven retry on every pull
  (closes the `NothingToReconcile` freeze the scout found); `RECOVERY_REQUIRED` →
  `INTEGRITY_LOSS/ACK_INCONSISTENT`; `confirmAcknowledgement`/`recordServerFloor` remain frozen
  and production-unused (superseded, recorded in the DAO doc comment).
- Writer incident (recorded): one prohibited `git checkout --` during a mutation restore reverted
  its own in-progress `sync_service.dart`; recovered byte-identical from a /tmp copy, sha256
  verified; no other file ever touched by git commands.
- **Native review `review-cd47a21c34ae3bc8` failed twice** with the exact U1 signature
  (`pi-host-relay-transport-failure` / `reviewer-empty-output` / `stopReason: length`, ~108s) —
  now 5/5 identical failures across 2 lineages: deterministic provider infrastructure fault.
  Owner decision: **deliver U2 on the independent verification**, same as U1; no authority
  acknowledged. Both open lineages remain in `reviewing` state, unacknowledged.
- `POST /v1/sync/inbound/human-authorization/staff-policy/ack` (backend controller exists); body
  carries claim + negotiated facts only, identity from device credentials.
- Reconnect reconciliation: retry while `ACK_SUBMITTING`, integrity loss.
- Open question this unit must answer (B2a carried forward): §5.4's receipt ID and server build
  have no column — decide whether the receipt lands in the local event log, and implement it.

### U3 — B3: drain gate and outbox registration
- Status: **MERGED as `ef53072e`** (PR #715, issue #714 closed). Branch `feat/ohac-pos-drain-gate`
  deleted remotely. All checks green on the final tree (`lint-and-test` 9m54s, `build-check` 2m0s,
  Cloudflare, GitGuardian). Owner decision: delivered on independent verification (APPROVE, 0 blockers)
  after native review failed with provider infrastructure error.

### U4 — Slice C: durable PIN attempts + assertion creation (B4)
- Status: **IMPLEMENTED + INDEPENDENTLY VERIFIED (APPROVE, 0 blockers) — READY TO SHIP.**
  Issue #720 (`status:approved`, `type:feature`) on branch `feat/ohac-pos-slice-c`
  @ `origin/main` `ef53072e`. Commit/PR/CI/merge next.
- Verification round 2 (parent-led, after the writer): APPROVE, 0 blocking; **6 findings all
  closed** — forced-CAS-loss seam + exhaustion tests (design §13 equivalence; retry-loop mutation
  killed, sha256 restore `d969abb4…`), terminal-state invariant matrix (byte-identity of every
  column except counter+`updated_at`; non-null deferral seed added by the parent after the writer
  wrongly claimed `ack_deferral_*` absent — mutation through REGENERATED code killed it:
  `Expected 'OHAC_ACK_DEFERRED_OUTBOX' / Actual <null>`, re-proving `@Query` SQL reaches runtime
  only after build_runner), 23-field emitter test extended, corrupt-permissions → fail-closed
  `StateError`, emitter digest-tamper test, temp-dir `addTearDown`.
- Full-suite classification: 1 loader flake per run (verbatim known `WebSocketException`,
  isolated-green) + 1 cross-file isolation flake (`validated_sale_inventory_authority_test`,
  isolated 6/6) — **0 OHAC assertion failures**. Authored ≈2,916 lines total, 7.3× the guard,
  overage declared.
- **Native review `review-8243591185a6811c`** (tier HIGH, 4 lenses risk/resilience/readability/
  reliability, 13 files / 2,983 lines, budget 200): START created the lineage (no consent needed);
  group capture forecast **4 model runs** acknowledged once, then `reviewer-empty-output` /
  `stopReason: length` on `review-resilience` — the **8th identical provider failure across 4
  lineages and both 1-lens and 4-lens configurations**. Slots remain reoffered; no relaunch
  (deterministic); no verdict, no authority acknowledged. Delivered under the owner's standing
  OHAC authorization + the deliver-on-independent-verification criterion recorded for U1–U3.
- Writer record preserved below.
- Evidence (RED/GREEN with exact counts):
  - RED (stubs throw `UnimplementedError`): policy 0/14, emitter 0/10, service 0/17, DAO group
    0/6 — batch **+60 passed / -47 failed**; positional test RED before `build_runner`
    (generated wrapper absent, `+4 -1`).
  - GREEN: same batch **+107, 0 failures** (54 pre-existing DAO + 6 new DAO + 5 positional
    + 14 policy + 10 emitter + 17 service).
  - `flutter analyze` clean; `dart run build_runner build` clean with **zero churn**
    (`app_database.g.dart` sha256 identical across two runs: `c10610a9…`).
  - Full `flutter test test/data/`: **1200 passing, 0 assertion failures**, 1 loader failure
    classified by verbatim known message (`WebSocketException: Invalid WebSocket upgrade request`,
    `audit_repository_impl_test.dart`) — the recorded per-run flake class.
  - Mutation proofs (2 riskiest discriminators), both killed and restored **sha256
    byte-identical**:
    - M1 lockout bypassed (`isLocked` → `false`): killed by 4 tests (policy boundary, DAO locked
      denial, restart persistence, service locked denial). Orig `08f61efc…` = restored `08f61efc…`.
    - M2 unregistered outbox emits (`isRegistered` gate disabled in emitter): killed by the
      emitter R1-008 test (the service independently denies — defense in depth by design).
      Orig `36d55d30…` = restored `36d55d30…`.
  - Authored: production 744 (policy 120, emitter 216, port 132, service 276, DAO +316, entities
    +11, .g.dart +34 generated) + tests 1,035 (policy 159, emitter 280, service 578, DAO +273,
    positional +23) = **1,779 lines; real-coverage overage declared vs the 400-line guard**.
- Design decisions taken while implementing:
  1. **Audit linkage** (`localAuditId`/`localAuditEntryHash`): the appended
     `PIN_ATTEMPT_RESET_SUCCESS` event's id and the OHAC digest over its canonical payload; the
     event payload is number-free (C14N-1) and carries only userId, epochSequence and the stamped
     sequence — never PIN/verifier/assertion body (§12).
  2. **Emitter construction = parse round trip**: `create` stamps the digest over the canonical
     22-field body and returns `parseAssertionV1(full)`, so the emitter can never emit an
     assertion the verifier-side parser rejects.
  3. **Terminal counter increments WITHOUT touching `revision`**: the counter is not a
     transition-owned field; authorization must not interfere with the epoch state machine's CAS.
  4. **Denial-before-write ordering**: request validation → cohort/build gate → R1-008 registry →
     entry eligibility all deny BEFORE the transaction, so no gate failure ever mutates attempt
     state or burns a sequence.
  5. **Attempt-state CAS insert conflict** (concurrent first-write) is surfaced as
     `OhacAttemptCasLostException` and retried fresh (§6, §11.5 decision 34); serialized sqflite
     transactions make the retry defensive, and the concurrency-equivalence test proves distinct
     monotonic sequences under parallel authorization.
- Pre-dispatch architectural rulings (resolving the 7 open scout points):
  1. **Field names pinned to the authoritative schema**: `schema, assertionId, tenantId, terminalId,
     deviceCredentialId, deviceCredentialVersion, epochSequence, epochDigest, authorizerUserId,
     operatorUserId, authorizerRole, permissionsUsed, operationType, operationSchema, operationDigest,
     localAuthorizationSequence, localAuditId, localAuditEntryHash, posBuild, policySchema, trustLevel,
     authorizedAt, digest` (no `signature`, exact match with `assertion.v1.ts` and `assertion_v1.dart`).
  2. **Cohort gate**: in POS, cohort enablement is proven by the presence of an **acknowledged ACTIVE
     epoch** (the backend `hasEnabledCohort` query only delivers epochs when the tenant cohort row is
     enabled) + an **allowlisted exact POS/backend build pair** (`readOhacPosBuild() == epoch.targetPosBuild`).
     Version alone never enables.
  3. **`local_authorization_sequence`**: lives on `human_auth_terminal_state` (terminal-scoped counter),
     incremented atomically when the assertion is emitted. `human_auth_attempt_state`'s column remains
     per-user attempt tracking only.
  4. **Durable attempt policy**: 3 failures / 60s rolling window -> 5-min lockout; successful attempt
     resets failure timestamps and appends `OhacLocalEventType.pinAttemptResetSuccess` (`PIN_ATTEMPT_RESET_SUCCESS`).
  5. **R1-008 fail-closed coupling**: `OhacAssertionEmitter` requires `OhacOutboxRegistry.isRegistered(outboxId)`,
     refuses emission with `OHAC_UNREGISTERED_OUTBOX` if false.
  6. **Transaction boundary**: single DAO transaction in `OhacDeliveryDao` for attempt CAS + terminal
     sequence increment + audit event; returns the inputs for the domain's outbox enqueue.
  7. **`PIN_ATTEMPT_RESET_SUCCESS`** added to `OhacLocalEventType`. No new migration needed (all 5
     tables already exist with all columns, current schema version 60).
- `C-RED`/`C-GREEN`/`C-TRIANGULATE`/`C-REFACTOR`/`C-EVIDENCE` per
  `openspec/.../tasks.md:200-230`: durable attempt service/DAO (positional Floor `@transaction`,
  revision-CAS), POS application service + domain port under `apps/pos_app/lib/domain/security/`,
  assertion emitter honoring R1-008 registration precondition, cohort/build gate (creation disabled
  unless BOTH tenant cohort and build pair match), `authorizeOverride` NOT the protocol boundary.
- Without this unit no `ohac.assertion.v1` is ever emitted.

### U5 — Slice D: verifier, recovery lifecycle, integrity classifier, observability
- Status: PENDING
- `D-*` per `openspec/.../tasks.md:235-294`: `HumanAuthorizationVerifierPort.verify(...)` (does not
  exist anywhere under `apps/admin_backend/src` — measured), port must not insert consumption or
  commit/rollback, credential-binding-mismatch classification, recovery tokens
  (`ohr1.<tokenId>.<256-bit-secret>`, HMAC-SHA-256 storage, pepper fail-fast at startup), POS
  integrity classifier + ordered clear-data path, observability counters/audit facts.
- Backend: `npm test`, `npm run test:e2e`, `npx eslint <paths>` (never `npm run lint`).

### U6 — Close: tracker + authority divergences
- Status: PENDING
- Update `odd/tasks/ohac-pos.md` and this file with final evidence; record T-*/DEP-* pendings;
  restate the §5.1/§11.5-vs-tasks.md build-pair-vs-atomic-unit divergence for the authority
  amendment (owner decision pending, not resolved here).

## Evidence log

(updated per unit: commit, PR, issue, authored lines, test counts, verification findings)
