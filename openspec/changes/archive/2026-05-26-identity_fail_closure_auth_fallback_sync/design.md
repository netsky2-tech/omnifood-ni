# SDD Design: Identity fail closure — auth fallback + sync-pending contract

## Technical Approach
Implement automatic offline authentication fallback in the POS application when online login fails due to network issues. The fallback uses local SQLite data via Floor, matching the provided email and verifying the password against the synced PIN hash (treating the offline login password as a PIN for legacy compatibility). Introduce an `isPendingSync` state to the `AuthRepository` to reflect the degraded session context. Update the NestJS backend to embed continuity metadata (snapshot timestamp) when specifically requested via the `x-offline-sync-scope` header, ensuring backward compatibility.

## Architecture Decisions

| Decision | Options Considered | Tradeoffs | Selected Option |
| :--- | :--- | :--- | :--- |
| **Fallback Verification Method** | 1. Hash `password` using bcrypt and match `pinHash`. <br> 2. Add `passwordHash` to sync (violates security). | Option 1 assumes the user types their PIN in the password field or their password matches the PIN hash. Option 2 exposes passwords. | **Option 1**: Reuse `verifyPin(password, pinHash)` during fallback to avoid syncing passwords offline. |
| **Backend Response Contract** | 1. Always return `{staff, metadata}`. <br> 2. Return `{staff, metadata}` only when header is present. | Option 1 breaks older POS versions expecting a raw JSON array. Option 2 requires conditional logic. | **Option 2**: Conditional response wrapper to maintain backward compatibility with deployed POS terminals. |
| **Pending Sync State** | 1. Persist `isPendingSync` in SQLite. <br> 2. In-memory flag in `AuthRepositoryImpl`. | Option 1 survives app restarts but requires DB migrations. Option 2 is simpler but resets on restart. | **Option 2**: In-memory flag. Offline logins will reset the flag to `true` upon restart anyway since network is down. |

## Data Flow / Sequence

1. **Online Login Attempt**: User enters email/password. `LoginViewModel` calls `loginOnline`.
2. **Network Failure**: Dio throws a connection error (timeout/network error, or 500s). `AuthRepositoryImpl` catches it.
3. **Fallback Triggered**: `AuthRepositoryImpl` queries `UserDao.findUserByEmail(email)`.
4. **Local Verification**: If user exists, fetch `SecurityProfileEntity`. Verify the input password against `pinHash` using `_localAuth.verifyPin`.
5. **Session State Update**: If valid, set `_isPendingSync = true` and `_currentUser = user`. Return user.
6. **Backend Sync Request (Background)**: When online, POS sends `GET /identity/staff` with `x-offline-sync-scope=pos-auth-continuity`.
7. **Backend Response**: NestJS returns `{ "staff": [...], "metadata": { "snapshot_timestamp": "..." } }`. POS updates local SQLite.

## Interfaces & Contracts

### Flutter POS (`AuthRepository`)
```dart
abstract class AuthRepository {
  // Existing methods...
  bool get isPendingSync;
  DateTime? get lastSyncTimestamp;
}
```

### Flutter POS (`UserDao`)
```dart
@Query('SELECT * FROM users WHERE email = :email LIMIT 1')
Future<UserEntity?> findUserByEmail(String email);
```

### NestJS Backend (`GET /identity/staff`)
**Request Header**: `x-offline-sync-scope: pos-auth-continuity`
**Response Payload**:
```json
{
  "staff": [ { "id": "...", "name": "...", "role": "..." } ],
  "metadata": { "snapshot_timestamp": "2026-05-26T12:00:00Z" }
}
```

## Error Handling
- **Generic Credentials**: During offline fallback, if `findUserByEmail` returns null or `verifyPin` fails, throw/return a generic error: `"Error de autenticación. Verifique sus credenciales o conexión."` Do not leak whether the email exists locally to prevent user enumeration.
- **Dio Errors**: Fallback occurs ONLY on network/timeout errors or 5xx server errors. 401/403 errors MUST NOT trigger fallback (as the backend explicitly rejected the credentials).

## Testing Strategy
- **Flutter POS**: 
  - Mock `Dio` to throw `DioExceptionType.connectionTimeout`.
  - Assert `loginOnline` successfully falls back to `findUserByEmail` and `verifyPin`.
  - Assert `isPendingSync` is set to `true`.
  - Assert generic error message is returned for invalid credentials during fallback.
- **NestJS Backend**:
  - Unit test `AuthService.getStaffForSync` to verify wrapping behavior: array is returned without header; object with `metadata` is returned with header.

## Reconciliation Rule
When `isPendingSync` is true, the POS operates in a degraded mode. Once network connectivity is restored, subsequent API calls (or background syncs handled by other modules) will negotiate fresh tokens. This PR only establishes the local state marker.

## Migration / Rollout
- **Database**: No SQLite migrations required for POS (using in-memory state and existing `UserEntity`).
- **Backend API**: 100% backward compatible. Older POS clients missing the `x-offline-sync-scope` header will continue receiving the flat JSON array.

## Explicit Non-Goals
- Migrating local POS PIN hashing from bcrypt to Argon2/PBKDF2.
- Implementing tamper-resistant auditing logic.
- Building the active background sync worker (we only provide the state marker here).
- Complex offline RBAC manager overrides.

## Change-Size Estimate & Review Budget Plan
- **Estimated Size**: ~250 lines (well under the 400-line budget).
  - Flutter POS (`AuthRepositoryImpl`, `UserDao`, `LoginViewModel`): ~80 lines.
  - NestJS Backend (`auth.service.ts`): ~30 lines.
  - Tests (Flutter + NestJS): ~140 lines.
- **Budget Strategy**: Keep changes strictly to the fallback path and API wrapper. Avoid refactoring existing `syncStaff` parsing beyond the simple type check needed for the new wrapper.
