# Apply Progress: BOH Inventory PRD Full Closure Gap Completion

## Implementation Progress

**Change**: `boh_inventory_prd_full_closure_gap_completion`
**Mode**: Strict TDD

### Completed Tasks
- [x] 1.1 RED: permission-matrix tests for backend RBAC projection and POS BOH gating.
- [x] 1.2 GREEN: backend BOH permission projection + POS permission-aware route/drawer gating.
- [x] 2.1 PR1 shell: BOH navigation shell route with reachable UI and guarded destination entry point.
- [x] 2.2 PR2 purchases: purchase review UX, local purchase persistence, batch capture, FX/CPP preview, and purchase-document sync wiring.

### Files Changed
| File | Action | What Was Done |
|------|--------|---------------|
| `apps/admin_backend/src/modules/identity/dto/identity.dto.ts` | Modified | Added BOH permission value contract and typed session/staff projection DTOs. |
| `apps/admin_backend/src/modules/identity/guards/roles.guard.ts` | Modified | Added centralized BOH permission matrix helpers aligned to role-based authorization. |
| `apps/admin_backend/src/modules/identity/guards/roles.guard.spec.ts` | Created | Added RED/GREEN unit coverage for owner/manager allow and cashier/waiter deny cases. |
| `apps/admin_backend/src/modules/identity/services/auth.service.ts` | Modified | Projected BOH permissions into login payloads and staff sync responses. |
| `apps/admin_backend/src/modules/identity/services/auth.service.spec.ts` | Modified | Extended auth sync assertions to cover BOH permission projection. |
| `apps/pos_app/lib/main.dart` | Modified | Added BOH shell route, route guard, and permission-gated BOH destinations. |
| `apps/pos_app/lib/ui/features/inventory/boh/boh_permissions.dart` | Created | Added local BOH permission matrix mirroring backend role projection for offline-first gating. |
| `apps/pos_app/lib/ui/features/inventory/boh/boh_navigation_shell_view.dart` | Created | Added BOH navigation shell UI plus reusable access denied and route guard widgets. |
| `apps/pos_app/lib/ui/widgets/app_drawer.dart` | Modified | Replaced scattered BOH links with one permission-aware shell entry and locked-state discoverability copy. |
| `apps/pos_app/test/widget_test.dart` | Modified | Added main route gating coverage for manager allow / waiter deny on the BOH shell. |
| `apps/pos_app/test/ui/widgets/app_drawer_test.dart` | Modified | Added drawer visibility + BOH shell navigation coverage and removed stale direct-link assumptions. |
| `apps/admin_backend/src/modules/inventory/dto/purchase-document.dto.ts` | Created | Added validated purchase document contract for review/post payloads including optional lot metadata. |
| `apps/admin_backend/src/modules/inventory/inventory-purchase.service.ts` | Modified | Added FX/CPP preview logic, perishable lot validation, and transactional batch creation during posting. |
| `apps/admin_backend/src/modules/inventory/inventory-movement.controller.ts` | Modified | Added purchase review endpoint and expanded purchase posting contract. |
| `apps/admin_backend/src/modules/inventory/entities/batch.entity.ts` | Modified | Added received date persistence for purchase lot capture. |
| `apps/admin_backend/src/modules/inventory/inventory-purchase.service.spec.ts` | Modified | Added TDD coverage for preview values, batch persistence, and missing lot metadata rejection. |
| `apps/admin_backend/src/modules/inventory/inventory.controller.spec.ts` | Modified | Added controller coverage for preview routing and batch metadata passthrough. |
| `apps/pos_app/lib/ui/features/inventory/purchases/purchase_view.dart` | Modified | Replaced the stub dialog with a review-first purchase workspace showing invoice date, BCN FX, CPP preview, lot capture, FIFO rows, and a post confirmation modal. |
| `apps/pos_app/lib/ui/features/inventory/purchases/purchase_view_model.dart` | Modified | Added local FX/CPP preview calculation, perishable validation, FIFO state, purchase document persistence, and linked movement IDs for sync. |
| `apps/pos_app/lib/data/services/sync_service.dart` | Modified | Synced purchase documents before generic movement replay and excluded purchase movements from the generic outbox path. |
| `apps/pos_app/lib/data/repositories/inventory/inventory_repository_impl.dart` | Modified | Persisted richer purchase/batch fields and exposed unsynced purchase queries + purchase sync acknowledgements. |
| `apps/pos_app/lib/data/database/{app_database.dart,migrations.dart}` | Modified | Bumped the Floor schema to v15 and added purchase FX/batch columns plus batch received date migration. |
| `apps/pos_app/lib/data/models/inventory/{purchase_entity.dart,batch_entity.dart}` | Modified | Added local persistence fields for purchase review values and lot metadata. |
| `apps/pos_app/lib/data/mappers/purchase_mapper.dart` | Modified | Mapped new purchase review fields into Floor entities and sync payloads. |
| `apps/pos_app/lib/domain/models/inventory/{purchase.dart,batch.dart}` | Modified | Extended domain purchase/batch models for invoice date, FX/CPP metadata, and received date. |
| `apps/pos_app/lib/domain/services/inventory/{movement_engine.dart,movement_engine_impl.dart}` | Modified | Allowed purchase movements to reuse the purchase document ID so sync can acknowledge the local stock mutation truthfully. |
| `apps/pos_app/lib/domain/repositories/inventory/inventory_repository.dart` | Modified | Added unsynced purchase and purchase-ack repository contract methods. |
| `apps/pos_app/test/ui/features/inventory/purchases/purchase_view_model_test.dart` | Modified | Added RED/GREEN coverage for USD preview, batch validation, and FIFO state. |
| `apps/pos_app/test/ui/features/inventory/purchases/purchase_view_test.dart` | Created | Added widget coverage for visible FX review and perishable lot fields. |
| `apps/pos_app/test/data/database/inventory_database_test.dart` | Modified | Added integration coverage for persisted purchase FX preview values and batch received date. |
| `apps/pos_app/test/data/services/sync_service_test.dart` | Modified | Added sync replay coverage for purchase-document-first ordering and linked movement acknowledgement. |
| `openspec/changes/boh_inventory_prd_full_closure_gap_completion/tasks.md` | Modified | Resolved the chain strategy metadata to `feature-branch-chain` and marked PR2 slice tasks complete. |

### TDD Cycle Evidence
| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.1 | `apps/admin_backend/src/modules/identity/guards/roles.guard.spec.ts`, `apps/pos_app/test/widget_test.dart`, `apps/pos_app/test/ui/widgets/app_drawer_test.dart` | Unit + Widget | ✅ Backend `auth.service.spec.ts` 13/13, POS `widget_test.dart` + `app_drawer_test.dart` 9/9 | ✅ Written first | ✅ Backend 16/16 + POS 8/8 | ✅ Owner/manager allow, cashier/waiter deny, manager navigation, waiter route denial | ✅ Extracted shared BOH permission constants |
| 1.2 | `apps/admin_backend/src/modules/identity/services/auth.service.spec.ts`, `apps/pos_app/test/widget_test.dart`, `apps/pos_app/test/ui/widgets/app_drawer_test.dart` | Unit + Widget | ✅ Same targeted baseline | ✅ Written first | ✅ Backend 16/16 + POS 8/8 | ✅ Staff sync projection + drawer enabled/disabled states | ✅ Centralized permission projection and route guard widget |
| 2.1 | `apps/pos_app/test/widget_test.dart`, `apps/pos_app/test/ui/widgets/app_drawer_test.dart` | Widget | ✅ POS 9/9 baseline | ✅ Written first | ✅ POS 8/8 | ✅ Shell route allow/deny + drawer entry navigation | ✅ Reused shell cards and access denied view |
| 2.2 | `apps/admin_backend/src/modules/inventory/{inventory-purchase.service.spec.ts,inventory.controller.spec.ts}`, `apps/pos_app/test/ui/features/inventory/purchases/{purchase_view_model_test.dart,purchase_view_test.dart}`, `apps/pos_app/test/data/{database/inventory_database_test.dart,services/sync_service_test.dart}` | Unit + Widget + Integration | ✅ Backend purchase/controller specs 5/5, POS purchase/db/sync specs 12/12 | ✅ Written first | ✅ Backend 9/9 + POS 16/16 | ✅ USD preview vs NIO fallback, batch-required vs non-batch paths, FIFO/expiry rows, purchase-document-first sync replay | ✅ Extracted purchase review calculation + linked document/movement sync IDs |

### Test Summary
- **Total tests written**: 13
- **Total tests passing**: 25 targeted tests (`9` backend + `16` POS)
- **Layers used**: Unit (`12`), Widget (`9`), Integration (`4`)
- **Approval tests**: None — both completed slices introduced new BOH behavior rather than preserving legacy contracts
- **Pure functions created**: 7 (`resolveInventoryBohPermissions`, `hasInventoryBohPermission`, `resolveBohPermissions`, `hasBohPermission`, `canAccessAnyBoh`, `buildPurchaseReview`, `_buildPurchasePayload`)

### Deviations from Design
None — implementation matches the PR1 shell and PR2 purchase slice design intent while keeping the POS offline-first.

### Issues Found
- Existing inventory detail routes beyond the shell still rely on direct provider wiring in `main.dart`; deeper per-screen RBAC beyond PR1 remains for later vertical slices.
- `flutter pub run build_runner build` regenerated additional project-wide generated files and mocks, so the eventual PR diff must be reviewed carefully to keep the PR2 slice focused.

### Remaining Tasks
- [ ] 2.3 PR3 recipes+production: versioning, receipt docs, deeper production workflow.
- [ ] 2.4 PR4 counts: recount, approve, post lifecycle.
- [ ] 2.5 PR5 alerts+traceability: persistent alerts and BOH reporting cross-links.
- [ ] 3.1 For each PR, keep RED->GREEN->REFACTOR tests for the remaining slices.
- [ ] 3.2 Verify offline-first replay, idempotency, and source-document links before the next PR.

### Workload / PR Boundary
- Mode: chained PR slice
- Current work unit: PR2 — Purchases + lots + FX/CPP vertical slice
- Boundary: starts at purchase review/post contracts plus offline purchase document persistence, ends at local lot capture + purchase-document replay wiring + widget/db/sync tests
- Estimated review budget impact: high in the current workspace because generated files expanded the diff; the child PR should isolate handwritten PR2 files and only the generated artifacts required by the new purchase fields/mocks

### Status
4/8 tasks complete. Ready for PR3 / next batch.
