# Exploration: restore-admin-backend-ci-baseline

## Executive finding

Admin Backend CI has split package-manager behavior: the repository declares pnpm 11.22.0 and a root workspace lockfile, while the backend workflow installs with npm from a stale app-level lockfile. Canonical root pnpm execution exposes inherited lint, unit, DB, and E2E failures. Those failures are known debt, not evidence that root pnpm authority is wrong.

The approved velocity strategy replaces the former full-green prerequisite with a fail-closed non-regression ratchet. CI still executes every real gate, but acceptance depends on the actual normalized failure identities being a subset of an explicitly reviewed manifest generated from exact base `50eec55`. Any new or changed identity fails.

## Governing delivery chain

```text
0.1 preflight (complete)
  → A1a authored pnpm authority + ratchet runner/scaffolding (≤400)
    → A1b generated and reviewed known-failure manifest (≤400 physical lines target)
      → A2 dedicated one-file package-lock deletion exception
        → INTEGRATE aggregate accepted A2 head to feat/fulfillment-repository-regressions-v2
          → unlock fulfillment 3.1b when ratchet and integration policy pass
            → B lint zero → C unit zero → D DB zero → E E2E zero → F complete zero matrix / close #234
```

Every delivery targets its accepted immediate predecessor. Passive OpenSpec and Engram receipts remain in the dirty planning root and outside strict implementation diffs.

## Historical evidence

Evidence supplied for PR #233 (`50eec55`) versus parent `18cfc5e` found no observed regression attributable to that PR. Canonical pnpm runs exposed inherited failures:

- lint: 236 errors and 5 warnings; historical mutating lint changed 37 files;
- unit: 1 suite / 3 tests failing, with 115 suites / 903 tests passing;
- DB: 2 suites / 3 tests failing; topology 3.1a passes where PR #233 ancestry is present;
- E2E: 17 suites / 149 tests failing, with 5 suites / 27 tests passing;
- build: passing, but insufficient by itself.

Warnings remain visible but are not acceptance failures. Observed clusters include inventory unit contract drift, invoice DB TypeScript failures, `SecurityProfile.custom_permissions` alignment, and shared identity JWT/guard/controller/provider composition drift. These are hypotheses for B–F, not permission to patch leaf tests.

## Ratchet model

### A1a — authored authority and runner

A1a stays at **≤400 authored physical changed lines** and establishes:

- root pnpm workflow authority with Node 22 and Corepack pnpm 11.22.0;
- root-lock cache inputs, root `pnpm install --frozen-lockfile`, and filtered backend commands;
- explicit PR-head SHA checkout, assertion, and recording;
- non-mutating lint plus before/after clean-tree proof;
- root README authority documentation and backend package scripts;
- a transparent ratchet runner and minimum scaffolding for normalized gate output.

A1a may remain RED until A1b supplies the reviewed manifest. It must never claim inherited suites are fully green.

### A1b — generated known-failure evidence

A1b is generated from exact base `50eec55` by running full non-mutating lint, focused-test scanning, full unit, full real-PostgreSQL 15 DB including topology 3.1a, full HTTP E2E on real PostgreSQL, and build. Its explicit manifest has one transparent record per known failing identity and targets **≤400 physical lines**.

Each identity contains the gate, rule or full test name, and stable source identity. Normalization removes timestamps, ports, durations, stack noise, and absolute paths. Warnings are reported separately. The ratchet passes only when current failing identities are a subset of the approved manifest.

Unknown or changed identities fail. A focused test, skip, quarantine, tolerated failure, integration mock, checkout mutation, or tested-SHA mismatch also fails. Manifest entries may be removed by an explicit reviewed update when failures are fixed; they may never be added without a separately approved baseline-change decision. Once removed, an identity cannot reappear.

### A2 and integration

A2 is the sole oversized exception: a dedicated one-file deletion of the 10,827-line `apps/admin_backend/package-lock.json`, with no scope smuggling. It starts from accepted A1b and preserves root pnpm authority and the ratchet.

INTEGRATE aggregates the accepted A2 head into `feat/fulfillment-repository-regressions-v2`, superseding only PR #233. It must pass ratchet CI, GitGuardian, build, issue/link/label policy, and preserve topology 3.1a. Confirmed integration identity unlocks fulfillment 3.1b; it does not close issue #234 or represent inherited debt as full green.

### B–F — downward cleanup

B–F are the long-term repair path: lint zero, unit zero, DB zero, E2E zero, then one complete zero-failure matrix. They may proceed incrementally after INTEGRATE and are not predecessors of fulfillment 3.1b. Every accepted repair tightens the manifest toward zero. F closes issue #234 only after the complete matrix is genuinely green.

## Preserved guardrails

Repair precedence remains approved OpenSpec → DGI → tenant RLS → approved migration/API contracts → consistent existing behavior/tests. Ambiguity escalates rather than being guessed. No assertion or rule weakening, destructive migration, quarantine, new skip, tolerated failure, or integration-replacing mock is permitted.

The current dirty root remains invalid for implementation. Implementation uses isolated clean chain worktrees; unrelated fulfillment and `owner_dashboard` work stays excluded. A2 remains the only oversized mechanical exception.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Known debt is mistaken for green | Prominent known-failure reporting; passing conclusion explicitly says unchanged/subset debt, never full green. |
| Normalization hides a changed failure | Retain gate + full rule/test name + stable source identity; strip only volatile noise. |
| Manifest becomes an allowlist for new debt | Reject additions without a separately approved baseline-change decision; ratchet reviewed entries downward only. |
| A fixed failure reappears | Require the next reviewed delivery to remove stale entries; removed identities fail if they return. |
| Integration evidence becomes synthetic | Assert the event-authoritative tested SHA and keep merge/integration identity distinct. |
| Dirty or unrelated work contaminates delivery | Use isolated immediate-predecessor worktrees and exact allowlists; keep passive receipts outside implementation diffs. |

## Next action

A1a is next. No implementation branch or worktree exists yet. It may establish the runner while remaining explicitly RED until A1b creates and reviews the normalized manifest from `50eec55`.
