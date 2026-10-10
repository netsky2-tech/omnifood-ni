# Feature: Orphan-guard positive control + payment.entity no-migration note (issue #829)

- **Status:** IMPLEMENTED (focused spec green + mutation RED observed); full admin_backend unit run
  pending — the host forbids a full suite while a subagent is alive.
- **Issue:** #829 (`status:approved`, `type:tests`) — advisories `R3-ORPHAN-POSITIVE-CONTROL` and
  `R3-PAYMENT-TYPE-NO-MIGRATION` from review `review-3beb46530ec87586` (PR #827).
- **Branch:** `tests/orphan-guard-positive-control` from `main` (`900ff846`)
- **Worktree:** `/home/octavio_morales/omnifood-ni-orphan-guard`
- **Parallel-safe:** touches only `apps/admin_backend`; #830 (`apps/owner_dashboard`) is a different
  app and a different worktree, so the two never write the same file.

## Problem

1. **A guard with no proof it can still bite.** After `InventoryController` was retired in
   `359d3515`, `route-transport-registry.spec.ts` asserts only `expect(orphans).toEqual([])`. If
   `findUnregisteredSourceControllers` / `scanSourceControllerClasses` ever returns an empty list
   for the *wrong* reason (walk path moved, `.controller.ts` filter regressed, early return), the
   rule stays green forever and the security guard — "a dead, unregistered controller cannot be
   left invisible" — quietly stops existing.
2. **A fixed type with no explanation.** `payment.entity.ts` now declares
   `override_supervisor_ref` as `text` (fixed in `3cc05a3b`) and no migration followed. That is
   correct, but nothing in the file says why, so the next reader reasonably suspects an unfinished
   job and may "complete" it with a pointless ALTER.

## Scope

- A **two-sided positive control**: a fixture controller that no module serves, which the detector
  MUST report; and the same class reported as served+declared, which it MUST stop reporting. Without
  the second half, a detector that reported everything would also pass.
- The `payment.entity.ts` comment, written from verified evidence (migration, manifest, fix commit).

## Non-goals

- No change to `test/support/route-transport-registry.ts` (the detector itself): it works today and
  this issue is about proving it stays observable, not about rewriting it.
- No migration, no entity type change, no manifest entry (the manifest is a downward-only ratchet).
- No new orphan allowed in `src/`: the fixture lives in `test/fixtures/`, outside the scanned
  source dir, so the real zero-orphans rule is untouched.

## Acceptance criteria

- [x] RED observed with the detector "broken": mutation `scanSourceControllerClasses` →
      `return found;` before the walk. Result: the **existing** rule stayed green
      (`✓ serves and declares every @Controller class declared in source files`) while the **new**
      control failed (`✕ reports a source-declared controller that no module serves (positive
      control, #829)`). That asymmetry is exactly the blind spot the issue describes. Mutation
      reverted byte-identically (`sha256 1c680242bb85122d7fb13e0a8db57aa97658c6257bb1b607454a32db2d228e5d`,
      verified before and after).
- [x] Focused spec green after restore: `npx jest src/core/http/route-transport-registry.spec.ts
      --runInBand` → **17 passed** (16 existing + 1 new).
- [x] `npx eslint` (no `--fix`) on the 3 touched files: clean, exit 0.
- [x] `npm run test:no-only` OK.
- [ ] `npm test` full unit suite green (blocked: subagent alive on this host, see AGENTS.md limits).
- [ ] Work-unit commit + native review + PR `type:tests` green and merged.

## Tooling incident found while verifying (worth its own follow-up)

`npm run lint` in `apps/admin_backend` is `eslint "{src,apps,libs,test}/**/*.ts" --fix`: it
**rewrites the whole tree**, not just your files. Running it in this fresh worktree reformatted
**167 files** that were never touched by this change (+3.5k/−1.8k lines), including
`test/support/route-transport-registry.ts`, which I had just restored byte-identically for the RED
evidence. All 167 were reverted; the working tree is now exactly
`spec.ts +51 / payment.entity.ts +15 / test/fixtures/orphan-guard/ (new)`, prettier-clean.

- Local lint verification for admin_backend must therefore be
  `npx eslint <touched files>` **without `--fix`**.
- CI is unaffected in behaviour but this explains the line-number shift already recorded for the
  lint step (`--fix` runs first and moves lines before the test step reports them).

## Tasks

- [x] **T1** Worktree + branch + this doc + Engram mirror + todo.
- [x] **T2** Evidence gathering: read the spec, the detector (`scanSourceControllerClasses`
      requires `*.controller.ts`, spec files excluded; `file` is relative to `srcDir`), the
      migration `1809600000000`, the manifest header (downward-only ratchet, state empty), and
      `git show 3cc05a3b` (entity had no explicit type → DB already `text`).
- [x] **T3** Fixture `test/fixtures/orphan-guard/orphan-fixture.controller.ts` (deliberately
      unregistered, documented as such).
- [x] **T4** Positive control in the spec: reported-when-orphaned + not-reported-when-served.
- [x] **T5** Mutation RED (see Acceptance), byte-identical restore.
- [x] **T6** `payment.entity.ts` no-migration comment.
- [x] **T7** Reverted the `eslint --fix` tree pollution; re-verified focused spec + eslint(no fix)
      + prettier --check + test:no-only.
- [ ] **T8** Full `npm test` when no subagent is running on this host.
- [ ] **T9** Commit + native review + PR `type:tests` → merge (user's delivery call).

## Commits

(to be recorded when the work unit lands)
