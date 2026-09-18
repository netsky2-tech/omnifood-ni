# Staging Deployment

## Goal

Prepare an isolated, reviewable staging deployment for the SOHO pilot:

- Dashboard: `https://soho.nhilospos.com` on Cloudflare Pages
- API: `https://api-staging.nhilospos.com` on Railway
- PostgreSQL: dedicated Railway staging database

Production data and production readiness claims are explicitly out of scope.

## Authority and constraints

- Requested by the user from `main` in a separate worktree.
- Worktree: `/home/octavio_morales/omnifood-ni-worktrees/staging-deployment`
- Branch: `chore/staging-deployment`
- Local SQLite remains the POS source of truth during WAN outages.
- DGI-sensitive records must never be deleted; this deployment work does not alter fiscal behavior.
- Browser access must not weaken tenant authorization: hostname context is not an authorization boundary; JWT `tenant_id` remains authoritative.

## Dependency DAG

1. Railway API contract and safe staging runtime
2. Cloudflare Pages dashboard contract (depends on the API origin contract)
3. Two-role PostgreSQL runtime (depends on 1)
4. Tenant-context binding for activation flows (depends on 3)
5. Tenant-context binding for fiscal and telemetry flows (depends on 4)
6. Forced RLS policies for onboarding and fiscal tables (depends on 4 and 5)
7. Staging operations runbook and verification evidence (depends on 1, 2, 3, and 6)

Critical path: 1 -> 3 -> 4 -> 5 -> 6 -> 7. Dashboard work (2) is parallel-safe after the API origin contract.

## Tasks

### Task 1: Prepare the Railway API staging runtime

- **Status:** done
- **Goal:** Provide reproducible build/start behavior, migration execution, environment contracts, health checks, and an allowlisted browser origin for staging.
- **In scope:** `apps/admin_backend` deployment/runtime configuration, focused tests, environment contract documentation.
- **Out of scope:** Railway account mutation, production secrets, production deployment, broad RLS redesign.
- **Acceptance:** clean install/build succeeds; focused security/config tests pass; runtime fails closed on missing production-like secrets; migrations run explicitly before serving.
- **Rollback:** revert the task commits; no remote infrastructure was mutated by repository changes.
- **Commits:** `8755573` (`feat(admin_backend): enforce production connection allowlists`), `355592d` (`chore(admin_backend): add Railway staging runtime`)
- **Evidence:** 48/48 focused config tests passed; `npm run build` passed; independent non-connecting fail-closed smoke checks passed; Railway health path matches `/api/v1/health`.
- **Review note:** `8755573` is 589 added lines because both tested connection contracts landed together; split it before PR review if the branch policy requires the 400-line budget.

### Task 2: Prepare the Cloudflare Pages dashboard

- **Status:** done
- **Goal:** Make every API call use the configured staging API origin and make SPA deep links work on Pages.
- **Dependencies:** Task 1 API URL and CORS contract.
- **In scope:** `apps/owner_dashboard` API configuration, Pages static files/config, environment contract documentation, focused tests.
- **Out of scope:** wildcard tenant routing and general availability.
- **Acceptance:** dashboard build succeeds with `VITE_API_URL=https://api-staging.nhilospos.com`; authenticated calls use that origin; deep-link fallback is present.
- **Rollback:** revert the task commit and restore the previous Pages build.
- **Commit:** `cf5eb44` (`feat(owner_dashboard): add Cloudflare staging runtime`)
- **Evidence:** 25/25 focused tests passed; typecheck and both default/staging-environment builds passed; the staging bundle contains the API origin plus `/api`; Pages headers and SPA fallback are copied byte-identically to `dist`.
- **Known baseline:** plain `npm run test` has 21 pre-existing backend-dependent failures because no API is listening on `127.0.0.1:3000`; candidate-focused tests are green.

### Task 3: Separate database roles

- **Status:** done
- **Goal:** Run migrations with an owner role while serving traffic with a non-owner `NOBYPASSRLS` role.
- **Dependencies:** Task 1 migration startup contract.
- **In scope:** migration-only credential resolution, production runtime DB validation, focused tests, staging environment contract updates.
- **Out of scope:** provisioning live Railway roles and repairing the local development database.
- **Acceptance:** migration and runtime credentials are distinct in production; runtime never defaults to `postgres`; focused tests/build pass.
- **Rollback:** revert the task commits before deployment.
- **Commits:** `0526e57` (`feat(admin_backend): separate migration and runtime database roles`), `11b6d7d` (`docs(admin_backend): document database role separation`)
- **Evidence:** 58/58 candidate-focused tests passed, the Nest build passed, and compiled non-connecting smoke checks proved both role contracts fail closed.

### Task 4: Bind tenant context in activation flows

- **Status:** done
- **Goal:** Ensure every activation-table access runs inside a transaction that binds `app.tenant_id` before forced RLS is enabled.
- **Dependencies:** Task 3 runtime role contract.
- **In scope:** a reusable tenant-bound transaction helper, `ActivationService`, focused unit tests.
- **Out of scope:** policy creation and unrelated onboarding behavior.
- **Acceptance:** all activation attempts/check/follow-up reads and writes use a transaction-local tenant context; focused tests/build pass.
- **Rollback:** revert the task commits before applying the RLS migration.
- **Commits:** `eb171ca` (`feat(admin_backend): add tenant-transaction RLS binding helper`), `3e66dc7` (`fix(admin_backend): bind tenant context for activation RLS access`)
- **Evidence:** 103/103 focused tests passed and the Nest build passed. All 17 public activation methods bind context before repository access; no bare activation repository access remains.
- **Review note (`size:exception`):** `3e66dc7` is 815 added / 365 removed lines. Whitespace-insensitive it is 204 added / 57 removed in the service, so most of the diff is re-indentation from wrapping method bodies. The only sub-budget split would separate tests from the behavior they protect, which is rejected; review that commit with `git diff -w`.
- **Disclosed fix:** independent verification caught that `ingestCheck` would emit a duplicate `ONBOARDING_ACTIVATION_CHECK_FAILED` audit entry on idempotent re-ingest of a persisted failing check; audit parity was restored test-first before commit.

### Task 5: Bind tenant context in fiscal and telemetry flows

- **Status:** done
- **Goal:** Ensure fiscal-config and onboarding-telemetry access paths bind `app.tenant_id`, including POS inbound sync and observer paths.
- **Dependencies:** Task 4 helper contract.
- **In scope:** fiscal version/setup, telemetry, customer-sale observer, inbound sync, and focused tests.
- **Out of scope:** policy creation and fiscal data mutation.
- **Acceptance:** all five-table access paths bind tenant context before repository access; focused tests/build pass.
- **Rollback:** revert the task commits before applying the RLS migration.
- **Commits:** `e964bc7` (`feat(admin_backend): bind tenant context for fiscal config revisions`), `03bc54f` (`feat(admin_backend): bind tenant context for telemetry and fiscal sync`)
- **Evidence:** 43/43 focused tests passed plus 299 onboarding and 202 sales module tests with no collateral breakage; the Nest build passed. Repo-wide inspection shows fiscal and telemetry repositories are reachable only through tenant-bound services.
- **Follow-ups (non-blocking):** `TenantContextRequiredError` is a plain `Error`, so a blank tenant on a future controller path would surface as HTTP 500 rather than 400; unused injected repositories remain; the observer has no production caller yet.

### Task 6: Enforce onboarding and fiscal RLS policies

- **Status:** done
- **Goal:** Force tenant isolation for the five identified onboarding/fiscal tables after every access path is tenant-bound.
- **Dependencies:** Tasks 4 and 5.
- **In scope:** reversible TypeORM migration, varchar-safe tenant predicates, focused migration tests, deployment checks.
- **Out of scope:** changing tenant ID column types or deleting business/fiscal data.
- **Acceptance:** all five tables have ENABLE + FORCE RLS and deterministic tenant policies; down migration removes only this enforcement; focused tests/build pass; integration proof is recorded or explicitly blocked.
- **Rollback:** run the reviewed down migration before reverting tenant-binding code.
- **Commit:** `03518b3` (`feat(admin_backend): enforce tenant row level security for onboarding and fiscal tables`)
- **Evidence:** 10/10 focused migration tests passed; the full migrations suite passed 34/34 non-skipped suites; the Nest build passed. Independent verification confirmed denial-safe NULL semantics, correct USING/WITH CHECK placement per command, and a contained `down()`.
- **Unproven without PostgreSQL:** the policies actually filtering rows, index usage under the text predicate, and a live two-tenant probe. Task 7 carries those as operator checks and marks them as pending evidence.
- **Follow-ups (non-blocking):** no `.db.spec.ts` covers this migration; `tenant_id` columns have no non-empty CHECK constraint; runtime grants for the non-owner role are still operator provisioning.

### Task 7: Document and verify the SOHO staging cutover

- **Status:** done (repository work); live deployment and evidence pending operator execution
- **Goal:** Provide exact Railway, Cloudflare Pages, DNS, database-role/RLS, migration, smoke-test, rollback, and offline-POS steps.
- **Dependencies:** Tasks 1, 2, 3, 4, 5, and 6.
- **In scope:** repository-facing staging runbook and final verification evidence.
- **Out of scope:** executing dashboard-provider mutations without authenticated user participation; claiming hardware or production proof.
- **Acceptance:** commands and variable names match the repository; DNS targets are explicit; rollback is rehearsable; skipped remote checks are clearly identified.
- **Rollback:** documentation-only revert; remote rollback procedure is included in the runbook.
- **Commit:** `8c11603` (`docs(operations): add SOHO staging cutover runbook`)
- **Evidence:** Independent verification confirmed every cited command, variable, path, hostname, and endpoint matches the repository. Three verification rounds closed defects that would have let broken isolation pass the checklist: a no-op empty-string probe, a two-tenant probe that passed on empty data, over-broad runtime grants, incorrect API paths in the pooled-connection check, and an impossible ledger-verification expectation.
- **Still pending (not repository work):** running the section 8 probes against staging PostgreSQL, executing the section 9 smoke tests, and attaching outputs as evidence. Until then the customer-access gate is not satisfied.

## Remaining work outside this branch

- **Resolved:** the schema blocker (#280) is fixed; the staging database was built from an empty database by the migrations themselves.
- Attach `soho.nhilospos.com` to the Pages project and create the API DNS record once the registrar nameservers move to Cloudflare.
- Authenticated provider execution: Railway project, PostgreSQL service, environment variables, and Cloudflare Pages project plus DNS records.
- Section 8 RLS probe evidence and section 9 smoke-test evidence from the live staging environment.
- SOHO customer access, granted only after the section 12 gate is fully green.
- Dashboard deployment to Cloudflare Pages is done: the project serves the reviewed build with its headers, SPA fallback and the staging API origin verified. The custom domain and DNS remain.
- Verify the stray `owner-dashboard` Pages project has no domain attached before assigning `soho.nhilospos.com` to `nhilos-pos-dashboard`.


## Decisions

- 2026-04-16: Use a safe staging environment before production.
- 2026-04-16: Use `soho.nhilospos.com` for the customer dashboard.
- 2026-04-16: Use `api-staging.nhilospos.com` for the Railway API.
- 2026-04-16: Keep staging services and data separate from production.
- 2026-04-16: Require separate PostgreSQL migration-owner and runtime `NOBYPASSRLS` roles before customer access.
- 2026-04-16: User approved bind-then-enforce remediation; broken RLS enforcement and premature customer access are rejected.

## Evidence log

- 2026-04-16: Task 1 independent verification passed 48/48 focused tests and the Nest build.
- 2026-04-16: Native assessment was unavailable because the package-local Gentle AI binary is missing; the candidate was treated as unassessable/high risk and independently verified.
- 2026-04-16: A writer invoked the compiled migration runner against the default local `omnifood` database during verification. Read-only diagnosis found a non-prefix migration ledger (53 rows), one untracked `product_inventory_mapping_versions` artifact, and no idle transaction. No repair or destructive action was taken. Task 1 now prevents production migration startup without explicit database variables.
- 2026-04-16: Task 2 independent verification passed 25/25 focused tests, typecheck, and both normal and staging-environment builds. Full-suite failures were isolated to pre-existing backend-dependent integration tests.
- 2026-04-16: Task 3 was inserted after exploration proved the current single-role database contract would either bypass RLS or deny legitimate access. Five tenant tables enable RLS without FORCE/policies, and no runtime grants are provisioned by migrations.
- 2026-04-16: Task 3 role separation passed 58/58 focused tests and compiled smoke checks; commits `0526e57` and `11b6d7d`.
- 2026-04-16: Pre-policy audit found every access path to the five tables lacked `app.tenant_id` binding and their tenant IDs are varchar, so a UUID-cast policy would be invalid. Tasks 4 and 5 now bind context before Task 6 enforces varchar-safe policies.
- 2026-04-16: Task 4 passed 103/103 focused tests and the build; commits `eb171ca` and `3e66dc7` (the latter carries a documented `size:exception` for re-indentation-heavy review load).
- 2026-04-16: Task 5 passed 43/43 focused tests with no collateral module breakage; commits `e964bc7` and `03bc54f`.
- 2026-04-16: Task 6 passed 10/10 focused migration tests and 34/34 migration suites; commit `03518b3`. Live RLS enforcement remains unproven until the runbook checks run against staging PostgreSQL.
- 2026-04-16: Task 7 runbook committed as `8c11603`. Independent verification rounds corrected probe defects that could have passed with broken isolation, including two API paths that would have 404'd the pooled-connection gate.
- 2026-04-16: Merged `origin/main` at `d98e94c` into this branch (`9dfc553`), bringing in the OHAC canonical contracts, the Human Authorization core migration, and the POS CI serialization. The merge was conflict-free.
- 2026-04-16: The merge exposed a migration timestamp collision: `main` added `1809000000000-CreateHumanAuthorizationCore`, colliding with the onboarding/fiscal RLS migration. Renumbered the RLS migration to `1809000000001` (`f86f605`) and updated the runbook reference.
- 2026-04-16: Post-merge verification passed: admin backend 195 suites / 1681 tests with no failures; the migration spec 10/10; 8 focused suites 166/166; both builds green; the dashboard retained its pre-existing 21 backend-dependent failures with no new ones, and the staging build inlined `https://api-staging.nhilospos.com` with Pages headers and redirects copied to `dist`.
- 2026-04-16: Railway staging provisioned: PostgreSQL created, `omnifood_migration` and `omnifood_runtime` roles created with `NOBYPASSRLS`, default privileges verified (`arwd` on tables, `rU` on sequences, runtime cannot create in `public`).
- 2026-04-16: The deploy failed twice on the managed builder: it selected Node 18 (`EBADENGINE` on NestJS 11 dependencies) and could not remove a cached `node_modules` during `npm ci` (`EBUSY`). Replaced with a pinned `Dockerfile` (`node:22-slim`, `npm ci --include=dev`), verified locally: Node v22.23.2, 59 migrations compiled, and `start:staging` fails closed with exit 1 when the database variables are absent.
- 2026-04-16: The Dockerfile deploy reached the migration phase and exposed blocker #280. The container restart looped because TypeORM rolls the whole migration transaction back on failure. Staging cannot serve until #280 lands.

## Staging deployment evidence (2026-04-18)

Verified from outside the providers, not from their dashboards.

**Railway API (`api-staging.nhilospos.com`)**

- Built from a pinned `Dockerfile` (`node:22-slim`, 59 compiled migrations).
- The migration run created the schema itself: 62 migrations applied, 74 tables, ledger ending at `EnforceOnboardingFiscalTenantRls1809000000001`. The schema bootstrap (#280) works in production.
- Let's Encrypt certificate covering the domain (`ssl_verify=0` on the real hostname).
- `GET /api/v1/health` returns 200.
- CORS returns `access-control-allow-origin: https://soho.nhilospos.com` for the dashboard origin and no `ACAO` header for a foreign origin.
- Request preflight for the login POST returns 204 with `content-type,authorization` allowed.

**PostgreSQL (staging)**

- `omnifood_migration` owns the five tenant tables; `omnifood_runtime` owns none.
- Both roles are `NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`, and the runtime role holds no inherited membership.
- All five tables report `relrowsecurity = t` and `relforcerowsecurity = t`, with four permissive policies each and the predicate `tenant_id = current_setting('app.tenant_id', true)` in `qual` and `with_check` where each command requires it.
- Behavioural probes with real rows: bound to tenant A the runtime sees only A; with no binding it sees zero rows; with an empty binding it sees zero rows; a foreign `INSERT` and a tenant-moving `UPDATE` are both rejected with a row-level security violation; a foreign `DELETE` affects zero rows; and the baseline counts are unchanged afterwards.
- Ledger write access revoked: the runtime holds only `SELECT` on `migrations`.

**Cloudflare Pages (`soho.nhilospos.com`)**

- Deployment built from `chore/staging-deployment`, producing the reviewed build (`lang="es"`, title `NHILOS POS — OmniCommerce`), byte-identical to the local build modulo asset hashes.
- `_headers` applied in full: `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `Strict-Transport-Security`, and a CSP whose `connect-src` allows only `'self'` and the staging API.
- `VITE_API_URL` baked into the bundle; no `localhost` leak.
- SPA deep links return 200.

**End-to-end**

- Real login from a browser at `https://soho.nhilospos.com` with a provisioned owner user succeeded and reached the dashboard.
- A deliberate wrong-password probe returns 401 `Credenciales inválidas`, proving the endpoint reaches the database and validates without leaking whether the user exists.

**Still open**

- Probe 8.9 (pooled-connection isolation) needs a second tenant with its own user; not yet run.
- The stray `owner-dashboard` Pages project should be checked so nothing conflicts with `soho.nhilospos.com`.
- The pull requests are not opened yet.
