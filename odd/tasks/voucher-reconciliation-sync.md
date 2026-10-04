# voucher-reconciliation-sync — #68

Branch: `feat/voucher-reconciliation-sync` (worktree `/home/octavio_morales/omnifood-ni-p1`, base `origin/main` @ `328afd2a`)
Backlog item #68: "la conciliación de tarjetas/vouchers se opera en la terminal pero no cuenta con pipeline de salida de sincronización hacia el backend".

## Verified state (recon evidence, `path:line`)

Voucher state is **not** a separate table: it lives on `payments`.

| Fact | Evidence |
|---|---|
| Local columns already exist | `payment_entity.dart:6-49` — `voucher_code`, `card_brand`, `card_type`, `bank_pos`, `reconciliation_status`, `last4`, `batch_number`, `reconciled_at`, `reconciled_by_user_id`; DDL added by `migrations.dart:1677-1699` |
| Pending query | `payment_dao.dart:12-13` — `WHERE method = 'card' AND reconciliation_status = 'PENDIENTE' ORDER BY created_at ASC` |
| Lifecycle | checkout writes `PENDIENTE`/`CONCILIADO` (`multi_currency_checkout_dialog.dart:141-142`, `split_payment_calculator.dart:141`); `reconcileVoucher` (`card_voucher_reconciliation_view_model.dart:40-96`) sets `CONCILIADO` + `reconciledAt` + `reconciledByUserId`; `overrideMissingVoucher` (`:99-152`) sets `voucherCode: 'OVERRIDE: <motivo>'` and `reconciliationStatus: 'MANUAL_OVERRIDE'` |
| Corte Z block | `cash_shift_view_model.dart:371-380` — reads the **local** table only (`countPendingCardPayments`), returns false with `'Existen N vouchers de tarjeta pendientes de conciliar…'` |
| Voucher state in any shift payload | **does not exist** — `_buildCashShiftSessionPayload` (`sync_service.dart:1317-1356`) has no voucher keys; printed X/Z (`receipt_58mm_formatter.dart:402-461`, `dgi_report_view_model.dart:158-194`) show only card totals |
| Card payments are keyed in manually — production wiring of the terminal adapters | **does not exist**: no `lib/` caller of `MockSimulatorTerminalAdapter(`/`LocalNetworkTerminalAdapter(`/`ManualStandaloneTerminalAdapter(`, and no caller of `CardPaymentOrchestrator(`. The local-network adapter is real TCP code, simply never instantiated |
| Sale sync carries reconciliation once | `sales_mapper.dart:648-656` emits `voucherCode`/`reconciliationStatus`/`reconciledAt`/`reconciledByUserId` in the payments array — but only when the invoice is `sync_status='pending'` (`sales_repository_impl.dart:500-507`), and the ACK flips it to `synced` |
| Why re-pushing the sale is a dead end | same idempotency key → `DUPLICATE_REPLAY` dropped (`invoices.service.ts:634-656`); the payload hash covers only `id, method, amount, currency, exchangeRate` (`invoices.service.ts:2557-2569`) so a mutated payload sails past the hash and is dropped as a duplicate; with a changed hash it is rejected `CRITICAL_PAYLOAD_MISMATCH` (D-10, `sales_repository_impl.dart:901-904`). Documented as a forced/fragile reuse |
| Backend schema already exists | `payment.entity.ts:59-76` (`voucher_code`, `reconciliation_status default 'PENDIENTE'`, `reconciled_at`, `reconciled_by_user_id`), index `1809460000000-AddCardReconciliationStatusIndex.ts:22-23` |
| Backend write workflow | **does not exist**. `sync-invoice.dto.ts:186,202` accepts the fields and ingestion spreads them (`invoices.service.ts:268-279`), but there is no reconciliation endpoint; the closest is the **read-only** `GET sales/reports/card-reconciliation-summary` (`card-reconciliation-summary.controller.ts:22-36`) |
| Roadmap acceptance criteria | `sales_cash_roadmap.md:17,28` (DEC-04, D4) and Batch 3 ACs `:157-161`; PR boundary `:166`. The Corte-Z blocker check lives in `prueba_integral_dia_1_soho.md:219` (Fase 11). **`batch_09_sales_reporting_analytics.md` does NOT spec the block** and **no OpenSpec change exists** |
| No role enforcement on reconcile/override | `card_voucher_reconciliation_dialog.dart:71-79` — supervisor is free text; the VM only requires it non-empty (`view_model.dart:110-114`). `UserRole` is available on the cash VM but never consulted |
| Outbox precedent to copy | `_syncCashShifts` (`sync_service.dart:1235-1305`): filter `syncStatus == 'pending'` in Dart, batch post, mark `synced` except `failedKeys`. Deterministic-receipt variant (`/v1/sync/batch`, `inventory_sync_receipts`, sequence-gap policy) is heavier than this need |

## Founder decisions (this session)

1. **Both slices**, each as its own work unit with its own verification and commit.
2. **The authorization hardening is a separate item.** Until it closes, the cloud receives an actor
   **declared by the operator, not verified** — and nothing in the payload, the column comment or the
   dashboard may present it as verified.

## S1 — the reconciliation event reaches the cloud

Shape: a payment-level document pushed through a per-row outbox modelled on `_syncCashShifts`, **not**
through the sale aggregate (forced and fragile, per the evidence above).

### S1a — POS

1. **Schema.** Add `reconciliation_sync_status TEXT NOT NULL DEFAULT 'synced'` to `payments`, plus the
   hand-written `ALTER TABLE` in `migrations.dart` and the regenerated `app_database.g.dart` (this work
   unit runs `build_runner`; CI already generates code, so the committed generated file must carry the
   new column).
   Default `'synced'` is deliberate: a freshly created payment already travels inside the sale sync, so
   only a *later* reconciliation change creates outbox work. Seeding historical rows as pending would
   re-deliver states the cloud already has.
2. **Enqueue** in `reconcileVoucher` and `overrideMissingVoucher`: set `reconciliation_sync_status =
   'pending'` in the same write that changes the reconciliation state. A reconciliation is never
   recorded locally without creating the outbox work.
3. **Push.** A bounded batch domain in `SyncService` mirroring `_syncCashShifts`: read pending rows
   (a DAO query, not a Dart filter — the table grows with every sale), post them, mark `synced` except
   the ids the backend reported as failed, keep failures pending for the next cycle, and count them in
   the existing pending-outbox surface.
4. **Payload** per record: `paymentId`, `invoiceId`, `voucherCode`, `reconciliationStatus`,
   `reconciledAt`, `reconciledByUserId`, `batchNumber`, `last4`, and the invoice's `idempotencyKey` for
   correlation. No new device-sync allowlist entry may be skipped: the hardened
   `DeviceSyncAuthInterceptor` rejects any route outside its allowlist, so the new route must be added
   there explicitly.

### S1b — backend

1. `POST` endpoint mirroring `cash-shift-sync.controller.ts:44`
   (`@Post('sync') @RequireSyncScopes('sync:push')`), DTO mirroring `cash-shift-sync.dto.ts`, ingestion
   service mirroring `cash-shift-sync-ingestion.service.ts`, registered in `sales.module.ts`.
2. Ingestion is an **idempotent upsert of `invoice_payments` by payment id**, tenant-scoped, updating
   only the reconciliation columns (`voucher_code`, `reconciliation_status`, `reconciled_at`,
   `reconciled_by_user_id`, `batch_number`) — never amounts, never the method, never anything already
   reconciled before a sale's fiscal snapshot. Per-record outcomes, so one bad record does not reject
   the batch.
3. Deliberately **not** in this slice, recorded instead of forgotten: a payload-hash mismatch guard like
   the sale channel's. An upsert of the same values is naturally idempotent, and a mismatch guard needs
   a hash column; adding one is a follow-up, not a silent omission.
4. Unknown payment id (a reconciliation arriving before its sale) must be an explicit per-record
   outcome, never a silent success.

### Checks for S1

- S1b: unit + db specs for the upsert, the per-record outcomes, an unknown payment id, and a repeated
  identical batch (idempotent, no duplicate rows, no double-applied timestamp).
- S1a: RED first — a reconciled payment with no outbound path; then GREEN — it is pushed, marked
  `synced`, and a failed record stays pending with its key preserved for retry. Assert the enqueue
  happens in the same write as the state change.
- Regression: a sale that already synced keeps its idempotency key untouched, and a payment created
  with `CONCILIADO` at checkout does not create reconciliation outbox work (it travels with the sale).
- `flutter analyze` clean, backend `npm run build` + its test suite, POS focused suites green, and the
  full POS suite run by the parent's verifier.

## S2 — the shift close carries the voucher state

`_buildCashShiftSessionPayload` (`sync_service.dart:1317-1356`) gains the shift's voucher state —
pending count, reconciled count, override count, and the reconciled rows' identifiers — so the cloud
and the dashboard can see a shift that closed with overrides instead of only a pre-close guard. The
backend DTO/ingestion for the shift session accepts the new keys optionally, and the existing
`card-reconciliation-summary` read model can consume them. Specified in detail when S1 closes, so S2's
design is informed by what S1 actually put on the wire.

## Deferred to its own item (found by this recon, decision taken, not implemented)

**Authenticate the reconciliation actor.** Today any operator can reconcile and override, and the
"supervisor" is free text embedded in the voucher code for overrides; `reconciledByUserId` is just the
signed-in operator. `AuthRepository.authorizeOverride({supervisorId, pin, totpCode})` and
`SupervisorOverrideModal` already exist and are used elsewhere. Until this closes, the cloud stores an
operator-declared actor. Recorded here so no reader of the cloud data mistakes it for a verified
authorization.

## Accepted boundaries

1. **Automated card-terminal integration stays out of scope.** The roadmap itself defers
   "Bluetooth/TCP automated terminal integration" to a future phase (`sales_cash_roadmap.md:152`), and
   no adapter is wired in production; card data is keyed in manually.
2. **Corte X is not blocked.** Only the blind-count close is guarded (`cash_shift_view_model.dart:371`).
   The X is a partial read that must remain available.
3. **Reconciling does not re-open the sale.** The sale's fiscal snapshot is immutable; reconciliation
   updates the payment's own columns only.

## Ledger

| Task | Status | Evidence |
|---|---|---|
| Recon + founder decisions | done | this document |
| S1a (POS outbox + push) | pending | — |
| S1b (backend endpoint + ingestion) | pending | — |
| S2 (shift payload carries voucher state) | pending | — |
| Authorization hardening | deferred, own item | see above |
