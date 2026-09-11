# NHILOS Client Onboarding V1 — Evidence Receipt: PR-ONB-23 (ONB1.9E–G)

**Documento:** `ONB1.9_M7_PR23_EVIDENCE.md`  
**Ubicación:** `docs/onboarding/evidence/ONB1.9_M7_PR23_EVIDENCE.md`  
**Slices cubiertos:** `ONB1.9E`, `ONB1.9F`, `ONB1.9G` (Fila 24 del Roadmap Onboarding V1)  
**Fecha de ejecución:** 2026-09-04  
**Branch:** `feat/backoffice-spa`  
**Metodología:** TDD estricto -> Triangulación -> Integración (PostgreSQL real en backend, Floor SQLite real en disco y memoria en POS, Vitest en Dashboard) -> E2E local sin mocks inventados.

---

# 1. Resumen de Entregables Físicos

### 1.1 ONB1.9E — Catálogo Canónico de Telemetría de Producto
- **Contrato Unificado de 19 Eventos Canónicos**:
  - `ONBOARDING_STARTED`, `SESSION_RESUMED`, `STEP_VIEWED`, `STEP_COMPLETED_OBSERVED`, `STEP_SKIPPED`, `TEMPLATE_PREVIEWED`, `TEMPLATE_APPLY_RESULT`, `IMPORT_STARTED`, `IMPORT_VALIDATED`, `IMPORT_COMMIT_RESULT`, `IMPORT_FAILED`, `SALE_READY_REACHED`, `ACTIVATION_STARTED`, `ACTIVATION_CHECK_FAILED`, `ACTIVATION_WARNING`, `ACTIVATION_RESULT`, `FIRST_SUCCESSFUL_SALE`, `FIRST_CUSTOMER_SALE`, `BOH_READINESS_CHANGED`.
- **Implementación en Backend (`apps/admin_backend`)**:
  - `OnboardingTelemetryService` (`src/modules/onboarding/telemetry/onboarding-telemetry.service.ts`).
  - `OnboardingTelemetryController` (`src/modules/onboarding/controllers/onboarding-telemetry.controller.ts`) con rutas `POST /onboarding/telemetry/events` y `GET /onboarding/telemetry/events`.
  - Entidad TypeORM `OnboardingTelemetryEvent` (`onboarding_telemetry_events`) con aislamiento multi-tenant RLS en PostgreSQL.
- **Invariante Normativo de Observabilidad**:
  - La telemetría es **exclusivamente de observabilidad**. La ingesta de telemetría **NUNCA** altera estados de ciclo de vida (`OnboardingSession.lifecycleState`), ni bloquea operaciones transaccionales de venta ni altera readiness.
- **Invariante de `STEP_SKIPPED`**:
  - `STEP_SKIPPED` solo se autoriza para pasos opcionales/postergables (`BOH_INVENTORY`, `BOH_COSTING`, `BOH_OPERATIONS`, `RECIPES`, `STAFF_ENRICHMENT`).
  - Intentar registrar `STEP_SKIPPED` sobre bloqueadores requeridos (`FISCAL_SETUP`, `PRODUCT_CATALOG`, `ACTIVATION_VERIFICATION_SALE`) es rechazado inmediatamente con `400 Bad Request` (`STEP_NOT_SKIPPABLE`).

### 1.2 ONB1.9F — Separación Estricta entre Audit Trail y Telemetría & Guardrail Zero Secrets
- **Separación de Streams**:
  - **Audit Trail Material**: Permanece reservado exclusivamente a efectos forenses con trazabilidad legal y regulatoria DGI (`ChangeLogService` / `AuditLog` con hash chaining SHA-256, sequence numbering, actor_user_id y target entity).
  - **Telemetría de Producto**: Stream analítico no forense orientado a duraciones de navegación, conteos agregados y estados de interfaz.
- **Guardrail de Seguridad Zero Secrets (`ZeroSecretsSanitizer` & `PosZeroSecretsSanitizer`)**:
  - Sanitización recursiva y forzosa ejecutada tanto en cliente (`owner_dashboard`), como en POS (`pos_app`) y backend (`admin_backend`).
  - Redacción estricta garantizada por pruebas unitarias de:
    - Tokens JWT (`[REDACTED_JWT]`).
    - Claves y campos de contraseña (`[REDACTED_SECRET]`).
    - Códigos PIN y TOTP (`[REDACTED_PIN]`).
    - Números de tarjetas de crédito (PAN) (`[REDACTED_CARD]`).
    - Contenido completo de CSVs crudos (`RAW_CSV_REDACTED` con resumen de líneas y bytes).
    - Enmascaramiento de PII innecesaria (ej. emails: `o***r@domain.com`).

### 1.3 ONB1.9G — Observación de First Customer Sale desacoplada e Inmutabilidad de TTFSS
- **Servicio Observador en Backend (`OnboardingCustomerSaleObserver`)**:
  - Cuando se emite el primer ticket comercial a un cliente final, registra `session.firstCustomerSaleAt`.
  - **Invariante Crítico Inmutable**: Si `firstSuccessfulSaleAt` fue establecido durante la venta técnica controlada de Activación (Hito M6), la primera venta comercial **NO modifica ni recalcula** el TTFSS histórico consolidado (`firstSuccessfulSaleAt`) ni altera `activatedAt`.
  - **Semántica Write-Once**: Ventas comerciales posteriores (ticket 2, 3, etc.) nunca sobreescriben `firstCustomerSaleAt`.
- **Persistencia Real en POS App con Floor SQLite (Memoria y Disco)**:
  - Nueva entidad Floor `FirstCustomerSaleObservationEntity` en tabla `first_customer_sale_observations`.
  - Nuevo DAO Floor `FirstCustomerSaleObservationDao`.
  - Migración `migration46_47` registrada en `allMigrations` y versión de esquema 47.
  - Servicio `PosFirstCustomerSaleObserver`: Inserta de forma atómica y write-once la observación comercial, encola sobre outbox `FIRST_CUSTOMER_SALE_OBSERVED` y emite telemetría sin alterar `first_successful_sale_claims`.

### 1.4 Dashboard Backoffice (`apps/owner_dashboard`)
- **Métricas de Activación & Primera Venta Comercial en `SetupCenterView`**:
  - Nueva tarjeta `data-testid="onboarding-activation-sales-card"` visible para tenants en estado `ACTIVATED`.
  - Sub-tarjeta `data-testid="onboarding-ttfss-claim"` mostrando el TTFSS técnico inmutable consolidado.
  - Sub-tarjeta `data-testid="onboarding-first-customer-sale"` mostrando el timestamp del primer ticket comercial emitido a un cliente final.
- **Cliente de Telemetría (`onboarding-telemetry-client.ts`)**:
  - Sanitizador client-side preventivo de secretos.
  - Emisión de `STEP_VIEWED` al navegar por el Setup Center.

---

# 2. Evidencia de Ejecución de Pruebas

### 2.1 Backend Unit & Migration Suites (`apps/admin_backend`)
```bash
npm test -- src/modules/onboarding/ src/migrations/1801000000000
```
- `zero-secrets-sanitizer.spec.ts`: 7 tests pasados.
- `onboarding-telemetry.service.spec.ts`: 6 tests pasados.
- `onboarding-telemetry.controller.spec.ts`: 3 tests pasados.
- `onboarding-customer-sale.observer.spec.ts`: 4 tests pasados.
- `1801000000000-CreateOnboardingTelemetryEvents.spec.ts`: 2 tests pasados.
- **Total Acumulado Backend Onboarding**: **34 suites, 216 tests pasados al 100%**.

### 2.2 Backend Real PostgreSQL DB E2E (`apps/admin_backend`)
```bash
npm run test:e2e -- onboarding-readiness.db.e2e-spec.ts
```
- `runs complete lifecycle: starts SETUP_IN_PROGRESS -> transitions to SALE_READY on product addition -> reverts on product deactivation while preserving saleReadyFirstAt` -> **PASSED**.
- `guarantees tenant isolation: Tenant B does not observe Tenant A session or products` -> **PASSED**.
- `enforces granular RBAC permissions: CASHIER denied, MANAGER can read but cannot start, OWNER full access` -> **PASSED**.
- `demonstrates ONB1.9A–D Progressive BOH Readiness: tenant reaches SALE_READY with stock=0 and COST_PENDING, then advances to ACTIVATED and subsequent BOH enrichment does not modify activatedAt or revoke ACTIVATED (AC-07, AC-08, AC-40, AC-41)` -> **PASSED**.
- `demonstrates ONB1.9E–G: Canonical Product Telemetry, Zero Secrets Guardrail, and Decoupled First Customer Sale Observation (AC-07, AC-08, AC-40, AC-41)` -> **PASSED**.
- **Total**: **5 tests pasados en PostgreSQL real en 5.36s**.

### 2.3 Frontend Owner Dashboard Suites (`apps/owner_dashboard`)
```bash
npx vitest run src/__tests__/onboarding-*.tsx src/__tests__/onboarding-*.ts src/__tests__/setup-center-view.test.tsx
```
- `onboarding-telemetry-client.test.ts`: 8 tests pasados.
- `onboarding-activation-sales-card.test.tsx`: 1 test pasado.
- **Total Acumulado Dashboard Onboarding**: **11 suites, 46 tests pasados al 100%**.

### 2.4 Flutter POS Unit & E2E Suites con Floor SQLite (`apps/pos_app`)
```bash
flutter test test/data/services/activation* test/data/services/pos* test/integration/activation* test/integration/onb1_9*
```
- `pos_zero_secrets_sanitizer_test.dart`: 6 tests pasados.
- `pos_first_customer_sale_observer_test.dart`: 2 tests pasados.
- `onb1_9_product_telemetry_first_customer_sale_e2e_test.dart`: 1 test E2E pasado demostrando persistencia en Floor SQLite en disco y memoria, inmutabilidad de claim TTFSS, consecutividad DGI y resistencia a cortes de energía.
- **Total Acumulado POS**: **74 tests pasados al 100% en 5 segundos**.

---

# 3. Matriz de Criterios de Aceptación Cumplidos

| Criterio PRD / Invariante | Estado | Evidencia |
|---|---|---|
| **ONB1.9E — 19 Eventos Canónicos de Telemetría** | **CUMPLIDO** | `onboarding-telemetry.service.spec.ts`, `onboarding-readiness.db.e2e-spec.ts` |
| **ONB1.9E — Observabilidad pura (no altera lifecycle)** | **CUMPLIDO** | `onboarding-telemetry.service.spec.ts`, `onboarding-readiness.db.e2e-spec.ts` |
| **ONB1.9E — `STEP_SKIPPED` rechaza bloqueadores requeridos** | **CUMPLIDO** | `onboarding-telemetry.service.spec.ts`, `onboarding-telemetry-client.test.ts` |
| **ONB1.9F — Separación Audit Trail vs Telemetría** | **CUMPLIDO** | `onboarding-telemetry.service.spec.ts`, `onboarding-readiness.db.e2e-spec.ts` |
| **ONB1.9F — Guardrail Zero Secrets (JWT/Pwd/PIN/Card/CSV/PII)** | **CUMPLIDO** | `zero-secrets-sanitizer.spec.ts`, `pos_zero_secrets_sanitizer_test.dart`, `onboarding-telemetry-client.test.ts` |
| **ONB1.9G — First Customer Sale desacoplado de TTFSS** | **CUMPLIDO** | `onboarding-customer-sale.observer.spec.ts`, `pos_first_customer_sale_observer_test.dart` |
| **ONB1.9G — Inmutabilidad de TTFSS consolidado** | **CUMPLIDO** | `onb1_9_product_telemetry_first_customer_sale_e2e_test.dart`, `onboarding-readiness.db.e2e-spec.ts` |
| **ONB1.9G — Resistencia a cortes de energía (Floor SQLite Disk)** | **CUMPLIDO** | `onb1_9_product_telemetry_first_customer_sale_e2e_test.dart` |

---

# 4. Estado de Roadmap y Siguiente Slice

- **Fila 24 del Roadmap (`PR-ONB-23` / ONB1.9E–G)**: **100% CERRADO Y VERIFICADO**.
- **Siguiente Slice Inmediato**: **`PR-ONB-24`** (Fila 25 del Roadmap — ONB1.10A–C: Legacy reconciliation, fault injection suite, and security/isolation hardening).
