# Printer Profile CI Fixture Repair

## Objective

Restore the POS activation integration suite after the printer-profile fail-closed contract introduced by PR #463, then propagate the verified base into stacked PR #464.

## Problem

PRs #463 and #464 fail the POS `lint-and-test` job in four activation E2E scenarios. The scenarios still construct a successful activation path without explicitly provisioning the printer profile that production now requires, so `ActivationPreOfflineRunner` correctly refuses them and their broad `expect(result.success, isTrue)` assertions fail.

## Why

The missing-profile gate is intentional product behavior: a fresh terminal must not fabricate a printer driver or paper width. The integration fixtures must model an explicitly configured terminal when they claim the happy path. Weakening the production gate would reintroduce the defect fixed by #463.

## Scope

- Identify the shared or per-suite fixture setup used by the four failing activation E2E scenarios.
- Add the minimum explicit printer profile required by each happy-path fixture.
- Preserve missing-profile coverage in the focused runner tests.
- Re-run focused failures and the applicable POS verification.
- Commit and push the repair to `feat/printer-profile-defaults` (PR #463).
- Refresh and verify `fix/pre-offline-status-guard` (PR #464) against the repaired base without squashing its existing work-unit identity.

## Non-goals

- Relaxing the fail-closed printer-profile contract.
- Changing production activation behavior beyond a defect proven by the failing tests.
- Performing the physical Q80 confirmation (L1-06).
- Broadly rewriting historical activation fixtures.

## Constraints

- Offline-first behavior and DGI invariants remain unchanged.
- Printer configuration stays explicit and per device; no fleet-specific shared default.
- Strict TDD is enabled by `openspec/config.yaml`.
- POS test runner: `flutter test`; lint: `flutter analyze`.
- Writes remain single-threaded.
- Delivery strategy: existing stacked PRs, with #464 remaining after #463.
- Forecast: under 200 authored changed lines, excluding this tracking artifact.

## Tasks

### PF-CI-01 — Repair explicit printer-profile fixtures

Status: complete.
Route: delegated direct; the 4-file mapping trigger and multi-file writer trigger both applied.

- [x] Map the four failing scenarios to their fixture setup and confirm the exact missing-profile blocker.
- [x] Observe RED on the affected tests before changing fixtures.
- [x] Provision the minimum explicit printer driver and paper width in each applicable happy-path fixture.
- [x] Keep focused missing-profile rejection coverage green.
- [x] Run focused activation integration tests and `flutter analyze`.
- [x] Commit and push one reviewable work unit to PR #463.

Acceptance criteria:
- The four previously failing E2E scenarios pass for an explicitly configured terminal.
- No production fallback or fabricated printer profile is restored.
- The focused runner suite still proves that an unconfigured profile fails closed.
- The repair is limited to fixture/test setup unless exploration proves a production defect.

Checks:
- Focused command covering the four failing integration files.
- `flutter test test/data/services/activation_pre_offline_runner_test.dart`.
- `flutter analyze`.
- `git diff --check`.

Evidence: CI and delegated reproduction observed RED in the four happy paths because each fixture seeded `printer_paper_width_mm` but not `printer_driver_type`, so `isPrinterProfileConfigured()` refused `TEST_PRINT`. The repair adds exactly one `PrinterConfigService.driverTypeKey: 'MOCK'` entry to each fixture, matching its `MockPrinterAdapter`; no production file changed. Writer GREEN: focused four-file integration command passed 7/7, runner suite passed 22/22, `flutter analyze` clean, and `git diff --check` clean. Parent spot check reproduced the runner suite at 22/22. Native risk assessment was unavailable because the package-local Gentle AI binary is missing, so the candidate was treated as high risk; an independent verifier reproduced 7/7 focused integration tests, 22/22 runner tests, clean analysis, clean diff check, and exactly four inserted fixture lines. Runtime harness: focused four-file integration command, 7/7 passed. Rollback boundary: the four `driverTypeKey: 'MOCK'` fixture entries only.

### PF-CI-02 — Propagate the repaired base into PR #464

Status: complete.
Depends on: PF-CI-01.
Route: inline Git state management plus delegated verification if commands are required.

- [x] Update the stacked branch without squashing commit `4d680df`.
- [x] Push the refreshed branch and confirm PR #464 still contains only the status-guard work unit relative to #463.
- [x] Confirm required GitHub checks are green or record any remaining blocker.

Acceptance criteria:
- PR #464 remains based on #463 until #463 merges.
- Existing work-unit commit identity is preserved where Git permits; no squash merge is used.
- Both PRs expose their true CI state.

Checks:
- `git log --graph` readback for the two branch tips.
- GitHub PR file/commit comparison.
- Required GitHub checks.

Evidence: PR #463 received fixture-repair commit `1a14675`; GitHub `lint-and-test` passed in 7m19s and `build-check` passed in 2m13s. The base was merged into `fix/pre-offline-status-guard` as merge commit `753c793`, preserving `4d680df` unchanged as the first parent and `1a14675` as the second parent. Independent verification on the merged tip passed the four-file integration harness 7/7, the runner suite 26/26, `flutter analyze`, and `git diff --check`. GitHub shows PR #464 relative to #463 with only `activation_pre_offline_runner.dart` and its test (142 insertions, 1 deletion); `lint-and-test` passed in 6m40s and `build-check` passed in 2m11s. Runtime harness: focused four-file integration command, 7/7 passed. Rollback boundary: merge commit `753c793` can be reverted without rewriting the preserved `4d680df` work-unit commit.

## Progress

- 2026-09-21: Recovery found PR #463 at 1820 passing / 4 failing tests and PR #464 at 1824 passing / 4 failing tests. The same activation happy paths failed after the explicit printer-profile gate.
- The user selected CI repair before merging the L1 chain.
- PF-CI-01 repaired the four fixtures with four inserted lines and passed writer, parent spot-check, and independent verification.
- Review assessment was unavailable because the package-local Gentle AI binary is missing; verification followed the required high-risk fallback.
- PF-CI-01 landed on PR #463 as `1a14675`; required POS CI is green.
- PF-CI-02 merged that repaired base into PR #464 as `753c793`, preserved `4d680df`, kept the PR-relative diff to two status-guard files, and restored green POS CI.

## Next step

Return to the L1 delivery sequence: merge #454 through #459 with merge commits, then #463, then retarget #464 to `main` and merge it.
