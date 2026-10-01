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
- **Authorized size exception.** S0-02 ships whole at 999 measured authored lines (466
  production + 533 test), above the budget. The repository's own precedent
  (`odd/tasks/terminal-enrollment-path.md`) records exceptions explicitly and allows them
  where splitting would leave a work unit unable to demonstrate what it claims; that
  applies exactly here, because the test is the only artifact that proves the F1
  correction. The founder authorized the exception. Counts recorded rather than hidden.
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

Status: complete — work-unit commits `3c4b6334` (feature doc) and `48cf3334`
(implementation). Independently verified: 8 of 8 claims confirmed, no refutations.

Closes both defects above.

- [x] Add root `.gitignore` rules covering `*.jks`, `*.keystore`, `*.p12`, and
      `key.properties` at any depth, with a comment pointing at the runbook.
- [x] Verify with `git check-ignore -v` that the three currently-committable paths listed
      in Problem are now ignored, and that no tracked file is newly ignored.
- [x] Make the `release` signing path fail closed when `key.properties` is absent and no
      opt-in is present, with a message naming exactly the two remedies.
- [x] Keep `debug` and non-release Android paths working without a release keystore.
- [x] Add `--allow-debug-signing` to `scripts/build_pos_apk.sh`, threaded to Gradle as a
      project property, and have the script warn loudly when it is used.
- [x] Update `scripts/test_packaging_pipeline.sh` to pass the opt-in for its real build,
      and add a negative check asserting the fail-closed message.

Deviation from the brief, justified and accepted: the guard uses a
`gradle.taskGraph.whenReady` hook rather than `androidComponents.beforeVariants`, because
both the `signingConfigs` block and `beforeVariants` run during every configuration,
including Android Studio sync and debug builds, which must keep working without a release
keystore.

Recorded residual: `gradlew :app:packageRelease`, and a `key.properties` naming a file that
exists but is not a keystore, still fail closed but surface AGP's or keytool's message
instead of the actionable one. The guard's notion of a usable keystore is path existence,
not key validity. No path produces a release artifact signed with the debug key without
the explicit opt-in.

### S0-02 — Keystore provisioning tooling and its test

Status: complete — work-unit commit `c68ef17b`. Shipped whole under the authorized size
  exception recorded in Delivery and verification.

- [x] Add `scripts/provision_release_keystore.sh`: interactive, prompts with echo disabled,
      writes the keystore outside the repository and emits
      `apps/pos_app/android/key.properties` (git-ignored).
- [x] Passwords never appear in argv, in a process listing, or under `bash -x`. Verified
      with an argv-recording wrapper around the real keytool and a full trace; the
      mechanism is keytool's protected-argument form (`-storepass:env`).
- [x] Refuse to overwrite an existing keystore or `key.properties` without an explicit
      force flag, leaving the existing file byte-identical (hash-compared, not eyeballed).
- [x] Refuse a keystore path inside the repository, and make that refusal hold by resolving
      both sides physically, so a broken `git` plus a symlinked invocation path cannot
      defeat it.
- [x] Fail closed when keytool is unavailable or non-functional, when the target directory
      cannot be created, or when a required input is missing.
- [x] Add `scripts/test_provision_keystore.sh`: temp-dir isolation, throwaway credentials,
      cleanup on every exit path, and no secret left behind.
- [x] **Correction found by verification and fixed:** the original two-password design was
      broken. keytool defaults to PKCS12, which ignores `-keypass`, so the generated
      `keyPassword` could not open the private key and a real release build failed at
      `:app:packageRelease` with `Get Key failed: Given final block not properly padded`.
      Replaced with one password used for both, `-storetype PKCS12` pinned on new stores,
      and keytool warnings surfaced instead of read and deleted.
- [x] **Correction found by verification and fixed:** forced rotation deleted the alias
      before regenerating, so a failed `-genkeypair` left the keystore with zero entries
      and the release key lost. Now stages into a same-directory temporary file and swaps
      only after the copy is verified whole, preserving unrelated aliases.
- [x] **Correction found by verification and fixed:** `--force` against an existing
      keystore protected by a different password now fails closed with cause and remedy
      instead of a cryptic keytool error, leaving the keystore byte-identical.
- [x] **Correction found by verification and fixed:** the suite asserted that `keyPassword`
      appeared in `key.properties` but never proved the private key could be opened with
      it — the blind spot that hid the defect above. It now proves the key opens, and a
      mutation check confirms the test fails against a tampered `keyPassword`.

Known residual recorded rather than hidden: the staging cleanup trap handles EXIT and
SIGTERM but not SIGKILL, so an unclean kill inside the swap window can leave a
`.provision-stage.*` file holding a full keystore copy (mode 600) in the custody directory.
It holds the same secret as the keystore beside it, so it exposes nothing new; it is stale
debris. A startup sweep of `.provision-stage.*` would close it.

### S0-03 — Custody and MDM enrollment runbook

Status: complete — work-unit commit `f4d1dbbb`.

- [x] Add `docs/operations/release-signing-runbook.md`: generation, custody outside the
      repository, two encrypted backups in distinct locations, password stored separately
      from the key, and the recovery limits when no physical access exists.
- [x] Record explicitly that a factory reset is required for enrollment and that
      device-owner cannot be granted remotely afterwards.
- [x] State the platform claims with a validate-on-the-real-device caveat, since platform
      behavior varies by Android version.
- [x] Note that `adb shell dpm remove-active-admin` fails for a production device owner, so
      the status is effectively permanent until a factory reset.
- [x] Note the Android 14+ `android:updateOwnership` nuance.
- [x] **Add the architectural consequence**: device-owner privilege belongs to the MDM's
      agent, not to `com.nhilos.pos_app`. The POS application therefore cannot silently
      self-update; silent installs must be driven through the MDM, or the update falls back
      to the operator-prompt path. This is a Phase 2 design constraint, recorded here so it
      is not discovered later.

### S0-04 — Register the Phase 0 decisions

Status: complete — work-unit commit `0b50d6e9`.

- [x] Add the keystore custody decision to `odd/tasks/go-live-decisions.md`, following the
      file's existing `DEC-N` format (fecha, decisión, rationale, consecuencia conocida,
      anclas de evidencia, revisar antes de/si). Spanish, matching that file's convention.
- [x] Register the MDM device-owner enrollment decision and the deferred `API_URL`
      runtime-provisioning decision in the same registry, each with its review trigger.

### S0-05 — Close the two residuals independent verification found

Status: complete — work-unit commit `81f6efa8` (198 lines, under budget).

Added after the S0-02 verification, on the founder's decision to fix both rather than just
record them.

- [x] Sweep stale `.provision-stage.*` debris at startup, because the rotation cleanup trap
      cannot catch SIGKILL. Confined to the keystore directory at depth 1, regular files
      only, the exact six-character mktemp name, and files older than ten minutes, so it
      cannot delete a concurrent run's staging file. It runs after the in-repo guard, so a
      crafted keystore path cannot turn the cleanup into a deletion primitive against the
      repository.
- [x] Correct `scripts/key.properties.example`, which still showed two distinct
      passwords — the documentation form of the defect fixed in S0-02.
- [x] Correct the hygiene test: it asserted no tracked-file changes via `git status`, which
      can never pass while the scripts under test are being modified. It now compares
      content hashes of every tracked file, excluding bytecode, so a pre-existing
      modification passes while a modification made by the suite fails with a readable
      diff.

Recorded minor observations, none blocking: the hygiene comment names `__pycache__/` while
the pattern also drops any `*.pyc`, so the comment under-describes the exclusion by one
clause; the check samples the whole repository at start and again about 23 seconds later,
so a genuinely external writer during that window would also be reported; and the
pre-verification revision used to establish no-regression was recovered from a session log
rather than from git history, because S0-05's intermediate revisions were never committed.

### S0-06 — Correction cycle for six native review findings

Status: complete — work-unit commit recorded in the Evidence log.

The native review opened on this branch admitted three of four lenses (risk, resilience,
readability) and reported six findings, all `causal_disposition: introduced`, none BLOCKER
or CRITICAL. All six are corrected here.

- [x] R2-001 — the pre-build gate rejected a valid `key.properties` (`storeFile = /path`,
      and later `storeFile /path`), aborting a build Gradle accepted — proven with a real
      `BUILD SUCCESSFUL`. Resolved systemically rather than by patching a third time.
- [x] R4-1 — an empty or directory-valued `storeFile` passed the Gradle guard's
      existence-only check, skipping the actionable message. Blank-after-trim and
      non-regular files are now treated as "no keystore".
- [x] R4-2 — a SIGKILL during generation of a NEW keystore left a partial file at the live
      path. Both the new and the rotation path now stage to `.provision-stage.*` and move
      into place only after verification, so one mechanism and one sweep cover both.
- [x] R4-3 — `key.properties` was written by direct in-place redirection, so an interrupted
      write could truncate a working configuration. Now staged and moved into place.
- [x] R2-002 — the Gradle comment overstated what the guard checks. It now states that this
      is a path-shape check and that key validity is not verified.
- [x] R2-003 — a call-site comment called a mutating function side-effect-free. Corrected.

Root cause of R2-001, and the reason it took three rounds: the gate reimplemented
`java.util.Properties` in `awk` to decide readiness, which is divergent by construction.
Three successive rounds each found a different divergence — the whitespace-only separator,
a bare key line, and backslash escapes; the last let the gate report READY on a path Gradle
never uses. The parser was therefore REMOVED. The gate now performs one exact check,
whether `key.properties` exists, and Gradle is the sole authority on readiness; Gradle
already fails closed with the same actionable message. This deletes the divergence class,
shrinks the script, and restores the honest invariant that the gate never claims a
readiness it cannot verify.

Two incoherences the removal introduced were also closed: the debug-signing warning had
kept a condition requiring the file to be ABSENT, so it now fires unconditionally with the
opt-in, because the gate can no longer predict whether Gradle will fall back; and the
early-abort message now matches its `[ ! -f ]` condition instead of saying only "is absent".

Trade accepted deliberately by the founder: with a present-but-broken `key.properties` the
failure now arrives after toolchain startup instead of immediately — same message, later. No
artifact-level guarantee was relaxed.

## Evidence log

### Work units

| Slice | Commit | Scope |
|---|---|---|
| — | `3c4b6334` | Feature doc opened with the Phase 0 work units. |
| S0-01 | `48cf3334` | Root ignore rules and fail-closed release signing. |
| S0-02 | `c68ef17b` | Keystore provisioning tooling and its test (999 lines, authorized exception). |
| S0-03 | `f4d1dbbb` | Custody and MDM enrollment runbook. |
| S0-04 | `0b50d6e9` | Phase 0 decisions registered as DEC-4..DEC-6. |
| S0-05 | `81f6efa8` | Staging sweep, single-password example, hygiene-test correction. |
| S0-06 | this commit | Six native review findings corrected; the gate's property parser removed. |

All seven commits are local to `feat/release-signing-baseline`, branched from `22bfc376`
(`origin/main`). Nothing is pushed; the pull request and the merge remain the founder's
decision.

### Verification rounds

1. **S0-01 — 8 of 8 confirmed, no refutations.** Independent verification reproduced the
   fail-closed guard, the debug path staying healthy, the pre-toolchain script gate
   (exit 2, Flutter shim never invoked), plan mode still exiting 0, and the opt-in scoped to
   the build invocations only.
2. **S0-02 round 1 — one claim REFUTED.** The claim that a script-generated
   `key.properties` drives a successful release build was refuted: with distinct store and
   key passwords the release build failed at `:app:packageRelease`. That refutation is what
   exposed the PKCS12 defect, the forced-rotation data-loss window, and the fact that the
   suite's own test could not have caught either. Recorded here because the refutation was
   the most valuable step of the whole work unit, not a setback.
3. **Fix cycle — the writer timed out with zero evidence.** It stalled 4 minutes on an
   interactive `read` (it ran the provisioning script without feeding stdin) and was
   killed. It produced no RED, no GREEN, and no build. Its only artifact was a 442-byte
   `run.log` containing that failed attempt; the log held no secret and was deleted. Nothing
   from that cycle was taken on trust.
4. **S0-02 round 2 — 9 of 9 confirmed.** Established from scratch by an independent
   verifier: the full 13-test suite green; a mutation check proving the keyPassword
   regression test actually fails against a tampered value; a real
   `flutter build apk --release` with no opt-in succeeding and the APK signed by the
   throwaway release certificate (`94c39704…`) rather than the debug certificate
   (`91d0bd80…`); the failed-rotation path leaving the keystore byte-identical with every
   entry intact; a broken `git` plus symlinked invocation still refused; and a
   different-password keystore failing closed byte-identical.

5. **S0-05 — 9 of 9 confirmed across three rounds.** The sweep was confirmed to remove
   stale debris and to leave a fresh staging file strictly alone, to stay confined to one
   directory, and to sit after the in-repo guard, so a crafted keystore path is refused
   before the cleanup can run. The hygiene check's teeth were demonstrated in the real
   suite rather than a sandbox: a `keytool` shim that modifies a tracked file makes it fail
   with a readable diff, and the file was restored byte-identical. Critically, that was
   shown for a tracked file under `apps/` as well as under `scripts/`, closing the coverage
   narrowing an earlier round flagged. One round earlier, the writer could not
   demonstrate those teeth at all and said so instead of substituting a sandbox result,
   and an independent verifier then closed that gap.

6. **S0-06 — the native review found what three verification rounds did not.** Three of
   four lenses admitted (risk, resilience, readability); `review-reliability` produced no
   output on two consecutive attempts (`reviewer-empty-output`, `stopReason: length`, no
   mutation), so the review could not close. The admitted lenses reported six findings, all
   introduced by this candidate. Every fix was then verified behaviorally, and twice a fix
   was found incomplete: R2-001's first correction still rejected the whitespace-only
   separator form, proven by a real `BUILD SUCCESSFUL` against a gate exit 2, and the
   parser's own comment claimed an invariant a counterexample refuted. The final round
   confirmed 9 of 9, including mutation proofs that each new assertion can actually fail.

### Review disposition

The native review on this feature was ABANDONED by founder decision, and the corrected
candidate is left UNREVIEWED. Recorded in full here because no closed receipt exists.

- Lineage `review-bfeac653696afdde` admitted three of four lenses: `review-risk` (0
  findings), `review-resilience` (3 WARNING), `review-readability` (1 WARNING, 2
  SUGGESTION). The required `review-reliability` lens produced no output on two consecutive
  attempts — `reviewer-empty-output`, `stopReason: length`, ~204s each, with
  `mutation_performed: false` both times — against a 1877-line review target. That is a
  model output-length limit, not a property of the code, and it is why the review could not
  close.
- The six findings it did produce were all corrected (S0-06), and every correction was
  verified behaviorally by independent rounds, including mutation proofs that each new
  assertion can actually fail.
- The lineage could not be used to review those corrections: it stayed frozen on the
  pre-correction candidate tree (`249cf4f3…`) even after the fixes were committed, and
  neither `complete-fix` nor `review/complete-fix` is an accepted `advance` transition. The
  advertised repair operations report `status: unsupported` with all counts zero.
- Abandonment committed with the founder's explicit approval of the exact eight-line
  `gentle-ai.review-abandon-authorization/v2` binding. Audit record: `reason=operator_disposition`,
  `actor=pi`, discarded work = the three admitted lens results with `findings_present=true`,
  quarantined at
  `.git/gentle-ai/review-transactions/quarantine/review-bfeac653696afdde-2763430141`.
- Consequence, stated plainly: **this branch carries no approved review receipt.** If the
  delivery gate requires one, that is not satisfied. What the branch does carry is the
  review's own six findings plus independent behavioral verification of every correction —
  evidence the review itself does not produce.
- The corrected candidate is a fresh unreviewed target (`b29dc311…`, tree `c7106eae…`,
  proposed lineage `review-94fe384e89bc815d`). Starting it is a separate decision, and
  re-running all four lenses would very likely hit the same output-length limit on
  `review-reliability`.

Process note worth keeping: the abandonment took four attempts because
`--maintainer-authorization` is an eight-line LF-joined binding, while the provider's error
text renders it concatenated onto one line. `gentle-ai review abandon --help` documents
this and prints the template; the values must be read from `entries[]` in
`gentle-ai review status`, never inferred.

### Known gaps carried forward

Both residuals recorded when S0-02 closed are now closed in S0-05, and the six review
findings are corrected in S0-06.

Still open, all low severity, none able to produce a debug-signed or wrongly-signed
artifact:

- No claim in this feature was validated against physical Android hardware. The runbook
  says so, and the enrollment dry run is the operator step that closes it.
- The fail-closed guarantee now rests on a single layer, Gradle's signing guard. Test 25b
  pins it, but a future removal of that guard without touching the gate would let a
  present-but-broken `key.properties` stop failing closed.
- A DIRECTORY at the `key.properties` path (pathological) makes `keystoreProperties.load`
  throw a raw `Is a directory` error before the signing guard can produce the actionable
  message, including on the opt-in path where the fallback is intended to work.
- The loud debug-signing warning lives only in `scripts/build_pos_apk.sh` and is written to
  stdout; a direct `flutter build` bypasses it, and a CI capturing only stderr would miss
  it. Gradle emits its own equivalent warning on that path.
- `:app:packageRelease` invoked directly, and a `storeFile` naming a file that exists but
  is not a keystore, still surface AGP's or keytool's message rather than the actionable
  one. The guard's notion of a usable keystore remains path shape, not key validity.
- Test 25a's deferral proof trips at `flutter pub get` rather than the build step its
  failure text names; the assertion still distinguishes a gate abort from a deferral, but
  the message overstates the granularity.
- The provisioning script's Test 17 compares tracked-file hashes repository-wide, so a
  genuinely external writer during the ~23 second run would also be reported.
- The three `.pyc` files tracked under `scripts/finance/__pycache__/` are a pre-existing
  repository issue, out of scope here; they are excluded from the hygiene hash set.
