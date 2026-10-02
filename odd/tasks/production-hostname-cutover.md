# Production Hostname Cutover — Single Shared Environment

Status: **PLAN ONLY**. No production change is authorized, prepared, or performed by this
document. Everything in "Measured inventory" and "What does not need to change" is repo-level
read-only evidence at `origin/main` = `27a15728`.

Authority: owner statement of 2026-10-02, `odd/tasks/go-live-decisions.md` (DEC-4, DEC-6, DEC-7),
`docs/operations/staging-cutover.md`, `odd/tasks/go-live-plan.md`.

### 1.2 Baseline verification (measured 2026-10-02)

This document lives on branch `docs/production-hostname-cutover`, created from `origin/main` =
`27a15728` (local `main` points at the same commit). The plan must not be built on a feature branch.

Every repo file cited below was verified to be **byte-identical** between `origin/main` and the
unmerged `feat/ota-b5a-clean` branch, so the findings are not contaminated by that branch:
`apps/owner_dashboard/public/_headers`, `docs/operations/staging-cutover.md`,
`apps/pos_app/lib/ui/features/config/terminal/terminal_identity_view.dart`,
`apps/pos_app/lib/data/database/migrations.dart`,
`apps/admin_backend/src/core/config/http-security.config.ts`, `apps/admin_backend/railway.json`.

**Two dependencies cited here are NOT on `main`:** `DEC-7` and `odd/tasks/ota-automatic-discovery.md`
exist only on `feat/ota-b5a-clean`, which is **not merged** (`origin/main..feat/ota-b5a-clean` =
14 files, +2628/−91, including `ota_discovery_service.dart`, `ota_update_coordinator.dart`,
`ota_providers.dart` and `main.dart`). `odd/tasks/go-live-decisions.md` on `main` carries DEC-1…DEC-6
only. DEC-7 is therefore cited here as **decision context already agreed in conversation**, not as
main-track authority. This does not block the cutover (Q4 fences OTA out), but nobody should assume
the OTA track shipped on `main`.

## 1. Context — this is a rename, not a deployment

The founder confirmed there are **not** two environments. The single live
Railway/Cloudflare environment was deliberately reused for both purposes to avoid the cost of a
second one:

| Surface | Hostname today | Provider |
| --- | --- | --- |
| Admin API (`apps/admin_backend`) | `api-staging.nhilospos.com` | Railway |
| Owner dashboard (`apps/owner_dashboard`) | `soho.nhilospos.com` | Cloudflare Pages |

That environment already carries real SOHO pilot data (tenant `b94b8536-e3b6-4db5-9d82-d887006756d1`,
invoices `1001010000000x`, opened shifts, provisioned terminals). So the request
—"quitarle lo de staging para que sea la oficial"— is a **hostname rename over a live
environment**, not a cutover to a new one.

That framing is load-bearing: a new environment is a deploy, and a rename is a
*compatibility* problem. It is cheaper, but it has a failure mode a fresh deploy does not.

### 1.1 Owner answers (2026-10-02)

- **Q1 — confirmed.** `soho.nhilospos.com` is the final customer dashboard domain. The dashboard is
  therefore already customer-facing; only its API origin moves.
- **Q2 — one terminal.** Exactly one terminal is in the field today. This downgrades §2 from a
  fleet-continuity problem to a single-device migration problem; see §2.1.
- **Q4 — confirmed.** OTA release promotion is a separate track. This document publishes nothing.
- **Q5 — identity (owner decision, 2026-10-02).** The APK will **bake `--device-id`** (the hardware
  serial `Q802024120001`), accepting the re-link and re-activation that implies. Installation is
  handled in a separate session. Accepted trade-off, recorded honestly: this is the only mechanism
  available today (a non-privileged app cannot read `Build.SERIAL` on Android 10+, and DEC-5 keeps
  device-owner with the MDM), and it does **not** scale past a handful of devices — an artifact
  baked per device cannot ride the OTA channel (§3 row 12).

## 2. The one risk that decides everything

`ApiBaseUrlService.resolve()` (`apps/pos_app/lib/data/services/api_base_url_service.dart`)
resolves the backend URL in this order, **first value wins**:

1. persisted `local_configs.api_base_url`  ← **wins over everything below**
2. build-time define `--dart-define=API_URL=...`
3. `http://127.0.0.1:3000/api` (debug builds only; release reports `unconfigured`)

Consequence, and it is the whole plan:

> A terminal that already persisted `https://api-staging.nhilospos.com/api` keeps calling that
> host **forever**, no matter what any future APK bakes in. It ignores the new official URL.

So detaching or deleting the `api-staging` hostname does not "migrate" the fleet — it **strands**
it. Android has no rollback (DEC-7/F8), and a wrong-key reinstall risks the local DGI sequence and
unsynced documents (DEC-4), so there is no cheap field recovery.

**Rule that follows:** attach `api.nhilospos.com` *in addition to* `api-staging.nhilospos.com`.
Never replace one with the other. The old host is the rollback path, not a legacy artifact.

**Corollary — an HTTP 301 is not an alias.** A redirect puts POST bodies, Dio redirect handling
and TLS in the path. Attach both custom domains to the same service so both answer directly.

### 2.1 Recalibration: with one terminal, what the alias is actually for

With exactly one terminal in the field (Q2), the alias is **not** fleet-continuity insurance. It is
the **rollback path for that single migration** — a stronger reason, not a weaker one.

The migration is manual and human-typed, on a screen whose known failure modes are typing-level
rather than logic-level: Gboard autocorrecting `http`→`https`, and a URL with no port being
accepted and then failing at runtime with `HandshakeException: WRONG_VERSION_NUMBER`
(`apps/pos_app/lib/data/services/api_base_url_service.dart`, whose validation mirrors
`validate_api_url` in `scripts/build_pos_apk.sh`).

Both were reproduced twice during the 2026-10-01/02 staging runs and are recorded **only in Engram
memory**, not in any repo artifact — repo-wide grep for `WRONG_VERSION_NUMBER`, `HandshakeException`
or `gboard` returns no such hit. That is a defect in its own right: a reproduced field failure mode
with zero repo-side evidence will not be found by the next operator reading `docs/`. Recording it
is part of T5.

| | Cost |
| --- | --- |
| Keep the alias | One extra Railway custom domain + one DNS record. No code, no deploy, no recurring cost. |
| Remove it and need it back | The terminal. |

Recommendation: keep it. Retiring it is a **separate, later decision**, conditioned on the migrated
terminal running clean against the official host for a real operational window. It is not part of
this cutover.

## 3. Measured inventory (read-only, `27a15728`)

Live code and config that must change:

| # | Surface | Where | Why it matters |
| --- | --- | --- | --- |
| 1 | Railway custom domain | not in repo (operator console) | The actual rename. Attach `api.nhilospos.com`; **keep** `api-staging.nhilospos.com`. |
| 2 | Cloudflare DNS | not in repo (operator console) | New `api` CNAME/record; old record must survive. |
| 3 | Dashboard API origin + CSP | `apps/owner_dashboard/public/_headers:11` | `connect-src` hard-codes the API host. Must allow the new host; keep the old one for the transition window (cached/older bundles). |
| 4 | Dashboard build contract | `apps/owner_dashboard/src/lib/api-base-url.ts:6`, `docs/staging-environment.md:12-13,52,64` | `VITE_API_URL` at build time + docs. |
| 5 | Dashboard tests | `src/__tests__/staging-api-routing.test.ts:5`, `src/__tests__/api-base-url.test.ts:8,32,33,51` | Pinned to the staging literal; these are fixtures, not policy. |
| 6 | POS preset chips | `apps/pos_app/lib/ui/features/config/terminal/terminal_identity_view.dart:461,469` | **Already ships both**: chip `preset_production_chip` → `https://api.nhilospos.com/api`, chip `preset_staging_chip` → staging. The operator UI needs no code change. |
| 7 | POS resolver copy/example | `apps/pos_app/lib/data/services/api_base_url_service.dart:194`, `terminal_identity_view_model.dart:203` | Error copy names `api-staging.example.com` as the example. Cosmetic; worth fixing to the official host so operators copy the right one. |
| 8 | POS layout tests | `apps/pos_app/test/ui/features/config/terminal/terminal_identity_layout_test.dart:131,146` | Assert the staging preset literal. |
| 9 | Build/publish scripts | `scripts/build_pos_apk.sh:85` (example text only), `scripts/test_packaging_pipeline.sh:256` (`STAGING_URL`) | The CI smoke-test target. It keeps working **only if** the old host stays alive. |
| 10 | Release artifacts | `dist/release_candidate/release_manifest.json:8`, `dist/release_candidate/*.apk` | Built with the staging URL baked in. Build outputs, not sources — they must be rebuilt, not edited. |
| 11 | Docs telling operators the wrong truth | `docs/operations/staging-cutover.md:18,60,282,293,306,315,538,548,576`, `docs/operations/business-profile-modes-deploy-coordination.md:16`, `odd/tasks/staging-deployment.md:7-8,55,142,162,171`, `apps/admin_backend/docs/staging-environment.md:21`, `apps/owner_dashboard/docs/staging-environment.md` | These are the operator's instructions. If they keep saying "staging", the next operator will configure staging again. |
| 12 | Release publication (**defect, separate from this cutover, not approved for work**) | `apps/admin_backend/src/scripts/publish-release.ts` (`ReleaseManifestJson`), `src/modules/releases/entities/app-release.entity.ts` | The publisher never reads `terminal_identity` or `api_url` from the manifest, although `build_pos_apk.sh:448` writes both, and `app_releases` has no column for either. So the catalog cannot record **which backend a published APK targets** — and DEC-7's human promotion gate has no data to verify against. |

Row 12 also explains why terminal identity **cannot** ride an OTA release: `app_releases` is keyed by
`(channel, abi, version_code)` — one artifact per channel — so a baked `DEVICE_ID` would give every
terminal in that channel the **same** id. That is precisely why `build_pos_apk.sh:230` requires
`--device-id` only under `--pilot`, and why a fleet build resolves to a locally generated
`pos-local-<uuid>` (`terminal_identity_service.dart:55`).

Naming smell worth recording: `apps/admin_backend/railway.json` sets
`"startCommand": "npm run start:staging"` on the **only live service**. The script itself is
`migration:run:prod && start:prod`, so behaviour is correct and the name is merely misleading.
Renaming it is a `railway.json` edit, i.e. a deploy — bundle it with the next real deploy, do not
do a deploy *for* it.

## 4. What does NOT need to change

Measured, so nobody plans work that does not exist:

- **Backend environment: nothing.** CORS is a *browser-origin* allowlist
  (`apps/admin_backend/src/core/config/http-security.config.ts`, wired at `src/main.ts:17`);
  the backend never self-references its own hostname — there is no `APP_URL`/`PUBLIC_URL` in
  `apps/admin_backend/src`. Since the dashboard origin `soho.nhilospos.com` does not change,
  **the rename requires no backend redeploy and no backend env edit.**
- **Tenant/RLS/JWT surface:** unaffected. Isolation is the JWT `tenant_id` claim, explicitly not a
  hostname (`http-security.config.ts` header comment).
- **Health check:** `railway.json` uses `/api/v1/health`, a path, not a hostname.
- **`soho.nhilospos.com`:** already the customer-facing dashboard domain. Only its API origin
  (`VITE_API_URL` + CSP) changes.
- **POS preset UI:** already correct (item 6 above).

## 5. Tasks

Ordering is deliberate: the field measurement gates everything, because it is the only input that
can turn a safe rename into a fleet outage.

- [ ] **T0 — Field measurement (gates T7; needs the equipment; read-only; ~2 minutes)**
  On the single terminal (Q2): open *Identidad de la Terminal* and read the effective server URL
  **and its source label** (`server_url_text` + `server_url_source` in
  `terminal_identity_view.dart`). Record: effective URL, source
  (`persistedConfig` | `buildDefine` | `unconfigured`), APK versionCode, terminal id.
  No device is attached to this machine (`adb devices` empty per `go-live-plan.md`), so this cannot
  be measured from the repo. `buildDefine` or `unconfigured` ⇒ T7 is free. `persistedConfig` ⇒ T7
  is a deliberate edit on that device, and the alias is what makes it reversible.
- [ ] **T1 — Railway: attach, never replace.** Add `api.nhilospos.com` as an *additional* custom
  domain on the existing service. Do not remove `api-staging.nhilospos.com` in this task or any
  later one.
  **T1 measured 2026-10-02 (owner action done, one correction outstanding):** the new host answers
  `HTTP/2 200` on `/api/v1/health`, but the two hosts are configured **differently**:

  | | `api.nhilospos.com` (new) | `api-staging.nhilospos.com` (old, works) |
  | --- | --- | --- |
  | DNS | `104.21.69.49`, `172.67.204.176` (Cloudflare anycast) | `69.46.46.101` (single, direct) |
  | Response header | `server: cloudflare` + `cf-ray` + `cf-cache-status: DYNAMIC` | `server: railway-hikari` |
  | TLS the client sees | Cloudflare edge cert, `subject=CN=nhilospos.com` | Railway cert, `subject=CN=api-staging.nhilospos.com` |

  So the new host is **proxied (orange cloud)** while the old one is **DNS-only (grey cloud)**.
  Recommended correction: set `api.nhilospos.com` to **DNS-only**, matching the host that
  demonstrably works. Rationale: this API has its own TLS and needs no Cloudflare caching, so the
  proxy contributes a second TLS termination, a WAF/challenge layer, request buffering, and client
  IP masking — all downside here. Verification signal after the change: `server: railway-hikari`,
  no `cf-ray`, and an IP from Railway instead of Cloudflare.
  **Concrete consequence of keeping the proxy (measured, not speculative):**
  `apps/admin_backend/src/main.ts:31` logs `req.socket.remoteAddress`, and `grep` over
  `apps/admin_backend/src` finds **no** `trust proxy`, `CF-Connecting-IP` or `X-Forwarded-For`
  handling anywhere. Behind the proxy every request's `remoteAddress` becomes a Cloudflare IP, so
  the backend silently loses the ability to identify a client — weakening forensic attribution on a
  fiscal surface. Keeping the proxy therefore requires backend work (`trust proxy` + reading
  `CF-Connecting-IP`) and Cloudflare SSL mode `Full (strict)`; that is a new decision, not part of
  this cutover.
  **Not verifiable from here:** whether Cloudflare→Railway is `Full` or `Full (strict)`. Confirm in
  the Cloudflare dashboard (SSL/TLS → Overview). A `Flexible` setting would put origin traffic in
  cleartext and must be rejected.
- [ ] **T2 — DNS.** Create the `api` record in Cloudflare pointing at the same Railway target.
  Verify TLS issuance and that the old host still answers `200` on `/api/v1/health`.
- [ ] **T3 — Prove equivalence before anyone depends on it.** Authenticated probe on the new host:
  login, one tenant-scoped read. A green static health check proves the process is up, not that
  the database path works (`staging-cutover.md:576`).
- [ ] **T4a — Dashboard CSP, safe now (additive).** Edit `apps/owner_dashboard/public/_headers` so
  `connect-src` allows **both** hosts. This only *permits* more; it can ship before T1/T2 exists and
  it keeps already-cached dashboard bundles working. Add a focused test asserting both hosts are
  present in `connect-src`, so a future edit cannot silently drop the old one during the window.
- [ ] **T4b — Dashboard repoint (only after T2/T3 are green).** Build Pages with
  `VITE_API_URL=https://api.nhilospos.com`; deploy; verify login from `https://soho.nhilospos.com`
  and check the browser console for CSP violations. Do **not** deploy this before the new host
  actually answers, or the dashboard points at a host that does not exist yet.
- [ ] **T5 — Build-surface cleanup (code, test-first where it is real logic).** Update the
  operator-facing examples/copy (item 7), the pinned test literals (items 5, 8) and the docs
  (item 11) to name the official host while keeping the staging host documented as an alias.
  Also record the field-reproduced URL-entry failure modes (Gboard `http`→`https`; portless URL
  accepted then failing at runtime) in `docs/operations/`: §2.1 depends on them and today they
  exist only in memory.
- [ ] **T6 — Fleet artifact (NOT on this cutover's critical path).** Building the fleet APK against
  the official host belongs to onboarding *new* equipment, and it depends on the runtime-provisioning
  work (DEC-6, branch `feat/api-url-runtime-provisioning-v2`). With one terminal (Q2) this is a
  separate track; do not let it block T7.
  **Correction (measured 2026-10-02):** the keystore *does* exist. `~/.keys/nhilos-upload.jks`
  (alias `nhilos_pos`, SHA-256 `d44db6eb…`) plus `apps/pos_app/android/key.properties` were created
  2026-10-01 14:35, and the APK installed on the terminal is signed with exactly that key. DEC-4 and
  `go-live-plan.md` still say the artifact does not exist; that text is stale and must not be used to
  justify `--allow-debug-signing`.
- [ ] **T7 — Migrate the terminal.** On that device, set the official URL via the *Producción*
  preset chip, restart, confirm the source label reads `persistedConfig` with the new host, then
  confirm one real sync round-trip. Because the field is human-typed, verify the string on screen
  before restarting rather than trusting the tap.
- [ ] **T8 — Closure.** Confirm the terminal reports the official host in *Identidad de la
  Terminal*, and that the old host still answers `/api/v1/health`. Do **not** retire the alias here;
  per §2.1 that is a separate, later decision.

## 6. Owner decisions

Answered 2026-10-02; incorporated above.

- **Q1 — yes.** `soho.nhilospos.com` is the final customer dashboard domain.
- **Q2 — one terminal.** Which also means the pre-migration state is knowable by hand (T0) rather
  than by inference.
- **Q3 — "keep it, decide later."** The alias is kept as the rollback path for T7 (§2.1); its
  retirement is deferred to a separate decision after the terminal runs clean on the official host.
- **Q4 — separate track.** OTA promotion is not this document's scope.

Still open: how long "a real operational window" means before anyone proposes retiring the alias.

## 7. Evidence log

- 2026-10-02 — T1 verified read-only: `api.nhilospos.com` answers 200 but is Cloudflare-proxied
  while `api-staging.nhilospos.com` is direct-to-Railway; recorded the difference, the recommendation
  to switch to DNS-only, and the measured client-IP consequence in `main.ts:31`. Also ran an initial
  `assess` over the writer's diff, which returned `risk: unassessable` (untracked files require an
  explicit declaration), so per policy the candidate is treated as high risk and an independent
  verifier runs.
- 2026-10-02 — Baseline verified against `origin/main` = `27a15728`: all cited repo evidence is
  identical on `main` and on `feat/ota-b5a-clean`; DEC-7 and `odd/tasks/ota-automatic-discovery.md`
  are **not** on `main`. Added §1.2. Owner directed that this work be based on `main`, which it
  already was: the plan lives in its own worktree (`../omnifood-ni-hostname-cutover`) precisely so
  the OTA branch in the primary worktree is never touched.
- 2026-10-02 — Owner chose the identity path (Q5): bake `--device-id`; installation deferred to a
  separate session. Added the publication-auditability defect (§3 row 12) and the reason terminal
  identity cannot ride an OTA release. Corrected the stale "keystore does not exist" claim in T6
  against measured evidence. Split T4 into T4a (safe, additive) and T4b (gated on T2/T3).
- 2026-10-02 — Owner answered Q1–Q4: final dashboard domain confirmed; **exactly one terminal** in
  the field; alias kept as the T7 rollback path with retirement deferred; OTA promotion fenced out.
  Recalibrated §2 → §2.1 accordingly (one terminal makes the migration manual but cheap, and the
  alias a cheap undo rather than mandatory fleet insurance).
- 2026-10-02 — Plan authored from read-only measurement at `origin/main` = `27a15728`: repo-wide
  `api-staging` inventory (§3), resolver precedence read in
  `api_base_url_service.dart` (§2), CORS/self-reference check in
  `http-security.config.ts` + `main.ts` + `apps/admin_backend/src` grep (§4).
  No command was run against Railway, Cloudflare, the production database, or any device.

## 8. T3 result (2026-10-02) — PASS

Measured, not argued. Same authenticated endpoint, same token, both hosts:

| | `api-staging.nhilospos.com` | `api.nhilospos.com` |
| --- | --- | --- |
| HTTP | 200 | 200 |
| Edge IP | 69.46.46.101 | 69.46.46.65 |
| Body | 484 bytes | 484 bytes |
| SHA-256 | `d1c094617553a579bda0fab71275c099` | `d1c094617553a579bda0fab71275c099` |
| `access-control-allow-origin` | `https://soho.nhilospos.com` | `https://soho.nhilospos.com` |

Endpoint: `GET /api/onboarding/fiscal-setup`. The bodies are **byte-identical** while arriving
through two different edge IPs: same service, same database, same tenant binding, same RLS
behaviour. The owner also confirmed both custom domains are attached to the **same Railway
service**, so there is no second environment and no split brain. The earlier "different
service" hypothesis is retracted.

### 8.1 Tenant correction

The pilot tenant recorded in earlier documents (`b94b8536-e3b6-4db5-9d82-d887006756d1`, RUC
placeholder `J0000000000000`) was **re-provisioned on 2026-10-02**. The live tenant is
`5af6c6c9-47eb-4bed-badd-b30cd1943ad1` (SOHO, slug `soho`, RUC `0011112930059D`). The observed
"everything is empty" is **legitimate**: a clean tenant with real fiscal configuration and 58
imported SIMPLE products, but no sales or shifts yet. Not a defect, and not the dead audit
stream either — that finding stands separately.

`fiscal-setup` confirms live, valid DGI configuration: authorization `0011112930059D-84`,
issued 2026-05-06, **expires 2028-05-06**; `configVersion.revision: 1`, fingerprint
`c65387fc…`. The dangerous provisioning default `commercialFxSpread: 0.5` is gone
(now `36.6243`).

## 9. New finding — the environment self-identifies as staging in every token

Every token the live environment issues carries `iss: omnifood-staging`. The value comes from
the `JWT_ISSUER` environment variable (`apps/admin_backend/src/modules/identity/config/identity-jwt.config.ts`),
which is env-driven, mandatory and has no default. **The same variable also signs device-sync
tokens.**

The cost of correcting it is bounded:

- humans: access tokens last 1 h, refresh 7 d → a re-login, not a re-provisioning;
- terminals: device-sync **access** tokens last 15 min, but the **renewal** credential is an
  opaque high-entropy secret hashed with bcrypt (`renewalSecretHash` in
  `device-sync-credential.service.ts`), **not** a JWT, so it is issuer-independent. Terminals
  recover by renewing; **no re-activation is required**.

It therefore does not block the pilot APK, but it is a decision to take in this window (one
terminal in the field) rather than after delivery. `JWT_AUDIENCE` (`omnifood-dashboard`) is the
same kind of value; `DEVICE_SYNC_JWT_AUDIENCE` must differ from it, which the code enforces.

## 10. Environment sweep (open)

No environment variable *value* is readable from the repository, so the rename cannot be
declared complete from source inspection alone. The remaining check is a sweep of the live
service's variables for anything still branded `staging`.

## 11. Build gate — the baked URL is not the flip

The APK's baked `API_URL` is **not** the effective backend. Precedence, documented in
`apps/pos_app/lib/data/services/api_base_url_service.dart:94-100`, first value wins:

1. persisted `local_configs.api_base_url` — **beats the define**;
2. build-time `API_URL` define;
3. development default `http://127.0.0.1:3000/api` (debug only; a release build with neither
   reports `unconfigured`).

A pilot build with `--api-url https://api.nhilospos.com/api` installed **over an existing
linked app** therefore keeps talking to whatever was persisted — which would produce a false
"the official host works" reading while the terminal is still on staging. T0 (measure the
effective URL and its source per terminal) is the gate, and the cleared-data path
(`pm clear` + re-link, which Q5 already implies) is what makes the define authoritative.

`scripts/build_pos_apk.sh --pilot` fails closed without both `--device-id` and `--api-url`,
which is exactly the guardrail this section needs.
