# Feature: Dashboard suite inventory — contract/api vs live (issue #830)

- **Status:** CLOSED — PR #840 merged into main as `bc8ea6ff`, issue #830 closed with evidence.
- **Delivery:** merge commit `bc8ea6ff`; CI green (`lint-and-test` 1m54s, Cloudflare Pages,
  GitGuardian). Remote + local branch `chore/dashboard-suite-inventory` and the worktree
  `~/omnifood-ni-suite-inventory` were removed after the merge.
- **Routing:** implementation delegated to `gentle-ai-worker` (task `mv1o076l-2-lh8z`) with narrow
  edit surfaces; the orchestrator re-verified everything (the worker's GREEN was not the record).
- **Inventory sources:** `gentle-ai-explore` task `mv1nsxtu-1-ety0` (per-file runner + network
  evidence) cross-checked by the orchestrator against `vitest.config.ts:20-27`,
  `vitest.integration.config.ts:26-29` and a repo-wide grep of `resolveLiveApiBase`/`fetch`.
- **Issue:** #830 (`status:approved`, `type:tests`)
- **Branch:** `chore/dashboard-suite-inventory` from `main` (`900ff846`)
- **Worktree:** `/home/octavio_morales/omnifood-ni-suite-inventory`
- **Rule (user):** isolated worktree + branch, never write on `main`; ports `:3000`/`:5173` (p3 stack) untouched.
- **Carried over:** this branch starts with `f8f78e12` — the `docs(odd)` delivery evidence for
  #828 (`odd/tasks/live-suites-hardening.md`), folded in here instead of burning a one-paragraph PR.

## Problem

`apps/owner_dashboard` names suites by intuition, not by behaviour:

- `vitest.integration.config.ts` includes exactly 3 files (`w1.integration`, `w4-e2e-fiscal`,
  `modifiers-live.integration`) and `vitest.config.ts` excludes exactly those same 3 — verified in
  the issue body.
- But `w1-api.integration.test.ts` and `w5-api.integration.test.ts` carry the `.integration`
  suffix while **running in the default `npm test`** (CI is green ⇒ they need no backend).
- So `.integration` means two different things depending on the file, and the only signal that
  distinguishes "needs a live NestJS on :3300" from "mocks fetch" is the config exclude list.

That is a maintenance trap: a future real-network file that forgets to join the exclude list turns
CI red or, worse, silently passes against whatever happens to be listening.

## Scope

1. Verify the real behaviour of every suite file (runner + network requirement) with `path:line`
   evidence — no assumptions from names.
2. Decide and apply one naming/registration rule so a reader can tell **unit / contract(mocked) /
   live(needs backend)** without opening the configs.
3. Add a guard that makes the rule enforceable rather than tribal.
4. Document the complete suite map (what runs where, what needs a server) in the configs' headers
   and in the dashboard test docs.

## Non-goals

- No behavioural change to any test: assertions, fixtures and coverage stay identical.
- No new backend, no CI workflow changes (the dashboard CI runs `lint`, `typecheck`, `npm test`).
- No touching the live suites' logic — #828 just landed there.
- No splitting/merging of test files beyond what the naming decision requires.

## Acceptance criteria

- [ ] Inventory documented with evidence: every `src/__tests__/**` + `e2e/**` file classified
      (unit | contract-mocked | live-needs-backend | playwright-static | playwright-live).
- [ ] No suite with real network I/O runs in the default unit run, and no server-free suite is
      excluded from it unnecessarily.
- [ ] The contract/live distinction is readable from the filename or the config header, not from
      tribal knowledge.
- [x] Deterministic guard (`suite-layout.test.ts`, 6 assertions): a live-named file that is not
      registered fails, a registered entry that is not live-named fails, a network suite without the
      marker fails, a server-free file hidden from the unit run fails, the retired suffix fails, and
      the static Playwright config collecting live specs fails.
- [ ] `npm test` green and `npm run test:integration` green (42/42) after the change.
- [ ] `npm run typecheck` + `npm run lint` green.
- [ ] PR `type:tests` green, merged, issue #830 closed.

## Tasks

- [ ] **T1** Isolated worktree + branch + ODD doc + Engram mirror + todo (done at creation).
- [x] **T2** Inventory verified. Facts that matter:
      - Real-network suites (call `fetch(` on a `resolveLiveApiBase()` base): exactly
        `w1.integration.test.ts`, `w4-e2e-fiscal.test.ts`, `modifiers-live.integration.test.ts` —
        and only those are in both config lists. So **no** network suite runs in `npm test` today.
      - `w1-api.integration.test.ts` and `w5-api.integration.test.ts` carry `.integration` but
        stub `globalThis.fetch = vi.fn()` — they are contract suites, named like live ones.
      - `w4-e2e-fiscal.test.ts` is genuinely live yet has **no** live marker in its name; its
        siblings `w5-e2e-catalog` / `w8-e2e-users` / `w9-e2e-settings` / `onboarding-m2-e2e` are
        mock-only despite the `e2e` token. Two suffixes, two meanings, nothing enforced.
      - `playwright.config.ts` has no `testIgnore`, so the static run also collects
        `*.live.spec.ts`; safe only because those specs self-skip on their env gate.
      - No server-free file is excluded from the default run unnecessarily.
- [x] **T3** Rule decided (no user decision needed: the issue pre-authorized "aclarar por
      comentario/renombre", and one direction was strictly cheaper to enforce):
      **`.live.test.ts` is the only runner-significant suffix in `src/__tests__`.**
      `.live.` ⇒ needs the real backend on :3300 ⇒ registered in `vitest.integration.config.ts`
      ⇒ excluded in `vitest.config.ts`. Everything else under `src/**` runs in `npm test`.
      The `.integration` suffix is **retired** because it currently means "live" in three files and
      "mocked" in two. Chosen over a comment-only clarification because the guard below can only
      enforce a name, not a paragraph. No user question asked: the rename is internal test layout,
      it changes no behaviour, no public API and no CI contract.
      Rename table (git mv, contents untouched except their own header/comments):
      | from | to | why |
      | --- | --- | --- |
      | `w1.integration.test.ts` | `w1.live.test.ts` | live, name now says so |
      | `w4-e2e-fiscal.test.ts` | `w4-fiscal.live.test.ts` | live, and `e2e` was misleading (it is not Playwright) |
      | `modifiers-live.integration.test.ts` | `modifiers.live.test.ts` | live, suffix retired |
      | `w1-api.integration.test.ts` | `w1-api.contract.test.ts` | mocked fetch → contract |
      | `w5-api.integration.test.ts` | `w5-api.contract.test.ts` | mocked fetch → contract |
      `.live.test.ts` matches the Playwright convention already in use (`*.live.spec.ts`).
- [x] **T4** Applied. **One correction to the T3 table, made deliberately:** the table said
      `modifiers-live.test.ts`, and the worker implemented exactly that — which forced the guard to
      accept a second live shape (`/(^|[.\-_])live\.test\.ts$/`). A rule with an exception is the
      thing this issue exists to remove, so the file was renamed again to
      **`modifiers.live.test.ts`** and the matcher tightened to `endsWith(".live.test.ts")`.
      Also fixed the two stale self-references the rename left (`modifiers.live.test.ts:24` run
      line, `:52` "plain fetch, w1.live.test.ts style").
- [x] **T4b** Boundary extended to the browser runner (finding 5 of the inventory):
      `playwright.config.ts` had no `testIgnore`, so `npm run test:e2e` *collected*
      `*.live.spec.ts` and was saved only by their env-gated `test.skip` — tribal, not structural.
      It now declares `testIgnore: "**/*.live.spec.ts"`, and the guard has a 6th assertion for it
      (RED observed first: 1 failed | 5 passed → GREEN 6/6). Historical `odd/tasks/*.md` mentions are **evidence**: they are not rewritten; the
      rename table above is the mapping.
- [x] **T5** Guard `src/__tests__/suite-layout.test.ts` (6 assertions, reads the configs as text,
      strips comments so paths inside prose are never counted as entries, derives the live set from
      filenames instead of hardcoding it). **RED observed by the worker before the rename** — 5/5
      failing, with the defect in the messages: `w1.integration.test.ts is not a .live.test.ts
      path`, `w4-e2e-fiscal.test.ts calls resolveLiveApiBase( and fetch( but is not named
      *.live.test.ts`, retired-suffix list `[modifiers-live.integration, w1-api.integration,
      w1.integration, w5-api.integration]`. GREEN after: **6/6**.
- [x] **T6** Map documented: `README.md` → "## Test suites" table (unit / contract / live /
      playwright-static / playwright-live with commands and server requirement) + the rule stated in
      the headers of `vitest.config.ts`, `vitest.integration.config.ts` and `playwright.config.ts`
      + `src/lib/live-api-base.ts` header now points at `src/__tests__/*.live.test.ts`.
- [x] **T7** Orchestrator verification (no subagent alive during these runs, per the WSL2 cap):
      - `npx vitest run --no-file-parallelism` → **101 files, 1470 passed, 4 skipped**
        (was 100/1464: +1 file = the guard, +6 tests).
      - `npx vitest run -c vitest.integration.config.ts` → **3 files, 42/42** against the `:3300`
        stack (login probe HTTP 201 before the run; the stack is main's, this branch is
        test-config only).
      - `npm run typecheck` (`tsc -b`) → first **RED**: `suite-layout.test.ts(31,3): error TS2322:
        Type '(string | undefined)[]' is not assignable to type 'string[]'` (`noUncheckedIndexedAccess`
        on `m[1]`; vitest's GREEN never typechecks — the exact trap recorded in memory). Fixed with
        a `flatMap` type guard → clean.
      - `npm run lint` (oxlint) clean; `npx oxlint` on the 5 touched files → 0 findings.
      - `playwright test --list` static → **48 tests / 6 files** (live specs no longer collected);
        `-c playwright.live.config.ts` → **15 tests / 2 files**.

## Evidence

(to be recorded per task)

## Guard design (T5)

`src/__tests__/suite-layout.test.ts` (unit run, reads config text + file names, no network):
1. every `*.live.test.ts` under `src/__tests__` appears in `vitest.integration.config.ts` include
   **and** in `vitest.config.ts` exclude;
2. every entry of the integration include list is an existing `*.live.test.ts` file;
3. no file under `src/__tests__` uses the retired `.integration` suffix;
4. a file that both calls `resolveLiveApiBase(` and contains `fetch(` is a live suite (so the
   network marker cannot escape the naming rule);
5. no file excluded from the default run is server-free (rule 2 + 1 make this symmetric).

## Commits

- `f8f78e12` — `docs(odd): record PR #833 merge and issue #828 closure` (carried over from the
  merged #828 branch, not part of the #830 change itself).
