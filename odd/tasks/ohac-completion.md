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
- Status: **MERGED as `a8786b4b`** (PR #721, issue #720 closed). Branch `feat/ohac-pos-slice-c`
  deleted remotely. All checks green (`lint-and-test` 10m11s, `build-check` 1m52s, Cloudflare,
  GitGuardian). Note: the first Cloudflare Pages run failed transiently (no logs accessible; the
  GitHub-side `flutter build web` smoke build passed on the same commit) — an empty retrigger
  commit produced a fully green run; the empty commit is absorbed by the squash merge.
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

### U5a — D-backend: verifier port + recovery lifecycle + backend observability
- Status: **IMPLEMENTED + INDEPENDENTLY VERIFIED (APPROVE, 0 blockers) — READY TO SHIP.**
  Issue #727 (`status:approved`, `type:feature`).
- Independent verification: APPROVE, 0 blocking; **3 SHOULD-FIX closed** (HTTP transport-separation
  e2e both directions + service-level §10 status mapping; expiry boundary tests at 14:59:59.999/
  15:00:00 with `<=`→`<` mutation proof; check-order docstring restated as a precondition outside
  the §8 eight + precedence test) **+ 2 cheap observations** (placeholder test now hits the right
  branch; digest comment honest about relying on `parseAssertionV1`).
- Evidence: `npm test` 3,324 pass; `npm run test:db` 294/294 (local Postgres reachable);
  `npm run test:e2e -- --runInBand` 686/686; `npm run build` ok; `npx eslint <paths>` 0/0 (never
  `npm run lint`). Parallel e2e failures = pre-existing cross-worker fixture race (unrelated
  suites only, verified). 3 mutation proofs (floor-check skip, raw-secret storage, expiry `<=`)
  with byte-identical sha256 restores. Authored ≈4,300 lines (production ≈1,965 + tests ≈2,330),
  ~10× guard, overage declared.
- **Native review `review-7766571f3974343a`** (medium, 1 lens, 25 files / 4,342 lines): START
  created the lineage; forecast **1 model run** acknowledged; capture failed with
  `reviewer-empty-output` / `stopReason: length` (143s) — the **9th identical provider failure
  across 5 lineages**. No relaunch; no verdict, no authority acknowledged. Delivered under the
  owner's standing OHAC authorization + the U1–U4 record.
- U5a rulings: (1) `D-EVIDENCE`'s `npm run lint` is FORBIDDEN (repo script is `eslint --fix`) —
  lint evidence = `npx eslint <paths>`; (2) pepper env vars must land in `.env.example`,
  `.env.test.example` AND `test/setup-test-env.ts` in the same unit or startup fails; (3) new
  human controllers must be registered in `test/support/route-transport-registry.ts`;
  (4) `attempt_reset_generation` writer stays OUT (decision 29, own issue); (5) real-DB specs
  (`.db.spec.ts`) run via `npm run test:db` — writer reports Postgres availability if it cannot run;
  (6) verifier MUST NOT insert consumption or commit/rollback (consumer harness proves it).
- Scout facts (measured at `65d84ebb`): `HumanAuthorizationVerifierPort` = 0 matches in `src/`;
  no recovery service/controller/route; no pepper anywhere; `error-codes.ts` is a subset of §10;
  entities for all 9 tables incl. recovery-token + verification-event already exist; module is
  imported by `sales.module.ts`; pepper config follows the `identity/config/*jwt.config.ts`
  fail-fast precedent.
- `D-*` per `openspec/.../tasks.md:235-294`: `HumanAuthorizationVerifierPort.verify(...)` (does not
  exist anywhere under `apps/admin_backend/src` — measured), port must not insert consumption or
  commit/rollback, credential-binding-mismatch classification, recovery tokens
  (`ohr1.<tokenId>.<256-bit-secret>`, HMAC-SHA-256 storage, pepper fail-fast at startup), POS
  integrity classifier + ordered clear-data path, observability counters/audit facts.
- Backend: `npm test`, `npm run test:e2e`, `npx eslint <paths>` (never `npm run lint`).

### U5b — D-POS: integrity classifier + ordered clear-data + POS observability
- Status: **MERGED as `b204ecd5`** (PR #730, issue #729 closed). Branch `feat/ohac-d-pos` deleted
  remotely. All checks green (`lint-and-test` 9m55s, `build-check` 2m12s, Cloudflare, GitGuardian).
- Independent verification: APPROVE, 0 blocking; **4 SHOULD-FIX closed** — vacuous fail-closed loop
  replaced by the real D-RED **chain** (real classifier → `markIntegrityLoss` persistence with
  column pinned → denial, zero PIN comparisons; mapping-swap mutation kills 4), sync-level
  fail-closed-default e2e (unmapped 409 code → `ACK_INCONSISTENT`, fail-open default mutation
  kills it), misleading test name, "single mapping source" claim scoped honestly (state-machine
  decision-attached mappings are a deliberately decoupled layer — `data/models` must not import domain).
- Evidence: RED (40 behavioral failures vs stubs) → GREEN (classifier 13, coordinator 6,
  observability 10, fail-closed 10, sync facts 3); full `test/domain/` 750/750; full `test/data/`
  0 assertion failures (1 known loader flake per run, isolated-green); analyze + build_runner clean;
  **4 mutation proofs** (ordering inverted, unknown→none, digest/scope swap, default→indeterminate)
  sha256 byte-identical. Authored ~1,988 lines, ~5× guard, overage declared.
- **Native review `review-65b2f342139847e8`** (HIGH, 4 lenses, 10 files / 2,050 lines): group
  forecast **4 model runs** acknowledged; capture failed `reviewer-empty-output` /
  `stopReason: length` (203s) on `review-resilience` — **10th identical failure across 6
  lineages**. No relaunch; no verdict, no authority acknowledged. Delivered under the owner's
  standing OHAC authorization. Scout facts: `OhacIntegrityClassification` and
  `markIntegrityLoss` exist (callers in sync_service); NO factory-reset/clear-data flow exists
  (`DeviceSyncBootstrapCoordinator` is the restore-transport seam to order first); POS has no
  metrics — `developer.log` + `pos_product_telemetry_service` are the conventions; the redeem
  leg depends on U5a's device route (lands with U5a). Proposed surfaces: `lib/domain/security/`,
  `lib/data/services/sync_service.dart`, `lib/data/models/human_authorization/`,
  `lib/data/daos/human_authorization/ohac_delivery_dao.dart`, `test/domain/security/`,
  `test/data/models/human_authorization/`, `test/data/daos/human_authorization/`.

### U6 — Close: tracker + authority divergences
- Status: **DONE** (this entry).

## Final evidence log — the effort, end to end

| Unit | Delivered | Merge | PR | Issue | Verification | Native review |
|---|---|---|---|---|---|---|
| P0 | Worktree ff to origin/main + baseline | — | — | — | analyze clean, 0 assertion failures | — |
| U1 (B2c-3b) | consume `humanAuthorization`: mapper, 4 statuses, 2 absences, transaction R | `b06597f4` | #707 | #706 | APPROVE 0 blockers, 4 SF closed, 1,381 lines | `review-00e9ef1e…` failed 3× (`reviewer-empty-output`) |
| U2 (B2d) | ack client, atomic receipt (58→59), phase-driven retry, RECOVERY_REQUIRED | `bd6254df` | #711 | #710 | FIX-FIRST → 1 blocker (`SEQUENCE_GAP` inverted) + 2 SF closed, 2,473 lines | `review-cd47a21c…` failed 2× |
| U3 (B3) | drain gate, registry, R1-008 coupler, deferral (59→60), inert quarantine | `ef53072e` | #715 | #714 | APPROVE 0 blockers, 3 observations accepted, ~1,608 lines | host declined consent (candidate-scoped), then provider fault |
| U4 (Slice C) | durable PIN attempts, assertion emitter (23-field `ohac.assertion.v1`), cohort/build gate | `a8786b4b` | #721 | #720 | APPROVE 0 blockers, 6 findings closed, ~2,916 lines | `review-82435911…` failed (HIGH, 4-lens group) |
| U5a (D-backend) | verifier port §8, recovery tokens §9, §10 codes, §12 counters | `3264f9ed` | #728 | #727 | APPROVE 0 blockers, 3 SF + 2 observations closed, ~4,300 lines | `review-7766571f…` failed 1× |
| U5b (D-POS) | integrity classifier §9, ordered recovery coordinator, observability facts | `b204ecd5` | #730 | #729 | APPROVE 0 blockers, 4 SF closed, ~1,988 lines | `review-65b2f342…` failed (HIGH, 4-lens group) |

- **Every unit**: issue with `status:approved` + `type:feature`, RED→GREEN TDD, ≥2 mutation proofs
  with sha256 byte-identical restores, independent verification before delivery, CI green
  (`lint-and-test`, `build-check`/`build`, Cloudflare, GitGuardian; backend also `npm test`
  3,300+, `test:db` 294, `test:e2e --runInBand` 686), squash merge + branch deleted.
- **Native review provider fault (recorded incident)**: `reviewer-empty-output` / `stopReason:
  length` on EVERY capture — 10 failures across 6 lineages, both 1-lens and 4-lens groups, both
  `current-changes` and `base-diff` projections, candidates from 580 to 4,342 lines. Deterministic;
  no verdict ever produced; no authority acknowledged on any lineage. Owner decisions: delivered
  on independent verification for U1–U4 (explicit), U5a/U5b under the standing OHAC authorization
  + the same recorded criterion. All six lineages remain in `reviewing` state.
- **Estimate**: ~16,600 authored lines across the effort (production + tests, overage declared per
  unit under the real-coverage exception); 7 issues, 6 PRs, 6 squash merges, 0 rollbacks.

## T-* / I-* dated status (verified by grep this session — never trust the checkboxes)

- **T-1 conformance fixtures/runner**: shared `fixtures/human-authorization/v1/` consumed by BOTH
  runtimes (Dart via `ohac_test_helpers.dart`; TS contract specs); a `conformance` CI check ran on
  PR #704. Formal checkbox state: open — evidence exists.
- **T-2 migration runtime tests**: `1809000000000-CreateHumanAuthorizationCore.spec.ts` EXISTS;
  subsequent OHAC migrations also have specs. Substantially present.
- **T-3 no-PIN-in-assertion contract tests**: present in `test/domain/security/` (emitter round-trip,
  `PIN material never leaks`, hostile-material observability guard). Present.
- **T-4 Q80 physical acceptance / T-5 non-destructive rollback / T-6 residual-boundary regression /
  T-7 final phase gate**: OPEN — physical acceptance and the final gate need the owner's device +
  release run.
- **I-2/I-4/I-5 (backend migrations, pepper secret module, module registration)**: DONE in code
  (migrations existed pre-effort; pepper config + env wiring landed in U5a; module wiring in U5a).
  **Deployment action outstanding: set `HUMAN_AUTHORIZATION_RECOVERY_PEPPER` in production env —
  the app FAILS FAST without it (by design, U5a).**
- **decision 29 (`attempt_reset_generation` writer)**: CONFIRMED still absent (grep: only readers).
  Its own issue remains open; the "Audited reset" spec scenario holds in aggregate only once it lands.

## DEP-* — external, owned by the owner (NOT this effort)

- **DEP-1** DSI-7 policy sign-off (clear-data/reinstall transport restoration).
- **DEP-2** DSI-6 amendment package (§17) — also the named future registrant for the drain gate and
  the first consumer of `HumanAuthorizationVerifierPort`.
- **DEP-3** DSI-8 acceptance (separate scope).
- **DEP-4** numeric rollout thresholds (§16.7).

## Authority divergences recorded for amendment (unresolved by design)

1. **Build-pair vs atomic-unit**: design §5.1/§11.5 decision 32 (POS half as separate review units,
   gate last, build-pair release constraint) vs `tasks.md` (state machine + flip + gate "ship as one
   atomic unit"). Code adopted the build-pair reading; PR sequencing followed decision 32.
2. **`OHAC_SEQUENCE_GAP` retryable (§10) vs fail-closed `ACK_INCONSISTENT` mapping (§9)** — recorded
   in the classifier comment; mapping follows §9, §10's reading recorded.
3. **`ROLLBACK_DETECTED` (§5.5 prose) vs `LOCAL_ROLLBACK` (§9 table)** — pre-existing spelling tension,
   machine follows §9 (noted by B2b).
4. **§5.4 receipt schema includes "server build" but the ack response carries none** — satisfied from
   `negotiated_backend_build` (persisted by R); backend contract short of the design text.
5. **§9 rotation audit event** — rotation works (old-pepper tokens deny) but no rotation event is
   appended; recorded in U5a verification, runbook-only for now.

## Follow-ups recorded (each with its reason)

- **Sentinel reconciliation**: `human_auth_terminal_state.active_digest` seeded `''` by the frozen
  DAO vs `'GENESIS'` required by the policy layer (bridged at the acceptance boundary in U1, negative
  pins in U4). A future unit should seed `GENESIS` and drop the bridge.
- **Deferral badge UI** (operator visibility of `OHAC_ACK_DEFERRED_OUTBOX` in the sync dialog):
  needs a NHILOS-standard audit — deliberately kept out of U3.
- **DSI-6 cross-DAO probe limitation**: the drain gate evaluates inside the transaction-scoped DAO;
  a real registrant needing another DAO's `@Query` may require moving evaluation to
  immediately-before-S. Recorded for DSI-6.
- **Auth-decision facts dormant**: `OhacAuthorizationService` has no production caller yet (U4 is
  the library; the consumer wires it under DSI-6/enablement).
- **Parallel `npm run test:e2e` fixture race** (pre-existing, cross-worker): serial run is the
  reliable command until the shared-role helper is made worker-safe.
- **Cloudflare Pages transient build failure** on PR #721: retried green with an empty retrigger
  commit; no root cause available (external logs).
