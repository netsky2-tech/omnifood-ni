# #618 — Product creation asks in business language instead of inheriting the tab

## Decision being implemented (founder, 2026-09-26)

At creation, ask one question: **"¿Este ítem se prepara con ingredientes?"**

- `Sí, se prepara con ingredientes` → `product_type = COMPOUND`
- `No, se compra y se revende tal cual` → `product_type = SIMPLE`
- **No preselected value.** Saving is blocked until the operator answers.

Chosen over: bare required selector with no business phrasing; inverted default to `COMPOUND`; deferring.

## Why

`product-page.tsx:552` is `useState<TabId>("SIMPLE")`, and the create branch sends `product_type: productType` taken from that tab. Nothing ever asked whether the item is made from ingredients. Measured on the real database:

```
SELECT product_type, count(*) FROM products GROUP BY 1;   →  SIMPLE | 33
SELECT count(*) FROM recipe_versions WHERE publication_state='PUBLISHED' AND is_active;   →  10
```

Every product in every tenant is `SIMPLE`, so all 10 live published recipes cannot consume. #612 stopped new recipes from being attached to the wrong type and #617 made existing products reclassifiable; this stops the generator.

## Two consequences of this decision that the issue text does not mention

Both are created by removing the tab as the source of the type. Implementing the literal ask without them would be a regression.

### C1 — `VARIANT_PARENT` would become uncreatable

`TABS = PRODUCT_TYPES` (`product-page.tsx:36`) is today the **only** way to create a variant parent: the create dialog has no type control, so a `VARIANT_PARENT` product can only be born while that tab is active. Silently dropping the third answer removes a working capability, and it is the capability behind the resale/size families this vertical sells (8oz/12oz).

Resolution: the question has a **third** answer, in business language, that maps to `VARIANT_PARENT`. Proposed copy (Spanish, usted, matching existing labels):

- `Sí, se prepara con ingredientes` → `COMPOUND`
- `No, se compra y se revende tal cual` → `SIMPLE`
- `Es un grupo de versiones del mismo ítem (por ejemplo por tamaño)` → `VARIANT_PARENT`

Three answers, no default, and every type the backend enum accepts except `PREPARED` stays reachable — `PREPARED` remains a legacy stored value only (see #615/#617: not offered as a destination, round-trips without coercion).

### C2 — an item created from the Simple tab would vanish from the list it was created in

The table is filtered by `activeTab` through `ProductTable` (`:610`, `:619`) and the backend filters `product_type` by exact equality per tab (`product.controller.ts:48-54` → `product.service.ts:101-103`). So answering "se prepara con ingredientes" while standing on the **Simple** tab creates a `COMPOUND` product that the current list will not show: the operator creates a dish, the dialog closes, and the dish is nowhere on screen. That is the "I did the thing and nothing happened" failure the plan keeps hitting.

Resolution: after a successful create, **switch `activeTab` to the type that was just created** so the new product is visible. This is display state only — no extra request, no cache invalidation trick.

## Contract

1. Create mode renders the question above the fold, three answers, none preselected; `Crear` disabled until answered.
2. The submitted `product_type` comes from the answer, never from `activeTab`.
3. `activeTab` keeps its filtering role for the list. It no longer determines the type of a new product.
4. After a successful create, the tab switches to the created product's type.
5. Edit mode is **unchanged** — that is #617: selector, destructive-transition confirmation, `PREPARED` round-trip.
6. Copy in neutral Spanish, *usted*, no voseo, matching existing labels ("Compuesto (con receta)", "Simple", "Padre de Variantes"). No schema vocabulary (`product_type`, enum names) in operator-facing text.
7. No backend change. `CreateProductInput.product_type` stays required and the backend already validates the enum.

## Out of scope

- Repairing the existing 33 products (#610 Part A, and per-dish operator decisions in #611).
- Any `PREPARED` tab or listing change (latent: zero rows today).
- POS app.
- Whether a `SIMPLE` answer should later offer insumo mapping inline: that is #518.

## Verification (this app has no CI job — local only, in this worktree only)

`cd apps/owner_dashboard && npx tsc -b --noEmit && npx oxlint src && npx vitest run && npm run build`

Baseline on `7af1521e`: tsc clean; vitest **76 files / 1044 passed / 4 skipped / 0 failures**.

Never validate in the primary checkout at `/home/octavio_morales/omnifood-ni`: it currently holds another session's `fix/dashboard-v2-review-round-2` branch with ~20 uncommitted files, and its failures are not main's failures.

## Status log

- doc created; decisions recorded from the founder; writer not yet delegated.
- #618 supersedes #615's clause "create keeps taking the type from the active tab"; the case that pinned the old clause (`create mode still takes the type from the active tab and shows no selector` in `product-type-edit.test.tsx`) was removed in this change rather than left asserting a dead behavior — its coverage moves to `product-type-create.test.tsx`.
