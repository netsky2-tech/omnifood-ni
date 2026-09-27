# #615 — Change product type from the catalog edit form

## Why

#612's guard tells the operator "corrija el tipo del producto en Catálogo → tipo de producto".
That control does not exist: `product_type` is sent only by the **create** branch
(`product-page.tsx:289`); the **edit** branch (`:269-280`) sends `name, uom, category_code,
sellPrice, is_perishable` and never the type. `UpdateProductInput` already declares
`product_type?: ProductType` (`product-types.ts:42`) and the backend accepts it
(`update-product.dto.ts:31-32`), so no endpoint or DTO change is needed.

Concrete consequence: the 9 genuine dishes in tenant **SOHO** (`e05bf002-b1d3-45f2-a46a-3592e1cc1431`),
typed `SIMPLE` with live recipes and 17 sold invoice lines (#611), cannot be repaired by the
operator. Today the repair requires a hand-written SQL `UPDATE` against a tenant with live fiscal
documents — exactly the engineer-mediated data change the plan has been removing elsewhere.

## Deliberate deviation from the issue text

Issue ask #2 said add `PREPARED` to the dashboard union. **Not doing it.** Rationale:

- #523 chose `COMPOUND` as the canonical operator-facing label ("Compuesto (con receta)").
- `PREPARED` and `COMPOUND` are behaviourally identical for consumption
  (`sale-inventory-outcome.service.ts:366` admits both).
- Showing two indistinguishable options to a food-park operator is a worse UI than showing one,
  and the guard already accepts the `PREPARED` value for any data that carries it.

So the union stays `SIMPLE | COMPOUND | VARIANT_PARENT`. If a product already holds `PREPARED`
in the database it must still render and save without silently changing its type (tested).

## Contract

1. Edit form sends `product_type` through the existing `updateMutation`.
2. Type selector is available in edit mode; create-time behaviour (type comes from the active tab) unchanged.
3. Changing a product **away from** `COMPOUND`/`PREPARED` **to** `SIMPLE` requires explicit
   confirmation: it orphans its recipe from consumption. Message names the consequence, not
   "¿Seguro?". Neutral Spanish (usted).
4. A product whose stored type is `PREPARED` (not in the picker) loads, displays, and saves
   without mutating its type.
5. No backend change. No migration. No new endpoint.

## Verification (dashboard has ZERO CI — local is the only net)

`cd apps/owner_dashboard && npm ci && npx tsc -b --noEmit && npx oxlint src && npx vitest run && npm run build`

Baseline on `975bab17`: tsc clean; vitest 75 files / 1037 passed / 4 skipped / 0 failures.

## Status log

- doc created; writer delegated.
- implemented by delegated writer: edit branch sends `product_type` via new edit-mode selector (PRODUCT_TYPES labels); COMPOUND/PREPARED → SIMPLE guarded with inline confirm naming the recipe/stock consequence; `StoredProductType` union widened for legacy `PREPARED` round-trip; new test file 4/4 green; verification: tsc clean, vitest 76 files / 1041 passed / 4 skipped, build ok, only allowed surfaces touched.
- review round: guard widened to the recipe-bearing set (RECIPE_BEARING_TYPES = COMPOUND | PREPARED, mirroring sale-inventory-outcome.service.ts): leaving the set to ANY destination requires confirmation; copy now uses storedTypeLabel for origin and destination. Test #1 re-anchored to SIMPLE -> COMPOUND (the #611 repair path, non-destructive, full update-input assertion); COMPOUND -> VARIANT_PARENT confirmation covered by a new test; 5/5 green.
- defect round (independent verification): fixed the confirmation bypass — while awaitingTypeChangeConfirm is true the primary Guardar button is disabled and handleSubmit refuses the submit, so a destructive retyping can only be applied via "Confirmar y guardar"; new double-click test (RED observed before fix, then green). PREPARED test renamed to state its component-level round-trip scope with a production-unreachability note; 6/6 green; vitest 76 files / 1043 passed / 4 skipped; tsc clean; build ok.
