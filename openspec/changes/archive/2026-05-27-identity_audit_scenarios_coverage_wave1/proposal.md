# Proposal: Identity & Audit Scenarios Coverage (Wave 1A)

## Intent
Reduce critical compliance and security risks by closing high-priority RBAC and transaction override gaps. This wave focuses strictly on the highest risk-reduction per line changed: securing route/UI access and formalizing offline-first role enforcement, deferring heavier cryptographical and tamper-proofing migrations to a later wave to preserve review budget.

## Scope

### In Scope
- **RBAC Critical Enforcement**: Full role-action matrix enforcement across POS UI (drawer/reports gating) and Admin Backend (API route protection via NestJS guards).
- **S-PIN-06 Explicit Override**: Explicit one-transaction unlock behavior for supervisor overrides with dedicated widget test evidence.
- **Strict Size Bounds**: Hard delivery boundary under 400 changed lines, defining clear chain boundaries.

### Out of Scope
- Wave 1B audit log DB-level immutability proof.
- Anti-tampering lock mechanism.
- PIN algorithm policy migration (bcrypt to Argon2/PBKDF2).
- Performance benchmark P99 for login/audit.
- Cash model B power-loss closure.

## Capabilities

> Contract for the specs phase.

### New Capabilities
None

### Modified Capabilities
- `identity`: Adding formalized offline-fallback UI contract and critical RBAC route/UI enforcement.
- `sales-core`: Enforcing explicit one-transaction lock for supervisor overrides (S-PIN-06).

## Approach
Implement a strict, test-backed RBAC matrix without leaking privileges or existence information, adhering to offline-first constraints.
- **Frontend (Flutter)**: Enhance `LoginViewModel` to handle offline fallback clearly. Update `SaleView` and `AppDrawer` to enforce roles securely using MVVM state. Ensure the supervisor override only unlocks a single transaction.
- **Backend (NestJS)**: Apply declarative `@Roles()` decorators to critical Admin API routes (`RolesGuard`). Ensure offline-first synchronizations respect tenant and role boundaries upon ingestion.
- **Delivery Strategy**: Slice A will cover the fallback contract + RBAC matrix (~220-320 LOC), and Slice B will handle the S-PIN-06 one-transaction override tests (~140-240 LOC). This chained approach explicitly protects the 400-line review budget limit per PR.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/pos_app/lib/ui/features/auth/viewmodels/login_viewmodel.dart` | Modified | Auth fallback signaling and user flow behavior |
| `apps/pos_app/lib/ui/widgets/app_drawer.dart` | Modified | Role-based navigation gating |
| `apps/pos_app/lib/ui/features/sales/sale_view.dart` | Modified | Override reuse semantics (one-transaction lock) |
| `apps/admin_backend/src/modules/identity/guards/roles.guard.ts` | Modified | Server-side role enforcement matrix |
| Tests (Flutter/NestJS) | New | Evidence for S-PIN-06, fallback, and RBAC matrix |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| PR exceeds 400 lines | High | Strictly separate RBAC and S-PIN-06 into chained slices. |
| False confidence from UI-only gates | Low | Backend route protection (`RolesGuard`) strictly pairs with frontend gating to avoid privilege leakage. |
| Compliance failure on deferred items | Med | Clear documentation that Wave 1A explicitly scopes out crypto/anti-tamper for Wave 2. |

## Rollback Plan
Revert the individual PR branches. Because the changes are strictly authorization guards and UI restrictions (no destructive schema changes or data migrations are included in Wave 1A), rollback is stateless and instantly reversible.

## Dependencies
- `docs/Scenarios/gestion_identidad_acceso_auditoria_signoff_checklist.md` for sign-off targets and dependency order.

## Success Criteria

- [ ] POS UI correctly hides restricted modules from non-privileged roles.
- [ ] Backend API endpoints reject unauthorized roles with `403 Forbidden` (no existence leakage).
- [ ] Supervisor override (S-PIN-06) automatically relocks after one transaction.
- [ ] Test evidence exists for fallback contract, role matrix, and override limit.
- [ ] Total changed lines per chained PR remain under the 400-line budget limit.
