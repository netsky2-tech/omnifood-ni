# Tasks: Identity, Access, and Audit Management

## Phase 1: Backend Infrastructure (NestJS)
- [x] Create `Identity` module scaffold in `apps/admin_backend`.
- [x] Implement `User` and `AuditLog` entities with TypeORM.
- [x] Implement `TenantInterceptor` for PostgreSQL RLS.
- [x] Implement `AuthService` with JWT and BCrypt (Password/PIN).
- [x] Create `AuthController` (Login, Sync Staff endpoints).
- [x] Create `AuditController` (Push logs endpoint).
- [x] Add `RolesGuard` for RBAC protection.

## Phase 2: POS Domain & Data (Flutter)
- [x] Define `User` and `AuditLog` models with Freezed.
- [x] Create `UserDao` and `AuditDao` using Floor.
- [x] Update `AppDatabase` to include new tables.
- [x] Implement `AuthRepository` (Cloud Login + Local Sync).
- [x] Implement `AuditRepository` (Local logging + Background sync).
- [x] Implement `LocalAuthService` for PIN validation.

## Phase 3: POS UI & Presentation (Flutter)
- [x] Implement `LoginViewModel` and `LoginView` (Cloud login).
- [x] Implement `LockScreenViewModel` and `LockScreenView` (User switcher + PIN entry).
- [x] Create PIN input custom widget (masked).
- [x] Integrate session management in the main app flow.

## Phase 4: Integration & Audit Trail
- [x] Hook sensitive actions (Sales, Voids) into the `AuditRepository`.
- [x] Implement the background Sync Worker for audit logs.
- [x] Verify RLS isolation between different tenants.
- [x] Verify offline PIN login capability.

## Phase 5: Testing & DGI Compliance
- [x] Write unit tests for `LocalAuthService` (BCrypt).
- [x] Write e2e tests for Backend Auth and RLS.
- [x] Perform a "no-internet" simulation test for sales and audit logging.
