# NHILOS — Founder Pilot Q80 — Evidence Capture

**Documento:** `AP_Q80_PILOT_EVIDENCE.md`
**Ubicación:** `docs/onboarding/evidence/acceptance/AP_Q80_PILOT_EVIDENCE.md`
**Estado:** **PENDING — TO BE COMPLETED DURING/_AFTER PILOT**
**Versión:** 1.0
**Fecha de creación:** 2026-09-04
**Autoridad:** `onboarding_acceptance_plan_v1.0.md` §AP-12

---

# 0. Propósito

Este documento captura la evidencia del piloto físico en hardware real. Se llena **durante** la ejecución del piloto (§AP_Q80_PILOT_CHECKLIST.md) y se usa como input para actualizar AP-00 y ejecutar AP-01..AP-12.

**Regla:** Cada campo se llena con datos observados/persistidos en el momento. No se rellena retrospectivamente sin anotar la fuente.

---

# 1. Build & Release Freeze

| Campo | Valor |
|---|---|
| acceptanceReleaseId | **NOT FROZEN** — «COMPLETAR EN FREEZE-05: acuñar una sola vez tras estabilizar todo cambio que afecte release» |
| Backend commit | «COMPLETAR EN FREEZE-05: SHA del commit de release» |
| Owner Dashboard commit | «COMPLETAR EN FREEZE-05: SHA del commit de release» |
| POS commit | «COMPLETAR EN FREEZE-05: SHA del commit de release» |
| POS APK version | pubspec declara `1.0.0+1` — «COMPLETAR EN CAMPO: `adb shell dumpsys package com.nhilos.pos_app \| grep versionName`» |
| POS APK SHA-256 | «COMPLETAR EN CAMPO: `sha256sum path/to/pos.apk`» |
| Database migration version | `1809040000000-CreateHumanAuthorizationTenantPublicationState` (última migración TypeORM verificada en el árbol) |
| SQLite schema version | `52` (Floor database version verificada en `apps/pos_app/lib/data/database/app_database.dart`; confirmar en el APK instalado) |

---

# 2. Hardware Fixture (capturar en campo)

| Campo | Valor |
|---|---|
| Device model | Alacrity Q80 / iPOS |
| Device serial (raw) | «COMPLETAR: `adb shell getprop ro.serialno`» |
| Device serial SHA-256 | «COMPLETAR: SHA-256 del serial raw» |
| Android version | «COMPLETAR: `adb shell getprop ro.build.version.release`» |
| Security patch | «COMPLETAR: `adb shell getprop ro.build.version.security_patch`» |
| Firmware | «COMPLETAR si aplica» |
| Printer driver | Nyx Printer Service 2.0.5 (confirmar en logs del POS) |
| Printer paper width | 80 mm (rollo del Q80) |
| WiFi SSID | «COMPLETAR: SSID del entorno de piloto» |
| WAN outage method | «COMPLETAR: airplane mode / router disconnect» |

---

# 3. Workstation Fixture (capturar en campo)

| Campo | Valor |
|---|---|
| Browser | «COMPLETAR: Chrome/Edge/Firefox + versión» |
| OS | «COMPLETAR: Ubuntu/Windows/macOS + versión» |
| Screen resolution | «COMPLETAR: ancho × alto» |

---

# 4. Reference Tenant Seed (capturar por run)

| Campo | Run 1 | Run 2 | Run 3 | Run 4 | Run 5 |
|---|---|---|---|---|---|
| runId | «del seed output» | «» | «» | «» | «» |
| tenantId | «del seed output» | «» | «» | «» | «» |
| tenantIdHash (SHA-256) | «hashear tenantId» | «» | «» | «» | «» |
| Owner email | «del seed output» | «» | «» | «» | «» |
| Offline PIN | «del seed output» | «» | «» | «» | «» |

---

# 5. Fiscal Fixture (capturar una vez — misma data en todos los runs)

| Campo | Valor |
|---|---|
| RUC | `J0000000000000` (placeholder del seed) → **registrar aquí el RUC real usado en el run** |
| RUC presente al activar (`rucPresent`) | «true/false — de la evidencia de TEST_PRINT» |
| `rucHash` (SHA-256 del RUC canónico) | «de la evidencia de TEST_PRINT — nunca registrar el RUC crudo aquí» |
| Régimen | **RESUELTO: `CUOTA_FIJA`** (decisión del founder, 2026-09-17; IVA 0.00%). El harness attachado (`integration_test/onb1_10_founder_pilot_q80_e2e_test.dart`) ya envía `CUOTA_FIJA` y coincide con el fixture declarado (§9 de `AP_FIXTURE_MANIFEST.md`) |
| Nombre comercial | «COMPLETAR» |
| Dirección fiscal | «COMPLETAR» |
| Teléfono | «COMPLETAR» |
| `TEST_PRINT` ancho efectivo (mm) | «de la evidencia de TEST_PRINT — debe ser 80» |
| `TEST_PRINT` régimen efectivo | «de la evidencia de TEST_PRINT — debe ser `CUOTA_FIJA` (`COMPROBANTE DE VENTA` / `NO RECAUDA IVA`); la decisión del founder es la autoridad (§9 de `AP_FIXTURE_MANIFEST.md`)» |

**Regla:** el RUC crudo sólo se comprueba contra el ticket físico. La telemetría y este documento registran `rucHash` + `rucPresent`, nunca el identificador completo.

---

# 6. Template & Verification Product (capturar una vez)

| Campo | Valor |
|---|---|
| Industry Template name | «COMPLETAR: CAFETERIA u otra disponible» |
| Productos seleccionados | «COMPLETAR: lista de nombres/SKUs aplicados» |
| Verification product name | «COMPLETAR: producto usado para la venta de verificación» |
| Verification product SKU | «COMPLETAR» |
| Verification product sellPrice | «COMPLETAR: C$ X.00» |

---

# 7. CSV Fixture Hashes (capturar una vez)

| Fixture | SHA-256 del archivo CSV |
|---|---|
| F2 — CSV Clean | **Archivo determinista existe** (FREEZE-02) — hash pendiente de binding al congelar (FREEZE-05) |
| F3 — CSV Mixed | **Archivo determinista existe** (FREEZE-02) — hash pendiente de binding al congelar |
| F4 — CSV Duplicate | **Archivo determinista existe** (FREEZE-02) — hash pendiente de binding al congelar |
| F5 — Legacy Unsafe | **Archivo determinista existe** (FREEZE-02) — hash pendiente de binding al congelar |

---

# 8. Reference Run Results (TTFSS Cohort)

## 8.1 Run Summary

| Campo | Run 1 | Run 2 | Run 3 | Run 4 | Run 5 |
|---|---|---|---|---|---|
| runId | «» | «» | «» | «» | «» |
| tenantIdHash | «» | «» | «» | «» | «» |
| onboardingStartedAt | «timestamp de DB» | «» | «» | «» | «» |
| saleReadyFirstAt | «timestamp de DB» | «» | «» | «» | «» |
| firstSuccessfulSaleAt | «timestamp de DB» | «» | «» | «» | «» |
| activatedAt | «timestamp de DB» | «» | «» | «» | «» |
| clockConfidence | «ANCHORED/DEVICE_VALIDATED/DEGRADED» | «» | «» | «» | «» |
| ttfssMs | «firstSuccessfulSaleAt - onboardingStartedAt» | «» | «» | «» | «» |
| ttfssFormatted | «MM:SS» | «» | «» | «» | «» |
| timeToSaleReadyMs | «» | «» | «» | «» | «» |
| saleReadyToFirstSaleMs | «» | «» | «» | «» | «» |
| activationResult | «PASS/PASS_WITH_WARNING/FAIL» | «» | «» | «» | «» |
| verificationTicketIdHash | «SHA-256 del ticket ID» | «» | «» | «» | «» |
| firstSaleClaimEventIdHash | «SHA-256 del event ID» | «» | «» | «» | «» |
| measurementEligible | «true/false» | «» | «» | «» | «» |
| notes | «» | «» | «» | «» | «» |

## 8.2 Cohort Verdict

| Check | Estado |
|---|---|
| 5/5 runs ejecutados | «» |
| 5/5 measurementEligible = true | «» |
| 5/5 clockConfidence = ANCHORED | «» |
| 5/5 TTFSS <= 15:00 | «» |
| Ningún run DEGRADED reemplazado | «» |
| **COHORT RESULT** | **«PASS / FAIL»** |

---

# 9. Pilot Physical Evidence Checklist

Para cada run, capturar evidencia física/digital:

| Evidencia | Run 1 | Run 2 | Run 3 | Run 4 | Run 5 |
|---|---|---|---|---|---|
| APK installed (screenshot/log) | «» | «» | «» | «» | «» |
| Ticket impreso (foto) | «» | «» | «» | «» | «» |
| WAN outage activado (screenshot/log) | «» | «» | «» | «» | «» |
| Restart recovery (log) | «» | «» | «» | «» | «» |
| Outbox drain (log/backend receipt) | «» | «» | «» | «» | «» |
| ACTIVATED status (screenshot/query) | «» | «» | «» | «» | «» |

---

# 10. Post-Pilot Actions

- [ ] Completar AP_FIXTURE_MANIFEST.md §5 (hardware fixture con datos reales)
- [ ] Completar AP_REFERENCE_RUN_PROTOCOL.md §1 (operador) y §6 (Wan)
- [ ] Actualizar AP-00_ENTRY_GATE.md §6 (marcar BLOCKERs como PASS)
- [ ] Actualizar AP-00 §0 (cambiar resultado a READY o NOT READY)
- [ ] Crear TTFSS_REFERENCE_RUNS.csv con los 5 runs
- [ ] Crear TTFSS_REFERENCE_SUMMARY.md con resultado del cohort
- [ ] Iniciar AP-01..AP-12

---

# 11. Firma

```text
Ejecutado por:    «COMPLETAR EN CAMPO»
Fecha del piloto: «COMPLETAR EN CAMPO»
acceptanceReleaseId: **NOT FROZEN** — «COMPLETAR EN FREEZE-05»
Cohort result:    «PASS / FAIL»
```
