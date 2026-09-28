# sync-surface-expansion

## Goal
Close audit Batch 5: H1 (unsynced-count observability), H2 (loyalty point transactions outbound), H3 (cash shifts outbound), M1-M4 (inbound deltas: loyalty programs, promotions, customers, kitchen orders).

## Slices (chained, one work-unit commit each)

### 5a — H1 unsynced count observability (localized)
- File: `apps/pos_app/lib/data/services/sync_service.dart:274-301`
- Replace 6x `catch (_) {}` with warning logs naming the failed domain.
- Badge count logic unchanged (fault isolation preserved).

### 5b — H2 loyalty point transactions outbound
- POS: new `getUnsyncedPointTransactions()` DAO query + `_syncLoyaltyPointTransactions()` domain in `triggerManualSync()` + mark-synced.
- Backend: ingestion endpoint (loyalty module) accepting point-transaction batch, tenant-scoped.
- Tests both sides.

### 5c — H3 cash shifts outbound
- POS: new domain in `triggerManualSync()` for `cashier_sessions` + `cash_movements`.
- Backend: sync ingestion into `cash_shift_sessions` (entity exists; human endpoints already exist).
- Tests both sides.

### 5d — M1-M4 inbound deltas
- Backend: `InboundSyncService` delta keys for `loyaltyPrograms`, `promotions`, `customers`, `kitchenOrders` (entities: loyalty + promotions modules exist; customers module exists).
- POS: handlers in `_pullInboundDeltas()`.
- Local tables: verify POS Floor entities exist for each (loyalty program/reward entities exist; verify customer/kitchen).
- Tests both sides.

## Constraints
- Offline-first: outbound domains must be fault-isolated via `_runDomain` like existing domains.
- Backend RLS: every ingestion path tenant-scoped via existing guards (`SyncTransportGuard` / `RequireSyncScopes`).
- DGI: no changes to invoice/fiscal domains.
- Chain slices: do not start 5b before 5a is committed; recalibrate after each slice.

## Status
- [ ] 5a
- [ ] 5b
- [ ] 5c
- [ ] 5d

## Commits
- 5a: `fix(sync): log unsynced-count domain failures instead of swallowing`
- 5b: `feat(sync): push loyalty point transactions outbound`
- 5c: `feat(sync): push cash shifts outbound`
- 5d: `feat(sync): pull loyalty/promotions/customers/kitchen deltas inbound`
