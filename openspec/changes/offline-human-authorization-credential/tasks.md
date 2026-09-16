# Tasks: Offline Human Authorization Credential (OHAC)

Prerequisite capability for **DSI-6**. Software/application-sandbox trust model. Strict TDD
(`strict_tdd: true`). Every implementation slice is sequenced **RED → GREEN → TRIANGULATE → REFACTOR**.

Artifact store: `openspec`. Delivery strategy: `ask-always`. Execution mode: `interactive`.

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~1,400–2,200 (authored additions + deletions; excludes generated Floor `.g.dart`) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | Dependency-valid slices only: PR 1 canonical contracts+persistence → PR 2 epoch/ack state machine + drain gate → PR 3 durable PIN + assertion creation → PR 4 verifier + recovery + observability → PR 5 pilot/Q80 evidence. **Final PR/chained-PR/work-unit decision is a PENDING user decision under `ask-always`; no strategy is selected here.** |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

The total (~1,400–2,200 lines) **far exceeds the 400-line `review_budget_lines` budget**. Under
`ask-always` the final PR / chained-PR / work-unit selection is deferred to the user before `apply`;
this file proposes only dependency-valid slices and does not silently select a chain strategy.

```text
Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High
```

## Dependencies, Order & Critical Path

Critical path (design §14):

```text
canonical fixtures/contracts
 -> backend migration + epoch publication
 -> POS epoch state/ack protocol (incl. §5.1 drain gate)
 -> durable PIN/assertion creation
 -> verifier port + recovery
 -> pilot evidence
 -> later DSI-6 adoption (outside this change)
```

- Slice order is dependency-valid: each slice lands a system-valid state with no permissive fallback
  and never reinterprets the `DeviceSyncPrincipal` (design §14, proposal "review-budget warning").
- **Blocking intra-change precondition (design §16.2):** the new inbound epoch path MUST demonstrably
  bind RLS in its own transaction (`set_config('app.tenant_id', …, true)`) before epoch/verifier reads
  are implemented — do not copy the `InboundSyncService` injected-repository pattern.
- §5.1 drain gate MUST ship in the same POS build pair as the ack path; a build pair without it is not
  enablement-eligible (design §12 step 4).
- **Dependencies owned OUTSIDE this change (recorded, not implemented here — see last section):** DSI-7
  clear-data/reinstall transport-restoration policy sign-off; DSI-6 amendment package.

## Phase 1 — Infrastructure

- [ ] `I-1` Add shared cross-runtime conformance fixture directory `fixtures/human-authorization/v1/`
  containing canonical UTF-8 + `sha256:` vectors for epoch and assertion payloads (reordered keys,
  escaped controls, astral Unicode, UTF-16 key ordering, NFC/NFD distinction, empty arrays, forbidden
  number, forbidden `null`, duplicate keys, leading-zero sequence, unknown field, one-byte mutation,
  max 1 MiB size) with exact expected canonical bytes/hex per design §7.2.
- [ ] `I-2` Author backend additive TypeORM migration
  `apps/admin_backend/src/migrations/1809000000000-CreateHumanAuthorizationCore.ts` creating
  `human_auth_policy_epochs`, `human_auth_terminal_ack_history`, `human_auth_terminal_ack_floor`,
  `human_auth_recovery_tokens`, `human_auth_recovery_events`, `human_auth_verification_events`,
  `human_auth_rollout_cohorts` with unique/check constraints, indexes, `ENABLE` + `FORCE ROW LEVEL
  SECURITY`, tenant SELECT/INSERT/update policies using `current_setting('app.tenant_id', true)`, and
  UPDATE/DELETE-denial triggers on append-only tables plus floor-regression triggers (design §4.2, §11).
- [ ] `I-3` Add POS additive Floor migration + entities/DAOs registration in
  `apps/pos_app/lib/data/database/app_database.dart` and `migrations.dart` for
  `human_auth_policy_epochs`, `human_auth_policy_entries`, singleton `human_auth_terminal_state`,
  `human_auth_attempt_state`, append-only `human_auth_local_events`; new installs start `UNENROLLED`
  with NO backfill/fabricated ack from `security_profiles`; migration/integrity failure sets fail-closed
  before authorization UI enables (design §11).
- [ ] `I-4` Add deployment-secret config module for the recovery-token pepper
  (backend `ConfigModule` provider, e.g. under
  `apps/admin_backend/src/modules/identity/human-authorization/config/`): no default value, never
  committed, never derived from tenant/user material; MUST fail fast at startup when missing or empty
  (design §9). No plaintext secret material in logs/metrics/exceptions.
- [ ] `I-5` Register `HumanAuthorizationModule` providers/routes from
  `apps/admin_backend/src/modules/identity/identity.module.ts` with dark/disabled routes, capability
  negotiation seam, and `InboundSyncResponseDto` extension point; `sales.module.ts` only consumes the
  exported verifier port later (design §2).

## Phase 2 — Implementation (Strict TDD slices)

### Slice A — Cross-runtime canonical contracts + disabled additive persistence

- [ ] `A-RED` Write failing TS + Dart tests (both consuming `fixtures/human-authorization/v1/`) proving
  `canonicalizeNumberFreeJson` + canonical UTF-8 → `sha256:` digest equality for every vector, and that
  live validation = re-canonicalize + digest equality + schema validation (duplicate-key/unknown-field
  vectors remain fixture-only per R1-006) — must fail before implementation (design §7.2).
- [ ] `A-GREEN` Implement `apps/admin_backend/src/modules/identity/human-authorization/contracts/`
  (`staff-policy-epoch.v1.ts`, `assertion.v1.ts`) and Dart counterparts under
  `apps/pos_app/lib/data/models/human_authorization/` with all required fields, decimal-string
  integers, explicit status/role enums, sorted/deduped arrays, and no `null`/numbers/unknown fields
  (design §4.1, §7.1).
- [ ] `A-TRIANGULATE` Add tests for tenant-scope rejection, digest-mismatch rejection, sequence not
  newer than accepted, and build/schema-pair support, proving contracts reject invalid inputs at the
  value layer with stable codes (spec `Staff Policy Epochs`; proposal invariant 1/4).
- [ ] `A-REFACTOR` Extract shared canonical helper + stable error-code enum so domain/application
  layers import no NestJS/TypeORM/Dio/Floor/bcrypt; keep contracts immutable value objects (design §3).
- [ ] `A-EVIDENCE` Run `npm run lint && npm test` in `apps/admin_backend` and `flutter analyze &&
  flutter test` in `apps/pos_app`; record exact commands/results. Rollback: revert Slice A files and
  `1809000000000-CreateHumanAuthorizationCore.ts`; no runtime behavior depends on the tables yet.

### Slice B — Device inbound epoch/ack state machine + drain gate (no assertion creation)

- [ ] `B-RED` Write failing tests for the convergent crash-safe state machine
  (`ACTIVE(n) → RECEIVE/PENDING(n+1) → ACK_SUBMITTING(n+1) → ACK_CONFIRMED(n+1) → ACTIVE(n+1)`) with
  crash/fail hooks at every transaction write, restart, duplicate/lost ack, and rollback detection —
  asserting exactly one complete convergence target and NO authorization during `ACK_SUBMITTING`
  (design §5, spec `Atomic Epoch Activation and Acknowledgement`).
- [ ] `B-RED` Write failing §5.1 drain-gate tests: candidate flip to `ACK_SUBMITTING` is BLOCKED while a
  registered assertion-bearing outbox holds an unconsumed assertion for sequence ≤ n, even when the
  same cycle's pull succeeds (simulated push-5xx + pull-success); deferral surfaces reason
  `OHAC_ACK_DEFERRED_OUTBOX`; the pull path cannot bypass the gate (design §5.1, R1-001).
- [ ] `B-RED` Write the named **creation-vs-gate race** test: authorization creation racing the drain
  gate/candidate flip never creates an `ACTIVE(n)`-era assertion after `ACK_SUBMITTING(n+1)` commits;
  post-flip authorization freeze closes the window (R1-001 round-2 disposition).
- [ ] `B-RED` Write the **R1-008 fail-closed coupling** test: assertion creation from an unregistered
  emitting outbox is REJECTED (registration is a precondition, not consultative); a consumer outbox must
  be registered as assertion-bearing before assertion creation is permitted (review-ledger R1-008).
- [ ] `B-GREEN` Implement backend epoch publication/projection + ack
  (`staff-policy-epoch.service.ts`, ack controller method on
  `apps/admin_backend/src/modules/sales/controllers/inbound-sync.controller.ts`, DTOs in
  `dto/inbound-sync.dto.ts`) under `SyncTransportGuard` + `sync:pull`, deriving tenant/terminal from
  `devicePrincipal`; lock floor, validate exact next relation, append history, CAS-raise floor,
  idempotent receipt for same sequence+digest+request hash (design §5.3, §5.5).
- [ ] `B-GREEN` Implement POS epoch receive/candidate/ack/confirm + terminal-state transitions and the
  drain gate as the LAST pre-condition of the candidate-flip Floor `@transaction` (positional args
  only); reconciliation sets `SUPERSEDED_BY_FLOOR` / `ROLLBACK_DETECTED` / `ACK_INCONSISTENT` per
  design §5.1/§5.5.
- [ ] `B-GREEN` Implement the assertion-bearing outbox **registration contract + fail-closed coupler**
  (R1-008) and append-only operator-visible quarantine for undeliverable assertions after the configured
  bounded retry bound, with `OHAC_ACK_DEFERRED_OUTBOX`/quarantine classifications exposed in terminal
  state (design §5.1, §10).
- [ ] `B-TRIANGULATE` Add real-database + RLS tests: cross-tenant denial, FORCE RLS, CAS floor
  monotonicity (no sequence decrease / no same-sequence digest rewrite), append-only trigger denial,
  concurrent ack one-winner, POS floor real-DB crash recovery, and negotiation returning
  `DISABLED`/`UPGRADE_REQUIRED`/`RECOVERY_REQUIRED`/next-epoch (design §12, §13).
- [ ] `B-REFACTOR` Ensure epoch policy lives in domain/application with HTTP/TypeORM/Floor as adapters;
  confirm no per-user key, detached epoch signature, TOTP/device-only fallback, or verifier exposure
  outside the terminal-bound device-sync transaction (design §1, §4.1 rule 4).
- [ ] `B-EVIDENCE` Run focused POS floor crash tests + `npm test`/`flutter test`; record exact
  commands/results and the interleaving scenario output. Rollback: disable the ack route + POS state
  machine by cohort/build gate; retain tables and evidence (non-destructive, design §12).

### Slice C — Durable PIN attempts + assertion creation behind cohort/build gate

- [ ] `C-RED` Write failing tests for `human_auth_attempt_state` keyed `(tenant_id, terminal_id,
  user_id)`: persistent across restart, cannot be bypassed by restart, rolling-window 3-failures/60s →
  5-min backoff, successful post-expiry reset appends `PIN_ATTEMPT_RESET_SUCCESS`, and administrative
  reset via `attemptResetGeneration` (replays no-op) — all in the SAME transaction (design §6, spec
  `Durable User-Terminal Attempt Controls`).
- [ ] `C-RED` Write failing tests for operation-bound assertion creation: only after fresh PIN against
  an ACTIVE acknowledged-epoch entry with required role/permission; ineligible/inactive/stale ⇒ deny +
  NO assertion; PIN/verifier never appear in assertion, logs, sync receipts, or error output (spec
  `Fresh Local PIN Authorization`).
- [ ] `C-RED` Write failing cohort/build gate tests: creation disabled unless BOTH an explicit tenant
  cohort row (with OWNER delayed-revocation acceptance reference) AND an allowlisted exact POS/backend
  build pair are present; version alone never enables; unsupported clients fail closed (spec
  `Rollout and Rollback Safety`).
- [ ] `C-GREEN` Implement durable attempt service/DAO (positional Floor `@transaction`, revision-CAS
  retry fallback per design §6) reusing bcrypt compare; plaintext PIN exists only in memory and is
  never a SQL arg/persisted/logged/crash-breadcrumb.
- [ ] `C-GREEN` Implement POS application service + domain port under `apps/pos_app/lib/domain/security/`
  that verifies eligibility, enforces backoff, increments `localAuthorizationSequence`, appends local
  audit linkage, and returns immutable assertion inputs atomically with the consuming domain's local
  operation/outbox enqueue (design §7.1: supplies inputs, not a separate proof outbox).
- [ ] `C-GREEN` Implement assertion emitter honoring the R1-008 registration precondition and emitting
  `ohac.assertion.v1` bound to tenant, terminal, device credential id/version, epoch sequence/digest,
  authorizer/operator, permissionsUsed, operation type/schema/digest, local sequence/audit linkage,
  `posBuild`, `policySchema`, and `trustLevel: APPLICATION_SANDBOX_SOFTWARE` (design §7.1).
- [ ] `C-TRIANGULATE` Add concurrent PIN-attempt equivalence tests (proving CAS path equals
  closure/`@transaction` semantics), and adversarial tests proving restart/sync/app-upgrade do NOT reset
  attempt state; assert positional `@transaction` generation (design §6, §13).
- [ ] `C-REFACTOR` Confirm `authorizeOverride` is NOT made the protocol boundary and existing login
  behavior is unchanged; `AuthRepositoryImpl` volatile `_pinFailures`/`_pinLockedUntil` remain for legacy
  login only (design §2 existing seams).
- [ ] `C-EVIDENCE` Run focused POS tests + `flutter test`/`npm test`; record exact commands/results.
  Rollback: cohort/build gate disables creation; attempt state and assertions retained (design §12).

### Slice D — Transaction-compatible verifier + recovery lifecycle + observability

- [ ] `D-RED` Write failing tests for `HumanAuthorizationVerifierPort.verify(manager, principal,
  request)` running inside a consumer-supplied `EntityManager`/RLS transaction: defensive
  `set_config`, `current_setting('app.tenant_id')` MUST equal `principal.tenantId`; ordered checks
  (cohort/build pair → schema/canonical digest/unique replay identity → principal is DEVICE_SYNC + exact
  tenant/terminal/credentialId/version match → operation type/schema/digest equality → acknowledged epoch
  + not below/above floor → entry authorizer/role/active/permission match → well-formed operator/audit →
  exact software trust level); returns FROZEN immutable facts only (design §8).
- [ ] `D-RED` Write failing tests proving the port MUST NOT insert consumption or commit/rollback, and
  consumer harness test: verifier success followed by forced effect failure leaves NEITHER consumption
  NOR effect; concurrent reuse yields ONE effect via consumer unique `(tenant_id, assertion_id)`;
  matching retry returns prior receipt, mismatched reuse is `ASSERTION_REPLAY`/`IDEMPOTENCY_CONFLICT`
  (spec `Domain Consumption Boundary`, design §8).
- [ ] `D-RED` Write failing tests distinguishing `OHAC_CREDENTIAL_BINDING_MISMATCH` (assertion credential
  binding ≠ current principal, e.g. `credentialVersion` bumped) from `OHAC_TENANT_TERMINAL_MISMATCH`
  (submitting principal is not the asserted tenant/terminal at all); stale assertion preserved
  append-only, never rewritten/re-bound/replayed (R1-004, design §7.1/§10).
- [ ] `D-RED` Write failing recovery-token tests: `ohr1.<tokenId>.<256-bit-secret>` stored as HMAC-SHA-256
  (secret, deployment pepper); issuance by active same-tenant OWNER/MANAGER only; tenant+terminal bound;
  single-use; server-issued-at + exactly 15 min; revocation; wrong-tenant/wrong-terminal/expired/
  revoked/reused/offline redemption denied; at most one concurrent redemption succeeds; identical
  principal+idempotency-key/hash returns receipt after lost response (design §9, spec `Online
  Re-enrollment Token Lifecycle`).
- [ ] `D-RED` Write failing config tests: startup fails fast when the pepper is absent/empty; after
  rotation, tokens issued under the previous pepper are denied and a rotation audit event is appended
  (R1-005, design §9).
- [ ] `D-RED` Write failing integrity-loss classification tests: `AUTH_STATE_MISSING`,
  `DIGEST_MISMATCH`/`SCOPE_MISMATCH`, `LOCAL_ROLLBACK`, `ACK_INCONSISTENT`, `UNSUPPORTED_SCHEMA_BUILD`,
  `TRANSPORT_STATE_MISSING` each fail closed with NO fallback and NO assertion (spec `Integrity Loss
  Fails Closed`, design §9).
- [ ] `D-RED` Write failing Nest integration tests: `SyncTransportGuard` principal attribution is
  authoritative; human-JWT staff path CANNOT ack/redeem; Device Sync principal CANNOT issue tokens;
  `GET /identity/staff` cannot activate an OHAC epoch; verifiers appear only in eligible terminal epoch
  envelopes and never in logs/errors/telemetry (design §13).
- [ ] `D-GREEN` Implement
  `apps/admin_backend/src/modules/identity/human-authorization/ports/human-authorization-verifier.port.ts`
  + service per design §8, returning a frozen value with stable decision/reason and no secrets/JWT-user
  synthesis/identity mutation.
- [ ] `D-GREEN` Implement recovery-token service + controllers (`POST/DELETE
  /identity/human-authorization/recovery-tokens` with `AuthGuard`+`AuthoritativeCurrentUserGuard`+
  `RolesGuard`+`@Roles(OWNER, MANAGER)`+`TenantInterceptor`; `POST
  /v1/sync/inbound/human-authorization/recovery/redeem` with `SyncTransportGuard`+`sync:pull`), and the
  epoch ack route, all appending immutable recovery/verification events excluding plaintext/hash/verifier
  (design §9).
- [ ] `D-GREEN` Implement the POS integrity classifier + ordered clear-data path (restore DSI-7/activation
  transport FIRST, then redeem OHAC token) against existing seams
  (`onboarding/controllers/activation.controller.ts`, `onboarding/services/activation.service.ts`, POS
  `domain/security/device_sync_bootstrap_coordinator.dart`); OHAC never provisions/confirms/rotates/
  revokes device credentials (design §9).
- [ ] `D-GREEN` Implement observability counters/audit facts: epoch publication/lag, ack retries/floor
  conflicts, integrity classes, backoff/reset outcomes, verification reason, consumer correlation,
  recovery lifecycle, cohort/build decisions, disconnected duration — IDs/digests only, no PINs/verifiers/
  token secrets/assertion bodies (spec `Observability and Ownership`, design §12).
- [ ] `D-TRIANGULATE` Add spec-scenario tests: valid assertion admitted returns immutable receipt/facts;
  substitution/transport-only-authority denied and never infers human authority (spec `Reusable Backend
  Admissibility Verification`); disconnected terminal's acknowledgement-based admissibility has NO TTL
  (spec `Delayed Revocation`); safe operational investigation identifies tenant/terminal/epoch/authorizer/
  digest/reason and excludes secrets (spec `Observability and Ownership`).
- [ ] `D-REFACTOR` Confirm domain policy imports no framework; consumer-owned consumption boundary left
  intact; `SyncCreditNoteAuthGuard` remains fail-closed until DSI-6 adopts the port (design §2, §16.3).
- [ ] `D-EVIDENCE` Run `npm test`, `npm run test:e2e`, `npm run lint`, `npm run build` in
  `apps/admin_backend`; record exact commands/results. Rollback: disable creation/acceptance by
  cohort/build pair; floors/epochs/acks/assertions/audit/pending records preserved (design §12).

## Phase 3 — Testing & Physical Acceptance

- [ ] `T-1` Add the shared-fixture conformance runner so Dart and TS tests fail if either canonicalizer
  diverges on any `fixtures/human-authorization/v1/` vector (cross-language guard, design §7.2/§13).
- [ ] `T-2` Add a migration runtime test suite for `1809000000000-CreateHumanAuthorizationCore.ts`:
  additive-up on a populated DB, `FORCE RLS` present, UPDATE/DELETE denied, floor trigger rejects
  regression/digest rewrite, and down migration does NOT erase evidence (design §11).
- [ ] `T-3` Add contract tests proving no PIN/verifier material leaks into assertions, sync receipts,
  logs, metrics, audit metadata, exceptions, or error output (spec `Fresh Local PIN Authorization`).
- [ ] `T-4` Q80 physical acceptance (design §12 step 5) — record evidence per scenario:
  - [ ] `T-4a` Offline PIN authorization under the software trust model; no hardware-attestation claim.
  - [ ] `T-4b` Power loss at EVERY epoch/ack boundary converges to exactly one complete state.
  - [ ] `T-4c` Restart-persistent backoff (cannot be bypassed by process restart).
  - [ ] `T-4d` Reconnect floor rejection of below-floor assertions (`OHAC_STALE_EPOCH`).
  - [ ] `T-4e` Clear-data ordered recovery (transport restored first, then token redemption).
  - [ ] `T-4f` Printer/load coexistence (crypto + thermal print stress, no circuit-breaker trips).
  - [ ] `T-4g` **Push-5xx + pull-success interleaving:** with a test hook forcing push 5xx while pull
    succeeds, queue prior-epoch assertions, deliver a newer epoch, and PROVE the terminal defers the ack
    (`OHAC_ACK_DEFERRED_OUTBOX`) with epoch n still governing; then prove BOTH deterministic exits —
    drain succeeds → ack proceeds; OR bounded-retry quarantine with operator visibility → re-authorization
    without loss or duplicate effect.
  - [ ] `T-4h` §5.1 reconciliation of a pre-interleaved terminal: fresh authorization under the governing
    epoch, quarantined `SUPERSEDED_BY_FLOOR` assertion retained append-only, consumer unique-consumption
    idempotency proves NO duplicate business effect.
- [ ] `T-5` Add non-destructive rollback test: rollback/disable preserves epochs, acknowledgements,
  assertions, audit facts, pending domain records, and consumption evidence, and leaves non-OHAC sync
  behavior unchanged (spec `Rollout and Rollback Safety`).
- [ ] `T-6` Add regression tests for the accepted residual boundary: rooted/modified/hooked/copied-verifier
  scenarios do NOT cause any claimed detection or non-repudiation; per-user-terminal lockout residual
  (cross-terminal retry with the same portable verifier) is documented, not silently mitigated
  (spec `Accepted Residual Threat Boundary`, R1-007).
- [ ] `T-7` Final phase gate: run full backend (`npm test`, `npm run test:e2e`, `npm run lint`,
  `npm run build`) and POS (`flutter analyze`, `flutter test`) suites; record exact commands/results and
  confirm every spec scenario has at least one automated or Q80 evidence item.

## Dependencies owned OUTSIDE this change (recorded, NOT implementation tasks)

- [ ] `DEP-1` **DSI-7 policy sign-off** — clear-data/reinstall transport-restoration policy sign-off over
  existing activation seams (design §9, §16.6, R1-003). Pilot coverage of the clear-data path
  (`T-4e`) activates only AFTER this sign-off. Not implemented here.
- [ ] `DEP-2` **DSI-6 amendment package** — mandated amendments of design §17 (replace human-signature/
  private-key language with `ohac.assertion.v1`; terminal-acknowledged-epoch admissibility + floor, no
  TTL; DSI-6 operation schema/digest + roles/self-authorization policy; call
  `HumanAuthorizationVerifierPort` with DSI-6's `EntityManager` after RLS binding; DSI-6-owned unique
  consumption row; identical-retry vs replay/idempotency-conflict; keep `SyncCreditNoteAuthGuard`
  fail-closed; assert ack durable at verification; map `OHAC_CREDENTIAL_BINDING_MISMATCH`; register DSI-6's
  credit-note outbox in the §5.1 drain gate). Do NOT edit DSI-6 in this phase.
- [ ] `DEP-3` **DSI-8 acceptance** — remains separate scope; not absorbed here.
- [ ] `DEP-4` **Rollout thresholds** (design §16.7) — numeric alert/expansion thresholds must be agreed
  before cohort expansion; absence blocks expansion, not dark deployment.
