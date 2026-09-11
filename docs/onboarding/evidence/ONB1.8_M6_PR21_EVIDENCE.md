# NHILOS Client Onboarding V1 — M6 Evidence Receipt: PR-ONB-21 (ONB1.8E–H)

**Documento:** `ONB1.8_M6_PR21_EVIDENCE.md`  
**Ubicación:** `docs/onboarding/evidence/ONB1.8_M6_PR21_EVIDENCE.md`  
**Slices cubiertos:** `ONB1.8E`, `ONB1.8F`, `ONB1.8G`, `ONB1.8H` (Cierre total de Hito M6)  
**Fecha de ejecución:** 2026-09-04  
**Branch:** `feat/backoffice-spa`  
**Metodología:** TDD estricto -> Triangulación -> Integración (Floor SQLite real en disco y memoria) -> E2E local runner sin mocks inventados.

---

# 1. Resumen de Entregables Físicos

### 1.1 ONB1.8E — First Successful Sale Claim (TTFSS) (`apps/pos_app`)
- **Inserción Atómica Write-Once**:
  - Inserción en `FirstSuccessfulSaleClaimEntity` (`first_successful_sale_claims` en SQLite Floor v46) mediante `FirstSuccessfulSaleClaimDao.insertClaim(...)` con semántica `OnConflictStrategy.ignore` (`INSERT OR IGNORE`).
  - La clave primaria física `PRIMARY KEY (tenant_id)` garantiza a nivel de motor SQLite que no puede existir más de un claim por inquilino en el alcance fundador.
- **Emisión Exclusiva del Claim Ganador**:
  - Solo la venta que efectivamente gana la inserción atómica emite el sobre outbox con `eventType: 'FIRST_SUCCESSFUL_SALE_OBSERVED'` e `idempotencyKey: 'onboarding:first-sale:{tenantId}'`.
  - Si ocurre una venta posterior (o se reintenta el runner), la inserción es ignorada sin error, el ticket ganador existente permanece inalterado y **NO se emite un segundo sobre outbox**.
  - Si una venta posterior sincroniza primero con la nube, jamás puede ganar ni adulterar el TTFSS histórico debido a la inmutabilidad física del claim registrado.

### 1.2 ONB1.8F — Clock Semantics (`apps/pos_app`)
- **`ActivationClockManager` (`lib/data/services/activation_clock_manager.dart`)**:
  - Encargado de la resolución y anclaje temporal de evidencia:
    - `serverTimeAnchorAt`: Timestamp UTC provisto por el backend al asignar el intento.
    - `anchorMonotonicTicks`: Microsegundos del reloj monotónico (`Stopwatch`) al momento de establecer el anclaje.
    - `bootSessionId`: Identificador UUID único de la sesión de inicio de la app.
    - `anchoredOccurredAt`: Calculado monotónicamente dentro de la misma sesión:
      $$\text{anchoredOccurredAt} = \text{serverTimeAnchorAt} + (\text{currentMonotonicTicks} - \text{anchorMonotonicTicks})$$
    - `clockConfidence`:
      - `ANCHORED`: Dentro de la misma boot session y progresión monotónica válida.
      - `DEVICE_VALIDATED`: Posterior a reinicio (`bootSessionId` distinto) con reloj del dispositivo verificado y plausible.
      - `DEGRADED`: Detección de anomalías de reloj (ticks negativos o desvío severo hacia el pasado antes del ancla).
  - Evita que reinicios del terminal o saltos artificiales del reloj de pared adulteren timestamps locales de evidencia.

### 1.3 ONB1.8G — Reconnect / Evidence Sync Runner (`apps/pos_app`)
- **`ActivationReconnectSyncRunner` (`lib/data/services/activation_reconnect_sync_runner.dart`)**:
  - Gestiona la transición del intento y la entrega de evidencia al restaurar WAN:
    $$\text{LOCAL\_ACTIVATION\_EVIDENCE\_COMPLETE} \longrightarrow \text{SYNC\_VERIFICATION\_PENDING} \longrightarrow \text{EVIDENCE\_ACKED}$$
  - **Vaciado de Sobres Outbox**:
    - Transfiere los sobres pendientes de `activation_outbox_envelopes` hacia los endpoints cloud (`/api/v1/onboarding/activation/attempts/:id/checks`).
    - Al recibir ACK (200/201), actualiza `syncStatus = 'SYNCED'` en SQLite.
    - Si la WAN se interrumpe durante la sincronización, los sobres no entregados permanecen `PENDING` y el intento se mantiene en `SYNC_VERIFICATION_PENDING`. **El POS jamás se declara `ACTIVATED` unilateralmente**.
  - **Clasificación Autoritativa Cloud**:
    - Una vez alcanzado `EVIDENCE_ACKED`, consulta al backend finalizer (`/finalize`).
    - Adopta el veredicto del backend:
      - `PASS` $\rightarrow$ `ACTIVATED`.
      - `PASS_WITH_WARNING` $\rightarrow$ `ACTIVATED_WITH_WARNING`.
      - `FAIL` $\rightarrow$ `FAILED`.
    - Si el backend no responde, permanece en `EVIDENCE_ACKED` esperando reintento.

### 1.4 ONB1.8H — Verification Sale Cleanup Path (`apps/pos_app`)
- **`ActivationVerificationSaleCleanupRunner` (`lib/data/services/activation_verification_sale_cleanup_runner.dart`)**:
  - Si la venta de verificación controlada debe corregirse o anularse:
    - Utiliza la ruta normal de producción en `SalesRepository.voidInvoice(ticketId, reason)`.
    - Cumplimiento fiscal estricto DGI (Disposición Técnica 09-2007): marca `is_canceled = true` y `void_reason = reason`. **El ticket NUNCA es eliminado (`DELETE`) de SQLite**.
    - Demuestra formalmente que la anulación del ticket no borra ni invalida el registro histórico de `first_successful_sale_claims` ni altera el `firstSuccessfulSaleAt` histórico registrado.

---

# 2. Evidencia de Ejecución de Pruebas

### 2.1 Pruebas Unitarias de Clock Semantics
```bash
flutter test test/data/services/activation_clock_manager_test.dart
```
- `activation_clock_manager_test.dart`:
  - `calculates anchoredOccurredAt with ANCHORED confidence when anchor is set and in same boot session` -> **PASSED**.
  - `degrades or falls back to DEVICE_VALIDATED when reboot occurred and bootSessionId differs` -> **PASSED**.
  - `marks clock confidence as DEGRADED when wall clock jumped backwards before anchor time` -> **PASSED**.
  - `marks clock confidence as DEGRADED when monotonic ticks go backwards (clock anomaly)` -> **PASSED**.
  - `resolves to DEVICE_VALIDATED when no server anchor was ever registered` -> **PASSED**.
Total: 5 tests pasados al 100%.

### 2.2 Pruebas Unitarias de Controlled Offline Sale Runner con TTFSS Claim
```bash
flutter test test/data/services/activation_controlled_sale_runner_test.dart
```
- Tests acumulados en `activation_controlled_sale_runner_test.dart`:
  - Test 1: `fails if attempt is not in RUNNING state (pre-condition gate)` -> **PASSED**.
  - Test 2: `executes real production checkout, reaches PAID, persists ticket locally, and prints receipt` -> **PASSED**.
  - Test 3: `retry of attempt does not create a second verification ticket (idempotency)` -> **PASSED**.
  - Test 4: `rejects attempt retry when payload parameters conflict (INTEGRITY_CONFLICT)` -> **PASSED**.
  - Test 5: `fails if receipt printer is offline or broken` -> **PASSED**.
  - Test 6: `consolidates durable outbox envelopes before WAN reconnect` -> **PASSED**.
  - Test 7: `multi-tenant isolation: Tenant A envelopes and sales do not cross Tenant B boundaries` -> **PASSED**.
  - Test 8: `offline sale and outbox envelopes survive database close and reopen (Disk Persistence)` -> **PASSED**.
  - Test 9: `fails if verification product is missing from SQLite catalog` -> **PASSED**.
  - Test 10: `fails if attempt is not found in SQLite` -> **PASSED**.
  - Test 11: `fails if tenant mismatch occurs between attempt and parameter` -> **PASSED**.
  - Test 12: `activation_outbox_envelopes enforces uniqueness on (tenant_id, idempotency_key)` -> **PASSED**.
  - Test 13 (ONB1.8E): `creates atomic FirstSuccessfulSaleClaimEntity and emits FIRST_SUCCESSFUL_SALE_OBSERVED outbox envelope` -> **PASSED**.
  - Test 14 (ONB1.8E): `write-once invariant: second sale or attempt retry NEVER overwrites winning claim nor emits second FIRST_SUCCESSFUL_SALE_OBSERVED` -> **PASSED**.
  - Test 15 (ONB1.8E): `claim survives database restart with real SQLite disk persistence` -> **PASSED**.
Total: 15 tests pasados al 100%.

### 2.3 Pruebas Unitarias de Reconnect & Evidence Sync Runner
```bash
flutter test test/data/services/activation_reconnect_sync_runner_test.dart
```
- Tests en `activation_reconnect_sync_runner_test.dart`:
  - Test 1: `fails if attempt is not in LOCAL_ACTIVATION_EVIDENCE_COMPLETE or SYNC_VERIFICATION_PENDING` -> **PASSED**.
  - Test 2: `transitions through SYNC_VERIFICATION_PENDING and flushes all outbox envelopes to cloud` -> **PASSED**.
  - Test 3: `when WAN drops during sync, leaves un-synced envelopes as PENDING and attempt in SYNC_VERIFICATION_PENDING (NEVER ACTIVATED)` -> **PASSED**.
  - Test 4: `POS waits for cloud authoritative finalizer verdict: adopts PASS -> ACTIVATED` -> **PASSED**.
  - Test 5: `POS waits for cloud authoritative finalizer verdict: adopts PASS_WITH_WARNING -> ACTIVATED_WITH_WARNING` -> **PASSED**.
  - Test 6: `cloud unavailable during finalize leaves attempt in EVIDENCE_ACKED, POS NEVER assumes ACTIVATED unilaterally` -> **PASSED**.
  - Test 7: `reconnect sync state survives restart with real SQLite disk persistence` -> **PASSED**.
Total: 7 tests pasados al 100%.

### 2.4 Pruebas Unitarias de Verification Sale Cleanup Path
```bash
flutter test test/data/services/activation_verification_sale_cleanup_runner_test.dart
```
- Tests en `activation_verification_sale_cleanup_runner_test.dart`:
  - Test 1: `voids verification sale using normal Sales VOID path (is_canceled: true, NEVER DELETE)` -> **PASSED**.
  - Test 2: `demonstrates that VOID of verification ticket does NOT delete or invalidate historical firstSuccessfulSale claim` -> **PASSED**.
Total: 2 tests pasados al 100%.

### 2.5 Suite E2E de Cierre de Hito M6 (ONB1.8A–H) con Persistencia Real en Disco
```bash
flutter test test/integration/activation_lifecycle_m6_closure_e2e_test.dart
```
- `activation_lifecycle_m6_closure_e2e_test.dart`:
  - `Runs full M6 lifecycle: Pre-offline -> Offline Sale & TTFSS Claim -> Crash Recovery -> Reconnect Sync -> Normal VOID`:
    - Fase 1: Seed de identidades, numeración DGI y anclaje de reloj en base de datos SQLite en disco.
    - Fase 2: Ejecución de `ActivationPreOfflineRunner` (6 checks en PASS, avance a `RUNNING`).
    - Fase 3: Corte WAN -> Ejecución de `ActivationControlledSaleRunner` (checkout real de producción, ticket PAID, hardware de impresión recorrido, claim de TTFSS emitido en SQLite con `clockConfidence: 'ANCHORED'`, sobre outbox `FIRST_SUCCESSFUL_SALE_OBSERVED` generado, consolidación de outbox durable, avance a `LOCAL_ACTIVATION_EVIDENCE_COMPLETE`).
    - Fase 4: Corte súbito de energía (cierre forzado de la conexión SQLite).
    - Fase 5: Reinicio y reapertura de SQLite desde disco -> Verificación de durabilidad del intento, ticket PAID, los 9 checks, el claim ganador y sobres outbox pendientes íntegros.
    - Fase 6: Restauración WAN -> Ejecución de `ActivationReconnectSyncRunner` (avance a `SYNC_VERIFICATION_PENDING`, entrega exitosa de todos los sobres outbox, avance a `EVIDENCE_ACKED`, consulta y recepción de veredicto autoritativo del backend finalizer `PASS`, adopción de `ACTIVATED`).
    - Fase 7: Ejecución de `ActivationVerificationSaleCleanupRunner` (anulación normal fiscal DGI con `is_canceled: true`, constatación de que la factura NO fue borrada, y verificación de que el claim `FirstSuccessfulSaleClaimEntity` histórico permanece intacto).
Resultado: **PASSED**.

### 2.6 Ejecución de Regresión Acumulada de Activación
```bash
flutter test test/data/services/activation* test/integration/activation*
```
Total acumulado: **63 tests pasados al 100% en 4 segundos**.

---

# 3. Matriz de Criterios de Aceptación Cumplidos

| Criterio / Invariante | Estado | Evidencia |
|---|---|---|
| Inserción de claim atómico write-once en `first_successful_sale_claims` | **CUMPLIDO** | `activation_controlled_sale_runner_test.dart` (Test 13, 14, 15) |
| Solo el claim ganador emite `FIRST_SUCCESSFUL_SALE_OBSERVED` | **CUMPLIDO** | `activation_controlled_sale_runner_test.dart` (Test 13, 14) |
| Venta posterior o desfasada no puede sobreescribir el TTFSS histórico | **CUMPLIDO** | `activation_controlled_sale_runner_test.dart` (Test 14) |
| Semántica de reloj anclada monotónicamente (`serverTimeAnchorAt`, `anchorMonotonicTicks`, `bootSessionId`) | **CUMPLIDO** | `activation_clock_manager_test.dart` (Test 1–5) |
| Transición `LOCAL_ACTIVATION_EVIDENCE_COMPLETE` -> `SYNC_VERIFICATION_PENDING` -> `EVIDENCE_ACKED` | **CUMPLIDO** | `activation_reconnect_sync_runner_test.dart` (Test 2, 4, 5) |
| POS no muestra `ACTIVATED` unilateralmente; espera clasificación autoritativa de backend | **CUMPLIDO** | `activation_reconnect_sync_runner_test.dart` (Test 3, 4, 5, 6) |
| Anulación de verificación usa ruta legal normal VOID (DGI 09-2007: `is_canceled: true`, nunca DELETE) | **CUMPLIDO** | `activation_verification_sale_cleanup_runner_test.dart` (Test 1) |
| El VOID del ticket no borra ni invalida el `firstSuccessfulSaleAt` histórico registrado | **CUMPLIDO** | `activation_verification_sale_cleanup_runner_test.dart` (Test 2), `activation_lifecycle_m6_closure_e2e_test.dart` |
| Resiliencia completa ante cortes de energía con SQLite Floor real en disco | **CUMPLIDO** | `activation_lifecycle_m6_closure_e2e_test.dart` |

---

# 4. Estado de Roadmap y Hito M6

- **Hito M6 (POS Activation Runner + TTFSS Claim)**: **100% CERRADO**.
  - `PR-ONB-19` (ONB1.8A–B): Cerrado (Proyección local SQLite Floor v45 + Pre-offline checks runner).
  - `PR-ONB-20` (ONB1.8C–D): Cerrado (Venta controlada real offline + Durabilidad outbox v46).
  - `PR-ONB-21` (ONB1.8E–H): Cerrado (TTFSS Claim write-once + Clock Semantics monotónicas + Reconnect Sync Runner + Normal VOID cleanup path).
