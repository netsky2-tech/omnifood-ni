# SOHO — Perfil de Negocio: Modo de Operación y Modo FX Checkout en Web (BXW-007)

## Goal
Permitir que el dueño/gerente configure desde la Web (Owner Dashboard) la política operativa y comercial del negocio sin depender de la tablet en el mostrador, y que esa política descienda de forma atómica a **todas** las terminales POS:
1. `operationMode`: modo operativo del local.
2. `checkoutFxMode`: tasa de cambio usada al cobrar en divisas.

## Decisiones bloqueadas (usuario, 2026-09-30)
- **D-1 Autoridad**: **Web es master**. El sync del snapshot escribe `operation_mode` / `checkout_fx_mode` en `local_configs` y el POS pasa esos dos campos a **solo lectura** (indicando "definido por la oficina"). Si la nube nunca los proveyó, el valor local sigue vigente y editable (fail-safe para tenants pre-aprobados y para trabajo offline).
- **D-2 Vocabulario**: canon = vocabulario del POS → `FOODPARK_QSR | RESTAURANT | HYBRID` y `COMMERCIAL | BCN_OFFICIAL`. El `operationMode: 'FOOD_PARK'` de `modules/fulfillment` **NO se toca** (dominio distinto: topología de fulfillment). Follow-up registrado en BXW-010.

## Por qué esto es Office y no Floor
- Política, no operación: el dueño decide la tasa con la que se recibe divisas y el modelo de despacho.
- Anti-fraude en caja: si la tasa vive en la tablet, un operador la cambia y reporta a otra.
- Multi-terminal: con 2+ cajas en un Food Park, configurar por tablet garantiza divergencia. Con web + snapshot, todas las cajas reciben la misma revisión atómicamente.

## Slices (un PR por work unit; nunca el branch acumulado)
- [x] **U1 Backend** — `FiscalSetupDto` + `FISCAL_PARAM_KEYS` + persistencia/versionado + snapshot.
  - Evidencia: `npm test` 3283 passed/3291 (8 skipped) · `test:e2e -- --runInBand` 681 passed/681 (Postgres real) · `tsc --noEmit` exit 0 · delta de lint contra HEAD = 0 (129/68/61 en ambos lados).
  - Contracts: `operationMode` y `checkoutFxMode` son REQUIRED en `FiscalSetupDto` y `FiscalSetupResponse` (sin `@IsDefined` como muleta); lectura con whitelist de enum + fallback `FOODPARK_QSR`/`COMMERCIAL`; opcionales en `FiscalConfigSnapshot` para no romper los 12 callers.
- [ ] **U2 Dashboard** — `types.ts` (Zod) + `fiscal-setup-form.tsx` (selectores accesibles NHILOS) + tests.
- [ ] **U3 POS** — proyección `FiscalProjectionKeys` (+ bump `currentVersion` 1→2) + pantalla Business Profile en modo lectura cuando la nube manda + tests Dart.

## Nota de scope aprendida en U1
Agregar campos REQUIRED a un DTO de límite obliga a actualizar TODAS las suites que POSTean esa ruta, incluidas las `*.db.e2e-spec.ts` de Postgres real. `test/onboarding/fiscal-setup.e2e-spec.ts` usa DataSource simulado, así que es estructuralmente ciego al ValidationPipe: verde ahí no prueba el límite. Al cambiar un DTO de límite, grepear `test/` por la ruta del endpoint y por las claves del payload.

## Riesgo conocido y aceptado (U1)
Agregar campos a `EffectiveFiscalPayload` cambia el fingerprint JCS de **todos** los tenants → `recordRevisionChange` genera **una revisión extra por tenant** en su próximo guardado. Es upgrade-only y seguro: la anti-bajada del POS sólo rechaza revisiones menores. Debe anunciarse en el PR.

## Evidence & Verification
- Backend: `fiscal-setup.dto.spec.ts`, `fiscal-setup.service.spec.ts`, `fiscal-config-version.service.spec.ts` (+ `.db.spec.ts`), e2e onboarding.
- POS: `test/data/services/fiscal_inbox_handler_test.dart`, `test/ui/features/config/business_profile_view_model_test.dart`.
- Dashboard: `src/__tests__/fiscal-dgi-authorization.test.tsx` como referencia de patrón.
