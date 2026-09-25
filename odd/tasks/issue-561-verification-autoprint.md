# Issue #561 — Verification sale respects the auto-print toggle

Status: in progress · Branch: `fix/561-verification-autoprint` (worktree `issue-561-auto-print`, base `main` @ `663d8414`)

## Problem

The onboarding verification sale prints unconditionally: `activation_controlled_sale_runner.dart` gates printing on `printerIsReady` only and never reads `autoPrintInvoice`, while the normal sales flow gates on it (`sale_view_model.dart:1449`). Worse, printing is a HARD activation requirement at both layers (`SALE_RECEIPT_PATH` in the backend `V1_REQUIRED_ACTIVATION_CHECKS` with no WARNING tolerance; local gate requires all-PASS to leave `RUNNING`), so an owner who disabled auto-print is surprised in the field AND could hard-fail activation if the printer hiccups at that moment.

## Founder decision (2026-09-25)

**Option A**: respect the toggle. When `autoPrintInvoice == false`, the verification sale does NOT print; `SALE_RECEIPT_PATH` is recorded as `WARNING` with evidence ref `RECEIPT_SKIPPED_BY_USER_CONFIG`; the backend tolerates that single WARNING and finalizes as `PASS_WITH_WARNING`.

Rationale: the phase-1 `TEST_PRINT` check already exercises the printer independently (activation still hard-fails on a broken printer); the toggle's semantics belong to the owner; the offline sale itself persists and syncs identically.

## Rules

- **R1 — Explicit whitelist**: only `POST_RECONNECT_SYNC` and `SALE_RECEIPT_PATH` tolerate `WARNING` in backend finalization; any other check WARNING/FAIL keeps failing the attempt (`CHECK_FAILED_*` / `INVALID_WARNING_*`). No generic WARNING bypass.
- **R2 — Local gate mirrors the whitelist**: the attempt may advance to `LOCAL_ACTIVATION_EVIDENCE_COMPLETE` with a `WARNING` ONLY when it is `SALE_RECEIPT_PATH` with evidence ref `RECEIPT_SKIPPED_BY_USER_CONFIG`; any other non-PASS still blocks (`RUNNING`).
- **R3 — Printer-offline and unresolved-tax-regime stay hard FAIL** (config-independent, existing behavior preserved: `RECEIPT_BLOCKED_UNRESOLVED_TAX_REGIME` path untouched).
- **R4 — Default unchanged**: `autoPrintInvoice` defaults to `true`; the happy-path print flow and its evidence (`RECEIPT_PRINTED_OK`, `SALE_RECEIPT_PATH=PASS`) are untouched.

## Changes

| Site | Change |
|------|--------|
| `activation_controlled_sale_runner.dart` (~L315–390) | Read `autoPrintInvoice` from the already-injected `PrinterConfigService`; when false, skip printing, record `SALE_RECEIPT_PATH=WARNING` + `RECEIPT_SKIPPED_BY_USER_CONFIG` (new evidence ref), no error entry |
| `activation_controlled_sale_runner.dart` (~L607–614) | Local transition tolerates the R2 WARNING case |
| `activation.service.ts` (~L645–700) | Backend finalization: `SALE_RECEIPT_PATH` joins `POST_RECONNECT_SYNC` in the WARNING-tolerant branch → `PASS_WITH_WARNING` |
| Tests | Runner unit tests (skip-when-off incl. printInvoice never called; default still prints; offline/regime still FAIL); backend activation-flow db e2e (WARNING → PASS_WITH_WARNING; FAIL → still fails) |

## Acceptance

1. Auto-print disabled → verification sale does not print; activation finalizes `PASS_WITH_WARNING`.
2. Auto-print enabled (default) → behavior byte-identical to today.
3. No other check can ride the WARNING path (whitelist regression-tested).
4. Regression test: auto-print disabled → `printInvoice` never invoked.
