# Delta for inventory-sync-topologies

## ADDED Requirements

### Requirement: Authenticated Idempotent Sale Replay
Cloud sale synchronization MUST retry the original request at most once after a successful serialized credential refresh, preserve SQLite as local source of truth, and process duplicate deliveries idempotently without duplicate invoices or movements.

#### Scenario: Duplicate replay
- GIVEN an invoice was already accepted and its inventory outcome recorded, including `APPLIED_INVENTORY_PENDING` or `APPLIED_NO_INVENTORY_IMPACT`
- WHEN the same invoice is replayed with the same stable idempotency key
- THEN the backend MUST return the original outcome and recorded reason
- AND MUST create neither a duplicate invoice nor additional inventory movements.

#### Scenario: Access expiry with valid refresh
- GIVEN a locally pending invoice and an expired access token
- WHEN synchronization receives HTTP 401 and refresh succeeds
- THEN the client MUST retry the original cloud request once
- AND the backend MUST accept the same invoice identity and outcome.

### Requirement: Tenant-Isolated Sync Outcomes
Sync responses and audit records MUST preserve tenant isolation and MUST explicitly expose authentication-required and inventory outcomes without generic error masking.

#### Scenario: Failed refresh leaves pending invoice
- GIVEN refresh is absent, expired, or revoked
- WHEN a pending invoice is synchronized
- THEN it MUST remain pending in SQLite
- AND the response/state MUST expose `cloudReauthenticationRequired`
- AND no cross-tenant data or generic `Sales;Catálogo` error MUST be returned.

#### Scenario: Inventory-pending outcome is preserved
- GIVEN a prepared or compound sale was finalized without a published recipe
- WHEN it is synchronized or replayed
- THEN the result MUST remain `APPLIED_INVENTORY_PENDING` with its explicit missing-recipe reason
- AND synchronization MUST create zero guessed or partial inventory movements.

#### Scenario: Physical Q80 acceptance
- GIVEN the Q80 POS is restarted, unlocked offline by PIN, and reconnects with an expired access token and valid refresh token
- WHEN invoice `001-001-01-00000001` is synchronized
- THEN automatic refresh and one retry MUST succeed
- AND exactly that DGI invoice MUST be accepted/applied once
- AND its inventory outcome MUST be auditable.
