# device-sync-credit-note-authorization

OpenSpec change initialized for **DSI-6 only**.

## Scope

Replace the fail-closed device CREDIT_NOTE sync barrier with authorization-audit enforcement keyed by `authorizationAuditId`, while preserving offline-first operation, DGI invoice immutability/history, tenant RLS, idempotent sync, and separation of device principals from human authorization.

## Explicit non-goals

- DSI-7 rotation/revocation recovery
- DSI-8 acceptance
- DSI-1–5 re-documentation or implementation

Proposal, exploration, specification, design, tasks, and implementation artifacts are intentionally not started by init.
