# §9.3 CHECK clauses residuales (follow-up #4 de la tabla post-gate)

**Estado:** EN REVISIÓN (opción A implementada)
**Fecha:** 2026-02-14
**Origen:** header de `1809650000000-EnforceLoyaltyLedgerIdentityConstraints.ts`: *"The remaining §9.3 units/version/snapshot clauses are a tracked follow-up, not silently dropped."*

## Qué quedó residual (no reforzado hoy)

La migración backend 180965 y el guard POS T2b (triggers) ya refuerzan:
`transaction_type` no-NULL en backend, forma EARN/REDEEM/REVERSAL (claves),
4 identidades únicas parciales, drift guards.

Cláusulas del DDL canónico §9.3 (`docs/loyalty/loyalty_architecture_spec.md`,
tabla `customer_point_transactions`) **sin refuerzo real**:

| Cláusula spec | ¿Compatible con el contrato despachado? |
|---|---|
| `units != 0` y no-NULL en filas declaradas | ✅ sí — T4/T5 escriben units firmados |
| `EARN → units > 0` / `REDEEM → units < 0` | ✅ sí |
| `occurred_at IS NOT NULL` (filas declaradas) | ✅ sí (sender lleva occurredAt) |
| `idempotency_key IS NOT NULL` (filas declaradas) | ⚠️ solo filas declaradas (las NULL-legacy no tienen key por diseño) |
| `origin IN ('POS','CLOUD')` | ✅ sí |
| `ADJUST → actor_user_id NOT NULL AND reason != ''` | ⚠️ verificar escritores ADJUST |
| `EARN → program_version NOT NULL AND commercial_snapshot NOT NULL` | ❌ **conflicto** — T4 no llena esos campos |
| `REDEEM → reward_id, reward_version, snapshot NOT NULL` | ❌ **conflicto** — T4 redime por puntos legacy sin reward (fail-safe, decisión #881) |
| `sync_status IN ('pending','synced','error')` | ✅ dominio, trivial |

## El fork

- **Opción A (relajar al contrato despachado):** reforzar solo las cláusulas
  compatibles (units, presencia, dominios, actor/reason) en backend (CHECK
  `ck_loyalty_tx_v1_shape_residual` con pre-scan fail-closed) y en POS (extender
  el trigger §9.3). Las cláusulas version/snapshot quedan **documentadas como
  diferidas** con esta decisión — el spec se corrige para reflejar el contrato
  real (REDEEM sin reward es legítimo por diseño fail-safe de T4).
- **Opción B (enriquecer escritores):** los creators POS pasan a llenar
  `programVersion` (configVersion de la evaluación) y `commercialSnapshot`
  (JSON de términos comerciales al momento del movimiento); REDEEM por puntos
  legacy queda prohibida en V1 (solo REDEEM por reward) — contradice la
  decisión fail-safe de T4 que el owner aprobó implícitamente en #882.
- **Opción C (A ahora, B después):** reforzar lo compatible ya; enriquecer
  escritores como follow-up propio.

## Decisión del owner (2026-02-14): OPCIÓN A

Reforzar solo el subconjunto compatible. Cláusulas implementadas:

- EARN: units no-NULL y > 0 · REDEEM: units no-NULL y < 0
- ADJUST: units no-NULL y ≠ 0 (+ actor_user_id y reason no-blancos en backend)
- REVERSAL: units ≠ 0 (NULL permitido — espejo legítimo de fila legacy)
- Toda fila declarada: idempotency_key no-NULL
- origin (POS): NULL o 'pos'/'cloud' case-insensitive (backend ya lo cubre el
  enum `customer_point_transactions_origin_enum`)
- **Diferidas con decisión**: program_version/commercial_snapshot/reward_id/
  reward_version (conflictan con el contrato T4) y occurred_at (las filas
  locales POS no persisten occurred_at; el sender lo deriva de created_at)

Implementación: POS — reglas residuales en `_loyaltyLedgerShapeRules` + trigger
BEFORE INSERT/UPDATE (mismo guard T2b, 20/20 tests); backend — migración
`1809750000000-EnforceLoyaltyLedgerV1ShapeResidualConstraints` (pre-scan
fail-closed por cláusula + CHECK `ck_loyalty_tx_v1_shape_residual`, 4/4 unit
spec). Pendiente: `.db.spec` de integración contra PostgreSQL real (patrón
180965) como follow-up propio.

## Nota de alcance si A o C

- Backend: migración nueva con pre-scan fail-closed (mismo patrón 180965) +
  specs `.spec.ts`/`.db.spec.ts`.
- POS: `_loyaltyLedgerShapeRules` gana reglas de units/dominios (mismo archivo
  de triggers; test `loyalty_ledger_identity_migration_test.dart`).
- Las filas pre-V1 NULL-legacy en POS quedan fuera (namespace, sin key) — en
  backend ya son imposibles (180965 exige tipo no-NULL).
