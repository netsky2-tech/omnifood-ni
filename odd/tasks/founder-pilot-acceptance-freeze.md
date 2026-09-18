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
- Stack boundary: `feat/founder-pilot-freeze` is slice 1; `feat/founder-pilot-freeze-docs` is slice 2 and must target slice 1.
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

Status: in_progress — implementation and independent verification complete; awaiting explicit commit authorization.
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

Evidence: documentation-only task, so RED/GREEN was N/A; structural/readback verification used instead. Writer checks passed for diff hygiene, stale identifiers, package/version/schema/migration facts, mock-vs-physical distinction, and 5-file scope. Independent verification found one MEDIUM stale freeze claim in AP-00 summary cells; bounded correction replaced both affirmative freeze claims, and focused reverification passed. Final slice-2 document delta: 102 insertions, 64 deletions (166 changed lines), plus the parent-owned task tracking delta; within the 400-line budget. Runtime harness: N/A because no executable behavior changed. Rollback boundary: revert the five acceptance-document changes without touching FREEZE-02 fixtures or tests. Commit identity pending explicit user authorization.

### FREEZE-04 — Resolve human safety and environment prerequisites

Status: pending
Depends on: FREEZE-03
Owner: human, agent-assisted

- [ ] Replace the placeholder issuer RUC before any fiscal action.
- [ ] Capture only permitted RUC presence/hash evidence.
- [ ] Capture Q80 serial hash, OS/security patch, firmware, real printer adapter, paper width, WiFi, and WAN outage method.
- [ ] Capture workstation browser, OS, and resolution.
- [ ] Capture real APK version/build and SHA-256.
- [ ] Choose local or deployed backend; if deployed, verify the external deploy trigger and branch mapping.
- [ ] Record PostgreSQL version and explicitly resolve/document DSI device-only and credit-note risk for the pilot.

Acceptance criteria:
- No placeholder warning remains for the selected fresh tenant.
- No raw RUC appears in acceptance evidence.
- Every field-only value has observed evidence or remains visibly blocked.
- The backend target and DSI/credit-note posture are explicit before rehearsal.

Checks:
- Human-run seed and tenant query.
- `adb` package/version/device-property commands.
- APK and device-serial SHA-256 checks.
- Hosting dashboard and database evidence.

Evidence: pending.

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
- FREEZE-03 implementation and independent reverification are complete; work-unit closure is waiting for explicit commit authorization.

## Next step

Obtain explicit authorization for the FREEZE-03 slice-2 commit. After recording its commit identity, close FREEZE-03 and begin the human-gated FREEZE-04 decisions.
