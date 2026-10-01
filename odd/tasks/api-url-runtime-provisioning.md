# API URL Runtime Provisioning

## Objective

Make the POS backend URL resolvable at runtime on the device, so ONE built artifact can
serve any environment, instead of every build being pinned to a single backend.

This is the prerequisite for distributing a terminal at all: today every artifact is
compiled against one URL, and the fleet path the packaging script advertises does not exist.

## Problem

`apps/pos_app/lib/main.dart:129-132` resolves the backend URL at COMPILE time:

```dart
const String baseUrl = String.fromEnvironment(
  'API_URL',
  defaultValue: 'http://127.0.0.1:3000/api',
);
```

That value builds **six** Dio clients (`main.dart` — app, refresh, claim, device-sync
exchange, sync). Verified by grep: the only other place `baseUrl` is touched in all of
`lib/` is `cloud_auth_interceptor.dart:58`, which only normalizes a trailing slash.

Consequences, both verified:

1. **A fleet build cannot reach anything.** `scripts/build_pos_apk.sh` comments that fleet
   builds omit `--api-url` and "the terminal is provisioned at runtime", and
   `build_pos_apk.sh` records `api_url: provisioned-at-runtime` in its manifest. That path
   does not exist in the POS code: a fleet build installs and silently attempts
   `127.0.0.1:3000` — itself.
2. **One artifact cannot serve two environments.** Each backend means a distinct APK. For a
   future OTA channel that is a live hazard: pushing the wrong-environment artifact breaks a
   terminal that may be physically unreachable, and with an identical signing key the
   install succeeds, so the failure is silent.

DEC-6 deferred this out of Phase 0 and recorded exactly this consequence.

## Why

Terminal distribution is the goal, and this is its first hard dependency. Without it there
is no single artifact to distribute, no fleet enrollment story, and no safe OTA target.
Unlike the keystore (an operator action) and MDM enrollment (needs the physical device),
this is the one blocker on the critical path that is entirely ours to close.

## Scope

- A resolver that reads the backend URL from `local_configs`, falling back to the
  build-time `API_URL` define.
- Wiring all six Dio clients to the resolved value.
- A way for an operator to SET the URL on the device, with validation.
- Tests covering resolution order, validation, persistence and the fallback.
- Making the packaging script's fleet claim true, or removing the claim.

## Non-goals

- The OTA channel itself: manifest serving, download, verification, install.
- The APK install path (`REQUEST_INSTALL_PACKAGES`, FileProvider).
- MDM enrollment or the device-owner window. Requires the physical device.
- Removing `android:usesCleartextTraffic="true"`.
- Live re-resolution without an app restart. See the design decision below.

## Design decisions

**Storage.** A new `local_configs` key, `api_base_url`. The DAO already offers
`getConfigByKey` / `saveConfig` / `deleteConfig`, and `TerminalIdentityService` is the
existing precedent for exactly this pattern (read by key, persist on first use).

**Resolution order.** Persisted `api_base_url` → build-time `API_URL` define → the existing
development default. First value wins.

**A release build must not silently use the localhost default.** A fleet artifact with no
configured URL currently attempts `127.0.0.1:3000` — itself — and fails as a network error,
which reads as "the server is down" rather than "this device was never configured". That is
the same silent-wrong-default class this feature exists to remove. Proposed rule: when the
app runs in release mode with neither a persisted value nor a build-time define, surface an
explicit "server not configured" state instead of pretending localhost is a backend. The
debug default stays, so local development is unaffected.

**A missing URL must never block a sale.** Local SQLite is the source of truth and the POS
is offline-first. An unconfigured or unreachable server blocks sync and must say so; it must
not block the sale path, the DGI numbering, or any fiscal operation. This constraint governs
every placement choice in this feature.

**Resolve at startup, not per request.** The six clients are built once in `main.dart` and
passed down. A URL change takes effect on the next app start, and the UI must say that
plainly rather than implying it applies immediately. Upgrading to per-request resolution
through an interceptor is a deliberate later step, not part of this slice: it would touch
the pre-auth `claimDio`, which is deliberately built as a bare Dio with no interceptors.

## Constraints

- Do not break the offline sale path. The offline phase is asserted in the existing
  integration test by counting HTTP requests; it must stay at zero.
- Do not make any fiscal or numbering path depend on network configuration.
- Do not introduce a second source of truth for the URL: the persisted value and the build
  define are the only two, plus the documented development default.
- Validate what an operator can type: an absolute `http://` or `https://` URL with a
  non-empty host, mirroring `validate_api_url` in `scripts/build_pos_apk.sh`.
- Artifact language: English. Conversation language does not apply to repository files.
- TDD mode: strict, from `openspec/config.yaml`. POS runner `flutter test`; lint
  `flutter analyze`.

## Delivery and verification

- Delivery strategy: work-unit commits on `feat/api-url-runtime-provisioning`, branched from
  `origin/main` at `8d8455f6` after PR #750 merged.
- Review budget: approximately 400 authored changed lines per work unit.
- Verification: `flutter test` for the new service and its wiring, `flutter analyze` for the
  Dart surface, and a focused check that the six Dio clients receive the resolved value
  rather than the compile-time constant.
- The offline assertion must be re-run, not assumed: a regression here breaks the core
  promise of the product.

## Tasks

### S1-01 — The resolver service

Status: done

- [ ] Add a service resolving the backend URL as: persisted `api_base_url` → build-time
      `API_URL` define → development default.
- [ ] Add save and clear operations, with validation of an absolute `http(s)` URL and a
      non-empty host.
- [ ] Under the proposed rule, make a release build with no configured value report an
      explicit unconfigured state rather than falling through to localhost.
- [ ] Unit tests: resolution order, each fallback, validation rejections, persistence, and
      the release-mode rule.

### S1-02 — Wire the six Dio clients

Status: done

- [ ] Resolve the URL once at startup and build every Dio client from it, replacing the
      compile-time constant.
- [ ] Keep `claimDio` free of interceptors, as its own comment requires; give it the
      resolved URL at construction only.
- [ ] Make `scripts/build_pos_apk.sh`'s fleet claim true, or remove the claim. A comment
      that advertises a path that does not exist is the defect being fixed here.
- [ ] Verify with a focused test that a persisted URL wins over the build define.

### S1-03 — Let an operator set it

Status: done

- [ ] Add a server URL field to the terminal configuration surface, validated with the same
      rule as the service.
- [ ] State plainly in the UI that a change applies after restarting the app.
- [ ] Show the current effective source (persisted, build define, or unconfigured) so an
      operator can tell which one is in force.
- [ ] Widget tests for the field: valid accept, invalid reject, persisted value shown.

## Evidence log

### S1-03 and the localization follow-up

Commit `6b270c00` — structured rejection reason on the service. Commit
`7b270c00`..`7b6a5473` — the operator card.

The worker reported one risk honestly: rejection copy mixed Spanish framing
around the service's English message, producing
`No se pudo guardar la URL: Invalid API URL: value is empty.` That is a real
defect on a Spanish-only screen, not a cosmetic preference. Rather than
translating the service message — which would break the contract mirrored from
`validate_api_url` in `scripts/build_pos_apk.sh` — the service now carries a
machine-readable reason (`empty`, `whitespace`, `notAbsolute`) alongside the
English message, and the view model renders Spanish from the reason. The
English text stays for logs and for the script mirror.

This follow-up was done with strict TDD observed:

- **RED captured:** `00:01 +6 -1` after changing the widget assertion to require
  Spanish copy and assert the English string does NOT leak.
- **GREEN observed:** `00:02 +51: All tests passed!` once the reason codes and
  Spanish mapping were in place.
- Six new service tests pin the reason contract, including that the English
  message is preserved.

A note on the edit itself: one replacement initially corrupted
`clearServerUrl` by overwriting its `catch` block with a method body. Caught by
`flutter analyze` and the widget suite before commit, and repaired. Reported
here because "the parent edited it" is not otherwise visible in the worker's
handoff.

### Verification observed (final, all four slices)

- `flutter test` over the service, wiring, new widget card, and both pre-existing
  identity suites — **51/51 passing**.
- `flutter analyze` — **No issues found**, after every change above.
- `git status --porcelain` clean; four commits on the branch, tree matches HEAD.

### Re-rebased onto `8e376dda`, and the PR supersession

After other sessions landed 27 commits on `main` (`9cdbc026` → `8e376dda`), the
branch was rebased again. Overlap check: 8 files on this feature against 57 files
touched by those 27 commits — **zero intersection**, and the rebase applied
cleanly with no manual resolution.

Verified independently that this feature is still required and not duplicated:
`origin/main` still resolves the backend URL at compile time
(`main.dart:129-132`, `String.fromEnvironment('API_URL')` with the localhost
default), and `git grep` for `api_base_url` / `ApiBaseUrlService` in `origin/main`
returns nothing. No other session solved this.

**PR supersession.** Updating PR #755 to the rebased history required a
force-push that rewrites published history. The local safety policy declined it
twice — including after the founder said "procede" in conversation, because the
policy is enforced at the tool layer and a chat approval is not its authorization
mechanism. Rather than work around it, the goal was met non-destructively:
the rebased commits were pushed to `feat/api-url-runtime-provisioning-v2` as
**PR #762**, and #755 was closed with a comment recording the tested commit
(`c6a751a3`) and the reason. The old remote branch
`feat/api-url-runtime-provisioning` remains behind — GitHub could not delete it
because this worktree has it checked out. Harmless, but it is dangling.

### Verification observed (post-rebase onto `8e376dda`, all re-run)

Not inherited from the earlier run — every number below was measured against the
rebased tree in the same session.

- Slice + both pre-existing identity suites: **51/51 passing**.
- `flutter analyze`: **No issues found**.
- Full POS suite on this branch: **2764 passing, 3 failing**.
- Full POS suite on plain `origin/main` as a **baseline control**, same session:
  **2727 passing, 2 failing**. The failures predate this branch, so this feature
  adds 37 tests and regresses nothing.
- Backend `jest` on `main`: **3402 passing, 8 skipped**. Measured as a control
  for the founder's revalidation request; this branch touches no backend code.
- All POS failures re-run with `--concurrency=1`: **31/31 passing**.

The load failures name a **different file each run** —
`auth_repository_production_composition`, `sunmi_v2s_responsive_sale_view` and
`customer_identification` on this branch, `sync_service_reconnect` on plain
`main`. That rotation, with `Unable to connect to flutter_tester process:
WebSocketException` as the cause, is the signature of runner contention. The
fourth is the timing-sensitive `LocalNetworkTerminalAdapter checkStatus` socket
test. Neither class is attributable to this change.

### Corrections issued to the founder during this revalidation

- The PR was reported as **#751**; it is **#755** (now #762), and it was still
  open. #751 is a different, already-merged PR from another session.
- G4 (`saveProductOptions` transaction) was recommended as the next task and had
  already been delivered by another session in **#760**. Caught only because the
  founder asked for a full revalidation.
- The claim that the runtime URL blocked the single-terminal pilot was wrong:
  `--pilot` already requires and bakes `--api-url`, failing closed without it.
  What this feature unblocks is fleet distribution and the OTA path.

### Branch and delivery

Branched from `origin/main` at `8d8455f6` (after PR #750 merged). Rebased onto
`origin/main` at `9cdbc026` after PR #749 landed; `git diff --name-only` showed
zero overlap with the four files in this slice, and the rebase applied cleanly.

Work-unit commits:

- `ae12c1c3` — `feat(pos): resolve the backend URL at runtime, not only at compile time`
  (S1-01: `ApiBaseUrlService` plus resolution, persistence and validation tests).
  Committed with the wiring test group temporarily split out so the commit is
  independently green: 16/16 passing on its own.
- `e59512fa` — `feat(pos): build the Dio clients from the runtime-resolved backend URL`
  (S1-02: startup resolution, `PosDioClients`, the `build_pos_apk.sh` fleet
  corrections, and the wiring test group).

### Verification observed

- `flutter test test/data/services/api_base_url_service_test.dart` — **19/19
  passing**, re-run after the rebase onto `9cdbc026`.
- `flutter analyze` — **No issues found**, re-run after the rebase.
- `flutter test test/integration/activation_offline_sale_e2e_test.dart` —
  **passing**, so the offline sale lifecycle with real SQLite persistence still
  survives a crash before reconnect.
- Full suite `flutter test` — 2662 passing, 2 failing, both reclassified as
  runner flakes (see below).

### The full-suite failures are flakes, not regressions

Two distinct classes, both proven by isolation:

1. `Failed to load ...: Unable to connect to flutter_tester process:
   WebSocketException: Invalid WebSocket upgrade request` — the test runner
   failing to attach, under parallel load. Not an assertion.
2. `LocalNetworkTerminalAdapter Socket Tests checkStatus reports transient
   error when STATUS answer times out` — expects `TerminalStatus.error`, got
   `TerminalStatus.offline`. A timing-sensitive hardware-socket test.

Re-running both offending files plus the socket suite with
`--concurrency=1` gives **21/21 passing**. The same files also failed to load
once on a clean `origin/main` checkout with `WebSocketException`, so the
failures are environmental and predate this change.

### Honest limits of this evidence

- The offline e2e test **does not exercise `main()`**: it builds its own
  dependency graph. It proves nothing regressed there; it does not prove the
  startup wiring is correct. That is covered by the `PosDioClients` tests, which
  construct the real clients from the real resolution path.
- **Strict TDD RED was not captured for S1-01/S1-02.** The delegated worker
  completed the implementation and failed before reporting, so the RED output
  was never recorded. GREEN is observed and attributed; the missing RED is a
  process gap, not a passing check.
- `main()` itself has no test coverage and never had. The extracted
  `resolveStartupTransport` and `PosDioClients` are covered directly; the
  remaining `main()` body is not.
- No verification on physical Android hardware, consistent with the residual
  recorded for PR #750.
- **No native review receipt for this branch.** The change is delivered on the
  same footing as PR #750: tested and documented, but not reviewed by a closed
  review authority. If a delivery gate requires a receipt, this does not
  provide one.
- The widget suite needed `ensureVisible` because the card sits below the fold
  on a test viewport. No behavioral implication, but it means the card's layout
  on the real Q80 screen is unverified.
