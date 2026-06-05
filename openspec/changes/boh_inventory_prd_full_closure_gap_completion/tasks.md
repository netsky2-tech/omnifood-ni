# Tasks: BOH Inventory PRD Full Closure Gap Completion

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 1,600-2,300 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 -> PR 2 -> PR 3 -> PR 4 -> PR 5 |
| Delivery strategy | ask-on-risk |
| Chain strategy | feature-branch-chain |

Decision needed before apply: Resolved via canonical preflight (`feature-branch-chain`)
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | RBAC + BOH shell | PR 1 | `identity` + `main.dart` + `app_drawer.dart`; no backend-first merge |
| 2 | Purchases + lots + FX/CPP | PR 2 | Vertical slice; tests/docs in same PR |
| 3 | Recipes + production depth | PR 3 | Recipe compare/versioning + production close |
| 4 | Count sessions + adjustments | PR 4 | Approval/posting workflow end-to-end |
| 5 | Alerts + kardex + traceability | PR 5 | Persistent inbox + reporting cross-links |

## Phase 1: Foundation / Shell

- [x] 1.1 RED: add permission-matrix tests in `apps/admin_backend/src/modules/identity/guards/roles.guard.ts` and POS gating tests for `apps/pos_app/lib/main.dart` + `apps/pos_app/lib/ui/widgets/app_drawer.dart`.
- [x] 1.2 GREEN: extend `apps/admin_backend/src/modules/identity/dto/identity.dto.ts`, `.../services/auth.service.ts`, `.../guards/roles.guard.ts`, `apps/pos_app/lib/main.dart`, and `apps/pos_app/lib/ui/widgets/app_drawer.dart` so BOH routes/providers/nav hide or disable by action.

## Phase 2: Vertical Work Units

- [x] 2.1 PR1 shell: wire placeholder-proof BOH routes in `apps/pos_app/lib/main.dart` and create destination stubs in `apps/pos_app/lib/ui/features/inventory/**` only together with backend permission projection; no slice closes without a reachable UI.
- [x] 2.2 PR2 purchases: add `apps/admin_backend/src/modules/inventory/inventory.controller.ts`, `inventory-purchase.service.ts`, `entities/batch.entity.ts`; extend `apps/pos_app/lib/data/database/app_database.dart`, `inventory_repository_impl.dart`, `data/services/sync_service.dart`, `ui/features/inventory/purchases/{purchase_view.dart,purchase_view_model.dart}` for invoice date, BCN FX, CPP preview, lot capture.
- [ ] 2.3 PR3 recipes+production: extend `apps/admin_backend/src/modules/inventory/{recipe.service.ts,production.service.ts}`; add POS recipe/production detail files under `ui/features/inventory/recipes/` and `.../production/`; persist version/receipt docs in `app_database.dart` and sync them through `sync_service.dart`.
- [ ] 2.4 PR4 counts: create `apps/admin_backend/src/modules/inventory/count-session.controller.ts` + `count-session.service.ts`; add POS count entities/DAOs in `app_database.dart`, repository/sync handling, and `ui/features/inventory/counts/{physical_count_view.dart,physical_count_view_model.dart,count_session_detail_view.dart}` for recount, approve, post.
- [ ] 2.5 PR5 alerts+traceability: extend `apps/admin_backend/src/modules/inventory/{forensic-alert.service.ts,inventory-movement.controller.ts}`; add persistent alert/report state in `app_database.dart`, `inventory_repository_impl.dart`, `sync_service.dart`, and BOH detail flows in `ui/features/inventory/alerts/` + `.../kardex/`.

## Phase 3: Verification / Reviewability

- [ ] 3.1 For each PR, keep RED->GREEN->REFACTOR tests in `apps/admin_backend/src/modules/inventory/*.spec.ts`, `apps/admin_backend/test/**/*.ts`, `apps/pos_app/test/data/database/inventory_database_test.dart`, and slice-specific widget/viewmodel tests.
- [ ] 3.2 Verify offline-first replay, idempotency, and source-document links for purchase->lot->kardex, recipe->production, count->adjustment, and alert->movement scenarios before opening the next chained PR.
