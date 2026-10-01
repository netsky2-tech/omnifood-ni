# Release Signing Key — Provisioning and Custody Runbook

**Purpose:** how to generate, store, back up, and — when a terminal is lost — recover from the loss of the Android release signing key. Feature: `odd/tasks/release-signing-baseline.md` (S0-02).

**Read this before generating the key.** The signing key is the single most irreversible artifact of the whole distribution plan. Everything else in the terminal rollout can be rebuilt; this cannot.

---

## The irreversibility, stated plainly

**Losing this key permanently ends the ability to update already-shipped terminals.**

Android only installs an update over an existing app when the new APK is signed with the **same key**. Sign a build with any other key and the terminal rejects it with `INSTALL_FAILED_UPDATE_INCOMPATIBLE`. The POS terminals have **no physical access once dispatched** — nobody in the field can uninstall and reinstall. A terminal whose app was shipped with a lost key is, for update purposes, unrecoverable unless someone travels to it.

And even with physical access, a reinstall is not free. **Local SQLite is the source of truth** (see `AGENTS.md`): the local DGI invoice sequence and any not-yet-synced documents live only on the device. A factory reset or reinstall puts the local numbering cursor and unsynced fiscal documents at risk, and restarting the sequence wrong prints duplicate invoice numbers. The terminal-recovery path (sequence reconciliation, DGI evidence, back-entering contingency tickets) is **not** reinvented here: follow `docs/operations/pilot-terminal-incident-procedure.md` — in particular Scenario C (re-imaged / factory-reset device) and Scenario D (suspected duplicates).

Consequence: the key, its backups, and its password are production-critical custody items from the moment this script runs.

## Generating the key

Run the provisioning tool on a trusted operator machine:

```bash
scripts/provision_release_keystore.sh
```

It prompts for ONE password (with echo disabled, entered twice) and optionally the alias and certificate distinguished name (defaults: `upload`; `CN=NHilos Upload, OU=OmniFood NI, O=NHilos, L=Managua, ST=Managua, C=NI`). Then it:

1. Generates a 4096-bit RSA key pair, default validity ~30 years (`--validity-days 10950`), with `-dname` always supplied explicitly so `keytool` never drops into an unrelated interactive prompt. The keystore type is pinned to **PKCS12** (`-storetype PKCS12`), so the format never depends on `keytool`'s default.
2. Writes the keystore to `$HOME/.keys/nhilos-upload.jks` (override with `--keystore-path PATH`), mode `600`.
3. Writes `apps/pos_app/android/key.properties` with `storePassword`, `keyPassword` (same value as `storePassword` by design — see below), `keyAlias` and an absolute `storeFile`, mode `600`. That path is git-ignored (`apps/pos_app/android/.gitignore` plus the root rules added in S0-01); this runbook does not weaken those rules.

**Why ONE password:** PKCS12 — the keystore format the tool pins — does not support a key password distinct from the store password; `keytool` silently ignores a different `-keypass`. A second distinct password would also add no real protection: `key.properties` holds both values in plaintext in the same file, so whoever can read one can read the other. `keyPassword` is still written (Gradle's `signingConfig` reads it) but it is deliberately the same value.

**Password handling guarantee:** the password never appears as a command-line argument to `keytool` — the script uses the protected-argument form `-storepass:env` / `-keypass:env` (both pointing at the same environment value), keeps the export inside a tracing-guarded region, and therefore never exposes it in argv, in a process listing, in shell history, or in the script's own output even under `bash -x`. Additionally, anything `keytool` writes to stderr (warnings) is always surfaced to the operator — a swallowed `keytool` warning once hid exactly the silently-ignored `-keypass` defect described above. The only file that ever contains the password is `key.properties` itself, plus whatever you type into the secret manager (next section).

## How the fail-closed guards behave

The tool refuses to act rather than doing something dangerous:

| Condition | Behavior |
|---|---|
| `keytool` unavailable or non-functional | Exit 1 with a message naming the fix. Nothing is written. |
| Keystore directory cannot be created | Exit 1. Nothing is written. |
| A required input (password) is missing or empty | Exit 1. Nothing is written. |
| Keystore file already exists, no `--force` | Exit 2, message names `--force`. The existing file is left **byte-identical**. |
| `key.properties` already exists, no `--force` | Exit 2, independent of the keystore guard. File left byte-identical. |
| `--keystore-path` points inside the repository | Exit 2, **always** — `--force` does not bypass this, and the comparison uses fully resolved physical paths on both sides, so a symlinked invocation path or a non-functional `git` cannot bypass it either. Nothing is created. |
| `--force` and the existing keystore does not open with the provided password | Exit 1 with a message naming the likely cause (the keystore was created with a **different** password — this tool does not rotate keystore passwords) and the remedy (recover the correct password from the secret manager/backups, or provision a new keystore under a different path). The keystore is left **untouched**. |
| `--force` and `keytool` fails during the replacement (delete or regeneration) | Exit 1. The live keystore is **never mutated in place**: the replacement is staged on a sibling temporary copy, verified, and only then moved into place. On any failure the original is left **byte-identical** and keeps **all** of its entries, including unrelated aliases. |

`--force` exists for deliberate replacement and requires you to re-run with it explicitly. Overwriting the release key is the catastrophic failure mode of this feature; the guard is loud on purpose.

## Custody rules

These are not recommendations. The key is the artifact whose loss cannot be repaired.

- **The key lives outside the repository.** Default: `~/.keys/nhilos-upload.jks`. Never copy it into the repo tree. **Why this is enforced and not just advised:** until S0-01, the repository-level ignore guard only covered `apps/pos_app/android/` — a keystore dropped at the repo root, under `scripts/`, or under `apps/pos_app/` was **committable** (verified with `git check-ignore`, see the feature document's Problem section). S0-01 added root rules for `*.jks`, `*.keystore`, `*.p12` and `key.properties` at any depth, but ignore rules are a safety net, not custody: they do not protect copies moved outside the working tree.
- **Two encrypted backups, in two distinct locations.** For example, an encrypted USB drive kept off-site and an encrypted vault in cloud storage. One copy is a single point of failure, not a backup. Verify a backup actually restores: copy it back and run `keytool -list -keystore <backup>` with the secret-manager password.
- **The password is stored separately from the key file, in a secret manager.** A backup without its password is as lost as no backup; a password stored next to the key protects against nothing. Never commit the password, put it in a ticket, a chat message, or a shell command line.
- Custody of the keystore and custody of the password should sit with **different failure domains** (e.g., founder holds one backup; the encrypted vault holds the other; the secret manager holds the password).

## `--allow-debug-signing`: what the opt-in is for, and what it is not

`apps/pos_app/android/app/build.gradle.kts` fails closed: a `release` build with no keystore (no `key.properties` naming a real `storeFile`) and no opt-in exits with an error naming the two remedies — create the keystore with `scripts/provision_release_keystore.sh`, or pass the explicit opt-in. The packaging script `scripts/build_pos_apk.sh` threads this as `--allow-debug-signing` (a Gradle project property) and warns loudly when it is used.

Division of responsibility, stated plainly: the packaging script's pre-build gate performs only one exact, cheap check — that `apps/pos_app/android/key.properties` **exists** — so an absent keystore fails fast before the toolchain. The gate does **not** parse `key.properties` and does **not** validate readiness; Gradle's signing guard is the authoritative check and fails closed with the same actionable message when the `storeFile` is missing, blank, or a directory.

The opt-in exists so the packaging pipeline can build and test **without** a release keystore (that is how `scripts/test_packaging_pipeline.sh` runs). It produces a **debug-signed** artifact.

**A debug-signed artifact must never be shipped.** Debug signing uses the machine's debug keystore, which is not custody-controlled and differs between machines and CI environments. Anything debug-signed can never be updated in place by a release-signed build — shipping it to a terminal would waste that terminal the same way a lost key does.

## The MDM device-owner enrollment window (one-time, before dispatch)

Android grants the **device-owner** role — the prerequisite for the self-hosted MDM (Headwind) managing silent installs — only during initial provisioning, and **only while the device is in hand** (corroborated against Android/AOSP documentation):

- It requires a **factory reset** (or provisioning at first boot of a new device); device-owner provisioning happens during initial setup only.
- It is performed with `adb shell dpm set-device-owner <pkg>/<component>` over USB — which **fails when accounts already exist on the device** — or via the production provisioning channels: **QR provisioning** (tap the welcome screen six times) and **NFC bump** during the setup wizard.
- It **cannot be granted remotely afterwards.** There is no post-hoc path: once the device is set up without device-owner, the window is closed until the next factory reset.
- **`adb shell dpm remove-active-admin` fails for a production (non-`testOnly`) device owner**, so device-owner status is effectively **permanent until a factory reset**. This strengthens the one-time-window framing below: there is no undo.
- A device-owner app installs and updates APKs **silently** through Android's `PackageInstaller`; a non-device-owner app instead needs the user to enable "install unknown apps" for it and then accept each install with an explicit tap.
- On **Android 14+**, an installer can additionally claim **update ownership** (`android:updateOwnership`) over packages it installed — relevant to which app may update which package on newer terminals.

**Validate the enrollment specifics on the actual terminal during the provisioning window.** Platform behavior varies by Android version (exact setup-wizard taps, QR flow, `dpm` responses); the claims above are the documented baseline, not a substitute for a dry run on the real device before dispatch.

**Architectural consequence (Phase 2 design constraint — stated here so it is not discovered later):** the founder's decision delegates device-owner to the self-hosted MDM (Headwind). That means **the device-owner privilege belongs to the MDM's agent, NOT to `com.nhilos.pos_app`**. The POS application therefore **cannot silently self-update on its own**: silent installs must be driven through the MDM, or the update must fall back to the operator-prompt path ("install unknown apps" + explicit tap). Any Phase 2 OTA design that assumes the POS app can install its own updates silently is invalid under this decision.

**This is a one-time decision taken before the terminal is dispatched.** The consequence of missing it is concrete and recurring: without device-owner, the MDM cannot install updates silently — **every update then needs a human physically at the site** to accept the install prompt. For a fleet distributed across food parks, that is the difference between an OTA rollout and a road trip per terminal.

Decide and execute enrollment as part of device preparation, together with the standing preparations in `docs/operations/pilot-terminal-incident-procedure.md` (P1–P5), before the device leaves the workshop.

## Recovery limits when no physical access exists

Stated honestly, because pretending otherwise is how the failure gets discovered in the field:

- **Key lost, no backup:** no further update can ever be installed on terminals shipped with that key. The only path is physical: travel to each terminal, uninstall (destroying local SQLite — see the incident procedure), reinstall under the new key, and reconcile the DGI sequence per Scenario C. There is no remote remedy.
- **Update signed with the wrong key:** `INSTALL_FAILED_UPDATE_INCOMPATIBLE` on every affected terminal; the MDM cannot force it. Same physical-recovery path as above.
- **Terminal update blocked and no physical access planned:** the terminal keeps selling with its current version until someone reaches it. Budget the visit; do not improvise remote workarounds.
- Every one of these recoveries pays the reinstall cost described at the top: the local DGI sequence and unsynced documents are at risk, and reconciliation follows the incident procedure, not ad-hoc steps.

## References

- Feature document and decisions: `odd/tasks/release-signing-baseline.md`
- Terminal incident and recovery procedure: `docs/operations/pilot-terminal-incident-procedure.md`
- Fail-closed release signing and the packaging opt-in: `scripts/build_pos_apk.sh`, `apps/pos_app/android/app/build.gradle.kts`
- Provisioning tool and its test suite: `scripts/provision_release_keystore.sh`, `scripts/test_provision_keystore.sh`
