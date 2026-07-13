# Roadmap de Remediación de Inventario (BOH) — OmniFood NI

Plan de **remediación y completitud** para el módulo de inventario existente. Ya existen piezas operativas (insumos, catálogos, recetas, historial local de movimientos/inventario, compras, producción, conteos, mermas, alertas, almacenes, proveedores, shell BOH), pero **no satisfacen** todavía el [PRD de Gestión de Inventario](../../PRDs/prd_gestion_inventario.md). Este plan cierra las brechas en batches enfocados y revisables.

> **No es greenfield.** Cada batch parte de un "Estado actual" y enumera "Brechas a remediar". La meta es cumplimiento PRD, no reescritura.

## Decisiones confirmadas

Cerradas antes de implementación. Aplican transversalmente; los batches referencian estas reglas en lugar de reabrirlas.

| ID | Decisión | Impacto |
|----|----------|---------|
| D1 | **Recalculo retroactivo**: el **Source of Truth es append-only** (movimientos compensatorios de signo opuesto). Existencias, valorización, COGS y balances son **proyecciones materializadas** reconstruibles desde el Kardex. Nada se edita; las proyecciones se reconstruyen. | 6b (motor), 6c (reportes), 3a (invariante) |
| D2 | **FX BCN**: el tipo de cambio se toma por `fecha_emision`. La BCN **no** cambia el cambio por feriados; **no** asumir fallback a "último cambio hábil anterior" sin fuente oficial que lo respalde. Las ventanas de exención/IVA-cero declaradas por el gobierno son una **regla fiscal separada** (calendario), no un problema de FX. | 3b |
| D3 | **Topología**: el primer cliente despliega **Topology B** (tablet única + impresora térmica). **Topology A** (edge local centralizador) es objetivo de **migración futura**; los diseños actuales la mantienen *forward-compatible* sin bloquearla. Prioridad inmediata: B. | 1, 3c, 6a |

## Estado actual del plan (truth pass — 2026-07-10)

Resumen ejecutivo del estado real tras los merges **PR #32** (Batch 1), **PR #34** (Batch 2 Slice 2.1), **PR #36** (Batch 2 Slice 2.2), **PR #42 / #44 / #46 / #48** (Batch 3a slices 3a.1-3a.4), **PR #57-#63** (Batch 3b), **PR #67 / #71 / #73 / #75** (Batch 3c), **PR #77-#83** (Batch 4) y **PR #92** (Batch 5 Producción). Detalle por batch en cada documento.

| Batch | Estado | Resumen |
|-------|--------|---------|
| 1 — Cimientos y Datos Maestros | **Mayoritariamente hecho** | Catálogos administrables + regla UOM + doc de topología (D3) + DAO/pantalla de insumos entregados. Diferidos: sync download de catálogos, FKs de catálogo en schema producto/insumo, precisión 4dp en entity Flutter, integración UOM en compras (→3b), dead `InventoryController` (chore). |
| 2 — ADN del Plato (Recipes/BOM) | **Parcial-alto** | Slice 2.1 (PR #34) y Slice 2.2 (PR #36) mergeados. La ingesta backend de `recipe-version` ya quedó cubierta de forma acotada (`POST /inventory/recipes/versions`, tenant/UOM/idempotencia, single-level). Resta: BOM multi-nivel versionado completo, UI jerárquica profunda, CPP teórico (→3b). |
| 3a — Kardex Inmutable | **Cerrado** | Slice 3a.1 enforces backend append-only immutability, 3a.2 validates historical baselines plus running-balance continuity with same-stream serialization, 3a.3 freezes cost snapshots on new ledger rows, and 3a.4 closes local SQLite append-only parity for POS movement history. |
| 3b — Factura/Compra + CPP + BCN | **Cerrado** | Identidad fiscal de factura de proveedor, fecha fiscal vs digitación, lookup/caché BCN exact-date, calculadora CPP, corrección compensatoria append-only y generación Kardex `ENTRADA_COMPRA` quedaron cubiertos. Ver `batch_03b_purchase_invoice_cpp.md`. |
| 3c — Sync Offline Determinista | **Cerrado** | Deltas-only, idempotencia, secuencia local, reintentos granulares, parsing determinista y cobertura route/e2e quedaron cubiertos por la cadena PR #67/#71/#73 y merge final #75. |
| 4 — Mermas y Ajustes | **Cerrado** | Taxonomía PRD, metadatos offline/POS, merma de producto, BOM backend para platos, alertas forenses y sesiones de conteo físico quedaron cubiertos por la cadena PR #77-#83. |
| 5 — Producción | **Cerrado** | Vertical slice POS offline + backend replay/history completado: cierre local de producción, identidad de terminal estable, source sequence determinístico, validación de stock de componentes, idempotencia, costeo canónico, historial append-only y RLS/immutability. UI avanzada, sub-recetas multi-nivel, empaques, aprobaciones y dashboards/reportes quedan fuera de Batch 5. |
| 6a — Hooks FOH Venta/Cancelación | **Parcial** | Hooks POS de venta (BOM OUT) y void atómico (compensatorio) ya implementados vía PR #34; matemática BOM versionada refinada en PR #36. Batch 6a added the credit-note fiscal/sync contract with provenance, backend authorization, and deterministic replay. Remaining: backend Kardex compensation, async/background latency (#105), offline sale→credit-note e2e (#106), and final refund-reason/partial-credit-note policy. **No** reclamar Kardex formal completo. |
| 6b — Stock Negativo + Recalculo | No iniciado | Depende de 3a. |
| 6c — Dashboard y Reportes | No iniciado | |

**Diferidos confirmados (no bloquean 3a):**
- **Batch 1:** sync download de catálogos · FKs de catálogo en schema producto/insumo · precisión 4dp entity Flutter · integración UOM en flujo de compras (→3b) · dead `InventoryController` (chore).
- **Batch 2:** BOM multi-nivel versionado completo · UI jerárquica profunda · CPP teórico (→3b). *(La ingesta backend de recipe-version ya quedó resuelta en alcance single-level.)*

## Matriz de cobertura PRD → Batch

| PRD | Requisito | Batch | Estado |
|-----|-----------|-------|--------|
| §1 Topología A | Edge local + centralización + consolidación asíncrona | 1, 6a | Parcial (D3 registrado; A forward-compatible, no implementada) |
| §1 Topología B | Tablet autónoma + deltas (sin stock absoluto) | 3c | Hecho (Batch 3c cerrado) |
| §2.1 Recetas/BOM | Sub-recetas multi-nivel, rendimiento, UOM binarias | 2 | Parcial-alto (2.1/2.2 mergeados; multi-nivel versionado diferido) |
| §2.2 CPP Multi-moneda | CPP en NIO, FX BCN por fecha de factura | 3b | Hecho (Batch 3b cerrado) |
| §2.3 Kardex Inmutable | Append-only, auditoría, sin DELETE/UPDATE | 3a | Hecho (backend append-only + running-balance + frozen cost snapshots + local SQLite append-only parity completados en 3a.1-3a.4) |
| §2.4 Mermas | Tipificación PRD, impacto CPP, plato o insumo | 4 | Hecho (Batch 4 cerrado) |
| §2.5 Producción | Orden, salida masiva + entrada, costeo | 5 | Hecho para vertical slice offline-first (Batch 5 cerrado; sub-recetas multi-nivel, empaques, aprobaciones y reporting quedan diferidos) |
| §3 Modelo de datos | Esquema relacional core | 1, 3a | Parcial (insumos/catálogos hechos; FKs catálogo en schema + Kardex formal pendientes) |
| UC-01 | Compra USD en feriado (BCN por fecha factura) | 3b | Hecho (Batch 3b cerrado) |
| UC-02 | Sync diferida offline, deltas, orden cronológico | 3c | Hecho (Batch 3c cerrado) |
| UC-03 | Stock negativo + recalculo retroactivo (SoT append-only + proyecciones) | 6b | Brecha |
| UC-04 | Ajuste por conteo físico | 4 | Hecho (Batch 4 cerrado) |
| UC-05 | Versionamiento de recetas (vínculo histórico) | 2 | Hecho (2.1 — `recipeVersionId` per-line) |
| NFR Decimal | `NUMERIC(14,4)` 4 decimales | 1, 3a (transversal) | Parcial (backend `NUMERIC(14,4)`; entity Flutter 4dp diferido) |
| NFR Concurrencia | SERIALIZABLE / FIFO por ítem | 3a, 3c | Hecho para alcance 3a/3c (3a.2 serializa inserts backend por `tenant_id + insumo_id`; 3c cierra sync determinista con secuencia, idempotencia y reintentos granulares) |
| NFR Auditoría forense | Alerta > C$1,500 ajuste manual | 4, 6c | Parcial (alerta Batch 4 hecha; dashboards/reportes quedan en 6c) |

**Ampliaciones derivadas del PRD** (no literales en el PRD, pero necesarias para cumplimiento):
- Flujo de factura de compra con identidad fiscal y corrección por movimiento compensatorio → Batch 3b.
- Cancelación/reembolso FOH como movimiento compensatorio append-only → Batch 6a (parcial: POS void atómico hecho en PR #34; contrato fiscal/sync de credit note documentado; Kardex formal, async/e2e y políticas finales pendientes).
- Contrato determinista de sync offline (idempotencia, secuencia, reintentos) → Batch 3c.
- Replay de producción offline con source sequence, idempotencia, costeo canónico e historial append-only → Batch 5.

## Batches del plan

| # | Batch | Foco | Origen | Estado |
|---|-------|------|--------|--------|
| 1 | [Cimientos y Datos Maestros](batch_01_foundations.md) | Insumos, UOM, Topology B (inmediata) + A (futura), precisión decimal | Original (remediación) | Mayoritariamente hecho |
| 2 | [ADN del Plato](batch_02_recipes.md) | Recetas, BOM, versionamiento UC-05, vínculo histórico | Original (remediación) | Parcial-alto (2.1/2.2 mergeados) |
| 3a | [Kardex Inmutable](batch_03a_kardex_invariants.md) | Append-only, esquema auditoría, invariantes, concurrencia | Split de Batch 3 | Cerrado (3a.1-3a.4 mergeados) |
| 3b | [Factura de Compra + CPP + BCN](batch_03b_purchase_invoice_cpp.md) | Intake factura, identidad fiscal, FX BCN, CPP NIO | Split de Batch 3 | Cerrado |
| 3c | [Sync Offline Determinista](batch_03c_offline_sync_contract.md) | Deltas, idempotencia, secuencia, reintentos, Topología B | Split de Batch 3 | Cerrado |
| 4 | [Mermas y Ajustes](batch_04_mermas_ajustes.md) | Taxonomía PRD, conteo físico, alertas forenses | Original (remediación) | Cerrado |
| 5 | [Producción](batch_05_production.md) | Órdenes, atomización, costeo sub-receta | Original (remediación) | Cerrado |
| 6a | [Hooks FOH Venta/Cancelación](batch_06a_foh_hooks.md) | Descuento venta, cancelación/reembolso compensatorio | Split de Batch 6 | Parcial (POS sale/void hechos; contrato credit note documentado; Kardex formal, async/e2e y políticas finales pendientes) |
| 6b | [Stock Negativo + Recalculo Retroactivo](batch_06b_negative_stock_retrocalc.md) | Stock negativo permitido, recalculo **obligatorio** | Split de Batch 6 | No iniciado |
| 6c | [Dashboard y Reportes](batch_06c_dashboard_reporting.md) | Existencias, valorización, COGS, alertas stock | Split de Batch 6 | No iniciado |

> Los antiguos `batch_03_financial_kardex.md` y `batch_06_integration_foh.md` quedaron descompuestos en 3a/3b/3c y 6a/6b/6c respectivamente.

## Limpieza pre-Batch 3 (recomendada)

Antes de iniciar Batch 3a, orden recomendado de limpieza de deuda pendiente. Cada ítem es independiente y enfocado; ninguno bloquea 3a, pero conviene saldarlos para reducir ruido y riesgo durante 3a/3b.

| # | Limpieza | Origen | Notas |
|---|----------|--------|-------|
| 1 | **Docs truth pass** | Transversal | Alinear roadmap/batches con estado real (este cambio). |
| 2 | **Ingesta backend de recipe-version** | Batch 2 | ✅ Completado en alcance acotado: controlador para `POST /inventory/recipes/versions`, persistencia idempotente por `(tenant_id, pos_document_id)`, validación/conversión UOM para insumos y rechazo explícito de `SUB_RECIPE` hasta tener BOM multi-nivel versionado. |
| 3 | **Sync download de catálogos** | Batch 1 | Wiring en `SyncService` para refrescar caché local desde `/catalogs`. |
| 4 | **Dead `InventoryController` chore** | Batch 1 | Eliminar `inventory.controller.ts` muerto (no registrado, ruta duplicada). |

**Aclaración de prerequisitos para Batch 3a:**
- **CPP (Batch 3b) NO es prerequisito de 3a.** El costo teórico basado en CPP depende de 3b; 3a trabaja el Kardex inmutable sin requerir costing.
- **BOM multi-nivel versionado completo NO es prerequisito de 3a.** Es deuda de Batch 2 diferida; no bloquea las invariantes de Kardex.

> La limpieza es recomendada, no bloqueante: 3a puede iniciar sin ella.

## Reglas de oro (invariantes en todos los batches)

1. **4 decimales obligatorios** — todo cálculo con `NUMERIC(14,4)`.
2. **Kardex sagrado** — no se borra ni edita; toda corrección es un movimiento compensatorio de signo opuesto (respeta DGI: facturas no se eliminan, solo se anulan).
3. **Costo en NIO** — usando el cambio BCN de la **fecha de la factura**, no la fecha de digitación. El cambio BCN no varía por feriado (ver D2); no asumir fallback a "último cambio hábil" sin fuente.
4. **Deltas, no absolutos** — la nube nunca recibe "stock actual"; recibe deltas netos reproducibles.
5. **Recalculo retroactivo obligatorio** si se permite stock negativo (UC-03) — no opcional.
6. **Proyecciones materializadas** — el Kardex append-only es el Source of Truth; existencias, valorización, COGS y balances son proyecciones reconstruibles desde el Kardex (ver D1).

## Cómo revisar este plan

1. Lee el **Estado actual del plan** arriba para ver el estado real por batch.
2. Abre el batch por orden (1 → 6c); cada uno tiene `Estado actual` → `Brechas a remediar` → `DoD`.
3. Los DoD son las aceptaciones; si un ítem sigue sin checked, el batch no cierra.
4. Batch 3a/3b/3c y 6a/6b/6c pueden revisarse de forma independiente (slices enfocados).
5. Antes de 3a, revisa la **Limpieza pre-Batch 3** recomendada.
