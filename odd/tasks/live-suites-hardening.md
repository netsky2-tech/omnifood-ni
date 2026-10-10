# Feature: Live-suite hardening — NHILOS_LIVE_API fallback + canonical :3300 (issue #828)

- **Status:** REVIEWED ×2 — `f2e5f8c9` approved by `review-bd2c8471dd9fffc1`; unit 2
  (`d8a17901`, branch scope) approved by `review-a3a6dda7260ed188`; both receipts acknowledged.
  Push + PR authorized by the user; merge only with CI green.
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
- [x] **T7a** Work-unit commit `f2e5f8c9` (10 files, +327/−24) + evidence here and in the
      Engram mirror (obs 10047).
- [x] **T7b** RDD ASSESS on the committed candidate (`baseRef=HEAD~1`, committedOnly): risk
      **medium**, writer profile `large` (runtime), plan = writer self-verification, no separate
      verifier — the self-verification is the executed evidence above.
- [x] **T7c** Native ordinary review `review-bd2c8471dd9fffc1` → **APPROVED** and acknowledged
      (authority burned, `gentle-ai.review-acknowledged/v1`). Two non-blocking advisories
      recorded below.
- [ ] **T7d** Unit 2 commit + its own native review, then push + PR `type:bug` linked to #828
      (user authorized push + PR; merge only with CI green).

## Unit 2 — both review advisories fixed (user decision: fix now)

Test-first again. RED with the pre-fix helper exported as a bare skeleton:
**11 named failures** (`expected 'http://127.0.0.1:3300' to be 'http://127.0.0.1:3300/api'`,
`expected TypeError: Invalid URL … to be an instance of LiveApiConfigError`).

- **R3-NO-API-PREFIX-VALIDATION** → `resolveLiveApiBase()` now parses the value and appends
  `/api` exactly once: origin alone (`http://127.0.0.1:3300`) → `http://127.0.0.1:3300/api`;
  `/api/` → `/api` (never doubled); any other non-empty path (proxied prefix) is preserved with
  its trailing slash removed. Proven against the real backend:
  `NHILOS_LIVE_API=http://127.0.0.1:3300 npm run test:integration` → **42/42**.
- **R3-URL-CONSTRUCT-THROWS** → new `resolveLiveApiOrigin()` + `LiveApiConfigError`; the
  Playwright live config uses it instead of `new URL(...)`. Unusable values (relative path,
  missing scheme, non-http protocol, credentials, query string, fragment) fail fast with a
  message that **names `NHILOS_LIVE_API` and never echoes the value** (secrets), matching the
  existing `src/lib/api-base-url.ts` discipline. Observed in both runners:
  `NHILOS_LIVE_API=127.0.0.1:3300/api` (vitest) and `NHILOS_LIVE_API=/api` (playwright --list)
  → `LiveApiConfigError: Invalid NHILOS_LIVE_API: an absolute http(s) URL is required. …`
- Contract updated in the module header and in the `modifiers-live.integration` header
  (origin alone is now documented as valid).

Native review of unit 2: `review-a3a6dda7260ed188` (tier medium, lens `review-reliability`,
534 changed lines frozen, correction budget 200) → **APPROVED** and acknowledged; it left 2 more
informational advisories, recorded below, with no correction offered.

Checks after unit 2: `live-api-base.test.ts` **31/31**; integration unset / blank /
origin-only → **42/42** each; full default unit suite `--no-file-parallelism` →
**100 files, 1464 passed, 4 skipped**; `npm run typecheck` clean; `npm run lint` clean (0 hits
in the touched files); `playwright test --list -c playwright.live.config.ts` → 15 tests / 2 files.

## Unit 2 review advisories (`review-a3a6dda7260ed188`, non-blocking)

- **R3-001** (`src/lib/live-api-base.ts:112-114`, WARNING): `resolveLiveApiOrigin()` re-parses the
  string that `resolveLiveApiBase()` just produced. Accepted deliberately: the value has to be
  parsed to extract an origin, and re-validating the public function's output keeps the two
  exports independent of call order. If it ever shows up in a hot path, cache the `URL`.
- **R3-002** (`src/lib/live-api-base.ts:65-66`, SUGGESTION): `resolveLiveEnv()` applies only the
  blank/trim rule — no URL validation — which is correct for non-URL variables
  (`NHILOS_LIVE_EMAIL`, `MANUAL_E2E_PASS`) and is why `NHILOS_LIVE_API` has its own resolver.
  Kept as-is; documented here so the next reader does not "simplify" the two into one.

## Native review advisories (non-blocking, candidate approved)

- **R3-NO-API-PREFIX-VALIDATION** (`src/lib/live-api-base.ts:50-53`, SUGGESTION) — **fixed in
  unit 2** (see above): the `/api` prefix is now appended exactly once instead of only documented.
- **R3-URL-CONSTRUCT-THROWS** (`playwright.live.config.ts:45`, WARNING) — **fixed in unit 2**:
  `resolveLiveApiOrigin()` raises `LiveApiConfigError` naming the variable; no bare `TypeError`
  path is left.

## Follow-ups found (not in this issue)

- `e2e/manual-screenshots.live.spec.ts` defaults look stale against the current fixture tenant:
  `http://soho.localhost:5174` + `admin@soho.com` / `C0ntr4sen4`, while the live fixture is
  `soho-test-fixture.localhost` + `sofia@omnifood.ni` / `password123`. Only its default VALUES
  are suspect (blank-env behaviour is fixed here); changing credentials is a separate decision
  for the manual owner.
- #830 keeps the suite inventory (`w1-api`/`w5-api` named `.integration` but running in `npm test`).

## Commits

- `d8a17901` — `fix(dashboard): fail fast on a malformed live API base and normalize /api`
  (unit 2: both advisories from `review-bd2c8471dd9fffc1`, test-first RED 11 → GREEN 31/31).
  Native review `review-a3a6dda7260ed188` APPROVED + acknowledged.
- `f2e5f8c9` — `fix(dashboard): make live-suite env fallback immune to blank NHILOS_LIVE_API`
  (work unit: helper + 18-case unit spec + wiring in 4 live suites + 2 Playwright files +
  vitest/playwright live configs + this ODD doc). Native review `review-bd2c8471dd9fffc1`
  APPROVED + acknowledged.
