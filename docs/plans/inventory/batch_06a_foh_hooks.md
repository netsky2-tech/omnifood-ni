# Batch 6a: Hooks FOH — Venta, Cancelación y Reembolso

Cerrar el ciclo conectando las ventas del FOH con el inventario. Incluye **cancelación/reembolso como movimiento compensatorio append-only**, respetando DGI/auditoría (no se elimina, se anula).

## Estado actual
- No existe hook de descuento de inventario en el cobro FOH (o está incompleto).
- Cancelación/reembolso FOH no tiene comportamiento de inventario definido.

## Brechas a remediar
- [ ] **Hook de venta FOH**: al procesar un cobro exitoso, disparar reducción de inventario (Kardex OUT) de todos los insumos del BOM del producto vendido.
- [ ] **Cancelación/anulación de venta**: generar movimiento compensatorio de signo inverso (`AJUSTE_COMPENSATORIO` o `ENTRADA_REVERSO_VENTA`) que devuelve los insumos al inventario — **nunca** eliminar la salida original.
- [ ] **Reembolso/reversal**: mismo principio append-only; el ticket original y su salida quedan intactos, el reembolso es un nuevo movimiento.
- [ ] Explosión BOM asíncrona/background para no demorar la impresión del ticket.
- [ ] Vínculo del movimiento Kardex con `documento_origen_id` = ticket FOH y `id_receta_version`.

## Alcance técnico

### Hook de venta
- Escuchar evento de cobro exitoso → explosión BOM → salidas Kardex por insumo.
- Procesamiento asíncrono local (background worker) en Topología B; en caliente en Topología A (Batch 1).

### Cancelación/reembolso (append-only)
| Evento FOH | Movimiento Kardex |
|------------|-------------------|
| Venta exitosa | `SALIDA_VENTA` por insumo (BOM) |
| Anulación de venta | `AJUSTE_COMPENSATORIO` signo inverso (devuelve insumos) |
| Reembolso/reversal | Nuevo movimiento compensatorio; salida original intacta |

> Principio DGI: el movimiento original no se borra ni edita; la anulación es un nuevo movimiento opuesto auditable.

## DoD (Criterios de aceptación)
- [ ] Conexión funcional venta FOH → descuento de inventario.
- [ ] Cancelación de venta genera movimiento compensatorio (test: salida original permanece, saldo se restaura).
- [ ] Reembolso idem, sin mutar originales.
- [ ] Explosión BOM no bloquea impresión del ticket (medición de latencia).

## PRD cubierto
§1 Topología A (descuento en caliente) · §2.3 Kardex Inmutable (principio compensatorio) · ampliación derivada: cancelación FOH
