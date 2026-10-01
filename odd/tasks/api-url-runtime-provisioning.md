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

Status: pending

- [ ] Add a service resolving the backend URL as: persisted `api_base_url` → build-time
      `API_URL` define → development default.
- [ ] Add save and clear operations, with validation of an absolute `http(s)` URL and a
      non-empty host.
- [ ] Under the proposed rule, make a release build with no configured value report an
      explicit unconfigured state rather than falling through to localhost.
- [ ] Unit tests: resolution order, each fallback, validation rejections, persistence, and
      the release-mode rule.

### S1-02 — Wire the six Dio clients

Status: pending

- [ ] Resolve the URL once at startup and build every Dio client from it, replacing the
      compile-time constant.
- [ ] Keep `claimDio` free of interceptors, as its own comment requires; give it the
      resolved URL at construction only.
- [ ] Make `scripts/build_pos_apk.sh`'s fleet claim true, or remove the claim. A comment
      that advertises a path that does not exist is the defect being fixed here.
- [ ] Verify with a focused test that a persisted URL wins over the build define.

### S1-03 — Let an operator set it

Status: pending

- [ ] Add a server URL field to the terminal configuration surface, validated with the same
      rule as the service.
- [ ] State plainly in the UI that a change applies after restarting the app.
- [ ] Show the current effective source (persisted, build define, or unconfigured) so an
      operator can tell which one is in force.
- [ ] Widget tests for the field: valid accept, invalid reject, persisted value shown.

## Evidence log

Appended as work units close.
