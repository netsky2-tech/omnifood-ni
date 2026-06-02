# Proposal: BOH Inventory Production Full Implementation

## Intent

**Problem**: Current BOH inventory covers partial BOM, stock sync, and movements, but misses PRD-critical guarantees: immutable kardex, BCN FX→NIO CPP, recipe versioning, production orders, forensic alerts, and full Topology A/B contracts.
**Goals**: deliver full PRD coverage, lock scope against UC-01..UC-05, and preserve offline-first + audit integrity.

## Scope

### In Scope
- Phase 0: scope lock + PRD acceptance matrix by section/UC.
- Phases 1-9: domain contracts, schema/migrations, transactional CPP/kardex engine, multi-level BOM+yields, shrinkage+production batches, Topology A/B sync, FOH integration+alerts, full tests, UAT/docs/PR readiness.

### Out of Scope
- New accounting module, supplier AP, or cloud-only redesign.
- Implementation before `sdd-spec`, `sdd-design`, and `sdd-tasks` complete.

## Capabilities

### New Capabilities
- `inventory-kardex-ledger`: PRD §1-5 immutable sequential ledger, BCN FX-by-date, compensating adjustments, high-value forensic alerts.
- `inventory-production-orders`: PRD §2.5 production batches, yields, consumption+receipt costing, recipe version snapshots.
- `inventory-sync-topologies`: PRD §1 ordered delta/outbox contracts for Topology A/B with idempotent backend ingestion.

### Modified Capabilities
- `inventory-core`: dual UOM, negative-stock policy, acceptance matrix anchors.
- `inventory-recipe-bom`: technical yield/shrink, sub-recipes, version lifecycle.
- `inventory-recursive-bom`: historical version binding during explosion.
- `inventory-purchasing`: NIO-only CPP with BCN conversion by invoice date.
- `inventory-movements`: append-only correction model, SERIALIZABLE/FIFO protections, FOH reversal integration.
- `inventory-shrinkage`, `inventory-batch-management`, `inventory-ui-alerts`, `sales-core`: typed shrinkage, batch-aware costing, admin/operator alerts, FOH audit hooks.

## Approach

Ledger-first target, delivered in chained review slices <=400 lines: schema/contracts -> engine -> BOM/production -> sync/FOH -> tests/docs. Phase order is fixed: 0,1,2,3,4,5,6,7,8,9. Use contract-first OpenSpec deltas, then design, then tasks, then implementation.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `docs/PRDs/prd_gestion_inventario.md` | Modified | Acceptance source |
| `openspec/specs/inventory-*` | Modified/New | PRD deltas and new specs |
| `apps/admin_backend/src/modules/inventory/**` | Modified | Ledger, CPP, sync, alerts |
| `apps/pos_app/lib/**/inventory/**` | Modified | Offline engine, outbox, FOH hooks |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| CPP race conditions | High | SERIALIZABLE/FIFO per insumo |
| Ledger migration drift | High | additive migrations + replay verification |
| Oversized reviews | High | chained PRs by work unit |
| FX/date inconsistency | Med | BCN cache + deterministic fallback |

## Rollback Plan

Ship additively behind contracts; preserve old movement paths until parity; rollback by disabling new ingestion/engine modules and reverting additive migrations that do not rewrite history.

## Dependencies

- Existing inventory specs, BCN FX source/cache, tenant-safe alert delivery, FOH sales movement contract.

## Success Criteria

- [ ] PRD sections 1-5 map to approved specs/design/tasks with no uncovered items.
- [ ] UC-01 BCN FX CPP, UC-02 offline delta replay, UC-03 negative stock, UC-04 count adjustment, UC-05 recipe versioning each pass automated acceptance.
- [ ] Review plan recommends chained PR slices within 400-line budget.
- [ ] UAT/docs/PR package proves implementation readiness only after spec/design/tasks approval.
