# #523 T3 — Suggestion review in the dashboard

## Goal

Give the operator the missing half of #523: industry-template recipes arrive as
**suggestions**, and the backend to inspect and publish them already exists
(PR #609), but the dashboard has no surface for it. T3 is that surface:
list pending suggestions → inspect the bill of materials → publish the ones the
operator trusts.

The contract is *review-before-trust*. #523 shipped with the explicit non-goal
of never auto-publishing a template recipe. This unit must not reintroduce that
shortcut through a bulk action.

## Facts established by exploration (verified, not assumed)

- Zero references to `suggestion` exist anywhere in `apps/owner_dashboard/src`. Greenfield.
- Backend endpoints, `apps/admin_backend/src/modules/inventory/recipe.controller.ts`:
  - `GET recipes/suggestions` → bare `RecipeSuggestionListItemDto[]`, `[]` when empty
    (`recipeVersionId`, `productId`, `productName`, `versionNumber`, `componentCount`,
    `hasActivePublishedVersion`). Filtered to `INDUSTRY_TEMPLATE` + `DRAFT`.
  - `GET recipes/:recipeVersionId/snapshot` → `{ recipeVersion, components[] }`
  - `POST recipes/:recipeVersionId/publish` → snapshot on success
- Publish is guarded since #612 (`assertProductTypeSupportsRecipe`,
  `recipe.service.ts:516-544`): a `SIMPLE` product returns **400** with an
  operator-facing Spanish `message` and **no `reasonCode`**. `getApiErrorMessage`
  passes `responseBody.message` through unchanged.
- Dashboard API layer: `api.get/api.post` from `src/lib/api.ts` (Bearer + 401 refresh),
  `getApiErrorMessage` from `src/lib/api-error.ts`, query keys `["<feature>", tenantId, ...]`
  via `useTenantId()` (`src/lib/tenant.ts`). Structural precedent: `features/catalog/`
  (`catalog-api.ts` + `use-catalog.ts` + tabbed `catalog-page.tsx`).
- `features/recipes/` already has `types.ts`, `recipes-api.ts`, `use-recipes.ts`,
  `recipes-page.tsx`, `RecipeForm.tsx`, `index.ts`. Missing: suggestion type, api fns,
  hooks, any review UI.
- Tests: vitest + jsdom, `src/__tests__/`, `vi.stubGlobal("fetch", ...)` or `vi.mock`
  of hook modules (no MSW), `TestWrapper` with a `QueryClient` (`retry: false`).
  Wave prefix is not sequential; `w11-*` is free.
- UI copy: inline neutral Spanish (`usted`), no i18n catalog. `src/lib/labels.ts`
  only maps backend enum codes to Spanish.
- `/recipes` is already gated `OWNER | MANAGER` in `src/lib/rbac.ts:44`; action
  `recipes.write` exists at `:78`.

## Design decisions

1. **A tab inside `RecipesPage`, not a new route.** Catalog precedent
   (`TABS` array + `useState`). A new route would need router, sidebar and RBAC
   edits for a surface that belongs to the same mental object ("recetas").
   Inherits `/recipes` gating.
2. **Inspect before publish is mandatory, not optional.** Publish is only
   reachable from an opened row that has loaded its snapshot. This is the whole
   point of T3: the operator sees which insumos and quantities the template
   invented before making the recipe live. A list with 10 publish buttons and no
   detail would be worse than no UI.
3. **No bulk publish.** Explicit non-goal; state it in the UI is unnecessary,
   in code it must be impossible.
4. **Guard rejection surfaces inline on the row.** The 400 message already tells
   the operator how to fix it (change the product type in Catálogo). Swallowing
   it into a transient toast loses the remediation. The row must keep showing it
   after the toast disappears.
5. **`hasActivePublishedVersion` changes the verb.** A product that already has a
   published version is a *replacement* (cost basis moves for future sales), not a
   first-time publish. The operator must see that difference before confirming.
6. **`componentCount === 0` is not publishable-proof material.** Render it as such
   and let the operator decide; the backend guard does not reject empty recipes,
   and silently filtering them here would hide template work that was never authored.

## Contract

### Files (allowed edit surfaces)

- `apps/owner_dashboard/src/features/recipes/types.ts` — add `RecipeSuggestionListItem`
- `apps/owner_dashboard/src/features/recipes/recipes-api.ts` — add
  `fetchPendingSuggestions()`, `publishRecipeVersion(id)`
- `apps/owner_dashboard/src/features/recipes/use-recipes.ts` — add
  `usePendingSuggestions()`, `usePublishRecipeVersion()`
- `apps/owner_dashboard/src/features/recipes/suggestion-review.tsx` — new component
- `apps/owner_dashboard/src/features/recipes/recipes-page.tsx` — mount the tab
- `apps/owner_dashboard/src/features/recipes/index.ts` — export the new surface
- `apps/owner_dashboard/src/__tests__/w11-suggestion-review.test.tsx` — new tests
- `odd/tasks/issue-523-t3-suggestion-review.md` — this document

No backend file is in scope. No router, sidebar or RBAC change.

### Behaviour to implement and pin with tests

1. Tab labelled `Sugerencias` renders the pending count as a badge; with zero
   suggestions it renders an empty state saying nothing is pending, not a blank table.
2. List renders one row per suggestion: `productName`, `versionNumber`,
   `componentCount`, and the replacement signal when `hasActivePublishedVersion`.
3. Opening a row fetches the snapshot and renders each component: ingredient name,
   `SUB_RECIPE` vs `INSUMO` distinction, quantity with `component_uom`,
   `technical_shrink_pct`. Loading and error states are explicit.
4. Publish button is disabled until that row's snapshot has loaded successfully.
5. Publish success: invalidates the suggestions list and the affected product's
   active recipe, and the row leaves the pending list.
6. Publish 400 (SIMPLE guard): the exact backend message stays visible **on the row**.
7. Publish 404 and network failure: distinguishable message, no silent success.
8. Every list fetch carries the tenant scope through the query key.
9. No request is fired for a row that is never opened (snapshot is lazy).

### Non-goals

- No editing of suggested components (that is `RecipeForm`, already shipped).
- No discard/reject action: the backend has no discard endpoint. #610 Part A's
  `REJECTED` filter is forward defence for exactly this future work; do not invent
  a client-only discard that the server cannot represent.
- No auto-publish, no bulk publish.
- No POS/Flutter change.

## Verification (local only — `apps/owner_dashboard` has ZERO CI coverage)

From `apps/owner_dashboard`, all four must be green:

1. `npx tsc -b --noEmit`
2. `npx oxlint src`
3. `npx vitest run`
4. `npm run build`

Baseline to compare against, reported before this unit: record totals, do not
assume them from another branch.

## Status log

- Contract written from a verified read-only integration map; no file created yet.
- T3 implemented (2026 session): types/api/hooks + `suggestion-review.tsx` + tab in
  `recipes-page.tsx` + `w11-suggestion-review.test.tsx` (13 tests, one per behaviour
  item plus toast assertions). Note: the page-level badge count query is declared
  locally in `recipes-page.tsx` (`usePendingSuggestionCount`, same cache key
  `['recipes', tenantId, 'suggestions']`) instead of calling `usePendingSuggestions()`
  because the existing `w7-recipes.test.tsx` fully mocks the `use-recipes` module and
  cannot be edited; both observers share one cache entry. Local-only verification:
  `tsc -b --noEmit` OK, `oxlint src` no new findings, `vitest run` 78 files /
  1063 passed / 4 skipped, `npm run build` OK.
- Verification round on `67ef0cd7` (4 fixes): (1) killed the duplicated cache
  key — exported `suggestionsQueryKey(tenantId)` from `recipes-api.ts` (NOT from
  `use-recipes.ts`: w7 fully mocks that module) and wired it into
  `usePendingSuggestions`, the page-level `usePendingSuggestionCount`, and the
  publish invalidation; key array byte-identical
  (`['recipes', tenantId, 'suggestions']`). RED observed first: divergence-guard
  tests failed with `suggestionsQueryKey is not a function` before the builder
  existed; GREEN after wiring (w11 18/18). Guard: page badge + canonical hook
  must resolve one shared cache entry and one fetch.
- (2) deleted the tautological `expect(NOT_FOUND_404_MESSAGE).not.toBe(NETWORK_ERROR_MESSAGE)`
  literal-vs-literal line from the item-7 404 test; the `role="alert"` text
  assertions remain the real check.
- (3) pinned the pending/disabled publish path: new test proves clicking with
  the snapshot unresolved fires no `/publish` request, and a second test proves
  that while one publish is held in flight the button is disabled and no second
  publish request fires for any row.
- (4) extended tenant-isolation coverage into the DOM: after a tenant-A →
  tenant-B switch, the rendered list shows tenant B rows and never tenant A
  product names (previously only cache keys/fetch counts were asserted).
