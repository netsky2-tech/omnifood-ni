# Review Ledger: Q80 reconnect auth and inventory outcome — Slice 4

## 4R Findings and Resolution Matrix

| ID | Lens | Location | Severity | Status | Resolution / Evidence |
|---|---|---|---|---|---|
| R1-001 | risk | `inbound-sync.service.ts:213-228` | BLOCKER | closed | Bound `set_config('app.tenant_id', tenantId, true)` before querying mapping repository under forced RLS. |
| R1-002 | risk | `product-inventory-mapping.service.ts:16-46` | BLOCKER | closed | Bound `set_config('app.tenant_id', tenantId, true)` inside transaction runner for lookups and atomic supersession. |
| R1-003 | risk | `1802000000000-CreateProductInventoryMappingVersions.ts:40-58` | CRITICAL | closed | Trigger `guard_mapping_version_history()` now rejects any change to `id`, `created_at`, `tenant_id`, `product_id`, `insumo_id`, and `effective_at`, and forbids updating already-closed rows. |
| R1-004 | risk | `1802000000000-CreateProductInventoryMappingVersions.ts:60-72` | CRITICAL | closed | Down migration temporarily disables RLS to inspect true row count before drop; aborts if evidence exists. |
| R1-005 | risk | `inbound-sync.service.ts:200-210` | CRITICAL | closed | Mapping delta cursor checks `created_at > :sinceDate` in addition to `effective_at` and `superseded_at`. |
| R1-006 | risk | `product.entity.ts`, `1802000000000-CreateProductInventoryMappingVersions.ts:5-15` | CRITICAL | closed | Migration safely adds `PREPARED` to `products_product_type_enum` via idempotent dynamic SQL block. |
| R4-001 | resilience | `product-inventory-mapping.service.ts` | BLOCKER | closed | Deduplicated with R1-001/R1-002: RLS bound with tenant context on all operations. |
| R4-002 | resilience | `1802000000000-CreateProductInventoryMappingVersions.ts` | CRITICAL | closed | Deduplicated with R1-004: Down guard verifies evidence without RLS filtering. |
| R4-003 | resilience | `inbound-sync.service.ts` | CRITICAL | closed | Deduplicated with R1-005: Mapping cursor includes `created_at`. |
| R4-004 | resilience | `inbound-sync.service.ts:220-235` | CRITICAL | closed | Projected active mappings filter `effective_at <= :now AND (superseded_at IS NULL OR superseded_at > :now)`. |
| R4-005 | resilience | `product-inventory-mapping.service.ts:40-48` | CRITICAL | closed | `supersede()` acquires `pg_advisory_xact_lock(hashtext(tenantId), hashtext(productId))` to prevent concurrent first-write races. |
| R4-006 | resilience | `inventory.module.ts:115-135` | CRITICAL | closed | `ProductInventoryMappingService` added to both `providers` and `exports` of `InventoryModule`. |
| R4-007 | resilience | `sync_service.dart:1415-1440` | WARNING | closed | Local `sku`, `barcode`, and `category` are preserved when updating products from mapping-only deltas. |
| R2-001 | readability | `sync_service.dart`, `product_mapping_test.dart` | CRITICAL | closed | Both `PREPARED` and `COMPOUND` set `isPrepared: true` for sales recipe binding compatibility. |
| R2-002 | readability | `product.dart`, `product_entity.dart` | WARNING | closed | Product domain and Floor entities explicitly validate `productType` with default `'SIMPLE'`. |
| R2-003 | readability | `migrations.dart`, `sync_service.dart` | WARNING | closed | Reverted formatter churn; tracked diff reduced to minimal functional changes (21 and 29 lines respectively). |
| R2-004 | readability | `product-inventory-mapping.service.spec.ts` | WARNING | closed | Unit tests verify interval boundaries, advisory lock, atomic rollback, and RLS set_config calls. |
| R2-005 | readability | `sale_view_security_flows_test.mocks.dart` | SUGGESTION | closed | Restored mock file to HEAD; excluded unrelated auth changes from Slice 4 diff. |
| R2-006 | readability | `Zone.Identifier` | WARNING | closed | Preserved untracked and untouched as required. |
| R2-007 | readability | `apply-progress.md` | WARNING | closed | Updated apply progress with exact test results, DB spec proof, and clean status. |
| R3-001 | reliability | RLS set_config | CRITICAL | closed | Deduplicated with R1-001 / R1-002 / R4-001. |
| R3-002 | reliability | Effective time boundary | CRITICAL | closed | Deduplicated with R4-004. |
| R3-003 | reliability | Mapping delta cursor | CRITICAL | closed | Deduplicated with R1-005 / R4-003. |
| R3-004 | reliability | COMPOUND recipe compatibility | CRITICAL | closed | Deduplicated with R2-001. |
| R3-005 | reliability | DI registration | CRITICAL | closed | Deduplicated with R4-006. |
| R3-006 | reliability | PostgreSQL enum migration | CRITICAL | closed | Deduplicated with R1-006. |
| R3-007 | reliability | Migration PostgreSQL DB spec | BLOCKER | closed | Added `1802000000000-CreateProductInventoryMappingVersions.db.spec.ts` running real PostgreSQL tests (PASS). |

## Slice 5A — fresh-context reliability corrective rerun

| ID | Severity | Status | Resolution / Evidence |
|---|---|---|---|
| R3-001 | BLOCKER | closed | Snapshot constructor copies caller bindings before `UnmodifiableListView`; focused test mutates the source list and proves frozen JSON/bindings retain the original value. |
| R3-002 | BLOCKER | closed | Sync mapper omits snapshot/version and invoice policy/outcome/reason keys for legacy payloads; exact legacy-key test passes. |
| R3-003 | CRITICAL | closed | Removed nested `snapshotVersion`; item-level `inventorySnapshotVersion` is required to equal `SALE_TIME_V1` at mapper boundaries. Exact D3 JSON shape and contradictory persisted values are tested. |
| R3-004 | CRITICAL | closed | Immutable contract enforces positive finite quantities, D3 disposition/classification/ID/reason/binding combinations, recognized reasons, and stable contiguous binding ordinals without reassignment. |
| R3-005 | WARNING | closed | Focused tests cover five additive columns and idempotent migration, snapshot/version/outcome mapper parity, quantity preservation, legacy omission, and build-runner schema generation. |

## Slice 5A — second bounded corrective pass (user-authorized)

| ID | Severity | Status | Resolution / Evidence |
|---|---|---|---|
| R3-003 | CRITICAL | closed | `SalesMapper.toSyncJson` now validates every item before serialization, so a non-null `inventorySnapshotVersion` without an `inventorySnapshot` throws rather than omitting both keys and emitting a legacy payload. Focused outbound test passes. |
| R3-004 | CRITICAL | closed | D3 now requires DIRECT's sole binding to have null `recipeComponentId`, and every RECIPE binding to carry a non-empty component ID. Tests reject direct-with-component, recipe missing/empty component, non-contiguous and unsorted ordinals, and non-finite quantity; no ordinal sorting/reassignment occurs. |
| R3-005 | CRITICAL | closed | `toInvoiceEntity` and `toInvoiceDomain` now map `inventoryPolicyVersion`, `inventoryOutcome`, and `inventoryOutcomeReason`. A domain → entity → domain → wire payload round-trip proves all three survive the Floor mapper boundary and serialization. |

### Final scoped re-review

**PASS — zero remaining findings.** Fresh-context reliability re-review confirmed R3-003, R3-004, and R3-005 closed with no same-boundary regression.
