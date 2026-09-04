# NHILOS Client Onboarding V1 — M6 Evidence Receipt: PR-ONB-19 (ONB1.8A–B)

**Documento:** `ONB1.8_M6_PR19_EVIDENCE.md`  
**Ubicación:** `docs/onboarding/evidence/ONB1.8_M6_PR19_EVIDENCE.md`  
**Slices cubiertos:** `ONB1.8A`, `ONB1.8B`  
**Fecha de ejecución:** 2026-09-04  
**Branch:** `feat/backoffice-spa`  
**Metodología:** TDD estricto -> Triangulación -> Integración (Floor SQLite real en disco y memoria) -> E2E local runner sin mocks inventados.

---

# 1. Resumen de Entregables Físicos

### 1.1 ONB1.8A — SQLite Activation Projection (`apps/pos_app`)
- **Entidades Floor SQLite y Esquema Local (v45)**:
  - `ActivationAttemptLocalEntity` (`activation_attempts_local`):
    - Persiste el assignment del attempt pinneado: `attempt_id` (PK), `tenant_id`, `candidate_terminal_id`, `local_status` (`ASSIGNED`, `RUNNING`, `LOCAL_ACTIVATION_EVIDENCE_COMPLETE`, `SYNC_VERIFICATION_PENDING`, `EVIDENCE_ACKED`, `FAIL`), revisiones y fingerprints fiscales/producto, ancla temporal `server_time_anchor_at`, `anchor_monotonic_ticks`, `boot_session_id`.
  - `ActivationCheckResultLocalEntity` (`activation_checks_local`):
    - Persiste evidencia local con constraint de unicidad:
      `UNIQUE (tenant_id, activation_attempt_id, check_code)`.
    - Almacena status (`PASS`, `WARNING`, `FAIL`, `NOT_RUN`), `evidence_type`, `evidence_ref`, `occurred_at`, `recorded_at`, `details_sanitized_json`.
  - `FirstSuccessfulSaleClaimEntity` (`first_successful_sale_claims`):
    - Persiste la semántica write-once para TTFSS con `tenant_id` como Primary Key:
      `UNIQUE (ticket_id)`, `UNIQUE (outbox_event_id)`.
    - Inserción con `OnConflictStrategy.ignore`: una segunda venta o sincronización posterior no puede sobreescribir el claim ganador original.
  - **Migración Floor SQLite**:
    - `migration44_45` en `migrations.dart` con creación de tablas e índices únicos.
    - Incremento de base de datos a `version: 45` en `AppDatabase`.
  - **DAOs con Cumplimiento de Invariante Floor `@transaction`**:
    - `ActivationAttemptLocalDao`: métodos `@transaction` con argumentos posicionales estrictos (regla de no romper generación de código en `.g.dart`).
    - `ActivationCheckResultLocalDao`
    - `FirstSuccessfulSaleClaimDao`

### 1.2 ONB1.8B — Pre-Offline Checks Runner (`apps/pos_app`)
- **`ActivationPreOfflineRunner`**:
  - Orquestador de validación pre-offline en el founder POS que ejecuta secuencialmente y persiste los 6 checks iniciales:
    1. `TERMINAL_LINKED`: Valida que `TerminalIdentityService.resolveDeviceId()` coincida exactamente con `candidateTerminalId`. Rechaza terminales apócrifos o forjados.
    2. `REQUIRED_CONFIG_LOCAL`: Integra con `ActivationRequiredConfigAdapter` para verificar existencia, revisión y SHA-256 fingerprint canónico de la configuración fiscal y producto vendible.
    3. `AUTHORIZED_USER_LOCAL`: Verifica usuario activo en `UserDao` y validación criptográfica de PIN offline en `LocalAuthService`.
    4. `PRINTER_AVAILABLE`: Corrobora el estado del hardware de impresión térmica mediante `PrinterPort`. Requiere estado `ready`.
    5. `TEST_PRINT`: Ejecuta la prueba de alimentación/impresión física y valida la ruta de recibo.
    6. `SQLITE_DURABILITY`: Realiza una prueba transaccional de lectura/escritura en SQLite local para certificar la durabilidad de la base de datos antes de cortar WAN.
  - **Transición de Estado Local**:
    - Si todos los 6 checks son `PASS`: el intento avanza de `ASSIGNED` a `RUNNING` y queda listo para el tramo de venta offline (`isReadyForOffline = true`).
    - Si algún check falla: el intento permanece en `ASSIGNED` y se agregan los blockers correspondientes.

### 1.3 Durabilidad ante Restart y Aislamiento Multi-Tenant
- Verificación en disco (`Directory.systemTemp`): los registros de `ActivationAttemptLocal`, checks y `first_successful_sale_claim` sobreviven el cierre del proceso y reinicio de la base de datos SQLite sin degradación.
- Aislamiento multi-tenant: las consultas de intentos y claims están estrictamente particionadas por `tenantId`.

---

# 2. Evidencia de Ejecución de Pruebas

### 2.1 Floor SQLite Unit & Integration Suites (`flutter test`)
```bash
flutter test test/data/services/activation_required_config_adapter_test.dart test/data/services/activation_required_config_integration_test.dart test/data/services/activation_pre_offline_runner_test.dart
```
- `activation_pre_offline_runner_test.dart`:
  - Test 1: `persists and rehydrates ActivationAttemptLocalEntity in Floor SQLite` -> **PASSED**.
  - Test 2: `persists ActivationCheckResultLocalEntity with uniqueness and idempotent upsert` -> **PASSED**.
  - Test 3: `first_successful_sale_claim write-once semantics: subsequent attempt ignores duplicate insert` -> **PASSED**.
  - Test 4: `multi-tenant isolation: Tenant A and Tenant B data do not cross boundaries` -> **PASSED**.
  - Test 5: `passes all 6 pre-offline checks and transitions attempt to RUNNING` -> **PASSED**.
  - Test 6: `fails TERMINAL_LINKED check when candidate terminal does not match authenticated device identity` -> **PASSED**.
  - Test 7: `fails REQUIRED_CONFIG_LOCAL check when fiscal fingerprint mismatches` -> **PASSED**.
  - Test 8: `fails AUTHORIZED_USER_LOCAL check when offline PIN is invalid` -> **PASSED**.
  - Test 9: `fails PRINTER_AVAILABLE and TEST_PRINT when hardware printer is offline or out of paper` -> **PASSED**.
  - Test 10: `persisted attempt and check results survive SQLite close and reopen` -> **PASSED**.
Total: 32 tests pasados en 3 suites con Floor SQLite real.

---

# 3. Gate de Salida y Criterios de Aceptación Verificados

| Criterio | Estado | Evidencia |
|---|---|---|
| `ActivationAttemptLocal` persiste y rehidrata en Floor SQLite | **CUMPLIDO** | `activation_pre_offline_runner_test.dart` (Test 1, 10) |
| `ActivationCheckResultLocal` con unicidad `(tenant_id, attempt_id, check_code)` | **CUMPLIDO** | `activation_pre_offline_runner_test.dart` (Test 2) |
| `first_successful_sale_claim` con semántica write-once inmutable | **CUMPLIDO** | `activation_pre_offline_runner_test.dart` (Test 3) |
| `TERMINAL_LINKED` corrobora la identidad del dispositivo contra el candidate terminal | **CUMPLIDO** | `activation_pre_offline_runner_test.dart` (Test 5, 6) |
| Pre-offline runner evalúa los 6 checks mandatorios y avanza a `RUNNING` | **CUMPLIDO** | `activation_pre_offline_runner_test.dart` (Test 5) |
| Fallo en impresora, configuración fiscal, usuario o SQLite bloquea el avance a offline | **CUMPLIDO** | `activation_pre_offline_runner_test.dart` (Tests 6, 7, 8, 9) |
| Persistencia sobrevive crash / reinicio del proceso del POS | **CUMPLIDO** | `activation_pre_offline_runner_test.dart` (Test 10) |
| Aislamiento multi-tenant estricto | **CUMPLIDO** | `activation_pre_offline_runner_test.dart` (Test 4) |
| Cumplimiento de regla de Floor `@transaction` con argumentos posicionales | **CUMPLIDO** | DAOs implementados y verificados con build_runner |
