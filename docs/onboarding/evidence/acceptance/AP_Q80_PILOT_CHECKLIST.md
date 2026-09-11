# NHILOS — Founder Pilot Q80 — Operational Checklist

**Documento:** `AP_Q80_PILOT_CHECKLIST.md`  
**Ubicación:** `docs/onboarding/evidence/acceptance/AP_Q80_PILOT_CHECKLIST.md`  
**Estado:** **READY FOR EXECUTION**  
**Versión:** 1.0  
**Fecha:** 2026-09-04  
**Autoridad:** `onboarding_acceptance_plan_v1.0.md` §AP-12, `onboarding_execution_roadmap.md` ONB1.10F

---

# 0. Objetivo

Checklist operativo paso a paso para ejecutar el piloto físico del founder tenant en un Alacrity Q80/iPOS real. Este documento es la guía de campo; no reemplaza el Acceptance Plan ni el Reference Run Protocol.

---

# 1. Pre-Flight (Day Before o Morning Of)

## 1.1 Hardware

- [ ] Alacrity Q80/iPOS cargado al 100%
- [ ] Impresora térmica encendida
- [ ] Papel de recibo cargado (58 mm)
- [ ] Test de impresión: imprimir ticket de prueba y verificar salida
- [ ] Terminal en perfil de red correcto (WiFi del piloto)
- [ ] Serial del dispositivo registrado: `Q802024120001`

## 1.2 Software

- [ ] Backend NestJS corriendo y accesible desde la red del piloto
- [ ] PostgreSQL con migración correcta verificada
- [ ] Feature flags en Stage 10 (todos `true`)
- [ ] POS APK instalado en Q80 — verificar versión:
  ```bash
  # En el dispositivo o vía ADB:
  adb shell dumpsys package com.omnifood.pos | grep versionName
  ```
- [ ] Owner Dashboard accesible en browser
- [ ] Browser limpio (cache, cookies, local storage borrados)

## 1.3 Seed del Tenant

- [ ] Ejecutar seed script:
  ```bash
  cd apps/admin_backend
  npm run seed:founder-pilot
  ```
- [ ] Capturar output JSON — contiene tenant ID, owner credentials, offline PIN
- [ ] Verificar que el tenant fue creado en PostgreSQL:
  ```sql
  SELECT id, name, is_active FROM tenants WHERE name LIKE 'Founder Pilot Q80%';
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
| B1 | Ingresar RUC | «COMPLETAR: RUC del fixture» | — |
| B2 | Seleccionar régimen tributario | General | — |
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
| E6 | Checks pre-offline (6 checks) | Todos PASS | — |
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
