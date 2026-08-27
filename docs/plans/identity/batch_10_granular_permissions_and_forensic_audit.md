# Batch 10: Permisos Granulares de Supervisor, Roles & Auditoría Forense (RBAC) — OmniFood NI

This execution plan operationalizes the **Fine-Grained Permissions Matrix**, **Dual-Factor Supervisor Override System (PIN / TOTP)**, and **Forensic Financial Audit Logs** according to:
- [PRD Master v2](../../PRDs/Product_Requirement_Document_v2.md) (§1, §3.1, §4.1)
- [PRD Gestión de Identidad, Acceso y Auditoría](../../PRDs/Done/prd_gestion_identidad_acceso_y_auditoria.md) (§2.2, §2.4, §2.5)
- [PRD Audit Trail](../../PRDs/prd_audit_trail.md)
- [Normativa DGI DT 09-2007 (Inmutabilidad y Control de Anulaciones)](https://www.dgi.gob.ni)

---

## 1. Authority, Traceability & Invariant Decisions

### Authoritative References
- **PRD Identidad & Acceso**: §2.2 (RBAC por acción crítica), §2.4 (Security Lockout, PIN y TOTP), §2.5 (Registro Defensivo de Gaveta).
- **PRD Audit Trail**: Encadenamiento SHA-256 de logs de auditoría por dispositivo y detección de manipulaciones.

### Invariant & Integrity Rules
1. **INV-10.1 (Least Privilege & Explicit Escalation)**: Cashiers and Waiters cannot perform critical operations (`sales:void_invoice`, `sales:discount_override`, `cash:manual_drawer_open`, `price:custom_override`) without an ephemeral, one-time supervisor authorization ticket or approval record.
2. **INV-10.2 (Dual-Factor Channel Verification)**: Supervisor overrides must support both **In-Person PIN** (verified locally/online against bcrypt hash) and **Remote TOTP** (RFC 6238 6-digit dynamic code evaluated against the decrypted `totp_secret_seed` with $\pm 1$ step clock tolerance).
3. **INV-10.3 (Immutable Hash-Chained Audit Trace)**: Every override execution, whether accepted or rejected, must generate an immutable audit log linked to the actor, the authorizer (`usuario_autorizador_id`), authorization method (`PIN` | `TOTP`), timestamp, sequence number, and previous SHA-256 entry hash.
4. **INV-10.4 (Multi-Tenant Isolation)**: Permissions matrices and audit streams are strictly segregated by `tenant_id` at the database and query interceptor level.

---

## 2. Assumptions, Decisions & Governance Matrix

| ID | Item | Decision / Policy | Owner |
|---|---|---|---|
| DEC-10.1 | **Permission Storage** | Role-based defaults apply out of the box (`OWNER`, `MANAGER`, `CASHIER`, `WAITER`). Custom per-user permission overrides are stored as string arrays in `security_profiles.custom_permissions` to allow exceptional grants. | Security / Architect |
| DEC-10.2 | **TOTP Time Window** | TOTP tokens use 30-second intervals (RFC 6238) with a lookback/forward step of 1 ($\pm 30$ seconds) to accommodate clock drift in offline tablets. | Cryptography / Core |
| DEC-10.3 | **Override Lifespan** | Supervisor override tokens are single-use or expire within 60 seconds of generation. | Operations / Security |
| DEC-10.4 | **Drawer Open Reason** | Every manual cash drawer open event requires a mandatory reason code (`CHANGE_REPLENISHMENT`, `AUDIT_COUNT`, `FLOAT_ADJUSTMENT`, `OTHER`). | Compliance / Cash Control |

---

## 3. Dependency DAG & Critical Path

```
                    ┌────────────────────────────────────────────────────────────┐
                    │ Slice 10.1: Fine-Grained Permissions Matrix & Decorators   │
                    │ (Permission enum, @RequirePermissions, custom overrides)   │
                    └─────────────────────────────┬──────────────────────────────┘
                                                  │
                                                  ▼
                    ┌────────────────────────────────────────────────────────────┐
                    │ Slice 10.2: Dual-Channel Supervisor Authorization (PIN/TOTP)│
                    │ (PIN bcrypt validation, TOTP RFC 6238 token verification)  │
                    └─────────────────────────────┬──────────────────────────────┘
                                                  │
                                                  ▼
                    ┌────────────────────────────────────────────────────────────┐
                    │ Slice 10.3: Forensic Audit Logs & Drawer Exception Reports │
                    │ (Override log chaining, drawer open audit, exception API)  │
                    └────────────────────────────────────────────────────────────┘
```

**Critical Path:** Slice 10.1 $\rightarrow$ Slice 10.2 $\rightarrow$ Slice 10.3.

---

## 4. Milestone Roadmap & Vertical Slice Breakdown

---

### Slice 10.1: Matriz de Permisos Granulares & Decorador `@RequirePermissions`
- **Goal:** Establish domain-level granular permission capabilities and decorator-driven enforcement for all controllers and endpoints.
- **Touched Surfaces:**
  - `apps/admin_backend/src/modules/identity/security/permissions.enum.ts`
  - `apps/admin_backend/src/modules/identity/decorators/permissions.decorator.ts`
  - `apps/admin_backend/src/modules/identity/guards/permissions.guard.ts`
  - `apps/admin_backend/src/modules/identity/dto/permission-matrix.dto.ts`
  - `apps/admin_backend/src/modules/identity/controllers/users.controller.ts`
  - `apps/admin_backend/src/modules/identity/guards/permissions.guard.spec.ts`
- **Permission Capabilities:**
  - `sales:void_invoice`: Anulación de facturas fiscales emitidas.
  - `sales:discount_override`: Aplicación de descuentos comerciales.
  - `sales:item_cancel`: Cancelación de comandas enviadas a cocina.
  - `sales:price_override`: Modificación de precio unitario en línea.
  - `cash:manual_drawer_open`: Apertura manual de gaveta de dinero sin venta.
  - `cash:reopen_shift`: Reapertura o modificación de turnos cerrados.
  - `inventory:recipe_edit`: Modificación de fórmulas y recetas BOH.
  - `reports:view_fiscal`: Visualización de reportes fiscales DGI y Cortes Z.
- **Evidence Gate:** Unit test suite for `PermissionsGuard` and RBAC matrix resolution (100% assertions passing).

---

### Slice 10.2: Servicio de Autorización Dual (PIN Presencial & TOTP Remoto)
- **Goal:** Implement secure validation of supervisor authorizations supporting both in-person PIN and remote TOTP authenticator tokens.
- **Touched Surfaces:**
  - `apps/admin_backend/src/modules/identity/dto/supervisor-override.dto.ts`
  - `apps/admin_backend/src/modules/identity/services/supervisor-override.service.ts`
  - `apps/admin_backend/src/modules/identity/services/supervisor-override.service.spec.ts`
  - `apps/admin_backend/src/modules/identity/controllers/auth.controller.ts`
- **Endpoints:**
  - `POST /identity/auth/supervisor-override`
    - Request: `{ supervisorId, credential, method: 'PIN' | 'TOTP', permissionRequired, context: { invoiceId, amount, reason } }`
    - Response: `{ authorized: true, supervisorName, authorizationToken, expiresAt }`
- **Evidence Gate:** Tests verifying bcrypt PIN verification, TOTP seed decryption and step validation, and failure on unauthorized roles or invalid tokens.

---

### Slice 10.3: Trazabilidad Forense de Excepciones y Drawer Audit Logs
- **Goal:** Connect override authorizations directly to the immutable hash-chained audit stream and expose administrative audit query endpoints.
- **Touched Surfaces:**
  - `apps/admin_backend/src/modules/identity/dto/audit-query.dto.ts`
  - `apps/admin_backend/src/modules/identity/services/audit-trail.service.ts`
  - `apps/admin_backend/src/modules/identity/controllers/audit.controller.ts`
  - `apps/admin_backend/test/identity/supervisor-override.e2e-spec.ts`
- **Endpoints:**
  - `GET /identity/audit/overrides?startDate=&endDate=&supervisorId=&permission=`
    - Returns audit history of all supervisor overrides (approvals and rejections) with actor and authorizer details.
  - `GET /identity/audit/drawer-opens?startDate=&endDate=&terminalId=`
    - Returns log of all manual cash drawer openings with reason codes and timestamps.
- **Evidence Gate:** E2E integration test verifying complete override request $\rightarrow$ execution $\rightarrow$ audit log entry hash validation.

---

## 5. Line Budget & PR Forecast

| Slice | Scope | Est. Changed Lines | Review Focus |
|---|---|---|---|
| **Slice 10.1** | Permission Matrix, Decorators & Guard | ~280 lines | Permission matrix resolution, TypeScript strict types |
| **Slice 10.2** | Dual-Channel Supervisor Override Service | ~320 lines | TOTP cryptographic verification, bcrypt PIN handling |
| **Slice 10.3** | Forensic Audit Trail & Drawer Logs API | ~350 lines | Hash chain validation, audit log query filters |

---

## 6. Risk Analysis & Mitigation

| Risk | Impact | Mitigation Strategy |
|---|---|---|
| **Clock Drift in Offline Tablets for TOTP** | Medium (Failed valid TOTP codes) | Support $\pm 1$ step (90-second validation window) and automatic clock sync on network reconnect. |
| **PIN Brute-Force Attacks on POS** | High (Unauthorized override) | Implement lock out after 5 consecutive failed supervisor PIN attempts (requiring remote TOTP or owner unlock). |
| **Audit Stream Manipulation** | Critical (Tampering with financial logs) | Enforce SHA-256 previous-hash chain verification (`prev_hash` $\rightarrow$ `entry_hash`). |

---

## 7. Next Action Recommendation

Proceed with **Slice 10.1: Fine-Grained Permissions Matrix & Decorator `@RequirePermissions`** using strict TDD (RED $\rightarrow$ GREEN $\rightarrow$ Refactor).
