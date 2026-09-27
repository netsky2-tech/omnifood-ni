# OHAC Epoch Delivery Task Projection

Authority: `openspec/changes/offline-human-authorization-credential/design.md` §4.1, §4.2, §5.1, §5.3, §11.4 decisions 24-29, §12, §16.2, plus `tasks.md` (PR 2 = epoch/ack state machine + drain gate; PR 4 = verifier + recovery + observability). This file is an ODD execution projection only; OpenSpec remains the authority.

Base: `origin/main` (`98e1926`, merged PR #340), where the authority landed.
Status: COMPLETE on the backend — A1 through A4 are all merged and covered against a real database; the POS half is tracked in `ohac-pos.md`, where B1a is merged at `ee305224`.
Review budget: 400 lines per slice, with real-coverage exceptions accepted and declared.

## Decisions already made (do not reopen)

- Decisions 24-29 of design §11.4: route in the inbound sync controller delegating to an OHAC-owned service that opens its own tenant-bound transaction; negotiation as query parameters plus an optional `humanAuthorization` response member; replay comparison inherited per decision 23 with the terminal's own newest epoch as comparison head and cohort flips counting as changes; backend slice first with the POS half as a sibling; drain gate contract now and implementation with POS; `attempt_reset_generation` out of scope with its own issue.
- The acknowledgement route takes the terminal identity only from the authenticated device principal, never from a request body.
- The epoch path must not depend on the legacy raw PIN-verifier exposure in `InboundSyncService.fetchUserDeltas` being removed; that retirement is a separate compatibility decision.

## Facts that shape the slices (observed on `main` at `98e1926`)

- No OHAC route, service, or DTO exists on the inbound sync path; the controller has `deltas`, `catalog`, root, and `fiscal/ack` only.
- `InboundSyncQueryDto` carries `sinceVersion`, `since`, `terminalId`, `types`; the response carries `fiscalConfig` optionally, which is the precedent for the new response member.
- `SyncTransportGuard` already binds the tenant context and resolves the canonical terminal id as `credential.activationAttempt.trustedTerminalId`, which must equal the principal's `deviceId`.
- `human_auth_policy_epochs` is append-only with forced RLS, unique on `(tenant_id, terminal_id, sequence)` and `(tenant_id, terminal_id, digest)`; `human_auth_terminal_ack_history` accepts only `ACCEPTED`/`REJECTED` with partial unique keys on the accepted sequence and on the idempotency key; `human_auth_terminal_ack_floor` is the mutable per-terminal row with a monotonic guard and a revision CAS.
- The backend `ohac.assertion.v1` parser exists but has no producer; assertion production is POS-side and is not a dependency of this phase.
- The Dart side already parses `ohac.staff-policy-epoch.v1` and shares `fixtures/human-authorization/v1/` with the TypeScript conformance spec, but no DAO, Floor entity, state machine, or ack client exists.

## Slices

### A1 — Per-terminal epoch materialization (backend)

Delivered in two review units: A1a (pure projection, `0f35100`) and A1b (service, `12796d59`).

### A1a — Per-terminal epoch materialization projection (backend)

- Status: DONE and MERGED as `0f35100` (PR #356, issue #355).
- Adds `projection/staff-policy-epoch-materializer.ts`: pure projection from a terminal-agnostic snapshot plus terminal facts to the canonical per-terminal epoch, self-validated through `parseStaffPolicyEpochV1`.
- The chain comes from the terminal, never from the snapshot: the snapshot's chain values are tenant-level facts between snapshots, and copying them would break exactly the late-joining terminal that decision 17 exists for.
- Independent verification named two weak spots, both closed before delivery: a whitespace-only `publisherBackendBuild` reached the materializer as apparently valid (the snapshot projector and the epoch parser both check non-emptiness without trimming), and the entry carry-through assertion used a single-entry fixture that could prove nothing. The new backend-build guard was proven non-vacuous by reverting it and watching the test go red.
- Evidence: projection suite 43 tests, OHAC suite 14 suites and 178 tests, non-mutating ESLint, Prettier, `nest build`, and `git diff --check` pass. 414 review-facing lines under the real-coverage exception.
- Deliberately not taken here: reading and validating the persisted snapshot payload, inserting the epoch row, and the delivery response. The contract-level gap that a whitespace-only build passes both the snapshot projector and the epoch parser is worth closing separately.

### A1b — Per-terminal epoch materialization service (backend)

- Status: DONE and MERGED as `12796d59` (PR #365, issue #359).
- Reads the terminal's floor, reads only the successor snapshot, gates on the exact negotiated build pair, validates the persisted payload fail-closed, materializes, inserts idempotently under the table's unique keys, and reads back the authoritative row.
- **Correctness gap closed after review:** the epoch row is unique per `(tenant, terminal, sequence)`, so its build pair is frozen at first materialization. The read-back path originally returned the stored row as-is, which would deliver an epoch for the old build after a build change and leave the terminal stuck. A distinct `build-mismatch` outcome now refuses that delivery without rewriting the immutable row, and the payload must agree with the row's signed `digest` column before materializing.
- Outcomes are not consumed yet: mapping `build-mismatch` and `cohort-disabled` onto the design's `UPGRADE_REQUIRED` and `DISABLED` responses is A2's job.
- Evidence: OHAC suite 15 suites and 200 tests, non-mutating ESLint, Prettier, `nest build`, and `git diff --check` pass. 1058 review-facing lines under the real-coverage exception, declared in the PR.
- **No real-database evidence for this unit**, which is precisely what A4 exists to supply: the statement shapes, the `ON CONFLICT` arbiter, and the jsonb round trip were exercised only against the mock.
- Follow-up: no snapshot-contract parser exists, so the payload check is bespoke plus the digest-column comparison; the payload's tenant-level chain fields remain unchecked because the epoch overrides them with the terminal's own chain.

### A2a — Delivery negotiation and outcome mapping (backend)

- Status: DONE and MERGED as `10c67281` (PR #375, issue #373).
- Resolves the pull's answer with a fixed, documented precedence: no negotiated build means the client never opted in and the member is omitted; a blank build, or supported-schema lists missing the epoch or assertion schema, mean an upgrade is required; a client floor ahead of the server's means recovery is required; otherwise the materialization outcome is mapped to a deliverable epoch, `DISABLED`, `UPGRADE_REQUIRED`, or up-to-date.
- An integrity failure raises `OhacDeliveryIntegrityError` so the pull fails closed rather than reporting a member that would let a terminal treat a corrupt policy as current.
- The server floor is read through a new `readAcceptedFloor` on the materialization service, so the SQL is not duplicated and the read stays tenant-bound.
- `HumanAuthorizationModule` now exports the delivery service, because decision 24 puts the route in sales while the epoch read stays owned here.
- Asserted rather than assumed: the precedence itself (an unsupported schema list plus a floor needing recovery yields upgrade-required and never reads the floor), numeric floor comparison (`'9'` must not outrank `'10'`), and that `not-participating` differs from `DISABLED`.
- Evidence: OHAC suite 16 suites and 221 tests, non-mutating ESLint, Prettier, `nest build`, and `git diff --check` pass. 594 review-facing lines under the real-coverage exception.
- Process note: the delegated writer failed twice at the agent runtime before producing anything, so this unit was implemented by the parent directly.
- Open wording item for the transport slice: the design's HTTP mapping table does not name a status for an integrity failure, so the transport slice must choose one when it renders errors.

### A2b — Transport wiring for the delivery negotiation (backend)

- Status: DONE and MERGED as `17083fb5` (PR #381, issue #380).
- Adds the four optional negotiation query parameters and the optional `humanAuthorization` response member, parses the parameters through a pure module, and takes the terminal identity only from the authenticated device principal the transport guard attaches.
- Compatibility contract, asserted: an absent build omits the member entirely (legacy client); a present but empty build is an explicit upgrade status, because silence there would be indistinguishable from a legacy client; an up-to-date terminal is also silent, and a test asserts absence is not `DISABLED`.
- The pull fails closed when delivery refuses an untrusted artifact, and a test asserts the failure propagates rather than returning deltas with the member silently omitted.
- The transport integration spec's assertions were strengthened rather than weakened: they now require the third argument passed down to be the authenticated principal, which is the property decision 24 protects.
- `sales.module.ts` imports `HumanAuthorizationModule`, because the route stays in sales while the epoch read stays owned by the human-authorization module.
- Evidence: sales plus OHAC suites 35 suites and 448 tests, full unit suite 230 suites and 2133 tests, non-mutating ESLint, Prettier, `nest build`, and `git diff --check` pass. 491 review-facing lines under the real-coverage exception.
- Open item carried forward: the design's HTTP mapping table names no status for an integrity failure, so it currently surfaces as the framework's error response; choosing a deliberate status is still owed.
- Process note: the delegated writer runtime failed twice on A2a and A2b was written inline as well, because delegation was costing more than the work.

### A3 — Acknowledgement route (backend)

Delivered in two review units: A3a (pure decision, `36ab5789`) and A3b (service and route, `6a7163ab` and `42980f78`).

### A3a — Acknowledgement decision (backend)

- Status: DONE and MERGED as `36ab5789` (PR #383, issue #382).
- Adds `contracts/acknowledgement.ts`: the status and result-code vocabulary, the pure acceptance decision, and the deterministic canonical request hash.
- Decision order, which is the contract: the epoch must exist, the claimed digest must be that epoch's digest, a restatement of the accepted head is an idempotent replay, behind the head is stale, not the next expected sequence is a gap, and a chain that does not continue the accepted head is a chain mismatch.
- A gap is never accepted in either direction, and numeric sequence comparison is asserted, so a terminal at 10 is not mistaken for stale behind 9.
- The request hash deliberately excludes transport facts such as the negotiated build: they are recorded on the row, but hashing them would deny a terminal its own receipt after a build change.
- Evidence: focused spec 16 tests, OHAC suite 17 suites and 237 tests, non-mutating ESLint, Prettier, and `nest build` pass. 391 review-facing lines.

### A3b — Acknowledgement service and route (backend)

Delivered in two review units: A3b-1 (service, `6a7163ab`) and A3b-2 (route and DTO, `42980f78`).

### A3b-1 — Acknowledgement service (backend)

- Status: DONE and MERGED as `6a7163ab` (PR #386, issue #385).
- Resolves idempotency before deciding anything, comparing the request hash rather than only the key: answering a changed claim with the stored receipt would tell a terminal that something else was accepted, which is worse than a conflict.
- A rejection is recorded append-only with its stable code and never moves the floor; the tests assert that by checking the specific write was not issued, not by scanning for the table name, because the floor read still happens.
- The floor advance is a compare-and-set on the sequence the decision observed; a miss fails the transaction rather than leaving a recorded acceptance the floor does not reflect.
- A floor claiming an acceptance with no history row fails closed, since this service is the only writer that moves the floor and it does so in the same transaction as the insert.
- The receipt id is generated by the database in the record statement, so application code introduces no random source.
- Evidence: OHAC suite 18 suites and 248 tests, non-mutating ESLint, Prettier, and `nest build` pass. 837 review-facing lines under the real-coverage exception.
- Three test fixtures were wrong on the first pass and were fixed rather than worked around; the third needed the mock to support successive answers for a statement issued twice.

### A3b-2 — Acknowledgement route and DTO (backend)

- Status: DONE and MERGED as `42980f78` (PR #389, issue #388). A3 is complete.
- Exposes `POST /v1/sync/inbound/human-authorization/staff-policy/ack` under the existing device transport guard and pull scope, next to the existing fiscal acknowledgement.
- The terminal identity comes only from the authenticated principal and the tenant from the bound context; a request without a principal is refused, and a test asserts the service is never reached.
- A rejection is answered as a conflict carrying its stable code rather than a success with a rejection body, because the acknowledgement did not happen and the code is what the terminal acts on.
- A composition without OHAC answers `UNAVAILABLE` rather than succeeding, since reporting success where nothing was recorded is the worst possible answer.
- The DTO validates the canonical decimal and digest shapes at the boundary, so a malformed claim fails as a request error rather than reaching the decision as a rejection.
- Evidence: sales plus OHAC suites 37 suites and 482 tests, full unit suite 232 suites and 2171 tests, non-mutating ESLint, Prettier, and `nest build` pass. 363 review-facing lines.
- Deliberately absent: the drain gate (decision 28 puts it with the POS slice) and real-database coverage (A4).

### A4 — Real-database coverage for the delivery path (backend)

Delivered in two units: A4a (fixture extension and the materialization path, `86228729`) and A4b (acknowledgement, history, and floor, `7f2b2b38`).

### A4a — Fixture extension and epoch materialization coverage

- Status: DONE and MERGED as `86228729` (PR #391, issue #390).
- The fixture now runs the real core, recovery, observability, reset-generation, marker, and snapshot migrations plus both tenant rebinds (180910, 180911), so every OHAC tenant column is `uuid` exactly as in production; until this unit the fixture's schema no longer matched production and the delivery tables did not exist in it at all.
- Adds the materialization and acknowledgement services, and floor, epoch, and history readers, on the restricted non-bypassing DataSource; adds `seedProjectedSnapshot` (a snapshot whose payload comes from the real projector), `seedCohortPair` (an enabled cohort for an explicit POS/backend pair), and `seedAckFloor`.
- Eight new assertions: first delivery, a repeated pull, two racing pulls, per-tenant isolation, a cohort that does not match the exact pair, a build change against a frozen epoch, a corrupted payload, and an already-current terminal.
- **Findings from running against PostgreSQL:**
  - The existing publication coverage survives the rebind: the publisher, marker, and RLS tests all pass with `uuid` tenant columns, which is the first evidence the tenant-column migration did not break the paths built before it.
  - The append-only trigger refuses everyone: tampering with a stored snapshot was rejected even as the administrative superuser, which is stronger than the earlier unit's assertion over emitted SQL. The corrupted-payload test therefore seeds a row that disagrees with itself at insert time, because no update is possible.
  - The per-terminal digest is not the snapshot digest, and the test now asserts that difference; the epoch covers the terminal and the negotiated build, which the snapshot cannot contain.
  - Delivery gates on the exact `(pos_build, backend_build)` pair, while the fixture's original cohort helper seeds a fixed POS build for the publisher's backend-only lookup. Every materialization test failed with `cohort-disabled` until the explicit pair helper existed.
- Evidence: runtime suites 3 suites and 23 tests, full real-database suite 37 suites and 208 tests, non-mutating ESLint, Prettier, and `nest build` pass. 488 review-facing lines.

### A4b — Acknowledgement, history, and floor coverage (backend)

- Status: DONE and MERGED as `7f2b2b38` (PR #393, issue #392). A4 is complete, and with it the whole backend delivery path has real-database evidence.
- Eleven assertions: acceptance with its receipt and floor advance, replay from storage, an idempotency key reused with a different claim, every rejection path, the append-only trigger, the partial unique index on the accepted sequence, the floor's monotonic guard, a real race, and tenant scoping.
- **Findings from running against PostgreSQL:**
  - The append-only trigger refuses an administrator: both an update and a delete of the acknowledgement history were rejected connecting as the administrative superuser, which is stronger than the earlier unit's assertion over emitted SQL.
  - The partial unique index is the real guarantee behind "one accepted acknowledgement per sequence": the service cannot produce the state, so it is provoked directly and the index refuses it by name.
  - The floor's monotonic guard is real as well; a direct regression was refused.
  - A race with two different keys and the same claim leaves exactly one accepted row and one floor position.
  - **A design assumption was corrected:** a gap cannot be provoked by skipping ahead alone, because the epoch-existence rule is checked first and answers `UNKNOWN_EPOCH`. Isolating the gap required seeding an epoch at a sequence the terminal is not yet owed.
- Evidence: runtime suites 4 suites and 34 tests, full real-database suite 38 suites and 219 tests, non-mutating ESLint, Prettier, and `nest build` pass. 378 review-facing lines.
- Fixture addition: `seedEpoch`, for the states the delivery path itself cannot produce.

### B — POS half (sibling phase, not in this phase)

- Tracked in `odd/tasks/ohac-pos.md`, never here. B1a (local epoch storage and the Floor migration) is merged as `ee305224`; B1b (the DAOs), B2 (the candidate state machine, the pull's `humanAuthorization` consumption, and the acknowledgement client), and B3 (the drain gate with its outbox registration coupler, the blocked `ACK_SUBMITTING` transition, the `OHAC_ACK_DEFERRED_OUTBOX` reason, its bounded retries and its quarantine) follow.
- Cohort enablement stays impossible until this half exists.

### C — Administrative PIN-attempt reset (own issue)

- The writer for `attempt_reset_generation` required by decision 14. Out of scope here and tracked separately so it is not silently absorbed.

## Evidence

- Reconnaissance on `main` at `98e1926`: the pull path, device principal, ack and recovery schemas, assertion contract, POS state, and the test blast radius.
- Merged publisher half: `df81abc`, `293b4c2`, `67427d3`, `fa00852`, `2cd59a6`, `a711002`, `3f18957`, `379f387`.
- Merged delivery authority: `98e1926` (PR #340, issue #339).
