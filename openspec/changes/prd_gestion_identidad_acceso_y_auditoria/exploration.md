## Exploration: @docs/PRDs/prd_gestion_identidad_acceso_y_auditoria.md

### Current State
- **POS App**: Has offline login capability in `AuthRepositoryImpl` with local hash verification (`UserDao`, `LocalAuthService`). The `UserEntity` has `pinHash` and `role`. `CashierSession` tracks opening and closing balance, but lacks `tipo_modelo` ('CAJA_CENTRAL' or 'CARTERA_MESERO'). `AuditLog` exists but uses local integer IDs without cryptographic sequencing, and lacks `usuario_autorizador_id` or `metodo_autorizacion`.
- **Admin Backend**: `User` entity has `role` (OWNER, MANAGER, CASHIER, WAITER) and `pin_hash`, but lacks `totp_secret_seed` and `pin_seguridad_hash` mapping accurately to the PRD. `AuditLog` exists but lacks `metodo_autorizacion` and `usuario_autorizador_id`. No logic for TOTP validation or Drawer Log enforcement.

### Affected Areas
- `apps/pos_app/lib/domain/models/user.dart` & `apps/pos_app/lib/data/models/user_entity.dart` — Needs `totpSecretSeed`.
- `apps/pos_app/lib/domain/models/sales/cashier_session.dart` & `apps/pos_app/lib/data/models/sales/cashier_session_entity.dart` — Needs `tipo_modelo` (Centralized vs Decentralized).
- `apps/pos_app/lib/domain/models/audit_log.dart` & `apps/pos_app/lib/data/models/audit_log_entity.dart` — Needs robust sequential ID, `usuario_autorizador_id`, `tipo_accion`, `metodo_autorizacion`.
- `apps/admin_backend/src/modules/identity/entities/user.entity.ts` — Needs `totp_secret_seed`.
- `apps/admin_backend/src/modules/identity/entities/audit-log.entity.ts` — Needs `usuario_autorizador_id`, `tipo_accion`, `metodo_autorizacion`.
- `apps/pos_app/lib/ui/features/identity/` — Needs UI for Supervisor Override modal (PIN and TOTP).

### Approaches
1. **Approach 1: Extend Existing Entities Directly**
   - Pros: Faster to implement, reuses current DAOs and Controllers.
   - Cons: Mixes authentication details (TOTP) with basic user profiles. Could bloat `UserEntity`. Local SQLite auto-increment IDs do not guarantee strict immutability.
   - Effort: Medium

2. **Approach 2: Create Dedicated Security/Audit Aggregates (Recommended)**
   - Pros: Clean separation of concerns. `SecurityProfile` handles TOTP/PIN logic separate from `User`. `ForensicAuditLog` handles immutable sequencing. Aligns with DGI constraints and "Offline-First" principles.
   - Cons: Requires refactoring `AuthRepository` and migrating existing data.
   - Effort: High

### Recommendation
**Approach 2** is recommended. Given the strict DGI constraints and "Offline-First or Muerte" vision, security aspects (TOTP, PIN hashing) and forensic audit logs must be isolated and robust. Implementing a dedicated `SecurityProfile` and a rigid `ForensicAuditLog` (with strict sequential validation) ensures compliance and cleaner domain models.

### Risks
- Local SQLite sequence tampering in `pos_app` might bypass `BIGSERIAL` guarantees.
- Synchronizing TOTP seeds securely to the local edge requires an encrypted transport and hardware-bound key.
- Breaking changes to `CashierSession` could affect ongoing active shifts if not migrated properly.

### Ready for Proposal
Yes — The requirements from the PRD are clear, the current gaps are identified, and the technical approach is defined.