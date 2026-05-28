# Proposal: Gestión de Identidad, Acceso y Auditoría

## Intent

Implement robust local RBAC, remote offline authorization via TOTP, strict centralized/decentralized cash flow models, and forensic audit logging to meet DGI compliance and offline-first mandates.

## Scope

### In Scope
- Isolate security concerns by implementing a dedicated `SecurityProfile` aggregate (TOTP seeds, strict PIN hashing).
- Implement `tipo_modelo` (Caja Central vs. Cartera Mesero) for `CashierSession`.
- Upgrade Audit Logs to `ForensicAuditLog` with strict sequential tracking, `metodo_autorizacion`, and `usuario_autorizador_id`.
- Build UI for Supervisor Override (local PIN and offline TOTP validation).
- Enforce drawer opening logs (Drawer Logs).

### Out of Scope
- Hardware-level integration changes (printers) aside from the trigger log.
- Biometric authentication.

## Capabilities

> This section is the CONTRACT between proposal and specs phases.

### New Capabilities
- None.

### Modified Capabilities
- `identity`: Add `SecurityProfile` (TOTP seed, PIN hashing), update audit logs for `metodo_autorizacion` and `usuario_autorizador_id`.
- `sales-core`: Update `CashierSession` for `tipo_modelo` (Caja Central vs. Cartera Mesero) and cash auditing logic.

## Approach

Adopt **Approach 2** (Dedicated Security/Audit Aggregates). Refactor `AuthRepository` to decouple `User` from `SecurityProfile`. Introduce `ForensicAuditLog` with strict local sequencing to prevent tampering. Expand `CashierSession` for the two operational models, ensuring edge-first state consolidation.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/pos_app/lib/domain/models/user.dart` | Modified | Separate auth details |
| `apps/pos_app/lib/domain/models/sales/cashier_session.dart` | Modified | Add `tipo_modelo` |
| `apps/pos_app/lib/domain/models/audit_log.dart` | Modified | Add auth tracking fields |
| `apps/pos_app/lib/ui/features/identity/` | New | Override lockout modal |
| `apps/admin_backend/src/modules/identity/` | Modified | Add TOTP / Auth schema updates |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| SQLite sequence tampering bypassing BIGSERIAL | Medium | Implement local cryptographic sealing or strict validation on sync. |
| Secure TOTP seed distribution | Medium | Use encrypted transport and restrict seed access at rest. |
| Breaking ongoing active shifts | Low | Provide a migration script for existing `CashierSession` records to default to `CAJA_CENTRAL`. |

## Rollback Plan

Revert the UI modal changes in `pos_app` and roll back backend DB migrations. Restore previous `CashierSession` and `AuditLog` definitions using version control tags before the feature branch merge.

## Dependencies

- None external; requires internal synchronization protocol adjustments.

## Success Criteria

- [ ] Supervisor can authorize restricted actions completely offline using a TOTP token.
- [ ] Drawer opens trigger an immutable audit log with authorization details.
- [ ] Shifts clearly distinguish between Centralized Cashier and Waiter Wallet totals.