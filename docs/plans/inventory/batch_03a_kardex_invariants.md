# Batch 3a: Kardex Inmutable — Append-Only y Auditoría

Núcleo contable: garantizar que el Kardex sea **estrictamente append-only** con esquema de auditoría e invariantes verificables. Este batch no toca CPP ni sync (eso va en 3b/3c); solo la integridad del registro.

## Estado actual
- `KardexEntity` existe con campos de auditoría y tipos de movimiento.
- UI de Kardex funcional.
- Slice 3a.1 status: backend `inventory_kardex` is the authoritative movement-history table today, and this slice enforces PostgreSQL append-only guards there.
- Slice 3a.1 note: local POS SQLite still stores movement history in `inventory_movements` without an explicit DB-level append-only trigger/rule yet; that remains outside this slice.

## Brechas a remediar
- [x] **Backend append-only strictness at data level (`inventory_kardex`)**: PostgreSQL trigger rejects DELETE/UPDATE for the authoritative backend kardex log.
- [ ] **Remaining append-only parity**: add the equivalent explicit local SQLite/Floor guard for `inventory_movements` so offline storage matches the backend guarantee.
- [ ] Invariante de saldo: `existencia_posterior` debe coincidir siempre con la suma histórica de movimientos del insumo (test que detecte desbalances).
- [ ] Congelamiento de costeo: cada línea estampa `costo_unitario_movimiento_nio`, `existencia_posterior`, `costo_promedio_posterior_nio` en el instante del movimiento.
- [ ] Concurrencia (NFR): SERIALIZABLE o FIFO por ítem al insertar movimientos del mismo insumo, para evitar race conditions en CPP.

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
- [ ] Local offline movement store has equivalent DB-enforced append-only protection.
- [ ] Test de invariante de saldo (insertar N movimientos → verificar `existencia_posterior` coherente).
- [x] Backend Postgres test coverage rejects UPDATE/DELETE and keeps INSERT working for `inventory_kardex`.
- [ ] Aislamiento de concurrencia demostrado (dos inserciones simultáneas no corrompen CPP).

## PRD cubierto
§2.3 Kardex Inmutable · §3 Modelo de datos (kardex) · NFR Concurrencia · NFR Decimal
