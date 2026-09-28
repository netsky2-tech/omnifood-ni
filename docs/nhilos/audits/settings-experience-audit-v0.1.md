# Settings — NHILOS Experience Audit

**Version:** 0.1  
**Status:** EVIDENCE PASS  
**Date:** 2026-09-28  
**Auditor:** el Gentleman  
**Module:** Settings (Configuración & Onboarding)  
**Standard reference:** `nhilos_backoffice_experience_standard_v1.0.md` (adapted from dashboard standard)

---

## 1. Authority & evidence

| Source | Version/status | Role |
|---|---|---|
| Module PRD | implicit (onboarding + fiscal + catalog setup) | Product truth |
| Architecture Spec | N/A (no dedicated spec) | — |
| Acceptance Plan | `w9-settings.test.tsx` | Release evidence |
| NHILOS Experience Standard | v1.0 (dashboard) | Experience authority (adapted) |
| DESIGN_BACKOFFICE | Tailwind + shadcn/ui | UI system |
| Code/runtime evidence | `settings-page.tsx`, subcomponents | Current implementation |

### Missing authority/evidence

- No dedicated PRD for Settings module
- No dedicated architecture spec
- Experience standard was written for Dashboard; needs adaptation for form-heavy settings pages

---

## 2. Module job

**Primary user:** Owner / Admin setting up the business  
**Primary job:** Configure fiscal regime, apply industry templates, import catalog data  
**Secondary users/jobs:** Manager reviewing import results  
**Risk if wrong:** Wrong fiscal config → DGI non-compliance; wrong template → corrupted catalog

---

## 3. Surface inventory

| Surface | Route/component | Job | Read/write | Permissions | Evidence |
|---|---|---|---|---|---|
| Setup Center | `/settings` tab=setup | Full onboarding flow | Read/Write | OWNER | `setup-center-view.tsx` |
| Fiscal Setup | `/settings` tab=fiscal | Configure DGI regime | Read/Write | OWNER | `fiscal-setup-form.tsx` |
| Industry Templates | `/settings` tab=templates | Apply pre-built catalogs | Write | OWNER | `industry-templates-list.tsx` |
| Bulk Import | `/settings` tab=import | CSV catalog import | Write | OWNER | `bulk-import-wizard.tsx` |

---

## 4. Experience coverage matrix

| ID | Dimension | Standard ref | Status | Evidence | Finding IDs |
|---|---|---|---|---|---|
| EX-01 | Core Promise | §28.A | PASS | Fiscal config saves correctly; templates apply atomically | — |
| EX-02 | Product Truth | §28.A | PASS | Fiscal regime from backend; template data from API | — |
| EX-03 | Precision | §29 | PASS | Clear tab labels; descriptive subtitles | — |
| EX-04 | Contextual Navigation | §5, §28.B | PARTIAL | No URL-based tab state (uses useState); no returnTo to dashboard | BX-001 |
| EX-05 | Findability | §29 | PASS | 4 clear tabs with icons; logical grouping | — |
| EX-06 | Forms | §7 | PASS | Fiscal form uses react-hook-form + zod; validation messages | — |
| EX-07 | Actions | §7, §28.E.4 | PASS | "Aplicar Plantilla", "Confirmar Inyección", "Exportar" — all explicit | — |
| EX-08 | States | §16, §17, §28.D | PASS | Loading spinners, error alerts, empty states, success confirmations | — |
| EX-09 | Permissions | §12, §28.A.6 | PASS | Owner-only operations; backend enforces | — |
| EX-10 | Time | §9, §10 | N/A | No date ranges or freshness in settings | — |
| EX-11 | Visual Restraint | §19, §28.H | PASS | Clean card layout; no decorative elements | — |
| EX-12 | Consistency | §27, §29 | PASS | Same tab pattern as other pages; same card/button components | — |
| EX-13 | Microcopy | §7, §9, §28.E | PASS | Descriptive button labels; helpful hint text on forms | — |
| EX-14 | Accessibility | §21, §28.I | PARTIAL | Tabs have role="tab" + aria-selected; but no focus rings on tab buttons | BX-002 |
| EX-15 | Responsive | §28.I.6 | PASS | Grid responsive (md:grid-cols-3); tabs scroll on mobile | — |
| EX-16 | Performance | §22, §28.J | PASS | No lazy loading needed (small components); mutation states handled | — |
| EX-17 | Charts | §15, §28.F | N/A | No charts in settings | — |
| EX-18 | Motion | §20, §28.H.2 | PASS | Only spinner animations; no ornamental motion | — |
| EX-19 | Attention Required | §8, §28.C | N/A | No exception panel in settings | — |
| EX-20 | NHILOS +1 | §23, §28.G | PARTIAL | Template success result is a nice +1; but no contextual return to dashboard | BX-003 |
| EX-21 | DoD Checklist | §28 full | PARTIAL | See §14 below | — |

---

## 5. Contextual navigation map

| Source | Trigger | Destination | Context carried | Context preserved on arrival | Context preserved on return | Status |
|---|---|---|---|---|---|---|
| Dashboard sidebar | Click "Configuración" | `/settings` | none | defaults to fiscal tab | N/A (sidebar link) | PASS |
| Settings "Aplicar Plantilla" | Click button | dialog overlay | template code | dialog opens with template context | N/A | PASS |
| Setup Center "onNavigateToTab" | Internal callback | settings tab | tab name | switches to target tab | N/A | PASS |

### Navigation contract

- [x] Actions have defined destinations
- [ ] URL-based tab state (currently useState only — not bookmarkable)
- [ ] No return-to-dashboard context preservation
- [ ] Browser refresh loses active tab (resets to default)

---

## 6. State coverage

| Surface | Loading | Empty | No results | Error | Partial | Unknown | Permission denied | Success |
|---|---|---|---|---|---|---|---|---|
| Fiscal Setup | spinner ✓ | — | — | alert ✓ | — | — | — | toast ✓ |
| Templates | spinner ✓ | — | — | alert ✓ | — | — | — | dialog result ✓ |
| Bulk Import | progress ✓ | — | empty CSV ✓ | alert ✓ | — | — | — | result card ✓ |
| Setup Center | spinner ✓ | — | — | — | — | — | — | ✓ |

### Freshness states

N/A — no freshness concept in settings.

---

## 7. Visual & motion audit

### 7.1 Color semantics

| Color | Usage | Contrast ratio | Status |
|---|---|---|---|
| Primary (Navy) | Active tab, headings | 7.24:1 | PASS |
| Emerald | Success states, template icons | 5.48:1 (emerald-700) | PASS |
| Amber | Warning, template icons | 5.02:1 (amber-700) | PASS |
| Destructive | Error alerts | 5.54:1 (red-700 on tint) | PASS |
| Muted | Labels, descriptions | 4.76:1 | PASS |

### 7.2 Visual restraint

- [x] No unnecessary decorative cards
- [x] No ornamental motion
- [x] Green/red semantic
- [x] Spacing groups ideas clearly
- [x] Borders don't dominate
- [x] Calm, not empty
- [x] No luxury clichés

### 7.3 Motion

- [x] prefers-reduced-motion inherited from global CSS
- [x] Only spinner animations
- [x] No celebratory or decorative motion

---

## 8. Accessibility audit

### 8.1 WCAG 2.1 AA compliance

| Criterion | Status | Evidence |
|---|---|---|
| Keyboard navigation complete | PASS | Tabs, buttons, inputs all tabulable |
| Focus visible on all interactive elements | FAIL | Tab buttons missing focus-visible:ring-2 |
| Color not only state signal | PASS | Tab state uses border-bottom + text color (not color alone) |
| prefers-reduced-motion respected | PASS | Global CSS rule |
| Charts/actions expose accessible labels | N/A | No charts |
| Text scaling usable at 200% | PASS | Text sizes responsive |
| WCAG AA contrast ratios | PASS | All combinations verified |
| Semantic headings in order | PASS | h1 → h2 → h3 |
| aria-labels on compact buttons | PASS | Tab buttons have role="tab" + aria-selected |

### 8.2 Contrast ratios verified

| Element | Foreground | Background | Ratio | Threshold | Status |
|---|---|---|---|---|---|
| Tab active text | primary #013a57 | white #ffffff | 7.24:1 | 4.5:1 | PASS |
| Tab inactive text | muted-foreground #64748b | white #ffffff | 4.76:1 | 4.5:1 | PASS |
| Template icon (CAFETERIA) | amber-600 #d97706 | white #ffffff | 3.19:1 | 3:1 (icon) | PASS |
| Success text | emerald-900 #065f46 | emerald-50 #ecfdf5 | 7.68:1 | 4.5:1 | PASS |
| Error alert text | red-800 #991b1b | red-50 #fef2f2 | 8.44:1 | 4.5:1 | PASS |

---

## 9. Findings

### BX-001 — Settings tabs not URL-addressable

**Severity:** MEDIUM  
**Status:** OPEN  
**Standard:** §5, §28.B.6  
**Surface:** SettingsPage  
**Authority:** NHILOS Experience Standard §5.4 (URL-first rule)

**Current**  
Active tab is managed via `useState<SettingsTab>`. Browser refresh resets to default tab. No search params.

**Expected**  
Active tab should be stored in URL search params (`/settings?tab=fiscal`) so it's bookmarkable, shareable, and survives refresh.

**Why it matters**  
User configures fiscal setup, navigates away, comes back — loses their place. Support can't share a direct link to a specific settings tab.

**Evidence**  
`settings-page.tsx` line 16: `const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);`

**Correction**  
Use `useSearchParams` (or `useSafeSearchParams`) to read/write the active tab. Initialize from URL, sync on change.

**Acceptance test**  
Navigate to `/settings?tab=templates` → templates tab is active. Refresh → still on templates tab.

**Dependencies**  
None.

---

### BX-002 — Tab buttons missing focus ring

**Severity:** LOW  
**Status:** OPEN  
**Standard:** §21, §28.I.2  
**Surface:** SettingsPage tab buttons  
**Authority:** NHILOS Experience Standard §21 (visible focus)

**Current**  
Tab buttons have `cursor-pointer` but no `focus-visible:ring-2` class.

**Expected**  
All interactive elements should have visible focus indicator per WCAG 2.1 AA.

**Why it matters**  
Keyboard-only users cannot see which tab is focused.

**Evidence**  
`settings-page.tsx` tab button classes lack `focus-visible:ring-2`.

**Correction**  
Add `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:ring-offset-2 rounded` to tab buttons.

**Acceptance test**  
Tab through settings tabs with keyboard → focus ring visible on each.

**Dependencies**  
None.

---

### BX-003 — No return-to-dashboard context

**Severity:** LOW  
**Status:** OPEN  
**Standard:** §28.B.7  
**Surface:** SettingsPage  
**Authority:** NHILOS Experience Standard §28.B.7

**Current**  
Sidebar "Dashboard" link goes to `/` without preserving any context. Settings page doesn't carry dashboard context.

**Expected**  
When navigating from dashboard to settings and back, the dashboard should preserve its state.

**Why it matters**  
Minor friction — user loses dashboard date range when visiting settings.

**Evidence**  
`sidebar.tsx` Dashboard link only preserves context when `source=dashboard` is in URL. Settings page doesn't set this.

**Correction**  
Low priority. The sidebar fix from B.7 already handles the dashboard-side. Settings → Dashboard is a less common flow.

**Acceptance test**  
From dashboard with custom date range, navigate to settings, then back to dashboard → date range preserved.

**Dependencies**  
None.

---

## 10. NHILOS +1 opportunities

### +1-01 — Template application success summary

**Problem / friction:** After applying a template, the user sees a small result in a dialog but can't reference it later.  
**Proposed +1:** Show a persistent "Última plantilla aplicada" summary card at the top of the templates tab.  
**Standard ref:** §23  
**Value:** Reduces anxiety about what was just done.  
**Why natural:** The data is already in the mutation result.  
**Sustainability:** Low cost — just persist the last result in component state.  
**Dependency:** None.  
**Should implement now?:** DEFER

### +1-02 — Settings tab URL state

**Problem / friction:** User can't bookmark or share a direct link to a specific settings tab.  
**Proposed +1:** URL search params for active tab (same as BX-001 fix).  
**Standard ref:** §23.+1.1 (context travels)  
**Value:** Bookmarkable, shareable, survives refresh.  
**Why natural:** Already implemented in dashboard, inventory, sales, fiscal.  
**Sustainability:** High — same pattern.  
**Dependency:** None.  
**Should implement now?:** YES

---

## 11. Required fixes

| Finding | Severity | Fix | Dependency | Acceptance |
|---|---|---|---|---|
| BX-001 | MEDIUM | URL-based tab state | None | Tab survives refresh; URL shows active tab |
| BX-002 | LOW | Focus ring on tab buttons | None | Keyboard navigation shows focus |
| BX-003 | LOW | Dashboard return context | None (already handled by sidebar) | Dashboard date range preserved |

---

## 12. Acceptance tests

### AT-01 — Settings tab URL state

**Given** user is on `/settings?tab=fiscal`  
**When** user refreshes the page  
**Then** fiscal tab is still active

### AT-02 — Settings tab navigation

**Given** user is on `/settings?tab=setup`  
**When** user clicks "Plantillas de Industria" tab  
**Then** URL changes to `/settings?tab=templates`  
**And** templates tab is active

### AT-03 — Focus ring on tabs

**Given** user is on settings page  
**When** user tabs through tab buttons  
**Then** each tab shows visible focus ring

---

## 13. Re-audit result

| Finding | Previous | Current | Evidence |
|---|---|---|---|
| BX-001 | OPEN | OPEN | Not yet fixed |
| BX-002 | OPEN | OPEN | Not yet fixed |
| BX-003 | OPEN | OPEN | Not yet fixed (low priority) |

---

## 14. §28 DoD checklist (adapted for Settings)

### A. Core Promise

- [x] Settings values reconcile with backend
- [x] Fiscal config is authoritative
- [x] Template application is atomic
- [x] Import data validates before commit
- [x] Permission restrictions enforced

### B. Contextual Navigation

- [x] Every action has a defined destination
- [ ] URL-based state (tabs not bookmarkable) — **BX-001**
- [ ] Back navigation preserves context — **BX-003**

### C. Attention Required

N/A — no exception panel in settings

### D. Cards & hierarchy

- [x] Layout intentional
- [x] No filler cards
- [x] Forms use proper validation
- [x] Cost-sensitive operations gated

### E. Microcopy

- [x] Button labels explicit
- [x] Error messages helpful
- [x] Hint text on forms
- [x] Technical language minimal

### F. Charts

N/A

### G. NHILOS +1

- [x] Template success result is useful +1
- [ ] Tab URL state as +1 — **BX-001**

### H. Visual restraint

- [x] No decorative cards
- [x] No ornamental motion
- [x] Colors semantic
- [x] Spacing clear
- [x] Borders subtle

### I. Accessibility

- [x] Keyboard path complete
- [ ] Focus visible — **BX-002**
- [x] Color not only signal
- [x] prefers-reduced-motion
- [x] Text scaling usable
- [x] WCAG AA contrast

### J. Performance / resilience

- [x] Error isolation
- [x] Loading states
- [x] No blocking loaders
- [x] Mutation states handled

---

## 15. Final verdict

`READY_AFTER_REQUIRED_FIXES`

### Rationale

Settings module is well-built with good form validation, clear states, and consistent design. Three medium/low findings remain: URL-based tab state (BX-001), focus rings (BX-002), and dashboard return context (BX-003). None are blockers for current functionality but should be closed for full NHILOS compliance.

### Open blockers

None — all findings are non-blocking improvements.

### Deferred refinements

- +1-01 (template success summary) — nice to have, low priority
- BX-003 (dashboard return context) — already handled by sidebar fix
