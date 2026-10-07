# ODD Task: Modifier Ops Center (dashboard hardening)

**Feature**: `modifier-ops-center`
**Origin**: User field report (2026-10-06) after the extras/modifier-groups release:
the dashboard «Modificadores» screen is going to be the operations center for
attaching extras to sales, and it has real gaps.

## User-reported defects (verbatim intents)

1. No search on the groups list.
2. The "Por producto" tab does not visibly filter products.
3. Deactivating a modifier makes it disappear with no way to bring it back.
4. Unclear how extras relate to recipes/insumos (answered: they do not yet —
   see Backlog below).

## Diagnosed root causes (evidence)

- `apps/owner_dashboard/src/features/modifiers/modifiers-page.tsx` (`GroupsTab`):
  renders the full table, no search input; backend `GET /modifier-groups`
  supports only `category_id` / `product_id` filters.
- `product-exceptions.tsx`: the search filters `<option>` entries of a collapsed
  native `<select>` — the filtered result is invisible, and the right panel keeps
  showing the previously selected product. Test `modifiers-tabs.test.tsx:402`
  proves filtering works on options only.
- Soft-delete doctrine: `modifiers.service.ts` `removeGroup`/`removeOption` set
  `is_active = false` (junction rows intentionally preserved). `findAll` uses
  `findActiveGroupsWithOptions` (`is_active: true`), so deactivated rows are
  unreachable from the UI. Reactivation IS supported by `PATCH is_active=true`
  (`updateGroup`, spec at `modifiers.service.spec.ts:438`) but there is no entry
  point. The deactivate dialog promises reactivation ("Podrá activarlo
  nuevamente") — currently a broken promise.
- Catalog precedent for the status filter: `catalog.service.ts` `list(...,
  includeInactive)` (`is_active` where-clause) — same shape to follow.
- `modifier_group.entity.ts`: no `status` enum; soft-delete is `is_active` only.

## Plan (TDD units, direct-to-main, RDD receipt per unit)

- **U1 — Backend `GET /modifier-groups`: `include_inactive` filter**
  - `status=active|inactive|all` (default `active`, backward compatible) on
    groups list + effective stays active-only. Service + controller + options
    of listed groups follow the same predicate. Tests first (jest spec).
- **U2 — Reactivation in the dashboard (groups and options)**
  - api client param; hook `useModifierGroups({status})`; status segmented
    control in Grupos; row actions Activar/Desactivar with Spanish business
    copy; options inside the edit form get the same treatment where cheap.
  - Component tests (`modifiers-page.test.tsx`, `modifier-group-form.test.tsx`).
- **U3 — Search + visible product list**
  - Grupos: client-side name search box (matches backend-independent filter).
  - Por producto: replace the collapsed-select filtering with a visible filtered
    list (search → list rows → click selects product and loads effective groups).
- **U4 — Ops-center gaps sweep (user mandate: "si detectas algún gap, agregalo")**
  - Surfaced during U1–U3 implementation; append each as its own entry here
    before fixing, with evidence (`file:line`).
  - Candidate already visible: the `Nuevos grupos` button loses its row when the
    right panel is empty; the deactivate confirmation is the same wording for
    already-inactive rows (U2 fixes both).

## Mandates

- Test-first per unit (RED observed, then GREEN), English identifiers/comments,
  Spanish business copy, no internal refs in user-facing UI.
- One RDD receipt per unit, burned before its commit.
- User's product decision for soft-delete visibility: inactive rows must remain
  reachable and restorable, never hard-deleted (DGI-style history discipline).

## Backlog (separate issue, not this feature)

- **Extras → insumos/recetas**: `ModifierOption` has only `price_delta`; recipes
  attach exclusively to products (`Recipe.productId` → `RecipeDetail.insumo_id`).
  Future feature: optional insumo linkage per extra with stock deduction at sale
  (schema + sync + inventory). Filed as #793, then closed as duplicate of #527
  ("cannot consume inventory" clause) after the duplicate sweep; fresh evidence
  and the scoped acceptance criteria were folded into a comment on #527.
  Prerequisite recorded there: #786 (cursor re-emission) must ship before any
  modifier payload field reaches devices.

## Execution log

- U1 dispatched to `gentle-ai-worker` (task `muxd7v23-2-emhh`) with surfaces:
  `modifiers.service.ts` + spec, `modifiers.controller.ts` + spec. Contract:
  `status=active|inactive|all` (default active = unchanged POS contract;
  inactive/all return options regardless of their `is_active`).
