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
