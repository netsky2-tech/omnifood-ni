# Design: Configurable Fulfillment Topology

## Technical Approach

Extend the offline sale transaction and Kardex without another stock ledger. Plan inventory, routing, fulfillment, and print work before one SQLite commit; hardware and sync follow.

## Architecture Decisions

| Decision | Alternatives / tradeoff | Choice and rationale |
|---|---|---|
| Stock authority | Keep `Product.stock`; new ledger | `inventory_movements` remains canonical. `insumos.stock` is its projection; `Product.stock`/`existencia_actual` become compatibility-only, then are removed, preserving reversal lineage. |
| Direct resale | Product-only balance | `Product.inventoryPolicy=DIRECT_STOCK` requires `directStockInsumoId`; deductions target that canonical stock item and retain `soldProductId`/`originInvoiceItemId`. |
| Configuration | Mutable keys/device-count inference | Backend revisions plus SQLite snapshots; explicit multi-role capabilities preserve offline determinism. |
| Routing | Runtime category/name heuristics | Product action/station is authoritative; category values copy only when creating a product. Missing/invalid values become `DIRECT_HANDOFF/general-dispatch` plus an alert. |
| Fulfillment | Reuse `KitchenOrder` status | One fulfillment aggregate separates `routeState`, `printState`, and `deliveryState`; printing can never imply delivery. |
| Printing | Imperative retry | Durable jobs/attempts wrap `PrinterPort`; uncertain outcomes require operator resolution, preventing blind duplicates. |
| Synchronization | Endpoint-specific replay | One ordered tenant/device stream extends current idempotency/RLS patterns. |

## Data Flow and Contracts

`Sale plan → SQLite transaction(invoice/items/payments + Kardex + fulfillment + print jobs + outbox + DGI number advance) → print worker → sync worker → RLS transaction`

Topology v1 contains `tenantId, contractVersion, revision, operationMode, channels, devices[{deviceId,roles[],capabilities[]}], hash`. `GET /fulfillment/topology/current` returns authority; owner-only `POST /fulfillment/topology/revisions` requires `baseRevision` and returns `409` on conflict. POS rejects wrong tenant/version, lower revisions, or same-revision/different-hash. `shift_topology_bindings` freezes newer revisions until next shift; emergency activation requires supervisor capability, reason, device/time, and audit.

`fulfillments(id=invoiceId, channel, topologyRevision, routeState)` owns lines grouped action then station. `PRINT_ONLY` creates no KDS work; `KDS_ONLY` creates no ticket; `KDS_AND_PRINT` creates both. Active KDS requires a KDS channel and `deliveryState NOT IN (DELIVERED,CANCELED)`.

`print_jobs(jobId, fulfillmentId, documentKind, copyId?, sequence, state)` and `print_attempts(jobId, attemptNo, PENDING|PRINTING|PRINTED|FAILED|UNCERTAIN, evidence, actor/device/time)` are traceable. A shared printer claims receipt sequence 0 before one consolidated ticket sequence 1. Confirmed failure permits explicit retry; uncertainty requires “printed”, “retry as copy”, or “unresolved”. Reprints add marked `copyId`, reason, authorization, attempt, and audit only.

Outbox envelopes carry `tenantId, deviceId, sourceSequence, aggregateType, aggregateId, eventId, idempotencyKey, payloadHash, topologyRevision`; uniqueness is tenant-scoped. Synced fulfillment/print detail is purgeable after 90 days; invoices/Kardex are excluded.

## File / Schema Impact

| Action | Concrete surfaces |
|---|---|
| Create | POS `domain/models/fulfillment/*`, `data/{models,daos}/fulfillment/*`; backend `src/modules/fulfillment/{entities,dto,services,controllers}/*`; SQLite/`src/migrations/*FulfillmentTopology*.ts` migrations. |
| Modify | POS `product.dart`, `product_entity.dart`, `process_sale_inventory_use_case.dart`, `movement_engine*.dart`, `sales_transaction_dao.dart`, `sales_repository_impl.dart`, `sync_service.dart`, `kitchen_order_*`, `printer_port.dart`, history/KDS UI, `app_database.dart`, `migrations.dart`. |
| Modify | Backend inventory `product.entity.ts`, `inventory-movement.entity.ts`; onboarding `industry-template.service.ts`; sales `invoices.service.ts`/sync DTOs; identity permissions/audit; module registration and RLS policies. |
| Deprecate | Duplicate stock writes, `isPrepared`/name routing, and new legacy `kitchen_orders` writes; retain historical read adapters. |

Generated Floor/Freezed files (`app_database.g.dart`, `*.freezed.dart`, `*.g.dart`) and TypeORM migration/schema artifacts are regenerated/reviewed separately from authored-line budgets.

## Testing Strategy

RED-first unit tests cover policies/reversal, routing groups, channel/KDS predicates, shift activation, and print states. SQLite integration fault-injects transaction writes and proves atomic DGI advancement, ordering, retry/reprint non-duplication, purge exclusions, and replay. Nest db/E2E proves immutable revisions, `409`, RLS rejection, hash mismatch, and duplicate acknowledgement; Flutter E2E covers mixed offline sale, printer uncertainty, KDS delivery, and legacy tenants.

## Threat Matrix

| Boundary | Applicability | Safe/failure behavior; mandatory RED test |
|---|---|---|
| Documentation-like paths | N/A—no executable classification | None. |
| Git repository selection | N/A—no VCS automation | None. |
| Commit state | N/A—no VCS automation | None. |
| Push state | N/A—no VCS automation | None. |
| PR commands | N/A—no PR automation | None. |
| Business routing | Applicable: missing/invalid/stale profile | Complete offline sale via visible general dispatch; alert rather than omit/block. RED: each malformed/missing route includes every physical line exactly once. |
| Printer process | Applicable: unavailable, timeout, disconnect-after-send | Confirmed failure is retryable; ambiguous send becomes `UNCERTAIN`, never auto-retried or marked delivered. RED: fault at pre-send/post-send/response-loss preserves order and creates no duplicate business effects. |

These applicable cases must propagate unchanged to tasks.

## Migration, Rollout, Operations

Add nullable storage first. Behind an opt-in gate, evidence-backed BOM products may become `RECIPE_BOM`; others remain legacy until policy selection. Direct stock requires an insumo link and approved opening-balance Kardex movement. Report discrepancies; never rewrite history. Dual-read legacy data; gated writes use canonical paths. Pilot per tenant/device; rollback disables enforcement/workers but retains evidence. Observe fallback routes, conflicts, print uncertainty/failure, KDS age, outbox lag/duplicates, and purges. Recovery supports supervised activation, print resolution, and outbox resume.

## Review Slices

1. Contracts/policy RED tests; 2. additive POS migration/Kardex linkage; 3. atomic fulfillment/outbox; 4. print lifecycle; 5. backend revision/RLS; 6. sync/KDS/reprint UI; 7. migration/pilot/operations. Each authored slice targets `<400` changed lines; generated artifacts are isolated follow-ups.

## Open Questions

None.
