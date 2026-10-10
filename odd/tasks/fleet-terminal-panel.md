# Feature: Fleet Terminal Panel — B17-01 Registry Read Model (Issue #832)

- **Branch / Worktree:** `feat/fleet-terminal-registry` @ `/home/octavio_morales/omnifood-ni-fleet-terminal` (off `main` 2b462961)
- **Authority:** Issue #832, `docs/plans/identity/batch_17_fleet_terminal_registry_and_owner_revocation.md`, DEC-17.1 (derived read model), DEC-17.2 (OWNER-only revoke), DEC-17.3 (battery dropped).
- **Commit Evidence:** `595e41b23dc43897236df3bc4bf3b256c890366f` (`feat(identity): implement tenant terminal read model (B17-01)`)
- **Status:** COMPLETED — B17-01 | IN PROGRESS — B17-02

## Batch B17-02: Owner-facing Revocation Endpoint, Permission, and Audit Trail (Issue #832)

- **Authority:** Issue #832, `docs/plans/identity/batch_17_fleet_terminal_registry_and_owner_revocation.md` §4 (B17-02), DEC-17.2 (OWNER-only), DEC-17.5 (audit trail, non-destructive state transition).
- **Goal:** Expose `POST /identity/device-sync/credentials/:id/revoke` with mandatory reason, guarded by `AuthGuard`, `RolesGuard`, `PermissionsGuard` (OWNER-only), enforcing PostgreSQL RLS and duplicate rejection.

### B17-02 Tasks

- [x] **T1 (B17-02): Permission & Service hardening**
  - Add `AppPermission.DEVICE_SYNC_REVOKE = 'device_sync:revoke'` in `permissions.enum.ts` (granted ONLY to `UserRole.OWNER`).
  - Update `DeviceSyncCredentialService.revokeCredential`:
    - Reject empty/whitespace reason with `BadRequestException`.
    - Reject already-revoked credential with `ConflictException('Credential is already revoked')`.
  - Add unit tests in `device-sync-credential.service.spec.ts`.

- [x] **T2 (B17-02): Human Revocation Controller & DTO**
  - Create `RevokeDeviceCredentialDto` with `@IsString()`, `@IsNotEmpty()`, min/max constraints.
  - Create `DeviceSyncRevocationController` at `@Controller('identity/device-sync')`:
    - Route: `@Post('credentials/:id/revoke')`.
    - Guards: `AuthGuard, AuthoritativeCurrentUserGuard, RolesGuard, PermissionsGuard`, `TenantInterceptor`.
    - Roles & Permissions: `@Roles(UserRole.OWNER)`, `@RequirePermissions(AppPermission.DEVICE_SYNC_REVOKE)`.
  - Register in `IdentityModule` (or `DeviceSyncModule`) and classify as `human` in `route-transport-registry.ts`.

- [x] **T3 (B17-02): Unit tests & Route Transport Registry verification**
  - Create `device-sync-revocation.controller.spec.ts`: test OWNER success, MANAGER forbidden (403), CASHIER forbidden (403), unauthenticated (401), missing reason (400), not found (404), already revoked (409).
  - Verify `route-transport-registry.spec.ts` passes with the new controller registered.

- [x] **T4 (B17-02): DB-backed RLS & SyncTransportGuard fail-closed integration spec**
  - Create `device-sync-revocation.db.spec.ts` against real migrated schema with restricted role.
  - Prove:
    - OWNER revoking a credential flips row to `REVOKED` and writes `DeviceSyncCredentialEvent` of type `REVOKED` with reason.
    - Tenant isolation: Tenant A cannot revoke Tenant B's credential (404 / invisible).
    - Second revoke throws `ConflictException`.
    - `SyncTransportGuard` fails closed with `UnauthorizedException` for subsequent POS push/pull requests.

- [x] **T5 (B17-02): Verification, work-unit commit, and closeout**
  - Run full suite checks (`test`, `test:db`, targeted eslint, tsc).
  - Independent verification via `gentle-ai-verify` PASS (102 unit tests, 8 real-DB tests, 0 lint findings, tsc clean).

---

## Evidence Log — B17-02

- **TypeScript Typecheck:** `npx tsc --noEmit` clean (exit 0).
- **ESLint:** 0 errors, 0 warnings across all 12 files touched in B17-02.
- **Unit Specs:** 102 passing tests across 6 suites:
  - `permissions.enum.spec.ts`: 11/11 PASS (includes OWNER-only `AppPermission.DEVICE_SYNC_REVOKE`).
  - `device-sync-credential.service.spec.ts`: 52/52 PASS (includes reason validation, REVOKED duplicate rejection, RETIRED rejection).
  - `revoke-device-credential.dto.spec.ts`: 6/6 PASS (includes class-validator constraints and 255-char boundary).
  - `device-sync-revocation.controller.spec.ts`: 9/9 PASS (metadata: `@Roles(OWNER)`, `@RequirePermissions(DEVICE_SYNC_REVOKE)`, interceptors, guards, and exception forwarding).
  - `identity.module.spec.ts`: 7/7 PASS (reconciliation of repository tokens and JWT providers).
  - `route-transport-registry.spec.ts`: 17/17 PASS (classification of `DeviceSyncRevocationController` as human transport).
- **Postgres DB RLS Isolation & Guard Fail-Closed Specs:** 8 passing tests in `test:db`:
  - `device-sync-credential.service.db.spec.ts`: 3/3 PASS (RLS isolation, sync-health cross-check).
  - `device-sync-revocation.db.spec.ts`: 5/5 PASS:
    1. Real revocation: updates row to `REVOKED` and writes exactly 1 event to `device_sync_credential_events` with reason.
    2. Cross-tenant isolation: Tenant A cannot revoke Tenant B's credential (`NotFoundException` via RLS).
    3. Duplicate revocation: second attempt rejects with `ConflictException('Credential is already revoked')` without overwriting reason/date.
    4. POS fail-closed: `SyncTransportGuard` fails closed with `UnauthorizedException` for revoked credential tokens under real RLS, while active credential tokens pass.


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

