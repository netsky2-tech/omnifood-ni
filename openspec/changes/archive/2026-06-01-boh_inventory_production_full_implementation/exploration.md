## Exploration: boh_inventory_production_full_implementation

### Current State
Inventory capabilities already exist in both apps but are partial versus PRD scope. `apps/pos_app` executes offline-first stock movements locally (SQLite/Floor), supports recursive BOM expansion with depth guard, and captures unsynced deltas for later sync. `apps/admin_backend` receives and applies synced movements with transactional updates, but current movement model is not append-only-kardex grade (UUID PK, limited audit fields, no immutable sequential ledger semantics). Existing OpenSpec inventory specs cover core pieces (BOM, recursive expansion, purchases/WAC, shrinkage, FIFO/perishables) but do not yet define full PRD requirements like BCN FX conversion to NIO, immutable kardex correction model, production orders, recipe versioning, and high-value forensic alerts.

### Affected Areas
- `docs/PRDs/prd_gestion_inventario.md` — source requirements for BOH full implementation.
- `openspec/specs/inventory-*/spec.md` — baseline specs to extend/align (core, BOM, recursive BOM, purchases, movements, shrinkage, batch).
- `apps/admin_backend/src/modules/inventory/inventory.service.ts` — sync application and stock recomputation logic on server.
- `apps/admin_backend/src/modules/inventory/purchase.service.ts` — weighted-cost update path, currently no FX/BCN policy.
- `apps/admin_backend/src/modules/inventory/shrinkage.service.ts` — shrinkage movement handling and reason capture.
- `apps/admin_backend/src/modules/inventory/entities/inventory-movement.entity.ts` — current movement schema lacks append-only sequential kardex design.
- `apps/admin_backend/src/modules/inventory/entities/insumo.entity.ts` — stock/cost fields and UOM conversion baseline.
- `apps/admin_backend/src/modules/inventory/entities/recipe.entity.ts` — current flat recipe model, no explicit recipe versioning lifecycle.
- `apps/pos_app/lib/domain/services/inventory/movement_engine_impl.dart` — recursive BOM expansion, FIFO batch deductions, local movement generation.
- `apps/pos_app/lib/data/repositories/inventory/inventory_repository_impl.dart` — local persistence + sync queue behavior for offline-first.
- `apps/pos_app/lib/domain/usecases/inventory/process_sale_inventory_use_case.dart` — sale flow integration for movement generation.

### Approaches
1. **Incremental hardening on current model** — Extend existing entities/services/specs with minimum new tables and additive behavior.
   - Pros: Lower migration risk; reuses current inventory flow and tests; faster path to proposal/apply.
   - Cons: Higher chance of model debt (kardex immutability, recipe versioning, production orchestration can become fragmented); more adaptation logic later.
   - Effort: Medium

2. **Ledger-first BOH redesign (bounded subdomain inside inventory module)** — Introduce explicit kardex ledger aggregate, movement sequencer, cost engine, recipe versioning, and production-order domain; adapt POS sync contracts to delta-ledger semantics.
   - Pros: Best alignment with PRD, auditability, DGI-like traceability principles, and concurrency correctness; cleaner long-term extension.
   - Cons: Higher upfront design and migration effort; larger review surface; requires strict slicing/chained PR strategy.
   - Effort: High

### Recommendation
Use a **hybrid staged plan** with Approach 2 target architecture delivered through Approach 1-sized slices: define ledger-first domain in specs/design first, then implement in constrained phases (schema + engine + sync + POS adapters + alerts). This balances correctness (immutable kardex, FX-in-NIO, concurrency isolation, production orders) with reviewer budget and operational safety in an offline-first system.

Dependency map for proposal scoping:
- **Domain dependencies**: BOM + recursive expansion -> movement engine -> kardex ledger -> CPP calculator -> alerts/reporting.
- **Cross-app contract**: POS delta outbox format/order guarantees -> backend ingestion ordering/idempotency.
- **Compliance constraints**: Offline-first local SoT, multi-tenant isolation (`tenant_id`), immutable historical trace, reversal-over-delete.

### Risks
- Concurrency race conditions on CPP updates if per-insumo sequencing/locking is not formalized (SERIALIZABLE or FIFO queueing).
- Migration risk from current `inventory_movements` model to immutable sequential kardex without data loss.
- FX source-of-truth risk (BCN rate availability/caching by invoice date) causing accounting drift.
- Recursive BOM + versioning drift if historical sales are not bound to recipe version snapshots.
- Oversized implementation likely exceeds 400-line review budget unless split into chained PR work units.

### Ready for Proposal
Yes — proceed to `sdd-propose` with explicit phased delivery, chained PR recommendation, migration/rollback strategy, and contract-first definitions for POS-backend delta synchronization.
