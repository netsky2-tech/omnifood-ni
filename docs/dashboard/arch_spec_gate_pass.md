# Dashboard V2 — Architecture Gate Pass (AG-01..AG-08)

**Document:** `arch_spec_gate_pass.md`
**Status:** COMPLETE — evidence-verified (explorer pass + adversarial verification)
**Date:** 2026-09-24
**Method:** Targeted read-only inspection per gate (explorer), followed by adversarial
verification of the four most load-bearing claims (independent verifier). Verdicts below are the
**verified** dispositions; two explorer findings were materially corrected (AG-02 premise, AG-08
mechanism).

---

## AG-01 Top Product line economics — CLOSED (confirmed)

- The POS `InvoiceFiscalCalculator` performs deterministic Largest-Remainder discount apportionment
  to lines (`invoice_fiscal_calculator.dart:165-320`); `lineTotal = netBase + lineTax` (L287-288)
  and `finalTotal = Σ lineSubtotal + Σ lineTax` (L324). `InvoiceItem.total`/`.discount` are
  persisted POS-side (`invoice_item_entity.dart:31-32`) and backend-side
  (`invoice-item.entity.ts:80-83`).
- The Top Products query reads `revenue = Number(item.total)` (`sales-reports.service.ts:258`) and
  **excludes voided invoices** (`isCanceled: false`, L226; also `getDashboard` L58). Invariant
  `Σ(line.total) == invoice.total` holds by construction; no current production path bypasses it
  (activation sale and seeder reconcile too).
- Nuances recorded: line revenue is **post-tax**; and neither `getTopProducts` nor `getDashboard`
  filters `type = 'creditNote'`, so credit notes net into both sides (keeps them reconciled;
  means `grossSales` is net of credit notes — a fact for the KPI dictionary).
- **Consequence:** spec §10 allocation fallback is unnecessary for current data; keep it for
  legacy/edge cases; add an integration test asserting `Σ(line.total) ≈ invoice.total`.

## AG-02 Sale → Kardex source link — NARROWED (corrected: per-flow)

- Source linkage exists: `sourceDocumentId` (`inventory-movement.entity.ts:91`),
  `source_document_type` (L102), `saleCorrelationId` (L85); kardex report exposes them
  (`inventory-reports.service.ts:307`).
- **Correction to the explorer premise:** `occurred_at` is `@CreateDateColumn`
  (`inventory-movement.entity.ts:142`), but the generic inventory sync **does** override it with a
  business timestamp — `inventory.service.ts:103,153` maps `timestamp` from the required
  `CreateInventoryMovementDto.timestamp`; count sessions use `postedAt ?? cutoffAt`
  (`count-session.service.ts:138`); production uses `operationDate` (`production.service.ts:622`).
- The remaining gap is **only the sales-invoice movement path**:
  `invoices.service.ts:1378,1464,1691,2191` create movements without `timestamp`, so they fall
  back to ingestion time (`now()`).
- **Consequence:** spec §34 risk "offline delayed sync shifts COGS period" is real but narrow —
  fix by stamping the sale business timestamp on the sales-invoice movement path (the invoice
  `created_at`), no schema change. COGS-vs-sales period alignment then becomes provable.

## AG-03 Device registry — OPEN

- No unified device registry table exists. Device identity is split across `DeviceSyncCredential`
  (lifecycle PENDING/ACTIVE/RETIRED/REVOKED, `device-sync-credential.entity.ts`),
  `DeviceSyncCredentialEvent`, and `human_auth_terminal_ack_floor`. Terminal id is a string field
  across many tables; no master device entity with `last_seen_at`/display/status.
- **Consequence:** the freshness protocol's active-device source (spec §33/§34) needs a new
  registry entity or an explicit extension of `DeviceSyncCredential` with presence fields;
  `revokeCredential()` (`device-sync-credential.service.ts:381`) exists but no active-device query.

## AG-04 Outbox monotonic cursor — CLOSED (confirmed)

- POS invoices carry `sourceSequence` (`invoice_entity.dart:70`) with unique index
  `(terminal_id, source_sequence)` (L9-13), assigned monotonically
  (`sales_repository_impl.dart:133-137`, `sales_transaction_dao.dart:51-54`), synced under
  `flowType: 'sales'` (`sync_service.dart:755-774`).
- Backend enforces ordering: `resolveExpectedSequence` = last ACCEPTED receipt + 1
  (`invoices.service.ts:718-745`), staging `WAITING_FOR_SEQUENCE_*` and rejecting behind-sequence;
  unique `(tenant_id, source_device_id, flow_type, source_sequence)` on outbox and receipts.
- POS reinstall generates a **new** `terminal_device_id` (`migrations.dart:1145-1160`), so the
  stream key restarts cleanly — no watermark collision.
- **Consequence:** the §17.3 watermark is schema-ready **including the sales stream**; the
  freshness endpoint can compute `acceptedThroughSequence` per (device, flow) with existing
  tables. What does not exist is the endpoint itself.

## AG-05 Operation mode source — NARROWED

- The mode exists POS-side (`TenantConfig.operationMode`, `BusinessModeEvaluator`) and
  backend-side inside fulfillment topology revisions (`fulfillment-rollout.service.ts:260-261`,
  `operationMode: 'FOOD_PARK'` in topology JSON). No dedicated column on `Tenant`, no
  dashboard-friendly read endpoint.
- **Consequence:** expose the mode via a light read endpoint (new `GET /tenant/business-profile`
  or extend fiscal-setup response). Data exists; only the API surface is missing.

## AG-06 Cost permission — OPEN (confirmed, broader than the API)

- All four inventory report routes are `@Roles(OWNER, MANAGER)`
  (`inventory-reports.controller.ts:29,37,47,61`); `PermissionsGuard` is not applied to them; the
  backend `AppPermission` enum has no cost permission; the BOH matrix grants MANAGER the same
  BOH permissions as OWNER.
- **The exposure is already in the shipped UI**: `rbac.ts:33` allows MANAGER into `/inventory`,
  and `inventory-page.tsx` renders the Valuación/COGS/Kardex/Alertas tabs unconditionally — a
  MANAGER sees the "COGS / Margen" tab today.
- **Consequence:** restricting costs requires the full chain: add `INVENTORY_COST_VIEW`-equivalent
  to the permission enum, guard the routes server-side, update default role mappings, and gate the
  dashboard tabs. Incidental: `rbac.ts` header comment about CASHIER access to kardex is stale and
  wrong.

## AG-07 Audit severity — OPEN (confirmed)

- `audit_logs` has no severity/risk column (`audit-log.entity.ts`: `action`, `target_*`,
  `metadata` jsonb, `forensic_status` = chain integrity, not severity). No migration adds one; the
  `severity` column in migration `1766000000000` belongs to the separate `forensic_alerts` table.
- **Consequence:** the attention panel needs either a persisted `severity` column with a
  deterministic classifier at ingestion, or a query-time classifier service; the persisted column
  is the robust choice (indexable aggregation).

## AG-08 Payment amount semantics — OPEN (narrowed; mechanism corrected)

- **Explorer's tip theory REFUTED:** the checkout dialog has no tip input; `grandTotalWithTip`
  (`sale_view_model.dart:769`) is referenced only by its own definition and tests — never in a
  payment or persistence path. Split-bill tips are display-only: `onPayShare` discards the tip and
  opens the standard checkout (`sale_view.dart:1529-1533`).
- **The real inconsistency is over-tender:** the cash branch persists the raw user-entered tender
  (`amount: breakdown.tenderAmount`, `multi_currency_checkout_dialog.dart:193-197`) uncapped at
  the invoice total, records `changeGiven`, and the backend upserts verbatim with no validation
  (`invoices.service.ts:266-283`). The dashboard payment loop sums `amountNio` **without netting
  `changeGiven`**, so `paymentMethodsBreakdown.totalNio` overstates collections, and
  `Σ payments > invoice.total` whenever cash is over-tendered.
- **Consequence:** spec §11.3/§33 tip-separation remains valid but the immediate correctness fix
  is different: net `changeGiven` out of payment amounts for reporting, and add explicit payment
  validation or tip components before labeling totals "Total cobrado". Historical rows: report
  `cashNio`/`totalNio` coverage as approximate until decomposed.

---

## Verified disposition summary

| Gate | Explorer | Verified | Evidence anchor |
|---|---|---|---|
| AG-01 | CLOSED | **CLOSED** | `invoice_fiscal_calculator.dart:165-320`; `sales-reports.service.ts:226,258` |
| AG-02 | NARROWED | **NARROWED (per-flow)** | `inventory.service.ts:103,153` vs `invoices.service.ts:1378+` |
| AG-03 | OPEN | **OPEN** | `device-sync-credential.entity.ts`; no registry |
| AG-04 | CLOSED | **CLOSED** | `invoice_entity.dart:70`; `invoices.service.ts:718-745` |
| AG-05 | NARROWED | **NARROWED** | `fulfillment-rollout.service.ts:260-261` |
| AG-06 | OPEN | **OPEN (broader)** | `inventory-reports.controller.ts:29-61`; `rbac.ts:33` |
| AG-07 | OPEN | **OPEN** | `audit-log.entity.ts`; migration scan |
| AG-08 | OPEN | **OPEN (mechanism corrected)** | `multi_currency_checkout_dialog.dart:193-197` |

**Net:** 2 CLOSED, 2 NARROWED, 4 OPEN — with two material corrections against the explorer pass
(AG-02 premise refuted; AG-08 mechanism restated as over-tender, not tip). No architecture decision
in the spec needs reopening; the OPEN gates are build-out work items whose shape the spec already
prescribes.

**Downstream correction:** issue #545's "cash reconciliation off by tip" motivation must be
restated — tips currently never reach payments at all (display-only); the settlement gap is total,
not partial. The over-tender finding is a **new** reconciliation defect not covered by #545.
