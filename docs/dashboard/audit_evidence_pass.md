# Dashboard V2 — Audit Evidence Pass

**Document:** `audit_evidence_pass.md`
**Status:** COMPLETE
**Date:** 2026-09-23
**Method:** Read-only code-level verification of every §31 DoD claim in
`owner_dashboard_v2_gap_audit.md`. Per audit §25: tenant isolation was verified for every route
Dashboard V2 would consume.

---

## 1. Current dashboard API shape (§31 bullet)

The dashboard calls exactly **one** endpoint: `GET /sales/reports/dashboard?startDate=&endDate=`
(`dashboard-page.tsx:24`, `use-sales-reports.ts:10-17`, staleTime 2 min).

Response (`sales-reports.dto.ts:55-66`): `grossSales`, `netTaxableSales`, `totalTax`,
`totalDiscounts`, `invoiceCount`, `ticketAverage`, `paymentMethodsBreakdown{cashNio, cashUsd,
cardNio, cardUsd, other, totalNio}`, `startDate?`, `endDate?`, `generatedAt`.

Widgets → fields (`dashboard-page.tsx:64-155`): KPI Ventas Brutas ← `grossSales`+`invoiceCount`;
Ticket Promedio ← `ticketAverage`; Impuestos (IVA) ← `totalTax`; Descuentos ← `totalDiscounts`;
Métodos de Pago ← `paymentMethodsBreakdown.*`; Resumen de Ventas ← `netTaxableSales`, `totalTax`,
`totalDiscounts`, `grossSales`; FreshnessBadge ← `generatedAt`.

Hooks for `hourly-sales`, `top-products`, `cashier-performance` **exist and are wired only into
`sales-page.tsx`** (tabs), never into the dashboard.

## 2. Backend report routes inventory (§23)

All confirmed registered and reachable (`reports.controller.ts:45-179`, prefix `sales/reports`):
dashboard (L55), hourly-sales (L64), top-products (L72), cashier-performance (L82),
fiscal/monthly-summary (L91), fiscal/voided-invoices (L100), fiscal/sequence-audit (L109),
export/sales-book (L118), export/z-reports (L143), X/Z stubs (L168/174).

Inventory reports exist on a **separate** controller (`inventory-reports.controller.ts:23-78`,
prefix `inventory/reports`): valuation (L29), cogs (L36), kardex (L44), alerts (L63).

Audit route (L40/52: overrides, drawer-opens) exists but has no summary/aggregation shape.

**Not existing:** any sync-state/terminal-lag endpoint; any pending-card-reconciliation endpoint;
any gross-margin aggregation; any period-over-period comparison parameter.

## 3. Freshness (§13) — NEEDS BACKEND + SCHEMA

`FreshnessBadge` (`freshness-badge.tsx:18-26`) renders `generatedAt` = server response generation
time (`sales-reports.service.ts:160`). It says nothing about POS sync state.

Backend infrastructure for COMPLETE/STALE/PARTIAL/UNKNOWN **does not exist**: no terminal last-seen
tracking, no stream completeness, no sync-state endpoint. The POS tracks sync internally
(`CloudSyncStatusBadge`, Flutter-only). Verdict: the audit's P0 freshness contract is a real
backend feature (schema + endpoint), not a frontend polish.

## 4. Tax regime (§7) — PURE FRONTEND FIX AVAILABLE

Regime is stored in `fiscal_config_revisions` (`fiscal-config-revision.entity.ts:10`) and exposed
by the existing `GET /onboarding/fiscal-setup` (`fiscal-setup.controller.ts:48-53`) as
`FiscalSetupResponse.regime` (`fiscal-setup.dto.ts:64-74`), guarded + tenant-bound.

`SalesDashboardReportDto` carries no regime (#544) and the IVA card renders unconditionally
(`dashboard-page.tsx:74-77`). Regime-aware cards require **no schema change**: call the existing
endpoint, render conditionally.

## 5. Tips path (§8) — AUDIT CLASSIFICATION ERROR (recorded)

Confirmed at the reporting layer: `Invoice` entity (`invoice.entity.ts:16-120`), `Payment`
(`payment.entity.ts:15-100`), `SyncInvoiceDto` (`sync-invoice.dto.ts:221-368`) and every report DTO
carry **no tip field**. The POS excludes the tip from the synced invoice
(`sale_view_model.dart:1194-1196`); the customer-facing total is `grandTotalWithTip`
(`sale_view_model.dart:769`). The audit's "voluntary tips implemented in the platform" (§8) is true
POS/receipt-only and **misleading for dashboard purposes**. A tip KPI requires: invoices schema
addition + sync DTO + POS persistence + report aggregation (issue #545).

## 6. COGS / margin / merma (§11, DG-13/14/15)

`GET /inventory/reports/cogs?from=&to=` returns `totalCogsNio`, `salesCogsNio`, `shrinkageCogsNio`
plus per-insumo items (`inventory-reports.dto.ts:42-59`). Gross margin is computable **today** by
combining dashboard `netTaxableSales` with `totalCogsNio` client-side. Caveats: no single
aggregation endpoint; COGS date params anchor to inventory-movement timestamps, not invoice
`created_at` (alignment risk for historical ranges); terminology needs contract approval (§6.1).
Merma (`shrinkageCogsNio`) is already aggregated — just not surfaced.

## 7. Exceptions / attention (§12)

| Signal | Endpoint | Dashboard-ready |
|---|---|---|
| Voids (DG-18) | `fiscal/voided-invoices` (L100) | YES — `totalVoidedCount`, `totalVoidedAmount` |
| Stock critical (DG-16) | `inventory/reports/alerts` (L63) | YES — `criticalCount`, `warningCount`, `negativeCount` |
| Sequence anomalies (DG-20) | `fiscal/sequence-audit` (L109) | YES — `hasGaps`, missing/duplicate lists |
| Card reconciliation (DG-19) | none (per-payment `reconciliationStatus`, `payment.entity.ts:78-82`) | NO — needs aggregation endpoint |
| Audit/security summary (DG-20) | raw query endpoints only | NO — needs summary contract |

## 8. Design system (§21-22)

`docs/DESIGN_BACKOFFICE.md` exists (656 lines) and specifies KPI trend formatting, chart colors
(primary `#013a57`, comparison `#00be84`, negative `#dc2626`, neutral `#737373`), date presets
(Hoy/Ayer/7d/30d/Este mes/Mes anterior/Este año/Personalizado) and 5-minute auto-refresh.

`KpiCard` **already supports** `trend?: { value: number; label: string }` (`kpi-card.tsx:5-13`);
`StatCard` too. `DateRangePicker` has presets.

**Recharts is NOT installed** (`package.json` has no charting library). Charts require an npm
addition first.

## 9. Comparison data (§9)

No backend comparison endpoint exists; all DTOs are single-period. The dashboard can issue two
range queries and compute deltas client-side. Timezone semantics are consistent and anchored to
`-06:00` (America/Managua): `parseDateBounds` (`sales-reports.service.ts:376-400`) and
`parseDayRange` (L402-423); `invoices.created_at` is `timestamptz`.

## 10. Tenant isolation (§25) — ALL SAFE

Every route listed in §2 uses `AuthGuard` + `RolesGuard` + `TenantInterceptor` + `@GetTenantId()`
with explicit `tenant_id` predicates. RLS defense-in-depth confirmed on `invoices`
(migration `1809060000000`), `invoice_items` (`1809150000000`), `inventory_kardex` (`1809070000000`).
No cross-tenant path found. New endpoints introduced by V2 must follow the same pattern.

---

## Verdict summary for the gap inventory

| Audit item | Verdict | Implementation cost |
|---|---|---|
| DG-01/02/03 KPI redesign + ticket count | CONFIRMED gap | Frontend |
| DG-04 regime-aware fiscal slot (#544) | CONFIRMED gap | **Frontend only** (endpoint exists) |
| DG-05/06/07 discounts, payment mix, summary | CONFIRMED | Frontend |
| DG-08 date range presets | Partially exists | Frontend |
| DG-09 freshness contract | CONFIRMED gap | **Backend schema + endpoint + frontend** |
| DG-10 sales trend | CONFIRMED gap | Frontend + add Recharts + comparison queries |
| DG-11 hourly, DG-12 top products | CONFIRMED gap | **Frontend only** (endpoints + hooks exist) |
| DG-13 COGS, DG-14 margin | CONFIRMED gap | Frontend (two-endpoint aggregation) + terminology contract |
| DG-15 merma | CONFIRMED gap | Frontend (`shrinkageCogsNio` already aggregated) |
| DG-16 stock alerts | CONFIRMED gap | Frontend (endpoint exists) |
| DG-17 tips | CONFIRMED gap | **Blocked by #545** (backend persistence) |
| DG-18 voids | CONFIRMED gap | Frontend (endpoint exists) |
| DG-19 reconciliation | CONFIRMED gap | **Backend endpoint needed** |
| DG-20 audit/security feed | CONFIRMED gap | Backend summary contract + frontend |
| DG-21/22/23 staff, loyalty, business-mode | Confirmed absent | P2 / contract work, deferred |
| DG-24 empty states, DG-25 drill-down | CONFIRMED gap | Frontend |

**Classification corrections to the audit:** §8 tips "implemented in the platform" → POS/receipt
only; §13 freshness "timestamp exists" → the timestamp is cosmetic, the contract is a backend
feature; §23 inventory reports exist on `inventory/reports`, not `sales/reports` as the §23 wording
implies.
