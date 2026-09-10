# Tasks: Q80 reconnect auth and inventory outcome

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 2,500–3,400 authored lines (generated Floor output excluded from authored count) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1A → PR 1B → PR 2 → PR 3 → PR 4 → PR 5 → PR 6 → PR 7 → PR 8 → PR 9 → PR 10 → PR 11 → PR 12 |
| Delivery strategy | auto-chain |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

The baseline is committed at `eb70b2d`; after baseline planning semantics, the total chain is now 13 implementation PR/work units: Slice 1A, Slice 1B, and later Slices 2–12. Slice 1A may use up to 700 authored source+test lines under the user-approved corrective budget; Slice 1B may use up to 600; later slices retain their stated budgets. Keep the existing uncommitted checkout fix untouched and stop/rebase on overlap; never absorb, overwrite, or assume it is committed.

## Ordered implementation slices

### 0. Preserve pre-existing checkout fix (separate work unit; 160–180 lines)
- [ ] Inventory `git status`/`git diff` and record the existing checkout-fix files; exclude those hunks from every Q80 change.
- [ ] RED/GREEN/TRIANGULATE/REFACTOR: add or run only regression coverage proving the fix remains intact; verify `cd apps/pos_app && flutter test` for affected tests.
- [ ] Finish boundary: Q80 files are disjoint and the pre-existing fix remains uncommitted/unchanged. Rollback only the Q80 slice.

### 1A. Credential record/codec and secure store adapter (PR 1A; ≤700 authored source+test lines)
- [x] Define immutable credentials, exact ACTIVE/CLEARED record schema, hint schema, canonical checksum, and uint64/UUID/date/conditional-key validation in discovered POS auth paths under `apps/pos_app/lib/`.
- [x] Define the domain storage port plus typed errors/statuses distinguishing absent, invalid, prepared, committed, and read failure.
- [x] Implement the `flutter_secure_storage`-only adapter; never use SharedPreferences or logging for secrets.
- [x] RED/GREEN/TRIANGULATE/REFACTOR: test schema, corruption, exact key sets, generation relationships, hints, and adapter failure propagation.
- [x] No coordinator/CAS/recovery orchestration yet. Verify focused security tests and `flutter analyze`; rollback only the record/codec, port, adapter, and tests. Finish at the commit/review boundary.

### 1B. Credential coordinator, recovery/CAS and crash matrix (PR 1B; ≤600 authored source+test lines)
- [x] Implement `CloudCredentialCoordinator` and two-slot commit/recovery orchestration using the Slice 1A port under `apps/pos_app/lib/`.
- [x] Add two-slot commit/recovery, monotonic intents/mutex/CAS, clear tombstone, stale response rejection, and authoritative slots versus optional hint semantics.
- [x] RED/GREEN/TRIANGULATE/REFACTOR: test the stage-aware fault matrix for prepared/committed/hint write and read-back, mutate-then-throw/substitution, restart recovery, and stale intents.
- [x] Prove behaviorally that credential persistence uses the single port with no fallback. Verify focused security tests and `flutter analyze`; rollback coordinator/recovery/tests only. Finish at the commit/review boundary.

### 2. POS auth UI and error classification (PR 2; 210–290 lines)
- [x] Wire login/refresh/clear/import through the coordinator in auth repository, composition root, Dio adapter, and auth state/UI under `apps/pos_app/lib/` (discover exact paths).
- [x] RED/GREEN/TRIANGULATE/REFACTOR: offline PIN makes zero HTTP/secure-store calls; one refresh flight; one retry with `retryAttempt=1`; distinguish cloud unavailable vs reauthentication-required and preserve local session.
- [x] Verify `cd apps/pos_app && flutter test test/data/security test/data/adapters/http`; rollback transport/auth UI wiring.

### 3. Reconnect integration (PR 3; 180–260 lines)
- [x] Update `SyncService`, startup/connectivity/login/unlock triggers and pending-work gating so startup displays PIN unlock without network wait and sale sync precedes generic inventory.
- [x] RED/GREEN/TRIANGULATE/REFACTOR: test coalesced triggers, expired access/valid refresh, timeout, 401 replay, and pending SQLite work preservation.
- [x] Verify `cd apps/pos_app && flutter test test/data/services/sync_service_test.dart`; rollback trigger/orchestration changes.

### 4. Product classification propagation and mapping versions (PR 4; 220–300 lines)
- [x] Add domain/catalog projection `mappingVersionId` and backend `product_inventory_mapping_versions` entity/migration using real tenant-scoped paths under `apps/admin_backend/src/` and `apps/pos_app/lib/`.
- [x] RED/GREEN/TRIANGULATE/REFACTOR: test SIMPLE/PREPARED/COMPOUND classification, effective mapping lookup, no product-ID equality fallback, tenant ownership, and unchanged historical rows.
- [x] Verify backend unit/DB tests; rollback mapping entity/migration/projection. Do not invent a products direct-insumo column.

### 5. Immutable sale snapshot (PR 5; split into 5A → 5B; each ≤300 authored lines plus generated output)
- [x] **5A — immutable snapshot contracts and persistence:** add immutable sale-time snapshot contracts; invoice/item persistence and mappers; SQLite 48→49 additive migration; checked-in codegen only via `flutter pub run build_runner build --delete-conflicting-outputs`; RED/GREEN/TRIANGULATE/REFACTOR focused contract, migration, old-row compatibility, and mapper/JSON round-trip tests. Preserve immutable frozen bindings and sale-time snapshot semantics. Roll back migration/entities/generated files together.
- [x] **5B1a1 — depends on 5A:** pure immutable checkout identity/context and validated authority facts only: resolve persisted offline-user tenant against provisioned local tenant; reject blank/default/mismatched identity and every ambiguous/foreign product, mapping, recipe (including unpublished), component, or insumo fact before lookup selection. Return frozen authority maps only; no classification, snapshots, correlations, hash, movement, transaction, audit, or DGI behavior.
- [x] **5B1a2 — depends on 5B1a1:** consume trusted 5B1a1 authority to classify sale lines and exact invoice outcome/reason plans. No checkout tenant resolution, snapshots, correlations, canonical fragment, final `payloadHash`, movement, transaction, audit, or DGI behavior.
- [x] **5B1b — depends on 5B1a2:** convert validated classification plans into immutable sale-time snapshots with unambiguous deterministic correlations and a canonical inventory payload fragment for final repository hashing. No final `payloadHash`, movement, transaction, audit, or DGI behavior.
- [x] **5B2 — depends on 5B1b:** apply only frozen snapshot bindings at the local movement boundary; reject mutable catalog/recipe re-resolution and preserve invoice-atomic pending/no-impact suppression; RED/GREEN/TRIANGULATE/REFACTOR focused movement tests.
- [x] **5B3a — depends on 5B2:** atomically persist invoice/items/local frozen effects/audit through the existing transaction boundary with the final complete repository payload hash; RED/GREEN/TRIANGULATE/REFACTOR focused repository transaction and audit tests. Preserve frozen bindings, exact correlation ordering, and pending/no-impact acceptance semantics. No DGI post-transaction increment verification.
- [x] **5B3b — depends on 5B3a:** add DGI sequencing/post-transaction increment verification and any remaining repository transaction verification; RED/GREEN/TRIANGULATE/REFACTOR focused DGI/transaction tests. Preserve monotonic atomic DGI identity.
- [x] **5A verification:** `cd apps/pos_app && flutter test <focused snapshot/model/mapper/migration tests>`; targeted `flutter analyze`; `flutter pub run build_runner build --delete-conflicting-outputs`; rollback only 5A contracts/persistence/migration/generated files.
- [x] **5B1a1 verification:** `cd apps/pos_app && flutter test test/domain/usecases/inventory`; targeted analyzer; rollback only 5B1a1 checkout-context/authority-fact behavior.
- [x] **5B1a2/5B1b/5B2/5B3 verification:** `cd apps/pos_app && flutter test test/domain/usecases/inventory test/data/repositories/sales`; rollback only the applicable slice behavior. The exact command was revalidated with all 46 tests passing.
- [ ] **SUPERSEDED 5B4A0 draft — see amended chain below:** add only the additive local schema/sync projection facts required for later checkout composition: tenant-owned insumos; tenant-owned immutable published/effective recipe-version and component identities. No tenant default/fallback inference is permitted. Add focused projection tests proving tenant-owned facts and fail-closed missing/foreign/ambiguous state. Run Floor codegen if entities/DAOs change. Do not wire checkout or activation, or implement Slice 6+ / POS ACK Slice 8.
- [ ] **SUPERSEDED 5B4A1 draft — see amended chain below:** add a SQLite/local authority-composition adapter/projection as needed and wire only `SaleViewModel.processSale` to compose `ValidatedSaleInventoryAuthority` → `SaleInventoryOutcomePlanner` → `SaleTimeInventorySnapshotBuilder` before `SalesRepositoryImpl.saveSale`. Persist `SALE_TIME_V1` item snapshots and invoice outcome/reason when local authority facts exist. Fail closed for missing/blank/default/mismatched tenant context; preserve offline-first SQLite authority, DGI sequencing/no-delete behavior, retained 5B2/5B3 behavior. RED/GREEN/TRIANGULATE/REFACTOR focused checkout-path coverage. Do not wire activation or implement Slice 6+ / POS ACK Slice 8.
- [ ] **SUPERSEDED 5B4B draft — see amended chain below:** wire only `ActivationControlledSaleRunner.executeControlledOfflineSale` through the retained local authority-composition adapter and add activation coverage. Preserve all 5B4A behavior and fail-closed tenant handling; do not implement Slice 6+ / POS ACK Slice 8.

### Pre-Slice-6 amended dependency chain (supersedes former 5B4 grouping)
- [x] **5B4A0 — backend tenant-owned immutable authority projection:** inbound DTOs/projections carry tenant-owned insumos, recipes, published/effective immutable recipe versions, and immutable version-component facts; no tenant inference/default fallback.
- [x] **5B4A0c — backend immutable authority contract alignment:** carry explicit immutable recipe-version linkage and every actual selection field (version lifecycle/effective/yield/shrink/publication/timestamps), plus tenant-owned component identity, insumo, quantities, shrink/type, nullable-UOM semantics, and deterministic ordering. Fail closed for missing/foreign/ambiguous linkage; do not infer through mutable recipe rows.
- [x] **5B4A1a1 — POS Floor authority schema foundation:** entities/tables, additive 49→50 migration, AppDatabase registration, Floor codegen, and focused schema/migration tests strictly complying with design Section D7.
- [x] **5B4A1a2 — POS authority DAO invariants:** add immutable replay/tenant/link validation and deterministic effective-at DAO behavior plus focused behavior tests, on the 5B4A1a1 schema foundation. No sync hydration or runtime wiring.
- [x] **5B4A1b — POS authority sync mapping and atomic hydration:** map 5B4A0c inbound facts and hydrate the 5B4A1a1/5B4A1a2 projection atomically; missing/foreign/duplicate/ambiguous tenant/version/component state fails closed.
- [x] **5B4A2 — SaleViewModel runtime checkout composition:** wire `SaleViewModel.processSale` only, composing `ValidatedSaleInventoryAuthority` → `SaleInventoryOutcomePlanner` → `SaleTimeInventorySnapshotBuilder` before `SalesRepositoryImpl.saveSale`.
- [x] **5B4B — ActivationControlledSaleRunner runtime composition:** separately wire `ActivationControlledSaleRunner.executeControlledOfflineSale` through the local authority adapter.
- Slice 6 is unblocked now that this pre-Slice-6 chain is complete, and remains backend outcome/persistence only.

### 6. Backend outcome/persistence (PR 6; 220–300 lines)
- [x] Add sale DTO/result contract, invoice/item/receipt fields, immutable snapshot validator and transaction service under `apps/admin_backend/src/modules/sales` and inventory modules.
- [x] RED/GREEN/TRIANGULATE/REFACTOR: validate SALE_TIME_V1 without current recipe lookup, mapping/recipe/component tenant checks, stable outcomes/reasons, zero movements for pending/no-impact, SERIALIZABLE persistence.
- [x] Verify `cd apps/admin_backend && npm test -- --runInBand src/modules/sales src/modules/inventory`; rollback service/entities/DTO changes.

### 7. Backend ACK/idempotency and compatibility (PR 7; 200–280 lines)
- [ ] Wire sales sync ACKs, Kardex correlation uniqueness, duplicate receipt replay, payload hash mismatch, and legacy `LEGACY_SYNC_TIME_V1` first-acceptance classification.
- [ ] RED/GREEN/TRIANGULATE/REFACTOR: test same-key replay, different-hash `IDEMPOTENCY_MISMATCH`, mapping effective interval, legacy no-mapping outcomes, mixed snapshot rejection, old-client response compatibility, and unknown raw outcomes.
- [ ] Verify `cd apps/admin_backend && npm test -- --runInBand src/modules/sales`; rollback compatibility/orchestration only.

### 8. POS movement ownership and ACK (PR 8; 200–280 lines)
- [ ] Add movement owner/state/sale linkage migration, migration classification/quarantine, positive generic-outbox allow-list, and exact ACK transaction in `SalesRepositoryImpl`/`SyncService`.
- [ ] RED/GREEN/TRIANGULATE/REFACTOR: test sale-owned exclusion, ambiguous legacy quarantine, missing/extra ACK integrity failure, replay after lost response, cancellation correlations, and no duplicate cloud movement.
- [ ] Verify `cd apps/pos_app && flutter test test/data/repositories/sales test/data/services/sync_service_test.dart`; rollback ownership/ACK changes.

### 9. Remediation schema/security (PR 9; 220–300 lines)
- [ ] Add `inventory_remediation_receipts` migration/entity, tenant composite links, RLS SELECT/INSERT policies, append-only trigger, Kardex correlation constraints, and guarded up/down migration logic.
- [ ] RED/GREEN/TRIANGULATE/REFACTOR: run migration up/down guard tests, RLS/tenant cross-access denial, trigger denial for UPDATE/DELETE, additive-history/no-ID-inference checks, and rollback-evidence checks.
- [ ] Verify `cd apps/admin_backend && npm run test:db -- --runInBand`; rollback only unused additive schema.

### 10. Remediation application/API (PR 10; 220–300 lines)
- [ ] Implement DTO/controller/permission guard/service/module registration for `POST /inventory/remediations/sale-inventory`; actor comes only from JWT principal and owner/manager permission.
- [ ] RED/GREEN/TRIANGULATE/REFACTOR: test actor spoof rejection, tenant/RLS isolation, unchanged pending source validation, SERIALIZABLE all-or-nothing stock/Kardex/audit/receipt writes, same/different idempotent replay and already-remediated conflict.
- [ ] Verify `cd apps/admin_backend && npm test -- --runInBand src/modules/inventory` and focused e2e; rollback endpoint/module without deleting evidence.

### 11. Readiness/UI warning and integration (PR 11; 160–240 lines)
- [ ] Add `inventoryEnrichmentPendingCount`/warning adapter and POS warning UI without changing `SALE_READY`, activation, setup, or checkout blocking predicates.
- [ ] RED/GREEN/TRIANGULATE/REFACTOR: test warning-only rendering, DGI/offline regressions, retained local session, old backend compatibility, and end-to-end sale sync ordering.
- [ ] Verify focused Flutter tests and `cd apps/admin_backend && npm test -- --runInBand src/modules/readiness`; rollback warning adapter/UI.

### 12. Physical Q80 verification and documentation (PR 12; 180–260 lines)
- [ ] Add `apps/admin_backend/test/q80-reconnect-inventory-outcome.e2e-spec.ts`, fixtures/evidence queries/runbook at repository-appropriate `docs/` paths, and generated-code handling notes.
- [ ] RED/GREEN/TRIANGULATE/REFACTOR: automate tenant-scoped evidence for one invoice/receipt, immutable snapshot/outcome, exact ACK/Kardex set, no generic sale movement, unchanged DGI; execute physical restart → offline PIN → expired access/valid refresh → replay gate.
- [ ] Verify `cd apps/admin_backend && npm run test:e2e -- --runInBand test/q80-reconnect-inventory-outcome.e2e-spec.ts`; record physical result and rollback by removing fixtures/runbook only.

## Documentation cleanup

- [ ] Update `openspec/changes/q80-reconnect-auth-and-inventory-outcome/proposal.md` status/wording to reflect the validated design and current outcome contract; do not silently mutate or delete stale proposal claims.
- [ ] Review the OpenSpec delta/spec references and generated Floor artifacts; document any intentionally retained generated files and run `git diff --check`.

## Cross-slice completion gate

- [ ] Confirm all 13 implementation PR/work units are independently reviewable, stacked to main in the listed order, and within their approved authored-line budgets (Slice 1A ≤700, Slice 1B ≤600; later slices retain their stated budgets).
- [ ] Run POS `flutter test`, backend `npm test`, DB migration/RLS tests, e2e, lint/build/codegen as applicable; preserve exact results, rollback boundaries, and tenant-safe evidence in each work-unit record.
