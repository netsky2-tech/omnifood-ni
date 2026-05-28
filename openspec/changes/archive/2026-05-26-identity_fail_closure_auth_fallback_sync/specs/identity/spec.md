# Delta for Identity

## Out of Scope

- Migrating local POS PIN hashing from bcrypt to Argon2/PBKDF2.
- Implementing tamper-resistant auditing logic.
- Adding full offline RBAC overrides (manager PIN overrides).

## MODIFIED Requirements

### Requirement: 1.1 Authentication

The system MUST support online authentication against the cloud backend using email and password.
The system MUST support offline authentication to unlock the POS using a 4-6 digit PIN validated against local SQLite.
The system MUST sync PIN hashes (BCrypt) from the cloud to the local POS database during the first login or manual sync.
The system MUST automatically fall back to local offline authentication (using email/username) if the cloud backend is unreachable or returns generic errors during online login.
(Previously: Online and offline auth were separate flows without automatic fallback.)

#### Scenario: Successful online authentication
- GIVEN the POS has an active network connection
- WHEN a user enters valid email and password
- THEN the system MUST authenticate against the cloud backend
- AND grant access to the POS.

#### Scenario: Fallback to offline authentication on network failure
- GIVEN the backend is unreachable or returns a generic network error
- WHEN a user attempts online login with a previously synced email/username
- THEN the POS MUST automatically catch the failure
- AND attempt local verification against the offline SQLite store
- AND mark the local session state as `isPendingSync`
- AND grant access to the POS if verification succeeds.

#### Scenario: Fallback fails due to unknown user
- GIVEN the backend is unreachable
- WHEN a user attempts online login with an email/username not present in the local SQLite store
- THEN the POS MUST deny access
- AND show an appropriate offline login failure message.

### Requirement: 3.2 Sync Staff (POS to Cloud)

**Endpoint**: `GET /identity/staff`
**Headers**: `Authorization: Bearer <JWT>`, `x-offline-sync-scope` (optional)

The backend MUST return a list of staff members with their roles and PIN hashes.
The backend MUST include continuity metadata (e.g., snapshot timestamp/version) in the response when requested via the `x-offline-sync-scope=pos-auth-continuity` header.
(Previously: The endpoint returned an array of staff members without continuity metadata.)

#### Scenario: POS requests staff sync with continuity metadata
- GIVEN the POS sends a `GET /identity/staff` request
- AND includes the header `x-offline-sync-scope=pos-auth-continuity`
- WHEN the backend processes the request
- THEN the response MUST include the staff data
- AND the response MUST include a continuity metadata object containing the snapshot timestamp.

#### Scenario: Standard POS requests staff sync
- GIVEN the POS sends a `GET /identity/staff` request without continuity headers
- WHEN the backend processes the request
- THEN the response MUST include the staff data
- AND the response MAY omit the continuity metadata object.
