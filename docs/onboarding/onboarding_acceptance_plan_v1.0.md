# NHILOS Client Onboarding V1 — Acceptance Plan

**Documento:** `onboarding_acceptance_plan.md`  
**Ubicación recomendada:** `docs/onboarding/onboarding_acceptance_plan.md`  
**Estado:** **APPROVED / AUTHORITATIVE FOR ACCEPTANCE EXECUTION — EXECUTION BLOCKED UNTIL ENTRY GATE**  
**Versión:** 1.0  
**Fecha:** 2026-09-03  
**Autoridad de producto:** `prd_onboarding_v2_approved.md` — **APPROVED / AUTHORITATIVE v2.1**  
**Auditoría de producto:** `onboarding_prd_v2_approval_audit.md` — **APPROVED / AUTHORITATIVE**  
**Autoridad de arquitectura:** `onboarding_architecture_spec.md` v0.2 — su **re-aprobación final sin P0/P1 es precondición de ejecución de este plan**  
**Roadmap de implementación:** `onboarding_execution_roadmap.md` v1.1 — **APPROVED / READY FOR EXECUTION**  
**Alcance fundador:** una ubicación / un terminal fundador, offline-first en operación y multi-tenant por diseño.  
**Métrica primaria:** `Time to First Successful Sale (TTFSS)`.

---

# 0. Objetivo

Este documento define **cómo demostrar que NHILOS Client Onboarding V1 está realmente terminado**.

No redefine producto ni arquitectura. Su función es convertir los contratos ya aprobados en evidencia objetiva de aceptación:

```text
IMPLEMENTED
   ≠
VERIFIED
   ≠
OPERATIONALLY PROVEN
   ≠
ACCEPTED
```

Onboarding V1 solo puede declararse aceptado cuando existe evidencia reproducible de que un tenant puede recorrer el flujo real:

```text
PROVISIONED
   ↓
SETUP_IN_PROGRESS
   ↓
SALE_READY
   ↓
ACTIVATION_IN_PROGRESS
   ↓
First Successful Sale
   ↓
ACTIVATED
   ↓
BOH Enrichment continúa
```

sin perder progreso, sin producir stock/costo/recetas falsos, sin depender de WAN durante el checkout offline, sin romper aislamiento tenant y sin maquillar el KPI principal.

---

# 1. Principios de aceptación

1. **La evidencia manda.** Una demo visual o un test mocked no sustituye PostgreSQL real, browser real, SQLite real, hardware real y receipts verificables.
2. **TTFSS se calcula desde timestamps persistidos.** No se acepta cronómetro manual como fuente autoritativa.
3. **El benchmark no puede ser maquillado.** `onboardingStartedAt` es write-once y una reanudación no reinicia la medición.
4. **`SALE_READY` es state-based.** Se demuestra leyendo estado real de Identity/Fiscal/Catalog.
5. **Activation utiliza el checkout de producción.** No se acepta fake sale, endpoint alterno o tabla paralela.
6. **`PASS_WITH_WARNING` no es un comodín.** Solo aplica al caso normativo de `POST_RECONNECT_SYNC` por causa externa/transitoria con integridad local intacta.
7. **Defecto reproducible o problema de integridad = FAIL.**
8. **Seguridad es gate de aceptación.** Tenant isolation, permissions y `DevicePrincipal` deben probarse con casos negativos.
9. **Product Import no puede tocar Inventory.**
10. **Templates no auto-publican recetas.**
11. **BOH incompleto no invalida el onboarding.**
12. **Costo desconocido no se reporta como cero conocido.**
13. **`ACTIVATED` es histórico y monotónico.**
14. **Activation técnica no equivale automáticamente a `GO_LIVE_ACCEPTED`.**
15. **No se aceptan arreglos destructivos para “dejar limpio” el entorno de prueba.** Venta, Kardex, Audit Trail y milestones conservan historia.

---

# 2. Entry Gate — Cuándo puede ejecutarse este plan

Este Acceptance Plan **no se ejecuta** mientras la feature siga en implementación.

El gate de entrada requiere:

- [ ] `onboarding_architecture_spec.md` aprobado como `APPROVED / ENGINEERING AUTHORITATIVE`.
- [ ] Open architecture P0 = `0`.
- [ ] Open architecture P1 = `0`.
- [ ] ONB1.0–ONB1.10 cerrados.
- [ ] Full regression del roadmap completada.
- [ ] Los 74 escenarios normativos de Architecture tienen test/evidence mapping.
- [ ] W9 legacy tests aún válidos continúan verdes o poseen reemplazo explícito.
- [ ] Legacy migration receipts cerrados o aceptados explícitamente.
- [ ] PostgreSQL baseline/restoration procedure disponible.
- [ ] SQLite founder baseline/restoration procedure disponible.
- [ ] Release candidate exacto de Backend, Owner Dashboard y POS congelado.
- [ ] `acceptanceReleaseId` calculado/documentado a partir de Backend + Owner Dashboard + POS + migration version + feature flags + fixture manifest.
- [ ] Feature flags/cutover state documentado.
- [ ] No existen P0/P1 conocidos abiertos en Onboarding.
- [ ] No existe corrupción o discrepancia de Inventory pendiente causada por imports legacy sin remediation receipt.

Receipt:

```text
docs/onboarding/evidence/acceptance/AP-00_ENTRY_GATE.md
```

Si cualquier punto falla, el resultado es:

```text
NOT_READY_FOR_ACCEPTANCE
```

y no se inicia el benchmark TTFSS.

---

# 3. Modelo de decisión

El resultado global de este plan puede ser:

```text
ACCEPTED
REJECTED
NOT_READY_FOR_ACCEPTANCE
```

Puede existir un bloque de **observaciones P2** en un resultado `ACCEPTED`, siempre que:

- no violen un Acceptance Criterion del PRD;
- no violen una invariante arquitectónica;
- no comprometan seguridad, integridad, fiscalidad, sync o datos;
- tengan owner y seguimiento documentado.

`PASS_WITH_WARNING` es un **resultado de un Activation Attempt**, no un estado de aprobación del Acceptance Plan.

## 3.1 Regla de severidad

### P0 — Blocker absoluto

Ejemplos:

- cross-tenant read/write;
- pérdida/duplicación de venta o outbox;
- Product CSV modifica stock/costo/Kardex;
- template auto-publica receta operativa;
- Activation simulada;
- TTFSS no confiable/manipulado;
- destructive cleanup;
- defecto reproducible convertido en warning.

Un P0 produce:

```text
REJECTED
```

### P1 — Blocker de aceptación

Ejemplos:

- resume pierde progreso;
- readiness incorrecto;
- idempotencia duplicable;
- mismatch cloud/POS que permite Activation;
- rollback no conserva historia;
- permissions solo protegidos en UI.

P1 abierto produce:

```text
REJECTED
```

### P2 — Observación no bloqueante

Solo puede permanecer abierta si no viola los contratos anteriores y existe:

```text
owner
issue/ref
impact
workaround
target follow-up
```

---

# 4. Acceptance Fixture Manifest

Antes de ejecutar cualquier run se congela un manifest reproducible:

```text
docs/onboarding/evidence/acceptance/AP_FIXTURE_MANIFEST.md
```

Debe registrar como mínimo:

```text
acceptanceReleaseId
backendCommit / image / build
ownerDashboardCommit / build
posCommit / build
databaseMigrationVersion
featureFlags
PostgreSQL version
SQLite schema version

founderHardwareModel
founderHardwareSerialHash
OS / firmware
printerAdapter
printerPaperWidth
network profile

browser + version
client workstation OS

reference tenant seed version
fiscal fixture version
template fixture version
CSV fixture hashes
verification product identity
authorized OWNER identity fixture
```

## 4.1 Regla de hardware

El benchmark se ejecuta sobre **el hardware fundador aprobado para la release candidate**.

No se permite cambiar de dispositivo entre runs sin crear un nuevo fixture manifest.

Si el founder hardware cambia, el benchmark TTFSS debe re-baselinarse y volver a ejecutarse antes de usar el resultado como evidencia.

## 4.2 Estado inicial del tenant

Cada reference run inicia con:

```text
Tenant técnicamente provisionado
OWNER creado y autenticable
OnboardingSession aún no iniciada
sin saleReadyFirstAt
sin firstSuccessfulSaleAt
sin activatedAt
sin first_successful_sale_claim local
```

Provisioning queda fuera del cronómetro TTFSS porque el PRD define el inicio en la primera actividad real posterior a `PROVISIONED`.

## 4.3 Reference Run Protocol

Antes del benchmark formal debe existir:

```text
docs/onboarding/evidence/acceptance/AP_REFERENCE_RUN_PROTOCOL.md
```

El protocolo congela el comportamiento humano y operativo del benchmark para impedir que distintos runs midan caminos distintos.

Debe documentar como mínimo:

```text
operator profile / actor
training allowed before cohort
exact template version
exact selected template item IDs
exact fiscal input fixture
verification product
initial browser route
auth/login precondition
POS initial state
printer state
WAN profile
browser cache policy
POS app cold/warm state
whether artifacts are pre-downloaded
allowed human actions
prohibited pre-configuration
expected first-sale payment path
reset procedure between tenants
```

Reglas:

1. La selección de productos/template items no puede decidirse ad hoc durante cada run.
2. No se permite preconfiguración adicional no declarada para reducir TTFSS.
3. El operador y nivel de entrenamiento deben permanecer constantes durante el cohort.
4. Si cambia el protocolo, cambia el fixture de aceptación y debe repetirse el cohort completo.

---

# 5. Fixtures funcionales

Los fixtures son parte de la metodología de aceptación, no nuevos requisitos de producto.

## F1 — Reference Template Path

Fixture de benchmark rápido:

```text
1 Industry Template de aceptación
12 productos sugeridos
12 precios de venta válidos > 0
4 insumos sugeridos sin stock/costo afirmado
3 recetas sugeridas que deben quedar DRAFT/SUGGESTED
```

El operador selecciona un subconjunto suficiente para disponer de catálogo vendible.

Este es el **reference path primario** para el target TTFSS.

## F2 — CSV Clean

```text
25 filas válidas
headers oficiales soportados
sin stock_inicial
sin costo/CPP
sin duplicados
```

Objetivo: probar upload → staging → preview → commit → catálogo vendible.

## F3 — CSV Mixed

```text
20 filas válidas
5 filas inválidas
al menos 1 header alias soportado
al menos 1 columna desconocida
```

Se ejecuta en:

```text
VALID_ONLY
ALL_OR_NOTHING
```

## F4 — CSV Duplicate

Incluye productos existentes para demostrar:

```text
REPLACE
SKIP
FAIL
```

`REPLACE` debe limitarse a Product Master.

## F5 — Legacy Unsafe Input

Incluye columnas legacy:

```text
stock_inicial
costo / CPP
codigo_barras / barcode
```

Expected:

- stock/costo no llegan a Inventory;
- Barcode no se degrada a SKU;
- UI explica campos no aplicados cuando corresponda.

## F6 — Existing Catalog / State-based Setup

Tenant con fiscal mínimo y/o producto ya configurado antes de abrir Setup Center.

Expected:

- Setup Center reconoce el estado;
- no obliga a repetir writes para completar el step.

---

# 6. Contrato de métricas

## 6.1 TTFSS

Fórmula autoritativa:

```text
TTFSS
  = firstSuccessfulSaleAt
  - onboardingStartedAt
```

### Inicio

`onboardingStartedAt` es el primer timestamp persistido por actividad real de onboarding y no puede reiniciarse.

### Fin

`firstSuccessfulSaleAt` proviene del `first_successful_sale_claim` local ganador validado por cloud.

La venta elegible debe:

```text
ticket state = PAID
SQLite commit = durable
receipt/print path = successful/capable
no setup failure
terminal = founder terminal
```

Una venta controlada de Activation puede ser First Successful Sale si usa exactamente el production checkout path.

## 6.2 Cohort válido para benchmark

Para el benchmark formal:

```text
measurementEligible = true
clockConfidence = ANCHORED
```

Runs con:

```text
clockConfidence = DEVICE_VALIDATED
```

pueden conservarse como evidencia observacional, pero **no sustituyen el cohort formal**.

Runs:

```text
clockConfidence = DEGRADED
```

quedan fuera del benchmark TTFSS y deben investigarse; no se ajustan timestamps para incluirlos.

## 6.3 Target formal

```text
Reference TTFSS target: <= 15:00 minutos
```

Metodología de aceptación:

- ejecutar **5 reference runs consecutivos programados** del F1 Reference Template Path;
- cada run utiliza tenant limpio;
- cada run usa exactamente el fixture manifest y `AP_REFERENCE_RUN_PROTOCOL.md` congelados;
- 5/5 runs deben tener `measurementEligible=true`;
- 5/5 runs deben producir `clockConfidence=ANCHORED`;
- **5/5 runs deben cumplir `TTFSS <= 15:00`**;
- no se aprueba por promedio;
- no se reduce el denominador excluyendo runs `DEVICE_VALIDATED`, `DEGRADED` o lentos;
- cualquier run con `DEVICE_VALIDATED`, `DEGRADED`, `TTFSS > 15:00`, integrity failure o setup failure inesperado hace fallar el cohort;
- si una falla pertenece exclusivamente al harness/laboratorio y no al producto, debe documentarse como `RUN_INVALID_BY_HARNESS`, pero igualmente se reinicia el cohort completo;
- después de una corrección se ejecuta un nuevo cohort completo de 5 runs, nunca solo el run fallido.

Receipt:

```text
TTFSS_REFERENCE_RUNS.csv
TTFSS_REFERENCE_SUMMARY.md
```

Campos mínimos por run:

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

## 6.4 Lo que NO se excluye del TTFSS

No se pausa el cronómetro por:

- reintento humano;
- navegación entre steps;
- refresh;
- abandono y reanudación;
- soporte asistido;
- error recuperable del producto.

Eso forma parte de la experiencia real si ocurre.

El benchmark F1 no introduce abandono intencional porque esa resiliencia se prueba en suites separadas.

## 6.5 Métricas secundarias

Se debe demostrar instrumentación válida para:

- tiempo hasta `SALE_READY`;
- tiempo `SALE_READY → ACTIVATED`;
- First Customer Sale separado;
- duración por step;
- abandon/resume;
- import errors;
- porcentaje valid/invalid;
- `VALID_ONLY` vs `ALL_OR_NOTHING`;
- Template vs CSV vs manual/existing catalog;
- Activation `PASS / PASS_WITH_WARNING / FAIL`;
- BOH readiness posterior.

**No se fijan targets numéricos de aceptación adicionales en V1**, porque el PRD expresamente los deja para evidencia de piloto.

El gate aquí es:

```text
measurable
reconciliable
sin PII/secrets indebidos
no gobierna lifecycle
```

---

# 7. Acceptance Suites

# AP-01 — Session, Lifecycle & State-based Readiness

**Cubre:** PRD AC-01..AC-08, AC-27, AC-28, AC-34, AC-49, AC-55, AC-57.  
**Architecture:** scenarios 1–8.  
**Roadmap:** ONB1.1, ONB1.2, ONB1.5.

## Escenarios obligatorios

- primer acceso asegura una sola session;
- primera actividad escribe `onboardingStartedAt` una vez;
- refresh reconstruye progreso;
- cerrar navegador y reabrir conserva progreso;
- dos requests concurrentes de inicio producen un único `onboardingStartedAt`;
- dos pestañas no producen lost update;
- configuración preexistente completa steps state-based;
- `SALE_READY` exige identidad + fiscal mínimo + catálogo mínimo;
- retirar último producto antes de Activation degrada current readiness;
- `saleReadyFirstAt` no se borra;
- `Tenant.is_active` no equivale a `ACTIVATED`;
- health futuro no revierte `ACTIVATED`;
- grant/revoke de `SALE_READY` genera evidencia material de `SYSTEM_RECONCILER`;
- un campo que el backend no persiste no aparece como guardado ni participa en readiness.

## DoD

- [ ] PostgreSQL real.
- [ ] Browser real.
- [ ] Optimistic concurrency probado.
- [ ] Milestones write-once verificados por query/receipt.
- [ ] `SALE_READY` explicable con blockers/warnings/optional.
- [ ] Ningún booleano UI actúa como source of truth.
- [ ] Keyboard/focus usable en Setup Center.
- [ ] Loading, API error y stale state se representan explícitamente.
- [ ] Blockers/warnings no dependen únicamente del color.
- [ ] `VERSION_CONFLICT` fuerza reload/reconcile de domain truth.
- [ ] Safe retry conserva input del usuario cuando sea válido hacerlo.
- [ ] Un nuevo dispositivo web autorizado reconstruye progreso durable.
- [ ] Campos no persistidos nunca aparecen como guardados.

Receipt:

```text
AP-01_SESSION_LIFECYCLE.md
AP-01B_SETUP_CENTER_UX_RECOVERY.md
```

---

# AP-02 — Idempotency & Concurrency

**Cubre:** PRD AC-13, AC-23, AC-33, AC-47.  
**Architecture:** scenarios 9–14.  
**Roadmap:** ONB1.1, ONB1.3, ONB1.4, ONB1.7, ONB1.8.

## Escenarios obligatorios

- same key + same payload después de success = mismo resultado/no-op;
- same key + different payload = `INTEGRITY_CONFLICT`;
- lease vigente evita segundo worker;
- stale lease permite takeover atómico;
- retryable failure reentra sin doble business effect;
- final failure requiere nuevo command key;
- HTTP timeout after commit no duplica template/product/Activation;
- doble click no crea segundo efecto.

## DoD

- [ ] Constraints físicas verificadas en PostgreSQL.
- [ ] Fault injection ejecutada.
- [ ] No existen duplicados económicos/estructurales.
- [ ] Los retries conservan correlación de audit/evidence.

Receipt:

```text
AP-02_IDEMPOTENCY_CONCURRENCY.md
```

---

# AP-03 — Industry Template Safety

**Cubre:** PRD AC-09..AC-13, AC-45, AC-50.  
**Architecture:** scenarios 15–24.  
**Roadmap:** ONB1.3, ONB1.5.

## Escenarios obligatorios

- preview sin side effects;
- selección parcial respetada end-to-end;
- apply transaccional;
- failure intermedio provoca rollback total;
- reapply idéntico no duplica;
- cambios manuales no se pisan silenciosamente;
- stable provenance no depende del nombre;
- `firstAppliedVersion`, `lastSeenVersion` y `lastAppliedVersion` evolucionan correctamente;
- ningún side effect externo se emite antes del commit del Unit of Work;
- recetas nuevas quedan `DRAFT / SUGGESTED`;
- draft recipe no explota BOM ni Kardex;
- seed de insumo no afirma stock/costo;
- después de aplicar Template se puede usar CSV o manual catalog.

## DoD

- [ ] Product/Recipe/Inventory state before/after capturado.
- [ ] Cero Kardex causado por drafts.
- [ ] Cero recipes auto-publicadas.
- [ ] Cero stock/costo ficticio.
- [ ] Reapply receipt verificable.

Receipt:

```text
AP-03_TEMPLATE_SAFETY.md
```

---

# AP-04 — Product CSV Contract & Safety

**Cubre:** PRD AC-14..AC-24, AC-43, AC-44, AC-51, AC-52.  
**Architecture:** scenarios 25–35.  
**Roadmap:** ONB1.4, ONB1.5.

## Escenarios obligatorios

- file upload funciona;
- textarea fallback, si existe, usa el mismo contrato;
- official template y parser comparten `parserContractVersion`;
- reupload/chunk retry no duplica `rowOrdinal`;
- aliases soportados normalizan correctamente;
- unknown column se informa;
- fila inválida no llega a live tables;
- `VALID_ONLY` comitea solo válidos;
- `ALL_OR_NOTHING` revierte todo;
- error export es tenant/session scoped;
- duplicate preview muestra match/target/fields;
- `REPLACE`, `SKIP`, `FAIL` son explícitos;
- retry no crea segundo Product;
- `REPLACE` no toca stock/costo/Kardex;
- stock/cost legacy input no llega ni a Product Master ni a Inventory;
- Barcode nunca se degrada a SKU.

## DoD

- [ ] F2–F5 ejecutados.
- [ ] Product Master diffs reconciliados.
- [ ] Inventory/Kardex before/after sin cambios por Product CSV.
- [ ] Error export no filtra datos de otro tenant.
- [ ] Contrato UI/template/parser/commit coincide.

Receipt:

```text
AP-04_PRODUCT_IMPORT.md
```

---

# AP-05 — Cloud → POS Required Config

**Cubre:** PRD AC-04, AC-27, AC-29, AC-37, AC-48.  
**Architecture:** scenarios 36–39.  
**Roadmap:** ONB1.6.

## Escenarios obligatorios

Antes de cortar WAN:

- Fiscal `{revision,fingerprint}` existe localmente;
- verification Product requerido existe/coincide en SQLite;
- usuario autorizado posee material de autenticación offline;
- duplicate inbound config = no-op;
- same revision + different fingerprint = integrity conflict;
- stale/mismatched config bloquea Activation, no cambia la verdad de `SALE_READY` cloud.

## DoD

- [ ] Estado cloud y SQLite comparado.
- [ ] Fingerprint/revision receipt.
- [ ] Offline auth comprobada.
- [ ] Stale config negative test.
- [ ] No dependencia de WAN para el checkout posterior.

Receipt:

```text
AP-05_REQUIRED_CONFIG_LOCAL.md
```

---

# AP-06 — Activation & Offline Production Path

**Cubre:** PRD AC-29..AC-34, AC-37, AC-53..AC-55.  
**Architecture:** scenarios 40–55.  
**Roadmap:** ONB1.7, ONB1.8.

## Checks obligatorios

```text
TERMINAL_LINKED
REQUIRED_CONFIG_LOCAL
AUTHORIZED_USER_LOCAL
PRINTER_AVAILABLE
TEST_PRINT
SQLITE_DURABILITY
OFFLINE_SALE_PAID
SALE_RECEIPT_PATH
OUTBOX_DURABLE
POST_RECONNECT_SYNC
```

## Casos obligatorios

### PASS

- todos los checks locales PASS;
- venta real offline durable;
- outbox durable;
- reconexión;
- evidencia aplicada en cloud sin duplicación;
- backend finaliza PASS.

### FAIL — hard blocker

Probar al menos:

- printer unavailable;
- SQLite durability failure simulado/controlado;
- unauthorized local user;
- required config mismatch;
- outbox integrity failure;
- reproducible sync defect con backend disponible.

Expected:

```text
FAIL
```

nunca warning.

### SYNC_VERIFICATION_PENDING — cloud finalizer inaccesible

Probar:

- todos los checks locales PASS;
- venta durable;
- outbox íntegro;
- backend/cloud finalizer inaccesible después de completar evidencia local.

Expected:

```text
localStatus = SYNC_VERIFICATION_PENDING
activatedAt = NULL
POS no emite PASS / PASS_WITH_WARNING / FAIL
```

Al recuperar conectividad, el backend recibe la evidence y realiza la finalización autoritativa.

### PASS_WITH_WARNING — backend finalizer accesible

Probar exclusivamente:

- backend finalizer accesible;
- todos los checks locales PASS;
- venta durable;
- outbox íntegro;
- `POST_RECONNECT_SYNC = WARNING`;
- causa externa/transitoria;
- ausencia de defecto reproducible.

Expected:

```text
PASS_WITH_WARNING
ActivationFollowUp = OPEN
ACTIVATED permitido por backend
```

Posteriormente demostrar convergencia y cierre del follow-up sin modificar `activatedAt`.

## DoD

- [ ] Hardware real.
- [ ] WAN realmente desconectada en tramo offline.
- [ ] Venta usa production checkout.
- [ ] Ticket llega a `PAID`.
- [ ] Ticket/receipt/outbox sobreviven restart.
- [ ] `StartActivation` acepta candidate terminal antes de probar `TERMINAL_LINKED`.
- [ ] Solo existe un active attempt por sesión y un final result por attempt/checkCode.
- [ ] Retry same attempt no crea segundo verification ticket.
- [ ] POS nunca decide `ACTIVATED`.
- [ ] Backend es la autoridad de finalización.
- [ ] Verification sale nunca se hard-deletea.
- [ ] VOID normal conserva historia/TTFSS.
- [ ] `FAIL + readiness=true` regresa lifecycle a `SALE_READY`.
- [ ] `FAIL + readiness=false` regresa lifecycle a `SETUP_IN_PROGRESS`.
- [ ] `cloud finalizer unreachable` conserva `activatedAt=NULL` hasta finalización backend.

Receipt:

```text
AP-06_ACTIVATION.md
```

---

# AP-07 — TTFSS Integrity & Benchmark

**Cubre:** PRD AC-02, AC-31, AC-35, AC-48, AC-57.  
**Architecture:** scenarios 56–60.  
**Roadmap:** ONB1.8, ONB1.9, ONB1.10F.

## Integridad del claim

- primera venta elegible crea un solo claim local;
- una venta posterior no reemplaza el claim;
- sync order no cambia el ganador;
- resend exacto es no-op;
- server-time anchor produce timestamp canonical verificable;
- clock skew/restart no refecha silenciosamente;
- VOID posterior no borra TTFSS.

## Benchmark formal

Ejecutar cohort de 5 runs F1 según §6.

## DoD

- [ ] Cohort = 5 reference runs consecutivos programados.
- [ ] 5/5 runs `measurementEligible=true`.
- [ ] 5/5 runs `ANCHORED`.
- [ ] 5/5 runs `TTFSS <= 15:00`.
- [ ] Ningún run degradado/lento fue reemplazado para completar el denominador.
- [ ] 0 timestamp manual.
- [ ] 0 reset de `onboardingStartedAt`.
- [ ] 0 first-sale claim duplicado.
- [ ] Query cloud reconcilia exactamente con SQLite/evidence.
- [ ] `Time to First Customer Sale` no sobrescribe TTFSS.

Receipt:

```text
AP-07_TTFSS.md
TTFSS_REFERENCE_RUNS.csv
TTFSS_REFERENCE_SUMMARY.md
```

---

# AP-08 — Security, RBAC, Audit & Telemetry

**Cubre:** PRD AC-38, AC-39 y las invariantes de seguridad aprobadas.  
**Architecture:** scenarios 61–68.  
**Roadmap:** ONB1.1, ONB1.9, ONB1.10.

## Security negative suite

En PostgreSQL real:

- Tenant A no lee session de B;
- Tenant A no lee/importa staging de B;
- Tenant A no aplica template en B;
- Tenant A no lee/finaliza Activation de B;
- forged tenant body/query no altera scope;
- forged evidence tenant/terminal no sustituye `DevicePrincipal`;
- usuario sin permission recibe deny server-side;
- support sin tenant grant recibe deny;
- support con grant deja Audit Trail correlacionable.

## Audit

Material events deben correlacionar como mínimo:

```text
tenant
actor/system reconciler
session
command
target
result
timestamp
```

## Audit + Telemetry sanitization

Revisar ambos streams:

```text
Audit Trail
Telemetry
```

y validar ausencia de:

```text
JWT
password
PIN/TOTP
full raw CSV
card data
unnecessary PII
```

Responsabilidades:

```text
Audit Trail -> material / forense / correlacionable
Telemetry   -> analytics / duración / funnel / counts
```

## DoD

- [ ] Cross-tenant negative tests PASS.
- [ ] RLS/predicates fail closed.
- [ ] Permissions no dependen de UI.
- [ ] Device trust boundary PASS.
- [ ] Audit material correlacionable y sanitizado.
- [ ] Telemetry sanitizada.
- [ ] Telemetry no controla lifecycle.

Receipt:

```text
AP-08_SECURITY_AUDIT_TELEMETRY.md
```

---

# AP-09 — Progressive BOH & Non-blocking Sales

**Cubre:** PRD AC-07, AC-08, AC-25, AC-26, AC-40..AC-44.  
**Roadmap:** ONB1.9.

## Escenarios obligatorios

Tenant con:

```text
1 producto vendible
sin recipe
sin stock inicial
sin CPP/costo conocido
sin proveedor
sin staff adicional
```

debe poder:

```text
SALE_READY
→ Activation
→ First Successful Sale
→ ACTIVATED
```

Expected:

- venta permitida;
- sin BOM explosion si no existe receta;
- `COST_PENDING` visible;
- no mostrar margen basado en costo cero ficticio;
- `activatedAt` no cambia al avanzar BOH;
- `INVENTORY_READY`, `COSTING_READY`, `OPERATIONS_READY` permanecen progresivos;
- ausencia de importadores complejos no invalida V1.

## Flujo positivo de enriquecimiento posterior

Después de Activation, ejecutar:

```text
ACTIVATED + COST_PENDING
   ↓
configurar alcance Inventory válido
   ↓
INVENTORY_READY
   ↓
configurar costo válido
   ↓
COSTING_READY
   ↓
configurar operations scope definido
   ↓
OPERATIONS_READY
```

En cada transición verificar:

```text
activatedAt = unchanged
TTFSS = unchanged
Sales remains available
readiness state derived from owner domain
```

## DoD

- [ ] E2E activated + BOH incomplete.
- [ ] E2E positive progression `INVENTORY_READY → COSTING_READY → OPERATIONS_READY`.
- [ ] Costo desconocido no se presenta como `KNOWN(0)`.
- [ ] BOH readiness no revoca Activation.
- [ ] Sales continúa operativa durante enriquecimiento.
- [ ] `STEP_SKIPPED` solo se usa para contenido opcional/postergable.

Receipt:

```text
AP-09_PROGRESSIVE_BOH.md
```

---

# AP-10 — Legacy Reconciliation, Migration & Rollback

**Cubre:** PRD AC-24, AC-32, AC-46 y boundary legacy.  
**Architecture:** scenarios 69–74.  
**Roadmap:** ONB1.10.

## Escenarios obligatorios

- staging legacy incompatible no puede volver a escribir stock/costo;
- recipes legacy con provenance confiable poseen receipt:
  - `KEEP_PUBLISHED`, o
  - `MOVE_TO_DRAFT`;
- tenant operativo nunca recibe `MOVE_TO_DRAFT` silencioso;
- discrepancies de legacy import se remedian solo vía Inventory command/Kardex;
- tenants legacy sin timestamp confiable quedan `measurementEligible=false`;
- no se inventa TTFSS;
- W9 baseline test posee continuidad o mapping de reemplazo.

## Rollback rehearsal

Deshabilitar nueva orquestación sin:

- borrar Product/Fiscal válido;
- despublicar ventas;
- truncar staging global;
- borrar Audit Trail;
- reescribir Kardex;
- reescribir milestones;
- restaurar unsafe import behavior;
- restaurar recipe auto-publication.

## DoD

- [ ] Migration receipts completos.
- [ ] Backup/restore rehearsal.
- [ ] Feature rollback rehearsal.
- [ ] Cero hard delete de Sales/Audit/Kardex.
- [ ] Cero stock/cost remediation por UPDATE directo.

Receipt:

```text
AP-10_MIGRATION_ROLLBACK.md
```

---

# AP-11 — Full Product/Architecture Conformance

Este gate evita que el Acceptance Plan pruebe solo el happy path.

## Product

Los **AC-01..AC-57** de `prd_onboarding_v2_approved.md` deben tener:

```text
PASS
```

con evidencia trazable.

No se admite `NOT_APPLICABLE` para esconder un AC normativo. Los AC que expresan non-goals se satisfacen demostrando que la ausencia de esas capacidades no rompe el flujo V1 y que no hubo scope creep.

## Architecture

Los **74 escenarios normativos** de `onboarding_architecture_spec.md` deben tener:

```text
PASS
```

o reemplazo equivalente explícitamente mapeado en caso de refactor de test, nunca desaparición silenciosa.

## DoD

- [ ] 57/57 PRD AC con evidence ref.
- [ ] 74/74 architecture scenarios con evidence ref.
- [ ] W9 regression mapping cerrado.
- [ ] 0 P0.
- [ ] 0 P1.

Receipt:

```text
AP-11_TRACEABILITY_MATRIX.md
```

Formato recomendado:

| Requirement | Source | Automated Test | Real-system Evidence | Status | Notes |
|---|---|---|---|---|---|

---

# AP-12 — Founder Pilot Operational Proof

Este es el gate de **Operationally Proven**.

Se ejecuta sobre el mismo release candidate y founder fixture congelados.

## Runs obligatorios

1. Reference path limpio.
2. Abandon/resume.
3. Industry Template path.
4. Product CSV clean path.
5. Product CSV mixed/error path.
6. Existing Catalog / state-based path.
7. WAN outage durante Activation.
8. POS restart mid-Activation.
9. `SYNC_VERIFICATION_PENDING` con backend finalizer inaccesible.
10. Activation PASS.
11. Activation FAIL por hard blocker.
12. PASS_WITH_WARNING únicamente con backend finalizer accesible y causa externa/transitoria.
13. Follow-up warning closure.
14. Verification sale VOID normal.
15. Rollback rehearsal.

## Pilot evidence

Por cada run:

```text
run id
builds
tenant/session ids hashed
timeline
result
screenshots/video refs when useful
DB receipts
SQLite receipts
audit refs
telemetry refs
failure/repair notes
```

## DoD

- [ ] Todos los runs obligatorios completados.
- [ ] Ningún issue de integridad.
- [ ] Ningún cross-tenant issue.
- [ ] Ninguna venta perdida/duplicada.
- [ ] Ningún milestone reescrito.
- [ ] Rollback seguro probado.
- [ ] TTFSS formal aprobado por AP-07.

Receipt:

```text
AP-12_FOUNDER_PILOT.md
```

---

# 8. Evidence Pack

Toda evidencia final se conserva bajo:

```text
docs/onboarding/evidence/acceptance/
```

Estructura recomendada:

```text
AP-00_ENTRY_GATE.md
AP_FIXTURE_MANIFEST.md
AP_REFERENCE_RUN_PROTOCOL.md

AP-01_SESSION_LIFECYCLE.md
AP-01B_SETUP_CENTER_UX_RECOVERY.md
AP-02_IDEMPOTENCY_CONCURRENCY.md
AP-03_TEMPLATE_SAFETY.md
AP-04_PRODUCT_IMPORT.md
AP-05_REQUIRED_CONFIG_LOCAL.md
AP-06_ACTIVATION.md
AP-07_TTFSS.md
AP-08_SECURITY_AUDIT_TELEMETRY.md
AP-09_PROGRESSIVE_BOH.md
AP-10_MIGRATION_ROLLBACK.md
AP-11_TRACEABILITY_MATRIX.md
AP-12_FOUNDER_PILOT.md

TTFSS_REFERENCE_RUNS.csv
TTFSS_REFERENCE_SUMMARY.md

AP_FINAL_SIGNOFF.md
```

## 8.1 Reglas de evidencia

Cada receipt debe incluir:

```text
date/time
environment
builds/commits
fixture version
commands/tests executed
expected result
actual result
evidence refs
issues found
remediation refs
reviewer
final status
```

Un resultado posterior **no borra** un failure anterior. Lo supersede con un nuevo receipt manteniendo historial.

## 8.2 Release integrity y reutilización de evidencia

AP-00 congela un único:

```text
acceptanceReleaseId
```

derivado de:

```text
backend build
owner dashboard build
POS build
migration version
feature flag set
fixture manifest version
```

Reglas:

1. Evidencia previa de ONB1.10 puede reutilizarse únicamente si corresponde exactamente al mismo `acceptanceReleaseId`, fixture y protocolo y conserva receipts completos.
2. ONB1.10F es rehearsal y **no sustituye AP-07 TTFSS formal**.
3. Cualquier cambio de código, migration o configuración funcional posterior a AP-00 genera un nuevo `acceptanceReleaseId`.
4. Las suites impactadas por ese cambio deben reejecutarse.
5. `AP_FINAL_SIGNOFF.md` no puede combinar PASS provenientes de distintos `acceptanceReleaseId`.

---

# 9. Final Definition of Done — Onboarding V1

NHILOS Client Onboarding V1 se considera **ACCEPTED** únicamente si todos los siguientes gates están cerrados.

## Product / UX

- [ ] 57/57 PRD Acceptance Criteria demostrados.
- [ ] Setup Center persiste y reanuda progreso.
- [ ] Readiness es state-based.
- [ ] `SALE_READY` requiere exactamente identidad + fiscal mínimo + catálogo mínimo.
- [ ] BOH incompleto no bloquea venta.
- [ ] Rutas Template / CSV / existing/manual son combinables.
- [ ] UI distingue blockers, warnings y opcionales.
- [ ] No existe scope creep que convierta POS en segunda superficie administrativa.

## Template / Import safety

- [ ] Recipe de template nueva = `DRAFT/SUGGESTED`.
- [ ] Draft recipe no toca Inventory/Kardex.
- [ ] Reapply no duplica.
- [ ] Product CSV no toca stock/costo/CPP/Kardex.
- [ ] Barcode no se degrada a SKU.
- [ ] `REPLACE` solo modifica Product Master.
- [ ] `VALID_ONLY` / `ALL_OR_NOTHING` verificados.
- [ ] `REPLACE / SKIP / FAIL` verificados.
- [ ] Official template/parser/commit contract coincide.

## Lifecycle / consistency

- [ ] `onboardingStartedAt` write-once.
- [ ] `saleReadyFirstAt` write-once.
- [ ] `firstSuccessfulSaleAt` write-once.
- [ ] `activatedAt` write-once.
- [ ] Optimistic concurrency evita lost updates.
- [ ] Idempotency evita duplicate business effect.
- [ ] `ACTIVATED` es monotónico e independiente de `Tenant.is_active`.

## POS / Offline / Activation

- [ ] Required config local comprobada.
- [ ] Authorized user local comprobado.
- [ ] Printer real comprobada.
- [ ] SQLite durability comprobada.
- [ ] Production checkout real comprobado.
- [ ] Offline `PAID` comprobado.
- [ ] Receipt path comprobado.
- [ ] Outbox durable comprobado.
- [ ] Restart recovery comprobado.
- [ ] Sync convergence comprobada.
- [ ] Cloud es único finalizer.
- [ ] PASS semantics comprobada.
- [ ] FAIL semantics comprobada, incluyendo retorno a `SALE_READY`/`SETUP_IN_PROGRESS`.
- [ ] `SYNC_VERIFICATION_PENDING` comprobado cuando backend finalizer es inaccesible.
- [ ] PASS_WITH_WARNING comprobado solo con backend finalizer accesible y `POST_RECONNECT_SYNC=WARNING`.
- [ ] Follow-up closure comprobado.
- [ ] VOID normal conserva historia.

## TTFSS

- [ ] Benchmark cohort = 5 reference runs consecutivos programados.
- [ ] 5/5 `measurementEligible=true`.
- [ ] 5/5 `clockConfidence=ANCHORED`.
- [ ] 5/5 `TTFSS <= 15:00`.
- [ ] TTFSS proviene de timestamps persistidos.
- [ ] First-sale claim local es único.
- [ ] Sync order no altera ganador.
- [ ] First Customer Sale se mide por separado cuando aplique.

## Security / Audit

- [ ] Cross-tenant suite PASS en PostgreSQL real.
- [ ] RLS/predicates fail closed.
- [ ] Permissions server-side PASS.
- [ ] Support grant boundary PASS.
- [ ] `DevicePrincipal` trust boundary PASS.
- [ ] Audit material correlacionable y sanitizado.
- [ ] Telemetry sanitizada.
- [ ] Cero secretos/raw CSV indebidos en telemetry/audit.

## Legacy / Recovery

- [ ] Legacy template receipts cerrados.
- [ ] Legacy import integrity receipts cerrados.
- [ ] Tenants legacy sin evidencia no publican TTFSS ficticio.
- [ ] Rollback rehearsal PASS.
- [ ] Restore rehearsal PASS.
- [ ] No destructive cleanup.

## Regression

- [ ] 74/74 Architecture scenarios demostrados.
- [ ] W9 relevante verde o reemplazado con mapping.
- [ ] Open P0 = 0.
- [ ] Open P1 = 0.

---

# 10. Criterio final de aceptación

La decisión final se registra en:

```text
docs/onboarding/evidence/acceptance/AP_FINAL_SIGNOFF.md
```

Formato:

```text
Acceptance release ID:           <frozen acceptanceReleaseId>
Product AC coverage:             57 / 57 PASS
Architecture scenarios:          74 / 74 PASS
Reference TTFSS cohort:          5 / 5 scheduled runs <= 15:00
Clock confidence cohort:         5 / 5 ANCHORED
Cross-tenant/security:           PASS
Activation PASS:                 PASS
Activation FAIL semantics:       PASS
SYNC_VERIFICATION_PENDING:       PASS
PASS_WITH_WARNING semantics:     PASS
Offline/restart durability:      PASS
Template safety:                 PASS
Product Import safety:           PASS
Legacy reconciliation:           PASS
Rollback rehearsal:              PASS
Open P0:                         0
Open P1:                         0

FINAL DECISION:                  ACCEPTED
```

Cualquier desvío de los hard gates anteriores produce:

```text
FINAL DECISION: REJECTED
```

hasta que exista remediation + evidence nueva.

---

# 11. `ACTIVATED` vs `GO_LIVE_ACCEPTED`

Este Acceptance Plan demuestra completitud de **NHILOS Client Onboarding V1 como capacidad de producto**.

No autoriza automáticamente:

```text
GO_LIVE_ACCEPTED
```

para un deployment contractual que tenga requisitos adicionales.

Un cliente específico puede exigir gates como:

- inventario inicial;
- recetas/consumo;
- costeo/margen;
- Owner Portal;
- respaldos;
- capacitación;
- checklist físico;
- aceptación bilateral.

Esos requisitos deben vivir en un **Deployment Acceptance Annex / Customer Go-Live Checklist** separado.

La regla es:

```text
Product Onboarding ACCEPTED
        ≠
Customer Deployment GO_LIVE_ACCEPTED
```

y tampoco:

```text
Tenant ACTIVATED
        ≠
Customer Deployment GO_LIVE_ACCEPTED
```

---

# 12. Traceability Summary

| Acceptance Suite | PRD | Architecture | Roadmap |
|---|---|---|---|
| AP-01 Session/Lifecycle + UX Recovery | AC-01..08, 27, 28, 34, 49, 55, 57 | 1–8 | ONB1.1, 1.2, 1.5 |
| AP-02 Idempotency | AC-13, 23, 33, 47 | 9–14 | ONB1.1, 1.3, 1.4, 1.7, 1.8 |
| AP-03 Template | AC-09..13, 45, 50 | 15–24 | ONB1.3, 1.5 |
| AP-04 Import | AC-14..24, 43, 44, 51, 52 | 25–35 | ONB1.4, 1.5 |
| AP-05 Required Config | AC-04, 27, 29, 37, 48 | 36–39 | ONB1.6 |
| AP-06 Activation | AC-29..34, 37, 53..55 | 40–55 | ONB1.7, 1.8 |
| AP-07 TTFSS | AC-02, 31, 35, 48, 57 | 56–60 | ONB1.8, 1.9, 1.10 |
| AP-08 Security/Audit | AC-38, 39 | 61–68 | ONB1.1, 1.9, 1.10 |
| AP-09 Progressive BOH | AC-07, 08, 25, 26, 40..44 | cross-cutting | ONB1.9 |
| AP-10 Migration/Rollback | AC-24, 32, 46 | 69–74 | ONB1.10 |
| AP-11 Full Conformance | AC-01..57 | 1–74 | ONB1.10 |
| AP-12 Founder Pilot | reference path + operational evidence | cross-cutting | ONB1.10F/G |

---

# 13. Riesgos que este plan impide aceptar por accidente

| Riesgo | Señal de rechazo |
|---|---|
| Wizard bonito pero efímero | refresh/restart pierde progreso |
| TTFSS artificialmente bajo | timestamp reiniciado o manual |
| Template peligroso | recipe activa/BOM/Kardex sin publicación explícita |
| Import peligroso | stock/costo/CPP cambia desde Product CSV |
| Semántica corrupta | Barcode termina en SKU |
| False Activation | fake checkout / POS decide PASS |
| Warning abusivo | defecto reproducible termina `PASS_WITH_WARNING` |
| Offline ficticio | WAN requerida durante verification sale |
| Multi-tenant blast radius | A accede/escribe B |
| Security theater | permiso solo oculto en UI |
| Legacy maquillado | TTFSS inventado o migration sin receipt |
| Rollback destructivo | elimina ventas/audit/kardex/milestones |
| BOH como bloqueo | exige recetas/stock/costo/staff para First Sale |

---

# 14. Approval Audit Integration

Esta versión integra los hallazgos `AP-A01..AP-A10` de `onboarding_acceptance_plan_approval_audit.md`.

Estado esperado para la re-auditoría:

```text
AP-A01 PASS_WITH_WARNING / backend-only finalization        CLOSED
AP-A02 TTFSS cohort denominator                             CLOSED
AP-A03 Reference Run Protocol                               CLOSED
AP-A04 Explicit Architecture scenario coverage              CLOSED
AP-A05 Activation FAIL lifecycle                            CLOSED
AP-A06 Positive BOH readiness progression                   CLOSED
AP-A07 Setup Center UX/recovery acceptance                  CLOSED
AP-A08 Evidence reuse discipline                            CLOSED
AP-A09 Audit + Telemetry sanitization                       CLOSED
AP-A10 acceptanceReleaseId / evidence invalidation          CLOSED
```

La aprobación final del documento requiere:

```text
Open P0 = 0
Open P1 = 0
```

---

# 15. One Next Action

Antes de ejecutar este Acceptance Plan:

```text
1. cerrar/re-aprobar Architecture;
2. ejecutar ONB1.0–ONB1.10;
3. congelar Release Candidate y `acceptanceReleaseId`;
4. crear `AP_FIXTURE_MANIFEST.md`;
5. crear `AP_REFERENCE_RUN_PROTOCOL.md`;
6. ejecutar AP-00 Entry Gate;
7. solo entonces iniciar AP-01..AP-12.
```

El primer benchmark TTFSS formal ocurre **después** de que la feature esté `READY FOR ACCEPTANCE`, no durante desarrollo, para evitar confundir una señal preliminar con aceptación real.
