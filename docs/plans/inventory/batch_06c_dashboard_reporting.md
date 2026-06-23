# Batch 6c: Dashboard, Reportes y Alertas

Reportabilidad gerencial: existencias, valorización, costo de ventas (COGS) y alertas de stock mínimo. Cierra el ciclo de visibilidad del inventario.

## Estado actual
- Reporte de Kardex por insumo existe parcialmente; COGS y valorización no completos.

## Brechas a remediar
- [ ] **Reporte de Existencias**: insumos con stock actual y valorización (`stock * CPP`).
- [ ] **Reporte de Movimientos**: filtro por fecha e insumo del detalle del Kardex.
- [ ] **Costo de Ventas (COGS)** por período, basado en salidas valoradas al CPP congelado.
- [ ] **Alertas de stock bajo**: indicadores en FOH y BOH cuando un insumo llega a `stockMinimo`.
- [ ] Alerta forense (NFR) consolidada con Batch 4: ajustes > C$1,500.00.

## Alcance técnico

### Dashboard de inventario (proyecciones materializadas, D1)
- Existencias, valorización y COGS se leen de **proyecciones materializadas** derivadas del Kardex append-only (Source of Truth). Las proyecciones se reconstruyen desde el log; no son datos primarios.
- Reporte de movimientos con filtros (lectura directa del Kardex).
- COGS = suma de `SALIDA_VENTA` + `SALIDA_MERMA` valoradas en el período (proyección por período, rebuildable).

### Alertas
- Stock mínimo: umbral por insumo → indicador visual + notificación.
- Forense: ajuste manual > C$1,500.00 → correo/push al admin (NFR, consolidado con Batch 4).

## DoD (Criterios de aceptación)
- [ ] Reporte de existencias con valorización funcional (tablet/admin).
- [ ] Reporte de movimientos con filtro fecha/insumo.
- [ ] Reporte COGS por período.
- [ ] Alertas de stock bajo visibles en FOH y BOH.
- [ ] Alerta forense > C$1,500.00 operativa (e2e).

## PRD cubierto
NFR Auditoría forense (consolidado) · ampliación derivada: reportabilidad gerencial
