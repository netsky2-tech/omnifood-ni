# NHILOS — Founder Pilot Q80 — Evidence Capture

**Documento:** `AP_Q80_PILOT_EVIDENCE.md`
**Ubicación:** `docs/onboarding/evidence/acceptance/AP_Q80_PILOT_EVIDENCE.md`
**Estado:** **CERRADO — ONB1.10F PASS (2026-09-20); piloto en local real NOT READY**
**Versión:** 2.0
**Fecha de creación:** 2026-09-04
**Autoridad:** `onboarding_acceptance_plan_v1.0.md` §AP-12

---

# Resultado (leer primero)

```text
ONB1.10F (aceptación técnica sobre hardware real):  PASS
  Release: fp-acceptance-6b15d8a · Cohorte 5/5 PASS · TTFSS peor caso 947 ms
Piloto en local real (operación comercial):         NOT READY
  Motivo: L1 (enrolamiento de producción) y L2 (transporte mixto de
  sincronización, issue #314) siguen abiertos en AP_KNOWN_LIMITATIONS.md
```

Este documento valida **sólo** el ciclo de vida de activación en el Q80 físico. El PASS de ONB1.10F **no** autoriza operar un local real: el transporte de dispositivo `/v1/sync/*` quedó fuera de alcance (§0) y las limitaciones L1/L2 permanecen abiertas.

---

# 0. Propósito

Este documento captura la evidencia del piloto físico en hardware real. Se llena **durante** la ejecución del piloto (§AP_Q80_PILOT_CHECKLIST.md) y se usa como input para actualizar AP-00 y ejecutar AP-01..AP-12.

**Regla:** Cada campo se llena con datos observados/persistidos en el momento. No se rellena retrospectivamente sin anotar la fuente.

**Alcance del piloto (decisión del founder, 2026-09-17):** la evidencia de este documento valida el ciclo de vida de activación en hardware real. **Ningún campo de este documento implica que el rehearsal validó el transporte de dispositivo `/v1/sync/*`**: esa validación está fuera del alcance de la aceptación y la precondición 2 del cutover DSI **NO está satisfecha** para este piloto. Las limitaciones conocidas se registran en `AP_KNOWN_LIMITATIONS.md`; este documento no las duplica.

---

# 1. Build & Release Freeze

| Campo | Valor |
|---|---|
| acceptanceReleaseId | `fp-acceptance-96440859` para el **rehearsal (FREEZE-06)**, `fp-acceptance-4b13e4e` para la primera **cohorte** y `fp-acceptance-6b15d8a` para la **cohorte de captura de campos**, que es la vigente. Ver la nota de reacuñación debajo. |
| Backend commit | rehearsal `9644085940de704eae0c0fcb23609df66e631770`; cohorte vigente `6b15d8af66aed80260a511aaaded53d04329f1de` (2026-09-20 10:39:28 -0600) |
| Owner Dashboard commit | los mismos commits (monorepo) |
| POS commit | los mismos commits (monorepo) |
| POS APK version | `1.0.0+1` (declarado en `pubspec.yaml`; el APK instalado reportó `versionName 1.0.0`, `versionCode 1`) |
| POS APK SHA-256 | `f93b63107f51bcbd70639fae896894e34dc36e37340a61b507b13c8e5d14550b` — APK del **rehearsal** (FREEZE-06). **El APK de la cohorte vigente no tiene SHA-256 registrado: se reconstruyó por cada run desde `6b15d8a` y el hash del binario no fue capturado.** No se sustituye por el hash del rehearsal porque corresponde a otro binario. |
| Database migration version | rehearsal: **69 migraciones aplicadas, cola `1809050000000-CreateHumanAuthorizationPolicySnapshots`** (`1809060000000-AlignInvoiceTenantPolicyPredicate` estaba en el árbol pero fue omitida por el `dist` desactualizado; ver §8.0); **cohorte vigente: 85 migraciones aplicadas sobre base vacía, cola exacta `1809210000000-FixInventoryKardexRunningBalanceTenantHash`** |
| SQLite schema version | `53` (Floor database version verificada en `apps/pos_app/lib/data/database/app_database.dart` para el release `6b15d8a`) |

**Nota de reacuñación (2026-09-19 / 2026-09-20).** El protocolo pide acuñar la identidad una sola vez, y se acuñó sobre `9644085` tras la entrega del 2026-09-18. Esa identidad **no podía gobernar la cohorte**, porque en el medio el instrumento cambió por hallazgos de campo: el ticket de venta se imprimía como FACTURA en 58 mm y se corrigió (#343), la impresión física se reemplazó por el modo simulado para no consumir papel del dispositivo prestado (#352), y el camino de lectura fiscal quedó atado al tenant (#377, #411). Correr la cohorte sobre `9644085` habría medido un instrumento que ya sabíamos defectuoso.

La tercera acuñación existe por una razón distinta y más estrecha: la cohorte de `4b13e4e` dejó dos campos del protocolo **sin capturar** porque los produce el dispositivo y nada los exportaba. El instrumento ahora los reporta, y el veredicto que importa es el que se midió con él. Las tres identidades quedan registradas en lugar de sobrescribirse: cada una corresponde al instrumento que realmente corrió, y sustituir una habría borrado la trazabilidad de por qué cambió.

---

# 2. Hardware Fixture (capturar en campo)

| Campo | Valor |
|---|---|
| Device model | MIRAY Q80 / iPOS — modelo `TPM4G_E9863`, fabricante `NB55` |
| Device serial (raw) | **No persistido** — se leyó en campo vía `adb shell getprop ro.serialno` y se descartó a propósito; el repositorio sólo conserva su hash |
| Device serial SHA-256 | `680f14116c61725b6f5aaf76fa99d8b8fbc7855deeb77a4d79903415c1eb56ec` |
| Android version | 12 (SDK 31) |
| Security patch | 2022-11-05 |
| Firmware | `Q80_SC_V1.0.1_B241225.163320` |
| Printer driver | Adaptador `SUNMI_V2S` vía `net.nyx.printerservice`; **versión del servicio no verificada** |
| Printer paper width | 80 mm (rollo del Q80) |
| WiFi SSID | **No capturado** — la cohorte fue dirigida por el harness y no registró el SSID del entorno |
| WAN outage method | **Sin corte físico de WAN.** El offline se aplicó por el propio harness (interceptor que cuenta requests) y se probó con `httpRequests: 0` en el recibo de la fase `offline` de cada run |

---

# 3. Workstation Fixture (capturar en campo)

| Campo | Valor |
|---|---|
| Browser | **No capturado** — la cohorte fue harness-driven: el Dashboard fue operado por el instrumento, no por un browser humano observado |
| OS | **No capturado** — mismo motivo |
| Screen resolution | **No capturado** — mismo motivo |

---

# 4. Reference Tenant Seed (capturar por run)

| Campo | Run 1 | Run 2 | Run 3 | Run 4 | Run 5 |
|---|---|---|---|---|---|
| runId (seed) | `1789922440928-ca058ea0` | `1789922456360-d55293f4` | `1789922472913-8f9352fb` | `1789922489786-53a4c50f` | `1789922506450-aafdf8dc` |
| tenantId | `87631cab-8f45-485f-aa62-58cec58d14b7` | `8bc5c2f3-114e-41f6-95d8-146dc1fc8d19` | `53b8f44f-eb4c-40c6-a610-288348d11368` | `72740331-ae92-4767-bc16-282d7c29b781` | `da886f68-0be0-4da3-97ee-a1cbdbe4f75a` |
| tenantIdHash (prefijo de 128 bits de SHA-256, según el protocolo) | `931a4a589c7f7654480ee73fcf453db3` | `671d3b1473cb06fe451724823b13ca19` | `8b9b585a06c069ccfd2845ce434f81e2` | `2a49a9b4aee442c0e8d569ad2cca6b73` | `bf31d5bde8822e1860df9efd927a0880` |
| Owner email | `founder-pilot-1789922440928-ca058ea0@pilot.omnifood.ni` | `founder-pilot-1789922456360-d55293f4@pilot.omnifood.ni` | `founder-pilot-1789922472913-8f9352fb@pilot.omnifood.ni` | `founder-pilot-1789922489786-53a4c50f@pilot.omnifood.ni` | `founder-pilot-1789922506450-aafdf8dc@pilot.omnifood.ni` |
| Offline PIN | Capturado en campo del output del seed; **no se persiste en el repositorio** por decisión de seguridad | ídem | ídem | ídem | ídem |

---

# 5. Fiscal Fixture (capturar una vez — misma data en todos los runs)

| Campo | Valor |
|---|---|
| RUC | **RUC real del founder, usado en la ejecución.** El valor crudo no se registra en este repositorio: sólo se comprobó contra el ticket físico |
| RUC presente al activar (`rucPresent`) | `true` — evidencia de TEST_PRINT |
| `rucHash` (SHA-256 del RUC canónico) | `46cef85fa3720cb8a1dee8b02aa4b59ab5bab3c1e116f0763759564d20581841` |
| Régimen | `CUOTA_FIJA` (decisión del founder, 2026-09-17; IVA 0.00%), confirmado por el TEST_PRINT físico |
| Nombre comercial | `NHILOS POS` (provisto por el founder) |
| Dirección fiscal | `Managua` (provista por el founder) |
| Teléfono | `81948526` (provisto por el founder) |
| `TEST_PRINT` ancho efectivo (mm) | **80** |
| `TEST_PRINT` régimen efectivo | **`CUOTA_FIJA`** — ticket `COMPROBANTE DE VENTA` / `NO RECAUDA IVA` |

**Regla:** el RUC crudo sólo se comprueba contra el ticket físico. La telemetría y este documento registran `rucHash` + `rucPresent`, nunca el identificador completo.

---

# 6. Template & Verification Product (capturar una vez)

| Campo | Valor |
|---|---|
| Industry Template name | `BAR_RESTAURANTE` (Bar & Restaurante) |
| Productos seleccionados | `Hamburguesa Clásica con Papas`, `Cerveza Toña 350ml`, `Trago Ron FDC 7 Años`, más **9 insumos** de la template; por run se aplicó además una fila CSV y un producto manual |
| Verification product name | `VERIFICACION FISICA ONB1.10F-Q80-<epoch>-setup` (el `<epoch>` es el del runId de cada corrida) |
| Verification product SKU | **No producido ni capturado** — el producto de verificación se creó sin SKU |
| Verification product sellPrice | `C$ 1.00` |

---

# 7. CSV Fixture Hashes (capturar una vez)

| Fixture | SHA-256 del archivo CSV |
|---|---|
| F2 — CSV Clean | `2751c8e62664daeab095a19c79072a604d2995a81f2f6900a82cdb3b7eb709bc` |
| F3 — CSV Mixed | `fd525b2f5874db3af0c3110d06ffcb481e77c2ae16ad02df1d333c977a8762a9` |
| F4 — CSV Duplicate | `2279c1c9bcefe3b881258db093d2804201f0d93df421f3dd657e24d7b1c76d25` |
| F5 — Legacy Unsafe | `6ec18aa73493e5046c3ee607f283d13b40a0397fd843c0ba28644e21fe8a4307` |

Hashes verificados con `sha256sum` contra los archivos deterministas de `fixtures/` al cierre (FREEZE-08, 2026-09-20).

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

Corrida de captura de campos (2026-09-20, release `6b15d8a`). Reemplaza a la anterior, que llevaba dos campos sin capturar y dos corridas invalidadas; ambos quedan como historia más abajo.

| Campo | Run 1 | Run 2 | Run 3 | Run 4 | Run 5 |
|---|---|---|---|---|---|
| runId | `ONB1.10F-Q80-1789922821853-setup` | `ONB1.10F-Q80-1789922928590-setup` | `ONB1.10F-Q80-1789923030303-setup` | `ONB1.10F-Q80-1789923141666-setup` | `ONB1.10F-Q80-1789923239703-setup` |
| attemptId | `0a1d6271-5bfa-48d8-8bba-09fc61cc6f66` | `d5fc99b0-52ff-4fad-a7bb-9679576b4a46` | `c0fe3d60-a2d0-493a-bb86-d111df17f371` | `a030ac2e-2552-4052-905d-fd77c09aedee` | `f48f9419-b4d2-4dbb-a8f3-08d578fedacf` |
| tenantIdHash | `931a4a589c7f7654480ee73fcf453db3` | `671d3b1473cb06fe451724823b13ca19` | `8b9b585a06c069ccfd2845ce434f81e2` | `2a49a9b4aee442c0e8d569ad2cca6b73` | `bf31d5bde8822e1860df9efd927a0880` |
| onboardingStartedAt | `2026-09-20 10:47:03.668-06` | `2026-09-20 10:48:50.412-06` | `2026-09-20 10:50:32.115-06` | `2026-09-20 10:52:23.463-06` | `2026-09-20 10:54:01.554-06` |
| saleReadyFirstAt | `2026-09-20 10:47:04.255-06` | `2026-09-20 10:48:51.002-06` | `2026-09-20 10:50:32.742-06` | `2026-09-20 10:52:24.096-06` | `2026-09-20 10:54:02.102-06` |
| firstSuccessfulSaleAt | `2026-09-20 10:47:04.568-06` | `2026-09-20 10:48:51.342-06` | `2026-09-20 10:50:33.051-06` | `2026-09-20 10:52:24.410-06` | `2026-09-20 10:54:02.420-06` |
| activatedAt | `2026-09-20 10:47:09.033-06` | `2026-09-20 10:48:55.940-06` | `2026-09-20 10:50:37.623-06` | `2026-09-20 10:52:29.031-06` | `2026-09-20 10:54:07.081-06` |
| clockConfidence | **ANCHORED** | **ANCHORED** | **ANCHORED** | **ANCHORED** | **ANCHORED** |
| ttfssMs | 900 | 930 | 936 | 947 | 866 |
| ttfssFormatted | 00:00.900 | 00:00.930 | 00:00.936 | 00:00.947 | 00:00.866 |
| timeToSaleReadyMs | 587 | 590 | 627 | 633 | 548 |
| saleReadyToFirstSaleMs | 313 | 340 | 309 | 314 | 318 |
| activationResult | PASS | PASS | PASS | PASS | PASS |
| verificationTicketIdHash | `ec2822b95684c5d8856f529e9d0bd834` | `7cad799688a1e304a6493381457620a6` | `606143611bfe91dfffdcb5220063a948` | `6b3c3b8c09e82399fd6edb859e36a77b` | `8aa1f6feb10958f6e86fd4c16eb4e8b4` |
| firstSaleClaimEventIdHash | `aeef33ab16ef03b9ace8b6d0ac79aea7f695e7c188e871acce740a2f4dce3fbf` | `6ba4ebcbb7f993ebf1140e0007986f7c6916f196031c43730960f0779ae5bc73` | `2836de2dd2eeac499d0efd99d11117fdeb68d19aaf2a9cf7c368b2357104b574` | `1483d4ad5882507dde8b744c2e1337f2ca06e2a03d38ec2a66b1b3a35bf1ad14` | `ac006059fcecac55c07cfcedf0f178933b3539f5543ecc50152df4761d7a1cb1` |
| measurementEligible | true | true | true | true | true |
| notas | 10/10 checks PASS | 10/10 checks PASS | 10/10 checks PASS | 10/10 checks PASS | 10/10 checks PASS |

Los dos campos que la corrida anterior dejaba sin capturar se reportan ahora desde el instrumento: `clockConfidence` va textual porque es una clasificación, y el identificador del evento del primer reclamo va como SHA-256, que es como lo pide el protocolo. Ambos viven en el reclamo que la fase de reconexión ya leía, así que no se agregó ninguna consulta.

Corrida anterior (2026-09-19, release `4b13e4e`), conservada como historia: TTFSS 973, 937, 827, 927 y 1006 ms, 5/5 elegibles, 10/10 checks, con `clockConfidence` y `firstSaleClaimEventIdHash` **no capturados** y **dos corridas invalidadas y re-ejecutadas** porque sus sesiones arrastraban un `onboarding_started_at` anterior y medían 273 s en vez de menos de 1 s.

## 8.2 Cohort Verdict

| Check | Estado |
|---|---|
| 5/5 runs ejecutados | **5/5** |
| 5/5 measurementEligible = true | **5/5** |
| 5/5 clockConfidence = ANCHORED | **5/5** |
| 5/5 TTFSS <= 15:00 | **5/5** (peor caso 947 ms contra un límite de 900 s) |
| Ningún run DEGRADED reemplazado | **ninguno** |
| **COHORT RESULT** | **PASS** |

Todos los criterios del protocolo quedan verificados. La única salvedad que acompaña al resultado es la de impresión, declarada por cambio de protocolo: la cohorte corrió con `PILOT_PRINTER_MODE=simulated`, así que `PRINTER_AVAILABLE`, `TEST_PRINT` y `SALE_RECEIPT_PATH` quedaron satisfechos por simulación y el TTFSS **excluye la latencia de impresión física**. La evidencia física de 80 mm sigue siendo el rehearsal de FREEZE-06 (§8.0).

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
| APK installed (screenshot/log) | Ejecución del APK observada en el dispositivo; **captura de pantalla no capturada** | ídem | ídem | ídem | ídem |
| Ticket impreso (foto) | «NO POR CAMBIO DE PROTOCOLO» | «idem» | «idem» | «idem» | «idem» |
| WAN outage activado (screenshot/log) | Sin corte físico — offline aplicado y probado en-harness con `httpRequests: 0` en el recibo de la fase `offline` | ídem | ídem | ídem | ídem |
| Restart recovery (log) | **No capturado** — el ciclo de reinicio del dispositivo no formó parte del instrumento de cohorte | ídem | ídem | ídem | ídem |
| Outbox drain (log/backend receipt) | PASS — outbox de activación drenado tras reconexión (`backendStatus: PASS`) | PASS | PASS | PASS | PASS |
| ACTIVATED status (screenshot/query) | PASS — `session.lifecycleState = ACTIVATED` confirmado desde el backend, 10/10 checks | PASS | PASS | PASS | PASS |

---

# 10. Post-Pilot Actions

- [x] Completar AP_FIXTURE_MANIFEST.md §5 (hardware fixture con datos reales) — hecho (FREEZE-08)
- [x] Completar AP_REFERENCE_RUN_PROTOCOL.md §1 (operador) y §6 (Wan) — hecho (FREEZE-08), con los valores observados: operador = harness attachado, WAN = offline en-harness sin corte físico
- [x] Actualizar AP-00_ENTRY_GATE.md §6 (marcar BLOCKERs como PASS) — hecho (FREEZE-08); restart recovery queda NOT CAPTURED
- [x] Actualizar AP-00 §0 (resultado) — hecho (FREEZE-08): ONB1.10F PASS; piloto local real NOT READY por L1/L2
- [x] Crear TTFSS_REFERENCE_RUNS.csv con los 5 runs — hecho (FREEZE-08)
- [x] Crear TTFSS_REFERENCE_SUMMARY.md con resultado del cohort — hecho (FREEZE-08)
- [ ] Iniciar AP-01..AP-12 — **NO iniciados**: el PASS de ONB1.10F no los implementa ni los autoriza a declararse completos

---

# 11. Firma

```text
Ejecutado por:    Harness ONB1.10F attachado sobre el Q80 físico; operador con nombre no capturado
Fecha del piloto: 2026-09-20 (cohorte de captura de campos; release fp-acceptance-6b15d8a)
acceptanceReleaseId: fp-acceptance-6b15d8a
Cohort result:    PASS (5/5 runs, TTFSS peor caso 947 ms, 5/5 ANCHORED)

Alcance del resultado: este PASS cubre SOLAMENTE la aceptación técnica ONB1.10F
(ciclo de vida de activación en hardware real). El piloto en local real queda
NOT READY mientras L1 (enrolamiento de producción) y L2 (transporte mixto de
sincronización, issue #314) sigan abiertos en AP_KNOWN_LIMITATIONS.md.
```
