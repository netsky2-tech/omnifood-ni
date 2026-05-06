# Apply Progress: Fixes from Judgment Day R5

## PR1: Backend Tenant Isolation

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.1 | `inventory.service.spec.ts` | Unit | ✅ 4/4 passed | ✅ Written | ✅ Passed | ✅ 2 cases | ✅ Clean |
| 1.2 | `inventory.service.spec.ts` | Unit | ✅ 4/4 passed | ✅ Written | ✅ Passed | ✅ 2 cases | ✅ Clean |
| 1.3 | `inventory.service.spec.ts` | Unit | ✅ 4/4 passed | ✅ Written | ✅ Passed | ✅ 3 cases | ✅ Clean |

### Test Summary
- **Total tests written**: 6 new tests
- **Total tests passing**: 9/9 (inventory.service) + 3/3 (inventory.controller) = 12/12
- **Layers used**: Unit (12)
- **Approval tests**: None — no refactoring tasks
- **Pure functions created**: 0 (service methods have side effects)

### Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `apps/admin_backend/src/modules/inventory/inventory.service.ts` | Modified | Added `tenantId` parameter to `recordPurchase()` and `syncMovements()`; updated `findOne` queries to include `tenant_id` filter |
| `apps/admin_backend/src/modules/inventory/inventory.controller.ts` | Modified | Added `@UseInterceptors(TenantInterceptor)` and `@GetTenantId()` decorator; updated `recordPurchase()` to pass `tenantId` |
| `apps/admin_backend/src/modules/inventory/inventory-movement.controller.ts` | Modified | Added `@UseInterceptors(TenantInterceptor)` and `@GetTenantId()` decorator; updated `syncMovements()` to pass `tenantId` |
| `apps/admin_backend/src/modules/inventory/inventory.service.spec.ts` | Modified | Added 6 new tests for tenant isolation; fixed pre-existing test with proper mock setup; added `createMockInsumo` helper |
| `apps/admin_backend/src/modules/inventory/inventory.controller.spec.ts` | Modified | Added `InventoryService` mock provider |
| `apps/admin_backend/src/modules/inventory/cost-calculator.service.ts` | Modified | Fixed `decimal.js` import for compatibility |

### Deviations from Design
None — implementation matches design spec. The tenant_id filtering is applied defensively in addition to RLS.

### Issues Found
1. **Pre-existing test bug**: The test "should process movements in chronological order and update stock" had a flawed mock setup that didn't properly simulate state updates. Fixed as part of refactoring.
2. **decimal.js import issue**: The cost-calculator.service.ts had an incompatible import style for decimal.js. Fixed by using `import * as DecimalModule` pattern.

### Test Coverage

#### Tenant Isolation Tests
1. ✅ `should include tenant_id in findOne query for syncMovements` — verifies query includes both id and tenant_id
2. ✅ `should include tenant_id in findOne query for recordPurchase` — verifies query includes both id and tenant_id
3. ✅ `should NOT return insumo from different tenant in recordPurchase` — verifies cross-tenant access is blocked
4. ✅ `should NOT return insumo from different tenant in syncMovements` — verifies movements for wrong tenant are skipped

#### Regression Tests (pre-existing, fixed)
1. ✅ `should process movements in chronological order and update stock` — fixed mock setup
2. ✅ `should calculate and update weighted average cost correctly` — added tenantId parameter
3. ✅ `should handle zero initial stock correctly` — added tenantId parameter

### Status
Phase 1 complete. Ready for PR creation.

### PR Boundary
- **Mode**: chained PR slice (PR 1 of 4)
- **Chain strategy**: feature-branch-chain
- **Current work unit**: PR1 — Backend Tenant Isolation
- **Base**: main (or feature branch for the chain)
- **Changes**: ~180 lines (within 400-line budget)
