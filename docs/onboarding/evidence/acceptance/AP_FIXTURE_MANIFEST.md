# NHILOS Client Onboarding V1 — Acceptance Fixture Manifest

**Documento:** `AP_FIXTURE_MANIFEST.md`  
**Ubicación:** `docs/onboarding/evidence/acceptance/AP_FIXTURE_MANIFEST.md`  
**Estado:** **SEMI-FROZEN — builds reales congelados; hardware fixture pendiente de Piloto**  
**Versión:** 1.0 (builds congelados 2026-09-04; hardware fixture pendiente de captura en campo)**
**Fecha de creación:** 2026-09-04  
**Autoridad:** `onboarding_acceptance_plan_v1.0.md` §4

---

# 0. Instrucciones

Este manifest se congela **una sola vez** antes del primer acceptance run. Cualquier cambio de código, migration, configuración funcional o fixture requiere un nuevo manifest y un nuevo `acceptanceReleaseId`.

Los campos marcados con `«COMPLETAR»` deben llenarse con datos reales antes de ejecutar AP-00.

---

# 1. Release Identity

| Campo | Valor |
|---|---|
| `acceptanceReleaseId` | `c6b61cd-m1801000000000-stage10` (derivado: backend commit + last migration + stage) |
| Fecha de congelación | `2026-09-04T00:00:00Z` (congelación de builds; refrescar al firmar) |
| Branch congelada | `feat/backoffice-spa` |
| Último commit congelado | `c6b61cd15428593ff04afdd8b3be52c43814753a` |

---

# 2. Builds

| Componente | Commit SHA | Build / Image | Notas |
|---|---|---|---|
| Backend (NestJS) | `c6b61cd15428593ff04afdd8b3be52c43814753a` | NestJS ^11.0.1 / TypeORM ^0.3.28 | `apps/admin_backend` |
| Owner Dashboard | `c6b61cd15428593ff04afdd8b3be52c43814753a` | v0.0.0 (SPA build) | `apps/owner_dashboard` |
| POS (Flutter) | `c6b61cd15428593ff04afdd8b3be52c43814753a` | «COMPLETAR: build number del APK tras flutter build apk» | `apps/pos_app` — Dart SDK ^3.11.5 |
| Database migration version | `1801000000000` | `CreateOnboardingTelemetryEvents` (última migración TypeORM) | PostgreSQL |
| SQLite schema version | «COMPLETAR: Floor database version del POS» | «COMPLETAR: versión del Floor database» | POS local |

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
| Device model | Alacrity Q80 / iPOS (confirmar modelo exacto en campo) |
| Device serial hash | «COMPLETAR EN CAMPO: SHA-256 del serial físico — obtener con `adb shell getprop ro.serialno` y hashear» |
| Terminal ID (DevicePrincipal) | `Q802024120001` (fijo según seed script) |
| OS version | «COMPLETAR EN CAMPO: `adb shell getprop ro.build.version.release` + security patch» |
| Firmware | «COMPLETAR EN CAMPO si aplica» |
| Printer adapter | «COMPLETAR EN CAMPO: driver real que aparece en logs del POS al imprimir — NO MockPrinterAdapter» |
| Printer paper width | 58 mm (estándar ticket) |
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
| RUC | «COMPLETAR EN CAMPO: RUC del tenant fundador — debe ser válido para DGI; usar el del seed o uno de prueba oficial» |
| Régimen | General (confirmar) |
| Nombre comercial | «COMPLETAR EN CAMPO: nombre del tenant pilot» |
| Dirección fiscal | «COMPLETAR EN CAMPO: dirección ficticia de prueba pero con formato válido» |
| Teléfono | «COMPLETAR EN CAMPO» |

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

| Fixture | Descripción | Hash SHA-256 |
|---|---|---|
| F2 — CSV Clean | 25 filas válidas, headers oficiales, sin stock/costo | «COMPLETAR EN CAMPO: generar CSV, hashear contenido» |
| F3 — CSV Mixed | 20 válidas + 5 inválidas + alias + columna desconocida | «COMPLETAR EN CAMPO» |
| F4 — CSV Duplicate | Productos existentes para REPLACE/SKIP/FAIL | «COMPLETAR EN CAMPO» |
| F5 — Legacy Unsafe | Columnas legacy: stock_inicial, costo, barcode | «COMPLETAR EN CAMPO» |

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
acceptanceReleaseId:   c6b61cd-m1801000000000-stage10
```
