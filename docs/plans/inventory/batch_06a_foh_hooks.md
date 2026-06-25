# Batch 6a: Hooks FOH — Venta, Cancelación y Reembolso

Cerrar el ciclo conectando las ventas del FOH con el inventario. Incluye **cancelación/reembolso como movimiento compensatorio append-only**, respetando DGI/auditoría (no se elimina, se anula).

> **Estado:** Parcial. Los hooks POS de venta (BOM OUT) y void atómico (compensatorio) ya están implementados vía **PR #34** (matemática BOM versionada refinada en **PR #36**). Resta el vínculo al **Kardex formal** (Batch 3a), reembolsos/credit notes, latencia async/background y `documento_origen_id`. **No reclamar Kardex formal completo.**

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
- [ ] **Reembolso / credit note**: flujo formal de reembolso/credit note como movimiento compensatorio append-only (hoy solo existe anulación/void atómico POS; no hay flujo de reembolso/credit note).
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
| Reembolso/credit note | Nuevo movimiento compensatorio; salida original intacta | ⏳ Pendiente (flujo formal) |

> Principio DGI: el movimiento original no se borra ni edita; la anulación es un nuevo movimiento opuesto auditable. El vínculo formal al Kardex inmutable se completa en Batch 3a.

## DoD (Criterios de aceptación)
- [~] Conexión funcional venta FOH → descuento de inventario. → POS-level hecho (PR #34/#36); vínculo al Kardex formal pendiente Batch 3a.
- [~] Cancelación de venta genera movimiento compensatorio (test: salida original permanece, saldo se restaura). → POS atomic void hecho (PR #34); vínculo al Kardex formal pendiente Batch 3a.
- [ ] Reembolso/credit note idem, sin mutar originales. → Flujo formal pendiente.
- [ ] Explosión BOM no bloquea impresión del ticket (medición de latencia). → Async/background pendiente.

## PRD cubierto
§1 Topología A (descuento en caliente) · §2.3 Kardex Inmutable (principio compensatorio) · ampliación derivada: cancelación FOH
