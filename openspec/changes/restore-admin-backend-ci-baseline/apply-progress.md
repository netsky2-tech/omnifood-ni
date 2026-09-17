# Apply Progress: Restore Admin Backend CI Baseline

## Current state

**0.1 COMPLETE. A1a is next. No implementation branch or worktree exists.**

This planning-only revision records the user-approved velocity strategy. No implementation, workflow, package, test, branch, worktree, PR, issue, staging, commit, push, or dependency mutation was performed.

## Strategy decision

The complete zero-failure matrix is no longer a prerequisite for fulfillment 3.1b. The release path is now:

```text
0.1 → A1a → A1b → A2 → INTEGRATE → unlock 3.1b
```

A1a establishes authored root pnpm authority and ratchet runner/scaffolding at ≤400 physical changed lines. It may remain explicitly RED until A1b supplies the reviewed manifest and must never claim full green.

A1b generates and reviews the normalized known-failure manifest from exact base `50eec55`, with one stable record per lint error and failed unit/DB/E2E test and a ≤400 physical-line target. The ratchet executes all full real suites and fails on every unknown or changed identity or integrity violation. Warnings remain visible but are not acceptance failures.

A2 remains the dedicated one-file 10,827-line deletion of `apps/admin_backend/package-lock.json`. INTEGRATE aggregates accepted A2 head to `feat/fulfillment-repository-regressions-v2`, supersedes only PR #233, and must pass ratchet CI, GitGuardian, build, issue/link/label policy, and topology 3.1a. Confirmed integration identity unlocks 3.1b.

B–F remain the long-term lint/unit/DB/E2E/full-zero path after INTEGRATE. They are not predecessors of 3.1b. Issue #234 stays open until F proves a genuine zero-failure matrix. Manifest changes only tighten downward; additions require a separately approved baseline-change decision.

## Retained preflight evidence

| Check | Evidence |
|---|---|
| Approval | Issue #234 was OPEN with labels `status:approved` and `type:chore`; it remains the debt tracker through F. |
| Exact baseline | PR #233 head was `50eec55d4cea15bdf32d3147ada966df7794f54e`, with base `feat/fulfillment-repository-regressions-v2`. |
| Topology | `apps/admin_backend/src/modules/fulfillment/services/tenant-topology-revision.service.db.spec.ts` was present through PR #233 ancestry. |
| Inherited state | Canonical pnpm lint/unit/DB/E2E evidence was RED and is not full-green evidence. |
| Isolation | Planned A1a implementation branch/worktree were absent and remain uncreated. The dirty planning root is forbidden for implementation. |
| Physical accounting | Normal authored slices use physical additions + deletions. A2 is the sole oversized one-file exception at 10,827 deleted lines. |
| Receipt boundary | OpenSpec/Engram updates remain passive planning-root receipts outside strict implementation diffs. |

## Ratchet acceptance summary

Every run still executes frozen root install, non-mutating lint and clean-tree proof, focused-test scanning, full unit, full real-PostgreSQL 15 DB including topology 3.1a, full HTTP E2E on real PostgreSQL, and build.

A pass is allowed only when actual normalized failures are a subset of reviewed known debt and no focused test/skip/quarantine/tolerance, integration mock, checkout mutation, tested-SHA mismatch, omitted gate, or assertion/rule weakening exists. Known failures must be prominent and labeled as known debt, never full green.

If actual debt shrinks, the manifest must be reduced before or with the next reviewed delivery. Removed identities cannot reappear.

## Next gate

Obtain the user's implementation-start approval, then create the isolated A1a branch/worktree from the exact approved predecessor. Until then, no implementation branch or worktree exists and no implementation action has started.
