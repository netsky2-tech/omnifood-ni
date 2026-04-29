# Design: Identity, Access, and Audit Management

## 1. Backend Design (NestJS)

### 1.1 Module Structure: `apps/admin_backend/src/modules/identity`
- `identity.module.ts`: Wire up controllers, services, and TypeORM entities.
- `controllers/auth.controller.ts`: Login, refresh token, and PIN sync endpoints.
- `controllers/user.controller.ts`: CRUD for staff management (Tenant context).
- `services/auth.service.ts`: JWT logic, password/PIN hashing (BCrypt).
- `services/user.service.ts`: User persistence logic.
- `entities/user.entity.ts`: TypeORM user entity.
- `guards/roles.guard.ts`: Custom decorator and guard for RBAC.

### 1.2 Multi-tenancy (RLS)
- `src/core/database/rls.interceptor.ts`: Interceptor to set the `tenant_id` in the database session before executing queries.
- `src/core/decorators/tenant.decorator.ts`: Extract `tenant_id` from the JWT payload.

---

## 2. Frontend Design (Flutter)

### 2.1 Domain Layer: `apps/pos_app/lib/domain`
- `models/user.dart`: Freezed class for the User entity.
- `models/audit_log.dart`: Freezed class for Audit entries.
- `repositories/auth_repository.dart`: Interface for login and session management.
- `repositories/audit_repository.dart`: Interface for logging and syncing.

### 2.2 Data Layer: `apps/pos_app/lib/data`
- `daos/user_dao.dart`: Floor DAO for local staff storage.
- `daos/audit_dao.dart`: Floor DAO for local audit logs.
- `repositories/auth_repository_impl.dart`: implementation using local DB and Remote API.
- `services/local_auth_service.dart`: Encapsulates PIN validation logic (BCrypt).

### 2.3 Presentation Layer: `apps/pos_app/lib/presentation`
- `features/auth/viewmodels/login_viewmodel.dart`: State management for cloud login.
- `features/auth/viewmodels/lock_screen_viewmodel.dart`: State management for PIN entry and user switching.
- `features/auth/views/login_view.dart`: Cloud login screen.
- `features/auth/views/lock_screen_view.dart`: Fast user switcher (PIN screen).

---

## 3. Data Flow

### 3.1 Initial Login
1. `LoginView` calls `LoginViewModel.login(email, password)`.
2. `AuthRepository` sends request to NestJS.
3. NestJS returns JWT + User Profile.
4. `AuthRepository` fetches full Staff List (hashes included) and saves to `UserDao`.

### 3.2 Daily PIN Access
1. `LockScreenView` displays list of active users from `UserDao`.
2. User enters PIN.
3. `LocalAuthService` validates PIN against hash in `UserDao`.
4. If valid, `AuthRepository` sets the global `current_user`.

### 3.3 Audit Logging
1. Business logic (e.g., `SaleService`) calls `AuditRepository.log(action, metadata)`.
2. `AuditRepository` saves to `AuditDao`.
3. Background task (SyncWorker) periodically pushes unsynced logs to NestJS.

---

## 4. Security Considerations
- **PIN Privacy**: Mask PIN input in the UI.
- **Hash Strength**: Use BCrypt with a cost factor of 10.
- **Token Storage**: Use `flutter_secure_storage` for the JWT.
- **RLS**: Ensure ALL backend controllers use the `RolesGuard` and `TenantInterceptor`.
