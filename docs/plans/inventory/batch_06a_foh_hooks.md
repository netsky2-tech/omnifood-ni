# Batch 6a: Hooks FOH — Venta, Cancelación y Reembolso

Cerrar el ciclo conectando las ventas del FOH con el inventario. Incluye **cancelación/reembolso como movimiento compensatorio append-only**, respetando DGI/auditoría (no se elimina, se anula).

> **Estado:** Parcial. Los hooks POS de venta (BOM OUT) y void atómico (compensatorio) ya están implementados vía **PR #34** (matemática BOM versionada refinada en **PR #36**). Batch 6a later added the first credit-note sync/persistence contract, but async/background dispatch and end-to-end offline sale→credit-note coverage remain follow-ups (#105/#106). **No reclamar Kardex formal completo.**

## Estado actual (truth pass)
- **Hook de venta FOH (POS):** al cobrar, el POS genera movimientos de salida (explosión BOM) vinculados al `recipeVersionId` per-line — implementado en **PR #34**; la matemática BOM versionada (gross×sale/yield + UOM) se refinó en **PR #36**.
- **Cancelación/anulación de venta (POS):** `voidInvoice` genera movimiento compensatorio en una única `@transaction` Floor (salida original permanece, saldo se restaura, audit log) — implementado en **PR #34**.
- **Backend:** validación tenant/product al ingest de ventas — **PR #34**.
- **Kardex formal: NO completo.** Los movimientos se generan a nivel POS/local, pero el Kardex inmutable formal (append-only ledger, `documento_origen_id`, auditoría central) es **Batch 3a**. Este batch no debe reclamarlo como hecho.

## Brechas a remediar

### Ya cubierto por PR #34 / #36
- [x] **Hook de venta FOH**: al procesar un cobro exitoso, disparar reducción de inventario (salida) de todos los insumos del BOM del producto vendido. *(POS-level, PR #34 + matemática PR #36.)*
- [x] **Cancelación/anulación de venta**: generar movimiento compensatorio de signo inverso que devuelve los insumos al inventario — **nunca** eliminar la salida original. *(POS atomic void, PR #34.)*

### Restante
- [ ] **Vínculo Kardex formal**: enlazar los movimientos POS al Kardex inmutable (Batch 3a) con `documento_origen_id` = ticket FOH y `id_receta_version`. **Bloqueado por Batch 3a.**
- [~] **Reembolso / credit note**: formal refund/credit-note flow exists as an append-only fiscal document with origin provenance, authorization, and deterministic replay. Backend Kardex compensation remains limited: credit-note movement deltas are rejected until full Kardex replay exists.
- [ ] **Explosión BOM asíncrona/background** para no demorar la impresión del ticket (hoy sincrónica en POS).
- [ ] **`documento_origen_id`**: persistir el vínculo ticket→movimiento una vez exista Batch 3a.

## Alcance técnico

### Hook de venta
- Escuchar evento de cobro exitoso → explosión BOM → salidas Kardex por insumo.
- Procesamiento asíncrono local (background worker) en Topología B; en caliente en Topología A (Batch 1).

### Cancelación/reembolso (append-only)
| Evento FOH | Movimiento Kardex | Estado |
|------------|-------------------|--------|
| Venta exitosa | `SALIDA_VENTA` por insumo (BOM) | ✅ POS-level (PR #34/#36) |
| Anulación de venta | `AJUSTE_COMPENSATORIO` signo inverso (devuelve insumos) | ✅ POS atomic void (PR #34) |
| Reembolso/credit note | New fiscal document and compensating movement; original sale output remains intact | [~] Fiscal/sync contract documented; backend Kardex compensation pending |

> Principio DGI: el movimiento original no se borra ni edita; la anulación es un nuevo movimiento opuesto auditable. El vínculo formal al Kardex inmutable se completa en Batch 3a.

### Credit-note provenance and replay contract

Credit notes are append-only fiscal documents. They never delete or rewrite the origin invoice, origin invoice items, or inventory movements. If an origin is invalid, the backend must reject or hold the sync record before fiscal persistence; it must not create a partial invoice, item, payment, receipt, or Kardex row.

| Field / concept | Source of truth | Semantics |
|-----------------|-----------------|-----------|
| `originInvoiceId` / `relatedInvoiceId` | POS submits; backend verifies | Points to the original regular sale invoice. The backend requires the origin to exist in the same tenant and not be canceled before persisting the credit note. |
| `items[].originInvoiceItemId` | POS submits; backend verifies | Points each refunded line back to an item on the origin invoice. Duplicate or cross-origin item references are invalid. |
| `refundReasonCode` | POS/operator input | Nonblank reason label/code required for audit. The official allowed taxonomy is not defined in the PRD/roadmap yet, so the current vocabulary is implementation-defined until product policy is confirmed. |
| `refundReasonPolicy` | POS enum submitted to backend | One of the current implementation policies: `RESTOCK_ORIGINAL_BOM`, `FINANCIAL_ONLY`, `WASTE_NO_RESTOCK`, or `MANAGER_REVIEW_HOLD`. This documents current behavior only; it does not define final product policy or partial-credit-note rules. |
| `authorizedByUserId` / `authorizedByRole` | POS submits metadata; backend verifies request actor | The metadata is audit context, not a trust boundary. For sync batches containing `CREDIT_NOTE`, the backend requires the authenticated request user to be an active same-tenant manager or owner. |
| Compensation movement provenance | POS/local movement metadata; backend Kardex replay later | Compensation movements must reference the credit-note document and, where available, origin movement/item identifiers so the original sale movement remains intact and the reversal is auditable. Backend credit-note movement replay is still unsupported and rejected until Kardex compensation replay is implemented. |

Replay result semantics:

| Code | Status | Retryable | Meaning |
|------|--------|-----------|---------|
| `HELD_ORIGIN_MISSING` | `STAGED_FUTURE` | Yes | The credit note arrived before its origin sale in the same deterministic stream. The record is held for replay instead of being treated as a permanent business rejection. |
| `CREDIT_NOTE_AUTHORIZATION_INVALID` | `REJECTED` | No | Authorization metadata or the authenticated request actor is not an active same-tenant manager/owner. Replaying the same payload cannot fix this. |
| `CREDIT_NOTE_ORIGIN_ITEM_INVALID`, `CREDIT_NOTE_REFUND_QUANTITY_INVALID`, `CREDIT_NOTE_RESTOCK_QUANTITY_EXCEEDED` | `REJECTED` | No | The payload references invalid origin line provenance or an invalid refund/restock quantity. |
| `CREDIT_NOTE_STOCK_REPLAY_UNSUPPORTED`, `CREDIT_NOTE_KARDEX_COMPENSATION_UNSUPPORTED` | `REJECTED` | No | Backend Kardex compensation replay for credit-note movement deltas is intentionally not enabled yet. This is a follow-up implementation boundary, not a transient sync error. |

## DoD (Criterios de aceptación)
- [~] Conexión funcional venta FOH → descuento de inventario. → POS-level hecho (PR #34/#36); vínculo al Kardex formal pendiente Batch 3a.
- [~] Cancelación de venta genera movimiento compensatorio (test: salida original permanece, saldo se restaura). → POS atomic void hecho (PR #34); vínculo al Kardex formal pendiente Batch 3a.
- [~] Reembolso/credit note idem, sin mutar originales. → Fiscal document provenance and deterministic replay are covered; backend Kardex compensation and final product policies remain pending.
- [ ] Explosión BOM no bloquea impresión del ticket (medición de latencia). → Async/background pendiente.

## PRD cubierto
§1 Topología A (descuento en caliente) · §2.3 Kardex Inmutable (principio compensatorio) · ampliación derivada: cancelación FOH
