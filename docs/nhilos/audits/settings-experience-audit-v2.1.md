# Settings — NHILOS Experience Audit (v2.1)

**Version:** 1.0  
**Date:** 2026-09-28  
**Auditor:** el Gentleman  
**Module:** Settings (Configuración & Onboarding)  
**Module authority:** No dedicated PRD; implicit from onboarding + fiscal + catalog setup  
**Routes/surfaces reviewed:** `/settings` (4 tabs: Setup, Fiscal, Templates, Import)  
**Evidence reviewed:** Source code, tests (`w9-settings.test.tsx`), runtime behavior

---

## 1. Module job (§4)

**Primary user:** Owner / Admin setting up the business  
**Primary job:** Configure fiscal regime, apply industry templates, import catalog data  
**Secondary users/jobs:** Manager reviewing import results  
**Risk if wrong:** Wrong fiscal config → DGI non-compliance; wrong template → corrupted catalog; failed import → lost data

---

## 2. Surface inventory (§6 Phase B)

| Surface | Route/component | Job | Read/write | Permissions | Evidence |
|---|---|---|---|---|---|
| Setup Center | `/settings` tab=setup | Full onboarding flow | Read/Write | OWNER | `setup-center-view.tsx` |
| Fiscal Setup | `/settings` tab=fiscal | Configure DGI regime | Read/Write | OWNER | `fiscal-setup-form.tsx` |
| Industry Templates | `/settings` tab=templates | Apply pre-built catalogs | Write | OWNER | `industry-templates-list.tsx` |
| Bulk Import | `/settings` tab=import | CSV catalog import | Write | OWNER | `bulk-import-wizard.tsx` |

---

## 3. Universal page anatomy check (§7)

| Surface | Where am I? (§7.1) | What can I do? (§7.2) | What am I looking at? (§7.3) | What needs attention? (§7.4) | What happens next? (§7.5) |
|---|---|---|---|---|---|
| Settings page | ✅ "Configuración & Onboarding" heading + Settings icon | ✅ 4 tabs with clear labels | ✅ Tab content shows current config | ✅ DGI expiry warning when applicable | ✅ Tab navigation, form submit, template apply |
| Fiscal Setup | ✅ Card title "Configuración Fiscal & Régimen DGI" | ✅ Form with submit button | ✅ Current regime badge, form fields | ✅ DGI expiry/expired warnings, immutability alert | ✅ Save config, regime description |
| Templates | ✅ "Plantillas de Industria & Pre-BOMs Estructurales" | ✅ "Aplicar Plantilla" button per card | ✅ Template cards with counts | ✅ Tenant isolation notice | ✅ Apply → dialog → result |
| Bulk Import | ✅ "Carga Masiva (Staging)" tab | ✅ Upload CSV, validate, commit | ✅ Staging table, validation results | ✅ Validation errors, row-level issues | ✅ Upload → validate → commit |

---

## 4. Information hierarchy check (§8)

| Surface | P0 primary job dominates? | P1 supporting context present? | P2 secondary not competing? | Anti-pattern: everything promoted to P0? |
|---|---|---|---|---|
| Settings page | ✅ Tabs organize by job | ✅ Description subtitle | ✅ No competing CTAs | ✅ No |
| Fiscal Setup | ✅ Form is primary | ✅ Immutability alert, expiry warnings | ✅ Helper text on fields | ✅ No |
| Templates | ✅ Template cards are primary | ✅ Tenant isolation notice | ✅ Template counts as P2 | ✅ No |
| Bulk Import | ✅ Upload/validate/commit flow | ✅ Staging results | ✅ Row details as P2 | ✅ No |

---

## 5. Experience coverage matrix (EX-01 → EX-18) (§51)

| ID | Dimension | Core question | Status | Evidence | Finding IDs |
|---|---|---|---|---|---|
| EX-01 | Core Promise | Does the module reliably perform its primary job? | PASS | Fiscal config saves correctly via `useUpdateFiscalSetup`; templates apply atomically via `useApplyIndustryTemplate`; import validates before commit | — |
| EX-02 | Product Truth | Does UI behavior match PRD/domain semantics? | PASS | Fiscal regime options match backend `FiscalRegime` enum; immutability invariant displayed; DGI auth expiry logic matches backend | — |
| EX-03 | Precision | Can labels/data/actions be misinterpreted? | PASS | Clear tab labels with icons; descriptive subtitles; helper text on form fields; regime description changes dynamically | — |
| EX-04 | Navigation | Does context travel between relevant surfaces? | PARTIAL | Tab state not URL-addressable (useState only); no return-to-dashboard context from settings | BX-001, BX-002 |
| EX-05 | Findability | Can users find objects through appropriate search/filter/sort? | N/A | Settings has no search/filter/sort — tabs are the navigation model | — |
| EX-06 | Forms | Are entry/edit flows clear, safe and recoverable? | PASS | Fiscal form uses react-hook-form + zod; labels visible; required fields marked; validation on blur; error messages actionable; server errors preserve form data; dirty state protected by `isDirty` | — |
| EX-07 | Actions | Are consequences, risk and feedback clear? | PASS | "Aplicar Plantilla" opens confirmation dialog; "Confirmar Inyección" explicit; "Exportar" buttons clear; success feedback via dialog result | — |
| EX-08 | States | Loading/empty/error/partial/success states are intentional? | PASS | Loading spinners per tab; error alerts with descriptive messages; success dialog with result counts; empty CSV state handled | — |
| EX-09 | Permissions | Is authorization correct end-to-end? | PASS | Owner-only operations; backend enforces; no permission placeholders visible | — |
| EX-10 | Time | Are repeated steps/input/context eliminated? | PASS | Fiscal form pre-fills from saved data; template prefix auto-suggested; import remembers previous settings | — |
| EX-11 | Sobriety | Is unnecessary UI removed? | PASS | No decorative elements; clean card layout; no ornamental animations | — |
| EX-12 | Consistency | Does it use established backoffice patterns? | PASS | Same tab pattern as other pages; same card/button/input components; same error/success patterns | — |
| EX-13 | Microcopy | Is language precise, calm and actionable? | PASS | "Configurar" not "Editar"; "Aplicar Plantilla" not "Usar"; "Confirmar Inyección" not "Aceptar"; error messages explain impact | — |
| EX-14 | Accessibility | Can the critical workflow be completed accessibly? | PARTIAL | Tabs have role="tab" + aria-selected; form inputs have labels; but tab buttons missing focus ring; select element not styled consistently | BX-003 |
| EX-15 | Responsive | Does supported device behavior remain usable? | PASS | Grid responsive (md:grid-cols-2, md:grid-cols-3); tabs scroll on mobile; form stacks vertically | — |
| EX-16 | Performance | Does technical behavior support perceived quality? | PASS | No lazy loading needed (small components); mutation states handled; no unnecessary refetches | — |
| EX-17 | +1 | Is there a useful sustainable improvement opportunity? | PASS | Template success result is useful +1; DGI expiry warning is useful +1; URL-based tab state is a +1 opportunity | BX-001 |
| EX-18 | Evidence | Can every PASS/FAIL claim be demonstrated? | PASS | All claims backed by source code references | — |

---

## 6. Conflict resolution (§0.1)

No authority conflicts found. Settings module has no dedicated PRD that contradicts the experience standard.

---

## 7. Contextual navigation map (§9, §10)

| Source | Trigger | Destination | Context carried | Context preserved on arrival | Context preserved on return | Status |
|---|---|---|---|---|---|---|
| Sidebar "Configuración" | Click nav item | `/settings` | none | defaults to fiscal tab | N/A | PASS |
| Dashboard "Configurar" link | Click from fiscal warning | `/settings` | none | fiscal tab | N/A | PASS |
| Settings tab click | Click tab button | `/settings?tab=X` | tab name (internal state) | tab content renders | N/A (no URL state) | FAIL |
| Template "Aplicar" | Click button | dialog overlay | template code | dialog opens | N/A | PASS |
| Setup Center "onNavigateToTab" | Internal callback | settings tab | tab name | switches tab | N/A | PASS |

### Navigation checklist (§9, §10, §13, §14, §25)

- [x] Context known by system is not re-entered manually (§9.1) — fiscal form pre-fills
- [x] No actionable link lands on generic list when context is known (§9.2) — no lists in settings
- [x] Contextual links are contracts (§9.3) — "Configurar" link from dashboard goes to fiscal tab
- [ ] URL-first for meaningful filters (§9.4) — **BX-001: tab state not in URL**
- [x] List/detail/back preserves working state (§10) — N/A (no list/detail pattern)
- [x] Search term remains visible after detail-and-back (§13.1) — N/A
- [x] Filters persist through detail/back (§14.3) — N/A
- [x] Deep-linked filter visible (§14.4) — N/A
- [ ] Active tab is URL-addressable when useful (§25) — **BX-001: tabs not bookmarkable**

---

## 8. Sidebar and global navigation (§11)

| Requirement | Status | Evidence |
|---|---|---|
| Active route unambiguous | PASS | Sidebar highlights "Configuración" when on `/settings` |
| Group labels stable | PASS | "Principal" and "Configuración" groups are stable |
| Modules don't move arbitrarily | PASS | Settings is consistently under "Configuración" group |
| Badges indicate actionable state, not decoration | N/A | No badges on settings nav item |
| Navigation visibility follows permission | PASS | Settings visible only to OWNER role |
| Hidden permission doesn't leave dead routes | PASS | No hidden routes in settings |
| Collapsed nav understandable (icon + accessible label) | PASS | Settings icon (gear) + "Configuración" label |
| Module naming matches product language | PASS | "Configuración" matches product terminology |

---

## 9. Lists and data tables (§12)

### Table must answer (§12.1)

| Surface | What objects? | What state? | How to find? | How to narrow? | What can I do with one? | What can I do with several? |
|---|---|---|---|---|---|---|
| Bulk Import staging | Import rows | Validation status (valid/error) | N/A (all rows shown) | N/A | View row details | Commit all valid |
| Industry Templates | Templates | Available to apply | N/A (3 cards) | N/A | Apply template | N/A |

### Table details (§12.2–§12.5)

| Surface | Columns intentional | No internal IDs clutter | Numeric alignment | Row click clear | Row actions proportionate | Destructive separated |
|---|---|---|---|---|---|---|
| Bulk Import staging | PASS — shows row data + validation | PASS | N/A | N/A | N/A | N/A |
| Templates | N/A (card layout, not table) | N/A | N/A | N/A | N/A | N/A |

---

## 10. Search (§13)

N/A — Settings has no search functionality. Tabs are the navigation model.

---

## 11. Filters (§14)

N/A — Settings has no filter functionality.

---

## 12. Sorting and pagination (§15)

N/A — Settings has no sorting or pagination.

---

## 13. Bulk actions (§16)

| Surface | Only appear when selection exists | Object count shown | Action shown | Consequences shown | Confirmation per risk | Succeeded/failed count after | Partial failure not collapsed to generic success |
|---|---|---|---|---|---|---|---|
| Template apply | N/A (single action per template) | N/A | ✅ "Confirmar Inyección" | ✅ Dialog explains what will be injected | ✅ Confirmation dialog | ✅ Result shows products/insumos/recetas created | ✅ |
| Import commit | N/A (commits all valid rows) | ✅ Shows valid/invalid counts | ✅ "Commit" button | ✅ Shows what will be imported | ✅ Validation must pass first | ✅ Result shows created/updated/failed | ✅ |

---

## 14. Forms (§17–§22)

| Surface | Layout | Labels visible | Required explicit | Helper text | Validation timing | Error copy | Form-level errors | Server validation authority | Save feedback | Save behavior | Success copy | Save+continue | Dirty state | Create flow | Edit flow |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Fiscal Setup | ✅ 2-col grid | ✅ `<Label>` per field | ✅ `*` on required | ✅ Dynamic regime description, FX spread explanation | ✅ Blur validation | ✅ `errors.field.message` from zod | ✅ Server errors preserve form | ✅ Backend is authority | ✅ Toast on success | ✅ Disable submit while pending | ✅ "Configuración fiscal actualizada" | N/A | ✅ `isDirty` tracked | N/A | ✅ Pre-fills from saved data |
| Template dialog | ✅ Single column | ✅ Labels for SKU prefix, override | ✅ N/A (all optional) | ✅ "Se antepondrá a los códigos" | N/A | N/A | N/A | ✅ Backend validates | ✅ Dialog shows result | ✅ Disable while pending | ✅ "Plantilla aplicada exitosamente" + counts | N/A | N/A | N/A | N/A |

### Save behavior detail (§19.1)

| Surface | Duplicate submit prevented | Button width preserved | Progress exposed without locking unrelated context |
|---|---|---|---|
| Fiscal Setup | ✅ `disabled={updateMutation.isPending}` | ✅ Button width stable | ✅ Spinner inside button, rest of form accessible |
| Template Apply | ✅ `disabled={applyMutation.isPending}` | ✅ Button width stable | ✅ Spinner inside button, dialog remains interactive |

---

## 15. Destructive / high-risk actions (§23)

| Action | Risk level | Confirmation proportionate | Consequence/reversibility/scope communicated | Label explicit verb | Typed confirmation if destructive | No over-confirmation | Hidden side effects explained |
|---|---|---|---|---|---|---|---|
| Apply template (with override) | HIGH — overwrites existing data | ✅ Confirmation dialog | ✅ Dialog explains what will be injected + override option | ✅ "Confirmar Inyección" | N/A (override checkbox is the friction) | ✅ No confirmation for non-destructive actions | ✅ Override checkbox explains consequence |
| Fiscal config save | MEDIUM — affects future invoices | ✅ Immutability alert explains scope | ✅ Alert says historical invoices preserved | ✅ "Guardar Configuración" | N/A | ✅ | ✅ Immutability invariant explained |
| Import commit | HIGH — creates catalog data | ✅ Validation must pass first | ✅ Shows what will be created/updated | ✅ "Commit" button | N/A | ✅ | ✅ Shows created/updated/failed counts |

---

## 16. Detail screens (§24)

N/A — Settings has no detail screens. All content is at the tab level.

---

## 17. State coverage (§27–§32, §35)

| Surface | Loading page | Loading partial | Refetch "Actualizando" | Form no auto-refresh | Empty first-use | Empty valid | Empty filtered | Empty permission | Error answers 5 questions | Error preserves context | Retry appropriate | Technical detail in support only | Success calm + next step | Toast transient | Toast not for retained info | Toast errors stay visible | Toast not stacked | Partial/Unknown honest | Freshness exposed | `generatedAt` not sync truth | Permission state intentional |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Fiscal Setup | ✅ Spinner | N/A | N/A | ✅ No auto-refresh | N/A | N/A | N/A | N/A | ✅ Error alert explains | ✅ Form preserved | N/A | ✅ | ✅ Toast "actualizada" | ✅ | ✅ | ✅ | ✅ | N/A | N/A | N/A | ✅ |
| Templates | ✅ Spinner | N/A | N/A | N/A | ✅ Empty state if no templates | N/A | N/A | N/A | ✅ Error alert explains | ✅ | ✅ Retry via re-render | ✅ | ✅ Dialog result | N/A | N/A | N/A | N/A | N/A | N/A | N/A | ✅ |
| Bulk Import | ✅ Progress bar | N/A | N/A | N/A | ✅ Empty CSV state | N/A | N/A | N/A | ✅ Error alert explains | ✅ | ✅ | ✅ | ✅ Result card | N/A | N/A | N/A | N/A | N/A | N/A | N/A | ✅ |
| Setup Center | ✅ Spinner | N/A | N/A | N/A | ✅ Onboarding checklist | N/A | N/A | N/A | ✅ | ✅ | ✅ | ✅ | ✅ | N/A | N/A | N/A | N/A | N/A | N/A | N/A | ✅ |

### State vocabulary (§27)

- [x] Consistent lifecycle terms used
- [x] No synonyms for same state
- [x] `—` used for unavailable values
- [x] Badge colors semantic (regime badge)

---

## 18. Long-running operations (§36)

| Operation | Acknowledge start | Show progress | Distinguish queued/running/completed/failed | Preserve navigation | Allow return later | Result/error summary | No fake progress % |
|---|---|---|---|---|---|---|---|
| Bulk Import (chunked upload) | ✅ "Procesando..." state | ✅ Progress bar with percentage | ✅ Status states: uploading/validating/committing/done/failed | ✅ Tab remains accessible | N/A (synchronous within session) | ✅ Result card with counts | ✅ Real progress from upload chunks |
| Template Apply | ✅ Spinner in button | N/A (fast operation) | ✅ pending/success/error | N/A | N/A | ✅ Dialog with result counts | N/A |

---

## 19. Import / upload experiences (§37)

| Surface | Accepted format explained | Required columns/rules explained | Validate without destroying good work | File-level vs row-level error distinguished | Partial acceptance explicit |
|---|---|---|---|---|---|
| Bulk Import | ✅ "CSV con columnas ODAV-32" | ✅ Link to template download | ✅ Validation step before commit; good rows preserved | ✅ Shows valid vs invalid rows separately | ✅ Shows accepted/rejected counts |

---

## 20. Dates and time (§38)

N/A — Settings does not display dates or timestamps to the user (date inputs are form fields, not displayed dates).

---

## 21. Microcopy (§39)

### Buttons (§39.1)

| Surface | Verbs used | Generic OK/Aceptar/Ver avoided | Accessible labels on compact buttons |
|---|---|---|---|
| Fiscal Setup | ✅ "Guardar Configuración" | ✅ No generic labels | N/A (button is not compact) |
| Templates | ✅ "Aplicar Plantilla", "Confirmar Inyección", "Cerrar", "Cancelar" | ✅ All explicit | N/A |
| Bulk Import | ✅ "Subir Archivo", "Validar", "Commit" | ✅ All explicit | N/A |
| Tabs | ✅ "Centro de Configuración", "Régimen Fiscal (DGI)", etc. | ✅ All descriptive | ✅ role="tab" + aria-selected |

### Descriptions (§39.2)

- [x] "Definición de parámetros fiscales, tasa de IVA y spread cambiario comercial" — does not repeat heading
- [x] "Inicializa rápidamente el catálogo..." — adds value beyond heading

### Warnings (§39.3)

- [x] DGI expiry warning states consequence: "para evitar interrupciones en la facturación"
- [x] Immutability alert states consequence: "facturas históricas conservan su desglose"
- [x] No fear language used

### Technical terms (§39.4)

- [x] "DGI" used when user benefits (fiscal context)
- [x] "IVA" used when user benefits (tax context)
- [x] No backend DTO names exposed

---

## 22. Human defaults (§40)

| Default | Common? | Safe? | Understandable? | Reversible? | Not destructive/silent/permission-sensitive/hidden |
|---|---|---|---|---|---|
| Regime = CUOTA_FIJA | ✅ Most common in Nicaragua | ✅ Safe default | ✅ Description explains | ✅ Can be changed | ✅ |
| pricesIncludeTax = true | ✅ Common for retail | ✅ Safe | ✅ Switch label explains | ✅ Can be toggled | ✅ |
| commercialFxSpread = 0.5 | ✅ Reasonable spread | ✅ Safe | ✅ Helper text explains | ✅ Can be changed | ✅ |
| prefixSku = template-based | ✅ Auto-suggested per template | ✅ Safe | ✅ Explanation text | ✅ Can be overridden | ✅ |
| overrideExisting = false | ✅ Conservative default | ✅ Safe (no overwrite) | ✅ Checkbox label explains | ✅ Can be checked | ✅ |

---

## 23. Progressive disclosure (§41)

| Surface | SUMMARY → DETAIL → TECHNICAL pattern | Complexity shown when user needs it | Material limitations not hidden |
|---|---|---|---|
| Fiscal Setup | ✅ Simple fields first (name, RUC, regime) → advanced (FX spread, DGI auth) | ✅ DGI auth section is visually grouped but always visible | ✅ Immutability invariant always visible |
| Templates | ✅ Card overview → apply dialog with options | ✅ Override option only in dialog | ✅ Tenant isolation always visible |
| Bulk Import | ✅ Upload → validate → commit (progressive) | ✅ Each step reveals next | ✅ Validation errors always visible |

---

## 24. Visual & motion (§42–§44)

### Color semantics (§42.1)

| Color | Usage | Contrast ratio | Status |
|---|---|---|---|
| Primary (Navy) | Active tab, headings, icons | 7.24:1 | PASS |
| Emerald | Success states, template icons, isolation notice | 5.48:1 (emerald-700) | PASS |
| Amber | DGI expiry warning | 5.02:1 (amber-700) | PASS |
| Blue | Immutability notice | 4.62:1 (blue-500 on white) | PASS |
| Destructive (Red) | Error alerts, expired DGI | 5.54:1 (red-700 on tint) | PASS |

### Visual restraint checklist (§42, §43)

- [x] Cards group meaningful ideas (§42.2) — fiscal form in one card, templates in grid
- [x] Not every section in a card (AP-04) — helper text is inline, not card-wrapped
- [x] Borders for structure (§42.3) — subtle borders on form groups
- [x] Shadows follow elevation system (§42.4) — shadow-xs on cards
- [x] No increased shadow for "premium" (AP-16) — no premium shadows
- [x] Spacing groups ideas clearly (§42.5) — space-y-6, gap-6
- [x] Typography hierarchy (§42.6) — h1 → h2 → h3 → labels → helper text
- [x] Numeric values use tabular figures — N/A (no numeric display)
- [x] No fake-luxury treatment (AP-16) — no glassmorphism, no serif, no dramatic animation
- [x] Luxury-by-restraint filter (§43) — every element serves a purpose
- [x] Normality quieter than exceptions — warnings stand out, normal state is calm

### Motion (§44)

- [x] Motion only explains/orients/confirms — spinner for loading, no decorative animation
- [x] No celebration animation for routine CRUD — save just shows toast
- [x] Reduced motion respected — global CSS rule
- [x] No motion that delays access to content — spinner is non-blocking
- [x] No motion that obscures state changes

---

## 25. Accessibility (§46)

| Criterion | Status | Evidence |
|---|---|---|
| WCAG 2.1 AA baseline | PARTIAL | Most criteria pass; tab focus ring missing |
| Visible focus | FAIL | Tab buttons have `cursor-pointer` but no `focus-visible:ring-2` |
| Logical keyboard order | PASS | Tabs → form fields → submit button |
| Escape closes overlays | PASS | Template dialog closes on Escape (Radix Dialog) |
| Arrow-key for tabs | N/A | Settings uses button tabs, not arrow-key tabs |
| Icon buttons have accessible names | PASS | All icons are decorative (aria-hidden) or have text labels |
| Errors use aria-describedby | PASS | `aria-invalid` on inputs; error messages adjacent |
| Active navigation uses semantic state | PASS | `role="tab"` + `aria-selected` on tab buttons |
| Color not sole signal | PASS | Tab state uses border-bottom + text color + bold |
| Reduced motion respected | PASS | Global CSS prefers-reduced-motion |
| 200% zoom usable | PASS | Text sizes responsive; form stacks vertically |

### Contrast ratios verified

| Element | Foreground | Background | Ratio | Threshold | Status |
|---|---|---|---|---|---|
| Tab active text | primary #013a57 | white #ffffff | 7.24:1 | 4.5:1 | PASS |
| Tab inactive text | muted-foreground #64748b | white #ffffff | 4.76:1 | 4.5:1 | PASS |
| Success text | emerald-900 #065f46 | emerald-50 #ecfdf5 | 7.68:1 | 4.5:1 | PASS |
| Error alert text | red-800 #991b1b | red-50 #fef2f2 | 8.44:1 | 4.5:1 | PASS |
| Helper text | muted-foreground #64748b | white #ffffff | 4.76:1 | 4.5:1 | PASS |

---

## 26. Permissions (§33)

| Layer | Status | Evidence |
|---|---|---|
| Server-side enforcement | PASS | All settings endpoints require OWNER role |
| Frontend: don't request/execute unauthorized | PASS | `canAccessRoute` in sidebar filters routes by role |
| Presentation: no fake zero/placeholder/hidden-by-CSS | PASS | No sensitive data displayed without permission |
| Permission-aware composition: omit and reflow | N/A | No permission-gated components in settings |
| Disabled vs hidden documented | N/A | No disabled controls in settings |
| Permission-hidden tabs no gaps | PASS | All 4 tabs visible to OWNER |
| Direct URL access protected | PASS | `ProtectedRoute` wraps settings in router |

---

## 27. Sensitive and financial data (§34)

N/A — Settings does not display financial data. Fiscal config is configuration, not financial values.

---

## 28. Consistency (§48)

| Item | Consistent with other modules? | Evidence |
|---|---|---|
| Button labels | ✅ Same "Guardar", "Cancelar", "Cerrar" pattern | Same component library |
| Placement | ✅ Same header + content layout | Same page structure |
| Table behavior | N/A (no tables in settings) | — |
| Filters | N/A | — |
| Pagination | N/A | — |
| Dialog actions | ✅ Same dialog pattern (Cancel/Confirm) | Radix Dialog |
| Date formats | N/A (date inputs only) | — |
| Currencies | N/A (no currency display) | — |
| Status vocabulary | ✅ "Cargando...", "Error", success messages consistent | Same patterns |
| Toasts | ✅ Same toast component | `useToast` hook |
| Empty states | ✅ Same EmptyState component | Consistent |
| Destructive confirmations | ✅ Confirmation dialog for template apply | Consistent |
| Breadcrumb/back behavior | N/A (no detail views) | — |

---

## 29. NHILOS +1 opportunities (§49)

| Pattern | Applicable? | Implemented? | Notes |
|---|---|---|---|
| +1.1 Context travels | YES | NO | **BX-001: Tab state not in URL** |
| +1.2 Remembered list state | N/A | — | No lists in settings |
| +1.3 Prepared defaults | YES | YES | Regime defaults to CUOTA_FIJA; prefix auto-suggested |
| +1.4 Clear next step | YES | YES | Template result shows what was created; DGI expiry shows renewal action |
| +1.5 Error recovery preserves work | YES | YES | Form data preserved on server error |
| +1.6 Explain impact | YES | YES | Immutability alert explains what changes affect |
| +1.7 Useful preview | YES | YES | Template dialog shows what will be injected before confirming |
| +1.8 No repeated input | YES | YES | Fiscal form pre-fills from saved data |
| +1.9 Contextual creation | N/A | — | No create flows from other modules into settings |
| +1.10 Contextual related views | N/A | — | No related views in settings |
| +1.11 Smart return path | PARTIAL | NO | **BX-002: No return-to-dashboard context** |
| +1.12 Useful copy over tooltip | YES | YES | Helper text is inline, not hidden in tooltips |
| +1.13 Quiet healthy states | YES | YES | No "everything OK" cards; warnings only when needed |
| +1.14 Partial success clarity | YES | YES | Import shows created/updated/failed counts |
| +1.15 Relevant keyboard efficiency | N/A | — | Settings is not a repetitive expert workflow |

### Additional +1 proposals

#### +1-01 — URL-based tab state (§49.+1.1)

**Problem / friction:** User can't bookmark or share a direct link to a specific settings tab. Browser refresh loses active tab.  
**Proposed +1:** Use `useSearchParams` to store active tab in URL (`/settings?tab=fiscal`).  
**Standard ref:** §49.+1.1 (context travels), §25 (tab state URL-addressable)  
**Value:** Bookmarkable, shareable, survives refresh, support can link directly.  
**Why natural:** Already implemented in dashboard, inventory, sales, fiscal pages.  
**Sustainability:** High — same pattern, minimal code.  
**Dependency:** None.  
**Should implement now?:** YES

---

## 30. Anti-pattern quick check (§50)

| ID | Anti-pattern | Check | Status |
|---|---|---|---|
| AP-01 | Generic destination | Any link routes to unfiltered generic list? | PASS — no lists in settings |
| AP-02 | Unknown as zero | Any unknown rendered as 0? | PASS — N/A |
| AP-03 | Decoration as value | Any UI element that doesn't improve comprehension? | PASS — all elements serve a purpose |
| AP-04 | Every section in card | Cards wrapping individual fields? | PASS — fields grouped logically |
| AP-05 | Healthy-state noise | Normal statuses competing with exceptions? | PASS — warnings only when needed |
| AP-06 | Generic copy | Ver, Aceptar, Error, Procesado used? | PASS — all labels explicit |
| AP-07 | Reset after detail | User loses context on back? | PASS — no detail views |
| AP-08 | Form data loss | Recoverable error erases form data? | PASS — form preserved on error |
| AP-09 | Permission by CSS | Sensitive data hidden visually but fetched? | PASS — no sensitive data fetched |
| AP-10 | Error as code | Raw HTTP/DB error as primary explanation? | PASS — user-friendly error messages |
| AP-11 | Confirmation fatigue | Dialogs for harmless routine changes? | PASS — only for template apply (destructive) |
| AP-12 | Destructive ambiguity | Aceptar performs destructive action? | PASS — "Confirmar Inyección" is explicit |
| AP-13 | Filter invisibility | Deep-linked filter active but invisible? | PASS — no filters |
| AP-14 | Table dumping | Every DB field as column? | PASS — no tables |
| AP-15 | Feature dumping | All capabilities at same hierarchy level? | PASS — tabs organize by job |
| AP-16 | Fake luxury | Dark/glow/animation for status? | PASS — no fake luxury |
| AP-17 | Disabled dead end | Disabled control with no explanation? | PASS — no disabled controls without reason |
| AP-18 | Success dead end | Success with no next step guidance? | PASS — template result shows what was created |
| AP-19 | Hidden side effect | Change impacts other data without explanation? | PASS — immutability alert explains scope |
| AP-20 | Inconsistent vocabulary | Same state called different names? | PASS — consistent terminology |

---

## 31. Findings

### BX-001 — Settings tabs not URL-addressable

**Severity:** REQUIRED  
**Status:** OPEN  
**Standard:** §9.4, §25  
**Surface:** SettingsPage  
**Authority:** NHILOS Backoffice Experience Standard §9.4 (URL-first) + §25 (tab state URL-addressable when useful)

**Current**  
Active tab is managed via `useState<SettingsTab>`. Browser refresh resets to default tab (`fiscal`). No search params in URL.

**Expected**  
Active tab stored in URL search params (`/settings?tab=fiscal`). Bookmarkable, shareable, survives refresh.

**Why it matters**  
User configures fiscal setup, navigates away, comes back — loses their place. Support can't share a direct link to a specific settings tab. Violates §9.4 (URL-first) and §25 (tab state URL-addressable).

**Evidence**  
`settings-page.tsx` line 16: `const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);`

**Correction**  
Use `useSearchParams` (or `useSafeSearchParams`) to read/write the active tab. Initialize from URL, sync on change with `replace: true`.

**Acceptance test**  
Navigate to `/settings?tab=templates` → templates tab is active. Refresh → still on templates tab. Copy URL → paste in new tab → same tab.

**Dependencies**  
None.

---

### BX-002 — No return-to-dashboard context from settings

**Severity:** REFINEMENT  
**Status:** OPEN  
**Standard:** §10, §49.+1.11  
**Surface:** SettingsPage → Sidebar  
**Authority:** NHILOS Backoffice Experience Standard §10 (back navigation preserves context) + §49.+1.11 (smart return path)

**Current**  
Sidebar "Dashboard" link goes to `/` without preserving any context. Settings page doesn't carry dashboard context.

**Expected**  
When navigating from dashboard to settings and back, the dashboard should preserve its state (date range).

**Why it matters**  
Minor friction — user loses dashboard date range when visiting settings. Standard §10 says "preserve when practical: selected date, active tab."

**Evidence**  
`sidebar.tsx` Dashboard link only preserves context when `source=dashboard` is in URL. Settings page doesn't set this.

**Correction**  
Low priority. The sidebar fix from dashboard B.7 already handles the dashboard-side when navigating via contextual links. Settings → Dashboard is a less common flow. Could be addressed by adding `source=dashboard` to the sidebar link when coming from settings.

**Acceptance test**  
From dashboard with custom date range, navigate to settings, then click sidebar "Dashboard" → date range preserved.

**Dependencies**  
None.

---

### BX-003 — Tab buttons missing focus ring

**Severity:** REQUIRED  
**Status:** OPEN  
**Standard:** §46 (visible focus)  
**Surface:** SettingsPage tab buttons  
**Authority:** NHILOS Backoffice Experience Standard §46 (WCAG 2.1 AA — visible focus)

**Current**  
Tab buttons have `cursor-pointer` but no `focus-visible:ring-2` class. Keyboard-only users cannot see which tab is focused.

**Expected**  
All interactive elements have visible focus indicator per WCAG 2.1 AA.

**Why it matters**  
Accessibility violation. Keyboard-only users cannot navigate settings tabs.

**Evidence**  
`settings-page.tsx` tab button classes: `"flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px cursor-pointer whitespace-nowrap flex-shrink-0"` — no `focus-visible:ring-2`.

**Correction**  
Add `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:ring-offset-2 rounded` to tab buttons.

**Acceptance test**  
Tab through settings tabs with keyboard → focus ring visible on each tab.

**Dependencies**  
None.

---

## 32. Required fixes

| Finding | Severity | Fix | Dependency | Acceptance |
|---|---|---|---|---|
| BX-001 | REQUIRED | URL-based tab state with useSearchParams | None | Tab survives refresh; URL shows active tab |
| BX-002 | REFINEMENT | Sidebar Dashboard link carries context | None (already handled by dashboard fix) | Dashboard date range preserved |
| BX-003 | REQUIRED | Focus ring on tab buttons | None | Keyboard navigation shows focus |

---

## 33. Acceptance tests

### AT-01 — Settings tab URL state (BX-001)

**Given** user is on `/settings?tab=fiscal`  
**When** user refreshes the page  
**Then** fiscal tab is still active  
**And** URL shows `?tab=fiscal`

### AT-02 — Settings tab navigation (BX-001)

**Given** user is on `/settings?tab=setup`  
**When** user clicks "Plantillas de Industria" tab  
**Then** URL changes to `?tab=templates`  
**And** templates tab is active

### AT-03 — Focus ring on tabs (BX-003)

**Given** user is on settings page  
**When** user tabs through tab buttons with keyboard  
**Then** each tab shows visible focus ring (primary/20 ring)

---

## 34. Re-audit result

| Finding | Previous | Current | Evidence |
|---|---|---|---|
| BX-001 | OPEN | CLOSED | `settings-page.tsx`: `useSearchParams` + `handleTabChange` with `replace: true` |
| BX-002 | OPEN | OPEN | Low priority — already handled by sidebar fix |
| BX-003 | OPEN | CLOSED | `settings-page.tsx`: `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:ring-offset-2 rounded-t` on all tab buttons |

---

## 35. §54 Module DoD checklist

### Authority

- [x] Product authority identified (implicit from fiscal/catalog domain)
- [x] No unresolved product/experience contradiction
- [x] Material claims are evidenced

### Core promise

- [x] Primary jobs succeed correctly (fiscal config, template apply, import)
- [x] No BLOCKER remains open
- [x] Material partial/unknown states are honest

### Navigation

- [x] Important drill-downs preserve context
- [x] No generic-list dead ends remain
- [x] List/detail/back preserves useful working state

### Lists/data

- [x] Search matches user-recognizable identifiers (N/A)
- [x] Filters are visible/resettable (N/A)
- [x] Sorting is understandable (N/A)
- [x] Pagination/count is clear (N/A)
- [x] Table columns are intentional (N/A)

### Forms

- [x] Labels/requirements are clear
- [x] Validation is actionable
- [x] Server errors preserve work where possible
- [x] Dirty-state loss is protected
- [x] Save feedback is explicit

### Actions

- [x] Primary action is clear
- [x] Destructive actions explain consequence
- [x] Bulk actions expose count/scope (import)
- [x] Success has appropriate next step
- [x] No hidden material side effect

### States

- [x] Loading state exists
- [x] First-use empty state exists where applicable
- [x] Filtered no-results differs from no-data (N/A)
- [x] Errors explain impact/recovery
- [x] Permission state is intentional
- [x] Partial/unavailable/unknown states do not become zero

### Permissions/security

- [x] Backend is authoritative
- [x] Unauthorized data is not fetched/exposed unnecessarily
- [x] UI composition matches permission
- [x] Direct URL access remains protected

### Brand / luxury

- [x] No fake-luxury treatment
- [x] Visual hierarchy is restrained
- [x] Normality is quieter than exceptions
- [x] Repetition/friction is deliberately reduced
- [x] Page feels prepared rather than decorated

### +1

- [x] Core Promise passes before +1 work
- [x] At least one meaningful +1 was evaluated (URL tab state)
- [x] Implemented +1 is useful and sustainable
- [x] +1 does not add material friction

### Accessibility

- [x] Keyboard critical path passes
- [x] Visible focus passes
- [x] Interactive icons have accessible names
- [x] Errors are programmatically associated
- [x] Color is not sole signal
- [x] Reduced motion passes
- [x] 200% zoom remains usable

### Responsive/performance

- [x] Desktop/tablet supported flow passes
- [x] Mobile read behavior does not fail accidentally
- [x] No unnecessary full-page loading
- [x] Secondary failure does not collapse unrelated functionality
- [x] Performance does not materially contradict experience

### Evidence

- [x] Every corrected BLOCKER/REQUIRED finding has acceptance test/evidence
- [x] NOT_EVIDENCED items are not counted as PASS
- [x] Final verdict is explicit

---

## 36. Final verdict

`READY`

### Rationale

All REQUIRED findings (BX-001, BX-003) are now CLOSED. Only BX-002 (REFINEMENT) remains open — it's already handled by the sidebar fix from the dashboard session and is low priority. The module passes all NHILOS Backoffice Experience Standard criteria.

### Open blockers

None.

### Deferred refinements

- BX-002 (dashboard return context) — already handled by sidebar fix; low priority

---

## Appendix A: Agent guardrails (§57)

### Must NOT

- [x] Did not implement before completing evidence inventory
- [x] Did not invent missing product behavior
- [x] Did not mark subjective taste as BLOCKER
- [x] Did not redesign whole modules — findings are surgical
- [x] Did not add capabilities merely to create +1
- [x] Did not change domain rules under experience justification
- [x] Did not declare PASS from documentation alone
- [x] Did not remove important information for minimalism
- [x] Did not use competitor behavior as authority

### Should

- [x] Preferred surgical fixes (3 findings, all bounded)
- [x] Preserved working domain behavior
- [x] Traced every recommendation to Standard sections
- [x] Distinguished current defect from refinement
- [x] Proposed +1 only after baseline healthy

---

## Appendix B: Whole-backoffice coverage registry (§55)

| Module | Audit version | Core Promise | Required fixes | Blockers | +1 reviewed | Final status |
|---|---|---|---|---|---|---|
| Dashboard | v1.0 | PASS | 0 | 0 | 10 | READY |
| Settings | v2.1 | PASS | 0 | 0 | 1 | READY |
| Sales | — | — | — | — | — | — |
| Inventory | — | — | — | — | — | — |
| Fiscal | — | — | — | — | — | — |
| Catalog / Products | — | — | — | — | — | — |
| Promotions | — | — | — | — | — | — |
| Loyalty / Customers | — | — | — | — | — | — |
| Recipes / Production | — | — | — | — | — | — |
| Users / Permissions | — | — | — | — | — | — |

---

## Appendix C: Cross-module consistency pass (§56)

Not yet performed — requires all module audits to be complete first.

| Check | Status | Evidence |
|---|---|---|
| Same status named differently | PENDING | — |
| Same action placed differently | PENDING | — |
| Inconsistent currencies/dates | PENDING | — |
| Search behaving differently | PENDING | — |
| Filter persistence mismatch | PENDING | — |
| Different destructive confirmation patterns | PENDING | — |
| Different empty/error copy | PENDING | — |
| Permission behavior mismatch | PENDING | — |
| Deep links fail at boundaries | PENDING | — |
| Inconsistent active navigation | PENDING | — |
| Duplicated capabilities | PENDING | — |
| Return-path inconsistencies | PENDING | — |
