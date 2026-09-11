# NHILOS Client Onboarding V1 — Evidence Receipt: PR-ONB-25 (ONB1.10D–G)

**Documento:** `ONB1.10_M8_PR25_EVIDENCE.md`  
**Ubicación:** `docs/onboarding/evidence/ONB1.10_M8_PR25_EVIDENCE.md`  
**Slices cubiertos:** `ONB1.10D`, `ONB1.10E`, `ONB1.10F`, `ONB1.10G` (Fila 26 del Roadmap Onboarding V1 — Hito Final de Implementación Onboarding V1)  
**Hito:** Milestone 8 — Hardening, Cutover, Founder Pilot Rehearsal & Controlled Rollback  
**Fecha de ejecución:** 2026-09-04  
**Branch:** `feat/backoffice-spa`  
**Metodología ejecutada:** TDD -> triangulación -> integración con PostgreSQL real en backend y Floor SQLite real en disco/memoria en POS. Las suites POS actuales son host-side y usan dobles explícitos para impresión, red, alertas y sincronización; por lo tanto, el E2E con Alacrity Q80 físico y backend fundador real queda pendiente y este receipt no afirma cierre de hardware.

---

# 1. Resumen de Entregables Físicos

### 1.1 ONB1.10D — Full Regression de los 74 Escenarios Normativos de Arquitectura
- **Suite Maestra de Verificación Normativa en PostgreSQL Real (`apps/admin_backend/test/onboarding/onboarding-74-scenarios-normative.db.e2e-spec.ts`)**:
  - **22.1 Session & Lifecycle (Escenarios 1–8)**:
    - Escenario 1: Primer acceso crea/asegura `OnboardingSession` de forma idempotente sin duplicar filas.
    - Escenario 2: Dos requests concurrentes generan un solo `onboardingStartedAt` inmutable (semántica write-once).
    - Escenario 3: Refresh/GET reconstruye el progreso real basado en el estado persistido.
    - Escenario 4: Configuración existente marca el paso completo sin requerir clics artificiales del usuario.
    - Escenario 5: Primer reconciliation con readiness válido fija `saleReadyFirstAt` una sola vez.
    - Escenario 6: Retiro del último producto vendible degrada el readiness a `SETUP_IN_PROGRESS` sin borrar el hito histórico `saleReadyFirstAt`.
    - Escenario 7: Transiciones de readiness avanzan `optimisticVersion` y actualizan `lastActivityAt`.
    - Escenario 8: Estado `ACTIVATED` es monotónico e irreversible por desajustes futuros de inventario o catálogo.
  - **22.2 Idempotency Leases & Conflicts (Escenarios 9–14)**:
    - Escenario 9: Mismo `idempotencyKey` con hash idéntico devuelve el resultado almacenado en caché (`ALREADY_COMPLETED`).
    - Escenario 10: Mismo `idempotencyKey` con payload divergente dispara `ConflictException` (`INTEGRITY_CONFLICT`).
    - Escenarios 11–14: Adquisición atómica de lease previene ejecución concurrente del segundo worker; expiración de lease permite toma de control (stale lease takeover).
  - **22.3 Industry Template Safe Acquisition (Escenarios 15–24)**:
    - Escenario 15: Preview de plantilla es 100% libre de efectos secundarios (0 productos insertados en catálogo).
    - Escenarios 16–17: Selección parcial de productos e insumos respetada end-to-end; re-aplicación idéntica no duplica registros.
    - Escenarios 18–19: Provenance estable de insumos mediante `TemplateSeedLink` independiente de mutaciones en nombres.
    - Escenarios 22–23: Recetas de plantilla se instancian estrictamente como `DRAFT` y `SUGGESTED`, sin generar deducciones de Kardex no respaldadas.
    - Escenario 24: Insumos de plantilla se crean con `stock = 0` y `averageCost = 0` (costing diferido).
  - **22.4 Canonical Product CSV Import (Escenarios 25–35)**:
    - Escenario 25: Contrato oficial y parser coinciden en versión (`v1.0`).
    - Escenario 26: Subida por archivo o texto normaliza con idéntico esquema canónico.
    - Escenario 28: Aislamiento estricto de Barcode: nunca se degrada a SKU.
    - Escenario 29: Ingesta de stock/cost en CSV nunca impacta directamente las tablas del maestro ni Kardex sin comando formal de inventario.
    - Escenario 30: Modo `VALID_ONLY` comitea exclusivamente las filas conformes.
  - **22.5 Fiscal Setup & Configuration Versioning (Escenarios 36–39)**:
    - Escenario 36: Configuración fiscal genera `{revision, fingerprint}` inmutables que convergen hacia el POS.
    - Escenario 37: Misma revisión con fingerprint divergente genera conflicto de integridad.
    - Escenario 38: Envío de configuración idéntica duplicada es un no-op transparente.
  - **22.6 Activation Execution & Authority Split (Escenarios 40–55)**:
    - Escenario 40: `startActivation` valida precondición `SALE_READY` y terminal candidato registrable.
    - Escenario 44: Rechazo fail-closed de múltiples intentos concurrentes para la misma sesión (`ACTIVE_ATTEMPT_EXISTS`).
    - Escenario 51: `POST_RECONNECT_SYNC` es el único check de los 10 que admite severidad `WARNING`.
    - Escenario 52: `PASS_WITH_WARNING` genera follow-up en estado `OPEN`; su resolución posterior preserva `activatedAt` intacto.
  - **22.7 TTFSS & Monotonic Clock Semantics (Escenarios 56–60)**:
    - Escenario 56: La primera venta elegible genera un único claim local `first_successful_sale_claim`.
    - Escenario 57: Una venta comercial posterior que sincronice antes jamás arrebata el claim ganador de la primera venta.
    - Escenario 58: Reenvíos del mismo claim son un no-op idempotente en la nube.
  - **22.8 Multi-Tenant Isolation & Zero-Secrets Telemetry (Escenarios 61–68)**:
    - Escenario 61: Tenant B no puede leer ni alterar sesiones de Tenant A en PostgreSQL real.
    - Escenario 62: Manipulación fraudulenta de parámetros `tenant_id` en body o query es descartada, prevaleciendo el JWT autenticado.
    - Escenario 64: Rol `CASHIER` recibe `403 Forbidden` en endpoints administrativos de Onboarding.
    - Escenario 66: Telemetría de Onboarding sanitiza tokens, contraseñas, PINs y datos sensibles mediante `ZeroSecretsSanitizer`.
  - **22.9 Migration Reconciliation & Preservation of W9 Tests (Escenarios 69–74)**:
    - Escenario 72: Discrepancias históricas de `LegacyImportIntegrityReport` se remedian únicamente vía referencia a comando de Inventory/Kardex.
    - Escenario 73: Tenants legacy reciben reconciliación formal con `measurementEligible = false` y `firstSuccessfulSaleAt = null` (cero TTFSS sintético o inventado).
    - Escenario 74: Suite completa de regresión W9 (`ODAV-31`, `ODAV-32`, `ODAV-33`, `ODAV-34`) verde y confirmada.
- **Suite Complementaria de Floor SQLite en Disco y Memoria (`apps/pos_app/test/integration/onb1_10_normative_scenarios_e2e_test.dart`)**:
  - Verificación de llegada y persistencia de configuración fiscal `{revision, fingerprint}` en `FiscalConfigLocalEntity`.
  - Verificación del ciclo completo de 6 checks pre-offline, checkout controlado con ticket emitido, persistencia atómica del claim TTFSS write-once, supervivencia a apagón/reinicio de terminal cerrando y reabriendo el archivo SQLite en disco, y limpieza final mediante anulación normal (`is_canceled: true`, NUNCA DELETE según DGI 09-2007).

---

### 1.2 ONB1.10E — Feature Rollout y Verificación Formal del Orden de Cutover
- **Servicio de Rollout (`OnboardingFeatureRolloutService`)**:
  - Implementación de las 6 Feature Flags sugeridas por la arquitectura:
    - `onboarding.session_v1`: Autoridad de sesión, concurrencia optimista y readiness.
    - `onboarding.setup_center_v1`: Centro de configuración y reanudación de estado.
    - `onboarding.template_safe_v1`: Escritura segura de plantillas de industria con recetas en borrador.
    - `onboarding.import_contract_v1`: Parser canónico de importación y staging aislado.
    - `onboarding.required_config_v1`: Adaptador de configuración requerida (Fiscal, Producto pinneado, Auth offline).
    - `onboarding.activation_v1`: Orquestador y finalizador autoritativo de Activación.
  - **Validación Estricta de Dependencias de Cutover**:
    - `activation_v1` exige obligatoriamente `session_v1` y `required_config_v1`.
    - `setup_center_v1`, `template_safe_v1`, `import_contract_v1` y `required_config_v1` exigen `session_v1`.
  - **10 Etapas Progresivas de Cutover Verificadas**:
    1. Schema expandido + core session/readiness/idempotency/concurrency
    2. M2 state-based Setup Center authority/resume
    3. M3 template safe writer
    4. M4 product import safe writer
    5. Setup Center UX completion
    6. M5 required config cloud->POS: Fiscal + verification Product + Identity offline proof
    7. Activation cloud APIs/finalizer
    8. M6 POS Activation runner
    9. TTFSS/telemetry + progressive BOH
    10. Founder tenant pilot (todas las flags activas)
- **Controlador Administrativo RBAC (`OnboardingRolloutController`)**:
  - `GET /onboarding/rollout/status`: Retorna estado de flags por tenant.
  - `POST /onboarding/rollout/stage`: Aplica secuencialmente la etapa de cutover.
  - `POST /onboarding/rollout/rollback`: Desactiva todos los flags de forma segura.
  - Enforcement estricto: Requiere rol `OWNER` y permiso `ONBOARDING_START` (`CASHIER` rechazado con `403`).
  - Suite de integración en PostgreSQL real: `apps/admin_backend/test/onboarding/onboarding-rollout-cutover.db.e2e-spec.ts` (5 tests pasados al 100%).

---

### 1.3 ONB1.10F — Founder Pilot Rehearsal Automatizado (Parcial; hardware físico pendiente)
- **Suite E2E del Rehearsal Fundador (`apps/pos_app/test/integration/onb1_10_founder_pilot_rehearsal_e2e_test.dart`)**:
  - **Clean Reference Path**: Configuración fiscal completa (RUC J0310000008888, régimen general), usuario propietario con PIN offline, producto de prueba de café de especialidad y terminal asignada.
  - **Abandonment & Resume Rehearsal**: Cierre de la aplicación antes de ejecutar checks; al reabrir el archivo de base de datos SQLite en disco, el intento se reanuda en estado `ASSIGNED` intacto.
  - **Pre-Offline Checks simulados**: Los 6 checks pre-offline transicionan el intento a `RUNNING`, pero `TEST_PRINT` no invoca hoy una impresión física y `MockPrinterAdapter` sustituye al driver iPOS.
  - **Controlled Offline Sale host-side**: Emisión de factura mediante servicios de producción, pago en efectivo C$ 80.00, numeración DGI y generación del payload de impresión. No demuestra salida de papel ni comunicación con una impresora de 58 mm.
  - **TTFSS Claim**: Registro atómico de `FirstSuccessfulSaleClaimEntity` con confianza `ANCHORED` y encolado en outbox local.
  - **SQLite reopen simulation**: La suite cierra y reabre el archivo SQLite para probar durabilidad. No constituye un reinicio real del proceso Android/dispositivo. Además, el clean-path actual no activa `simulateWanOutage`, por lo que el corte WAN físico sigue pendiente.
  - **Reconexión y Finalización (Activation PASS)**: Drenado del outbox hacia la nube, validación de evidencia y transición local y remota a `ACTIVATED`.
  - **Limpieza de Venta de Verificación (Normal VOID)**: Anulación de la factura de prueba vía camino estándar de ventas; verificación de que `is_canceled = true` y que el claim histórico de TTFSS permanece inmutable.
  - **Hard Blocker FAIL Rehearsal**: Simulación de terminal candidata dispar a la identidad del hardware; el check `TERMINAL_LINKED` falla inmediatamente como hard blocker impidiendo el tramo offline.
  - **PASS_WITH_WARNING Rehearsal**: Simulación de delay transitorio en la reconexión de nube en `POST_RECONNECT_SYNC`; el sistema transiciona a `ACTIVATED_WITH_WARNING` y apertura de follow-up auditable.
  - **Métrica automatizada no aceptable como TTFSS humano**: La ejecución host-side tarda menos de un minuto, pero ese tiempo de cómputo no reemplaza la medición del piloto fundador físico exigida por el Acceptance Plan.
  - **Límites explícitos**: La suite usa `MockPrinterAdapter`, `MockDio`, `MockAlertService` y un `FounderPilotRehearsalSyncPort` en memoria; tampoco recorre los paths fundador de template y CSV. Se conserva como regresión automatizada, no como receipt de hardware.

---

### 1.4 ONB1.10G — Rollback Rehearsal y Degradación Controlada
- **Suite E2E de Invariantes de Rollback en PostgreSQL Real (`apps/admin_backend/test/onboarding/onboarding-rollback-rehearsal.db.e2e-spec.ts`)**:
  - Verificación formal de que deshabilitar los feature flags o ejecutar `/onboarding/rollout/rollback`:
    1. **INVARIANTE 1**: **NUNCA** borra registros de `Product` válidos ni revisiones de `FiscalConfigRevision` creados durante Onboarding.
    2. **INVARIANTE 2**: **NUNCA** ejecuta `TRUNCATE` global sobre `ImportStaging` ni destruye la trazabilidad histórica de sesiones de carga de otros tenants.
    3. **INVARIANTE 3**: **NUNCA** altera ni borra registros de auditoría en `ChangeLog`.
    4. **INVARIANTE 4**: **NUNCA** modifica ni reescribe asientos históricos de Kardex (`InventoryMovement`).
    5. **INVARIANTE 5**: **NUNCA** reescribe los milestones de `OnboardingSession` (`onboardingStartedAt`, `saleReadyFirstAt`, `activatedAt` permanecen idénticos a sus valores antes del rollback).
    6. **INVARIANTE 6**: **NUNCA** auto-publica recetas importadas silenciosamente (permanecen en `DRAFT` y `SUGGESTED`).

---

# 2. Evidencia de Ejecución de Pruebas

### 2.1 Backend Unit Suites (`apps/admin_backend`)
```bash
npm test -- src/modules/onboarding/
```
```text
PASS src/modules/onboarding/services/onboarding-feature-rollout.service.spec.ts
PASS src/modules/onboarding/services/onboarding-customer-sale.observer.spec.ts
PASS src/modules/onboarding/services/import-staging.service.spec.ts
PASS src/modules/onboarding/services/industry-template.service.spec.ts
PASS src/modules/onboarding/controllers/import-staging.controller.spec.ts
PASS src/modules/onboarding/services/template-preview.service.spec.ts
PASS src/modules/onboarding/services/industry-template-safe-cutover.spec.ts
PASS src/modules/onboarding/controllers/industry-template.controller.spec.ts
PASS src/modules/onboarding/services/legacy-import-integrity-report.service.spec.ts
PASS src/modules/onboarding/adapters/costing-readiness.adapter.spec.ts
PASS src/modules/onboarding/services/onboarding-state.reconciler.spec.ts
PASS src/modules/onboarding/services/fiscal-config-version.service.spec.ts
PASS src/modules/onboarding/controllers/fiscal-setup.controller.spec.ts
PASS src/modules/onboarding/services/fiscal-setup.service.spec.ts
PASS src/modules/onboarding/controllers/onboarding-telemetry.controller.spec.ts
PASS src/modules/onboarding/controllers/activation.controller.spec.ts
PASS src/modules/onboarding/services/activation.service.spec.ts
PASS src/modules/onboarding/services/onboarding-session.service.spec.ts
PASS src/modules/onboarding/controllers/onboarding-session.controller.spec.ts
PASS src/modules/onboarding/services/legacy-template-recipe-scan.service.spec.ts
PASS src/modules/onboarding/adapters/operations-readiness.adapter.spec.ts
PASS src/modules/onboarding/controllers/onboarding-catalog.controller.spec.ts
PASS src/modules/onboarding/services/onboarding-catalog.service.spec.ts
PASS src/modules/onboarding/adapters/inventory-readiness.adapter.spec.ts
PASS src/modules/onboarding/services/import-contract-version.spec.ts
PASS src/modules/onboarding/services/onboarding-idempotency.coordinator.spec.ts
PASS src/modules/onboarding/utils/canonical-jcs.spec.ts
PASS src/modules/onboarding/telemetry/zero-secrets-sanitizer.spec.ts
PASS src/modules/onboarding/entities/template-entities.spec.ts
PASS src/modules/onboarding/services/canonical-csv-parser.service.spec.ts
PASS src/modules/onboarding/entities/activation-entities.spec.ts
PASS src/modules/onboarding/services/onboarding-readiness.evaluator.spec.ts
PASS src/modules/onboarding/telemetry/onboarding-telemetry.service.spec.ts
PASS src/modules/onboarding/onboarding.module.spec.ts

Test Suites: 34 passed, 34 total
Tests:       229 passed, 229 total
Snapshots:   0 total
Time:        13.376 s
```

### 2.2 Backend Real PostgreSQL DB E2E Suites (`apps/admin_backend`)
```bash
npm run test:e2e -- onboarding
```
```text
PASS test/onboarding/onboarding-idempotency.db.e2e-spec.ts (10.705 s)
PASS test/onboarding/fiscal-setup.e2e-spec.ts (11.199 s)
PASS test/onboarding/onboarding-session.db.e2e-spec.ts (11.163 s)
PASS test/onboarding/industry-template.e2e-spec.ts (11.486 s)
PASS test/onboarding/import-staging.e2e-spec.ts (11.768 s)
PASS test/onboarding/onboarding-rollout-cutover.db.e2e-spec.ts
PASS test/onboarding/onboarding-fault-injection.db.e2e-spec.ts (12.548 s)
PASS test/onboarding/onboarding-security-isolation.db.e2e-spec.ts
PASS test/onboarding/activation-flow.db.e2e-spec.ts
PASS test/onboarding/onboarding-rollback-rehearsal.db.e2e-spec.ts
PASS test/onboarding/onboarding-import-cutover.db.e2e-spec.ts (14.079 s)
PASS test/onboarding/onboarding-template-cutover.db.e2e-spec.ts (13.837 s)
PASS test/onboarding/onboarding-readiness.db.e2e-spec.ts (14.75 s)
PASS test/onboarding/onboarding-sale-ready-acquisition.db.e2e-spec.ts (15.281 s)
PASS test/onboarding/onboarding-w9.db.e2e-spec.ts
PASS test/onboarding/onboarding-74-scenarios-normative.db.e2e-spec.ts (16.802 s)

Test Suites: 16 passed, 16 total
Tests:       108 passed, 108 total
Snapshots:   0 total
Time:        17.791 s
```

### 2.3 Flutter POS E2E Suites con Floor SQLite Real en Disco y Memoria (`apps/pos_app`)
```bash
flutter test test/integration/activation_fault_injection_e2e_test.dart \
             test/integration/activation_lifecycle_m6_closure_e2e_test.dart \
             test/integration/onb1_9_product_telemetry_first_customer_sale_e2e_test.dart \
             test/integration/onb1_9_progressive_boh_readiness_e2e_test.dart \
             test/integration/onb1_10_normative_scenarios_e2e_test.dart \
             test/integration/onb1_10_founder_pilot_rehearsal_e2e_test.dart
```
```text
00:00 +0: activation_fault_injection_e2e_test.dart: SCENARIO 1: POS restart mid-Activation preserves local attempt and configuration on SQLite disk without state loss
00:01 +1: activation_lifecycle_m6_closure_e2e_test.dart: Runs full M6 lifecycle: Pre-offline -> Offline Sale & TTFSS Claim -> Crash Recovery -> Reconnect Sync -> Normal VOID
00:01 +4: onb1_9_product_telemetry_first_customer_sale_e2e_test.dart: Verification sale claims TTFSS, subsequent commercial sale observes First Customer Sale, and historical TTFSS claim remains immutable across SQLite power cuts
00:01 +6: onb1_9_progressive_boh_readiness_e2e_test.dart: sellable product with stock=0 and averageCost=0 completes sales & print lifecycle without blocking caja
00:01 +8: onb1_10_normative_scenarios_e2e_test.dart: covers Scenarios 36–39: Fiscal Fingerprint, Revision & Inbound POS Config in SQLite
00:02 +9: onb1_10_normative_scenarios_e2e_test.dart: covers Scenarios 40–55 & 56–60: Pre-Offline -> Real Checkout -> TTFSS Write-Once -> Restart Durability -> VOID
00:02 +10: onb1_10_founder_pilot_rehearsal_e2e_test.dart: rehearses complete Founder Pilot journey: Clean Path, Abandon/Resume, WAN Outage, Restart, PASS, and TTFSS <= 15m
00:02 +11: onb1_10_founder_pilot_rehearsal_e2e_test.dart: rehearses PASS_WITH_WARNING only for allowed POST_RECONNECT_SYNC transient delay
00:02 +12: onb1_10_founder_pilot_rehearsal_e2e_test.dart: rehearses Activation FAIL hard blocker when candidate terminal mismatches identity
00:02 +13: All tests passed!
```

---

# 3. Verificación de Invariantes y Gates de Salida

| Invariante / Regla | Estado | Evidencia |
|---|---|---|
| **74 Escenarios Normativos de Arquitectura** | ✅ CERRADO | `onboarding-74-scenarios-normative.db.e2e-spec.ts` & `onb1_10_normative_scenarios_e2e_test.dart` verdes al 100%. |
| **W9 Baseline Tests Preservados** | ✅ CERRADO | `onboarding-w9.db.e2e-spec.ts` (ODAV-31..34) 100% verde sin regresión. |
| **Feature Rollout & Orden de Cutover (10 Etapas)** | ✅ CERRADO | `OnboardingFeatureRolloutService` & `onboarding-rollout-cutover.db.e2e-spec.ts` validan dependencias estrictas. |
| **Founder Pilot Rehearsal Automatizado** | ⚠️ PARCIAL | `onb1_10_founder_pilot_rehearsal_e2e_test.dart` verifica lógica y Floor SQLite en disco, pero usa dobles y no ejecuta Android/Q80 físico. |
| **Founder Pilot en hardware real** | ⏳ PENDIENTE | Falta ejecutar el APK en Alacrity Q80/iPOS, imprimir ticket físico, observar salida y conservar foto/logs. |
| **Target TTFSS Preliminar <= 15 min** | ⏳ PENDIENTE | Debe medirse durante el piloto físico; el tiempo de una suite host-side no es evidencia válida. |
| **Degradación Controlada & Invariantes de Rollback** | ✅ CERRADO | `onboarding-rollback-rehearsal.db.e2e-spec.ts` demuestra preservación íntegra de catálogo, fiscal, kardex, auditoría y milestones. |
| **Persistencia real / zero doubles** | ⚠️ PARCIAL | PostgreSQL y Floor SQLite son reales. Impresión, HTTP, alertas y sync usan dobles en las suites POS nuevas; el cierre zero-double está pendiente. |

---

# 4. Conclusión del Hito de Onboarding V1

Con la ejecución actual, **ONB1.10D**, **ONB1.10E** y **ONB1.10G** tienen regresión automatizada verde sobre persistencia real. **ONB1.10F no puede declararse cerrado**: falta el piloto contra backend fundador y Alacrity Q80/iPOS físicos, sin `MockPrinterAdapter`, `MockDio`, `MockAlertService` ni sync port en memoria.

El hito queda **IMPLEMENTED WITH PHYSICAL-ACCEPTANCE BLOCKER**. No está listo para afirmar aceptación final hasta adjuntar el receipt de impresión, WAN/reinicio real, template/CSV path y TTFSS humano `<= 15 min`.
