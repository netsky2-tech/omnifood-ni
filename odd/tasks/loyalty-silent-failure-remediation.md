# loyalty-silent-failure-remediation

## Goal
Remediate silent loyalty failures in `apps/pos_app/lib/presentation/features/sales/view_models/sale_view_model.dart` for findings B1, B2, and H9.

## Findings
- B1: loyalty redeem failure swallowed by empty catch
- B2: loyalty earn failure swallowed by empty catch
- H9: loyalty re-evaluation on cart change fails silently

## Constraints
- Preserve local-first sale completion.
- Preserve offline-first behavior.
- Keep the defect fix small and reviewable.
- Do not expand scope beyond loyalty failure handling.

## Allowed edit surfaces
- `apps/pos_app/lib/presentation/features/sales/view_models/sale_view_model.dart`
- `apps/pos_app/test/presentation/features/sales/sale_view_model_test.dart`
- `apps/pos_app/test/presentation/features/sales/sale_view_model_loyalty_wiring_test.dart`
- `apps/pos_app/test/domain/services/sales/sale_view_model_loyalty_integration_test.dart`

## Tasks
1. Replace empty catch blocks around redeem and earn persistence with structured failure handling.
2. Make `_reEvaluateLoyalty()` failure observable without blocking cart flow.
3. Add or extend targeted tests for success and failure branches.
4. Produce evidence that the sale still completes locally when loyalty persistence fails.

## Acceptance criteria
- No empty `catch (_) {}` remains in the targeted loyalty paths.
- Loyalty failures are logged or otherwise observable.
- Existing sale completion behavior does not regress.
- Test evidence covers success and failure branches.

## Commit
- Branch: `fix/loyalty-silent-failure`
- Message: `fix(pos): surface loyalty failures instead of swallowing them`
