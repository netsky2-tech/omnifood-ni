# NHILOS POS — Owner Dashboard Experience Standard

**Document:** `owner_dashboard_experience_standard_v1.0.md`  
**Version:** 1.0  
**Status:** APPROVED / AUTHORITATIVE EXPERIENCE LAYER FOR OWNER DASHBOARD V2  
**Date:** 2026-09-26  
**Scope:** Owner Dashboard V2 — visual hierarchy, interaction behavior, contextual navigation, microcopy, empty/partial/error states, progressive disclosure, perceived quality and NHILOS +1.  
**Authority upstream:**  
- `nhilos_brand_experience_principles_v1.0.md`
- `nhilos_website_product_marketing_brief_v1.0.md` as creative/discipline reference only
- `owner_dashboard_v2_prd_v1.0.md`
- `owner_dashboard_v2_architecture_spec_v1.0.md`

**Precedence rule:** Product correctness and architecture invariants win over experience styling. This document may refine **how** Dashboard V2 feels and behaves, but may not redefine KPI formulas, security boundaries, tenant isolation, fiscal semantics, sync truth, permissions or reporting ownership.

---

# 0. Purpose

This document defines how the NHILOS Brand Experience Principles are expressed in the Owner Dashboard.

The goal is not to make the Dashboard look “luxury”.

The goal is to make it feel **considered, precise, calm and intelligently prepared**.

The target perception is:

> **“Aquí pensaron en los detalles.”**

And progressively:

> **“Esto se siente NHILOS.”**

The standard is achieved through:

- correctness before decoration;
- clarity before density;
- context before navigation;
- useful anticipation before extra UI;
- restraint before visual spectacle;
- precise uncertainty instead of false certainty;
- fewer, stronger components;
- direct paths from insight to action;
- microcopy that explains impact;
- consistent behavior across states.

---

# 1. Experience doctrine

## 1.1 Quiet Executive

The Owner Dashboard follows a product-expression principle called:

> **Quiet Executive**

This is an internal design rule, not a public marketing label.

Definition:

> The Dashboard presents the state of the business with calm, precision and enough context to support decisions, without dramatizing, over-explaining or competing for attention.

It must feel:

- confident;
- calm;
- precise;
- attentive;
- sophisticated without ostentation;
- contextual;
- operationally useful.

It must not feel:

- noisy;
- “dashboard-y” for its own sake;
- decorated to appear expensive;
- over-animated;
- full of status cards that merely say everything is normal;
- visually dense without decision value;
- generic SaaS.

---

# 2. Core Promise First

No experience enhancement may compensate for incorrect business information.

Before any NHILOS +1:

```text
1. CUMPLIR
2. VERIFICAR
3. COMUNICAR
4. +1
```

For Owner Dashboard V2, the Core Promise is:

> **Present the owner with trustworthy, understandable and actionable information about the business.**

Therefore the Dashboard is not considered experience-complete while any material issue remains in:

- KPI semantics;
- COGS coverage;
- Gross Margin trust;
- payment settlement arithmetic;
- sync freshness truth;
- tenant isolation;
- permission enforcement;
- fiscal interpretation;
- comparison periods;
- contextual drill-down;
- partial/unknown states.

A polished UI over incorrect or ambiguous data is a **-1**, not luxury.

---

# 3. NHILOS luxury translated to software

NHILOS luxury is expressed through:

- precision;
- care;
- anticipation;
- restraint;
- reliability;
- useful context;
- reduced repetition;
- fewer unnecessary steps;
- explicit uncertainty;
- relevant next actions.

In Owner Dashboard terms, “luxury” means:

### Not repeating context

The owner should not have to:

- remember the selected period;
- reselect the same product;
- reapply the same alert filter;
- re-enter the same tenant context;
- search manually for the item that generated the Dashboard insight.

### Being prepared

When the owner clicks:

`4 productos críticos`

the destination should already know:

- stock status = critical;
- tenant;
- relevant scope;
- return path/context.

### Saying less, but meaning more

A card should not exist solely to confirm a healthy state.

A chart should not exist unless it answers a business question.

A label should not use three words where one exact term is sufficient.

### Never hiding uncertainty

If cost coverage is partial:

> `Margen Bruto —`
>
> `Costos incompletos`

Not:

> `100%`

### Never making the user reconstruct meaning

The system should explain:

- what happened;
- what it affects;
- what the owner can do next.

---

# 4. Dashboard information hierarchy

The Dashboard uses four layers.

## Layer 1 — Executive reality

Purpose:

> Tell the owner what happened.

Includes:

- Net Sales;
- Completed Tickets;
- Average Ticket;
- Gross Margin when authorized and covered;
- conditional fiscal/business KPI;
- comparison context.

## Layer 2 — Explanation

Purpose:

> Explain why the result looks that way.

Includes:

- Sales Trend;
- Sales by Hour;
- Top Products;
- Payment Mix.

## Layer 3 — Attention

Purpose:

> Surface only what needs review.

Includes actionable exceptions only.

Examples:

- critical stock;
- pending reconciliation;
- void activity requiring review;
- fiscal sequence anomaly;
- sync degradation;
- audit warning/critical events.

Healthy rows are omitted.

## Layer 4 — Deeper understanding

Purpose:

> Let the owner move directly into the relevant operational detail.

This is implemented through contextual navigation.

---

# 5. Contextual Navigation Contract

## 5.1 Principle

> **Every “Ver”, row, chart point or alert that implies a destination must carry its context into that destination.**

A Dashboard interaction must never degrade into:

```text
Dashboard
→ generic list
→ user selects filter
→ user selects date
→ user searches item
→ user reconstructs original question
```

The intended flow is:

```text
Dashboard insight
→ contextual destination
→ relevant data already filtered
```

## 5.2 Required navigation context

When relevant, navigation must preserve:

```text
tenant
date range
comparison range
entity id
entity type
status/filter
source widget
severity
currency context
operation profile
return path
```

Not every destination needs every field.

Only carry context that materially reduces work.

## 5.3 Canonical contextual navigation model

Frontend navigation should support a typed context shape equivalent to:

```ts
type DashboardNavigationContext = {
  source: 'dashboard';
  sourceWidget:
    | 'attention'
    | 'top-products'
    | 'payment-mix'
    | 'sales-trend'
    | 'hourly-sales'
    | 'profitability'
    | 'kpi';

  startDate?: string;
  endDate?: string;

  entityType?: 'product' | 'payment' | 'invoice' | 'inventory-item';
  entityId?: string;

  filters?: Record<string, string | string[]>;
  severity?: 'CRITICAL' | 'WARNING' | 'INFO';

  returnTo?: string;
};
```

The exact technical representation may be URL search params, typed router state or a hybrid, but the behavior is mandatory.

## 5.4 URL-first rule

Where the destination state is:

- shareable;
- bookmarkable;
- supportable;
- meaningful after refresh;

prefer URL search params.

Example:

```text
/inventory?status=CRITICAL&source=dashboard
```

rather than hidden ephemeral state.

## 5.5 No dead-end navigation

If a destination cannot accept the relevant filter yet:

- implement the filter contract before exposing the Dashboard “Ver” interaction;
- or disable/defer the interaction.

Do not ship a button that knowingly routes to an unfiltered generic page.

---

# 6. Canonical drill-down behavior

| Dashboard origin | Destination behavior |
|---|---|
| `Stock crítico · 16` | Inventory opens filtered to `CRITICAL`; same tenant; relevant location/warehouse if known |
| `Voucher pendiente · C$X` | Reconciliation opens filtered to pending items |
| `4 anulaciones` | Fiscal/Voids opens in selected Dashboard period |
| Fiscal sequence anomaly | Sequence Audit opens with the relevant anomaly/range |
| Audit warning/critical | Audit opens filtered by severity and selected period |
| Top Product row | Product/Sales performance opens with product + selected period |
| Sales Trend point | Sales detail opens around selected date/bucket |
| Hourly Sales bar | Sales detail opens with hour bucket + selected period |
| Payment method | Payment detail opens filtered to method + period |
| COGS / Merma | Inventory report opens to corresponding report + period |
| Sync partial/stale | Sync diagnostic surface opens with affected stream/device when available |

---

# 7. Button and action language

## 7.1 Avoid generic actions when context can be explicit

Avoid:

- `Ver`
- `Más`
- `Detalles`

when a precise label is practical.

Prefer:

- `Ver productos`
- `Revisar vouchers`
- `Ver anulaciones`
- `Revisar secuencia`
- `Abrir inventario`
- `Ver movimientos`

When space requires a compact `Ver`, accessible name/aria-label must still be explicit.

## 7.2 Action rule

An action label must describe:

> **what the user will see next**

not merely that navigation will occur.

---

# 8. Attention Required

## 8.1 Semantics

`Atención requerida` contains **actionable exceptions only**.

It is not a system health checklist.

Do not render:

- `✓ Secuencia sin gaps`;
- audit INFO-only rows;
- `✓ Sin vouchers pendientes`;
- `✓ Inventario normal`;
- other healthy-state confirmations.

## 8.2 Rendering rule

Show a row only when:

```text
there is something material to inspect
```

Examples:

- stock critical > 0;
- pending voucher count > 0;
- void count/amount meets display rule;
- sequence has gaps/duplicates;
- audit critical > 0;
- audit warning > 0;
- sync stale/partial/unknown.

## 8.3 Empty panel behavior

If no attention item exists:

> **Do not render the panel by default.**

The layout reflows.

The recovered space may expand:

- Sales Trend;
- profitability;
- another meaningful analytical block.

Do not replace the panel with a large celebratory “Todo bien” card.

A small health confirmation may exist in contextual chrome if needed, but it must not consume executive space.

## 8.4 Scope labeling

Attention items must distinguish:

### Current state

Examples:

- stock;
- pending reconciliation;
- sync status.

### Selected period

Examples:

- voids;
- audit events;
- fiscal sequence report when period-bound.

The owner must never infer that a current outstanding issue belongs to the selected reporting range when it does not.

---

# 9. Freshness as care

Freshness is a trust surface.

It must explain business impact, not internal infrastructure.

Avoid:

> `Inventory stream PARTIAL`

Prefer:

> **Información parcial**
>
> Ventas actualizadas. Costos pendientes de sincronización.

## 9.1 COMPLETE

Example:

> `Datos completos hasta 5:18 p. m.`

## 9.2 STALE

Example:

> `Sincronización demorada`
>
> `Datos completos hasta 4:51 p. m.`

If the timestamp is from another day, include the date.

## 9.3 PARTIAL

Example:

> `Información parcial`
>
> `Ventas actualizadas · Costos pendientes`

Dependent metrics:

- remain `—`;
- explain why;
- never become zero.

## 9.4 UNKNOWN

Example:

> `No se puede verificar la completitud de los datos`

Do not use:

- `generatedAt`;
- last sale time;
- browser refresh time;

as substitutes for completeness.

---

# 10. Human comparison language

Comparison text should minimize interpretation effort.

Avoid:

> `vs periodo anterior`

when a better phrase is available.

Prefer:

- `vs sábado anterior`
- `vs ayer`
- `vs 7 días anteriores`
- `vs mismo período del mes anterior`

The arithmetic remains authoritative.

The copy simply exposes the actual comparison rule.

## 10.1 Zero baseline

When there is no comparable denominator:

> `Sin base comparable`

Never:

- infinite growth;
- `+100%` by convenience;
- misleading green celebration.

---

# 11. KPI card standard

A strong KPI card contains only useful hierarchy.

Example:

```text
MARGEN BRUTO

61.4%
C$29,780

↑ 1.9 pp
vs sábado anterior
```

Not every KPI needs every line.

## 11.1 Required hierarchy

1. label;
2. current value;
3. supporting monetary/count value only when it adds meaning;
4. comparison;
5. short contextual state if needed.

## 11.2 Card restraint

Do not add:

- decorative icons without semantic use;
- excessive badges;
- explanatory paragraphs;
- redundant units;
- miniature labels repeating the title.

## 11.3 Zero vs unknown

Valid zero:

`C$0.00`

Unknown/unavailable:

`—`

These are never interchangeable.

---

# 12. Permission-aware composition

Unauthorized information is:

- not queried;
- not calculated;
- not hinted through a fake zero;
- not represented by a placeholder-heavy card.

Example:

Without `INVENTORY_COST_VIEW`:

- no Gross Margin KPI;
- no Operational Profitability card;
- no COGS query;
- no cost-sensitive values.

The layout reflows.

Do not render:

> `Rentabilidad Operativa`
>
> `Sin permiso`

unless a future explicit product requirement calls for permission education.

---

# 13. Coverage-aware financial presentation

Financial values must express trust separately from amount.

For COGS:

```text
amount != coverage
```

Rules:

### COMPLETE

Show values normally.

`COGS = C$0.00` may be real.

### PARTIAL

Show:

`—`

with concise state:

> `Costos incompletos`

### UNAVAILABLE

Show:

`—`

with:

> `Costo de ventas no disponible`

Never infer:

```text
salesCogsNio === 0
→ no data
```

and never infer:

```text
missing data
→ 0
```

---

# 14. Operational Profitability block

When authorized and covered, show:

```text
Rentabilidad operativa

Ventas netas        C$…
Costo de ventas     C$…
Margen bruto        C$…
Margen bruto        …%
Merma               C$…
```

## 14.1 Purpose

This block answers:

> “Después del costo directo de lo vendido, ¿qué margen operativo bruto produjo este período?”

It does not claim:

- Net Profit;
- EBITDA;
- full expense profitability.

## 14.2 Permission rule

Render the full block only when the user has cost permission.

No partial shell.

## 14.3 Coverage rule

Gross Margin is only authoritative when COGS coverage is COMPLETE.

---

# 15. Charts

Charts are explanatory surfaces, not decoration.

## 15.1 Sales Trend

Must answer:

> “¿Cómo se movieron las ventas durante el período?”

Requirements:

- clear currency axis;
- current period;
- comparison context where available;
- accessible summary;
- useful tooltip;
- no meaningless zero line when no sales.

## 15.2 Sales by Hour

Must answer:

> “¿En qué horas ocurrió la demanda?”

Clicking/tapping a bar should carry that hour context into Sales detail when supported.

## 15.3 Top Products

Must answer:

> “¿Qué productos explican el resultado?”

Share is calculated against total Dashboard Net Sales for the selected period, not merely the Top-N subtotal.

Each row should be actionable when a meaningful product detail destination exists.

## 15.4 Payment Mix

Must answer:

> “¿Cómo se cobró?”

It is a settlement view.

It must use net-collected values and never raw cash tender before change.

---

# 16. Empty states

Empty does not mean broken.

## No sales

Use:

> `No hay ventas en este período.`

Do not render empty decorative charts.

## No comparison history

Use:

> `Aún no hay historial suficiente para comparar este período.`

## No Attention Required

Hide the panel.

## No authorized cost access

Omit cost-sensitive surfaces.

## No tip coverage

Do not show `C$0.00` as historical tip truth.

---

# 17. Error states

A good error state answers:

1. what happened;
2. what is affected;
3. what remains usable;
4. what the user can do;
5. what the system will do if relevant.

Example:

> **No pudimos cargar costos**
>
> Tus ventas siguen disponibles. Margen Bruto se mostrará cuando Inventario responda.
>
> `Reintentar`

Avoid:

> `Error 500`

unless surfaced in technical support detail.

---

# 18. Progressive disclosure

The Dashboard should reveal complexity only when needed.

Do not place every available metric in the executive surface.

Use:

- tooltip;
- secondary line;
- drill-down;
- destination report;
- expandable context where justified.

The executive page should answer the first question.

Specialized modules answer the next five.

---

# 19. Visual restraint

Current NHILOS POS product expression remains based on:

- Navy;
- Green;
- neutrals;
- Inter;
- clarity;
- structure;
- accessibility.

This document does not redefine the future NHILOS masterbrand identity.

## 19.1 Navy

Use for:

- navigation;
- primary quantitative series;
- key headings;
- active structural state.

## 19.2 Green

Use semantically.

Do not paint every positive number green.

Use for:

- positive movement where useful;
- success/current state;
- selected/active accents;
- actions where green is already part of product expression.

## 19.3 Warning / destructive

Reserve for real caution/risk.

Do not dramatize neutral negative comparisons as incidents.

## 19.4 Borders

Use borders to structure.

Reduce unnecessary visual boxing.

Not every number needs its own container.

## 19.5 Space

Use more space **between ideas**.

Use tighter relationships **within an idea**.

Avoid evenly distributing whitespace in a way that weakens hierarchy.

---

# 20. Motion

Motion exists to:

- orient;
- explain;
- confirm;
- support tactility.

Allowed:

- subtle number/state transitions;
- chart reveal;
- panel reflow;
- hover/focus feedback;
- loading transitions.

Avoid:

- celebratory KPI animations;
- parallax;
- delayed text;
- animated decoration;
- motion that slows decision making.

Respect `prefers-reduced-motion`.

---

# 21. Accessibility

Luxury never comes at the cost of usability.

Dashboard must preserve:

- WCAG 2.1 AA baseline;
- keyboard navigation;
- visible focus;
- non-color severity cues;
- accessible chart alternatives;
- reduced motion;
- 200% text scaling;
- clear aria labels for compact action buttons;
- semantic headings;
- readable contrast.

A visually elegant inaccessible surface fails the NHILOS standard.

---

# 22. Performance as perceived quality

A high-value Dashboard:

- loads quickly;
- does not jump;
- does not block all content because one widget failed;
- does not refetch everything unnecessarily;
- maintains useful prior data during safe refetch;
- makes updating state visible;
- does not ship heavy decoration into the initial bundle.

Performance is part of care.

---

# 23. NHILOS +1 system for Owner Dashboard

## +1.1 — Context travels

The destination remembers what the owner was investigating.

## +1.2 — Human comparison

The Dashboard names the real comparison, not “periodo anterior”.

## +1.3 — Freshness explains impact

The owner sees which business information is trustworthy.

## +1.4 — The Dashboard knows when to be quiet

Healthy exception panels disappear.

## +1.5 — No dead-end insight

Every actionable alert routes to a usable destination.

## +1.6 — Meaningful zero

The system distinguishes:

- zero;
- unavailable;
- unauthorized;
- partial;
- unknown.

## +1.7 — Return context

When the user drills down and comes back, preserve:

- Dashboard date range;
- scroll/section where practical;
- filters if they matter.

## +1.8 — Useful tooltips, not glossary dumps

A tooltip answers one likely question.

It does not become a documentation page.

## +1.9 — Permission-aware elegance

The UI reorganizes gracefully around what the user is allowed to see.

## +1.10 — Errors preserve work

Date selection, context and visible valid widgets remain available even if one domain fails.

---

# 24. Anti-pattern register

## AP-01 — Generic list after actionable Dashboard click

**Prohibited.**

## AP-02 — Healthy rows in Attention Required

**Prohibited.**

## AP-03 — Unknown rendered as zero

**Prohibited.**

## AP-04 — Full-page failure because one widget failed

**Prohibited.**

## AP-05 — Repeating the same KPI in multiple lower cards without new meaning

**Prohibited.**

## AP-06 — Decorative status cards

**Prohibited.**

## AP-07 — Buttons labeled `Ver` that lose source context

**Prohibited.**

## AP-08 — Permission placeholders filling layout space

**Avoid by default.**

## AP-09 — Technical sync language in owner-facing copy

**Avoid unless diagnostic detail is explicitly opened.**

## AP-10 — Charts without a decision question

**Prohibited.**

## AP-11 — Animation used to create perceived quality

**Prohibited.**

## AP-12 — Color as sole signal

**Prohibited.**

## AP-13 — “Luxury” styling

Black/gold, serif-for-status, glassmorphism, dramatic slow animation or ornamental effects used to signal value are **not NHILOS luxury**.

---

# 25. Contextual-navigation acceptance scenarios

## CN-01 — Critical stock

Given:

- Dashboard shows `Stock crítico · 16`.

When:

- owner selects `Ver productos`.

Then:

- Inventory opens;
- critical filter already active;
- correct tenant context;
- no manual re-filtering required.

## CN-02 — Voids

Given:

- selected Dashboard period = Sep 1–26;
- Attention shows 4 voids.

When:

- owner opens the item.

Then:

- Fiscal/Voids opens;
- Sep 1–26 preserved;
- void filter already active.

## CN-03 — Top Product

Given:

- Top Products shows Espresso.

When:

- owner selects Espresso.

Then:

- product/performance detail opens;
- Espresso context is preserved;
- selected Dashboard period is preserved.

## CN-04 — Payment method

Given:

- owner selects Card in Payment Mix.

Then:

- payment detail opens filtered to Card;
- selected reporting period is preserved.

## CN-05 — Sync issue

Given:

- Inventory freshness is PARTIAL.

When:

- owner opens sync detail.

Then:

- diagnostic surface identifies Inventory dependency;
- no need to manually identify the affected stream/device.

---

# 26. Visual/behavior acceptance scenarios

## UX-01 — No attention items

Given no exceptions:

- Attention Required is not rendered;
- adjacent content expands/reflows;
- no large “everything OK” card.

## UX-02 — Manager without cost permission

Given no cost grant:

- Gross Margin KPI omitted;
- Operational Profitability omitted;
- no COGS request;
- layout reflows.

## UX-03 — Partial COGS coverage

Given `inventoryCoverage = PARTIAL`:

- Gross Margin shows `—`;
- concise explanation appears;
- Sales remains available.

## UX-04 — Quiet store

Given no sales for 30 minutes but current sync checkpoint:

- freshness remains COMPLETE/current;
- no stale warning caused by inactivity.

## UX-05 — Widget failure

Given Top Products fails:

- Sales KPIs remain usable;
- Top Products shows local recovery state;
- no page-level crash.

## UX-06 — Cash over-tender

Given sale = C$200, tender = C$500, change = C$300:

- Payment Mix shows C$200 net collected;
- not C$500.

## UX-07 — Zero-ticket period

- Net Sales = C$0.00;
- Tickets = 0;
- Average Ticket = `—`;
- no fake trend;
- relevant current-state alerts remain visible.

---

# 27. Implementation rules

## 27.1 No experience fork

Do not create separate Dashboard applications for:

- Owner;
- Manager;
- Restaurant;
- QSR.

Use one compositional system.

## 27.2 No duplicate domain logic

Experience components consume product/domain contracts.

They do not reimplement:

- fiscal rules;
- cost coverage truth;
- sync truth;
- payment arithmetic;
- authorization rules.

## 27.3 One contextual-navigation utility

Use one shared helper/contract for Dashboard drill-downs.

Do not handcraft query strings independently in every card.

## 27.4 One comparison-language utility

Human-readable comparison labels are centralized.

## 27.5 One presentation-state vocabulary

Use consistent terms for:

- complete;
- partial;
- unavailable;
- unknown;
- updating;
- unauthorized.

---

# 28. Definition of Done — NHILOS Owner Dashboard Experience

Dashboard V2 does **not** meet this experience standard until all applicable items below pass.

## A. Core Promise

- [ ] KPI values reconcile with authoritative fixtures.
- [ ] Net Sales semantics are consistent across KPI, trend, hourly and Top Products.
- [ ] Gross Margin never converts missing/partial COGS into zero.
- [ ] Payment Mix uses net-collected settlement semantics.
- [ ] Freshness does not use `generatedAt` as sync truth.
- [ ] Permission restrictions are enforced server-side.
- [ ] Unknown/partial states never masquerade as valid zeroes.

## B. Contextual Navigation

- [ ] Every Dashboard `Ver`/row/action has a defined destination.
- [ ] Relevant date range is preserved.
- [ ] Relevant entity context is preserved.
- [ ] Relevant filter/status is pre-applied.
- [ ] No actionable card lands on an unfiltered generic list.
- [ ] Browser refresh preserves URL-addressable drill-down state where appropriate.
- [ ] Back navigation does not unnecessarily destroy Dashboard context.

## C. Attention Required

- [ ] Only actionable exceptions are rendered.
- [ ] Healthy fiscal sequence is omitted.
- [ ] INFO-only Audit is omitted.
- [ ] Panel hides when there are no items.
- [ ] Current-state vs selected-period scope is understandable.
- [ ] Every item has a contextual drill-down.

## D. Cards & hierarchy

- [ ] Maximum executive density remains intentional.
- [ ] No card exists solely to fill grid space.
- [ ] Unknown is `—`, not `0`.
- [ ] Redundant lower summary cards are removed or replaced with decision-useful information.
- [ ] Cost-sensitive cards disappear cleanly when unauthorized.
- [ ] Layout reflows without visible holes.

## E. Microcopy

- [ ] Comparison labels name the real comparison when practical.
- [ ] Freshness copy explains business impact.
- [ ] Error copy explains what remains usable.
- [ ] Generic `Ver` labels are replaced or receive explicit accessible names.
- [ ] Technical language appears only where necessary.

## F. Charts

- [ ] Each chart answers a business question.
- [ ] Currency/count axes are explicit.
- [ ] Tooltips are useful and concise.
- [ ] Empty charts become empty states.
- [ ] Charts have accessible textual alternatives.
- [ ] Actionable chart elements preserve drill-down context.

## G. NHILOS +1

- [ ] At least one useful +1 exists in every major Dashboard interaction path.
- [ ] +1 never introduces extra friction.
- [ ] +1 is sustainable.
- [ ] +1 does not compensate for a broken core behavior.
- [ ] Context preservation is implemented as a systemic pattern, not isolated exceptions.

## H. Visual restraint

- [ ] No unnecessary decorative cards.
- [ ] No ornamental motion.
- [ ] Green/red remain semantic.
- [ ] Spacing groups ideas clearly.
- [ ] Borders do not dominate hierarchy.
- [ ] Product feels calm rather than empty.
- [ ] No “luxury” visual cliché is used to manufacture perceived value.

## I. Accessibility

- [ ] Keyboard path is complete.
- [ ] Focus is visible.
- [ ] Color is not the only state signal.
- [ ] `prefers-reduced-motion` is respected.
- [ ] Charts/actions expose accessible labels.
- [ ] Text scaling remains usable.
- [ ] WCAG 2.1 AA baseline passes.

## J. Performance / resilience

- [ ] One widget failure does not crash Dashboard.
- [ ] Valid prior data may remain during safe refetch.
- [ ] `Actualizando…` is visible when appropriate.
- [ ] No unnecessary blocking page loader is introduced.
- [ ] Charting remains lazy-loaded where practical.
- [ ] Dashboard remains usable under partial domain degradation.

---

# 29. Experience review before release

Before accepting any major Dashboard change, answer:

### Claridad
¿Se entiende inmediatamente?

### Precisión
¿Puede interpretarse de otra manera?

### Cuidado
¿Anticipamos lo siguiente que la persona necesita?

### Tiempo
¿Estamos haciendo repetir una acción o contexto?

### Consistencia
¿Se siente como NHILOS POS?

### Sobriedad
¿Qué podemos quitar?

### Core Promise
¿La información es realmente confiable?

### +1
¿Existe un detalle útil adicional?

### Sostenibilidad
¿Podemos mantener este comportamiento?

### Accessibility
¿La experiencia funciona para más personas?

### Performance
¿La implementación técnica está a la altura del cuidado visual?

If the answer to **Precisión**, **Core Promise** or **Sostenibilidad** is materially negative:

> **Do not ship.**

---

# 30. North Star

The Owner Dashboard should not make the owner think:

> “Tiene muchas métricas.”

It should make the owner think:

> **“Entiendo cómo está mi negocio.”**

Then:

> **“Sé qué necesita atención.”**

And when they choose to investigate:

> **“Ya me llevó exactamente a donde tenía que ir.”**

That is the Owner Dashboard expression of NHILOS.

---

# 31. Final rule

```text
NO DECORAR PARA PARECER VALIOSOS
            ↓
HACER CORRECTO LO ESENCIAL
            ↓
MOSTRAR SOLO LO QUE IMPORTA
            ↓
CONSERVAR EL CONTEXTO
            ↓
ANTICIPAR EL SIGUIENTE PASO
            ↓
EXPLICAR LA INCERTIDUMBRE
            ↓
ELIMINAR FRICCIÓN
            ↓
+1 CUANDO APORTA
```

> **NHILOS no hace más para aparentar valor. Hace mejor lo que importa.**
