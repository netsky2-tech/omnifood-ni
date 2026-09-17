# Admin Backend CI Baseline Specification

## Purpose

The Admin Backend SHALL use root pnpm authority and a fail-closed non-regression ratchet before fulfillment 3.1b proceeds. Full inherited zero-failure status is NOT a prerequisite for 3.1b. Issue #234 SHALL remain open until the complete matrix genuinely reaches zero failures.

## Requirements

### Requirement: Delivery follows the force-chained velocity DAG

Delivery MUST follow `0.1 → A1a → A1b → A2 → INTEGRATE`. Every slice MUST start from its accepted immediate predecessor. After INTEGRATE passes and its integration identity is confirmed, fulfillment 3.1b SHALL be unblocked.

B → C → D → E → F SHALL remain the force-chained long-term cleanup path after INTEGRATE. B–F MUST NOT be treated as predecessors of fulfillment 3.1b. Passive OpenSpec and Engram receipts MUST remain outside strict implementation diffs.

#### Scenario: Ratchet integration releases 3.1b

- GIVEN 0.1, A1a, A1b, and A2 are accepted in immediate-predecessor order
- AND INTEGRATE passes all required ratchet and repository-policy checks
- WHEN the aggregate integration identity on `feat/fulfillment-repository-regressions-v2` is confirmed
- THEN fulfillment 3.1b is unblocked
- AND issue #234 remains open
- AND no full-zero B–F evidence is required for that unblock.

### Requirement: A1a establishes authored pnpm and ratchet authority

A1a MUST remain at **≤400 authored physical changed lines**. It MUST establish root pnpm workflow authority, Node 22, Corepack pnpm 11.22.0, root-lock cache inputs, root `pnpm install --frozen-lockfile`, filtered backend commands, event-authoritative SHA proof, non-mutating lint with before/after clean-tree proof, README documentation, backend package scripts, and ratchet runner/scaffolding.

During A1a, `apps/admin_backend/package-lock.json` MAY remain physically present but MUST be unused and explicitly non-authoritative. A1a MAY remain RED until A1b supplies the reviewed manifest and MUST NOT report inherited suites as fully green.

#### Scenario: A1a is bounded and honest

- GIVEN a proposed A1a
- WHEN its paths, physical changed lines, workflow, scripts, documentation, and ratchet scaffolding are reviewed
- THEN it contains only authority and runner work required by A1a
- AND it has **≤400 authored physical changed lines**
- AND no inherited failure is concealed or called green
- AND absence of the A1b manifest keeps ratchet acceptance RED.

### Requirement: A1b records the reviewed known-failure baseline

A1b MUST generate and review an explicit normalized known-failure manifest from exact base `50eec55`. It SHOULD stay at **≤400 physical lines**. It MUST contain one transparent record per known failing identity for lint errors and failed unit, DB, and E2E tests. Warnings MUST be reported separately and MUST NOT be acceptance failures.

Each identity MUST contain the gate, the lint rule or full test name, and stable source identity. Normalization MUST remove timestamps, ports, durations, stack noise, and absolute paths without merging distinct failures.

#### Scenario: Baseline records stable identities

- GIVEN all required gates run on exact base `50eec55`
- WHEN A1b generates the manifest
- THEN every lint error and every failed unit, DB, and E2E test has one explicit stable record
- AND warnings remain visible outside the acceptance set
- AND volatile execution noise does not alter identity
- AND distinct rules, tests, gates, or stable source identities remain distinct.

### Requirement: The ratchet fails closed on regression

For every reviewed run, the actual normalized failing-identity set MUST be a subset of the approved manifest. Any unknown or changed identity MUST fail the check.

The check MUST also fail if a focused test, skip, quarantine, or tolerated failure is introduced; integration is mocked; checkout mutates; the tested SHA differs from event authority; a required gate is omitted; or an assertion/rule is weakened.

#### Scenario: Known debt may pass without being called green

- GIVEN all required full gates execute on the tested SHA
- WHEN every actual failure identity is present in the approved manifest and no forbidden condition occurs
- THEN the ratchet check may pass
- AND known failures are reported prominently
- AND the conclusion states that exact reviewed debt is unchanged or reduced
- AND it does not represent the suites as fully green.

#### Scenario: New or changed debt fails

- GIVEN an approved manifest
- WHEN an actual failing identity is absent from that manifest or differs in gate, rule/test full name, or stable source identity
- THEN the ratchet fails closed
- AND the unknown identity is reported for review
- AND it is not silently normalized into an existing entry.

### Requirement: The manifest only tightens toward zero

Manifest entries MUST NOT be added without a separately approved baseline-change decision. If the actual failing set shrinks, CI MAY pass, but the stale manifest entries MUST be removed before or with the next reviewed delivery. Once removed, an identity MUST NOT reappear.

#### Scenario: A fix ratchets the baseline downward

- GIVEN a reviewed repair removes one or more actual failures
- WHEN that repair or the next reviewed delivery is prepared
- THEN the corresponding manifest records are deleted explicitly
- AND no unrelated records are added
- AND a later reappearance of a removed identity fails as unknown debt.

### Requirement: Full real verification always executes

Every required ratchet run MUST execute root frozen install, non-mutating lint, focused-test scanning, full unit, full real-PostgreSQL 15 DB including topology 3.1a, full HTTP E2E on real PostgreSQL, and build. Before/after lint cleanliness and tested-SHA equality MUST be proven in the same run.

#### Scenario: Partial or synthetic evidence is rejected

- GIVEN a run that omits a suite, selects only passing tests, uses a mock instead of real PostgreSQL/HTTP integration, mutates checkout, or tests a different SHA
- WHEN ratchet acceptance is evaluated
- THEN the run fails regardless of manifest membership
- AND it cannot unlock fulfillment 3.1b.

### Requirement: Event-authoritative root pnpm operations are exact

Every Admin Backend job MUST check out `${{ github.event.pull_request.head.sha }}` for pull requests or `${{ github.sha }}` for pushes, assert and record the resolved SHA, prove a clean checkout, configure Node 22 and Corepack pnpm 11.22.0, resolve/cache the pnpm store against root `pnpm-lock.yaml`, run root `pnpm install --frozen-lockfile`, and invoke scripts as `pnpm --filter admin_backend run <script>`.

#### Scenario: npm and checkout drift fail

- GIVEN an Admin Backend job
- WHEN setup and execution are inspected
- THEN npm cache/install/script paths, app-lock cache authority, unlocked install, fallback package authority, checkout mutation, and SHA mismatch each fail acceptance.

### Requirement: A2 is the one-file deletion exception

A2 MUST start from accepted A1b and MUST delete only `apps/admin_backend/package-lock.json`, comprising 10,827 physical deleted lines. It MUST NOT contain workflow, documentation, package-script, ratchet, source, test, generated-payload, or semantic changes.

#### Scenario: A2 rejects scope smuggling

- GIVEN a proposed A2
- WHEN its diff is reviewed
- THEN the only changed file is `apps/admin_backend/package-lock.json`
- AND the file is deleted in full
- AND any other implementation payload causes rejection.

### Requirement: INTEGRATE preserves topology and repository policy

INTEGRATE MUST aggregate accepted A2 head into `feat/fulfillment-repository-regressions-v2` and supersede only PR #233. It MUST pass ratchet CI, GitGuardian, build, issue/link/label policy, and preserve topology 3.1a.

#### Scenario: Integration identity is sufficient and bounded

- GIVEN accepted A2 and a policy-compliant aggregate PR
- WHEN ratchet CI, GitGuardian, build, links/labels, and topology 3.1a pass
- AND the resulting integration identity is confirmed
- THEN 3.1b is unblocked
- AND PRs other than #233 are not superseded
- AND issue #234 remains open for B–F.

### Requirement: Repairs preserve authoritative semantics

All cleanup MUST follow approved OpenSpec → DGI → tenant RLS → approved migration/API contracts → consistent existing behavior/tests. Ambiguity MUST be escalated. Repairs MUST NOT introduce destructive migrations, coordinated-client breaks, assertion/rule weakening, skips, quarantine, tolerated failures, or integration-replacing mocks.

#### Scenario: Authority conflict blocks guessing

- GIVEN conflicting implementation, migration, fixture, test, or contract evidence
- WHEN fixed precedence does not resolve behavior
- THEN the conflict and decision owner are escalated
- AND no guessed semantic or manifest addition is accepted.

### Requirement: B–F close issue #234 at genuine zero

B MUST reach lint zero, C unit zero, D DB zero on real PostgreSQL 15, E HTTP E2E zero on real PostgreSQL, and F one complete zero-failure matrix. Each accepted repair MUST tighten the manifest downward. Issue #234 MUST close only after F is genuinely green.

#### Scenario: Long-term debt reaches zero

- GIVEN INTEGRATE has completed and B–E have removed their known debt
- WHEN F runs all required gates on one reviewed head with an empty failure set
- THEN the matrix is reported fully green
- AND the manifest is empty
- AND issue #234 may close.
