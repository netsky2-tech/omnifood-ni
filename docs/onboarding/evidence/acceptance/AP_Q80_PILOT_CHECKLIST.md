# NHILOS — Founder Pilot Q80 — Operational Checklist

**Documento:** `AP_Q80_PILOT_CHECKLIST.md`  
**Ubicación:** `docs/onboarding/evidence/acceptance/AP_Q80_PILOT_CHECKLIST.md`  
**Estado:** **READY FOR EXECUTION — con bloqueante pre-rehearsal pendiente (RUC placeholder; ver §9 de `AP_FIXTURE_MANIFEST.md`). Régimen resuelto: `CUOTA_FIJA` (decisión del founder; harness alineado)**
**Versión:** 1.0  
**Fecha:** 2026-09-04  
**Autoridad:** `onboarding_acceptance_plan_v1.0.md` §AP-12, `onboarding_execution_roadmap.md` ONB1.10F

---

# 0. Objetivo

Checklist operativo paso a paso para ejecutar el piloto físico del founder tenant en un Alacrity Q80/iPOS real. Este documento es la guía de campo; no reemplaza el Acceptance Plan ni el Reference Run Protocol.

**Harness de acceptance — rehearsal simulado vs run físico real:**

- **Rehearsal simulado (NO satisface aceptación física):** `apps/pos_app/test/integration/onb1_10_founder_pilot_rehearsal_e2e_test.dart` usa `MockDio`, `MockAlertService` y `MockPrinterAdapter` — es un ensayo lógico sin hardware.
- **Run físico real (el único que satisface la aceptación física):** harness attachado al dispositivo `apps/pos_app/integration_test/onb1_10_founder_pilot_q80_e2e_test.dart`, con adaptador de impresora real (`IPosPrinterAdapter`) y variables `PILOT_*` provenientes del JSON del seed script.
- Sólo el run attachado real produce la evidencia física de este checklist (ticket impreso, WAN outage real, outbox drain) y los campos de `AP_Q80_PILOT_EVIDENCE.md` §2–§9.

---

# 1. Pre-Flight (Day Before o Morning Of)

## 1.1 Hardware

- [ ] Alacrity Q80/iPOS cargado al 100%
- [ ] Impresora térmica encendida
- [ ] Papel de recibo cargado (**80 mm** — rollo incluido en el Q80)
- [ ] **Verificar/ajustar ancho de papel del POS = 80 mm** antes de activar (el ancho es configuración local del dispositivo, no se empuja desde el servidor)
- [ ] Test de impresión: imprimir ticket de prueba y verificar salida
- [ ] Terminal en perfil de red correcto (WiFi del piloto)
- [ ] Serial del dispositivo registrado: `Q802024120001`

## 1.2 Software

- [ ] Backend NestJS corriendo y accesible desde la red del piloto
- [ ] PostgreSQL con migración correcta verificada
- [ ] Feature flags en Stage 10 (todos `true`)
- [ ] POS APK instalado en Q80 — verificar versión (pubspec declara `1.0.0+1`; registrar el valor real observado en `AP_Q80_PILOT_EVIDENCE.md`):
  ```bash
  # En el dispositivo o vía ADB:
  adb shell dumpsys package com.nhilos.pos_app | grep versionName
  ```
- [ ] Owner Dashboard accesible en browser
- [ ] Browser limpio (cache, cookies, local storage borrados)

## 1.3 Seed del Tenant

- [ ] Ejecutar seed script:
  ```bash
  cd apps/admin_backend
  npm run seed:onboarding-founder-pilot
  ```
- [ ] Capturar output JSON — contiene tenant ID, owner credentials, offline PIN y el RUC del tenant
- [ ] Si el seed avisa `WARNING: tenant RUC is the placeholder`, ejecutar el paso **B0** de la Phase B antes de emitir cualquier documento fiscal
- [ ] Verificar que el tenant fue creado en PostgreSQL:
  ```sql
  SELECT id, name, ruc, is_active FROM tenants WHERE name LIKE 'Founder Pilot Q80%';
  ```
- [ ] Guardar credenciales en lugar seguro (no en el repo)

## 1.4 Cronómetro

- [ ] Dispositivo de medición listo (reloj NTP o cronómetro manual como backup)
- [ ] Hora sincronizada entre backend y dispositivo

---

# 2. Reference Run — Paso a Paso

## Phase A — Session Start

| # | Acción | Verificación | Timestamp |
|---|---|---|---|
| A1 | Abrir Owner Dashboard en browser | Dashboard carga correctamente | — |
| A2 | Login con credenciales del OWNER del seed | Autenticación exitosa | — |
| A3 | Navegar a Setup Center | Setup Center visible | — |
| A4 | Primer acceso al onboarding | Sesión se crea automáticamente | `onboardingStartedAt` ✓ |

## Phase B — Fiscal Configuration

| # | Acción | Verificación | Timestamp |
|---|---|---|---|
| B0 | **BLOQUEANTE** — Reemplazar el RUC placeholder `J0000000000000` por el RUC real del founder (o confirmar el real si se pasó `ONBOARDING_FOUNDER_RUC`) | UI guarda el RUC válido; sin RUC válido no se alcanza `SALE_READY` | — |
| B1 | Verificar el RUC persistido | El RUC guardado coincide con el real del founder (no el placeholder) | — |
| B2 | Seleccionar régimen tributario `CUOTA_FIJA` | **RESUELTO (2026-09-17):** régimen decidido por el founder — `CUOTA_FIJA` (IVA 0.00%); el harness attachado ya lo envía y coincide con el fixture (§9 de `AP_FIXTURE_MANIFEST.md`). Confirmar que la UI queda en `CUOTA_FIJA` | — |
| B3 | Ingresar nombre comercial | «COMPLETAR» | — |
| B4 | Ingresar dirección fiscal | «COMPLETAR» | — |
| B5 | Ingresar teléfono | «COMPLETAR» | — |
| B6 | Guardar configuración fiscal | Fiscal persistido en DB | — |
| B7 | Verificar que fiscal aparece como guardado | UI muestra estado persistido, no solo input | — |

## Phase C — Catalog via Template

| # | Acción | Verificación | Timestamp |
|---|---|---|---|
| C1 | Seleccionar "Apply Industry Template" | Template listing visible | — |
| C2 | Previsualizar template | 0 side effects (no productos insertados aún) | — |
| C3 | Seleccionar al menos 1 producto | Selección respetada | — |
| C4 | Aplicar template | Template aplicada exitosamente | — |
| C5 | Verificar productos en catálogo | Productos visibles con precio > 0 | — |
| C6 | Verificar recetas en DRAFT/SUGGESTED | Ninguna receta activa | — |
| C7 | Verificar insumos con stock=0 | Insumos creados sin stock | — |

## Phase D — SALE_READY

| # | Acción | Verificación | Timestamp |
|---|---|---|---|
| D1 | Navegar a Sale Ready Review | Review visible | — |
| D2 | Verificar `isSaleReadyNow = true` | Sin blockers | `saleReadyFirstAt` ✓ |

## Phase E — POS Activation (CRITICAL — Offline)

| # | Acción | Verificación | Timestamp |
|---|---|---|---|
| E1 | Abrir POS en Q80 | POS carga | — |
| E2 | Login con OWNER + PIN offline | Autenticación exitosa | — |
| E3 | Verificar fiscal config en POS | Config recibida y aplicada | — |
| E4 | Verificar verification product | Producto disponible localmente | — |
| E5 | Iniciar Activation | Attempt creado | — |
| E6 | Checks pre-offline (6 checks) | Todos PASS. En `TEST_PRINT` el ticket físico debe ser de 80 mm, con la identidad fiscal del régimen resuelto `CUOTA_FIJA` (`COMPROBANTE DE VENTA` / `NO RECAUDA IVA`) y la línea `RUC:` visible | — |
| E7 | **CORTAR WAN** (airplane mode) | WAN desconectada | — |
| E8 | Seleccionar verification product | Producto en carrito | — |
| E9 | Pago en efectivo | Pago registrado | — |
| E10 | **Ticket se imprime** | **Salida física de papel** | — |
| E11 | Ticket PAID en SQLite | Persistido y durable | — |
| E12 | Outbox con evidence + claim | Encolado localmente | `firstSuccessfulSaleAt` ✓ |

## Phase F — Reconnect & Finalize

| # | Acción | Verificación | Timestamp |
|---|---|---|---|
| F1 | **RESTAURAR WAN** | WAN conectada | — |
| F2 | Outbox se drena | Evidence enviada a cloud | — |
| F3 | Backend finaliza | Activation attempt completado | — |
| F4 | Verificar `ACTIVATED` | Lifecycle = ACTIVATED | `activatedAt` ✓ |

## Phase G — Post-Activation

| # | Acción | Verificación | Timestamp |
|---|---|---|---|
| G1 | Verificar `ACTIVATED` monotónico | No se puede revertir | — |
| G2 | Ejecutar VOID de verification sale | `is_canceled = true` (NUNCA DELETE) | — |
| G3 | Verificar TTFSS histórico | `firstSuccessfulSaleAt` inmutable | — |
| G4 | Verificar First Customer Sale (si aplica) | Observación separada de TTFSS | — |

---

# 3. Captura de Métricas

Después de cada run, capturar:

```text
runId:                    «del seed script»
tenantIdHash:             «SHA-256 del tenant ID»
fixtureVersion:           «del AP_FIXTURE_MANIFEST.md»
hardwareManifestHash:     «SHA-256 del serial del Q80»
backendBuild:             «commit SHA del backend»
ownerDashboardBuild:      «commit SHA del dashboard»
posBuild:                 «build number del APK»

onboardingStartedAt:      «timestamp de DB»
saleReadyFirstAt:         «timestamp de DB»
firstSuccessfulSaleAt:    «timestamp de DB»
activatedAt:              «timestamp de DB»

clockConfidence:          «ANCHORED / DEVICE_VALIDATED / DEGRADED»
ttfssMs:                  «firstSuccessfulSaleAt - onboardingStartedAt en ms»
timeToSaleReadyMs:        «saleReadyFirstAt - onboardingStartedAt en ms»
saleReadyToFirstSaleMs:   «firstSuccessfulSaleAt - saleReadyFirstAt en ms»

activationResult:         «PASS / PASS_WITH_WARNING / FAIL»
testPrintRucHash:         «SHA-256 del RUC canónico tomado de la evidencia de TEST_PRINT»
testPrintRucPresent:      «true/false»
testPrintPaperWidthMm:    «ancho efectivo registrado por TEST_PRINT — debe ser 80»
verificationTicketIdHash: «SHA-256 del ticket ID»
firstSaleClaimEventIdHash: «SHA-256 del event ID del claim»

notes:                    «cualquier observación relevante»
```

---

# 4. Troubleshooting

| Problema | Acción |
|---|---|
| POS no recibe fiscal config | Verificar sync, reiniciar POS, verificar feature flag `required_config_v1` |
| Impresora no imprime | Verificar conexión, driver, papel. Si falla → `PRINTER_AVAILABLE = FAIL` |
| WAN no corta | Verificar airplane mode, desconectar router. Si falla → reintentar |
| WAN no restaura | Verificar reconexión, esperar 30s. Si falla → `POST_RECONNECT_SYNC` puede ser WARNING |
| Ticket no alcanza PAID | Verificar checkout path, stock del verification product |
| `ACTIVATED` no aparece | Verificar que backend finalizó. Si cloud caída → `SYNC_VERIFICATION_PENDING` |
| TTFSS > 15 min | Documentar causa. Si es harness → `RUN_INVALID_BY_HARNESS`, reiniciar cohort |
| Seed falla | Verificar PostgreSQL, migraciones, variables de entorno |
| `TEST_PRINT = FAIL` con "régimen fiscal DGI" o "Identidad fiscal del emisor" | Configuración fiscal local ausente: completar Fiscal Setup y esperar el sync de proyección. **No** continuar el run |
| `TEST_PRINT` sale con un régimen distinto a `CUOTA_FIJA` (decisión del founder, 2026-09-17; §9 del manifest) | El régimen local no coincide con la decisión: no emitir documentos, resolver la configuración fiscal y repetir |
| `TEST_PRINT` sale con ancho 58 | El ancho es local: ajustarlo a 80 mm en Ajustes de Hardware y repetir |

---

# 5. Safety Rules

1. **NUNCA** borrar datos durante el piloto para "dejar limpio"
2. **NUNCA** forzar `ACTIVATED` manualmente
3. **NUNCA** manipular timestamps
4. **NUNCA** saltarse checks de Activation
5. Si algo falla → documentar y reiniciar el run completo
6. El cohort requiere 5 runs consecutivos — una falla reinicia todo

---

# 6. Post-Pilot

Después del cohort:

- [ ] Actualizar `AP-00_ENTRY_GATE.md` con resultado del piloto
- [ ] Congelar `acceptanceReleaseId` final
- [ ] Actualizar `AP_FIXTURE_MANIFEST.md` con builds reales
- [ ] Crear `TTFSS_REFERENCE_RUNS.csv` con los 5 runs
- [ ] Crear `TTFSS_REFERENCE_SUMMARY.md` con resultado
- [ ] Iniciar ejecución formal de AP-01..AP-12
