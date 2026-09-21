# Sync Transport & Route Authorization Contract

## Objective

Define and enforce, per route, which transport authorizes a POS request — device sync or human session — so that no write surface is reachable without a guard and every POS inventory call reaches a guard it can actually satisfy.

## Problem

Two open defects are the same missing contract:

- **Issue #445.** `POST /inventory/movements/sync`, `POST /inventory/shrinkage` and `POST /inventory/count-sessions` originally carried no authentication guard, and the backend registers no global `APP_GUARD`. The first two were open; `count-sessions` was nevertheless rejected by the class-level `TenantInterceptor` because no authenticated principal supplied a tenant.
- **Issue #314.** `SyncService` sends every request through the device-only Dio, whose interceptor originally attached a bearer only to `/v1/sync/*`. The inventory routes it calls therefore answered 401 unless each route was explicitly classified and allowlisted for device transport.

The original route inventory was recorded on `main` at `8e489ab`:

| Route | Guard at inventory time | Recorded outcome |
|---|---|---|
| `/v1/sync/*` (all) | `SyncTransportGuard` | works |
| `/inventory/purchases`, `/recipes/versions`, `/production-orders/close`, `/regularization/sync` | human | 401 |
| `GET /inventory/alerts` | human | 401 |
| `POST /inventory/alerts/{id}/lifecycle` | no such backend route | 404 |
| `POST /inventory/count-sessions` | none | originally recorded as 2xx with `tenantId: undefined`; corrected below |
| `POST /inventory/movements/sync`, `/inventory/shrinkage` | none | open, no caller |

Correction, 2026-09-21: the `count-sessions` row was inferred incorrectly from missing guard metadata. The controller's class-level `TenantInterceptor` fails closed when neither `devicePrincipal.tenantId` nor `user.tenant_id` exists. Its focused spec proves that behavior, while the existing route e2e substitutes `TestTenantInterceptor` and injects a human tenant, so its 201 did not prove the production route was open. The actual defect is that the POS sends this count document through the device Dio without a bearer, so the route cannot complete through production transport.

Two aggravating facts:

1. **A pending recipe blocks sales.** The recipe domain runs before the sales domain in the sync pass, and `_runDomain` sets `_authBlocked` on the first 401/403 and skips every later domain for the rest of that pass. The recipe 401 therefore also suppresses the device-authoritative `/v1/sync/batch` sales path.
2. **`count-sessions` has no satisfiable transport contract.** It is emitted by the background device sync pass, but the POS interceptor does not attach a device bearer and no human session is guaranteed. Adding a guard without the matching POS transport would preserve the 401 and trip the same cascade.

## Why

The classification question is **who transmits, not who authored**. Inventory documents are authored by an operator in the UI, but the HTTP write happens inside the background sync pass, where no human session is guaranteed. The human authorization (`authorizedByUserId`, `authorizedByRole`, `authorizationMethod`) is captured locally at authoring time, not at transmit time. Routing these calls through the human Dio would therefore make background sync depend on a live, unrevoked cloud session and would stop inventory sync silently on a locked or logged-out terminal — defeating the offline-first mandate.

## Decisions (founder, 2026-09-21)

- **Actor authorization: depend on DSI-6.** Inventory writes move to device transport, and the actor-authorization gap that removing the human guards creates is declared as an explicit dependency on the S-6/OHAC offline-human-authorization workstream rather than silently dropped. Device identity alone is not recorded as sufficient authority.
- **Global guard posture: per-route guards plus a registry test.** No global default-deny `APP_GUARD`. Instead, a test must fail when a route exists without a declared transport class, so an undeclared surface cannot be added silently.
- **Alerts: fold into inbound deltas.** `GET /inventory/alerts` travels through `/v1/sync/inbound/deltas`; no separate inventory alert surface is kept.
- **Dead routes: guard as device.** `POST /inventory/movements/sync` and `POST /inventory/shrinkage` are kept and guarded with `SyncTransportGuard` rather than deleted.

## Scope

- Declare the transport class for every POS-facing route and pin it with a registry test.
- Move the machine-transmitted inventory writes to device transport behind `SyncTransportGuard` with `sync:push`, binding the terminal from the device principal instead of the human user.
- Fold inventory alerts into the existing inbound delta path and remove the dead POS call to the non-existent lifecycle route.
- Guard the two routes with no caller.

## Non-goals

- Implementing DSI-6 / OHAC offline human authorization. This feature depends on it; it does not build it.
- A global default-deny guard.
- Redesigning the sync engine's domain ordering or the `_authBlocked` cascade semantics, although the cascade's blast radius is recorded here as a finding worth its own issue.
- Changing how the POS authorizes a document locally at authoring time.

## Constraints

- Offline-first: background sync must never require a live human session.
- The device must not authorize itself; the human authorizes at authoring time.
- Tenant isolation uses PostgreSQL RLS under a `NOBYPASSRLS` runtime role, and every read or write must run inside a tenant-bound transaction (see the L1-11 fix, which established that binding must happen where the query runs).
- Multi-tenant: no behaviour may be hard-coded to the first client.
- No raw RUC, PIN, secret or credential enters repository artifacts.
- TDD: strict, from `openspec/config.yaml`. Backend runner `npm test`; POS runner `flutter test`.
- Review budget: approximately 400 authored changed lines per unit.

## Delivery and verification

- One work unit per reviewable slice, each with its own pull request and its own diff.
- Backend slices: focused Jest specs plus `npm run build`, and `npm run lint` with only the repository's pre-existing warnings. Note that this repository's lint script runs eslint with `--fix` across the whole backend and rewrites unrelated files that carry formatting drift; revert anything outside the authorized surfaces.
- RLS-sensitive slices must include a real-database spec that runs as a non-owner `NOSUPERUSER NOBYPASSRLS` role against FORCED RLS, reusing `apps/admin_backend/test/support/rls-test-shape.helper.ts`. A spec that runs as the `postgres` superuser or in a schema built with `synchronize: true` proves nothing about RLS.
- POS slices: focused `flutter test` plus `flutter analyze`.

## Tasks

### ST-01 — Guard the two routes with no caller

Status: complete — work-unit commit `4747ba9`, merged via PR #475.

- [x] Apply `SyncTransportGuard` plus `@RequireSyncScopes('sync:push')` to `POST /inventory/movements/sync` and `POST /inventory/shrinkage`.
- [x] Bind the tenant and terminal from the device principal, never from a human user.
- [ ] Add the registry entry declaring both routes as device transport. **Deferred to ST-02**, which introduces the registry itself; both routes already carry their guards, and the registry will declare them there.

Acceptance criteria:
- Both routes answer 401 without a valid device token and are reachable with one.
- No human-session dependency is introduced, and no route with no caller stays open.

Checks:
- Focused controller specs asserting guard metadata and rejection without a device principal.
- `npm run build`, `git diff --check`.

Evidence: strictly TDD. RED observed as the new focused spec failing 6 of 11 on missing guard metadata, missing scope metadata, the human role gate and both fail-closed tenant cases; GREEN as 10 of 10 in the new spec and 285 tests across 37 inventory suites, reproduced by the parent. `npm run build` clean, `git diff --check` clean, `npm run lint` at the repository's exact known baseline of 0 errors and 388 warnings, with 46 unrelated files that the lint script rewrote reverted afterwards.

Two details worth recording because they were deliberate. `movements/sync` binds the tenant fail-closed through a `requireTenant` helper mirroring `SyncBatchController`, so an unbound request cannot reach the service. `shrinkage` deliberately keeps its original signature and takes no tenant parameter, because `ShrinkageService` derives `tenant_id` from the affected rows inside its own transaction; adding a parameter would have changed a public contract for no gain. `DeviceSyncModule` had to be imported into `InventoryModule`, because `IdentityModule` does not re-export it and the guard's dependencies were otherwise unresolvable — that is also why the pre-existing `inventory.controller.spec.ts` needed a guard override, applied with no change to any existing assertion.

Size: 285 changed lines, of which 34 are production (32 in the controller, 2 in the module) and the rest is test code, which satisfies the recorded rule for exceeding the advisory budget.

**CI caught a blast radius the local verification missed, and the process lesson is recorded rather than hidden.** Declaring a guard on a controller is not a local change: Nest testing modules instantiate route guards eagerly, so every spec that builds that controller fails at DI resolution unless the guard's dependencies are provided or the guard is overridden. Local verification ran `npx jest src/modules/inventory` and `npm run build`, which passed, and CI then failed with 4 e2e suites and 58 tests down. Repairing the four named suites in commit `54a8f3b` and re-running the **full** e2e suite surfaced a fifth, `test/identity/authoritative-routes.e2e-spec.ts`, which builds the same controller and had not appeared in any filtered run. Final state: full e2e 50 suites and 403 tests passing, full unit suite 247 suites and 2289 tests passing, build clean.

Two rules follow for the rest of this feature, both stated as requirements in Delivery and verification: after changing a controller's guard set, run the **full** unit and e2e suites and not a filtered pattern, because filtered runs systematically under-report the blast radius; and a spec file may hold more than one testing module, so only the module that instantiates the guarded controller needs the override.

### ST-02 — Pin the transport contract with a registry test

Status: complete — work-unit commits `2784109` (the invoice fix it found) and `d380cf9` (the registry), merged via PR #477.

- [x] Add a registry test that enumerates the application's real route table and fails when a route carries no guard and is not declared public.
- [x] Record the transport class per route as data, not prose, so drift fails the test rather than a review.
- [x] Classify every route as `device`, `human` or `public`, with a one-line reason on every `public` entry.

Acceptance criteria:
- Adding an unguarded or unclassified route fails the test.
- The registry matches the guards actually declared on the controllers, checked in both directions.

Checks:
- The registry test itself, demonstrated failing for both drift directions with temporary edits that were reverted.
- `npm test`, `npm run test:e2e`, `npm run build`, `git diff --check`.

Evidence: the registry walks the Nest module graph metadata rather than compiling the application, which lets it run without a database — `DiscoveryService` or an HTTP-adapter route table would both require a full app instance and therefore TypeORM. It classifies each controller with per-handler overrides, and it enforces three rules: every route must be classified; a `device` declaration must actually carry `SyncTransportGuard` and must not carry a human guard; a `public` declaration must actually carry no authentication guard and must state a reason. Stale declarations fail too. Drift was demonstrated in both directions with temporary edits and reverted: declaring a guarded controller `public` failed with `declared public but carries guard(s): SyncTransportGuard, SyncCreditNoteAuthGuard`, and declaring an unguarded one `human` failed with `declared human but carries no human authentication guard`.

**The registry immediately earned its place by finding a real, previously untracked hole.** `InvoicesController`, registered in `SalesModule`, declared no guard at all: `POST /sales/sync` (invoice write), `GET /sales` and `GET /sales/:id` were reachable unauthenticated and reached the service with `tenantId: undefined`. A guard import had been left commented out with the note "Import JwtAuthGuard if it exists, or similar", which is what left the surface open. No caller was found in the POS or the dashboard, and the POS syncs sales through the device-guarded `/v1/sync/batch`. The implementing writer refused to whitelist it and reported it instead, which is the correct behaviour and is why the registry test was red until the fix landed.

Founder decision: guard it as **device** transport. Fixed in commit `2784109` with `SyncTransportGuard` at controller level, `sync:push` on the write and `sync:pull` on the two reads, `TenantInterceptor` plus the same fail-closed `requireTenant` used by `movements/sync`, and the actor-authorization gap declared in a controller comment as a DSI-6 dependency. The stale commented import was removed.

Final state: full unit suite 249 suites and 2318 tests passing, full e2e 50 suites and 403 tests passing, build clean. The only `public` entry that is not genuinely public is `count-sessions`, recorded as transitional with its reason and removed by ST-04.

### ST-03 — Move the inventory document writes to device transport

Status: complete — work-unit commits `ded9420` (backend) and `61c6184` (POS), merged via PR #479 (`58ce0dc`); issue #478 closed.

Split from the original scope after inspection: `POST /inventory/regularization/sync` moved to its own unit (ST-06) because its actor derivation is not a simple guard swap. `regularization.controller.ts` derives the actor as `request.user?.sub || request.user?.id || 'unknown-user'` and the role as `request.user?.role || 'manager'`. Those are fail-open defaults that only make sense with a human session; over device transport they would fabricate an actor and a role. That needs its own treatment and its own review, so it does not ride along here.

- [x] Move `POST /inventory/purchases`, `POST /inventory/recipes/versions` and `POST /inventory/production-orders/close` from the human guards to `SyncTransportGuard` with `sync:push`.
- [x] Bind the tenant and terminal from the device principal and stop reading the human user.
- [x] Declare, in code and in this record, the actor-authorization gap this creates and its dependency on DSI-6, so the removal of `AuthoritativeCurrentUserGuard` is visible rather than implicit.
- [x] Extend the POS device interceptor or the route paths so the device bearer is attached to these calls.

Acceptance criteria:
- The POS completes these writes through device transport with no human session present.
- No route in this set accepts a request without a valid device token.
- The DSI-6 dependency is explicit wherever the human guards were removed.

Checks:
- Backend controller and guard specs; a real-database spec proving tenant binding for at least one of these writes.
- POS tests asserting the client selection per route.
- `npm run build`, `flutter analyze`, `git diff --check`.

Evidence for ST-03 — work-unit commits `ded9420` (backend) and `61c6184` (POS), merged via PR #479 as `58ce0dc`; issue #478 closed.

Backend. The three handlers carry `SyncTransportGuard` with `@RequireSyncScopes('sync:push')`; the `@Roles` decorators and all three human guards are gone from them. Tenant arrives through the device-principal-first `GetTenantId`, and the production-close handler binds its terminal from `devicePrincipal.deviceId`, which is the precedent already set by `inbound-sync.service.ts`, so no new claim plumbing was needed. The DSI-6/OHAC actor-authorization gap is declared in a visible comment at each of the three guard-removal points.

POS. The device interceptor now attaches the bearer to exactly three additional routes, by exact match and never by prefix, with a comment recording why widening it to all of `/inventory/*` would leak device credentials to human surfaces. Negative tests assert the token is not attached to `count-sessions`, `regularization`, `correction`, `preview`, `alerts` or any suffixed path.

**ST-03 was where the blast radius peaked, and the implementing writer handled it the right way twice.** It stopped before writing when it found that four e2e suites pinned the human-transport contract being retired, rather than deleting cases to make them pass; and it stopped again when a fifth file, the pre-existing metadata spec, pinned the same retired contract in unit tests. Both were escalated for authorization instead of widened silently. The four e2e suites were migrated case by case with per-case justifications: the human tenant-less cases were replaced by human-bearer-rejected-on-device-route, the no-terminal-claim forking case was replaced by claim-wins neutralization because it is unreachable under device transport, and the 403 cases were re-pointed to a route that is still human. `AuthoritativeCurrentUserGuard`'s own contract was re-pointed from `/inventory/purchases` to `/inventory/purchases/:id/correction`, which still carries the triple guard, so that coverage was preserved rather than lost with the route.

One correction the focused run caught and is worth recording: an early version of the metadata migration collapsed the human helper and silently lost the assertion that `correctPurchase` still carries `AuthoritativeCurrentUserGuard`. The migration was fixed to keep two helper variants rather than one, because a route leaving the human transport does not mean the human contract stopped existing elsewhere.

Checks run: full unit suite 249 suites and 2329 tests passing; full e2e 50 suites and 402 tests passing; `npm run build` clean; `flutter analyze` clean; POS interceptor tests 12 of 12; `npx eslint` exit 0 on all ten changed files, including the ones under `test/`, after fixing twelve flagged issues; `git diff --check` clean.

Two lessons from earlier units were applied here as requirements rather than rediscovered: the full suites were run instead of filtered patterns, and eslint was run on every changed and new file including test files, because CI lints `{src,apps,libs,test}/**/*.ts`. One further lesson is worth keeping: guard metadata for a route can be pinned in more than one spec file, so the blast-radius search after moving a guard must look for `GUARDS_METADATA` and `ROLES_KEY` assertions repo-wide, not only for specs that instantiate the controller.

### ST-06 — Move regularization/sync to device transport without fabricating an actor

Status: complete — work-unit commit `118b9bc`, published as PR #483 from branch `feat/regularization-device-transport`; issue #482 approved and CI pending.
Route: delegated direct — the 4-file mapping and multi-file writer triggers applied.
Actual size: 972 authored changed lines excluding this task record: approximately 158 production and 814 test/support lines, including a 499-line real-database FORCE-RLS contract. Founder authorized one atomic PR with a recorded size exception because guard, exact POS bearer route, fail-closed actor handling and tenant-bound persistence form one coherent security outcome; splitting transport from RLS leaves an authenticated route that still fails under the production runtime role.

Founder decisions, 2026-09-21:
- Harden the separate human `approve` handler too: remove its `unknown-user`/`manager` defaults and fail closed unless the authenticated human principal supplies a non-empty id and role.
- Preserve legitimately absent actor fields as `null` on auto-approved sync documents; never fabricate identity or privilege. Present actor fields remain self-reported until DSI-6 attests them.
- Include the real tenant bind and PostgreSQL FORCE-RLS contract now; do not ship an authenticated route that still fails under the `NOBYPASSRLS` runtime role.

- [x] Move `POST /inventory/regularization/sync` to `SyncTransportGuard` with `sync:push`, while keeping `GET pending` and `POST approve` on the human guards.
- [x] Add the exact route to the POS device interceptor without widening the bearer to other regularization paths.
- [x] Persist actor fields exactly from each document, preserving legitimate absence as `null` and declaring the self-reported DSI-6 dependency.
- [x] Remove the human `approve` handler's fail-open `unknown-user` and `manager` defaults and reject a missing authenticated id or role.
- [x] Bind `app.tenant_id` inside `syncCorrections`' own transaction before every FORCE-RLS-protected query/write.
- [x] Prove transport, actor, and tenant isolation through strict RED/GREEN tests, including a real `NOSUPERUSER NOBYPASSRLS` PostgreSQL contract.

Acceptance criteria:
- The sync route accepts only a valid device credential with `sync:push`; human pending/approve routes retain human authorization.
- The POS attaches the device bearer exactly to `/inventory/regularization/sync`.
- Present actor values are recorded from the document; absent values remain null; no sync path fabricates identity or role.
- Human approve fails closed when guard-provided id or role is missing and never substitutes a privileged role.
- Sync persistence executes inside a tenant-bound transaction and cannot cross tenant boundaries under FORCE RLS.
- The DSI-6 self-reported actor dependency is explicit at the transport boundary.

Checks:
- Strict RED/GREEN controller metadata and fail-closed human-principal specs; service actor and transaction-order specs; route-registry contract.
- Real HTTP/PostgreSQL FORCE-RLS contract for device authentication, tenant-bound persistence and cross-tenant isolation.
- POS interceptor exact-route tests plus existing regularization sync tests.
- Full `npm test` and `npm run test:e2e`; `npm run build`; targeted eslint on every changed/new TypeScript file including `test/`.
- Focused Flutter tests; `flutter analyze`; `git diff --check`.

Evidence: mapping corrected the original task premise: `sync` already forwarded document actor fields without defaults, while `unknown-user`/`manager` existed only in the human `approve` handler. It also found that `syncCorrections` used global repositories without tenant binding against FORCE-RLS tables.

Strict TDD RED: controller tests failed six cases for missing device metadata, lost human-guard guarantees and fail-open approve behavior; service tests failed transaction bind ordering and manager-scoped repository requirements; registry still classified sync as human; POS attached no bearer; and three of four real-database cases failed with 401 while the route still used human guards. GREEN: focused backend controller/service/registry/retrocalculation suites 36/36, real HTTP/PostgreSQL contract 4/4, and focused POS transport/regularization tests 15/15.

The controller now keeps pending/approve on human guards and moves only sync to `SyncTransportGuard` with `sync:push`. Approve uses the repository's existing fail-closed `BadRequestException('Authenticated actor principal is required')` precedent for missing/blank id or role. Sync has no request-user dependency; present document actor fields persist exactly and legitimate absence persists as SQL null, with the DSI-6 self-reported dependency visible at controller and service boundaries.

`syncCorrections` now opens one transaction, binds `app.tenant_id` as its first statement and obtains every sync-path repository from that manager. The real-database contract uses a `NOSUPERUSER NOBYPASSRLS` app role against FORCE RLS, with the real guard, and proves unauthenticated rejection, tenant-A persistence, exact actor persistence, null-actor preservation and cross-tenant isolation.

Full checks: backend unit 249 suites / 2352 tests passed with 8 skipped; backend e2e 52 suites / 413 tests passed; build clean; targeted eslint clean with ten known sibling-pattern warnings in the DB spec; focused POS 15/15; `flutter analyze` clean; `git diff --check` clean. Independent high-risk verification re-ran 36 focused backend tests, all four real DB cases and all 15 POS tests with no blocking finding. Parent spot-check re-ran the controller contract at 11/11. Native risk assessment was unavailable (empty native output), so the candidate was treated as high risk and independently verified under the RDD-off path.

Behavior note: the batch is now atomic; one poison document rolls back earlier items rather than leaving a partial batch, and idempotent lineage hashes make retry safe. A foreign-tenant `originMovementId` remains invisible under RLS and cannot mutate the foreign row; preserving a correction under the device tenant is pre-existing behavior, not introduced here.

Runtime harness: the real HTTP plus PostgreSQL FORCE-RLS e2e is the backend runtime boundary; focused POS interceptor and regularization tests are the transport boundary. Rollback boundary: restore class-level human guards/defaults, remove the sync device override and POS allowlist entry, and restore global-repository sync persistence; no unrelated fiscal behavior is included.

### ST-04 — Complete the count-session device transport

Status: complete — work-unit commit `bb90e6a`, merged via PR #480 (`343c62a`); issue #445 closed.
Depends on: ST-03 (satisfied by PR #479)
Route: delegated direct — the 4-file mapping and multi-file writer triggers applied.
Actual size: 558 authored changed lines excluding this task record: 31 production and 527 test lines, of which the real-database RLS contract contributes 468. Founder authorized one atomic PR with a recorded size exception because backend guard and POS bearer transport cannot be delivered separately without preserving the broken 401 path; extracting a shared RLS harness would expand scope across multiple existing suites.

- [x] Guard `POST /inventory/count-sessions` with `SyncTransportGuard` and `sync:push`, and classify it as device transport in the route registry.
- [x] Add the exact route to the POS device interceptor in the same work unit, never as a separate backend-only change.
- [x] Bind `app.tenant_id` inside `CountSessionService`'s own transaction before any RLS-protected query.
- [x] Prove the route and persistence contract through strict RED/GREEN tests, including a real FORCED RLS test with a `NOSUPERUSER NOBYPASSRLS` role.

Acceptance criteria:
- The route rejects callers without a valid device credential and accepts the POS device with `sync:push`.
- The POS attaches the device bearer to exactly `/inventory/count-sessions`, without widening credentials to other inventory routes.
- Count-session persistence executes in a tenant-bound transaction; a second tenant cannot observe the resulting movement.
- The background sync path requires no live human session.

Checks:
- Focused RED/GREEN backend guard and route-registry specs; focused POS interceptor test.
- Real-database count-session contract under FORCED RLS and a non-bypass role.
- Full `npm test` and `npm run test:e2e` after the guard-set change; `npm run build`.
- `npx eslint` on every changed or new TypeScript file, including `test/`; focused Flutter tests; `flutter analyze`; `git diff --check`.

Evidence: the baseline probe confirmed the previous "open 2xx" narrative was wrong: `TenantInterceptor` rejects a missing principal, while the existing route e2e replaces that interceptor and injects a tenant.

Strict TDD RED was observed independently per contract: controller metadata failed 3 of 25 tests before the guard/scope/fail-closed delegation existed; the registry failed 1 of 13 after declaring the route device while its guard was absent; the POS interceptor failed 1 of 12 because `count-sessions` received no bearer; the real-database contract passed its unauthenticated case but failed both device persistence cases with 401 before the route gained a satisfiable device transport.

GREEN: controller 25/25, registry 13/13, service 3/3, focused mocked plus real-database e2e 5/5, and POS interceptor 12/12. The real-database spec runs the Nest HTTP boundary through a `NOSUPERUSER NOBYPASSRLS` app role against FORCED RLS, proves the resulting movement is stamped for tenant A, proves stock changes only for tenant A, and proves tenant A cannot address tenant B's insumo. `bindTenantContext` is the first statement inside `CountSessionService`'s transaction; the mocked route e2e pins it before the first repository query.

Full checks: backend unit 249 suites / 2334 tests passed with 8 skipped; backend e2e 51 suites / 405 tests passed; build clean; targeted eslint clean on every changed/new TypeScript file with three known sibling-pattern warnings in the new DB spec; Flutter interceptor 12/12; `flutter analyze` clean; `git diff --check` clean. Independent high-risk verification re-ran 41 focused backend tests, the 3-case real RLS contract, the 12 POS interceptor tests and structural checks with no blocking finding. Parent spot-check re-ran the controller contract at 25/25. Native risk assessment was unavailable (empty native output), so the candidate was treated as high risk and independently verified under the RDD-off path.

Runtime harness: the real HTTP plus PostgreSQL e2e is the runtime boundary. Rollback boundary: revert the ST-04 controller/service/registry/POS changes and delete the new count-session tenant-binding DB spec; no unrelated behavior is included.

### ST-05 — Fold inventory alerts into inbound deltas

Status: complete — work-unit commit `c8218ce`, merged via PR #481 (`25dfe53`); issue #314 closed.
Route: delegated direct — the 4-file mapping and multi-file writer triggers applied.
Actual size: 833 authored changed lines excluding this task record: 294 production and 539 test lines. Founder authorized one atomic PR with a recorded size exception because the backend delta, retired route, removed broken POS domains and replacement local projection form one coherent transport outcome; splitting them creates either a no-alert window or retains a broken route.

Founder decisions, 2026-09-21:
- `deltas.alerts` is a one-way cloud-to-POS projection of backend `forensic_alerts`: map the backend fields, derive lifecycle status from `resolved_at`, use `created_at` as the cursor, and insert only when absent so a later pull cannot overwrite local acknowledgement/resolution state.
- POS acknowledgements and resolutions remain terminal-local in this work unit. Remove the dead outbound lifecycle call and record upward lifecycle synchronization as a follow-up rather than inventing a device route or actor-authorization contract here.

- [x] Add tenant-scoped forensic alerts to `/v1/sync/inbound/deltas`, including `types=alerts` and inclusive `sinceVersion` filtering on `created_at` so equal-watermark rows replay safely.
- [x] Project inbound alerts into local Floor persistence with insert-if-absent semantics so cloud replay cannot clobber local lifecycle state.
- [x] Remove the POS call to `POST /inventory/alerts/{id}/lifecycle`, which has no backend route and returns 404; keep local acknowledgement/resolution behavior intact.
- [x] Retire the separate `GET /inventory/alerts` surface and remove the POS inbox refresh call that expected an incompatible payload shape.
- [x] Record upward lifecycle sync as an explicit follow-up outside ST-05.

Acceptance criteria:
- No POS call targets either broken inventory-alert route.
- Tenant-scoped forensic alerts reach the terminal only through the device-authenticated inbound delta envelope.
- `sinceVersion` and `types=alerts` filter alerts deterministically using `created_at`.
- Re-pulling a cloud alert never overwrites a local acknowledgement or resolution.
- Removing cloud lifecycle upload does not disable local acknowledgement/resolution and does not introduce a live human-session dependency.

Checks:
- Backend strict RED/GREEN service and real-database sync-down contract for tenant isolation, `types=alerts`, and `sinceVersion`.
- Route-registry contract proving the retired `GET /inventory/alerts` surface no longer exists.
- POS strict RED/GREEN tests proving alerts are applied from inbound deltas, both broken calls are absent, and local lifecycle state survives replay.
- Full `npm test` and `npm run test:e2e` after the controller surface change; `npm run build`; targeted eslint on every changed/new TypeScript file including `test/`.
- Focused Flutter tests; `flutter analyze`; `git diff --check`.

Evidence: mapping found that the old `GET /inventory/alerts` returned a stock-summary shape incompatible with the POS forensic model, while the nonexistent lifecycle POST forced every sync pass to partial.

Strict TDD RED was observed for each replacement contract: the backend DTO/service initially lacked alerts, the registry still exposed the retired route, all three new real-database alert cases failed while the envelope returned no alerts, and POS tests observed the dead lifecycle POST plus zero projected alerts. GREEN after implementation: inbound service 30/30, registry plus focused backend suites green, real HTTP/PostgreSQL sync-down contract 10/10, and POS SyncService 53/53.

The backend always populates `deltas.alerts` on the managed inbound path, includes it in the default pull and supports `types=alerts`. Reads use only the transaction-bound manager with an explicit `tenant_id` predicate because `forensic_alerts` has no RLS policy. Incremental alert pulls use `created_at >= sinceVersion`; equal-watermark replay is pinned by a real-database case and is safe because the POS uses parameterized `INSERT OR IGNORE`. Non-null malformed `resolvedAt` rows fail closed, replay preserves local acknowledgement/resolution fields, and `alertsCount` counts inserted rows rather than received rows.

Full checks: backend unit 249 suites / 2340 tests passed with 8 skipped; backend e2e 51 suites / 409 tests passed; build clean; targeted eslint clean with the known sibling-pattern warnings in the DB spec; POS SyncService 53/53; `flutter analyze` clean; `git diff --check` clean. Independent high-risk verification re-ran the 30-case service contract, 10-case real DB contract and 53-case POS contract with no blocking finding. Parent spot-check re-ran the service contract at 30/30. Native risk assessment was unavailable (schema-incompatible native response), so the candidate was treated as high risk and independently verified under the RDD-off path.

Residual risk: PostgreSQL `created_at DEFAULT now()` uses transaction-start time, so an unusually long or clock-skewed transaction can still predate a later watermark despite inclusive comparison. Solving that requires a different cursor/schema contract and is not guessed here. The local `SELECT changes()` count can theoretically observe an interleaved SQLite statement, but it affects only informational `alertsCount`, not persistence or cursor advancement.

Runtime harness: the real HTTP plus PostgreSQL sync-down contract is the backend runtime boundary; the focused real-Floor SyncService test is the POS projection/replay boundary. Rollback boundary: restore the retired controller handler and two POS domains, remove alert deltas and their projection/tests; no fiscal or invoice behavior is included.

## Dependencies

- ST-04 depends on ST-03 so earlier document domains cannot suppress the count domain before it runs. The dependency is satisfied by merged PR #479. Backend guard and POS bearer transport still ship atomically so the route has a satisfiable device contract.
- ST-03 and ST-04 depend on the DSI-6 / OHAC workstream for actor authorization, per the founder decision. The transport change is authorized now; what stays deferred and declared is the actor-attestation guarantee that the removed human guards used to provide.
- Issue #445 closes when ST-01 and ST-04 are done. Issue #314 closes when ST-03 and ST-05 are done.

## Recorded findings not yet scheduled

- **The auth-blocked cascade is a blast-radius defect of its own.** A single 401 in an early domain suppresses every later domain for the rest of the pass, and the recipe domain runs before sales, so one pending recipe can suppress the device-authoritative sales batch. Worth its own issue.
- **No `APP_GUARD` exists.** Recorded and deliberately left as a per-route decision.
- **Alert lifecycle upload remains local-only.** ST-05 removes the nonexistent outbound route; a future upward device contract must define actor authorization before syncing local acknowledgements/resolutions.
- **Alert cursors inherit transaction-start timestamp risk.** Inclusive `created_at` fixes equal-watermark loss, but a long or clock-skewed insert transaction can still predate the watermark; a durable fix needs a new cursor/schema contract.

## Progress

- Feature opened 2026-09-21 from the route-by-route inventory taken at `main` `8e489ab`. A later baseline probe corrected the `count-sessions` premise: the class-level tenant interceptor already rejected principal-less calls, and the missing device bearer made the production POS path fail.
- ST-01 merged via PR #475: the two write routes that had no caller are no longer open. Issue #445 stays open until ST-04 completes its third route's explicit device contract.
- ST-02 merged via PR #477: the route registry now makes undeclared transport drift fail.
- ST-03 merged via PR #479 (`58ce0dc`): the three inventory document writes now use device transport; issue #478 is closed.
- ST-04 merged via PR #480 (`343c62a`): `count-sessions` now has a satisfiable device transport and tenant-bound persistence under real forced-RLS proof; issue #445 is closed.
- ST-05 merged via PR #481 (`25dfe53`): forensic alerts now arrive through inbound deltas, both broken POS alert calls are gone, and local lifecycle state survives cloud replay; issue #314 is closed.
- ST-06 complete in work-unit commit `118b9bc` and published as PR #483, closing approved issue #482: regularization sync now has device transport plus tenant-bound FORCE-RLS persistence, document actor absence stays null, and human approve has no fail-open identity defaults. Publication verification found the PR MERGEABLE with Admin, POS and Cloudflare checks pending and GitGuardian green.
- Issue #473 filed for the cascade defect found during the inventory: one 401 suppresses every later sync domain, and the recipe domain runs before sales, so a pending recipe can suppress the device-authoritative sales batch.

## Next step

Wait for PR #483 checks and the founder's merge decision.
