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

Status: pending

- [ ] Apply `SyncTransportGuard` plus `@RequireSyncScopes('sync:push')` to `POST /inventory/movements/sync` and `POST /inventory/shrinkage`.
- [ ] Bind the tenant and terminal from the device principal, never from a human user.
- [ ] Add the registry entry declaring both routes as device transport.

Acceptance criteria:
- Both routes answer 401 without a valid device token and are reachable with one.
- No human-session dependency is introduced, and no route with no caller stays open.

Checks:
- Focused controller specs asserting guard metadata and rejection without a device principal.
- `npm run build`, `git diff --check`.

Evidence: pending.

### ST-02 — Pin the transport contract with a registry test

Status: pending

- [ ] Add a registry test that enumerates the POS-facing routes and their declared transport class, and fails when a route exists in the controllers without a declared class.
- [ ] Record the classification for every route in the inventory as data, not prose, so drift fails the test rather than a review.

Acceptance criteria:
- Adding an unguarded or unclassified route fails the test.
- The registry matches the guards actually declared on the controllers.

Checks:
- The registry test itself, plus a deliberate temporary omission to observe the failure.

Evidence: pending.

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

## Next step

Execute ST-01, then ST-02.
