# durable-print-fallback-safety

## Goal
Remediate the durable print fallback safety issue in `apps/pos_app/lib/domain/services/fulfillment/durable_print_service.dart` for finding H4.

## Findings
- H4: Durable print fallback generates a dummy invoice with $0 instead of failing safely.

## Constraints
- Preserve offline-first behavior.
- Preserve print subsystem stability.
- Do not emit a fiscal document with mismatched totals.
- Keep the fix minimal and reviewable.

## Allowed edit surfaces
- `apps/pos_app/lib/domain/services/fulfillment/durable_print_service.dart`
- `apps/pos_app/test/domain/services/fulfillment/durable_print_service_test.dart`
- `apps/pos_app/test/domain/services/fulfillment/durable_print_fallback_test.dart`

## Tasks
1. Inspect current `_parseInvoiceFromPayload` behavior and fallback path.
2. Replace dummy invoice generation with safe failure handling.
3. Preserve offline resilience without creating invalid fiscal output.
4. Add or extend tests for valid payload, corrupt payload, and fallback observability.

## Acceptance criteria
- Corrupt payload no longer produces a fake invoice with $0 totals.
- Failure is observable and logged.
- Existing print behavior does not regress.
- Test evidence covers success and failure branches.

## Commit
- Branch: `fix/durable-print-fallback`
- Message: `fix(pos): prevent dummy fiscal invoice from corrupt print payload`
