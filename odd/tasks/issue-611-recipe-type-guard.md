# #611 — Server-side guard: a recipe must never become PUBLISHED on a product no consumption branch reads

**Branch:** `fix/611-recipe-type-guard` off `origin/main @ 4214731e`
**Worktree:** `../omnifood-ni-worktrees/issue-611-type-guard`
**Plan row:** founder-pilot critical path (discovered while sizing #523 T6; now ranked above B1b-T3)
**No migration in this unit** — behaviour + validation only. Latest migration on this base is `1809500000000` (from #609).

## The defect, in one paragraph

Both consumption branches are keyed on `product.product_type`: the cloud recipe branch admits only `PREPARED | COMPOUND` (`sale-inventory-outcome.service.ts:366`) and the `simple` branch yields `noImpact` unless an explicit insumo mapping exists (`sale_inventory_outcome_planner.dart:110-116`). But **no server-side write path validates the type before making a recipe live**. `grep product_type apps/admin_backend/src/modules/inventory/recipe.service.ts` returns **zero** hits — verified by hand, not inherited. The dashboard's product picker filters to `COMPOUND` (`recipes-page.tsx:24`), which is a **frontend-only** filter: any API caller, older build, or script can attach a published recipe to a `SIMPLE` product, and the result is a dish that looks live everywhere in the UI and consumes nothing forever.

## Executed evidence (dev DB, this session)

`e05bf002-b1d3-45f2-a46a-3592e1cc1431` is **SOHO** — `slug = soho`, the tenant behind the DGI authorization letter. It has 10 `SIMPLE` products carrying `PUBLISHED` + `is_active` recipes, zero rows in `product_inventory_mapping_versions`, and **17 invoice lines** already sold against them.

Their component sums are credible kitchen gram weights (espresso 9 g, doble 18 g, hamburguesa 257 g over 7 ingredients), i.e. **9 real dishes typed `SIMPLE` by hand**, plus 1 resale item expressed as a 1-component recipe because no mapping create path exists (#518). Provenance by fingerprint: `pos_document_id IS NULL` → Path A/dashboard (8 rows); non-NULL → Path B/POS ingest (2 rows).

Full data is in #611's comments; do not re-derive it.

## Scope: guard exactly two paths

| Path | Method | In scope | Why |
|---|---|---|---|
| A | `RecipeService.createNewVersion` (`recipe.service.ts:84`) | **YES** | Synchronous, human at the keyboard. A 400 here is information. |
| C | `RecipeService.publishDraftVersion` (`recipe.service.ts:188`) | **YES** | Same. Also the route #609 just exposed (`POST /recipes/:recipeVersionId/publish`). |
| B | `ingestPosVersion` / `createFreshVersion` (POS sync) | **NO — deliberately** | See below. This is not an oversight. |

### Why Path B is out of scope (offline-first, learned the expensive way)

Rejecting a recipe document at ingestion means the POS push fails. This project has already paid twice for turning a data-shape problem into a sync failure: #551 (fiscal facts failing to reach the cloud) and the U4 defect found by the independent verifier in #519, where one non-critical persistence error would have taken down the **whole pull**. A mistyped product must never be able to block invoices from uploading. Path B needs a **non-failing** mechanism (accept and surface a pending-attention verdict), which is a design of its own — leave it open in #611 rather than improvising it here.

## Consequence to state plainly: this makes #610 a prerequisite for existing tenants

`dddb91ab…` and `497d0f48…` (both "Founder Pilot Q80" fixtures) have **DRAFT suggestions on `SIMPLE` products**, created before #609's T1 existed. Once Path C is guarded, publishing those suggestions fails — with a clear message instead of silently producing an inert menu. That is the intended trade: a visible error the operator can act on beats a menu that quietly consumes nothing. Repairing those rows is **#610's** job, and #610 must land (or the operator must change the product type) before the publish route works for any tenant whose template was applied pre-#609.

The repair itself needs **no new endpoint**: `product_type` is required on create (`create-product.dto.ts:31-32`) and **optional on update** (`update-product.dto.ts:31-32`), so the type is already changeable. (This also contradicts #517's claim that the type cannot be changed after creation — worth correcting there.)

## Guard requirements

1. Read the product **inside the same tenant-bound transaction** the method already uses — no extra unbound query, no TOCTOU window between check and write.
2. Reject when the product type is not in the recipe branch (`PREPARED | COMPOUND`). Reuse the existing `ProductType` enum; **do not** invent a parallel allow-list — the whole point is that the guard and `sale-inventory-outcome.service.ts:366` agree.
3. Error must be a `BadRequestException` whose message is operator-actionable, in neutral Spanish (usted), naming the product and the fix location (Catálogo → tipo de producto). It is UI text: it must **not** become a `reasonCode`, invoice field, or snapshot payload.
4. A missing product row must keep its current behaviour — do not silently convert "not found" into a type error.
5. TDD: failing test first, per path.

## Explicit non-goals

- No change to Path B (POS ingestion) contract.
- No data repair, no migration, no bulk `UPDATE` of any tenant's `products`. That is #610 and it needs the client's decision per dish.
- No change to the Cerveza Toña class (resale-as-recipe): that wants #518's mapping create path, and promoting it to `COMPOUND` would encode the wrong business fact.
- No auto-retype of products. Never rewrite a type the operator chose.

## Verification gates

1. `cd apps/admin_backend && npx jest src/modules/inventory src/modules/onboarding`
2. `npm test` — expect **≥2882 passing**; existing recipe specs mock the product repository, so any mock that now needs a `product_type` must be updated **explicitly with a stated type**, never by making the guard tolerate `undefined`. Silent-defaulting fixtures is exactly how #600 broke five suites.
3. `npm run build`
4. `npx eslint` on touched files only. **Never `npm run lint`** (rewrites ~106 unrelated files).
5. No schema change → `verify-schema-build.sh` not required.

## Status log

- [x] Worktree off `origin/main @ 4214731e`.
- [x] Zero `product_type` references in `recipe.service.ts` confirmed by direct grep.
- [x] `assertProductExistsForTenant` confirmed to validate existence only.
- [x] Guard on Path A + Path C, with tests (TDD: RED observed 9 failed / 4 passed on `recipe-product-type-guard.spec.ts`; GREEN 13/13 after implementation).
- [x] `recipe-draft-lifecycle.spec.ts` fixture extended with a manager-scoped `Product` repo (explicit `product_type: COMPOUND`); `recipe.service.spec.ts` needed no mock changes (its `createNewVersion` case never mocked a product row → missing-row pass-through preserved).
- [x] Full validation: inventory 41 suites / 368 tests; onboarding 44 / 536; full `npm test` 3084 passed / 8 skipped (298 suites); `npm run build` clean; `npx eslint` on the four touched files: 0 errors, 8 pre-existing warnings.
- [ ] Update #610 to record that it is now a prerequisite for the publish route on pre-#609 tenants.

### Drift note (recorded, not resolved here)

The allowed set lives in `recipe.service.ts` as `RECIPE_ALLOWED_PRODUCT_TYPES`, derived from the same `ProductType` enum the outcome service branches on. A true shared predicate would require editing `product.entity.ts` (or a new helper) **and** `sale-inventory-outcome.service.ts` — both outside this task's allowed edit surfaces, so the outcome service still carries its inline `PREPARED || COMPOUND` comparison. Named drift risk: if the outcome branch ever widens, that constant must move with it; a follow-up should extract the predicate next to the entity.

### Baseline discrepancy (reported, not worked around)

The task brief states a full-suite baseline of 2882 passed / 8 skipped, 280 suites on this base. Observed on this exact tree (`4214731e` + only this task's changes): 3084 passed / 8 skipped, 298 suites. Subtracting this task's +13 tests / +1 suite, the pre-change tree measures 3071 passed / 297 suites — i.e. the stated baseline appears stale for this commit, or was measured with a different command/root. No failures were masked: every suite passes.
