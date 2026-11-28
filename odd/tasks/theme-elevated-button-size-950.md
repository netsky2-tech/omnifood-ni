# Feature: #950 — Fix Global Theme `Size.fromHeight(48)` Infinite Width on `ElevatedButton`

- Issue: `#950`
- Branch: `fix/theme-elevated-button-size-950`
- UX Standard: `docs/nhilos/nhilos_backoffice_experience_standard_v1.0.md` (NHILOS Luxury +1: 48dp minimum touch target, zero silent layout crashes, intentional full-width CTAs explicit).

## Specs

- **S1 — Global Theme Fix (`apps/pos_app/lib/main.dart`):**
  - Replace `minimumSize: const Size.fromHeight(48)` with `minimumSize: const Size(0, 48)` in `elevatedButtonTheme` (and verify no other global button theme in `main.dart` uses `Size.fromHeight(...)` / infinite width).
  - Verify `ElevatedButton` inside `Column(crossAxisAlignment: CrossAxisAlignment.start)`, `IntrinsicWidth`, `Wrap`, and `Dialog`/`AlertDialog` renders cleanly with `height >= 48.0`, finite width, and zero `BoxConstraints forces an infinite width` errors.

- **S2 — Full `ElevatedButton` Audit Across `apps/pos_app/lib/`:**
  - Audit all `ElevatedButton` usages across `apps/pos_app/lib/`.
  - Every button that is an intentional full-width CTA (form submits, primary modal CTAs, full-width auth/pairing/checkout buttons) and previously relied accidentally on infinite `minimumSize` MUST be made explicitly full-width (`SizedBox(width: double.infinity)` or `CrossAxisAlignment.stretch` on its parent `Column`).
  - Content-width buttons (dialog actions, inline buttons, `customer_select_dialog.dart` "Nuevo", etc.) keep natural content width with 48dp minimum height; simplify any local `ConstrainedBox` workarounds where safe.
  - Also audit local `Size.fromHeight(48)` occurrences (`pin_pad.dart`, `tip_dialog.dart`) so none can trigger infinite-width errors in intrinsic contexts while keeping intended full-width layout.

- **S3 — Regression & Responsive Widget Tests (384×823.5 S23 Logical Viewport):**
  - Add theme regression tests covering `ElevatedButton` inside `Column` (non-stretch), `IntrinsicWidth`, `Wrap`, and `AlertDialog` using the real app theme.
  - Verify zero overflow / layout exceptions across key dialogs (`customer_select_dialog`, `tip_dialog`, etc.) at `384x823.5` logical viewport (Samsung Galaxy S23) and narrow widths.

- **S4 — Real Samsung Galaxy S23 Hardware E2E (`apps/pos_app/integration_test/theme_dialogs_s23_hardware_e2e_test.dart`):**
  - Render real app `ThemeData` and critical dialogs on the physical Samsung Galaxy S23 (`SM_S918B`, `R5CWB2LQJDJ`, 1080×2316 / DPR 2.8) with `FlutterError.onError` trap.
  - Assert zero `FlutterError` (no `BoxConstraints forces an infinite width`, no `RenderFlex overflowed`), every `ElevatedButton` renders with `height >= 48.0` and finite positive width, intentional full-width CTAs span full container width, and content-width buttons (like `"Nuevo"` in customer select dialog) stay compact and visible.

## Tasks

- [x] `T1` (S1–S2) [explore] Audit all `ElevatedButton` & global button theme usages in `apps/pos_app/lib/` and classify full-width vs content-width — commit: n/a
- [x] `T2` (S1–S3) [worker] Update `main.dart` global theme (`buildNhilosPosTheme()`) to `Size(0, 48)`, apply explicit full-width containers (`shrinkage_view`, `sale_view`, `activation_terminal_view` incl. `go_to_pos_button`), clean local `Size.fromHeight(48)` (`pin_pad`, `tip_dialog`), add 384×823.5 theme regression tests (117/117 PASS) — commits: `9d377b56`, `HEAD`
- [x] `T3` (S4) [worker + S23 hardware] Author & execute `theme_dialogs_s23_hardware_e2e_test.dart` on real Samsung Galaxy S23 (`SM_S918B`, `R5CWB2LQJDJ`, ARM64, Impeller Vulkan) — **3/3 `ALL_TESTS_PASSED`** — commit: `e02534c8`
- [x] `T4` (S1–S4) [verify] Independent `gentle-ai-verify` (Risk: item 3 — S1/S3/S4 `met`, caught S2 `go_to_pos_button` gap, fixed & re-verified) — ready for PR closing `#950`

## Log

- **L1 (Original user request):** "Vamos con: - #950 (tema global Flutter Size.fromHeight infinito que rompe diálogos)"
