# Tasks: Configurable Fulfillment Topology

## Review Workload Forecast

Estimated authored changes: 1,400–1,900; generated artifacts are reviewed separately.
Delivery: `ask-on-risk` (decision resolved for chaining). Suggested split: PR #1 contracts → #2 POS → #3 backend/RLS → #4 print/KDS → #5 pilot.

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

### Corrected Work Units

| Unit | Slice | Test | Runtime / rollback / base |
|---|---|---|---|
| 1 | Contracts/value objects/routing fallback | `flutter test test/domain` | N/A: no persistence; revert domain; base tracker |
| 2 | POS schema, generated bindings, Kardex, atomic sale | `flutter test test/data` | Offline checkout; disable gate; base PR #1 |
| 3 | Backend provisioning, RLS, outbox replay | `npm run test:e2e` | T1/T2 replay; disable endpoints; base PR #2 |
| 4 | Durable print, KDS, reprint and retention | `flutter test test/presentation` | Fault-injection/delivery; disable workers; base PR #3 |
| 5 | Backfill, observability, pilot evidence | `npm test && flutter test` | Offline→reconnect pilot; disable enforcement/purge; base PR #4; tracker→main |

## Dependency DAG

`1→2→3→4→5`. Unit 1 has no database registration; Unit 2 adds sale persistence and Floor/Freezed output. Unit 3 consumes event contracts; Unit 4 consumes aggregates; Unit 5 consumes migrations/signals.

## Phase 1: Contracts (PR #1)

- [x] 1.1 RED: test immutable topology, inventory policy, route/channel/state objects and DGI identities; GREEN implement `apps/pos_app/lib/domain/models/fulfillment/*` and policy/routing services; REFACTOR keep validation infrastructure-free.
- [x] 1.2 RED beside GREEN: malformed/missing/stale profiles retain every physical line once in visible `DIRECT_HANDOFF/general-dispatch`, alert, and never block offline sale; REFACTOR table coverage.
- [x] 1.3 RED beside GREEN: pre-send failure, post-send disconnect, and response loss preserve order, retry only confirmed failure, and mark ambiguity `UNCERTAIN`; REFACTOR fault matrix.

## Phase 2: POS Persistence and Kardex (PR #2)

- [x] 2.1A RED: direct-stock/no-BOM, recipe, not-tracked, and legacy compatibility; GREEN add product policy persistence, nullable Floor migration, and policy-based Kardex planning; generate/review required Floor/Freezed output; REFACTOR compatibility reads.
- [x] 2.1B RED: transaction failure, DGI ordering, and cancellation/reversal lineage; GREEN make fiscal advancement and cancellation effects atomic in the sale transaction; REFACTOR transaction boundaries. Depends on 2.1A.
- [ ] 2.2 RED: offline mixed checkout creates one sale, fulfillment, print job, and outbox; GREEN wire `sales_repository_impl.dart`, shift-frozen snapshot DAOs, tenant/version/hash validation and emergency audit; REFACTOR idempotent local identities.

## Phase 3: Backend Provisioning and Sync (PR #3)

- [ ] 3.1 RED: immutable revision, base conflict `409`, legacy compatibility, RLS isolation, append-only audit, and cross-tenant rejection; GREEN add fulfillment DTOs/controllers/services, TypeORM migrations/entities, permissions and policies; generate/review TypeORM artifacts here; REFACTOR pipes.
- [ ] 3.2 RED: duplicate reconnect acknowledgement; GREEN implement ordered tenant/device outbox replay and sync DTOs; REFACTOR observability for lag/duplicates.

## Phase 4: Execution and Recovery (PR #4)

- [ ] 4.1 RED: PRINT_ONLY/KDS_ONLY/KDS_AND_PRINT, active-query suppression, delivery independence; GREEN wire `kitchen_order_*`, KDS/history UI and `sync_service.dart`; REFACTOR legacy read adapter.
- [ ] 4.2 RED beside GREEN: durable attempts, receipt-before-ticket, safe retry, uncertainty resolution, authorized copy audit, 90-day purge excluding invoices/Kardex; update `printer_port.dart` and UI; REFACTOR metrics/alerts.

## Phase 5: Rollout Proof (PR #5)

- [ ] 5.1 RED: backfill discrepancy, rollback, retention, and pilot acceptance tests; GREEN add gated compatibility/backfill/rollback runbooks and dashboards; REFACTOR record end-to-end evidence for legacy tenants, modes, offline sale, replay, reprint, RLS and observability.
