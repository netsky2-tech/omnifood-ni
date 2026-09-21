# Device Sync Cutover Decision Record

Status: accepted, cutover not executed.
Scope: `/v1/sync/*` becoming device-only after DSI-1 to DSI-5.

## Context

DSI-1 to DSI-5 replaced the human cloud session as the sync authority with
platform-issued device credentials. From that change onward `/v1/sync/*`
authenticates a device access token only, and a request carrying a human token
is rejected with 401.

The code is merged in `main`. Deployment is a separate, coordinated step that has
not been executed, and the deploy trigger for the cloud backend lives outside
this repository, so it must be verified in the hosting dashboard before any
release is treated as controlled.

## Accepted decision

The team accepts a bounded credit-note gap: while the device-only transport is
active and DSI-6 authorization auditing is not delivered, a credit note that the
POS creates cannot be synchronized through device transport, because
`SyncCreditNoteAuthGuard` fails closed for device-originated credit notes until
DSI-6 exists.

The gap is accepted under these conditions:

- it is announced to the tenant before the cutover, not discovered afterwards;
- the affected operations are inventoried, including whether any open credit
  note is pending on an enrolled terminal;
- credit notes that must be issued in the window are handled by the documented
  manual procedure rather than by weakening the guard;
- terminals keep their local records; nothing is deleted while the gap is open;
- the gap closes only when DSI-6 lands, which in turn requires the offline human
  authorization prerequisite.

## Cutover preconditions

1. The deploy trigger and branch mapping are verified in the hosting dashboard.
2. Every enrolled pilot terminal runs a POS build that can provision and use a
   device credential.
3. The accepted credit-note gap is communicated and its manual procedure is
   agreed.
4. A rollback path is confirmed: reverting and redeploying the backend, because
   the device-only enforcement has no runtime feature flag.

## Rollback

There is no flag to disable device-only enforcement. Rollback means redeploying
the previous backend revision. Local financial records, device credentials and
pending outbox content must be preserved; no terminal data is deleted or
rewritten during rollback.

## Open items

- Deploy trigger verification in the hosting dashboard.
- DSI-6 delivery, which closes the credit-note gap.
- The offline human authorization prerequisite that DSI-6 consumes.

## Addendum (2026-09-17): founder pilot acceptance status — factual record only

This addendum records findings from the founder-pilot acceptance scoping. It does not
rewrite, reopen, or amend the accepted decision or its conditions above; the accepted
decision text is preserved unchanged. The record below is based on static reading of
the repository at the pilot freeze base and is not runtime-verified.

- Cutover precondition 2 ("Every enrolled pilot terminal runs a POS build that can
  provision and use a device credential") is **NOT SATISFIED** for the founder pilot
  acceptance. The acceptance scope was narrowed accordingly: `/v1/sync/*` device
  transport validation is out of scope for the ONB1.10F physical rehearsal.
- Device-credential enrollment gap (static reading): no POS path creates or finalizes
  the activation attempt that device-scoped bootstrap provisioning requires, and the
  pilot APK resolves its device id from the `DEVICE_ID` dart-define — absent from the
  documented build path — so a freshly built APK cannot match the seeded terminal id
  `Q802024120001`. Provisioning from `loginOnline` is OWNER-only, online-only, and
  silently best-effort.
- Mixed-transport defect (static reading): `SyncService` sends every request through
  the device-only Dio, while `/inventory/purchases`, `/inventory/production-orders/close`,
  `/inventory/recipes/versions`, and `/inventory/alerts` are guarded by the human
  `AuthGuard` (plus roles/authoritative-user guards), so those inventory domains cannot
  authenticate with a device credential.
- The accepted credit-note gap is **not yet inventoried** as this decision requires:
  the inventory of affected operations, including whether any open credit note is
  pending on an enrolled terminal, has not been recorded. The pilot follows the
  inventory-first decision and does not start until that inventory exists.
  - Correction (2026-09-20): the bullet above is superseded. The inventory of
    affected operations **was completed** during the 2026-09-17/18 field capture on
    both the backend and the device, with zero pending credit notes in each
    (recorded in `docs/onboarding/evidence/acceptance/AP_KNOWN_LIMITATIONS.md` §3
    and `odd/tasks/founder-pilot-acceptance-freeze.md`). What remains for cutover
    precondition 3 is registering the gap announcement and the agreed manual
    procedure; the pilot still follows the inventory-first decision.
- No pilot evidence claims that device transport works. No evidence produced by the
  pilot may be cited as validation of `/v1/sync/*` on the terminal.

Detailed findings, evidence locations, and closure requirements are tracked in
`docs/onboarding/evidence/acceptance/AP_KNOWN_LIMITATIONS.md`.
