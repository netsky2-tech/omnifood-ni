# Design: Gestión de Identidad, Acceso y Auditoría

## Technical Approach

Implement Approach 2 from proposal/specs: isolate credentials into `SecurityProfile`, evolve audit to `ForensicAuditLog`, and add cashier-session model type. Keep offline-first behavior: POS validates PIN/TOTP locally and writes immutable local audit first; backend remains eventual-consistency receiver and validator.

## Architecture Decisions

| Decision | Options | Tradeoff | Decision |
|---|---|---|---|
| Credential boundary | Extend `User` vs new `SecurityProfile` | Extending `User` is faster but couples identity and secrets | Create `SecurityProfile` (POS + backend) linked by `user_id` |
| Offline supervisor auth | PIN-only vs PIN+TOTP | PIN-only is simpler but weaker for override | Support both (`PIN`,`TOTP`) with explicit `metodo_autorizacion` |
| Audit immutability | Auto-increment only vs chained integrity | Auto-increment alone is tamper-prone in SQLite | Add `sequence_no` + `prev_hash` + `entry_hash` for local forensic chain |
| Cash model | Infer from role vs explicit session field | Role inference breaks mixed operations | Persist explicit `tipo_modelo` in `CashierSession` |

## Data Flow

Restricted action override (offline):

`POS UI modal` -> `AuthRepositoryImpl` -> `SecurityProfileDao` -> `LocalAuthService` (PIN/TOTP verify) -> allow/deny -> `AuditRepositoryImpl.logForensic(...)` -> `audit_logs` (unsynced)

Sync path:

`audit_logs (POS)` -> `/identity/audit` -> backend validation (tenant, actor, sequence/hash) -> `audit_logs` (Postgres)

Cash session path:

`SaleViewModel.openSession()` -> persist `tipo_modelo` -> transactions update expected cash based on model -> close session writes totals + audit event.

## File Changes

| File | Action | Description |
|---|---|---|
| `apps/pos_app/lib/domain/models/user.dart` | Modify | Remove direct secret fields from user contract for sync/runtime usage |
| `apps/pos_app/lib/domain/models/security_profile.dart` | Create | New aggregate for `pin_hash`, `totp_secret_seed`, active flags |
| `apps/pos_app/lib/data/models/security_profile_entity.dart` | Create | Floor entity for local credential storage |
| `apps/pos_app/lib/data/daos/security_profile_dao.dart` | Create | DAO for profile lookup by `user_id` |
| `apps/pos_app/lib/data/repositories/auth_repository_impl.dart` | Modify | Use `SecurityProfile` for offline PIN/TOTP validation and staff sync split |
| `apps/pos_app/lib/data/services/local_auth_service.dart` | Modify | Add TOTP verification and time-window policy |
| `apps/pos_app/lib/domain/models/audit_log.dart` | Modify | Add forensic fields + authorization context |
| `apps/pos_app/lib/data/models/audit_log_entity.dart` | Modify | Add `sequence_no`, `prev_hash`, `entry_hash`, `metodo_autorizacion`, `usuario_autorizador_id`, `tipo_accion` |
| `apps/pos_app/lib/data/repositories/audit_repository_impl.dart` | Modify | Build hash chain locally; sync DTO shape compatible with backend |
| `apps/pos_app/lib/domain/models/sales/cashier_session.dart` | Modify | Add `tipoModelo` (`CAJA_CENTRAL`,`CARTERA_MESERO`) |
| `apps/pos_app/lib/data/models/sales/cashier_session_entity.dart` | Modify | Persist `tipo_modelo` |
| `apps/pos_app/lib/presentation/features/sales/view_models/sale_view_model.dart` | Modify | Session open/close logic by model, default migration handling |
| `apps/pos_app/lib/ui/features/identity/supervisor_override_modal.dart` | Create | UI for PIN/TOTP override authorization |
| `apps/pos_app/lib/data/database/app_database.dart` | Modify | Bump Floor version and include new entity/DAO |
| `apps/admin_backend/src/modules/identity/entities/user.entity.ts` | Modify | Remove security coupling from user where needed, keep role/profile link |
| `apps/admin_backend/src/modules/identity/entities/security-profile.entity.ts` | Create | New TypeORM entity for TOTP/PIN security profile |
| `apps/admin_backend/src/modules/identity/entities/audit-log.entity.ts` | Modify | Add auth method/authorizer and forensic chain columns |
| `apps/admin_backend/src/modules/identity/controllers/audit.controller.ts` | Modify | Accept forensic DTO and enforce tenant/user invariants |
| `apps/admin_backend/src/modules/identity/services/auth.service.ts` | Modify | Include profile data in staff sync contract (without leaking sensitive secrets to unauthorized contexts) |

## Interfaces / Contracts

```ts
type AuthorizationMethod = 'PIN' | 'TOTP';
type CashModel = 'CAJA_CENTRAL' | 'CARTERA_MESERO';

interface ForensicAuditPayload {
  id: string; user_id: string; usuario_autorizador_id?: string;
  tipo_accion: string; metodo_autorizacion?: AuthorizationMethod;
  sequence_no: number; prev_hash: string; entry_hash: string;
  device_id: string; timestamp: string; metadata?: Record<string, unknown>;
}
```

Invariant set:
- `sequence_no` strictly increases per device.
- `entry_hash = H(sequence_no + prev_hash + canonical_payload)`.
- Drawer-open event always generates audit entry.
- Active pre-existing sessions default to `CAJA_CENTRAL`.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit | PIN/TOTP validation, hash-chain generation, cash model calculation | Flutter unit tests + Jest service tests |
| Integration | Floor migration (v11->v12), POS sync payload, backend audit persistence | Flutter DB tests + Nest testing module with repositories |
| E2E | Offline supervisor override and drawer-open audit trace | Flutter integration flow + Nest `/identity/audit` e2e |

## Migration / Rollout

1. **DB-first**: Add nullable/new columns and new tables (`security_profiles`), keep backward compatibility one release.
2. **POS rollout**: App upgrade performs Floor migration; existing active sessions set `tipo_modelo='CAJA_CENTRAL'`.
3. **Dual-write window**: Keep legacy audit fields while emitting forensic fields.
4. **Enforcement switch**: Backend rejects malformed forensic chain after adoption threshold.

## Implementation Notes (Phase 5 Closure)

- Offline-first enforcement is now end-to-end for restricted actions: supervisor authorization is validated in POS local SQLite (`SecurityProfile`) and forensic logs are written locally before any network dependency.
- DGI-oriented immutability rationale is preserved by design: forensic logs are append-only with `sequence_no`, `prev_hash`, and `entry_hash`; this prevents destructive mutation patterns and supports traceable fiscal/audit reconstruction.
- Temporary dual-write transition is closed for sync ingestion: backend now resolves forensic action from either `action` or `tipo_accion` (backward-compatible read path), while persisted storage remains normalized in `action`.
- No verify/archive phase was executed in this apply slice; this batch is limited to tasks 5.1/5.2 scope only.

## Implementation Notes (JD Round 1 Premium Remediation)

- Audit sync contract mismatch resolved with a dedicated POS-side `remote_ref_uuid` field for cloud synchronization IDs. Local SQLite `audit_logs.id` remains integer PK and is no longer overloaded for backend UUID DTO contract.
- Drawer forensic semantics now follow PRD intent: manual drawer opening is explicit, requires a justification text, requires supervisor authorization, and emits standardized event `DRAWER_OPENED_MANUALLY`.
- PIN lockout policy is enforced in POS override flow: 3 failed PIN attempts in 60 seconds lock PIN method for 5 minutes; TOTP path remains available during lock window.
- `totp_secret_seed` now uses encrypted persistence (AES-256-GCM transformer) in backend storage using a key derived from `TOTP_SEED_ENCRYPTION_KEY`.
- Limitation: this slice does not implement true hardware-bound keys. If `TOTP_SEED_ENCRYPTION_KEY` is not provisioned by secure infra/KMS/HSM, fallback keying is environment-based and weaker than PRD hardware-bound target; future slice should bind key material to device/secure enclave or managed KMS.

Rollback:
- Disable forensic strict validation flag server-side.
- Keep reading legacy audit shape.
- Revert POS UI modal usage; preserve stored data (no destructive downgrade).

## Open Questions

- [ ] Should TOTP secrets be synced encrypted-only (server blind) or server-readable with KMS-at-rest?
- [ ] Do we require backend verification of full chain continuity per `device_id` on each sync batch or asynchronous reconciliation?
