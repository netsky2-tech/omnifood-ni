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

Status: complete — committed as `f9d1f91c71bc1627781ac055e2a72ad744f9f28e`.
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

Evidence: strict-TDD writer reported RED from missing fixtures, GREEN at 28/28 focused tests, triangulation for aliases and five invalid classes, and post-format refactor. RED history was not independently reproducible after implementation. Candidate authored scope: 331 fixture/spec lines. Work-unit commit `f9d1f91c71bc1627781ac055e2a72ad744f9f28e` contains the fixture/spec candidate plus this durable task document (567 inserted lines total). Runtime harness: N/A because these are static import fixtures validated through the real parser/service contract; no runtime transport or device boundary changed. Rollback boundary: revert the five fixture/spec files and their FREEZE-02 tracking record without touching later acceptance evidence.

### FREEZE-03 — Correct deterministic acceptance-document drift

Status: complete — committed as `bd5ddfeacfe1cf966f8ad1695a452cdb76d4fe6f`.
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

Evidence: documentation-only task, so RED/GREEN was N/A; structural/readback verification used instead. Writer checks passed for diff hygiene, stale identifiers, package/version/schema/migration facts, mock-vs-physical distinction, and 5-file scope. Independent verification found one MEDIUM stale freeze claim in AP-00 summary cells; bounded correction replaced both affirmative freeze claims, and focused reverification passed. Final document delta before tracking update: 102 insertions, 64 deletions (166 changed lines), within the 400-line budget. Runtime harness: N/A because no executable behavior changed. Rollback boundary: revert the five acceptance-document changes without touching FREEZE-02 fixtures or tests. Work-unit commit: `bd5ddfeacfe1cf966f8ad1695a452cdb76d4fe6f`.

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
- [ ] Bring up the local acceptance backend and record its PostgreSQL version.
- [ ] Run the seed on a fresh tenant with `ONBOARDING_FOUNDER_RUC` set and confirm no placeholder warning remains.
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

Status: complete — committed as `10b2433` on slice 3.
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

Slice-3 changed lines: 22 insertions / 16 deletions across the harness and four documents (38 changed lines) plus the parent-owned task tracking file; within the 400-line budget. Runtime harness: the attached-device Q80 harness cannot execute without physical hardware, which is expected. Rollback boundary: revert the harness regime line and the four acceptance-document edits without touching FREEZE-02 fixtures or FREEZE-03 corrections. Work-unit commit: `10b2433` (6 files, 75 insertions, 30 deletions including the durable task document).

### FREEZE-04C — Record the narrowed acceptance scope and known limitations

Status: in_progress — implementation and independent verification complete; awaiting explicit commit authorization.
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

Slice-4 changed lines: 107 insertions / 5 deletions across six tracked files plus the new 85-line limitations document; within the 400-line budget. Runtime harness: N/A, no executable behavior changed. Rollback boundary: revert the six tracked documents and delete `AP_KNOWN_LIMITATIONS.md`, without touching FREEZE-02 fixtures, FREEZE-03 corrections, or the FREEZE-04B harness change. Commit identity pending explicit user authorization.

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
- FREEZE-02 completed and committed as `f9d1f91c71bc1627781ac055e2a72ad744f9f28e` after explicit user authorization.
- The commit is one coherent work unit, but its 567 inserted lines exceed the 400-line PR budget because it includes the 331-line verified candidate and the 236-line durable ODD task document.
- User selected `stacked-to-main`. Slice 1 remains on `feat/founder-pilot-freeze`; slice 2 started from it on `feat/founder-pilot-freeze-docs` for FREEZE-03.
- FREEZE-03 completed and committed as `bd5ddfeacfe1cf966f8ad1695a452cdb76d4fe6f` after explicit user authorization.
- FREEZE-04 human decisions recorded: `CUOTA_FIJA`, local frozen backend, Q80 available, real RUC available.
- FREEZE-04B completed and committed as `10b2433` after explicit user authorization.
- Stacked slices so far: `f9d1f91` (fixtures) → `bd5ddfe` (doc drift) → `10b2433` (regime alignment).
- FREEZE-04 is on the inventory-first path for the DSI credit-note gap.
- Decision (2026-09-17): narrow the acceptance scope. `/v1/sync/*` device-transport validation is explicitly out of ONB1.10F scope and its two defects are recorded as known limitations, not silently absorbed.

## Next step

Complete FREEZE-04C, then finish the FREEZE-04 field capture.

## Next step

FREEZE-04 human field capture: local backend up, PostgreSQL version, fresh-tenant seed with the real RUC, and Q80 device/workstation/APK observations recorded without exposing raw fiscal identity.
