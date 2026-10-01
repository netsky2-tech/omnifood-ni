# Business Profile Modes Deploy Coordination Record

Status: merged in `main`, deployment not executed.
Scope: BXW-007 — `operationMode` and `checkoutFxMode` configurable from the owner dashboard.

## Context

Three changes are in `main`:

| Slice | PR | Merge commit | What it does |
|---|---|---|---|
| Backend contract | #723 | `17fb3a2a` | `operationMode` / `checkoutFxMode` travel through the fiscal config parameters and the revision snapshot. Optional on input, **nullable** on output: `null` means "the office never asserted this", never "configured as the default". |
| Dashboard UI | #725 | `e2683442` | Two selects with a "Sin definir" sentinel, plus the undo path that writes a `null` tombstone. |
| POS projection | #736 | `2818891c` | The terminal projects the asserted values into `local_configs`, locks those fields per field, and leaves everything editable when the cloud asserted nothing. |

Deployment is a separate, coordinated step. The deploy trigger for the cloud backend lives outside this repository, so it must be verified in the hosting dashboard before any release is treated as controlled.

## Why this needs announcing

The canonical fingerprint (JCS over the effective fiscal payload) now covers the two new keys. Those keys are `null` for **every** tenant today, because `operation_mode` has only ever been written by the tablet, so the parameter is absent fleet-wide.

The consequence is precise, and it is **not** a fleet-wide event at deploy time:

> The next time a tenant's fiscal config is recomputed, that tenant's fingerprint differs from its stored one and its revision increments by one.

That recomputation happens on exactly three paths:

1. **A fiscal-setup save from the dashboard** (`fiscal-setup.service.ts:294`) — the ordinary case.
2. **Lazy initialisation** when a tenant has no revision at all (`getFiscalConfigSnapshot`, `fiscal-config-version.service.ts:266`) — this creates revision 1, it is not a bump.
3. **Activation pinning**, only when the tenant has no revision yet (`activation.service.ts:328`) — same, a first revision.

So the step is **per tenant and self-inflicted**: a tenant that never saves stays where it is, and a newly activated tenant simply starts at revision 1 with the new shape. Nothing migrates, nothing is backfilled, and no tenant is forced to a new revision by the deploy itself.

It is also a **one-off per tenant**: `recordRevisionChange` is idempotent and returns the current revision when the recomputed fingerprint is unchanged, so only the first recomputation after this release bumps, and later saves that change nothing do not.

## Accepted consequence

An unexplained revision step per tenant is the failure mode this record exists to prevent: anyone watching fiscal revisions will see movement and may read it as corruption or as an unauthorised config change. It is neither.

This is accepted under the same rule as the device-sync cutover: announce it **before** the deploy reaches tenants, never after someone notices.

## Deploy order

**Backend (#723) first, then the dashboard (#725).** `ValidationPipe` runs with `forbidNonWhitelisted: true`, so the new dashboard would be rejected by the old API for carrying unknown keys. The reverse order is safe but pointless — the UI would have nothing to write to.

The POS (#736) is already in `main` and is safe to ship **in either order**, including before the backend: with no business-profile fields in the snapshot the managed-keys marker is absent, every control stays editable, and terminal behaviour is identical to before. The change only starts doing anything once the office actually asserts a value.

## What is safe by construction

- The POS anti-downgrade rule rejects **lower** revisions only, so a +1 with a new fingerprint is an ordinary accepted update.
- The two fields are **conditional projections**: they never enter `isProjectionComplete`, and `FiscalProjectionKeys.currentVersion` stays `1`. No repair loop is triggered by their absence, which is a legal steady state.
- The undo path is a `null` tombstone: choosing "Sin definir" returns control to the terminal and preserves its local value.

## Announcement text (ready to send)

> Heads-up before the next backend deploy of the Business Profile change: starting with that release, the fiscal config fingerprint includes the two new business-profile fields, which are `null` for every tenant today.
>
> What that means in practice: the next time a tenant saves its fiscal setup from the dashboard, that tenant's fingerprint changes and its revision goes up by one — the usual revision update, not a repair and not a config change nobody made. It happens once per tenant, on that tenant's own first save; saving again without changing anything does not bump it further. There is no fleet-wide step at deploy time, and tenants that do not save stay where they are. Newly activated terminals simply start at revision 1 with the new shape.
>
> Nothing migrates and nothing is rewritten. If you alert on fiscal revision changes, expect a step per tenant over the following days and treat it as expected.
>
> Deploy order: backend first, then the owner dashboard. The POS side is already released and is inert until the office asserts a value.

## Verification

- Backend: `npm --prefix apps/admin_backend test` and the DB-backed onboarding e2e suites.
- POS: `flutter test`, plus the `BXW-007 U3` handler and view-model suites.
- Confirm in the hosting dashboard that the backend release precedes the dashboard release.
