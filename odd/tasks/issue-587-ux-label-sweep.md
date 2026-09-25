# Issue #587 — App-wide UX label sweep (centralized code → Spanish label map)

Status: in progress · Branch: `feat/587-ux-label-map` (worktree `issue-587-ux-label-map`, base `main` @ `663d8414`)

## Problem

Across POS and owner dashboard, internal codes/enums reach the UI verbatim: raw SCREAMING_CASE blocker codes (`NO_ACTIVE_ATTEMPT`), attempt statuses (`ASSIGNED`), check statuses (`PASS`/`FAIL`), payment methods (`CASH`), roles (`OWNER`), backend failure codes (`TERMINAL_MISMATCH`). Evidence: 40 leak sites inventoried by the exploration agent (2026-09-25); full table lives in the issue report and the scout transcript. The activation flow is the worst offender — raw strings cross 3–4 layers (`discovery_service → session_service → view_model → view`) with no label mapping anywhere.

## Decisions

- **D1 — Plain `Map<String, String>` per family, not a class.** Matches existing plain-enum conventions; trivially testable. Lives at `apps/pos_app/lib/core/localization/label_map.dart`.
- **D2 — `localize(code, map) => map[code] ?? code` fallback.** Pass-through for unknown codes (matches the existing `_reprintReasonLabel` convention). Never crash, never "(unknown)". The regression guard asserts every map value is non-empty and NOT `^[A-Z][A-Z_]+$`, so unmapped codes are caught at the map level, not by falling back in production.
- **D3 — Backend machine codes stay as-is** (API contract). Translation happens at the view layer only.
- **D4 — Owner dashboard gets the same pattern** at `apps/owner_dashboard/src/lib/labels.ts` with a typed `localize` helper; raw backend messages keep rendering with the raw code visible in the detail span but get a human lead line.
- **D5 — Raw terminal ids (`pos-local-<uuid>`) are OUT OF SCOPE** here; the correlation-id/QR treatment is issue #567.
- **D6 — Arbitrary exception text (`e.toString()` SnackBars) is OUT OF SCOPE** except where a known code/enum leaks; this sweep maps codes, not exception dumps.

## Work units (each = one work-unit commit, tests green before commit)

| WU | Content | Files (edit surfaces) |
|----|---------|----------------------|
| WU1 | Label map core + regression guard test | `apps/pos_app/lib/core/localization/label_map.dart`, `apps/pos_app/test/core/localization/label_map_test.dart` |
| WU2 | Activation flow migration (items 1–8): blockers, attempt statuses, check code/status matrix, backend verdicts, evidence refs | `activation_terminal_view.dart` (+ its test) |
| WU3 | Sales surfaces (items 9, 10, 13, 14, 16): payment methods, void/reprint reason maps centralized (replacing per-screen `_label` switches) | `sale_view.dart`, `sales_history_view.dart`, `dgi_report_view.dart` |
| WU4 | Identity + inventory (items 18, 19, 24–29, 31): roles, count session status, forensic alert severity/type/status/movement, kardex movement labels | `user_management_view.dart`, `physical_count_view.dart`, `count_session_detail_view.dart`, `forensic_alert_view.dart`, `kardex_view.dart` |
| WU5 | Hardware + sync (items 17, 22): printer status in settings statusMessage, known sync error codes in sync badge detail | `hardware_settings_view.dart`, `cloud_sync_status_badge.dart` |
| WU6 | Owner dashboard: labels.ts + localize + migration of items 32–40 + `labels.test.ts` | `src/lib/labels.ts`, `setup-center-view.tsx`, `inventory-page.tsx`, `bulk-import-wizard.tsx`, plus test |

## Regression guard (WU1)

`label_map_test.dart` walks every exported `k*Labels` map: keys non-empty; values non-empty, non-SCREAMING_CASE (`^[A-Z][A-Z_]+$`), Spanish copy; `localize` passthrough for unknown codes. Owner dashboard: equivalent `labels.test.ts`.

## Follow-ups found during WU2 (out of scope here)

- Finalize failureCodes (`FINALIZE_NETWORK_ERROR`, `FINALIZE_UNACKNOWLEDGED`, `ACTIVATION_IDENTITY_MISSING`, `UNKNOWN_FINALIZER_ERROR`) leak embedded inside the composed English string "Finalizer communication error: …" built in `activation_reconnect_sync_runner.dart` and rendered in the free-text error card (D6). Fix belongs in the runner: code-aware composition.
- `TERMINAL_PRIMING_*` sibling priming codes were folded into `kActivationBlockerLabels` during WU2 (parent decision, 2026-09-25).

## Acceptance criteria

1. No direct render of any inventoried raw code outside the label map files (grep-verifiable for the Section A strings).
2. `flutter test` and `flutter analyze` green in `apps/pos_app`; dashboard unit tests green.
3. Unknown/new codes fail the map-walking test when added to a map with a raw value, and fall back pass-through at runtime (fail-visible in tests, never crash in prod).

## Non-goals

- Full i18n/l10n framework, `.arb` extraction.
- Terminal id display (#567), activation screen text/labels specific to #560.
- Backend machine-code changes.

Found during: stage-3 device runs (#556), 2026-09-24/25, MIRAY TPM4G_E9863.
