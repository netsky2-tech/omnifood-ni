# Design: Identity & Audit Scenarios Coverage (Wave 1A)

## Technical Approach

Implement strict RBAC controls across the Flutter POS UI and NestJS backend. On the frontend, MVVM ViewModels will enforce role-based access to UI elements and actions (Offline-First role enforcement). Supervisor overrides will use a one-shot token/flag to ensure S-PIN-06 compliance, relocking immediately after use. On the backend, we will apply `@Roles()` decorators using the existing `RolesGuard` to return `403 Forbidden` for restricted routes (S-RBAC-05).

To maintain review safety under 400 lines:
- **Slice 1 (RBAC & UI Gating):** Implements offline fallback, hides drawer menus (S-RBAC-05), and blocks direct access to box open/close (S-RBAC-01) and voids (S-RBAC-04).
- **Slice 2 (One-Transaction Override):** Implements the state machine for supervisor overrides (S-RBAC-02) and strict one-shot consumption (S-PIN-06).

## Architecture Decisions

### Decision: Offline-First Role Enforcement
**Choice**: Sync user roles to SQLite (via Floor) during login and enforce UI/action gates using local `AuthRepository` state.
**Alternatives considered**: Calling the backend for every permission check.
**Rationale**: The POS must operate seamlessly offline. Local enforcement ensures immediate feedback and generic denials without relying on network availability.

### Decision: One-Transaction Override State (S-PIN-06)
**Choice**: Store an `overrideGranted` flag in `SaleViewModel` that is consumed *immediately* upon transaction completion.
**Alternatives considered**: Time-based override token (e.g., 5 minutes).
**Rationale**: Time-based tokens risk abuse if the cashier completes the transaction quickly and starts another within the window. A strict one-transaction lock is safer and directly fulfills S-PIN-06.

### Decision: Generic Denial Messaging
**Choice**: Return standardized "Access Denied" or prompt for Supervisor PIN without indicating if the resource exists.
**Alternatives considered**: Detailed error messages ("You need MANAGER role to view X/Z reports").
**Rationale**: Defense-in-depth practice; prevents privilege and structure leakage to unauthorized roles.

## Data Flow

```text
  User Action (e.g., Apply Discount)
         │
         ▼
  SaleViewModel (Checks current UserRole)
         │
    ┌────┴────┐
Allowed     Denied (Prompts Supervisor PIN)
    │         │
    │         ▼
    │   SupervisorOverrideModal ──(Valid)──> Sets `overrideGranted = true`
    │                                              │
    ▼                                              ▼
 Execute Action <──────────────────────────────────┘
    │
    ▼
 Transaction Complete -> Clears `overrideGranted = false` (S-PIN-06)
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `apps/pos_app/lib/ui/features/auth/viewmodels/login_viewmodel.dart` | Modify | Implement offline login fallback using locally cached credentials and roles. |
| `apps/pos_app/lib/ui/widgets/app_drawer.dart` | Modify | Gate "Reportes DGI" menu item to hide it from `CASHIER` and `WAITER` (S-RBAC-05). |
| `apps/pos_app/lib/ui/features/sales/sale_view.dart` | Modify | Block `WAITER` from opening/closing box (S-RBAC-01). Gate UI discount actions. |
| `apps/pos_app/lib/presentation/features/sales/view_models/sale_view_model.dart` | Modify | Enforce single-transaction override state (S-PIN-06), block voiding (S-RBAC-04), and gate discount application (S-RBAC-02). |
| `apps/admin_backend/src/modules/sales/controllers/reports.controller.ts` | Modify | Apply `@Roles(UserRole.OWNER, UserRole.MANAGER)` to X/Z report routes (S-RBAC-05). |

## Interfaces / Contracts

```dart
// SaleViewModel State additions
bool _isSupervisorOverrideActive = false;
bool get isSupervisorOverrideActive => _isSupervisorOverrideActive;

void grantSupervisorOverride() {
  _isSupervisorOverrideActive = true;
  notifyListeners();
}

void _consumeOverride() {
  _isSupervisorOverrideActive = false;
  notifyListeners();
}

// In SaleViewModel finalizeSale or equivalent:
Future<void> finalizeSale(List<PaymentMethod> methods) async {
  // ... process sale ...
  _consumeOverride(); // Guarantee S-PIN-06 lock consumption
}
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | `SaleViewModel` override logic | Verify `isSupervisorOverrideActive` resets after `finalizeSale` (S-PIN-06). |
| Unit | `LoginViewModel` fallback | Verify successful offline login sets local user state properly. |
| Widget | `AppDrawer` visibility | Verify `Reportes DGI` does not render for `CASHIER` or `WAITER`. |
| Integration | Backend `RolesGuard` | Supertest E2E: Request X/Z reports as `CASHIER` -> Expect `403 Forbidden`. |

## Migration / Rollout

No migration required. Changes are stateless UI/route guards and localized state management. Cryptographic migrations are explicitly deferred to Wave 2.

## Open Questions

- None
