# NHILOS Client Onboarding V1 — M5 Evidence Receipt: PR-ONB-16 (ONB1.6D–F)

**Documento:** `ONB1.6_M5_PR16_EVIDENCE.md`  
**Ubicación:** `docs/onboarding/evidence/ONB1.6_M5_PR16_EVIDENCE.md`  
**Slices cubiertos:** `ONB1.6D`, `ONB1.6E`, `ONB1.6F`  
**Fecha de ejecución:** 2026-09-04  
**Branch:** `feat/backoffice-spa`  
**Metodología:** TDD estricto -> Triangulación -> Integración (PostgreSQL real & Floor SQLite real) -> E2E sin mocks de persistencia.

---

# 1. Resumen de Entregables Físicos

### 1.1 ONB1.6D — Verification Product Local Readiness (`apps/admin_backend` & `apps/pos_app`)
- **Product Master Sync Reutilizado**:
  - `InboundSyncProductDto` y `InboundSyncService` proyectan `tenantId` explícito en los deltas maestros de productos hacia el POS, sin inventar catálogos paralelos para Onboarding.
  - En POS (`apps/pos_app`), `ProductEntity` incorpora `tenantId` y se aplica la migración Floor 43 -> 44 (`migration43_44`) con índice `idx_products_tenant_id`.
- **Candidate Resolution & Pinning Contract (Cloud)**:
  - `OnboardingCatalogService.getVerificationProductCandidate(tenantId, requestedProductId?)`:
    - Resuelve el producto candidato activo y vendible del tenant fundador.
    - Genera `verificationProductFingerprint` canónico determinista mediante RFC-8785 JCS SHA-256 (`id`, `isActive`, `name`, `sellPrice`, `tenantId`, `uom`) y `verificationProductRevision: 1`.
    - Valida aislamiento multi-tenant terminante: si un producto pertenece al Tenant B, un intento de candidate pinning desde Tenant A es rechazado con `BadRequestException`.
    - Valida que `sellPrice > 0` y `is_active = true`.
  - Expuesto en controlador: `GET /onboarding/catalog/verification-candidate?productId=...`.
- **Comprobación Local en POS**:
  - `ActivationRequiredConfigAdapter.checkRequiredConfigLocal`:
    - Verifica existencia en SQLite (`ProductDao.findProductById`).
    - Valida pertenencia al tenant efectivo (`product.tenantId == effectiveTenantId`).
    - Valida estado vendible (`isActive == true`, `sellPrice > 0`).
    - Valida concordancia de `verificationProductFingerprint` si está pinneado.

### 1.2 ONB1.6E — Authorized User Local Readiness (`apps/pos_app`)
- **Offline Credential Contract Reutilizado**:
  - Reutiliza el material local de `UserEntity` y `SecurityProfileEntity` (BCrypt `pin_hash`, TOTP encrypted seeds).
  - Cero duplicación de contraseñas ni stores paralelos de identidad.
- **Demostración de `AUTHORIZED_USER_LOCAL`**:
  - `ActivationRequiredConfigAdapter.checkAuthorizedUserLocal`:
    - Localiza al usuario en SQLite Floor por ID, email o username.
    - Valida pertenencia al tenant efectivo (`user.tenantId == effectiveTenantId`).
    - Valida que el usuario está activo (`user.isActive == true`).
    - Valida presencia de credencial offline en `security_profiles` (`isPinEnabled` o `isTotpEnabled`).
    - Si se pasa un PIN de prueba, ejecuta verificación BCrypt con `LocalAuthService.verifyPin` sin emitir ningún request WAN.
    - Ausencia de credencial, usuario foráneo de otro tenant o PIN erróneo produce `AUTHORIZED_USER_LOCAL: FAIL`.

### 1.3 ONB1.6F — Activation Required-Config Adapter (`apps/pos_app` & `apps/admin_backend`)
- **Adapter Unificado de Checks Locales**:
  - `ActivationRequiredConfigAdapter.evaluateAll`:
    - `REQUIRED_CONFIG_LOCAL`: Valida snapshot fiscal exacto/coherente en `fiscal_config_local` (revisión, fingerprint y payload no corrupto) **Y** producto de verificación listo y coherente localmente.
    - `AUTHORIZED_USER_LOCAL`: Valida credenciales e identidad del usuario autorizado localmente.
    - Produce un resumen estructurado `ActivationAdapterSummary` (`isReady: boolean`, `blockers: string[]`).
- **Invariante Cloud**:
  - Una configuración local stale, inconsistente o corrupta en el POS bloquea la activación en el terminal (`isReady = false`, `status = FAIL`), pero **NO** altera ni degrada el estado `SALE_READY` en la nube (`OnboardingSession`).

---

# 2. Evidencia de Tests y Cobertura Real

### 2.1 Backend Unit & Triangulation (`apps/admin_backend`)
```bash
npm test -- --testPathPattern="(onboarding-catalog|inbound-sync|onboarding-state.reconciler)"
```
Resultado:
- `onboarding-catalog.service.spec.ts`: 10 tests passed (candidate resolution, default pick, tenant isolation, price/active validation, deterministic fingerprint).
- `onboarding-catalog.controller.spec.ts`: 6 tests passed (route delegation, auth & tenant enforcement).
- `inbound-sync.service.spec.ts`: 8 tests passed (product deltas with explicit `tenantId`, fiscal snapshot and ACK).
- `onboarding-state.reconciler.spec.ts`: 4 tests passed (`SALE_READY` preservation invariant under local activation failure).
Total: 28 tests passed en backend.

### 2.2 Flutter Floor SQLite Unit & Integration Tests (`apps/pos_app`)
```bash
flutter test test/data/services/activation_required_config_adapter_test.dart test/data/services/activation_required_config_integration_test.dart
```
Resultado:
- `activation_required_config_adapter_test.dart`: 21 tests passed (persistencia real SQLite Floor):
  - **ONB1.6D**:
    - PASS: Producto existe en SQLite, pertenece al tenant y es vendible.
    - PASS: Fingerprint canónico coincide con SHA-256.
    - FAIL: Producto no existe en SQLite.
    - FAIL: Producto pertenece a Tenant B (aislamiento).
    - FAIL: Producto inactivo.
    - FAIL: Producto con sellPrice <= 0.
    - FAIL: Fingerprint mismatch.
  - **ONB1.6E**:
    - PASS: Usuario existe para tenant, activo y PIN offline verificado sin WAN.
    - PASS: Resolución por email.
    - FAIL: Usuario no existe en SQLite.
    - FAIL: Usuario pertenece a Tenant B (aislamiento).
    - FAIL: Usuario inactivo.
    - FAIL: Perfil de seguridad ausente.
    - FAIL: Credenciales offline deshabilitadas.
    - FAIL: PIN offline incorrecto.
  - **ONB1.6F**:
    - FAIL: Config fiscal ausente.
    - FAIL: Revisión fiscal stale/desfasada.
    - FAIL: Fingerprint fiscal alterado (conflicto de integridad).
    - FAIL: Payload fiscal corrupto.
    - `evaluateAll`: `isReady = true` cuando todos los checks pasan.
    - `evaluateAll`: Bloquea activación (`isReady = false`) y agrega blockers cuando fallan checks.
- `activation_required_config_integration_test.dart`: 1 test passed (E2E Two-Tenant & Offline Restart):
  - Inserción en SQLite en disco de Tenant Alpha y Tenant Beta.
  - Cierre y reapertura de la base de datos Floor simulando reinicio del terminal sin WAN.
  - Verificación de que Tenant Alpha evalúa legítimamente sus propios datos en PASS.
  - Verificación de que Tenant Alpha es bloqueado si intenta referenciar producto o usuario de Tenant Beta.
  - Verificación de que Tenant Beta evalúa legítimamente sus propios datos en PASS.

Total acumulado en POS: 33 tests en 5 suites SQLite reales.

---

# 3. Gate de Salida M5 (ONB1.6 Completo)

- [x] `{revision, fingerprint}` fiscal cloud llega a SQLite (`PR-ONB-15`).
- [x] Duplicate inbound fiscal config es no-op (`PR-ONB-15`).
- [x] Same revision + different fingerprint produce integrity conflict (`PR-ONB-15`).
- [x] Verification Product pinneado está disponible localmente antes del tramo offline (`PR-ONB-16`).
- [x] Producto faltante/stale/inconsistente produce `REQUIRED_CONFIG_LOCAL=FAIL` (`PR-ONB-16`).
- [x] Usuario autorizado puede autenticarse localmente antes de cortar WAN (`PR-ONB-16`).
- [x] Falta de credencial/material local produce `AUTHORIZED_USER_LOCAL=FAIL` (`PR-ONB-16`).
- [x] POS puede leer Fiscal + Product + Identity required state después de restart sin WAN (`PR-ONB-16`).
- [x] Config local stale/mismatched bloquea Activation, no `SALE_READY` cloud (`PR-ONB-16`).
- [x] Tenant A no recibe/aplica config, producto o identity material de Tenant B (`PR-ONB-16`).
