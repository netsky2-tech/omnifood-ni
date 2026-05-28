# Proposal: Identity fail closure — auth fallback + sync-pending contract

## Intent

Resolve S-AUTH-02 (automatic online->offline fallback in POS login) and move S-AUTH-05 to PASS by establishing an explicit "permissions pending sync" contract. This ensures high availability for cashiers and waiters during network outages without silently masking identity state or over-exposing privileges.

## Scope

### In Scope
- Automatic fallback from online login to offline local auth in POS ViewModel/Repository if network fails or returns generic errors.
- Support offline POS login matching by unique identifier (email/username) instead of strictly by user ID.
- Define a minimal explicit "permissions pending sync" state marker in POS for offline sessions.
- Extend backend staff sync endpoint (`x-offline-sync-scope=pos-auth-continuity`) to include continuity metadata (e.g., snapshot timestamp/version).
- Targeted unit tests for the fallback flow and metadata contract.

### Out of Scope
- Migrating local POS PIN hashing from bcrypt to Argon2/PBKDF2 (S-SEC-02).
- Implementing tamper-resistant auditing logic.
- Adding full offline RBAC overrides (manager PIN overrides).

## Capabilities

### New Capabilities
None

### Modified Capabilities
- `identity`: 
  - Add offline fallback requirement for `1.1 Authentication (Online Auth)` when backend is unreachable.
  - Extend `3.2 Sync Staff` API contract to include continuity metadata (snapshot timestamp).

## Approach

Implement the fallback path vertically but narrowly (Option 2 from exploration):
1. **POS UI/Domain**: Update `login_viewmodel.dart` and `auth_repository.dart` to catch online login failures and automatically attempt local verification using the provided credentials against the offline SQLite store.
2. **POS Data**: Update `user_dao.dart` to support querying offline users by email/username. Add a `isPendingSync` or `lastSyncTimestamp` flag to the local session state.
3. **Admin Backend**: Modify `auth.service.ts` to attach minimal continuity metadata (snapshot version/timestamp) when responding to the staff sync endpoint, ensuring the POS knows how fresh the local permissions are.
4. **Testing**: Add focused tests for fallback orchestration and generic failure semantics, keeping the PR within the 400-line budget.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/pos_app/lib/ui/features/auth/viewmodels/login_viewmodel.dart` | Modified | Add online→offline fallback orchestration. |
| `apps/pos_app/lib/domain/repositories/auth_repository.dart` | Modified | Add fallback-friendly contract and sync-state exposure. |
| `apps/pos_app/lib/data/repositories/auth_repository_impl.dart` | Modified | Implement deterministic fallback path + local permission snapshot state marker. |
| `apps/pos_app/lib/data/daos/user_dao.dart` | Modified | Support offline login lookup by email/identifier. |
| `apps/admin_backend/src/modules/identity/services/auth.service.ts` | Modified | Include continuity metadata in staff sync payload. |
| `apps/pos_app/test/` | Modified | New/updated tests for fallback behavior and metadata contract. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| False negatives during offline identity matching | Medium | Ensure local `user_dao` queries gracefully handle case-insensitive email/username matching. |
| Exposure of sensitive profile details | Low | Enforce strict boundaries in backend `auth.service.ts` so continuity metadata only includes timestamp/version, not extra payload data. |
| Exceeding review budget (400 LOC) | Medium | Strictly defer Argon2 migration and anti-tampering logic to follow-up PRs. |

## Rollback Plan

- Revert the PR. 
- The backend metadata addition is non-breaking for older POS versions (they will ignore the extra field).
- POS offline fallback removal will restore the existing "online-only" login behavior.

## Dependencies

- None.

## Success Criteria

- [ ] POS automatically logs in offline when network is disconnected or times out, using cached credentials.
- [ ] POS UI exposes the "pending sync" status or timestamp of the local session.
- [ ] Staff sync API response includes snapshot continuity metadata.
- [ ] The entire PR (including tests) is under 400 lines of code.
