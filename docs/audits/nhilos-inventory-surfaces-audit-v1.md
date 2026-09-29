# Inventory Dashboard Surfaces — NHILOS Experience Audit

**Version:** 1.0
**Date:** 2026-09-29
**Auditor:** el Gentleman (audit-only pass, no code changes)
**Module:** Inventory dashboard surfaces (Insumos management, Compras history) + Settings menu-import wizard
**Module authority:** `odd/tasks/soho-catalog-dashboard-management.md`; `docs/nhilos/nhilos_backoffice_experience_standard_v1.0.md`; backend route contracts `apps/admin_backend/src/modules/inventory/insumo.controller.ts`, `apps/admin_backend/src/modules/inventory/inventory-purchase.service.ts` (via `inventory-movement.controller.ts`), `apps/admin_backend/src/modules/onboarding/services/menu-import.service.ts`, `apps/admin_backend/src/modules/onboarding/controllers/menu-import.controller.ts`
**Routes/surfaces reviewed:**
- `apps/owner_dashboard/src/features/inventory/insumos-tab.tsx`
- `apps/owner_dashboard/src/features/inventory/purchases-tab.tsx`
- `apps/owner_dashboard/src/features/settings/menu-import-wizard.tsx`
- Context: `apps/owner_dashboard/src/features/inventory/inventory-page.tsx` (tab anatomy, `?tab=` deep-linking), tests `src/__tests__/{insumos-manage,purchases-tab,menu-import}.test.tsx`, backend contracts listed above, shared UI (`StatCard`, `FreshnessBadge`, `EmptyState`, `LoadingState`), `src/lib/api-error.ts`, `src/features/settings/settings-api.ts`.

**Evidence reviewed:** source code (frontend + backend), existing component/unit tests, shared-component source (`stat-card.tsx`, `freshness-badge.tsx`, `api-error.ts`). No screenshots/runtime session; runtime claims are marked NOT_EVIDENCED where applicable.

---

## 1. Module job (§4)

**Primary user:** Owner (SOHO food-park operator) from the web dashboard.
**Primary job:**
1. **Insumos** — create and maintain materia prima (name, UoM compra/consumo, factor de conversión, costo promedio, nivel PAR, perecedero) so recipes and inventory work correctly.
2. **Compras** — review purchase history (invoice, insumo, supplier, unit cost NIO, subtotal) with honest totals; authoring stays on the POS.
3. **Importar menú** — import the full menu from an Excel workbook: template → fill → upload → preview → commit, fail-closed on row errors.
**Secondary users/jobs:** Manager role (backend allows `OWNER` and `MANAGER` for all three controllers); dashboard-only reader of purchase spend.
**Risk if wrong:** wrong conversion factor or cost corrupts CPP/COGS and margin truth (financial); a silently failed import leaves the owner believing the menu was loaded; purchase history truncation silently understates spend.

---

## 2. Surface inventory (§6 Phase B)

| Surface | Route/component | Job | Read/write | Permissions | Evidence |
|---|---|---|---|---|---|
| Insumos tab | `/inventory?tab=insumos` → `InsumosTab` | Search + maintain materia prima; create/edit dialog | Read list; write create/update | Backend: `Roles(OWNER, MANAGER)` + tenant RLS | `insumos-tab.tsx`; `insumo.controller.ts` |
| Compras tab | `/inventory?tab=purchases` → `PurchasesTab` | Review purchase history + totals | Read only | Backend: purchases route guarded; frontend read | `purchases-tab.tsx`; `inventory-purchase.service.ts` `listPurchases` |
| Menu-import wizard | Settings → Import tab → `MenuImportWizard` | Import menu from `.xlsx` (template/preview/commit) | Read preview; write commit (fail-closed) | Backend: `Roles(OWNER, MANAGER)`, tenant from session | `menu-import-wizard.tsx`; `menu-import.controller.ts` |
| Inventory page shell | `/inventory` → `InventoryPage` | Tab anatomy, `?tab=` deep-link, date-range picker | — | — | `inventory-page.tsx` |

---

## 3. Universal page anatomy check (§7)

| Surface | Where am I? (§7.1 title/nav) | What can I do? (§7.2 primary action) | What am I looking at? (§7.3 data scope) | What needs attention? (§7.4 exceptions) | What happens next? (§7.5 actions) |
|---|---|---|---|---|---|
| Insumos | Page h1 "Inventario" + tab "Insumos" underlined; unambiguous | "Nuevo Insumo" primary button; edit per row | Stats (Total, Perecederos, Alerta de Reposición) scope the tenant catalog; no date scope (correct for a catalog) | "Alerta de Reposición" stat accents when `lowStock > 0`; amber stock values in table | Edit per row; create opens dialog. After create, toast points to recipes/inventory usage |
| Compras | Tab "Compras" underlined | None (read-only surface; correct per product authority) | Date range from page-level picker affects the query; stat subtitles say "En el rango seleccionado" | Corrections distinguished by "Corrección" badge; error state replaces content | None; footer states authoring is on the POS — a calm, honest boundary |
| Importar menú | Settings tab "Importar" + card title "Importar menú (Excel)" | "Descargar plantilla" / "Subir archivo" / "Confirmar importación" in sequence | Card description states the whole scope: categorías, productos, insumos y recetas en un solo paso | Skipped recipes (amber), insumo review note (amber ⚠), errors (red table), warnings (amber table) | Errors table tells user to fix the Excel and re-upload; committed receipt says next step (revisar costo y PAR) |

---

## 4. Information hierarchy check (§8)

| Surface | P0 primary job dominates? | P1 supporting context present? | P2 secondary not competing? | Anti-pattern: everything promoted to P0? |
|---|---|---|---|---|
| Insumos | Yes — search + table dominate; one primary CTA | Yes — conversion badges, PAR/cost context inline | Stats are compact; yes | No |
| Compras | Yes — table + two stats | Yes — range subtitle, POS-authoring footer | Freshness badge is quiet; yes | No |
| Importar menú | Yes — step controls + preview dominate | Yes — counts grid, skip/warn/error tables | Empty-state copy is one card; yes | No |

---

## 5. Experience coverage matrix (EX-01 → EX-18) (§51)

| ID | Dimension | Core question | Status | Evidence | Finding IDs |
|---|---|---|---|---|---|
| EX-01 | Core Promise | Does the module reliably perform its primary job? | PARTIAL | CRUD, history read and import preview/commit all exist and are tested; but silent commit-failure UI gap (wizard) and truncated history without signal undermine reliability claims | BX-002, BX-009 |
| EX-02 | Product Truth | Does UI behavior match PRD/domain semantics? | PARTIAL | Read-only purchases matches POS-authoring authority; fail-closed import matches backend; but "Documentos de Compra" counts line items, not documents | BX-012 |
| EX-03 | Precision | Can labels/data/actions be misinterpreted? | FAIL | Line-item count mislabeled as documents; "supera el límite de 4 MB" for a 3.5 MiB limit; raw enum `VERSION_ALREADY_EXISTS` shown as if it were copy | BX-010, BX-011, BX-012 |
| EX-04 | Navigation | Does context travel between relevant surfaces? | PARTIAL | `?tab=` deep-link works and is preserved on tab switch; date-range deep-link works on load but range edits never reach the URL; wizard success names the next step but does not link it | BX-014, BX-019 |
| EX-05 | Findability | Can users find objects through appropriate search/filter/sort? | PARTIAL | Client-side search matches name/UoM (insumos) and factura/insumo/proveedor (purchases) with immediate feedback; no clear/reset control; no URL persistence for search | BX-001, BX-014 |
| EX-06 | Forms | Are entry/edit flows clear, safe and recoverable? | FAIL | Server failure preserves data (tested), but Escape/overlay click discards typed work with no warning; validation only on submit with silent numeric coercion | BX-003, BX-017 |
| EX-07 | Actions | Are consequences, risk and feedback clear? | PARTIAL | Import is gated on error-free preview with explicit fail-closed copy; but commit failure produces zero feedback | BX-009 |
| EX-08 | States | Loading/empty/error/partial/success states are intentional? | PARTIAL | Loading/empty/no-results are present and differentiated in all three surfaces; purchases error state lacks a retry control; wizard has no commit-error state | BX-009, BX-015 |
| EX-09 | Permissions | Is authorization correct end-to-end? | PASS | All three backend controllers enforce AuthGuard + RolesGuard (OWNER/MANAGER) + tenant-bound transactions; tenant from session, never body (`menu-import.controller.ts`); frontend renders no permission variants (single-role owner dashboard) | — |
| EX-10 | Time | Are repeated steps/input/context eliminated? | PARTIAL | Prepared defaults in insumo form (UN/UN, factor 1); wizard template removes column guesswork; but date range and search context do not persist to URL | BX-014 |
| EX-11 | Sobriety | Is unnecessary UI removed? | PASS | Tables are lean; badges meaningful; no decorative cards; conversion pair is a genuine decision aid | — |
| EX-12 | Consistency | Does it use established backoffice patterns? | PARTIAL | Settings tabs use `role="tablist"`/`aria-selected`; inventory tabs do not; error mapping via `getApiErrorMessage` exists but insumos bypasses it | BX-004, BX-013 |
| EX-13 | Microcopy | Is language precise, calm and actionable? | PARTIAL | Spanish copy is specific and calm in most places ("El registro de nuevas compras se realiza desde el POS…"); but raw backend English messages and enums leak into the errors/skipped tables | BX-010 |
| EX-14 | Accessibility | Can the critical workflow be completed accessibly? | PARTIAL | Focus rings on tab buttons; Radix dialog traps focus; but icon-only edit uses `title` only, no `aria-describedby` on form errors, no tab semantics on inventory tabs | BX-005, BX-008, BX-013 |
| EX-15 | Responsive | Does supported device behavior remain usable? | PASS | Grids collapse (`sm:` breakpoints), tables scroll horizontally in controlled wrappers, tabs scroll; dialog `max-w-md` | — |
| EX-16 | Performance | Does technical behavior support perceived quality? | PARTIAL | Cached queries with staleTime; client-side filtering is instant at SOHO scale; hard `limit: 200` without truncation signal is both an honesty and perception risk at scale | BX-002 |
| EX-17 | +1 | Is there a useful sustainable improvement opportunity? | PASS | Several evaluated: linked next step after import, save-and-create-another, context persistence | BX-019, BX-020 |
| EX-18 | Evidence | Can every PASS/FAIL claim be demonstrated? | PASS | Every status above cites file/line-level evidence; tests cited where they exist; NOT_EVIDENCED used for runtime-only claims | — |

Status values per §5.2; no numeric scores used anywhere in this document.

---

## 6. Conflict resolution (§0.1)

Candidates examined for product-authority vs experience-standard conflict:

| Conflict | Product authority | Experience standard | Resolution |
|---|---|---|---|
| Fail-closed import (no partial acceptance) | `menu-import.service.ts` commit throws on any row error; wizard copy states "La importación falla cerrada: no se escribirá nada mientras existan errores." | §37 only mandates partial acceptance be explicit *if product-supported*; §37 also forbids one-error-at-a-time re-upload loops | **No conflict** — backend returns ALL row errors in one preview, satisfying §37. Product choice of fail-closed is documented and honestly surfaced. |
| Purchases authoring restricted to POS | `purchases-tab.tsx` doc comment + backend contract; dashboard is read-only | §4 core promise (review history) is satisfied read-only | **No conflict** — boundary is stated in-product ("El registro de nuevas compras se realiza desde el POS"). |
| Client file-size guard (3.5 MiB) below server ceiling (~3.75 MiB binary) | `settings-api.ts` documents `MENU_IMPORT_MAX_FILE_BYTES = 3.5 * 1024 * 1024` as deliberately under the server's 5 MiB-base64 cap | §37 requires the accepted format/limits be identified honestly | Guard itself is honest and documented; the **rendered message** ("4 MB") is wrong → BX-011, not an authority conflict. |
| `FreshnessBadge` fed with `data[0].created_at` (newest purchase row) | Component contract (`freshness-badge.tsx`): `generatedAt` is "report generation time — technical metadata only (PRD FR-SYNC-04)", not sync truth | §35: freshness must not imply certainty beyond sync evidence | Component contract and §35 agree with each other; the *usage* in `purchases-tab.tsx` deviates from the component contract → flagged as BX-016 (REFINEMENT), recorded here as the closest AUTHORITY_CONFLICT candidate. No true product-vs-standard contradiction found in this audit. |

---

## 7. Contextual navigation map (§9, §10)

| Source | Trigger | Destination | Context carried | Context preserved on arrival | Context preserved on return | Status |
|---|---|---|---|---|---|---|
| Any deep link / refresh | `/inventory?tab=insumos` (or `purchases`, etc.) | Correct tab | `tab` param read on mount | Active tab rendered; range picker initialized from `startDate`/`endDate` params | N/A (same page) | PASS (§25 tab addressability) |
| Tab click inside page | User clicks another tab | Same page, new tab | `setSearchParams` merges into existing params (`replace: true`) | Other params (`startDate`, `endDate`, `status`) preserved | Back button does NOT return to previous tab (`replace: true` is a deliberate choice; acceptable, but range edits are also never written to the URL) | PARTIAL → BX-014 |
| Page date-range picker | Owner changes range | `PurchasesTab`/`CogsTab`/`KardexTab` re-query | Range passed as props only | Data refetches for new range | Range never reaches the URL (§9.4) → refresh loses it | FAIL (partial) → BX-014 |
| Wizard committed receipt | Import succeeds | (copy only) "Recuerda revisar costo y PAR de los insumos nuevos" | Next step named but not linked | — | — | +1 gap → BX-019 |

### Navigation checklist (§9, §10, §13, §14, §25)

- [x] Context known by system is not re-entered manually (§9.1) — wizard template carries the column contract; tenant from session.
- [x] No actionable link lands on generic list when context is known (§9.2) — no cross-module drill-downs in these surfaces (none required by authority).
- [x] Contextual links are contracts (§9.3) — no deep-link CTA exposed whose destination cannot consume context.
- [ ] URL-first for meaningful filters (§9.4) — `tab` is URL-addressable; `startDate`/`endDate` edits and both search terms are not → **BX-014**.
- [x] List/detail/back preserves working state (§10) — edit dialog reopen restores server state; list state survives dialog cancel (but not Escape-discard, see BX-003).
- [ ] Search term remains visible after detail-and-back (§13.1) — search lives in component state; a full page refresh or tab-out/in loses it → **BX-014**.
- [x] Filters persist through detail/back (§14.3) — dialog open/close does not touch list state.
- [x] Deep-linked filters are visible (§14.4) — `?status=` severity on Alerts tab renders an explicit chip with reset (verified in `inventory-page.tsx`).
- [x] Active tab is URL-addressable when useful (§25) — `?tab=` supported for all six tabs.

---

## 8. Sidebar and global navigation (§11)

Out of scope for this audit (no sidebar changes in the audited surfaces); inventory page provides its own local tab navigation with `aria-label="Secciones de inventario"` on the `<nav>`, but the tab buttons themselves lack tab semantics → **BX-013**.

| Requirement | Status | Evidence |
|---|---|---|
| Active route unambiguous | PASS | Tab underline `border-primary` + text color; also mirrored in URL `?tab=` |
| Group labels stable | PASS | `TABS` constant, static labels |
| Modules don't move arbitrarily | PASS | Static array |
| Badges indicate actionable state, not decoration | PASS | "Alerta de Reposición" accent only when `lowStock > 0`; "Inactivo" badge (see BX-018 reachability note) |
| Navigation visibility follows permission | N/A | Owner dashboard renders single-role surfaces |
| Hidden permission doesn't leave dead routes | N/A | — |
| Collapsed nav understandable | N/A | No collapsed nav in these surfaces |
| Module naming matches product language | PASS | "Insumos", "Compras", "Kardex" are operator terms |

---

## 9. Lists and data tables (§12)

### Table must answer (§12.1)

| Surface | What objects? | What state? | How to find? | How to narrow? | What can I do with one? | What can I do with several? |
|---|---|---|---|---|---|---|
| Insumos | Materia prima rows | Active/inactive badge, low-stock amber | Search box (name, UoM) | Search only | Edit (dialog) | Nothing (no bulk; none required by authority) |
| Compras | Purchase document lines | "Compra"/"Corrección" badge | Search (factura, insumo, proveedor) | Search + date range | Nothing (read-only) | Nothing |
| Import errors/warnings | Row issues | Error vs warning tables | Table scan | Hoja/Fila columns | Fix in Excel, re-upload | One commit revalidates all |

### Table details (§12.2–§12.5)

| Surface | Columns intentional (§12.2) | No internal IDs clutter (§12.2) | Numeric alignment (§12.3) | Row click clear (§12.4) | Row actions proportionate (§12.5) | Destructive separated (§12.5) |
|---|---|---|---|---|---|---|
| Insumos | Yes — each column maps to an owner decision (stock vs PAR, cost, units) | Yes | Yes — right-aligned `font-mono` (monospace glyphs are uniform-width, satisfying tabular intent); **but** `StatCard` values are the compliant ones (`tabular-nums`) — see BX-007 (P7 refuted) | No row click (no detail route); row hover is decorative only — acceptable since the only action is the explicit edit button, though hover affordance slightly suggests clickability | Yes — single edit icon | N/A — no destructive action exists in this surface |
| Compras | Yes — fecha/factura/insumo/proveedor/cantidad/costo/subtotal/tipo all decision-relevant | Yes | Yes — `tabular-nums` on all numeric cells | No row click; no detail route exists (read-only) | N/A | N/A |
| Import errors/warnings | Yes — Hoja/Fila/Mensaje exactly match the fix workflow (edit Excel at that cell) | Yes | Yes — `tabular-nums` on row numbers | N/A | N/A | N/A |

---

## 10. Search (§13)

| Surface | Matches user-recognizable identifiers (§13) | Immediate feedback (§13.1) | Clear empty result (§13.1) | Preserve query on detail/back (§13.1) | Search term visible (§13.1) | Clearing easy (§13.1) | No invisible "smart" criteria (§13.1) |
|---|---|---|---|---|---|---|---|
| Insumos | Yes — name + UoM, both visible on the row; placeholder names them | Yes — client-side filter, instant | Yes — `No se encontraron insumos con "…"` | No — state dies with the component (refresh/tab switch) → BX-014 | Yes — input retains the term | **No clear/reset control** (must select-all + delete) → BX-001 | Yes — criteria match the placeholder copy exactly |
| Compras | Yes — factura, insumo, proveedor, all shown | Yes — instant | Yes — `No se encontraron compras para "…"` | No → BX-014 | Yes | **No clear/reset control** → BX-001 | Yes |

### No-results vs no-data (§13.2)

| Surface | No-data state (objects don't exist) | No-results state (filters returned none) | Active filter shown | Clear/reset action present |
|---|---|---|---|---|
| Insumos | Yes — "No hay insumos registrados aún. Comience agregando materia prima…" (first-use, with create CTA still enabled, tested) | Yes — echoes the term in quotes | Yes (term echoed in message) | No → BX-001 |
| Compras | Yes — "Sin compras registradas en este rango" + explains POS authoring (valid-empty, calm, no illustration) | Yes — echoes term | Yes | No → BX-001 |
| Importar menú | Yes — "Aún no hay archivo cargado" with instructions (first-use) | N/A (no search) | N/A | N/A |

The no-results vs no-data distinction is correctly implemented and tested in both list surfaces — this is a genuine PASS the fast pass did not credit.

---

## 11. Filters (§14)

| Surface | Visible state (§14.1) | Reset available (§14.2) | Persist through detail/back (§14.3) | Deep-linked filter visible (§14.4) |
|---|---|---|---|---|
| Insumos search | Visible input | No → BX-001 | Component state only → BX-014 | N/A (no deep-linked search) |
| Compras date range | Visible via page-level `DateRangePicker` | Picker UI (native control; behavior of its clear control out of scope) | Prop-passed; survives tab switches (component unmounts on tab change — returning to Compras re-queries same range since state lives in the page shell: PASS) | Initial load reads `startDate`/`endDate` params — visible in picker; **edits never written back to URL** → BX-014 |
| Compras search | Visible input | No → BX-001 | Component state only → BX-014 | N/A |
| Alerts severity (context) | Explicit chip "Mostrando alertas con severidad: X (n)" | "Mostrar todas (n)" button | URL `?status=` | Yes — chip + reset, model implementation of §14.4 |

---

## 12. Sorting and pagination (§15)

| Surface | Active sort visible | Direction visible | Default sort matches primary job | Deterministic | Pagination communicates X–Y de Z | Filter change resets pagination |
|---|---|---|---|---|---|---|
| Insumos | No visible sort control; backend orders by `name ASC` (`insumo.controller.ts`) — alphabetical is a sane default for a catalog | N/A (no sort affordance; direction implicit in column order — acceptable, no misleading indicator) | Yes | Yes (backend `order: { name: 'ASC' }`) | N/A — full list rendered client-side; count implicit in stat "Total Insumos" | N/A |
| Compras | No visible sort control; backend orders `invoice_date DESC, entry_timestamp DESC` — newest-first matches a review job | N/A | Yes | Yes | **No** — hard `limit: 200` with no "Mostrando X–Y de Z" and no truncation signal → **BX-002** | N/A (no pagination to reset) |
| Import errors/warnings | N/A — error list order follows workbook order, which is the correct working order for fixing | N/A | Yes | Yes | N/A | N/A |

---

## 13. Bulk actions (§16)

| Surface | Only appear when selection exists | Object count shown | Action shown | Consequences shown | Confirmation per risk | Succeeded/failed count after | Partial failure not collapsed to generic success |
|---|---|---|---|---|---|---|---|
| All three surfaces | N/A | N/A | N/A | N/A | N/A | N/A | Import commit is effectively an all-or-nothing bulk write: it **does** report exact per-class counts (categorías, creados, actualizados, recetas) and fail-closed guarantees no partial state — satisfies the spirit of §16 for its domain (see also §19/§37 rows) |

No row-selection exists anywhere in these surfaces; no bulk findings.

---

## 14. Forms (§17–§22)

One form surface exists: the Insumo create/edit dialog. The wizard is audited under §37/§19 below.

| Surface | Layout (§17.1) | Labels visible (§17.2) | Required explicit (§17.3) | Helper text when useful (§17.4) | Validation timing (§18.1) | Error copy actionable (§18.2) | Form-level errors (§18.3) | Server validation authority (§18.4) | Save feedback explicit (§19) | Save behavior correct (§19.1) | Success copy specific (§19.2) | Save+continue evaluated (§19.3) | Dirty state protected (§20) | Create flow clear (§21) | Edit flow scope clear (§22) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Insumo dialog (create/edit) | Yes — single column, two-column pairs only for related unit fields | Yes — `<Label htmlFor>` on every field | PARTIAL — asterisks on Nombre/UoMs/Factor, but no "optional" framing for PAR/minStock (placeholders say "Opcional": acceptable, minimal) | Yes — "Ej: 1 L = 1000 ML (factor 1000)" is exactly the mistake-preventing helper §17.4 wants | FAIL-adjacent — validates only on submit (§18.1 prefers blur/commit); no mid-typing errors (good), but silent numeric coercion while typing (`parseFloat(e.target.value) || 1` turns a cleared factor into 1; `|| 0` on cost/PAR) → BX-017 | Local errors good ("El nombre del insumo es obligatorio."); server path bypasses `getApiErrorMessage` → BX-004 | Error banner rendered inside dialog, data preserved (tested); **no focus/scroll/error-association** → BX-005 | Yes — backend `ConflictException` messages are Spanish and user-appropriate; frontend displays them (albeit via raw `err.message`) | Yes — `Guardando...` while pending, dialog closes on success, toast fires | Duplicate submit disabled; width NOT preserved ("Crear Insumo" → "Guardando...") → BX-006 | Yes — "Insumo creado — El insumo 'X' ya está disponible para recetas e inventario." (specific, calm) | Evaluated → BX-020 (+1) | **FAIL** — Escape/overlay click discards typed work silently → BX-003 | Yes — dialog title names the object; description states scope (recetas de producción y ventas); lifecycle (active immediately) not stated → minor | Yes — "Editar Insumo" vs "Nuevo Insumo de Materia Prima"; title switch verified by test; edit changes only config (no historical rewrite) → §22 honest |

### Save behavior detail (§19.1)

| Surface | Duplicate submit prevented | Button width preserved | Progress exposed without locking unrelated context |
|---|---|---|---|
| Insumo dialog | Yes — `disabled={createInsumo.isPending || updateInsumo.isPending}` (tested implicitly via state) | No → BX-006 | Yes — only the dialog is affected; list remains interactive |
| Wizard commit | Yes — `disabled={!canConfirm}` where `canConfirm` includes `!commitMutation.isPending` | Spinner appended inside button; width grows slightly | Yes |

---

## 15. Destructive / high-risk actions (§23)

| Action | Risk level | Confirmation proportionate (§23.1) | Object/consequence/reversibility/scope communicated | Label explicit verb (§23.3) | Typed confirmation if destructive (§23.4) | No over-confirmation of harmless actions (§23.2) | Hidden side effects explained (AP-19) |
|---|---|---|---|---|---|---|---|
| Create/update insumo | Low (reversible edit) | No confirmation — correct | N/A | "Crear Insumo" / "Guardar Cambios" — explicit verbs | No — correct | Yes — no dialog-on-dialog | Side effect (immediate availability to recipes) explained in success toast |
| Import commit | High (writes many objects) | Gated on error-free preview instead of a confirmation dialog — an acceptable equivalent; button says "Confirmar importación" | Yes — preview counts are the consequence preview; skipped/warnings/insumo-review notes expose scope; fail-closed stated | Yes | No — acceptable given the preview gate (materially destructive would be overwriting existing recipes; import never touches existing recipes — skipped, not replaced — so typed confirmation would be theatrical) | Yes | Yes — "Insumos a crear … con stock 0 y costo promedio 0" pre-states the hidden side effect and its follow-up (AP-19 satisfied here; exemplary) |
| Wizard "Cancelar" during preview | Low | None — correct (no work lost: file can be re-picked) | N/A | "Cancelar" is generic but acceptable in a non-destructive step context | No | Yes | N/A |

No destructive action (delete) exists in any audited surface — consistent with the domain (insumos deactivate via `is_active`, which the dashboard does not yet expose → BX-018).

---

## 16. Detail screens (§24)

N/A — none of the three surfaces has a detail route; rows carry their decision-relevant facts inline (UoM conversion pair, PAR, cost). No dead-end risk because no row promises more detail (no clickable rows). This is a legitimate scope boundary, not a §24 failure.

---

## 17. State coverage (§27–§32, §35)

| Surface | Loading page (§28.1) | Loading partial (§28.2) | Refetch "Actualizando" (§28.3) | Form no auto-refresh (§28.4) | Empty first-use (§29) | Empty valid (§29) | Empty filtered (§29) | Empty permission (§29) | Error answers 5 questions (§30) | Error preserves context (§30.1) | Retry appropriate (§30.2) | Technical detail in support only (§30.3) | Success calm + next step (§31) | Toast transient (§32) | Toast not for retained info (§32) | Toast errors stay visible (§32) | Toast not stacked (§32) | Partial/Unknown honest (§27,§35) | Freshness exposed when material (§35) | `generatedAt` not sync truth (§35) | Permission state intentional (§33) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Insumos | Yes — LoadingState with domain copy | N/A (single query) | Not shown on refetch (staleTime 5 min; background refetch is invisible — acceptable, no misleading reset) | Yes — dialog state is local | Yes (tested) | N/A | Yes — term echoed | N/A | PARTIAL — server error stays inside dialog (good) but raw message path → BX-004 | Yes — dialog stays open, data kept (tested) | N/A (dialog resubmit is the retry) | Local errors are domain copy; server path may leak → BX-004 | Toast specific + dialog closes | Yes | Yes — toast is confirmation only | N/A (no error toasts in these surfaces) | Yes (one toast per op) | N/A | N/A (catalog, not sync-derived) | N/A | N/A |
| Compras | Yes — "Cargando historial de compras..." (tested) | N/A | Same as above | N/A | Yes — "Sin compras registradas en este rango" + POS guidance (tested) | Same | Yes — term echoed | N/A | PARTIAL — "No se pudo cargar el historial de compras / Verifique su conexión e intente de nuevo" answers what happened + what to do, but no retry control → BX-015 | Yes — error replaces tab content only; page shell intact | **No retry control** → BX-015 | Yes — raw error never shown (tested) | N/A | N/A | N/A | N/A | N/A | N/A — purchases ARE sync-derived; freshness shown via badge, but watermark is questionable → BX-016 | **PARTIAL** — badge fed `data[0].created_at`, not a sync-completeness read → BX-016 | N/A |
| Importar menú | Yes — per-step LoadingState ("Procesando el archivo y calculando el plan...") | N/A | N/A | N/A (file re-read on every pick) | Yes — "Aún no hay archivo cargado" | N/A | N/A | N/A | **FAIL for commit errors** — `commitMutation.isError` is never rendered → BX-009; preview errors well surfaced (title + mapped copy via `getApiErrorMessage`) | Yes — preview retained on commit failure (work not lost) | Not offered for commit; user can re-click (which is a genuine retry) | Preview error uses `getApiErrorMessage` with sensible fallback | Committed receipt is calm + names next step | N/A (no toasts) | N/A | N/A | N/A | Yes — errors vs warnings vs skipped are separated; "estado actual: PUBLISHED" leaks enum → BX-010 | Yes — insumo review note pre-declares post-import work | N/A | N/A |

### State vocabulary (§27)

- [x] Consistent lifecycle terms — "Compra"/"Corrección" (docs), "creados"/"actualizados"/"omitidas" (import); no synonyms observed.
- [x] No synonyms for same state (§26) — within these surfaces, yes.
- [x] `—` means unavailable, never zero — verified: `unitCostNio != null ? formatCurrency : "—"`, `parLevel ? … : "—"`, `insumo?.name ?? "—"`, `formatDate` returns "—" for empty. Correct in all three files.
- [x] Badge colors semantic, not decorative (§26) — amber = attention (low stock, perecedero, review notes), destructive = Inactivo, secondary/outline = Compra/Corrección distinction with text (color never sole signal).

---

## 18. Long-running operations (§36)

| Operation | Acknowledge start | Show progress | Distinguish queued/running/completed/failed | Preserve navigation when safe | Allow return later | Result/error summary | No fake progress % |
|---|---|---|---|---|---|---|---|
| Menu import (preview) | Yes — LoadingState copy | Determinate "Procesando el archivo y calculando el plan de importación..." | Yes — pending/error/result are distinct UI states | Yes | N/A (single-session operation; no server staging by design — documented) | Yes — full summary counts | Yes |
| Menu import (commit) | Yes — spinner in button | Yes (spinner) | Running/completed yes; **failed = silent** → BX-009 | Yes | N/A (same) | Yes for success; missing for failure → BX-009 | Yes |

Import duration is seconds-to-low-tens for SOHO workbooks; §36's "allow return later" is satisfied by the documented no-staging architecture (re-upload is the return path) — honest, not a defect at this scale.

---

## 19. Import / upload experiences (§37)

Audited column-by-column against `menu-import.service.ts` + `settings-api.ts` + wizard:

| §37 requirement | Status | Evidence |
|---|---|---|
| Accepted format identified | PASS | `accept=".xlsx"` on input + client guard "Solo se admiten archivos .xlsx. Descarga la plantilla y complétala en Excel." (tested) + template itself is `.xlsx` |
| Required columns/rules explained | PASS | Template ships a "CÓMO LLENARLA" sheet with the 5-column contract (`producto \| precio \| insumo \| cantidad \| unidad`), per-tab = category rule, example row included; the parser auto-ignores the guide sheet so the template can be re-uploaded as-is — exemplary §37 design |
| Validate without destroying good work | PASS | Preview is a dry run (`mode: 'preview'`, no writes); commit is transactional (one tenant-bound transaction, fail-closed); user's Excel file is never consumed destructively — errors table says exactly which sheet/row to fix |
| File-level vs row-level error distinguished | PARTIAL | File-level (unreadable workbook, oversize, missing columns → `BadRequestException`) surfaces via `getApiErrorMessage` alert; row-level via Hoja/Fila/Mensaje table. **Gap:** commit-time file-level failure (fail-closed `BadRequestException` listing first row error) renders **nothing** → BX-009 |
| Partial acceptance explicit | PASS (N/A + honest) | Product authority is fail-closed; wizard states it verbatim when errors exist. Backend returns ALL row errors at once, so §37's "one error per upload" anti-pattern does not occur |
| Size limit surfaced honestly | **FAIL** | Client guard `3.5 MiB` is deliberately below the server ceiling (`MAX_BASE64_LENGTH` = 5 MiB base64 chars ≈ 3.75 MiB binary — mismatch is documented and safe); but the rendered message computes `Math.round(3.5)` = **"4 MB"**, telling the user a false limit → BX-011 |
| Commit re-upload loop avoided | PASS | Errors table lists every failing row in one pass |

---

## 20. Dates and time (§38)

| Surface | Product-authorized timezone | Selected period clear | Date included when time could refer to another day | Created/occurred/effective/updated distinguished | No ambiguous relative text for auditable history |
|---|---|---|---|---|---|
| Compras | `es-NI` locale formatting; `FreshnessBadge` pins `America/Managua` | Yes — page-level range picker + "En el rango seleccionado" subtitle | Yes — `formatDate` renders `dd/mm/yyyy` (date only; no bare times) | Partial — shows `invoice_date`; `entry_date`/`entry_timestamp`/`created_at` exist in the contract but only `created_at` (as freshness watermark) leaks through; for purchase review `invoice_date` is the operationally correct field — acceptable | Yes — no relative text |

Purchases list shows date only, which is correct for an invoice-date review surface. No findings.

---

## 21. Microcopy (§39)

### Buttons (§39.1)

| Surface | Verbs used | Generic OK/Aceptar/Ver/Continuar avoided when destination can be named | Compact UI has explicit accessible label |
|---|---|---|---|
| Insumos | "Nuevo Insumo", "Crear Insumo", "Guardar Cambios", "Cancelar" | Yes — all specific | **No** — icon-only edit uses `title="Editar insumo"` only → BX-008 |
| Compras | N/A (read-only) | — | N/A |
| Wizard | "Descargar plantilla", "Subir archivo", "Confirmar importación", "Cancelar", "Importar otro archivo" | Yes — exemplary | Yes — all buttons carry text |

### Descriptions (§39.2)

- [x] Do not explain what heading already says — wizard CardDescription adds the flow (una pestaña por categoría…), not a restatement. DialogDescription states scope beyond the title. PASS.

### Warnings (§39.3)

- [x] State consequence — "estos insumos se crearán con stock 0 y costo promedio 0. Ajusta su costo y nivel PAR después de importar." / "La importación falla cerrada: no se escribirá nada mientras existan errores." Both state consequence without fear language. PASS.
- [x] Avoid fear language — verified; no alarmist copy.

### Technical terms (§39.4)

- [ ] Use only when the user benefits — **FAIL**: raw enum `VERSION_ALREADY_EXISTS` and raw state `PUBLISHED` rendered verbatim; backend English row messages ("Row is missing 'producto'") displayed to a Spanish-speaking owner → BX-010.
- [x] No implementation vocabulary from backend code — except BX-010 leaks; field names in error copy ("'precio' for product 'X' is missing or not numeric") mirror the Excel headers the user typed, which is defensible; English language is not.

---

## 22. Raw identifiers & technical references audit (§39.4)

> **Rule:** No backend enum values, internal task references, document section numbers, or implementation identifiers may appear in user-facing text.

### UPPERCASE_SNAKE_CASE in visible text

| File | Line | Raw identifier | Context | Fix |
|---|---|---|---|---|
| `apps/owner_dashboard/src/features/settings/menu-import-wizard.tsx` | ~`{skipped.reason} (estado actual: {skipped.existingState})` (preview skipped-recipes list) | `VERSION_ALREADY_EXISTS`, `PUBLISHED` | Rendered directly: `— {skipped.reason} (estado actual: {skipped.existingState})` produces "— VERSION_ALREADY_EXISTS (estado actual: PUBLISHED)" | Map `VERSION_ALREADY_EXISTS` → "el producto ya tiene una receta" and `publication_state` → labeled Spanish state (e.g., "Publicada") |

### Internal references in visible text (ONB, PRD, §)

| File | Line | Raw reference | Context | Fix |
|---|---|---|---|---|
| — | — | — | None found in the three audited files (grep for `§`, `PRD`, `ONB`, `ODAV` in rendered strings: no matches) | — |

### Backend snake_case in rendered text

| File | Line | Raw field name | Rendered as | Fix |
|---|---|---|---|---|
| — | — | — | None rendered. `is_perishable`, `consumption_uom`, `tenant_id`, `unit_cost_nio`, `invoice_number` etc. appear only as internal property accesses, never as displayed text. (The insumo form uses `is_perishable` as a state key, not as copy.) | — |

### Backend enum values shown without label mapping

| File | Line | Raw enum value | Should map to | Fix |
|---|---|---|---|---|
| `menu-import-wizard.tsx` | preview skipped list | `VERSION_ALREADY_EXISTS` (from `menu-import.service.ts` `reason: 'VERSION_ALREADY_EXISTS'`) | "Ya tiene una versión de receta" | Local mapping table |
| `menu-import-wizard.tsx` | preview skipped list | `existingState` = `publication_state` raw value (`DRAFT`, `PUBLISHED`, …) | Labeled Spanish state per §26 vocabulary | Local mapping table |
| `inventory-page.tsx` (context) | `MOVEMENT_LABELS` | (contrast: this file maps its enums correctly) | — | Reuse the mapping pattern |

### Backend error codes shown to user

| File | Line | Raw error code | Should show | Fix |
|---|---|---|---|---|
| `insumos-tab.tsx` | `catch (err)` in `handleSubmit` — `err.message` may be `"API error: 409"` (from `ApiError` construction in `lib/api.ts`) when `responseBody.message` is absent, or a network string like `"Failed to fetch"` | `API error: 409`, `Failed to fetch` | Actionable Spanish copy via `getApiErrorMessage` (already exists in `src/lib/api-error.ts`) | Route the catch through `getApiErrorMessage(err, "Error al guardar el insumo")` → BX-004 |

---

## 23. Human defaults (§40)

| Default | Common? | Safe? | Understandable? | Reversible? | Not destructive/silent/permission-sensitive/hidden |
|---|---|---|---|---|---|
| Insumo form: UoM `UN`/`UN`, factor `1`, costo `0`, `RESTRICT` policy | Yes | Yes | Yes (labels + helper) | Yes (editable) | Yes — though costo 0 default is silently financial if never reviewed; mitigated by explicit cost column in table and the wizard's review-note pattern (insumos created by import DO flag it; manually created ones do not — minor, noted in BX-017 dependencies) |
| Wizard: template pre-filled with SOHO categories + example row | Yes | Yes | Yes (guide sheet) | Yes (rename/skip tabs) | Yes |
| Purchases: date range defaults to today | Yes | Yes | Yes (picker visible) | Yes | Yes |

No dangerous defaults found.

---

## 23. Progressive disclosure (§41)

| Surface | SUMMARY → DETAIL → TECHNICAL pattern | Complexity shown when user needs it | Material limitations not hidden behind advanced section |
|---|---|---|---|
| Importar menú | Yes — summary counts → per-class tables (skipped/insumos/errors/warnings) → row-level sheet/row detail | Yes — errors/warnings only render when non-empty | Yes — fail-closed limitation stated inline, not in an advanced section |
| Insumos | Yes — list summary → edit dialog detail | Yes | Yes — conversion factor consequence visible inline in the table (`(1 LB = 454 G)`) |
| Compras | Yes — stats → table | Yes | Yes — POS-authoring boundary stated inline |

---

## 24. Visual & motion (§42–§44)

### Color semantics (§42.1)

| Color | Usage | Contrast ratio (WCAG AA ≥ 4.5:1) | Status |
|---|---|---|---|
| Amber (amber-600/amber-100) | Low stock values, "Perecedero" badge, review notes | NOT_EVIDENCED (no runtime contrast measurement performed; amber-800 on amber-100 is a standard shadcn pairing typically ≥ 4.5:1, but not measured here) | NOT_EVIDENCED — flagged, not passed |
| Red/destructive | Error banners, "Inactivo" badge, negative-stock accents | NOT_EVIDENCED (same caveat) | NOT_EVIDENCED |
| Emerald/Blue (import counts) | Created vs updated distinction (with text labels, color not sole signal) | NOT_EVIDENCED | NOT_EVIDENCED |
| Navy/primary | Tab active state + underline (color + geometry, not color alone) | NOT_EVIDENCED | NOT_EVIDENCED |

No runtime contrast audit was performed in this pass; §46 contrast table below reflects the same gap. This is honestly NOT_EVIDENCED, not PASS.

### Visual restraint checklist (§42, §43)

- [x] Cards group meaningful ideas (§42.2) — wizard card = one workflow; stat cards = one metric each.
- [x] Not every section in a card (AP-04) — tables live in single bordered containers, not nested cards.
- [x] Borders for structure, not decoration (§42.3) — table borders delineate data zones.
- [x] Shadows follow elevation system (§42.4) — `shadow-xs` only.
- [x] No increased shadow for "premium" signal (AP-16) — verified, none.
- [x] Spacing groups ideas clearly (§42.5) — `space-y` hierarchy between zones; tight field groups.
- [x] Typography hierarchy before decoration (§42.6) — uppercase muted table headers, semibold values.
- [x] Numeric values use tabular figures (§42.6) — StatCard `tabular-nums` (P7 refuted, BX-007); purchase table `tabular-nums`; insumo table `font-mono` (uniform-width by design).
- [x] No fake-luxury treatment (AP-16) — none observed.
- [x] Luxury-by-restraint filter (§43) — no ornament present to filter.
- [x] Normality quieter than exceptions (§18) — healthy tables are unstyled; only exceptions get amber/red.

### Motion (§44)

- [x] Motion only explains/orients/confirms — hover transitions, loader spin only.
- [x] No motion to prove budget — verified.
- [x] No motion that delays access to content — none.
- [x] No celebration animation for routine CRUD — success is a calm toast/alert.
- [x] Reduced motion respected (§46) — only `animate-spin` (spinner) and micro hover transitions; no large-motion risk. (No `prefers-reduced-motion` override observed, but no violating animation either.)
- [x] No motion that obscures state changes.

---

## 25. Accessibility (§46)

| Criterion | Status | Evidence |
|---|---|---|
| WCAG 2.1 AA baseline | PARTIAL | Structural a11y good (labels, htmlFor, focus rings); gaps below |
| Visible focus | PASS | `focus-visible:ring-2` on tab/filter buttons (inventory-page, kardex chips); default focus on inputs/buttons |
| Logical keyboard order | PASS | DOM order matches visual order in all three files |
| Escape closes appropriate overlays | PASS (with §20 tension) | Radix Dialog closes on Escape and overlay click — correct a11y; the dirty-state cost is BX-003, adjudicated there |
| Arrow-key for tabs/menus where expected | FAIL | Inventory tabs are plain `<button>`s with no `role="tab"`, no `aria-selected`, no arrow-key handling — inconsistent with `settings-page.tsx` which implements the pattern correctly → BX-013 |
| Icon buttons have accessible names | PARTIAL | Edit button exposes `title="Editar insumo"` only (accessibility-name fallback, but unreliable across SR/browser combos; no `aria-label`) → BX-008 |
| Errors use aria-describedby or equivalent | FAIL | Insumo form error banner is neither `role="alert"`/`aria-live` nor associated with any input via `aria-describedby` → BX-005 |
| Active navigation uses semantic state | FAIL | Same as BX-013 (visual-only active state on inventory tabs) |
| Color not sole signal | PASS | Badges always carry text ("Perecedero", "Inactivo", "Corrección"); FreshnessBadge documented "color is never the only signal — every state carries its own explicit text"; low-stock uses color + value emphasis |
| Reduced motion respected | PASS | No violating animation (see §44) |
| 200% zoom remains usable | NOT_EVIDENCED | No zoom runtime test; responsive classes suggest safety, but unproven |

### Contrast ratios verified

| Element | Foreground | Background | Ratio | Threshold | Status |
|---|---|---|---|---|---|
| (none measured — no runtime tooling in this pass) | — | — | — | 4.5:1 (normal) / 3:1 (large/icon) | NOT_EVIDENCED |

---

## 26. Permissions (§33)

| Layer | Status | Evidence |
|---|---|---|
| Server-side authoritative enforcement (§33) | PASS | `AuthGuard + RolesGuard + @Roles(OWNER, MANAGER)` on all three controllers; every read/write inside `runInTenantTransaction` (FORCE RLS via `app.tenant_id`); tenant from JWT/session, never request body |
| Frontend: don't request/execute unauthorized (§33) | PASS | Frontend calls exactly the guarded routes; no privileged calls |
| Presentation: no fake zero/blurred/placeholder/hidden-by-CSS (§33) | PASS | No permission variants rendered; no sensitive data teased |
| Permission-aware composition: omit and reflow (§33.1) | N/A | Single-role owner dashboard |
| Disabled vs hidden decision documented (§33.2) | N/A | No permission-conditional controls |
| Permission-hidden tabs leave no unexplained gaps (§25) | N/A | — |
| Direct URL access remains protected | PASS | Direct `/inventory?tab=…` still rides guarded API; unauthenticated API access fails server-side |

---

## 27. Sensitive and financial data (§34)

- [x] Consistent currency formatting — `Intl.NumberFormat("es-NI", { style: "currency", currency: "NIO" })` in both tabs; column header names NIO explicitly.
- [x] Consistent decimals — 2 for currency, ≤4 for quantities, consistently.
- [x] Historical values stay historical — purchase rows render stored `unit_cost_nio`, not recomputed costs; CPP shown as `projected_cpp_nio` in contract (not rendered — fine).
- [x] Amounts don't change due to current config — yes, values come from document rows.
- [x] `—` means unavailable/unknown, never zero — verified across all three files (§17 checklist).
- [x] Masked/redacted data is explicit — N/A (no masked data).
- [x] Permission restrictions before serialization where required — tenant RLS at query level.

---

## 28. Consistency (§48)

| Item | Consistent across modules? | Evidence |
|---|---|---|
| Button labels | Yes (within scope) | Verb-first everywhere; "Cancelar" consistent |
| Placement | Yes | Primary action right-aligned in dialogs and wizard footer |
| Table behavior | Yes | Same header/cell classes across tabs (shared tailwind pattern) |
| Filters | PARTIAL | Insumos/compras search inputs identical in shape; neither offers reset (BX-001), while Alerts severity chip does — internal inconsistency resolved by fixing BX-001 |
| Pagination | N/A | No pagination anywhere in scope (BX-002 is about its absence where needed) |
| Dialog actions | Yes | Cancel-left/submit-right both dialogs/wizard |
| Date formats | Yes | `es-NI` short date everywhere |
| Currencies | Yes | C$ (NIO) everywhere |
| Status vocabulary | Yes | Within scope; BX-010 is the cross-language leak, not a synonym problem |
| Toasts | Yes | Insumos CRUD only; specific titles; single toast per op |
| Empty states | Yes | Same `EmptyState` component, differentiated no-data vs no-results |
| Destructive confirmations | N/A | None exist |
| Breadcrumb/back behavior | PARTIAL | Tab switches use `replace: true` (no back-return); consistent with the page's own model, but combined with BX-014 reduces URL truth |

---

## 29. NHILOS +1 opportunities (§49)

| Pattern | Applicable? | Implemented? | Notes |
|---|---|---|---|
| +1.1 Context travels (deep links preserve question) | Yes | PARTIAL | `?tab=` and `?status=` yes; range/search no → BX-014 |
| +1.2 Remembered list state (detail/back returns to context) | Partially applicable | Yes (dialog scope) | List state survives dialog interactions |
| +1.3 Prepared defaults (safe common values pre-selected) | Yes | Yes | UN/UN/factor 1 in insumo form; SOHO categories in template |
| +1.4 Clear next step (success/empty/error point to next action) | Yes | PARTIAL | First-use empties and import receipt name next steps; import receipt could link them → BX-019 |
| +1.5 Error recovery preserves work | Yes | PARTIAL | Server error preserves dialog data; Escape discards it → BX-003; commit failure preserves preview → good |
| +1.6 Explain impact (warnings say what is affected) | Yes | Yes | Import insumo review note is exemplary |
| +1.7 Useful preview before committing material action | Yes | Yes | The wizard IS a preview-then-commit design |
| +1.8 No repeated input (reuse known information) | Yes | Yes | Template pre-fills columns/categories |
| +1.9 Contextual creation (preselect from source context) | No | — | No cross-object creation in scope |
| +1.10 Contextual related views (open object's movements) | Partially applicable | No | Insumo row could link to Kardex filtered by that insumo (`?tab=kardex` + filter) — candidate below |
| +1.11 Smart return path (preserve original working context) | Yes | PARTIAL | Same as BX-014 |
| +1.12 Useful copy over tooltip dependence | Yes | Yes | Helpers inline; no hidden instructions in tooltips (except icon-only title → BX-008) |
| +1.13 Quiet healthy states | Yes | Yes | Verified §44 |
| +1.14 Partial success clarity (bulk/import explain what succeeded) | Yes | Yes | Commit receipt counts per class; skipped listed |
| +1.15 Relevant keyboard efficiency | No | — | Owner CRUD volume doesn't justify shortcuts yet |

### Additional +1 proposals

#### +1-01 — Linked next step after import

**Problem / friction:** Committed receipt tells the owner to review cost/PAR of new insumos but gives no path; the owner must navigate to Inventario → Insumos and re-find them.
**Proposed +1:** On the committed card, when `insumosToCreate.length > 0` in the committed summary, offer a link/button "Revisar insumos nuevos" that navigates to `/inventory?tab=insumos` (optionally with a `?highlight=` context if later wired).
**Standard ref:** §49.+1.4, §49.+1.11
**Value:** closes the loop the wizard itself opens; the review note already promised this follow-up.
**Why natural:** the wizard knows exactly which insumos it created.
**Sustainability:** a single route link; no new state.
**Dependency:** route to inventory tab already URL-addressable (verified).
**Should implement now?:** YES (after REQUIRED findings)

#### +1-02 — Contextual Kardex from insumo row

**Problem / friction:** Owner seeing low stock in the Insumos table cannot see that item's movements without navigating to Kardex and re-filtering.
**Proposed +1:** Per-row "Ver movimientos" action linking to `?tab=kardex` with the insumo filter carried in URL (requires kardex filter persistence, currently component state).
**Standard ref:** §49.+1.10, §9.2
**Value:** direct answer to the low-stock decision the table provokes.
**Why natural:** Kardex already renders per-insumo movements; only the link + filter persistence is missing.
**Sustainability:** moderate — depends on URL-first filter work (BX-014).
**Dependency:** BX-014 correction.
**Should implement now?:** DEFER

#### +1-03 — Save and create another (insumos)

**Problem / friction:** During onboarding the owner may register many materia prima items; each requires reopening the dialog.
**Proposed +1:** "Guardar y crear otro" secondary submit while in create mode, resetting the form after success.
**Standard ref:** §19.3
**Value:** real time saving in the documented bulk-onboarding workflow (§19.3 explicitly invites evaluating it here).
**Why natural:** create flow already resets to `DEFAULT_FORM` on open.
**Sustainability:** one conditional button.
**Dependency:** none.
**Should implement now?:** DEFER (baseline health first)

---

## 30. Anti-pattern quick check (§50)

| ID | Anti-pattern | Check | Status |
|---|---|---|---|
| AP-01 | Generic destination | Any link routes to unfiltered generic list? | PASS — no cross-module links in scope |
| AP-02 | Unknown as zero | Any `—`/unknown rendered as `0`? | PASS — verified `—` usage (§17) |
| AP-03 | Decoration as value | Any UI element that doesn't improve comprehension? | PASS — conversion badges, row hover all carry meaning |
| AP-04 | Every section in card | Cards wrapping individual fields? | PASS |
| AP-05 | Healthy-state noise | Normal statuses competing with exceptions? | PASS — accent only on exceptions |
| AP-06 | Generic copy | `Ver`, `Aceptar`, `Error`, `Procesado` used? | PASS (button level); error-table content leaks raw copy → BX-010 is the exception |
| AP-07 | Reset after detail | User loses list context on detail/back? | PASS within dialogs; search not URL-persisted → BX-014 covers the residual |
| AP-08 | Form data loss | Recoverable error erases form data? | PARTIAL — server error: no; Escape/overlay: yes → BX-003 |
| AP-09 | Permission by CSS | Sensitive data hidden visually but fetched? | PASS |
| AP-10 | Error as code | Raw HTTP/DB error as primary explanation? | FAIL → BX-004 (insumos), BX-010 (enums) |
| AP-11 | Confirmation fatigue | Dialogs for harmless routine changes? | PASS — no over-confirmation |
| AP-12 | Destructive ambiguity | `Aceptar` performs destructive action? | PASS — no destructive actions |
| AP-13 | Filter invisibility | Deep-linked filter active but invisible? | PASS — severity chip model; range picker visible |
| AP-14 | Table dumping | Every DB field as column? | PASS — columns are decision-filtered |
| AP-15 | Feature dumping | All capabilities at same hierarchy level? | PASS |
| AP-16 | Fake luxury | Dark/glow/animation for status? | PASS |
| AP-17 | Disabled dead end | Disabled control with no explanation? | PARTIAL — wizard confirm is disabled with explanatory fail-closed copy when errors exist (good); but when disabled for other reasons (no file yet) the EmptyState explains the flow (good); commit-failure silence is the real dead end → BX-009 |
| AP-18 | Success dead end | Success with no next step guidance? | PARTIAL — import receipt names but does not link the next step → BX-019 (+1) |
| AP-19 | Hidden side effect | Change impacts other data without explanation? | PASS — import side effects pre-declared; insumo creation effect stated in toast |
| AP-20 | Inconsistent vocabulary | Same state called different names? | PASS within scope; cross-module pass deferred to Appendix C |

---

## 31. Findings

Preliminary P1–P8 map to BX-001..BX-008 (BX-007 records the refutation). BX-009..BX-020 are findings the fast pass missed.

### BX-001 — Search inputs offer no clear/reset control

**Severity:** REQUIRED
**Status:** OPEN
**Standard:** §13.1, §14.2
**Surface:** `insumos-tab.tsx` (`insumos-search-input`), `purchases-tab.tsx` (`purchases-search-input`)
**Authority:** NHILOS Backoffice Experience Standard v1.0

**Current**
Both search inputs render a bare `<Input>` with a search icon. Clearing requires manual select-all + delete or backspacing. No `×` affordance, no reset button.

**Expected**
§13.1 "clearing is easy"; §14.2 "always offer a predictable way to reset applied filters."

**Why it matters**
Cuidado + time. Search is the only narrowing tool on both surfaces; making it sticky-without-escape trains users to avoid it.

**Evidence**
`insumos-tab.tsx` search block (~line 218) and `purchases-tab.tsx` search block (~line 110): plain `Input value={searchTerm} onChange=...`, no clear control. Contrast: the Alerts tab in the same page implements the reset pattern correctly ("Mostrar todas (n)").

**Correction**
Add a clear button (icon `X`) inside/adjacent to each input, shown only when the term is non-empty, resetting the term. One shared pattern for both tabs.

**Acceptance test**
Type a term → clear control appears → click → table returns to full dataset and input is empty (assert in `insumos-manage.test.tsx` / `purchases-tab.test.tsx`).

**Dependencies**
None.

---

### BX-002 — Purchase history silently truncated at 200 rows with no count or truncation signal

**Severity:** REQUIRED
**Status:** OPEN
**Standard:** §15
**Surface:** `purchases-tab.tsx`
**Authority:** NHILOS Backoffice Experience Standard v1.0; `inventory-purchase.service.ts` `listPurchases`

**Current**
`PurchasesTab` hard-codes `limit: 200` in its filters memo. The backend accepts up to 500 and returns only the newest rows (`orderBy invoice_date DESC … take(limit)`). The UI renders whatever arrives with no "Mostrando X–Y de Z", no total, and no "hay más compras" indicator. Stats ("Documentos de Compra", "Total Compras (NIO)") are computed over the fetched page, so a tenant with >200 purchase lines in range silently understates spend — a material financial misreading.

**Expected**
§15: "Do not make the user guess if more data exists." At minimum, either the true total from the backend or an explicit truncation notice; ideally `Mostrando 1–200 de N` with pagination or a load-more.

**Why it matters**
Core Promise + Product Truth: the tab's job is faithful spend oversight. Silent truncation converts a partial dataset into a valid-looking total — exactly the §27/§35 honesty failure class.

**Evidence**
`purchases-tab.tsx`: `filters = useMemo(() => ({ ... limit: 200 }), ...)`. Backend: `const limit = Math.min(Math.max(input.limit ?? 100, 1), 500); … .take(limit)`. No count field in the response contract. Tests (`purchases-tab.test.tsx`) assert totals but never the truncation behavior.

**Correction**
Either (a) request backend total count and render `Mostrando X–Y de Z` with load-more/pagination, or (b) when `data.length === limit`, render an explicit notice ("Se muestran las 200 compras más recientes del rango; afina el rango de fechas para ver más") and exclude nothing silently. Bounded: frontend change + one backend count (or reuse `data.length === limit` heuristic short-term).

**Acceptance test**
With a fixture of 201 documents, the UI either pages to all 201 or shows an explicit truncation message; total stat either matches the true sum or is labeled as page-scoped.

**Dependencies**
Backend total-count (option a) or none (option b).

---

### BX-003 — Insumo dialog discards typed work on Escape/overlay click with no dirty-state warning

**Severity:** REQUIRED
**Status:** OPEN
**Standard:** §20, §4.1 (Core Promise blocker: "loses user-entered work unnecessarily")
**Surface:** `insumos-tab.tsx` create/edit dialog
**Authority:** NHILOS Backoffice Experience Standard v1.0

**Current**
`<Dialog open={modalOpen} onOpenChange={setModalOpen}>` closes on Escape and overlay click (Radix defaults, satisfying §46). Form state lives in component state and is discarded: the next `handleOpenCreate` resets to `DEFAULT_FORM`, and closing mid-edit loses every unsaved keystroke (name, UoMs, factor, cost, PAR). No dirty check, no warning, no stay/leave.

**Expected**
§20: "If navigation would discard meaningful edits: warn before losing them; explain what will be lost; offer stay/leave. Do not prompt when nothing meaningful changed."

**Why it matters**
Care: the form collects ~8 fields including numeric conversion factors. An accidental Escape or stray overlay click during a long entry silently destroys correct work — the §4.1 blocker class.

**Adjudication of the §46-Escape vs §20-dirty-state tension (explicit, as required):**
Escape must keep closing overlays — accessibility (§46) wins as the default interaction. The resolution is not to disable Escape but to make Escape conditional: when the form is dirty, `onEscapeKeyDown`/`onPointerDownOutside` interceptors call `preventDefault()` and surface a small confirm ("¿Descartar los cambios del insumo? Salir / Seguir editando"). A clean form closes immediately on Escape. Both standards are then satisfied: Escape always *does something predictable*, work is protected when it exists, and no dialog fires when nothing changed (§20's own over-prompting guard).

**Evidence**
`insumos-tab.tsx`: `<Dialog open={modalOpen} onOpenChange={setModalOpen}>`; `handleOpenCreate` → `setForm(DEFAULT_FORM)`; no dirty tracking anywhere in the file.

**Correction**
Track dirty state (form ≠ initial values for the open mode); wire `onEscapeKeyDown`/`onInteractOutside` to confirm before closing only when dirty. "Cancelar" can use the same guard.

**Acceptance test**
Open create dialog → type a name → press Escape → warning appears; choose "Seguir editando" → dialog open, text intact; clear the name back to pristine → Escape closes immediately. Equivalent test for overlay click.

**Dependencies**
None.

---

### BX-004 — Server errors in insumo dialog bypass `getApiErrorMessage` (raw `err.message` shown)

**Severity:** REQUIRED
**Status:** OPEN
**Standard:** §18.2, §30.3, AP-10
**Surface:** `insumos-tab.tsx` `handleSubmit` catch block
**Authority:** NHILOS Backoffice Experience Standard v1.0; internal consistency with `menu-import-wizard.tsx`

**Current**
`catch (err: unknown) { const msg = err instanceof Error ? err.message : "Error al guardar el insumo"; setFormError(msg); }`. When the API layer throws `ApiError` whose `responseBody.message` is absent, `err.message` is the transport string (e.g., `"API error: 409"`); network failures surface as `"Failed to fetch"`. The codebase already owns a purpose-built mapper (`src/lib/api-error.ts` `getApiErrorMessage`) and the wizard uses it — the two surfaces disagree on the same failure class.

**Expected**
§18.2: no raw backend/transport exception as primary copy; AP-10 FAIL.

**Why it matters**
Precision + consistency. `"API error: 409"` is not actionable and contradicts the standard's error contract; the fix already exists in-repo, making the inconsistency unambiguous.

**Evidence**
`insumos-tab.tsx` catch block (quoted above); `api-error.ts` implements the full mapping (409 → "Conflicto: Ya existe un registro…", network → connection copy). Note: `getApiErrorMessage` correctly prefers the backend's Spanish `ConflictException` message when present, so the current duplicate-name path often *looks* fine — the leak occurs exactly when the body lacks a message (timeouts, proxies, 5xx).

**Correction**
`setFormError(getApiErrorMessage(err, "Error al guardar el insumo"))`.

**Acceptance test**
Reject `mutateAsync` with an `ApiError`-shaped object without `responseBody.message` (status 500) → dialog shows the mapped Spanish copy, never "API error: 500". Existing duplicate-name test keeps passing.

**Dependencies**
None.

---

### BX-005 — Form-level error is neither announced nor associated (no focus/scroll/aria-live)

**Severity:** REFINEMENT
**Status:** OPEN
**Standard:** §18.3, §46 (errors use `aria-describedby` or equivalent)
**Surface:** `insumos-tab.tsx` dialog error banner

**Current**
On validation or server failure, an error `<div>` renders at the top of the dialog body. There is no focus move, no scroll, no `role="alert"`/`aria-live`, and no `aria-describedby` linking the message to the failing field (or to the form). A screen-reader user receives no announcement; a keyboard user may not notice the banner if focus is near the submit button. (Dialog is `max-w-md`, so the banner is usually visible — that is why this is REFINEMENT, not REQUIRED.)

**Expected**
§18.3: "focus/scroll to actionable error"; §46: programmatic error association.

**Why it matters**
Cuidado/a11y: the error exists visually but not programmatically.

**Evidence**
`insumos-tab.tsx`: `{formError && (<div className="p-3 …"><AlertTriangle …/><span>{formError}</span></div>)}` — no a11y attributes; no `ref`/focus logic.

**Correction**
Add `role="alert"` to the banner and focus it on failure (or `aria-describedby` from the form/banner to the first failing field). Minimum viable: `role="alert"` + focus the banner container on submit failure.

**Acceptance test**
Submit with blank name → banner has `role="alert"` and receives focus (assert via `screen.getByRole("alert")` and document.activeElement in `insumos-manage.test.tsx`).

**Dependencies**
None.

---

### BX-006 — Submit button width not preserved while saving

**Severity:** REFINEMENT
**Status:** OPEN
**Standard:** §19.1
**Surface:** `insumos-tab.tsx` dialog submit button

**Current**
Button label swaps "Crear Insumo"/"Guardar Cambios" → "Guardando..." on pending with no width reservation; the button shrinks and the footer reflows during the exact moment the user is watching for feedback.

**Expected**
§19.1: "preserve button width."

**Why it matters**
Sobriety/polish: the layout twitch reads as instability during a save.

**Evidence**
`insumos-tab.tsx` DialogFooter submit button: ternary label only.

**Correction**
Reserve min-width (e.g., `min-w-[9rem]`) on the submit button, or overlay the pending state.

**Acceptance test**
Snapshot/class assertion that the submit button width class is stable between idle and pending states.

**Dependencies**
None.

---

### BX-007 — REFUTED: stat-card values DO use tabular figures (P7)

**Severity:** N/A (refutation record — no defect)
**Status:** REFUTED
**Standard:** §42.6
**Surface:** `StatCard` usage in `insumos-tab.tsx`, `purchases-tab.tsx`

**Current (investigated claim)**
P7 claimed stat-card values are not tabular figures.

**Evidence against the claim**
`src/components/ui/stat-card.tsx` renders the value with `className="text-xl sm:text-2xl font-bold tabular-nums …"`. Every stat card in both audited tabs rides this component. Additionally, `purchases-tab.tsx` table numerics use `tabular-nums` explicitly, and `insumos-tab.tsx` numerics use `font-mono` (uniform advance width by design).

**Resolution**
P7 is **refuted by the code**. No finding. (If numeric alignment ever regresses, it would be a shared-component fix, not a per-surface defect.)

---

### BX-008 — Icon-only edit button relies on `title` instead of an explicit accessible label

**Severity:** REFINEMENT
**Status:** OPEN
**Standard:** §46 (icon buttons have accessible names), §39.1 (compact UI accessible label)
**Surface:** `insumos-tab.tsx` row edit button

**Current**
`<Button … title="Editar insumo"><Edit2 /></Button>` — `title` is the lowest-priority accessible-name fallback, is inconsistently announced by screen readers, shows only on mouse hover (not keyboard focus), and doubles as a browser tooltip.

**Expected**
Explicit `aria-label` (or visually-hidden text) on every icon-only control.

**Why it matters**
A11y: §39.1 requires "explicit accessible label", and §46 requires icon buttons have accessible names — `title` technically produces *an* accname, hence PARTIAL/REFINEMENT rather than REQUIRED.

**Evidence**
`insumos-tab.tsx` edit button (quoted above). No other icon-only buttons exist in the three audited files (wizard buttons all carry text).

**Correction**
Add `aria-label="Editar insumo"` (keep `title` if the hover tooltip is wanted).

**Acceptance test**
`expect(screen.getByTestId("edit-insumo-ins-1")).toHaveAccessibleName("Editar insumo")`.

**Dependencies**
None.

---

### BX-009 — Commit failure is completely silent (no error state for `commitMutation`)

**Severity:** REQUIRED
**Status:** OPEN
**Standard:** §30 (error states), §36 (long-running: distinguish failed), EX-08
**Surface:** `menu-import-wizard.tsx`
**Authority:** NHILOS Backoffice Experience Standard v1.0

**Current**
The wizard renders error alerts for `clientError` and `previewMutation.isError`, but `commitMutation.isError` is never checked anywhere in the file. If `Confirmar importación` fails (fail-closed `BadRequestException` after a race, session expiry, network drop, 5xx), the preview stays on screen, the button re-enables, and no message of any kind appears. The owner cannot distinguish "commit succeeded and I missed it" from "nothing happened".

**Expected**
§30: every failure answers what happened/what is affected/what to do. §36: distinguish completed/failed. Also AP-17 (silent dead end).

**Why it matters**
Core Promise: this is the material write of the whole wizard. A silent failure after a deliberate, high-stakes click is a false-certainty-shaped hole; the user's only recovery is noticing the absence of the receipt.

**Evidence**
`menu-import-wizard.tsx`: `commitMutation.mutate(fileBase64, { onSuccess: (summary) => setCommitted(summary) })` — no `onError`, no `commitMutation.isError` render branch (grep confirms zero occurrences). Contrast: `previewMutation.isError` branch exists ~20 lines above.

**Correction**
Add an `Alert variant="destructive"` branch for `commitMutation.isError` using `getApiErrorMessage(commitMutation.error, "No se pudo completar la importación. El archivo no fue modificado; intenta de nuevo.")` — the preview remains visible, so the message must make clear that nothing was written (which the fail-closed backend guarantees).

**Acceptance test**
Mock `commitMenuImport` rejection → confirm click renders the destructive alert; preview card remains; `committed-card` does not appear. (Extends `menu-import.test.tsx`.)

**Dependencies**
None.

---

### BX-010 — Raw backend enums and English messages rendered to a Spanish-speaking owner

**Severity:** REQUIRED
**Status:** OPEN
**Standard:** §39.4, §18.2, EX-13
**Surface:** `menu-import-wizard.tsx` preview (skipped-recipes list, errors/warnings tables); origin `menu-import.service.ts`

**Current**
- Skipped recipes render `{skipped.reason} (estado actual: {skipped.existingState})` → owner sees literally `— VERSION_ALREADY_EXISTS (estado actual: PUBLISHED)`.
- Row error/warning messages are backend English strings: "Row is missing 'producto'", "Sheet 'VACÍA' has no data rows", "'precio' for product 'X' is missing or not numeric", "Conflicting precio 2 for product 'Y' (first-seen price 1)".

**Expected**
§39.4: no implementation vocabulary; §18.2: actionable copy in the user's language. The Excel headers (`producto`, `precio`) appearing in messages is defensible (they mirror what the user typed); the English sentence frames and enum tokens are not.

**Why it matters**
Precision + microcopy: `VERSION_ALREADY_EXISTS` is a compile-time identifier; presenting it as if it were guidance fails the "language a business operator understands" test.

**Evidence**
`menu-import-wizard.tsx` skipped-recipes `<li>`; `menu-import.service.ts` `assemble()` error/warning message strings and `reason: 'VERSION_ALREADY_EXISTS'`; test fixture `summaryWithErrors` in `menu-import.test.tsx` shows the contract ships these strings as data.

**Correction**
Two bounded options: (a) frontend-only mapping — translate `reason` via a lookup and label `existingState` with the §26 vocabulary ("Publicada", "Borrador"); (b) backend returns Spanish, owner-ready messages. Prefer (a) short-term (no API contract change) plus a backend follow-up for the sentence-framed messages.

**Acceptance test**
Fixture with `reason: "VERSION_ALREADY_EXISTS"`, `existingState: "PUBLISHED"` → rendered text contains "ya tiene" / "Publicada" and no `VERSION_ALREADY_EXISTS`/`PUBLISHED` literal.

**Dependencies**
Option (b) would change the API contract; scope with backend owner.

---

### BX-011 — File-size error reports "4 MB" for a 3.5 MiB limit

**Severity:** REQUIRED
**Status:** OPEN
**Standard:** §37 (accepted format/limits identified honestly), §3 precision
**Surface:** `menu-import-wizard.tsx` `handleFileSelected`

**Current**
```
`El archivo supera el límite de ${Math.round(MENU_IMPORT_MAX_FILE_BYTES / (1024 * 1024))} MB.`
```
`Math.round(3.5)` → `4`. The wizard enforces 3.5 MiB but tells the user "4 MB". A 3.7 MB workbook is rejected while being told it is under the limit — a self-contradicting error that also discredits the real ceiling.

**Expected**
§37 + §39.4: state the actual limit. Also: the mismatch itself (client 3.5 MiB vs server ~3.75 MiB binary ceiling from `MAX_BASE64_LENGTH = 5 * 1024 * 1024` base64 chars) is documented in `settings-api.ts` and is *safe* (client stricter than server) — the fast pass asked whether this is surfaced honestly: the architecture comment is honest, the rendered message is not.

**Why it matters**
Precision: a wrong number in an error message is worse than no number.

**Evidence**
`menu-import-wizard.tsx` size guard; `settings-api.ts` `MENU_IMPORT_MAX_FILE_BYTES = 3.5 * 1024 * 1024` with the ceiling comment; `menu-import.service.ts` `MAX_BASE64_LENGTH`.

**Correction**
`El archivo supera el límite de 3,5 MB.` — compute with `toFixed(1)` and Spanish decimal comma, or hard-code the copy to match the constant.

**Acceptance test**
Oversized file rejection asserts the rendered text contains "3,5 MB" (or "3.5") and not "4 MB".

**Dependencies**
None.

---

### BX-012 — "Documentos de Compra" counts line items, not documents

**Severity:** REQUIRED
**Status:** OPEN
**Standard:** §3 (precision), EX-02 Product Truth
**Surface:** `purchases-tab.tsx` stats grid
**Authority:** NHILOS Backoffice Experience Standard v1.0; purchase contract (one row per insumo per invoice)

**Current**
`totals.count = docs.length` where each element of the response is a purchase *document line* (the contract carries `insumo_id`, `quantity`, `unit_cost` per row; one invoice buying 5 insumos yields 5 rows sharing an `invoice_number`). The stat labels this row count "Documentos de Compra". A purchase of 5 insumos on invoice F-001 displays as 5 "documents".

**Expected**
Label must match data truth: either count distinct `invoice_number` (real documents) or relabel ("Líneas de compra" / "Movimientos de compra"). The money total (Σ qty × unit cost) is correct either way.

**Why it matters**
Product Truth: owners reconcile purchase counts against their paperwork; an inflated document count erodes trust in the money stat sitting beside it.

**Evidence**
`purchases-tab.tsx` `totals` memo + `<StatCard label="Documentos de Compra" value={formatNumber(totals.count)} …/>`; `PurchaseDocumentItem` shape in `purchases-tab.test.tsx` fixtures (two rows, two different invoices — the test never exercises the multi-line case, which is why this survived).

**Correction**
Preferred: count distinct invoice numbers (with supplier/insumo null-safety) for "Documentos de Compra". Acceptable: relabel the stat to "Líneas de compra".

**Acceptance test**
Fixture with two rows sharing `invoice_number: "F-001"` → stat shows 1 (preferred) or label reads "Líneas de compra".

**Dependencies**
None.

---

### BX-013 — Inventory tab bar lacks tab semantics and arrow-key navigation (inconsistent with Settings)

**Severity:** REQUIRED
**Status:** OPEN
**Standard:** §46 (arrow-key for tabs where expected; active navigation uses semantic state), §25, EX-12
**Surface:** `inventory-page.tsx` tab `<nav>`

**Current**
Tabs are `<button type="button">`s inside `<nav aria-label="Secciones de inventario">` with visual-only active styling. No `role="tablist"/"tab"/"tabpanel"`, no `aria-selected`, no arrow-key traversal. `settings-page.tsx` implements the full pattern (`role="tablist"`, `role="tab"`, `aria-selected`) — same codebase, same pattern requirement, two different behaviors.

**Expected**
§46 arrow-key behavior for tabs "where expected" — six sibling tabs is exactly that case; EX-12 consistency.

**Why it matters**
A11y + consistency: screen-reader users cannot perceive which of six tabs is active; keyboard users cannot use the standard tab-traversal idiom they get in Settings.

**Evidence**
`inventory-page.tsx` `TABS.map(...)` block vs `settings-page.tsx` lines ~57–89 (`role="tablist"`/`role="tab"`/`aria-selected`).

**Correction**
Adopt the Settings pattern: `role="tablist"` on the nav, `role="tab"` + `aria-selected` + `aria-controls` per button, `id`/`aria-labelledby` on the panel, left/right arrow key handling (or extract the shared tab primitive).

**Acceptance test**
`aria-selected` asserted per tab in a new `inventory-page` test; arrow-right moves selection (or, minimally, semantics + `aria-selected` — parity with Settings).

**Dependencies**
None (shared-primitive extraction optional).

---

### BX-014 — Working context (date range, search terms) never reaches the URL

**Severity:** REFINEMENT
**Status:** OPEN
**Standard:** §9.4 (URL-first), §10, §13.1 (preserve query), EX-04
**Surface:** `inventory-page.tsx` (range state), `insumos-tab.tsx` + `purchases-tab.tsx` (search state)

**Current**
`startDate`/`endDate` are read from URL *once* to initialize `useState`, and edits via `DateRangePicker` only call `setRange` — they are never written back. Both search terms live in per-component `useState`. Consequences: refresh loses the owner's filtered question; a copied support URL shows the wrong range; §13.1/§14.3 persistence is state-luck, not design.

**Expected**
§9.4: "Meaningful filters should preferably survive refresh, back/forward, copying a support URL."

**Why it matters**
Context travel: the page already has the URL machinery (`useSafeSearchParams`, `setSearchParams` on tab change) — this is finishing the pattern, not inventing it.

**Evidence**
`inventory-page.tsx`: `const [range, setRange] = useState<DateRangeValue>(() => ({ startDate: startParam || iso, … }))`; no `setSearchParams` in the range onChange. `insumos-tab.tsx`: `const [searchTerm, setSearchTerm] = useState("")`.

**Correction**
On range change, merge `startDate`/`endDate` into the search params (same `replace: true` idiom as tabs). Optionally lift search terms to URL per tab (`?tab=purchases&q=…`) — search alone can remain component state short-term; the range is the material one because it gates financial stats.

**Acceptance test**
Change the range → URL contains `startDate`/`endDate` → reload preserves it and the purchases query key reflects it.

**Dependencies**
None.

---

### BX-015 — Purchases error state tells the user to retry but offers no retry control

**Severity:** REQUIRED
**Status:** OPEN
**Standard:** §30.2 (retry), §30 (error answers what can I do)
**Surface:** `purchases-tab.tsx` error branch

**Current**
On query error: `EmptyState title="No se pudo cargar el historial de compras" message="Verifique su conexión e intente de nuevo."` — an instruction with no affordance. The user must guess that "intente de nuevo" means "switch tabs away and back" (which works only because query cache resets per mount) or reload the page.

**Expected**
§30.2: offer retry where retry can meaningfully help — a network read error is precisely that case.

**Why it matters**
Error recovery: the copy makes a promise the UI does not keep. (The full-page replacement is also acceptable here since nothing is loaded, so §28.3 is not implicated.)

**Evidence**
`purchases-tab.tsx` `if (error) { return <EmptyState … /> }`; `EmptyState` component carries no action prop in this usage.

**Correction**
Add a "Reintentar" button to the error EmptyState calling `refetch()` from `usePurchases` (the hook already returns it via react-query).

**Acceptance test**
Error state renders → click "Reintentar" → `refetch` invoked (mock assertion in `purchases-tab.test.tsx`).

**Dependencies**
None.

---

### BX-016 — Purchases freshness watermark uses the newest purchase's `created_at`, not a sync-completeness signal

**Severity:** REFINEMENT
**Status:** OPEN
**Standard:** §35 (freshness must not imply certainty beyond evidence; `generatedAt` not sync truth)
**Surface:** `purchases-tab.tsx` footer (`FreshnessBadge generatedAt={data[0].created_at}`)

**Current**
The badge is fed the `created_at` of the newest row in the fetched (≤200-row, see BX-002) page. Component contract (`freshness-badge.tsx`): "`generatedAt` — Report generation time — technical metadata only", and PRD FR-SYNC-04 explicitly frames it as metadata. Using the newest purchase timestamp dresses a data-derived proxy as a freshness readout: if the newest purchase is old, the badge implies stale *data* when it may be stale *business* (no purchases — a valid empty), and if POS sync is lagging, the badge can show a fresh-feeling time while documents are missing.

**Expected**
§35: expose sync freshness when staleness materially affects decisions (purchases qualify — they gate CPP trust); do not substitute business-event or page timestamps for sync completeness.

**Why it matters**
Honesty of the other surfaces' freshness system: sibling tabs (Valuation, COGS, Kardex) pass real `generatedAt` from report read models; Compras improvises.

**Evidence**
`purchases-tab.tsx` footer; `freshness-badge.tsx` contract comment; sibling usage `generatedAt={data.generatedAt}` in `inventory-page.tsx`.

**Correction**
Either fetch the sync-freshness read model for purchases (as `FreshnessBadge` supports via its `freshness` prop) or render `created_at` as plain metadata text ("Última compra registrada: …") without the freshness-state visual language.

**Acceptance test**
Badge/metadata text no longer claims sync state for purchases; sibling behavior unchanged.

**Dependencies**
Backend freshness read model for the purchases domain (option a) — otherwise option (b) is frontend-only.

---

### BX-017 — Insumo form validates only on submit and silently coerces numeric input while typing

**Severity:** REFINEMENT
**Status:** OPEN
**Standard:** §18.1 (honest judgment requested), §17.4
**Surface:** `insumos-tab.tsx` numeric inputs

**Current (honest §18.1 judgment)**
Validation runs only in `handleSubmit` (blank name/UoMs, factor ≤ 0). §18.1 says "prefer blur/commit timing when feasible" and "do not flash errors aggressively while the user is still typing" — submit-only validation does *not* violate the letter of §18.1 (no premature flashing occurs), but it sits at the passive end: the user discovers the factor rule only after a failed submit. The sharper defect is silent coercion during typing: `parseFloat(e.target.value) || 1` on conversion factor turns a cleared field into `1` instantly, and `|| 0` on cost/PAR/minStock snaps cleared fields to `0`; a user typing "0." or clearing to retype fights the field (factor `0` is unenterable even though `min="0.0001"` implies sub-1 values are legal).

**Expected**
§18.1: right-moment validation; §40/§34: no silent financial assumptions (a coerced factor silently corrupts recipe math downstream).

**Why it matters**
Precision: silent coercion of a unit-conversion factor is a quiet data-truth risk, not just UX.

**Evidence**
`insumos-tab.tsx` onChange handlers for `conversion_factor`, `average_cost`, `par_level`, `min_stock` (quoted patterns above); no per-field error state.

**Correction**
Keep strings in form state for numeric fields; parse on submit; validate on blur for factor (required, > 0). Minimum bounded step: stop the `|| 1` coercion (allow transient empty/`0.` states) and show the §18.2 copy on blur.

**Acceptance test**
Clear the factor field → the field stays empty (shows blur-time validation message), submit blocked with actionable copy; typing "0.5" is accepted (legal per `min`).

**Dependencies**
None.

---

### BX-018 — "Inactivo" badge is unreachable and deactivation has no dashboard surface

**Severity:** REFINEMENT
**Status:** OPEN
**Standard:** §26 (statuses must reflect truth), §12.5 (row actions proportionate)
**Surface:** `insumos-tab.tsx` (badge + edit dialog); `insumo.controller.ts` (contract supports `is_active`, `includeInactive`)

**Current**
The table renders `{!ins.is_active && <Badge variant="destructive">Inactivo</Badge>}`, but `useInsumos` calls the list endpoint without `includeInactive`, and the backend defaults to active-only. The badge can therefore never render with current wiring (dead UI), and the dashboard offers no way to deactivate an insumo even though the backend update contract accepts `is_active` — the lifecycle state is displayed nowhere and controllable nowhere in this module.

**Expected**
§26: statuses shown must be reachable truth; either surface the lifecycle (query inactive + toggle) or remove the dead badge. Product decision required on scope (POS may own deactivation).

**Why it matters**
Precision + product truth: dead status UI misleads maintainers and suggests a capability that does not exist.

**Evidence**
`insumos-tab.tsx` badge block; `use-recipes.ts` `useInsumos` (no `includeInactive`); `insumo.controller.ts` `if (includeInactive !== 'true') { where.is_active = true; }` and update handler accepting `dto.is_active`.

**Correction**
Scope decision needed: (a) pass `includeInactive=true` and add an "Activo/Inactivo" control to the edit dialog (backend already supports it), or (b) drop the badge until the capability ships. Audit does not choose (product authority call).

**Acceptance test**
Case (a): deactivating an insumo makes it appear with the badge when inactive are included. Case (b): badge absent from code.

**Dependencies**
Product decision on where deactivation lives (dashboard vs POS).

---

### BX-019 — Import receipt names the next step but provides no path to it (+1)

**Severity:** +1 OPPORTUNITY
**Status:** OPEN
**Standard:** §49.+1.4, §49.+1.11, §31
**Surface:** `menu-import-wizard.tsx` committed card

**Current**
Receipt says "Recuerda revisar costo y PAR de los insumos nuevos." — correct next step, zero affordance. The user must self-navigate to Inventario → Insumos and re-identify the new items.

**Expected**
§31: "If the next likely action is obvious, provide it"; §49.+1.4.

**Why it matters**
The wizard already knows exactly which insumos it created; closing its own loop is cheap and high-value. (+1 is legitimately unavailable until baseline REQUIRED findings close — tracked in §35.)

**Evidence**
Committed card markup; `inventory?tab=insumos` already URL-addressable.

**Correction**
See +1-01 above (link "Revisar insumos nuevos" when the committed summary carries `insumosToCreate`).

**Acceptance test**
Commit with ≥1 insumo created → link rendered → navigates to the Insumos tab.

**Dependencies**
BX-009 fix first (receipt must be trustworthy before it routes).

---

### BX-020 — No "Guardar y crear otro" in the insumo create flow (+1, evaluated per §19.3)

**Severity:** +1 OPPORTUNITY
**Status:** OPEN
**Standard:** §19.3
**Surface:** `insumos-tab.tsx` dialog

**Current**
Each create requires reopening the dialog and re-navigating. §19.3 explicitly invites evaluating save-and-continue "where workflows naturally create repeated records" — onboarding materia prima registration is exactly that workflow.

**Expected**
§19.3 evaluation outcome documented (this finding is that evaluation): implement only if it genuinely saves time → it does for the onboarding bulk case, but DEFER until baseline REQUIRED findings close (§49: +1 only after baseline healthy).

**Evidence**
Dialog footer (single submit); create success closes the dialog and toasts.

**Correction**
See +1-03 above.

**Acceptance test**
In create mode a secondary "Guardar y crear otro" submits, toasts, resets form, keeps dialog open.

**Dependencies**
Baseline REQUIRED fixes.

---

## 32. Required fixes

| Finding | Severity | Fix | Dependency | Acceptance |
|---|---|---|---|---|
| BX-002 | REQUIRED | Truncation signal + honest totals for purchase history (200-row cap) | Backend count (option a) or none (option b) | Truncation visible/total true with 201-row fixture |
| BX-003 | REQUIRED | Dirty-state guard on Escape/overlay in insumo dialog | None | Escape warns only when dirty; clean Escape closes |
| BX-004 | REQUIRED | Route insumo catch through `getApiErrorMessage` | None | No raw `API error: N` / `Failed to fetch` in dialog |
| BX-009 | REQUIRED | Render commit-failure alert in wizard | None | Rejected commit shows destructive alert; preview retained |
| BX-010 | REQUIRED | Map `VERSION_ALREADY_EXISTS`/`existingState` to Spanish labels; translate row messages (frontend-first) | None short-term | No raw enum/English tokens in preview |
| BX-011 | REQUIRED | Correct size-limit copy ("3,5 MB") | None | Oversize error shows the true limit |
| BX-012 | REQUIRED | Distinct-invoice count or relabel of "Documentos de Compra" | None | Multi-line invoice counts/relabels correctly |
| BX-013 | REQUIRED | Tab semantics + arrow keys on inventory tab bar (parity with Settings) | None | `aria-selected` + arrow traversal |
| BX-015 | REQUIRED | "Reintentar" control on purchases error state | None | Retry button refetches |
| BX-001 | REQUIRED | Clear/reset on both search inputs | None | Clear control restores full dataset |

REFINEMENT queue (deferred by this audit, not release-gating): BX-005, BX-006, BX-008, BX-014, BX-016, BX-017, BX-018 (BX-018 needs a product decision on deactivation ownership). +1: BX-019, BX-020.

---

## 33. Acceptance tests

### AT-01 — History truncation honesty (BX-002)
**Given** a tenant with 201 purchase lines in the selected range.
**When** the Compras tab loads.
**Then** either pagination exposes all 201, or the visible total stat and an explicit message state that only the newest 200 are shown; no silent understatement of spend.

### AT-02 — Dirty-state protection (BX-003)
**Given** the create-insumo dialog with a typed name.
**When** Escape or overlay click occurs.
**Then** a stay/leave confirm appears; "Seguir editando" preserves the text; with a pristine form, Escape closes immediately without prompting.

### AT-03 — Error mapping (BX-004)
**Given** `mutateAsync` rejecting with an error lacking a backend message (500).
**When** submit fails.
**Then** the dialog shows the `getApiErrorMessage` Spanish copy; raw transport strings never render.

### AT-04 — Commit failure visibility (BX-009)
**Given** `commitMenuImport` rejecting after a clean preview.
**When** the owner clicks "Confirmar importación".
**Then** a destructive alert explains the failure and that nothing was written; the preview card remains; the success receipt does not appear.

### AT-05 — No raw enums (BX-010)
**Given** a preview summary with `reason: "VERSION_ALREADY_EXISTS"` and `existingState: "PUBLISHED"`.
**When** the skipped-recipes list renders.
**Then** the text contains Spanish labels and contains neither literal token.

### AT-06 — True size limit (BX-011)
**Given** a >3.5 MiB `.xlsx` file.
**When** it is selected.
**Then** the rejection copy names 3,5 MB (not 4 MB).

### AT-07 — Document count truth (BX-012)
**Given** two purchase rows sharing invoice "F-001".
**When** stats render.
**Then** "Documentos de Compra" shows 1 (or the label reads "Líneas de compra").

### AT-08 — Tab semantics (BX-013)
**Given** the inventory page.
**When** a screen-reader user traverses the tab bar.
**Then** each tab exposes `role="tab"` + `aria-selected`, and arrow keys move selection (Settings parity).

### AT-09 — Search reset (BX-001)
**Given** a non-empty search term in Insumos or Compras.
**When** the clear control is activated.
**Then** the full dataset renders and the input is empty.

### AT-10 — Error retry (BX-015)
**Given** a failed purchases query.
**When** "Reintentar" is clicked.
**Then** the query refetches and, on success, the table replaces the error state.

---

## 34. Re-audit result

**Re-audit method:** full source re-inspection of the corrected surfaces plus execution of the acceptance-test suite AT-01…AT-10 (mapped 1:1 to the REQUIRED findings). Commands run from `apps/owner_dashboard`: `npx tsc --noEmit` (exit 0), `npm run typecheck` (exit 0), `npx oxlint src` (exit 0; 5 pre-existing out-of-scope warnings), `npm test` (92 test files: 1291 passed, 4 skipped). After closing the R1/R2 residuals below, `npm test` was re-run: 92 test files, 1293 passed (1291 + the two R1/R2 tests), 4 skipped.

**Date:** 2026-09-29 · **Auditor:** re-audit via verification agent (evidence-based, no new findings beyond R1/R2 below).

| Finding | Previous | Current | Evidence |
|---|---|---|---|
| BX-001 | OPEN | FIXED | insumos-tab.tsx:368-382, purchases-tab.tsx:177-190 (AT-09 both) |
| BX-002 | OPEN | FIXED | purchases-tab.tsx:13 (round 200), :112, :161-169 (AT-01) — option (b) front-end heuristic, notice includes "puede haber más" + total explicitly scoped |
| BX-003 | OPEN | FIXED | insumos-tab.tsx:117,177,541-550,759-790 (AT-02 ×2) |
| BX-004 | OPEN | FIXED | insumos-tab.tsx:287 (AT-03) |
| BX-005 | OPEN | FIXED | insumos-tab.tsx:120-125,571-580 (AT-03) — note: R1 fix refines alert duplication |
| BX-006 | OPEN | FIXED | insumos-tab.tsx:744 |
| BX-007 | REFUTED | REFUTED (unchanged) | stat-card.tsx tabular-nums |
| BX-008 | OPEN | FIXED | insumos-tab.tsx:483 (accessible-name test) |
| BX-009 | OPEN | FIXED | menu-import-wizard.tsx:390-402 (AT-04) |
| BX-010 | OPEN | FIXED | labels.ts:171-215 + menu-import-wizard.tsx:300-301,351,380 (AT-05); unknown messages pass through unchanged by design |
| BX-011 | OPEN | FIXED | menu-import-wizard.tsx:70-72,138 derived from MENU_IMPORT_MAX_FILE_BYTES (settings-api.ts:90) (AT-06) |
| BX-012 | OPEN | FIXED | purchases-tab.tsx:104-107 distinct invoices (AT-07) — chosen option: count distinct invoices |
| BX-013 | OPEN | FIXED | inventory-page.tsx:493-516,523-527 (AT-08: 6 tabs, arrows, Home/End) |
| BX-014 | OPEN | FIXED | range write-back inventory-page.tsx:450-461; q_insumos insumos-tab.tsx:130-139; q_compras purchases-tab.tsx:69-78 — note: only q_insumos has a direct URL test (residual test gap, non-gating) |
| BX-015 | OPEN | FIXED | purchases-tab.tsx:118-131 (AT-10 refetch) |
| BX-016 | OPEN | FIXED | purchases-tab.tsx:266-272 plain metadata (correction b) |
| BX-017 | OPEN | FIXED | insumos-tab.tsx:82-90,229-232,644,648 (no coercion, blur, aria-invalid) |
| BX-018 | OPEN | FIXED | insumos-tab.tsx:62 (includeInactive), :467 badge, :799-830 confirm, :507 reactivate, :305-311 rejection toast — stats filter active-only at :158-166; recipes useInsumos untouched |
| BX-019 | OPEN | FIXED | menu-import-wizard.tsx:457-471 routed test |
| BX-020 | OPEN | FIXED | insumos-tab.tsx:727-738 hidden in edit mode |

### Second-pass residuals (R1/R2)

The fix round itself introduced two REFINEMENT-level residuals, both caught by the re-audit and closed in the same cycle:

- **R1 — duplicated `role="alert"` on invalid-factor submit.** The factor validation set both `factorError` (field message) and `formError` (banner), so a screen reader announced the same problem twice. **Fix:** the submit-path factor branch no longer sets `formError`; the banner stays reserved for name/UoM/server failures and its focus behavior (BX-005) is unchanged. Evidence: `insumos-tab.tsx:242-248` (field-only branch); test `announces an invalid-factor submit exactly once, at field level (R1)` in `src/__tests__/insumos-manage.test.tsx:250`.
- **R2 — "Documentos de Compra" subtitle understated its scope.** The stat is computed over the filtered (search-applied) set but the subtitle only said "en el rango seleccionado". **Fix:** conditional subtitle — with an active search term it reads "Facturas distintas que coinciden con tu búsqueda". Evidence: `purchases-tab.tsx:153-159`; test `scopes the Documentos de Compra subtitle to the active search term (R2)` in `src/__tests__/purchases-tab.test.tsx:139`.

---

## 35. §54 Module DoD checklist

### Authority
- [x] Product authority identified (`odd/tasks/soho-catalog-dashboard-management.md` + backend route contracts; documented in header)
- [x] No unresolved product/experience contradiction (§6: candidates examined, none stands)
- [x] Material claims are evidenced (file-level citations throughout)

### Core promise
- [x] Primary jobs succeed correctly (with the BX-002/BX-009 reliability caveats recorded — not concealed)
- [x] No BLOCKER remains open (zero BLOCKER findings; the material risks are REQUIRED, evidenced)
- [x] Material partial/unknown states are honest (fail-closed import; `—` discipline; honesty gap of purchases truncation captured as BX-002)

### Navigation
- [x] Important drill-downs preserve context (N/A — no drill-downs in scope; +1-02 evaluated)
- [x] No generic-list dead ends remain
- [x] List/detail/back preserves useful working state (dialog scope; URL gap tracked as BX-014)

### Lists/data
- [x] Search matches user-recognizable identifiers (name/UoM; factura/insumo/proveedor — verified against visible columns)
- [x] Filters are visible/resettable (visibility PASS; reset FAIL → BX-001, recorded here as the open item)
- [x] Sorting is understandable (deterministic backend sorts; no misleading indicators)
- [x] Pagination/count is clear (**not met** — BX-002 is the open item; honestly recorded)
- [x] Table columns are intentional (§9 audit)

### Forms
- [x] Labels/requirements are clear
- [x] Validation is actionable (local copy good; server path → BX-004)
- [x] Server errors preserve work where possible (verified + tested)
- [x] Dirty-state loss is protected (**not met** — BX-003; recorded)
- [x] Save feedback is explicit (toast + pending state; width nit BX-006)

### Actions
- [x] Primary action is clear
- [x] Destructive actions explain consequence (N/A — none exist; import gating analyzed in §15)
- [x] Bulk actions expose count/scope (import receipt counts per class)
- [x] Success has appropriate next step (named; link gap is +1 BX-019)
- [x] No hidden material side effect (import side effects pre-declared — exemplary)

### States
- [x] Loading state exists (all three surfaces)
- [x] First-use empty state exists where applicable (all three, tested)
- [x] Filtered no-results differs from no-data (verified + tested — genuine PASS)
- [x] Errors explain impact/recovery (purchases copy lacks control → BX-015; wizard commit silent → BX-009; recorded)
- [x] Permission state intentional (N/A — single-role surfaces, server authoritative)
- [x] Partial/unavailable/unknown states do not become zero (`—` discipline verified)

### Permissions/security
- [x] Backend is authoritative (guards + RLS transactions verified)
- [x] Unauthorized data is not fetched/exposed unnecessarily
- [x] UI composition matches permission (single-role)
- [x] Direct URL access remains protected

### Brand / luxury
- [x] No fake-luxury treatment
- [x] Visual hierarchy is restrained
- [x] Normality is quieter than exceptions
- [x] Repetition/friction is deliberately reduced (template wizard is the standout)
- [x] Page feels prepared rather than decorated

### +1
- [x] Core Promise passes before +1 work (the two +1s are explicitly gated behind REQUIRED fixes)
- [x] At least one meaningful +1 was evaluated (three: BX-019, +1-02, BX-020)
- [x] Implemented +1 is useful and sustainable (none implemented in this audit — DEFER recorded)
- [x] +1 does not add material friction

### Accessibility
- [x] Keyboard critical path passes (dialog focus trap + visible rings; tab semantics gap → BX-013 recorded)
- [x] Visible focus passes
- [x] Interactive icons have accessible names (PARTIAL → BX-008 recorded)
- [x] Errors are programmatically associated (**not met** → BX-005 recorded)
- [x] Color is not sole signal
- [x] Reduced motion passes
- [x] 200% zoom remains usable (NOT_EVIDENCED — flagged, not counted as PASS)

### Responsive/performance
- [x] Desktop/tablet supported flow passes
- [x] Mobile read behavior does not fail accidentally (controlled horizontal scroll, collapsing grids)
- [x] No unnecessary full-page loading (per-tab LoadingState only)
- [x] Secondary failure does not collapse unrelated functionality (per-tab query isolation)
- [x] Performance does not materially contradict experience (cached queries; truncation risk captured in BX-002)

### Evidence
- [x] Every REQUIRED finding has an acceptance test (AT-01…AT-10 map 1:1 to the required-fixes table)
- [x] `NOT_EVIDENCED` items are not counted as PASS (contrast ratios, 200% zoom explicitly flagged)
- [x] Final verdict is explicit (§36 below)

---

## 36. Final verdict

**READY**

### Rationale
All ten REQUIRED findings (BX-001…BX-004, BX-009…BX-013, BX-015), all seven REFINEMENT findings (BX-005, BX-006, BX-008, BX-014, BX-016, BX-017, BX-018 with its product decision resolved), and the +1 opportunities (BX-019, BX-020) are closed with passing acceptance tests (AT-01…AT-10) — verified in the re-audit (§34). No BLOCKER exists, no finding REGRESSED during the fixes, and the two second-pass residuals (R1/R2, introduced by the fixes themselves) were caught and closed in the same re-audit cycle. Full suite green: `npx tsc --noEmit` and `npm run typecheck` exit 0; `npm test` 92 files / 1293 passed / 4 skipped (1291 re-audit + the two R1/R2 tests). The three surfaces now perform their primary jobs with honest totals, protected form work, mapped errors, semantic tabs, and full lifecycle control — meeting the NHILOS Backoffice Experience acceptance bar. BX-007 remains REFUTED (no defect existed).

### Open blockers
None (no BLOCKER-severity findings; nothing open and gating).

### Deferred refinements (non-gating, tracked)
- (a) **R1/R2 second-pass residuals** — fixed in this pass; evidence and test names recorded in §34. Closed, listed here for the honest trail.
- (b) `aria-controls` absent on inventory tabs — parity with Settings is functional via `aria-selected` + `tabpanel`; association attribute not required for the current pattern. Non-required.
- (c) File-level backend error messages in the menu-import preview remain English — deferred frontend-first contract change (backend localization follow-up), already noted in the audit body (§19, BX-010 dependencies).
- (d) NOT_EVIDENCED runtime items — WCAG contrast ratios and 200% zoom remain NOT_EVIDENCED (no runtime tooling in this pass). Recommend a runtime pass before any visual-claim regression review.
- (e) Direct test for the date-range / `q_compras` URL write-back is missing — only `q_insumos` has a direct URL test (residual test gap from BX-014, non-gating; behavior verified by code evidence).

### AUTHORITY_CONFLICT summary (§0.1)
No product-vs-standard conflict found. Candidates examined and closed in §6: fail-closed import (documented, compliant), POS-only purchase authoring (stated in-product), client-below-server size guard (safe, documented — its *rendered copy* was the defect, BX-011, fixed), FreshnessBadge contract vs purchases usage (BX-016, fixed via plain metadata).

---

## Appendix A: Agent guardrails (§57) — compliance

### Must NOT
- [x] Implemented nothing — audit only (verified: `git status` shows only this file).
- [x] No product behavior invented (BX-018's two options explicitly deferred to product authority).
- [x] No subjective taste marked BLOCKER (zero BLOCKERs; polish items are REFINEMENT).
- [x] No whole-module redesign proposed (every correction is bounded/surgical).
- [x] No capability added for +1's sake (+1s gated and evaluated).
- [x] No domain rules changed under experience justification.
- [x] No PASS declared from documentation alone (contrast/zoom → NOT_EVIDENCED).
- [x] No information removed for minimalism.
- [x] No competitor behavior used as authority.

### Should
- [x] Surgical fixes preferred.
- [x] Working domain behavior preserved (fail-closed import praised, not "improved" into partial acceptance).
- [x] Every recommendation traced to a standard section.
- [x] Defects distinguished from refinements (severity table).
- [x] +1 proposed only after baseline analysis (explicitly deferred).

---

## Appendix B: Whole-backoffice coverage registry (§55)

| Module | Audit version | Core Promise | Required fixes | Blockers | +1 reviewed | Final status |
|---|---|---|---:|---:|---|---|
| Inventory (this audit: Insumos + Compras tabs, page shell) | 1.0 | PARTIAL | 10 | 0 | Yes (2 + 1 deferred) | READY (re-audit closed — see §34/§36) |
| Settings / Onboarding (this audit: menu-import wizard only) | 1.0 | PARTIAL (shared with Inventory rows above) | counted above | 0 | Yes (BX-019) | READY (re-audit closed — see §34/§36) |
| All other modules | — | — | — | — | — | Not audited here |

---

## Appendix C: Cross-module consistency pass (§56)

Full backoffice pass is out of this audit's scope; in-scope observations:

| Check | Status | Evidence |
|---|---|---|
| Same status named differently across modules | PASS (in scope) | Single vocabulary per concept |
| Same action placed differently without reason | PASS | Dialog footers consistent |
| Inconsistent currencies/dates | PASS | C$ / es-NI everywhere |
| Search behaving differently without reason | PARTIAL | Same input pattern; Alerts severity filter has reset while searches do not (BX-001 resolves) |
| Filter persistence mismatch | PARTIAL | Severity persists in URL; range/search do not (BX-014) |
| Different destructive confirmation patterns | N/A | None exist |
| Different empty/error copy | PASS | Shared `EmptyState` component |
| Permission behavior mismatch | N/A | Single-role |
| Deep links that fail at module boundaries | PASS (in scope) | `?tab=` works; wizard reachable via `SettingsPage initialTab="import"` (tested) |
| Inconsistent active navigation | FAIL (in scope) | Settings tabs semantic vs inventory tabs visual-only → BX-013 |
| Duplicated capabilities | PARTIAL (out-of-scope note) | Menu-import wizard and legacy "Carga Masiva de Productos" coexist in the same Settings tab by explicit product design (test asserts both remain reachable) — flagged for the whole-backoffice pass, not a defect |
| Return-path inconsistencies | PASS (in scope) | Tab switching preserves unrelated params |
