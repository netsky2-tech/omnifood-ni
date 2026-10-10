# Feature: Fleet Terminal Panel — B17-01 Registry Read Model (Issue #832)

- **Branch / Worktree:** `feat/fleet-terminal-registry` @ `/home/octavio_morales/omnifood-ni-fleet-terminal` (off `main` 2b462961)
- **Authority:** Issue #832, `docs/plans/identity/batch_17_fleet_terminal_registry_and_owner_revocation.md`, DEC-17.1 (derived read model), DEC-17.2 (OWNER-only revoke), DEC-17.3 (battery dropped).
- **Commit Evidence B17-01:** `595e41b23dc43897236df3bc4bf3b256c890366f` (`feat(identity): implement tenant terminal read model (B17-01)`)
- **Commit Evidence B17-02:** `763a8e4a274dbd356c9a35d8e75db7b5c1ae55b7` (`feat(identity): implement owner device sync revocation endpoint (B17-02)`)
- **Commit Evidence B17-03:** `a4bc709405b6305a2e5842c1c6827027c9b0cf34` (`feat(dashboard): implement fleet devices read panel and live suite (B17-03)`)
- **Commit Evidence B17-04:** `4ab810ce76632c028ad7d722d5ddbf972ba20fa0` (`feat(dashboard): implement sanitized device revocation modal and permission delegation (B17-04)`)
- **Commit Evidence B17-06:** `22ac4e9858fc92c2da1c07022db2e67303c7ea51` (`docs(manual): complete section 10 fleet terminal monitoring (B17-06)`)
- **Status:** COMPLETED — B17-01, B17-02, B17-03, B17-04 & B17-06 (Issue #832 Complete)

## Batch B17-06: Manual §10 Completion & Issue #832 Closeout

- Rewrote `docs/nhilos/manuals/nhilos_owner_dashboard_manual_v0.2.md` §10:
  - Documented live `/devices` panel under `Administración > Dispositivos`.
  - Documented real-time freshness badges, sequence numbers, and credential states.
  - Documented self-service revocation with operational warnings, mandatory audit reason, and "REVOCAR" confirmation.
  - Removed battery promise per DEC-17.3.
- Updated `docs/plans/identity/batch_17_fleet_terminal_registry_and_owner_revocation.md` status.
- Reconciled stale #852 note in `odd/tasks/manual-capture-explicit-creds.md`.


## Batch B17-04: Owner Revocation Action Modal & Form Sanitization (Issue #832)

- **Authority:** Issue #832, `docs/plans/identity/batch_17_fleet_terminal_registry_and_owner_revocation.md` §4 (B17-04), User directive (permission-based delegation, non-exclusive to OWNER role), NHILoS Backoffice Experience Standard v1.0 (§18.2/§18.3, §30).
- **Goal:** Enable authorized users (OWNER and any role granted `AppPermission.DEVICE_SYNC_REVOKE`) to revoke terminals directly from the dashboard panel via a sanitized, accessible, confirmative modal dialog with Spanish feedback.

### B17-04 Tasks

- [x] **T1 (B17-04): Backend permission delegation alignment**
  - In `DeviceSyncRevocationController`: remove hardcoded `@Roles(UserRole.OWNER)` from the revoke handler so that access is governed by `PermissionsGuard` with `@RequirePermissions(AppPermission.DEVICE_SYNC_REVOKE)`.
  - Update unit specs and live specs to prove users with `DEVICE_SYNC_REVOKE` can revoke regardless of role, while users without it receive 403 Forbidden.

- [x] **T2 (B17-04): Frontend API mutation & permission helper**
  - Add `revokeDevice(credentialId, reason)` and `useRevokeDevice()` in `features/devices/`.
  - Add `canRevokeDevice(user)` and `useCanRevokeDevice()` in `features/auth/permissions.ts`.

- [x] **T3 (B17-04): Revocation Modal Dialog with Sanitized Form**
  - Implement `RevokeDeviceModal` (`features/devices/revoke-device-modal.tsx`):
    - Operational warning banner (*"Esta acción desconectará inmediatamente la terminal y bloqueará cualquier operación de cobro o sincronización"*).
    - Form with `noValidate`, React Hook Form, Zod schema (`reason` min 1, max 255; `confirmation === "REVOCAR"`).
    - Literal Spanish error messages per NHILoS §18.2/§18.3, `aria-invalid`, `aria-describedby`.
    - Loading spinner and error handling on submit.

- [x] **T4 (B17-04): Wire action into `DevicesPage`**
  - Add "Revocar" button in `DevicesTable` for terminals in `ACTIVE` or `PENDING` state, gated by `canRevokeDevice`.
  - Wire modal trigger, state management, and success toast/feedback.

- [x] **T5 (B17-04): Unit, Form Sanitization & Accessibility specs**
  - Create `revoke-device-modal.spec.tsx` testing form validation (empty rejection, length constraint, confirmation keyword, error display, submit delegation).
  - Update `devices-page.spec.tsx` to assert revoke button behavior and modal opening.

- [x] **T6 (B17-04): Full verification, work-unit commit, and closeout**
  - Run full suite, lint, and commit work unit.
  - Verified by `gentle-ai-verify`: 34 tests in backend (including real Postgres RLS integration) and 46 tests in dashboard.

---

## Evidence Log — B17-04

- **Backend:**
  - `apps/admin_backend/src/modules/identity/controllers/device-sync-revocation.controller.ts`: removed hardcoded `@Roles(OWNER)` from revoke endpoint so access is governed by `PermissionsGuard` with `@RequirePermissions(AppPermission.DEVICE_SYNC_REVOKE)`, enabling dynamic delegation.
  - `device-sync-revocation.controller.spec.ts`: 12/12 PASS (verified `ROLES_KEY` undefined on revoke, `PERMISSIONS_KEY` present and enforced).
  - `device-sync-revocation.db.spec.ts`: 5/5 PASS (real Postgres RLS, audit event, fail-closed transport).
  - `route-transport-registry.spec.ts`: 17/17 PASS.
  - `tsc --noEmit` and ESLint clean.
- **Owner Dashboard:**
  - Permission delegation: `features/auth/permissions.ts` (`DEVICE_SYNC_REVOKE`, `canRevokeDevice(user)`, `useCanRevokeDevice()`). Tested in `permissions.spec.ts` (7/7 PASS).
  - API & Mutation: `features/devices/devices-api.ts` (`revokeDevice`), `use-devices.ts` (`useRevokeDevice`). Tested in `devices-api.spec.ts` (17/17 PASS).
  - Revocation Modal: `features/devices/revoke-device-modal.tsx` and `schema.ts`:
    - Strict form sanitation with `<form noValidate ...>`, React Hook Form, Zod schema (`revokeDeviceSchema`).
    - Literal Spanish errors per NHILoS §18.2/§18.3: "El motivo de revocación es obligatorio.", 'Debe escribir exactamente "REVOCAR" para confirmar.'.
    - Destructive operational alert banner per NHILoS §30: warning that till will immediately lose syncing/billing ability.
    - DialogFooter with disabled/spinner states.
  - Wire into page: `features/devices/devices-page.tsx`:
    - Gated "Acciones" column in `DevicesTable` rendering ghost-destructive "Revocar" button on `ACTIVE`/`PENDING` terminals when `canRevoke` is true.
  - Unit & Modal specs: `revoke-device-modal.spec.tsx` (6/6 PASS), `devices-page.spec.tsx` (10/10 PASS).
  - Suite-layout guard: `suite-layout.test.ts` (6/6 PASS).
  - `tsc --noEmit` clean, `oxlint` clean.


## Batch B17-03: Dashboard Dispositivos Read Panel & E2E Integration (Issue #832)

- **Authority:** Issue #832, `docs/plans/identity/batch_17_fleet_terminal_registry_and_owner_revocation.md` §4 (B17-03), NHILoS Backoffice Experience Standard v1.0, Module Audit Template v2.1.
- **Goal:** Replace manual §10's "no existe la ruta" claim with a production-grade, accessible, and live-tested `/devices` panel in Owner Dashboard, displaying terminal identity, credential lifecycle, freshness badges, and metadata.

### B17-03 Tasks

- [x] **T1 (B17-03): Backend `GET /identity/device-sync/terminals` endpoint**
  - Add `@Get('terminals')` to `DeviceSyncRevocationController` (accessible to `OWNER` and `MANAGER`).
  - Move `@Roles(OWNER)` and `@RequirePermissions(DEVICE_SYNC_REVOKE)` to the POST revoke method.
  - Add unit tests in `device-sync-revocation.controller.spec.ts` for GET terminals.

- [x] **T2 (B17-03): Dashboard API client, types & hook (`features/devices`)**
  - Create `types.ts`, `devices-api.ts`, and `use-devices.ts` under `apps/owner_dashboard/src/features/devices/`.
  - Wire safe normalization for `TenantTerminalDto` payload.

- [x] **T3 (B17-03): Dashboard UI component & navigation (`/devices`)**
  - Build `devices-page.tsx` adhering to NHILoS v1.0 (Luxury +1: typography, badge hierarchy, empty/skeleton/error states).
  - Register route `/devices` in `router.tsx`, `sidebar.tsx` (Administración group), and `rbac.ts` (`["OWNER", "MANAGER"]`).

- [x] **T4 (B17-03): Unit & Accessibility specs (`devices-page.spec.tsx`)**
  - Test loading, populated, empty, and error states with mocked API.
  - Verify accessibility compliance (ARIA roles, table structure, contrast).

- [x] **T5 (B17-03): Real Live Integration suite (`devices.live.test.ts`)**
  - Implement `src/__tests__/devices.live.test.ts` testing live backend (:3300) auth matrix (OWNER/MANAGER 200, CASHIER 403).
  - Register in `vitest.integration.config.ts` and exclude in `vitest.config.ts`, satisfying `suite-layout.test.ts`.

- [x] **T6 (B17-03): Verification, work-unit commit, and closeout**
  - Run full tests, lint, tsc, and commit work unit.
  - Verified by `gentle-ai-verify`: 29 tests in backend (including route transport registry) and 28 tests in dashboard (including suite-layout guard).

---

## Evidence Log — B17-03

- **Backend:**
  - `apps/admin_backend/src/modules/identity/controllers/device-sync-revocation.controller.ts`: exposed `GET /identity/device-sync/terminals` for `OWNER` and `MANAGER`.
  - `device-sync-revocation.controller.spec.ts`: 12/12 PASS (role metadata, delegation, exception forwarding).
  - `route-transport-registry.spec.ts`: 17/17 PASS.
  - `tsc --noEmit` clean, ESLint clean.
- **Owner Dashboard:**
  - Feature `features/devices/`: `types.ts`, `devices-api.ts`, `devices-api.spec.ts` (14/14 PASS), `use-devices.ts`, `index.ts`.
  - Component `DevicesPage` (`devices-page.tsx`): luxury NHILoS standard v1.0, KPIs, table with credential and freshness status badges, empty/skeleton/error states.
  - Route & Navigation: `/devices` registered in `router.tsx` (lazyWithRetry, ProtectedRoute), `sidebar.tsx` under Administración (`OWNER`, `MANAGER`), and `rbac.ts`.
  - Unit & A11y tests: `src/__tests__/devices-page.spec.tsx` (8/8 PASS).
  - Live Integration spec: `src/__tests__/devices.live.test.ts` registered in `vitest.integration.config.ts` and `vitest.config.ts`.
  - Suite-layout guard: `src/__tests__/suite-layout.test.ts` (6/6 PASS).
  - `tsc --noEmit` clean, `oxlint` clean.


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

