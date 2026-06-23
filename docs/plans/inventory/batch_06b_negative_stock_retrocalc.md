# Batch 6b: Stock Negativo + Recalculo Retroactivo (Obligatorio)

Permitir ventas con stock teórico cero (regla de alimentos, UC-03) y **recalculo retroactivo obligatorio** cuando se digita una factura de compra con fecha pasada. El recalculo **ya no es opcional**: si se permite stock negativo, es requerido por el PRD.

## Estado actual
- Stock negativo virtual no está formalizado; recalculo marcado como "Opcional/Avanzado" en el plan viejo — **violación del PRD UC-03**.

## Brechas a remediar
- [ ] **Stock negativo permitido**: el FOH no bloquea la venta por stock teórico cero (impediría vender stock real que llegó físicamente sin factura digitada). El Kardex registra la salida con stock negativo temporal al último CPP conocido.
- [ ] **Recalculo retroactivo obligatorio (UC-03)**: al digitar una factura de compra con fecha pasada que antecede a salidas en stock negativo, el motor **recalcula automáticamente** costos, emite movimientos compensatorios append-only y reconstruye las proyecciones de balance/valorización.
- [ ] Marcar las salidas en stock negativo como "pendientes de regularización" para trazabilidad.
- [ ] Definir alcance del recalculo: desde la fecha de la compra retroactiva hacia adelante, recalculo de CPP y revalorización de salidas posteriores afectadas.

## Alcance técnico

### Stock negativo virtual (UC-03)
- `SALIDA_VENTA` con `existencia_posterior` negativa permitida, valorada al último CPP conocido.
- Flag/marcador de "salida en estado negativo" para identificar regularizaciones pendientes.

### Recalculo retroactivo (obligatorio)
- Trigger: entrada `ENTRADA_COMPRA` con `fecha_emision` anterior a salidas posteriores en stock negativo.
- Motor de recalculo: reprocessa los movimientos del insumo desde la fecha de la compra hacia adelante, recalculando CPP. Las salidas afectadas se corrigen **vía movimientos compensatorios append-only** (nunca editando las líneas originales).
- **Source of Truth append-only (D1)**: el recalculo **no edita** líneas existentes; cualquier ajuste es un movimiento compensatorio de signo opuesto que se *appenda* al Kardex. Los balances y la valorización son **proyecciones materializadas** que se reconstruyen desde el Kardex — pueden rebuildarse en cualquier momento.

## DoD (Criterios de aceptación)
- [ ] Venta con stock 0 permitida; Kardex registra salida negativa (test).
- [ ] Recalculo retroactivo se dispara al ingresar compra con fecha pasada (test: salidas posteriores se revalorizan).
- [ ] Salidas negativas marcadas y regularizadas tras recalculo.
- [ ] Documento de decisión: alcance del recalculo (desde la fecha de compra retroactiva hacia adelante) y política **append-only** — nada se reedita; todo se compensa y las proyecciones se reconstruyen (D1).

## PRD cubierto
UC-03 Stock negativo + recalculo retroactivo · §2.2 CPP · §2.3 Kardex Inmutable
