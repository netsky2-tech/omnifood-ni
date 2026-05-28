# Tasks: Identity & Audit Scenarios Coverage (Wave 1A)

## Review Workload Forecast

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

| Field | Value |
|-------|-------|
| Estimated changed lines | ~360-560 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (RBAC Fallback & Route Gating) → PR 2 (S-PIN-06 Override Lock) |
| Delivery strategy | ask-always |
| Chain strategy | feature-branch-chain |

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | RBAC Offline Fallback & Gating | PR 1 | Base: main. Covers S-RBAC-01, S-RBAC-04, S-RBAC-05 and backend guards. |
| 2 | S-PIN-06 Override Lockout | PR 2 | Base: PR 1. Covers one-transaction lock and S-RBAC-02 discounts. |

## Phase 1: Authentication Fallback & Backend Guards (Unit 1)

- [x] 1.1 `LoginViewModel`: Implement offline fallback to verify locally cached roles/credentials (`apps/pos_app/lib/ui/features/auth/viewmodels/login_viewmodel.dart`). Verify: Unit test checks local cache execution on network error.
- [x] 1.2 `ReportsController`: Apply `@Roles(UserRole.OWNER, UserRole.MANAGER)` to backend X/Z report routes (`apps/admin_backend/src/modules/sales/controllers/reports.controller.ts`). Verify: E2E test asserts 403 Forbidden for `CASHIER`.

## Phase 2: POS UI Role Enforcement (Unit 1)

- [x] 2.1 `AppDrawer`: Hide "Reportes DGI" menu item if user role is `CASHIER` or `WAITER` (`apps/pos_app/lib/ui/widgets/app_drawer.dart`). Verify: Widget test confirms drawer omits report item for waitstaff.
- [x] 2.2 `SaleView`: Disable UI actions for opening/closing cash drawer for `WAITER` (`apps/pos_app/lib/ui/features/sales/sale_view.dart`). Verify: Widget test confirms drawer controls are hidden or disabled.
- [x] 2.3 `SaleViewModel`: Block `voidInvoice` logic for `CASHIER` and `WAITER` (`apps/pos_app/lib/presentation/features/sales/view_models/sale_view_model.dart`). Verify: Unit test confirms void attempt throws or yields denial state.

## Phase 3: Supervisor Override & One-Transaction Lock (Unit 2)

- [x] 3.1 `SaleViewModel`: Add `isSupervisorOverrideActive` state and `grantSupervisorOverride()` method (`apps/pos_app/lib/presentation/features/sales/view_models/sale_view_model.dart`). Verify: Unit test confirms state toggles to true.
- [x] 3.2 `SaleViewModel`: Gate discount logic (S-RBAC-02), requiring an override for `CASHIER`/`WAITER`. Verify: Unit test asserts discount application fails without override.
- [x] 3.3 `SaleViewModel`: Consume override (`_consumeOverride()`) immediately on transaction finalization to fulfill S-PIN-06. Verify: Unit test asserts `isSupervisorOverrideActive` resets automatically after `finalizeSale`.
- [x] 3.4 `SaleView`: Trigger Supervisor PIN prompt modal if a gated action is attempted (`apps/pos_app/lib/ui/features/sales/sale_view.dart`). Verify: Widget test simulates denial and shows PIN modal correctly.

## Phase 4: Verification & E2E (Unit 1 & 2)

- [x] 4.1 Run full Flutter test suite (`flutter test`) and NestJS E2E tests (`npm run test:e2e`). Verify: All tests pass covering scenarios S-RBAC-01, S-RBAC-02, S-RBAC-04, S-RBAC-05, and S-PIN-06.

## Continuation Notes (Verify Blockers Fix Slice)

- [x] S-RBAC-01 hardening: waiter guard enforced in `SaleViewModel.openSession()` and disabled `ABRIR CAJA` action in `BoxOpeningScreen` for unauthorized roles.
- [x] S-RBAC-04 runtime proof: explicit `voidInvoice()` denial tests for `CASHIER` and `WAITER`, plus authorized-path test for `MANAGER`.
- [x] Replace stale `CARTERA_MESERO` finalize expectation in `sale_view_model_test.dart` to match current RBAC/session-expected behavior.
- [x] Add cashier AppDrawer runtime proof for S-RBAC-05: `Reportes DGI` is hidden/inaccessible for `CASHIER`.
