# Review Ledger — offline-human-authorization-credential

Target: `openspec/changes/offline-human-authorization-credential/{design.md, specs/identity/spec.md}`
Lens: `review-risk` (fresh context, design-stage)
Artifact store: `openspec`

## Round 1 — design validation

| id | severity | status | evidence |
|---|---|---|---|
| R1-001 | CRITICAL | resolved | Below-floor rejection silently invalidated assertions created under epoch n before the terminal acknowledged n+1. Concrete path: `sync_service.dart` runs `_pullInboundDeltas` even when push domains already failed. Correction: §5.1 drain-before-acknowledgement invariant, deferral (`OHAC_ACK_DEFERRED_OUTBOX`), operator-visible append-only quarantine, reconnect reconciliation (`SUPERSEDED_BY_FLOOR`), Q80 interleaving scenario, drain-gate tests. |
| R1-002 | WARNING | resolved | Identity delta required a physically impossible cross-device atomic transition. Reworded as a convergent crash-safe state machine with an authorization-frozen acknowledgement-pending intermediate. |
| R1-003 | WARNING | resolved | Restated clear-data/reinstall transport restoration as a DSI-7 policy sign-off gate over existing activation seams, not an implementation blocker. |
| R1-004 | SUGGESTION | resolved | Added `OHAC_CREDENTIAL_BINDING_MISMATCH`, distinct from `OHAC_TENANT_TERMINAL_MISMATCH`, with a consumer remediation owner and DSI-6 amendment item. |
| R1-005 | SUGGESTION | resolved | Recovery-token pepper is deployment-secret-only, fail-fast at startup, with a rotation rule and config tests. |
| R1-006 | SUGGESTION | resolved | Live validation is re-canonicalization plus digest equality plus schema validation; duplicate-key vectors are conformance-fixture-only. |
| R1-007 | SUGGESTION | resolved | Documented residual: per-user-terminal lockout does not stop a retry on another terminal holding the same portable verifier. |

Confirmed blockers in round 1: none. All seven declared design tensions were verified accurate against the repository.

## Round 2 — delta re-validation

| id | severity | status | evidence |
|---|---|---|---|
| R1-001 | CRITICAL | verified resolved | Gate is the last pre-condition of the candidate-flip transaction; the pull path cannot bypass it; post-flip authorization freeze closes the creation-vs-gate race window; replay-safe via consumer unique `(tenant_id, assertion_id)`. |
| R1-002 | WARNING | verified resolved | Spec requirement is convergent, normative, testable, and preserves monotonicity, idempotency, and server floor authority. |
| R1-003..R1-007 | WARNING/SUGGESTION | verified resolved | Amendments are internally consistent; no contradiction or unsupported claim found. |
| R1-008 | SUGGESTION (new, info) | open | Outbox registration is consultative: assertion creation from an unregistered emitting outbox is not rejected, which could re-open the §5.1 loss path for a future consumer. Fold fail-closed registration coupling into the §5.1 implementation slice. |

New severe findings in round 2: none.

## Disposition

Design is finding-clean at CRITICAL/WARNING level. R1-008 remains an informational follow-up for the §5.1 implementation slice. External follow-ups owned outside this change: DSI-7 transport-restoration policy sign-off and the DSI-6 amendment package.
