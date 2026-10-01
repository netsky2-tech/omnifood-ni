# Business Profile Modes Deploy Coordination Record

Status: **deployed on the cloud side; the POS side is not.** See "Observed deployment state".
Scope: BXW-007 — `operationMode` and `checkoutFxMode` configurable from the owner dashboard.

> This record was first written as "merged in `main`, deployment not executed". That was wrong. The
> cloud side had already shipped on its own. The correction is kept visible because the original
> wording is exactly the kind of assumption that produces a late announcement.

## Observed deployment state

Measured on 2026-10-01, not inferred.

| Side | State | Evidence |
|---|---|---|
| Backend contract (#723) | **live** | Railway `api-staging` active deployment is `155ee74a` (PR #732), branch `main`, created `2026-09-30T23:20:30Z`. `git merge-base --is-ancestor 17fb3a2a 155ee74a` succeeds, so the deployed commit contains #723; its tree carries `upsertOrClearParameter` and `readTenantOperationModeOrNull`. |
| Dashboard (#725) | **live** | The deployed `assets/settings-page-*.js` chunk contains the sentinel `Sin definir (valor local de la terminal)`. |
| POS projection (#736) | **not live** | It is a Flutter app. No auto-deploy reaches a terminal; it needs a build installed. |

Auto-deploy on Railway is currently **disabled by the operator** for cost control, so `main` has
moved past the live commit. Re-enabling it deploys the head of `main` at that moment, which carries
more than this feature — notably `13e01e27` (#738), which replaces Corte X and Corte Z with real
fiscal reports and is a behaviour change from a different workstream.

### The ordering risk did not materialise

The dashboard and the backend both track `main` independently, and the failure mode this record
existed to prevent was the dashboard shipping first:
`ValidationPipe` runs with `forbidNonWhitelisted: true`, so a dashboard sending the new keys to a
backend that does not declare them receives a 400. That did not happen — the backend deployment at
`23:20:30Z` ran from a commit that already contained #723, and the dashboard followed. Both sides are
consistent today.

### What is not operating yet: the floor

The cloud asserts the values; the terminals ignore them. The released POS does not read those snapshot
keys, so its dropdowns remain locally editable and the office's assertion does not govern the floor.
The effect the feature exists for — the office, not the cashier, deciding the checkout rate and the
operating mode — begins when a POS build with #736 is installed on the terminals. Until then, expect
the dashboard to be authoritative on paper only.

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

Since the cloud side is already live, "the next time" is now: the first tenant to save its fiscal setup after the deploy of `155ee74a` produced that tenant's step. Tenants that have not saved since are still where they were.

That recomputation happens on exactly three paths:

1. **A fiscal-setup save from the dashboard** (`fiscal-setup.service.ts:294`) — the ordinary case.
2. **Lazy initialisation** when a tenant has no revision at all (`getFiscalConfigSnapshot`, `fiscal-config-version.service.ts:266`) — this creates revision 1, it is not a bump.
3. **Activation pinning**, only when the tenant has no revision yet (`activation.service.ts:328`) — same, a first revision.

So the step is **per tenant and self-inflicted**: a tenant that never saves stays where it is, and a newly activated tenant simply starts at revision 1 with the new shape. Nothing migrates, nothing is backfilled, and no tenant is forced to a new revision by the deploy itself.

It is also a **one-off per tenant**: `recordRevisionChange` is idempotent and returns the current revision when the recomputed fingerprint is unchanged, so only the first recomputation after this release bumps, and later saves that change nothing do not.

## Accepted consequence

An unexplained revision step per tenant is the failure mode this record exists to prevent: anyone watching fiscal revisions will see movement and may read it as corruption or as an unauthorised config change. It is neither.

This is accepted under the same rule as the device-sync cutover: announce it **before** the deploy reaches tenants, never after someone notices.

**The rule was broken here, and by us.** The cloud side shipped on its own before the record existed, so the announcement is retroactive rather than preventive. The cause is plain: this release had no deploy step of its own — the two targets track `main` independently and publish whenever the branch moves — so "the deploy" was never a moment anyone could plan around. Any future change to this contract needs the order and the notice handled deliberately, because nothing in the pipeline enforces either.

Sending the notice now is still worth it: the affected population is the set of tenants that save before they are told, and that set only grows.

## Deploy order

**Backend before dashboard**, and this time it happened that way by accident rather than by plan because
the two targets track `main` independently. `ValidationPipe` runs with `forbidNonWhitelisted: true`, so
the new dashboard is rejected by a backend that does not declare the new keys. On any future change to
this contract, the order has to be enforced deliberately — the backend deploy followed by the dashboard
— because nothing in the pipeline enforces it.

The POS is safe to ship in either order, including before the backend: with no business-profile fields
in the snapshot the managed-keys marker is absent, every control stays editable, and terminal behaviour
is identical to before. It only starts acting once the office asserts a value.

## What is safe by construction

- The POS anti-downgrade rule rejects **lower** revisions only, so a +1 with a new fingerprint is an ordinary accepted update.
- The two fields are **conditional projections**: they never enter `isProjectionComplete`, and `FiscalProjectionKeys.currentVersion` stays `1`. No repair loop is triggered by their absence, which is a legal steady state.
- The undo path is a `null` tombstone: choosing "Sin definir" returns control to the terminal and preserves its local value.

## Announcement text (ready to send)

The tense matters here: the cloud side is already deployed, so this is not a warning about a future
event. It is a notice that something already started, with the reason why.

> Heads-up on the Business Profile change, which went live on the cloud side on 30 Sep: the fiscal
> config fingerprint now includes the two new business-profile fields, which are `null` for every
> tenant today.
>
> What that means in practice: when a tenant saves its fiscal setup from the dashboard, that tenant's
> fingerprint changes and its revision goes up by one — the usual revision update, not a repair and
> not a config change nobody made. It happens once per tenant, on that tenant's own first save; saving
> again without changing anything does not bump it further. There is no fleet-wide step at deploy
> time, and tenants that do not save stay where they are. Newly activated terminals simply start at
> revision 1 with the new shape. If you alert on fiscal revision changes, expect a step per tenant and
> treat it as expected.
>
> Nothing migrates and nothing is rewritten.
>
> Separately: the POS side is **not** deployed yet. The tablets keep using their local values until a
> build with the projection ships and is installed, so the office's setting does not govern the floor
> yet. That is expected, not a fault.

## Verification

### Code

- Backend: `npm --prefix apps/admin_backend test` and the DB-backed onboarding e2e suites.
- POS: `flutter test`, plus the `BXW-007 U3` handler and view-model suites.

### Deployment state, re-checkable without a provider console

Both checks below were used to write the table at the top, and both can be repeated.

**Backend — which commit is live.** `railway deployment list --json` for the linked service
returns the active deployment with its metadata; the fields that matter are `meta.branch`,
`meta.commitHash` and `createdAt`. Then ask git whether the feature you care about is inside
the deployed commit:

```bash
git merge-base --is-ancestor <feature-merge-commit> <deployed-commit> && echo "included"
```

Do not infer the deployed version from a green health endpoint: it answers 200 for any build.

**Dashboard — which build is live.** Cloudflare Pages does not expose the commit, but the build is
self-identifying. Fetch the entry bundle referenced by the deployed `index.html`, read the lazy chunk
list out of it, and fetch the chunk that contains the feature, then grep for a marker the feature
introduced:

```bash
curl -s https://soho.nhilospos.com/ | grep -oE 'assets/index-[^"]+\.js'   # entry bundle
curl -s https://soho.nhilospos.com/assets/<entry>.js | grep -oE 'assets/settings-page-[^.]+\.js'
curl -s https://soho.nhilospos.com/assets/<settings-page>.js | grep -c 'Sin definir (valor local'
```

Grep the **chunk**, not the entry bundle: lazily-loaded routes are absent from the HTML and from the
entry, so a search there returns zero and looks like "not deployed" when it is the opposite. That false
negative cost a round trip while writing this record.

### Ordering

On any future change to this contract, confirm the backend release precedes the dashboard release.
Nothing in the pipeline enforces it; both targets track `main` on their own.
