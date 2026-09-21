# Terminal Enrollment Path (L1)

## Objective

Close limitation **L1** so that a freshly provisioned terminal can be enrolled by a human and obtain a device-sync credential usable by `/v1/sync/*`, end to end, through production code paths only.

## Problem

At feature opening, the founder-pilot ONB1.10F acceptance had closed as PASS under `fp-acceptance-6b15d8a`, but it deliberately excluded `/v1/sync/*` device transport. No production path created or finalized an `ActivationAttempt`, and a freshly built APK could not match the seeded terminal id. The repository implementation now addresses those gaps, but DSI cutover precondition 2 remains NOT SATISFIED until L1-06 verifies the real credential lifecycle on the physical device.

## Why

Without enrollment the platform cannot bring a real terminal online, so the first business cannot be operated even though the activation lifecycle itself is proven. L1 is the root blocker: #314 (mixed sync transport) shares the same credential apparatus and is sequenced after this work.

## Scope

- Provision the canonical terminal id at build time.
- Let a human authorize and create the activation attempt from the owner dashboard.
- Wire the existing POS activation runners into a production entry point so device-observed checks run and the attempt finalizes.
- Confirm at runtime that the credential provisions, renews, and is accepted by `/v1/sync/*`.
- Correct the stale acceptance and cutover claims that this work invalidates.

## Non-goals

- Fixing #314 (mixed sync transport). Separate feature, next in sequence.
- Implementing DSI-6 credit-note authorization or completing OHAC. Credit notes stay a tracked, deliberately deprioritised gap.
- Redesigning the activation lifecycle or its ten checks.
- Reconstructing the 5/5 cohort, consumed targets, or the ADB tunnel.

## Constraints

- Offline-first: local SQLite remains the POS source of truth. Enrollment is an online, trust-establishing act; selling is not.
- The device must not authorize itself: a human in the back office authorizes the terminal; the device observes and reports.
- Tenant RLS must run under a `NOBYPASSRLS` runtime role.
- DGI documents remain immutable; cancellation uses `is_canceled`, never deletion.
- Multi-tenant: no behaviour may be hard-coded to the first client's scenario.
- Raw issuer RUC, PINs, secrets and credentials never enter repository artifacts.
- TDD mode: strict, from `openspec/config.yaml`. Backend runner `npm test`; POS runner `flutter test`.
- Review budget: approximately 400 authored changed lines per slice.

## Delivery and verification

- Delivery strategy used: `stacked-to-main`, one work unit per slice, each PR carrying only its own diff.
- Repository implementation shipped through the merge commits recorded per slice below; physical runtime confirmation remains pending.
- Documentation slices use structural checks, readback and grep; code slices use focused tests plus `flutter analyze` or the backend suite as applicable.
- Runtime confirmation requires the physical device and a freshly provisioned target; it is the only slice that cannot be verified from the repository.
- Recorded size exception, authorized by the founder on 2026-09-20: slice L1-03 is 925 changed lines (428 production, 482 tests), and slice L1-04a is 474 (124 production, 350 tests), both above the ~400-line budget. Splitting a view from its own test would leave the first pull request unable to demonstrate what it claims, so each slice ships whole and every exception is recorded here rather than hidden.
- Rule for the rest of this feature: a slice may exceed the budget only when the excess is test code, and every such slice is listed above with its measured counts.

## Tasks

### L1-01 — Correct the stale claims this work builds on

Status: complete — work-unit commit `e56584e`, merged via PR #454 (`dbf3d2b`).

- [x] Fix `AP_KNOWN_LIMITATIONS.md`: stale `activation.service.ts` citation range, the `count-sessions` guard claim, the `alerts/{id}/lifecycle` 401 claim that is actually a missing route, and guard line drift.
- [x] Fix the `device-sync-cutover-decision.md` addendum claim that the credit-note inventory is not recorded.
- [x] Fix the `founder-pilot-acceptance-freeze.md` "only caller in the repository" overstatement.
- [x] File the security issue for the unguarded inventory routes found during verification.

Acceptance criteria:
- Every corrected claim matches current `main` code with a valid `file:line` citation.
- No new claim is introduced without evidence.
- The unguarded-route finding is tracked where it can be scheduled independently of L1.

Checks:
- Readback of each cited line.
- `grep` for the removed claims.
- `git diff --check`.

Shipped as work-unit commit `e56584e`, merged through PR #454 (`dbf3d2b`).

Evidence: corrections applied and verified from scratch by the parent. `AP_KNOWN_LIMITATIONS.md` now cites the real resolver (`activation.service.ts:1489-1527`, `resolveLatestFinalizedAttemptForDevice`), records that `/inventory/count-sessions` is unauthenticated rather than 401 and that `GetTenantId` therefore passes `tenantId: undefined`, records that `/inventory/alerts/{id}/lifecycle` has no backend route and returns 404 (removal inferred, not verified), and fixes two guard line citations (`sync-transport.guard.ts:49`, `sync-credit-note-auth.guard.ts:49-53`). The cutover addendum keeps the accepted-decision text and adds a dated correction stating the credit-note inventory was completed on 2026-09-17/18 with zero pending notes, leaving the announcement and manual procedure for precondition 3. The freeze record keeps its historical bullet and gains one dated correction naming the five construction sites of `ActivationReconnectSyncRunner`. Security finding tracked as issue #445. Changed lines: 12 insertions, 4 deletions across three files. Runtime harness: N/A, documentation-only slice.

### L1-02 — Provision the canonical terminal id at build time

Status: complete — work-unit commits `41d9576` + `4dfa6c6`, merged via PR #455 (`effea86`).

- [x] Accept a per-terminal `DEVICE_ID` dart-define in `scripts/build_sunmi_apk.sh`.
- [x] Fail the build when the define is absent for a pilot build rather than silently installing an app that resolves to `pos-local-<uuid>`.
- [x] Keep `TerminalIdentityService` precedence unchanged: build define, then persisted value, then generated id.

Acceptance criteria:
- A pilot APK built through the script carries the intended canonical terminal id.
- The script refuses an unlabeled build instead of producing a terminal that cannot match its attempt.
- Existing identity precedence tests still pass.

Closeout obligation: this slice changes the build script, so it invalidates two claims in `AP_KNOWN_LIMITATIONS.md` L1 — the `scripts/build_sunmi_apk.sh:111,117` line citation and the statement that the pilot build script defines no `DEVICE_ID`. Correct both in this same work unit before committing.

Checks:
- Focused Flutter tests for terminal identity.
- Script dry run showing the define is present in the produced command.
- `git diff --check`.

Evidence: implemented with strict TDD. RED observed: `SKIP_END_TO_END_BUILD=1 bash scripts/test_packaging_pipeline.sh` failed at Test 6 with `Unknown option: --plan` before the options existed. GREEN observed three times, twice by the parent: the same command passes Tests 1-3 and 6-9 with Tests 4-5 skipped and exits 0. `--device-id` validates trimmed, non-empty, whitespace-free and at most 64 characters; `--pilot` without it exits 2 with a message naming the flag and the `pos-local-<uuid>` consequence; `--plan` prints the resolved configuration and the exact `flutter build apk` command(s) and stops before any side effect, proven not to invoke the toolchain by a failing `flutter` shim on `PATH`; both build invocations now carry `--dart-define=DEVICE_ID` only when supplied, using the `set -u`-safe empty-array idiom; `release_manifest.json` records `terminal_identity` as the id or `provisioned-at-runtime`. `TerminalIdentityService` precedence was not touched. `bash -n` clean on both scripts, `git diff --check` clean. Two `AP_KNOWN_LIMITATIONS.md` L1 claims that this slice invalidates were corrected in the same work unit: the `build_sunmi_apk.sh:111,117` citation is now `202,208`, and the statement that the build script defines no `DEVICE_ID` now records that the script supports `--device-id` while noting that the option did not previously exist on the packaging script, so the define could only be obtained by invoking the build directly. A first version of that clause claimed the rehearsal and cohort APKs were built without the define; independent verification falsified it against `odd/tasks/founder-pilot-acceptance-freeze.md:218` and a hash-matched local artifact whose `kernel_blob.bin` contains `DEVICE_ID=Q802024120001`, so the clause was corrected to say only what the evidence supports. Not verified: the real `flutter build apk` execution carrying the define, which needs the Flutter and Android toolchains, and the content of the rehearsal APK `f93b6310…`, which is not on disk anywhere.

A pre-existing parser defect made `--out-dir` as the final argument crash with `$2: unbound variable`; it was corrected in the same delivery as commit `4dfa6c6` and shipped in PR #455.

### L1-03 — Let the terminal show who it is

Status: complete — work-unit commit `aabad74` (implementation plus the post-verification correction), merged via PR #456 (`cc52bd8`).

- [x] Add a read-only POS surface that displays the canonical terminal id so an operator can register it in the back office.
- [x] Do not add activation state, attempt creation, or credential logic to the POS in this slice.
- [x] Replace the unverifiable provenance claim with the factual comparison the surface can actually know.
- [x] Add the missing view widget test that the sibling config screens already have.

Acceptance criteria:
- The displayed value is exactly the id the activation attempt must carry.
- The surface is read-only and does not mutate configuration.

Checks:
- Focused view-model test, because the read-only guarantee and the origin mapping are logic, not layout.
- `flutter analyze`.

Evidence: implemented with strict TDD and then corrected after independent verification. RED observed: the test file failed to compile before the implementation existed. GREEN observed by the writer and reproduced by the parent: 9 of 9 tests pass and `flutter analyze` reports no issues. The parent also ran the pre-existing drawer test that the writer left unrun, 6 of 6 passing, closing the regression risk from the new drawer entry.

The read-only invariant was verified adversarially rather than by name: `LocalConfigDao.getConfigByKey` is a pure Floor read and `PrinterConfigService.getPrinterConfig` issues only reads, so nothing reachable from this surface can write. That matters because `TerminalIdentityService.resolveDeviceId()` does persist a generated `pos-local-<uuid>`, and a display surface must not create state.

Defects found by verification and corrected in the same work-unit commit. First, the surface asserted a provenance it cannot know: the origin was inferred from string equality, so an id differing only in letter case, a generated id that coincidentally equalled the compiled id, and an id inherited from an earlier tenant were all reported with a confident but false origin. The origin is not stored anywhere, so the correction replaces the claim with the factual comparison the surface can make, plus a warning to confirm the terminal before registering it. Second, the view widget had no test while both sibling config screens do.

Measured risk that did NOT materialise: because the displayed value is read from the same key that `resolveDeviceId` returns, the operator is never shown an id that differs from the one the device presents, so the display cannot lead to registering the wrong terminal. Only the removed origin label was misleading.

Recorded follow-up, deliberately not fixed here: `driverLabelFor` duplicates the four driver labels that also live in `hardware_settings_view.dart`, which is a cosmetic drift risk. Unifying them needs a shared label source on `PrinterDriverType` and would widen this slice into the hardware screen.

### L1-04a — Add the activation client and hooks to the dashboard

Status: complete — work-unit commit `801fae6`, merged via PR #457 (`83e5012`).

Split from the original L1-04 on purpose: the client, the hooks and the surface together exceed the review budget, and the data layer is independently reviewable and independently testable.

- [x] Add the activation client calls to the dashboard onboarding API layer, using the exact whitelisted body and the relative path convention.
- [x] Add the attempt types and the status vocabulary, verified against the backend entity rather than assumed.
- [x] Add the active-attempt query and the create-attempt mutation, including a stable idempotency key so a retry replays instead of failing.
- [x] Invalidate the session and readiness queries after creating an attempt, because creating one moves the lifecycle state.

Acceptance criteria:
- The client sends only the four whitelisted fields, never a tenant or an actor, which the backend rejects under `forbidNonWhitelisted`.
- A retried submission reuses the same idempotency key and therefore replays the existing attempt instead of returning `CANNOT_START_ACTIVATION_NOT_SALE_READY`.
- The hooks expose the documented failure modes rather than swallowing them.

Checks:
- Dashboard API-layer tests asserting the exact path, method and body.
- Hook tests covering success, the idempotent retry and each documented error.

Evidence: implemented with strict TDD. RED observed: both test files failed because the attempt status vocabulary did not exist yet. GREEN: 28 tests pass across the two files, reproduced by the parent, and lint reports no findings in the changed files. The contract was read from the backend before coding: the four whitelisted body fields, the two relative paths, the status vocabulary from the entity, and the idempotency lookup keyed on `{tenantId, idempotencyKey}` only when the key is non-blank. The mutation keeps one idempotency key per submission, reuses it on retry, regenerates it after success or when the terminal id changes, and invalidates the session, readiness and active-attempt queries because creating an attempt moves the lifecycle state. Backend failure messages and statuses reach the caller intact instead of being collapsed into a generic error.

Parent correction during review: the new hooks test was first written with a `.ts` extension, which forced `createElement` instead of JSX and diverged from every sibling test. It was renamed to `.tsx` and converted to JSX; the suite was re-run green.

Environment note, not a code defect: `npm run typecheck` fails on `src/features/menu-qr/qr-encode.ts` because the declared dependency `uqr` is not installed in the local `node_modules`. It is present in the manifest on `main` and the import exists on `main`, so this is a missing local install rather than a broken tree, and it is outside this slice.

### L1-04b — Authorize and create the attempt from the setup center

Status: complete — work-unit commits `defb0f6` + correction `88aff66`, merged via PR #457 (`83e5012`).

- [x] Replace the non-interactive activation block with an action gated on `onboarding:activation:manage`.
- [x] Collect the terminal id the operator reads from the terminal's own identity surface (L1-03).
- [x] Surface the attempt state, including the awaiting-device-checks state, and map each documented backend failure to an understandable message.

Acceptance criteria:
- An OWNER can create an attempt for a terminal id from the back office, and a role without the permission cannot.
- Every documented failure is surfaced with its meaning, not as a generic error.
- No device-observed check is fabricated by the dashboard.

Checks:
- Dashboard tests for the new surface, the permission gate, and each failure mapping.
- Backend permission enforcement readback.

Evidence: implemented with strict TDD. RED observed with the surface tests failing before the panels existed; GREEN 23 tests across the two files, and the parent ran the whole dashboard unit suite at 708 tests with zero failures. The permission gate is unchanged, an empty or whitespace-only terminal id issues no request, and each documented backend failure maps to its own business message with the backend text still visible.

Defect the parent found before committing, and the slice was corrected: the first version surfaced the attempt state only for `CREATED` and `IN_PROGRESS`, so an attempt that ended in `FAIL` brought the empty form back with no explanation of what had happened — the very state an operator most needs to see. The correction adds panels for `FAIL`, stating that the terminal must be reviewed before retrying while keeping the retry path reachable, and for `PASS_WITH_WARNING`, stating that the warnings must be reviewed. `PASS` keeps the activated lifecycle this screen already handles. No check result is rendered or fabricated, because the dashboard does not fetch checks.

Environment note, not introduced here: two menu-qr test files fail to load because the declared dependency `uqr` is not installed in the local `node_modules`; it is declared and imported on `main`, so a local `npm install` resolves it.

Remaining known gap: the screen does not show which checks the terminal reported, because the dashboard does not fetch them. If the operator needs that detail, it belongs to a later slice, not to a guess here.

### L1-05a — Let the POS discover its own attempt

Status: complete — work-unit commit `cb3a1d6` (implementation plus the post-verification corrections), merged via PR #458 (`c45bc78`).

Exploration found the gap is larger than wiring. `ActivationSyncPort` has eight methods and **all of them are POSTs keyed on a caller-supplied `attemptId`**; the POS cannot read the active attempt at all. Worse, every write to `activation_attempts_local` in the codebase is a test: no production code persists the attempt row, and the runners resolve it with `getAttemptById`, so without a writer they cannot run at all.

- [x] Add the missing read to `ActivationSyncPort` and its Dio adapter for the active attempt.
- [x] Add the production writer that maps the fetched attempt into `ActivationAttemptLocalEntity` with the status, the pinned fiscal revision and fingerprint, the verification product and the time anchor the runners require.
- [x] Resolve the attempt id from local persistence on later phases, so a restart mid-activation resumes instead of restarting.

Acceptance criteria:
- After the back office creates an attempt, the terminal can discover it and persist it without hand-made API calls.
- The persisted row carries every field the three runners and the config adapter read.
- A restart between phases resumes from the persisted attempt.

Checks:
- Focused tests for the read and the mapping, including a restart between phases.
- Readback that the persisted fields match what the runners consume.

Shipped as work-unit commit `cb3a1d6`, merged through PR #458 (`c45bc78`).

Evidence: the corrections below were applied before the commit.

Defects found by adversarial verification and corrected. The highest-severity one was ours: the backend attempt row DOES carry `serverTimeAnchorAt` (`server_time_anchor_at` on the activation attempt entity) and the reference harness read it straight from the response, but the new adapter did not parse it and discovery minted the anchor from the local clock while still labelling it `serverTimeAnchorAt` and registering it as `anchor-<attemptId>`. That is a local timestamp wearing a server label, and it feeds the clock confidence the whole TTFSS measurement depends on. The correction parses the real server anchor and keeps `anchorMonotonicTicks` local, which is correct because monotonic ticks are local by definition. Also corrected: fabricated defaults (`0`, `''`, `''`) for missing pinned fields, which only surfaced one phase later as a confusing `REQUIRED_CONFIG_LOCAL`; a malformed payload escaping as an uncaught `StateError` instead of a named failure; a stale local attempt pinning discovery forever, which would have made a newly created back-office attempt invisible to the terminal after any previous activation and skipped the terminal-mismatch guard entirely; the snapshot tenant never being compared with the requested tenant; and a test that was green for the wrong reason.

Reported separately rather than fixed here: `activation_pre_offline_runner.dart:335` rewrites an advanced row back to `ASSIGNED` when a re-run fails, which can strand an attempt whose controlled sale already succeeded; tracked as issue #450 and fixed by L1-09 below.

### L1-05b-session — Assemble the activation session

Status: complete — work-unit commit `d1ab3b9`, merged via PR #459 (`ab3eb4f`).

Split from the original L1-05b: the check replay went to the reconnect runner, and this slice assembles the phases.

- [x] FAIL CLOSED when the pinned verification product is absent from the local catalog, naming the product, instead of letting it surface a phase later as `REQUIRED_CONFIG_LOCAL`.
- [x] Provide the production entry point that drives the three phases, delegating to the runners rather than reimplementing them.
- [x] Accept the authorized user PIN from the caller, since it is stored nowhere and the pre-offline check requires it.

Acceptance criteria:
- One production entry point drives checks, the controlled sale and the reconnect without any step left to a test harness.
- No dependency is satisfied by a value that only exists in a test.
- A terminal without the pinned product fails closed before the checks, naming the product.

Remains for L1-05c: the UI, which supplies the human identifiers and the tenant, and the `main.dart` wiring that resolves the `PrinterPort` from the stored printer profile.

Evidence: implemented with strict TDD. RED observed: the test file failed to compile before the service existed. GREEN: 8 tests in the new file and 59 across the four existing activation suites, reproduced by the parent, with `flutter analyze` clean. The session takes the three runners and the discovery service by injection so a test can supply them with fake collaborators, sources `tenantId` and `attemptId` from the attempt resolved in `prepare`, passes the human identifiers through untouched, returns the runners' own result objects without summarising or fabricating anything, and refuses a phase called before a successful prepare with a named `ATTEMPT_NOT_PREPARED`. It deliberately does not reimplement the local status machine: a phase that runs out of order is refused by its own runner and that refusal is surfaced.

The product guarantee refuses rather than fetches, on purpose: retrieving the catalog belongs to the sync engine, so the session guarantees-or-fails-closed and says which product is missing. A fresh terminal therefore needs its catalog before activation, which is the same prerequisite it has before it can sell anything.

Deliberate difference from the harness, recorded so it is not mistaken for a defect later: the harness forced `customAmount: 1`, while the session leaves it unset, so the verification sale is priced from the product's own `sellPrice`, which the required-config check already guarantees is greater than zero. That generalises instead of hard-coding one cordoba.

### L1-05b-replay — Let the reconnect runner own the check replay

Status: complete — work-unit commit `c40c60a`, merged via PR #459 (`ab3eb4f`).

- [x] Replay the persisted pre-offline checks inside the reconnect runner before the outbox drain and before finalization.
- [x] Mirror the reference harness's replay field for field, so the runner and the harness cannot diverge.
- [x] Fail closed when a replay fails, without finalizing.

Acceptance criteria:
- The check replay has a single owner in production code, and the harness's manual step becomes redundant rather than load-bearing.
- A failing replay prevents finalization and is reported.
- Repeating the runner does not corrupt state.

Checks:
- Focused tests for replay ordering, field fidelity, the failure path and repeat-safety.
- The existing status-transition and outbox assertions still pass.

Evidence: implemented with strict TDD and verified by the parent. RED observed: the four new tests failed against the unmodified runner because no checks were replayed and a failing replay still reported success. GREEN: 11 tests in the runner file, reproduced by the parent, and `flutter analyze` clean. The replay mirrors the reference harness field for field and skips no check status, and the writer confirmed from `activation.service.ts` that repeating `sendCheck` for the same check code is an accepted idempotent replay, which is why the harness can keep replaying harmlessly and why this change is safe to run more than once. A failed replay now returns before the outbox drain and before finalization, leaving the attempt in `SYNC_VERIFICATION_PENDING` with its envelopes pending so a later retry resumes. The harness is deliberately left untouched.

Flakiness note, verified rather than assumed: a combined run of the service and activation-adapter suites reported one failure, a `loading [E]` on `local_auth_service_test.dart`. That file passes 6 of 6 in isolation and a repeated combined run passed 264 of 264, so it is the repository's already-documented local load flakiness from concurrent worktrees, not a regression from this change.

### L1-05c — Guide the operator through activation

Status: superseded — split into L1-05c-1 and L1-05c-2, both complete.

Split into L1-05c-1 (view model and `main.dart` wiring) and L1-05c-2 (screen, route and drawer entry), for the same reason L1-04 was split: together they exceed the review budget, and the logic is independently reviewable from the presentation.

### L1-05c-1 — Drive the session from a view model

Status: complete — work-unit commit `5f08a4c`, merged via PR #459 (`ab3eb4f`).

- [x] Expose preparation state, the resolved attempt, per-phase progress and the distinct blocker codes and messages.
- [x] Source the tenant and the user ids from the logged-in user, never from the screen and never hard-coded.
- [x] Collect the authorized PIN from the human and retain it only for the call.
- [x] Wire the whole activation stack in `main.dart`, including the `PrinterPort` resolved from the stored printer profile rather than assumed.

Acceptance criteria:
- The view model returns the session's own results and fabricates nothing.
- A failed phase cannot be reported as a later success, and no phase runs before a successful preparation.
- The PIN is never logged, persisted or exposed.

Checks:
- Focused view-model tests with an injected session service.
- `flutter analyze`.

Shipped as work-unit commit `5f08a4c`, merged through PR #459 (`ab3eb4f`) together with the other activation-flow slices.

### L1-05c-2 — The guided screen

Status: complete — work-unit commit `e7a35ac`, merged via PR #459 (`ab3eb4f`).
Depends on: L1-05c-1

- [x] Add the guided screen, reachable from the drawer, that walks the three phases in order and shows each outcome.
- [x] Show the check results and the blockers the runners already return, without inventing any.
- [x] Fail closed with a named reason when a phase blocks.

Acceptance criteria:
- An operator can complete activation from the terminal with no hand-made API call.
- Every phase outcome and blocker is visible on screen.
- Nothing is displayed that a runner did not report.

Checks:
- Widget and view-model tests for each phase outcome.
- `flutter analyze`.

Shipped as work-unit commit `e7a35ac`, merged through PR #459 (`ab3eb4f`) together with the other activation-flow slices.

### L1-05 — superseded

The original single slice was split into L1-05a, L1-05b and L1-05c once exploration showed it required a new backend read, the first production writer for the attempt row, the assembly of three runners, a decision about where checks are replayed, and a new multi-step screen.

Status: superseded — the goals below were delivered through the split slices above; kept as a historical record.

- [x] Construct the existing activation runners in production wiring, gated by an active attempt for this terminal.
- [x] Ensure a finalize attempt reaches `PASS` or `PASS_WITH_WARNING` and publishes the outbox drain on reconnect.
- [x] Preserve fail-closed behaviour when a check fails.

Acceptance criteria:
- A production code path creates checks and finalizes the attempt; the runners stop being test-only.
- A FAIL blocks activation and is reported, not swallowed.
- Offline selling continues to work while activation is pending.

Checks:
- Focused POS tests for the wiring and the fail-closed branch.
- `flutter analyze`.
- Backend confirmation that an attempt reaches a final status.

Delivered through L1-05a, L1-05b-replay, L1-05b-session, L1-05c-1 and L1-05c-2; see their evidence.

### L1-06 — Confirm the credential at runtime on the device

Status: pending

- [ ] Provision a fresh tenant and terminal, build with the canonical `DEVICE_ID`, and enroll end to end on the physical Q80.
- [ ] Confirm the device-sync credential provisions, confirms, and renews.
- [ ] Confirm `/v1/sync/*` accepts the device token and rejects a non-device token.
- [ ] Record the result as DSI cutover precondition 2 evidence.

Acceptance criteria:
- A freshly built APK obtains and uses a device credential without manual database intervention.
- The evidence is recorded against one release identity.
- No fabricated observation; uncaptured fields are declared.

Checks:
- Physical run on the Q80 with a fresh target.
- Backend status queries for the attempt and the credential.
- Negative check that a human token is rejected on `/v1/sync/*`.

Evidence: pending.

### L1-07 — Correct the device identity claims

Status: complete — work-unit commits `8996d1c`, `ec198d4`, `17d714d`, `6be3f17` and `0978e90` on branch `docs/l1-q80-device-identity`; not yet merged. No hardware required.

Founder clarification (2026-09-20): the fleet terminal is a MIRAY Q80/iPOS. The Sunmi V2s was the initial prospect and was never acquired, so no Sunmi device exists in the fleet.

Execution decision (2026-09-21): rename the packaging entry point to device-neutral `scripts/build_pos_apk.sh`; consolidate the duplicate physical-verification documents into one MIRAY Q80/iPOS runbook while preserving every unexecuted hardware status and the DGI checklist; leave commercial proposals outside L1-07. Preserve the live Sunmi/woyou protocol identifiers unchanged. Delivery used five work units (packaging, runbook, runbook metric, evidence/vendor, historical notes) in one PR.

- [x] Rename or re-label the packaging script away from the unacquired device it is named after, updating its header and every internal reference.
- [x] Remove the hardcoded paper width from the build manifest: width is per-tenant runtime configuration, not a property of the packaged APK.
- [x] Reconcile the operator-facing hardware runbook, whose device table currently describes the device that was never acquired.
- [x] Reconcile the duplicate verification documents, one of which carries the DGI compliance content under the stale device name while the other has every matrix row NOT EXECUTED.
- [x] Correct the stale MethodChannel path cited in the historical deployment plan.
- [x] Correct the acceptance record's printer-adapter field: `AP_FIXTURE_MANIFEST.md:89` and `AP_Q80_PILOT_EVIDENCE.md:65` record the adapter as `SUNMI_V2S`, while the founder's proven, working selection on the real Q80 is the **`Q80 / iPos`** driver (`IPOS_Q80`) printing at 80 mm. Nothing in the backend, the seed or the harness writes `printer_driver_type`, so the recorded value came from the device itself and is not corroborated by the proven configuration. State what is proven, keep the earlier captured value visible, and mark the discrepancy as unresolved rather than silently overwriting it.
- [x] Correct the `Alacrity Q80` label in `apps/pos_app/lib/data/adapters/printer/ipos_printer_adapter.dart`, whose vendor string is stale because the hardware reports MIRAY.

Acceptance criteria:
- No operator-facing document tells an operator to configure a device the fleet does not have.
- The build manifest makes no claim about paper width.
- The Sunmi/woyou printing interface is explicitly preserved and documented as the protocol in use on the Q80; nothing in the working printer path is renamed. **Not satisfied as written** — see the recorded deviation below.
- References to the renamed script are updated everywhere they appear.

Checks:
- `grep` for references to the old script name expecting only intentional historical records.
- Readback of the preserved printer protocol path: the `woyou.aidlservice.jiu_mi` keep rules, the `com.nhilos.pos/sunmi_printer` MethodChannel, and the `SUNMI_V2S` wire value.
- `git diff --check`.

Evidence: implemented in five work units, each verified by the writer and reviewed by the parent, with independent verification of the packaging unit and the runbook unit.

Packaging (`8996d1c`). RED observed: the harness was retargeted to the new filename first and failed with exit 127 on the missing `scripts/build_pos_apk.sh`. GREEN: `SKIP_END_TO_END_BUILD=1 bash scripts/test_packaging_pipeline.sh` passes Tests 1-3 and 6-11 and exits 0. `git mv`-equivalent rename preserved executable mode (100755) and rename detection at 97%. The manifest now records `"target_hardware": "Android POS terminal"`, which contains neither a device model nor a paper width. The harness pins that contract positively: Test 11 requires the source value to equal exactly `Android POS terminal`, and Test 5 applies the same exact check to the generated `release_manifest.json`; both retain a distinct empty-value failure. An earlier denylist-only version of Test 11 was rejected during review and replaced, because a denylist would have passed `58 mm` (with a space) or any unknown model name. The live `AP_KNOWN_LIMITATIONS.md` citation moved from the stale `build_sunmi_apk.sh:202,208` to `build_pos_apk.sh:118-121`, which covers guard, messages and `exit 2`; the previous numbers pointed at unrelated build lines.

Runbook (`ec198d4`, `17d714d`). `docs/operations/sunmi_v2s_hardware_verification_checklist.md` was renamed to `docs/operations/q80_ipos_hardware_verification_checklist.md` (rename detected at 52%) and retargeted to the MIRAY Q80/iPOS fleet terminal with the commercial Android device kept as the fallback/simulation path. The standalone `docs/operations/q80_thermal_receipt_physical_verification.md` was consolidated into it and then deleted, so the duplicated matrices now have a single owner. Verified preservation: all 23 thermal-matrix rows still read `NOT EXECUTED — REQUIRES PHYSICAL DEVICE`, every one of the 21 checkboxes remains unchecked, and no physical test was marked executed. The DGI DT 09-2007 content (header fields, consecutive numbering example, IVA 15%, C$ and USD totals, both fiscal legends) is preserved in substance. Stale `com.omnifood.pos_app` and `-keep class com.omnifood.**` were corrected to `com.nhilos.pos_app` and `com.nhilos.pos_app.printer.**`, both read back against the real `build.gradle.kts` and `proguard-rules.pro`.

The runbook metric was corrected in `17d714d` after the acceptance evidence showed the calibrated Q80 profile is Nyx `TLMono` font 4 at **40 columns / 576 dots**, matching `ReceiptLayoutMetrics.logicalTextWidth80mm = 40` and `logicalRasterWidth80mm = 576`. An early draft had stated 48 columns, which came from the matrix's probe rows and not from the configured metric; the same 48-column error was also present in the first draft of the gap-audit correction note and was fixed in `0978e90`.

Evidence and vendor (`6be3f17`). The `Alacrity Q80` vendor string was corrected to `MIRAY Q80/iPOS` in the three comment-only locations (`ipos_printer_adapter.dart`, `IPosPrinterHandler.kt`, `AndroidManifest.xml`); no identifier, MethodChannel, service package, action or ProGuard rule was touched. The acceptance rows in `AP_FIXTURE_MANIFEST.md:89` and `AP_Q80_PILOT_EVIDENCE.md:65` keep the captured `SUNMI_V2S` text verbatim and gain a dated `Corrección (2026-09-21)` that records the captured value as uncorroborated, names the proven `Q80 / iPos` (`IPOS_Q80`) selection at 80 mm, and marks the discrepancy UNRESOLVED pending L1-06 without asserting which value is correct.

Historical notes (`0978e90`). The batch-12 deployment plan received two dated corrections: one before Batch 12.2 recording that the packaging script is now `scripts/build_pos_apk.sh`, and one before Batch 12.3 recording the runbook rename/retarget and the live MethodChannel `com.nhilos.pos/sunmi_printer` instead of `com.omnifood.pos/sunmi_printer`. Section 13 of `onboarding_gap_audit.md` received a dated correction stating the fleet device and profile while keeping its original findings and classifications as issued. No historical body text was rewritten.

Readback of the preserved printer protocol path: `woyou.aidlservice.jiu_mi` keep rules present (`proguard-rules.pro:13-14`), `com.nhilos.pos/sunmi_printer` present in `sunmi_printer_adapter.dart:19` and `SunmiPrinterHandler.kt:21`, `SUNMI_V2S` present as the wire value in `printer_config.dart:7`, and `com.nhilos.pos/ipos_printer` present in `ipos_printer_adapter.dart:22` and `IPosPrinterHandler.kt:23`. Nothing in the working printer path was renamed.

Recorded deviation from the written acceptance criteria. The criterion "the Sunmi/woyou printing interface is explicitly preserved and documented as the protocol in use on the Q80" is **not satisfied as written**, because independent verification falsified its premise: no repository artifact shows the Q80 exposing the woyou AIDL service. The Q80 handler binds `net.nyx.printerservice`, and the acceptance record documents the pilot path as adapter `SUNMI_V2S` over `net.nyx.printerservice`, while the founder's proven field selection is the `Q80 / iPos` driver. The criterion's real intent — preserve the working printer path unchanged — is met: all four identifiers are intact and unchanged. The runbook documents them as live code paths and configuration values that must not be renamed, and records the actual `net.nyx.printerservice` binding rather than asserting a hardware compatibility that the evidence does not support. A first version of the runbook note did assert Q80 woyou compatibility and was corrected after verification.

Deliberately left outside this slice, recorded so they are not mistaken for oversights: the historical records that still name the old script or a Sunmi device — `docs/plans/deployment/batch_12_sunmi_v2s_release_candidate_apk.md` body text (now carrying dated corrections), `odd/tasks/founder-pilot-acceptance-freeze.md:299`, this document's own L1-02 section, `docs/onboarding/evidence/ONB1.10_M8_PR25_EVIDENCE.md`, `docs/onboarding/onboarding_execution_roadmap.md:1433` and `docs/DoD/test-suite.md:86` — and the commercial proposal documents, which remain a founder decision.

Untested in this environment, stated rather than implied: packaging harness Tests 4-5, which require a real Flutter and Android SDK toolchain and were skipped under `SKIP_END_TO_END_BUILD=1`; and `flutter analyze`, which was not run because no Flutter toolchain is available here and every code change in this slice is comment-only with no executable statement altered.

### L1-08 — Match fresh-terminal hardware defaults to the fleet

Status: complete — work-unit commits `b7a0e9f` + `ff3b67e`, fixture repair `1a14675`, and recovery-record commit `bf0f37a`, merged via PR #463 (`4b2c6a1`).

Founder confirmation (2026-09-20): on the physical terminal the working selection is **Q80** in hardware and printer settings, which is what prints correctly at 80 mm. Confirmed in code: nothing in the backend, the seed, or the harness writes `printer_driver_type` or the paper width; `PrinterConfigService` falls back to `sunmiV2s` when no driver is stored, and `PrinterConfig.paperWidthMm` defaults to `58`.

Consequence: a freshly installed terminal — exactly the case this feature exists to handle — starts on the wrong driver path and the wrong paper width and only prints correctly after a human changes Configuración de Hardware. This is the same defect class as #343, which printed FACTURA at 58 mm for a cuota-fija tenant.

- [x] Decide the provisioning contract for the printer profile: set driver and width for the device during enrollment, change the fresh-install default to match the fleet, or fail closed with an explicit blocked reason while the profile is unset.
- [x] Implement the chosen contract without hard-coding one tenant's hardware into a multi-tenant platform: the profile is per-device configuration, and 58 mm remains a legitimate profile for other terminals.
- [x] Ensure activation reports the printer profile it actually used, so an unset or inconsistent profile cannot silently print at the wrong width.

Acceptance criteria:
- A fresh terminal either prints at the configured profile without a hidden manual step, or activation fails closed naming the missing or inconsistent printer profile.
- The fleet's proven profile (Q80/iPos at 80 mm) is reachable without hand-editing configuration.
- No tenant-specific hardware assumption is baked into shared defaults beyond what the platform explicitly documents.

Checks:
- Focused POS tests for the default and for the fail-closed branch.
- `flutter analyze`.
- Readback of the effective profile recorded in activation evidence.

Evidence: the chosen contract is the explicit-choice/fail-closed path. `PrinterConfigService.isPrinterProfileConfigured()` is read-only and true only when both the driver and paper-width keys exist with non-blank values, so an unconfigured device is no longer indistinguishable from a deliberate Sunmi V2s at 58 mm. `confirmPrinterProfile` is the only path that materialises a profile on a fresh terminal, `savePrinterConfig` no longer writes the profile keys when absent, and TEST_PRINT fails closed with a named blocker (and never calls the printer) when the profile was never configured, recording `printerProfileConfigured` in its evidence. Fixture repair `1a14675` re-seeded the profile keys in the affected e2e fixtures; recovery-record commit `bf0f37a` updated `odd/tasks/printer-profile-ci-fixtures.md`. Merged through PR #463 (`4b2c6a1`). Physical print behaviour on the Q80 remains subject to L1-06.

### L1-09 — Stop a failing pre-offline re-run from stranding an advanced attempt

Status: complete — work-unit commit `4d680df`, merged via PR #464 (`6e4a2a7`), closing issue #450.

- [x] Gate the pre-offline runner on entry: it owns only `ASSIGNED` and `RUNNING`, refusing any other status with the named blocker `ATTEMPT_NOT_READY_FOR_CHECKS` without running checks, calling the printer, or writing rows.
- [x] Pin the stranding scenario with a test that reproduces it rather than relying on the shape of the fix.
- [x] Keep `RUNNING` as a legitimate re-entry status, with the `RUNNING`→`ASSIGNED` rollback retained as intentional.

Acceptance criteria:
- A failing re-run cannot reset an attempt whose controlled sale already succeeded back to a status that merely looks fresh.
- The refusal is named, not silent.

Checks:
- Focused POS tests reproducing the stranding scenario and the refusal path.

Evidence: closes the defect reported separately during L1-05a (`activation_pre_offline_runner.dart:335`), tracked as issue #450. The unconditional status rewrite at completion is replaced by an entry-status gate; the refusal runs no check, calls no printer, writes no check row, and leaves the status untouched. Shipped as work-unit commit `4d680df`, merged through PR #464 (`6e4a2a7`).

### Post-merge housekeeping — outside the L1 implementation scope

PR #461 (merge `964a0ce`, commits `77dcc6b` + `68ffbd3`, closing issue #460) published the client startup requirements documentation. It is independent documentation work merged after the L1 implementation and is recorded here only for completeness; it is not an L1 slice.

## Dependencies

- Repository implementation is merged: L1-01 through L1-05c-2, L1-08 and L1-09 are complete and merged to `main`.
- L1-07 is the next actionable slice: documentation-only corrections, no hardware required.
- L1-06 is last and blocked on hardware: it requires the physical Q80, a fresh tenant/terminal, and the catalog with the pinned verification product.
- #314 follows confirmed L1 (confirmation happens at L1-06); #445 remains separate.

## Progress

- Feature opened after independent verification of `main` at `9cef7ce` corrected the earlier assessment: the credential provisioning half is already production-wired, the three activation runners exist but are constructed only in tests, the owner dashboard has no enrollment surface, and the build script passes no `DEVICE_ID`.
- Frozen plan approved by the founder: dashboard authorizes and creates, POS observes and finalizes, build defines the terminal id, recovery remains an exceptional ops path.
- Repository implementation merged through PRs #454, #455, #456, #457, #458, #459, #463 and #464 (per-slice commits and merge identities recorded in each task above).
- L1/DSI-2 is NOT complete: physical credential provisioning, renewal, and `/v1/sync/*` use on the device remain unverified until L1-06, so DSI cutover precondition 2 is still not satisfied.

## Next step

Execute L1-07 (documentation corrections, no hardware needed). Then L1-06 when the physical Q80 and a fresh catalog/tenant are available. #314 follows confirmed L1; #445 remains separate.
