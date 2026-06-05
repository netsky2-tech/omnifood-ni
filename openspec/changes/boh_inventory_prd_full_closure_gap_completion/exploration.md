## Exploration: boh_inventory_prd_full_closure_gap_completion

### Current State
- **Already complete**
  - Backend ledger/costing core is in place: append-only `inventory_kardex`, BCN FX -> NIO CPP, negative-stock policy, compensating adjustments, recipe version entities/services, production costing engine, batch valuation traces, and ordered/idempotent sync ingestion (`apps/admin_backend/src/modules/inventory/**/*.ts`, `apps/admin_backend/src/modules/sales/services/invoices.service.ts`).
  - POS already has BOH entry points for production, alerts, kardex, physical count, recipes, purchases, suppliers, warehouses, and insumos (`apps/pos_app/lib/ui/features/inventory/**`, `apps/pos_app/lib/ui/widgets/app_drawer.dart`).
  - Local offline movement engine already handles recursive BOM expansion, PAR alerts, and batch-aware sale deductions (`apps/pos_app/lib/domain/services/inventory/movement_engine_impl.dart`).
- **Partially complete**
  - **Backend/runtime**: services exist for recipe versioning, production, shrinkage, adjustments, and forensic alerts, but inventory HTTP surface is still minimal (`inventory-movement.controller.ts` only exposes sync/purchase/shrinkage; no recipe/production/count/kardex/report query APIs).
  - **POS local persistence**: kardex and count adjustments persist locally, but production orders are only kept in ViewModel memory and forensic alerts are session-only (`production_order_view_model.dart`, `forensic_alert_view.dart`, `kardex_view.dart`).
  - **Sync**: generic delta replay works for movements, but purchase sync uses `/purchases/sync` while the backend exposes inventory endpoints instead; BOH master-data/recipe/production/count documents are not synchronized end-to-end.
  - **Lot/expiry/FIFO**: domain support exists, but UI/operational flows are thin; perishable toggle exists, but there is no operator workflow to capture purchase expiration dates, inspect batches, adjust a batch, or review FIFO traceability.
  - **Reporting/traceability**: backend persists ledger/alerts, but POS BOH screens still disclose local/session scope instead of central BOH audit views; no dedicated inventory reporting/query layer is exposed.
- **Missing**
  - **RBAC**: BOH inventory routes/screens are largely menu-level visibility; inventory backend controllers show no explicit guards/role decorators, and POS inventory screens do not enforce fine-grained BOH permissions.
  - **BOH UX depth**: purchases lack currency, invoice-date, BCN rate, CPP preview, receiving review, and batch capture; recipes lack yield, technical shrink, sub-recipe authoring, version timeline, and historical comparison; production lacks plan/confirm/consume/receipt lifecycle; counts lack open session / line-by-line count / variance review / close session workflow.
  - **Count-session workflows**: current POS count flow is single ad-hoc compensating adjustment, not a count document/session with status, recount, approvals, or audit closure.
  - **Operational closure vs PRD**: true end-user proof for backend/runtime + BOH UI/UX + audit/reporting is not finished even though the archived change closed the core domain engine.

### Affected Areas
- `docs/PRDs/prd_gestion_inventario.md` — source-of-truth closure target; remaining UX/operational gaps come from sections 2-5 and UC-01..UC-05.
- `openspec/changes/archive/2026-06-01-boh_inventory_production_full_implementation/*` — prior change closed engine/spec scope but left product-surface gaps.
- `openspec/specs/inventory-*/spec.md` — base specs to extend with explicit “complete vs partial vs missing” closure criteria.
- `apps/admin_backend/src/modules/inventory/inventory-movement.controller.ts` — current BOH API surface is too small for PRD-complete product usage.
- `apps/admin_backend/src/modules/inventory/recipe.service.ts` — backend versioning exists but has no product-facing workflow/API.
- `apps/admin_backend/src/modules/inventory/production.service.ts` — production posting exists but lacks operator-facing orchestration endpoints.
- `apps/admin_backend/src/modules/inventory/forensic-alert.service.ts` — alert persistence exists but not a surfaced BOH inbox/query flow.
- `apps/pos_app/lib/ui/features/inventory/purchases/purchase_view*.dart` — minimal local purchase flow; missing FX/CPP/batch receiving UX.
- `apps/pos_app/lib/ui/features/inventory/recipes/recipe_view*.dart` — flat ingredient editor; missing sub-recipes, yield/shrink, and version lifecycle UX.
- `apps/pos_app/lib/ui/features/inventory/production/production_order_view*.dart` — local placeholder workflow, not persisted/confirmed BOH production.
- `apps/pos_app/lib/ui/features/inventory/counts/physical_count_view*.dart` — compensating adjustment only; not a count-session process.
- `apps/pos_app/lib/ui/features/inventory/kardex/kardex_view.dart` and `alerts/forensic_alert_view.dart` — explicit local/session-only disclaimers prove traceability UX is incomplete.

### Approaches
1. **Closure by product-surface hardening** — keep the approved backend engine and close the remaining PRD gap through APIs, persistence, sync contracts, and operator workflows.
   - Pros: Reuses verified domain core; lowest rework; best fit for “gap completion” scope.
   - Cons: Requires disciplined audit of every PRD clause so UX holes do not get missed again.
   - Effort: Medium/High

2. **Second architecture-heavy BOH redesign** — re-open core domain structure and redesign backend + POS BOH together.
   - Pros: Can unify some inconsistencies in one pass.
   - Cons: Wasteful; high review risk; little value because the engine/spec core is already approved.
   - Effort: High

### Recommendation
Use **Approach 1** and run `sdd-propose` with an explicit phased closure plan:
- **Slice 1 — PRD closure matrix + API contract lock**: map every PRD clause to complete/partial/missing and define missing backend read/write endpoints.
- **Slice 2 — backend BOH application surface**: recipe version APIs, production-order APIs, count-session APIs, forensic alert/kardex/report query APIs, RBAC guards.
- **Slice 3 — POS persistence/sync hardening**: persist production orders + alert inbox locally, align purchase/count/production sync contracts, fix `/purchases/sync` mismatch.
- **Slice 4 — BOH purchases/lot/FX UX**: invoice date, currency, BCN rate visibility, CPP preview, expiration/batch receiving.
- **Slice 5 — recipe/production UX**: yield/shrink, sub-recipe/version lifecycle, plan/confirm/trace production.
- **Slice 6 — count-session + reporting UX**: count sessions, variance review/approval, central kardex/alert/report traceability.

Reviewer budget risk is **High** for a single PR; this change should be planned as chained PRs with boundaries at **API contracts**, **backend workflows**, **POS persistence/sync**, **purchase+batch UX**, **recipe+production UX**, and **count/reporting UX**.

### Risks
- The change will easily exceed the 400-line review budget unless it is sliced by capability and app boundary.
- PRD closure can still be falsely claimed if proposal/spec work does not explicitly tag each item as complete, partial, or missing.
- Sync regressions are likely if production/count/purchase documents are added without stable offline ordering and idempotency rules.
- RBAC can become inconsistent if POS menu visibility and backend authorization are planned separately.
- Batch/FIFO UX can drift from actual costing rules if UI is designed without backend trace/query endpoints first.

### Ready for Proposal
Yes — proceed to `sdd-propose` for `boh_inventory_prd_full_closure_gap_completion`, with mandatory PRD closure matrix, chained-PR plan, and scope split between backend surface, POS persistence/sync, and BOH operator UX.
