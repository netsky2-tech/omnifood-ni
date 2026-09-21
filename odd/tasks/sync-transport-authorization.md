# Sync Transport & Route Authorization Contract

## Objective

Define and enforce, per route, which transport authorizes a POS request — device sync or human session — so that no write surface is reachable without a guard and every POS inventory call reaches a guard it can actually satisfy.

## Problem

Two open defects are the same missing contract:

- **Issue #445.** `POST /inventory/movements/sync`, `POST /inventory/shrinkage` and `POST /inventory/count-sessions` carry no guard at all, and the backend registers no global `APP_GUARD`. `GetTenantId` resolves `devicePrincipal?.tenantId ?? user?.tenant_id`, so those handlers run with `tenantId: undefined`.
- **Issue #314.** `SyncService` sends every request through the device-only Dio, whose interceptor attaches a bearer only to `/v1/sync/*`. The inventory routes it calls are human-guarded, so they answer 401.

The consequence is not a routing detail. Measured on `main` at `8e489ab`:

| Route | Guard today | Real outcome |
|---|---|---|
| `/v1/sync/*` (all) | `SyncTransportGuard` | works |
| `/inventory/purchases`, `/recipes/versions`, `/production-orders/close`, `/regularization/sync` | human | 401 |
| `GET /inventory/alerts` | human | 401 |
| `POST /inventory/alerts/{id}/lifecycle` | no such backend route | 404 |
| `POST /inventory/count-sessions` | none | 2xx with `tenantId: undefined` |
| `POST /inventory/movements/sync`, `/inventory/shrinkage` | none | open, no caller |

Two aggravating facts:

1. **A pending recipe blocks sales.** The recipe domain runs before the sales domain in the sync pass, and `_runDomain` sets `_authBlocked` on the first 401/403 and skips every later domain for the rest of that pass. The recipe 401 therefore also suppresses the device-authoritative `/v1/sync/batch` sales path.
2. **`count-sessions` works only because it is open.** It is the only inventory write the POS completes today. Guarding it alone converts a security hole into a functional regression and trips the same cascade.

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

Status: complete — work-unit commit `4747ba9` on branch `feat/sync-transport-authorization`. Not yet merged.

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

Status: complete — work-unit commits `2784109` (the invoice fix it found) and `d380cf9` (the registry) on branch `feat/sync-transport-registry`. Not yet merged.

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

Status: pending

- [ ] Move `POST /inventory/purchases`, `POST /inventory/recipes/versions`, `POST /inventory/production-orders/close` and `POST /inventory/regularization/sync` from the human guards to `SyncTransportGuard` with `sync:push`.
- [ ] Bind the tenant and terminal from the device principal and stop reading the human user.
- [ ] Declare, in code and in this record, the actor-authorization gap this creates and its dependency on DSI-6, so the removal of `AuthoritativeCurrentUserGuard` is visible rather than implicit.
- [ ] Extend the POS device interceptor or the route paths so the device bearer is attached to these calls.

Acceptance criteria:
- The POS completes these writes through device transport with no human session present.
- No route in this set accepts a request without a valid device token.
- The DSI-6 dependency is explicit wherever the human guards were removed.

Checks:
- Backend controller and guard specs; a real-database spec proving tenant binding for at least one of these writes.
- POS tests asserting the client selection per route.
- `npm run build`, `flutter analyze`, `git diff --check`.

Evidence: pending.

### ST-04 — Close the count-session hole together with its transport

Status: pending
Depends on: ST-03

- [ ] Guard `POST /inventory/count-sessions`, which is the one inventory write the POS completes today and does so only by being open.
- [ ] Do it in the same unit as its transport change, never alone: guarding it by itself breaks POS count-session sync and triggers the auth-blocked cascade.

Acceptance criteria:
- The route rejects an unauthenticated caller and accepts the POS device.
- Count-session sync still completes end to end after the change.

Checks:
- Backend guard spec; POS test asserting the route now carries the device bearer.
- Real-database spec proving the count-session write is tenant-bound rather than `tenantId: undefined`.

Evidence: pending.

### ST-05 — Fold inventory alerts into inbound deltas

Status: pending

- [ ] Remove the POS call to `POST /inventory/alerts/{id}/lifecycle`, which has no backend route and returns 404.
- [ ] Move `GET /inventory/alerts` onto the inbound delta path so alerts travel with the rest of the machine pull, and retire the separate inventory alert surface.

Acceptance criteria:
- No POS call targets a route that does not exist.
- Alerts reach the terminal through the inbound delta path, and no separate inventory alert surface remains.

Checks:
- POS tests asserting the alerts domain uses the inbound path.
- Backend spec confirming the alert delta is present in the inbound envelope.
- `flutter analyze`, `git diff --check`.

Evidence: pending.

## Dependencies

- ST-04 depends on ST-03; guarding `count-sessions` alone is the single change that breaks a working POS flow.
- ST-03 and ST-04 depend on the DSI-6 / OHAC workstream for actor authorization, per the founder decision. The transport change is authorized now; what stays deferred and declared is the actor-attestation guarantee that the removed human guards used to provide.
- Issue #445 closes when ST-01 and ST-04 are done. Issue #314 closes when ST-03 and ST-05 are done.

## Recorded findings not yet scheduled

- **The auth-blocked cascade is a blast-radius defect of its own.** A single 401 in an early domain suppresses every later domain for the rest of the pass, and the recipe domain runs before sales, so one pending recipe can suppress the device-authoritative sales batch. Worth its own issue.
- **No `APP_GUARD` exists.** Recorded and deliberately left as a per-route decision.

## Progress

- Feature opened 2026-09-21 from the route-by-route inventory taken at `main` `8e489ab`, after the parent verified that guarding `count-sessions` alone would break a working POS flow.
- ST-01 complete: the two write routes that had no caller are no longer open. Issue #445 stays open until ST-04 closes its third route.
- Issue #473 filed for the cascade defect found during the inventory: one 401 suppresses every later sync domain, and the recipe domain runs before sales, so a pending recipe can suppress the device-authoritative sales batch.

## Next step

Execute ST-03 (move the inventory document writes to device transport), then ST-04 and ST-05.
