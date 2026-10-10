# Feature: Fleet Terminal Panel — B17-01 Registry Read Model (Issue #832)

- **Branch / Worktree:** `feat/fleet-terminal-registry` @ `/home/octavio_morales/omnifood-ni-fleet-terminal` (off `main` 2b462961)
- **Authority:** Issue #832, `docs/plans/identity/batch_17_fleet_terminal_registry_and_owner_revocation.md`, DEC-17.1 (derived read model), DEC-17.2 (OWNER-only revoke), DEC-17.3 (battery dropped).
- **Commit Evidence:** `595e41b23dc43897236df3bc4bf3b256c890366f` (`feat(identity): implement tenant terminal read model (B17-01)`)
- **Status:** COMPLETED — B17-01

## Context & Objectives

Batch B17-01 implements the authoritative, tenant-scoped terminal read model over `device_sync_credentials` joined to activation attempts, plus freshness derivation from sync receipts (matching `sync-health`), exposed through `DeviceSyncCredentialService.listTenantTerminals(tenantId)`.

Out of scope for B17-01:
- Any HTTP endpoint (B17-02 / B17-03)
- Any UI / dashboard panel (B17-03 / B17-04)
- Any migration / master table (read model only per DEC-17.1)

Acceptance Criteria:
1. Returns exactly the terminals of the calling tenant and nothing else (RLS isolation proof).
2. A REVOKED credential appears with `status=REVOKED` and its `revocation_reason`.
3. The freshness state for each terminal matches `GET /operations/sync/freshness` for the same window.
4. Unit tests in `device-sync-credential.service.spec.ts` + DB-backed RLS integration test in `test:db`.

---

## Tasks

- [x] **T1: Terminal read model contract & DTO definition**
  - Define `TenantTerminalDto` (terminalId, label, credentialId, credentialVersion, status, issuedAt, expiresAt, revokedAt, revocationReason, posBuild, freshnessState, acceptedThroughSequence, lastReceiptAt, hasDeclaredGaps, hasInventoryPending, inventoryPendingCount).
  - Export from `identity` module.

- [x] **T2: RED -> GREEN implementation of `listTenantTerminals`**
  - Write RED unit tests in `device-sync-credential.service.spec.ts` covering:
    - RLS tenant context binding via transaction.
    - Empty credentials handling.
    - Grouping by canonical deviceId (`trustedTerminalId ?? candidateTerminalId`), picking latest credential by version.
    - Mapping active credentials with freshness from `SyncHealthService`.
    - Mapping revoked credentials with `status=REVOKED` and `revocationReason`.
    - Excluding credentials from other tenants.
  - Implement `listTenantTerminals` in `DeviceSyncCredentialService`.
  - Wire module dependencies in `DeviceSyncModule`.

- [x] **T3: DB-backed RLS isolation spec & sync-health cross-check**
  - Create integration spec `device-sync-credential.service.db.spec.ts` running against real PostgreSQL schema (`test:db`).
  - Prove strict tenant RLS isolation: tenant A reads 0 terminals of tenant B.
  - Prove revoked terminal behavior and receipt matching with `sync-health`.

- [x] **T4: Work-unit commit, native review, and closeout of B17-01**
  - Run full suite checks (`tsc --noEmit`, targeted eslint, unit specs, db spec).
  - Independent verification completed via `gentle-ai-verify` (all 68 tests green).
  - Native review preflight evaluated (assessment plan: independent verifier run; host relay hit generation length budget on 1.6k-line workspace diff).

---

## Evidence Log

- **TypeScript Typecheck:** `npx tsc --noEmit` clean (exit 0).
- **ESLint:** 0 errors, 0 warnings across all 7 touched files.
- **Unit Specs:** 65 passing tests
  - `src/modules/identity/dto/tenant-terminal.dto.spec.ts`: 2/2 PASS
  - `src/modules/identity/services/device-sync-credential.service.spec.ts`: 46/46 PASS
  - `src/modules/sales/sync-health/sync-health.service.spec.ts`: 13/13 PASS
  - `src/modules/identity/device-sync.module.spec.ts`: 1/1 PASS
- **Postgres DB RLS Isolation Spec:** 3 passing tests (6.9s)
  - `src/modules/identity/services/device-sync-credential.service.db.spec.ts`: 3/3 PASS
  - Proves Tenant A reads 0 terminals of Tenant B under restricted NOBYPASSRLS role.
  - Proves revoked terminal contract (`status=REVOKED`, `revocationReason`, `freshnessState=null`, historical sequence).
  - Proves byte-for-byte freshness match with `SyncHealthService.getFreshness`.

