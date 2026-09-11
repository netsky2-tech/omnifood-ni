# NHILOS Client Onboarding V1 — M2 Evidence Receipt (ONB1.2)

**Documento:** `ONB1.2_M2_EVIDENCE.md`  
**Ubicación:** `docs/onboarding/evidence/ONB1.2_M2_EVIDENCE.md`  
**Slices cubiertos:** `ONB1.2A`, `ONB1.2B`, `ONB1.2C`, `ONB1.2D`, `ONB1.2E`  
**Fecha de ejecución:** 2026-09-03  
**Branch:** `feat/backoffice-spa`  
**Metodología:** TDD estricto -> Triangulación -> Integración -> E2E sin mocks de progreso ni autoridad.

---

# 1. Resumen de Entregables Físicos

### 1.1 Modelos y Tipos de Dominio Frontend
- `apps/owner_dashboard/src/features/onboarding/types.ts`:
  - Enums y contratos normativos: `OnboardingLifecycleState` (`PROVISIONED`, `SETUP_IN_PROGRESS`, `SALE_READY`, `ACTIVATION_IN_PROGRESS`, `ACTIVATED`).
  - `OnboardingSession` con `optimisticVersion`, milestones write-once y flags de auditoría (`legacyBaseline`, `measurementEligible`).
  - Contratos de readiness ports desacoplados: `IdentityReadinessResult`, `FiscalReadinessResult`, `CatalogReadinessResult`, `OnboardingReadinessSnapshot`.
  - Contrato de progreso y pasos: `SetupCenterProgress`, `OnboardingStep`, `OnboardingStepKey`, `OnboardingStepStatus`.

### 1.2 Cliente API y Concurrencia Optimista
- `apps/owner_dashboard/src/features/onboarding/onboarding-api.ts`:
  - `fetchOnboardingSession()`: consulta `GET /api/onboarding/session` (fuente única de verdad del control plane).
  - `fetchOnboardingReadiness()`: consulta `GET /api/onboarding/readiness`.
  - `startOnboardingSession(source)`: inicialización idempotente vía `POST /api/onboarding/session/start`.
  - `isVersionConflictError(error)`: detector de errores 409 `VERSION_CONFLICT` provenientes del bloqueo optimista del backend.

### 1.3 State-based Evaluation Hooks & Reconciliación
- `apps/owner_dashboard/src/features/onboarding/use-onboarding.ts`:
  - `calculateSetupCenterProgress(session, readiness)`: cálculo puro y determinista de estados de pasos (`COMPLETED`, `IN_PROGRESS`, `BLOCKED`), blockers activos, `nextRecommendedAction` y porcentajes sin `useState` efímero.
  - `useOnboardingSession()`: React Query hook con cache unificada, sincronización automática y helpers de invalidación.
  - `useOnboardingReadiness()` y `useStartOnboardingSession()`.
  - Invalidation hooks integrados en `apps/owner_dashboard/src/features/settings/use-settings.ts`: las mutaciones fiscales (`updateFiscalSetup`), de plantillas (`applyIndustryTemplate`) y de importación (`commitImport`) invalidan automáticamente la clave `["onboarding"]`.

### 1.4 Superficie de Presentación y Shell Cutover
- `apps/owner_dashboard/src/features/onboarding/setup-center-view.tsx`:
  - Vista principal del Setup Center consumiendo únicamente session + readiness.
  - Banner interactivo de resolución de concurrencia `VERSION_CONFLICT` con botón de recarga/reconciliación (`reconcile-session-button`).
  - Badges de lifecycle y de versión optimista (`v{optimisticVersion}`).
  - Badge explícito `legacy-baseline-badge` ("Tenant Histórico / Sin métrica TTFSS") para no fabricar métricas históricas.
  - Visualización y CTA de `nextRecommendedAction`.
  - Grid de los 4 pasos obligatorios con estados derivados de la verdad de los dominios.
- `apps/owner_dashboard/src/features/settings/settings-page.tsx`:
  - Integración del tab `Setup Center (M2)` manteniendo retrocompatibilidad absoluta con W9 (`initialTab="fiscal"` por defecto para tests legados).
- `apps/owner_dashboard/src/features/onboarding/onboarding-page.tsx`:
  - Página dedicada del Setup Center en la ruta `/onboarding`.
- `apps/owner_dashboard/src/app/router.tsx` & `sidebar.tsx`:
  - Registro de la ruta `/onboarding` y enlace en la barra de navegación para roles `OWNER` y `MANAGER`.

---

# 2. Evidencia de Ejecución de Pruebas

### 2.1 Frontend Tests (Vitest)
Comando ejecutado:
```bash
npm --prefix apps/owner_dashboard test -- --run
```
**Resultado:**
- `src/__tests__/onboarding-api.test.ts` — PASS (11/11 tests)
  - Endpoints de sesión, readiness e inicio.
  - Detección precisa de `VERSION_CONFLICT`.
  - Cálculo de progreso libre de `useState`.
  - Detección de tenants preconfigurados sin clics artificiales.
  - Invariante de `legacyBaseline` y preservación de inmutabilidad.
  - Triangulación: Catálogo cargado con fiscal pendiente redirige a fiscal.
  - Triangulación: Ciclo completo `ACTIVATED` al 100%.
- `src/__tests__/setup-center-view.test.tsx` — PASS (6/6 tests)
  - Renderizado state-based desde sesión y readiness backend.
  - Renderizado de estado `SALE_READY` con paso de activación desbloqueado.
  - Renderizado de badge de tenant histórico.
  - Banner de alerta ante `VERSION_CONFLICT` con reconciliación exitosa.
  - Triangulación de navegación hacia tabs fiscal/plantillas.
  - Triangulación de reintentos ante error de red/servidor.
- `src/__tests__/onboarding-m2-e2e.test.tsx` — PASS (3/3 tests)
  - Reanudación y rehidratación limpia a través de recargas simuladas y dispositivos concurrentes sin estado efímero en memoria.
  - Concurrencia de 2 tabs con resolución graciosa de `VERSION_CONFLICT` y recarga a la versión del backend.
  - Compatibilidad completa de navegación entre Setup Center y W9 en `SettingsPage`.
- `src/__tests__/w9-settings.test.tsx` — PASS (11/11 tests)
- `src/__tests__/w9-e2e-settings.test.tsx` — PASS (6/6 tests)
- `src/__tests__/w9-settings-api.test.ts` — PASS (21/21 tests)

**Total Frontend:** 28 suites pasadas, 496 tests verdes.

### 2.2 Backend Tests (PostgreSQL Real, Cero Mocks)
Comando ejecutado:
```bash
npm --prefix apps/admin_backend run test:e2e -- --testPathPattern="onboarding"
```
**Total Backend E2E:** 7 suites pasadas, 42 tests verdes sobre base de datos PostgreSQL real.

Comando ejecutado:
```bash
npm --prefix apps/admin_backend test -- --testPathPattern="onboarding"
```
**Total Backend Unit:** 13 suites pasadas, 67 tests verdes.

---

# 3. Gate de Salida ONB1.2 (M2)

- [x] **Reload/reopen conserva progreso sin depender de memoria del browser.** (Verificado en `onboarding-m2-e2e.test.tsx`).
- [x] **Step completeness proviene de domain state/readiness.** (Verificado en `onboarding-api.test.ts` y `setup-center-view.test.tsx`).
- [x] **Configuración preexistente se reconoce sin acción artificial.** (Verificado con preconfigured-tenant fixture).
- [x] **Dos tabs reciben/reconcilian cambios sin lost-update visual.** (Verificado en `onboarding-m2-e2e.test.tsx` con error 409 y reconciliación).
- [x] **W9 deja de usar `useState` como authority de progress.** (Progreso gobernado por `useOnboardingSession`).
- [x] **Ningún writer nuevo de Template/Import se expone todavía si sus guards M3/M4 no están verificados.**
- [x] **Tenant isolation y permission deny se mantienen desde la primera route del Setup Center.**
- [x] **Legacy `measurementEligible=false` se representa sin fabricar timestamps.** (Badge explícito de tenant histórico).

---

# 4. Próximos Pasos

Avanzar hacia:
- **ONB1.3 — Industry Template Safe Cutover (M3)**: Normalización de templates globales con identificador y versión estables, recetas nacidas en `DRAFT / SUGGESTED` sin deducción de inventario, escaneo de provenance y eliminación de side-effects falsos de stock y costo.
- **ONB1.4 — Product Import Safe Cutover (M4)**: Guard backend en commit service, eliminación de alias `codigo_barras -> sku`, `ImportContractVersion` canónico y raw CSV parsing sin tocar Kardex ni CPP.
