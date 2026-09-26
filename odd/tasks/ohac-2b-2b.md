# OHAC Slice 2b-2b Task Projection

Authority: `openspec/changes/offline-human-authorization-credential/{design.md,tasks.md}`. This file is an ODD execution projection only and does not replace the SDD artifacts.

Branch: `feat/ohac-persistence-markers`
Base: `feat/ohac-rls-seam` (`4b66944`)
Review budget: 400 changed lines

## Tasks

- [x] Map the existing migration and SQL-spec conventions for the two additive persistence changes.
- [x] Add strict-TDD coverage and the per-user `attemptResetGeneration` migration required by design §11.2 decision 14.
- [x] Add strict-TDD coverage and the durable tenant dirty-marker migration required by design §11.2 decision 16.
- [x] Run focused Jest, non-mutating ESLint/Prettier checks, build verification, and confirm the diff stays within the 400-line slice budget.

## Evidence

- Work-unit commit: `94fd158ccfa1e970d28cdea52e7971233e2b734b` (`feat(identity): persist OHAC reset and publication state`).
- Approved issue: `#283`.
- Parent PR `#282` merged to `main` as `7e853510b3f39de9957f86e984828817f98624f8`.
- Original stacked PR `#284` was closed after retargeting exposed the squash-parent diff; replacement PR `#287` was rebuilt from current `main` with a matching stable patch-id.
- Replacement PR `#287` passed `lint-and-test`, `build`, and GitGuardian, then squash-merged to `main` as `528d8ce30dcbcbf4ba467453f71f5aaa91ab17ae`.
- Mapping completed read-only: next timestamps are `1809030000000` and `1809040000000`; migration slices remain separate from entity mapping; OHAC rollback retains durable storage.
- Strict TDD observed: both specs failed with TS2307 before implementation, then passed at 11 tests and 14 tests after triangulation.
- Independent verification: focused Jest 2/2 suites and 14/14 tests passed; ESLint (no `--fix`), Prettier check, and Nest build passed.
- Review-facing slice is 395 authored lines, including `apply-progress.md`; parent-owned ODD projection is outside the PR boundary.
- Carried obligation: slice 2b-2c must use conditional revision predicates to prevent lost dirty signals and must resolve permissions with `resolveEffectivePermissions`.
