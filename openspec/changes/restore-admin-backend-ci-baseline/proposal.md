# Restore the Admin Backend CI Baseline

## Governing intent

Establish root pnpm authority and a fail-closed non-regression ratchet so fulfillment 3.1b can proceed without waiting for all inherited Admin Backend debt to reach zero. CI continues to run every full real suite. It passes only when every actual normalized failing identity is already present in the reviewed baseline manifest and no forbidden coverage weakening or execution drift occurs.

Known failures remain prominent, issue #234 stays open, and the manifest can only tighten toward zero.

## Mandatory chain

```text
0.1 → A1a → A1b → A2 → INTEGRATE → unlock 3.1b
                                  → B → C → D → E → F → close #234
```

All work is force-chained through accepted immediate predecessors. B–F are long-term cleanup after INTEGRATE and are no longer prerequisites for fulfillment 3.1b.

## Delivery slices

### A1a — authored pnpm authority and ratchet scaffolding

A1a is **≤400 authored physical changed lines**. It establishes root pnpm workflow authority, Node 22/Corepack pnpm 11.22.0, root frozen install/cache/filter commands, PR-head SHA proof, non-mutating lint with clean-tree proof, root README documentation, backend package scripts, and the ratchet runner/scaffolding.

The stale app package-lock may remain physically present during A1a but is unused and non-authoritative. A1a may remain RED until A1b provides the reviewed manifest and must not claim full green.

### A1b — generated reviewed baseline

A1b generates an explicit normalized known-failure manifest from exact base `50eec55`. It targets **≤400 physical lines** and records one transparent identity for each known lint error and failed unit, DB, or E2E test. Warnings are reported but are not acceptance failures.

An identity is stable: gate + lint rule or test full name + stable source identity. Timestamps, ports, durations, stack noise, and absolute paths are removed. Current failures must be a subset of the manifest. Unknown or changed failures fail closed.

Manifest additions require a separately approved baseline-change decision. Fixes may reduce the actual set; the manifest must be reduced before or with the next reviewed delivery, and removed identities may not reappear.

### A2 — mechanical deletion exception

A2 starts from accepted A1b. Its sole payload is deletion of the 10,827-line `apps/admin_backend/package-lock.json`. No workflow, documentation, package-script, ratchet, source, test, generated-payload, or semantic change may be smuggled into this exception.

### INTEGRATE — velocity gate

Open the aggregate PR from accepted A2 head to `feat/fulfillment-repository-regressions-v2`, superseding only PR #233. It must pass ratchet CI, GitGuardian, build, issue/link/label policy, and preserve topology 3.1a. After integration identity is confirmed, fulfillment 3.1b is unblocked.

The passing ratchet conclusion means exact known debt is unchanged or reduced; it never means full green. Issue #234 remains open.

### B–F — long-term zero-debt path

- **B:** reduce lint failures to zero.
- **C:** reduce unit failures to zero.
- **D:** reduce DB failures to zero on real PostgreSQL 15 while preserving topology 3.1a, DGI, migration, and RLS authority.
- **E:** reduce HTTP E2E failures to zero on real PostgreSQL.
- **F:** pass one complete genuine zero-failure matrix and close issue #234.

Each reviewed repair tightens the manifest downward. B–F may proceed incrementally and do not block fulfillment 3.1b after INTEGRATE.

## Ratchet acceptance contract

Every required run executes:

- root `pnpm install --frozen-lockfile`;
- non-mutating lint with before/after clean-tree proof;
- focused-test scanner;
- full unit suite;
- full DB suite against real PostgreSQL 15, including topology 3.1a;
- full HTTP E2E suite against real PostgreSQL;
- build.

The run fails if any actual failure identity is absent from the manifest, a focused test/skip/quarantine/tolerated failure is introduced, integration is mocked, checkout mutates, or the tested SHA differs from event authority. Known failures are reported prominently. A pass is permitted only because the actual set is an unchanged subset of reviewed debt.

## Preserved guardrails

- Root `package.json`, `pnpm-workspace.yaml`, and `pnpm-lock.yaml` remain dependency authority.
- Pull requests test `${{ github.event.pull_request.head.sha }}`; pushes test `${{ github.sha }}`.
- Contract precedence remains approved OpenSpec → DGI → tenant RLS → approved migration/API contracts → consistent existing behavior/tests.
- No assertion/rule weakening, destructive migration, new skip, quarantine, tolerated failure, or integration-replacing mock is allowed.
- Implementation uses isolated clean worktrees; passive OpenSpec/Engram receipts stay outside strict implementation diffs.
- Fulfillment implementation and `owner_dashboard` remain outside this change.

## Recovery

A1a, A1b, and A2 use forward-only correction that preserves root pnpm authority and the ratchet; A2 recovery never restores the app lockfile. Later repairs remain independently recoverable without adding manifest debt or weakening a gate. An entry can be added only through a separately approved baseline-change decision.
