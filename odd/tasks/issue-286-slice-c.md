# Issue #286 — Phase 2 slice C: tenant lifecycle, devices, catalog/loyalty and sales

**Parent plan (plan of record):** `odd/tasks/issue-286-tenant-id-uuid.md`
**Sibling slices:** `odd/tasks/issue-286-slice-b1.md` (#360/#369/#363/#364), `odd/tasks/issue-286-slice-b2.md` (#368/#372/#374)
**Base:** `origin/main` @ `5ecbe23`
**Status:** C.1 merged (#384, `5ecbe23`). C.2–C.6 planned; no code written for those units.

## Scope — measured from the catalog

**14 tables, 24 policies, and the end of the ratchet: 14 → 0.**

| Table | Policies | Notes |
| --- | --- | --- |
| `tenant_capability_event` | 4 | select/insert/update/delete |
| `tenant_topology_revisions` | 2 | select/insert |
| `tenant_fulfillment_records` | 4 | select/insert/update/delete |
| `device_sync_credentials` | 4 | select/insert/update/delete |
| `device_sync_credential_events` | 2 | select/insert |
| `catalog_values` | 4 | select/insert/update/delete |
| `invoice_items` | 4 | `credit_note_invoice_items_*` |
| `audit_integrity_alerts` | 0 | column change only |
| `forensic_alerts` | 0 | column change only, **no entity maps it** |
| `promotions` | 0 | column change only |
| `customers` | 0 | column change only |
| `customer_point_transactions` | 0 | column change only |
| `legacy_import_integrity_reports` | 0 | column change only |
| `legacy_onboarding_migration_receipts` | 0 | column change only |

`invoices` is **not** in this slice: it is already `uuid` and its predicates were aligned by Unit 0.3 (`1809060000000`), which is why the plan's original Unit 6 (2 tables / 8 policies) is 1 table / 4 policies here.

## The re-run class — enumerated in one pass

Six files carry a hardcoded bare predicate for these tables, and **all six are in the harness's `partial_ledger_names`**, so all six re-run in scenario 2:

| File | Bare predicate sites |
| --- | --- |
| `1768000000000-CreateCatalogValues.ts` | catalog_values |
| `1785000000000-AddTenantCapabilityEvent.ts` | tenant_capability_event |
| `1794000000001-AddTenantTopologyRevisionsRls.ts` | tenant_topology_revisions |
| `1795000000000-CreateTenantFulfillmentRecords.ts` | tenant_fulfillment_records |
| `1807000000000-CreateDeviceSyncCredentials.ts` | device_sync_credentials + device_sync_credential_events |
| `1808000000000-RepairTenantTopologyRevisions.ts` | tenant_topology_revisions (repair) |

`1782000000000-AddCreditNoteProvenance.ts` also creates `invoice_items` policies but was made type-aware by slice A, so it needs nothing. Each of the six needs the resolver called **once per table site**, never a shared resolution.

## Preflight — the fixture class, and it is bigger than in B1 or B2

The rule recorded after slice B1: a fixture census that greps for entity class names is blind to entities referenced **through a helper**, and the checkable class is *"a fixture that synchronize-builds from an entity whose `tenant_id` type changes"*. Measured for slice C by resolving each `DataSource`'s `entities:` array rather than by grepping names:

**Thirteen fixtures with `synchronize: true` build at least one slice C entity**, and they matter only where the entity's derived type actually changes:

| Fixture | Slice C entities it builds |
| --- | --- |
| `activation-device-provisioning.db.spec.ts` | `InvoiceItem` |
| `activation.service.db.spec.ts` | `InvoiceItem` |
| `invoices.service.db.spec.ts` | `InvoiceItem` |
| `activation-flow.db.e2e-spec.ts` | `InvoiceItem` |
| `onboarding-readiness.db.e2e-spec.ts` | `InvoiceItem` |
| `onboarding-template-cutover.db.e2e-spec.ts` | `InvoiceItem`, `LegacyOnboardingMigrationReceipt` |
| `onboarding-74-scenarios-normative.db.e2e-spec.ts` | `InvoiceItem`, `LegacyImportIntegrityReport`, `LegacyOnboardingMigrationReceipt` |
| `onboarding-fault-injection.db.e2e-spec.ts` | `LegacyOnboardingMigrationReceipt` |
| `onboarding-import-cutover.db.e2e-spec.ts` | `LegacyImportIntegrityReport`, `LegacyOnboardingMigrationReceipt` |
| `onboarding-rollback-rehearsal.db.e2e-spec.ts` | `LegacyImportIntegrityReport`, `LegacyOnboardingMigrationReceipt` |
| `onboarding-sale-ready-acquisition.db.e2e-spec.ts` | `InvoiceItem`, `LegacyImportIntegrityReport`, `LegacyOnboardingMigrationReceipt` |
| `onboarding-security-isolation.db.e2e-spec.ts` | `LegacyOnboardingMigrationReceipt` |
| `onboarding-w9.db.e2e-spec.ts` | `LegacyOnboardingMigrationReceipt` |
| `catalog-routes.db.e2e-spec.ts` | `CatalogValue` |

**Which of these actually break depends on the entity's derived type, and only two entities change it:**

- `invoice-item.entity.ts` declares `@Column({ name: 'tenant_id' })` on a `string` property → derives **`varchar`** today → becomes uuid → **every fixture above that seeds a text tenant id into `invoice_items` breaks.** This is slice B1's failure exactly.
- `legacy-migration-receipt.entity.ts` declares `varchar` with `length: 128` → becomes uuid → **same exposure** for the nine fixtures that build it.
- `catalog-value.entity.ts` and `legacy-import-integrity-report.entity.ts` declare `@ManyToOne(() => Tenant) @JoinColumn({ name: 'tenant_id' })`, which derives **`uuid`** from `Tenant`'s primary key **even today** — so those fixtures already build a uuid column and are unaffected by the entity change. Their seeds are necessarily already valid UUIDs, or they would be failing now.
- `device-sync-credential*.entity.ts` declare `varchar(128)` and must convert, but no fixture synchronizes them.

Literal text seeds were found in `invoices.service.db.spec.ts` (6), `onboarding-template-cutover.db.e2e-spec.ts` (2) and `onboarding-security-isolation.db.e2e-spec.ts` (1); the rest seed from variables whose values must be checked at the unit, not assumed. **The fix pattern is slice B1's**: a valid, deterministic UUID derived from a readable label, with no assertion weakened and no test skipped.

**Corrected in C.2, and it matters for C.3–C.5.** The table above enumerates each fixture by the slice C entities it builds, and it is incomplete for C.2's own three tables: `activation-device-provisioning.db.spec.ts` is listed as `InvoiceItem` only, but it is `synchronize: true` and also builds `TenantTopologyRevision`. It is safe *only because it seeds `randomUUID()`* — a text seed there would have broken exactly as in B1. So the checkable class is not "a fixture that builds a slice C entity" but "a fixture that builds a slice C entity **whose column type changes** *and* seeds a non-UUID value", and no enumeration of the first class substitutes for it. Measured for C.2, three ways: no spec runs the full migration chain (`migrationsRun: true` / `runMigrations(` have zero hits), the one `synchronize: true` fixture above seeds a valid UUID, and the four `test/identity/*.e2e-spec.ts` files that import `TenantCapabilityEvent` mock the repository rather than a schema. Also measured: the harness does not exercise a rebind unit's own re-run, because `partial_ledger_names` holds only CREATE migrations — C.2's idempotency is therefore argued from the emitter, not proven by the harness.

**Corrected in C.3, and it invalidates a forward claim in this plan.** The C.3 unit row originally read "`forensic_alerts` has no entity, so the harness's entity assertion cannot see it". **That is backwards.** `collect_schema_uuid_tenant_tables` selects *every* public base table whose `tenant_id` is uuid, with no entity requirement, and `report_tenant_entity_diff` counts a uuid tenant table that no entity declares and `fail`s the build when that count is non-zero (`verify-schema-build.sh:664` and `:732`). The script's own comment states the intent: a table with no entity "mean[s] the entity was left behind by the slice that rebound the column". Measured consequence: rebinding `forensic_alerts` without an entity takes `entity uuid mismatches` from 0 to 1 and fails both scenarios. C.3 therefore **adds** `modules/inventory/entities/forensic-alert.entity.ts` and registers it in `app.module.ts`; that entity is what makes the counter 0, confirmed by verifying the rebind migration applied and that `forensic_alerts.tenant_id` is uuid in the built schema. The rule for C.4 and C.5: **a rebind target needs an entity declaring `tenant_id` as uuid, so measure entity coverage per table before assuming any table is invisible to the harness.** Measured now for the remaining units: all seven of C.4's and C.5's tables (`catalog_values`, `promotions`, `customers`, `customer_point_transactions`, `legacy_import_integrity_reports`, `legacy_onboarding_migration_receipts`, `invoice_items`) already have an entity, so `forensic_alerts` was the only orphan in this slice.

**Corrected in C.4, and it was wrong in both directions.** Three separate claims in the preflight needed re-measurement. (1) The table above says *thirteen* fixtures; it actually has **14 rows**. (2) The receipt-building fixtures number **eight**, not nine — `onboarding-readiness.db.e2e-spec.ts` is listed here as building `LegacyOnboardingMigrationReceipt` but does not; its `entities:` array builds `InvoiceItem`, so it belongs to C.5. (3) The literal-seed claim misattributes its evidence: `onboarding-template-cutover.db.e2e-spec.ts` and `onboarding-security-isolation.db.e2e-spec.ts` hold **no literal tenant-id database seed at all** — the only matches in the latter are `tenantId: ''` / `tenant_id: ''` in a malformed-token 401 test, which is a JWT claim, not a row. Measured consequence: **C.4's fixture work is zero and no fixture was edited**, confirmed empirically rather than argued. The six literal seeds the plan attributes here live in `invoices.service.db.spec.ts`, which builds `InvoiceItem` — that is C.5's exposure, and it is real: that spec is `synchronize: true` and seeds `tenant_id: 'tenant-db'` and `'tenant-rls'`.

**Also corrected in C.4, and it is load-bearing.** Five of C.4's six entities were deliberately **not** edited, because they declare `@Column()` or `@Column({ type: 'varchar' })` alongside `@ManyToOne(() => Tenant) @JoinColumn({ name: 'tenant_id' })` and TypeORM folds the dual declaration into one column whose type it overrides with the referenced column's (`node_modules/typeorm/metadata-builder/RelationJoinColumnBuilder.js:183`: *"we override user defined column type"*); `Tenant.id` is uuid. This is verifiable rather than arguable, because the harness flags a uuid tenant column whose entity declares another type: had the folding been false, those five tables would appear as mismatches and `entity uuid mismatches` would read 5. It read **0**, with all six tables confirmed uuid in the built schema. C.5's `invoice-item.entity.ts` declares `@Column({ name: 'tenant_id' })` on a string with no relation, so it **does** need converting — the two units are not symmetric here.

**Corrected in C.5, and the prediction was wrong a third time.** The C.5 unit row said this unit "carries the `InvoiceItem` fixture fixes (five fixtures, one shared with C.4's list)". Measured: **zero fixtures needed an edit** and none was made. The reasoning error is the same one that cost C.4 its estimate — the preflight counted literal tenant-id *strings* in files that build a slice C entity, without resolving which table each write actually targets. Concretely, `invoices.service.db.spec.ts` is `synchronize: true`, but the literal `tenant_id: 'tenant-db'` and `'tenant-rls'` strings at `:955`, `:1057` and `:1110` sit in the `withIsolatedSchema` tests whose entities array is `[InventorySyncReceipt, InventorySyncOutbox]` — they do not build `InvoiceItem` at all, they hand-create `invoice_items` through raw `varchar` DDL, and the strings are written to `inventory_sync_outbox` / `inventory_sync_receipts`. Those belong to another slice, not to C.5. Separately, every one of the nine `synchronize: true` DataSources that really does build `InvoiceItem` seeds `randomUUID()`. The lesson, now measured three units in a row: **a fixture census must resolve the target table of every seed, not the entity list of the file.** Either way the empirical check is cheap — the full suites settle it, and they stayed green.

## Units

Each unit is its own commit, its own pull request, and — following slice B2, which was right — **based directly on `main`, never stacked**. Every unit here is green on its own.

| # | Contents | Expected |
| --- | --- | --- |
| **C.1** | The six earlier migrations resolve the predicate per table site. Behaviour-neutral: every column is still varchar, so no harness counter may move. | ~350–450 |
| **C.2** | Lifecycle: `tenant_capability_event` (4), `tenant_topology_revisions` (2), `tenant_fulfillment_records` (4) = 3 tables / 10 policies, plus their entities. Manifest −3. | ~400 |
| **C.3** | Devices and alerts: `device_sync_credentials` (4), `device_sync_credential_events` (2) = 6 policies, plus `audit_integrity_alerts` and `forensic_alerts` with no policies. Manifest −4. `forensic_alerts` has no entity, and **one must be added** — see the correction below; the harness's entity assertion does see it. | ~350 |
| **C.4** | Catalog, loyalty and legacy: `catalog_values` (4) plus `promotions`, `customers`, `customer_point_transactions`, `legacy_import_integrity_reports`, `legacy_onboarding_migration_receipts` with no policies. Manifest −6. Fixture work was predicted at nine fixtures and **measured at zero** — see the correction below. | ~450 (fixtures included) |
| **C.5** | Sales: `invoice_items` (4). Manifest −1, leaving **0**. Fixture work was predicted at five fixtures and **measured at zero** — see the correction below. | ~350 (fixtures included) |
| **C.6** | Independent verification out of the catalog, not the specs: zero non-uuid tenant columns, every policy in the target form with no column-side `::text`, and `EXPLAIN` as a **non-bypassing role** on a sample including the composite-key tables. | evidence only |

C.4 and C.5 carry the fixture work because a unit owns the fixtures it breaks. That work may dominate those units' review size, which is why the estimate includes it — and if either lands materially over, the overage is disclosed rather than hidden.


### C.1 contract, and why the emitted SQL is not byte-identical

**The resolver's varchar answer is `tenant_id::text = current_setting('app.tenant_id', true)` — the column-cast form — while the six migrations in this unit hardcoded the *bare* compare `tenant_id = current_setting('app.tenant_id', true)`.** So this unit's change is **not** textually identical: varchar columns gain a column-side `::text`.

That is **provably plan-equivalent**, measured rather than argued. On `catalog_values.tenant_id` (varchar, `enable_seqscan = off`), both forms produce the same plan:

```
Index Only Scan using idx_catalog_values_tenant_type_active on catalog_values
  Index Cond: (tenant_id = current_setting('app.tenant_id'::text, true))
```

The planner normalises the `varchar → text` relabel and discards it, so the index condition is identical either way. And the harness's `uuid col text casts` counter only inspects policies on columns whose `data_type` is already `uuid`, so it cannot move — confirmed at `14 / 0 / 0 / 0` in both scenarios.

**Consequence for C.2–C.5: a spec that pins the bare form is pinning the *old* contract.** One pre-existing assertion in `1808000000000-RepairTenantTopologyRevisions.spec.ts` was updated from the bare form to the resolver's exact output — a stricter exact-string pin, not a loosened one. Do not "correct" it back.

## Review budget

Calibration, measured across this issue: a migration plus its spec costs roughly 25–30 lines per policy with the spec dominating; entity conversions cost 2 lines each; the manifest 1 line per entry; and a fixture fix costs 15–20 lines.

| Unit | Expectation | Measured at close |
| --- | --- | --- |
| C.1 | ~350–450 | 268 (236 ins / 32 del, code only) |
| C.2 | ~400 | 496 (487 new / 9 del) |
| C.3 | ~350 | 459 (452 ins / 7 del) |
| C.4 | ~450 | 381 (372 ins / 9 del) |
| C.5 | ~350 | 375 (370 ins / 5 del) |

## Process hazards inherited (all measured, all cost something already)

1. **`npm run lint` in `apps/admin_backend` is `eslint "{src,apps,libs,test}/**/*.ts" --fix`.** It rewrote 48 unrelated files during slice B1 while exiting 0. Verify lint with `npx eslint <paths>`.
2. **Never stack.** A silent `gh pr edit --base` failure squash-merged a child into its parent branch during slice B1 and cost a recovery pull request. Retarget through REST, read the base back, retarget before pushing, and prefer sequential links on `main` when each is green alone.
3. **A green measured against a superseded base is not evidence.** `main` moved five times during B1.
4. **A conformance spec pins an entity's declared columns in more places than a reader enumerates** — three in `human-auth-entities.spec.ts`, not the two the document listed. Grep the whole spec for the old shape. Check whether an equivalent spec exists for slice C's entities before assuming there is none.
5. **RLS plan evidence must be taken as a non-bypassing role**; as a superuser the qual is absent from the plan and the same `EXPLAIN` looks clean for the wrong reason.
6. **`test:e2e` failed once in two different units and never reproduced** (7 tests each, suite never captured). Treat a single red run as untrusted until it repeats, and record it rather than attributing it. Measured in C.2: it did not reproduce (49 suites / 392 tests green, first pass).
7. **Three migration specs are gated on `DB_PASSWORD` and run in no suite at all.** `1764000000000-EnforceAuditLogImmutability.spec.ts`, `1765000000000-CreateAuditIntegrityAlerts.spec.ts` and `1766000000000-BohInventoryLedgerFoundation.spec.ts` self-skip via `process.env.DB_PASSWORD?.trim() ? describe : describe.skip`, because plain `npm test` does not load `test/setup-test-env.ts`; and neither `test:db` (`*.db.spec.ts`) nor `test:e2e` (`.e2e-spec.ts`) matches them. They account for the 3 skipped suites in the C.2 run. Activated explicitly with `DB_PASSWORD` set they pass (3/3, 7 tests), so they are green today — but a red there would be invisible to the standard evidence run. `1765000000000` creates `audit_integrity_alerts`, a C.3 table, so **C.3 must activate them rather than inherit the skip**.
8. **`omnifood.public` is not a valid pre-rebind baseline, and using it to check `previousType` will mislead you.** Measured in C.5: `omnifood.public.invoice_items.tenant_id` is already **uuid** while its `migrations` ledger holds **zero** `Rebind%` rows — the column was changed by something outside the migration set. An earlier unit's verification had used `omnifood` as its "genuine pre-state" reference; that happened to be right for its tables, and it is wrong for at least this one. Derive `previousType` from the creating migration's DDL (the schema the harness builds comes only from migrations, so the DDL is authoritative) and corroborate against the harness's own scratch database, never against a long-lived development database. The same database also carries leftover fixture schemas (`norm74_*`, `onb_telemetry_*`) whose table copies still hold the varchar form — those corroborate the DDL shape but are not the migration-built schema either.
9. **A rebind unit's `down()` is never exercised by the harness, so `previousType` is unverified by construction.** The harness only applies migrations upward; nothing in the evidence run calls `down()`. The value is therefore argued from the DDL plus `canonicalColumnType`, and a wrong one would break a rollback silently. Treat `previousType` as the single most dangerous unverifiable-by-harness field in each unit.

## Evidence log

| Unit | Commit | Evidence |
| --- | --- | --- |
| **C.1** | `5ecbe23` (#384) | Six migrations resolve per table site. Harness exit 0 in both scenarios, `14 / 0 / 0 / 0` verbatim, `uuid tenant_id tables: 51`, `entity uuid mismatches: 0`. 232 suites / 2128 tests green. |
| **C.2** | `b6cf14b` (#398) | 3 tables / 10 policies rebound; ratchet 14 → 11. Harness exit 0 in both scenarios: `11 / 0 / 0 / 0` verbatim, `uuid tenant_id tables: 51 → 54`, `entity uuid mismatches: 0`, `ledger rows removed: 27 / 27`. Spec 5/5; `1808000000000-RepairTenantTopologyRevisions.spec.ts` 8/8 and unmodified. `nest build` and `npx eslint` (five paths) exit 0. Each `previousType` verified against the live pre-C.2 `information_schema`, not only the DDL: `character varying` ×2, `character varying(64)` ×1. No fixture fix was needed. Suites: `npm test` 233 suites / 2176 tests, `test:db` 38 / 219, `test:e2e` 49 / 394, all green with zero failures. |
| **C.3** | `feat/tenant-uuid-slice-c3-devices-alerts` (PR pending) | 4 tables rebound, 6 policies recreated (2 alert tables column-only); ratchet **11 → 7** on a base that already contains C.2. Harness exit 0 in both scenarios: `7 / 0 / 0 / 0` verbatim, `uuid tenant_id tables: 54 → 58`, `entity uuid mismatches: 0`, `ledger rows removed: 27 / 27`. Spec 5/5; `1807000000000-CreateDeviceSyncCredentials.spec.ts` 6/6 and unmodified, its `::text` pins at `:141`/`:169` intact. Suites green on the post-C.2 base, which is the earlier baseline plus C.2's own spec: `npm test` 2181 tests, `test:db` 219, `test:e2e` 394. The three `DB_PASSWORD`-gated specs activated and green (3 / 7). The six policies verified present exactly once in the scratch catalog, both device tables still `FORCE ROW LEVEL SECURITY` and not deny-all, and the abbreviated `device_sync_cred_events_tenant_*` naming preserved. `previousType` verified against the live pre-C.3 `information_schema`: `character varying(128)` ×2, `character varying` ×2. |
| **C.4** | `feat/tenant-uuid-slice-c4-catalog-loyalty-legacy` (PR pending) | 6 tables rebound, 4 policies recreated (5 tables column-only); ratchet **7 → 1** on a base that already contains C.2 and C.3. Harness exit 0 in both scenarios: `1 / 0 / 0 / 0` verbatim, `uuid tenant_id tables: 58 → 64`, `entity uuid mismatches: 0`, `ledger rows removed: 27 / 27`. Spec 5/5; `1768000000000-CreateCatalogValues.spec.ts` and `1795000000000-AddLoyaltyV1Columns…spec.ts` unmodified. Suites green on the new base, which now also carries C.3's spec: `npm test` 2186 tests, `test:db` 219, `test:e2e` 394. The three `DB_PASSWORD`-gated specs activated and green (3 / 7). No fixture was edited, which is the empirical refutation of the predicted fixture work. |
| **C.5** | `feat/tenant-uuid-slice-c5-invoice-items` (PR pending) | 1 table rebound, 4 policies recreated; ratchet **1 → 0**, the end of the slice. Harness exit 0 in both scenarios: `0 / 0 / 0 / 0` verbatim, `uuid tenant_id tables: 64 → 65`, `entity uuid mismatches: 0`, `ledger rows removed: 27 / 27`. The four `credit_note_invoice_items_*` policies verified present exactly once in the scratch catalog, all four in the setting-cast form with no column-side `::text`, and `invoice_items` still `FORCE ROW LEVEL SECURITY`. That rests on scenario 2 re-running `1782000000000`, whose type-aware resolver re-emits the uuid predicate because the column is uuid by then — independently confirmed by the emitted SQL, not only by the counter. Spec 5/5; `1782000000000-AddCreditNoteProvenance.spec.ts` and `1809060000000-AlignInvoiceTenantPolicyPredicate.spec.ts` unmodified and green (18 tests). Suites green on the merged base, which now carries the specs of C.2, C.3 and C.4: `npm test` 2191 tests, `test:db` 219, `test:e2e` 394, and the three `DB_PASSWORD`-gated specs 7. No fixture edited. `previousType` derived from the `1770000000000` DDL (`varchar` with no length → `character varying`) — NOT from `omnifood`, see hazard 8. |

**Re-measured after rebase, because hazard 3 applies to this slice.** These numbers were first taken against `5ecbe23`. `main` then moved eleven commits (`5ecbe23` to `262088a`, the OHAC delivery work), which changed **both** `verify-schema-build.sh` (it learned to ignore `@ViewEntity` / `@ViewColumn`) and several fixtures this slice builds against, including `activation-device-provisioning.db.spec.ts` and six onboarding e2e specs. A green measured against a superseded base is not evidence, so every unit was rebased onto `262088a` and re-measured there: harness exit 0 in both scenarios with unchanged counters, and suites green on the new baseline of **233 / 2176, 38 / 219, 49 / 394**. All four rebases were conflict-free, including `app.module.ts`, where the C.3 `ForensicAlert` entity and the `SystemParametersConfigActiveView` entity added by main both survive.

## Relevant files

- `apps/admin_backend/src/migrations/1768000000000-CreateCatalogValues.ts`, `1785000000000-AddTenantCapabilityEvent.ts`, `1794000000001-AddTenantTopologyRevisionsRls.ts`, `1795000000000-CreateTenantFulfillmentRecords.ts`, `1807000000000-CreateDeviceSyncCredentials.ts`, `1808000000000-RepairTenantTopologyRevisions.ts` — C.1's six files.
- `apps/admin_backend/src/migrations/1809100000000-RebindHumanAuthorizationTenantColumns.ts` — the closest template (slice B2's first slice unit), and after it `1809120000000-RebindLifecycleTenantColumns.ts` (C.2), `1809130000000-RebindDeviceAndAlertTenantColumns.ts` (C.3), `1809140000000-RebindCatalogLoyaltyLegacyTenantColumns.ts` (C.4) and `1809150000000-RebindInvoiceItemsTenantColumn.ts` (C.5). Note the deliberate timestamp gaps: the units are not stacked, so each claims a distinct timestamp to avoid a collision at merge.
- `apps/admin_backend/scripts/schema-tenant-type-manifest.txt` — the ratchet, 14 entries, empty at the end of this slice.
- `apps/admin_backend/scripts/verify-schema-build.sh` — `partial_ledger_names` defines the re-run class.
- `apps/admin_backend/src/core/database/tenant-rls-policy.ts` — the shared emitter and `resolveTenantRlsPredicate`; unchanged here, consumed by every unit.
- The thirteen fixtures listed in the preflight, in the units that convert the entities they build.
