# Review Ledger — device-sync-credit-note-authorization

Target: `openspec/changes/device-sync-credit-note-authorization/{design.md, proposal.md, specs/}`
Lens: `review-risk` (fresh context, design-stage)
Artifact store: `openspec`

## Round 1 — design validation

| id | severity | status | evidence |
|---|---|---|---|
| R1-001 | BLOCKER | resolved in design | Confirmed that no existing primitive proves human PIN entry to the backend. The local check is a bcrypt comparison (`auth_repository_impl.dart`), the audit chain is unkeyed SHA-256 tamper evidence, and the device credential authenticates only the terminal. A compromised POS could forge actor metadata and a consistent replacement chain. Resolution: admission stays disabled; a separate prerequisite change `offline-human-authorization-credential` must be approved, implemented, provisioned and verified first. |
| R1-002 | BLOCKER | resolved in design | Event-time eligibility was unprovable: current `users` state is not historical state, and "active at authorization time" could not be reconstructed offline. Resolution: signed policy epochs with per-terminal acknowledgement, protected monotonic state, sequence-interval checks, and an explicit delayed-revocation policy without TTL. |
| R1-003 | CRITICAL | resolved in design | The canonical authorization payload omitted payments and payment status even though the backend persists them (`invoices.service.ts`), allowing evidence reuse with altered financial effects. Resolution: `CN-AUTH-V1` binds payment status, all persisted payment fields, and explicitly classifies client-derived and server-generated fields; unknown future effect-bearing fields are rejected pending a schema version. |
| R1-004 | WARNING | resolved in design | Role casing was undefined between evidence (`MANAGER|OWNER`) and existing invoice metadata (`manager|owner`). Resolution: one exact wire representation per surface, one-way mapping, and rejection of whitespace, mixed case, unknown values and three-way mismatches. |
| R1-005 | WARNING | resolved in design | NFC handling was ambiguous, allowing different Dart/TypeScript acceptance behavior. Resolution: both runtimes normalize during construction and reconstruct identically before byte comparison, with one required fixture outcome. |

## Round 2 — scoped re-validation

| id | severity | status | evidence |
|---|---|---|---|
| R1-001 | BLOCKER | verified resolved | Prerequisite change is explicit and contracted; DSI-6 cannot enable or provision it and remains fail-closed. |
| R1-002 | BLOCKER | verified resolved | Epoch/acknowledgement semantics are deterministic with bounded residual risk stated. |
| R1-003 | CRITICAL | verified resolved | All persisted payment/status effects are bound or safely classified. |
| R1-004 | WARNING | verified resolved | Role mapping is exact and deterministic. |
| R1-005 | WARNING | verified resolved | Unicode construction/verification and fixture expectation are unambiguous. |

New severe findings in round 2: none.

## Disposition

Design is internally valid but externally blocked. Task decomposition and implementation must not start until:

- `offline-human-authorization-credential` is approved, implemented, provisioned and verified;
- the DSI-6 proposal/spec are clarified so actor eligibility is evaluated against the terminal-acknowledged epoch rather than current user state;
- the DSI-7 transport/terminal-admissibility boundary is settled.

Open non-blocking items carried forward: `offsets` for exact Q80 acceptance evidence and the final reviewable delivery decision (four-to-five slices forecast above the 400-line budget), to be decided under `ask-always`.
