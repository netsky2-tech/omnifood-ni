# Proposal: Advanced Inventory Logic (PAR Alerts & Sub-recipes)

## Intent
Implement recursive sub-recipe handling and PAR level alerting to complete the Inventory Management module requirements. This addresses technical debt (TODOs) and functional gaps (Alerts) identified in the previous phase.

## Scope

### In Scope
- **Recursive BOM**: Refactor `MovementEngineImpl` to recursively descale recipes that contain other products (sub-recipes).
- **PAR Alerts**: Implement a mechanism to trigger notifications when stock levels fall below the defined PAR level.
- **Alert Service**: Create a new `AlertService` interface for pushing notifications.

### Out of Scope
- UI for alerts (e.g., Toast notifications or Push headers) — this proposal covers only the domain logic/service.
- Email/External SMS integrations for alerts.

## Capabilities

### New Capabilities
- `inventory-recursive-bom`: Recursive traversal of product recipes during sales/reversals.
- `inventory-par-alerts`: Logic to detect and trigger alerts when stock reaches safety levels.

### Modified Capabilities
- `inventory-movements`: Update to include recursive triggers.

## Approach
- **Recursion**: Use a depth-first search (DFS) approach to process recipes. If an ingredient is a `product`, fetch its recipe and recurse.
- **Alerting Interface**: Define `AlertService` and inject it into `MovementEngine`. After each Insumo stock update, check `stock < parLevel`.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `lib/domain/services/inventory/movement_engine_impl.dart` | Modified | Added recursion and alert triggers. |
| `lib/domain/services/alerts/alert_service.dart` | New | Interface for notifications. |
| `test/domain/services/inventory/movement_engine_test.dart` | Modified | Add tests for nested recipes and alerts. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Circular Recipes | Low | Add recursion depth protection. |
| Performance (DB reads) | Med | Use basic caching or batch reads if needed. |

## Rollback Plan
- Revert `MovementEngineImpl` to the previous flat-descaling version.

## Success Criteria
- [ ] Sale of a product with a sub-recipe correctly discounts all base Insumos.
- [ ] Stock falling below PAR level triggers a call to `AlertService.push()`.
- [ ] Circular recipe detection prevents app crashes.
