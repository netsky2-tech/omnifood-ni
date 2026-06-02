# Design: BOH Inventory Production Full Implementation

Implements the PRD with a ledger-first flow: every BOH event becomes an immutable movement intent, is persisted locally first on Flutter/SQLite, and is ingested by NestJS/PostgreSQL into an append-only kardex with deterministic CPP and ordered sync semantics.

## Technical Approach

NestJS remains feature-modular and service-led. Flutter remains offline-first with Floor + repositories + `ChangeNotifier` ViewModels. The change adds a canonical movement pipeline used by purchases, shrinkage, production, FOH sale/cancel, and Topology A/B replay. Specs covered: `inventory-kardex-ledger`, `inventory-production-orders`, `inventory-sync-topologies`, plus deltas for purchasing, movements, BOM, batches, shrinkage, alerts, and sales-core.

## Architecture Decisions

| Decision | Options | Choice | Rationale |
|---|---|---|---|
| CPP concurrency | optimistic writes; SERIALIZABLE tx; app FIFO only | Use `SERIALIZABLE` + `SELECT ... FOR UPDATE` on `insumos`, with optional per-insumo queue for replay workers | Satisfies PRD/NFR and keeps one correctness rule for purchases, production, shrinkage, and replay. |
| Backend shape | full CQRS; flat services only | Keep current Nest feature module, add focused command services and outbox processor, no full CQRS bus | Matches current repo patterns and avoids circular complexity. |
| Sync contract | absolute stock sync; delta sync | Ordered outbox deltas with idempotency key + source sequence | Matches Topology B PRD and prevents stock overwrite corruption. |
| Recipe history | edit in place; immutable versions | Versioned recipe headers + snapshot binding on sale/production docs | Required for UC-05 and historical cost audits. |

## Data Flow

```text
Flutter ViewModel -> Repository -> Floor @transaction
  -> local movement + outbox row + stock/cache update
  -> SyncService posts ordered deltas

NestJS controller -> command service -> serializable DB tx
  -> lock insumo(s) -> compute CPP / balances -> insert kardex
  -> update insumos/batches -> insert outbox/alert rows
  -> async listeners send admin/operator alerts
```

## File Changes

| File | Action | Description |
|---|---|---|
| `apps/admin_backend/src/modules/inventory/entities/insumo.entity.ts` | Modify | Align columns to PRD `insumos`: code, UOM, `existencia_actual`, `costo_promedio_nio`, min/max, negative-stock policy. |
| `apps/admin_backend/src/modules/inventory/entities/recipe.entity.ts` | Replace | Split current flat recipe row into recipe header/version model plus recipe detail rows. |
| `apps/admin_backend/src/modules/inventory/entities/inventory-movement.entity.ts` | Replace | Convert UUID movement log into append-only PRD kardex with `BIGSERIAL`, costing snapshots, origin metadata, compensation links. |
| `apps/admin_backend/src/modules/inventory/entities/*.ts` | Create | Add `recipe-detail`, `shrinkage`, `shrinkage-detail`, `production-order`, `production-order-line`, `inventory-sync-outbox`, `inventory-sync-receipt`, `fx-rate-cache`, `forensic-alert`. |
| `apps/admin_backend/src/modules/inventory/*.service.ts` | Modify/Create | Add movement posting, purchase pricing, production confirmation, recipe versioning, replay ingestion, and alert dispatch services. |
| `apps/admin_backend/src/modules/inventory/inventory-movement.controller.ts` | Modify | Replace generic sync endpoint with validated purchase, shrinkage, production, and delta replay contracts. |
| `apps/admin_backend/src/modules/sales/services/invoices.service.ts` | Modify | Emit immutable BOH movement intents for finalize/cancel without rewriting invoice history. |
| `apps/admin_backend/src/migrations/<timestamp>-BohInventoryLedgerFoundation.ts` | Create | Exact PRD §3 schema migration plus indexes, uniques, and backfill-safe additive rollout. |
| `apps/pos_app/lib/data/database/app_database.dart` | Modify | Register Floor entities/DAOs aligned to implemented POS inventory scope (insumos/products/recipes/movements/purchases/suppliers/warehouses/uom/batches). Advanced BOH projection tables (recipe versions, production orders, kardex cache, outbox projections) remain backend-led and are deferred from local Floor registration in this change to avoid high-risk schema churn. |
| `apps/pos_app/lib/data/daos/inventory/*.dart` | Modify/Create | Add local transactional writers; all `@transaction` methods use positional args only. |
| `apps/pos_app/lib/data/services/sync_service.dart` | Modify | Sync inventory outbox separately from sales, preserving source order and idempotency. |
| `apps/pos_app/lib/domain/models/inventory/*.dart` | Modify/Create | Freezed models for kardex entry, recipe version, production order, shrinkage, outbox message. |
| `apps/pos_app/lib/ui/features/inventory/**` | Modify/Create | New `ChangeNotifier` ViewModels and views for production, shrinkage typing, forensic notices, and recipe version UX. |

## Interfaces / Contracts

```ts
type InventoryDeltaDto = {
  idempotencyKey: string;
  sourceDeviceId: string;
  sourceSequence: number;
  tenantId: string;
  documentType: 'SALE' | 'SALE_CANCEL' | 'PURCHASE' | 'SHRINKAGE' | 'PRODUCTION';
  recipeVersionId?: string;
  invoice?: {
    items: Array<{ productId: string; quantity: number; recipeVersionId?: string }>;
  };
  movements: Array<{ insumoId: string; quantity: string; unitCostNio?: string; batchRefs?: string[] }>;
};

type NegativeStockPolicy = 'ALLOW_TEMPORARY' | 'RESTRICT';
```

```dart
@transaction
Future<void> persistInventoryCommand(CommandEnvelope envelope, List<MovementEntity> movements)
```

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit | CPP, FX-by-date conversion, BOM explosion, recipe snapshot binding | Jest service tests + Flutter repository/use-case tests with fixed 4-decimal fixtures. |
| Integration | Postgres serializable posting, idempotent replay, compensating adjustments, production atomicity | Nest tests against real DB transactions and migration-backed schema. |
| E2E | FOH finalize/cancel, Topology B offline replay, operator/admin alerts | Supertest for backend contracts; Flutter widget/repository tests for local-first flows. |

## Migration / Rollout

Additive rollout only. First ship schema + dual-write capable services, then switch controllers/sync to new ledger pipeline, then retire legacy movement fields after parity verification. No destructive invoice/history rewrite. SQLite migration adds outbox/version tables and preserves old movement rows until replay parity is proven.

## Open Questions

- [x] Topology sync shape: Use exactly the same Outbox table structure for both topologies, differentiating transport by environment flag (`ROLE=EDGE_SERVER` vs `ROLE=STANDALONE`). Tablets sync via micro-batches, whereas the local server buffers 500 records into a compressed (GZIP) JSON "Batch Envelope", makes a single massive POST to `/api/v1/sync/batch`, and updates status locally upon 200 OK.
- [x] Production batch expiry: Implement "Valuation Traceability" and a "Soft" (Physical/Operational) expiry policy only. Strict system-controlled FIFO lot depletion is NOT required for this PRD.
