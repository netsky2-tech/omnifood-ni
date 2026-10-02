# ODD Task: NHILOS POS Experience Upgrade (Audit Remediation PX-001..PX-005 & Design Standard §0–§62)

**Feature Branch:** `feat/nhilos-pos-experience-upgrade`
**Isolated Worktree:** `/home/octavio_morales/omnifood-ni-pos-ux`
**Authoritative References:**
- `docs/nhilos/nhilos_brand_experience_principles_v1.0.md` (Part B: Cuidamos la operación)
- `docs/nhilos/nhilos_pos_experience_standard_v1.0.md` (§0–§62)
- `docs/nhilos/audits/pos_experience_audit_v1.0.md` (Findings PX-001 to PX-005)

---

## Scope & Target Surfaces

1. **Tokens & Theme Alignment (§42.1, §42.7)**:
   - Deep Teal (`#1E3A40`) & Navy (`#0F292E`) primary
   - Slate 50 (`#F8FAFC`) background, Slate 200 (`#E2E8F0`) structural borders
   - Slate 900 (`#0F172A`) primary text, Slate 500 (`#64748B`) secondary text
   - Emerald 600 (`#059669`) success, Red 600 (`#DC2626`) danger, Amber 600 (`#D97706`) warning
   - Standard radii: 12 dp for cards/modals, 8 dp for buttons/chips, 4 dp for badges
   - Design system widgets update in `ui/design_system/` and `ThemeData` in `main.dart`.

2. **PX-001 (REQUIRED): Resolve "Síndrome de la Hamburguesa" (§12.6)**:
   - Dynamic 2-level resolver:
     - Level 1: Category glyphs (Hot coffee -> coffee cup, Cold drinks -> tall cold cup, Bakery -> bakery/croissant, Food -> dining utensils, Burgers -> only when category is burger).
     - Level 2: Typographic monogram on soft pastel category background (`ED`, `C12`, etc.) when no category glyph matches.
   - Replace hardcoded `Icons.fastfood` in `sale_view.dart`.

3. **PX-002 (REQUIRED): Chromatic Dispersion & Design System Alignment (§18.2, §42.1, §41)**:
   - Keypad "clean slate" in `pin_pad.dart`: white numeric keys, `#F1F5F9` neutral gray for `⌫` and `C` with `#475569` text/icon (ban `#795548` brown and alarm red on `C`).
   - Control de Caja in `cash_shift_view.dart` & dialogs: ban indigo (`#3949AB`) and purple; align AppBar, KPI cards, and buttons to Deep Teal and Slate.
   - Discreet Buzzer/Pager in `multi_currency_checkout_dialog.dart`: replace alarm amber box with a clean, discreet collapsible field with neutral bell icon (§41).

4. **PX-003 (REQUIRED): Rich Contextual Rows in Sales History (§12.2)**:
   - Invoice list items in `sales_history_view.dart` show:
     - Formatted invoice number (`#000007`)
     - Timestamp and cashier name (`21:43 · Maxwell O.`)
     - Item summary line (`1x Cappuccino 12oz, 1x Americano`)
     - Payment method badge (`Efectivo`, `Tarjeta`, `Mixto`)
     - Tabular total (`C$ 225.00`)
     - Voided invoices with subtle red tint + `ANULADA` badge (§26.1).
   - Wire data loading and caching in `sales_history_view_model.dart`.

5. **PX-004 (REFINEMENT) & PX-005 (+1 OPPORTUNITY): Tabular Numbers (§34.1) & Haptic Feedback (§49)**:
   - Apply `FontFeature.tabularFigures()` across FOH monetary amounts (checkout dialog, cart, history, cash summary).
   - Add `HapticFeedback.mediumImpact()` on sale completion.
   - Calm success notification (`Venta registrada · Ticket #...`) without chatbot exclamation marks.

6. **Verification & DoD (§61, §62)**:
   - Flutter tests passing.
   - Zero forbidden colors (`#795548`, `#3949AB`, uncalm yellows).
   - Worktree clean and commits recorded.

---

## Tasks

- [x] Task 1: Design Tokens & Theme Alignment (§42.1, §42.7) — Evidence: commit `87e8dfb5`
- [x] Task 2: PX-001 Elimination of "Síndrome de la Hamburguesa" (§12.6) — Evidence: commit `7f75bfa0`
- [ ] Task 3: PX-002 Neutralize Chromatic Dispersion & Clean Slate Keypad (§18.2, §42.1, §41)
- [ ] Task 4: PX-003 Rich Contextual Rows in Sales History (§12.2)
- [ ] Task 5: PX-004 Tabular Numbers (§34.1) & PX-005 Haptic Feedback on Sale (§49)
- [ ] Task 6: Comprehensive Verification & Acceptance Tests
