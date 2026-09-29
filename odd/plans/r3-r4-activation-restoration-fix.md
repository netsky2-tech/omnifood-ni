# R3-001 / R4-001 — Activation restoration fix (handoff to session in omnifood-ni-session)

**Source**: RDD review lineage `review-1212bca9a9e60034` (workspace omnifood-ni), state `correction_required`, candidate = the activation workstream diff that moved to worktree `/home/octavio_morales/omnifood-ni-session` (branch `feat/soho-activation-fixes`).

## Findings (both CRITICAL, verified in source)

| Id | Lens | Location | Claim |
|---|---|---|---|
| R3-001 | reliability (inferential) | `apps/pos_app/lib/ui/features/config/activation/activation_session_view_model.dart:224-247` | Incomplete state restoration leaves the Reconnect Sync phase locally unacknowledged upon resume → permanent deadlock. Proof also refs `activation_reconnect_sync_runner.dart:82`. |
| R4-001 | resilience (deterministic) | same region `:224-248` | Restoration omits `_reconnectSyncSucceeded`, bricking resumed activations already past the sync phase. |

## Verified mechanism

The `prepare()` restoration block sets phase gates from `attempt.localStatus`:
- `phase1Plus` → `_preOfflineChecksSucceeded = true`
- `phase2Plus` → `_controlledSaleSucceeded = true`
- **missing**: any restoration of `_reconnectSyncSucceeded` (only set in `syncActivationEvidence()`, ~line 294).

`activation_reconnect_sync_runner.dart:82` only permits sync from
`LOCAL_ACTIVATION_EVIDENCE_COMPLETE | SYNC_VERIFICATION_PENDING | EVIDENCE_ACKED`.
A resumed attempt at `EVIDENCE_ACKED`/`ACTIVATED`/`ACTIVATED_WITH_WARNING` re-requires
the reconnect-sync phase locally that already succeeded → deadlock/brick.

## Planned fix (approved budget: 40 of 64 diff lines)

In the restoration block, AFTER the `phase2Plus` assignment:

```dart
// R3-001/R4-001: statuses at or past EVIDENCE_ACKED prove the reconnect-sync
// phase already succeeded on a prior run. Restoring this gate prevents a
// resumed activation from deadlocking on a phase that is already complete.
const syncComplete = {
  'EVIDENCE_ACKED',
  'ACTIVATED',
  'ACTIVATED_WITH_WARNING',
};
if (syncComplete.contains(status)) {
  _reconnectSyncSucceeded = _controlledSaleSucceeded ?? false;
}
```

Plus one test in `activation_session_view_model_test.dart`: `prepare()` with
`localStatus = 'EVIDENCE_ACKED'` (and controlled sale implied) asserts
`reconnectSyncSucceeded == true`; and `SYNC_VERIFICATION_PENDING` leaves it
not-true (sync still pending).

## Why this lineage cannot complete it here

The correction-plan binding freezes target `sha256:2237848a…` (the original 8-file
diff); this worktree is now clean (`paths: []`, snapshot `a9b67005…`), so captures are
rejected with token-mismatch. No authority was burned; lineage stays in
`correction_required` for the record.
