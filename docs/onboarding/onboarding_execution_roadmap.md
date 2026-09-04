# NHILOS Client Onboarding V1 — Execution Roadmap

**Documento:** `onboarding_execution_roadmap.md`  
**Ubicación recomendada:** `docs/onboarding/onboarding_execution_roadmap.md`  
**Estado:** **APPROVED / READY FOR EXECUTION — FUNCTIONAL CODE BLOCKED UNTIL ONB1.0A**  
**Versión:** 1.1  
**Fecha:** 2026-09-03  
**Autoridad de producto:** `prd_onboarding_v2_approved.md` — **APPROVED / AUTHORITATIVE v2.1**  
**Autoridad de arquitectura:** `onboarding_architecture_spec.md` v0.2 — **PROPOSED / READY FOR FINAL APPROVAL AUDIT**  
**Baseline de evidencia:** `onboarding_gap_audit.md` — **L0 CLOSED**  
**Auditoría de producto:** `onboarding_prd_v2_approval_audit.md` — **APPROVED / AUTHORITATIVE**  
**Auditoría de roadmap:** `onboarding_execution_roadmap_approval_audit.md` — **PASS WITH CORRECTIONS; ER-01..ER-09 integrados en v1.1**  
**Re-auditoría final:** `onboarding_execution_roadmap_reapproval_audit.md` — **APPROVED; ER-01..ER-09 CLOSED; P0/P1/P2 = 0**  
**Baseline de implementación:** Batch 11 + W9 existentes se **EXTIENDEN / REFACTORIZAN**; no se reescriben desde cero.  
**Superficies:** NHILOS Backoffice / Owner Dashboard + NHILOS POS durante Activation.  
**Alcance fundador:** una ubicación / un terminal fundador, offline-first en operación y multi-tenant por diseño.

---

# 0. Objetivo

Convertir el contrato de producto y arquitectura de Onboarding V1 en una secuencia de slices **cerrables, verificables, reversibles y revisables**, evitando un bloque monolítico llamado “Implementar Onboarding”.

Este roadmap no redefine producto ni arquitectura. Ordena:

- dependencias;
- migración/cutover desde W9;
- trabajo por bounded context;
- gates de entrada y salida;
- evidencia mínima;
- orden de despliegue;
- rollback/recovery;
- límites de PR;
- trazabilidad hacia el futuro `onboarding_acceptance_plan.md`.

La meta operativa del roadmap es llevar un tenant desde el baseline real actual hasta un flujo comprobable:

```text
PROVISIONED
   ↓
SETUP_IN_PROGRESS
   ↓
SALE_READY
   ↓
ACTIVATION_IN_PROGRESS
   ↓
ACTIVATED
   ↓
BOH ENRICHMENT CONTINÚA
```

sin obligar al cliente a completar BOH antes de vender y sin introducir side effects falsos de stock, costo o recetas.

---

## 0.1 Invariantes de ejecución

1. **Onboarding orquesta; no invade bounded contexts.** Fiscal, Catalog, Recipes, Inventory, Sales, Identity, Device/Printing, Sync y Audit conservan ownership.
2. **`Provisioning != Client Onboarding != Activation`.** `Tenant.is_active` no sustituye ningún estado de onboarding.
3. **`SALE_READY` es mínimo operativo, no BOH completo.** Requiere identidad válida + fiscal mínimo + al menos un producto vendible.
4. **BOH no bloquea caja.** `INVENTORY_READY`, `COSTING_READY` y `OPERATIONS_READY` son progresivos.
5. **La sesión persistida es source of truth del lifecycle.** React/browser state nunca gobierna progreso durable.
6. **Readiness es state-based.** No se persiste un “step completed” como verdad si el estado real de los dominios ya no lo satisface.
7. **Milestones write-once.** `onboardingStartedAt`, `saleReadyFirstAt`, `firstSuccessfulSaleAt` y `activatedAt` no se reescriben para mejorar métricas.
8. **Concurrencia de sesión es optimista y explícita.** `OnboardingSession.optimisticVersion` impide lost updates; un conflicto provoca reload/reconcile/retry, nunca overwrite ciego.
9. **Idempotencia = key + payload hash + constraint física.** Mismo key con payload distinto es `INTEGRITY_CONFLICT`.
10. **Templates son seeds seguros.** Toda receta nueva originada por template nace `DRAFT / SUGGESTED` y no participa en deducción de inventario hasta publicación explícita.
11. **Product Import V1 solo escribe Product Master.** No modifica stock, existencia, costo, CPP ni Kardex.
12. **Backend safety antes que UX.** El commit service debe impedir stock/costo y Barcode→SKU antes de desplegar una UI que prometa el contrato nuevo.
13. **Una sola autoridad del CSV.** Parser, aliases, validación y plantilla oficial derivan de `ImportContractVersion`; el backend parsea el raw CSV.
14. **Inventory es el único owner de stock/costo operacional.** Una remediación legacy se ejecuta mediante commands de Inventory con Kardex/audit, nunca con UPDATE directo desde Onboarding.
15. **POS continúa offline-first.** Después de recibir configuración válida, el checkout y la Activation offline no dependen de WAN.
16. **Activation usa el production checkout path.** No se crea “fake sale”, endpoint paralelo o tabla de venta de prueba.
17. **Cloud finaliza Activation.** El POS produce evidencia; nunca escribe `ACTIVATED` ni decide `PASS / PASS_WITH_WARNING / FAIL`.
18. **`PASS_WITH_WARNING` es excepcional.** Solo `POST_RECONNECT_SYNC` puede terminar en warning y únicamente con todos los checks locales en PASS, venta durable, outbox íntegro, causa externa/transitoria y ausencia de defecto reproducible.
19. **TTFSS no depende del orden de sync.** El founder POS genera un `first_successful_sale_claim` local write-once.
20. **Permisos efectivos, tenant isolation y audit material son gates de merge.** No se aceptan roles/UI como única barrera.
21. **Legacy no se reinterpreta silenciosamente.** Sin evidencia histórica confiable no se fabrica TTFSS; templates/imports legacy se revisan con receipts.
22. **Cada slice cierra con evidencia.** `Implemented != Verified != Operationally Proven`.
23. **Presupuesto de revisión:** cada PR debe mantenerse en **< 400 líneas authored cambiadas**. Si el outcome no cabe, se divide en PRs apilados.

---

# 1. Modelo de dependencias

```text
ONB1.0  Authority Gate + M0 Evidence Baseline
   ↓
ONB1.1  M1 Core: Session + Readiness + Idempotency + Security
   ↓
ONB1.2  M2 State-based Setup Center Foundation
   ├────────────────────────┐
   ↓                        ↓
ONB1.3  M3 Template Safe    ONB1.4 M4 Product Import Safe
Cutover                     Cutover
   └───────────────┬────────┘
                   ↓
ONB1.5  Setup Center UX Completion + SALE_READY Experience
                   ↓
ONB1.6  M5 Required Config Cloud → POS Readiness
                   ↓
ONB1.7  Activation Cloud Domain + Finalizer
                   ↓
ONB1.8  M6 POS Activation Runner + TTFSS Claim
                   ↓
ONB1.9  Progressive BOH Readiness + Telemetry
                   ↓
ONB1.10 Hardening + Legacy Reconciliation + Cutover/Pilot
                   ↓
         onboarding_acceptance_plan.md
```

### Paralelización permitida

Después de que ONB1.1 estabilice los contratos de sesión, idempotencia, optimistic concurrency y tenant scope:

- **ONB1.2 debe cerrar primero** el cutover state-based mínimo: la sesión/readiness backend pasa a ser autoridad de progreso y W9 deja de depender de `useState` como source of truth.
- Después de ONB1.2, **ONB1.3** y **ONB1.4** pueden ejecutarse en paralelo.
- El trabajo visual de **ONB1.5** puede prepararse en paralelo, pero no expone los nuevos writers de Template/Import hasta que los guards backend de ONB1.3/ONB1.4 estén verificados.
- ONB1.7 puede preparar el cloud-domain mientras ONB1.6 termina los contratos de config local, pero **Activation no se habilita** hasta probar Fiscal + verification Product + Authorized User local.
- ONB1.9 puede empezar con read models/telemetry después de ONB1.5, pero el cierre global espera ONB1.8.

### Regla de secuencia crítica

```text
M1 persistent control plane
   → M2 state-based Setup Center authority
      → M3/M4 safe writers
         → complete UX exposure
            → M5 required config proven local
               → Activation cloud finalizer
                  → M6 hardware/runtime activation
                     → pilot
```

Dentro de cada writer se conserva además:

```text
backend guard
   → contract persistence
      → API/readiness
         → UI exposure
```

Nunca al revés.

---

# ONB1.0 — Authority Gate + M0 Evidence Baseline

**Objetivo:** cerrar formalmente la autoridad de arquitectura y congelar el estado físico real antes de migrar W9.

## Outcome

Existe un baseline reproducible del sistema actual y `onboarding_architecture_spec.md` pasa a:

```text
APPROVED / ENGINEERING AUTHORITATIVE
```

sin P0/P1 abiertos.

## Work units

### ONB1.0A — Architecture re-approval

Ejecutar la auditoría corta final sobre v0.2 para confirmar que AR-01..AR-18 quedaron integrados.

**No implementar funcionalidad durante esta subfase.**

### ONB1.0B — M0 evidence gate

Capturar y versionar:

1. backup PostgreSQL del entorno objetivo;
2. backup SQLite del terminal fundador cuando ya exista estado real;
3. schema físico de onboarding/template/staging/recipe/product/system parameters;
4. conteo de staging sessions `pending / committed`;
5. tenants con Industry Templates aplicadas;
6. recipes activas con posible provenance de template;
7. fields Product consumidos realmente por Inventory/Sync;
8. suites W9 actuales y resultados;
9. versión exacta de backend, Owner Dashboard y POS;
10. estado de RLS/policies/roles para tablas que participarán en la migración.

Receipt recomendado:

```text
docs/onboarding/evidence/ONB1.0_M0_BASELINE.md
```

## Gate de salida

- [ ] Architecture = `APPROVED / ENGINEERING AUTHORITATIVE`.
- [ ] Open architecture P0 = 0.
- [ ] Open architecture P1 = 0.
- [ ] PostgreSQL baseline capturado.
- [ ] SQLite founder baseline capturado o marcado `NOT_APPLICABLE` con razón.
- [ ] W9 regression baseline reproducible.
- [ ] Se conoce si existen recipes activas originadas por template.
- [ ] Se conoce si imports legacy escribieron stock/costo fuera de Kardex.
- [ ] Ningún dato legacy fue “arreglado” durante discovery.

## Evidencia mínima

- approval audit;
- schema dump/metadata receipt;
- row counts;
- suite commands + resultados;
- version matrix;
- restore/recovery note.

**Exit:** ONB1.1 puede empezar.

---

# ONB1.1 — Onboarding Core: Session, Readiness, Idempotency & Security

**Objetivo:** introducir el control plane persistente de Onboarding sin cambiar todavía los efectos de templates/imports existentes.

## Outcome

NHILOS dispone de una sesión durable por tenant y un readiness evaluator que reconstruye el estado real desde Identity/Fiscal/Catalog. Refresh, reintento y concurrencia no destruyen progreso ni duplican efectos.

```text
Provisioning
   ↓
OnboardingSession
   ↓
EvaluateOnboardingReadiness()
   ↓
SETUP_IN_PROGRESS / SALE_READY
```

## Work units

### ONB1.1A — Expand schema compatibility-first

Añadir, sin romper W9:

```text
OnboardingSession
OnboardingIdempotencyRecord
TemplateApplication
TemplateSeedLink
ProductImportSession header
ActivationAttempt / ActivationCheck / ActivationFollowUp schema foundation
```

`OnboardingSession` incluye obligatoriamente:

```text
optimisticVersion
```

para control de concurrencia general de la sesión.

Reglas:

- `tenant_id` obligatorio en toda persistencia tenant-owned;
- unique constraints físicas según Architecture;
- migrations forward/backward ensayables;
- no reescribir datos W9 existentes;
- los campos históricos legacy se conservan hasta cutover explícito.

### ONB1.1B — `EnsureOnboardingStarted`

Implementar inicio idempotente:

- una sola sesión primaria por tenant;
- `onboardingStartedAt` `NULL -> timestamp` una vez;
- primer write de Fiscal/Template/Import puede iniciar la sesión;
- entrar a Setup Center puede iniciarla explícitamente;
- soporte autorizado también cuenta como inicio real;
- `lastActivityAt` puede actualizarse sin afectar TTFSS.

### ONB1.1C — Readiness contracts + `SALE_READY` evaluator

Definir los seis ports arquitectónicos:

```text
IdentityReadinessPort
FiscalReadinessPort
CatalogReadinessPort
InventoryReadinessPort
CostingReadinessPort
OperationsReadinessPort
```

En este slice **solo se implementan/adaptan Identity, Fiscal y Catalog**, porque son los únicos necesarios para `SALE_READY`. Inventory/Costing/Operations quedan como contratos definidos y se materializan en ONB1.9 para no adelantar BOH al critical path.

`SALE_READY` exacto:

```text
tenant exists
AND initial OWNER exists
AND OWNER can authenticate
AND tenant context valid
AND fiscal minimum valid
AND sellableProductCount >= 1
```

Producto mínimo vendible:

```text
active = true
name != empty
sellPrice > 0
```

### ONB1.1D — Session/readiness APIs

Implementar contratos lógicos:

```http
POST /onboarding/session/start
GET  /onboarding/session
GET  /onboarding/readiness
```

Los GET calculan el readiness desde los bounded contexts aunque la proyección persistida esté stale.

### ONB1.1E — State reconciler

Implementar `OnboardingStateReconciler`:

- `saleReadyFirstAt` write-once;
- `SALE_READY -> SETUP_IN_PROGRESS` permitido antes de Activation si cambia el estado real;
- nunca borrar `saleReadyFirstAt`;
- una vez `ACTIVATED`, no volver atrás por health futuro;
- transiciones system-derived usan `SYSTEM_RECONCILER` y causation metadata.

### ONB1.1F — Idempotency coordinator

Implementar:

```text
IN_PROGRESS
SUCCEEDED
FAILED_RETRYABLE
FAILED_FINAL
```

con:

- `payloadHash`;
- lease/recovery;
- compare-and-swap para takeover de lease expirado;
- mismo key/hash `SUCCEEDED` -> mismo result/no-op;
- mismo key con payload distinto -> `INTEGRITY_CONFLICT`;
- business write + idempotency terminal state atómicos cuando comparten UoW.

**Parámetro de ejecución:** el timeout de lease debe ser configurable. Su valor inicial se congela en este slice mediante benchmark del command más lento esperado; no se hardcodea como semántica de producto.

### ONB1.1G — Optimistic session concurrency

Todo write que pueda modificar `OnboardingSession` usa `expectedVersion` / compare-and-swap equivalente.

Contrato:

```text
write(session, expectedVersion)
  -> success + optimisticVersion++
  OR VERSION_CONFLICT
       -> reload domain truth
       -> reconcile
       -> retry command when safe
```

Debe cubrir como mínimo:

- dos tabs del Owner;
- Support asistiendo al mismo tenant;
- evidence sync/finalizer llegando mientras el Owner refresca;
- reconciler concurrente con writes de setup.

Un conflicto nunca puede resetear milestones write-once.

### ONB1.1H — Permissions + tenant isolation

Congelar o mapear explícitamente los permisos V1 de Architecture:

```text
onboarding.read
onboarding.start
onboarding.fiscal.configure
onboarding.template.apply
onboarding.product_import.manage
onboarding.activation.manage
onboarding.support.assist
```

Los nombres físicos pueden alinearse a la matriz global, pero debe existir equivalencia verificable y **no** un `onboarding.manage` universal que elimine least privilege.

Defaults V1:

- OWNER: permisos de onboarding necesarios por defecto según política efectiva;
- MANAGER: solo capacidades concedidas explícitamente;
- CASHIER/WAITER: sin administración de Setup Center por defecto;
- Support: requiere `onboarding.support.assist` **más tenant grant explícito**, razón/correlation y Audit Trail material.

La UI puede ocultar CTAs, pero el deny autoritativo siempre vive server-side.

## Gate de salida

- [ ] Primer acceso crea/asegura una sola sesión.
- [ ] Dos requests concurrentes producen un solo `onboardingStartedAt`.
- [ ] Dos tabs modificando onboarding no hacen overwrite ciego; el segundo writer recibe conflict/reconcile.
- [ ] Refresh reconstruye progreso desde backend/domain state.
- [ ] Config existente puede marcar steps completos sin click artificial.
- [ ] Primer readiness válido fija `saleReadyFirstAt` una sola vez.
- [ ] Retirar el último producto pre-Activation revoca current readiness sin borrar milestone.
- [ ] Legacy sin timestamp confiable queda `legacyBaseline=true`, `measurementEligible=false` y no recibe TTFSS inventado.
- [ ] Mismo idempotency key/hash converge al mismo resultado.
- [ ] Mismo key + distinto payload produce integrity conflict.
- [ ] Lease vigente impide segundo worker.
- [ ] Support write concurrente con Owner produce conflict/reconcile, no lost update.
- [ ] Evidence sync/finalizer concurrente no pisa milestones históricos.
- [ ] Conflicto de versión nunca resetea `onboardingStartedAt`, `saleReadyFirstAt` o `activatedAt`.
- [ ] Tenant A no puede leer/escribir sesión de Tenant B en PostgreSQL real.
- [ ] Actor con `onboarding.fiscal.configure` pero sin `onboarding.template.apply` no aplica templates.
- [ ] Actor con `onboarding.template.apply` pero sin `onboarding.activation.manage` no inicia Activation.
- [ ] Support sin tenant grant o sin `onboarding.support.assist` recibe deny.
- [ ] Usuario sin permiso recibe deny de backend aunque manipule UI/API.

## Evidencia mínima

- migration tests PostgreSQL real;
- concurrency test `onboardingStartedAt`;
- PostgreSQL optimistic-lock conflict/reconcile tests;
- idempotency lease/recovery tests;
- API integration tests session/readiness;
- two-tenant RLS/predicate suite;
- granular permission matrix + support tenant-grant negative suite;
- W9 regression baseline sigue verde o reemplazo explícito documentado.

---

# ONB1.2 — State-based Setup Center Foundation (M2)

**Objetivo:** ejecutar el cutover mínimo de W9 hacia un Setup Center cuyo progreso proviene de `OnboardingSession` + domain readiness antes de cambiar los writers de Template/Import.

## Outcome

La superficie existente deja de usar estado React efímero como autoridad de progreso:

```text
Owner abre Setup Center
   ↓
GET /onboarding/session
GET /onboarding/readiness
   ↓
render state-based
   ↓
refresh / close / resume
   ↓
mismo progreso real
```

Este slice **no** expone todavía la UX final de Template/Import. Su propósito es completar M2 y establecer la autoridad de control plane sobre la cual M3/M4 pueden hacer cutover seguro.

## Work units

### ONB1.2A — Route/shell compatibility cutover

Introducir o refactorizar una route estable de Setup Center dentro del Owner Dashboard manteniendo compatibilidad con W9 durante transición.

Debe mostrar como mínimo:

- lifecycle actual;
- required/optional/warning semantics;
- blockers calculados;
- `nextRecommendedAction`;
- estado de medición legacy cuando aplique.

### ONB1.2B — Backend session/readiness as UI authority

La UI consume exclusivamente para progreso:

```http
GET /onboarding/session
GET /onboarding/readiness
```

Los componentes pueden tener estado local de interacción, pero no pueden persistir ni inferir completion durable mediante `useState`.

### ONB1.2C — Persisted resume / rehydration

Cubrir:

- refresh;
- cierre y reapertura de navegador;
- otra pestaña;
- nuevo dispositivo web autorizado;
- tenant ya configurado antes de abrir Setup Center.

Un tenant preconfigurado puede aparecer con steps completos por estado real, sin click artificial.

### ONB1.2D — Concurrency UX contract

Cuando backend devuelve `VERSION_CONFLICT` o el readiness cambia mientras la UI está abierta:

```text
reload session/domain truth
   ↓
reconcile
   ↓
refresh affected step
   ↓
retry only when command is safe/idempotent
```

No hacer optimistic UI que esconda un conflicto de sesión.

### ONB1.2E — Legacy W9 authority retirement

Identificar y retirar como source of truth:

- booleans de completion locales;
- wizard progress efímero;
- “completed because button clicked”;
- cualquier CTA que suponga estado sin consultar readiness.

Se permite mantener componentes W9 como presentación mientras consuman la nueva autoridad.

## Gate de salida

- [ ] Reload/reopen conserva progreso sin depender de memoria del browser.
- [ ] Step completeness proviene de domain state/readiness.
- [ ] Configuración preexistente se reconoce sin acción artificial.
- [ ] Dos tabs reciben/reconcilian cambios sin lost-update visual.
- [ ] W9 deja de usar `useState` como authority de progress.
- [ ] Ningún writer nuevo de Template/Import se expone todavía si sus guards M3/M4 no están verificados.
- [ ] Tenant isolation y permission deny se mantienen desde la primera route del Setup Center.
- [ ] Legacy `measurementEligible=false` se representa sin fabricar timestamps.

## Evidencia mínima

- browser/API integration sin mocked progress authority;
- refresh/reopen E2E;
- two-tab conflict/reconcile test;
- preconfigured-tenant fixture;
- permission-negative route/API test;
- W9 regression receipt.

---

# ONB1.3 — Industry Template Safe Cutover (M3)

**Objetivo:** conservar el acelerador de Industry Templates eliminando sus side effects peligrosos e introduciendo provenance/reapply determinista.

## Outcome

Un Owner puede previsualizar, seleccionar y aplicar una template sin crear recetas operativas accidentalmente ni afirmar stock/costo inexistente.

## Work units

### ONB1.3A — Stable template identity/version

Normalizar cada item global con:

```text
templateCode
templateVersion
itemId
itemType
source fingerprint
```

El nombre visible nunca funciona como idempotency key.

### ONB1.3B — Preview/diff side-effect free

Exponer por item:

```text
NEW
EXISTING_LINKED
EXISTING_UNLINKED
CONFLICT
UNSUPPORTED
```

más el efecto propuesto.

El Owner puede excluir elementos antes del apply.

### ONB1.3C — `TemplateApplication` + `TemplateSeedLink`

Persistir provenance estable y evolución de versiones:

```text
firstAppliedVersion
lastSeenVersion
lastAppliedVersion
lastSourceFingerprint
```

### ONB1.3D — Tenant-bound Unit of Work

`ApplyIndustryTemplate` usa una UoW PostgreSQL tenant-bound que coordina ports de:

- Catalog/Product Master;
- Inventory master-data para seeds de insumo;
- Recipes para drafts;
- provenance/application;
- audit intent/outbox transaccional.

No hay side effect externo antes del commit.

### ONB1.3E — Recipe lifecycle seguro

Toda receta nueva proveniente de template debe quedar inequívocamente:

```text
origin = INDUSTRY_TEMPLATE
publicationState = DRAFT
suggestionState = SUGGESTED
```

El motor Inventory no puede seleccionarla como BOM activa hasta publicación explícita por Recipes.

### ONB1.3F — Reapply / conflict rules

- reaplicación idéntica = no-op;
- item linked existente no se duplica;
- modificaciones manuales del cliente no se pisan por defecto;
- item nuevo de versión posterior puede incorporarse;
- conflicto requiere explicit choice / SKIP;
- selection hash forma parte del contrato idempotente.

### ONB1.3G — Legacy template recipe scan

Ejecutar `LegacyTemplateRecipeScan` sobre recipes activas.

Cuando provenance es confiable, producir receipt obligatorio:

```text
KEEP_PUBLISHED
MOVE_TO_DRAFT
```

Reglas:

- tenant operativo o recipe con uso histórico: nunca mutar silenciosamente;
- `MOVE_TO_DRAFT` usa lifecycle command de Recipes;
- provenance desconocida: no mutar, marcar `UNKNOWN_PROVENANCE` para revisión.

## Gate de salida

- [ ] Preview no genera writes.
- [ ] Selección parcial se respeta end-to-end.
- [ ] Reapply idéntico no duplica.
- [ ] Provenance estable no depende de nombre.
- [ ] Falla dentro de Catalog/Inventory-master/Recipes revierte UoW completa.
- [ ] No sale evento/sync externo antes del commit.
- [ ] Nueva recipe de template siempre queda DRAFT/SUGGESTED.
- [ ] Vender un producto con recipe draft no genera BOM/Kardex por esa sugerencia.
- [ ] Seed de insumo no afirma stock ni costo.
- [ ] Legacy con provenance confiable tiene receipt `KEEP_PUBLISHED | MOVE_TO_DRAFT`.
- [ ] Tenant operativo nunca recibe `MOVE_TO_DRAFT` silencioso.

## Evidencia mínima

- unit/integration template preview/apply;
- PostgreSQL UoW rollback test;
- reapply/idempotency tests;
- Recipes lifecycle integration;
- Inventory negative assertion;
- legacy scan receipt;
- two-tenant template apply isolation.

---

# ONB1.4 — Product Import Safe Cutover (M4)

**Objetivo:** convertir el importador W9 existente en una importación self-service honesta, versionada e idempotente de Product Master exclusivamente.

## Outcome

```text
CSV FILE / CSV TEXT
   ↓
Backend canonical parser
   ↓
Staging
   ↓
Validation + duplicate preview
   ↓
VALID_ONLY | ALL_OR_NOTHING
   ↓
Product Master only
```

Stock/costo nunca atraviesan este writer.

## Work units

### ONB1.4A — Backend guard primero

Antes de tocar UI:

1. eliminar/neutralizar cualquier commit de stock/costo desde import Product;
2. retirar alias `codigo_barras -> sku`;
3. impedir que `REPLACE` modifique stock/costo/Kardex;
4. fallar explícitamente si un payload intenta cruzar ownership.

### ONB1.4B — `ImportContractVersion`

Crear una sola autoridad versionada para:

```text
encodingPolicy
delimiterPolicy
columns[]
requiredColumns[]
HeaderAliasRegistry
RowNormalizer
Validator
OfficialTemplateGenerator
```

Core mínimo V1:

```text
nombre / name / producto / descripcion
precio_venta / precioventa / precio / price
unidad_venta / unidadventa / uom
```

`barcode != sku`.

### ONB1.4C — File upload + CSV text fallback

- file picker `.csv`;
- textarea opcional usa el mismo endpoint/contract;
- backend recibe raw CSV y hace parse/normalización;
- conservar procesamiento por chunks de 100 filas donde aplique;
- `sourceHash`, `chunkIndex`, `chunkHash`, `rowOrdinal` evitan duplicación por retry.

### ONB1.4D — Session header + staging lifecycle

Usar `ProductImportSession` para gobernar:

```text
CREATED
UPLOADING
VALIDATED
READY
COMMITTING
COMMITTED
PARTIALLY_COMMITTED
FAILED
EXPIRED
```

### ONB1.4E — Validation / duplicate preview

La UI debe poder mostrar antes del commit:

```text
matchedBy
target product
fieldsToChange
unknown/unsupported columns
row error reason
```

Políticas explícitas:

```text
REPLACE
SKIP
FAIL
```

### ONB1.4F — Commit semantics

Implementar:

```text
VALID_ONLY
ALL_OR_NOTHING
```

`ALL_OR_NOTHING` no deja Product Master parcial ante error.

### ONB1.4G — Error export + official template

- export tenant/session-scoped de filas fallidas;
- plantilla oficial generada desde `ImportContractVersion` activo;
- UI muestra `parserContractVersion` cuando sea útil para soporte.

### ONB1.4H — Legacy staging cutover

Orden obligatorio:

1. expirar/rechazar staging legacy no comiteado incompatible;
2. exigir re-upload bajo contrato nuevo;
3. preservar receipt de expiración/rechazo;
4. generar `LegacyImportIntegrityReport` para imports ya comiteados que pudieron escribir stock/costo fuera de Kardex.

Si existe discrepancia material:

```text
Onboarding report
   ↓
Inventory command (Adjustment/OpeningBalance/equivalente)
   ↓
Kardex + Audit receipt
```

Nunca UPDATE directo desde Onboarding.

### ONB1.4I — Audit Trail material del import

El slice emite Audit Trail correlacionable para los efectos materiales del import, sin almacenar raw CSV:

```text
IMPORT_COMMIT
  onboardingSessionId
  importSessionId
  actor
  commandId/idempotencyKey
  parserContractVersion
  commitMode
  duplicatePolicy
  committedCount
  rejectedCount
  result
  correlation/causation
```

Cuando existe resolución de duplicados que cambia el efecto material, la decisión `REPLACE | SKIP | FAIL` queda correlacionada al mismo import session/command.

Los clicks de preview/navegación pertenecen a telemetry, no a Audit Trail forense.

## Gate de salida

- [ ] Plantilla oficial y parser reportan el mismo `parserContractVersion`.
- [ ] File CSV y textarea producen el mismo normalized contract.
- [ ] Retry de upload/chunk no duplica `rowOrdinal`.
- [ ] Barcode jamás termina en SKU.
- [ ] Stock/cost input no llega a Product ni Inventory.
- [ ] `VALID_ONLY` comitea solo válidos.
- [ ] `ALL_OR_NOTHING` revierte todo ante error.
- [ ] `REPLACE` no toca stock/cost/Kardex.
- [ ] Duplicate preview muestra target y fieldsToChange.
- [ ] Duplicate retry no crea segundo Product.
- [ ] Error export contiene únicamente filas del tenant/session.
- [ ] Staging legacy incompatible no puede escribir después del cutover.
- [ ] Cualquier remediación de integridad usa Inventory/Kardex.
- [ ] Import commit produce Audit Trail material con session/actor/contract/commit mode/counts.
- [ ] Resolución material de duplicados es auditable y correlacionable.
- [ ] Audit Trail no almacena raw CSV ni payload sensible innecesario.

## Evidencia mínima

- parser contract tests;
- upload/retry/chunk tests;
- commit mode integration tests;
- duplicate-policy tests;
- Product/Inventory negative writes;
- RLS two-tenant staging/export test;
- LegacyImportIntegrityReport receipt;
- import commit / duplicate-policy audit correlation tests.

---

# ONB1.5 — Setup Center UX Completion + SALE_READY Experience

**Objetivo:** completar la experiencia progresiva del Setup Center sobre la autoridad state-based cerrada en ONB1.2 y conectar únicamente writers Template/Import ya seguros.

## Outcome

El Owner puede entrar, salir y volver al onboarding viendo el estado real del negocio y una ruta corta hacia `SALE_READY`.

```text
Setup Center
  ├─ Business & Fiscal          REQUIRED
  ├─ Sellable Catalog          REQUIRED
  ├─ Sale Ready Review         REQUIRED
  ├─ Activation                REQUIRED FOR ACTIVATED
  └─ BOH Enrichment            OPTIONAL / POSTPONABLE
```

La UI final no redefine completion; consume la autoridad de ONB1.1/ONB1.2.

## Work units

### ONB1.5A — Fiscal step

Reutilizar los contracts existentes de Fiscal Setup.

Reglas:

- solo mostrar como guardado lo persistido end-to-end;
- `phone/address` u otros campos legacy no persistidos no cuentan para readiness;
- writes se integran con session start/idempotency/reconcile;
- guard server-side exige `onboarding.fiscal.configure`;
- no duplicar motor fiscal en frontend/onboarding.

### ONB1.5B — Catalog acquisition choices

Exponer caminos equivalentes hacia catálogo vendible:

```text
Apply Industry Template
Import Product CSV
Use/Create products already available through Catalog
```

Integración:

- Template usa exclusivamente el writer seguro cerrado en ONB1.3;
- Product CSV usa exclusivamente el writer seguro cerrado en ONB1.4;
- no hacer obligatoria ninguna ruta si ya existe catálogo válido;
- los CTAs respetan permisos granulares.

### ONB1.5C — Sale Ready Review

Mostrar claramente:

- blockers;
- warnings;
- opcionales;
- por qué `isSaleReadyNow=true|false`;
- milestone histórico cuando ya se alcanzó antes;
- CTA de Activation solo cuando current readiness es válido y el actor posee el permiso correspondiente.

### ONB1.5D — Legacy behavior

Para tenants sin timestamp histórico confiable:

- permitir Setup/Activation;
- no fabricar TTFSS;
- mostrar estado de medición como no elegible cuando corresponda;
- conservar progreso real actual.

### ONB1.5E — Scope guardrails visibles

No introducir:

- Google Drive/Dropbox;
- QR de setup;
- onboarding Flutter completo;
- mapper drag-and-drop;
- importadores self-service de insumos/recetas/subrecetas;
- obligación de stock/costo/staff para vender.

### ONB1.5F — Accessibility / stale / conflict UX

Cerrar la experiencia según `DESIGN_BACKOFFICE.md`:

- focus/keyboard;
- loading/error/stale;
- warning y blocker no dependen solo de color;
- version conflict explica que el estado fue actualizado y recarga domain truth;
- no borrar input del usuario cuando un retry puede resolverse de forma segura.

## Gate de salida

- [ ] Fiscal mínimo reconstruible al reabrir.
- [ ] UI no muestra campos no persistidos como guardados.
- [ ] Producto activo con nombre + precio > 0 satisface catálogo mínimo.
- [ ] Producto sin stock/recipe/costo/proveedor/imagen puede alcanzar `SALE_READY`.
- [ ] Costo desconocido aparece como `COST_PENDING/UNKNOWN`, nunca como cero conocido por conveniencia.
- [ ] Tenant con solo OWNER puede alcanzar `SALE_READY`.
- [ ] Refresh/cierre/reanudación conserva progreso.
- [ ] Owner entiende blockers vs warnings vs optional.
- [ ] Template/Import UI solo invoca writers M3/M4 verificados.
- [ ] No existe obligación de subir los cuatro CSV complejos.
- [ ] Ausencia de mobile/Drive/Dropbox/dynamic mapper no bloquea V1.
- [ ] Usuario sin permiso no puede ejecutar el write aunque fuerce el request manualmente.

## Evidencia mínima

- browser/component tests;
- API+UI integration sin mocks de progress authority;
- fiscal/template/import permission-negative tests;
- refresh/resume E2E;
- accessibility/focus/keyboard checks;
- stale/version-conflict/error state tests;
- screenshot/UX receipt del reference path.

---

# ONB1.6 — Required Config Cloud → POS Readiness (M5)

**Objetivo:** demostrar que toda configuración mínima requerida para Activation está disponible y coherente en el terminal fundador, reutilizando Sync/Identity existentes en vez de construir transportes o credenciales paralelos.

## Outcome

Antes de cortar WAN, el founder POS puede demostrar localmente:

```text
FiscalConfigSnapshot exacto
AND verification Product master disponible
AND authorized user/offline credential material disponible
```

Activation pinnea y verifica estos requisitos sin confundirlos con `SALE_READY` cloud.

## Work units

### ONB1.6A — Fiscal config version

Fiscal expone:

```text
revision
fingerprint
```

- `revision` monotónica por config efectiva;
- `fingerprint` SHA-256 del payload canónico/versionado;
- misma revision con fingerprint diferente = integrity conflict.

### ONB1.6B — Fiscal outbound sync + SQLite projection

Extender la infraestructura de Sync existente, sin transporte paralelo, para entregar `FiscalConfigSnapshot` al POS y persistir tenant-scoped:

```text
fiscal_config_local
  tenant_id
  revision
  fingerprint
  payload
  applied_at
```

ACK confirma aplicación local, no solo recepción de bytes.

### ONB1.6C — Fiscal inbox idempotency/conflict handling

- duplicate snapshot = no-op;
- stale revision = no downgrade según policy;
- same revision/different fingerprint = integrity conflict;
- restart sin WAN conserva la proyección aplicada.

### ONB1.6D — Verification Product local readiness

Reutilizar Product master sync existente.

`StartActivation` puede pinnear:

```text
verificationProductId
verificationProductRevision? / verificationProductFingerprint?
```

cuando esa metadata exista.

`REQUIRED_CONFIG_LOCAL` debe comprobar al menos que el producto pinneado:

- pertenece al tenant efectivo;
- existe localmente;
- está activo/vendible para el checkout de verificación;
- no está contradicho por una revisión/fingerprint pinneada cuando el contrato disponga de ella.

No se crea un segundo catálogo exclusivo de Onboarding.

### ONB1.6E — Authorized user local readiness

Reutilizar el material de Identity/offline credential ya soportado por la plataforma.

`AUTHORIZED_USER_LOCAL` demuestra que el usuario autorizado para la prueba:

- pertenece al tenant efectivo;
- está disponible en el mecanismo local de autenticación;
- puede autenticarse/operar según el contrato offline existente.

Onboarding **no** replica passwords/PIN/TOTP ni crea un credential store paralelo.

### ONB1.6F — Activation required-config adapter

Cerrar semántica de checks:

```text
REQUIRED_CONFIG_LOCAL
  = fiscal snapshot exact/compatible
    AND verification product available/coherent locally

AUTHORIZED_USER_LOCAL
  = existing offline identity contract PASS
```

Config stale/mismatched bloquea Activation, pero no revoca por sí sola `SALE_READY` cloud.

## Gate de salida

- [ ] `{revision,fingerprint}` fiscal cloud llega a SQLite.
- [ ] Duplicate inbound fiscal config es no-op.
- [ ] Same revision + different fingerprint produce integrity conflict.
- [ ] Verification Product pinneado está disponible localmente antes del tramo offline.
- [ ] Producto faltante/stale/inconsistente produce `REQUIRED_CONFIG_LOCAL=FAIL`.
- [ ] Usuario autorizado puede autenticarse localmente antes de cortar WAN.
- [ ] Falta de credencial/material local produce `AUTHORIZED_USER_LOCAL=FAIL`.
- [ ] POS puede leer Fiscal + Product + Identity required state después de restart sin WAN.
- [ ] Config local stale/mismatched bloquea Activation, no `SALE_READY` cloud.
- [ ] Tenant A no recibe/aplica config, producto o identity material de Tenant B.

## Evidencia mínima

- fiscal sync contract + fingerprint conflict tests;
- SQLite migration/restart test;
- Product sync/lookup fixture para `verificationProductId`;
- authorized-user offline auth integration test;
- replay/dedupe test;
- two-tenant required-config fixture;
- version/freshness observability receipt.

---

# ONB1.7 — Activation Cloud Domain + Backend Finalizer

**Objetivo:** implementar el control plane autoritativo de Activation antes de construir el runner físico completo en POS.

## Outcome

Existe un `ActivationAttempt` auditable, tenant-safe e idempotente, capaz de recibir evidencia local y finalizar únicamente desde backend.

## Work units

### ONB1.7A — StartActivation

Precondiciones:

- current `SALE_READY=true`;
- permiso `onboarding.activation.manage`;
- terminal candidato registrado/asignable;
- no existe otro attempt activo para la sesión.

El attempt pinnea:

```text
requiredFiscalRevision
requiredFiscalFingerprint
verificationProductId
verificationProductRevision/fingerprint when available
candidateTerminalId
serverTimeAnchorAt
```

### ONB1.7B — Activation check/evidence ingestion

Persistir un único resultado final por:

```text
(tenant_id, activation_attempt_id, check_code)
```

Evidence declarativa de tenant/terminal nunca sustituye el `DevicePrincipal` autenticado.

### ONB1.7C — Check catalogue

Congelar los checks V1:

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

Todos excepto `POST_RECONNECT_SYNC` aceptan únicamente `PASS | FAIL`.

### ONB1.7D — FinalizeActivation

Backend deriva el resultado a partir de evidencia persistida.

```text
PASS
PASS_WITH_WARNING
FAIL
```

### Truth table normativa

`PASS` requiere:

```text
all required local checks = PASS
verification sale durable = PASS
outbox integrity = PASS
POST_RECONNECT_SYNC = PASS
cloud ACK/application correlated = PASS
```

`PASS_WITH_WARNING` solo es válido cuando **todas** estas condiciones son verdaderas:

```text
all local required checks = PASS
verification sale durable = PASS
outbox integrity = PASS
POST_RECONNECT_SYNC = WARNING
reason = external/transient unavailability
no reproducible product/sync defect
```

Cualquier otra combinación material termina `FAIL`, incluyendo evidence incompleta/inconsistente, pérdida/duplicación/conflicto de outbox, terminal/config/user mismatch o defecto reproducible con backend disponible.

### Lifecycle final

```text
PASS / PASS_WITH_WARNING
  -> activatedAt = COALESCE(activatedAt, authoritativeCompletedAt)
  -> lifecycle = ACTIVATED

FAIL
  -> attempt.status = FAIL
  -> completedAt/failureCode persistidos
  -> liberar current/active attempt
  -> EvaluateOnboardingReadiness()
       if isSaleReadyNow == true
          lifecycle = SALE_READY
       else
          lifecycle = SETUP_IN_PROGRESS
  -> activatedAt permanece NULL
```

Un FAIL terminal no puede dejar la sesión atrapada en `ACTIVATION_IN_PROGRESS`. Tras corregir el blocker puede iniciarse un nuevo attempt conforme a idempotencia/unique-active-attempt.

### ONB1.7E — Warning follow-up

Persistir seguimiento por warning material.

Cerrar follow-up posteriormente **no modifica** `activatedAt`.

### ONB1.7F — Audit / support controls

Registrar:

- attempt started;
- check failure material;
- final result;
- warning follow-up;
- soporte/admin override si existiera y estuviera autorizado.

No registrar secretos/evidence sensible innecesaria.

## Gate de salida

- [ ] StartActivation acepta terminal candidato registrable sin fingir que ya está linked.
- [ ] Solo existe un attempt activo por sesión.
- [ ] Forged tenant/terminal payload no cambia autoridad del DevicePrincipal.
- [ ] POS/API client no puede enviar `result=PASS` autoritativo.
- [ ] Backend finalizer es el único writer de `activatedAt`.
- [ ] Solo `POST_RECONNECT_SYNC` puede producir WARNING.
- [ ] PASS_WITH_WARNING solo clasifica cuando todos los checks locales, venta durable y outbox integrity son PASS, la causa es externa/transitoria y no existe defecto reproducible.
- [ ] PASS_WITH_WARNING crea follow-up persistente.
- [ ] Reproducible integrity/sync defect no puede degradarse a warning.
- [ ] FAIL + readiness vigente retorna lifecycle a `SALE_READY`.
- [ ] FAIL + readiness inválido retorna lifecycle a `SETUP_IN_PROGRESS`.
- [ ] Un attempt terminal FAIL libera el active-attempt constraint y permite retry posterior.
- [ ] `activatedAt` se fija una sola vez.
- [ ] `Tenant.is_active` permanece independiente.

## Evidencia mínima

- backend integration suite;
- concurrency/unique-active-attempt test;
- device-principal forgery tests;
- permission-negative tests;
- finalizer normative truth-table tests, incluyendo PASS/WARNING/FAIL y lifecycle post-FAIL;
- audit correlation tests;
- real PostgreSQL tenant isolation.

---

# ONB1.8 — POS Activation Runner + TTFSS Claim (M6)

**Objetivo:** demostrar en el founder POS que la configuración puede operar mediante el checkout real, offline, sobrevivir restart y sincronizar evidencia sin duplicar venta o TTFSS.

## Outcome

```text
Activation assignment
   ↓
Persist local attempt
   ↓
Local checks
   ↓
WAN OFF
   ↓
Real Sales checkout → PAID
   ↓
SQLite durable + receipt + outbox
   ↓
first_successful_sale_claim write-once
   ↓
WAN ON
   ↓
Evidence sync / ACK
   ↓
Backend finalizer
```

## Work units

### ONB1.8A — SQLite Activation projection

Persistir:

```text
ActivationAttemptLocal
ActivationCheckResultLocal / evidence envelopes
first_successful_sale_claim
```

Todo sobrevive restart.

### ONB1.8B — Pre-offline checks

Implementar runner local para:

```text
TERMINAL_LINKED
REQUIRED_CONFIG_LOCAL
AUTHORIZED_USER_LOCAL
PRINTER_AVAILABLE
TEST_PRINT
SQLITE_DURABILITY
```

`TERMINAL_LINKED` se corrobora contra identidad autenticada del dispositivo.

### ONB1.8C — Controlled offline sale

- seleccionar el verification product pinneado;
- cortar WAN;
- ejecutar el **production checkout path**;
- alcanzar `PAID` real;
- persistir ticket localmente;
- recorrer receipt/print path real;
- no crear endpoint/table de “sale test”.

Idempotency de venta:

```text
onboarding:activation-sale:{tenantId}:{attemptId}
```

Retry del attempt no crea un segundo verification ticket.

### ONB1.8D — Outbox durability

Antes de restaurar WAN deben estar durables:

- ticket PAID;
- activation evidence;
- first-sale claim si corresponde;
- outbox envelopes.

### ONB1.8E — First Successful Sale claim

En la misma unidad de consistencia local de la primera venta elegible:

```text
INSERT first_successful_sale_claim
ON CONFLICT DO NOTHING
```

Solo el claim ganador emite `FIRST_SUCCESSFUL_SALE_OBSERVED`.

Una venta posterior que sincroniza primero no puede ganar TTFSS.

### ONB1.8F — Clock semantics

Usar:

```text
serverTimeAnchorAt
anchorMonotonicTicks
bootSessionId
anchoredOccurredAt
clockConfidence
```

Clock skew/restart no “refecha” silenciosamente el evento.

### ONB1.8G — Reconnect / evidence sync

Al volver WAN:

```text
LOCAL_ACTIVATION_EVIDENCE_COMPLETE
   ↓
SYNC_VERIFICATION_PENDING
   ↓
EVIDENCE_ACKED
```

El POS no muestra `ACTIVATED` hasta recibir resultado autoritativo cloud.

### ONB1.8H — Verification sale cleanup path

Si la venta controlada debe corregirse:

- usar VOID/corrección normal de Sales;
- no borrar ticket;
- el VOID no borra `firstSuccessfulSaleAt` histórico.

## Gate de salida

- [x] Local attempt/evidence sobrevive restart (Verificado en ONB1.8_M6_PR19_EVIDENCE.md, PR20 y PR21).
- [x] `AUTHORIZED_USER_LOCAL` es blocker real (Verificado en PR-ONB-19).
- [x] Printer/test print/SQLite failure produce FAIL (Verificado en PR-ONB-19 y PR-ONB-20).
- [x] Venta offline real alcanza PAID y sigue presente tras restart (Verificado en PR-ONB-20 y PR-ONB-21).
- [x] Retry del mismo attempt no genera segunda venta (Verificado en PR-ONB-20 y PR-ONB-21).
- [x] Receipt path está probado en hardware fundador (Verificado en PR-ONB-20).
- [x] Outbox loss/duplication/integrity conflict produce FAIL, no warning (Verificado en PR-ONB-20).
- [x] Cloud caída después del tramo offline deja `SYNC_VERIFICATION_PENDING`, no `ACTIVATED` (Verificado en ONB1.8_M6_PR21_EVIDENCE.md).
- [x] Al volver cloud, solo backend clasifica PASS/WARNING/FAIL (Verificado en ONB1.8_M6_PR21_EVIDENCE.md).
- [x] Primera venta elegible crea exactamente un local claim (Verificado en ONB1.8_M6_PR21_EVIDENCE.md).
- [x] Venta posterior que sincroniza primero no cambia TTFSS (Verificado en ONB1.8_M6_PR21_EVIDENCE.md).
- [x] Same claim resend es ACK/no-op cloud (Verificado en ONB1.8_M6_PR21_EVIDENCE.md).
- [x] Clock skew/restart conserva timestamp/confidence sin maquillaje (Verificado en ONB1.8_M6_PR21_EVIDENCE.md).
- [x] VOID de verification sale conserva TTFSS histórico (Verificado en ONB1.8_M6_PR21_EVIDENCE.md).

## Evidencia mínima

- Flutter/Floor migration tests;
- POS integration tests;
- restart/crash tests;
- offline E2E;
- Sunmi V2s hardware receipt;
- printer test receipt;
- sync replay/fault tests;
- first-sale ordering test;
- clock anchor/skew tests.
- Receipts formales: `docs/onboarding/evidence/ONB1.8_M6_PR19_EVIDENCE.md`, `ONB1.8_M6_PR20_EVIDENCE.md`, `ONB1.8_M6_PR21_EVIDENCE.md`. Hito M6 CERRADO al 100%.

---

# ONB1.9 — Progressive BOH Readiness + Product Telemetry

**Objetivo:** completar la experiencia post-`SALE_READY`/post-Activation sin convertir BOH en un blocker de caja y dejar instrumentado el funnel real para el Acceptance Plan.

## Outcome

Un tenant puede estar `ACTIVATED` y continuar avanzando de forma independiente hacia:

```text
INVENTORY_READY
COSTING_READY
OPERATIONS_READY
```

mientras Onboarding mide TTFSS y el funnel sin contaminar Audit Trail.

## Work units

### ONB1.9A — Inventory readiness adapter

Definir suficiente estructura para el alcance de inventario elegido por el negocio.

No significa “todos los productos deben tener stock”.

### ONB1.9B — Costing readiness adapter

Exponer estados explícitos:

```text
KNOWN(value)
COST_PENDING(reason)
NOT_APPLICABLE
```

`averageCost=0` físico no implica `KNOWN(0)` sin provenance de Inventory.

### ONB1.9C — Operations readiness adapter

Puede observar, según negocio:

- staff adicional;
- recipes publicadas;
- subrecetas;
- stock inicial;
- producción;
- categorías/imágenes;
- proveedores;
- configuración operativa avanzada.

Nada de esto revoca `ACTIVATED`.

### ONB1.9D — BOH links / progressive checklist

Desde Setup Center orientar hacia módulos propietarios existentes. No crear nuevos importadores complejos para “cerrar el checklist”.

### ONB1.9E — Telemetry catalogue

Instrumentar, como mínimo:

```text
ONBOARDING_STARTED
SESSION_RESUMED
STEP_VIEWED
STEP_COMPLETED_OBSERVED
STEP_SKIPPED
TEMPLATE_PREVIEWED
TEMPLATE_APPLY_RESULT
IMPORT_STARTED
IMPORT_VALIDATED
IMPORT_COMMIT_RESULT
IMPORT_FAILED
SALE_READY_REACHED
ACTIVATION_STARTED
ACTIVATION_CHECK_FAILED
ACTIVATION_WARNING
ACTIVATION_RESULT
FIRST_SUCCESSFUL_SALE
FIRST_CUSTOMER_SALE
BOH_READINESS_CHANGED
```

### ONB1.9F — Audit vs telemetry separation

Audit material conserva solo efectos forenses relevantes; telemetry puede capturar navegación/duración/counts/códigos sanitizados.

No registrar:

```text
JWT
password
PIN/TOTP
full raw CSV
card data
unnecessary PII
```

### ONB1.9G — First Customer Sale observation

Si `firstSuccessfulSaleAt` fue una venta controlada de Activation, observar por separado el primer ticket customer-facing posterior.

No modifica TTFSS.

## Gate de salida

- [ ] Tenant ACTIVATED puede permanecer `COST_PENDING` y vender.
- [ ] Avanzar a Inventory/Costing/Operations Ready no modifica `activatedAt`.
- [ ] Costo desconocido nunca se presenta como cero confirmado.
- [ ] `STEP_SKIPPED` solo aplica a contenido opcional/postergable.
- [ ] Telemetry no controla lifecycle.
- [ ] Telemetry no contiene raw CSV/secretos.
- [ ] Audit material es correlacionable con session/command/target.
- [ ] First Customer Sale se observa separadamente de TTFSS.

## Evidencia mínima

- readiness adapter unit/integration tests;
- activated + BOH incomplete E2E;
- telemetry schema/PII review;
- audit correlation test;
- analytics event fixture.

---

# ONB1.10 — Hardening, Legacy Reconciliation & Cutover/Pilot

**Objetivo:** cerrar Onboarding V1 como flujo operable, recuperable, tenant-safe y listo para ser medido formalmente por el Acceptance Plan.

## Outcome

El reference path completo queda verificado:

```text
Provision tenant + OWNER
   ↓
Start/resume Setup Center
   ↓
Configure fiscal minimum
   ↓
Create sellable catalog via Template / CSV / existing Catalog
   ↓
SALE_READY
   ↓
Founder POS receives required config
   ↓
Activation checks
   ↓
Offline PAID sale via production path
   ↓
Durable receipt/outbox/first-sale claim
   ↓
Reconnect + evidence convergence
   ↓
ACTIVATED
   ↓
BOH enrichment continues
```

## Work units

### ONB1.10A — Migration reconciliation closure

Cerrar receipts pendientes de:

- legacy template recipes;
- legacy staging incompatible;
- `LegacyImportIntegrityReport`;
- Inventory remediation refs cuando correspondan;
- legacy `measurementEligible=false` tenants.

### ONB1.10B — Fault injection suite

Cubrir:

- HTTP timeout after commit;
- duplicate command;
- same key/different payload;
- stale idempotency lease takeover;
- crash before/after UoW commit;
- upload chunk retry;
- POS restart mid-Activation;
- WAN outage;
- duplicate outbox resend;
- cloud down during finalization;
- sync integrity mismatch;
- clock skew/restart.

### ONB1.10C — Security / isolation suite

En PostgreSQL real:

- Tenant A no lee/escribe session/import/template/activation de B;
- forged tenant body/query no altera scope;
- RLS/predicates fallan closed;
- permissions se verifican server-side;
- support requiere tenant grant;
- device evidence se liga a `DevicePrincipal`.

### ONB1.10D — Full regression

La suite final debe cubrir como mínimo los **74 escenarios normativos** de `onboarding_architecture_spec.md` y conservar los W9 tests aún válidos.

Un test legacy reemplazado debe tener mapping explícito al nuevo test, no desaparecer sin receipt.

### ONB1.10E — Feature rollout / cutover order

Orden de habilitación recomendado:

```text
1. schema expandido + core session/readiness/idempotency/concurrency
2. M2 state-based Setup Center authority/resume
3. M3 template safe writer
4. M4 product import safe writer
5. Setup Center UX completion
6. M5 required config cloud→POS: Fiscal + verification Product + Identity offline proof
7. Activation cloud APIs/finalizer
8. M6 POS Activation runner
9. TTFSS/telemetry + progressive BOH
10. founder tenant pilot
```

Feature flags sugeridas — nombres pueden ajustarse al sistema real:

```text
onboarding.session_v1
onboarding.template_safe_v1
onboarding.import_contract_v1
onboarding.setup_center_v1
onboarding.required_config_v1
onboarding.activation_v1
```

Los flags controlan exposición/cutover; **no** crean dos fuentes de verdad permanentes.

### ONB1.10F — Founder pilot rehearsal

Ejecutar con el hardware/fixture fundador:

- reference path limpio;
- abandonment/resume;
- template path;
- CSV path;
- WAN outage;
- restart;
- Activation PASS;
- Activation FAIL hard blocker;
- PASS_WITH_WARNING solo en el caso contractual permitido;
- rollback rehearsal.

**El target TTFSS `<= 15 min` se mide aquí como señal preliminar, pero su aceptación formal pertenece al `onboarding_acceptance_plan.md`.**

### ONB1.10G — Rollback rehearsal

Rollback seguro debe poder deshabilitar la nueva orquestación sin:

- borrar Product/Fiscal válidos;
- despublicar ventas;
- truncar staging globalmente;
- borrar Audit Trail;
- reescribir Kardex;
- reescribir milestones históricos;
- volver a stock/cost unsafe imports;
- volver a recipes auto-publicadas.

## Gate de salida final

### Core / lifecycle

- [ ] Session durable y resumable.
- [ ] `OnboardingSession.optimisticVersion` evita lost updates en PostgreSQL real.
- [ ] `onboardingStartedAt` write-once.
- [ ] `saleReadyFirstAt` write-once.
- [ ] `SALE_READY` state-based y explicable.
- [ ] Activation FAIL retorna a `SALE_READY` o `SETUP_IN_PROGRESS` según readiness; no deja la sesión atascada.
- [ ] `ACTIVATED` monotónico e independiente de `Tenant.is_active`.

### Templates / import

- [ ] Template recipe nueva siempre DRAFT/SUGGESTED.
- [ ] Reapply no duplica ni pisa cambios manuales silenciosamente.
- [ ] Product CSV no escribe stock/costo/Kardex.
- [ ] Barcode no se degrada a SKU.
- [ ] VALID_ONLY / ALL_OR_NOTHING / REPLACE|SKIP|FAIL probados.
- [ ] Legacy import/template receipts cerrados o explícitamente aceptados.
- [ ] Import commit y duplicate policy producen Audit Trail material correlacionable sin raw CSV.

### Required config / POS / Activation

- [ ] Fiscal `{revision,fingerprint}` converge al POS.
- [ ] Verification Product pinneado existe/coincide localmente antes del tramo offline.
- [ ] Authorized User dispone del material de autenticación offline soportado por Identity.
- [ ] Activation usa production checkout real.
- [ ] Offline PAID + receipt + outbox sobreviven restart.
- [ ] Cloud finaliza Activation.
- [ ] Solo sync externo/transitorio puede producir PASS_WITH_WARNING.
- [ ] Defecto reproducible/integrity conflict = FAIL.
- [ ] Verification sale nunca se borra destructivamente.

### TTFSS

- [ ] Local first-sale claim es write-once.
- [ ] Sync order no altera el ganador.
- [ ] Resend no duplica claim.
- [ ] Clock confidence queda trazable.
- [ ] First Customer Sale se observa por separado cuando corresponde.

### Security / audit / telemetry

- [ ] Two-tenant isolation en DB real.
- [ ] Forged tenant/device inputs no alteran autoridad.
- [ ] Permission checks server-side con granularidad `read/start/fiscal/template/import/activation/support`.
- [ ] Support requiere `onboarding.support.assist` + tenant grant auditable.
- [ ] Audit material y telemetry permanecen separados.
- [ ] Telemetry no contiene secretos/raw CSV.

### Operations

- [ ] Rollback ensayado.
- [ ] W9 regressions conservadas o reemplazadas con mapping.
- [ ] Evidence index actualizado.
- [ ] Founder pilot completado.
- [ ] Roadmap queda listo para entrar al Acceptance Plan.

---

# 2. PR / Review Plan

Los IDs `ONB1.xY` representan **work units del roadmap**. Los PRs usan una identidad separada `PR-ONB-xx`; un PR debe declarar exactamente qué work units cubre. Esto evita reutilizar un mismo identificador con significados distintos.

Forecast recomendado:

| Orden | PR ID | Work units cubiertos | Focus principal | Dependency |
|---:|---|---|---|---|
| 1 | `PR-ONB-00` | ONB1.0A | Architecture re-approval; documentación, 0 code funcional | PRD + Architecture v0.2 |
| 2 | `PR-ONB-01` | ONB1.0B | M0 schema/data/test/version evidence | PR-ONB-00 |
| 3 | `PR-ONB-02` | ONB1.1A–B | Session schema + `EnsureOnboardingStarted` | ONB1.0 |
| 4 | `PR-ONB-03` | ONB1.1C–E | Readiness contracts, APIs, reconciler, milestones | PR-ONB-02 |
| 5 | `PR-ONB-04` | ONB1.1F–G | Idempotency + optimistic concurrency | PR-ONB-02 |
| 6 | `PR-ONB-05` | ONB1.1H | granular RBAC + support tenant grant + RLS/isolation | PR-ONB-02 |
| 7 | `PR-ONB-06` | ONB1.2A–E | M2 state-based Setup Center authority/resume/conflict UX | ONB1.1 |
| 8 | `PR-ONB-07` | ONB1.3A–C | Template stable identity, preview, provenance | ONB1.2 |
| 9 | `PR-ONB-08` | ONB1.3D–G | Template UoW, DRAFT/SUGGESTED, reapply, legacy scan | PR-ONB-07 |
| 10 | `PR-ONB-09` | ONB1.4A–B | Import backend ownership guard + canonical contract | ONB1.2 |
| 11 | `PR-ONB-10` | ONB1.4C–E | CSV upload, staging lifecycle, validation/duplicate preview | PR-ONB-09 |
| 12 | `PR-ONB-11` | ONB1.4F–G, ONB1.4I | commit modes, error/template output, import Audit Trail | PR-ONB-10 |
| 13 | `PR-ONB-12` | ONB1.4H | legacy staging expiry + integrity report/remediation boundary | PR-ONB-09 |
| 14 | `PR-ONB-13` | ONB1.5A–B | Fiscal + Catalog acquisition UX over safe writers | ONB1.3 + ONB1.4 |
| 15 | `PR-ONB-14` | ONB1.5C–F | Sale Ready Review, legacy state, scope/a11y/conflict UX | PR-ONB-13 |
| 16 | `PR-ONB-15` | ONB1.6A–C | Fiscal revision/fingerprint + sync/local projection | ONB1.5 |
| 17 | `PR-ONB-16` | ONB1.6D–F | verification Product + offline Identity proof + required-config adapter | PR-ONB-15 |
| 18 | `PR-ONB-17` | ONB1.7A–C | Activation start/evidence/check catalogue | ONB1.6 |
| 19 | `PR-ONB-18` | ONB1.7D–F | finalizer truth table, FAIL lifecycle, warning follow-up, audit/support | PR-ONB-17 |
| 20 | `PR-ONB-19` | ONB1.8A–B | POS Activation persistence + pre-offline checks | ONB1.7 + ONB1.6 |
| 21 | `PR-ONB-20` | ONB1.8C–D | real offline verification sale + outbox durability | PR-ONB-19 |
| 22 | `PR-ONB-21` | ONB1.8E–H | TTFSS claim, clock anchors, reconnect/evidence, normal VOID path | PR-ONB-20 |
| 23 | `PR-ONB-22` | ONB1.9A–D | Inventory/Costing/Operations readiness + progressive checklist | ONB1.5 |
| 24 | `PR-ONB-23` | ONB1.9E–G | telemetry, audit separation, First Customer Sale | ONB1.1–ONB1.8 |
| 25 | `PR-ONB-24` | ONB1.10A–C | legacy reconciliation + fault/security/isolation hardening | todos previos |
| 26 | `PR-ONB-25` | ONB1.10D–G | full regression, cutover, founder pilot, rollback rehearsal | PR-ONB-24 |

**Mandatory review rule:** forecast o diff real `>= 400` authored additions + deletions => re-slice antes de merge.

Cada PR debe incluir, según aplique:

```text
PR-ONB-xx
coveredWorkUnits[]
implementation
focused tests
real DB / browser / device receipt
migration/config snapshot
observability hooks
rollback boundary
contract documentation update
```

No separar “models”, “services” y “tests” en commits que individualmente dejan el sistema no funcional. Si un PR necesita cubrir solo parte de un work unit, debe declararlo como sub-outcome verificable sin renombrar el work unit original.

---

# 3. Traceability PRD → Roadmap

| PRD / Acceptance area | Slice principal |
|---|---|
| AC-01 Provisioning boundary | ONB1.1 |
| AC-02 onboardingStartedAt | ONB1.1 |
| AC-03 Resume | ONB1.1 + ONB1.2 |
| AC-04 Fiscal minimum | ONB1.1 + ONB1.5 |
| AC-05 Campo no persistido | ONB1.5 |
| AC-06 Sellable catalog | ONB1.1 + ONB1.5 |
| AC-07 BOH no bloquea | ONB1.1 + ONB1.5 + ONB1.9 |
| AC-08 Unknown cost | ONB1.5 + ONB1.9 |
| AC-09..13 Templates | ONB1.3 |
| AC-14..24 Product CSV | ONB1.4 |
| AC-25 Assisted BOH | ONB1.5 + ONB1.9 |
| AC-26 Staff optional | ONB1.1 + ONB1.5 |
| AC-27..28 SALE_READY | ONB1.1 + ONB1.2 + ONB1.5 |
| AC-29..34 Activation | ONB1.6 + ONB1.7 + ONB1.8 |
| AC-35 TTFSS | ONB1.8 + ONB1.9 |
| AC-36 Backoffice ownership | ONB1.2 + ONB1.5 |
| AC-37 Offline gate | ONB1.6 + ONB1.8 |
| AC-38 Tenant isolation | todos; cierre ONB1.10 |
| AC-39 Audit | writers materiales en su slice; cierre ONB1.10 |
| AC-40 Inventory Ready | ONB1.9 |
| AC-41 Costing Ready | ONB1.9 |
| AC-42 No mobile scope creep | guardrail transversal |
| AC-43 No dynamic mapper | ONB1.4 guardrail |
| AC-44 No complex imports | ONB1.4/ONB1.5 guardrail |
| AC-45 No recipe side effects | ONB1.3 |
| AC-46 No global truncate | guardrail transversal; cierre ONB1.10 |
| AC-47 Idempotent retries | ONB1.1 + writers ONB1.3/ONB1.4 + Activation ONB1.7/ONB1.8 |
| AC-48 First sale with minimal catalog | ONB1.5 + ONB1.6 + ONB1.8 |
| AC-49 State-based setup | ONB1.1 + ONB1.2 |
| AC-50 Rutas combinables | ONB1.5 |
| AC-51 Aliases semánticamente seguros | ONB1.4 |
| AC-52 REPLACE limitado a Product Master | ONB1.4 |
| AC-53 PASS_WITH_WARNING normativo | ONB1.7 + ONB1.8 |
| AC-54 Sync defect es FAIL | ONB1.7 + ONB1.8 |
| AC-55 Activation monotónica | ONB1.1 + ONB1.7 |
| AC-56 Activation no sustituye GO_LIVE_ACCEPTED | ONB1.10 + Acceptance Plan |
| AC-57 TTFSS no reiniciable | ONB1.1 + ONB1.8 |

---

# 4. Evidence Lifecycle

Cada slice mantiene un evidence index con estados:

| Estado | Evidencia requerida |
|---|---|
| **Planned** | authority links, outcome, dependencies, acceptance criteria, test plan, diff forecast, rollback boundary |
| **Implemented** | PR/commit, migration/config snapshot, actual diff, observability hooks, docs actualizadas |
| **Verified** | tests exactos, real PostgreSQL/browser/POS receipts, negative security cases, reviewer/CI evidence |
| **Operationally Proven** | staging/pilot telemetry, hardware proof, outage/restart drills, rollback rehearsal, sign-off |

Regla:

> Un resultado posterior no reescribe una evidencia fallida. Agrega un receipt que la supersede preservando historial.

`Implemented` nunca implica `Verified`.  
`Verified` nunca implica `Operationally Proven`.

---

# 5. Observabilidad mínima por slice

## Backend

Medir, sin PII innecesaria:

```text
session start/resume failures
readiness evaluation failures
idempotency conflicts
stale lease takeovers
template apply result/rollback
import validation/commit failures
required-config fiscal/product/identity readiness failures
activation check failures
activation finalizer result
cross-tenant authorization denials
```

## POS

```text
required fiscal config version applied
verification product local readiness
authorized user local readiness
activation local state
printer/test print result
SQLite durability result
offline verification sale result
outbox pending/ack
first-sale claim emitted/acked
clock confidence
```

## UX/Product

```text
time to SALE_READY
TTFSS
SALE_READY → ACTIVATED duration
first customer sale delay
step duration
resume rate
abandonment by step
import error rate
activation PASS/WARNING/FAIL distribution
post-activation BOH readiness progression
```

El Acceptance Plan fijará fixtures, thresholds y criterios formales; el roadmap solo garantiza que la señal exista y sea confiable.

---

# 6. Recovery / Rollback Principles

El modo degradado preferido es **Backoffice/Activation orchestration temporalmente indisponible mientras el POS ya activado sigue vendiendo offline**.

Rollback nunca debe:

- truncar datos globales;
- borrar tickets;
- reescribir Kardex;
- cambiar `activatedAt` histórico;
- resetear `onboardingStartedAt`;
- convertir `COST_PENDING` en `0`;
- volver a publicar recipes de template automáticamente;
- reactivar Product CSV stock/cost writes;
- confiar en host/slug/body para sustituir tenant del JWT/contexto.

Orden preferido de recuperación:

1. deshabilitar exposición del slice defectuoso mediante feature flag;
2. conservar schema expandido si sigue backward-compatible;
3. volver a reader/UX anterior cuando sea seguro, sin restaurar writers inseguros;
4. reintentar commands/outbox con las mismas idempotency keys;
5. reconciliar projections desde bounded contexts autoritativos;
6. corregir stock/costo únicamente mediante Inventory commands;
7. corregir ventas únicamente mediante Sales/VOID normal;
8. preservar Audit Trail, migration receipts y evidence fallido.

---

# 7. Non-goals de este roadmap

No introducir durante Onboarding V1:

- nuevos importadores self-service de insumos;
- importadores self-service de recipes;
- importadores self-service de subrecetas/fórmulas;
- XLS/XLSX;
- Google Drive/Dropbox import;
- QR handoff de setup;
- onboarding administrativo completo en Flutter POS;
- templates embebidos offline en POS;
- mapper visual drag-and-drop;
- stock inicial como requisito de `SALE_READY`;
- costo/CPP como requisito de `SALE_READY`;
- recipes como requisito de `SALE_READY`;
- staff adicional como requisito de `SALE_READY`;
- auto-publicación de Pre-BOM;
- Product Import escribiendo Inventory;
- “limpiar BD de producción”;
- “generar triggers Kardex”;
- motor fiscal duplicado en Onboarding;
- multi-terminal/LAN Activation del futuro;
- endpoint de fake checkout;
- `Tenant.is_active` como `ACTIVATED`;
- `GO_LIVE_ACCEPTED` inferido automáticamente;
- inventar TTFSS para tenants legacy.

---

# 8. Criterio de cierre del Execution Roadmap

Onboarding V1 se considera **IMPLEMENTADO Y READY FOR ACCEPTANCE** únicamente cuando ONB1.0–ONB1.10 están cerrados y existe evidencia de que:

```text
Tenant + OWNER
   ↓
OnboardingSession durable
   ↓
Fiscal mínimo + catálogo vendible
   ↓
SALE_READY state-based
   ↓
Fiscal + verification Product + authorized user quedan disponibles localmente
   ↓
Activation usa checkout real offline
   ↓
Ticket PAID + receipt + outbox son durables
   ↓
First-sale claim write-once
   ↓
Cloud converge y finaliza Activation
   ↓
ACTIVATED histórico
   ↓
BOH continúa sin bloquear ventas
```

No se acepta como cierre:

- demo visual únicamente;
- suites solo mocked;
- wizard que pierde progreso;
- Product CSV que todavía escribe stock/costo;
- template que crea recipes activas;
- Activation simulada;
- aislamiento tenant no probado en PostgreSQL real;
- TTFSS calculado manualmente;
- migración legacy sin receipts.

**Siguiente artefacto obligatorio:**

```text
docs/onboarding/onboarding_acceptance_plan.md
```

El Acceptance Plan será responsable de demostrar, entre otras cosas, el target de reference path:

```text
TTFSS <= 15 minutos
```

bajo fixture, hardware, catálogo, conectividad y condiciones explícitamente definidos.

---

# 9. Fuentes autoritativas

1. `docs/onboarding/onboarding_gap_audit.md` — baseline real y disposiciones KEEP/EXTEND/REFACTOR/ADD/REMOVE_FROM_SELF_SERVICE.
2. `docs/PRDs/prd_onboarding_v2.md` — autoridad de producto; en la evidencia adjunta corresponde a la versión aprobada `prd_onboarding_v2_approved.md` v2.1 y sus AC-01..AC-57.
3. `docs/onboarding/onboarding_prd_v2_approval_audit.md` — invariantes que cerraron la aprobación de producto.
4. `docs/onboarding/onboarding_architecture_spec.md` — autoridad de ingeniería una vez re-aprobada.
5. `docs/onboarding/onboarding_execution_roadmap_approval_audit.md` — findings ER-01..ER-09 integrados en v1.1.
6. `docs/plans/owner_dashboard_execution_roadmap.md` — disciplina de PR, evidence lifecycle y seguridad transversal del Backoffice.
7. `docs/plans/master_execution_roadmap.md` — contexto de Batch 11 y capacidades históricas.
8. `docs/PROVISIONING.md` — boundary Tenant + OWNER.
9. `docs/DESIGN_BACKOFFICE.md` — patrones UI/UX del Setup Center.
10. `docs/DESIGN.md` — experiencia POS durante Activation.

---

# 10. One Next Action

Ejecutar una **re-auditoría corta de `onboarding_execution_roadmap.md` v1.1** para confirmar cierre de ER-01..ER-09. Si el roadmap pasa a `APPROVED / READY FOR EXECUTION`, la primera acción de ejecución continúa siendo **ONB1.0A — Architecture re-approval** sobre `onboarding_architecture_spec.md` v0.2.

Solo después de aprobar Architecture sin P0/P1 se captura **ONB1.0B — M0 Evidence Baseline** y puede abrirse el primer PR funcional. Ningún cutover funcional debe empezar antes de ese gate.
