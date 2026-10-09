# Feature: Live-suite hardening — NHILOS_LIVE_API fallback + canonical :3300 (issue #828)

- **Status:** IMPLEMENTED — checks green locally; native review + PR pending
- **Issue:** #828 (`status:approved`, `type:bug`) — backflow of review `review-3beb46530ec87586` (PR #827)
- **Branch:** `fix/live-suites-base-url` from `main` (`dc9842fe`)
- **Worktree:** `/home/octavio_morales/omnifood-ni-live-suites-hardening` (isolated — never write on `main`)
- **Rule (user):** always isolated worktree + branch; ports 3000/5173 belong to other worktrees (p3 stack) and are untouched.

## Problem

1. **R3-EMPTY-ENV-BASE-URL:** the live suites read
   `process.env.NHILOS_LIVE_API ?? "http://127.0.0.1:3300/api"`. `??` only guards
   `null`/`undefined`, so a **present-but-empty** variable (`NHILOS_LIVE_API=` in a shell
   export, a CI env block, or a `.env` line) yields `API_BASE = ""` → requests go to
   `/identity/login` against a relative path → confusing `ECONNREFUSED`/404 failures that
   look like backend bugs.
2. **R3-W1-DEFAULT-PORT-MISMATCH:** the canonical default for live suites must be `:3300`
   (the local shadow stack), never `:3000` (owned by another worktree's stack). The decision
   must be stated once, in code, and repeated explicitly in suite headers/config docs.

## Scope

- New pure helper `apps/owner_dashboard/src/lib/live-api-base.ts` exporting
  `resolveLiveApiBase()` (and the generic env-orphans helpers it needs): empty/blank/absent →
  canonical default; valid → trimmed. No `import.meta.env`, so it is usable from both the
  Vitest node suites and the Playwright live spec.
- Unit test `src/__tests__/live-api-base.test.ts` written **test-first** (RED observed before
  the implementation exists), covering empty, whitespace-only, absent, and valid values.
- Apply the helper in: `src/__tests__/w1.integration.test.ts`,
  `src/__tests__/w4-e2e-fiscal.test.ts`, `src/__tests__/modifiers-live.integration.test.ts`,
  and `e2e/modifiers-live.live.spec.ts` (base URL + credentials env orphans).
- Headers/config docs: canonical `:3300` decision stated once per live surface
  (`vitest.integration.config.ts`, `playwright.live.config.ts`, suite headers);
  grep for remaining `localhost:3000` in dashboard suites and classify each hit.

## Non-goals

- No change to the app's runtime base URL logic (`src/lib/api-base-url.ts`, `vite.config.ts`
  dev proxy on `:3000`) — that is the dev proxy contract, not a live suite.
- No backend changes, no new tests for backend behavior, no CI workflow surgery.
- No touching the p3 worktree, its stack, or ports 3000/5173.
- #830 (suite inventory `contract/api` vs `live`) stays a separate issue.

## Acceptance criteria

- [x] Unit test RED→GREEN for the fallback: empty, whitespace-only, absent, valid.
      Evidence: RED with the pre-fix `??` semantics = 9 named failures
      (`expected '' to be 'http://127.0.0.1:3300/api'`, `expected '   ' to be …`);
      after implementing `src/lib/live-api-base.ts`: **18/18 passed**.
- [x] `npm run test:integration` green **42/42** against the backend on `:3300`
      (`env -u NHILOS_LIVE_API npm run test:integration` → 3 files / 42 tests, 2.45 s) —
      canonical default path proven with the variable genuinely absent.
      The `:3300` stack answering was the already-running `main`-worktree backend
      (`dist/main`, pid 139039); this branch touches **no** backend file, so it is the same
      code as the branch base, and the p3 stack on `:3000/:5173` was never used or disturbed.
- [x] `npm run typecheck` (`tsc -b --noEmit`) clean + `npm run lint` (`oxlint src`) clean
      (only pre-existing warnings in untouched files, exit 0).
- [x] Full default unit suite: `npx vitest run --no-file-parallelism` → **100 files, 1451 passed,
      4 skipped** (serial on purpose: WSL2 memory cap, see AGENTS.md).
- [x] Grep `localhost:3000` in owner_dashboard: **0 live-suite hits**. Remaining 4 hits are the
      app/runtime dev-proxy contract, deliberately untouched: `src/lib/api-base-url.ts:11`
      (doc), `src/__tests__/api-base-url.test.ts:28` (asserts that contract),
      `vite.config.ts:30` (Vite proxy target), `docs/staging-environment.md:109`.
- [x] Empty-env regression proven by an executed run: old pattern resolved
      `NHILOS_LIVE_API=` → `""` → login URL `"/identity/login"` (the confusing failure);
      with the helper, `NHILOS_LIVE_API= npm run test:integration` → **42/42**.
- [ ] Issue #828 → PR (`type:bug`) green; native review on the work-unit candidate.

## Tasks

- [x] **T1** Worktree `/home/octavio_morales/omnifood-ni-live-suites-hardening` + branch
      `fix/live-suites-base-url` from `main` (`dc9842fe`); `pnpm install` (2.9 s); this doc +
      Engram mirror (obs 10047) + todo. Local-only `apps/admin_backend/.env` copied from the
      main worktree (gitignored, never committed).
- [x] **T2** `src/__tests__/live-api-base.test.ts` written first. RED recorded twice: (a) module
      absent → `Failed to resolve import "@/lib/live-api-base"`; (b) with the pre-fix `??`
      semantics → 9 named failures, exactly the empty/blank/trim defects.
- [x] **T3** `src/lib/live-api-base.ts` (`envValue`, `resolveLiveEnv`, `resolveLiveApiBase`,
      `resolveLiveWebBase`, canonical defaults) → 18/18 GREEN; full unit suite still green.
- [x] **T4** Applied in all live surfaces: `w1.integration`, `w4-e2e-fiscal`,
      `modifiers-live.integration` (API base) and `e2e/modifiers-live.live.spec.ts`
      (`NHILOS_LIVE_BASE` + `NHILOS_LIVE_EMAIL` + `NHILOS_LIVE_PASSWORD`). Same defect class also
      fixed in `e2e/manual-screenshots.live.spec.ts` (`MANUAL_E2E_*`) — 4 lines, same family.
- [x] **T5** Canonical `:3300` decision stated in code (`live-api-base.ts`) + headers/configs
      (`vitest.integration.config.ts`, `playwright.live.config.ts`, suite headers); the wrong
      `npm run start:dev` (→ `:3000`) and the stale `pass: admin` prerequisites in the w1 header
      were corrected. `localhost:3000` sweep classified above.
- [x] **T6** Checks as listed in Acceptance criteria (all green).
- [ ] **T7** Work-unit commit + evidence recorded here and in the mirror; native review
      (ASSESS on the candidate) → PR `type:bug` linked to #828.

## Follow-ups found (not in this issue)

- `e2e/manual-screenshots.live.spec.ts` defaults look stale against the current fixture tenant:
  `http://soho.localhost:5174` + `admin@soho.com` / `C0ntr4sen4`, while the live fixture is
  `soho-test-fixture.localhost` + `sofia@omnifood.ni` / `password123`. Only its default VALUES
  are suspect (blank-env behaviour is fixed here); changing credentials is a separate decision
  for the manual owner.
- #830 keeps the suite inventory (`w1-api`/`w5-api` named `.integration` but running in `npm test`).

## Commits

(to be recorded as work units land — see T7)
