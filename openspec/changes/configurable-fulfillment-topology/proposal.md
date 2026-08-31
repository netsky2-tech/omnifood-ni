# Proposal: Configurable Fulfillment Topology

## Intent

Provide offline fulfillment without fragmented stock, duplicate aggregates, or device-count inference. Unified Kardex is the sole stock authority; `RECIPE_BOM`, `DIRECT_STOCK`, and `NOT_TRACKED` are distinct policies.

## Scope

### In Scope
- Backend-owned versioned provisioning for operation mode, `PRINT_ONLY`/`KDS_ONLY`/`KDS_AND_PRINT`, and multi-role devices.
- Product-level `PREPARE`/`DIRECT_HANDOFF` profiles and station; categories only seed defaults. Missing routes use general dispatch, raise an alert, and never block offline sale.
- Shift-frozen POS snapshots, next-shift activation, and supervised audited emergency activation.
- Durable printing: customer receipt first, then one consolidated ticket for all physical items; safe retry/reprint, ambiguity confirmation, and role/reason/audit controls.
- Fulfillment sync and retention: 90-day synced local detail and tenant-policy central metadata; invoices remain separately governed.

### Out of Scope
- Replacing Kardex; changing DGI numbering/cancellation; routine/unsupervised mid-shift activation; device-count KDS inference.
- Historical rewriting or automatic provisioning of existing tenants.

## Capabilities

### New Capabilities
- `tenant-fulfillment-provisioning`: modes, capabilities, revisions, activation, compatibility.
- `product-fulfillment-routing`: profiles, stations, defaults, fallback.
- `fulfillment-execution`: state semantics, channels, sync, retention.
- `durable-print-lifecycle`: ordered attempts, recovery, authorized copies.

### Modified Capabilities
- `inventory-kardex-ledger`: sole authority across three inventory policies.
- `inventory-recipe-bom`: recipe consumption without a parallel stock ledger.
- `sales-core`: atomic offline work creation and duplication-safe reprints.
- `inventory-sync-topologies`: idempotent fulfillment/print replay without duplicate aggregates.
- `identity`: permissions and append-only audit for activation and reprints.

## Approach

Dependency DAG: policies → canonical contract → provisioning, inventory, fulfillment, print foundations → atomic checkout/sync → reprints/pilot. Deliver strict-TDD slices under 400 changed lines: contract/migration; local aggregates/checkout; backend provisioning/RLS/sync; reprints/KDS/pilot.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `apps/pos_app/lib/{domain,data,presentation,ui}` | Modified | Offline execution |
| `apps/admin_backend/src/modules/{tenant,onboarding,identity,sales,inventory}` | Modified | Provisioning/RLS/sync |
| SQLite/TypeORM migrations and tests | New | Additive schema/proof |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Duplicate fiscal/stock/fulfillment work | High | Stable IDs, atomic commit, idempotent replay |
| Printer outcome ambiguity | High | No blind retry; explicit copy confirmation |
| Tenant behavior regression | Med | Opt-in provisioning and compatibility mapping |

## Migration and Rollback

Add nullable/versioned storage first; never infer roles or rewrite history. Existing tenants remain compatible until provisioned. Roll back enforcement gates while retaining append-only invoices, movements, fulfillment, print, and audit evidence.

## Success Criteria

- [ ] Offline checkout tolerates missing routing and creates one sale, inventory effect, and fulfillment aggregate.
- [ ] `PRINT_ONLY` records `ROUTED`/`PRINTED`, leaves no active KDS work, and never claims `DELIVERED`.
- [ ] Reconnect, retry, and reprint create zero duplicate invoice numbers, sales, movements, fulfillment/KDS work, or sync aggregates.
- [ ] RLS isolation, shift revision freezing, retention, emergency activation, and three modes pass automated tests.
