# NHILOS POS — Backoffice Experience Standard

**Document:** `nhilos_backoffice_experience_standard_v1.0.md`  
**Version:** 1.0  
**Status:** APPROVED / AUTHORITATIVE EXPERIENCE STANDARD FOR NHILOS POS BACKOFFICE  
**Date:** 2026-09-26  
**Scope:** All authenticated NHILOS POS backoffice surfaces: dashboards, reports, lists, tables, detail views, CRUD flows, settings, operational review surfaces, onboarding/configuration surfaces and module-to-module navigation.  
**Primary purpose:** Serve as the universal audit filter, implementation standard and Definition of Done for every backoffice module.  
**Intended users:** Product, Design, Frontend, Backend, QA, reviewers and AI implementation/audit agents.

**Authority upstream:**
- `nhilos_brand_experience_principles_v1.0.md`
- `DESIGN_BACKOFFICE.md`
- module-specific approved PRDs / Architecture Specs / Acceptance Plans
- `owner_dashboard_experience_standard_v1.0.md` as the first approved product-level translation of these principles

**Reference only, not backoffice authority:**
- `nhilos_website_product_marketing_brief_v1.0.md`, when a principle is useful as an experience discipline but does not redefine product behavior.

---

# 0. Authority contract

This document governs **how the NHILOS standard is expressed throughout the backoffice**.

It does not invent or replace domain behavior.

For every audited module, the agent must work with two authorities simultaneously:

```text
MODULE PRODUCT AUTHORITY
PRD / Architecture / Acceptance
        +
NHILOS EXPERIENCE AUTHORITY
Brand Experience / Backoffice Standard
        ↓
IMPLEMENTED MODULE
```

## 0.1 Conflict rules

When authorities appear to conflict:

### Product truth wins over visual convenience

Never change:

- financial semantics;
- tax/fiscal behavior;
- inventory accounting;
- permissions;
- security;
- sync truth;
- audit guarantees;
- domain lifecycle;
- destructive-action policy;

merely to make the UI cleaner.

### Brand non-negotiables win over implementation convenience

An implementation shortcut does not justify:

- misleading copy;
- inaccessible controls;
- dark patterns;
- false certainty;
- unnecessary repetition;
- dead-end navigation;
- hiding material conditions.

### Experience does not silently rewrite Product

If the standard suggests a better interaction but an approved PRD explicitly requires another behavior:

> report `AUTHORITY_CONFLICT`.

Do not silently modify the product contract.

### Design tokens are not product semantics

`DESIGN_BACKOFFICE.md` governs visual/system patterns unless a newer approved product-expression spec intentionally supersedes a pattern.

---

# 1. The NHILOS backoffice standard

The backoffice should feel like software built by a company that:

- understood the task;
- prepared the context;
- reduced unnecessary work;
- communicated precisely;
- handled uncertainty honestly;
- anticipated the next useful step;
- removed what did not help;
- verified the core behavior before polishing it.

The target reaction is not:

> “Qué interfaz tan lujosa.”

It is:

> **“Aquí pensaron en los detalles.”**

And progressively:

> **“Esto se siente NHILOS.”**

---

# 2. Operational formula

Every backoffice experience is evaluated in this order:

```text
CORE PROMISE
    ↓
PRECISIÓN
    ↓
FIABILIDAD
    ↓
CUIDADO
    ↓
TIEMPO
    ↓
SOBRIEDAD
    ↓
CONSISTENCIA
    ↓
+1
```

A later layer never compensates for failure in an earlier one.

A beautiful +1 over an incorrect, insecure or confusing core flow is a failure.

---

# 3. What “luxury” means in NHILOS software

“Luxurization” is an internal strategic origin, not a visual style or public claim.

In backoffice software it means:

> **Elevating real and perceived value through precision, care, anticipation, criterion and restraint.**

## 3.1 It means

- remembering context;
- reducing steps;
- preparing sensible defaults;
- making consequences understandable before committing;
- preserving work after recoverable errors;
- taking the user directly to relevant information;
- distinguishing zero from unknown;
- explaining partial data;
- using language a business operator understands;
- preventing the user from solving the same problem twice;
- making normal operations quiet and exceptions visible.

## 3.2 It does not mean

- more cards;
- glassmorphism;
- black/gold;
- “premium” visual clichés;
- slow animation;
- decorative charts;
- excessive whitespace without hierarchy;
- extra confirmation dialogs everywhere;
- custom interactions that reduce familiarity;
- hiding complexity that is actually material;
- “magic” behavior that cannot be explained.

---

# 4. Core Promise First — universal release gate

No screen is considered NHILOS-compliant until its primary job is reliable.

For any page ask:

> **What is the one job the user came here to complete?**

Examples:

```text
Sales
→ understand/find a sale and inspect its truth

Products
→ create, find, understand and maintain sellable items safely

Inventory
→ understand stock state and execute controlled inventory actions

Promotions
→ configure commercial rules without ambiguity about scope/time

Users
→ manage access without creating unauthorized capability

Fiscal
→ inspect/configure fiscal behavior without compromising immutable records
```

The exact job must come from the module's product authority.

## 4.1 Core Promise blockers

A module fails immediately if its principal flow:

- produces incorrect business information;
- allows unauthorized access;
- hides a material side effect;
- loses user-entered work unnecessarily;
- makes an irreversible action ambiguous;
- routes the user to the wrong business object;
- requires manual reconstruction of context the system already knows;
- converts unknown/partial data into a valid-looking value;
- contradicts the module PRD;
- exposes an inaccessible critical action.

---

# 5. Audit verdict system

This standard does **not** use a numeric score as a release gate.

Use evidence-backed dispositions.

## 5.1 Finding severity

### `BLOCKER`

Release cannot pass.

Use for:

- security/permission leak;
- incorrect money/tax/inventory truth;
- destructive action without required protection;
- data loss;
- inaccessible critical flow;
- false certainty with material business impact;
- module behavior contradicting authoritative product contract.

### `REQUIRED`

Must be corrected for NHILOS Experience acceptance.

Examples:

- generic navigation loses known context;
- poor error recovery;
- unnecessary repeated input;
- important empty state without guidance;
- inconsistent filters;
- ambiguous action;
- missing state feedback;
- major hierarchy/noise issue.

### `REFINEMENT`

Important quality correction but not a broken core promise.

Examples:

- redundant copy;
- unnecessary visual container;
- overly generic button label;
- hierarchy polish;
- spacing/typography inconsistency.

### `+1 OPPORTUNITY`

A useful, sustainable improvement beyond baseline.

It is not a failure if absent unless an approved module contract already requires it.

## 5.2 Requirement status

Each criterion receives exactly one:

```text
PASS
FAIL
PARTIAL
NOT_EVIDENCED
N/A
AUTHORITY_CONFLICT
```

`NOT_EVIDENCED` is not equivalent to PASS.

---

# 6. Agent audit protocol

Every module agent must execute the same protocol.

## Phase A — Authority

Identify:

- module PRD;
- module Architecture Spec;
- module Acceptance Plan if available;
- relevant cross-domain contracts;
- this Backoffice Experience Standard;
- relevant Design Backoffice patterns.

Do not audit from screenshots alone when code/product authority is available.

## Phase B — Surface inventory

List all module surfaces:

- routes;
- tabs;
- list/table views;
- details;
- create/edit forms;
- modals/drawers;
- empty states;
- error states;
- permission variants;
- responsive states;
- entry points from other modules.

## Phase C — Critical jobs

For each surface define:

```text
USER
JOB
INPUT
EXPECTED RESULT
RISK IF WRONG
NEXT LIKELY ACTION
```

## Phase D — Evidence pass

Inspect implemented behavior.

Evidence may include:

- source code;
- route definitions;
- screenshots;
- runtime behavior;
- tests;
- DTOs;
- permissions;
- product docs.

Never invent what the UI “probably” does.

## Phase E — Standard pass

Audit every applicable section of this document.

## Phase F — Findings

Produce evidence-backed findings with:

```text
ID
Severity
Standard section
Surface
Current behavior
Expected behavior
Evidence
Correction
Acceptance test
```

## Phase G — +1 pass

Only after Core Promise / REQUIRED findings are understood.

Identify useful +1 improvements that:

- reduce repetition;
- preserve context;
- clarify next action;
- reduce anxiety;
- improve recovery;
- anticipate a real need.

## Phase H — Module verdict

Return:

```text
READY
READY_AFTER_REQUIRED_FIXES
NOT_READY
BLOCKED_BY_PRODUCT_DECISION
BLOCKED_BY_MISSING_EVIDENCE
```

---

# 7. Universal page anatomy

Every major backoffice page should make five things quickly understandable.

## 7.1 Where am I?

The title/navigation state identifies the module and current sub-surface.

## 7.2 What can I do here?

Primary action is visible without competing with multiple equal-weight CTAs.

## 7.3 What am I looking at?

Data scope is explicit:

- current tenant;
- date range when applicable;
- status/filter;
- location/warehouse if applicable;
- active tab/context.

## 7.4 What needs my attention?

Exceptions are distinguishable from normal information.

## 7.5 What happens next?

Actions and drill-down destinations are predictable.

---

# 8. Information hierarchy

Use three priority levels.

## P0 — Primary job

What the page exists to accomplish.

Must dominate visual hierarchy.

## P1 — Supporting context

Information needed to complete or understand P0.

## P2 — Secondary / occasional

Useful but not allowed to compete constantly with P0.

A common anti-pattern is promoting all available capabilities to P0 because implementation already exists.

---

# 9. Context-preserving navigation

## 9.1 Universal principle

> **If the system already knows the context, the user should not have to reconstruct it.**

Context may include:

- tenant;
- date range;
- entity;
- status;
- search query;
- source;
- severity;
- warehouse/location;
- tab;
- category;
- owner/cashier/user;
- reconciliation state;
- fiscal series;
- return path.

## 9.2 Required behavior

A context-rich interaction should navigate to a context-rich destination.

Bad:

```text
Dashboard
→ “16 productos críticos”
→ Inventory generic list
→ user filters Critical manually
```

Good:

```text
Dashboard
→ “16 productos críticos”
→ Inventory / status=CRITICAL
```

The same rule applies within the rest of the backoffice.

Example:

```text
Product detail
→ “Ver movimientos”
→ Kardex already filtered to that product/material
```

Not:

```text
Product detail
→ Kardex generic
→ search again
```

## 9.3 Contextual links are contracts

Do not expose a deep-link CTA until its destination can consume the context.

## 9.4 URL-first

Meaningful filters should preferably survive:

- refresh;
- back/forward;
- copying a support URL.

Use URL/search params where appropriate.

Do not place all navigation state into invisible transient memory.

---

# 10. Back navigation and task continuity

The user should be able to investigate and return without losing their work.

Preserve when practical:

- list filters;
- search query;
- pagination;
- selected date;
- active tab;
- sort;
- return source.

Example:

```text
Products filtered to category=Café
→ open Espresso
→ edit
→ save
→ back
→ still category=Café
```

Do not reset to the generic first page unless required by changed data validity.

---

# 11. Sidebar and global navigation

Navigation exists to orient, not advertise features.

Requirements:

- active route is unambiguous;
- group labels remain stable;
- modules do not move arbitrarily between sessions;
- badges indicate actionable state, not decoration;
- navigation visibility follows permission;
- hidden permission does not leave dead routes;
- collapsed navigation remains understandable through icon + accessible label;
- module naming matches product language.

Do not create a new label merely because a feature needs visual novelty.

---

# 12. Lists and data tables

Tables are decision tools.

## 12.1 A table must answer

- what objects am I seeing?
- what is their relevant state?
- how do I find one?
- how do I narrow the set?
- what can I do with one?
- what can I do with several?

## 12.2 Columns

Each default column must justify its permanent presence.

Avoid:

- internal IDs when not operationally useful;
- repeated status text;
- low-value metadata crowding primary fields;
- action columns with five icon buttons.

Move secondary data to:

- detail;
- expandable row;
- contextual menu.

## 12.3 Numeric alignment

Financial/numeric tabular values use tabular figures and consistent decimal/currency formatting.

## 12.4 Row click behavior

If row click opens detail:

- cursor/hover state communicates it;
- keyboard activation works;
- inner buttons do not produce ambiguous double navigation.

## 12.5 Row actions

Prefer a small number of direct frequent actions.

Rare actions may live in an overflow menu.

Destructive action must not sit beside frequent safe actions without visual separation.

---

# 13. Search

Search should reflect how the user knows the object.

Examples may include:

- name;
- SKU;
- invoice number;
- customer;
- RUC;
- user;
- product code.

Module authority decides supported fields.

## 13.1 Search rules

- immediate feedback;
- clear empty result;
- preserve query on detail-and-back;
- search term remains visible;
- clearing is easy;
- no invisible “smart” criteria that surprise the user.

## 13.2 No-results vs no-data

These are different.

### No data

> No objects exist.

May need onboarding/create CTA.

### No results

> Objects exist, but filters/search returned none.

Must show:

- active filter/query;
- clear/reset action.

---

# 14. Filters

Filters are part of the user's mental model.

## 14.1 Visible state

The user must know filters are active.

Use:

- chips;
- explicit controls;
- count;
- summary.

## 14.2 Reset

Always offer a predictable way to reset applied filters.

## 14.3 Persistence

Reasonable list filters should survive detail/back navigation.

## 14.4 Deep linking

If another module sends the user with a contextual filter, that filter must be represented visibly.

Do not create “mystery filtering”.

---

# 15. Sorting and pagination

## Sorting

- active sort is visible;
- direction is visible;
- default sort matches primary operational job;
- sort must be deterministic where possible.

## Pagination

Communicate:

> `Mostrando X–Y de Z`

or equivalent.

Do not make the user guess if more data exists.

For changing filters:

- reset pagination when needed;
- do not silently leave the user on an empty high page.

---

# 16. Bulk actions

Bulk actions only appear when selection exists.

Before execution:

- show object count;
- show action;
- show material consequences;
- require confirmation according to risk.

Example:

> `Desactivar 15 productos`

not:

> `Confirmar acción`

After execution communicate:

- succeeded count;
- failed count;
- next action when partial.

Never collapse a partially failed bulk operation into a generic success toast.

---

# 17. Forms — baseline

Forms should reduce uncertainty, not merely collect fields.

## 17.1 Layout

Use:

- single column for simple forms;
- two columns only when relationships remain obvious;
- sections for long forms;
- sticky action footer when the form scrolls materially.

## 17.2 Labels

Labels remain visible.

Do not rely on placeholders as labels.

## 17.3 Required fields

Required/optional behavior is explicit.

Do not surprise on submit with hidden requirements.

## 17.4 Helper text

Helper text exists when it prevents a likely mistake.

Do not explain obvious fields just to fill vertical space.

## 17.5 Governed fields

When the system already maintains a catalog or registry for a value (units of measure, currencies, categories, suppliers), the form must offer the governed selector instead of free text.

Free text for a governed value produces the vocabulary drift the catalog exists to prevent. If the catalog is empty, guide the user to populate it; do not fall back silently to free text.

---

# 18. Form validation

Validation should occur at the right moment.

## 18.1 Field validation

Prefer blur/commit timing when feasible.

Do not flash errors aggressively while the user is still typing.

## 18.2 Error copy

An error should say:

- what is wrong;
- how to correct it.

Avoid:

- `Invalid`;
- `Error`;
- raw backend exception;
- technical DTO property names.

## 18.3 Form-level failures

When submit fails:

- preserve entered data;
- show summary when needed;
- focus/scroll to actionable error;
- distinguish field error from server failure.

## 18.4 Server validation remains authority

Frontend validation improves experience.

It never replaces backend rules.

---

# 19. Form save behavior

The user should always know whether data was saved.

## 19.1 Saving

- disable duplicate submit appropriately;
- preserve button width;
- expose progress without locking unrelated safe context.

## 19.2 Success

Success feedback states what happened.

Prefer:

> `Producto actualizado`

over:

> `Éxito`

## 19.3 Save and continue

Where workflows naturally create repeated records, evaluate a sustainable +1:

- Save;
- Save and create another;

only if it genuinely saves time.

Do not add variants speculatively.

---

# 20. Dirty state / unsaved work

If navigation would discard meaningful edits:

- warn before losing them;
- explain what will be lost;
- offer stay/leave.

Do not prompt when nothing meaningful changed.

If a recoverable server error occurs:

> preserve the form state.

Losing correctly entered work due to a transient error is a NHILOS experience failure.

---

# 21. Create flows

A create page should answer:

- what am I creating?
- what is required?
- what will happen after creation?
- can it affect other areas immediately?
- is it active immediately or draft?

Avoid a form whose lifecycle is only discoverable after submit.

---

# 22. Edit flows

Editing must make scope clear.

Examples:

- editing current product;
- editing future schedule;
- editing draft;
- editing active configuration.

When changes have historical implications:

> explain whether old records are preserved.

Do not imply that editing configuration rewrites historical truth if it does not.

---

# 23. Destructive / high-risk actions

Risk must be proportionate to confirmation.

## 23.1 Destructive confirmation should communicate

- object/action;
- consequence;
- reversibility;
- affected scope.

## 23.2 Do not over-confirm harmless actions

Too many dialogs teach users to click through dialogs without reading.

## 23.3 High-risk labels

Use explicit verbs:

- `Anular factura`
- `Desactivar usuario`
- `Eliminar promoción`

Not:

- `Aceptar`
- `Continuar`

## 23.4 Typed confirmation

Reserve for materially destructive actions where it adds safety.

Do not use theatrical friction for ordinary edits.

---

# 24. Detail screens

A detail page should not be a database dump.

It should prioritize:

1. identity;
2. current state;
3. primary operational facts;
4. relevant related objects;
5. history/audit where appropriate;
6. actions.

## 24.1 Related navigation

Related objects should deep-link with context.

Examples:

```text
Invoice → Customer
Invoice → Payment
Product → Recipe
Product → Inventory/Kardex
Promotion → Included Products
User → Audit activity
```

Only when product authority permits the relationship.

---

# 25. Tabs

Tabs represent stable sibling views of the same context.

Do not use tabs as a way to hide unrelated pages inside one URL.

Requirements:

- active tab is obvious;
- tab state is URL-addressable when useful;
- permission-hidden tabs do not leave unexplained gaps;
- tab labels use user terminology.

---

# 26. Statuses, badges and chips

Statuses must communicate business meaning.

Do not create badge colors for decoration.

A neutral lifecycle state is not an exception: `INACTIVE` styled with danger color misreports a quiet state as a problem.

Each status requires:

- text;
- semantic color if useful;
- consistent vocabulary across modules.

Avoid synonyms for the same lifecycle state.

Example problem:

```text
Active
Enabled
On
Live
```

for the same underlying concept.

Choose one domain-approved term.

## 26.1 Alert variants

Inline alerts and notifications follow the same discipline as badges: each alert carries a semantic variant — success, warning, danger, info — rendered with perceptible visual distinction (tint, border or icon), not default neutral styling.

Match the variant to the message's business meaning, not to styling convenience. An alert whose state cannot be perceived does not communicate state.

---

# 27. State vocabulary

The backoffice should distinguish these concepts consistently:

```text
ACTIVE
INACTIVE
DRAFT
PENDING
PROCESSING
COMPLETE
PARTIAL
UNAVAILABLE
UNKNOWN
FAILED
CANCELED / VOID
```

Only use states that actually belong to the relevant domain.

Never use:

- `COMPLETE` when data truth is not provable;
- `0` as replacement for unavailable;
- `inactive` when the object is actually expired;
- `error` when the state is merely pending.

---

# 28. Loading

Loading should preserve orientation.

## 28.1 Page loading

Prefer skeleton/local loading where the page structure is known.

## 28.2 Partial loading

Do not block the whole page while an independent secondary request is loading.

## 28.3 Refetch

When valid data remains visible:

> show `Actualizando…` or equivalent.

Avoid full-page reset.

## 28.4 Forms

Do not auto-refresh data underneath active edits in a way that destroys work or changes meaning.

---

# 29. Empty states

Every empty state belongs to one of four classes.

## First-use empty

Nothing created yet.

Explain:

- what belongs here;
- why it matters;
- next action.

## Valid empty

Example:

> no voids in period.

Keep it quiet.

No large celebratory illustration.

## Filtered empty

Show active filter and clear action.

## Permission empty

Usually omit inaccessible surfaces instead of rendering empty shells.

---

# 30. Error states

A NHILOS error should attempt to answer:

1. what happened?
2. what does it affect?
3. what is still usable?
4. what can the user do?
5. what will the system do next, if known?

## 30.1 Preserve context

Errors should not unnecessarily clear:

- filters;
- forms;
- selected entity;
- date range;
- safe loaded data.

## 30.2 Retry

Offer retry only when retry can meaningfully help.

## 30.3 Technical detail

Raw IDs/status codes may be available in a support detail area, not as primary user copy.

---

# 31. Success feedback

Success should be calm.

Avoid confetti or oversized success modals for routine operations.

Examples:

> `Promoción guardada`

> `Usuario desactivado`

> `Cambios publicados`

If the next likely action is obvious, provide it.

A success state should not become a dead end.

---

# 32. Toasts

Use toasts for transient confirmation/information.

Do not use toasts for information the user must retain to complete a task.

Errors requiring action should remain visible until resolved/dismissed appropriately.

Do not stack many toasts from one operation.

Aggregate.

---

# 33. Permissions

Permission design has three layers.

## Server

Authoritative enforcement.

## Frontend query/action

Do not request or execute what the user may not access.

## Presentation

Do not tease sensitive information with:

- fake zero;
- blurred value;
- placeholder;
- hidden-by-CSS data.

## 33.1 Permission-aware composition

When a whole component is not useful without permission:

> omit it and reflow.

Do not leave dead empty space.

## 33.2 Disabled vs hidden

Use disabled controls when:

- the action exists in the user's context;
- understanding why it is unavailable is useful.

Use hidden controls when:

- exposing the capability adds no useful context;
- the user is not meant to interact with it at all.

Document significant decisions per module.

---

# 34. Sensitive and financial data

Sensitive business values must remain precise.

Rules:

- consistent currency;
- consistent decimals;
- historical values stay historical;
- amounts do not change due to current config;
- `—` means unavailable/unknown, never zero;
- masked/redacted data is explicit;
- permission restrictions happen before serialization where required.

---

# 35. Freshness / sync / eventually consistent data

Any cloud backoffice view that depends on POS synchronization must not imply certainty beyond evidence.

A module should expose freshness when staleness materially affects decisions.

Examples:

- sales;
- inventory;
- audit;
- reconciliation.

Do not use:

- browser refresh timestamp;
- report generated timestamp;
- last business event;

as a substitute for synchronization completeness.

When partial:

> explain which part is affected.

---

# 36. Long-running operations

For imports, exports, bulk work, production/report generation or other long processes:

- acknowledge start;
- show progress when knowable;
- distinguish queued/running/completed/failed;
- preserve navigation when safe;
- allow the user to return later if architecture supports it;
- provide result/error summary;
- avoid fake progress percentages.

---

# 37. Import / upload experiences

Before commit:

- identify accepted format;
- explain required columns/rules;
- validate without destroying good work;
- distinguish file-level from row-level error;
- preserve actionable error information.

If partial acceptance is product-supported:

> make the accepted/rejected boundary explicit.

Do not make the user re-upload an entire file solely to discover the next error one row at a time.

---

# 38. Dates and time

Date/time display must reflect business meaning.

Requirements:

- use product-authorized timezone;
- clarify selected period;
- include date when a time could refer to another day;
- distinguish created/occurred/effective/updated when materially different;
- avoid ambiguous relative text for auditable history.

Example:

Bad:

> `10:52 p. m.`

when the current report is from another day.

Better:

> `25 sep, 10:52 p. m.`

---

# 39. Microcopy standard

NHILOS backoffice copy is:

- clear;
- direct;
- precise;
- calm;
- minimally ornamental;
- technical only when necessary.

## 39.1 Buttons

Use verbs.

Prefer:

- `Crear producto`
- `Guardar cambios`
- `Revisar vouchers`
- `Ver movimientos`

Avoid generic:

- `OK`
- `Aceptar`
- `Ver`
- `Continuar`

when the destination/action can be named more precisely.

Compact UI may visually show `Ver`, but accessible label and context must be explicit.

## 39.2 Descriptions

Do not explain what the heading already says.

## 39.3 Warnings

State consequence.

Avoid fear language.

## 39.4 Technical terms

Use only when the user benefits.

Do not expose implementation vocabulary because it exists in backend code.

---

# 40. Human defaults

Defaults should save time without creating hidden assumptions.

A good default is:

- common;
- safe;
- understandable;
- reversible when possible.

A dangerous default is:

- destructive;
- silently financial;
- permission-sensitive;
- hidden;
- hard to detect later.

Do not use “smart defaults” where the system cannot explain the inference.

A default must not silently satisfy a required field: when the system pre-fills a required value, the user confirms by omission instead of deciding. Required governance fields should start empty — or demand explicit confirmation — so the decision remains the user's.

---

# 41. Progressive disclosure

Show complexity when the user needs it.

Common pattern:

```text
SUMMARY
→ DETAIL
→ TECHNICAL/AUDIT DEPTH
```

Do not force the most technical representation into the first view.

Also do not hide material limitations behind an advanced section.

---

# 42. Visual restraint

NHILOS POS current visual expression uses:

- Navy;
- Green;
- neutrals;
- Inter;
- clear hierarchy;
- structured layout;
- accessible states.

The Backoffice Experience Standard does not declare these permanent NHILOS corporate tokens.

## 42.1 Color

Color communicates state/priority.

Do not color every metric.

## 42.2 Cards

A card must group a meaningful idea.

Do not card-wrap every field.

## 42.3 Borders

Use for structure.

Avoid creating a page that visually becomes a spreadsheet of boxes unless the content truly is tabular.

## 42.4 Shadows

Use the established backoffice elevation system.

Do not increase shadow/depth to signal “premium”.

## 42.5 Spacing

Use more separation between distinct ideas and tighter grouping inside one idea.

## 42.6 Typography

- hierarchy before decoration;
- numeric values use tabular figures;
- technical IDs may use approved mono style;
- labels remain legible.

---

# 43. “Luxury-by-restraint” filter

Before adding any UI element ask:

> Does this materially improve comprehension, orientation, evidence, action, recovery or memorability?

If no:

> remove it.

Before removing an element ask:

> Does its absence hide a material condition or make the task harder?

If yes:

> keep or redesign it.

Restraint is not minimalism for its own sake.

---

# 44. Animation and motion

Motion is allowed when it:

- explains;
- orients;
- confirms;
- gives subtle tactility.

Motion is not allowed to:

- prove budget;
- manufacture premium perception;
- delay access to content;
- obscure state changes;
- impair reduced-motion users.

Routine CRUD success does not need celebration animation.

---

# 45. Responsive behavior

Backoffice priority:

- desktop;
- tablet;
- mobile read-support.

Mobile does not need parity for complex write workflows unless a module contract specifically requires it.

But mobile/read mode must not be accidentally broken.

Requirements:

- navigation remains usable;
- tables can be understood;
- key data remains visible;
- horizontal scroll is controlled/obvious where required;
- critical actions are not clipped;
- dialogs fit viewport.

---

# 46. Accessibility

Accessibility is part of Cuidado.

Minimum:

- WCAG 2.1 AA;
- visible focus;
- logical keyboard order;
- Escape closes appropriate overlays;
- arrow-key behavior for tabs/menus where expected;
- icon buttons have accessible names;
- errors use `aria-describedby` or equivalent;
- active navigation uses semantic state;
- color is never the only signal;
- reduced motion is respected;
- 200% zoom remains usable.

A screen that looks refined but excludes keyboard/screen-reader usage does not meet the NHILOS standard.

---

# 47. Performance

Performance is perceived quality.

A NHILOS backoffice surface should:

- respond promptly;
- avoid unnecessary full-page loaders;
- load secondary data independently where safe;
- avoid layout shift;
- preserve useful cached state;
- lazy-load heavy secondary capabilities;
- avoid wasteful refetch;
- show progress honestly.

Do not add a +1 whose technical cost makes the core interaction worse.

---

# 48. Consistency

Consistency reduces learning cost.

Audit:

- button labels;
- placement;
- table behavior;
- filters;
- pagination;
- dialog actions;
- date formats;
- currencies;
- status vocabulary;
- catalog-governed fields;
- toasts;
- empty states;
- destructive confirmations;
- breadcrumb/back behavior.

A module may be unique in domain behavior.

It should not be unique in basic interaction behavior without a reason.

---

# 49. NHILOS +1 — universal patterns

A +1 must be:

- useful;
- intentional;
- relevant;
- natural;
- sustainable;
- non-compensatory.

## +1.1 Context travels

Deep links preserve the user's question.

## +1.2 Remembered list state

Detail/back returns to the same meaningful list context.

## +1.3 Prepared defaults

Safe common values are already selected when evidence supports them.

## +1.4 Clear next step

Success/empty/error states point to the next useful action.

## +1.5 Error recovery preserves work

Transient failure does not erase a completed form.

## +1.6 Explain impact

Warnings/errors say what is affected, not only what failed.

## +1.7 Useful preview

Before committing a material action, show its meaningful effect when feasible.

## +1.8 No repeated input

Reuse information already known in the current task.

## +1.9 Contextual creation

Example:

```text
Category detail → Create Product
```

can preselect the category.

## +1.10 Contextual related views

Example:

```text
Product → View Kardex
```

opens that object's movements.

## +1.11 Smart return path

After a deep investigation, returning preserves the original working context.

## +1.12 Useful copy over tooltip dependence

Critical information is visible.

Tooltips enhance; they do not hide necessary instructions.

## +1.13 Quiet healthy states

Normality consumes less attention than exceptions.

## +1.14 Partial success clarity

Bulk/import workflows explain what succeeded and what remains.

## +1.15 Relevant keyboard efficiency

For repetitive expert workflows, add keyboard efficiency only when learnable and documented.

Do not create shortcut complexity for novelty.

---

# 50. Anti-pattern register

## AP-01 — Generic destination

Actionable context routes to an unfiltered generic list.

**FAIL / REQUIRED**

## AP-02 — Unknown as zero

**BLOCKER** when it affects material business interpretation.

## AP-03 — Decoration as perceived value

More visual treatment without more understanding.

**FAIL / REFINEMENT**

## AP-04 — Every section in a card

**FAIL / REFINEMENT**

## AP-05 — Healthy-state noise

Normal statuses compete with actionable exceptions.

**FAIL / REQUIRED** when it impairs decision surfaces.

## AP-06 — Generic copy

`Ver`, `Aceptar`, `Error`, `Procesado`.

**FAIL / REQUIRED or REFINEMENT depending on risk.**

## AP-07 — Reset after detail

User loses list/search/filter context without necessity.

**FAIL / REQUIRED**

## AP-08 — Form data loss after recoverable failure

**BLOCKER** for material workflows.

## AP-09 — Permission by CSS

Sensitive value requested/serialized and merely hidden visually.

**BLOCKER**

## AP-10 — Error as technical code

Raw HTTP/database error as the primary explanation.

**FAIL / REQUIRED**

## AP-11 — Confirmation fatigue

Dialogs for harmless routine changes.

**FAIL / REFINEMENT**

## AP-12 — Destructive ambiguity

Button `Aceptar` performs destructive action.

**BLOCKER / REQUIRED depending on consequence**

## AP-13 — Filter invisibility

Deep-linked filter is active but the user cannot see why the dataset is narrowed.

**FAIL / REQUIRED**

## AP-14 — Table dumping

Every database field becomes a column.

**FAIL / REFINEMENT**

## AP-15 — Feature dumping

Every capability competes at the same hierarchy level.

**FAIL / REQUIRED**

## AP-16 — Fake luxury

Dark/glow/animation/ornament used to manufacture status.

**FAIL / REFINEMENT**

## AP-17 — Disabled dead end

A disabled control gives no explanation when the reason materially matters.

**FAIL / REQUIRED**

## AP-18 — Success dead end

Operation succeeds but user is not guided to likely next step when one is obvious.

**+1 OPPORTUNITY / REQUIRED if workflow cannot continue**

## AP-19 — Hidden side effect

Change impacts other data/workflow but UI does not explain it.

**BLOCKER or REQUIRED**

## AP-20 — Inconsistent vocabulary

Same state/action is called different names across modules without domain reason.

**FAIL / REQUIRED**

---

# 51. Module audit dimensions

Every module audit must cover these dimensions.

| ID | Dimension | Core question |
|---|---|---|
| EX-01 | Core Promise | Does the module reliably perform its primary job? |
| EX-02 | Product Truth | Does UI behavior match PRD/domain semantics? |
| EX-03 | Precision | Can labels/data/actions be misinterpreted? |
| EX-04 | Navigation | Does context travel between relevant surfaces? |
| EX-05 | Findability | Can users find objects through appropriate search/filter/sort? |
| EX-06 | Forms | Are entry/edit flows clear, safe and recoverable? |
| EX-07 | Actions | Are consequences, risk and feedback clear? |
| EX-08 | States | Loading/empty/error/partial/success states are intentional? |
| EX-09 | Permissions | Is authorization correct end-to-end? |
| EX-10 | Time | Are repeated steps/input/context eliminated? |
| EX-11 | Sobriety | Is unnecessary UI removed? |
| EX-12 | Consistency | Does it use established backoffice patterns? |
| EX-13 | Microcopy | Is language precise, calm and actionable? |
| EX-14 | Accessibility | Can the critical workflow be completed accessibly? |
| EX-15 | Responsive | Does supported device behavior remain usable? |
| EX-16 | Performance | Does technical behavior support perceived quality? |
| EX-17 | +1 | Is there a useful sustainable improvement opportunity? |
| EX-18 | Evidence | Can every PASS/FAIL claim be demonstrated? |

---

# 52. Required module audit output

Each agent must produce:

```text
# <MODULE> — NHILOS Experience Audit

Version:
Date:
Auditor:
Module authority:
Routes/surfaces reviewed:
Evidence reviewed:

## 1. Module job
...

## 2. Surface inventory
...

## 3. Experience coverage matrix
EX-01 ... EX-18

## 4. Findings
BX-001 ...
BX-002 ...

## 5. Context/navigation map
source → destination → preserved context

## 6. State coverage
loading / empty / no-results / error / partial / success / permission

## 7. +1 opportunities
...

## 8. Required fixes
...

## 9. Deferred refinements
...

## 10. Acceptance tests
...

## 11. Verdict
READY | READY_AFTER_REQUIRED_FIXES | NOT_READY | BLOCKED...
```

---

# 53. Finding template

```text
ID: BX-###
Severity: BLOCKER | REQUIRED | REFINEMENT | +1 OPPORTUNITY
Status: OPEN
Standard: §<section>
Surface:
Authority:

CURRENT
<what the implementation does>

EXPECTED
<what the standard/product contract requires>

WHY IT MATTERS
<core promise / precision / care / time / sobriety / +1>

EVIDENCE
<file/code/screenshot/runtime/test>

CORRECTION
<bounded recommended change>

ACCEPTANCE
<observable test>

DEPENDENCIES
<if any>
```

---

# 54. Module Definition of Done

A module is **NHILOS Experience Ready** only when:

## Authority

- [ ] Product authority identified.
- [ ] No unresolved product/experience contradiction.
- [ ] Material claims are evidenced.

## Core promise

- [ ] Primary jobs succeed correctly.
- [ ] No BLOCKER remains open.
- [ ] Material partial/unknown states are honest.

## Navigation

- [ ] Important drill-downs preserve context.
- [ ] No generic-list dead ends remain.
- [ ] List/detail/back preserves useful working state.

## Lists/data

- [ ] Search matches user-recognizable identifiers.
- [ ] Filters are visible/resettable.
- [ ] Sorting is understandable.
- [ ] Pagination/count is clear.
- [ ] Table columns are intentional.

## Forms

- [ ] Labels/requirements are clear.
- [ ] Catalog-governed fields use the shared catalog, not free text.
- [ ] Validation is actionable.
- [ ] Server errors preserve work where possible.
- [ ] Dirty-state loss is protected.
- [ ] Save feedback is explicit.

## Actions

- [ ] Primary action is clear.
- [ ] Destructive actions explain consequence.
- [ ] Bulk actions expose count/scope.
- [ ] Success has appropriate next step.
- [ ] No hidden material side effect.

## States

- [ ] Loading state exists.
- [ ] First-use empty state exists where applicable.
- [ ] Filtered no-results differs from no-data.
- [ ] Errors explain impact/recovery.
- [ ] Permission state is intentional.
- [ ] Partial/unavailable/unknown states do not become zero.

## Permissions/security

- [ ] Backend is authoritative.
- [ ] Unauthorized data is not fetched/exposed unnecessarily.
- [ ] UI composition matches permission.
- [ ] Direct URL access remains protected.

## Brand / Luxury

- [ ] No fake-luxury treatment.
- [ ] Visual hierarchy is restrained.
- [ ] Normality is quieter than exceptions.
- [ ] Repetition/friction is deliberately reduced.
- [ ] The page feels prepared rather than decorated.

## +1

- [ ] Core Promise passes before +1 work.
- [ ] At least one meaningful +1 was evaluated.
- [ ] Implemented +1 is useful and sustainable.
- [ ] +1 does not add material friction.

## Accessibility

- [ ] Keyboard critical path passes.
- [ ] Visible focus passes.
- [ ] Interactive icons have accessible names.
- [ ] Errors are programmatically associated.
- [ ] Color is not sole signal.
- [ ] Reduced motion passes.
- [ ] 200% zoom remains usable.

## Responsive/performance

- [ ] Desktop/tablet supported flow passes.
- [ ] Mobile read behavior does not fail accidentally.
- [ ] No unnecessary full-page loading.
- [ ] Secondary failure does not collapse unrelated functionality where architecture permits.
- [ ] Performance does not materially contradict the experience.

## Evidence

- [ ] Every corrected BLOCKER/REQUIRED finding has an acceptance test/evidence receipt.
- [ ] `NOT_EVIDENCED` items are not counted as PASS.
- [ ] Final verdict is explicit.

---

# 55. Whole-backoffice coverage registry

Maintain one registry after individual audits.

Template:

| Module | Audit version | Core Promise | Required fixes | Blockers | +1 reviewed | Final status |
|---|---|---|---:|---:|---|---|
| Dashboard | — | — | — | — | — | — |
| Sales | — | — | — | — | — | — |
| Inventory | — | — | — | — | — | — |
| Fiscal | — | — | — | — | — | — |
| Catalog / Products | — | — | — | — | — | — |
| Promotions | — | — | — | — | — | — |
| Loyalty / Customers | — | — | — | — | — | — |
| Recipes / Production | — | — | — | — | — | — |
| Users / Permissions | — | — | — | — | — | — |
| Settings / Onboarding | — | — | — | — | — | — |
| Other | — | — | — | — | — | — |

The registry is tracking, not authority over module scope.

Only include modules that actually exist in the audited build.

---

# 56. Cross-module consistency pass

After individual module audits pass, run one final backoffice pass.

The goal is to detect problems no isolated module agent can see.

Audit:

- same status named differently;
- same action placed differently;
- inconsistent currencies/dates;
- search behaving differently without reason;
- filter persistence mismatch;
- different destructive confirmation patterns;
- different empty/error copy;
- permission behavior mismatch;
- deep links that fail at module boundaries;
- inconsistent active navigation;
- duplicated capabilities;
- return-path inconsistencies.

A module can pass individually and the backoffice still fail consistency.

---

# 57. Agent guardrails

The audit agent must **not**:

- implement before completing evidence inventory unless explicitly asked;
- invent missing product behavior;
- mark subjective taste as BLOCKER;
- redesign whole modules when a surgical correction solves the issue;
- add new capabilities merely to create a +1;
- change domain rules under an experience justification;
- declare PASS from documentation alone when implementation evidence is required;
- declare a form or consistency PASS without checking whether a shared catalog exists for free-text entry fields;
- remove important information merely to achieve minimalism;
- use competitor behavior as authority over NHILOS product contracts.

The agent should:

- prefer surgical fixes;
- preserve working domain behavior;
- trace every recommendation to Product Truth or this Standard;
- distinguish current defect from optional refinement;
- propose +1 only after baseline is healthy.

---

# 58. Ready-to-use module agent prompt

Use the following prompt for each independent module audit.

```text
You are auditing the NHILOS POS backoffice module: <MODULE>.

AUTHORITIES
1. Read `nhilos_backoffice_experience_standard_v1.0.md` completely.
2. Read the module's approved PRD, Architecture Spec and Acceptance Plan if they exist.
3. Read the relevant current implementation/code and `DESIGN_BACKOFFICE.md`.
4. If authorities conflict, report AUTHORITY_CONFLICT. Do not silently choose or rewrite product semantics.

MISSION
Audit the real current implementation against the NHILOS Backoffice Experience Standard.

This is an evidence pass first.
Do not implement until the audit matrix and findings are complete unless explicitly instructed.

MANDATORY COVERAGE
- inventory all module routes/screens/states;
- identify the module's primary user jobs;
- audit EX-01 through EX-18;
- inspect contextual navigation into and out of the module;
- inspect list/search/filter/sort/pagination behavior;
- inspect create/edit/detail flows;
- inspect loading, empty, no-results, error, partial, permission and success states;
- inspect destructive and bulk actions;
- inspect server-side authorization plus frontend presentation;
- inspect keyboard/focus/accessibility;
- inspect responsive behavior;
- identify unnecessary repetition/noise;
- identify sustainable NHILOS +1 opportunities only after Core Promise review.

FINDINGS
For every issue use:
ID
Severity: BLOCKER | REQUIRED | REFINEMENT | +1 OPPORTUNITY
Standard section
Surface
Current
Expected
Why it matters
Evidence
Correction
Acceptance test
Dependencies

RULES
- NOT_EVIDENCED is not PASS.
- Unknown/partial is never zero.
- Do not create fake-luxury UI.
- Do not use +1 to compensate for broken Core Promise.
- Context known by the system should not be re-entered manually.
- No actionable Dashboard/module link may land on a generic list if a relevant filter/entity context is known.
- Prefer surgical correction over redesign.
- Product truth, security, permissions, fiscal and accounting invariants are never changed for visual convenience.

OUTPUT
Create `<module>_nhilos_experience_audit_v0.1.md` containing:
1. authority/evidence;
2. surface inventory;
3. module jobs;
4. EX-01 → EX-18 matrix;
5. findings;
6. contextual-navigation map;
7. state coverage;
8. +1 opportunities;
9. required fixes;
10. acceptance tests;
11. final verdict.

FINAL VERDICT
READY
READY_AFTER_REQUIRED_FIXES
NOT_READY
BLOCKED_BY_PRODUCT_DECISION
BLOCKED_BY_MISSING_EVIDENCE
```

---

# 59. Backoffice acceptance sequence

Recommended execution:

```text
1. FREEZE MODULE AUTHORITY
        ↓
2. MODULE EXPERIENCE AUDIT
        ↓
3. CORRECT BLOCKERS
        ↓
4. CORRECT REQUIRED FINDINGS
        ↓
5. RE-AUDIT
        ↓
6. APPLY APPROVED +1
        ↓
7. MODULE ACCEPTANCE
        ↓
8. NEXT MODULE
        ↓
9. CROSS-MODULE CONSISTENCY PASS
        ↓
10. FULL BACKOFFICE EXPERIENCE ACCEPTANCE
```

Do not begin by globally restyling the app.

The standard is behavioral before decorative.

---

# 60. Full-backoffice Definition of Done

The complete NHILOS POS backoffice reaches **NHILOS Experience Coverage** when:

- [ ] every production module has an evidence-backed module audit;
- [ ] every audited module identifies its product authority;
- [ ] no open BLOCKER remains;
- [ ] all REQUIRED findings are closed or explicitly deferred by approved authority;
- [ ] contextual navigation works across module boundaries;
- [ ] generic dead-end drill-downs are removed;
- [ ] important list state survives investigation/return;
- [ ] search/filter/table behavior is coherent;
- [ ] form behavior protects user work;
- [ ] destructive actions are proportionately safe;
- [ ] permissions are enforced end-to-end;
- [ ] financial/operational unknowns never appear as valid zeroes;
- [ ] loading/empty/error/partial states are intentional;
- [ ] microcopy is clear, precise and calm;
- [ ] healthy state is quieter than exceptions;
- [ ] visual hierarchy follows restraint rather than feature density;
- [ ] accessibility baseline passes across critical flows;
- [ ] supported responsive behavior is consistent;
- [ ] performance does not materially undermine interaction quality;
- [ ] every module evaluated at least one meaningful +1 opportunity;
- [ ] implemented +1 patterns are useful and sustainable;
- [ ] cross-module consistency pass is complete;
- [ ] final coverage registry contains explicit status for every production module.

---

# 61. North Star

The backoffice should not feel like a collection of modules built at different times.

It should feel like one company thought through the operation.

The user should progressively experience:

```text
I KNOW WHERE I AM
        ↓
I UNDERSTAND WHAT I AM SEEING
        ↓
I KNOW WHAT NEEDS ATTENTION
        ↓
I KNOW WHAT WILL HAPPEN IF I ACT
        ↓
THE SYSTEM REMEMBERS MY CONTEXT
        ↓
I DO NOT REPEAT WORK UNNECESSARILY
        ↓
WHEN SOMETHING FAILS, I CAN RECOVER
        ↓
THE DETAIL FEELS INTENTIONAL
```

That is the standard.

---

# 62. Final operating rule

```text
NO DECORAR PARA PARECER VALIOSOS
            ↓
CUMPLIR LA PROMESA CENTRAL
            ↓
DECIR EXACTAMENTE LO QUE OCURRE
            ↓
CONSERVAR EL CONTEXTO
            ↓
REDUCIR TRABAJO INNECESARIO
            ↓
ANTICIPAR EL SIGUIENTE PASO
            ↓
HACER SILENCIOSO LO NORMAL
            ↓
HACER CLARO LO IMPORTANTE
            ↓
+1 CUANDO APORTA
```

> **NHILOS no hace más para aparentar valor. Hace mejor lo que importa.**
