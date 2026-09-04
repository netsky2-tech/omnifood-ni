# NHILOS Client Onboarding V1 — Evidence Receipt: PR-ONB-22 (ONB1.9A–D)

**Documento:** `ONB1.9_M7_PR22_EVIDENCE.md`  
**Ubicación:** `docs/onboarding/evidence/ONB1.9_M7_PR22_EVIDENCE.md`  
**Slices cubiertos:** `ONB1.9A`, `ONB1.9B`, `ONB1.9C`, `ONB1.9D` (Fila 23 del Roadmap Onboarding V1)  
**Fecha de ejecución:** 2026-09-04  
**Branch:** `feat/backoffice-spa`  
**Metodología:** TDD estricto -> Triangulación -> Integración (PostgreSQL real en backend, Floor SQLite real en disco y memoria en POS, Vitest en Dashboard) -> E2E local sin mocks inventados.

---

# 1. Resumen de Entregables Físicos

### 1.1 ONB1.9A — Inventory Readiness Adapter (`apps/admin_backend`)
- **Contrato de Puerto & Adapter**:
  - `InventoryReadinessPort` en `src/modules/onboarding/ports/inventory-readiness.port.ts`.
  - `InventoryReadinessAdapter` en `src/modules/onboarding/adapters/inventory-readiness.adapter.ts`.
- **Lógica de Alcance de Inventario**:
  - Evalúa la infraestructura de inventario (`Warehouse`, `Insumo`, `Product`) clasificando en alcances `NONE`, `BASIC` y `ADVANCED`.
  - **Invariante AC-07 & AC-40**: Tener stock en cero (`itemsWithStockCount == 0`) **NO impide** alcanzar `inventoryReady: true` si la estructura básica está definida, y bajo ningún concepto bloquea `saleReady` ni revoca `ACTIVATED`.

### 1.2 ONB1.9B — Costing Readiness Adapter (`apps/admin_backend`)
- **Contrato de Puerto & Adapter**:
  - `CostingReadinessPort` en `src/modules/onboarding/ports/costing-readiness.port.ts`.
  - `CostingReadinessAdapter` en `src/modules/onboarding/adapters/costing-readiness.adapter.ts`.
- **Estados Explícitos de Costo**:
  - Cada producto expone de forma explícita uno de tres estados:
    - `KNOWN(value)`: cuando existe un costo promedio positivo o procedencia verificable.
    - `COST_PENDING(reason)`: cuando el costo es 0 o no configurado sin procedencia en Kardex (`ZERO_COST_WITHOUT_INVENTORY_PROVENANCE`).
    - `NOT_APPLICABLE`: para servicios o ítems no inventariables.
  - **Invariante AC-08 & AC-41**: `averageCost = 0` físico **NUNCA** se presenta ni se asume como costo confirmado sin procedencia de Kardex o documento de compra. Los ítems permanecen `COST_PENDING` sin bloquear caja.

### 1.3 ONB1.9C — Operations Readiness Adapter (`apps/admin_backend`)
- **Contrato de Puerto & Adapter**:
  - `OperationsReadinessPort` en `src/modules/onboarding/ports/operations-readiness.port.ts`.
  - `OperationsReadinessAdapter` en `src/modules/onboarding/adapters/operations-readiness.adapter.ts`.
- **Observabilidad Operativa**:
  - Observa de manera desacoplada la incorporación de:
    - Staff adicional (`User` con roles operativos más allá del Owner inicial, AC-26).
    - Recetas publicadas (`RecipeVersion` en estado `PUBLISHED`).
    - Proveedores registrados (`Supplier`).
    - Categorías de catálogo configuradas.
  - **Invariante Normativo**: La falta de enriquecimiento operacional posterior **NUNCA revoca** el estado `ACTIVATED`.

### 1.4 Integración en Evaluador y Reconciliador (`apps/admin_backend`)
- **`OnboardingReadinessEvaluator`**:
  - Concurrencia real `Promise.all` sobre los 6 puertos: `Identity`, `Fiscal`, `Catalog`, `Inventory`, `Costing`, `Operations`.
  - Bloqueadores reservados exclusivamente para el mínimo vendible de `saleReady`. Los pendientes de costo o inventario generan `warnings`, nunca bloqueadores.
- **`OnboardingStateReconciler`**:
  - Monotonicidad estricta: Una sesión en estado `ACTIVATED` permanece inmutable ante variaciones o avances de BOH; `activatedAt` no se reinicia ni se modifica.

### 1.5 ONB1.9D — BOH Progressive Checklist & Direct Links (`apps/owner_dashboard`)
- **Componente `SetupCenterView`**:
  - Nueva tarjeta `data-testid="boh-progressive-checklist"` orientada a la transición progresiva hacia Backoffice.
  - Sub-tarjetas con métricas en tiempo real:
    - `data-testid="boh-inventory-card"`: Alcance, almacenes, ítems con stock y leyenda normativa AC-07/AC-40.
    - `data-testid="boh-costing-card"`: Estados explícitos conocidos vs pendientes y leyenda AC-08/AC-41.
    - `data-testid="boh-operations-card"`: Staff adicional, recetas y proveedores.
  - **Enlaces directos a módulos propietarios existentes**: Botones hacia `/inventory`, `/inventory/kardex` y `/users` evitando la duplicación de wizards o importadores artificiales (AC-44).

### 1.6 Floor SQLite E2E Real Persistence (`apps/pos_app`)
- **Suite E2E `onb1_9_progressive_boh_readiness_e2e_test.dart`**:
  - Prueba en disco (`sqflite_ffi` / SQLite real):
    - Venta en caja con producto con `stock = 0.0` y `averageCost = 0.0` (`COST_PENDING`): la venta se ejecuta por el checkout normal de producción, emite factura consecutiva fiscal DGI, imprime viñeta térmica y persiste en SQLite Floor como `PAID`.
    - Resistencia ante cortes de energía: Se simula reinicio de terminal tras enriquecimiento de stock y costo, comprobando que `activation_attempts` y `first_successful_sale_claims` permanecen inmutables y en `ACTIVATED` (AC-40, AC-41).

---

# 2. Evidencia de Ejecución de Pruebas

### 2.1 Pruebas Unitarias de Adaptadores en `apps/admin_backend`
```bash
npm test -- src/modules/onboarding/adapters/inventory-readiness.adapter.spec.ts
npm test -- src/modules/onboarding/adapters/costing-readiness.adapter.spec.ts
npm test -- src/modules/onboarding/adapters/operations-readiness.adapter.spec.ts
npm test -- src/modules/onboarding/services/onboarding-readiness.evaluator.spec.ts
```
- `inventory-readiness.adapter.spec.ts`: 3 tests pasados.
- `costing-readiness.adapter.spec.ts`: 3 tests pasados.
- `operations-readiness.adapter.spec.ts`: 2 tests pasados.
- `onboarding-readiness.evaluator.spec.ts`: 3 tests pasados.
Total acumulado unitario onboarding: **29 suites, 194 tests pasados al 100%**.

### 2.2 Pruebas E2E de Base de Datos Real PostgreSQL (`apps/admin_backend`)
```bash
npm run test:e2e -- onboarding-readiness.db.e2e-spec.ts
```
- `runs complete lifecycle: starts SETUP_IN_PROGRESS -> transitions to SALE_READY on product addition -> reverts on product deactivation while preserving saleReadyFirstAt` -> **PASSED**.
- `guarantees tenant isolation: Tenant B does not observe Tenant A session or products` -> **PASSED**.
- `enforces granular RBAC permissions: CASHIER denied, MANAGER can read but cannot start, OWNER full access` -> **PASSED**.
- `demonstrates ONB1.9A–D Progressive BOH Readiness: tenant reaches SALE_READY with stock=0 and COST_PENDING, then advances to ACTIVATED and subsequent BOH enrichment does not modify activatedAt or revoke ACTIVATED (AC-07, AC-08, AC-40, AC-41)` -> **PASSED**.
Total: **4 tests pasados en PostgreSQL real**.

### 2.3 Pruebas Frontend en `apps/owner_dashboard` (Vitest)
```bash
npx vitest run src/__tests__/onboarding-boh-progressive-checklist.test.tsx
npx vitest run src/__tests__/onboarding-*.tsx src/__tests__/onboarding-*.ts src/__tests__/setup-center-view.test.tsx
```
- `onboarding-boh-progressive-checklist.test.tsx`: 1 test pasado.
- Total acumulado onboarding dashboard: **9 archivos de test, 37 tests pasados al 100%**.

### 2.4 Pruebas E2E en `apps/pos_app` con Floor SQLite en Disco y Memoria
```bash
flutter test test/integration/onb1_9_progressive_boh_readiness_e2e_test.dart
```
- `demonstrates AC-07 & AC-08: sellable product with stock=0 and averageCost=0 (COST_PENDING) completes sales & print lifecycle without blocking caja or failing inventory` -> **PASSED**.
- `demonstrates AC-40 & AC-41: subsequent BOH enrichment (adding stock, Kardex, and cost) preserves ACTIVATED state and TTFSS claim across SQLite restarts` -> **PASSED**.

Regresión acumulada completa de activación POS:
```bash
flutter test test/data/services/activation* test/integration/activation* test/integration/onb1_9*
```
Total acumulado: **65 tests pasados al 100% en 6 segundos**.

---

# 3. Matriz de Criterios de Aceptación Cumplidos

| Criterio PRD / Invariante | Estado | Evidencia |
|---|---|---|
| **AC-07 — BOH incompleto no bloquea** | **CUMPLIDO** | `onb1_9_progressive_boh_readiness_e2e_test.dart`, `onboarding-readiness.evaluator.spec.ts` |
| **AC-08 — Costo desconocido (COST_PENDING)** | **CUMPLIDO** | `costing-readiness.adapter.spec.ts`, `onboarding-readiness.db.e2e-spec.ts` |
| **AC-25 — Assisted BOH** | **CUMPLIDO** | `setup-center-view.tsx`, `onboarding-boh-progressive-checklist.test.tsx` |
| **AC-26 — Staff opcional** | **CUMPLIDO** | `operations-readiness.adapter.spec.ts` |
| **AC-40 — Inventory Ready posterior** | **CUMPLIDO** | `inventory-readiness.adapter.spec.ts`, `onb1_9_progressive_boh_readiness_e2e_test.dart` |
| **AC-41 — Costing Ready posterior** | **CUMPLIDO** | `costing-readiness.adapter.spec.ts`, `onboarding-readiness.db.e2e-spec.ts` |
| **AC-44 — No complex self-service imports** | **CUMPLIDO** | `setup-center-view.tsx` (links directos sin duplicación de wizards) |

---

# 4. Estado de Roadmap y Siguiente Slice

- **Fila 23 del Roadmap (`PR-ONB-22` / ONB1.9A–D)**: **100% CERRADO Y VERIFICADO**.
- **Siguiente Slice Inmediato**: **`PR-ONB-23`** (Fila 24 del Roadmap — ONB1.9E–G: Telemetry catalogue, Audit vs Telemetry separation, First Customer Sale observation).
