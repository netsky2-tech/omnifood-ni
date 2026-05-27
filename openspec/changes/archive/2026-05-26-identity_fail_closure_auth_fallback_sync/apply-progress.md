# Apply Progress: identity_fail_closure_auth_fallback_sync

## Mode
Strict TDD

## Completed Tasks
- [x] 1.1 Extracted `x-offline-sync-scope` in auth controller path used by `GET /identity/staff`.
- [x] 1.2 Implemented conditional `{ staff, metadata }` response contract for `pos-auth-continuity` scope.
- [x] 1.3 Added backend unit tests for continuity wrapper vs standard array response.
- [x] 2.1 Added `findUserByEmail` query in `UserDao`.
- [x] 2.2 Added `isPendingSync` and `lastSyncTimestamp` repository contract getters.
- [x] 3.1 Added in-memory `_isPendingSync` and `_lastSyncTimestamp` in `AuthRepositoryImpl`.
- [x] 3.2 Implemented online→offline fallback for network/5xx errors, with 401/403 bypass and local PIN verification.
- [x] 3.3 Added focused POS repository tests for fallback success, fallback rejection on 401, invalid local credentials, and metadata reconciliation.
- [x] 4.1 Updated login error to a generic offline-safe message.
- [x] 4.2 Added LoginViewModel unit tests for generic error and successful path.

## TDD Cycle Evidence
| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.2-1.3 | `apps/admin_backend/src/modules/identity/services/auth.service.spec.ts` | Unit | ✅ 11/11 passing baseline | ✅ Added wrapper/array tests first | ✅ 13/13 passing | ✅ Wrapper + non-wrapper behavior | ✅ Typed `StaffSyncItem` and explicit return branches |
| 3.2-3.3 | `apps/pos_app/test/data/repositories/auth_repository_security_profile_sync_test.dart` | Unit | ⚠️ Baseline not re-run in this continuation batch | ✅ Added failing coverage-first cases for 5xx/403/unknown-user/username before implementation | ✅ 24/24 passing | ✅ timeout + 5xx allow-fallback, 401/403 deny-fallback, unknown-user failure, username match, invalid local creds | ✅ Added identifier resolver helper without schema migration |
| 4.1-4.2 | `apps/pos_app/test/ui/features/auth/viewmodels/login_viewmodel_test.dart` | Unit | N/A (new file) | ✅ Added UI state tests first | ✅ 2/2 passing | ✅ failure + success paths | ➖ None needed |

## Test Summary
- Total tests written: 12
- Total tests passing (targeted suites): 37/37 (13 backend + 24 POS repository)
- Layers used: Unit (35), Integration (0), E2E (0)
- Approval tests: None — behavior extension tasks
- Pure functions created: 0

## Notes
- Scope stayed within fallback + continuity contract only.
- No plaintext credentials or PIN storage introduced.
- Offline errors remain generic (no user existence leakage).
- Added email/username fallback continuity by resolving local user from direct email first, then username-part match from local synced emails.
- Fixed lint errors in `auth.service.spec.ts` relevant to this verify slice (`@typescript-eslint/no-unsafe-member-access`, `no-unsafe-assignment`, Prettier).
