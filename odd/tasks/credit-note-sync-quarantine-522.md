# Feature: #522 — Isolated Credit Note Sync & Durable Operator Quarantine

- Issue: `#522` (Finding 1 X/Z endpoints already shipped in PR `#738`; this feature closes Finding 2: F3 + F4)
- Branch: `fix/credit-note-sync-quarantine-522`
- Normative basis: Nicaragua DGI DT 09-2007, Ley 822 (LCT) art. 124 / Reglamento art. 100, Ley 562 (Código Tributario) art. 103 (credit notes must reduce gross sales and VAT payable in the Sales Book and fiscal reports; trapping credit notes locally overstates cloud revenue and VAT).

## Specs

- **S1 — Backend Device-Transport Credit Note Sync & Reconciliation (PostgreSQL 16):**
  - `POST /v1/sync/batch` over `devicePrincipal` with a `CREDIT_NOTE` record carrying a valid active same-tenant `MANAGER`/`OWNER` `authorizedByUserId`, `authorizedByRole`, `originInvoiceId`, and `refundReasonCode` MUST persist the credit note, mark it `APPLIED`, and offset revenue/tax in fiscal reports (`monthly-summary`, `export/sales-book`, X/Z).
  - Invalid/inactive/unauthorized supervisor metadata (e.g., `CASHIER` role, inactive user, cross-tenant user, missing `originInvoiceId`/`refundReasonCode`) MUST fail closed with `403 Forbidden` and a clear operator-actionable message, never persisting the credit note or mutating the origin invoice.
  - Regular `SALE` batches and X/Z endpoints (`GET /sales/reports/x`, `GET /sales/reports/z`) MUST remain 100% unchanged and green.

- **S2 — POS Isolated Sync Lane & Durable Quarantine (`SyncService` + `SalesRepositoryImpl` + SQLite):**
  - Regular `SALE` documents continue syncing first in their normal batch envelope and are NEVER blocked by a `CREDIT_NOTE` rejection.
  - Pending `CREDIT_NOTE` documents are synced in an **isolated lane (1 record per `/v1/sync/batch` envelope)** after regular sales (preserving causal order so origin invoice lands first).
  - Accepted (`200/201` + `APPLIED`/`DUPLICATE`) credit notes transition cleanly to `syncStatus = 'synced'` (and clear any prior quarantine metadata).
  - Permanently rejected credit notes (HTTP `403` supervisor/auth failure, `400`/`409`/`422`, or per-record `retryable == false`) MUST NOT trigger the terminal-wide `AUTH_BLOCKED` flag or stall regular sales; they MUST transition to durable **`syncStatus = 'quarantined'`** with the rejection reason/code persisted in SQLite (`local_configs` or invoice quarantine store — zero destructive schema breaks, survives app restart).
  - Transient errors (`408`/`429`/`5xx`/network offline) keep the credit note in `syncStatus = 'pending'` for automatic retry.
  - `getPendingOutboxCount()` MUST include pending `CREDIT_NOTE` records (no more silent `0 pendientes`), and `SyncService` MUST expose `getQuarantinedCount()`, `getQuarantinedDocuments()`, and an explicit `retryQuarantinedDocument(invoiceId)` action that resets the document back to `pending` and triggers sync idempotently (same `idempotencyKey`, zero duplicates).

- **S3 — POS & Owner Dashboard NHILOS Luxury +1 Visibility & Actionability:**
  - Follow `docs/nhilos/nhilos_backoffice_experience_standard_v1.0.md` (calm hierarchy, semantic status tokens, zero generic alarmism, accessible labels).
  - In `apps/pos_app/lib/ui/features/sales/sales_history_view.dart`:
    - Remove the obsolete pilot disclaimer (*"Durante el piloto, la nota queda registrada en este terminal: no se envía al cloud."*).
    - Display honest, sober sync status badge on credit notes (**Sincronizada**, **Pendiente de envío**, **En cuarentena** with exact rejection reason + **"Reintentar sincronización"** button).
  - In `apps/pos_app/lib/ui/features/sales/widgets/cloud_sync_status_badge.dart`:
    - Surface quarantined documents clearly alongside pending count, with an actionable view/retry path.
  - In `apps/owner_dashboard/src/features/sales/credit-notes-tab.tsx` (and backend `GET /sales/admin/credit-notes` if needed):
    - Ensure POS-synced credit notes appear cleanly in the Owner Dashboard credit notes list with clear origin reference and authorization context.

- **S4 — Real Samsung Galaxy S23 Hardware E2E (`apps/pos_app/integration_test/credit_note_sync_quarantine_s23_hardware_e2e_test.dart`):**
  - Zero mocks for SQLite/Floor (`$FloorAppDatabase.databaseBuilder`), real `SalesRepositoryImpl`, real `SyncService` against a real local loopback HTTP server (`HttpServer.bind('127.0.0.1', 0)`) running on the S23 itself to test real `Dio` HTTP transport:
    1. Case 1: Regular `SALE` + `CREDIT_NOTE` synced in isolated lanes → `SALE` lands first, `CREDIT_NOTE` lands in its own 1-record envelope → both `synced`, pending count `0`, quarantined count `0`.
    2. Case 2: `CREDIT_NOTE` rejected with `403 Forbidden` (inactive supervisor) while a concurrent `SALE` succeeds `200` → `SALE` becomes `synced`, `CREDIT_NOTE` persists as `quarantined` with exact reason across DB re-read, terminal is NOT `AUTH_BLOCKED`, `getQuarantinedCount() == 1`.
    3. Case 3: Operator triggers `retryQuarantinedDocument(creditNoteId)` after supervisor is restored → server returns `200 APPLIED` → `CREDIT_NOTE` transitions `quarantined → synced` with same `idempotencyKey`, `getQuarantinedCount() == 0`, `getPendingOutboxCount() == 0`.

## Tasks

- [x] `T1` (S1) [worker] Backend real PostgreSQL DB/E2E verification of device-transport `CREDIT_NOTE` sync + `FiscalReportsService.getMonthlySummary` negative-sign fix + fail-closed `403` + `DUPLICATE` idempotency — commit: `a406dd59`
- [x] `T2` (S2) [worker] POS isolated `CREDIT_NOTE` sync lane, durable `quarantined` status + reason persistence, `getPendingOutboxCount` / `getQuarantinedCount` / `retryQuarantinedDocument` + unit tests (209/209 PASS) — commit: `0b3c9ebd`
- [x] `T3` (S3) [worker] POS (`sales_history_view.dart`, `cloud_sync_status_badge.dart`) & Owner Dashboard (`credit-notes-tab.tsx`) NHILOS Luxury +1 sync/quarantine UI + widget/Vitest tests (15/15 Flutter + 1953/1953 Vitest + build PASS) — commit: `bd4ba1d3`
- [x] `T4` (S4) [worker + S23 hardware] Real Samsung Galaxy S23 (`SM_S918B`, `R5CWB2LQJDJ`, ARM64, zero mocks, real Floor SQLite + real loopback `HttpServer`) hardware E2E (`credit_note_sync_quarantine_s23_hardware_e2e_test.dart`) — **3/3 `ALL_TESTS_PASSED`** — commits: `bd4ba1d3`, `76c39462`
- [x] `T5` (S1–S4) [verify] Independent `gentle-ai-verify` (Risk: item 2 & 3 — 4/4 `met`, including X/Z & Sales Book sign audit and PG16 origin-immutability probe) — ready for PR closing `#522`

## Log

- **L1 (Original user request):** "Vamos con #522 (endpoints X/Z devolviendo falso éxito / notas de crédito) siempre con toda la suite de test, e2e real en dispositivo, investigacion de leyes y ejemplos si es necesario en el caso y el nhilos luxury +1"
- **L2 (Founder decision via `ask_user_choice`):** Selected Option 1 (`enable_isolated_sync_and_quarantine`): enable isolated-lane sync for `CREDIT_NOTE` using the existing backend supervisor DB guard + durable operator-visible quarantine & retry on permanent rejection (closes #522 Finding 2: F3 + F4; Finding 1 X/Z already shipped in PR #738).
