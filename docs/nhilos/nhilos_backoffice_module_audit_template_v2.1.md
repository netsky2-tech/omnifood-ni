# NHILOS POS — Module Experience Audit Template v2.1

**Based on:** `nhilos_backoffice_experience_standard_v1.0.md` (100% coverage)  
**Standard sections covered:** §0–§58  
**Use for:** Any backoffice module audit

**Amendments:** 2026-09-30 — added governed-fields (§17.5), default-vs-required clarification (§40), alert variants (§26.1), neutral-state badge note (§26), catalog consistency row (§28), DoD form bullet, and catalog guardrail (Appendix A). 2026-10-10 — added no-identifier-inputs (§17.6): foreign-key fields (`*_id`, UUID) use a selector with flexible textual search, never free text; governed-fields audit table (§14), Forms checklist (§31), consistency row (§28), anti-pattern AP-21. Version stays v2.1.

# <MODULE> — NHILOS Experience Audit

**Version:** 1.0  
**Date:**  
**Auditor:**  
**Module:**  
**Module authority:** (PRD / Architecture Spec / Acceptance Plan)  
**Routes/surfaces reviewed:**  
**Evidence reviewed:** (code / screenshots / runtime / tests)

---

## 1. Module job (§4)

**Primary user:**  
**Primary job:**  
**Secondary users/jobs:**  
**Risk if wrong:**  

---

## 2. Surface inventory (§6 Phase B)

| Surface | Route/component | Job | Read/write | Permissions | Evidence |
|---|---|---|---|---|---|
| | | | | | |

---

## 3. Universal page anatomy check (§7)

For each major surface, verify:

| Surface | Where am I? (§7.1 title/nav) | What can I do? (§7.2 primary action) | What am I looking at? (§7.3 data scope) | What needs attention? (§7.4 exceptions) | What happens next? (§7.5 actions) |
|---|---|---|---|---|---|
| | | | | | |

---

## 4. Information hierarchy check (§8)

| Surface | P0 primary job dominates? | P1 supporting context present? | P2 secondary not competing? | Anti-pattern: everything promoted to P0? |
|---|---|---|---|---|
| | | | | |

---

## 5. Experience coverage matrix (EX-01 → EX-18) (§51)

| ID | Dimension | Core question | Status | Evidence | Finding IDs |
|---|---|---|---|---|---|
| EX-01 | Core Promise | Does the module reliably perform its primary job? | | | |
| EX-02 | Product Truth | Does UI behavior match PRD/domain semantics? | | | |
| EX-03 | Precision | Can labels/data/actions be misinterpreted? | | | |
| EX-04 | Navigation | Does context travel between relevant surfaces? | | | |
| EX-05 | Findability | Can users find objects through appropriate search/filter/sort? | | | |
| EX-06 | Forms | Are entry/edit flows clear, safe and recoverable? | | | |
| EX-07 | Actions | Are consequences, risk and feedback clear? | | | |
| EX-08 | States | Loading/empty/error/partial/success states are intentional? | | | |
| EX-09 | Permissions | Is authorization correct end-to-end? | | | |
| EX-10 | Time | Are repeated steps/input/context eliminated? | | | |
| EX-11 | Sobriety | Is unnecessary UI removed? | | | |
| EX-12 | Consistency | Does it use established backoffice patterns? | | | |
| EX-13 | Microcopy | Is language precise, calm and actionable? | | | |
| EX-14 | Accessibility | Can the critical workflow be completed accessibly? | | | |
| EX-15 | Responsive | Does supported device behavior remain usable? | | | |
| EX-16 | Performance | Does technical behavior support perceived quality? | | | |
| EX-17 | +1 | Is there a useful sustainable improvement opportunity? | | | |
| EX-18 | Evidence | Can every PASS/FAIL claim be demonstrated? | | | |

Status values (§5.2): `PASS / FAIL / PARTIAL / NOT_EVIDENCED / N/A / AUTHORITY_CONFLICT`

---

## 6. Conflict resolution (§0.1)

If any finding reveals a conflict between product authority and experience standard:

| Conflict | Product authority | Experience standard | Resolution |
|---|---|---|---|
| | | | Report `AUTHORITY_CONFLICT` — do not silently choose |

---

## 7. Contextual navigation map (§9, §10)

| Source | Trigger | Destination | Context carried | Context preserved on arrival | Context preserved on return | Status |
|---|---|---|---|---|---|---|
| | | | | | | |

### Navigation checklist (§9, §10, §13, §14, §25)

- [ ] Context known by system is not re-entered manually (§9.1)
- [ ] No actionable link lands on generic list when context is known (§9.2)
- [ ] Contextual links are contracts — CTA not exposed until destination can consume context (§9.3)
- [ ] URL-first for meaningful filters (§9.4)
- [ ] List/detail/back preserves working state (§10)
- [ ] Search term remains visible after detail-and-back (§13.1)
- [ ] Filters persist through detail/back (§14.3)
- [ ] Deep-linked filters are visible (§14.4)
- [ ] Active tab is URL-addressable when useful (§25)

---

## 8. Sidebar and global navigation (§11)

| Requirement | Status | Evidence |
|---|---|---|
| Active route unambiguous | | |
| Group labels stable | | |
| Modules don't move arbitrarily | | |
| Badges indicate actionable state, not decoration | | |
| Navigation visibility follows permission | | |
| Hidden permission doesn't leave dead routes | | |
| Collapsed nav understandable (icon + accessible label) | | |
| Module naming matches product language | | |

---

## 9. Lists and data tables (§12)

### Table must answer (§12.1)

| Surface | What objects? | What state? | How to find? | How to narrow? | What can I do with one? | What can I do with several? |
|---|---|---|---|---|---|---|
| | | | | | | |

### Table details (§12.2–§12.5)

| Surface | Columns intentional (§12.2) | No internal IDs clutter (§12.2) | Numeric alignment (§12.3) | Row click clear (§12.4) | Row actions proportionate (§12.5) | Destructive separated (§12.5) |
|---|---|---|---|---|---|---|
| | | | | | | |

---

## 10. Search (§13)

| Surface | Matches user-recognizable identifiers (§13) | Immediate feedback (§13.1) | Clear empty result (§13.1) | Preserve query on detail/back (§13.1) | Search term visible (§13.1) | Clearing easy (§13.1) | No invisible "smart" criteria (§13.1) |
|---|---|---|---|---|---|---|---|
| | | | | | | | |

### No-results vs no-data (§13.2)

| Surface | No-data state (objects don't exist) | No-results state (filters returned none) | Active filter shown | Clear/reset action present |
|---|---|---|---|---|
| | | | | |

---

## 11. Filters (§14)

| Surface | Visible state (§14.1) | Reset available (§14.2) | Persist through detail/back (§14.3) | Deep-linked filter visible (§14.4) |
|---|---|---|---|---|
| | | | | |

---

## 12. Sorting and pagination (§15)

| Surface | Active sort visible | Direction visible | Default sort matches primary job | Deterministic | Pagination communicates X–Y de Z | Filter change resets pagination |
|---|---|---|---|---|---|---|
| | | | | | | |

---

## 13. Bulk actions (§16)

| Surface | Only appear when selection exists | Object count shown | Action shown | Consequences shown | Confirmation per risk | Succeeded/failed count after | Partial failure not collapsed to generic success |
|---|---|---|---|---|---|---|---|
| | | | | | | | |

---

## 14. Forms (§17–§22)

| Surface | Layout (§17.1) | Labels visible (§17.2) | Required explicit (§17.3) | Helper text when useful (§17.4) | Validation timing (§18.1) | Error copy actionable (§18.2) | Form-level errors (§18.3) | Server validation authority (§18.4) | Save feedback explicit (§19) | Save behavior correct (§19.1) | Success copy specific (§19.2) | Save+continue evaluated (§19.3) | Dirty state protected (§20) | Create flow clear (§21) | Edit flow scope clear (§22) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| | | | | | | | | | | | | | | | |

### Save behavior detail (§19.1)

| Surface | Duplicate submit prevented | Button width preserved | Progress exposed without locking unrelated context |
|---|---|---|---|
| | | | |

### Governed fields (§17.5)

| Surface | Governed values use shared catalog selector (units/currencies/categories/suppliers) | Free text where a catalog exists? | Empty-catalog guidance present |
|---|---|---|---|
| | | | |

### No identifier inputs (§17.6)

| Surface | Foreign-key fields (`*_id`) use selector with flexible textual search (§17.6) | Free-text input asking for an identifier/UUID? | Search covers several columns; tolerant of case, accents, partial matches (§17.6) | Long lists offer "ver todos" |
|---|---|---|---|---|
| | | | | |

---

## 15. Destructive / high-risk actions (§23)

| Action | Risk level | Confirmation proportionate (§23.1) | Object/consequence/reversibility/scope communicated | Label explicit verb (§23.3) | Typed confirmation if destructive (§23.4) | No over-confirmation of harmless actions (§23.2) | Hidden side effects explained (AP-19) |
|---|---|---|---|---|---|---|---|
| | | | | | | | |

---

## 16. Detail screens (§24)

| Surface | Identity clear (§24.1) | Current state clear (§24.2) | Primary facts clear (§24.3) | Related objects deep-linked with context (§24.4) | History/audit if appropriate (§24.5) | Actions present (§24.6) |
|---|---|---|---|---|---|---|
| | | | | | | |

---

## 17. State coverage (§27–§32, §35)

| Surface | Loading page (§28.1) | Loading partial (§28.2) | Refetch "Actualizando" (§28.3) | Form no auto-refresh (§28.4) | Empty first-use (§29) | Empty valid (§29) | Empty filtered (§29) | Empty permission (§29) | Error answers 5 questions (§30) | Error preserves context (§30.1) | Retry appropriate (§30.2) | Technical detail in support only (§30.3) | Success calm + next step (§31) | Toast transient (§32) | Toast not for retained info (§32) | Toast errors stay visible (§32) | Toast not stacked (§32) | Partial/Unknown honest (§27,§35) | Freshness exposed when material (§35) | `generatedAt` not sync truth (§35) | Permission state intentional (§33) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| | | | | | | | | | | | | | | | | | | | | |

### State vocabulary (§27)

- [ ] Consistent lifecycle terms: ACTIVE/INACTIVE/DRAFT/PENDING/PROCESSING/COMPLETE/PARTIAL/UNAVAILABLE/UNKNOWN/FAILED/CANCELED/VOID
- [ ] No synonyms for same state (§26)
- [ ] Neutral lifecycle states (e.g. INACTIVE) not styled with danger color (§26)
- [ ] `—` means unavailable, never zero (§34)
- [ ] Badge colors semantic, not decorative (§26)

---

## 18. Long-running operations (§36)

| Operation | Acknowledge start | Show progress | Distinguish queued/running/completed/failed | Preserve navigation when safe | Allow return later | Result/error summary | No fake progress % |
|---|---|---|---|---|---|---|---|
| | | | | | | | |

---

## 19. Import / upload experiences (§37)

| Surface | Accepted format identified | Required columns/rules explained | Validate without destroying good work | File-level vs row-level error distinguished | Partial acceptance explicit |
|---|---|---|---|---|---|
| | | | | | |

---

## 20. Dates and time (§38)

| Surface | Product-authorized timezone | Selected period clear | Date included when time could refer to another day | Created/occurred/effective/updated distinguished | No ambiguous relative text for auditable history |
|---|---|---|---|---|---|
| | | | | | |

---

## 21. Microcopy (§39)

### Buttons (§39.1)

| Surface | Verbs used | Generic OK/Aceptar/Ver/Continuar avoided when destination can be named | Compact UI has explicit accessible label |
|---|---|---|---|
| | | | |

### Descriptions (§39.2)

- [ ] Do not explain what heading already says

### Warnings (§39.3)

- [ ] State consequence
- [ ] Avoid fear language

### Technical terms (§39.4)

- [ ] Use only when user benefits
- [ ] No implementation vocabulary from backend code

---

## 22. Raw identifiers & technical references audit (§39.4)

> **Rule:** No backend enum values, internal task references, document section numbers, or implementation identifiers may appear in user-facing text.

### UPPERCASE_SNAKE_CASE in visible text

| File | Line | Raw identifier | Context | Fix |
|---|---|---|---|---|
| | | | | |

### Internal references in visible text (ONB, PRD, §)

| File | Line | Raw reference | Context | Fix |
|---|---|---|---|---|
| | | | | |

### Backend snake_case in rendered text

| File | Line | Raw field name | Rendered as | Fix |
|---|---|---|---|---|
| | | | | |

### Backend enum values shown without label mapping

| File | Line | Raw enum value | Should map to | Fix |
|---|---|---|---|---|
| | | | | |

### Backend error codes shown to user

| File | Line | Raw error code | Should show | Fix |
|---|---|---|---|---|
| | | | | |

---

## 23. Human defaults (§40)

| Default | Common? | Safe? | Understandable? | Reversible? | Not destructive/silent/permission-sensitive/hidden |
|---|---|---|---|---|---|
| | | | | | |

- [ ] No default silently satisfies a required field (§40) — required governance fields start empty or require explicit confirmation

---

## 23. Progressive disclosure (§41)

| Surface | SUMMARY → DETAIL → TECHNICAL pattern | Complexity shown when user needs it | Material limitations not hidden behind advanced section |
|---|---|---|---|
| | | | |

---

## 24. Visual & motion (§42–§44)

### Color semantics (§42.1)

| Color | Usage | Contrast ratio (WCAG AA ≥ 4.5:1) | Status |
|---|---|---|---|
| | | | |

### Alert and notification variants (§26.1)

| Surface | Variant matches business meaning | Perceptible tint/border/icon (not default neutral) | Danger not used for neutral states | Color not sole signal (§46) |
|---|---|---|---|---|
| | | | | |

### Visual restraint checklist (§42, §43)

- [ ] Cards group meaningful ideas (§42.2)
- [ ] Not every section in a card (AP-04)
- [ ] Borders for structure, not decoration (§42.3)
- [ ] Shadows follow elevation system (§42.4)
- [ ] No increased shadow for "premium" signal (AP-16)
- [ ] Spacing groups ideas clearly (§42.5)
- [ ] Typography hierarchy before decoration (§42.6)
- [ ] Numeric values use tabular figures (§42.6)
- [ ] No fake-luxury treatment (AP-16)
- [ ] Luxury-by-restraint filter applied (§43): "Does this materially improve comprehension?"
- [ ] Normality quieter than exceptions (§18 Brand/luxury)

### Motion (§44)

- [ ] Motion only explains/orients/confirms/gives tactility
- [ ] No motion to prove budget or manufacture premium
- [ ] No motion that delays access to content
- [ ] No celebration animation for routine CRUD
- [ ] Reduced motion respected (§46)
- [ ] No motion that obscures state changes

---

## 25. Accessibility (§46)

| Criterion | Status | Evidence |
|---|---|---|
| WCAG 2.1 AA baseline | | |
| Visible focus | | |
| Logical keyboard order | | |
| Escape closes appropriate overlays | | |
| Arrow-key for tabs/menus where expected | | |
| Icon buttons have accessible names | | |
| Errors use aria-describedby or equivalent | | |
| Active navigation uses semantic state | | |
| Color not sole signal | | |
| Reduced motion respected | | |
| 200% zoom remains usable | | |

### Contrast ratios verified

| Element | Foreground | Background | Ratio | Threshold | Status |
|---|---|---|---|---|---|
| | | | | 4.5:1 (normal) / 3:1 (large/icon) | |

---

## 26. Permissions (§33)

| Layer | Status | Evidence |
|---|---|---|
| Server-side authoritative enforcement (§33) | | |
| Frontend: don't request/execute unauthorized (§33) | | |
| Presentation: no fake zero/blurred/placeholder/hidden-by-CSS (§33) | | |
| Permission-aware composition: omit and reflow (§33.1) | | |
| Disabled vs hidden decision documented (§33.2) | | |
| Permission-hidden tabs leave no unexplained gaps (§25) | | |
| Direct URL access remains protected | | |

---

## 27. Sensitive and financial data (§34)

- [ ] Consistent currency formatting
- [ ] Consistent decimals
- [ ] Historical values stay historical (current config doesn't change them)
- [ ] Amounts don't change due to current config
- [ ] `—` means unavailable/unknown, never zero
- [ ] Masked/redacted data is explicit
- [ ] Permission restrictions before serialization where required

---

## 28. Consistency (§48)

| Item | Consistent across modules? | Evidence |
|---|---|---|
| Button labels | | |
| Placement | | |
| Table behavior | | |
| Filters | | |
| Pagination | | |
| Dialog actions | | |
| Date formats | | |
| Currencies | | |
| Status vocabulary | | |
| Catalog-governed fields use shared catalog (§17.5) | | |
| No identifier inputs: no free-text `*_id`/UUID entry (§17.6) | | |
| Toasts | | |
| Empty states | | |
| Destructive confirmations | | |
| Breadcrumb/back behavior | | |

---

## 29. NHILOS +1 opportunities (§49)

Check each applicable +1 pattern:

| Pattern | Applicable? | Implemented? | Notes |
|---|---|---|---|
| +1.1 Context travels (deep links preserve question) | | | |
| +1.2 Remembered list state (detail/back returns to context) | | | |
| +1.3 Prepared defaults (safe common values pre-selected) | | | |
| +1.4 Clear next step (success/empty/error point to next action) | | | |
| +1.5 Error recovery preserves work | | | |
| +1.6 Explain impact (warnings say what is affected) | | | |
| +1.7 Useful preview before committing material action | | | |
| +1.8 No repeated input (reuse known information) | | | |
| +1.9 Contextual creation (preselect from source context) | | | |
| +1.10 Contextual related views (open object's movements) | | | |
| +1.11 Smart return path (preserve original working context) | | | |
| +1.12 Useful copy over tooltip dependence | | | |
| +1.13 Quiet healthy states (normality less attention than exceptions) | | | |
| +1.14 Partial success clarity (bulk/import explain what succeeded) | | | |
| +1.15 Relevant keyboard efficiency (for repetitive expert workflows) | | | |

### Additional +1 proposals

#### +1-01 — <title>

**Problem / friction:**  
**Proposed +1:**  
**Standard ref:** §49.+1.X  
**Value:**  
**Why natural:**  
**Sustainability:**  
**Dependency:**  
**Should implement now?:** YES / NO / DEFER

---

## 30. Anti-pattern quick check (§50)

| ID | Anti-pattern | Check | Status |
|---|---|---|---|
| AP-01 | Generic destination | Any link routes to unfiltered generic list? | |
| AP-02 | Unknown as zero | Any `—`/unknown rendered as `0`? | |
| AP-03 | Decoration as value | Any UI element that doesn't improve comprehension? | |
| AP-04 | Every section in card | Cards wrapping individual fields? | |
| AP-05 | Healthy-state noise | Normal statuses competing with exceptions? | |
| AP-06 | Generic copy | `Ver`, `Aceptar`, `Error`, `Procesado` used? | |
| AP-07 | Reset after detail | User loses list context on detail/back? | |
| AP-08 | Form data loss | Recoverable error erases form data? | |
| AP-09 | Permission by CSS | Sensitive data hidden visually but fetched? | |
| AP-10 | Error as code | Raw HTTP/DB error as primary explanation? | |
| AP-11 | Confirmation fatigue | Dialogs for harmless routine changes? | |
| AP-12 | Destructive ambiguity | `Aceptar` performs destructive action? | |
| AP-13 | Filter invisibility | Deep-linked filter active but invisible? | |
| AP-14 | Table dumping | Every DB field as column? | |
| AP-15 | Feature dumping | All capabilities at same hierarchy level? | |
| AP-16 | Fake luxury | Dark/glow/animation for status? | |
| AP-17 | Disabled dead end | Disabled control with no explanation? | |
| AP-18 | Success dead end | Success with no next step guidance? | |
| AP-19 | Hidden side effect | Change impacts other data without explanation? | |
| AP-20 | Inconsistent vocabulary | Same state called different names? | |
| AP-21 | Identifier transcription | Any free-text input whose datum is a foreign key (`*_id`, UUID)? (§17.6) | |

---

## 31. Findings

### BX-001 — <title>

**Severity:** BLOCKER / REQUIRED / REFINEMENT / +1 OPPORTUNITY  
**Status:** OPEN  
**Standard:** §<section>  
**Surface:**  
**Authority:**  

**Current**  
...

**Expected**  
...

**Why it matters**  
(core promise / precision / care / time / sobriety / +1)

**Evidence**  
(file/code/screenshot/runtime/test)

**Correction**  
(bounded recommended change)

**Acceptance test**  
(observable test)

**Dependencies**  
...

---

## 32. Required fixes

| Finding | Severity | Fix | Dependency | Acceptance |
|---|---|---|---|---|
| | | | | |

---

## 33. Acceptance tests

### AT-01

**Given**  
...

**When**  
...

**Then**  
...

---

## 34. Re-audit result

| Finding | Previous | Current | Evidence |
|---|---|---|---|
| | | | |

---

## 35. §54 Module DoD checklist

A module is **NHILOS Experience Ready** only when:

### Authority

- [ ] Product authority identified
- [ ] No unresolved product/experience contradiction
- [ ] Material claims are evidenced

### Core promise

- [ ] Primary jobs succeed correctly
- [ ] No BLOCKER remains open
- [ ] Material partial/unknown states are honest

### Navigation

- [ ] Important drill-downs preserve context
- [ ] No generic-list dead ends remain
- [ ] List/detail/back preserves useful working state

### Lists/data

- [ ] Search matches user-recognizable identifiers
- [ ] Filters are visible/resettable
- [ ] Sorting is understandable
- [ ] Pagination/count is clear
- [ ] Table columns are intentional

### Forms

- [ ] Labels/requirements are clear
- [ ] Catalog-governed fields use the shared catalog, not free text (§17.5)
- [ ] Foreign-key fields (`*_id`) use a selector with flexible textual search — no free-text input for a UUID or identifier (§17.6)
- [ ] Validation is actionable
- [ ] Server errors preserve work where possible
- [ ] Dirty-state loss is protected
- [ ] Save feedback is explicit

### Actions

- [ ] Primary action is clear
- [ ] Destructive actions explain consequence
- [ ] Bulk actions expose count/scope
- [ ] Success has appropriate next step
- [ ] No hidden material side effect

### States

- [ ] Loading state exists
- [ ] First-use empty state exists where applicable
- [ ] Filtered no-results differs from no-data
- [ ] Errors explain impact/recovery
- [ ] Permission state is intentional
- [ ] Partial/unavailable/unknown states do not become zero

### Permissions/security

- [ ] Backend is authoritative
- [ ] Unauthorized data is not fetched/exposed unnecessarily
- [ ] UI composition matches permission
- [ ] Direct URL access remains protected

### Brand / luxury

- [ ] No fake-luxury treatment
- [ ] Visual hierarchy is restrained
- [ ] Normality is quieter than exceptions
- [ ] Repetition/friction is deliberately reduced
- [ ] Page feels prepared rather than decorated

### +1

- [ ] Core Promise passes before +1 work
- [ ] At least one meaningful +1 was evaluated
- [ ] Implemented +1 is useful and sustainable
- [ ] +1 does not add material friction

### Accessibility

- [ ] Keyboard critical path passes
- [ ] Visible focus passes
- [ ] Interactive icons have accessible names
- [ ] Errors are programmatically associated
- [ ] Color is not sole signal
- [ ] Reduced motion passes
- [ ] 200% zoom remains usable

### Responsive/performance

- [ ] Desktop/tablet supported flow passes
- [ ] Mobile read behavior does not fail accidentally
- [ ] No unnecessary full-page loading
- [ ] Secondary failure does not collapse unrelated functionality
- [ ] Performance does not materially contradict experience

### Evidence

- [ ] Every corrected BLOCKER/REQUIRED finding has acceptance test/evidence
- [ ] `NOT_EVIDENCED` items are not counted as PASS
- [ ] Final verdict is explicit

---

## 36. Final verdict

`READY / READY_AFTER_REQUIRED_FIXES / NOT_READY / BLOCKED_BY_PRODUCT_DECISION / BLOCKED_BY_MISSING_EVIDENCE`

### Rationale

...

### Open blockers

...

### Deferred refinements

...

---

## Appendix A: Agent guardrails (§57)

### Must NOT

- [ ] Implement before completing evidence inventory unless explicitly asked
- [ ] Invent missing product behavior
- [ ] Mark subjective taste as BLOCKER
- [ ] Redesign whole modules when surgical correction solves the issue
- [ ] Add new capabilities merely to create a +1
- [ ] Change domain rules under experience justification
- [ ] Declare PASS from documentation alone when implementation evidence is required
- [ ] Declare a form or consistency PASS without checking whether a shared catalog exists for free-text entry fields
- [ ] Remove important information merely to achieve minimalism
- [ ] Use competitor behavior as authority over NHILOS product contracts

### Should

- [ ] Prefer surgical fixes
- [ ] Preserve working domain behavior
- [ ] Trace every recommendation to Product Truth or this Standard
- [ ] Distinguish current defect from optional refinement
- [ ] Propose +1 only after baseline is healthy

---

## Appendix B: Whole-backoffice coverage registry (§55)

| Module | Audit version | Core Promise | Required fixes | Blockers | +1 reviewed | Final status |
|---|---|---|---|---|---|---|
| Dashboard | | | | | | |
| Sales | | | | | | |
| Inventory | | | | | | |
| Fiscal | | | | | | |
| Catalog / Products | | | | | | |
| Promotions | | | | | | |
| Loyalty / Customers | | | | | | |
| Recipes / Production | | | | | | |
| Users / Permissions | | | | | | |
| Settings / Onboarding | | | | | | |
| Other | | | | | | |

---

## Appendix C: Cross-module consistency pass (§56)

After individual module audits, verify:

| Check | Status | Evidence |
|---|---|---|
| Same status named differently across modules | | |
| Same action placed differently without reason | | |
| Inconsistent currencies/dates | | |
| Search behaving differently without reason | | |
| Filter persistence mismatch | | |
| Different destructive confirmation patterns | | |
| Different empty/error copy | | |
| Permission behavior mismatch | | |
| Deep links that fail at module boundaries | | |
| Inconsistent active navigation | | |
| Duplicated capabilities | | |
| Return-path inconsistencies | | |
