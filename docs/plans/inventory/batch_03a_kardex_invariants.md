# Batch 3a: Kardex Inmutable — Append-Only y Auditoría

Núcleo contable: garantizar que el Kardex sea **estrictamente append-only** con esquema de auditoría e invariantes verificables. Este batch no toca CPP ni sync (eso va en 3b/3c); solo la integridad del registro.

## Estado actual
- `KardexEntity` existe con campos de auditoría y tipos de movimiento.
- UI de Kardex funcional.
- Slice 3a.1 status: backend `inventory_kardex` is the authoritative movement-history table today, and this slice enforces PostgreSQL append-only guards there.
- Slice 3a.2 status: backend `inventory_kardex` now validates the pre-existing history during migration, rejects inserts whose stored `stock_before` / `stock_after` diverge from the running balance for the same `tenant_id + insumo_id`, and serializes same-stream inserts with a transaction-scoped advisory lock so concurrent writers cannot bypass that invariant.
- Slice 3a.3 status: new backend ledger inserts now stamp `unit_cost_nio`, `stock_after`, and `average_cost_after_nio` at insert time so later cost changes do not mutate the historical economic snapshot.
- Slice 3a.4 status: local POS SQLite now keeps `inventory_movements` append-only via SQLite triggers and tracks sync acknowledgement in a separate `inventory_movement_sync_state` table so sync no longer mutates historical movement rows.

## Brechas a remediar
- [x] **Backend append-only strictness at data level (`inventory_kardex`)**: PostgreSQL trigger rejects DELETE/UPDATE for the authoritative backend kardex log.
- [x] **Remaining append-only parity**: local SQLite/Floor now rejects `UPDATE`/`DELETE` on `inventory_movements` and stores sync status outside the immutable ledger rows.
- [x] Running-balance invariant: `existencia_posterior` (`stock_after` / `new_stock`) matches the per-item historical sum through migration-time baseline validation + INSERT trigger enforcement + DB-backed rejection tests.
- [x] Cost snapshot freeze: each new backend row now stamps `unit_cost_nio`, `stock_after`, and `average_cost_after_nio` at movement insert time without retro-recomputing older rows.
- [x] Narrow concurrency protection for this slice (NFR): an advisory transaction lock on `tenant_id + insumo_id` serializes same-stream inserts so a stale baseline cannot bypass the running-balance invariant. Full FIFO / sync architecture remains in 3c.

## Alcance técnico

### Esquema Kardex (PRD §3)
- `kardex`: `id` (BIGSERIAL incremental obligatorio), `insumo_id`, `fecha_movimiento`, `tipo_movimiento`, `documento_origen_id`, `cantidad` (signo incluido), `costo_unitario_movimiento_nio`, `existencia_posterior`, `costo_promedio_posterior_nio`, `usuario_id`, `terminal_id`.
- Tipos de movimiento: `ENTRADA_COMPRA`, `SALIDA_VENTA`, `SALIDA_MERMA`, `AJUSTE_CONTEO`, `ENTRADA_PRODUCCION` (más los compensatorios de 6a: `AJUSTE_COMPENSATORIO`).

### Inmutabilidad
- Cualquier corrección es un **nuevo movimiento de signo inverso** (respeta DGI: facturas no se eliminan, solo se anulan).
- Trigger/trigger-equivalente que rechace UPDATE/DELETE.

### Invariantes a verificar
1. Saldo = suma histórica de `cantidad` por insumo.
2. Costo congelado nunca se muta.
3. Secuencia de `id` monótona.

## DoD (Criterios de aceptación)
- [x] Backend `inventory_kardex` has DB-enforced append-only protection (no solo código).
- [x] Local offline movement store has equivalent DB-enforced append-only protection.
- [x] Running-balance invariant test (insert N movements → verify coherent `existencia_posterior`).
- [x] Backend Postgres test coverage rejects UPDATE/DELETE and keeps INSERT working for `inventory_kardex`.
- [x] Concurrency isolation is proven for the running-balance invariant (two simultaneous inserts on the same `tenant_id + insumo_id` cannot bypass the validated baseline).
- [x] New backend ledger rows freeze their cost snapshot fields at insert time without mutating historical rows.

## PRD cubierto
§2.3 Kardex Inmutable · §3 Modelo de datos (kardex) · NFR Concurrencia · NFR Decimal
