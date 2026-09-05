# Design: Q80 reconnect auth and inventory outcome

## 1. Scope and architecture

This change spans the Flutter POS (`apps/pos_app`) and NestJS/PostgreSQL backend (`apps/admin_backend`). SQLite remains the offline source of truth for the sale, DGI identity, sale-time inventory decision, and local stock effect. PostgreSQL is the cloud invoice, Kardex, receipt, remediation, and audit authority. No retry may regenerate an invoice ID, DGI number, terminal sequence, inventory snapshot, or correlation key.

Dependencies remain inward-facing:

- Domain/application types: `CloudCredentialPair`, `CredentialGeneration`, `InventoryLineSnapshot`, `InventoryApplicationOutcome`, and remediation command/result.
- Ports: credential store/coordinator, sale repository, inventory outcome policy, and remediation receipt repository.
- Adapters: Flutter secure storage/Dio, Floor/SQLite, Nest controllers/JWT guards, and TypeORM/PostgreSQL.

The design removes three unsafe behaviors evidenced in current code: sale-derived local movements entering the generic inventory outbox after the sale endpoint has already caused backend FOH movements; backend resolution against the active recipe at sync time; and token writes that can race or fall back to `SharedPreferences`.

## 2. Decisions

### D1. Offline PIN identity and cloud identity remain separate

`loginOffline` reads SQLite user/security-profile data and verifies the PIN without secure-store or network access. Cloud refresh failure changes only `CloudAuthState`; it never clears the local user, invoice, DGI sequence, movement, or outbox state and never invokes local logout.

Startup, connectivity-online, successful online login, and successful local PIN unlock may request a coalesced sync pass only after SQLite initialization and only when pending work exists. Startup never waits for the network before displaying PIN unlock.

### D2. One owner delivers sale-derived cloud inventory effects

The **sales sync endpoint/backend sales application service is the only cloud-ingestion owner for inventory effects derived from `SALE` and `SALE_CANCEL` documents**. The POS still calculates and commits local stock effects in the same SQLite sale transaction so offline stock remains correct, but those local rows are evidence/projections of the sale and are not independent cloud commands.

Each local movement gains:

- `delivery_owner`: `SALE_SYNC | GENERIC_INVENTORY | DOCUMENT_SYNC`.
- `delivery_state`: `LOCAL_APPLIED | CLOUD_ACKNOWLEDGED | RETRYABLE | QUARANTINED`.
- `sale_id` and `sale_correlation_id`, nullable outside sale-owned rows.

For a sale line/binding, the deterministic correlation ID is lower-case hex SHA-256 of canonical UTF-8:

`sale-movement:v1|tenantId|terminalId|invoiceId|invoiceItemId|bindingOrdinal|insumoId|movementKind`

`bindingOrdinal` is the zero-based order of bindings after sorting by `(insumoId, recipeComponentId-or-empty)`; the snapshot stores that order. Cancellation uses `movementKind=SALE_CANCEL` and the cancellation invoice/document ID, so it cannot collide with the original sale. The same correlation ID is sent in the immutable sale line binding. Backend Kardex idempotency is `(tenant_id, sale_correlation_id)` and its existing source link remains `invoice:<invoiceId>`.

`SalesRepositoryImpl.saveSale` commits invoice, immutable items/snapshot, audit, and local `SALE_SYNC/LOCAL_APPLIED` movements in one Floor transaction. `SyncService._syncInventoryOutbox` has a positive allow-list: it sends only `delivery_owner=GENERIC_INVENTORY`; it must also defensively reject/quarantine rows whose type/source metadata identifies a sale or sale cancellation. Purchases, production, counts, shrinkage, and explicit adjustments keep their existing document-specific or generic owners; none may reuse a sale correlation ID.

A successful sale response contains `acknowledgedMovementCorrelationIds`. In one SQLite transaction, the POS verifies that the ACK set exactly equals the locally expected set for `APPLIED`, or is empty for `APPLIED_NO_INVENTORY_IMPACT`/`APPLIED_INVENTORY_PENDING`, then marks the invoice synced and correlated local rows `CLOUD_ACKNOWLEDGED`. A missing, extra, or mismatched ACK is an integrity failure: invoice and movements remain pending/local-applied and generic inventory still cannot send them.

Replay behavior:

- Same tenant/idempotency key and payload hash returns the original sale receipt, outcome, reason, and ACK set; no invoice, stock mutation, or Kardex append occurs.
- Same key with a different hash returns non-retryable `IDEMPOTENCY_MISMATCH`.
- Crash after backend commit but before local ACK causes sale replay and the original ACK set safely closes local state.
- Crash after local sale commit but before first send leaves local stock applied and sale-owned rows pending only through the sales path.

SQLite migration classifies existing clearly linked `SALE`/`SALE_CANCEL` rows (source document type, source invoice ID, or origin invoice item linkage) as `SALE_SYNC`; rows with contradictory/ambiguous sale provenance become `QUARANTINED`, never generic sends. Non-sale rows retain the appropriate existing document owner. A pre/post migration query reports ambiguous rows for operator review.

### D3. Sale-time inventory outcome is immutable and deterministic

New invoice items persist and send `inventorySnapshotVersion=SALE_TIME_V1` and this immutable snapshot:

```json
{
  "classification": "SIMPLE|PREPARED|COMPOUND",
  "disposition": "DIRECT|RECIPE|NO_IMPACT|PENDING_RECIPE",
  "reasonCode": "NO_EXPLICIT_INSUMO_MAPPING|MISSING_PUBLISHED_RECIPE|null",
  "catalogRevision": "stable local projection revision",
  "mappingVersionId": "nullable product_inventory_mapping_versions.id",
  "recipeVersionId": "nullable frozen published version",
  "bindings": [
    {
      "bindingOrdinal": 0,
      "insumoId": "uuid",
      "recipeComponentId": "nullable uuid",
      "quantityPerSaleUnit": 1.25,
      "saleCorrelationId": "sha256"
    }
  ]
}
```

The snapshot is part of the invoice payload hash and is written before DGI numbering is incremented. Rules are:

- SIMPLE with an explicit mapping: `DIRECT`, immutable mapping-version identity plus exactly one insumo binding. The sole direct-stock source is the additive, tenant-scoped `product_inventory_mapping_versions` table/entity with columns `id uuid primary key`, `tenant_id varchar not null`, `product_id uuid not null`, `insumo_id uuid not null`, `effective_at timestamptz not null`, and `superseded_at timestamptz null`. Tenant-scoped foreign keys bind `product_id` and `insumo_id`; a partial unique index on `(tenant_id, product_id) WHERE superseded_at IS NULL` permits one active version. Superseding closes the old row by setting `superseded_at` and inserts a new row; closed rows are retained. Neither `products` nor any product DTO has a direct insumo field. The POS catalog projection carries `mappingVersionId=product_inventory_mapping_versions.id` and that row's `insumo_id`.
- SIMPLE without an explicit mapping: `NO_IMPACT`, reason `NO_EXPLICIT_INSUMO_MAPPING`, no bindings.
- PREPARED/COMPOUND with a published recipe selected at sale time: `RECIPE`, frozen recipe version plus exact component identities and quantities.
- PREPARED/COMPOUND without one: `PENDING_RECIPE`, reason `MISSING_PUBLISHED_RECIPE`, no bindings.

The invoice outcome is atomic: any pending line gives `APPLIED_INVENTORY_PENDING` and zero cloud movements for the entire invoice; otherwise any binding gives `APPLIED`; otherwise it is `APPLIED_NO_INVENTORY_IMPACT`. No partial movement set is accepted for a pending invoice.

For `SALE_TIME_V1`, backend validation never queries the current product classification, current mapping, or active recipe to decide historical meaning. It validates schema, arithmetic (`line quantity × quantityPerSaleUnit`), unique correlation IDs, tenant ownership of every referenced insumo, `mappingVersionId` against the immutable tenant/product/insumo row in `product_inventory_mapping_versions`, recipe version/component identity, and that the referenced recipe version is a published immutable version. It then uses the supplied frozen bindings. A changed current mapping, product publication, or newly active recipe is irrelevant. Missing/cross-tenant references or a snapshot/outcome mismatch reject the transaction; `productId == insumoId` has no meaning.

The backend persists the snapshot on `invoice_items`, outcome/reason on `invoices`, and the canonical payload hash/outcome/reason/ACK set on the sale receipt in the same SERIALIZABLE tenant-bound transaction as invoice and Kardex writes. Existing records are never recomputed.

**Legacy path:** if every item omits `inventorySnapshotVersion`, classify once under `LEGACY_SYNC_TIME_V1` at first acceptance, inside the sale transaction. For each `(tenantId, productId)`, first query only `product_inventory_mapping_versions` for the unique row effective at ingestion time: `tenant_id = :tenantId`, `product_id = :productId`, `effective_at <= :acceptedAt`, and (`superseded_at IS NULL` or `:acceptedAt < superseded_at`). If found, validate its tenant-owned `insumo_id`, classify `DIRECT`, and freeze `mappingVersionId=product_inventory_mapping_versions.id`, `insumo_id`, bindings, and `acceptedAt` into the generated item snapshot and canonical sale receipt payload. That row ID is the mapping version identity; later supersession cannot change the accepted result.

If no effective mapping row exists, load the authoritative tenant-owned `products.product_type` at ingestion. `SIMPLE` becomes `NO_IMPACT`/`APPLIED_NO_INVENTORY_IMPACT` with `NO_EXPLICIT_INSUMO_MAPPING`; `PREPARED` or `COMPOUND` uses the tenant-scoped published recipe effective at `acceptedAt` when present, otherwise becomes `PENDING_RECIPE`/`APPLIED_INVENTORY_PENDING` with `MISSING_PUBLISHED_RECIPE`. Unsupported or missing product types reject acceptance rather than guessing. The classifier never compares or copies `product_id` into `insumo_id`. It persists the generated snapshots, resolved mapping-version IDs (or their absence), `LEGACY_SYNC_TIME_V1`, outcome, reason, and ACK set on immutable invoice items/sale receipt; duplicate delivery returns those frozen values without reclassification. Mixed legacy/new snapshots are rejected.

Migration is additive and names only real structures: create `product_inventory_mapping_versions` with the columns and constraints above, and add nullable snapshot/policy/outcome fields to invoice items and sale receipts. Because no direct-insumo column exists on `products`, no migration reads one and no row is synthesized from product/insumo ID equality. A backfill may insert mapping-version rows only from a separately verified explicit tenant/product/insumo relationship source, using new UUID `id`, the source tenant/product/insumo values, deployment time as `effective_at`, and null `superseded_at`; when no such source exists, the mapping backfill is intentionally empty. Existing accepted invoices/receipts are not rewritten or reclassified. Old clients remain compatible through the first-acceptance classifier above.

### D4. Outcome contract and readiness

Stable outcomes are `APPLIED`, `APPLIED_NO_INVENTORY_IMPACT`, and `APPLIED_INVENTORY_PENDING`; stable reasons include `NO_EXPLICIT_INSUMO_MAPPING` and `MISSING_PUBLISHED_RECIPE`. Response `code` mirrors the outcome for old success parsers, while `inventoryOutcome` is canonical.

```json
{
  "status": "ACCEPTED|DUPLICATE",
  "code": "APPLIED_NO_INVENTORY_IMPACT",
  "inventoryOutcome": "APPLIED_NO_INVENTORY_IMPACT",
  "inventoryOutcomeReason": {"code":"NO_EXPLICIT_INSUMO_MAPPING","lines":["item-id"]},
  "acknowledgedMovementCorrelationIds": [],
  "policyVersion": "SALE_TIME_V1"
}
```

New POS against an old backend preserves its local immutable outcome and does not mark correlated movements cloud-acknowledged without a verifiable ACK. This rollout therefore requires compatible backend first. Unknown future outcomes are retained as raw values and surfaced as unsupported/integrity review, not crashed or rewritten.

Readiness adds warning-only `inventoryEnrichmentPendingCount`/`INVENTORY_ENRICHMENT_PENDING`; it is excluded from `SALE_READY`, activation, setup completion, and checkout blocking predicates.

### D5. All credential writers share one monotonic intent-epoch/generation CAS coordinator

A process-wide `CloudCredentialCoordinator` owns online login, refresh, legacy import, clear/logout, and startup recovery. Login, refresh, and clear/logout share one monotonic `credentialIntentEpoch` domain; there is no operation-specific counter. Every reservation and every durable or in-memory credential mutation enters the same commit mutex. Startup initializes the in-memory epoch to at least the `writerEpoch` of the highest valid committed slot. Before any login or refresh network request, the coordinator acquires the mutex, recovers the highest committed slot, increments/reserves `credentialIntentEpoch`, and captures `{intentEpoch, baseGeneration, baseWriterEpoch}`. A coalesced refresh flight has one reservation shared by all waiting 401s; login always reserves a distinct newer intent. Refresh network calls remain single-flight, and login/refresh responses commit through the same CAS routine.

Secure storage contains two independent serialized values, `cloud_credentials_slot_a_v1` and `_b_v1`, plus an optional `cloud_credentials_hint_v1`. A slot record is:

```text
{schemaVersion, generation:uint64, writerEpoch:uint64, commitId:uuid,
 state:PREPARED|COMMITTED, credentialState:ACTIVE|CLEARED,
 previousGeneration:uint64|null, accessToken?, refreshToken?, userId?, tenantId?,
 issuedAt, checksum}
```

`checksum` is SHA-256 over canonical JSON excluding `checksum`. `ACTIVE` requires all four credential/identity fields; `CLEARED` requires all four to be absent. The hint contains `{generation, slot, commitId, checksum}` and is only an optimization. **No secure-storage write or hint replacement is assumed atomic.** Startup reads both slots, validates parse/schema/checksum and those conditional fields, ignores `PREPARED` and corrupt records, and selects the highest valid `COMMITTED` generation (tie with differing commit IDs is corruption and requires cloud reauthentication). The hint is accepted only if it names that record.

Response/clear commit protocol under the mutex:

1. Recover the highest valid committed slot and read the coordinator's current `credentialIntentEpoch`.
2. For a login/refresh response, require both (a) `captured.intentEpoch == credentialIntentEpoch` and (b) the recovered record still has `generation == captured.baseGeneration` and `writerEpoch == captured.baseWriterEpoch`. Any mismatch discards the response without a slot, hint, memory, or Dio write. The caller observes the newer committed state or retries only by reserving a new intent; it never reuses the stale response.
3. For clear/logout, acquire the mutex, recover current state, increment/reserve `credentialIntentEpoch`, and commit `CLEARED` immediately; no network work is involved. Its tombstone uses `writerEpoch=credentialIntentEpoch`, `generation=current.generation+1`, `previousGeneration=current.generation`, and no credential/identity fields.
4. For an accepted login/refresh response, use `writerEpoch=captured.intentEpoch`, `generation=current.generation+1`, and `previousGeneration=current.generation`.
5. Write the inactive slot as the complete candidate `PREPARED`, read back, and verify.
6. Rewrite that slot as complete `COMMITTED` with a recomputed checksum, read back, and verify.
7. Write/read the hint.
8. Publish `ACTIVE` credentials or the `CLEARED` tombstone state to memory/Dio only after the committed-slot read-back succeeds; hint failure is warning-only because recovery scans both slots.

Reservation ordering, not response arrival, determines authority. A refresh reserved before a login is stale as soon as the login reserves a newer epoch, even before that login responds. A login/refresh reserved before clear fails the epoch CAS after clear and cannot overwrite the tombstone. A response also fails after any newer committed login because its base generation/writer epoch no longer match. Thus a pre-clear or otherwise stale login/refresh cannot resurrect credentials after clear/logout, startup recovery, or a newer login.

Failure behavior is exact for both `ACTIVE` and `CLEARED` candidates: failure before or during the PREPARED write/read-back leaves the prior committed slot selected; failure during the COMMITTED write/read-back leaves either an invalid/PREPARED candidate ignored or a fully verifiable committed candidate selected at restart; hint failure still selects the highest valid committed slot; failure while publishing memory/Dio is repaired by startup/read-through. The prior committed slot is not overwritten because only the inactive slot is used. A verified `CLEARED` record is a durable generation barrier: recovery initializes `credentialIntentEpoch` from its `writerEpoch`, so every post-restart reservation is greater and no older persisted record is selected over it. On the following successful generation, the older slot may be reused.

Legacy access-only tokens are imported once as explicit access-only state and cannot refresh; expiry yields `cloudReauthenticationRequired`. Secrets never fall back to `SharedPreferences`; after verified import its legacy key is deleted best-effort. Secure-store failure is explicit.

The normal Dio adapter retries an eligible original request once after successful recovery, marks `retryAttempt=1`, and never intercepts the bare refresh client. Missing/revoked/malformed/mismatched or uncommittable credentials emit one reauthentication event per generation. Network timeout during refresh is cloud-unavailable, not reauthentication. Both leave SQLite work pending.

### D6. Remediation is authorized, tenant-isolated, and append-only

`POST /inventory/remediations/sale-inventory` accepts only `{idempotencyKey, invoiceId, recipeVersionId, reason}`. Actor identity and role come exclusively from the authenticated JWT/request principal; an actor field in the body is rejected by validation. The endpoint requires RBAC permission `inventory.remediation.execute`, granted initially to owner and manager only, in addition to tenant guard/RLS.

An additive PostgreSQL table `inventory_remediation_receipts` contains:

- `id uuid primary key`, `tenant_id varchar not null`, `idempotency_key varchar not null`.
- `command_type varchar not null` fixed to `SALE_INVENTORY_REMEDIATION`, `request_hash varchar not null`.
- `source_invoice_id uuid not null`, `source_inventory_receipt_id uuid not null`, `recipe_version_id uuid not null`.
- `actor_user_id varchar not null`, `actor_role varchar not null`, `reason varchar not null`.
- `status varchar not null` (`APPLIED`), `result jsonb not null` including movement IDs/correlation IDs.
- `audit_event_id uuid not null`, `created_at timestamptz not null`, `completed_at timestamptz not null`.
- Unique `(tenant_id, idempotency_key)` and supporting tenant/source indexes. Tenant-scoped composite foreign keys (or equivalent checked constraints in the existing schema) prevent cross-tenant invoice, sale receipt, recipe, and audit linkage.

The migration enables and forces RLS. SELECT and INSERT policies require `tenant_id = current_setting('app.tenant_id', true)`; no UPDATE/DELETE policy is created. A `BEFORE UPDATE OR DELETE` trigger always raises, including privileged application paths, making the table append-only. Kardex remediation rows use source document type `INVENTORY_REMEDIATION`, source document ID `remediation:<receipt-id>`, deterministic per-binding idempotency/correlation keys, and immutable links to source invoice and audit event.

One SERIALIZABLE tenant-bound transaction locks the pending invoice and source sale receipt, validates unchanged original `APPLIED_INVENTORY_PENDING`, published tenant-owned frozen recipe, permission-derived actor, and absence of prior receipt; then applies stock/Kardex, appends the audit event, and inserts the final remediation receipt. Any validation or write failure rolls back all stock, Kardex, audit, and receipt writes. Original invoice/items/outcome/sale receipt/DGI number are never updated.

Duplicate `(tenant,idempotencyKey)` with the same request hash returns the stored result and performs no writes. A different hash returns `409 IDEMPOTENCY_MISMATCH`. A unique `(tenant_id, source_invoice_id, command_type)` constraint prevents a second remediation under another key; that request returns `409 ALREADY_REMEDIATED` with the prior receipt ID and performs no stock, Kardex, audit, or receipt write.

The migration `down` first checks for remediation receipts, remediation Kardex rows, non-null new outcome/snapshot data, or populated mapping/correlation columns. If any evidence exists it raises and performs no destructive action. Only an unused migration may remove its policies/triggers/table/columns. Production rollback reverts application routing while retaining additive nullable columns and immutable evidence.

## 3. End-to-end data flow

1. Checkout selects local catalog facts and freezes each line snapshot; it computes the invoice-atomic outcome and deterministic correlations.
2. One SQLite transaction persists invoice/items, audit, and local stock effects. DGI sequence increments only after commit.
3. Reconnect sends the sale envelope before generic inventory. Sale-owned local rows are excluded from generic inventory regardless of sale request success/failure.
4. A 401 joins credential recovery. The coordinator CAS-commits a pair; Dio retries the unchanged sale payload once.
5. Backend binds tenant context, validates immutable snapshots, inserts invoice/Kardex/sale receipt atomically, and returns the original or new ACK set.
6. POS verifies outcome/hash/ACKs and atomically marks invoice plus correlated local movements acknowledged. A lost response is repaired by replay.
7. Later product, mapping, or recipe publication affects only later sales. Historical pending stock requires the authorized remediation transaction.

## 4. Data and file changes

### POS

- Auth ports/models and `CloudCredentialCoordinator`; secure two-slot adapter; Dio retry adapter; composition root and auth repository integration.
- Invoice/item/product/movement domain and Floor entities/mappers/DAOs; SQLite release migration (next available version, not hard-coded until implementation rebases); regenerated Floor output.
- `InventoryOutcomePolicy`, sales repository/transaction DAO, sale payload mapper, `SyncService`, status/UI warning.
- Migration includes new product mapping identity/revision, invoice outcome/reason/policy, item snapshot JSON/version, and movement owner/state/sale correlation columns.

### Backend

- Additive migration(s), immutable product-mapping-version plus product/invoice/invoice-item/sale-receipt entities, Kardex correlation uniqueness, and remediation receipt/RLS/append-only trigger.
- Sale DTO/result contract, extracted inventory outcome application service, invoice sync orchestration, product projection, readiness adapter.
- Remediation DTO/controller/permission guard/application service/entity/module registration and immutable audit linkage.

## 5. Verification strategy

Strict TDD applies per slice; tests ship with behavior.

POS focused tests cover: offline PIN makes zero HTTP/secure-store calls; all login/refresh/clear races use the one monotonic epoch/generation CAS; a login response delayed until after a committed clear is discarded with no secure-store/memory/Dio write; refresh reserved first then login reserved/committed cannot replace the login, in either response order; concurrent logins commit only the highest reserved intent; N concurrent 401s share exactly one reserved refresh/network call and each original request retries at most once. A deterministic fault-injection matrix crashes before, during, and after each two-slot step—PREPARED write/read-back, COMMITTED write/read-back, hint write/read-back, and memory publish—for both ACTIVE and CLEARED candidates; restart scanning must select exactly the highest valid committed generation, retain a committed tombstone when present, and reject any delayed pre-crash intent as stale. Corrupt/tied slots reauthenticate, and secure-store failure never downgrades secrets. Sale tests cover each classification, frozen bindings despite later catalog changes, invoice-atomic pending, deterministic correlations, SQLite atomic local effects, generic-outbox exclusion, exact ACK transaction, lost-ACK replay, ambiguous legacy movement quarantine, and unchanged DGI identity.

Backend tests cover: new snapshot validation without current active-recipe lookup; tenant/mapping/recipe/component validation; no product-ID fallback; duplicate receipt returns original ACK/outcome; same-key mismatch; legacy first-acceptance lookup of `product_inventory_mapping_versions` by tenant/product/effective interval and freezing of its `id`; no-mapping legacy SIMPLE produces `APPLIED_NO_INVENTORY_IMPACT`; no-mapping legacy PREPARED/COMPOUND without a published recipe produces `APPLIED_INVENTORY_PENDING`; later mapping or product-type changes do not alter duplicate receipts; zero movements for no-impact/pending; exact Kardex uniqueness. PostgreSQL tests exercise additive creation/backfill of the named mapping table and columns without history rewrites or ID-equality inference, release-shaped migration, RLS cross-tenant denial, append-only trigger, remediation permission/actor spoof rejection, same/different duplicate behavior, transaction rollback, and guarded down migration.

Focused commands remain repository-native:

```bash
cd apps/pos_app && flutter test test/data/security test/data/adapters/http
cd apps/pos_app && flutter test test/domain/usecases/inventory test/data/repositories/sales test/data/services/sync_service_test.dart
cd apps/admin_backend && npm test -- --runInBand src/modules/sales src/modules/inventory
cd apps/admin_backend && npm run test:db -- --runInBand
cd apps/admin_backend && npm run test:e2e -- --runInBand test/q80-reconnect-inventory-outcome.e2e-spec.ts
```

Physical Q80 gate restarts offline, PIN-unlocks, preserves a valid refresh while expiring access, syncs invoice `001-001-01-00000001`, and replays it. Tenant-scoped evidence must show one invoice, one sale receipt, exact immutable snapshot/outcome, exact ACK/Kardex set, no generic sale movement receipt, unchanged DGI number, and retained local session.

## 6. Rollout and observability

1. Back up pilot PostgreSQL/Q80 SQLite and record tenant-scoped invoice, movement, outbox, and DGI hashes.
2. Deploy additive backend schema, RLS, and compatibility readers; run migration/down-guard and tenant tests.
3. Deploy backend sale snapshot/ACK behavior, then remediation endpoint disabled by feature flag.
4. Migrate a copied release SQLite DB; inspect quarantine report. Install POS canary only after backend ACK support is live.
5. Run automated and physical Q80 gates; then enable remediation only for authorized operators and expand rollout.

Observe credential recovery by generation (without tokens), stale-CAS counts, cloud reauth states, legacy policy usage, snapshot mismatch, quarantined local rows, sale receipt duplicates, missing/extra ACKs, generic attempts containing sale provenance, remediation duplicates, RLS denials, and outcome counts. Alerts and logs include tenant-safe IDs but no tokens/PINs.

Application rollback leaves additive data in place. Never delete or renumber DGI invoices, mutate original outcomes, resend sale-owned rows generically, or infer historical inventory. Remediation can be disabled without deleting receipts/Kardex/audit.

## 7. Review workload forecast and chained slices

Forecast is about 36–48 authored files and 1,900–2,700 authored changed lines, plus generated Floor output. Execution mode `auto` uses chained work-unit slices with tests and rollback notes in each. The 400-line ceiling counts authored additions plus deletions; generated output is excluded from that authored count but included in snapshot identity. Safety margin target is **300 lines maximum per slice**, and any refined forecast above 300 splits before implementation.

1. **Backend persistence contract** — invoice/item/receipt additive fields, migration and migration tests: 6–8 files, 210–280 lines.
2. **Backend immutable snapshot policy** — validator/service and unit tests, no current-state lookup for new clients: 5–7 files, 220–300 lines.
3. **Backend sale ACK/idempotency** — correlation uniqueness, original duplicate response, transaction tests: 5–7 files, 200–280 lines.
4. **Backend legacy/readiness compatibility** — explicit legacy policy and warning-only readiness with tests: 4–6 files, 160–230 lines.
5. **Remediation schema/security** — table, RLS, append-only/down guard and DB tests: 4–6 files, 200–280 lines.
6. **Remediation application/API** — RBAC, JWT actor, idempotent transaction and tests: 5–7 files, 220–300 lines.
7. **POS credential durable store** — two-slot recovery/CAS/crash tests: 5–7 files, 220–300 lines.
8. **POS auth transport/orchestration** — login/refresh shared coordinator, one retry, typed state/tests: 5–7 files, 210–290 lines.
9. **POS sale snapshot persistence** — outcome policy, SQLite migration/entities, transaction tests: 7–10 files, 230–300 authored lines plus generated output.
10. **POS delivery ownership/ACK** — migration classification, generic exclusion, correlated ACK/replay tests: 5–7 files, 200–280 lines.
11. **Reconnect/UI/cross-version integration** — pending-aware triggers, warning UI and tests: 4–6 files, 160–240 lines.
12. **End-to-end/Q80 gate assets** — fixtures, tenant evidence queries, runbook: 4–6 files, 160–240 lines.

Each slice is a behavior-complete candidate commit/PR, records focused and runtime results, and names an independent rollback boundary. Existing unrelated checkout hunks remain unstaged and untouched; implementation must stop and rebase on overlap rather than absorb them.

## 8. Risks and controls

- Secure storage offers no transaction guarantee: one monotonic credential intent epoch across login/refresh/clear, durable tombstone generations, dual committed records, checksums, scan-based recovery, read-back, and per-step ACTIVE/CLEARED crash tests prevent stale resurrection and avoid pointer claims.
- Local/cloud double consumption: explicit owner allow-list, deterministic correlation uniqueness, exact ACK verification, and sale replay close both delivery paths.
- Policy drift: immutable sale snapshots and archived binding validation replace active-recipe lookup; legacy use is labeled and measurable.
- Malicious/cross-tenant references: JWT tenant context, tenant-owned binding validation, RLS, composite linkage, and permission guards reject them.
- Offline correctness: local effects commit with the immutable invoice and are never rolled back because cloud auth is unavailable.
- Historical changes: publication is prospective; remediation is explicit, authorized, append-only, idempotent, and transactionally audited.
- Rollback data loss: guarded down migrations refuse removal after any evidence exists.
