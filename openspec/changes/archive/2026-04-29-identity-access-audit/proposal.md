# Proposal: Identity, Access, and Audit Management

## 1. Overview
Implement a hybrid authentication and authorization system that supports online login (JWT) and offline PIN access, along with a DGI-compliant audit trail.

## 2. Technical Approach

### 2.1 Backend (NestJS + PostgreSQL RLS)
- **Identity Module**: Handle user registration, login, and profile management.
- **RBAC**: Implement Role-Based Access Control (Owner, Manager, Cashier, Waiter).
- **RLS Integration**: Ensure all queries are automatically scoped by `tenant_id` using PostgreSQL Row Level Security.
- **PIN Hashing**: Store PINs using BCrypt. PINs are synced to the POS app in a hashed format.

### 2.2 Frontend (Flutter + SQLite)
- **Hybrid Auth Flow**:
  1. **Online**: First login via email/password. Downloads user profile + PIN hashes.
  2. **Offline**: Daily/Quick access via PIN. Validated against local SQLite hashes.
- **Multi-Session Support**: Allow rapid switching between users (e.g., waiter taking orders, cashier billing) without losing the main device session.
- **Audit Trail (SQLite)**: Implement an immutable table `audit_logs` that records every sensitive action (anulaciones, sales, adjustments).

### 2.3 Audit Strategy (DGI Compliance)
- **Immutable Logs**: No `UPDATE` or `DELETE` on audit tables.
- **Payload**: `user_id`, `timestamp`, `action`, `device_id`, `metadata`.
- **Sync**: Local audit logs are pushed to the cloud whenever internet is available.

## 3. Impact
- **Security**: Strict isolation between tenants and roles.
- **Resilience**: Operates 100% offline once the first sync is done.
- **Compliance**: Ready for DGI audits in Nicaragua.

## 4. Alternative Approaches Considered
- **OAuth 2.0 Identity Server**: Too complex for Phase 1. We'll stick to NestJS internal JWT for now.
- **Cloud-only PIN validation**: Rejected due to "Offline-First" principle.

## 5. Next Steps
Move to the **Spec** phase to define the database schemas and API contracts.
