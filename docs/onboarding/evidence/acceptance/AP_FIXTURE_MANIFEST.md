# NHILOS Client Onboarding V1 — Acceptance Fixture Manifest

**Documento:** `AP_FIXTURE_MANIFEST.md`  
**Ubicación:** `docs/onboarding/evidence/acceptance/AP_FIXTURE_MANIFEST.md`  
**Estado:** **NOT FROZEN — identidad de release NO congelada (pendiente de FREEZE-05); fixtures deterministas creados; hardware y datos de campo pendientes**

**Versión:** 1.0 (identidad de release pendiente de acuñar; fixtures F2–F5 creados; hardware fixture pendiente de captura en campo)
**Fecha de creación:** 2026-09-04  
**Autoridad:** `onboarding_acceptance_plan_v1.0.md` §4

---

# 0. Instrucciones

Este manifest se congela **una sola vez** antes del primer acceptance run. Cualquier cambio de código, migration, configuración funcional o fixture requiere un nuevo manifest y un nuevo `acceptanceReleaseId`.

**El `acceptanceReleaseId` NO está acuñado todavía.** Se genera una sola vez en FREEZE-05, después de que todos los cambios que afectan release (código, migraciones, configuración funcional y fixtures) estén estabilizados. Los valores de identidad de release anteriores estaban desactualizados y fueron retirados.

Los campos marcados con `«COMPLETAR»` deben llenarse con datos reales antes de ejecutar AP-00.

---

# 1. Release Identity

**ESTADO: NOT FROZEN / PENDIENTE.** Identidad de release no congelada — se fija en FREEZE-05 sobre la frontera final aplicación-fixture.

| Campo | Valor |
|---|---|
| `acceptanceReleaseId` | **NOT FROZEN** — «COMPLETAR EN FREEZE-05: derivar del commit final de release + última migración + stage» |
| Fecha de congelación | «COMPLETAR EN FREEZE-05: fecha/hora exacta de firma» |
| Branch congelada | «COMPLETAR EN FREEZE-05: branch del commit de release» |
| Último commit congelado | «COMPLETAR EN FREEZE-05: SHA del commit de release» |

---

# 2. Builds

| Componente | Commit SHA | Build / Image | Notas |
|---|---|---|---|
| Backend (NestJS) | «COMPLETAR EN FREEZE-05: SHA del commit de release» | NestJS ^11.0.1 / TypeORM ^0.3.28 | `apps/admin_backend` |
| Owner Dashboard | «COMPLETAR EN FREEZE-05: SHA del commit de release» | v0.0.0 (SPA build) | `apps/owner_dashboard` |
| POS (Flutter) | «COMPLETAR EN FREEZE-05: SHA del commit de release» | pubspec declara `1.0.0+1`; «COMPLETAR: build number del APK tras flutter build apk» | `apps/pos_app` — Dart SDK ^3.11.5 |
| Database migration version | `1809040000000-CreateHumanAuthorizationTenantPublicationState` | Última migración TypeORM del árbol (verificada en `apps/admin_backend/src/migrations/`) | PostgreSQL |
| SQLite schema version | `52` | Floor database version (`apps/pos_app/lib/data/database/app_database.dart`) | POS local |

---

# 3. Feature Flags / Cutover State

Flags según `OnboardingFeatureRolloutService` — estado congelado para acceptance:

| Flag | Estado | Required By |
|---|---|---|
| `onboarding.session_v1` | `true` | — |
| `onboarding.setup_center_v1` | `true` | `session_v1` |
| `onboarding.template_safe_v1` | `true` | `session_v1` |
| `onboarding.import_contract_v1` | `true` | `session_v1` |
| `onboarding.required_config_v1` | `true` | `session_v1` |
| `onboarding.activation_v1` | `true` | `session_v1` + `required_config_v1` |

**Nota:** Para el cohort TTFSS formal (AP-07), **todos los flags deben estar `true`** (Stage 10 — founder tenant pilot). Si se ejecuta acceptance en un stage parcial, documentar la desviación y su justificación.

---

# 4. Infrastructure

| Componente | Versión / Config |
|---|---|
| PostgreSQL | «COMPLETAR: `SELECT version()` en el entorno de piloto — el código no pisa versión; documentar la exacta» |
| Node.js | v24.19.0 |
| Flutter SDK | «COMPLETAR: `flutter --version` en la máquina de build del APK» |
| Dart SDK | ^3.11.5 (constraint de pubspec.yaml) |

---

# 5. Founder Hardware

| Campo | Valor |
|---|---|
| Device model | MIRAY Q80 (iPOS) — Android 12, Nyx Printer Service 2.0.5 |
| Device serial hash | «COMPLETAR EN CAMPO: SHA-256 del serial físico — obtener con `adb shell getprop ro.serialno` y hashear» |
| Terminal ID (DevicePrincipal) | `Q802024120001` (fijo según seed script) |
| OS version | «COMPLETAR EN CAMPO: `adb shell getprop ro.build.version.release` + security patch» |
| Firmware | «COMPLETAR EN CAMPO si aplica» |
| Printer adapter | «COMPLETAR EN CAMPO: driver real que aparece en logs del POS al imprimir — NO MockPrinterAdapter» |
| Printer paper width | **80 mm** (rollo incluido en el Q80). Es el único perfil físicamente calibrado en este equipo: Nyx `TLMono` font 4, 40 columnas, 576 dots, leftPadding 8. El soporte de 58 mm existe en software (32 columnas / 384 dots) pero **no está validado físicamente** en el piloto |
| Network profile | «COMPLETAR EN CAMPO: WiFi SSID del entorno de piloto» |
| WAN outage method | «COMPLETAR EN CAMPO: airplane mode / router disconnect / other» |

---

# 6. Workstation (Owner Dashboard / Browser)

| Campo | Valor |
|---|---|
| Browser + version | «COMPLETAR EN CAMPO: Chrome / Edge / Firefox + versión exacta del equipo del piloto» |
| OS | «COMPLETAR EN CAMPO: Ubuntu / Windows / macOS + versión» |
| Screen resolution | «COMPLETAR EN CAMPO» |

---

# 7. Reference Tenant Seed

| Campo | Valor |
|---|---|
| Seed script | `apps/admin_backend/src/scripts/seed-onboarding-founder-pilot.ts` |
| Seed command | `npm run seed:onboarding-founder-pilot` (confirmado en package.json scripts) |
| Tenant name pattern | `Founder Pilot Q80 <runId>` |
| Owner role | `OWNER` |
| Owner offline PIN | 6 dígitos (generado por el seed script — capturar del output JSON) |
| Tenant RUC | `J0000000000000` (placeholder del seed — ver §9; reemplazar antes del primer documento fiscal real) |
| Tenant initial state | `is_active=true`, `OnboardingSession` NO iniciada, sin milestones |

**IMPORTANTE:** Cada reference run crea un tenant nuevo. El seed se ejecuta antes de cada run, no se reutiliza entre runs.

---

# 8. Reference Fixture — F1 Template Path

| Campo | Valor |
|---|---|
| Industry Template | «COMPLETAR EN CAMPO: nombre/versión de la template de aceptación que existe en `industry_template.service.ts` (ej. CAFETERIA) — seleccionar una que tenga ≥12 productos» |
| Productos sugeridos | 12 (precio de venta > 0) |
| Insumos sugeridos | 4 (sin stock/costo afirmado) |
| Recetas sugeridas | 3 (quedan DRAFT/SUGGESTED) |
| Template selection | Operador selecciona subconjunto suficiente para catálogo vendible |

---

# 9. Fiscal Fixture

| Campo | Valor |
|---|---|
| RUC | `J0000000000000` — **placeholder** provisto por el seed script (override: `ONBOARDING_FOUNDER_RUC`). Estructuralmente válido (`J` + 13 dígitos) pero **no es un RUC real de contribuyente** |
| Régimen | `CUOTA_FIJA` declarado en este fixture — **PENDIENTE DE RESOLUCIÓN**: el harness attachado real usa `REGIMEN_GENERAL` (ver BLOQUEANTE PRE-REHEARSAL abajo). No mezclar regímenes en el cohort |
| Nombre comercial | «COMPLETAR EN CAMPO: nombre del tenant pilot» |
| Dirección fiscal | «COMPLETAR EN CAMPO: dirección ficticia de prueba pero con formato válido» |
| Teléfono | «COMPLETAR EN CAMPO» |

**ORDEN BLOQUEANTE:** el RUC placeholder debe reemplazarse por el RUC real del founder **antes de emitir el primer documento fiscal**. Los documentos emitidos son inmutables ante DGI: no se borran, no se re-numeran y no se corrigen retroactivamente. Corregir el RUC después de la primera factura deja esa factura con un identificador inválido de forma permanente. El RUC placeholder `J0000000000000` queda visiblemente prohibido para ejecución fiscal: ninguna emisión, TEST_PRINT ni rehearsal puede ejecutarse con él.

### BLOQUEANTE PRE-REHEARSAL — mismatch de régimen tributario

Este fixture declara régimen `CUOTA_FIJA` (IVA 0.00%), pero el harness real de dispositivo attachado (`apps/pos_app/integration_test/onb1_10_founder_pilot_q80_e2e_test.dart`) envía `regime: 'REGIMEN_GENERAL'` a `onboarding/fiscal-setup`. El rehearsal simulado (`apps/pos_app/test/integration/onb1_10_founder_pilot_rehearsal_e2e_test.dart`) sí usa `CUOTA_FIJA`, lo que confirma la divergencia entre fixture documentado y harness físico.

Ambos regímenes son válidos en el dominio (`TaxRegime`, DGI / Ley 822): `CUOTA_FIJA` emite «COMPROBANTE DE VENTA» sin IVA recaudado; `REGIMEN_GENERAL` emite «FACTURA DE VENTA» con desglose de IVA (15%). El seed script no fija ningún régimen, por lo que **el repositorio no establece una autoridad única** entre el fixture y el harness.

**No se elige régimen en este documento y no se modifica código.** La emisión de cualquier documento fiscal y la ejecución del rehearsal físico quedan bloqueadas hasta que se resuelva explícitamente qué régimen declara el piloto (decisión humana) y se alineen fixture documentado, harness y expectativas de ticket físico. Este mismatch debe resolverse antes de AP-00 (FREEZE-04/05).

---

# 10. Verification Product

| Campo | Valor |
|---|---|
| Product name | «COMPLETAR EN CAMPO: producto de verificación — puede ser el primero aplicado desde la template o uno creado manualmente; nombre descriptivo» |
| SKU | «COMPLETAR EN CAMPO» |
| sellPrice | > 0 (confirmar valor exacto — ej. C$ 80.00) |
| active | `true` |
| Pinneado en Activation | «COMPLETAR EN CAMPO si aplica el pinning de revisión/fingerprint» |

---

# 11. CSV Fixtures

| Fixture | Descripción | Estado |
|---|---|---|
| F2 — CSV Clean | 25 filas válidas, headers oficiales, sin stock/costo | **Archivo determinista existe** (FREEZE-02). Hash SHA-256 pendiente de binding al congelar (FREEZE-05) |
| F3 — CSV Mixed | 20 válidas + 5 inválidas + alias + columna desconocida | **Archivo determinista existe** (FREEZE-02). Hash pendiente de binding al congelar |
| F4 — CSV Duplicate | Productos existentes para REPLACE/SKIP/FAIL | **Archivo determinista existe** (FREEZE-02). Hash pendiente de binding al congelar |
| F5 — Legacy Unsafe | Columnas legacy: stock_inicial, costo, barcode | **Archivo determinista existe** (FREEZE-02). Hash pendiente de binding al congelar |

---

# 11.1 Pendiente para el freeze (no ejecutado por este cambio)

Este manifest describe el **fixture real del piloto**. La identidad de release anterior estaba desactualizada y fue retirada; se acuña una sola vez al congelar:

| Campo | Estado |
|---|---|
| `acceptanceReleaseId` | **NOT FROZEN.** Se acuña una sola vez en FREEZE-05, tras estabilizar todo cambio que afecte release (código, migraciones, configuración funcional, fixtures) |
| Último commit congelado / builds (§1, §2) | Pendientes de FREEZE-05 |
| Database migration version (§2) | Verificado contra el árbol: `1809040000000-CreateHumanAuthorizationTenantPublicationState` |
| SQLite Floor schema version (§2) | Verificado contra el árbol: `52` |
| Versión POS (§2) | Verificada contra el árbol: pubspec `1.0.0+1` |
| CSV fixtures F2–F5 (§11) | **Archivos deterministas existen** (FREEZE-02); hashes pendientes de binding al congelar (FREEZE-05) |
| Régimen tributario (§9) | **BLOQUEANTE PRE-REHEARSAL:** mismatch `CUOTA_FIJA` (fixture) vs `REGIMEN_GENERAL` (harness attachado real). Resolver antes del piloto |
| Capturas de campo (§5, §6) | Pendientes de captura en el dispositivo físico |

---

# 12. Release Integrity Rules

1. Cambio de código → nuevo `acceptanceReleaseId`
2. Cambio de migration → nuevo `acceptanceReleaseId`
3. Cambio de feature flags → nuevo `acceptanceReleaseId`
4. Cambio de fixture → nuevo `acceptanceReleaseId`
5. Cambio de hardware → nuevo manifest completo + re-baseline TTFSS
6. `AP_FINAL_SIGNOFF.md` no puede combinar PASS de distintos `acceptanceReleaseId`

---

# 13. Firma de Congelación

Cuando este manifest se llene con datos reales, el responsable firma:

```text
Firmado por:           «COMPLETAR EN CAMPO»
Fecha de congelación:  «COMPLETAR EN CAMPO: actualizar fecha/hora exacta de firma»
acceptanceReleaseId:   **NOT FROZEN** — «COMPLETAR EN FREEZE-05: acuñar una sola vez tras estabilizar todo cambio que afecte release»
```
