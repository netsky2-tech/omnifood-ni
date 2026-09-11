# NHILOS Client Onboarding V1 — M6 Evidence Receipt: PR-ONB-20 (ONB1.8C–D)

**Documento:** `ONB1.8_M6_PR20_EVIDENCE.md`  
**Ubicación:** `docs/onboarding/evidence/ONB1.8_M6_PR20_EVIDENCE.md`  
**Slices cubiertos:** `ONB1.8C`, `ONB1.8D`  
**Fecha de ejecución:** 2026-09-04  
**Branch:** `feat/backoffice-spa`  
**Metodología:** TDD estricto -> Triangulación -> Integración (Floor SQLite real en disco y memoria) -> E2E local runner sin mocks inventados.

---

# 1. Resumen de Entregables Físicos

### 1.1 ONB1.8C — Controlled Offline Sale Runner (`apps/pos_app`)
- **`ActivationControlledSaleRunner` (`lib/data/services/activation_controlled_sale_runner.dart`)**:
  - Orquestador de la venta de verificación offline bajo aislamiento WAN:
    1. **Precondición Invariante**: Verifica que el intento local esté en estado `RUNNING` (proveniente de la aprobación de los 6 checks pre-offline en `ActivationPreOfflineRunner`). Rechaza intentos en `ASSIGNED` o desconocidos.
    2. **Pinning de Producto de Verificación**: Resuelve el `verificationProductId` asignado por cloud directamente desde el catálogo SQLite local (`ProductDao`). Rechaza si el producto no está presente o está inactivo.
    3. **Ruta de Checkout de Producción Real**:
       - Ejecuta `SalesRepository.saveSale(...)` con el modelo canónico de ventas (`Invoice`, `InvoiceItem`, `Payment`).
       - Asigna numeración DGI legal secuencial (`DgiNumberingServiceImpl`).
       - Alcanza estado `PAID` real con método de pago en efectivo (`cash` en Córdobas `NIO`).
       - No crea tablas ni rutas inventadas de prueba; la venta persiste en `invoices`, `invoice_items`, `payments` e `inventory_movements`.
    4. **Idempotencia Canónica y Prevención de Duplicados**:
       - Clave de idempotencia determinística:
         `onboarding:activation-sale:{tenantId}:{attemptId}`
       - Si el intento ya fue ejecutado o se reintenta el command, **no crea un segundo ticket**. Reutiliza el ticket existente correlacionado.
       - Si se reintenta con parámetros conflictivos (e.g. monto diferente), aborta con `INTEGRITY_CONFLICT`.
    5. **Ruta Real de Recibo e Impresión**:
       - Recorre el hardware de impresión mediante `PrinterPort.printInvoice(...)` con el ticket emitido.
       - Si la impresora falla o está offline, registra `SALE_RECEIPT_PATH` como `FAIL` y bloquea la consolidación.
    6. **Generación de Evidencia Local**:
       - `OFFLINE_SALE_PAID` (`PASS`): Comprobante de ticket emitido y pagado en Floor SQLite.
       - `SALE_RECEIPT_PATH` (`PASS`): Comprobante de salida de recibo físico en hardware de impresión.

### 1.2 ONB1.8D — Outbox Durability & Schema Projection (`apps/pos_app`)
- **Entidades Floor SQLite y Esquema Local (v46)**:
  - `ActivationOutboxEnvelopeEntity` (`activation_outbox_envelopes`):
    - Persiste sobres outbox listos para entrega al backend al volver WAN:
      `id` (PK UUID), `tenant_id`, `activation_attempt_id`, `event_type`, `idempotency_key`, `payload_json`, `payload_hash` (SHA-256), `sync_status` (`PENDING`, `SYNCED`, `FAILED`), `created_at`.
    - Restricción de unicidad:
      `UNIQUE (tenant_id, idempotency_key)`
    - Índice secundario:
      `INDEX (tenant_id, activation_attempt_id)`
  - **DAOs con Cumplimiento de Invariante Floor `@transaction`**:
    - `ActivationOutboxDao` (`lib/data/daos/activation/activation_outbox_dao.dart`): Métodos `@transaction` con argumentos estrictamente posicionales.
  - **Migración Floor SQLite**:
    - `migration45_46` en `lib/data/database/migrations.dart`.
    - Incremento de base de datos a `version: 46` en `AppDatabase`.
- **Consolidación Durable del Outbox**:
  - Antes de restaurar conectividad WAN, se consolidan atómicamente:
    1. Ticket `PAID` en `invoices` (con `sync_status = 'pending'`).
    2. Checks de activación en `activation_checks_local` (`OFFLINE_SALE_PAID`, `SALE_RECEIPT_PATH`, `OUTBOX_DURABLE`).
    3. Envelopes en `activation_outbox_envelopes` con hash SHA-256 inmutable.
  - Generación del check `OUTBOX_DURABLE` (`PASS`).
  - Transición del intento local:
    `RUNNING` -> `LOCAL_ACTIVATION_EVIDENCE_COMPLETE`.
    (El POS permanece en este estado hasta que en PR-21 la reconexión WAN sincronice la evidencia).

### 1.3 Resiliencia ante Reinicio y Aislamiento Multi-Tenant
- **Prueba de Recuperación ante Crash**:
  - Simulación de corte abrupto de energía durante el tramo offline con base de datos real en disco (`$FloorAppDatabase.databaseBuilder` en `Directory.systemTemp`).
  - Al reiniciar y reabrir SQLite: el intento (`LOCAL_ACTIVATION_EVIDENCE_COMPLETE`), el ticket (`PAID`), los 9 checks acumulados (`PASS`) y los envelopes outbox (`PENDING` e íntegros) sobreviven sin pérdida ni corrupción.
- **Aislamiento Multi-Tenant**:
  - Las transacciones y sobres outbox del Inquilino A no cruzan límites ni son visibles por el Inquilino B.

---

# 2. Evidencia de Ejecución de Pruebas

### 2.1 Suites Unitarias y de Triangulación (`flutter test`)
```bash
flutter test test/data/services/activation_controlled_sale_runner_test.dart
```
- `activation_controlled_sale_runner_test.dart`:
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
Total: 12 tests pasados.

### 2.2 Suite E2E de Ciclo Completo con Persistencia Real en Disco
```bash
flutter test test/integration/activation_offline_sale_e2e_test.dart
```
- `activation_offline_sale_e2e_test.dart`:
  - `Full lifecycle with real SQLite disk persistence survives crash before reconnect`:
    - Paso 1: Seed de asignación cloud e identidades en SQLite en disco.
    - Paso 2: Ejecución de `ActivationPreOfflineRunner` (6 checks en PASS, avance a `RUNNING`).
    - Paso 3: Aislamiento WAN -> Ejecución de `ActivationControlledSaleRunner` (checkout real, ticket PAID, recibo impreso, outbox durable, avance a `LOCAL_ACTIVATION_EVIDENCE_COMPLETE`).
    - Paso 4: Cierre abrupto de la conexión SQLite (crash / caída de energía).
    - Paso 5: Re-apertura de la base de datos desde disco -> Validación de rehidratación completa de intento, ticket PAID, los 9 checks y los envelopes outbox con verificación de hash SHA-256.
    - Paso 6: Reintento idempotente tras reinicio -> Confirmación de que no se crea un segundo ticket ni se duplican registros.
Resultado: **PASSED**.

### 2.3 Ejecución de Regresión Acumulada
```bash
flutter test test/data/services/activation_required_config_adapter_test.dart test/data/services/activation_required_config_integration_test.dart test/data/services/activation_pre_offline_runner_test.dart test/data/services/activation_controlled_sale_runner_test.dart test/integration/activation_offline_sale_e2e_test.dart
```
Total acumulado: **45 tests pasados al 100%**.

---

# 3. Gate de Salida y Criterios de Aceptación Verificados

| Criterio | Estado | Evidencia |
|---|---|---|
| Ejecución del production checkout path real (sin tablas de test) | **CUMPLIDO** | `activation_controlled_sale_runner_test.dart` (Test 2) |
| Ticket alcanza estado `PAID` real y persiste localmente | **CUMPLIDO** | `activation_controlled_sale_runner_test.dart` (Test 2) |
| Impresión real de recibo recorrida y validada | **CUMPLIDO** | `activation_controlled_sale_runner_test.dart` (Test 2, 5) |
| Idempotencia: retry del attempt no genera segundo ticket | **CUMPLIDO** | `activation_controlled_sale_runner_test.dart` (Test 3) |
| Detección de conflicto de integridad (`INTEGRITY_CONFLICT`) | **CUMPLIDO** | `activation_controlled_sale_runner_test.dart` (Test 4) |
| Envelopes outbox persistidos con hash SHA-256 inmutable | **CUMPLIDO** | `activation_controlled_sale_runner_test.dart` (Test 6) |
| Estado local avanza a `LOCAL_ACTIVATION_EVIDENCE_COMPLETE` | **CUMPLIDO** | `activation_controlled_sale_runner_test.dart` (Test 2) |
| Durabilidad total tras reinicio/corte de energía (SQLite en disco) | **CUMPLIDO** | `activation_offline_sale_e2e_test.dart` |
| Aislamiento estricto multi-tenant de ventas y sobres outbox | **CUMPLIDO** | `activation_controlled_sale_runner_test.dart` (Test 7) |
| Unicidad en `activation_outbox_envelopes (tenant_id, idempotency_key)` | **CUMPLIDO** | `activation_controlled_sale_runner_test.dart` (Test 12) |
| Regla Floor `@transaction` con argumentos posicionales cumplida | **CUMPLIDO** | DAOs generados con build_runner sin advertencias |
