# NHILOS POS — Sales, Variants & Modifiers Gap Audit

**Version:** 0.1  
**Status:** PROPOSED — PRODUCT/DOCUMENTATION/MARKET AUDIT; CODE-LEVEL VERIFICATION PENDING  
**Primary scope:** Catalog → product/variant configuration → FOH order entry → pricing → recipes/inventory → KDS/printing → promotions/loyalty → void/reversal → reporting → offline sync.  
**Primary concern:** Variants and “Extras” are present conceptually/UI-wise, but the documented contracts do not yet prove a coherent end-to-end model for restaurant customization and inventory accuracy.

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
- **RENAME / REMOVE-FROM-UX** — current UX/domain label causes incorrect modeling;
- **VERIFY-CODE** — documentation suggests intent, but repository evidence must be inspected before claiming implementation.

This audit does **not** assert code behavior that has not been directly inspected. User-observed current behavior is treated as operational evidence, while roadmap “completed” status is treated as implementation evidence only for the batches explicitly listed there.

---

## 2. Executive diagnosis

### 2.1 Main conclusion

NHILOS has the right ingredients on paper, but **Variants, Modifiers and Recipes are not yet modeled as one coherent sales configuration system**.

The most important finding is this:

> A restaurant variant must not be merely a label or price option. It must be a first-class sellable configuration capable of owning its own price, SKU/identity, tax profile where applicable, availability policy and — critically for COMPOUND products — its own recipe/BOM binding.

The master PRD already points in that direction by stating that a `PRODUCT_VARIANT` may discount simple inventory or recipe ingredients. The dedicated sales PRD, however, only snapshots modifier name + additional price and does not define variant-specific recipe identity, modifier inventory effects, modifier quantity, substitution/removal semantics or immutable recipe/configuration snapshots.

Therefore the Cappuccino 8 oz / 12 oz issue is **not evidence that sizes should never be variants**. It is evidence that the current variant implementation/contract is too weak. Market systems commonly treat small/medium/large as variants or size choices; NHILOS needs to go one step further and bind each food-service variant to the correct BOM.

### 2.2 Second major conclusion

The “Extras” tab is too narrow as a domain concept.

**Recommendation:** rename the domain/backoffice capability to **Modifiers**. “Extras” becomes only one modifier-group use case.

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

**Relevant pattern for NHILOS:** not every “modifier” should affect price or inventory. Kitchen instructions are a distinct effect type even if the UI presents them in the same customization flow.

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

A generic “extra price + name” record is insufficient. NHILOS needs deterministic inventory semantics.

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

| ID | Capability | Current evidence | Status | Severity | Required action |
|---|---|---|---|---|---|
| PV-01 | `VARIANT_PARENT` + sellable variants | Master PRD defines it | EXISTS / VERIFY-CODE | P0 | Verify entities, DAOs, sync DTOs and FOH selection path |
| PV-02 | Variant-specific price | Market-standard; implied by variant concept | EXTEND | P0 | Authoritative contract + persistence fields + snapshot |
| PV-03 | Variant-specific SKU/barcode | Market-standard; master PRD implies variant identity | EXTEND | P1 | Define uniqueness and retail scanning behavior |
| PV-04 | Variant-specific stock | Master PRD says variant may discount inventory | EXTEND | P0 retail | Make variant a stock-owning sellable in retail |
| PV-05 | Variant-specific recipe/BOM | Master PRD says variant may use recipe, dedicated data model does not define it | **ADD / VERIFY-CODE** | **P0 F&B** | `sellableVariant -> recipeVersion` binding |
| PV-06 | Variant-specific KDS metadata | Not authoritative | ADD | P1 | Allow prep station/name overrides |
| PV-07 | Variant active/86 state | Not explicit | ADD | P1 | Per-variant availability without disabling parent |
| PV-08 | Variant reporting rollup | Not explicit | ADD | P1 | Report product total + variant breakout |
| PV-09 | Variant recipe copy/scale workflow | Missing | ADD | P1 | Setup accelerator with safe defaults |
| PV-10 | Parent never sold if variants required | Not explicit | ADD | P0 | Domain invariant and validation |

---

## 9. Gap matrix — Modifiers / “Extras”

| ID | Capability | Current evidence | Status | Severity | Required action |
|---|---|---|---|---|---|
| MOD-01 | Generic modifier groups | Sales PRD defines groups | EXISTS / VERIFY-CODE | P0 | Verify end-to-end FOH path |
| MOD-02 | Rename “Extras” domain tab to “Modifiers” | Current UX described as “Extras” | **RENAME** | P0 product clarity | “Extras” becomes a group/template, not the domain |
| MOD-03 | Required/optional | Documented | EXISTS / VERIFY-CODE | P0 | Enforce in POS before line commit |
| MOD-04 | Min/max selections | Documented | EXISTS / VERIFY-CODE | P0 | Enforce and test |
| MOD-05 | Single/multiple choice | Documented conceptually | EXTEND | P0 | Explicit enum/validation |
| MOD-06 | Modifier quantity (e.g. x2 extra shot) | Not authoritative | ADD | P0 | Persist quantity and multiply price/inventory |
| MOD-07 | Default selections | Not documented | ADD | P1 | Useful for default milk/side configuration |
| MOD-08 | Reusable modifier library | Not authoritative | ADD | P1 | Reuse groups/options across products |
| MOD-09 | Product/variant-level modifier overrides | Missing | ADD | P1 | Override price, availability, limits, order |
| MOD-10 | Price delta | Documented | EXISTS / VERIFY-CODE | P0 | Persist immutable amount used at sale |
| MOD-11 | Inventory effect | Documented only at high level | **EXTEND** | **P0** | Deterministic add/remove/replace model |
| MOD-12 | Substitution semantics | Missing | **ADD** | **P0** | Replace recipe slot/component, not “add both” |
| MOD-13 | Removal semantics | Prose example exists, no data contract | **ADD** | **P0** | Suppress component/slot when configured to affect inventory |
| MOD-14 | No-inventory kitchen instructions | Not explicitly separated | ADD | P1 | `inventoryEffect = NONE`; KDS-only semantics |
| MOD-15 | Size-aware modifier behavior | Missing | ADD | P1 | Variant-specific override or recipe-slot inheritance |
| MOD-16 | Modifier availability/86 | Missing | ADD | P1 | Disable option without deleting history |
| MOD-17 | Nested modifiers | Not documented | ADD LATER | P2 | Useful for complex pizza/customization; not pilot-blocking |
| MOD-18 | Modifier display order | Not authoritative | ADD | P1 | Required first, then prompted/optional; per product override |
| MOD-19 | KDS display order separate from POS | Missing | ADD LATER | P2 | Useful in larger kitchens |
| MOD-20 | Modifier notes/free text | Missing | ADD | P1 | Audit + KDS, with optional permission/policy |

---

## 10. Gap matrix — Ticket line, fiscal snapshot and reversibility

The dedicated sales data model currently snapshots modifiers only as a name and price delta. That is insufficient for reliable reversals, analytics and synchronization.

| ID | Capability | Status | Severity | Target |
|---|---|---|---|---|
| TL-01 | `productId` + `variantId` on ticket line | ADD/VERIFY-CODE | P0 | Persist selected sellable identity |
| TL-02 | Product/variant display-name snapshot | ADD | P0 | Historical receipt survives renames |
| TL-03 | Variant price snapshot | ADD | P0 | Fiscal/historical integrity |
| TL-04 | `modifierGroupId` + `modifierOptionId` | ADD | P0 | Traceable selection identity |
| TL-05 | Modifier quantity | ADD | P0 | Price/inventory correctness |
| TL-06 | Modifier name snapshot | EXISTS conceptually | P0 | Keep immutable historical text |
| TL-07 | Modifier price-delta snapshot | EXISTS conceptually | P0 | Keep applied amount, not current catalog value |
| TL-08 | Recipe version / inventory plan identity | ADD | P0 | Do not recompute historical consumption from current recipe |
| TL-09 | Exact inventory movement linkage | EXTEND | P0 | Void/reversal reverses original movements exactly |
| TL-10 | KDS instruction snapshot | ADD | P1 | Historical prep evidence |
| TL-11 | Promotion/loyalty allocation per line | VERIFY/EXTEND | P0 | Prevent ambiguous discount allocation |
| TL-12 | Tax treatment of modifiers | ADD | P0 | Inherit parent by default; explicit exception only |

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

Two tabs named **Variants** and **Extras** encourage a false mental model: “variant = superficial option; extra = paid addition”. Restaurant configuration is broader.

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

Do not force the owner to choose between “Cappuccino total” and “Cappuccino 8/12 oz detail”; support rollup + drill-down.

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

**Recommendation:** keep full refund/return workflows outside the first modifier refactor unless SOHO requires them now, but create an explicit backlog item rather than assuming “void” covers every post-payment scenario.

---

## 20. Complete priority register

### P0 — Must close before claiming restaurant catalog completeness

1. First-class sellable variant identity.
2. Variant-specific recipe/BOM binding.
3. Parent-not-sellable invariant for variant parents.
4. Rename/generalize “Extras” → “Modifiers”.
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

## 22. Required code-level evidence before promoting this audit to implementation authority

A repository audit should answer each item with concrete file/test evidence.

### Catalog / backend

- entities/DTOs for `Product`, `ProductVariant`, modifier groups/options;
- variant price/SKU/stock/recipe fields;
- endpoints for variant CRUD;
- endpoints for modifier CRUD and product assignment;
- tenant/sucursal scoping;
- recipe version binding;
- backoffice product-editor implementation.

### POS local data

- Floor/Drift entities/DAOs for variants/modifiers;
- inbound sync mappers;
- offline availability;
- cached recipe/modifier versioning;
- migrations and compatibility with current installations.

### FOH domain

- add-to-cart path for variant selection;
- modifier validation engine;
- quantity support;
- price calculation;
- tax calculation;
- promotions;
- loyalty;
- hold/edit/resume configured lines;
- split bill preserving configured lines.

### Inventory

- recipe explosion from selected variant;
- modifier inventory effects;
- exact Kardex source references;
- void/reversal behavior;
- CPP/COGS snapshots.

### KDS / print

- variant/modifier text rendering;
- delta updates after line edit;
- zero-price instructions;
- 58mm readability on Sunmi V2s.

### Tests

At minimum, locate or add E2E tests for:

```text
cappuccino_8oz_recipe_e2e
cappuccino_12oz_recipe_e2e
cappuccino_almond_substitution_e2e
cappuccino_two_extra_shots_e2e
burger_remove_add_modifier_e2e
modifier_required_min_max_test
configured_line_hold_resume_test
configured_line_promotion_loyalty_test
configured_line_void_inventory_reversal_test
configured_line_offline_sync_test
```

---

## 23. Acceptance gates for the future remediation roadmap

A modifier/variant remediation should not be declared done because the UI “lets you select options”. It should exit only when evidence proves:

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

## 24. Recommended decisions

1. **Keep Variants. Do not remove them.** Strengthen them into first-class sellable configurations.
2. **For Cappuccino 8/12 oz, bind a distinct recipe version to each variant.**
3. **Rename “Extras” to “Modifiers”** in the administrative/domain model; keep an “Extras” modifier group as a user-facing template.
4. **Introduce deterministic inventory effects for modifiers**, preferably recipe-slot based for substitutions/removals.
5. **Make the resolved configured line the source for pricing, KDS and inventory**, not the parent product.
6. **Freeze IDs, names, prices, quantities and recipe/effect versions on the ticket.**
7. **Add a dedicated remediation workstream before extending the catalog UI further.** W5/W7 should consume the corrected model, not cement the current ambiguity.
8. **Run a code audit before implementation** to classify every target item as `EXISTS / EXTEND / ADD / REMOVE-FROM-UX`, avoiding duplicate domain work.

---

## 25. Suggested next document sequence

```text
sales_catalog_gap_audit_v1.0
        ↓
sales_catalog_prd_v2
        ↓
sales_catalog_architecture_spec
        ↓
sales_catalog_execution_roadmap
        ↓
sales_catalog_acceptance_plan
```

Before promoting this document to v1.0, the next action should be the repository evidence pass described in Section 22.

---

## 26. Sources

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

