# NHILOS Client Onboarding V1 — Evidence Receipt: PR-ONB-24 (ONB1.10A–C)

**Documento:** `ONB1.10_M8_PR24_EVIDENCE.md`  
**Ubicación:** `docs/onboarding/evidence/ONB1.10_M8_PR24_EVIDENCE.md`  
**Slices cubiertos:** `ONB1.10A`, `ONB1.10B`, `ONB1.10C` (Fila 25 del Roadmap Onboarding V1)  
**Hito:** Milestone 8 — Hardening, Legacy Reconciliation & Security Closure  
**Fecha de ejecución:** 2026-09-04  
**Branch:** `feat/backoffice-spa`  
**Metodología:** TDD estricto -> Triangulación -> Integración (PostgreSQL real en backend, Floor SQLite real en disco y memoria en POS) -> E2E local sin mocks inventados.

---

# 1. Resumen de Entregables Físicos

### 1.1 ONB1.10A — Cierre Formal de Reconciliación de Migración
- **Receipts de Migración Consolidados (`LegacyOnboardingMigrationReceipt`)**:
  - Ampliación del enum `LegacyMigrationDecision` con los veredictos formales de cierre:
    - `REMEDIATED`: Cierre estricto mediante referencia a comando del dominio Inventory (`Adjustment/OpeningBalance` o Kardex).
    - `ACCEPTED_AS_IS`: Cierre auditado con justificación sustantiva (>= 10 caracteres) para discrepancias inmateriales aceptadas por finanzas o auditoría.
    - `LEGACY_BASELINE_CLOSED`: Reconciliación formal de tenants históricos (`legacyBaseline = true`, `measurementEligible = false`).
- **Servicio Forense de Integridad (`LegacyImportIntegrityReportService`)**:
  - `remediateReportWithInventoryCommand`: Verifica la existencia del reporte en estado `REVIEW_REQUIRED`, anexa `inventoryCommandRef` a `remediation_refs`, transiciona el estado a `REMEDIATED` y emite `LegacyOnboardingMigrationReceipt` de tipo `LEGACY_IMPORT_REMEDIATION`.
  - **Invariante Crítico Normativo (Regla 72 & AC-39)**: Onboarding **NUNCA** modifica stock o CPP directamente vía `UPDATE` ad-hoc de SQL; la única vía de remediación admitida es un comando de Inventory registrado con trazabilidad Kardex.
  - `acceptReportAsIs`: Transiciona el estado a `ACCEPTED_AS_IS` y persiste el receipt `LEGACY_IMPORT_ACCEPT_AS_IS` con la justificación auditada.
  - `reconcileLegacyBaselineSession`: Cierra formalmente la sesión legacy manteniendo `measurementEligible = false`.
  - **Invariante Crítico Inmutable (Regla 73, AC-56)**: Tenants legacy sin evidencia de inicio confiable **NUNCA** reciben un TTFSS (`firstSuccessfulSaleAt`) inventado o sintetizado, asegurando que las métricas de benchmark del Acceptance Plan (AP-A02) no sufran contaminación.
- **Exposición en Controladores Backend**:
  - `POST /onboarding/import/integrity-reports/:id/remediate` (`ImportStagingController`).
  - `POST /onboarding/import/integrity-reports/:id/accept-as-is` (`ImportStagingController`).
  - `POST /onboarding/session/legacy-baseline/reconcile` (`OnboardingSessionController`).

### 1.2 ONB1.10B — Suite de Inyección de Fallos (Fault Injection Suite)
- **Backend E2E en PostgreSQL Real (`apps/admin_backend/test/onboarding/onboarding-fault-injection.db.e2e-spec.ts`)**:
  - **HTTP timeout after commit**: Simulación de corte de red en capa de transporte justo después de que la transacción de base de datos comiteó. El cliente reintenta con la misma `idempotencyKey` y payload; el coordinador responde inmediatamente `ALREADY_COMPLETED` con el resultado en caché, sin duplicar registros ni volver a ejecutar la lógica de negocio.
  - **Comandos concurrentes duplicados**: Dos peticiones idénticas concurrentes mientras el lease está `IN_PROGRESS`; la segunda es rechazada con `409 Conflict`.
  - **Mismo idempotency key con payload divergente (`INTEGRITY_CONFLICT`)**: Rechazo inmediato mediante `ConflictException` por disparidad en el hash SHA-256 de la carga.
  - **Stale lease takeover**: Un worker adquiere un lease con TTL corto y crashea. Un worker de failover detecta la expiración del lease, asume la propiedad, incrementa `attemptCount` y completa la operación con éxito.
  - **Crash / Rollback antes del commit de la Unit of Work**: Falla imprevista en medio de la transacción; PostgreSQL ejecuta `ROLLBACK` completo (0 entidades persistidas) y libera el lease para reintento limpio.
  - **Crash después del commit de la Unit of Work**: La transacción comitea en PostgreSQL antes de un fallo en el servidor web; en el siguiente reintento del cliente, el coordinador devuelve `ALREADY_COMPLETED` preservando la integridad de los datos.
  - **Reintento de chunks de carga CSV**: Re-subida de chunks tras timeout de red; el servicio detecta y preserva la secuencia de filas (`row_ordinal`) sin duplicar staging.
- **POS App E2E en Floor SQLite Real en Disco (`apps/pos_app/test/integration/activation_fault_injection_e2e_test.dart`)**:
  - **Reinicio de terminal POS en medio de Activación**: Apagón / corte de energía simulado cerrando la base de datos Floor SQLite en disco. Al reiniciar el proceso POS y reabrir el archivo de base de datos real, el attempt y su configuración requerida se cargan intactos en estado `ASSIGNED`/`IN_PROGRESS`, permitiendo reanudación sin pérdida de estado.
  - **Corte de red WAN y caída de nube durante finalización**: Tras emitir la venta de verificación offline y registrar el claim TTFSS, la red simula una caída (error 503 / timeout). El runner marca el intento como `SYNC_VERIFICATION_PENDING`, mantiene el ticket emitido y el claim en el outbox SQLite de disco intactos, y NO cancela la venta offline. Al restablecer la nube, el outbox se sincroniza y el POS avanza a `ACTIVATED`.
  - **Saltos bruscos de reloj (Clock Skew / Clock Jumps)**: Manipulación intencional del reloj de pared hacia atrás (2 horas en el pasado) o hacia adelante; `ActivationClockManager` detecta el desvío frente al reloj monotónico, degrada `clockConfidence` a `DEGRADED`, y asegura que `anchoredOccurredAt` se mantenga monótonamente creciente.
  - **Reintento de envío de outbox duplicado**: La política `OnConflictStrategy.ignore` en los DAOs de Floor SQLite previene corrupción o registros duplicados ante reintentos de red.

### 1.3 ONB1.10C — Hardening de Seguridad y Aislamiento Multi-Tenant
- **Backend E2E en PostgreSQL Real (`apps/admin_backend/test/onboarding/onboarding-security-isolation.db.e2e-spec.ts`)**:
  - **Aislamiento fail-closed de Tenant ID (Regla 61, AC-38)**: Tenant B con credenciales válidas jamás puede leer, consultar, modificar ni comitear sesiones, catálogos, importaciones o activaciones de Tenant A.
  - **Protección contra manipulación de Tenant en Query o Body (Regla 62)**: Si un atacante inyecta `?tenant_id=<tenant_a_id>` o `{ tenantId: tenant_a_id }`, los controladores e interceptores extraen el tenant exclusivamente del JWT autenticado (`req.user.tenantId`), descartando completamente los parámetros fraudulentos.
  - **Fallo Fail-Closed ante contexto de Tenant ausente (Regla 61)**: Peticiones sin token o con JWT huérfano sin `tenant_id` son rechazadas inmediatamente con `401 Unauthorized`.
  - **Enforcement estricto de permisos granulares RBAC (Regla 64)**:
    - `CASHIER`: Rechazado con `403 Forbidden` en todos los endpoints administrativos de Onboarding (`/session/start`, `/import/*`, `/activation/*`).
    - `MANAGER`: Acceso de sólo lectura (`onboarding:read`) a sesiones y readiness (`200 OK`), pero bloqueado para iniciar onboarding o ejecutar mutaciones destructivas (`403 Forbidden`).
    - `OWNER`: Control total.
  - **Protección contra suplantación de terminal (`DevicePrincipal` Forgery, Regla 63)**:
    - Peticiones declarando un `tenantId` o `terminalId` dispar al `DevicePrincipal` autenticado son rechazadas con `403 Forbidden` (`DEVICE_PRINCIPAL_FORGERY_DETECTED`).
    - Peticiones con token de terminal perteneciente a otro tenant son bloqueadas en frontera de aislamiento (`404 Not Found` o `403 Forbidden`).
    - Terminales dispares a la candidata asignada al intento son rechazadas con `403 Forbidden` (`TERMINAL_MISMATCH`).
  - **Intervención de Soporte L2/L3 auditada (Regla 65)**:
    - Las acciones de soporte (`/activation/attempts/:id/support-override`) exigen razón sustantiva de al menos 10 caracteres (`400 Bad Request` si es insuficiente).
    - Toda intervención se registra en el ledger inmutable de `ChangeLog` vinculada al `userId` del agente de soporte y al target auditado.

---

# 2. Evidencia de Ejecución de Pruebas

### 2.1 Backend Unit & Migration Suites (`apps/admin_backend`)
```bash
npm test -- src/modules/onboarding/
```
- `legacy-import-integrity-report.service.spec.ts`: 6 tests pasados.
- `legacy-template-recipe-scan.service.spec.ts`: 5 tests pasados.
- `import-staging.controller.spec.ts`: 15 tests pasados.
- `onboarding-session.controller.spec.ts`: 5 tests pasados.
- `activation.service.spec.ts`: 22 tests pasados.
- `onboarding-customer-sale.observer.spec.ts`: 4 tests pasados.
- `zero-secrets-sanitizer.spec.ts`: 7 tests pasados.
- `onboarding-telemetry.service.spec.ts`: 6 tests pasados.
- **Total Acumulado Backend Onboarding**: **33 suites, 220 tests pasados al 100%**.

### 2.2 Backend Real PostgreSQL DB E2E (`apps/admin_backend`)
```bash
npm run test:e2e -- onboarding-import-cutover.db.e2e-spec.ts onboarding-fault-injection.db.e2e-spec.ts onboarding-security-isolation.db.e2e-spec.ts
```
- `onboarding-security-isolation.db.e2e-spec.ts`:
  - `1. Strict Tenant Boundary: Tenant B cannot read or modify Tenant A session or products (Rule 61, AC-38)` -> **PASSED**
  - `2. Forged tenant parameters in query or body NEVER alter authenticated scope (Rule 62)` -> **PASSED**
  - `3. Fail-Closed Security: missing authentication or tenant context is rejected fail-closed (Rule 61)` -> **PASSED**
  - `4. Granular Server-Side RBAC: CASHIER denied (403), MANAGER read-only, OWNER full access (Rule 64)` -> **PASSED**
  - `5. Device Evidence Trust Boundary: detects and rejects DevicePrincipal forgery (Rule 63)` -> **PASSED**
  - `6. Support Intervention Security: support overrides require explicit tenant grant and substantive justification (Rule 65)` -> **PASSED**
- `onboarding-fault-injection.db.e2e-spec.ts`:
  - `handles HTTP timeout after commit: client retries with same idempotency key and receives cached result without duplicate execution` -> **PASSED**
  - `rejects duplicate concurrent command replay with active lease lock and rejects diverging payload with INTEGRITY_CONFLICT` -> **PASSED**
  - `reclaims expired lease after worker crash (stale lease takeover) and increments attempt count` -> **PASSED**
  - `guarantees atomicity when failure occurs BEFORE Unit of Work commit: rolls back DB transaction cleanly` -> **PASSED**
  - `guarantees idempotency when failure occurs AFTER Unit of Work commit before HTTP return` -> **PASSED**
  - `handles CSV upload chunk retry: re-uploading same chunk does not corrupt row ordinals or duplicate staging rows` -> **PASSED**
- `onboarding-import-cutover.db.e2e-spec.ts`:
  - `ONB1.10A: verifies full migration reconciliation closure: Kardex remediation reference, accept-as-is, and measurementEligible=false legacy baseline receipt (AC-38, AC-39, Rule 72, Rule 73)` -> **PASSED**
- **Total**: **3 suites, 19 tests pasados en PostgreSQL real en 5.38s**.

### 2.3 Flutter POS Unit & E2E Suites con Floor SQLite (`apps/pos_app`)
```bash
flutter test test/integration/activation_fault_injection_e2e_test.dart test/integration/activation_lifecycle_m6_closure_e2e_test.dart test/integration/onb1_9_product_telemetry_first_customer_sale_e2e_test.dart
```
- `activation_fault_injection_e2e_test.dart`:
  - `SCENARIO 1: POS restart mid-Activation preserves local attempt and configuration on SQLite disk without state loss` -> **PASSED**
  - `SCENARIO 2: WAN outage & Cloud Down during finalization preserves outbox claims in SYNC_VERIFICATION_PENDING` -> **PASSED**
  - `SCENARIO 3: Clock Skew & Clock Jumps degrade clockConfidence and preserve monotonic occurredAt` -> **PASSED**
  - `SCENARIO 4: Duplicate outbox insertion is rejected or ignored without state corruption` -> **PASSED**
- `activation_lifecycle_m6_closure_e2e_test.dart`:
  - `Runs full M6 lifecycle: Pre-offline -> Offline Sale & TTFSS Claim -> Crash Recovery -> Reconnect Sync -> Normal VOID` -> **PASSED**
- `onb1_9_product_telemetry_first_customer_sale_e2e_test.dart`:
  - `demonstrates ONB1.9E–G: Verification sale claims TTFSS, subsequent commercial sale observes First Customer Sale, and historical TTFSS claim remains immutable across SQLite power cuts` -> **PASSED**
- **Total POS E2E**: **6 tests E2E pasados al 100% en Floor SQLite en disco y memoria en 2 segundos**.

---

# 3. Matriz de Criterios de Aceptación Cumplidos

| Criterio PRD / Invariante | Estado | Evidencia |
|---|---|---|
| **ONB1.10A — Receipts formales de reconciliación de migración** | **CUMPLIDO** | `legacy-import-integrity-report.service.spec.ts`, `onboarding-import-cutover.db.e2e-spec.ts` |
| **ONB1.10A — Remediación estricta vía Kardex/Inventory (Regla 72, AC-39)** | **CUMPLIDO** | `legacy-import-integrity-report.service.spec.ts`, `onboarding-import-cutover.db.e2e-spec.ts` |
| **ONB1.10A — Tenants legacy con `measurementEligible=false` sin TTFSS inventado (Regla 73, AC-56)** | **CUMPLIDO** | `legacy-import-integrity-report.service.spec.ts`, `onboarding-import-cutover.db.e2e-spec.ts` |
| **ONB1.10B — HTTP timeout post-commit resuelto por idempotencia** | **CUMPLIDO** | `onboarding-fault-injection.db.e2e-spec.ts` |
| **ONB1.10B — Stale lease takeover en crash de worker** | **CUMPLIDO** | `onboarding-fault-injection.db.e2e-spec.ts` |
| **ONB1.10B — Fallo antes y después de commit de UoW** | **CUMPLIDO** | `onboarding-fault-injection.db.e2e-spec.ts` |
| **ONB1.10B — Reinicio de POS en medio de Activación (Floor SQLite Disk)** | **CUMPLIDO** | `activation_fault_injection_e2e_test.dart` |
| **ONB1.10B — Caída de WAN / nube en finalización (`SYNC_VERIFICATION_PENDING`)** | **CUMPLIDO** | `activation_fault_injection_e2e_test.dart` |
| **ONB1.10B — Clock skew / jumps y confianza degradada** | **CUMPLIDO** | `activation_fault_injection_e2e_test.dart`, `activation_clock_manager_test.dart` |
| **ONB1.10C — Aislamiento fail-closed multi-tenant en PostgreSQL (Regla 61, AC-38)** | **CUMPLIDO** | `onboarding-security-isolation.db.e2e-spec.ts` |
| **ONB1.10C — Protección contra DevicePrincipal forgery (Regla 63)** | **CUMPLIDO** | `onboarding-security-isolation.db.e2e-spec.ts` |
| **ONB1.10C — RBAC granular server-side (OWNER, MANAGER, CASHIER, Regla 64)** | **CUMPLIDO** | `onboarding-security-isolation.db.e2e-spec.ts` |
| **ONB1.10C — Soporte auditado con justificación obligatoria (Regla 65)** | **CUMPLIDO** | `onboarding-security-isolation.db.e2e-spec.ts` |

---

# 4. Estado de Roadmap y Siguiente Slice

- **Fila 25 del Roadmap (`PR-ONB-24` / ONB1.10A–C)**: **100% CERRADO Y VERIFICADO**.
- **Siguiente Slice Inmediato**: **`PR-ONB-25`** (Fila 26 del Roadmap — ONB1.10D–G: Full regression de los 74 escenarios normativos, cutover order, founder pilot rehearsal y rollback rehearsal).
