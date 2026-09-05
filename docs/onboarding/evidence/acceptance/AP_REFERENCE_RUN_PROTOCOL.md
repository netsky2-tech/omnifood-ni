# NHILOS Client Onboarding V1 — Reference Run Protocol

**Documento:** `AP_REFERENCE_RUN_PROTOCOL.md`  
**Ubicación:** `docs/onboarding/evidence/acceptance/AP_REFERENCE_RUN_PROTOCOL.md`  
**Estado:** **SEMI-FROZEN — builds congelados; protocolo humano/operativo pendiente de confirmación en campo**  
**Versión:** 1.0 (builds congelados 2026-09-04; Wan/operador pendiente de captura)  
**Fecha de creación:** 2026-09-04  
**Autoridad:** `onboarding_acceptance_plan_v1.0.md` §4.3

---

# 0. Propósito

Este protocolo congelada el comportamiento humano y operativo del benchmark TTFSS para impedir que distintos runs midan caminos distintos.

**Regla:** Si cambia el protocolo, cambia el fixture de aceptación y debe repetirse el cohort completo.

---

# 1. Operator Profile

| Campo | Valor |
|---|---|
| Operador | «COMPLETAR EN CAMPO: nombre/rol del operador que ejecutará el piloto» |
| Rol en sistema | OWNER (del tenant seed — el seed crea un OWNER; el operador usa esas credenciales) |
| Nivel de entrenamiento | «COMPLETAR EN CAMPO: trainee / internal dogfood / expert» |
| Entrenamiento previo permitido | «COMPLETAR EN CAMPO: Sí/No — si sí, especificar alcance exacto (ej. 'practicó una vez con fixture de prueba')» |
| Número de practice runs antes del cohort | «COMPLETAR EN CAMPO: 0 si no se permite practice; documentar si hubo rehearsal» |

**Regla:** El operador y nivel de entrenamiento permanecen constantes durante todo el cohort de 5 runs.

---

# 2. Pre-Run Preconditions

Antes de cada run, verificar:

- [ ] Backend corriendo y accesible
- [ ] PostgreSQL con migración correcta
- [ ] Feature flags en Stage 10 (todos `true`)
- [ ] POS APK instalado en Alacrity Q80
- [ ] Impresora encendida y con papel
- [ ] Terminal en perfil de red correcto
- [ ] Browser limpio (sin cache de sesiones previas)
- [ ] Tenant nuevo semilla executeado (seed script)
- [ ] `OnboardingSession` NO existe para el tenant
- [ ] Cronómetro/reloj sincronizado (NTP o equivalente)
- [ ] No hay procesos de onboarding activos en otros tenants

---

# 3. Initial Tenant State

Cada run inicia con exactamente:

```text
Tenant técnicamente provisionado (is_active=true)
OWNER creado y autenticable
OnboardingSession aún NO iniciada
sin onboardingStartedAt
sin saleReadyFirstAt
sin firstSuccessfulSaleAt
sin activatedAt
sin first_successful_sale_claim local
```

**PROHIBIDO:**
- Pre-configurar fiscal antes del cronómetro
- Pre-cargar productos antes del cronómetro
- Pre-aplicar templates antes del cronómetro
- Pre-vincular terminal antes del cronómetro
- Cualquier configuración adicional no declarada en este protocolo

---

# 4. Reference Path — F1 Template

## 4.1 Ruta exacta del operador

El operador ejecuta **exactamente** estos pasos en este orden:

### Phase A — Session Start (cronómetro inicia aquí)

1. Abrir Owner Dashboard en browser
2. Navegar a Setup Center / Onboarding
3. Primer acceso → sesión se crea automáticamente
4. **Timestamp:** `onboardingStartedAt` se persiste

### Phase B — Fiscal Configuration

5. Ingresar datos fiscales mínimos:
   - RUC
   - Régimen tributario
   - Nombre comercial
   - Dirección
   - Teléfono
6. Guardar configuración fiscal
7. Verificar que fiscal está persistido (no solo en UI)

### Phase C — Catalog Acquisition via Template

8. Seleccionar "Apply Industry Template"
9. Previsualizar template (verificar que es side-effect free)
10. Seleccionar **al menos un producto** del template
11. Aplicar template seleccionada
12. Verificar que productos aparecen en catálogo
13. Verificar que recetas quedan DRAFT/SUGGESTED (no activas)
14. Verificar que insumos tienen stock=0 y averageCost=0

### Phase D — SALE_READY Verification

15. Navegar a Sale Ready Review
16. Verificar que `isSaleReadyNow = true`
17. Verificar que no hay blockers
18. **Timestamp:** `saleReadyFirstAt` se persiste (write-once)

### Phase E — POS Activation

19. Abrir POS en Alacrity Q80
20. Login con credenciales del OWNER
21. Verificar que POS recibe fiscal config
22. Verificar que verification product está disponible localmente
23. Iniciar Activation
24. Ejecutar checks pre-offline (6 checks)
25. Cortar WAN (airplane mode o desconexión)
26. **Checkout de verificación:** seleccionar verification product
27. Pago en efectivo
28. Ticket se imprime (verificar salida física)
29. Ticket persistido en SQLite como PAID
30. Outbox contiene activation evidence + first-sale claim
31. **Timestamp:** `firstSuccessfulSaleAt` se persiste (write-once)

### Phase F — Reconnect & Finalize

32. Restaurar WAN
33. Outbox se drena hacia la nube
34. Backend recibe evidence y finaliza
35. **Timestamp:** `activatedAt` se persiste (write-once)
36. Verificar lifecycle = `ACTIVATED`

### Phase G — Post-Activation (fuera de cronómetro TTFSS)

37. Verificar que `ACTIVATED` es monotónico
38. Verificar que BOH enrichment es opcional
39. Ejecutar VOID de verification sale (normal, no destructivo)
40. Verificar que TTFSS histórico permanece inmutable

---

# 5. POS Initial State

| Campo | Valor |
|---|---|
| App state | Cold start (force close antes del run si ya estaba abierta) |
| SQLite | Fresh database o database del tenant seed |
| Auth state | No autenticado (login requerido) |
| WAN | Connected (hasta Phase E paso 25) |
| Printer | Encendida, con papel, driver real |

---

# 6. WAN Profile

| Fase | Estado WAN |
|---|---|
| Phase A–D | Connected |
| Phase E (paso 25–31) | **Disconnected** (airplane mode) |
| Phase F | **Reconnected** |

**Método de corte:** «COMPLETAR EN CAMPO: airplane mode / router disconnect / other — documentar el paso exacto del operador»  
**Método de restauración:** «COMPLETAR EN CAMPO: desactivar airplane mode / reconectar router / other»  
**Tiempo observable de corte:** «COMPLETAR EN CAMPO si hay constraint — ej. 'máximo 5 segundos entre corte y verificación'»

---

# 7. Browser Cache Policy

| Antes de cada run | Acción |
|---|---|
| Cache | Limpiar cache del browser |
| Cookies | Limpiar cookies del dominio del Owner Dashboard |
| Local storage | Limpiar (si aplica) |
| Service workers | «COMPLETAR EN CAMPO: unregister si aplica — Owner Dashboard es SPA sin service worker registrado» |

---

# 8. Allowed Human Actions

Durante el run, el operador **puede**:

- Navegar entre steps del Setup Center
- Hacer refresh del browser
- Cerrar y reabrir el browser (simula abandon/resume — pero esto es un run separado, no el reference path)
- Esperar razonablemente por respuestas del sistema

---

# 9. Prohibited Pre-Configuration

El operador **NO puede**:

- Pre-configurar fiscal antes del cronómetro
- Pre-cargar productos o template antes del cronómetro
- Pre-vincular la terminal antes del cronómetro
- Usar credenciales de un tenant existente
- Modificar feature flags durante el run
- Saltarse pasos del protocolo
- Usar atajos o endpoints directos para evadir la UI

---

# 10. Expected First-Sale Payment Path

| Campo | Valor |
|---|---|
| Método de pago | Efectivo (C$ monto a definir en campo — recomendado: C$ 80.00) |
| Verification product | «COMPLETAR EN CAMPO: nombre del producto de verificación del fixture manifest» |
| Monto | «COMPLETAR EN CAMPO: ej. C$ 80.00 — debe ser > 0 y cubierto por el efectivo dado» |
| Cambio | «COMPLETAR EN CAMPO si aplica: ej. C$ 0.00 si el monto exacto» |

---

# 11. Reset Procedure Between Runs

Para cada run del cohort:

1. Ejecutar `seed-onboarding-founder-pilot.ts` → nuevo tenant + owner
2. Verificar que el POS recibe el nuevo tenant (logout/login si es necesario)
3. Limpiar browser cache/cookies
4. Verificar impresora lista
5. Verificar WAN connected
6. Verificar cronómetro/reloj listo
7. Congelar timestamp de inicio del run

---

# 12. Measurement Rules

| Regla | Detalle |
|---|---|
| Cronómetro inicia en | Primer write a `OnboardingStartedAt` |
| Cronómetro termina en | `firstSuccessfulSaleAt` persistido |
| No se pausa por | reintento humano, navegación, refresh, abandono, soporte, error recuperable |
| TTFSS se calcula como | `firstSuccessfulSaleAt - onboardingStartedAt` |
| Fuente autoritativa | Timestamps persistidos en DB, NO cronómetro manual |
| Clock confidence requerido | `ANCHORED` para cohort formal |
| Runs `DEVICE_VALIDATED` | Evidencia observacional, NO sustituyen cohort formal |
| Runs `DEGRADED` | Fuera del benchmark; no se ajustan timestamps |

---

# 13. Run Documentation

Por cada run, capturar:

```text
runId
tenantIdHash
fixtureVersion
hardwareManifestHash
backendBuild
ownerDashboardBuild
posBuild
onboardingStartedAt
saleReadyFirstAt
firstSuccessfulSaleAt
activatedAt
clockConfidence
ttfssMs
timeToSaleReadyMs
saleReadyToFirstSaleMs
activationResult
verificationTicketIdHash
firstSaleClaimEventIdHash
notes
```

---

# 14. Firma de Congelación

Cuando este protocolo se use para el cohort formal, firmar:

```text
Firmado por:              «COMPLETAR EN CAMPO»
Fecha de congelación:     «COMPLETAR EN CAMPO: actualizar fecha/hora exacta de firma»
Protocol version:         1.0
Fixture manifest ref:     AP_FIXTURE_MANIFEST.md v1.0 (commit c6b61cd)
acceptanceReleaseId:      c6b61cd-m1801000000000-stage10
```
