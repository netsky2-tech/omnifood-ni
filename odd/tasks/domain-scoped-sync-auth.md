# Domain-Scoped Sync Authentication Failures

## Objective

Fix issue #473 so a 401/403 blocks only the failing POS sync domain while independent later domains still run during the same pass.

## Problem

`SyncService._runDomain` sets a pass-global `_authBlocked` flag after a domain receives an authentication or authorization failure. Every later `_runDomain` call returns immediately when that flag is set, so one route-specific failure suppresses unrelated domains. Because recipe synchronization runs before sales, a recipe 401 can prevent the device-authoritative sales batch from being attempted.

## Decision

Founder decision, 2026-09-21: authentication failures are domain-scoped. Record the failing domain and reason, keep the pass partial/error, and continue attempting independent domains.

The existing aggregate `_authBlocked` and `_syncBlockedReason` remain as pass observability. The final error must retain the existing reauthentication/revocation message and include the per-domain error details already collected by the pass, rather than discarding them. A new persistent domain-state model is unnecessary for this fix.

## Why

The background pass uses one device-only Dio, not a human cloud session. A route-specific 401/403 can represent a scope or transport mismatch rather than universal credential invalidity. Device revocation already fails fast through the credential coordinator. Continuing independent domains preserves offline-first delivery without granting new authority or crossing credential classes.

## Scope

- Remove the pass-wide short circuit that skips later domains after the first auth failure.
- Preserve auth/revocation observability and partial/error pass status.
- Surface the failing domain and reason through the existing per-domain error aggregation.
- Add strict-TDD coverage for recipe 401 followed by successful sales synchronization and for no false success/marking.

## Non-goals

- Reordering recipe and sales domains; recipe remains first because backend invoice validation depends on recipe versions.
- Changing device credential issuance, renewal, revocation, scopes, or route allowlists.
- Introducing human-session transport into background sync.
- Redesigning retry/backoff or creating persistent per-domain auth state.

## Constraints

- Offline-first: one failing domain must not suppress unrelated queued documents.
- Auth failures must not mark the failing domain's outbox rows synced or permanently failed.
- A pass with any failed domain remains partial and exposes `CloudSyncStatus.error`.
- Existing `Reautenticación requerida` and `DEVICE_REVOKED` observability contracts remain recognizable.
- Strict TDD from `openspec/config.yaml`.
- Runner: Flutter tests and analyzer under `apps/pos_app`.
- Delivery strategy: `ask-on-risk`; forecast approximately 70–130 authored changed lines, below the advisory 400-line threshold.

## Route and delegation

- DA-01: delegated direct writer. Trigger: production behavior plus non-trivial test changes span multiple files.
- Verification: writer self-verification followed by native risk assessment and the returned independent-verification plan.

## Tasks

### DA-01 — Continue independent sync domains after auth failure

Status: complete — implementation and independent verification complete; uncommitted pending founder delivery authorization.

- [x] Observe RED for recipe 401 suppressing a later successful sales batch.
- [x] Remove only the pass-wide auth short circuit; preserve per-domain error handling.
- [x] Preserve partial/error status, auth reason, and failing-domain diagnostics.
- [x] Prove the auth-failed outbox remains pending and the successful later domain is marked synced.
- [x] Keep domain ordering and device transport unchanged.
- [x] Observe GREEN focused tests and analyzer; run the full Flutter suite and classify its unrelated loader-only failure with an isolated GREEN rerun.
- [x] Reconcile verification and publication state.

## Acceptance criteria

- A recipe 401/403 does not prevent the later sales batch from being attempted and completed.
- Later independent domains continue after any earlier domain auth failure.
- The failed domain remains pending and is not marked synced or failed by auth handling.
- The pass result remains partial/error and identifies both the auth requirement and the failed domain.
- Device revocation remains visible and no human credential is introduced.
- Recipe-before-sales ordering remains unchanged.

## Verification evidence

Writer strict RED/GREEN evidence:

- RED: the new recipe-401-then-sales scenario failed because `lastSyncError` omitted `Recetas`; the pre-fix pass-wide short circuit also prevented the later sales `markAsSynced` expectation.
- GREEN: 7/7 in the device-transport file and 63/63 across the three focused sync files.
- Focused behavior proves recipe remains neither synced nor permanently failed while the later sales aggregate is marked synced, the pass remains partial/error, and `AUTH_BLOCKED` plus domain diagnostics remain visible.
- `flutter analyze`: no issues. `git diff --check`: clean.
- Writer full-suite run reached 1922 passing tests but reported two random `flutter_tester` WebSocket loader failures in unrelated files; both failed files passed in isolation (8/8).

Independent verification (required because native assessment was unavailable):

- Focused sync files: 63/63 passed.
- Fresh full Flutter suite executed 1919 tests and had one load-time `flutter_tester` WebSocket failure in unrelated `activation_reconnect_sync_runner_test.dart`; that exact file then passed 11/11 in isolation. The verifier classified it as the same loader-only environmental flake, not an implementation failure.
- `flutter analyze`: no issues. `git diff --check`: clean.
- Code inspection confirmed unchanged recipe-before-sales ordering, unchanged device credential allowlist/revocation boundary, no false recipe marking, and preserved AUTH_BLOCKED/DEVICE_REVOKED message contracts.
- No implementation defects found. Informationally, request ordering remains established by unchanged code rather than a direct test assertion.

Parent spot check:

- Re-ran `flutter test test/data/services/sync_service_device_transport_test.dart`: 7/7 passed.

## Progress

- 2026-09-21: Issue #473 decision recorded and issue approved with `status:approved` and `type:bug`.
- 2026-09-21: Read-only mapping confirmed the cascade is the `_runDomain` early return, all domains use device-only `syncDio`, and recipe ordering must remain unchanged.
- 2026-09-21: Branch `fix/domain-scoped-sync-auth` created from clean `main` at `eff6b15`.
- 2026-09-21: DA-01 implementation completed uncommitted in the two authorized POS files at 76 authored changed lines. Focused tests and analyzer passed; full-suite loader flakes were isolated to unrelated files that pass alone.
- 2026-09-21: Native risk assessment returned unavailable/empty, so high-risk independent verification reran focused tests, full Flutter tests, analyzer, and whitespace checks.
- 2026-09-21: Independent verification found no implementation defects. Its full suite reproduced one unrelated loader-only WebSocket failure; the exact file passed 11/11 in isolation. Parent focused spot check passed 7/7.

## Next step

Await founder authorization to create the work-unit commit and publish a PR closing issue #473.
