# Sales, Cash Management & Checkout Execution Roadmap — OmniFood NI

This execution plan operationalizes the **Front-of-House (FOH) Sales Module**, **Cash Management & Shift Sessions (Cortes X/Z)**, and **Multi-Currency Decoupled Checkout & Payment Reconciliation** according to:
- [Product Requirement Document Master v2](../../PRDs/Product_Requirement_Document_v2.md) (§1, §3.1, §3.3, §4.1, §4.2)
- [PRD Módulo de Ventas FOH](../../PRDs/prd_modulo_ventas.md)
- [PRD Procesamiento de Pagos y Datáfonos](../../PRDs/prd_procesamiento_pago_datafonos.md)
- [DGI DT 09-2007 Normativas Fiscales](https://www.dgi.gob.ni)

---

## 1. Authority, Traceability & Invariant Decisions

### Authoritative Constraints
1. **D1 (Offline-First Source of Truth)**: Local SQLite (Floor) is the primary operational source of truth. Shift sessions, cash movements, and payments are committed locally and synchronized to the NestJS cloud via the outbox pattern.
2. **D2 (Decoupled Exchange Rates)**: The fiscal base for taxes ($IVA_{15\%}$) always uses the official BCN exchange rate at the transaction date ($TC_{Oficial}$). In-store cash change, screen conversions, and cashier receipt totals use the merchant's commercial rate ($TC_{Comercial}$).
3. **D3 (DGI Shift Controls)**: Shifts cannot be deleted. Mid-shift blind counts generate **Corte X** (operational inspection). Final day/session closures generate immutable **Corte Z** with sequential numbering.
4. **D4 (Two-Layer Card Processing)**: Fast-checkout allows tickets to be issued with pending voucher references during rush hours; however, **Corte Z is strictly blocked** until all pending card transactions are reconciled with authorization codes.

---

## 2. Assumptions, Decisions & Governance Matrix

| ID | Item | Decision / Policy | Owner |
|---|---|---|---|
| DEC-01 | **Shift Model** | Default to Centralized Cash Drawer (Topology B / Single Cash Register). Support shift handovers with blind counting. | Operations / Architect |
| DEC-02 | **Multi-Currency Cash Drawer** | Cash drawers track NIO and USD cash balances independently (`fondo_inicial_nio`, `fondo_inicial_usd`, `efectivo_esperado_nio`, `efectivo_esperado_usd`). | Finance / Product |
| DEC-03 | **Cash Variance Threshold** | Cash discrepancy exceeding C$100.00 NIO or $5.00 USD at Corte Z emits an immutable variance audit log and requires manager PIN confirmation. | Audit / Security |
| DEC-04 | **Voucher Fast-Checkout** | Cashier can close a card sale with `voucherCode: 'PENDIENTE'`. Unreconciled vouchers block Corte Z. | Risk / Finance |

---

## 3. Dependency DAG & Critical Path

```
                    ┌──────────────────────────────────────────────┐
                    │ Foundation: Shift Lifecycle & Cash Drawer    │ (Batch 1)
                    │ (Apertura, Movimientos Efectivo, Cortes X/Z) │
                    └──────────────────────┬───────────────────────┘
                                           │
                                           ▼
                    ┌──────────────────────────────────────────────┐
                    │ Multi-Currency & Decoupled FX Checkout       │ (Batch 2)
                    │ (Official BCN vs Commercial FX + Calculations)
                    └──────────────────────┬───────────────────────┘
                                           │
                                           ▼
                    ┌──────────────────────────────────────────────┐
                    │ Split Payments & 2-Layer Voucher Reconcile   │ (Batch 3)
                    │ (Mixed Payments + Pending Voucher Clearance) │
                    └──────────────────────┬───────────────────────┘
                                           │
                        ┌──────────────────┴──────────────────┐
                        ▼                                     ▼
     ┌────────────────────────────────────┐ ┌────────────────────────────────────┐
     │ Hold Tickets & Table Orders        │ │ KDS Real-Time Kitchen Display      │
     │ (Cuentas Abiertas / Mesas)         │ │ (Comandas digitales / Pantalla)    │
     │ [Batch 4 - Deferred]               │ │ [Batch 5 - Deferred]               │
     └────────────────────────────────────┘ └────────────────────────────────────┘
```

**Critical Path**: Batch 1 $\rightarrow$ Batch 2 $\rightarrow$ Batch 3 $\rightarrow$ Batch 4 / 5.

---

## 4. Milestone Roadmap Overview

| Milestone | Capability / Focus | Batches | Target Lines | Evidence Gate |
|---|---|---|---|---|
| **M1: Cash & Shift Management** | Shift lifecycle, Cash movements, Blind Arqueo, Cortes X & Z | Batch 1 (Slices 1.1-1.4) | ~1,200 total (<400 / slice) | Unit + Widget + E2E Shift Flow Tests |
| **M2: Multi-Currency Checkout** | Dual FX (BCN vs Commercial), USD cash handling, Mixed Change | Batch 2 (Slices 2.1-2.3) | ~1,000 total (<400 / slice) | Currency Math Invariance + UI Specs |
| **M3: Split Payments & Vouchers** | Multi-tender checkout, Two-layer dataphone flow, Shift Clearance | Batch 3 (Slices 3.1-3.3) | ~1,100 total (<400 / slice) | Fast-checkout & Reconciliation Suite |
| **M4: Tables & Hold Tickets** | Tab retention, multi-terminal locks, order merges/splits | Batch 4 (Slices 4.1-4.3) | Deferred | Concurrency & WebSocket Specs |
| **M5: Kitchen Display System (KDS)** | Paperless kitchen routing, real-time ticket statuses | Batch 5 (Slices 5.1-5.3) | Deferred | Real-time broadcast validation |

---

## 5. Detailed Execution Contracts (Batches 1, 2 & 3)

---

### Batch 1: Turnos de Caja, Control de Efectivo y Cortes X/Z

- **Goal:** Enable cashiers and managers to open shifts with initial cash floating (NIO & USD), record cash ins/outs (cash drop, petty cash, change replenishment), execute blind count audits (Corte X), and close shifts with discrepancy tracking and formal DGI Corte Z.
- **Traceability:** PRD Master v2 (§3.1, §4.2), `prd_modulo_ventas.md` (§3.1, §3.3), DGI DT 09-2007.
- **Prerequisites and dependencies:** RBAC module, Database migrations framework, Floor SQLite DAOs.
- **In scope:**
  - Entity `CashShiftSession` (Local SQLite + Cloud PostgreSQL schema with RLS).
  - Cash movements entity `CashMovement` (`CASH_IN`, `CASH_OUT`, `PETTY_CASH`, `SAFE_DROP`).
  - Cashier Shift opening dialog with dual-currency initial float.
  - Cash in/out manual drawer transaction forms with reason and supervisor PIN for withdrawals.
  - Blind count interface (Arqueo ciego de billetes y monedas).
  - Reporte X (Lectura parcial de turno) & Reporte Z (Cierre definitivo de turno y corte fiscal).
  - Discrepancy calculation (`counted - expected`) with audit logging.
- **Out of scope:** Card voucher reconciliation (Batch 3), Table management (Batch 4).
- **Touched surfaces:**
  - Backend: `apps/admin_backend/src/modules/sales/entities/cash-shift.entity.ts`, `cash-shift.service.ts`, `cash-shift.controller.ts`.
  - Frontend: `apps/pos_app/lib/data/database/`, `apps/pos_app/lib/domain/models/sales/cash_shift.dart`, `apps/pos_app/lib/ui/features/cash/`.
- **Acceptance criteria:**
  1. Cashier cannot process sales without an open shift session (`status: 'OPEN'`).
  2. Shift tracks opening float in both NIO and USD.
  3. Cash movements update expected cash balance immediately.
  4. Corte X prints/displays partial sales and expected cash without closing the shift.
  5. Corte Z freezes the shift (`status: 'CLOSED'`), computes variances, and generates sequential fiscal Z number.
  6. Discrepancy > C$100 NIO triggers manager authorization prompt.
- **Tests and linked evidence:**
  - Backend: `cash-shift.service.spec.ts`, `cash-shift.controller.spec.ts`.
  - Frontend: `cash_shift_view_model_test.dart`, `cash_shift_view_test.dart`, `cash_movement_dialog_test.dart`.
- **Estimate:** 3-4 vertical slices, ~350 lines per slice, Low-Medium risk.
- **Commit/PR boundary:** PR 1 (`feat(sales): cash shift management, cash movements and cortes x/z`).

---

### Batch 2: Checkout Multi-Moneda y Doble Tipo de Cambio Desacoplado

- **Goal:** Implement decoupled exchange rate handling (Official BCN rate for fiscal base vs Commercial POS rate for customer pricing/change) and enable multi-currency cash tender processing during checkout.
- **Traceability:** PRD Master v2 (§3.1, §4.2), `prd_modulo_ventas.md` (§2.5, §3.1), UC-01.
- **Prerequisites and dependencies:** Batch 1 (Open shift required for checkout), `FxRateResolverService` (BCN).
- **In scope:**
  - Merchant configurable Commercial Exchange Rate in POS Config (`tipo_cambio_comercial`).
  - Transaction-level frozen snapshot of both $TC_{Oficial}$ and $TC_{Comercial}$.
  - Checkout calculations: Total in NIO, Total in USD ($Total_{NIO} / TC_{Comercial}$), Taxes in NIO ($Base \times 15\% \times TC_{Oficial}$).
  - Cash tender calculator: entering USD bills calculates change in NIO or USD based on cashier selection.
  - Receipt formatting reflecting currency paid, conversion rate applied, and change returned.
- **Out of scope:** Split payments across cards/e-wallets (Batch 3).
- **Touched surfaces:**
  - Backend: `apps/admin_backend/src/modules/sales/dto/invoice.dto.ts`, `invoices.service.ts`.
  - Frontend: `apps/pos_app/lib/presentation/features/sales/view_models/sale_view_model.dart`, `apps/pos_app/lib/ui/features/sales/checkout/`.
- **Acceptance criteria:**
  1. Cashier sees dynamic total in USD while retaining NIO as accounting invariant.
  2. Changing commercial exchange rate does not alter historical invoices.
  3. Customer paying $20 USD on a C$500 ticket correctly calculates C$230 NIO change (assuming $TC_{Comercial} = 36.50$).
  4. Fiscal invoice records $TC_{Oficial}$ for DGI reporting and $TC_{Comercial}$ for cash reconciliation.
- **Tests and linked evidence:**
  - Multi-currency math invariance test suite (covering floating point rounding edge cases).
  - Checkout UI widget test for currency switching and change calculations.
- **Estimate:** 3 vertical slices, ~300 lines per slice, Low risk.
- **Commit/PR boundary:** PR 2 (`feat(sales): multi-currency checkout with decoupled bcn and commercial fx`).

---

### Batch 3: Pagos Divididos (Split Payments) y Flujo de Datáfonos en Dos Capas

- **Goal:** Enable multi-tender split payments (Cash NIO + Cash USD + Card + QR/Transfer) on single tickets with fast-checkout card processing and pre-Corte Z voucher reconciliation.
- **Traceability:** PRD Master v2 (§4.1), `prd_procesamiento_pago_datafonos.md`, `prd_modulo_ventas.md` (§2.5).
- **Prerequisites and dependencies:** Batch 1 (Shift lifecycle), Batch 2 (Multi-currency math).
- **In scope:**
  - Entity `TicketPayment` and `CardPaymentVoucher` schema.
  - Split payment checkout flow (reducing remaining balance dynamically across multiple tenders).
  - Fast-checkout option (`voucherCode: 'PENDIENTE'`) for rush hour queue acceleration.
  - Post-shift Voucher Reconciliation Screen (grid of pending card tickets for authorization code entry).
  - Hard-stop validation: Corte Z is blocked if unreconciled vouchers exist.
- **Out of scope:** Bluetooth/TCP automated terminal integration (Future Phase).
- **Touched surfaces:**
  - Backend: `apps/admin_backend/src/modules/sales/entities/ticket-payment.entity.ts`, `reconciliation.service.ts`.
  - Frontend: `apps/pos_app/lib/ui/features/sales/payments/`, `apps/pos_app/lib/ui/features/cash/reconciliation/`.
- **Acceptance criteria:**
  1. Single ticket can be paid with 2+ different payment methods until balance reaches 0.00.
  2. Card transactions can be confirmed without immediate authorization code in Fast-Checkout mode.
  3. Pending vouchers list displays all unverified card transactions for the active shift.
  4. Cashier/manager can batch-enter authorization codes from physical vouchers.
  5. Attempting to generate Corte Z with pending vouchers shows explicit blocker modal with direct link to reconciliation grid.
- **Tests and linked evidence:**
  - Multi-tender math and split payment distribution unit tests.
  - Voucher reconciliation lifecycle test suite (Pending $\rightarrow$ Reconciled $\rightarrow$ Corte Z Unlocked).
- **Estimate:** 3-4 vertical slices, ~350 lines per slice, Medium risk.
- **Commit/PR boundary:** PR 3 (`feat(sales): split payments and two-layer card voucher reconciliation`).

---

## 6. Milestone-Level Deferred Backlog

1. **Batch 4 (Cuentas Abiertas, Retención de Tickets y Mesas)**:
   - Hold ticket storage, table layout mapping, ticket merge/split, and optimistic lock for multi-tablet concurrency.
2. **Batch 5 (Kitchen Display System - KDS)**:
   - Paperless kitchen queue, timer badges (<10m green, 10-15m yellow, >15m red), and station routing.
3. **Batch 6 (Automated Hardware & SmartPOS Integration)**:
   - ESC/POS direct network printing driver and SmartPOS TCP/IP automatic authorization ingestion.

---

## 7. Risk Analysis & Mitigation Strategies

| Risk | Impact | Mitigation Strategy |
|---|---|---|
| **Cash Float Inconsistencies across Shift Handover** | High (Financial discrepancy) | Enforce blind counting during Corte X/Z. The system only reveals variance after the user submits the physical count. |
| **Floating Point Inaccuracies in Split USD/NIO Payments** | High (DGI tax mismatch) | Standardize all payment tenders and line calculations using fixed 4-decimal integers / `Decimal` arithmetic, rounding to 2 decimals only at change output. |
| **Rush Hour Queue Jam due to Card Voucher Entry** | Medium (Operational delay) | Implement Fast-Checkout mode with deferred voucher entry before Corte Z. |
| **Unsynchronized Shifts across Network Outages** | Medium (Sync lag) | Shift entities follow append-only outbox pattern with deterministic client timestamps and device IDs. |

---

## 8. Line Budget & PR Forecast

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       PR FORECAST & LINE BUDGETS                            │
├───────────────────────┬──────────────┬─────────────┬────────────────────────┤
│ PR Target             │ Scope        │ Est. Lines  │ Review Focus           │
├───────────────────────┼──────────────┼─────────────┼────────────────────────┤
│ PR 1 (Batch 1)        │ Shift & Cash │ ~1,100      │ Shift state machine,   │
│                       │ Mgmt (X/Z)   │ (4 slices)  │ Variance calculations  │
├───────────────────────┼──────────────┼─────────────┼────────────────────────┤
│ PR 2 (Batch 2)        │ Multi-Curr   │ ~900        │ Decimal arithmetic,    │
│                       │ Dual FX      │ (3 slices)  │ Decoupled BCN vs Comm  │
├───────────────────────┼──────────────┼─────────────┼────────────────────────┤
│ PR 3 (Batch 3)        │ Split Pay &  │ ~1,050      │ Two-layer reconcile,   │
│                       │ Vouchers     │ (3 slices)  │ Corte Z blocker guard  │
└───────────────────────┴──────────────┴─────────────┴────────────────────────┘
```

---

## 9. Next Action Recommendation

Proceed with **Batch 1 (Turnos de Caja, Control de Efectivo y Cortes X/Z)** starting with **Slice 1.1: Cash Shift Session Core Domain & Local Persistence (Database Schema, DAOs & Entities)** using strict TDD (RED $\rightarrow$ GREEN $\rightarrow$ Triangulation).
