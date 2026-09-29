# credit-notes-full-scope

## Goal
Remediate Batch 8 of the audit with FULL scope approved by the user: H5 (credit-note/return UI in POS), H8 (fiscal print path for credit notes), M11 (customer barcode/QR scanner wiring).

## Findings
- H5: return/credit-note UI commented out at `sale_view.dart:556`; backend `processReturn()` (sale_view_model.dart:1752) and `createCreditNote()` (sales_repository_impl.dart:847) exist but are parked ("no production call site").
- H8: `createCreditNote()` commits the credit-note invoice but never creates a PrintJob — DGI requires printed credit notes; credit notes bypass the fulfillment/print subsystem.
- M11: `_onQrScanRequested()` empty handler at customer_select_dialog.dart:131; `mobile_scanner` not installed; `CustomerIdentificationPort` exists.

## Known dependencies to verify during exploration
- DSI-6 credit-note authorization / re-auth flow — determine what exists vs what is needed.
- Backoffice parity for returns (returns currently go through Backoffice).
- `mobile_scanner` package addition = pubspec + platform config (camera permissions).
- Print path: credit note needs a PrintJobEntity or direct print call following DGI fiscal-copy requirements.

## Slices (chained, one work-unit commit each)
### 8a — H5 + H8 (coupled): return flow UI + credit-note fiscal print path
### 8b — M11: customer scanner wiring (mobile_scanner + CustomerIdentificationPort)

## Constraints
- DGI: invoices never deleted; credit notes are cancellations/compensations with sequential numbering; printed copy mandatory (H8 is the fiscal requirement).
- Offline-first: credit note persists locally first; print failure must not lose the credit note (mirror durable print patterns; NEVER fabricate a fiscal document — see H4 fix).
- Floor @transaction positional args; Freezed for domain models; analyzer locked 6.4.1 (AGENTS.md).
- NHILOS state/copy rules apply for UI (AGENTS.md).
- Do NOT touch concurrent-stream files: label_map.dart, auth_repository_impl.dart, activation_pre_offline_runner.dart, activation_session_view_model.dart.

## Status
- [x] 8a — commit 6efd1697 "feat(pos): implement credit note returns with fiscal print path" (H5 + H8, incl. DSI-6 sync hold + fiscal-number origin reference)
- [x] 8b — commit "feat(pos): wire customer QR/barcode scanner" (M11, incl. production identification wiring fix + stale 8a mock regen)

## Follow-ups (non-blocking)
1. DSI-6: outbound device batches hold CREDIT_NOTE records (whole-batch 403 otherwise); unblock pending DSI-6 authorization auditing spec.
2. Numbering parity: POS shares sales DGI cursor; backend admin credit notes use CREDIT_NOTE_SERIES — fiscal/product decision. **RESUELTO (2026-09-29)** — el fundador decidió mantener el cursor único del POS (opción 1, sin serie NC separada); ver registro en `odd/tasks/go-live-decisions.md` (DEC-1). Consecuencia aceptada: formatos de NC distintos entre POS y backoffice; revisar antes de multi-terminal o canal mixto.
3. Scan flow calls selectCustomer twice (identifyCustomer already selects) → loyalty re-eval runs twice; harmless but worth a cleanup.
4. Escape keybinding + camera errorBuilder branch lack automated coverage; on-device physical scan validation pending.
5. build_runner caution: --delete-conflicting-outputs with --build-filter in a dirty tree deleted 89 clean generated files once (restored byte-identical); audit `git status | awk '$1=="D"'` after any filtered regen.

## Commits
- 8a: `feat(pos): implement credit note returns with fiscal print path`
- 8b: `feat(pos): wire customer QR/barcode scanner`
