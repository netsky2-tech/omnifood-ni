# Tasks: Restore Admin Backend CI Baseline

## Native execution checklist

- [x] 0.1 Complete read-only preflight: verify issue #234 approval, exact PR #233/base/head identity, SHA `50eec55d4cea15bdf32d3147ada966df7794f54e`, topology 3.1a path, dirty-root exclusion, worktree absence, and physical line-accounting method.
- [ ] A1a Deliver authored root pnpm authority and ratchet runner/scaffolding at ≤400 physical changed lines; execute all real gates, remain explicitly RED until a reviewed manifest exists, and never claim full green.
- [ ] A1b Generate and review the explicit normalized known-failure manifest from exact base `50eec55`, targeting ≤400 physical lines with one record per stable failing identity and warnings reported separately.
- [ ] A2 Delete only the 10,827-line `apps/admin_backend/package-lock.json` from accepted A1b as the dedicated one-file exception with no scope smuggling.
- [ ] INTEGRATE Aggregate accepted A2 head to `feat/fulfillment-repository-regressions-v2`, supersede only PR #233, pass ratchet CI/GitGuardian/build/issue-link-label/topology policy, and unlock 3.1b after ratchet and integration identity pass.
- [ ] B Reach long-term lint zero through authoritative root-cluster repairs and reviewed downward manifest updates.
- [ ] C Reach long-term unit zero through shared authoritative root-cause repairs and reviewed downward manifest updates.
- [ ] D Reach long-term DB zero on real PostgreSQL 15 while preserving topology 3.1a, DGI, migration/API, tenant-RLS, and downward-ratchet authority.
- [ ] E Reach long-term full HTTP E2E zero on real PostgreSQL through shared Nest composition repairs without integration-replacing mocks.
- [ ] F Pass one complete genuine zero-failure matrix, empty the known-failure manifest, and close issue #234.

## Delivery strategy

| Field | Decision |
|---|---|
| Strategy | force-chained immediate predecessors |
| Critical path to 3.1b | 0.1 → A1a → A1b → A2 → INTEGRATE |
| Long-term cleanup | INTEGRATE → B → C → D → E → F |
| Normal review budget | ≤400 authored physical changed lines |
| Generated baseline target | A1b ≤400 physical lines |
| Sole oversized exception | A2 one-file 10,827-line package-lock deletion |
| Receipt location | Passive OpenSpec/Engram updates in planning root, outside strict implementation diffs |

No implementation branch or worktree exists. A1a is the next executable slice.

## Shared execution contract

Each implementation slice starts from its accepted immediate predecessor in an isolated clean worktree. Record exact SHA, base, paths, physical additions/deletions, commands, exits/counts, runtime evidence, and rollback boundary. Never stage passive OpenSpec/Engram receipts with implementation.

The ratchet always executes root frozen install, non-mutating lint with before/after clean-tree proof, focused-test scanning, full unit, full real-PostgreSQL 15 DB including topology 3.1a, full HTTP E2E on real PostgreSQL, and build. It fails on unknown/changed identities, focused tests, new skips, quarantine, tolerated failures, mocked integration, checkout mutation, tested-SHA mismatch, omitted gates, or assertion/rule weakening.

Known identities remain prominent. A passing ratchet conclusion means exact reviewed debt is unchanged or reduced, **not full green**. Manifest additions require a separately approved baseline-change decision. Shrinking actual debt requires explicit manifest reduction before or with the next reviewed delivery; removed identities may not reappear.

## A1a — authored authority and runner (≤400)

- **RED:** From exact approved predecessor `50eec55`, prove current workflow/package authority drift and absence of a reviewed manifest. Add the smallest structural/behavioral checks for root pnpm authority, tested-SHA proof, clean non-mutating lint, complete gate execution, and fail-closed missing-manifest behavior. Capture inherited suite failures without labeling them green.
- **GREEN:** Establish Node 22/Corepack pnpm 11.22.0, root cache/frozen install/filter commands, explicit PR-head SHA checkout/assertion, clean-tree proof, README authority docs, backend `lint`/`lint:fix` scripts, and transparent ratchet runner/scaffolding. Continue collecting all real suite outputs. The slice may remain RED solely because A1b is absent.
- **TRIANGULATE:** Prove npm/app-lock/unlocked-install paths are not authoritative; SHA mismatch, checkout mutation, missing gate, focused test/skip/quarantine/tolerance, and mocked integration fail. Verify topology 3.1a is selected and all failure identities remain visible.
- **REFACTOR:** Keep authored physical changes ≤400, deterministic, reviewable, and limited to A1a authority/runner scope. Open against the exact approved starting branch and wait for acceptance.

## A1b — generated baseline evidence (≤400 target)

- **RED:** On exact base `50eec55`, run every required full gate and show the empty/missing manifest rejects inherited failing identities.
- **GREEN:** Generate one deterministic manifest record per lint error and failed unit/DB/E2E test using gate + rule/test full name + repository-relative stable source. Report warnings separately. Review every record against raw evidence and activate subset comparison.
- **TRIANGULATE:** Prove timestamps, ports, durations, stack noise, and absolute paths do not perturb identity; prove distinct failures do not collapse; inject representative unknown/changed identities and confirm failure. Confirm additions require separate approval.
- **REFACTOR:** Deterministically sort/deduplicate exact identities, keep the generated artifact near the ≤400-line target, record its identity, and accept it before A2.

## A2 — dedicated one-file deletion

- **RED:** From accepted A1b, prove exact ancestry and reject every changed path except `apps/admin_backend/package-lock.json`.
- **GREEN:** Delete the app lockfile in full; preserve root pnpm authority, ratchet behavior, and all known-failure evidence.
- **TRIANGULATE:** Verify the deletion is exactly 10,827 physical lines, frozen root install still uses root authority, the lockfile is not regenerated, and no implementation or receipt file is smuggled into the diff.
- **REFACTOR:** None beyond one-file diff hygiene. Recovery is forward-only and never restores the lockfile.

## INTEGRATE — unlock 3.1b

- **RED:** From accepted A2 head, verify the aggregate target is `feat/fulfillment-repository-regressions-v2`, only PR #233 is superseded, and all required repository-policy checks are present.
- **GREEN:** Open the aggregate PR and pass ratchet CI, GitGuardian, build, issue/link/label policy, and topology 3.1a. Keep known failures prominent and #234 open.
- **TRIANGULATE:** Confirm tested-head SHA evidence, merge/integration identity, immediate-predecessor ancestry, real PostgreSQL/HTTP execution, and no coverage weakening or unknown identity.
- **REFACTOR:** Record the confirmed integration identity. At that point—and not before—mark fulfillment 3.1b unblocked. Do not close #234.

## B–F — long-term downward cleanup

### B — lint zero

Reproduce coherent lint root clusters, repair authoritative source/config without rule weakening, run the full ratchet, and remove fixed identities explicitly. Finish only when lint debt and lint manifest records are zero.

### C — unit zero

Reproduce shared unit causes, repair authoritative implementation/fixture layers before leaf expectations, run scanner/full unit/full ratchet, and remove fixed identities. Finish only when unit debt and unit manifest records are zero.

### D — DB zero

Use real PostgreSQL 15 and explicit topology 3.1a selection. Repair under DGI, migration/API, tenant predicates, and RLS/FORCE RLS authority; no destructive migration or mock substitute. Remove fixed DB identities and finish at DB zero.

### E — E2E zero

Use the fully composed Nest HTTP boundary and real PostgreSQL 15. Repair shared JWT/guard/controller/module/provider/fixture roots, not per-suite patches. Remove fixed E2E identities and finish at E2E zero.

### F — complete zero matrix

Run every required gate on one exact reviewed head with zero actual failures, an empty manifest, clean checkout, tested-SHA equality, topology 3.1a, real PostgreSQL/HTTP integration, and no skips/quarantine/tolerance/weakening. Only this outcome is “full green” and closes issue #234.
