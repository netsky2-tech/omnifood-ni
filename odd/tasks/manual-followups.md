# Feature: Manual follow-ups & live-suite repairs (Round 4)

- **Status:** DELIVERED — PR #827 merged (`9d9f0a1b`, 2026-10-09); issue #826 closed;
  Admin Backend CI + Owner Dashboard CI green on `main` (runs 38002992946 / 38002992893)
- **Branch:** `chore/manual-followups` — merged and deleted; worktree removed (cleanup)
- **Delivery:** issue #826 (`status:approved`, `type:chore`) → PR (`type:chore`) → merge
- **Rule (user):** always isolated worktree + branch — never direct writes to `main`.

## Scope

Close every follow-up left open by the owner-dashboard manual feature (PR #825) and the
modifiers E2E feature:

1. **Cleanup (done):** stop dev stack (:3300/:5174), `git worktree remove` the two merged
   feature worktrees, delete merged local branches (`docs/dashboard-manual-section6`,
   `feat/extras-modifier-groups`, `test/modifiers-web-e2e`). Other features' worktrees
   (p3, factura, hostname, release-signing) are out of scope and untouched.
2. **Manual §10 (Flota):** no fleet/device management UI exists anywhere (dashboard has no
   route; POS app has no device-mgmt surface). The section currently instructs navigating
   `Ajustes > Dispositivos`, which does not exist. Establish it honestly: reflect what
   exists today (sync-freshness bar + delayed-sync banner; terminal registry/sync at the
   platform level per DSI/Q80 pilot evidence) and frame per-terminal detail/remote lock as
   a future capability. No image (nothing capturable).
3. **Manual §11 (Asistencia):** contains the placeholder `[Número de Contacto Directo]`.
   No real WhatsApp number exists anywhere in the repo (support policy names the channel,
   readiness doc says channels pending establishment). Establish §11 with verifiable
   channels only: `soporte@nhilospos.com` (consistent across 6 docs) + hours + pointers to
   the real client guides; WhatsApp framed as enabled at handoff (matches support policy /
   readiness status). Never invent a number.
4. **Live suites w1/w4 (defect, test-first):** `LoginDto` requires
   `email + pass + tenantSlug` (issue #556 stage 12d, legacy no-slug path closed); both
   suites post `{email, pass}` → 400 on every login (14 red w1 tests, w4 dies file-level).
   Credentials/roles verified real in DB (`sofia|admin|carlos@omnifood.ni`, roles
   OWNER/MANAGER/CASHIER, tenant `soho-test-fixture`). Fix: add `tenantSlug`, read base URL
   from `NHILOS_LIVE_API` with default `http://127.0.0.1:3300/api` (same contract as
   `modifiers-live.live.spec.ts`; avoids colliding with the p3 stack on :3000).
5. **Admin Backend CI red on `main`: CORRECTED root cause.** Initial diagnosis (external
   Docker Hub `postgres:15` pull timeouts) was NOT reproduced — the rerun of run
   37993752439 pulled the service image fine. The persistent failure across four runs
   (02:29, 02:41, 21:29, rerun) is two code defects from the overnight
   reconciliation/inventory batch: (a) `reconciliation-list.service.ts:159` unbound-method
   on `rows.map(ReconciliationListService.toDto)` (CI reports 163:37 because the step's
   prettier `--fix` runs first and shifts 4 lines); (b) `route-transport-registry.spec.ts`
   still expected the documented `InventoryController` orphan retired by `359d3515` — a
   latent unit red hidden behind the lint failure (CI never reached the test steps on
   `main` since 02:29).

## Non-goals

- No new dashboard features (fleet UI will not be written; docs reflect reality).
- No fabricated contact numbers or invented navigation paths.
- No changes to other worktrees/branches (p3 untouchable, ports 3000/5173 untouched).
- No backend code changes (`LoginDto` is correct by design — tests adapt to it).
- No CI workflow surgery unless the rerun proves the flake persistent.

## Acceptance criteria

- [x] `npm run test:integration` in the worktree: 3 files **42/42 green** (w1 21, w4 12,
      modifiers 8) against a local backend on :3300 (p3 untouched). RED observed first:
      14 w1 failures + w4 `Login failed … 400`.
- [x] `npm run typecheck` + `npm run lint` (owner_dashboard) green.
- [x] Manual §10/§11: 0 placeholders, 0 non-existent navigation claims, 0 unescaped `$`,
      17 `dsh_*` refs intact, 3 guide links resolve; media inventory unchanged.
- [x] CI red established: corrected root cause (two code defects) + both fixed; full
      backend unit suite green locally (330 suites / 3759 tests), `test:no-only`, targeted
      specs (16/16 + 13/13) and `nest build` OK; `test:db`/`test:e2e`/schema-build run by
      the PR pipeline (paths `apps/admin_backend/**` match this branch).
- [x] Issue #826 approved → PR #827 (`type:chore`) **green → MERGED `9d9f0a1b`**; native
      review **twice**: `review-1d9c5f315d1cd563` (5-commit slice, medium, 1 lens,
      APPROVED + burned; 2 advisories) and `review-3beb46530ec87586` (full 6-commit
      branch range after the schema fix, medium, 1 lens, APPROVED + burned; 4 advisories,
      all informational).

## Tasks

- [x] **T1** Cleanup: servers off, 2 worktrees removed, 3 branches deleted. Evidence:
      `git worktree list` shows no feature worktrees; branch list verified.
- [x] **T2** Evidence: `identity.dto.ts:52-72` (LoginDto contract), DB user/role/tenant
      query, dashboard route grep (no fleet), docs grep (no real WhatsApp number),
      `PORT=3000` in `.env` vs live-suite conventions.
- [x] **T3** Worktree `chore/manual-followups` + ODD doc (this file) + mirror (obs 10038) + todo.
- [x] **T4** Test-first w1/w4: RED (14 w1 + w4 400) → `tenantSlug` + env base URL → GREEN
      42/42. Commit `9322b00d`.
- [x] **T5** Manual §10/§11 rewrite + v0.2 change note. Commit `c7ce0321`.
- [x] **T6** CI red established (diagnosis corrected — see Scope §5) → two fixes:
      commits `54adbdf2` (unbound-method) + `c77cdbce` (stale guard expectation).
- [x] **T7** Verification done → native reviews ×2 burned → PR #827 merged (`9d9f0a1b`) →
      main CI green ×2 → issue #826 closed → worktree/branch cleaned up → this record.

## Commits

- `9322b00d` fix(dashboard): add required tenantSlug to w1/w4 live suite payloads
- `c7ce0321` docs(nhilos): establish dashboard manual sections 10 and 11 on verifiable facts
- `54adbdf2` fix(sales): bind reconciliation toDto mapping for unbound-method lint
- `c77cdbce` test(admin-backend): update retired InventoryController orphan expectation
- `aa0ef934` docs(odd): track manual follow-ups round 4 with CI root-cause correction
- `3cc05a3b` fix(sales): declare override_supervisor_ref as text to match its migration
- `9d9f0a1b` Merge pull request #827 (delivery)

## Postscript — third latent CI defect

The PR pipeline itself surfaced a third hidden red once lint stopped blocking:
`verify-schema-build.sh` failed on `invoice_payments.override_supervisor_ref`
(entity `character varying` vs migration `text`, absent from the downward-only
`scripts/schema-column-type-manifest.txt` ratchet). Fixed by aligning the entity to
`text` (`3cc05a3b`) — manifest additions require a separate baseline decision.
Lesson recorded: on `main`, a red at the FIRST failing step masks every later step;
re-establishing CI health means walking the whole pipeline, not just the visible red.
