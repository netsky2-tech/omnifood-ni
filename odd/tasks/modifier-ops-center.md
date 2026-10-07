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
- U1 VERIFIED independently (git diff 168+/11-, jest `src/modules/modifiers`
  88/88 re-run by orchestrator, callers of the renamed private checked — only
  `findAll` uses it, `effective` path untouched) → commit `beb3383e` → RDD
  lineage `review-6864344615b2a78f` (medium, 261 lines, budget 131):
  capture failed twice (`length` real run, `stop` at 992ms replay), third
  attempt APPROVED (lens review-reliability, 1110B verdict) → burne con
  `acknowledge-approved` (consumed `1640d58d…`).
  - Facade quirk recorded: an explicit `baseRef` must be the FULL COMMIT id
    (`da78d3adbf…`), never the projected base-tree (`08746ce1…` is a tree and
    START rejects it as `base-ref-unresolvable`).
- U2 dispatched (`muxdnc0t-3-y1th`): status control Activos/Inactivos/Todos,
  activate actions for groups (list) and options (form), api/hook `status`
  param, component tests. Backend needs nothing more: PATCH group lookup is
  active-agnostic (reactivation works), option PATCH only requires the parent
  group to be active.

### U4 gaps sweep findings (read-only, no code touched)

1. **POS device side is clean** for deactivation semantics:
   `modifier_resolution_service.dart:24-25,51,79` fail-closes on
   `isActive` for both groups and options — mirrors only ever contain active
   rows (U1 default keeps the sync contract byte-identical).
2. **Name collision with soft-deleted rows is BY DESIGN and correct**:
   `uq_modifier_groups_tenant_name UNIQUE (tenant_id, name)` + service-side
   `assertGroupNameAvailable` (no is_active filter) → creating a group whose
   name belongs to a deactivated one is a 409, not a 500. The dashboard's
   `describeModifierError` already maps 409 to a Spanish message. UX follow-up
   (folded into U2/U3 copy): when a create/edit fails with a name conflict,
   hint that the name may belong to a deactivated group and point at the
   «Inactivos» view. No backend change.
3. Deactivate dialog already promises reactivation — U2 makes it true; dialog
   copy stays as is.
- U2 DELIVERED by worker `muxdnc0t-3-y1th` (verified by orchestrator, not
  trusted from the report): RED 22F/17P → GREEN 39/39 focused vitest, plus
  `modifiers-tabs.test.tsx` 10/10 untouched (its auto-mock of ./use-modifiers
  never mounts inactive rows — noted as a future-test risk), `tsc --noEmit`
  exit 0. Diff confined to the 6 allowed surfaces (+434/−29).
  - API: `ModifierGroupStatus`, `reactivateModifierGroup/Option` (PATCH
    `{is_active:true}`). Hook: `useModifierGroups(status?)` — default key
    byte-identical to legacy `["modifiers", tenantId]`; inactive/all extend
    the key under the same invalidation prefix. Groups tab: Activos/
    Inactivos/Todos segmented control (aria), «Desactivado» badge,
    confirm-guarded Power action, toasts «Grupo activado»/«Error al activar».
    Form: «Desactivada» + per-option «Activar» fully decoupled from the
    save/reconciliation flow.
  - Deliberately untouched: desactivar flow/copy for active rows; inactive
    rows expose only Activar (no edit — not requested; no re-deactivate —
    meaningless); `types.ts` not modified (local type widening instead).
- U3 DELIVERED by worker `muxga3pv-1-q2oq` (verified by orchestrator): RED
  13F/34P → GREEN 47/47 focused vitest re-run + `tsc --noEmit` exit 0.
  Diff confined to the 4 allowed surfaces (+182/−28).
  - Grupos: «Buscar grupo» input composes client-side ON TOP of the status
    list (status stays API-level); distinct filtered-no-results empty state
    («No hay grupos que coincidan…») — empty-API state branch wins when both
    apply.
  - Por producto: collapsed native <select> replaced by a visible scrollable
    listbox of <button> rows (aria-selected + accent, «No se encontraron
    productos.» empty state); keyboard access rides native button
    focusability; effective-groups panel behavior untouched.
  - Converted the pre-existing «filters the product selector» test from
    <option> assertions to visible-row assertions (it had only ever proven
    option-level filtering — the invisibility defect).
