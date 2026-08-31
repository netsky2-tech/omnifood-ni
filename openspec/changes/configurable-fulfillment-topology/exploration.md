# Exploration: Configurable Fulfillment Topology

## Current State

The POS already has a `TenantOperationMode` value object with `FOODPARK_QSR`, `RESTAURANT`, and `HYBRID`, including table/buzzer/direct-checkout helpers. Configuration is currently fragmented: the POS has `TenantConfigService` and `PrinterConfigService`, while backend capability versioning exists only for audit capability (`TenantCapabilityService`) and is not a fulfillment contract.

Sales are orchestrated by `SaleViewModel`; inventory processing is delegated to `ProcessSaleInventoryUseCase` and `MovementEngine`. Recipes can contain `INSUMO` or `PRODUCT` ingredients, while both `Product` and `Insumo` have stock fields. This means the design must establish one authoritative stock ledger per inventory policy and explicitly handle product resale stock; otherwise product stock and insumo movements can diverge. Existing inventory DAO/sync tests show SQLite movements are durable and replayable, but do not prove resale-without-BOM behavior.

Kitchen orders currently expose a single `station` and lifecycle timestamps/statuses. Printer ports expose imperative operations such as invoice, kitchen-order, and raw printing, but the explored contract does not show durable print-attempt records, retry/reprint identity, or a topology-driven routing contract. Existing tests cover printer adapters, checkout printing, KDS/buzzer flows, tenant configuration, inventory movement use cases, and offline sync, but no complete topology/provisioning contract.

Backend entities are tenant-scoped through `tenant_id`, and RLS transaction setup is present. `Tenant` provisioning and onboarding templates are existing integration points. The current backend inventory model has both `Product.stock` and `Insumo.stock`/`existenciaActual`; recipe resolution is backend-versioned, but the POS also stores recipes locally. Existing OpenSpec work confirms sales history/reversal and sync aggregate boundaries, but does not define fulfillment topology.

## Affected Areas

- `apps/pos_app/lib/domain/models/config/tenant_operation_mode.dart` — existing operation-mode enum is a foundation, not the complete contract.
- `apps/pos_app/lib/domain/services/config/tenant_config_service.dart` and `printer_config_service.dart` — fragmented local configuration must become a versioned offline-first snapshot.
- `apps/pos_app/lib/presentation/features/sales/view_models/sale_view_model.dart` — checkout must atomically persist sale, inventory movements, and fulfillment/print work without creating duplicate fiscal aggregates.
- `apps/pos_app/lib/domain/usecases/inventory/process_sale_inventory_use_case.dart`, `movement_engine.dart`, recipe/inventory repositories — implement `RECIPE/BOM`, `DIRECT_STOCK`, and `NOT_TRACKED` without dual-stock divergence.
- `apps/pos_app/lib/domain/models/kitchen/*`, kitchen DAOs/services, and KDS UI — model grouped `PREPARE`/`DIRECT_HANDOFF`, station routing, printed/routing traceability, and prevent PRINT_ONLY accumulation.
- `apps/pos_app/lib/domain/ports/printer_port.dart`, printer adapters, print DAOs/entities — add durable attempt state (`PENDING`, `PRINTING`, `PRINTED`, `FAILED`), retry/reprint metadata, and device/user/time evidence.
- `apps/pos_app/lib/ui/features/sales/*` history/checkout — reprint customer receipt, fulfillment ticket, or both as copy operations only.
- `apps/admin_backend/src/modules/tenant`, `onboarding`, `identity`, `sales`, and `inventory` — publish/provision the unified tenant contract, enforce tenant isolation, and synchronize fulfillment traceability.
- SQLite migrations/generated Floor database and PostgreSQL TypeORM migrations/entities — compatibility, backfill, and rollback surfaces.
- Existing tests under `apps/pos_app/test/{domain,data,presentation,ui,integration}` and `apps/admin_backend/src/**/**.spec.ts`, `test/**` — strict-TDD proof for invariants and rollout.

## Dependency DAG

```text
Product decisions (stock authority, routing semantics, defaults, reprint permissions)
  ├─> canonical topology/config contract + version/revision
  │     ├─> backend provisioning/RLS contract
  │     └─> POS SQLite snapshot/cache + compatibility defaults
  ├─> inventory policy resolver (BOM | DIRECT_STOCK | NOT_TRACKED)
  ├─> fulfillment aggregate/routing model (prepare/direct handoff/station)
  │     └─> KDS suppression/traceability rules
  └─> durable print-attempt aggregate/port
        └─> checkout orchestration + retry/reprint workflows

Canonical contract + inventory/fulfillment/print foundations
  └─> atomic single-device checkout and sync idempotency
        └─> history reprints, rollout pilot, operational metrics
```

Critical path: resolve product decisions → define versioned contract and stock authority → implement local persistence and atomic checkout → prove offline sync/idempotency. Parallel-safe branches after the contract: backend provisioning/RLS, inventory policy, fulfillment state model, and printer durability, provided they share explicit integration schemas.

## Confirmed Gaps and Defects to Reproduce

- Existing code has recipes with `PRODUCT` and `INSUMO` ingredients, but no repository evidence in this exploration proves a no-BOM resale product creates a `DIRECT_STOCK` movement; this must be a RED test before implementation.
- Routing currently exposes `KitchenOrder.station`; the requested heuristic-by-category/name defect is not fully visible in the indexed source and needs targeted reproduction during proposal/design.
- KDS accumulation for one-device tenants is a stated defect; current explored models lack an explicit PRINT_ONLY suppression/routing state, so it remains unproven until the kitchen persistence path is inspected in the next phase.
- Durable print status, attempt history, retry/reprint authorization, and copy classification are absent from the explored printer port/model evidence.
- Provisioning does not yet expose the requested unified topology contract; existing onboarding and audit capability versioning are separate concerns.

## Approaches

1. **Unified versioned topology snapshot with explicit fulfillment and inventory policies** — introduce a tenant-scoped contract consumed identically by backend provisioning and POS SQLite, with device roles/capabilities authoritative over device count; keep sale, inventory, fulfillment, and print records separate but atomically created locally.
   - Pros: preserves offline source of truth, makes routing deterministic, supports backward-compatible defaults and idempotent reprints.
   - Cons: requires coordinated migrations and contract version handling across Flutter/NestJS.
   - Effort: High

2. **Incrementally extend existing config, kitchen orders, and printer methods** — add fields to current models without a unified aggregate/snapshot.
   - Pros: smaller first diff.
   - Cons: repeats fragmentation, encourages device-count inference, makes atomicity and reprint non-duplication difficult to prove.
   - Effort: Medium initially, High total risk

## Recommendation

Proceed with Approach 1, but split delivery into reviewable vertical slices under the 400-line budget: (1) contract, defaults, migrations, and stock-authority decision; (2) durable local fulfillment/print records plus atomic checkout and inventory policy; (3) backend provisioning/sync/RLS and compatibility; (4) history reprints, KDS/PRINT_ONLY behavior, and pilot evidence. Do not mark a KDS item `ENTREGADO` merely because it was printed; use explicit printed/routed traceability.

## Migration, Compatibility, Rollout, and Rollback

- Add nullable/versioned fields and new tables first; preserve legacy configuration readers and map existing tenants to an explicit documented default, likely requiring product confirmation before choosing `FOODPARK_QSR`/PRINT_ONLY.
- Backfill topology snapshots and derive fulfillment/stock policy only where evidence is safe; do not infer device roles from count or silently rewrite historical invoices/movements.
- Dual-read during migration, validate contract revision and tenant ownership, then enable enforcement per tenant behind a capability/feature gate.
- Roll out to a single-device Food Park pilot with offline, printer failure, retry, reprint, and reconnect evidence. Rollback disables new enforcement and retains append-only fulfillment/print traceability; it must not delete invoices, movements, or attempts.

## Tests and Review Breadth

Strict TDD requires RED tests for: no-BOM direct-stock decrement; recipe/BOM movement quantities; NOT_TRACKED; atomic sale+inventory+fulfillment persistence; consolidated station grouping; PRINT_ONLY no-active-KDS accumulation; durable print state transitions/retries; authorized reprints without fiscal/inventory/KDS duplication; versioned offline config and stale revision handling; backend tenant isolation and idempotent sync. Expected change breadth is high (roughly 4–7 slices, each targeted below 400 changed lines; generated Floor/TypeORM code may require a documented exception).

## Unresolved Decisions

- What is the canonical stock source for `DIRECT_STOCK`: product stock ledger, insumo ledger, or a unified inventory movement abstraction? How are existing `Product.stock` and `Insumo.existenciaActual` reconciled?
- What default topology and fulfillment mode apply to existing tenants, and is migration opt-in or automatic?
- Exact device roles/capabilities and whether one device may hold multiple roles.
- Station assignment authority: product master data, explicit line configuration, or a versioned routing table; what happens when routing is missing?
- Meaning of `DIRECT_HANDOFF` for preparation, customer notification, and completion timestamps.
- Retention period and deletion/anonymization policy for print attempts and fulfillment traceability.
- Which roles may reprint each document, whether a reason is mandatory, and how copies appear on paper/audit reports.
- Backend ownership of topology changes, offline conflict resolution, and whether config revision changes can take effect mid-shift.

## Ready for Proposal

No — repository evidence supports the architecture direction, but the proposal should first ask the product owner to resolve the stock-authority/default-topology/reprint-policy decisions above. The next proposal question round should also authorize targeted inspection/reproduction of the exact station-routing and one-device KDS persistence paths.
