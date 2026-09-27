# OHAC Slice 2b-2c1 Projection Task Projection

Authority: `openspec/changes/offline-human-authorization-credential/{design.md,tasks.md}` plus the user's decision to split projection from the blocked publisher, and the user's publisher authority decisions recorded as design §11.2 rows 17-18. This file is an ODD execution projection only.

Base: `origin/main` (`6837032`, merged PR #289)
Review budget: 400 changed lines
Status: DONE — both units merged into `main`.

## Tasks

- [x] Define the pure projection boundary and strict-TDD cases from design §4.1 and §11.2 decisions 13-15.
- [x] Extract `UserRole` into a framework-free identity vocabulary so `resolveEffectivePermissions` no longer loads TypeORM transitively. *(merged in PR #289 as `6837032`)*
- [x] Finalize deterministic staff-policy entry projection using `resolveEffectivePermissions`, bcrypt-prefix format derivation, explicit status, and sorted unique values.
- [x] Finalize and self-validate the canonical epoch envelope and digest without implementing database publication.
- [x] Re-run focused Jest, non-mutating ESLint/Prettier checks, build verification, independent verification, and confirm the review-facing diff stays within 400 lines. *(merged in PR #291 as `c88833a`)*

## Delivery state

- Prerequisite PR #289 (issue #288) squash-merged into `main` as `6837032`; its checks were green.
- Projection PR #291 (issue #290) squash-merged into `main` as `c88833a`; its checks were green.
- Commit `09b0eb0` was the pre-squash local prerequisite commit and is not an ancestor of `main`; `6837032` supersedes it.
- Local cleanup done: worktrees `ohac-2b-2c` and `ohac-user-role` removed, and branches `feat/ohac-user-role-boundary`, `feat/ohac-epoch-projection`, and `feat/ohac-epoch-publisher` deleted after confirming their content was already in `main`.
- This tracker now lives in the `ohac-publisher-design` worktree; its untracked `odd/` directory stays outside every PR boundary.

## Publisher decisions resolved (design §11.2 rows 17-18, PR #298 / issue #296)

- **Fan-out:** the publisher persists one immutable terminal-agnostic policy snapshot per `(tenant_id, sequence)`; the per-terminal epoch row is materialized on that terminal's first pull from the canonical enrolled relation and the negotiated build, guarded by the unique key for idempotency.
- **Empty policy:** publication fails closed, the previously published epoch keeps governing, and revoking the final PIN-enabled user stays an administrative operation whose representation is deferred.
- Publisher implementation remains a separate slice with its own tracker; it is not part of this projection.

## Evidence

- Boundary selected: projector under `human-authorization/projection/`; database queries, advisory locking, dirty-marker mutation, routes, and module registration remain outside this PR.
- Final candidate checks pass: focused Jest 16/16 across projector and boundary suites, ESLint without `--fix`, TypeScript Prettier check, Nest build, and `git diff --check`.
- Independent verifier PASS with no blockers; review-facing projection diff is exactly 400 lines against the merged prerequisite.
- Projection work-unit commit: `d017aa4`, rebuilt on merged `main` as `e6b5c04`, and merged as `c88833a`.
- Historical RED evidence for the projector is unavailable because both SDD apply attempts failed before returning their execution record; no projector RED claim is made.
- `UserRole` prerequisite strict-TDD evidence: boundary RED observed against the original entity import; GREEN passed 15/15 across boundary, permission, and entity-mapping specs. Non-mutating ESLint, Prettier, and Nest build passed. Independent verification PASS. Review-facing prerequisite diff: 74 authored lines. Pre-squash commit `09b0eb0`, merged as `6837032`.
