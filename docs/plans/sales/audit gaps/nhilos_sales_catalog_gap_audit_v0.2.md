# NHILOS POS — Sales, Variants & Modifiers Gap Audit

**Version:** 1.0  
**Status:** APPROVED / AUTHORITATIVE GAP BASELINE FOR SALES CATALOG REMEDIATION  
**Code evidence:** Repository inspected 2026-09-09. All VERIFY-CODE items resolved. No pending code audit required.  
**Primary scope:** Catalog → product/variant configuration → FOH order entry → pricing → recipes/inventory → KDS/printing → promotions/loyalty → void/reversal → reporting → offline sync.  
**Primary concern:** Variants and "Extras" are present conceptually/UI-wise, but the documented contracts do not yet prove a coherent end-to-end model for restaurant customization and inventory accuracy.

---

## 1. Objective

Audit the current NHILOS POS sales/catalog model against:

1. existing NHILOS/legacy OmniCore/FlexiPoint product documentation;
2. the implementation evidence recorded in the master execution roadmaps;
3. current market patterns from Square, Toast, Clover and Lightspeed;
4. practical restaurant/café requirements, especially sizes, substitutions, extras, removals and recipe-level inventory effects.

The output classifies each capability as:

- **EXISTS** — sufficiently defined in the current documentation/evidence;
- **EXTEND** — the concept exists but the contract is incomplete;
- **ADD** — missing capability or missing authoritative contract;
- **RENAME / REMOVE-FROM-UX** — current UX/domain label causes incorrect modeling.

All items have been verified against repository code. This document is the authoritative gap baseline; no further code audit is required before starting remediation.

---

## 2. Executive diagnosis

### 2.1 Main conclusion

NHILOS has the right ingredients on paper, but **Variants, Modifiers and Recipes are not yet modeled as one coherent sales configuration system**.

The most important finding is this:

> A restaurant variant must not be merely a label or price option. It must be a first-class sellable configuration capable of owning its own price, SKU/identity, tax profile where applicable, availability policy and — critically for COMPOUND products — its own recipe/BOM binding.

The master PRD already points in that direction by stating that a `PRODUCT_VARIANT` may discount simple inventory or recipe ingredients. The dedicated sales PRD, however, only snapshots modifier name + additional price and does not define variant-specific recipe identity, modifier inventory effects, modifier quantity, substitution/removal semantics or immutable recipe/configuration snapshots.

Therefore the Cappuccino 8 oz / 12 oz issue is **not evidence that sizes should never be variants**. It is evidence that the current variant implementation/contract is too weak. Market systems commonly treat small/medium/large as variants or size choices; NHILOS needs to go one step further and bind each food-service variant to the correct BOM.

### 2.2 Second major conclusion

The "Extras" tab is too narrow as a domain concept.

**Recommendation:** rename the domain/backoffice capability to **Modifiers**. "Extras" becomes only one modifier-group use case.

A modifier system must cover at least:

- required choices — e.g. milk type, meat doneness;
- optional add-ons — e.g. extra espresso shot, extra cheese;
- substitutions — e.g. whole milk → almond milk;
- removals — e.g. no onion, no sugar;
- preparation instructions — e.g. extra hot, sauce on the side;
- quantity-aware extras — e.g. 2 extra shots;
- reusable modifier groups shared across many products.

### 2.3 Go-live severity

For a café/restaurant pilot, variant-specific recipes and inventory-aware modifiers are **P0 / release-blocking for catalog correctness** if the business uses them operationally. A POS can collect the correct total and still silently corrupt food cost, theoretical stock and margin if customization does not flow into inventory.

---

## 3. Documentation evidence already present

### 3.1 Strong foundations

Current project documents already define:

- `SIMPLE`, `COMPOUND`, `VARIANT_PARENT` product concepts;
- `PRODUCT_VARIANT` as the sellable child of a variant parent;
- BOM/recipe-driven inventory consumption for compound products;
- modifier groups that may be required/optional/mutually exclusive;
- modifier minimum/maximum selection rules;
- modifiers that can change price and affect inventory/sub-recipes;
- KDS and kitchen-ticket routing;
- immutable Kardex and recipe versioning expectations;
- offline-first master-data sync;
- promotions, loyalty, split bills, audit trail and void-related controls.

### 3.2 Documentation contradictions / underspecification

The documents are not fully aligned:

1. The master PRD states a variant may discount recipe ingredients, but the dedicated sales relational model does not model product variants at all.
2. The sales PRD describes inventory-aware modifiers, but `ticket_detalle_modificadores` only persists `nombre_modificador` and `precio_adicional_nio`.
3. No authoritative model defines how a modifier removes or replaces a component already present in the base recipe.
4. No authoritative contract defines how modifier behavior changes by variant size.
5. The owner-dashboard roadmap explicitly plans product variants in W5 and recipes in W7, but no explicit modifier-management milestone exists.
6. The master execution roadmap contains no dedicated completed batch proving a full variant/modifier engine end to end.

This means the capability is **partially specified, not closure-proven**.

---

## 4. Market benchmark

### 4.1 Square

Square makes a clear distinction:

- **Variations** are fixed forms of the same item, such as small/medium/large, and can have their own cost, price and SKU.
- **Modifiers** customize an item during checkout, such as adding cheese/toppings.
- Modifier sets can define required selections, min/max constraints, multiple quantities, default selections and ordering.
- Square also supports nested modifier sets in supported food-and-beverage modes.

**Relevant pattern for NHILOS:** fixed commercial identity = variant; runtime customization = modifier.

### 4.2 Toast

Toast models:

- size-based item pricing;
- modifier groups and reusable modifiers;
- required/optional groups with minimum/maximum selections;
- group/item inheritance of modifier groups;
- modifier pricing that may depend on the size of the parent item;
- underlying item references for modifiers, allowing a modifier to reuse a real menu item;
- FOH ordering priority that surfaces size/required choices before optional choices.

**Relevant pattern for NHILOS:** variant/size is selected first, then modifier behavior can depend on that selected size.

### 4.3 Clover

Clover explicitly supports modifier groups, modifiers and variants for restaurant order customization, including multiple quantities of a modifier.

**Relevant pattern for NHILOS:** modifier quantity is not an edge case; it is a first-class order-line property.

### 4.4 Lightspeed Restaurant

Lightspeed separates:

- **sub-items** for add-ons/toppings that are attached to a main item;
- **production instructions** for preparation information that may carry no extra price/statistics;
- KDS display of production instructions below the item;
- single-choice and multiple-choice preparation categories.

**Relevant pattern for NHILOS:** not every "modifier" should affect price or inventory. Kitchen instructions are a distinct effect type even if the UI presents them in the same customization flow.

---

## 5. Target domain taxonomy

NHILOS should use the following semantic split.

### 5.1 Product

The commercial/menu concept shown in the catalog.

Examples:

- Cappuccino
- Latte
- Hamburger
- Oxford Shirt

A product may be directly sellable or may only group variants.

### 5.2 Variant / Sellable configuration

A fixed form of a product chosen before runtime customization.

Examples:

- Cappuccino 8 oz
- Cappuccino 12 oz
- Oxford Shirt / M / Blue

A variant must be able to own:

- its own price;
- SKU/barcode if applicable;
- active/86 state;
- tax behavior override if legally needed;
- own-stock policy for retail;
- recipe/BOM binding for food-service;
- KDS/production metadata override;
- channel/location availability override when multi-location support is active.

**Invariant:** `VARIANT_PARENT` is not a sellable line. The selected variant is.

### 5.3 Modifier group

A reusable rule set presented after the sellable configuration is known.

Examples:

- Milk type
- Extras
- Doneness
- Sauces
- Remove ingredients

Contract fields should include at least:

- `required`;
- `minSelections`;
- `maxSelections`;
- `allowMultipleQuantity`;
- `selectionMode` (`SINGLE`, `MULTIPLE`);
- `displayOrder`;
- `autoPrompt`;
- `active`;
- default selections;
- optional product/variant-level overrides.

### 5.4 Modifier option

A specific runtime selection.

Examples:

- Almond milk
- Extra shot
- No onion
- Medium rare
- Sauce on side

Each option needs independent effect policies:

- `priceEffect`;
- `inventoryEffect`;
- `kitchenEffect`;
- `taxEffect` or inherited tax policy;
- availability/86 behavior.

### 5.5 Kitchen instruction / note

A customization with no intrinsic inventory or financial mutation unless explicitly configured.

Examples:

- Extra hot
- Sauce on side
- Cut in half

This can be implemented as a modifier option with `inventoryEffect = NONE` and `priceDelta = 0`, but it should be semantically distinguishable for reporting and KDS behavior.

---

## 6. The Cappuccino 8 oz / 12 oz decision

### Current problem

If both sizes are merely variant labels but only the parent `Cappuccino` owns a recipe, inventory cannot know whether to deduct the 8 oz or 12 oz consumption.

### Recommended target

```text
Product: Cappuccino
  ├─ Variant: 8 oz
  │    ├─ Price: C$ X
  │    └─ RecipeVersion: CAP-8OZ-v3
  │         ├─ Espresso 18 g
  │         ├─ Milk 150 ml
  │         └─ Cup 8 oz 1 und
  │
  └─ Variant: 12 oz
       ├─ Price: C$ Y
       └─ RecipeVersion: CAP-12OZ-v2
            ├─ Espresso 18/36 g according to real recipe
            ├─ Milk 240 ml
            └─ Cup 12 oz 1 und
```

The parent is the reporting/menu grouping entity; the selected variant is the sellable recipe-bearing entity.

### Optional recipe inheritance

To reduce setup friction, variants may support:

- `COPY_FROM_BASE` — duplicate base recipe once, then edit independently;
- `SCALE_FROM_BASE` — only when the business explicitly confirms proportional scaling;
- `OWN_RECIPE` — authoritative independent BOM.

For food service, **`OWN_RECIPE` should be the safe default once a variant diverges**. Blind proportional scaling is dangerous because real recipes frequently change shot counts, cup/lid usage or ingredient ratios at size boundaries.

---

## 7. Inventory-aware modifier model

A generic "extra price + name" record is insufficient. NHILOS needs deterministic inventory semantics.

### 7.1 Recommended inventory effect types

```text
NONE
ADD_COMPONENTS
SUPPRESS_RECIPE_SLOT
REPLACE_RECIPE_SLOT
ADD_SUBRECIPE
```

Examples:

| Modifier | Effect | Inventory result |
|---|---|---|
| Extra shot | `ADD_SUBRECIPE` | Add 1 espresso-shot BOM; quantity can be 1,2,... |
| Almond milk | `REPLACE_RECIPE_SLOT(MILK)` | Do not consume default milk; consume almond milk using slot quantity or override |
| No sugar | `SUPPRESS_RECIPE_SLOT(SWEETENER)` | Skip sugar consumption |
| Medium rare | `NONE` | Kitchen instruction only |
| Extra cheese | `ADD_COMPONENTS` | Consume configured cheese quantity |

### 7.2 Why recipe slots matter

A substitution must work across variants without hardcoding quantities twice.

Example:

```text
Cappuccino 8 oz recipe:  MILK slot = 150 ml whole milk
Cappuccino 12 oz recipe: MILK slot = 240 ml whole milk
Modifier: Almond milk = replace MILK slot component, inherit slot quantity
```

That produces the correct 150 ml or 240 ml consumption automatically after the size is known.

### 7.3 Alternative for V1

If recipe slots are too large a refactor for the first delivery, V1 may support explicit per-variant modifier inventory overrides:

```text
Almond milk modifier
  8 oz -> -150 ml whole +150 ml almond
 12 oz -> -240 ml whole +240 ml almond
```

This is more repetitive and harder to maintain, but still deterministic. It should be treated as a transitional design, not the long-term domain.

---

## 8. Gap matrix — Product / Variant domain

| ID | Capability | Status | Severity | Code evidence |
|---|---|---|---|---|
| PV-01 | `VARIANT_PARENT` + sellable variants | **EXTEND** | P0 | `ProductVariantEntity` exists in Floor (`product_entity.dart:53`) with `id`, `product_id`, `name`, `price_adjustment`. Domain model `ProductVariant` (`product.dart:52`) has `id`, `name`, `priceAdjustment`. `Product` holds `List<ProductVariant> variants`. **Missing:** no `is_active`, no `sku`, no `barcode`, no recipe binding, no stock policy. `ProductEntity` in Floor (`product_entity.dart:3`) has no `product_type` column — `VARIANT_PARENT` is a conceptual enum in owner-dashboard (`product-types.ts:1`) but the POS Floor schema doesn't enforce it. Backend `Product` entity (`product.entity.ts:13`) also lacks `product_type`. |
| PV-02 | Variant-specific price | **EXTEND** | P0 | `ProductVariantEntity.priceAdjustment` (`product_entity.dart:69`) is an additive delta to parent `sellPrice`. `SaleViewModel.addToCart` (`sale_view_model.dart:688-696`) computes `unitPrice = product.sellPrice + variant.priceAdjustment`. This means variant price = parent + delta, NOT an independent price. **Missing:** no absolute price override, no price snapshot on ticket, no per-variant tax override. |
| PV-03 | Variant-specific SKU/barcode | **ADD** | P1 | `ProductVariantEntity` has no `sku` or `barcode` fields. `ProductEntity` has both (`product_entity.dart:16-17`). No scanning path exists for variants. |
| PV-04 | Variant-specific stock | **ADD** | P0 retail | `ProductVariantEntity` has no stock-related fields. Stock lives on `ProductEntity.stock` (`product_entity.dart:9`). No per-variant stock policy. |
| PV-05 | Variant-specific recipe/BOM | **ADD** | **P0 F&B** | `RecipeEntity` (`recipe_entity.dart:4`) and `RecipeDao.findRecipeByProductId` (`recipe_dao.dart:7`) are product-level only — no `variant_id`. Backend `RecipeVersion` entity (`recipe-version.entity.ts:35`) binds to `product_id`, no variant. `SyncRecipeVersionDocumentDto` (`sync-recipe-version-document.dto.ts:65`) has `productId` only. `InvoiceItemEntity.recipeVersionId` (`invoice_item_entity.dart:38`) exists but is set at checkout, not pre-bound to variant. **No code path links a variant to a specific recipe version.** |
| PV-06 | Variant-specific KDS metadata | **ADD** | P1 | No variant-level KDS fields on `ProductVariantEntity` or `ProductVariant`. `KitchenOrderItem` (`kitchen_order_item.freezed.dart:30`) carries `List<String> modifiers` but no variant-specific prep station routing. |
| PV-07 | Variant active/86 state | **ADD** | P1 | `ProductVariantEntity` has no `is_active` field. `ProductEntity.isActive` exists but is parent-level only. |
| PV-08 | Variant reporting rollup | **ADD** | P1 | No variant breakout in reporting entities. `InvoiceItemEntity` stores `variant_id` (`invoice_item_entity.dart:35`) which enables future drill-down, but no aggregation query exists for variant-level reports. |
| PV-09 | Variant recipe copy/scale workflow | **ADD** | P1 | No code path for copying/scaling recipes from parent to variant. `RecipeService.createNewVersion` (`recipe.service.ts:83`) works at product level only. |
| PV-10 | Parent never sold if variants required | **ADD** | P0 | No validation in `SaleViewModel.addToCart` (`sale_view_model.dart:670`) to prevent selling a `VARIANT_PARENT` directly. `ProductEntity` has no `product_type` field to enforce this. `Product` domain model (`product.dart:9`) has no `productType` field. Owner dashboard defines `ProductType` (`product-types.ts:1`) but it is not persisted in the backend Product entity (`product.entity.ts:13`). |

---

## 9. Gap matrix — Modifiers / "Extras"

| ID | Capability | Status | Severity | Code evidence |
|---|---|---|---|---|
| MOD-01 | Generic modifier groups | **EXTEND** | P0 | `ProductModifierEntity` (`product_entity.dart:90`) exists with `id`, `product_id`, `name`, `extra_price`. Domain model `Modifier` (`product.dart:64`) has `id`, `name`, `extraPrice`. `Product.availableModifiers` holds `List<Modifier>`. `ProductDao.findModifiersByProductId` (`recipe_dao.dart:32`) queries them. **However:** modifiers are a flat list per product — no modifier groups, no selection rules, no required/optional semantics, no group-level ordering. This is a simple "extras" list, not a modifier group system. |
| MOD-02 | Rename "Extras" domain tab to "Modifiers" | **RENAME** | P0 product clarity | Owner dashboard has `product-types.ts` with `PRODUCT_TYPES` but the backoffice UI tab is called "Extras" (see `item_options_editor.dart`). Domain model is `Modifier` but entity is `ProductModifierEntity`. The name "Extras" in UX is narrower than the domain concept. |
| MOD-03 | Required/optional | **ADD** | P0 | No `required` field on `ProductModifierEntity` or `Modifier`. No selection-blocking logic in `SaleViewModel.addToCart` (`sale_view_model.dart:670`). |
| MOD-04 | Min/max selections | **ADD** | P0 | No `minSelections`/`maxSelections` fields anywhere in the modifier entities. |
| MOD-05 | Single/multiple choice | **ADD** | P0 | No `selectionMode` enum or field. Current model is always "pick any from flat list". |
| MOD-06 | Modifier quantity (e.g. x2 extra shot) | **ADD** | P0 | `Modifier` model (`product.dart:64`) has no quantity concept. `CartItem` (`cart_item.dart:8`) holds `List<Modifier> selectedModifiers` — each modifier is listed once. `InvoiceItemModifierEntity` (`invoice_item_modifier_entity.dart:4`) has no `quantity` field. Backend `InvoiceItemModifier` (`invoice-item-modifier.entity.ts:11`) also lacks `quantity`. |
| MOD-07 | Default selections | **ADD** | P1 | No `isDefault` field on `Modifier` or `ProductModifierEntity`. |
| MOD-08 | Reusable modifier library | **ADD** | P1 | Modifiers are per-product only (`ProductModifierEntity.product_id`). No shared modifier group table. No cross-product reuse. |
| MOD-09 | Product/variant-level modifier overrides | **ADD** | P1 | No override mechanism. Modifiers are product-level flat list. No variant-specific modifier assignments. |
| MOD-10 | Price delta | **EXISTS** | P0 | `Modifier.extraPrice` (`product.dart:66`) persisted as `ProductModifierEntity.extraPrice` (`product_entity.dart:97`). `CartItemX.modifiersTotal` (`cart_item.dart:29`) sums `extraPrice * quantity`. `InvoiceItemModifierEntity.extraPrice` (`invoice_item_modifier_entity.dart:21`) snapshots at sale. Backend `InvoiceItemModifier.extraPrice` (`invoice-item-modifier.entity.ts:25`) also persists. **However:** no immutable snapshot guarantee — the price is copied at sale time, but there is no contract preventing catalog edits from affecting historical reporting if the snapshot is lost. |
| MOD-11 | Inventory effect | **ADD** | **P0** | No `inventoryEffect` field on `Modifier`, `ProductModifierEntity`, or `InvoiceItemModifierEntity`. No code path triggers inventory consumption from modifier selection. `MovementEntity` (`movement_entity.dart:3`) has `originInvoiceItemId` but no `originModifierId`. The entire modifier→inventory pipeline is absent. |
| MOD-12 | Substitution semantics | **ADD** | **P0** | No recipe slot model exists. No `REPLACE_RECIPE_SLOT` concept. `RecipeEntity` (`recipe_entity.dart:4`) is a flat list of `ingredient_id` + `quantity`. No slot/target mechanism for substitutions. |
| MOD-13 | Removal semantics | **ADD** | **P0** | No `SUPPRESS_RECIPE_SLOT` concept. No way to mark a modifier as removing a base recipe component. |
| MOD-14 | No-inventory kitchen instructions | **ADD** | P1 | No `inventoryEffect = NONE` distinction. All modifiers are treated identically. `KitchenOrderItem.modifiers` (`kitchen_order_item.freezed.dart:30`) is `List<String>` — no effect type differentiation. |
| MOD-15 | Size-aware modifier behavior | **ADD** | P1 | No variant-specific modifier overrides. No recipe-slot inheritance model. |
| MOD-16 | Modifier availability/86 | **ADD** | P1 | No `isActive` field on `Modifier` or `ProductModifierEntity`. |
| MOD-17 | Nested modifiers | **ADD LATER** | P2 | No nested modifier support. |
| MOD-18 | Modifier display order | **ADD** | P1 | No `displayOrder` field on `Modifier` or `ProductModifierEntity`. Modifiers render in insertion order. |
| MOD-19 | KDS display order separate from POS | **ADD LATER** | P2 | No separate KDS ordering. |
| MOD-20 | Modifier notes/free text | **ADD** | P1 | `CartItem.notes` (`cart_item.dart:15`) exists but is per-line, not per-modifier. No per-modifier free-text field. |

---

## 10. Gap matrix — Ticket line, fiscal snapshot and reversibility

| ID | Capability | Status | Severity | Code evidence |
|---|---|---|---|---|
| TL-01 | `productId` + `variantId` on ticket line | **EXISTS** | P0 | `InvoiceItemEntity` (`invoice_item_entity.dart:19,35`) has `product_id` (required) and `variant_id` (nullable). `InvoiceItem` domain model (`invoice_item.freezed.dart:24,34`) carries both. `SaleViewModel.addToCart` (`sale_view_model.dart:706`) passes `variantId` to `CartItem`. `CartItem` (`cart_item.dart:15`) has `variantId`. `SalesMapper.toItemEntity` (`sales_mapper.dart:375`) maps `variantId`. **Verified: persisted end-to-end.** |
| TL-02 | Product/variant display-name snapshot | **EXTEND** | P0 | `InvoiceItemEntity.productName` (`invoice_item_entity.dart:20`) snapshots product name. `SaleViewModel.addToCart` (`sale_view_model.dart:695`) appends variant name: `productName += ' (${variant.name})'`. **However:** variant name is embedded in `productName` string, not a separate `variantNameSnapshot` column. This makes historical variant reporting fragile — parsing required. |
| TL-03 | Variant price snapshot | **ADD** | P0 | `InvoiceItemEntity.unitPrice` (`invoice_item_entity.dart:23`) stores the computed final price (parent + adjustment + modifiers). No separate `variantBasePriceSnapshot` field. The unit price is a composite of variant base + modifier deltas, making it difficult to separate variant pricing from modifier pricing historically. |
| TL-04 | `modifierGroupId` + `modifierOptionId` | **ADD** | P0 | `InvoiceItemModifierEntity` (`invoice_item_modifier_entity.dart:14`) has only `id`, `invoice_item_id`, `name`, `extra_price`. No `modifier_group_id`, no `modifier_option_id`. Backend `InvoiceItemModifier` (`invoice-item-modifier.entity.ts:11`) same: `id`, `invoiceItemId`, `name`, `extraPrice`. Modifiers are identified only by name — no traceable identity. |
| TL-05 | Modifier quantity | **ADD** | P0 | `InvoiceItemModifierEntity` has no `quantity` field. Backend `InvoiceItemModifier` also lacks `quantity`. `CartItem.selectedModifiers` is `List<Modifier>` with no quantity per modifier. Modifiers are implicitly quantity=1. |
| TL-06 | Modifier name snapshot | **EXISTS** | P0 | `InvoiceItemModifierEntity.name` (`invoice_item_modifier_entity.dart:19`) persists the modifier name. Backend `InvoiceItemModifier.name` (`invoice-item-modifier.entity.ts:23`) same. **However:** no immutable guarantee — name is a copy at sale time, but if catalog modifier is renamed, historical data retains the old name (correct behavior for snapshot). |
| TL-07 | Modifier price-delta snapshot | **EXISTS** | P0 | `InvoiceItemModifierEntity.extraPrice` (`invoice_item_modifier_entity.dart:21`) persists the applied price delta. Backend same. **Same snapshot caveat as TL-06.** |
| TL-08 | Recipe version / inventory plan identity | **EXTEND** | P0 | `InvoiceItemEntity.recipeVersionId` (`invoice_item_entity.dart:38`) exists and is persisted. Backend migration `1769000000000` added the column. `SalesMapper.toItemEntity` (`sales_mapper.dart:376`) maps it. **However:** `recipeVersionId` is not populated during `addToCart` — it is set at checkout time in the sales repository. No pre-binding to variant means the wrong recipe version could be used if the active recipe changed between variant selection and checkout. |
| TL-09 | Exact inventory movement linkage | **EXTEND** | P0 | `MovementEntity.originInvoiceItemId` (`movement_entity.dart:28`) links movements to invoice items. **However:** no `originModifierId` field exists. Modifier-driven inventory adjustments cannot be traced back to the specific modifier that caused them. Void reversal works at invoice-item level only. |
| TL-10 | KDS instruction snapshot | **ADD** | P1 | No KDS instruction snapshot on ticket line. `KitchenOrderItem.modifiers` is `List<String>` — names only, no structured snapshot. |
| TL-11 | Promotion/loyalty allocation per line | **EXTEND** | P0 | `PromotionsEngine.evaluate` (`promotions_engine.dart:41`) returns `PromotionEvaluationResult` with `itemDiscounts` (Map by productId) and `appliedPromotions` list. **However:** `SaleViewModel._applyPromotions` (`sale_view_model.dart:481-486`) only stores `_totalDiscounts = result.totalDiscount` as a single aggregate. The per-item discount map is discarded — never persisted to `InvoiceItemEntity` or any ticket table. Discounts are computed at cart level in memory, not frozen on the ticket. Void/refund cannot reconstruct which line received which discount allocation. |
| TL-12 | Tax treatment of modifiers | **EXTEND** | P0 | `CartItem.taxRate` (`cart_item.dart:14`) is set from `product.effectiveTaxRate` (`sale_view_model.dart:699`). `CartItemX.grossAmount` (`cart_item.dart:32`) includes modifier deltas in the taxable base. `InvoiceFiscalCalculator` computes final tax. **However:** no per-modifier tax override or exemption field. Modifiers always inherit the parent product's tax rate. This is correct for V1 but not configurable. |

---

## 11. Pricing pipeline gaps

NHILOS should define one deterministic pricing order for a customized line.

Recommended conceptual order:

```text
Selected variant base price
+ modifier/add-on deltas × quantity
= configured line gross
- automatic promotion allocations
- authorized manual discount allocations
- loyalty reward allocation (if applicable)
= final sale line amount before tax treatment
→ tax engine using frozen applicable rules
```

Exact fiscal sequencing must remain governed by the authoritative fiscal rules, but the key invariant is:

> Modifiers must not exist outside the line pricing engine.

Required decisions:

1. Can promotions target modifier value or only base product value?
2. Can loyalty earning include paid extras? Recommended default: yes, because they are sale consideration unless a program excludes them.
3. Can a reward discount a premium modifier? Must be explicit.
4. If a modifier has a negative price (substitution/removal credit), how is discount stacking handled?
5. Does a modifier inherit the parent tax profile? Recommended default: yes.
6. How are line-level discount allocations frozen for void/refund reporting?

---

## 12. Inventory and COGS pipeline gaps

### Required invariant

Inventory consumption must be derived from the **final configured sellable line**, not from the parent product alone.

```text
Product
  ↓
Selected Variant
  ↓
Variant Recipe Version
  ↓
Apply modifier inventory effects
  ↓
Resolved Consumption Plan
  ↓
Ticket PAID / configured inventory trigger
  ↓
Kardex deltas + frozen CPP movement values
```

The resolved consumption plan should be deterministic and testable before the Kardex movement is committed.

### Examples that must pass

1. Cappuccino 8 oz, whole milk, no extras.
2. Cappuccino 12 oz, almond milk.
3. Cappuccino 12 oz, almond milk + 2 extra shots.
4. Burger, no onion + extra cheese.
5. Steak, medium rare only — no inventory delta from doneness.
6. Void a paid customized order after recipe definitions changed — reverse the original movements, not the new recipe.

---

## 13. POS UX target

### 13.1 Order-entry sequence

For a product with variants/modifiers:

```text
Tap Cappuccino
  ↓
Select size (required variant)
  ↓
Required modifier groups
  ↓
Prompted optional groups
  ↓
Optional extras
  ↓
Review compact summary
  ↓
Add configured line to ticket
```

### 13.2 Zero-training requirements

- A product with one active variant should not force an unnecessary modal.
- A required group with one valid default may auto-select, but the behavior must be visible/editable.
- Required choices should auto-advance in configured order.
- Modifier options need large hit targets consistent with the existing 48dp design rule.
- The cart line must render a compact configuration summary:

```text
Cappuccino 12 oz          C$ 95
  Almond milk             +15
  Extra shot ×2           +30
```

- Editing a configured line must reopen its current selections, not rebuild from current defaults.
- If a modifier became unavailable after the line was held, existing held selection must remain explicit and require a controlled resolution before finalization if business rules demand it.

---

## 14. Backoffice catalog UX target

### Current concern

Two tabs named **Variants** and **Extras** encourage a false mental model: "variant = superficial option; extra = paid addition". Restaurant configuration is broader.

### Recommended product editor

```text
General
Pricing & Tax
Variants / Presentations
Recipe
Modifiers
Availability
Production / KDS
Reporting metadata
```

For a `VARIANT_PARENT`:

```text
Variants / Presentations
  8 oz   [price] [recipe] [active]
 12 oz   [price] [recipe] [active]
```

For modifiers:

```text
Modifiers
  Milk type      required 1..1
    Whole milk   default
    Almond milk  +C$15

  Extras         optional 0..5, quantity enabled
    Extra shot   +C$15
    Syrup        +C$10

  Preparation    optional
    Extra hot    C$0, no inventory
```

### Reusable library

Modifier groups should be reusable across products. Product assignment may override:

- display order;
- min/max;
- default option;
- price delta;
- availability;
- variant-specific inventory mapping.

---

## 15. Promotion and Loyalty interaction audit

Current NHILOS roadmaps show promotions and Loyalty V1 as completed domains, but no current document proves complete modifier-aware integration.

### Required verification

- promotion qualifying quantity counts configured sellable lines correctly;
- 2x1 does not accidentally duplicate/ignore modifier charges;
- percentage discount base is explicit (`BASE_ONLY` vs `LINE_TOTAL`);
- loyalty eligible spend includes/excludes modifiers by defined rule;
- free-product reward uses a deterministic default configuration or requires customer choices before fulfillment;
- loyalty reward cannot silently bypass required variant/modifier selection;
- inventory for a free reward still consumes the exact variant/modifier BOM through Sales → Inventory;
- void/reversal reverses loyalty and inventory based on the original configured line.

---

## 16. KDS / kitchen-ticket gaps

Modifiers are operational information, not just pricing metadata.

Required behavior:

- selected variant/size appears prominently;
- substitutions/removals are visually distinguishable;
- quantity extras render explicitly (`EXTRA SHOT ×2`);
- zero-price instructions still print/display;
- kitchen ordering may differ from POS ordering in future;
- line edits after initial send generate a clear delta/change event rather than silently replacing kitchen state;
- removed items from held/open orders remain auditable according to existing supervisor/audit rules.

---

## 17. Reporting gaps

The reporting model should support both product-level and configuration-level analysis.

Minimum recommended outputs:

- sales by product;
- sales by variant/presentation;
- modifier units sold;
- modifier revenue;
- modifier COGS;
- modifier attach rate (`extra shot on 22% of cappuccinos`);
- substitution usage (`almond milk share`);
- contribution margin by variant;
- voided configured lines and their modifier values;
- kitchen instruction frequencies where operationally useful.

Do not force the owner to choose between "Cappuccino total" and "Cappuccino 8/12 oz detail"; support rollup + drill-down.

---

## 18. Offline-first and sync gaps

Catalog customization must remain safe when the POS is disconnected.

Required invariants:

1. The POS sells from the last locally published product/variant/modifier/recipe configuration.
2. A sale snapshots the exact IDs/versions/financial values used locally.
3. Later cloud catalog edits never rewrite historical ticket configuration.
4. Modifier and recipe master-data deltas are versioned or orderable.
5. If a variant/modifier is deactivated in cloud while a POS is offline, previously synced local behavior remains valid until the change arrives; the resulting sale is still historically valid.
6. Conflict resolution must not mutate a paid ticket to match a newer catalog definition.

---

## 19. Void, cancellation and refund boundary

Existing documents strongly define invoice/ticket void behavior and auditability, but a broader post-payment refund/return model is not closure-proven by the reviewed documentation.

For the current gap work, at minimum:

- pre-payment line removal must reverse any reservation/preparation state according to existing order lifecycle;
- paid ticket void must reverse exact inventory movements for selected variant + modifiers;
- historical snapshots remain immutable;
- if partial refunds/returns are later introduced, they must operate on frozen line/configuration data rather than current catalog data.

**Recommendation:** keep full refund/return workflows outside the first modifier refactor unless SOHO requires them now, but create an explicit backlog item rather than assuming "void" covers every post-payment scenario.

---

## 20. Complete priority register

### P0 — Must close before claiming restaurant catalog completeness

1. First-class sellable variant identity.
2. Variant-specific recipe/BOM binding.
3. Parent-not-sellable invariant for variant parents.
4. Rename/generalize "Extras" → "Modifiers".
5. Required/min/max modifier enforcement.
6. Modifier quantity.
7. Inventory-aware add/remove/replace semantics.
8. Substitution correctness across sizes.
9. Ticket snapshot of variant + modifier identity/value/quantity.
10. Exact inventory movement linkage and reversal.
11. Modifier-aware tax/pricing pipeline.
12. Modifier-aware promotion/Loyalty regression suite.
13. Offline sync contract for variants/modifiers/recipe versions.
14. KDS/receipt representation of final configured item.

### P1 — Should close for a strong V1

1. reusable modifier library;
2. defaults;
3. per-product/variant overrides;
4. variant/modifier 86 state;
5. modifier reporting and attach rates;
6. kitchen instructions/no-inventory modifier type;
7. recipe copy/scale helper;
8. free-text notes with audit/policy;
9. modifier/display ordering;
10. catalog import support for variant recipes/modifier assignments.

### P2 — Later sophistication

1. nested modifiers;
2. separate KDS modifier ordering;
3. sequence-based modifier pricing;
4. highly advanced size-dependent pricing matrices;
5. complex combo/bundle engine if not otherwise required;
6. customer/channel-specific modifier availability.

---

## 21. Proposed target conceptual model

```text
Product
  id
  type: SIMPLE | COMPOUND | VARIANT_PARENT
  ...

ProductVariant
  id
  productId
  sku?
  attributes
  price
  active
  recipeVersionId?     // F&B
  stockItemId?         // retail/simple stock

ModifierGroup
  id
  name
  selectionMode
  required
  minSelections
  maxSelections
  allowQuantity
  displayOrder

ModifierOption
  id
  groupId
  name
  defaultPriceDelta
  inventoryEffectType
  linkedSubrecipeId?
  targetRecipeSlot?
  replacementComponentId?
  active

SellableModifierAssignment
  sellableId            // product or variant target
  modifierGroupId
  overrides...

TicketLine
  id
  productId
  variantId?
  productNameSnapshot
  variantNameSnapshot?
  unitPriceSnapshot
  recipeVersionIdSnapshot?
  ...

TicketLineModifier
  id
  ticketLineId
  modifierGroupId
  modifierOptionId
  groupNameSnapshot
  optionNameSnapshot
  quantity
  unitPriceDeltaSnapshot
  inventoryEffectSnapshot/version
  ...

InventoryMovement
  sourceTicketLineId
  sourceTicketLineModifierId?
  recipeVersionId?
  exact quantity / CPP snapshot
```

The exact persistence shape can differ, but these invariants should survive architecture design.

---

## 22. Acceptance gates for the future remediation roadmap

A modifier/variant remediation should not be declared done because the UI "lets you select options". It should exit only when evidence proves:

### Gate A — Catalog correctness

- every sellable variant has a valid pricing + inventory policy;
- every COMPOUND variant that needs a distinct BOM resolves to exactly one active recipe version;
- invalid parent/variant configurations cannot publish.

### Gate B — FOH correctness

- required modifier selections block line completion;
- min/max and quantities are enforced;
- edits preserve current selections;
- order entry remains fast on Sunmi V2s.

### Gate C — Inventory correctness

For seeded fixtures, expected theoretical inventory after sale exactly matches actual Kardex deltas for variant + modifiers.

### Gate D — Financial correctness

- line total = variant price + modifier deltas − discounts/rewards according to approved rules;
- tax snapshots reconcile;
- reports reproduce ticket totals.

### Gate E — Reversal correctness

A void reverses the exact original inventory and financial effects even after catalog/recipe edits.

### Gate F — Offline correctness

The full configured sale completes with internet disabled and later synchronizes without losing variant/modifier identity.

### Gate G — Kitchen correctness

KDS/printed kitchen ticket communicates size, substitutions, removals, extras and instructions unambiguously.

---

## 23. Recommended decisions

1. **Keep Variants. Do not remove them.** Strengthen them into first-class sellable configurations.
2. **For Cappuccino 8/12 oz, bind a distinct recipe version to each variant.**
3. **Rename "Extras" to "Modifiers"** in the administrative/domain model; keep an "Extras" modifier group as a user-facing template.
4. **Introduce deterministic inventory effects for modifiers**, preferably recipe-slot based for substitutions/removals.
5. **Make the resolved configured line the source for pricing, KDS and inventory**, not the parent product.
6. **Freeze IDs, names, prices, quantities and recipe/effect versions on the ticket.**
7. **Add a dedicated remediation workstream before extending the catalog UI further.** W5/W7 should consume the corrected model, not cement the current ambiguity.

---

## 24. Suggested next document sequence

```text
sales_catalog_prd_v2
        ↓
sales_catalog_architecture_spec
        ↓
sales_catalog_execution_roadmap
        ↓
sales_catalog_acceptance_plan
```

This audit is the authoritative baseline. Begin with `sales_catalog_prd_v2`.

---

## 25. Sources

### Project documents reviewed

- `Product_Requirement_Document.md`
- `Product_Requirement_Document_v2.md`
- `prd_modulo_ventas.md`
- `prd_gestion_inventario.md`
- `prd_audit_trail.md`
- `prd_onboarding.md`
- `master_execution_roadmap.md`
- `owner_dashboard_execution_roadmap.md`
- `DESIGN.md`
- `DESIGN_BACKOFFICE.md`

### Repository files verified (code-level evidence)

**POS App (Flutter/Floor):**
- `apps/pos_app/lib/data/models/inventory/product_entity.dart` — `ProductEntity`, `ProductVariantEntity`, `ProductModifierEntity`
- `apps/pos_app/lib/domain/models/inventory/product.dart` — `Product`, `ProductVariant`, `Modifier` (Freezed)
- `apps/pos_app/lib/data/daos/inventory/recipe_dao.dart` — `RecipeDao`, `ProductDao` (variant/modifier CRUD)
- `apps/pos_app/lib/data/models/inventory/recipe_entity.dart` — `RecipeEntity` (product-level only)
- `apps/pos_app/lib/data/models/sales/invoice_item_entity.dart` — `InvoiceItemEntity` (has `variantId`, `recipeVersionId`)
- `apps/pos_app/lib/data/models/sales/invoice_item_modifier_entity.dart` — `InvoiceItemModifierEntity` (name + extraPrice only)
- `apps/pos_app/lib/data/models/inventory/movement_entity.dart` — `MovementEntity` (has `originInvoiceItemId`, no modifier linkage)
- `apps/pos_app/lib/domain/models/sales/cart_item.dart` — `CartItem` (has `variantId`, `selectedModifiers`)
- `apps/pos_app/lib/presentation/features/sales/view_models/sale_view_model.dart` — `SaleViewModel.addToCart` (variant price calc, modifier flow)
- `apps/pos_app/lib/data/mappers/sales_mapper.dart` — `SalesMapper` (modifier persistence, sync JSON)
- `apps/pos_app/lib/data/repositories/inventory/inventory_repository_impl.dart` — `saveProductOptions` (variant/modifier save)

**Admin Backend (NestJS/TypeORM):**
- `apps/admin_backend/src/modules/inventory/entities/product.entity.ts` — `Product` (no `product_type` column)
- `apps/admin_backend/src/modules/inventory/entities/recipe-version.entity.ts` — `RecipeVersion` (product-level, no variant)
- `apps/admin_backend/src/modules/inventory/recipe.service.ts` — `RecipeService` (product-level recipe management)
- `apps/admin_backend/src/modules/inventory/dto/sync-recipe-version-document.dto.ts` — `SyncRecipeVersionDocumentDto` (productId only)
- `apps/admin_backend/src/modules/sales/entities/invoice-item-modifier.entity.ts` — `InvoiceItemModifier` (name + extraPrice only)
- `apps/admin_backend/src/migrations/1769000000000-AddRecipeVersionIdToInvoiceItems.ts` — recipe_version_id on invoice_items

**Owner Dashboard:**
- `apps/owner_dashboard/src/features/catalog/product-types.ts` — `ProductType` enum (SIMPLE/COMPOUND/VARIANT_PARENT)

### Market references

- Square Support — Create and edit item options and variations: https://squareup.com/help/us/en/article/6689-item-options
- Square Support — Create and edit modifiers: https://squareup.com/help/us/en/article/5119-create-and-manage-item-modifiers
- Square Developer — Enable Item Customization with Modifiers: https://developer.squareup.com/docs/catalog-api/enable-modifiers-on-items
- Toast Platform Guide — Size price: https://doc.toasttab.com/doc/platformguide/adminSizePrice.html
- Toast Platform Guide — Adding modifier groups and modifiers: https://doc.toasttab.com/doc/platformguide/adminAddingModifierGroupsAndModifiers.html
- Toast Platform Guide — Pricing modifiers: https://doc.toasttab.com/doc/platformguide/adminPricingModifierOptions.html
- Clover Developer — Manage modifier groups and modifiers: https://docs.clover.com/dev/docs/managing-modifier-groups-modifiers
- Lightspeed Restaurant K-Series — About menus and items: https://k-series-support.lightspeedhq.com/hc/en-us/articles/1260804647349-About-menus-and-items
- Lightspeed Restaurant K-Series — Managing production instructions: https://k-series-support.lightspeedhq.com/hc/en-us/articles/1260804656369-Managing-production-instructions
- Lightspeed Restaurant K-Series — Using KDS 2.0: https://k-series-support.lightspeedhq.com/hc/en-us/articles/22708154090267-Using-the-Kitchen-Display-System-2-0
