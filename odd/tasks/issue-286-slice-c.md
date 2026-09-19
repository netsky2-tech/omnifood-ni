# Issue #286 — Phase 2 slice C: tenant lifecycle, devices, catalog/loyalty and sales

**Parent plan (plan of record):** `odd/tasks/issue-286-tenant-id-uuid.md`
**Sibling slices:** `odd/tasks/issue-286-slice-b1.md` (#360/#369/#363/#364), `odd/tasks/issue-286-slice-b2.md` (#368/#372/#374)
**Base:** `origin/main` @ `8e3fe64`
**Status:** planned 2026-09-19, no code written.

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

**Corrected in C.5, and the prediction was wrong a third time.** The C.5 unit row said this unit "carries the `InvoiceItem` fixture fixes (five fixtures, one shared with C.4's list)". Measured: **zero fixtures needed an edit** and none was made. The reasoning error is the same one that cost C.4 its estimate — the preflight counted literal tenant-id *strings* in files that build a slice C entity, without resolving which table each write actually targets. Concretely, `invoices.service.db.spec.ts` is `synchronize: true`, but the literal `tenant_id: 'tenant-db'` and `'tenant-rls'` strings at `:955`, `:1057` and `:1110` sit in the `withIsolatedSchema` tests whose entities array is `[InventorySyncReceipt, InventorySyncOutbox]` — they do not build `InvoiceItem` at all, they hand-create `invoice_items` through raw `varchar` DDL, and the strings are written to `inventory_sync_outbox` / `inventory_sync_receipts`. Those belong to another slice, not to C.5. Separately, every one of the nine `synchronize: true` DataSources that really does build `InvoiceItem` seeds `randomUUID()`. The lesson, now measured three units in a row: **a fixture census must resolve the target table of every seed, not the entity list of the file.** Either way the empirical check is cheap — the full suites settle it, and they stayed green (233 / 2176, 38 / 219, 49 / 394).

## Units

Each unit is its own commit, its own pull request, and — following slice B2, which was right — **based directly on `main`, never stacked**. Every unit here is green on its own.

| # | Contents | Expected |
| --- | --- | --- |
| **C.1** | The six earlier migrations resolve the predicate per table site. Behaviour-neutral: every column is still varchar, so no harness counter may move. | ~350–450 |
| **C.2** | Lifecycle: `tenant_capability_event` (4), `tenant_topology_revisions` (2), `tenant_fulfillment_records` (4) = 3 tables / 10 policies, plus their entities. Manifest −3. | ~400 |
| **C.3** | Devices and alerts: `device_sync_credentials` (4), `device_sync_credential_events` (2) = 6 policies, plus `audit_integrity_alerts` and `forensic_alerts` with no policies. Manifest −4. `forensic_alerts` has no entity, so the harness's entity assertion cannot see it. | ~350 |
| **C.4** | Catalog, loyalty and legacy: `catalog_values` (4) plus `promotions`, `customers`, `customer_point_transactions`, `legacy_import_integrity_reports`, `legacy_onboarding_migration_receipts` with no policies. Manifest −6. **Carries the `LegacyOnboardingMigrationReceipt` fixture fixes** (nine fixtures). | ~450 (fixtures included) |
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
| C.1 | ~350–450 | |
| C.2 | ~400 | |
| C.3 | ~350 | |
| C.4 | ~450 | |
| C.5 | ~350 | 364 (362 ins / 2 del) |

## Process hazards inherited (all measured, all cost something already)

1. **`npm run lint` in `apps/admin_backend` is `eslint "{src,apps,libs,test}/**/*.ts" --fix`.** It rewrote 48 unrelated files during slice B1 while exiting 0. Verify lint with `npx eslint <paths>`.
2. **Never stack.** A silent `gh pr edit --base` failure squash-merged a child into its parent branch during slice B1 and cost a recovery pull request. Retarget through REST, read the base back, retarget before pushing, and prefer sequential links on `main` when each is green alone.
3. **A green measured against a superseded base is not evidence.** `main` moved five times during B1.
4. **A conformance spec pins an entity's declared columns in more places than a reader enumerates** — three in `human-auth-entities.spec.ts`, not the two the document listed. Grep the whole spec for the old shape. Check whether an equivalent spec exists for slice C's entities before assuming there is none.
5. **RLS plan evidence must be taken as a non-bypassing role**; as a superuser the qual is absent from the plan and the same `EXPLAIN` looks clean for the wrong reason.
6. **`test:e2e` failed once in two different units and never reproduced** (7 tests each, suite never captured). Treat a single red run as untrusted until it repeats, and record it rather than attributing it.
7. **`omnifood.public` is not a valid pre-rebind baseline, and using it to check `previousType` will mislead you.** Measured in C.5: `omnifood.public.invoice_items.tenant_id` is already **uuid** while its `migrations` ledger holds **zero** `Rebind%` rows — the column was changed by something outside the migration set. An earlier unit's verification had used `omnifood` as its "genuine pre-state" reference; that happened to be right for its tables, and it is wrong for at least this one. Derive `previousType` from the creating migration's DDL (the schema the harness builds comes only from migrations, so the DDL is authoritative) and corroborate against the harness's own scratch database, never against a long-lived development database. The same database also carries leftover fixture schemas (`norm74_*`, `onb_telemetry_*`) whose table copies still hold the varchar form — those corroborate the DDL shape but are not the migration-built schema either.
8. **A rebind unit's `down()` is never exercised by the harness, so `previousType` is unverified by construction.** The harness only applies migrations upward; nothing in the evidence run calls `down()`. The value is therefore argued from the DDL plus `canonicalColumnType`, and a wrong one would break a rollback silently. Treat `previousType` as the single most dangerous unverifiable-by-harness field in each unit.

## Evidence log

| Unit | Commit | Evidence |
| --- | --- | --- |
| **C.1** | pending merge | Six migrations resolve per table site. Harness exit 0 in both scenarios, `14 / 0 / 0 / 0` verbatim, `uuid tenant_id tables: 51`, `entity uuid mismatches: 0`. 232 suites / 2128 tests green. |
| **C.5** | `feat/tenant-uuid-slice-c5-invoice-items` (PR pending) | 1 table rebound, 4 policies recreated; ratchet 14 → 13 on this branch (the remaining 13 entries belong to C.2/C.3/C.4, and all four units together take it to 0). Harness exit 0 in both scenarios: `13 / 0 / 0 / 0` verbatim, `uuid tenant_id tables: 51 → 52`, `entity uuid mismatches: 0`, `ledger rows removed: 27 / 27`. The four `credit_note_invoice_items_*` policies verified present exactly once in the scratch catalog, all four in the setting-cast form with no column-side `::text`, and `invoice_items` still `FORCE ROW LEVEL SECURITY`. That last point rests on scenario 2 re-running `1782000000000`, whose type-aware resolver re-emits the uuid predicate because the column is uuid by then — `uuid col text casts: 0` confirms it. Spec 5/5; `1782000000000-AddCreditNoteProvenance.spec.ts` and `1809060000000-AlignInvoiceTenantPolicyPredicate.spec.ts` unmodified and green (18 tests). Suites: `npm test` 233 / 2176, `test:db` 38 / 219, `test:e2e` 49 / 394, all green with no fixture edited. The three `DB_PASSWORD`-gated specs activated and green (3 / 7). `previousType` derived from the `1770000000000` DDL (`varchar` with no length → `character varying`) — NOT from `omnifood`, see hazard 7. |

**Re-measured after rebase, because hazard 3 applies to this slice.** These numbers were first taken against `5ecbe23`. `main` then moved eleven commits (`5ecbe23` to `262088a`, the OHAC delivery work), which changed **both** `verify-schema-build.sh` (it learned to ignore `@ViewEntity` / `@ViewColumn`) and several fixtures this slice builds against, including `activation-device-provisioning.db.spec.ts` and six onboarding e2e specs. A green measured against a superseded base is not evidence, so every unit was rebased onto `262088a` and re-measured there: harness exit 0 in both scenarios with unchanged counters, and suites green on the new baseline of **233 / 2176, 38 / 219, 49 / 394**. All four rebases were conflict-free, including `app.module.ts`, where the C.3 `ForensicAlert` entity and the `SystemParametersConfigActiveView` entity added by main both survive.

## Relevant files

- `apps/admin_backend/src/migrations/1768000000000-CreateCatalogValues.ts`, `1785000000000-AddTenantCapabilityEvent.ts`, `1794000000001-AddTenantTopologyRevisionsRls.ts`, `1795000000000-CreateTenantFulfillmentRecords.ts`, `1807000000000-CreateDeviceSyncCredentials.ts`, `1808000000000-RepairTenantTopologyRevisions.ts` — C.1's six files.
- `apps/admin_backend/src/migrations/1809100000000-RebindHumanAuthorizationTenantColumns.ts` — the closest template (slice B2's first slice unit), and now also `1809150000000-RebindInvoiceItemsTenantColumn.ts` (C.5). Note the deliberate timestamp gaps: C.2, C.3, C.4 and C.5 are not stacked, so each claims a distinct timestamp to avoid a collision at merge.
- `apps/admin_backend/scripts/schema-tenant-type-manifest.txt` — the ratchet, 14 entries, empty at the end of this slice.
- `apps/admin_backend/scripts/verify-schema-build.sh` — `partial_ledger_names` defines the re-run class.
- `apps/admin_backend/src/core/database/tenant-rls-policy.ts` — the shared emitter and `resolveTenantRlsPredicate`; unchanged here, consumed by every unit.
- The thirteen fixtures listed in the preflight, in the units that convert the entities they build.
