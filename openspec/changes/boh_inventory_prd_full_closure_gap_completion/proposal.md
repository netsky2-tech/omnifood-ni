# Proposal: BOH Inventory PRD Full Closure Gap Completion

## Intent

Close the remaining PRD gaps left after the engine-focused archive so BOH inventory can be claimed complete at product, sync, audit, and operator-workflow level.

## Scope

### In Scope
- **Complete/keep**: core ledger, CPP/FX, recursive BOM, production costing, alert generation, ordered/idempotent movement ingestion.
- **Partial/finish**: backend APIs, POS local persistence, sync contracts, lot/FIFO/expiry UX, purchases FX/CPP visibility, recipe versioning UX, production workflow depth, BOH traceability/report queries.
- **Missing/build**: RBAC enforcement, count-session lifecycle, central BOH alert/kardex/reporting views, chained delivery plan and PRD closure matrix.

### Out of Scope
- Accounting/AP redesign or rework of approved costing engine.
- Any implementation before `sdd-spec`, `sdd-design`, and `sdd-tasks` finish.

## Capabilities

### New Capabilities
- `inventory-count-sessions`: open/count/recount/approve/close sessions with audit-safe variance posting.
- `inventory-reporting-traceability`: BOH queries for kardex, alerts, batches, FIFO lineage, and closure evidence.

### Modified Capabilities
- `identity`: inventory RBAC for backend guards and POS permission gates.
- `inventory-batch-management`: purchase expiry capture, batch review/adjustment, FIFO trace visibility.
- `inventory-master-data-ui`: BOH inventory surfaces for warehouses/suppliers/items with closure status.
- `inventory-production-orders`: persisted plan/confirm/consume/receipt lifecycle.
- `inventory-purchasing`: invoice date, currency, BCN rate, CPP preview, receiving review.
- `inventory-recipe-bom`: yield, technical shrink, sub-recipes, version timeline/compare UX.
- `inventory-sync-topologies`: aligned purchase/production/count/master-data sync contracts.
- `inventory-ui-alerts`: persistent BOH inbox and admin/operator trace views.

## Approach

Use closure-by-surface hardening: first lock a PRD matrix marking every clause complete/partial/missing, then define API/spec deltas, then design/tasks, then implement in chained work units.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `docs/PRDs/prd_gestion_inventario.md` | Modified | Closure matrix + success proof source |
| `openspec/specs/inventory-*/spec.md` | Modified/New | Contract updates for all remaining gaps |
| `apps/admin_backend/src/modules/inventory/**` | Modified | APIs, reports, RBAC, count/production workflows |
| `apps/pos_app/lib/{data,domain,ui}/features/inventory/**` | Modified | Offline persistence, sync, BOH UX |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| False “done” claim | High | PRD matrix + explicit closure metrics |
| Sync regressions | High | contract-first specs + idempotent ordering tests |
| Review overload | High | chained PRs, each <=400 changed lines |

## Rollback Plan

Ship additively behind new contracts/screens, keep current flows until parity, and rollback per slice by disabling new endpoints/UI paths without rewriting ledger history.

## Dependencies

- Archived implementation context, BCN FX source/cache, tenant-safe RBAC/audit primitives.

## Success Criteria

- [ ] Every PRD section and UC-01..UC-05 is tagged complete/partial/missing with zero unclassified gaps.
- [ ] Specs/design/tasks cover backend, POS persistence, sync, RBAC, BOH UX, reporting, lot/FIFO/expiry, FX/CPP, recipe versioning, production, and count sessions.
- [ ] Delivery is sliced into chained PRs: contracts, backend, POS sync, purchases+lots, recipes+production, counts+reporting.
- [ ] Feature is declared closed only after approved spec/design/tasks and later verification/UAT prove all closure metrics pass.
