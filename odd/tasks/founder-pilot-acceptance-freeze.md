# Founder Pilot Acceptance Freeze

## Objective

Prepare and freeze a reviewable, reproducible founder-pilot acceptance package before the ONB1.10F physical rehearsal and the 5/5 TTFSS cohort.

## Problem

The current acceptance package mixes stale release identity, missing CSV fixtures, derivable values still marked pending, field-only data that has not been captured, and several doc/code contradictions. The issuer placeholder RUC is structurally accepted by code, so the DGI safety gate is procedural and must be explicit.

## Why

A real fiscal document cannot be corrected after issuance. Acceptance evidence must therefore bind one stable release, real issuer identity, deterministic fixtures, verified deployment/runtime conditions, and physical Q80 observations without fabricating field data or exposing the raw RUC in evidence.

## Scope

- Restore the repository's non-SDD configuration baseline.
- Create deterministic F2–F5 acceptance CSV fixtures and hashes.
- Correct deterministic acceptance-document drift against code.
- Capture human-only fiscal, hardware, workstation, APK, and environment facts.
- Freeze one release identity and environment before rehearsal.
- Record one fresh-tenant ONB1.10F rehearsal and then the 5/5 cohort.

## Non-goals

- Reimplement the already merged founder-pilot fiscal/printer behavior.
- Execute the DSI cutover.
- Invent field observations, signatures, hashes, deployment mappings, or fiscal values.
- Emit any real fiscal document while the issuer RUC is the placeholder `J0000000000000`.

## Constraints

- Offline-first: local SQLite remains the POS source of truth.
- DGI documents are immutable; cancellation uses `is_canceled`, never deletion.
- Sequential fiscal numbering must be preserved.
- PostgreSQL tenant isolation remains enforced through RLS.
- Raw issuer RUC must not be copied into acceptance evidence; use presence/hash evidence where required.
- The 5/5 cohort cannot start before the physical rehearsal passes.
- Final release identity must be anchored only after all release-affecting code, migration, functional configuration, and fixture changes are stable.
- Repository writes remain single-threaded.

## Delivery and verification

- Delivery strategy: `stacked-to-main`, selected after the first slice exceeded the review budget.
- Review budget: approximately 400 authored changed lines per slice.
- Stack boundary: slice 1 `feat/founder-pilot-freeze` (fixtures); slice 2 `feat/founder-pilot-freeze-docs` targets slice 1; slice 3 `feat/founder-pilot-freeze-regime` targets slice 2.
- Upstream note: `origin/main` has advanced to `c88833a4d83282b5309fe9574f3d2aa84e27ce22` since the verified base `f71e8e5`. The acceptance release boundary for FREEZE-05 must be anchored after delivery, not on the pre-delivery base.
- TDD mode: strict, from `openspec/config.yaml`.
- Backend runner: `npm test`; focused Jest commands are preferred for fixture-contract work.
- Documentation-only tasks use structural checks, grep/readback, and hash verification.
- Commits require explicit user authorization under repository safety policy.

## Tasks

### FREEZE-01 — Restore the clean configuration baseline

Status: complete

- [x] Revert the abandoned SDD-only `artifact_store: openspec` edit to the committed `hybrid` value.
- [x] Confirm no unrelated worktree changes were introduced.

Acceptance criteria:
- `openspec/config.yaml` matches its committed artifact-store setting.
- The remaining working tree contains only this ODD task document and subsequently authorized FREEZE work.

Checks:
- `git -C /home/octavio_morales/omnifood-ni-worktrees/founder-pilot-freeze diff -- openspec/config.yaml` — PASS, empty.
- `git -C /home/octavio_morales/omnifood-ni-worktrees/founder-pilot-freeze status --short` — PASS, only `?? odd/`.
- Branch identity — PASS, `feat/founder-pilot-freeze` at `f71e8e543cf3613832b6001989dc5f171a92b234`.

Evidence: completed 2026-09-17; the main checkout's unrelated `.pi/` paths were not touched.

### FREEZE-02 — Create deterministic F2–F5 CSV fixtures

Status: complete — committed as `1c405f239ff53cf466245d4f8e2c9033a717a582`.
Depends on: FREEZE-01

- [x] Derive fixture headers and unsupported-column behavior from the canonical import contract.
- [x] Add F2 clean, F3 mixed, F4 duplicate-policy, and F5 legacy-unsafe fixtures.
- [x] Confirm static fixtures plus one focused contract spec are sufficient; no generator added.
- [x] Compute and verify SHA-256 hashes.

Acceptance criteria:
- F2 contains 25 valid rows plus one canonical header row and no stock/cost fields.
- F3 contains 20 valid and 5 intentionally invalid rows, at least one supported alias, and at least one unknown column.
- F4 exercises REPLACE/SKIP/FAIL while keeping REPLACE limited to Product Master fields.
- F5 contains only documented legacy-unsafe columns.
- Hashes are reproducible and no field evidence is fabricated.

Checks:
- Focused Jest verification — PASS, 3 suites and 28 tests.
- ESLint — PASS.
- Prettier check — PASS.
- Independent verifier — PASS; candidate accepted with no content defects.
- Parent spot-check — PASS, fixture spec 12/12.
- `wc -l F2_csv_clean.csv` — PASS, 26 lines.

Fixture hashes:
- F2: `2751c8e62664daeab095a19c79072a604d2995a81f2f6900a82cdb3b7eb709bc`
- F3: `fd525b2f5874db3af0c3110d06ffcb481e77c2ae16ad02df1d333c977a8762a9`
- F4: `2279c1c9bcefe3b881258db093d2804201f0d93df421f3dd657e24d7b1c76d25`
- F5: `6ec18aa73493e5046c3ee607f283d13b40a0397fd843c0ba28644e21fe8a4307`

Evidence: strict-TDD writer reported RED from missing fixtures, GREEN at 28/28 focused tests, triangulation for aliases and five invalid classes, and post-format refactor. RED history was not independently reproducible after implementation. Candidate authored scope: 331 fixture/spec lines. Work-unit commit `1c405f239ff53cf466245d4f8e2c9033a717a582` contains the fixture/spec candidate plus this durable task document (567 inserted lines total). Runtime harness: N/A because these are static import fixtures validated through the real parser/service contract; no runtime transport or device boundary changed. Rollback boundary: revert the five fixture/spec files and their FREEZE-02 tracking record without touching later acceptance evidence.

### FREEZE-03 — Correct deterministic acceptance-document drift

Status: complete — committed as `980851fea260e957f4cfea7932571746a5427130`.
Depends on: FREEZE-02

- [x] Correct the Android package ID to `com.nhilos.pos_app`.
- [x] Record derivable POS version `1.0.0+1`, Floor schema version `52`, and current migration facts.
- [x] Remove stale identity values from active fields and mark release identity NOT FROZEN pending FREEZE-05.
- [x] Investigate the fiscal-regime mismatch; no unique authority exists, so it is an explicit pre-rehearsal blocker.
- [x] Clearly distinguish the mocked rehearsal from the real Q80 integration test.
- [x] Keep unknown field values as explicit human-gated placeholders.

Acceptance criteria:
- Active acceptance instructions no longer target `com.omnifood.pos`.
- Stale `c6b61cd`, migration `1801000000000`, and `feat/backoffice-spa` values are not presented as the current release.
- Documentation does not claim a release is frozen while the manifest remains stale.
- No device vendor, deployment, fiscal, or physical observation is invented.

Checks:
- Focused grep for stale identities and wrong package ID.
- Readback against POS build files, Floor database annotation, and TypeORM migration tail.
- Markdown structural review.

Evidence: documentation-only task, so RED/GREEN was N/A; structural/readback verification used instead. Writer checks passed for diff hygiene, stale identifiers, package/version/schema/migration facts, mock-vs-physical distinction, and 5-file scope. Independent verification found one MEDIUM stale freeze claim in AP-00 summary cells; bounded correction replaced both affirmative freeze claims, and focused reverification passed. Final document delta before tracking update: 102 insertions, 64 deletions (166 changed lines), within the 400-line budget. Runtime harness: N/A because no executable behavior changed. Rollback boundary: revert the five acceptance-document changes without touching FREEZE-02 fixtures or tests. Work-unit commit: `980851fea260e957f4cfea7932571746a5427130`.

### FREEZE-04 — Resolve human safety and environment prerequisites

Status: in_progress — human decisions recorded; field capture pending.
Depends on: FREEZE-03
Owner: human, agent-assisted

Recorded decisions (user, 2026-09-17):
- Fiscal regime: `CUOTA_FIJA` is the founder's real regime. The declared fixture is therefore authoritative, and the attached-device harness must be aligned to it (see FREEZE-04B). Physical ticket expectation: `COMPROBANTE DE VENTA` / `NO RECAUDA IVA`, no IVA collected.
- Acceptance backend: local frozen backend, not a cloud deployment. No external deploy-trigger mapping is required; the PostgreSQL version must be captured from the local instance actually used.
- Physical hardware: the real Q80 is available now for field capture.
- Issuer RUC: the real RUC is available and will replace the placeholder through `ONBOARDING_FOUNDER_RUC`; evidence records presence/hash only.

Pending human capture:
- [x] Acceptance backend provisioned and verified (agent, 2026-09-17). See the environment record below.
- [x] Run the seed on a fresh tenant with `ONBOARDING_FOUNDER_RUC` set, as the runtime role, and confirm no placeholder warning remains. Done 2026-09-17; see the seed record below.
- [ ] Capture Q80 serial hash, OS version and security patch, firmware, and the real printer adapter.
- [ ] Verify the device paper width is 80 mm (local device setting; not server-pushed).
- [ ] Capture workstation browser, OS, and resolution.
- [ ] Capture the real APK version and SHA-256.
- [ ] Record the WiFi SSID and the WAN outage method.
- [ ] Record explicit DSI device-only and credit-note posture for the pilot.

DSI / credit-note impact analysis (read-only, base `f71e8e5`):
- `/v1/sync/*` is device-only with no runtime flag; `SyncTransportGuard` rejects every non-device token with 401, so device-only enforcement is already live on the local frozen backend. The accepted credit-note gap therefore applies to this pilot even though the cloud cutover is not executed.
- The pilot script as written never creates a credit note: `createCreditNote` is reachable only through the returns UI, which phases A–G do not invoke.
- The VOID step (G2) is a purely local `is_canceled` write that re-syncs as `SALE`, so `SyncCreditNoteAuthGuard` never blocks it and VOID evidence is producible offline-only.
- The F2 outbox drain is the activation outbox (`onboarding/activation/*`), not `/v1/sync/batch`.
- Residual risk: one pending credit note anywhere in a batch makes the whole batch fail closed with 403; the POS then sets `AUTH_BLOCKED`, skips the remaining sync domains in that pass, keeps the outbox growing, and shows a misleading re-authentication message. Local selling continues.
- The accepted decision record requires the affected operations to be inventoried, including whether any open credit note is pending on an enrolled terminal. That inventory is not yet recorded.
- Required pre-rehearsal checks added: inventory pending credit notes; confirm the pilot build can provision and use a device credential (accepted-decision cutover precondition 2); record that the gap was announced and its manual procedure agreed.
- Decision (2026-09-17): inventory first. The physical rehearsal does not run until the backend and device inventory is recorded and the device-credential provisioning capability of the pilot build is confirmed.

Device-credential readiness analysis (read-only, static reading only):
- The credential is backend-issued: `device-sync-credential.service.ts` generates a one-time renewal secret, stores only its hash, and the device mints short-lived device tokens through `/identity/device-sync/token`. Nothing is seeded in the pilot path.
- POS provisioning runs only from `AuthRepositoryImpl.loginOnline`, only for OWNER, only online, silently best-effort. `main.dart` wires the coordinator without `resolveAttemptId`, so it always uses the device-scoped bootstrap variant, which requires a pre-existing finalized activation attempt bound to the same device id.
- No POS UI or script creates or finalizes the activation attempt; the only caller in the repository is the attached Q80 harness.
- Device identity: the APK resolves its device id from the `DEVICE_ID` dart-define, else a generated `pos-local-<uuid>`. The documented build script sets no `DEVICE_ID`, while the harness and seed use `Q802024120001`. A freshly built pilot APK therefore cannot match the attempt's `trusted_terminal_id`.
- The attached Q80 harness authenticates with a human bearer and never calls `/v1/sync/*`; its outbox drain is the activation outbox.
- Mixed-transport defect (verified by static reading, not executed): `SyncService` sends every request through the device-only Dio, but `/inventory/purchases`, `/inventory/production-orders/close`, `/inventory/recipes/versions`, and `/inventory/alerts` are decorated with the human `AuthGuard` (plus roles and authoritative-user guards), and `AuthGuard` verifies only the human identity JWT. Those domains cannot authenticate with a device credential. Sales (`/v1/sync/batch`) runs earlier in the pass than purchases and production, so a device-only sales batch is reachable, but the later human-guarded domains fail and can set `AUTH_BLOCKED`.
- Residual unknown: whether a device token happens to satisfy `AuthGuard`'s JWT verification, and whether this also affects a deployed backend rather than only the local frozen one.
- Consequence: the rehearsal as written satisfies neither cutover precondition 2 nor a demonstration that `/v1/sync/*` works on the Q80. Making it work requires an explicit enrollment step, an APK built with the matching `DEVICE_ID`, and resolution of the mixed-transport defect.

Acceptance backend environment record (provisioned and verified 2026-09-17):
- Base change: the four slices were rebased onto `origin/main` `4a9efea696812290cc2d18062949c302926712c2`. New commits: slice 1 `1c405f2`, slice 2 `980851f`, slice 3 `aeb5793`, slice 4 `79f1c1c`. Rebase had no conflicts; nothing had been pushed, so no remote history was rewritten. The pre-rebase commits (`f9d1f91` fixtures, `bd5ddfe` doc drift, `10b2433` regime, `e263d5e` scope) still exist in the repository but are NOT in the delivered history; each old/new pair has an identical `git patch-id`, so the mapping is proven by content rather than by matching commit titles.
- Why the rebase was required: the pre-rebase base `f71e8e5` could not build the schema from an empty database. Its second migration failed with `relation "users" does not exist` because the bootstrap migrations that create the base tables landed later on `main` (`f4fee0d`, PR #293). `main` also carries the platform extensions the pilot relies on: tenant isolation for onboarding and fiscal data (PR #294) and idempotent RLS policy creation (PR #311).
- Host: PostgreSQL 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1) on x86_64, local, port 5432.
- Database: `omnifood_founder_pilot_acceptance` (dedicated, created for this acceptance; the shared development database `omnifood` was deliberately left untouched).
- Role separation per `docs/operations/staging-cutover.md` §4: `omnifood_acceptance_migration` owns the schema, `omnifood_acceptance_runtime` serves traffic. Both are `NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS` with `rolcanlogin = t`; the runtime role has zero role memberships. Running the API as a superuser would bypass RLS and would leave tenant isolation untested, which is why the roles are split.
- Extension provisioning: `uuid-ossp` installed by the administrator during provisioning, so the guarded `CREATE EXTENSION` in the migration set is a no-op and the migration role never needs extension privileges.
- Migrations: 69 applied by the migration role with `NODE_ENV=production` via `migration:run:prod`. Ledger tail: `1809050000000-CreateHumanAuthorizationPolicySnapshots`.
- Ledger hardening (§5.2, mandatory after the first migration run): `INSERT`/`UPDATE`/`DELETE` on `migrations` revoked from the runtime role and verified to return zero rows.
- Ownership and RLS evidence: 79 base tables in `public`, all owned by the migration role and none by the runtime role; 32 forced-RLS tables with zero deny-all; 102 RLS policies with zero policy expressions missing the `app.tenant_id` predicate; zero rows visible to the runtime role in an unbound session.
- Schema completeness gate (the repository's own CI harness, `apps/admin_backend/scripts/verify-schema-build.sh`): PASS in both scenarios. 75 entity tables declared and 0 missing; 953 entity columns declared and 0 missing; the partial-ledger re-run removed the expected 27 ledger rows and re-applied cleanly.
- Residual environment note: `tenants`, `users`, and `onboarding_sessions` deliberately have no RLS, so the founder-pilot seed can create its fixture rows as the runtime role without a tenant context. The seed must still be run with explicit runtime credentials, because the non-production resolver falls back to a superuser default when `DB_USERNAME` is absent.

Seed record (2026-09-17):
- Local acceptance environment file `apps/admin_backend/.env` created, mode 600 and gitignored. It holds the runtime-role connection, a freshly generated `JWT_SECRET`, and a freshly generated `TOTP_SEED_ENCRYPTION_KEY`. The real issuer RUC is deliberately not stored in it.
- Two configuration traps hit and resolved: without `NODE_ENV` the identity JWT config throws `JWT configuration is invalid`, and without `JWT_ALGORITHM=HS256` the algorithm check fails the same way. In non-production the database resolver does not distinguish roles, so `DB_USERNAME` must be set explicitly or a superuser default is used and RLS is silently bypassed.
- Seed result: exit 0, no placeholder warning. Tenant `1d7157fc-cc23-40ed-b230-d2ef25f158ae` named `Founder Pilot Q80 1789709201679-dcee67c5`; owner role `OWNER`; device principal terminal id `Q802024120001`. Owner credentials were generated by the seed and handed to the operator; they are deliberately not recorded in this document.
- Verification: one tenant in the database, `is_active = true`, issuer RUC present, RUC is not the placeholder, and the RUC matches the issuer format; owner user active with role `OWNER`; zero onboarding sessions, so the tenant starts unactivated as the fixture requires.
- Credit-note inventory (backend half of the accepted-decision precondition): zero credit notes of type `creditNote` in the entire acceptance database, and zero for the pilot tenant. The backend half is satisfied; the device half is still pending.
- Empirical support for L1: the freshly seeded tenant has zero activation attempts and zero device sync credentials, which is exactly the state L1 describes before any enrollment path runs.
- Backend running: `npm run start:dev` listening on port 3000, `/api/v1/health` returning `{"status":"ok"}`. The runbook warning applies: the health endpoint is a static payload and does not touch the database, so it proves the process is up and nothing more.
- Role enforcement verified at runtime: `pg_stat_activity` shows the application session connected as `omnifood_acceptance_runtime`, the non-owner `NOBYPASSRLS` role, so tenant RLS is genuinely enforced during acceptance instead of being bypassed by an owner or superuser connection. A deliberate wrong-password login returned 401 `Credenciales inválidas`, confirming the seeded owner row is reachable through the application.
- Cosmetic log note: repeated `GET / -> 404` entries come from an unrelated polling client on this host; they are not an application error.

Q80 field capture record (2026-09-17/18):
- Hardware identity as reported by the device: manufacturer `NB55`, model `MIRAY`, device/product `TPM4G_E9863`, board `s9863a1h10`. The firmware string is `Q80_SC_V1.0.1_B241225.163320` and the fingerprint is `MIRAY/TPM4G_E9863/TPM4G_E9863:12/SP1A.210812.016/52340:user/release-keys`. The earlier documentation contradiction is resolved empirically: the device reports `MIRAY`, so the legacy `Alacrity` naming is not what the hardware reports.
- OS: Android 12 (SDK 31). Security patch level: `2022-11-05`.
- Serial: present, 13 characters. Recorded only as its SHA-256: `680f14116c61725b6f5aaf76fa99d8b8fbc7855deeb77a4d79903415c1eb56ec`. The raw serial is not recorded here.
- POS package: `com.nhilos.pos_app` is installed, confirming the corrected package id. `versionName=1.0.0`, `versionCode=1`, `minSdk=24`, `targetSdk=36`. This is consistent with the pubspec `1.0.0+1`: Flutter maps the `+1` build number to `versionCode`.
- APK SHA-256: `7e83081f26d6d2fdcbfb87928a00c237c5997b84d99a34bba4b2f85f73ba03e4`, size 190558505 bytes. The installed APK is `DEBUGGABLE`, which is how app-private local state could be inspected without root by design of the harness, not by rooting the device.
- Printer and fiscal configuration as persisted on the device: `printer_paper_width_mm=80` (matches the required calibrated profile), `printer_driver_type=SUNMI_V2S`, `printer_network_port=9100`, `printer_copies=1`, `printer_auto_invoice=false`, `tax_regime=CUOTA_FIJA` (matches the founder decision), `prices_include_tax=true`. The configured driver is the Sunmi adapter even though the hardware reports MIRAY; physical print confirmation is still required at the rehearsal and remains unproven.
- Device credit-note inventory (second half of the accepted-decision precondition): zero rows with type `creditNote`. The only invoice row is type `regular`, `is_canceled=0`, `sync_status=synced`, total 50.0. Combined with the backend result, the inventory precondition is satisfied on both sides.
- Device identity: `terminal_device_id = Q802024120001`, matching the seeded terminal id. `TerminalIdentityService.resolveDeviceId` uses the build-time `DEVICE_ID` value when present, otherwise the persisted terminal id, otherwise a generated `pos-local-<uuid>`; so L1 remains accurate for a fresh install on a device without the build define, while this particular unit already carries the matching id.
- **The device is not fresh.** It is bound to a previous pilot tenant `dddb91ab-74de-4b06-aa8c-f38c6e053b5a` (business name `Founder Pilot Q80 1789164022241-e9530ebc`), with fiscal config revision 1 applied 2026-09-12, DGI numbering prefix `001-001-01-` and next number `2` over range 1..1000, 5 local products, 1 audit entry of type `SALE_CREATED`, and zero local activation attempts. A rehearsal on this state would not start from a clean numbering sequence, and clearing app data would destroy the local record of that previous run.
- Security finding, and a disclosure: `local_configs.device_sync_credential_fallback_v1` stores the previous tenant's device-sync renewal secret in plaintext inside the app-private SQLite, next to the encrypted primary copy in FlutterSecureStorage. The parent displayed that secret while capturing evidence, so it must be treated as exposed and rotated or revoked. The plaintext-at-rest fallback design is itself a finding worth independent tracking.

Pre-rehearsal device reset (2026-09-18, user-approved archive-then-clear):
- Backend mirror confirmed before clearing: the previous tenant `dddb91ab-74de-4b06-aa8c-f38c6e053b5a` and its single invoice `001-001-01-00000001` (not canceled) exist in the local development database `omnifood`, so clearing the device does not lose the only record of that run. The device's next DGI number was `2` against one persisted invoice, consistent with the activation `TEST_PRINT` consuming a number.
- Archive created outside the repository at `~/omnifood-ni-wip-backups/founder-pilot-q80-pre-acceptance-20260917-233547/` containing `app_database.db` plus `MANIFEST.txt`; archived database SHA-256 `03f49ccc1cc2ca850c0e611af38eae9e6d97251b56d2c49df828317db47f8467`. The exposed credential row was replaced with a redaction marker in the archived copy, so the archive preserves the key and its presence but not the secret.
- Device cleared with `pm clear com.nhilos.pos_app`: exit `Success`. Verified fresh: no `databases` directory, no `shared_prefs` directory, package still installed, ADB still connected. This also removed the plaintext credential copy from the device.
- Exposure tracking and rotation: the parent commented on the existing open issue #115 (`fix(pos): remove insecure token storage fallback`), because its acceptance criteria already state that bearer credentials must never be persisted in SharedPreferences or equivalent plaintext storage; the comment adds the second affected surface (`AppPrivateDeviceSyncCredentialStore`), the `toJson` field list, and the field observation, and asks the maintainer whether to widen #115 or split a sibling issue. Comment: https://github.com/netsky2-tech/omnifood-ni/issues/115#issuecomment-5725677315
- Credential revoked through the product's own service path, not hand-written SQL: a throwaway `ts-node` invocation of `DeviceSyncCredentialService.revokeCredential` against `omnifood`, guarded by a `current_database()` check that refuses any target other than `omnifood`. Result: status `ACTIVE` -> `REVOKED`, `revoked_at` set, reason recorded, one `REVOKED` row in `device_sync_credential_events`, and zero remaining ACTIVE credentials in that database. The acceptance database was not touched: still one tenant and zero credentials.

Rehearsal path findings (2026-09-18):
- The installed APK's compiled configuration is `API_URL=http://127.0.0.1:3000/api` together with `DEVICE_ID=Q802024120001`, recovered from `assets/flutter_assets/kernel_blob.bin`. The application therefore reaches the backend only through an `adb reverse` tunnel from this host; a device on the shop network has no route to it otherwise.
- Reachability measured, not assumed: from the device, `toybox nc 192.168.0.4:3000` (the Windows host on the LAN) times out, while `127.0.0.1:3000` through `adb reverse tcp:3000 tcp:3000` connects. WSL is in NAT mode and nothing forwards the LAN address into it.
- The POS has no activation-attempt path and no activation UI: every activation adapter operates on an existing attempt id (`checks`, `first-sale-claim`, `verification-sale`, `finalize`, `device-sync-credential`), and nothing in the application creates or finalizes the attempt. This confirms L1 with a second, independent reading and means the physical rehearsal cannot be driven through the application UI; the attached-device harness is the only path, which is what the acceptance documents assume.
- The harness hardcodes its own base URL, `Dio(BaseOptions(baseUrl: 'http://127.0.0.1:3000/api/'))` at `apps/pos_app/integration_test/onb1_10_founder_pilot_q80_e2e_test.dart:82`, so it depends on the same tunnel and has no configurable backend target.
- Required harness inputs: `PILOT_OWNER_EMAIL`, `PILOT_OWNER_PASSWORD`, `PILOT_OWNER_PIN`, `PILOT_TENANT_ID`, `PILOT_OWNER_ID`, `PILOT_FIXTURE_STARTED_AT`, plus `PILOT_PHASE` (`setup`, `offline`, `reconnect`) and optionally `PILOT_DB_NAME`. All are available from the seed output except the fixture start time, which is the seed's `createdAt` value.
- The harness builds its own database (`onb1_10_founder_pilot_q80.sqlite` by default) rather than the application's `app_database.db`, so a green rehearsal does not exercise the real application database.
- Consequence for the frozen environment: a rehearsal on this configuration validates the activation lifecycle and the offline/reconnect logic, but not backend reachability from a device on the shop network. That gap is the same class as the narrowed-scope limitation and should be stated wherever the rehearsal result is cited.

Acceptance criteria:
- No placeholder warning remains for the selected fresh tenant.
- No raw RUC appears in acceptance evidence.
- Every field-only value has observed evidence or remains visibly blocked.
- The backend target and DSI/credit-note posture are explicit before rehearsal.

Checks:
- Human-run seed and tenant query.
- `adb` package/version/device-property commands.
- APK and device-serial SHA-256 checks.
- Local backend database evidence.

Evidence: decisions recorded; field evidence pending.

### FREEZE-04B — Align the attached-device rehearsal regime to `CUOTA_FIJA`

Status: complete — committed as `aeb5793` on slice 3.
Depends on: FREEZE-04 regime decision

- [x] Align the attached-device Q80 harness fiscal setup to `CUOTA_FIJA`.
- [x] Update the acceptance documents so the regime blocker records the resolved decision and the physical-ticket expectation.
- [x] Confirm no regime-specific assertion is weakened or removed.

Acceptance criteria:
- The attached-device harness publishes `CUOTA_FIJA`, matching the declared fixture and the founder's real regime.
- No acceptance document still describes the regime mismatch as unresolved.
- The physical-ticket expectation is unambiguous: `COMPROBANTE DE VENTA` / `NO RECAUDA IVA`, 80 mm.
- No IVA-collecting expectation remains in the pilot acceptance path.

Checks:
- Flutter analyze — PASS, `No issues found!`.
- Mocked rehearsal test — PASS, `All tests passed!` (3 tests).
- `git diff --check` — PASS.
- Unresolved-regime grep — PASS, none remaining.
- Assertion count at HEAD vs working tree — PASS, 23 vs 23, so nothing was weakened.
- Independent verifier — PASS; identical code diff and `flutter test` result reproduced independently.

Evidence: The writer subagent failed after writing and returned no result envelope, so its edits were treated as untrusted partial work and verified from scratch; the verifier reproduced the analyze and test results and confirmed the harness derives persisted `tax_regime` from the `fiscal-setup` response.

The verifier's LOW finding was that the manifest claimed a repository-wide single authority while `business_profile_view_model.dart` still defaults to `REGIMEN_GENERAL` for new profiles. Correction applied by the parent: the claim was narrowed to the acceptance path, and the pre-existing non-pilot default, its override behavior, and the troubleshooting rule are now stated explicitly. That correction is parent-authored and parent-spot-checked against the verifier's own cited evidence; it was not re-verified by a separate agent.

Slice-3 changed lines: 22 insertions / 16 deletions across the harness and four documents (38 changed lines) plus the parent-owned task tracking file; within the 400-line budget. Runtime harness: the attached-device Q80 harness cannot execute without physical hardware, which is expected. Rollback boundary: revert the harness regime line and the four acceptance-document edits without touching FREEZE-02 fixtures or FREEZE-03 corrections. Work-unit commit: `aeb5793` (6 files, 75 insertions, 30 deletions including the durable task document).

### FREEZE-04C — Record the narrowed acceptance scope and known limitations

Status: complete — committed as `79f1c1c` on slice 4.
Depends on: FREEZE-04 device-credential analysis

- [x] State explicitly that `/v1/sync/*` device-transport validation is OUT of ONB1.10F acceptance scope.
- [x] Record the device-credential enrollment gap as a known limitation with its own tracking.
- [x] Record the mixed-transport defect (device-only Dio against human-guarded inventory routes) as a known limitation, separated from pilot scope.
- [x] Mark cutover precondition 2 as NOT SATISFIED for the pilot rather than implied satisfied.
- [x] Keep the accepted credit-note gap and the inventory-first decision visible.
- [x] Add no fabricated evidence and decide no new product scope.

Acceptance criteria:
- No acceptance document implies the rehearsal validated device-transport sync.
- Precondition 2 has an explicit, honest status.
- The two defects are recorded where they can be tracked independently of the pilot.
- The pilot script's remaining scope is unambiguous.

Checks:
- `git diff --check` and `git diff --stat` — PASS, 6 tracked files, 107 insertions / 5 deletions.
- Accepted-decision integrity — PASS, addendum additive (32 insertions, 0 deletions) and pre-addendum bytes prefix-identical to HEAD.
- Placeholder counts per document versus HEAD — PASS, identical (3/29/3/27/14).
- Static-reading labels — PASS, present on every evidence and closure row.
- Independent verifier — PASS, and it independently confirmed the mixed-transport defect.

Evidence: documentation-only slice, so RED/GREEN is N/A. Independent verification added stronger evidence than the document originally carried: `DeviceSyncAuthInterceptor` attaches the device bearer only to `v1/sync/*`, so `/inventory/*` calls through `syncDio` carry no `Authorization` header at all and receive 401; and a device token cannot satisfy `AuthGuard` because the device JWT audience must differ from the human audience and the strict claim contract requires `token_type: access` with `email`, `role`, `is_active`, and `security_version`.

Corrections applied after verification (parent-authored, then citation-spot-checked against the tree):
- L1 wording said no POS code creates or finalizes the attempt; the accurate statement is that no production-wired path does, while `activation_reconnect_sync_runner.dart:234` finalizes it and is invoked only by test harnesses.
- L1 said the attached harness was the only caller in the repository; the accurate statement is that it is the only backend-attached caller.
- The `q80-runbook.md` build-instruction citation was wrong and was removed; `scripts/build_sunmi_apk.sh:111,117` is the correct evidence, at repository-root relative path.
- L2 gained the omitted `/inventory/count-sessions` and `/inventory/regularization/sync` routes, corrected guard line numbers, corrected `alerts` route semantics for line 1049, and the correct interceptor path `apps/pos_app/lib/data/network/device_sync_auth_interceptor.dart`.
- The L2 residual unknown was relabelled to a static conclusion rather than a runtime question.

Slice-4 changed lines: 107 insertions / 5 deletions across six tracked files plus the new 85-line limitations document; within the 400-line budget. Runtime harness: N/A, no executable behavior changed. Rollback boundary: revert the six tracked documents and delete `AP_KNOWN_LIMITATIONS.md`, without touching FREEZE-02 fixtures, FREEZE-03 corrections, or the FREEZE-04B harness change. Work-unit commit: `79f1c1c` (7 files, 203 insertions, 5 deletions including the durable task document).

### FREEZE-05 — Freeze release identity and manifest

Status: pending
Depends on: FREEZE-02, FREEZE-03, FREEZE-04

- [ ] Establish the immutable application/fixture commit boundary used by `acceptanceReleaseId`.
- [ ] Record the exact last TypeORM migration and acceptance stage.
- [ ] Record F2–F5 hashes and all observed environment facts.
- [ ] Sign the freeze manifest before AP-00.

Acceptance criteria:
- One documented rule explains which commit the release ID anchors, avoiding self-reference from the manifest-only commit.
- Release identity, migration, stage, fixture hashes, builds, and environment all refer to one candidate.
- Any subsequent release-affecting change invalidates the manifest and requires a new ID.

Checks:
- `git rev-parse` of the selected release boundary.
- Migration-tail verification.
- Fixture hash recomputation.
- Cross-document release-ID consistency check.

Evidence: pending.

### FREEZE-06 — Run the fresh-tenant ONB1.10F physical rehearsal

Status: pending
Depends on: FREEZE-05
Owner: human-run, agent-assisted

- [ ] Execute setup, offline, and reconnect phases on the real Q80 with a new tenant.
- [ ] Verify the real printer adapter and physical ticket.
- [ ] Verify reconnect has no 401 and the outbox drains under the documented DSI posture.
- [ ] Record results against the frozen release only.

Acceptance criteria:
- The real Q80 reaches ACTIVATED without mocks.
- The physical ticket contains the correct issuer RUC line and configured paper width.
- Offline operation and reconnect behavior pass without violating fiscal immutability.

Checks:
- Attached-device integration harness with `PILOT_*` inputs.
- Physical gates in `docs/operations/q80-runbook.md`.
- Focused backend reconnect E2E check where the environment supports it.

Evidence: pending.

### FREEZE-07 — Run and sign off the 5/5 TTFSS cohort

Status: pending
Depends on: FREEZE-06
Owner: human, agent-assisted

- [ ] Record five consecutive eligible runs under one `acceptanceReleaseId`.
- [ ] Produce `TTFSS_REFERENCE_RUNS.csv` and `TTFSS_REFERENCE_SUMMARY.md`.
- [ ] Confirm 5/5 ANCHORED and TTFSS at or below 15:00.
- [ ] Complete final acceptance sign-off without mixing release IDs.

Acceptance criteria:
- Five of five runs are measurement-eligible and anchored.
- All five runs meet the TTFSS target.
- Final sign-off references exactly one frozen release.
- VOID/cancellation evidence uses `is_canceled` semantics and never deletion.

Checks:
- Structural validation of cohort CSV and summary.
- Cross-document release-ID consistency check.
- Human signatures and physical evidence review.

Evidence: pending.

## Progress

- Exploration completed from repository evidence.
- SDD was intentionally abandoned in favor of ODD because this is an operational acceptance workflow rather than a new product capability.
- FREEZE-01 completed with the dedicated worktree clean except for the authorized ODD task document.
- FREEZE-02 completed and committed as `1c405f239ff53cf466245d4f8e2c9033a717a582` after explicit user authorization.
- The commit is one coherent work unit, but its 567 inserted lines exceed the 400-line PR budget because it includes the 331-line verified candidate and the 236-line durable ODD task document.
- User selected `stacked-to-main`. The slices were accumulated as ordered commits on `feat/founder-pilot-freeze-scope`, and delivery creates one branch per slice so each PR carries exactly one work unit.
- FREEZE-03 completed and committed as `980851fea260e957f4cfea7932571746a5427130` after explicit user authorization.
- FREEZE-04 human decisions recorded: `CUOTA_FIJA`, local frozen backend, Q80 available, real RUC available.
- FREEZE-04B completed and committed as `aeb5793` after explicit user authorization.
- Stacked slices so far: `1c405f2` (fixtures) → `980851f` (doc drift) → `aeb5793` (regime alignment).
- FREEZE-04 is on the inventory-first path for the DSI credit-note gap.
- Decision (2026-09-17): narrow the acceptance scope. `/v1/sync/*` device-transport validation is explicitly out of ONB1.10F scope and its two defects are recorded as known limitations, not silently absorbed.
- FREEZE-04C completed and committed as `79f1c1c` (slice 4) after explicit user authorization.
- Stacked slices so far: `1c405f2` (fixtures) → `980851f` (doc drift) → `aeb5793` (regime alignment) → `79f1c1c` (narrowed scope and limitations).
- FREEZE-04 harness fix completed and committed as `8a4c8e8` (slice 5) after explicit user authorization.
- Stacked slices for delivery, with their review budgets (additions + deletions): `1c405f2` fixtures 567, `980851f` doc drift 196, `aeb5793` regime alignment 105, `79f1c1c` narrowed scope 208, `8a4c8e8` harness fix 181. Slice 1 is the only one over the 400-line budget, and it is over because it carries the durable task document alongside the fixture candidate.

- FREEZE-04 harness smoke (2026-09-18) ran the attached ONB1.10F harness against a local acceptance backend and the physical Q80. The `setup` phase reached green for the first time (`ONB1.10F_PHASE_RECEIPT {"phase":"setup","attemptId":"59c9c0d5-ead9-47ec-ab9b-2e9984ebcf9d","testPrint":"accepted"}`). The smoke was pre-rehearsal instrument validation, not acceptance evidence.
- Environment defects found and fixed during the smoke: the working `adb` was a wrapper around the Windows `adb.exe`, so `flutter test`'s `adb forward` landed on Windows localhost, invisible to the Linux Flutter tool (fixed with a real Linux adb plus a non-destructive alternate SDK root, reusing the already-paired ADB key); port 3000 was held by a nest watcher from the main checkout serving `DB_DATABASE=omnifood`, so every earlier health and login probe was answered by the development backend against the development database, which produced a false "wrong password" diagnosis.
- Instrument defect A (`fiscal-setup` RUC): pre-existing on `origin/main`. The harness synthesised `'J' + padLeft(10,'0')` while `IsValidNicaraguaFiscalId` requires J + 13 digits, so `POST onboarding/fiscal-setup` always returned 400 and the rehearsal could never proceed past that step. Fixed by reusing the tenant's already-seeded issuer RUC read from `GET onboarding/fiscal-setup`; that response feeds `PrinterConfigService.fiscalRucKey`, so the physical TEST_PRINT now carries the real issuer instead of a fabricated one. The raw RUC is never recorded in this document.
- Instrument defect B (phase state): pre-existing. The harness is three phases sharing state through the app-private database `onb1_10_founder_pilot_q80.sqlite`, but `flutter test` uninstalls the application when a run ends, so the device data directory is destroyed between runs. The `offline` phase therefore cannot find the attempt `setup` saved and fails at `expect(attempt, isNotNull)`; `getLatestAttempt` has no status filter, so the row was genuinely absent rather than filtered out.
- Consequence of the smoke: `setup` is single-use per tenant, because a second attempt is rejected with `CANNOT_START_ACTIVATION_NOT_SALE_READY: Onboarding session is in 'ACTIVATION_IN_PROGRESS' state, but must be 'SALE_READY'`. The original acceptance database `omnifood_founder_pilot_acceptance` is therefore recorded as consumed by the smoke and is no longer a rehearsal target.
- Human decisions (2026-09-18): unify the three harness phases into a single run so the application keeps its data, and provision a clean rehearsal database rather than re-seeding or resetting the consumed one.
- Clean rehearsal environment provisioned (2026-09-18) by a repeatable script, as administrator for provisioning and as a dedicated restricted migration role (`NOSUPERUSER`, `NOBYPASSRLS`) for the migration set: database `omnifood_founder_pilot_rehearsal`, 69 migrations, 79 public tables, 32 forced-RLS tables, 102 RLS policies, zero deny-all forced-RLS tables, 320 runtime table grants. Migrator credentials live only in a mode-600 file outside the repository.
- Rehearsal fixture seeded with credentials pinned by environment (the seed's own override path), so the owner password is now reproducible instead of a one-time random value: tenant `ced25ede-a60e-4802-8189-0462de229b19`, owner `e885ee90-5739-4850-b6dc-1054d75be458`, offline PIN `820906`, fixture start `2026-09-18T15:12:11.386Z`, device terminal `Q802024120001`, no placeholder-RUC warning. The acceptance backend serves that database as `omnifood_acceptance_runtime` and login returns 201 with the matching tenant and owner.

- Harness unification completed (2026-09-18) and validated on the clean rehearsal tenant. One `flutter test` run now drives `setup` → `offline` → `reconnect` inside a single app install, so the activation state Floor persists in `setup` is still there for the later phases. `PILOT_PHASE` keeps accepting a single named phase for focused debugging and now defaults to `all`, and the harness documentation in `AP_Q80_PILOT_CHECKLIST.md` states the invocation.
- Offline became an assertion instead of an assumption: the sale path runs with a Dio interceptor that counts requests, the phase fails if even one is issued, and the offline receipt reports it. The parent no longer has to remove `adb reverse` between phases to support the claim.
- Validated run evidence (instrument validation, deliberately not treated as acceptance evidence): one run on the clean tenant produced three receipts sharing a single attempt id — `setup` with `testPrint: accepted`, `offline` with `httpRequests: 0`, and `reconnect` with `backendStatus: PASS` — followed by `All tests passed!`. Independently confirmed from the backend afterwards: `attempt.status = PASS`, `session.lifecycleState = ACTIVATED`, and all ten activation checks delivered (`AUTHORIZED_USER_LOCAL`, `OFFLINE_SALE_PAID`, `OUTBOX_DURABLE`, `POST_RECONNECT_SYNC`, `PRINTER_AVAILABLE`, `REQUIRED_CONFIG_LOCAL`, `SALE_RECEIPT_PATH`, `SQLITE_DURABILITY`, `TERMINAL_LINKED`, `TEST_PRINT`). The attempt table carries forced RLS: reading it without a tenant context returned zero rows.
- Both instrument defects recorded as issue #322 with their evidence, so the fix is traceable outside this document.
- The validated run consumed `omnifood_founder_pilot_rehearsal` the same way the earlier smoke consumed the previous database: `setup` left the onboarding session ACTIVATED, and a second attempt on that tenant is rejected. The provisioning script is repeatable, so the official rehearsal needs its own freshly provisioned target.

## Next step

Provision a fresh clean target for the official FREEZE-06 rehearsal and decide whether the pending harness fix is committed as its own slice before that run, since the rehearsal must be driven by the delivered instrument rather than by a working-tree copy.
