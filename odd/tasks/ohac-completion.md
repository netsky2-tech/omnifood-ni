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
- Status: IMPLEMENTED — issue #706 (`status:approved`, `type:feature`); PR pending.
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
- Response side of the pull: the mapper that nobody has written (no production file constructs
  `OhacPolicyEpochEntity`/`OhacPolicyEntryEntity`), the four explicit statuses (`DELIVER`,
  `DISABLED`, `UPGRADE_REQUIRED`, `RECOVERY_REQUIRED`), the two absence outcomes
  (`not-participating`, `up-to-date`), `evaluateDeliveredEpoch`, transaction R, and the first
  terminal-state row creation path (`ensureTerminalState` already exists).
- Contract facts: `humanAuthorization` is a top-level sibling of `deltas`/`fiscalConfig`; `epoch`
  carries the payload with `sequence`/`digest` as siblings; the three non-DELIVER statuses carry
  none of those members. Backend envelope: `apps/admin_backend/src/modules/sales/dto/inbound-sync.dto.ts:337`.

### U2 — B2d: acknowledgement client and reconnect reconciliation
- Status: PENDING
- `POST /v1/sync/inbound/human-authorization/staff-policy/ack` (backend controller exists); body
  carries claim + negotiated facts only, identity from device credentials.
- Reconnect reconciliation: retry while `ACK_SUBMITTING`, integrity loss.
- Open question this unit must answer (B2a carried forward): §5.4's receipt ID and server build
  have no column — decide whether the receipt lands in the local event log, and implement it.

### U3 — B3: drain gate and outbox registration
- Status: PENDING
- Registry, registration coupler, blocked `ACK_SUBMITTING` transition, `OHAC_ACK_DEFERRED_OUTBOX`
  reason, bounded retries, quarantine with operator visibility. Inert until a registrant exists
  (test registrant only; DSI-6 credit-note outbox is the named future registrant). Decision 31.
- Must land before U4: the assertion emitter's R1-008 fail-closed precondition reads this registry.

### U4 — Slice C: durable PIN attempts + assertion creation (B4)
- Status: PENDING
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
