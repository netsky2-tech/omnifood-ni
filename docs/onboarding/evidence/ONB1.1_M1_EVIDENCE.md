# NHILOS Client Onboarding V1 — M1 Evidence Receipt (ONB1.1)

**Documento:** `ONB1.1_M1_EVIDENCE.md`  
**Ubicación:** `docs/onboarding/evidence/ONB1.1_M1_EVIDENCE.md`  
**Slices cubiertos:** `PR-ONB-02`, `PR-ONB-03`, `PR-ONB-04`, `PR-ONB-05` (`ONB1.1A` .. `ONB1.1H`)  
**Fecha de ejecución:** 2026-09-03  
**Branch:** `feat/backoffice-spa`  
**Metodología:** TDD estricto -> Triangulación -> Integración -> E2E sobre PostgreSQL real sin mocks.  

---

# 1. Resumen de Entregables Físicos

### 1.1 Persistencia y Migraciones
- `apps/admin_backend/src/modules/onboarding/entities/onboarding-session.entity.ts`:
  - Aggregate Root con `tenant_id` unique, `optimisticVersion`, state machine y timestamps *write-once*.
- `apps/admin_backend/src/modules/onboarding/entities/onboarding-idempotency.entity.ts`:
  - Registro de idempotencia con unique constraint física `(tenant_id, idempotency_key)`, `payloadHash`, lease owner y lease expiry.
- `apps/admin_backend/src/migrations/1796000000000-CreateOnboardingCoreTables.ts`:
  - Migración TypeORM para creación y rollback de tablas e índices.
- `apps/admin_backend/src/migrations/1796000000000-CreateOnboardingCoreTables.spec.ts`:
  - Test unitario de migración (up/down).

### 1.2 Control Plane & Readiness Ports
- `apps/admin_backend/src/modules/onboarding/services/onboarding-session.service.ts`:
  - `ensureOnboardingStarted`: inicio idempotente, protección contra race conditions y respeto estricto de milestones write-once.
  - `updateSessionWithOptimisticLock`: bloqueo optimista previniendo *lost updates* vía error 409 `VERSION_CONFLICT`.
- `apps/admin_backend/src/modules/onboarding/ports/`:
  - `identity-readiness.port.ts`, `fiscal-readiness.port.ts`, `catalog-readiness.port.ts`.
- `apps/admin_backend/src/modules/onboarding/adapters/`:
  - `identity-readiness.adapter.ts`, `fiscal-readiness.adapter.ts`, `catalog-readiness.adapter.ts`.
- `apps/admin_backend/src/modules/onboarding/services/onboarding-readiness.evaluator.ts`:
  - Evaluación desacoplada de `SALE_READY` contra el estado real de los bounded contexts.
- `apps/admin_backend/src/modules/onboarding/services/onboarding-state.reconciler.ts`:
  - Reconciliación de estado: `saleReadyFirstAt` inmutable; reversión dinámica a `SETUP_IN_PROGRESS` si se desactivan productos; estado `ACTIVATED` monotónico.
- `apps/admin_backend/src/modules/onboarding/services/onboarding-idempotency.coordinator.ts`:
  - Máquina de estados (`IN_PROGRESS`, `SUCCEEDED`, `FAILED_RETRYABLE`, `FAILED_FINAL`), detección de `INTEGRITY_CONFLICT` y recuperación de lease expirado.

### 1.3 HTTP APIs & RBAC
- `apps/admin_backend/src/modules/onboarding/controllers/onboarding-session.controller.ts`:
  - `POST /onboarding/session/start` (requiere `onboarding:start`, rol `OWNER`).
  - `GET /onboarding/session` (requiere `onboarding:read`, roles `OWNER`, `MANAGER`).
  - `GET /onboarding/readiness` (requiere `onboarding:read`, roles `OWNER`, `MANAGER`).
- `apps/admin_backend/src/modules/identity/security/permissions.enum.ts`:
  - Permisos granulares `ONBOARDING_*` integrados en la matriz RBAC.

---

# 2. Evidencia de Ejecución de Pruebas

### 2.1 Backend E2E Tests (PostgreSQL Real)
Comando ejecutado:
```bash
npm --prefix apps/admin_backend run test:e2e -- --testPathPattern="onboarding"
```

**Resultado:**
- `test/onboarding/onboarding-idempotency.db.e2e-spec.ts` — PASS (3/3 tests)
  - Full lease lifecycle: acquire -> lockeo concurrente -> complete -> replay cached result.
  - Reclamo de lease expirado tras caída de worker con incremento de `attemptCount`.
  - Detección de `VERSION_CONFLICT` con optimistic lock.
- `test/onboarding/onboarding-session.db.e2e-spec.ts` — PASS (4/4 tests)
  - Sesión única primaria y `onboardingStartedAt` write-once.
  - Aislamiento multi-tenant entre Tenant A y Tenant B.
  - Tolerancia a carreras concurrentes de inicio.
  - Constraint física unique en `(tenant_id, idempotency_key)`.
- `test/onboarding/onboarding-readiness.db.e2e-spec.ts` — PASS (3/3 tests)
  - Ciclo completo de lifecycle: `SETUP_IN_PROGRESS` -> `SALE_READY` al insertar producto -> reversión a `SETUP_IN_PROGRESS` al desactivar producto con preservación de `saleReadyFirstAt`.
  - Aislamiento estricto de catálogo y sesión entre tenants.
  - Control de acceso RBAC granular: CASHIER denegado (403), MANAGER solo lectura, OWNER acceso completo.
- `test/onboarding/import-staging.e2e-spec.ts` — PASS
- `test/onboarding/fiscal-setup.e2e-spec.ts` — PASS
- `test/onboarding/industry-template.e2e-spec.ts` — PASS
- `test/onboarding/onboarding-w9.db.e2e-spec.ts` — PASS

**Total E2E:** 7 suites pasadas, 42 tests verdes.

### 2.2 Backend Unit Tests
Comando ejecutado:
```bash
npm --prefix apps/admin_backend test -- --testPathPattern="onboarding"
```
**Total Unitario:** 13 suites pasadas, 67 tests verdes.

### 2.3 Frontend Owner Dashboard Tests
Comando ejecutado:
```bash
npm --prefix apps/owner_dashboard test -- --run
```
**Total Frontend:** 25 suites pasadas, 476 tests verdes.

---

# 3. Estado de Salida

- [x] ONB1.0 cerrado (`ONB1.0A` y `ONB1.0B`).
- [x] ONB1.1 cerrado (`ONB1.1A` .. `ONB1.1H`).
- [x] Cero mocks en tests de persistencia y concurrencia.
- [x] Sistema listo para la fase **ONB1.2 — State-based Setup Center Foundation (M2)**.
