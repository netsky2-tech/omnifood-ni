# Design: Fail-Closed Admin Backend CI Ratchet

## Decision at a glance

Admin Backend CI will retain full real-suite execution while replacing the former full-green prerequisite for fulfillment 3.1b with a normalized known-failure ratchet. The runner compares actual failures with an explicit reviewed manifest generated from exact base `50eec55`. It passes only when actual identities are a subset of that manifest and all integrity guards pass.

A ratchet pass means known debt is unchanged or reduced; it never means full green. Integration after A2 unlocks 3.1b. B–F continue to tighten debt to zero, and issue #234 remains open until F.

## Authority and fixed constraints

| Topic | Decision |
|---|---|
| Dependency authority | Root `package.json`, `pnpm-workspace.yaml`, and root `pnpm-lock.yaml`; Node 22 and Corepack pnpm 11.22.0. |
| Tested revision | PR head SHA for pull requests; `github.sha` for pushes; resolved SHA asserted and recorded. |
| Required execution | Frozen root install, non-mutating lint/clean-tree proof, focused-test scanner, full unit, full PostgreSQL 15 DB including topology 3.1a, full HTTP E2E on real PostgreSQL, and build. |
| Ratchet acceptance | Actual normalized failures are a subset of the reviewed manifest and no integrity guard fails. |
| Baseline authority | Explicit manifest generated from exact base `50eec55`, one record per failing identity. |
| Manifest direction | Downward only. Additions need a separately approved baseline-change decision. |
| Contract precedence | Approved OpenSpec → DGI → tenant RLS → approved migration/API contracts → consistent existing behavior/tests. |
| Review budget | A1a ≤400 authored physical changed lines; A1b ≤400 physical lines target; A2 alone is the 10,827-line one-file deletion exception. |
| Isolation | Clean immediate-predecessor worktrees; dirty planning root only for passive OpenSpec/Engram receipts. |

## Force-chained topology

```text
0.1 complete
  → A1a authority + runner/scaffolding
    → A1b generated reviewed manifest
      → A2 one-file app-lock deletion
        → INTEGRATE accepted A2 head to feat/fulfillment-repository-regressions-v2
          → 3.1b unblocked after ratchet and identity confirmation
            → B lint zero → C unit zero → D DB zero → E E2E zero → F complete zero / close #234
```

Every implementation PR targets its accepted immediate predecessor. INTEGRATE supersedes only PR #233. PRs #231 and #232 remain untouched. B–F are cleanup successors, not fulfillment 3.1b predecessors.

## A1a: authored authority and scaffolding

A1a provides the smallest transparent implementation needed to execute and compare gate results:

- root-authoritative workflow setup, cache, install, and filtered commands;
- explicit event-head checkout and SHA equality proof;
- clean checkout and non-mutating lint before/after proof;
- root README authority documentation and backend `lint`/`lint:fix` scripts;
- ratchet runner/scaffolding that consumes normalized gate output and an explicit manifest.

A1a is allowed to be RED because no approved manifest exists yet. Its output must say so; no status or summary may imply full green.

## A1b: manifest generation and review

A1b runs every full gate against exact base `50eec55` and emits one transparent record per known failure. A conceptual record is:

```text
gate: lint | unit | db | e2e
name: <lint rule or full test name>
source: <repository-relative stable file/suite identity>
```

The physical representation may add a schema/version field only when needed for deterministic parsing. It must remain human-reviewable, sorted deterministically, and target ≤400 physical lines.

Warnings are summarized separately and never enter the acceptance set. Build or scanner failures are not baseline debt to tolerate: build must execute, and focused tests/skips/quarantine/tolerated failures are integrity violations.

## Normalization algorithm

For each gate:

1. Capture the complete command result without suppressing a nonzero exit.
2. Parse each lint error or failed test into gate, full rule/test name, and stable source identity.
3. Convert source identity to repository-relative form.
4. Remove timestamps, ephemeral ports, durations, stack noise, absolute path prefixes, process IDs, and randomized runtime values.
5. Preserve distinctions between gates, rules, full test names, and source identities.
6. Deduplicate only exact normalized identity duplicates.
7. Sort records deterministically.
8. Compare the actual set with the approved manifest.

The runner fails when `actual - manifest` is non-empty. It reports `manifest - actual` as removable debt and requires those entries to be deleted before or with the next reviewed delivery. Once an entry is removed, reappearance lands in `actual - manifest` and fails.

## Integrity guards

Subset comparison is necessary but not sufficient. Acceptance also requires:

- exact tested-SHA equality;
- clean tree before and after non-mutating lint;
- all required full commands executed;
- no focused test, new skip, quarantine, or tolerated failure;
- no assertion or lint-rule weakening;
- no integration-replacing mock;
- real PostgreSQL 15 for DB and E2E;
- full HTTP application boundary for E2E;
- topology 3.1a present and selected;
- build executed successfully.

Any guard failure produces a failing check independently of manifest membership.

## CI conclusion and reporting

The job summary leads with one of three outcomes:

1. **Regression:** unknown/changed identities or an integrity violation; check fails.
2. **Known debt unchanged/subset:** check may pass, lists every remaining known identity prominently, and explicitly says “not full green.”
3. **Debt reduced:** check may pass, lists removed identities, and requires an explicit manifest reduction before or with the next reviewed delivery.

Warnings remain visible in a separate section. The summary records tested SHA, expected SHA, base identity, commands, environment, counts, manifest version/identity, and artifact/log references.

## Workflow execution order

Each required job uses event-authoritative checkout, SHA proof, clean-tree proof, Node 22, Corepack pnpm 11.22.0, root-store cache keyed by root `pnpm-lock.yaml`, root frozen install, then filtered backend scripts. There is no npm cache/install/script path, app-lock authority, unlocked install, or fallback.

The ratchet executes in this order:

```text
lint (non-mutating) → clean-tree proof → focused-test scanner → full unit
→ full DB on PostgreSQL 15 including topology 3.1a
→ full HTTP E2E on PostgreSQL 15 → build → normalize/compare/report
```

Individual commands may return inherited nonzero statuses, but orchestration must continue collecting all required results and then compute one fail-closed conclusion. Infrastructure/setup failures are not manifest identities and fail immediately or at final aggregation.

## A2 and INTEGRATE

A2 deletes only `apps/admin_backend/package-lock.json` from accepted A1b. Its 10,827 deleted lines are the sole oversized exception. Recovery is forward-only and never restores npm or app-lock authority.

INTEGRATE opens from accepted A2 head to `feat/fulfillment-repository-regressions-v2`. It must pass ratchet CI, GitGuardian, build, issue/link/label policy, and topology 3.1a. After the integration identity is confirmed, 3.1b is unblocked while #234 remains open.

## B–F cleanup

B–E fix authoritative root causes incrementally and remove corresponding manifest records. B reaches lint zero; C unit zero; D DB zero under DGI/migration/RLS authority; E full HTTP E2E zero. F proves one complete genuine zero-failure matrix, empties the manifest, and closes #234.

No cleanup may teach leaf tests to accept defects, weaken assertions/rules, bypass RLS, introduce destructive migrations, or replace integration with mocks. Ambiguity escalates under fixed contract precedence.

## Recovery and rollback

- **A1a/A1b:** forward-correct while preserving root pnpm and fail-closed ratchet authority.
- **A2:** forward-correct while preserving app-lock absence.
- **INTEGRATE:** corrective immediate successor; never substitute synthetic merge evidence for tested-head evidence.
- **B–F:** independently correct the defective root-cause slice; never re-add debt without separate approval.
- **Receipts:** stay passive in the planning root and never enter strict implementation diffs.

## Review focus

Review A1a for ≤400 authored lines, transparent orchestration, complete gate execution, and honest RED behavior without a manifest. Review A1b record-by-record against `50eec55`, especially normalization collisions. Review every later manifest diff as a downward-only contract change.
