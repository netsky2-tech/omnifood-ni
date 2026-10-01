# OTA update channel — remote APK distribution + self-install

**Status:** in progress (Batch 1)
**Branch base:** `main` @ `4820f460`
**Decided by founder (2026-10-01):** install path = **one-tap SystemInstaller now, Nyx silent-install spike post-delivery**. Artifact hosting = **object storage / CDN with signed URLs (R2 or S3)**.

---

## Why this exists

Terminals are already shipped and cannot be reached by laptop. Today an update means: someone with
adb, on the shop network, pushing a 32 MB file. That does not scale past the pilot and it is the
last thing standing between us and "we can fix a terminal in the field".

Interim path that still works and is not deprecated by this document: if the terminal is
adb-reachable on the shop LAN, `adb install -r <apk>` updates it in place with data preserved.

---

## Facts measured on hardware (these constrain the design; not opinions)

| # | measured fact | design consequence |
|---|---|---|
| F1 | `ACTION_VIEW` with a `file://` APK URI → **`unable to resolve Intent`** on this Android 12 device | install handoff **must** use `content://` via a `FileProvider`. Not stylistic. |
| F2 | `com.android.packageinstaller` present; `net.nyx.appstore` present | a real installer UI exists to receive the handoff |
| F3 | `net.nyx.mdm` v1.2.6 holds **`android.permission.INSTALL_PACKAGES`**, exposes `UpdateInstallProvider`, listens for `PACKAGE_INSTALL`; `targetSdk=30` | silent install IS possible on this hardware, via an **undocumented vendor interface**. Deferred (Batch 5). |
| F4 | no device owner / profile owner enrolled (`dumpsys device_policy` empty) | we are not MDM-governed today; nothing to inherit |
| F5 | `REQUEST_INSTALL_PACKAGES` appop currently `default` for our package | must be declared + granted by the operator once, in Settings |
| F6 | `versionCode` per artifact from **one** pubspec `1.0.0+1`: universal `1`, armeabi-v7a `1001`, arm64-v8a `2001`, x86_64 `4001` | the release manifest **must be keyed by ABI**. A single "latest versionCode" compares incommensurables. |
| F7 | in-place update with the **same signature** preserves the SQLite DB (proven across 4 reinstalls, `firstInstallTime` unchanged); a **different** signature → `INSTALL_FAILED_UPDATE_INCOMPATIBLE` → uninstall → **data loss** | OTA must never uninstall, and must never offer an APK signed with a different key |
| F8 | `INSTALL_FAILED_VERSION_DOWNGRADE` observed live; `-d` does not rescue a non-debuggable release build | **there is no rollback in Android.** versionCode is monotonic forever. `min_from_version_code` + `mandatory` are safety controls, not decoration. |
| F9 | `Platform.version` ends `on "android_arm64"` (verified: host yields `linux_x64`) | ABI is knowable at runtime with **no new dependency**, correct by construction |
| F10 | `path_provider` is **not** in pubspec; `dio`, `crypto`, `package_info_plus`, `shared_preferences` are | need `path_provider` for a writable, FileProvider-exposable APK drop location |
| F11 | no storage/credentials infra anywhere in the repo | Batch 3 is **blocked on the founder** |

---

## Architecture — 5 pieces

### A. Release registry (backend, new module `releases`)
`app_releases` table:
`channel, abi, version_code, version_name, apk_url, sha256, size_bytes, min_from_version_code, mandatory, notes, published_at`
- `(channel, abi, version_code)` unique.
- Endpoint: `GET /api/v1/releases/latest?abi=arm64-v8a&current=2001&channel=pilot`
- Multi-tenant question deliberately deferred: releases are **not** tenant-scoped (one POS build serves all
  tenants), so this table is a candidate for the *non*-RLS allowlist. Must be stated explicitly in the
  migration, not discovered by accident. See Open question Q2.

### B. Artifact hosting — object storage + signed URLs
32 MB per terminal, needs **resumable** download. Backend issues the signed URL; it never proxies the APK.
Blocked on credentials (F11).

### C. Terminal update service (Flutter)
check on startup + periodic → resolve against installed version → download to app-private external dir →
**verify SHA-256 before any install is offered** → hand off.

### D. Install handoff behind one interface
`ReleaseInstaller` port with two adapters:
- `SystemInstallerAdapter` — FileProvider `content://` + `FLAG_GRANT_READ_URI_PERMISSION` → **one operator tap**. (Batch 1)
- `NyxMdmAdapter` — silent, vendor-specific. (Batch 5, post-delivery)
Nothing above the port may know which adapter is wired.

### E. Fiscal safety gate
Installing **is a process restart**, which is exactly where a sale dies. Never offer install when:
- a cart is non-empty, or
- a sale is in flight, or
- a shift/cash register session is open.
And never offer it as a silent background action: the operator initiates it, visibly.

---

## The manifest contract (shared artifact — implement against this)

```json
{
  "schema": "omnifood.pos.release/1",
  "channel": "pilot",
  "abi": "arm64-v8a",
  "versionCode": 2002,
  "versionName": "1.0.2",
  "sha256": "<hex, lowercase, 64>",
  "sizeBytes": 32357769,
  "downloadUrl": "https://…signed…",
  "minFromVersionCode": 2001,
  "mandatory": false,
  "notes": "…",
  "publishedAt": "2026-10-02T18:00:00Z"
}
```

Rules the Dart side enforces, each traceable to a measured fact:
- **R1** `abi` must equal the terminal's own ABI (F9). A v7a terminal never installs an arm64 APK.
- **R2** `versionCode > installedVersionCode` strictly, else reject as downgrade (F8).
- **R3** `installedVersionCode >= minFromVersionCode`, else refuse and surface a human decision (F8).
- **R4** SHA-256 of the downloaded bytes must match `sha256` **before** the installer is invoked (F7).
- **R5** `sizeBytes` must match the download, so a truncated transfer is not offered for install.
- **R6** an unknown `schema` is rejected, never guessed at.
- **R7** no install offered while the fiscal gate (E) is closed.

---

## Batches

- **Batch 1 — Dart core + contract (today, no infra needed).** Manifest model, ABI resolution, version
  resolver, R1–R8, download + SHA-256 verify, `ReleaseInstaller` port + `SystemInstallerAdapter`,
  `REQUEST_INSTALL_PACKAGES` + FileProvider in the manifest. This is where a mistake bricks terminals,
  so it gets the most tests and needs no backend or bucket to prove.
  - ✅ ABI resolution — `lib/core/platform/target_abi.dart` (F9, no new dependency)
  - ✅ Manifest contract + strict parser — `lib/domain/models/update/release_manifest.dart` (R4, R5, R6)
  - ✅ Upgrade resolver — `lib/domain/services/update/upgrade_resolver.dart` (R1, R2, R3)
  - ⬜ Download + SHA-256 verification service — needs `path_provider` (F10)
  - ⬜ `ReleaseInstaller` port + `SystemInstallerAdapter` — needs FileProvider + `REQUEST_INSTALL_PACKAGES` (F1, F2, F5)
  - ⬜ Fiscal gate port (R7)
- **Batch 2 — backend `releases` module.** Entity, migration, controller, service, tests, RLS decision.
- **Batch 3 — signed URL issuance.** **Blocked on founder** for R2/S3 credentials.
- **Batch 4 — operator UI.** "Update available" surface, notes, install-now / later, and the fiscal-gate
  explanation when install is refused.
- **Batch 5 — Nyx silent-install spike.** Post-delivery.

---

## Open questions

- **Q1 — pubspec version vs Flutter's ABI offset.** pubspec says `1.0.0+1` yet arm64 installs report
  `2001`. We must set the *base* versionCode deliberately and document that the per-ABI offset is
  Flutter's, not ours, or every release-numbering decision downstream is built on sand.
- **Q2 — is `app_releases` tenant-scoped?** Belief: no (one build serves all tenants), so it needs an
  explicit non-RLS statement in the migration + coverage allowlist. Must be confirmed, not assumed.
- **Q3 — channel model for the pilot.** `pilot` vs `production` as the first two channels; who may publish.
- **Q4 — update polling vs push.** Offline-first argues for opportunistic check on startup + long interval,
  not a push dependency.

---

## Progress log

| task | outcome | commit |
|---|---|---|
| ABI resolution + release manifest contract | 28 tests green, analyzer clean. `Platform.version` resolves `android_arm64` with no new dependency; parser is hand-written (Freezed's generated `fromJson` is permissive and this is a safety boundary) and rejects unknown schema, non-lowercase-hex sha256, relative/`file://`/`javascript:` URLs, inverted version ranges | `c4afbde4` |
| Upgrade resolver (R1–R3) | 17 tests green, analyzer clean. Ordering pinned by tests: wiring bug ≠ ABI mismatch, and direction is checked before the floor. `mandatory` never installs by itself | `d04729a3` |

---

## What is NOT built yet, stated plainly

Batch 1 is roughly half done and **the remaining half is the part that touches Android**:

- `path_provider` must be added to `pubspec.yaml` (F10) to have a writable,
  FileProvider-exposable drop location. That is a dependency change with a
  `pubspec.lock` diff, so it should be its own commit.
- The install handoff needs native work: a `<provider>` entry in
  `AndroidManifest.xml` (currently **zero** providers), a `file_paths.xml`,
  `REQUEST_INSTALL_PACKAGES`, and a platform channel or plugin to fire the
  `content://` intent. **F1 proved `file://` does not resolve**, so there is no
  pure-Dart shortcut here.
- `REQUEST_INSTALL_PACKAGES` is a runtime *Settings* grant (F5), not a dialog
  the app can request. Provisioning a terminal must include one human step.
- Nothing has been verified on the device for OTA yet. Everything measured on
  hardware so far is in the facts table above; the resolver and parser are
  host-tested only.
