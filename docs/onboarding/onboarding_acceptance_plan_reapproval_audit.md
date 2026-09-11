# NHILOS Client Onboarding V1 — Acceptance Plan Re-Approval Audit

**Documento auditado:** `onboarding_acceptance_plan_v0.2.md`  
**Versión auditada:** 0.2  
**Fecha:** 2026-09-03  
**Auditoría previa:** `onboarding_acceptance_plan_approval_audit.md` — `PASS WITH CORRECTIONS`  
**Autoridad de producto:** `prd_onboarding_v2_approved.md` v2.1 — `APPROVED / AUTHORITATIVE`  
**Autoridad de arquitectura referenciada:** `onboarding_architecture_spec.md` v0.2 — `PROPOSED / READY FOR FINAL APPROVAL AUDIT`  
**Roadmap:** `onboarding_execution_roadmap.md` v1.1 — `APPROVED / READY FOR EXECUTION`  

**Resultado:** **APPROVED / AUTHORITATIVE FOR ACCEPTANCE EXECUTION — ENTRY GATE STILL APPLIES**

---

# 1. Objetivo de esta re-auditoría

Esta revisión es deliberadamente corta.

No reabre el PRD, Architecture ni el Execution Roadmap. Verifica únicamente que los hallazgos `AP-A01..AP-A10` de la auditoría previa fueron integrados sin introducir una contradicción nueva de severidad P0/P1.

Criterio de cierre:

```text
AP-A01..AP-A10 = CLOSED
Open P0 = 0
Open P1 = 0
Open P2 = 0
```

---

# 2. Resultado ejecutivo

La versión 0.2 integra correctamente los diez hallazgos.

La estructura de aceptación queda consistente con el modelo aprobado:

```text
Provisioning
   ↓
Setup / state-based readiness
   ↓
SALE_READY
   ↓
Required config local
   ↓
Activation sobre production checkout
   ↓
local evidence durable
   ↓
SYNC_VERIFICATION_PENDING
   ↓
backend authoritative finalization
   ↓
ACTIVATED
   ↓
BOH Enrichment progresivo
```

y conserva TTFSS como métrica formal del reference path bajo fixture/protocolo congelado.

No se encontraron contradicciones bloqueantes nuevas.

---

# 3. Verificación de hallazgos AP-A01..AP-A10

| ID | Severidad original | Verificación v0.2 | Estado |
|---|---:|---|---|
| **AP-A01** | P0 | `cloud finalizer unreachable` termina en `SYNC_VERIFICATION_PENDING`, `activatedAt=NULL`; `PASS_WITH_WARNING` exige backend finalizer accesible y `POST_RECONNECT_SYNC=WARNING` | **CLOSED** |
| **AP-A02** | P1 | El benchmark exige 5 reference runs consecutivos programados; 5/5 `measurementEligible`, 5/5 `ANCHORED`, 5/5 `<=15:00`; no se reduce denominador | **CLOSED** |
| **AP-A03** | P1 | Existe contrato obligatorio `AP_REFERENCE_RUN_PROTOCOL.md` con operador, entrenamiento, selección exacta, estado inicial, red, cache, POS state y reset procedure | **CLOSED** |
| **AP-A04** | P1 | Se hicieron explícitos escenarios previamente implícitos: concurrent start, `SYSTEM_RECONCILER`, template versions, pre-commit side effects, `rowOrdinal`, active attempt/final result y pending finalization | **CLOSED** |
| **AP-A05** | P1 | Activation `FAIL` demuestra `SALE_READY` si readiness sigue válido y `SETUP_IN_PROGRESS` si dejó de ser válido | **CLOSED** |
| **AP-A06** | P1 | AP-09 ahora prueba avance positivo `INVENTORY_READY → COSTING_READY → OPERATIONS_READY` conservando `activatedAt`, TTFSS y Sales | **CLOSED** |
| **AP-A07** | P1 | Se añadió aceptación browser/UX para keyboard/focus, loading/error/stale, no-color-only, `VERSION_CONFLICT`, retry/input preservation y resume cross-device | **CLOSED** |
| **AP-A08** | P2 | Reuso de evidencia queda limitado al mismo `acceptanceReleaseId`, fixture y protocolo; ONB1.10F no sustituye AP-07 | **CLOSED** |
| **AP-A09** | P2 | Sanitización cubre explícitamente Audit Trail + Telemetry y mantiene sus responsabilidades separadas | **CLOSED** |
| **AP-A10** | P2 | `acceptanceReleaseId` congela build/migrations/flags/fixture; cambios invalidan suites impactadas y el sign-off no mezcla releases | **CLOSED** |

---

# 4. Checks críticos de consistencia

## 4.1 Activation authority

**PASS**

La v0.2 ya no permite inferir Activation localmente.

Contrato aceptado:

```text
POS
  -> local evidence
  -> SYNC_VERIFICATION_PENDING
  -> cloud/backend finalizer
  -> PASS | PASS_WITH_WARNING | FAIL
```

Si el finalizer no está disponible:

```text
activatedAt = NULL
```

Esto queda consistente con Architecture.

---

## 4.2 `PASS_WITH_WARNING`

**PASS**

Se conserva como excepción limitada:

```text
todos los checks locales = PASS
sale durable = PASS
outbox integrity = PASS
POST_RECONNECT_SYNC = WARNING
reason = external/transient
backend finalizer = reachable
no reproducible defect
```

Un defecto reproducible sigue siendo:

```text
FAIL
```

No existe degradación silenciosa de errores reales a warning.

---

## 4.3 TTFSS benchmark

**PASS**

El contrato ahora evita survivorship bias:

```text
5 scheduled consecutive reference runs
5/5 measurementEligible=true
5/5 clockConfidence=ANCHORED
5/5 TTFSS <= 15:00
```

No se permite reemplazar selectivamente un run degradado/lento.

Un error puramente del harness reinicia el cohort completo.

Además, `AP_REFERENCE_RUN_PROTOCOL.md` hace reproducibles las condiciones humanas/técnicas.

---

## 4.4 Full conformance

**PASS**

El plan mantiene gates explícitos:

```text
PRD AC-01..AC-57      = 57/57 PASS
Architecture scenarios = 74/74 PASS
Open P0               = 0
Open P1               = 0
```

La existencia de suites especializadas no sustituye la matriz final de trazabilidad AP-11.

---

## 4.5 Product Import / Template safety

**PASS**

Permanece cerrado que:

```text
Product CSV -> Product Master only
stock/cost -> no Product / no Inventory
Barcode != SKU
Template recipe -> DRAFT/SUGGESTED
Draft recipe -> no BOM/Kardex effect
```

También quedan cubiertos `rowOrdinal`, UoW y version/provenance.

---

## 4.6 Progressive BOH

**PASS**

El documento ya prueba ambos sentidos necesarios:

```text
BOH incomplete does not block activation/sales
```

y:

```text
ACTIVATED
 -> INVENTORY_READY
 -> COSTING_READY
 -> OPERATIONS_READY
```

sin modificar `activatedAt`, TTFSS o disponibilidad de Sales.

---

## 4.7 Evidence integrity

**PASS**

`acceptanceReleaseId` evita combinar evidencia de releases diferentes.

Regla aceptada:

```text
code/config/migration change
    ↓
new acceptanceReleaseId
    ↓
rerun impacted suites
```

ONB1.10 puede aportar evidencia reutilizable solo bajo identidad exacta de release/fixture/protocolo, pero no sustituye el benchmark formal de AP-07.

---

# 5. Observación sobre el estado de Architecture

No es un defecto del Acceptance Plan.

El documento de Architecture referenciado continúa formalmente en:

```text
PROPOSED / READY FOR FINAL APPROVAL AUDIT
```

Por tanto, aunque el Acceptance Plan ya queda aprobado como contrato, **su ejecución sigue bloqueada por su propio Entry Gate** hasta que:

```text
Architecture = APPROVED / ENGINEERING AUTHORITATIVE
Open Architecture P0 = 0
Open Architecture P1 = 0
ONB1.0–ONB1.10 = CLOSED
Release Candidate = frozen
AP-00 Entry Gate = PASS
```

Esto es consistente con el Execution Roadmap y no requiere modificar el Acceptance Plan.

---

# 6. Matriz final

```text
AP-A01: CLOSED
AP-A02: CLOSED
AP-A03: CLOSED
AP-A04: CLOSED
AP-A05: CLOSED
AP-A06: CLOSED
AP-A07: CLOSED
AP-A08: CLOSED
AP-A09: CLOSED
AP-A10: CLOSED

Product alignment:               PASS
Architecture contract alignment: PASS
Roadmap alignment:               PASS
Activation semantics:            PASS
TTFSS methodology:               PASS
Benchmark reproducibility:       PASS
Template/import safety:          PASS
Progressive BOH:                 PASS
Security/Audit discipline:       PASS
Evidence lifecycle:              PASS

Open P0:                         0
Open P1:                         0
Open P2:                         0
```

---

# 7. Decisión final

```text
FINAL ACCEPTANCE PLAN DECISION:

APPROVED / AUTHORITATIVE FOR ACCEPTANCE EXECUTION
```

Con una condición operativa ya incorporada al propio documento:

```text
APPROVAL OF THE PLAN
        ≠
READY TO EXECUTE ACCEPTANCE
```

La ejecución formal del plan comienza únicamente después de cerrar el Entry Gate.

No se requiere otra ronda documental sobre `onboarding_acceptance_plan.md` salvo que cambien PRD, Architecture, roadmap o el contrato de métricas.

---

# 8. Estado recomendado del documento

Actualizar el encabezado de `onboarding_acceptance_plan.md` a:

```text
Estado:
APPROVED / AUTHORITATIVE FOR ACCEPTANCE EXECUTION
— EXECUTION BLOCKED UNTIL ENTRY GATE

Versión:
1.0
```

La versión 0.2 auditada puede promoverse a 1.0 sin cambios funcionales; el cambio es exclusivamente de estado/versionado documental.

---

# 9. Siguiente acción

Con el Acceptance Plan cerrado, la cadena documental de Onboarding queda completa.

La siguiente acción no es crear otro documento de diseño:

```text
ONB1.0A — Architecture re-approval
```

Después:

```text
ONB1.0B — M0 Evidence Baseline
   ↓
ONB1.1..ONB1.10 implementation
   ↓
freeze acceptanceReleaseId
   ↓
AP-00 Entry Gate
   ↓
AP-01..AP-12
   ↓
AP_FINAL_SIGNOFF
```
