# Design: BOH Inventory PRD Full Closure Gap Completion

## Technical Approach

Deliver BOH closure as **vertical workspaces**, not backend endpoints first. Each slice pairs NestJS document APIs + Floor persistence + sync + Flutter route/viewmodel/view in the same PR. The current POS already has routes/providers in `apps/pos_app/lib/main.dart`, drawer discovery in `apps/pos_app/lib/ui/widgets/app_drawer.dart`, SQLite truth in `AppDatabase`, and thin MVVM screens; this change extends that pattern to production, alerts, kardex, counts, lots/FIFO, purchases, and recipe versioning.

## Architecture Decisions

| Decision | Alternatives | Rationale |
|---|---|---|
| BOH by document aggregates (`purchase`, `production_order`, `count_session`, `alert_state`) | ad-hoc movement-only screens | Specs require operator workflows, approvals, and traceability, not just ledger rows. |
| Extend named routes + `ChangeNotifierProvider` in `main.dart` | introduce Router 2.0 now | Follow existing POS pattern; avoid architecture churn during closure. |
| Persist new BOH docs in Floor before sync | online-only APIs | Honors offline-first source-of-truth and avoids UI lag behind connectivity. |
| Permission matrix beyond current role-only guard | keep owner/manager booleans | `identity/spec.md` requires per-action BOH permissions and disabled/hide states. |

## Data Flow

`Flutter View` → `ViewModel` → `InventoryRepository` → `Floor DAO + local doc/outbox tables` → `SyncService` → `NestJS controller/service` → `Postgres inventory docs + kardex + alert tables`

`Backend ack/conflict` → `SyncService` → local sync status + UI chips (`Pending`, `Synced`, `Conflict`, `Needs approval`).

## File Changes

| File | Action | Description |
|---|---|---|
| `apps/pos_app/lib/main.dart` | Modify | Register BOH providers/routes for detail screens and sync-state aware workspaces. |
| `apps/pos_app/lib/ui/widgets/app_drawer.dart` | Modify | Group BOH navigation by permission and expose only allowed destinations. |
| `apps/pos_app/lib/data/database/app_database.dart` | Modify | Add entities/DAOs for count sessions, alert state, production docs, recipe versions, sync receipts. |
| `apps/pos_app/lib/data/repositories/inventory/inventory_repository_impl.dart` | Modify | Load/save document aggregates, sync receipts, lot lineage, FX/CPP previews. |
| `apps/pos_app/lib/data/services/sync_service.dart` | Modify | Replay ordered inventory documents with per-document ack/conflict handling. |
| `apps/pos_app/lib/ui/features/inventory/**` | Modify/Create | Replace placeholder BOH screens with list/detail/review/confirm flows. |
| `apps/admin_backend/src/modules/inventory/**` | Modify/Create | Add count-session, reporting, alert lifecycle, purchase review, production closure, batch lineage endpoints. |
| `apps/admin_backend/src/modules/identity/**` | Modify | Add inventory permission guards/DTO projection for POS discoverability. |

## Interfaces / Contracts

| Surface | Route(s) | ViewModel | Repository/DAO | Sync state | DESIGN.md binding |
|---|---|---|---|---|---|
| Purchases + FX/CPP + lots | `/inventory/purchases`, `/inventory/purchases/:id` | `PurchaseViewModel`, new `PurchaseDetailViewModel` | `PurchaseDao`, `BatchDao`, new `PurchaseSyncReceiptDao` | Draft/Pending/Synced/Conflict | visible labels, 48px inputs, tabular CPP/FX columns, full-width post modal |
| Production ops | `/inventory/production`, `/inventory/production/:id` | `ProductionOrderViewModel`, new detail VM | new `ProductionOrderDao`, movement/batch DAOs | Planned/Confirmed/Received/Closed | outlined cards, status chips, tabular plan-vs-actual, critical confirm modal |
| Alert inbox/lifecycle | `/inventory/alerts`, `/inventory/alerts/:id` | `ForensicAlertViewModel` | new `AlertDao` | Active/Ack/Resolved/Superseded | flat bordered inbox/detail, status chips, tabular valuation metadata |
| Kardex + traceability | `/inventory/kardex`, `/inventory/kardex/:movementId` | `KardexViewModel` | `MovementDao`, new trace query DAO | Synced/Conflict markers per row | 56px rows, outlined filters, tabular values, no shadows |
| Count sessions/adjustments | `/inventory/counts`, `/inventory/counts/:id` | `PhysicalCountViewModel`, new `CountSessionDetailViewModel` | new `CountSessionDao`, `CountLineDao` | Open/Recount/Approval/Posted | worksheet grid, visible labels, full-width irreversible posting actions |
| Recipes/versioning | `/inventory/recipes`, `/inventory/recipes/:productId/version/:id` | `RecipeViewModel`, new compare VM | new `RecipeVersionDao`, `RecipeCompareDao` | Draft/Published/Synced | side-by-side compare, tabular yield/cost, publish modal |
| Lots/FIFO lineage | item/purchase/production/count detail tabs | shared detail VMs | `BatchDao` + lineage queries | Pending/Synced/Expired | outlined table, expiry chips, 56px rows |

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit | NestJS services, permission matrix, Flutter viewmodels | Jest + `flutter_test` with repository mocks |
| Integration | Floor migrations/DAOs, sync replay, NestJS controllers | DB-backed DAO tests + Supertest inventory docs |
| E2E | purchase→lot→kardex, production close, count approval, alert ack | POS widget flows + backend request cycle per slice |

## Migration / Rollout

No destructive migration. Additive tables/endpoints/screens only. Slice order must stay vertically integrated and reviewable: **1)** RBAC + nav shell, **2)** purchases/lots/FX, **3)** recipe versioning + production, **4)** count sessions, **5)** alerts + kardex/reporting. Target one work-unit/PR each, ~<=400 changed lines, with backend + Floor + UI + tests together.

## Open Questions

- [ ] Confirm whether BOH permissions stay role-derived or need explicit per-user grants in local auth payload.
- [ ] Confirm if reporting detail routes should live inside POS only or also in web/admin surfaces during this change.
