# NHILOS Client Onboarding V1 — M5 Evidence Receipt: PR-ONB-18 (ONB1.7D–F)

**Documento:** `ONB1.7_M5_PR18_EVIDENCE.md`  
**Ubicación:** `docs/onboarding/evidence/ONB1.7_M5_PR18_EVIDENCE.md`  
**Slices cubiertos:** `ONB1.7D`, `ONB1.7E`, `ONB1.7F`  
**Fecha de ejecución:** 2026-09-04  
**Branch:** `feat/backoffice-spa`  
**Metodología:** TDD estricto -> Triangulación -> Integración (PostgreSQL real & TypeORM) -> E2E con Supertest sin mocks de persistencia.

---

# 1. Resumen de Entregables Físicos

### 1.1 ONB1.7D–E — Background Convergence Reconciler (`apps/admin_backend`)
- **Auto-cierre de Follow-up de Convergencia**:
  - `ActivationService.reconcileFollowUpConvergence`: escanea follow-ups abiertos (`ActivationFollowUpStatus.OPEN`) y evalúa si la evidencia de convergencia post-reconexión se ha materializado.
  - Verifica si `POST_RECONNECT_SYNC` transicionó a `PASS` o si existe ticket verificado en persistencia real de ventas.
  - Cierra el follow-up con:
    - `status = ActivationFollowUpStatus.CLOSED`
    - `closedAt = new Date()`
    - `closedBy = 'SYSTEM_RECONCILER'`
    - `closureEvidenceRef = ...`
    - `closureNote = 'Automated background convergence completed without operator intervention'`
  - **Invariante Crítico Normativo**: `session.activatedAt` **permanece inalterado**. La fecha de activación no se muta en ningún momento durante o después del cierre del follow-up.
- **Endpoint de Reconciliación**:
  - `POST /api/onboarding/activation/reconcile-convergence`
  - Protegido con `AppPermission.ONBOARDING_ACTIVATION_MANAGE`.

### 1.2 ONB1.7F — Soporte para Auditoría / ChangeLog Integration (`apps/admin_backend`)
- **Integración con `ChangeLogService`**:
  - `ONBOARDING_ACTIVATION_ATTEMPT_STARTED`: emitido al iniciar el attempt con pinning de revisiones y timestamps ancla.
  - `ONBOARDING_ACTIVATION_CHECK_FAILED`: emitido ante cualquier fallo material en la ingesta de checks.
  - `ONBOARDING_ACTIVATION_FINALIZED`: emitido al finalizar el attempt con su estado (`PASS`, `PASS_WITH_WARNING`, `FAIL`), código de fallo y conteo de warnings.
  - `ONBOARDING_ACTIVATION_FOLLOW_UP_OPENED`: emitido al crear un warning follow-up bajo `PASS_WITH_WARNING`.
  - `ONBOARDING_ACTIVATION_FOLLOW_UP_CLOSED`: emitido al cerrar el follow-up tanto manualmente como por el reconciliador de fondo.
  - `ONBOARDING_ACTIVATION_SUPPORT_OVERRIDE`: emitido al ejecutar una intervención o soporte administrativo.
  - **Invariante de Seguridad**: Cero secretos, tokens o credenciales registradas en las cargas útiles de auditoría.

### 1.3 ONB1.7F — Support Overrides & Diagnostic Controls (`apps/admin_backend`)
- **Support Overrides**:
  - Endpoint `POST /api/onboarding/activation/attempts/:id/support-override`.
  - Protegido por permiso granular `onboarding:support:assist` (`AppPermission.ONBOARDING_SUPPORT_ASSIST`).
  - Validación estricta: requiere `reason` sustantivo de al menos 10 caracteres (`INVALID_OVERRIDE_REASON`).
  - Soporte de acciones:
    - `FORCE_FAIL`: termina el intento en `FAIL` con código `SUPPORT_OVERRIDE_FAIL` y revierte la sesión a `SALE_READY` o `SETUP_IN_PROGRESS` según el readiness evaluado en vivo.
    - `DISMISS_WARNING`: resuelve y cierra los follow-ups abiertos bajo auditoría de soporte sin degradar el estado `ACTIVATED`.
    - `RECORD_DIAGNOSTIC_ASSIST`: registra nota de asistencia técnica sin mutar el attempt.
- **Diagnostic Controls**:
  - Endpoint `GET /api/onboarding/activation/attempts/:id/diagnostics`.
  - Protegido por `AppPermission.ONBOARDING_READ`.
  - Retorna matriz exhaustiva de los 10 checks mandatorios (presentes vs faltantes, status, timestamps, evidencia sanitizada), estado de la sesión, follow-ups abiertos/cerrados, evaluación en vivo de readiness y trazabilidad de change logs.

---

# 2. Evidencia de Ejecución de Pruebas

### 2.1 Unit & Triangulation Suites (`npm test`)
```bash
npm test -- --testPathPattern="activation"
```
- `1800000000000-CreateActivationCoreTables.spec.ts`: 2 tests passed.
- `activation-entities.spec.ts`: 3 tests passed.
- `activation.service.spec.ts`: 28 tests passed (incluyendo validaciones de reconciliación de convergencia, invariante de `activatedAt` inmutable, validaciones de support override y diagnósticos).
- `activation.controller.spec.ts`: 8 tests passed (delegación de endpoints de reconcile-convergence, support-override y diagnostics).
Total: 41 unit tests passed.

### 2.2 PostgreSQL Real Persistence Suite (`npm run test:db`)
```bash
npm run test:db -- --testPathPattern="activation.service.db.spec.ts"
```
- `activation.service.db.spec.ts` (esquema aislado en base de datos real PostgreSQL):
  - **Test 1**: ONB1.7A: StartActivation y pinning con constraint de intento activo único.
  - **Test 2**: ONB1.7C: PASS_WITH_WARNING con persistencia de follow-up y FAIL con reversión.
  - **Test 3**: ONB1.7D–F: Background convergence reconciler cerrando `ActivationFollowUp` en PostgreSQL como `SYSTEM_RECONCILER` sin alterar `activatedAt`, registro de `ChangeLog` real en PostgreSQL, support override y diagnóstico de 10 checks.
Total: 3 suites con persistencia real en PostgreSQL pasadas.

### 2.3 Supertest HTTP & E2E Suite (`npm run test:e2e`)
```bash
npm run test:e2e -- --testPathPattern="activation-flow"
```
- `test/onboarding/activation-flow.db.e2e-spec.ts` (Supertest sobre NestJS con PostgreSQL real):
  - Test 1: Control de acceso RBAC — rechaza solicitud sin permiso (403).
  - Test 2: ONB1.7A StartActivation — crea attempt y transiciona sesión.
  - Test 3: Invariante de intento activo único — rechaza concurrencia (400/409).
  - Test 4: ONB1.7B Ingest Check — rechaza forja declarativa contra DevicePrincipal (403).
  - Test 5: ONB1.7B Ingest Check — rechaza WARNING en checks locales (400).
  - Test 6: ONB1.7B Ingest Check — acepta check legítimo e idempotencia.
  - Test 7: ONB1.7C Finalizer — FAIL ante checks incompletos.
  - Test 8: ONB1.7C Retry post-FAIL — completa 10 checks y alcanza ACTIVATED.
  - Test 9: ONB1.7C PASS_WITH_WARNING & manual follow-up close.
  - Test 10: ONB1.7D–E Background Convergence Reconciler — auto-cierra follow-up tras convergencia sin mutar `activatedAt`.
  - Test 11: ONB1.7F Support Overrides — control de acceso RBAC con permiso `onboarding:support:assist`, validación de razón (>=10 chars) y persistencia de auditoría en DB.
  - Test 12: ONB1.7F Diagnostic Controls — endpoint GET diagnostics con matriz de checks completa y audit trail.
Total: 12 tests E2E con PostgreSQL real y Supertest pasados.

---

# 3. Gate de Salida y Criterios de Aceptación Verificados

| Criterio | Estado | Evidencia |
|---|---|---|
| Reconciliador de convergencia auto-cierra `ActivationFollowUp` cuando se corrobora convergencia | **CUMPLIDO** | `activation.service.db.spec.ts`, `activation-flow.db.e2e-spec.ts` (Test 10) |
| Cerrar `ActivationFollowUp` (manual o reconciliador) **no modifica** `activatedAt` | **CUMPLIDO** | Invariante verificado en Unit, DB e E2E |
| `ChangeLogService` audita attempt started, check failure, finalization, follow-up y overrides | **CUMPLIDO** | Trazabilidad en PostgreSQL en `activation.service.db.spec.ts` |
| Support override exige permiso granular `onboarding.support.assist` y razón sustantiva (>=10 chars) | **CUMPLIDO** | `activation.service.spec.ts`, `activation-flow.db.e2e-spec.ts` (Test 11) |
| Diagnósticos consolidan matriz de 10 checks, faltantes, follow-ups, readiness y auditoría | **CUMPLIDO** | `activation-flow.db.e2e-spec.ts` (Test 12) |
| Persistencia real en PostgreSQL sin mocks de base de datos | **CUMPLIDO** | 100% de suites DB y E2E ejecutadas contra PostgreSQL en esquemas aislados |
