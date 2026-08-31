# Tasks: Configurable Fulfillment Topology

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | 1,200–1,700 authored; generated artifacts add reviewer impact |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR #1 contracts/migration → PR #2 POS sale → PR #3 backend/sync → PR #4 print/KDS → PR #5 pilot; PR #1 base = feature/tracker branch; each later PR base = immediate previous PR branch; only tracker integrates to main |
| Delivery strategy | ask-on-risk |
| Chain strategy | feature-branch-chain (Rama integradora) |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Test | Runtime harness | Rollback boundary |
|---|---|---|---|---|
| 1 | Contracts/schema; base = feature/tracker branch | `flutter test test/domain`; `npm test` | N/A: storage only | Revert nullable schema |
| 2 | POS Kardex/checkout; base = PR #1 branch | `flutter test test/data` | Offline mixed checkout | Disable canonical gate |
| 3 | Backend/RLS/replay; base = PR #2 branch | `npm run test:e2e` | T1/T2 reconnect replay | Disable worker/endpoints |
| 4 | Print/KDS/reprint; base = PR #3 branch | `flutter test test/presentation` | Printer faults + delivery | Disable worker/UI entries |
| 5 | Pilot/operations; base = PR #4 branch; tracker alone merges to main | `npm test && flutter test` | Offline→reconnect pilot | Disable purge/enforcement |

## Dependency DAG

`1.1→1.2→2.1→2.2→2.3→3.2→4.1→4.2→5.1`; `1.1→3.1`; `1.3→4.1`. Critical path: schema → POS atomic sale → backend replay → print/KDS/reprint → pilot. Backend contracts and print RED may proceed in parallel after 1.1.

## Phase 1: Contracts and Safety REDs

- [ ] 1.1 RED: contract tests in `apps/pos_app/test` and `apps/admin_backend/test` cover policies, topology, fulfillment, print, outbox, audit, DGI immutability/cancellation.
- [ ] 1.2 RED: malformed/missing/stale routes include every physical line once in visible `DIRECT_HANDOFF/general-dispatch`, alert, and no offline block.
- [ ] 1.3 RED: unavailable/timeout/disconnect-after-send preserves order; confirmed failure retries, response loss becomes `UNCERTAIN`, with no duplicate effects.
- [ ] 1.4 Add nullable SQLite/TypeORM migrations/entities for topology, fulfillment, print attempts, outbox, audit, retention, direct-stock linkage, RLS; retain legacy reads.

## Phase 2: POS Domain and Unified Kardex

- [ ] 2.1 Implement immutable models in `lib/domain/models/{product,fulfillment}` and explicit product routing/channel predicates; categories only seed defaults.
- [ ] 2.2 GREEN: update `movement_engine*.dart`, `product_entity.dart`, `process_sale_inventory_use_case.dart` for one Kardex across RECIPE_BOM/DIRECT_STOCK/NOT_TRACKED, lineage and reversal.
- [ ] 2.3 Implement tenant/version/hash validation, shift-frozen snapshots, supervised audited emergency activation, and legacy compatibility DAOs.

## Phase 3: Atomic Sale, Provisioning, Sync

- [ ] 3.1 Implement backend fulfillment revision DTOs/controllers/services, onboarding defaults, permissions/audit, and tenant RLS; owner `baseRevision` conflicts return `409`.
- [ ] 3.2 GREEN: make `sales_transaction_dao.dart`/`sales_repository_impl.dart` atomically persist invoice, payments, Kardex, fulfillment, print, outbox, and DGI sequence; add ordered idempotent replay and cross-tenant rejection.

## Phase 4: Print, KDS, Reprint, Retention

- [ ] 4.1 GREEN: implement durable jobs/attempts around `printer_port.dart`, receipt-before-ticket ordering, safe retry, uncertainty resolution, and authorized copy audit.
- [ ] 4.2 Wire `kitchen_order_*`, history/KDS UI, `sync_service.dart`: channel states, active-query suppression, delivery independence, 90-day purge excluding invoice/Kardex, metrics/alerts.

## Phase 5: Generated Artifacts and Evidence

- [ ] 5.1 Regenerate Floor/Freezed/TypeORM artifacts separately; prove migration/backfill/rollback compatibility and record generated review impact.
- [ ] 5.2 Run unit/DB/E2E and pilot evidence for legacy tenants, three modes/channels, offline sale, uncertainty, KDS delivery, replay, reprint, RLS, retention, observability.
