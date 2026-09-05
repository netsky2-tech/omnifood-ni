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
| acceptanceReleaseId | `c6b61cd-m1801000000000-stage10` |
| Backend commit | `c6b61cd15428593ff04afdd8b3be52c43814753a` |
| Owner Dashboard commit | `c6b61cd15428593ff04afdd8b3be52c43814753a` |
| POS commit | `c6b61cd15428593ff04afdd8b3be52c43814753a` |
| POS APK version | «COMPLETAR: `adb shell dumpsys package com.omnifood.pos \| grep versionName`» |
| POS APK SHA-256 | «COMPLETAR: `sha256sum path/to/pos.apk`» |
| Database migration version | `1801000000000` |
| SQLite schema version | «COMPLETAR: Floor database version del POS tras build» |

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
| Printer driver | «COMPLETAR: nombre del adapter real en logs del POS» |
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
| RUC | «COMPLETAR: RUC del tenant fundador» |
| Régimen | General |
| Nombre comercial | «COMPLETAR» |
| Dirección fiscal | «COMPLETAR» |
| Teléfono | «COMPLETAR» |

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
| F2 — CSV Clean | «COMPLETAR: generar CSV, hashear» |
| F3 — CSV Mixed | «COMPLETAR» |
| F4 — CSV Duplicate | «COMPLETAR» |
| F5 — Legacy Unsafe | «COMPLETAR» |

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
acceptanceReleaseId: c6b61cd-m1801000000000-stage10
Cohort result:    «PASS / FAIL»
```
