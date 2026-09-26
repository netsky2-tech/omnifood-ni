# #523 — Template recipe suggestions: make the review step exist

**Branch:** `fix/523-template-recipe-suggestions` off `origin/main @ bbc75ec1`
**Worktree:** `../omnifood-ni-worktrees/issue-523-template-suggestions`
**Plan row:** Batch 1 → **B1b** (`odd/plans/founder-pilot-execution-plan.md`)
**Depends on:** #519 (merged: `d68f74d5`, `0310ed7a`, `aae7504a`, `bbc75ec1`). This ordering is not cosmetic — #523's own issue states that fixing T1–T3 without #519 makes template recipes *visible but still inert*. #519 is now on `main`, so a published suggestion actually reaches a terminal and actually moves stock.

## Why this unit, now

A template application writes 5 products and 3 recipes successfully and **nothing is usable**: the Recipes page shows empty, and the terminal can never consume the dish. The root cause is not missing logic — it is a **review step that was never built**:

- `industry-template.service.ts:390,396` creates versions as `is_active: false` + `publication_state: DRAFT`, with `origin: INDUSTRY_TEMPLATE` and `suggestion_state: SUGGESTED`.
- That is **intended design**: a canned industry template *proposes* quantities; a human confirms them. Auto-publishing would assert the client's gram weights as fact on data nobody validated.
- `recipe.service.ts:185 publishDraftVersion(tenantId, recipeVersionId)` is the confirmation step. It is complete, tenant-bound, deactivates the prior active version, sets `PUBLISHED/CONFIRMED/published_at/fecha_inicio_vigencia`, and is **unit-tested** (`recipe-draft-lifecycle.spec.ts:105,137,150,172,184`).
- **It has zero production callers and no route.** `recipe.controller.ts` exposes exactly three: `GET products/:productId/active` (:77), `GET :recipeVersionId/snapshot` (:120), `POST products/:productId/versions` (:134). No publish, no list.
- So a suggestion cannot be listed, selected, reviewed, or accepted. In the issue's words: **"There is no exit."**

This is the recurring class this project already tracks in its own risk table — *built, tested, never invoked* (#518, #519, #520, #523, #525, #528). The plan's rule applies: **assert the call site, not the function's presence.**

## Verified premises (checked by me in this worktree, not inherited from a report)

| # | Premise | Evidence |
|---|---|---|
| P1 | `TemplateProduct` has no `product_type` column at all | `onboarding/entities/template-product.entity.ts` — 7 `@Column`s, none of them a type |
| P2 | Template-created products therefore get the entity default `SIMPLE` | `inventory/entities/product.entity.ts:44-48`; `industry-template.service.ts:354-365` never sets it |
| P3 | The delta that feeds the POS filters hard on published+active | `sales/services/inbound-sync.service.ts:568-574`: `is_active = true AND publication_state = 'PUBLISHED' AND fecha_inicio_vigencia <= now` |
| P4 | A `SIMPLE` product is structurally incapable of consuming insumos even if a recipe existed | POS planner `AuthorityInventoryKind.simple → noImpact` (`sale_inventory_outcome_planner.dart:110-116`); cloud classifies identically (`sale-inventory-outcome.service.ts:359,366` — `PREPARED \|\| COMPOUND` are the recipe branch) |
| P5 | Hand-authored recipes work, which is why this reads as "intermittently broken" | `recipe.service.ts:131-136` sets `is_active: true` and the entity default for `publication_state` is `PUBLISHED` |
| P6 | New human-facing routes need no transport-registry edit | `test/support/route-transport-registry.ts:483` declares `{ controller: 'RecipeController', transport: 'human' }` with **no** overrides; `recipes/versions` is `device` because it lives on `InventoryMovementController` |

`COMPOUND` vs `PREPARED`: both trigger the recipe branch on the cloud (:366) and both become `isPrepared: true` on the POS (`sync_service.dart:1715`). The only functional difference today is that the dashboard's Recipes page lists `COMPOUND` (`recipes-page.tsx:24`). Choosing between them is a **naming decision, not a behaviour decision** — recorded so nobody re-derives it under pressure.

## Units

| Unit | Surface | In this delivery? |
|---|---|---|
| **T1** | `TemplateProduct.product_type` + template sets a recipe-bearing type when `recipeItems` exist, `SIMPLE` otherwise | **Yes — backend PR.** Fixes Cause 1 *and* Cause 5 with one field |
| **T2** | `POST /recipes/:recipeVersionId/publish` bound to the existing tested `publishDraftVersion` | **Yes — backend PR.** Pure wiring, no new logic |
| **T4** | `GET /recipes/suggestions` (or equivalent) listing `origin = INDUSTRY_TEMPLATE AND publication_state = DRAFT` per tenant | **Yes — backend PR.** Without a list there is no way to obtain a `recipeVersionId`, so T2 is unreachable from a UI |
| **T5** | Apply result says "N recipes created as **pending suggestions**, review them in Recipes → Pending" instead of a bare count | **Yes — backend PR.** The bare count is why this took a human to notice |
| **T7** | Re-apply path reports skipped recipes + the reason + that a draft already exists | **Yes — backend PR.** Same file, honesty only; the guard itself stays (Cause 4 protects client edits) |
| **T3** | Dashboard Pending surface: list → review → confirm/publish | **Second PR** (different app, its own CI job, needs T2+T4 merged first) |
| **T6** | Data repair for tenants where the template was already applied | **NO — separate issue.** Publish-or-discard per recipe is the *client's* accounting decision, not ours to script; it also needs the pilot tenant's real quantities |

## Non-goals (binding, from the issue)

- **No auto-publishing template recipes.** Review-before-trust is the rule; only the review UI is missing.
- No change to recipe explosion, versioning semantics, or BOM math — those are correct.
- No removal of the "existing tenant recipe is authoritative" guard (Cause 4). It needs better *reporting* (T7), not deletion.
- No new product-type enum value; `PREPARED`/`COMPOUND` already cover it.

## Decisions made here (and why)

- **Split backend and dashboard into two PRs.** Different apps, different CI jobs, and T3 is unreachable until T2/T4 exist. Keeps each review surface honest and under the 400-line budget.
- **T6 out, filed not absorbed.** Repairing another tenant's menu by choosing publish/discard for them is exactly the invented-default pattern D-16 burned us with.
- **The publish route is additive on the existing service.** If a writer proposes a second publish implementation, that is a scope violation: the tested method at `:185` is the deliverable, the route is its caller.
- **Acceptance is measured from the terminal, not the dashboard.** A published suggestion must arrive via the #519 hydration path and produce a kardex row. Dashboard-only green proves nothing (that is how #519 survived).

## Verification gates

1. `cd apps/admin_backend && npx jest src/modules/onboarding src/modules/inventory src/core/http` — includes the route-transport guardrail and `recipe-draft-lifecycle`.
2. `npm test` (full backend) + `npm run build`.
3. `bash scripts/verify-schema-build.sh` if any migration/entity changes (T1 adds an entity column → **migration required**, so this gate is live).
4. `cd apps/pos_app && flutter test --concurrency=1` only if POS files are touched (they should not be in this unit).
5. Existing spec fixtures that construct `TemplateProduct` must be updated explicitly, never silently defaulted — a new NOT NULL-ish column with a soft default is how #600 broke five suites on main.

## Status log

- [x] Worktree created off `origin/main @ bbc75ec1` (#519 present: `authority_delta_adapter.dart` exists, `sync_service.dart` reads `rawDeltas['recipeVersions']`).
- [x] Premises P1–P6 verified by direct reads in this worktree.
- [x] T1 backend (entity column + migration 1809500000000 with guarded COMPOUND backfill + `resolveTemplateProductType`; recipe+SIMPLE contradiction surfaces as BadRequestException; undefined type resolves from row shape so pre-backfill rows never crash — verified against the schema-build scratch DB: 8 seeded recipe rows → COMPOUND, 4 retail rows → SIMPLE).
- [x] T2 backend (`POST :recipeVersionId/publish` — pure wiring on the tested `publishDraftVersion`, sibling guard idiom, returns the snapshot shape; P6 proven: route-transport guardrail passes with the new route).
- [x] T4 backend (`GET /recipes/suggestions` + `listPendingTemplateSuggestions` — tenant-bound reads, component counts, active-published existence; single-segment path cannot collide with `:recipeVersionId/snapshot` or `products/:productId/active`).
- [x] T5 + T7 backend (aprobada la superficie de `test/onboarding/industry-template.e2e-spec.ts`): `ApplyTemplateResult` gana `recipesPendingReviewMessage` (español neutro, solo señal de UI) y `recipesSkipped[]` (producto + `VERSION_ALREADY_EXISTS` + estado real); el guard de re-apply no cambió de comportamiento, dejó de ser silencioso; el replay idempotente normaliza summaries legados para que el payload cierre también en ese camino. Los dos `toEqual` del e2e (líneas ~622/666) se extendieron ADITIVAMENTE y siguen cerrados.
- [x] Corrección de diseño T1 (dentro de superficies): la columna quedó NULLABLE sin DB default — "ausente" se distingue de "SIMPLE explícito"; el e2e DB `onboarding-template-cutover` (synchronize + seed sin product_type) crasheaba 400 con el default NOT NULL 'SIMPLE'; con nullable resuelve por forma y pasa. Verificado contra el scratch DB del schema-build: 8 filas con receta → COMPOUND, 4 → SIMPLE, columna nullable.
- [ ] T3 (dashboard), after backend lands.
- [x] Native review of the backend candidate: **offered and explicitly declined by the human** for this candidate. Consent/v3 reported `risk_level: medium`, 14 files / 1102 lines, risk evidence = non-passive-documentation + an executable change in the new migration spec. Submitted through the provider's own `--consent declined` invocation; result `consent: declined_this_candidate` with an **empty `lineage_id`** — no lineage, no review record, reviews stay enabled. Consequence recorded honestly: the native lens did **not** close this candidate, so the safety net here is the parent verification table below plus the independent gates, not a reviewer receipt. Any `gentle_review` ASSESS for this candidate must pass `nativeReviewOutcome: "declined"`, which drops the receipt-driven on-path and re-enables a separate verifier rather than trusting writer self-verification.
- [x] Facade defect re-confirmed and widened (third occurrence): `gentle_review` `operation: start` returned `candidate-view-invalid` even with `baseRef` given as the **full 40-char commit id** `bbc75ec13ae356a5b5d4ffe6b6b9be409b30e481` + `committedOnly: true` in the documented input shape, while the provider-issued native `gentle-ai review start` with byte-identical bindings reached the consent envelope immediately. So the defect is not limited to tree-id base refs, as previously recorded — the ordinary committed-range START route is broken in this installation and the native command is the only working path. Never reconstruct or re-compose the bindings; copy the `next_transition.execute.command` verbatim.

## Parent verification (re-run by the orchestrator, not inherited from the handoff)

| Gate | Result |
|---|---|
| `npm test` | **280 suites passed** (3 skipped), **2882 passed / 8 skipped**, 0 failures |
| `npx nest build` | clean |
| `scripts/verify-schema-build.sh` | **PASS scenario 1** (empty DB) **and scenario 2** (partial-ledger re-run): 0 drifts, 0 coverage failures, 977 entity columns compared — so the new column matches its entity declaration |
| Backfill, queried directly on the built scratch DB | `COMPOUND \| 8`, `SIMPLE \| 4`; rows having recipe items = **8** (exactly the COMPOUND set); `is_nullable = YES`, `column_default = NULL` |
| `npx eslint` on the 13 touched files | 2 prettier errors at `industry-template.service.spec.ts:329,353` — **proven pre-existing**, see below. `npm run lint` deliberately not run (it rewrites ~106 unrelated files) |

The eslint claim was checked instead of accepted: this diff's hunks in that file land at new lines 16, 27, 99, 629 and 667+, while the two errors sit at 329/353 — outside every hunk — and `origin/main` already carries the identical formatting at ~line 328. Baseline drift, not introduced here.

### Premises I re-tested rather than trusted

- **"Does `resolveTemplateProductType` actually see `recipeItems`?"** This is the one dependency that could ship the bug unfixed with green tests: if the apply path loaded `TemplateProduct` without the relation, every row would take the no-recipe branch and return `SIMPLE`. It is loaded — the shared template loader asks for `relations: ['templateInsumos', 'templateProducts', 'templateProducts.recipeItems']` (`industry-template.service.ts:102-110`), and the pre-existing recipe loop at `:396` already depended on it.
- **"Is `draft.product_name` a column, or `undefined ?? ''` silently blanking the pending list?"** Real column: `@Column({ type: 'varchar', nullable: true })` (`entities/recipe-version.entity.ts:91-92`, "snapshot of the product name at publish time"), and the template's version create already writes `product_name: product.name` (`industry-template.service.ts:422`). So suggestions render real names. Both of these would have gone wrong in the optimistic direction if I had grepped once and assumed.
- **Guard surface of the new routes**: `@Get('suggestions')` is declared *before* `@Get(':recipeVersionId/snapshot')` so the literal cannot be shadowed by the param route, and it inherits the controller's class-level `@UseGuards(AuthGuard, RolesGuard)` + `@Roles(OWNER, MANAGER)` exactly like its sibling read; `@Post(':recipeVersionId/publish')` copies the sibling POST's guard triple verbatim and calls only the tested `publishDraftVersion` — no state transition re-derived in the controller.
- **Tenant scoping**: all three reads in `loadPendingSuggestions` carry `tenant_id` *and* ride `runInTenantTransaction`.
- **No auto-publish**: apply still writes `is_active: false` + `DRAFT` + `SUGGESTED` (read at `:414-427`). The binding non-goal holds.

### Why the T1 column is nullable and not `NOT NULL DEFAULT 'SIMPLE'`

The task text specified `NOT NULL DEFAULT 'SIMPLE'`; the shipped column is nullable with no default, and that is the better decision. A DB default makes "not declared" indistinguishable from "declared SIMPLE", which (a) broke `onboarding-template-cutover.db.e2e-spec.ts` (400 on apply, because that harness builds schema with `synchronize: true` and seeds rows without a type) and (b) would have turned every pre-backfill row into a false data contradiction. Nullable preserves the distinction: `NULL` resolves from row shape, and `BadRequestException` fires only on the genuine contradiction (recipe items + explicit `SIMPLE`). **Do not "fix" this back to NOT NULL DEFAULT.**

### What the contract extension cost (declared, not hidden)

`ApplyTemplateResult` gained two **required** fields, so the e2e's two closed `toEqual` payload assertions had to learn them. The extension is additive — no key removed, no value changed — and `toEqual` was **not** relaxed to `objectContaining`/`toMatchObject`, so the guardrail still pins the entire payload. The re-apply block now also asserts the real state of the pre-existing version (`existingState: 'DRAFT'`), which makes T7 observable end-to-end rather than only in a unit spec. Idempotent replay normalizes pre-#523 stored summaries (`recipesCreated ?? 0`, `recipesSkipped ?? []`) so the closed contract cannot be violated by an old row.

## Files (anchors for the writer)

- `apps/admin_backend/src/modules/onboarding/entities/template-product.entity.ts`
- `apps/admin_backend/src/modules/onboarding/services/industry-template.service.ts` (:354-365 products, :384-399 version, :374-382 skip guard, :410-425 details)
- `apps/admin_backend/src/modules/inventory/recipe.controller.ts` (:77, :120, :134)
- `apps/admin_backend/src/modules/inventory/recipe.service.ts` (:166-183 `findActiveVersion`, :185-240 `publishDraftVersion`)
- Specs: `src/modules/inventory/recipe-draft-lifecycle.spec.ts`, `src/modules/inventory/recipe.service.spec.ts`, `src/modules/onboarding/services/industry-template.service.spec.ts`, `src/modules/onboarding/entities/template-entities.spec.ts`, `src/core/http/route-transport-registry.spec.ts`
- Migration dir: `apps/admin_backend/src/migrations/` (latest is `1809470000000-AddTipsToInvoices.ts` on other branches; on this base check the actual tip before naming a new one)
