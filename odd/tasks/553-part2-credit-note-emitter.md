# 553-part2-credit-note-emitter

Part 2 of #553 (B1c/D-14): close the credit-note DoD incrementally. The Backoffice
emitter already exists on `main` (`SALES_ISSUE_CREDIT_NOTE = 'sales:issue_credit_note'`,
`createAdminCreditNote`, guards, tests) — verified by exploration (session 2026-10-14).
What is missing is the sync-back channel to POS, the dashboard permission mirror,
and e2e coverage. Reconciled with DEC-1/DEC-3 (`odd/tasks/go-live-decisions.md`):
POS keeps issuing locally during the pilot; cloud-issued NCs use `CREDIT_NOTE_SERIES`.

## Specs

- S1: User: "Perfecto, PR y avanzamos con la parte 2" — implement #553 Part 2 after PR #925.
- S2: User: "Recuerda cerrar los issues mientras vayamos integrando, para ir limpiando" — #553 closes when Part 2 lands; evidence comments per PR.
- S3: User: "Si, continuemos, gracias por lo de la sesion hermana. podemos continuar en lo nuestro" — proceed with the feature doc while #926 CI runs.
- S4: #553 DoD verbatim: "A cashier cannot reach credit-note issuance from the POS (widget test asserting the action is absent/disabled per role)." — already satisfied (role gate + regime gate, tested); keep pinned.
- S5: #553 DoD verbatim: "Backoffice can issue a credit note under ISSUE_CREDIT_NOTE, with audit, and it syncs back to the POS as a received document." — emission+audit exist (`createAdminCreditNote`, authorizer columns); the sync-back channel does NOT exist (inbound-sync has no invoices/creditNotes domain; POS pull applies catalog/config/alerts only).
- S6: #553 DoD verbatim: "No code path can show a success message for a document the backend has not accepted (regression test; `#525 AC-13` spirit, extended to the Backoffice surface)." — POS-side honesty landed in PR #925 (pilot-scope disclosure); extend the spirit to the Backoffice surface for cloud-issued NCs.
- S7: #553 Part 2 verbatim: "New backend permission `ISSUE_CREDIT_NOTE`; the emitter is SOHO staff from the admin panel, per D-14's \"SOHO, no NHILOS, es el emisor\"." — mapped to the existing `SALES_ISSUE_CREDIT_NOTE = 'sales:issue_credit_note'` (OWNER/MANAGER defaults); do NOT create a duplicate permission.
- S8: Issue #553 title verbatim: "B1c (D-14): block credit-note issuance in the POS; SOHO issues from Backoffice under ISSUE_CREDIT_NOTE" — scope decision recorded: D-14 superseded by DEC-1/DEC-3 (owner decisions 2026-09-29/30, `odd/tasks/go-live-plan.md:23`); POS emission stays with pilot-scope disclosure.
- S9: #553 Part 2 verbatim: "The document must obey the same invariants as every other issuance: append-only, sequential, authorization number printed bottom-right (D-17), and the origin invoice's data taken from stored facts, not recomputed." — invariants exist server-side (INSERT-only, `CREDIT_NOTE_SERIES` fail-closed, authorizer from principal); D-21 auth-number storage is NOT in this increment (gap 6 — separate decision with DSI-6).

## Tasks

- T1 (S7, S5) — Dashboard permission mirror: add `sales:issue_credit_note` to `apps/owner_dashboard/src/features/users/types.ts` (AppPermission const drives `ALL_APP_PERMISSIONS` + zod `updatePermissionsSchema`), so the permission matrix can grant/display it; keep role mirror `rbac.ts` in sync. Route: inline. Commit: `eec4939d` (RED 4/4 → GREEN 4/4; suite 1745 passed/4 skipped; tsc clean).
- T2 (S5, S6) — e2e coverage: `/sales/admin/*` has zero e2e coverage; `permissions.e2e-spec.ts` has no `sales:issue_credit_note` case. Add e2e specs for the admin credit-note endpoints (guard matrix: cashier 403, owner/manager with permission 201/200, forged-authorizer DTO rejections) and the permission-matrix case. Route: inline. Commit: `bf2f441e` — scope reconciled during implementation: the admin-endpoint guard matrix is ALREADY covered transport-level by `admin-invoices.controller.spec.ts` (real RolesGuard + PermissionsGuard, AuthGuard stubbed), so this task pins the identity-surface gap (the permissions-matrix case) without duplicating that contract.
- T3 (S5) — Sync-back channel: backend→POS credit-note delivery. Backend: add invoices/creditNotes domain to inbound deltas (`inbound-sync.service.ts`, versioned cursor) scoped to cloud-issued NCs (`CREDIT_NOTE_SERIES`; POS-issued stay local per DEC-3). POS: apply branch in `sync_service.dart` `_pullInboundDeltas` mapping received NC to the local read model without mutating local fiscal numbering. Split into backend (T3a) and POS (T3b) work units. Route: worker (bounded) with inline orchestration. Commit: (pending)

Non-goals: DSI-6 device-transport authorization (openspec BLOCKED, DSI-7 prerequisite); backend print/PDF surface; fiscal authorization-number storage (gap 6); inventory compensation for cloud-issued NCs (#519, by design).

## Log

- L1: (2026-10-14) User: "Necesito vayamos viendo estas issues, para ir limpiando gaps y problemas en el proyecto" — session opens the issue backlog; #553 flagged as top priority by the audit.
- L2: (2026-10-14) User: "Basate en codebase main y haz worktrees/branch aislados, al terminar limpiamos" — isolated worktrees/branches from `main`; cleanup at the end.
- L3: (2026-10-14) User: "Perfecto, PR y avanzamos con la parte 2" — PR #925 opened; Part 2 authorized.
- L4: (2026-10-14) Exploration finding: the Backoffice emitter already exists (`SALES_ISSUE_CREDIT_NOTE`, `createAdminCreditNote` at `invoices.service.ts:368`, guards, tests, dashboard gating) — Part 2 scope becomes gaps 1/4/5; S7 maps to the existing permission.
- L5: (2026-10-14) User: "Si, continuemos, gracias por lo de la sesion hermana. podemos continuar en lo nuestro" — feature doc created while #926 CI runs.
