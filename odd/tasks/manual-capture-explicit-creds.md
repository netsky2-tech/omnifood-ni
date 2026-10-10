# Feature: manual-capture path: no committed credential, explicit tenant binding (issue #839)

- **Status:** IMPLEMENTED (delegated work done; work-unit commit + native review pending — T5)
- **Issue:** #839 — retitled after verification. Originally "stale fixture defaults"; the defaults are
  NOT stale (see Problem 0).
- **Branch / worktree:** `test/manual-capture-explicit-creds` @ `/home/octavio_morales/omnifood-ni-manual-capture-creds`
  (from `main` = `d58cbf5e`)
- **Target file:** `apps/owner_dashboard/e2e/manual-screenshots.live.spec.ts` (+ the manual that documents the capture)
- **Decision owner:** the user chose **env-only credentials** in this session.

## Problem 0 — the premise was wrong, and this is the evidence

Live read-only probes against the running stack on `127.0.0.1:3300` (2026-10-10, `main` = `fff914c4`):

| tenant | login | modifier groups (status=all) | categories | `Americano` products |
| --- | --- | --- | --- | --- |
| `soho` (spec default) | 201 | 4: `Jarabes` inactive + **3 active** `Leche`/`Endulzante`/`Extras` | 7, UPPERCASE incl. `CAFÉ CALIENTE` | contains **`Americano 12oz`** |
| `soho-test-fixture` | 201 | 20, all inactive `E2E Extra Café <random>` | 9, human-case (`Bebida caliente`…) | `Café Americano`, **no `Americano 12oz`** |

The capture spec asserts `GROUP="Jarabes"`, `CATEGORY_LABEL="CAFÉ CALIENTE"`, `PRODUCT="Americano 12oz"`
and a final "exactly the 3 original active groups" cleanup (`:537`, `:635-647`). All of that exists only
in `soho`. Retargeting the defaults to the fixture tenant — the fix the issue originally asked for —
would break every locator. **The defaults stay; what they hide is the problem.**

## Problem (what actually needs fixing)

1. **A working dev credential is committed.** `PASSWORD = resolveLiveEnv("MANUAL_E2E_PASS", "C0ntr4sen4")`
   (`:42`). It is the `soho` owner password (set by direct DB update in `odd/tasks/manual-dashboard-section6.md`),
   so it is a real credential for a real local tenant, sitting in the repo as a fallback.
2. **The tenant binding is invisible and silently wrong.** The spec navigates with its own absolute `BASE`
   from `MANUAL_E2E_BASE_URL` (`:40`, used by every `page.goto`), so `NHILOS_LIVE_BASE` — which is what
   `playwright.live.config.ts` uses for `baseURL` — does nothing here. An operator who sets only the
   canonical variable keeps capturing against the tenant they thought they overrode.
3. **Nothing is documented.** `NHILOS_MANUAL_CAPTURE`, `MANUAL_E2E_BASE_URL`, `MANUAL_E2E_EMAIL` and
   `MANUAL_E2E_PASS` appear in `package.json` (`test:e2e:capture`) and the spec header only. No manual or
   README tells the operator which tenant the path runs against or which variables it needs.

## Scope

- Required credential: `MANUAL_E2E_PASS` must come from the environment. Blank/unset ⇒ fail **before any
  navigation** with a message that names the variable and never echoes a value.
- Loud tenant binding: the spec declares the tenant it targets (`soho`), derives the tenant label from the
  `BASE` hostname, and aborts if they disagree. The host default itself is unchanged.
- Document the contract where an operator will actually read it (spec header + the media inventory /
  capture instructions that reference this spec).

## Non-goals

- No change to the walkthrough data, capture paths, image names or assertions — the captures are the product.
- No change to `resolveLiveEnv` semantics (#828): blank still means unset, canonical defaults stay for
  *targets*. This is about a *credential*, which is a different category.
- No new vitest live suite; this file is a Playwright live spec and stays opt-in.
- Do not re-run a full capture as part of this change unless the images actually need refreshing: a
  capture writes PNGs into `docs/nhilos/manuals/images/`, which would turn a small test-config change into
  a binary-heavy review candidate.

## Implementation notes (what the worker changed and why it deviated, accepted)

Two of my task-plan assumptions were wrong and the worker caught both by measuring instead of arguing:

1. **Credential timing.** I asked for a module-scope `requiredLiveEnv("MANUAL_E2E_PASS")`. That makes
   `npx playwright test --list` return **0 tests**: Playwright evaluates the module to collect it, so a
   missing credential becomes a collection error and the whole live config becomes unlistable. The worker
   moved it into `test.beforeAll(() => { if (CAPTURE) ... })`, which still fails before the first
   navigation of a real capture run and leaves `--list` and non-capture live runs credential-free.
   **Accepted** — the criterion I wrote was the wrong mechanism for the goal I wanted.
2. **Leak assertion shape.** With `MANUAL_E2E_PASS` populated there is no thrown message to inspect for
   that variable, so the leak test stubs the marker into `MANUAL_E2E_PASS` and asserts that the error
   thrown for a *different* unset variable (`MANUAL_E2E_EMAIL`) does not contain the marker. That is a
   faithful proof of "the message names only the variable". **Accepted.**

The tenant-binding guard DID stay at module scope on purpose: it needs no secret, and failing at
collection time is the loud behaviour we want (`--list` with
`MANUAL_E2E_BASE_URL=http://soho-test-fixture.localhost:5174` aborts naming expected `soho` vs inferred
`soho-test-fixture`).

## Second credential path found during verification (not in the original scope)

`scripts/capture_dashboard.cjs` (81 lines, added by the docs commit `352697fd`, referenced by nothing in
the repo) still hardcoded `C0ntr4sen4` and navigated `http://soho.localhost:5173` — a duplicate manual
capture that also violated the port rule from #830 (`:5173` belongs to another worktree's stack on this
host). The user chose **delete it in this PR**. The documented single path is now
`npm run test:e2e:capture`, and the media inventory records that.

## Acceptance criteria

- [x] No committed password: `grep -rn "C0ntr4sen4" --include=*.ts --include=*.cjs --include=*.json`
      across the repo returns nothing (it survives only in prose inside `odd/tasks/*.md`).
- [x] Unset or blank `MANUAL_E2E_PASS` throws `LiveApiConfigError` naming `MANUAL_E2E_PASS` and nothing
      else; verified by 5 unit cases (trimmed hit, unset, empty, whitespace-only, no-value-leaked).
- [x] `MANUAL_E2E_BASE_URL` pointing at another tenant label aborts with both labels in the message
      (observed against the live config; `--list` then fails instead of silently collecting).
- [x] Unit spec runs inside `npm test` and CI: no network, `vi.stubEnv` only.
- [x] `npx vitest run --no-file-parallelism` → **101 files / 1475 passed / 4 skipped** (was 1470: +5 new
      `requiredLiveEnv` cases) and the #830 suite-layout guard still passes **6/6** — it does not demand a
      `.live.test.ts` name for this Playwright spec, as predicted.
- [x] `--list` unchanged: live config **15 tests / 2 files**, static config **48 tests / 6 files**
      (the #830 `testIgnore` still holds).
- [x] Documented in three places an operator will actually read: the spec header (operator contract with
      the four variables and the tenant warning), `apps/owner_dashboard/README.md` → "Test suites" →
      manual-capture row, and `docs/nhilos/branding/producto/nhilos_pos_media_inventory_v1.0.md` →
      "Cómo se regeneran las capturas del backoffice" (Spanish, matching that document's convention).

## Tasks

- [x] **T1** Implement `requiredLiveEnv()` (or equivalent) in `src/lib/live-api-base.ts` + unit spec,
      test-first: RED observed for unset/blank, then GREEN. (Evidence below.)
- [x] **T2** Wire the spec: password from env only, tenant-label guard, header documents the contract.
- [x] **T3** Document the operator path. Done in the spec header + `apps/owner_dashboard/README.md`
      ("Test suites" section, per delegation). The media inventory doc was NOT touched — it is outside
      the delegated edit surfaces; parent may want it added separately.
- [x] **T4** Checks: focused unit spec (36/36), suite-layout guard (6/6), `npm run typecheck` clean,
      `npm run lint` clean (pre-existing warnings in unrelated files only),
      `npx playwright test --list -c playwright.live.config.ts` = 15 tests in 2 files.
- [ ] **T5** Work-unit commit + native review + PR `type:tests` → merge (user's delivery call). Not done
      here: delegated implementation does not commit.

## Implementation notes (deviations from the literal instructions)

- `requiredLiveEnv("MANUAL_E2E_PASS")` at MODULE scope in the spec broke
  `npx playwright test --list` (module top-level code runs during listing; result was
  `Total: 0 tests in 0 files`). Fix: the credential is required in `test.beforeAll`, gated on
  `NHILOS_MANUAL_CAPTURE` — evaluated when the run actually starts and before the first navigation,
  listing stays credential-free, and ordinary live runs (gate off, tests skipped) are unaffected.
- The "message never contains the value" unit test stubs `MANUAL_E2E_PASS = "s3cret-marker"` and
  requires a DIFFERENT variable (`MANUAL_E2E_EMAIL`): a populated value means the happy path succeeds,
  so there is no error to inspect for that variable; the marker-in-env setup still catches any
  implementation that echoes values or dumps env.

## RED evidence (verbatim, before `requiredLiveEnv` existed)

```text
 RUN  v4.1.11 /home/octavio_morales/omnifood-ni-manual-capture-creds/apps/owner_dashboard

 ❯ src/__tests__/live-api-base.test.ts (36 tests | 5 failed) 17ms
     × returns the trimmed value of a populated variable 3ms
     × throws naming the variable when it is unset 2ms
     × throws when the variable is present but empty 2ms
     × throws when the variable is whitespace only 1ms
     × never echoes the value in the thrown message 1ms

⎯⎯⎯⎯⎯⎯⎯⎯ Failed Tests 5 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/__tests__/live-api-base.test.ts > requiredLiveEnv (issue #839: credentials never carry a committed default) > returns the trimmed value of a populated variable
TypeError: requiredLiveEnv is not a function
 ❯ src/__tests__/live-api-base.test.ts:174:12
```

(5 failures total, all `TypeError: requiredLiveEnv is not a function` — the unset/empty/whitespace
variants failed as `TypeError`, not `LiveApiConfigError`, proving the function did not exist.)

## GREEN evidence

```text
 Test Files  1 passed (1)
      Tests  36 passed (36)
```

(`npx vitest run src/__tests__/live-api-base.test.ts --no-file-parallelism`.)

## Residual credential sightings (outside delegated surfaces, reported not fixed)

`grep -rln "C0ntr4sen4" .` (repo root, excluding node_modules) still matches:
- `scripts/capture_dashboard.cjs` — repo-root capture script; needs its own decision.
- `odd/tasks/*.md` (this doc + other features' docs) — expected: prose quoting the old default.

