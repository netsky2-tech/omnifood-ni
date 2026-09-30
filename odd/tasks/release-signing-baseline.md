# Release Signing Baseline (Phase 0)

## Objective

Close the two irreversible distribution prerequisites for the SOHO POS terminal before
any fleet artifact is produced: a stable, custody-protected release signing key, and an
explicit enrollment decision for the Android device-owner window.

This is Phase 0 of the terminal distribution plan. It ships **no** OTA channel. It
removes the two failure modes that cannot be repaired once the terminal leaves the
workshop.

## Problem

`apps/pos_app/android/app/build.gradle.kts` silently falls back to the **debug keystore**
when `apps/pos_app/android/key.properties` is absent:

```kotlin
} else {
    // Fallback to debug keystore for development / testing builds
    val debugConfig = signingConfigs.getByName("debug")
    keyAlias = debugConfig.keyAlias
    ...
}
```

Nothing warns. A `release` build therefore yields a debug-signed APK without any signal
to the operator. Android's in-place update requires an identical signing key, so the
first OTA update built from a differently-signed artifact fails with
`INSTALL_FAILED_UPDATE_INCOMPATIBLE`. The terminal has no physical access, so that
failure is unrecoverable in the field — the device must be recovered by hand.

Secondary: the keystore custody guard is scoped to `apps/pos_app/android/` only.
Verified empirically with `git check-ignore`, not by reading patterns:

| Path | Ignored |
|---|---|
| `apps/pos_app/android/key.properties` | yes — `apps/pos_app/android/.gitignore:12` |
| `apps/pos_app/android/upload-keystore.jks` | yes — `apps/pos_app/android/.gitignore:14` |
| `upload-keystore.jks` (repo root) | **no — committable** |
| `scripts/upload-keystore.jks` | **no — committable** |
| `apps/pos_app/upload-keystore.jks` | **no — committable** |

The root `.gitignore` carries no keystore rule at all, and
`scripts/key.properties.example` itself suggests
`storeFile=/path/to/your/upload-keystore.jks`. No keystore, `key.properties`, or `.p12`
exists in the working tree or anywhere in git history today, so the gap is still latent.
It activates the moment the key is generated, which is this feature.

## Why

The signing key is the single most irreversible artifact of the whole distribution plan.
Losing it, or shipping an artifact signed with the wrong key, permanently blocks the
update channel for every device already in the field. Every other Phase 2 concern (OTA
endpoint, manifest, verification) can be built later; this one cannot be repaired after
the fact.

The custody gap compounds it: the key is about to exist for the first time, and the repo
guard does not cover the paths where it will naturally be placed.

## Scope

- Root-level `.gitignore` rules that make keystore material non-committable from any path
  in the repository.
- Fail-closed release signing: a `release` build with no keystore and no explicit opt-in
  must fail loudly with an actionable message, rather than silently degrading to the debug
  key.
- An explicit, single-purpose opt-in (`--allow-debug-signing`, threaded to Gradle as a
  project property) that preserves the existing packaging-pipeline test path.
- Interactive keystore provisioning tooling that never places a password in argv, shell
  history, or the repository.
- A custody and provisioning runbook: key generation, backup, custody location, and the
  MDM device-owner enrollment window.
- Register the three Phase 0 decisions in `odd/tasks/go-live-decisions.md`.

## Non-goals

- Building the OTA channel (endpoint, manifest serving, download, verification, install).
  That is Phase 2.
- Moving `API_URL` from compile time to runtime provisioning. Explicitly deferred by the
  founder in the Phase 0 scope decision; it remains a known blocker for a single-artifact
  fleet build and is tracked separately.
- Writing a custom Android DPC. The device-owner role is delegated to a self-hosted MDM
  (Headwind), so no `DeviceAdminReceiver` or policy code is added here.
- Removing `android:usesCleartextTraffic="true"`, which is a Phase 2 concern for the
  update channel. Recorded here so it is not forgotten.
- Generating the keystore itself. Key generation is an operator action that requires
  chosen passwords; this feature ships the tooling and the runbook, not the secret.

## Constraints

- Never commit signing material. No password, alias, or keystore path leaves the operator
  machine.
- The default must fail closed. Silent degradation is the defect being fixed, so the opt-in
  must be explicit, named, and loud.
- The `debug` build type and non-release Android paths must keep working without a release
  keystore. Only the release path fails closed.
- `scripts/test_packaging_pipeline.sh` must stay green; it builds a real APK with
  `--skip-tests` and no keystore (`:54`). It becomes the explicit opt-in consumer.
- No existing tracked file may be affected by the new ignore rules. Verified before the
  change: `git ls-files` matches nothing for `*.jks`, `*.keystore`, `*.p12`, or
  `key.properties`.
- Artifact language: English. Conversation language does not apply to repository files.
- TDD mode: strict, from `openspec/config.yaml`.

## Delivery and verification

- Delivery strategy: work-unit commits on `feat/release-signing-baseline`, branched from
  `origin/main` (the checkout was detached at `origin/main` when this feature opened).
- Review budget: approximately 400 authored changed lines per work unit.
- Verification runners:
  - Packaging pipeline: `scripts/test_packaging_pipeline.sh` (the existing suite for
    `build_pos_apk.sh`; it covers plan mode, argument validation, and a real split-per-abi
    build).
  - Gradle/Android configuration: a configuration-only invocation plus a genuine release
    build when the Android SDK is present (`ANDROID_HOME=/home/octavio_morales/Android/Sdk`).
  - `flutter analyze` for any Dart surface. This feature is expected to touch no Dart.
- Strict TDD note, recorded honestly: the Gradle Kotlin DSL signing block cannot be
  unit-tested with `flutter test`. The behavioral contract is therefore asserted through
  the packaging pipeline suite — a negative check that a release build without a keystore
  and without the opt-in fails with the expected message, and a positive check that the
  opt-in path still builds. This is a documented deviation from strict TDD, caused by the
  verification surface rather than by convenience.
- Runtime confirmation on a physical device is not required by this feature; it belongs to
  the MDM enrollment step, which is an operator action covered by the runbook.

## Tasks

### S0-01 — Secret hygiene and fail-closed release signing

Status: pending

Closes both defects above.

- [ ] Add root `.gitignore` rules covering `*.jks`, `*.keystore`, `*.p12`, and
      `key.properties` at any depth, with a comment pointing at the runbook.
- [ ] Verify with `git check-ignore -v` that the three currently-committable paths listed
      in Problem are now ignored, and that no tracked file is newly ignored.
- [ ] Make the `release` signing path fail closed when `key.properties` is absent and no
      opt-in is present, with a message naming exactly the two remedies.
- [ ] Keep `debug` and non-release Android paths working without a release keystore.
- [ ] Add `--allow-debug-signing` to `scripts/build_pos_apk.sh`, threaded to Gradle as a
      project property, and have the script warn loudly when it is used.
- [ ] Update `scripts/test_packaging_pipeline.sh` to pass the opt-in for its real build,
      and add a negative check asserting the fail-closed message.

### S0-02 — Keystore provisioning tooling and custody runbook

Status: pending

- [ ] Add `scripts/provision_release_keystore.sh`: interactive, prompts for passwords with
      echo disabled, writes the keystore outside the repository and emits
      `apps/pos_app/android/key.properties` (git-ignored). Passwords never appear in argv,
      in shell history, or in the generated file's contents beyond the properties file
      itself.
- [ ] Add `docs/operations/release-signing-runbook.md`: generation, custody outside the
      repository, two encrypted backups in distinct locations, password stored separately
      from the key, MDM device-owner enrollment window and its irreversibility, and the
      recovery limits when no physical access exists.
- [ ] Record explicitly in the runbook that a factory reset is required for enrollment and
      that device-owner cannot be granted remotely afterwards.

### S0-03 — Register the Phase 0 decisions

Status: pending

- [ ] Add the keystore custody decision to `odd/tasks/go-live-decisions.md`, following the
      file's existing `DEC-N` format (fecha, decisión, rationale, consecuencia conocida,
      anclas de evidencia, revisar antes de/si). Spanish, matching that file's convention.
- [ ] Register the MDM device-owner enrollment decision and the deferred `API_URL`
      runtime-provisioning decision in the same registry, each with its review trigger.

## Evidence log

Appended as work units close.
