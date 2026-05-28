# Specification: Identity, Access, and Audit Management

## 1. Functional Requirements

### 1.1 Authentication
The system MUST support online authentication against the cloud backend using email and password.
The system MUST support offline authentication to unlock the POS using a 4-6 digit PIN validated against local SQLite.
The system MUST sync PIN hashes (BCrypt) from the cloud to the local POS database during the first login or manual sync.
The system MUST automatically fall back to local offline authentication (using email/username) if the cloud backend is unreachable or returns generic errors during online login.

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

### 1.2 Authorization (RBAC)
- **Roles**:
  - `OWNER`: Full access to all business data, settings, and staff management.
  - `MANAGER`: Can authorize overrides (anulaciones, discounts), manage shifts, and view daily reports.
  - `CASHIER`: Can perform sales, take payments, and perform cash counts (arqueos).
  - `WAITER`: Can take orders and send them to the kitchen. Limited to their own tables.
- **Permissions**: Every sensitive action (e.g., `VOID_INVOICE`) must check if the current user has the required permission or request a Manager PIN override.

### 1.3 Audit Trail
- **Inalterability**: Logs must be append-only. No deletion or modification allowed.
- **DGI Compliance**: Every invoice creation or cancellation must be logged with the User ID and Timestamp.
- The system MUST keep `audit_logs` append-only for all tenants.
- The system MUST reject any direct `UPDATE` or `DELETE` attempt on `audit_logs` at database level.
- The system MUST run an automated nightly continuity check for active audit streams scoped by `(tenant_id, device_id, user_id)`.
- The continuity check MUST evaluate only rows where `forensic_status='ACTIVE'`.
- The continuity check MUST detect missing `sequence_no` values and produce tenant-scoped alert evidence without cross-tenant leakage.
- The system SHOULD avoid duplicate alerts when no new gaps are detected for the same tenant stream.

#### Scenario: DB rejects mutation on audit logs
- GIVEN an existing `audit_logs` row for tenant `T1`
- WHEN any actor executes `UPDATE` or `DELETE` against that row
- THEN the database MUST reject the operation with an immutability error
- AND the original row MUST remain unchanged.

#### Scenario: Nightly check finds tenant-scoped gap on active rows
- GIVEN tenant `T1` has an active stream with sequence `10,11,13` and tenant `T2` has a complete active stream
- WHEN the nightly continuity check runs
- THEN the system MUST emit alert evidence for `T1` gap `12`
- AND the run output MUST NOT include `T2` internal stream details.

#### Scenario: Nightly check ignores non-active forensic rows
- GIVEN a stream where missing numbers exist only across rows marked non-`ACTIVE`
- WHEN the nightly continuity check runs
- THEN the system MUST ignore those rows for gap detection
- AND MUST NOT create a gap alert from non-active-only discontinuities.

#### Scenario: No new gaps does not create duplicate noise
- GIVEN a previous alert exists for tenant `T1` stream gap and no new gap appears
- WHEN the next nightly continuity check runs
- THEN the system SHOULD avoid generating duplicate alert evidence for the same unchanged gap.

## 2. Database Schema

### 2.1 Cloud (PostgreSQL)
```sql
CREATE TYPE user_role AS ENUM ('OWNER', 'MANAGER', 'CASHIER', 'WAITER');

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    name TEXT NOT NULL,
    email TEXT UNIQUE,
    password_hash TEXT, -- For online login
    pin_hash TEXT NOT NULL, -- BCrypt, for offline login
    role user_role NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE audit_logs (
    id BIGSERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    user_id UUID NOT NULL REFERENCES users(id),
    action TEXT NOT NULL, -- e.g., 'INVOICE_CREATED', 'INVOICE_VOIDED'
    target_type TEXT,     -- e.g., 'invoice', 'stock_item'
    target_id TEXT,       -- ID of the affected entity
    device_id TEXT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
    metadata JSONB        -- Additional context
);
-- RLS Policy: ALL queries MUST filter by tenant_id
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
```

### 2.2 Local (SQLite - Floor/Drift)
```sql
CREATE TABLE users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    pin_hash TEXT NOT NULL,
    is_active INTEGER DEFAULT 1
);

CREATE TABLE audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    action TEXT NOT NULL,
    timestamp TEXT NOT NULL, -- ISO8601
    device_id TEXT NOT NULL,
    metadata TEXT,           -- JSON string
    is_synced INTEGER DEFAULT 0
);
```

## 3. API Contracts

### 3.1 Login (Online)
- **Endpoint**: `POST /identity/login`
- **Request**: `{ "email": "...", "password": "..." }`
- **Response**: `{ "token": "JWT", "user": { "id": "...", "name": "...", "role": "...", "tenant_id": "..." } }`

### 3.2 Sync Staff (POS to Cloud)

**Endpoint**: `GET /identity/staff`
**Headers**: `Authorization: Bearer <JWT>`, `x-offline-sync-scope` (optional)

The backend MUST return a list of staff members with their roles and PIN hashes.
The backend MUST include continuity metadata (e.g., snapshot timestamp/version) in the response when requested via the `x-offline-sync-scope=pos-auth-continuity` header.

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

### 3.3 Push Audit Logs
- **Endpoint**: `POST /identity/audit`
- **Request**: `[ { "user_id": "...", "action": "...", "timestamp": "...", "metadata": "..." }, ... ]`
- **Response**: `{ "status": "success", "synced_ids": [...] }`

## 4. UI Flow (POS)
1. **First Run**: Request Cloud Login.
2. **Setup**: Download staff list and PIN hashes.
3. **Lock Screen**: Show user list. User selects name and enters PIN.
4. **Validation**: Check PIN locally with `bcrypt.checkpw()`.
5. **Session**: User is set as `CurrentUser` globally.
