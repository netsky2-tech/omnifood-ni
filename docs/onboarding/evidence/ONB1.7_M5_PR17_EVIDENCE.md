# NHILOS Client Onboarding V1 — M5 Evidence Receipt: PR-ONB-17 (ONB1.7A–C)

**Documento:** `ONB1.7_M5_PR17_EVIDENCE.md`  
**Ubicación:** `docs/onboarding/evidence/ONB1.7_M5_PR17_EVIDENCE.md`  
**Slices cubiertos:** `ONB1.7A`, `ONB1.7B`, `ONB1.7C`  
**Fecha de ejecución:** 2026-09-04  
**Branch:** `feat/backoffice-spa`  
**Metodología:** TDD estricto -> Triangulación -> Integración (PostgreSQL real & TypeORM) -> E2E con Supertest sin mocks de persistencia.

---

# 1. Resumen de Entregables Físicos

### 1.1 ONB1.7A — StartActivation Command & Precondiciones (`apps/admin_backend`)
- **Precondición Estricta Normativa**:
  - `SALE_READY=true`: Sesión de onboarding debe encontrarse en estado `SALE_READY`. Cualquier otro estado rechaza la invocación con `BadRequestException` (`CANNOT_START_ACTIVATION_NOT_SALE_READY`).
  - Permiso `onboarding.activation.manage` (`AppPermission.ONBOARDING_ACTIVATION_MANAGE`) requerido a nivel de controller y guard.
  - Terminal candidato asignable y no vacío (`candidateTerminalId`).
  - No existencia de otro attempt activo: verifica tanto a nivel de aplicación como mediante constraint física en PostgreSQL que no exista un intento previo en estado `CREATED` o `IN_PROGRESS` para el mismo tenant y sesión (`ConflictException: ACTIVE_ATTEMPT_EXISTS`).
- **Entidad `ActivationAttempt` & Pinning Inmutable**:
  - Pinnea de forma inmutable los parámetros clave del control plane:
    - `requiredFiscalRevision`: Revisión fiscal vigente del tenant.
    - `requiredFiscalFingerprint`: SHA-256 canónico RFC-8785 (JCS) de la configuración fiscal.
    - `verificationProductId`: ID del producto candidato vendible resuelto para el tenant.
    - `verificationProductRevision`: Versión del producto (1).
    - `verificationProductFingerprint`: SHA-256 canónico determinista del producto.
    - `candidateTerminalId`: Terminal candidato asignado para la prueba.
    - `serverTimeAnchorAt`: Timestamp autoritativo emitido por el backend como ancla temporal.
- **Transición de Estado de Sesión**:
  - La sesión pasa a `lifecycleState = ACTIVATION_IN_PROGRESS`.
  - Se vincula `currentActivationAttemptId = attempt.id`.
  - Se fija `activationStartedAt = COALESCE(activationStartedAt, now)`.
  - Idempotencia integrada para reintentos con la misma `idempotencyKey`.

### 1.2 ONB1.7B — Activation Check / Evidence Ingestion (`apps/admin_backend`)
- **DevicePrincipal Trust Boundary**:
  - Contexto de dispositivo autenticado autoritativo (`DevicePrincipal: { tenantId, terminalId }`).
  - Detección de forja declarativa: si el payload recibido incluye `declarativeTenantId` o `declarativeTerminalId` contradictorios con el `DevicePrincipal`, se rechaza de inmediato con `ForbiddenException` (`DEVICE_PRINCIPAL_FORGERY_DETECTED`).
  - Mismatch de terminal candidato: si el `DevicePrincipal.terminalId` no coincide con el `candidateTerminalId` del attempt, la ingestión es bloqueada con `ForbiddenException`.
  - Ingesta bloqueada en attempts completados: una vez en `PASS`, `PASS_WITH_WARNING` o `FAIL`, no se admiten checks adicionales (`ConflictException: ATTEMPT_ALREADY_COMPLETED`).
- **Constraint de Unicidad e Idempotencia**:
  - `UNIQUE (tenant_id, activation_attempt_id, check_code)`.
  - Reenvíos con mismo status y detalles son absorbidos idempotentemente sin duplicación.
  - Conflicto de integridad: si se intenta sobrescribir un check ya evaluado con un status contradictorio, se emite `ConflictException` (`INTEGRITY_CONFLICT`).
- **Materialización de Terminal Confiable**:
  - Con el primer check legítimo se fija `trustedTerminalId = DevicePrincipal.terminalId` y el attempt avanza de `CREATED` a `IN_PROGRESS`.

### 1.3 ONB1.7C — Check Catalogue & Backend Finalizer (`apps/admin_backend`)
- **Catálogo de Checks V1 Congelado**:
  - Los 10 checks mandatorios del fundador:
    1. `TERMINAL_LINKED`
    2. `REQUIRED_CONFIG_LOCAL`
    3. `AUTHORIZED_USER_LOCAL`
    4. `PRINTER_AVAILABLE`
    5. `TEST_PRINT`
    6. `SQLITE_DURABILITY`
    7. `OFFLINE_SALE_PAID`
    8. `SALE_RECEIPT_PATH`
    9. `OUTBOX_DURABLE`
    10. `POST_RECONNECT_SYNC`
  - Restricción de estado: Todos los checks excepto `POST_RECONNECT_SYNC` aceptan únicamente `PASS | FAIL`. Cualquier envío de `WARNING` en checks locales es rechazado con `BadRequestException`.
- **Backend Finalizer Autoritativo Cloud-Only**:
  - El POS no puede emitir un resultado `PASS` autoritativo por endpoint. El backend deriva el resultado exclusivamente evaluando la evidencia persistida en PostgreSQL.
  - **Truth Table Normativa**:
    - **`PASS`**: Todos los checks requeridos registrados con status `PASS`. Attempt transiciona a `PASS` con `completedAt`. Sesión transiciona a `ACTIVATED` y fija `activatedAt = COALESCE(activatedAt, completedAt)`.
    - **`PASS_WITH_WARNING`**: Los 9 checks previos son `PASS` y `POST_RECONNECT_SYNC` es `WARNING` por causas externas/transitorias. Attempt transiciona a `PASS_WITH_WARNING`, se crea un registro `ActivationFollowUp(OPEN)`, y la sesión transiciona a `ACTIVATED` fijando `activatedAt`.
    - **`FAIL`**: Checks incompletos o checks con status `FAIL`. Attempt pasa a `FAIL` con `failureCode`. El attempt deja de estar activo liberando el índice parcial para nuevos intentos. Se re-evalúa `OnboardingReadinessEvaluator`: si el tenant continúa siendo sale-ready, la sesión retorna a `SALE_READY`; en caso contrario a `SETUP_IN_PROGRESS`. `activatedAt` permanece inalterado (`null`).
  - **Follow-up Lifecycle**:
    - Endpoints `GET /onboarding/activation/attempts/:id/follow-ups` y `POST /onboarding/activation/follow-ups/:followUpId/close`.
    - Cerrar el follow-up posteriormente no altera `activatedAt`.

### 1.4 Migración de Base de Datos
- `CreateActivationCoreTables1800000000000` (`1800000000000-CreateActivationCoreTables.ts`):
  - Tabla `onboarding_activation_attempts` con RLS e índice único condicional:
    `CREATE UNIQUE INDEX idx_onboarding_activation_attempts_single_active ON onboarding_activation_attempts (tenant_id, onboarding_session_id) WHERE status IN ('CREATED', 'IN_PROGRESS');`
  - Tabla `onboarding_activation_check_results` con RLS y constraint:
    `UNIQUE (tenant_id, activation_attempt_id, check_code)`
  - Tabla `onboarding_activation_follow_ups` con RLS y constraint:
    `UNIQUE (tenant_id, activation_attempt_id, warning_code)`

---

# 2. Evidencia de Ejecución de Pruebas

### 2.1 Unit & Triangulation Suites (`npm test`)
```bash
npm test -- --testPathPattern="(activation|1800000000000)"
```
- `1800000000000-CreateActivationCoreTables.spec.ts`: 2 tests passed (up & down migration verification).
- `activation-entities.spec.ts`: 3 tests passed (instantiation, default values, enums).
- `activation.service.spec.ts`: 19 tests passed:
  - ONB1.7A: validaciones de entrada, precondición estricta `SALE_READY`, constraint de intento activo único, pinning de revisiones y fingerprint, triangulación con id custom e idempotency replay.
  - ONB1.7B: detección de forja contra `DevicePrincipal`, mismatch de terminal, validación de attempt terminalizado, rechazo de `WARNING` en checks locales, materialización de `trustedTerminalId`, avance a `IN_PROGRESS`, idempotencia e `INTEGRITY_CONFLICT`.
  - ONB1.7C: evaluación de catálogo completo `PASS`, `PASS_WITH_WARNING` con `ActivationFollowUp`, `FAIL` por check fallido o evidencia incompleta con reversión a `SALE_READY`, e idempotencia en finalizer.
- `activation.controller.spec.ts`: 5 tests passed (delegación de start, get, active, ingest con `DevicePrincipal`, finalize authoritative y follow-ups).
Total: 29 unit tests passed.

### 2.2 PostgreSQL Real Persistence Suite (`npm run test:db`)
```bash
npm run test:db -- --testPathPattern="activation.service.db.spec.ts"
```
- `activation.service.db.spec.ts` (esquema aislado en base de datos real PostgreSQL):
  - **Test 1**: Ejecuta `startActivation` con pinning real de revisiones fiscales y producto, verifica transición de sesión en PostgreSQL, verifica rechazo estricto de intento concurrente por constraint física condicional de PostgreSQL. Ingesta checks con persistencia real y verifica idempotencia e `INTEGRITY_CONFLICT`. Completa los 10 checks y finaliza autoritativamente en `PASS`, transicionando la sesión a `ACTIVATED` con `activatedAt` persistido en base de datos real.
  - **Test 2**: Ejecuta escenario `FAIL`, persistiendo el fallo, revirtiendo la sesión a `SALE_READY` y comprobando que la constraint condicional queda liberada en PostgreSQL para iniciar un segundo intento. Luego ejecuta `PASS_WITH_WARNING`, creando el registro `ActivationFollowUp` en la base de datos real y cerrándolo vía `closeFollowUp` sin alterar `activatedAt`.
Total: 2 suites con persistencia real en PostgreSQL pasadas.

### 2.3 Supertest HTTP & E2E Suite (`npm run test:e2e`)
```bash
npm run test:e2e -- --testPathPattern="activation-flow"
```
- `test/onboarding/activation-flow.db.e2e-spec.ts` (Supertest sobre NestJS con PostgreSQL real):
  - Test 1: Control de acceso RBAC — rechaza solicitud sin permiso `onboarding.activation.manage` (403).
  - Test 2: ONB1.7A `POST /api/onboarding/activation/attempts` crea attempt (201), pinnea revisiones y actualiza sesión a `ACTIVATION_IN_PROGRESS`.
  - Test 3: Constraint de intento activo único — rechaza segundo attempt concurrente (400/409).
  - Test 4: ONB1.7B Ingest Check — rechaza forja declarativa de tenant o terminal (403).
  - Test 5: ONB1.7B Ingest Check — rechaza status `WARNING` para checks locales (400).
  - Test 6: ONB1.7B Ingest Check — acepta check legítimo (201) y valida idempotencia en PostgreSQL.
  - Test 7: ONB1.7C Finalizer — finalización con checks incompletos evalúa a `FAIL` (201) y retorna sesión a `SALE_READY`.
  - Test 8: ONB1.7C Retrying post-FAIL — inicia segundo intento tras el fallo, ingesta los 10 checks mandatorios y finaliza autoritativamente en `PASS`, transicionando la sesión a `ACTIVATED` en PostgreSQL.
  - Test 9: ONB1.7C `PASS_WITH_WARNING` & Follow-up Lifecycle — finaliza con `PASS_WITH_WARNING`, consulta el follow-up generado y lo cierra mediante endpoint sin mutar `activatedAt`.
Total: 9 tests E2E con PostgreSQL real y Supertest pasados.

---

# 3. Gate de Salida y Criterios de Aceptación Verificados

| Criterio | Estado | Evidencia |
|---|---|---|
| `StartActivation` valida `SALE_READY=true` y permiso `onboarding.activation.manage` | **CUMPLIDO** | `activation.service.spec.ts`, `activation-flow.db.e2e-spec.ts` |
| Pinning inmutable de revisiones fiscales, fingerprints y producto | **CUMPLIDO** | `ActivationAttempt` entity, `activation.service.db.spec.ts` |
| Constraint física de intento activo único (`CREATED`, `IN_PROGRESS`) | **CUMPLIDO** | Partial index en migración `1800000000000`, test de concurrencia |
| DevicePrincipal trust boundary e inmunidad a forja declarativa | **CUMPLIDO** | Detección de mismatch en `ingestCheck` con 403 |
| Constraint `UNIQUE (tenant_id, activation_attempt_id, check_code)` | **CUMPLIDO** | Constraint de migración e idempotencia/conflict tests |
| Catálogo V1 normativo: solo `POST_RECONNECT_SYNC` admite `WARNING` | **CUMPLIDO** | Validación estricta en `ingestCheck` |
| Finalización autoritativa cloud-only (sin aceptación de `result=PASS` de cliente) | **CUMPLIDO** | `finalizeActivation` deriva exclusivamente de checks persistidos |
| `PASS` transiciona atómicamente a `ACTIVATED` y fija `activatedAt` | **CUMPLIDO** | Transacción TypeORM en `finalizeActivation` |
| `PASS_WITH_WARNING` genera `ActivationFollowUp` persistente | **CUMPLIDO** | `ActivationFollowUp` entity & DB/E2E tests |
| Intento `FAIL` libera constraint activa y retorna lifecycle a `SALE_READY` | **CUMPLIDO** | `activation.service.db.spec.ts`, `activation-flow.db.e2e-spec.ts` |
| Multi-tenant isolation & RLS en todas las nuevas tablas de activation | **CUMPLIDO** | RLS habilitado en migración `1800000000000` y tests multi-tenant |
