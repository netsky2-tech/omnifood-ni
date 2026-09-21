# Terminal Enrollment Path (L1)

## Objective

Close limitation **L1** so that a freshly provisioned terminal can be enrolled by a human and obtain a device-sync credential usable by `/v1/sync/*`, end to end, through production code paths only.

## Problem

The founder-pilot ONB1.10F acceptance closed as PASS under `fp-acceptance-6b15d8a`, but it deliberately excluded `/v1/sync/*` device transport. L1 records why: no production path creates or finalizes an `ActivationAttempt`, and a freshly built APK cannot match the seeded terminal id. DSI cutover precondition 2 is therefore NOT SATISFIED.

## Why

Without enrollment the platform cannot bring a real terminal online, so the first business cannot be operated even though the activation lifecycle itself is proven. L1 is the root blocker: #314 (mixed sync transport) shares the same credential apparatus and is sequenced after this work.

## Scope

- Provision the canonical terminal id at build time.
- Let a human authorize and create the activation attempt from the owner dashboard.
- Wire the existing POS activation runners into a production entry point so device-observed checks run and the attempt finalizes.
- Confirm at runtime that the credential provisions, renews, and is accepted by `/v1/sync/*`.
- Correct the stale acceptance and cutover claims that this work invalidates.

## Non-goals

- Fixing #314 (mixed sync transport). Separate feature, next in sequence.
- Implementing DSI-6 credit-note authorization or completing OHAC. Credit notes stay a tracked, deliberately deprioritised gap.
- Redesigning the activation lifecycle or its ten checks.
- Reconstructing the 5/5 cohort, consumed targets, or the ADB tunnel.

## Constraints

- Offline-first: local SQLite remains the POS source of truth. Enrollment is an online, trust-establishing act; selling is not.
- The device must not authorize itself: a human in the back office authorizes the terminal; the device observes and reports.
- Tenant RLS must run under a `NOBYPASSRLS` runtime role.
- DGI documents remain immutable; cancellation uses `is_canceled`, never deletion.
- Multi-tenant: no behaviour may be hard-coded to the first client's scenario.
- Raw issuer RUC, PINs, secrets and credentials never enter repository artifacts.
- TDD mode: strict, from `openspec/config.yaml`. Backend runner `npm test`; POS runner `flutter test`.
- Review budget: approximately 400 authored changed lines per slice.

## Delivery and verification

- Delivery strategy: `stacked-to-main`, one work unit per slice, each PR carrying only its own diff.
- Work-unit commits on this feature branch; push and pull request remain the user's decisions.
- Documentation slices use structural checks, readback and grep; code slices use focused tests plus `flutter analyze` or the backend suite as applicable.
- Runtime confirmation requires the physical device and a freshly provisioned target; it is the only slice that cannot be verified from the repository.

## Tasks

### L1-01 — Correct the stale claims this work builds on

Status: complete pending work-unit commit.

- [x] Fix `AP_KNOWN_LIMITATIONS.md`: stale `activation.service.ts` citation range, the `count-sessions` guard claim, the `alerts/{id}/lifecycle` 401 claim that is actually a missing route, and guard line drift.
- [x] Fix the `device-sync-cutover-decision.md` addendum claim that the credit-note inventory is not recorded.
- [x] Fix the `founder-pilot-acceptance-freeze.md` "only caller in the repository" overstatement.
- [x] File the security issue for the unguarded inventory routes found during verification.

Acceptance criteria:
- Every corrected claim matches current `main` code with a valid `file:line` citation.
- No new claim is introduced without evidence.
- The unguarded-route finding is tracked where it can be scheduled independently of L1.

Checks:
- Readback of each cited line.
- `grep` for the removed claims.
- `git diff --check`.

Evidence: corrections applied and verified from scratch by the parent. `AP_KNOWN_LIMITATIONS.md` now cites the real resolver (`activation.service.ts:1489-1527`, `resolveLatestFinalizedAttemptForDevice`), records that `/inventory/count-sessions` is unauthenticated rather than 401 and that `GetTenantId` therefore passes `tenantId: undefined`, records that `/inventory/alerts/{id}/lifecycle` has no backend route and returns 404 (removal inferred, not verified), and fixes two guard line citations (`sync-transport.guard.ts:49`, `sync-credit-note-auth.guard.ts:49-53`). The cutover addendum keeps the accepted-decision text and adds a dated correction stating the credit-note inventory was completed on 2026-09-17/18 with zero pending notes, leaving the announcement and manual procedure for precondition 3. The freeze record keeps its historical bullet and gains one dated correction naming the five construction sites of `ActivationReconnectSyncRunner`. Security finding tracked as issue #445. Changed lines: 12 insertions, 4 deletions across three files. Runtime harness: N/A, documentation-only slice.

### L1-02 — Provision the canonical terminal id at build time

Status: pending

- [ ] Accept a per-terminal `DEVICE_ID` dart-define in `scripts/build_sunmi_apk.sh`.
- [ ] Fail the build when the define is absent for a pilot build rather than silently installing an app that resolves to `pos-local-<uuid>`.
- [ ] Keep `TerminalIdentityService` precedence unchanged: build define, then persisted value, then generated id.

Acceptance criteria:
- A pilot APK built through the script carries the intended canonical terminal id.
- The script refuses an unlabeled build instead of producing a terminal that cannot match its attempt.
- Existing identity precedence tests still pass.

Checks:
- Focused Flutter tests for terminal identity.
- Script dry run showing the define is present in the produced command.
- `git diff --check`.

Evidence: pending.

### L1-03 — Let the terminal show who it is

Status: pending

- [ ] Add a read-only POS surface that displays the canonical terminal id so an operator can register it in the back office.
- [ ] Do not add activation state, attempt creation, or credential logic to the POS in this slice.

Acceptance criteria:
- The displayed value is exactly the id the activation attempt must carry.
- The surface is read-only and does not mutate configuration.

Checks:
- Focused widget test.
- `flutter analyze`.

Evidence: pending.

### L1-04 — Authorize and create the attempt from the owner dashboard

Status: pending

- [ ] Add the activation client calls to the dashboard onboarding API layer.
- [ ] Add a setup-center action that creates the attempt for a given terminal id with an idempotency key, respecting `ONBOARDING_ACTIVATION_MANAGE`.
- [ ] Surface the attempt state, including the awaiting-device-checks state.

Acceptance criteria:
- An OWNER can create an attempt for a terminal id from the back office.
- The action is idempotent and permission-gated.
- No device-observed check is fabricated by the dashboard.

Checks:
- Dashboard tests for the new surface and the permission gate.
- Backend permission enforcement readback.

Evidence: pending.

### L1-05 — Run the checks and finalize from the POS

Status: pending

- [ ] Construct the existing activation runners in production wiring, gated by an active attempt for this terminal.
- [ ] Ensure a finalize attempt reaches `PASS` or `PASS_WITH_WARNING` and publishes the outbox drain on reconnect.
- [ ] Preserve fail-closed behaviour when a check fails.

Acceptance criteria:
- A production code path creates checks and finalizes the attempt; the runners stop being test-only.
- A FAIL blocks activation and is reported, not swallowed.
- Offline selling continues to work while activation is pending.

Checks:
- Focused POS tests for the wiring and the fail-closed branch.
- `flutter analyze`.
- Backend confirmation that an attempt reaches a final status.

Evidence: pending.

### L1-06 — Confirm the credential at runtime on the device

Status: pending

- [ ] Provision a fresh tenant and terminal, build with the canonical `DEVICE_ID`, and enroll end to end on the physical Q80.
- [ ] Confirm the device-sync credential provisions, confirms, and renews.
- [ ] Confirm `/v1/sync/*` accepts the device token and rejects a non-device token.
- [ ] Record the result as DSI cutover precondition 2 evidence.

Acceptance criteria:
- A freshly built APK obtains and uses a device credential without manual database intervention.
- The evidence is recorded against one release identity.
- No fabricated observation; uncaptured fields are declared.

Checks:
- Physical run on the Q80 with a fresh target.
- Backend status queries for the attempt and the credential.
- Negative check that a human token is rejected on `/v1/sync/*`.

Evidence: pending.

## Dependencies

- L1-02 before L1-06.
- L1-04 before L1-05 in review order; either may be developed first.
- L1-01 is independent and first.

## Progress

- Feature opened after independent verification of `main` at `9cef7ce` corrected the earlier assessment: the credential provisioning half is already production-wired, the three activation runners exist but are constructed only in tests, the owner dashboard has no enrollment surface, and the build script passes no `DEVICE_ID`.
- Frozen plan approved by the founder: dashboard authorizes and creates, POS observes and finalizes, build defines the terminal id, recovery remains an exceptional ops path.

## Next step

Execute L1-01, then L1-02.
