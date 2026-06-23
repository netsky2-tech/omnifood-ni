# Roadmap de Remediación de Inventario (BOH) — OmniFood NI

Plan de **remediación y completitud** para el módulo de inventario existente. El módulo ya está implementado (insumos, catálogos, recetas, kardex, compras, producción, conteos, mermas, alertas, almacenes, proveedores, shell BOH), pero **no satisface** el [PRD de Gestión de Inventario](../../PRDs/prd_gestion_inventario.md). Este plan cierra las brechas en batches enfocados y revisables.

> **No es greenfield.** Cada batch parte de un "Estado actual" y enumera "Brechas a remediar". La meta es cumplimiento PRD, no reescritura.

## Decisiones confirmadas

Cerradas antes de implementación. Aplican transversalmente; los batches referencian estas reglas en lugar de reabrirlas.

| ID | Decisión | Impacto |
|----|----------|---------|
| D1 | **Recalculo retroactivo**: el **Source of Truth es append-only** (movimientos compensatorios de signo opuesto). Existencias, valorización, COGS y balances son **proyecciones materializadas** reconstruibles desde el Kardex. Nada se edita; las proyecciones se reconstruyen. | 6b (motor), 6c (reportes), 3a (invariante) |
| D2 | **FX BCN**: el tipo de cambio se toma por `fecha_emision`. La BCN **no** cambia el cambio por feriados; **no** asumir fallback a "último cambio hábil anterior" sin fuente oficial que lo respalde. Las ventanas de exención/IVA-cero declaradas por el gobierno son una **regla fiscal separada** (calendario), no un problema de FX. | 3b |
| D3 | **Topología**: el primer cliente despliega **Topology B** (tablet única + impresora térmica). **Topology A** (edge local centralizador) es objetivo de **migración futura**; los diseños actuales la mantienen *forward-compatible* sin bloquearla. Prioridad inmediata: B. | 1, 3c, 6a |

## Matriz de cobertura PRD → Batch

| PRD | Requisito | Batch | Estado |
|-----|-----------|-------|--------|
| §1 Topología A | Edge local + centralización + consolidación asíncrona | 1, 6a | Parcial |
| §1 Topología B | Tablet autónoma + deltas (sin stock absoluto) | 3c | Brecha |
| §2.1 Recetas/BOM | Sub-recetas multi-nivel, rendimiento, UOM binarias | 2 | Parcial |
| §2.2 CPP Multi-moneda | CPP en NIO, FX BCN por fecha de factura | 3b | Parcial |
| §2.3 Kardex Inmutable | Append-only, auditoría, sin DELETE/UPDATE | 3a | Parcial |
| §2.4 Mermas | Tipificación PRD, impacto CPP, plato o insumo | 4 | Brecha (taxonomía) |
| §2.5 Producción | Orden, salida masiva + entrada, costeo | 5 | Parcial |
| §3 Modelo de datos | Esquema relacional core | 1, 3a | Parcial |
| UC-01 | Compra USD en feriado (BCN por fecha factura) | 3b | Parcial |
| UC-02 | Sync diferida offline, deltas, orden cronológico | 3c | Brecha |
| UC-03 | Stock negativo + recalculo retroactivo (SoT append-only + proyecciones) | 6b | Brecha |
| UC-04 | Ajuste por conteo físico | 4 | Parcial |
| UC-05 | Versionamiento de recetas (vínculo histórico) | 2 | Parcial |
| NFR Decimal | `NUMERIC(14,4)` 4 decimales | 1, 3a (transversal) | Parcial |
| NFR Concurrencia | SERIALIZABLE / FIFO por ítem | 3a, 3c | Brecha |
| NFR Auditoría forense | Alerta > C$1,500 ajuste manual | 4, 6c | Parcial |

**Ampliaciones derivadas del PRD** (no literales en el PRD, pero necesarias para cumplimiento):
- Flujo de factura de compra con identidad fiscal y corrección por movimiento compensatorio → Batch 3b.
- Cancelación/reembolso FOH como movimiento compensatorio append-only → Batch 6a.
- Contrato determinista de sync offline (idempotencia, secuencia, reintentos) → Batch 3c.

## Batches del plan

| # | Batch | Foco | Origen |
|---|-------|------|--------|
| 1 | [Cimientos y Datos Maestros](batch_01_foundations.md) | Insumos, UOM, Topology B (inmediata) + A (futura), precisión decimal | Original (remediación) |
| 2 | [ADN del Plato](batch_02_recipes.md) | Recetas, BOM, versionamiento UC-05, vínculo histórico | Original (remediación) |
| 3a | [Kardex Inmutable](batch_03a_kardex_invariants.md) | Append-only, esquema auditoría, invariantes, concurrencia | Split de Batch 3 |
| 3b | [Factura de Compra + CPP + BCN](batch_03b_purchase_invoice_cpp.md) | Intake factura, identidad fiscal, FX BCN, CPP NIO | Split de Batch 3 |
| 3c | [Sync Offline Determinista](batch_03c_offline_sync_contract.md) | Deltas, idempotencia, secuencia, reintentos, Topología B | Split de Batch 3 |
| 4 | [Mermas y Ajustes](batch_04_mermas_ajustes.md) | Taxonomía PRD, conteo físico, alertas forenses | Original (remediación) |
| 5 | [Producción](batch_05_production.md) | Órdenes, atomización, costeo sub-receta | Original (remediación) |
| 6a | [Hooks FOH Venta/Cancelación](batch_06a_foh_hooks.md) | Descuento venta, cancelación/reembolso compensatorio | Split de Batch 6 |
| 6b | [Stock Negativo + Recalculo Retroactivo](batch_06b_negative_stock_retrocalc.md) | Stock negativo permitido, recalculo **obligatorio** | Split de Batch 6 |
| 6c | [Dashboard y Reportes](batch_06c_dashboard_reporting.md) | Existencias, valorización, COGS, alertas stock | Split de Batch 6 |

> Los antiguos `batch_03_financial_kardex.md` y `batch_06_integration_foh.md` quedaron descompuestos en 3a/3b/3c y 6a/6b/6c respectivamente.

## Reglas de oro (invariantes en todos los batches)

1. **4 decimales obligatorios** — todo cálculo con `NUMERIC(14,4)`.
2. **Kardex sagrado** — no se borra ni edita; toda corrección es un movimiento compensatorio de signo opuesto (respeta DGI: facturas no se eliminan, solo se anulan).
3. **Costo en NIO** — usando el cambio BCN de la **fecha de la factura**, no la fecha de digitación. El cambio BCN no varía por feriado (ver D2); no asumir fallback a "último cambio hábil" sin fuente.
4. **Deltas, no absolutos** — la nube nunca recibe "stock actual"; recibe deltas netos reproducibles.
5. **Recalculo retroactivo obligatorio** si se permite stock negativo (UC-03) — no opcional.
6. **Proyecciones materializadas** — el Kardex append-only es el Source of Truth; existencias, valorización, COGS y balances son proyecciones reconstruibles desde el Kardex (ver D1).

## Cómo revisar este plan

1. Lee la **matriz de cobertura** arriba para ver qué PRD cubre cada batch.
2. Abre el batch por orden (1 → 6c); cada uno tiene `Estado actual` → `Brechas a remediar` → `DoD`.
3. Los DoD son las aceptaciones; si un ítem sigue sin checked, el batch no cierra.
4. Batch 3a/3b/3c y 6a/6b/6c pueden revisarse de forma independiente (slices enfocados).
