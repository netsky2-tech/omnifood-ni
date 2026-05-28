# Tasks: Identity fail closure — auth fallback + sync-pending contract

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~250 lines |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | ask-always |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Full Feature | PR 1 | Low risk, fits in a single PR safely under budget. Includes backend and POS changes. |

## Phase 1: Backend API Contract
- [x] 1.1 Update `apps/admin_backend/src/modules/identity/controllers/auth.controller.ts` to extract the `x-offline-sync-scope` header.
- [x] 1.2 Update `apps/admin_backend/src/modules/identity/services/auth.service.ts` to conditionally return `{ staff, metadata }` if the header is `pos-auth-continuity`.
- [x] 1.3 Add tests in `apps/admin_backend/src/modules/identity/services/auth.service.spec.ts` for the conditional sync metadata wrapper behavior.

## Phase 2: POS Foundation (Data & Domain)
- [x] 2.1 Add `@Query('SELECT * FROM users WHERE email = :email LIMIT 1')` `findUserByEmail` to `apps/pos_app/lib/data/daos/user_dao.dart`.
- [x] 2.2 Add `isPendingSync` and `lastSyncTimestamp` getters to `apps/pos_app/lib/domain/repositories/auth_repository.dart`.

## Phase 3: POS Core Implementation (Repository Fallback)
- [x] 3.1 Add in-memory `_isPendingSync` and `_lastSyncTimestamp` state variables to `apps/pos_app/lib/data/repositories/auth_repository_impl.dart`.
- [x] 3.2 Update `loginOnline` in `AuthRepositoryImpl` to catch network errors, fallback to `findUserByEmail`, verify PIN via `_localAuth`, and set the `isPendingSync` flag.
- [x] 3.3 Add unit tests in `apps/pos_app/test/data/repositories/auth_repository_impl_test.dart` for fallback success, 401 bypass, and invalid offline credentials.

## Phase 4: POS UI Wiring & Testing
- [x] 4.1 Update `apps/pos_app/lib/ui/features/auth/viewmodels/login_viewmodel.dart` to handle generic offline auth errors without exposing user existence.
- [x] 4.2 Write unit tests in `apps/pos_app/test/ui/features/auth/viewmodels/login_viewmodel_test.dart` verifying the fallback UI state handling.
