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

**Alcance del piloto (decisión del founder, 2026-09-17):** la evidencia de este documento valida el ciclo de vida de activación en hardware real. **Ningún campo de este documento implica que el rehearsal validó el transporte de dispositivo `/v1/sync/*`**: esa validación está fuera del alcance de la aceptación y la precondición 2 del cutover DSI **NO está satisfecha** para este piloto. Las limitaciones conocidas se registran en `AP_KNOWN_LIMITATIONS.md`; este documento no las duplica.

---

# 1. Build & Release Freeze

| Campo | Valor |
|---|---|
| acceptanceReleaseId | `fp-acceptance-96440859` — acuñado una sola vez el 2026-09-18, después de la entrega |
| Backend commit | `9644085940de704eae0c0fcb23609df66e631770` (merge de PR #328 sobre `main`) |
| Owner Dashboard commit | `9644085940de704eae0c0fcb23609df66e631770` (monorepo) |
| POS commit | `9644085940de704eae0c0fcb23609df66e631770` (monorepo) |
| POS APK version | `1.0.0+1` (declarado en `pubspec.yaml`; el APK instalado reportó `versionName 1.0.0`, `versionCode 1`) |
| POS APK SHA-256 | `f93b63107f51bcbd70639fae896894e34dc36e37340a61b507b13c8e5d14550b` (el APK que corrió el rehearsal) |
| Database migration version | `1809060000000-AlignInvoiceTenantPolicyPredicate` (última migración presente en el árbol del release) |
| SQLite schema version | `52` (Floor database version verificada en `apps/pos_app/lib/data/database/app_database.dart`) |

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

## 8.0 Rehearsal — FREEZE-06 (2026-09-18)

Primera corrida del harness attachado sobre hardware real con el instrumento entregado. **Resultado: PASS en las tres fases internas.**

| Campo | Valor |
|---|---|
| Instrumento | `apps/pos_app/integration_test/onb1_10_founder_pilot_q80_e2e_test.dart` del commit `9644085` |
| Target | base de aceptación dedicada, recreada desde cero para esta corrida |
| attemptId | `c868ae10-c377-4e70-85e8-43df3b0a6ab7` (el mismo en las tres fases) |
| Recibos | `setup` con `testPrint: accepted`; `offline` con `httpRequests: 0`; `reconnect` con `backendStatus: PASS` |
| Confirmación independiente | `attempt.status = PASS`, `session.lifecycleState = ACTIVATED`, y los diez checks de activación en `PASS` (leídos del backend, no del harness) |
| Ticket físico | COMPROBANTE DE VENTA, NO RECAUDA IVA / IVA 0, RUC del emisor presente, 80 mm sin truncamiento |
| Confirmación visual | reportada por el operador en el dispositivo; el harness declara `visualConfirmation: not-claimed` y no la infiere |
| RUC del emisor | presencia registrada y hash `46cef85fa3720cb8a1dee8b02aa4b59ab5bab3c1e116f0763759564d20581841`; el valor crudo no se persiste |

**Salvedad de fidelidad del entorno (decidida por el operador):** el target de esta corrida se aprovisionó con **69 migraciones** mientras el árbol del release contiene **70**. El `dist/migrations` que lee el runner estaba compilado a las 08:35 y `1809060000000-AlignInvoiceTenantPolicyPredicate.ts` llegó al `src` a las 11:14, así que esa migración se omitió en silencio. El defecto estaba en el script de aprovisionamiento, no en el repositorio: `apps/admin_backend/scripts/verify-schema-build.sh` compila antes de migrar. El script ya reconstruye y se niega a migrar si los conteos de origen y compilados no coinciden (probado aplicando 70/70). Por lo tanto **esta corrida es válida para el ciclo de vida de activación que ejercita, pero no se tomó sobre un entorno idéntico al árbol del release**; la cohorte debe correr con el camino corregido.

El intento previo sobre otro target falló y lo consumió: la fase `offline` agotó el timeout de 60 s con el dispositivo **dormido** (`mWakefulness=Asleep`). Con la pantalla despierta y timeout extendido, la corrida completa tardó 16 s.

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

> **Cambio de protocolo (2026-09-18, decidido por el operador).** La cohorte 5/5 **no** captura el ticket físico por run. La impresión en 80 mm con el documento correcto ya quedó verificada sobre este mismo dispositivo e impresora en el rehearsal de FREEZE-06: COMPROBANTE DE VENTA, NO RECAUDA IVA, RUC del emisor presente y 80 mm sin truncamiento (§8.0). Esa es la configuración con la que SOHO va a operar, y es lo que se quiso verificar. El dispositivo es prestado y tiene poco papel.
>
> **Lo que este cambio NO modifica:** el paso de impresión sigue siendo parte del contrato de activación. `PRINTER_AVAILABLE`, `TEST_PRINT` y `SALE_RECEIPT_PATH` están entre los diez checks, y un FAIL bloquea la activación. Cada corrida de la cohorte sigue necesitando la impresora disponible y con papel, y sigue imprimiendo. El cambio elimina la carga de **captura de evidencia**, no el paso de impresión.
>
> **Riesgo residual aceptado:** la salida física por run no se reverifica de forma independiente en la cohorte. Una regresión de impresión introducida entre el rehearsal y una corrida de cohorte no sería detectada por la evidencia de esa corrida.
>
> **Reducción aplicada (2026-09-18, decidida por el operador porque no puede seguir consumiendo papel).** La cohorte corre el harness con `PILOT_PRINTER_MODE=simulated`: el adaptador simulado reporta impresora lista y acepta las órdenes de impresión **sin producir salida**, así que una corrida completa no consume papel. En consecuencia `PRINTER_AVAILABLE`, `TEST_PRINT` y `SALE_RECEIPT_PATH` quedan satisfechos **por simulación** y en la cohorte **no son evidencia sobre hardware**. La evidencia de impresión física sigue siendo el rehearsal de FREEZE-06 (§8.0), que es la configuración con la que va a operar SOHO. Cada recibo de fase incluye `printerMode`, de modo que una impresión simulada no puede confundirse con una física. El modo por defecto sigue siendo `real`; una corrida sin `PILOT_PRINTER_MODE` imprime y consume papel como antes.
>
> **Salvedad sobre la métrica principal.** El TTFSS medido con impresora simulada **excluye la latencia de impresión física**. Base de magnitud, medida en el rehearsal de FREEZE-06: las dos operaciones de impresión abarcaron unos 18 s de tiempo de dispositivo (12:19:24 y 12:19:42), contra un elapsed de activación de 320 201 ms (~5,3 min) reportado por el recibo de reconexión. Es decir, del orden del 5–6 % del span de esa corrida, y el TTFSS de la cohorte debe leerse como levemente optimista respecto de la operación real.

| Evidencia | Run 1 | Run 2 | Run 3 | Run 4 | Run 5 |
|---|---|---|---|---|---|
| APK installed (screenshot/log) | «» | «» | «» | «» | «» |
| Ticket impreso (foto) | «NO POR CAMBIO DE PROTOCOLO» | «idem» | «idem» | «idem» | «idem» |
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
