# NHILOS Client Onboarding V1 — Architecture Re-Approval Audit

**Documento auditado:** `onboarding_architecture_spec.md`  
**Versión auditada:** 0.2  
**Fecha:** 2026-09-03  
**Auditoría previa:** `onboarding_architecture_approval_audit.md` — `PASS WITH CORRECTIONS`  
**Autoridad de producto:** `prd_onboarding_v2_approved.md` v2.1 — `APPROVED / AUTHORITATIVE`  
**Baseline técnico:** `onboarding_gap_audit.md` — `L0 CLOSED`  
**Roadmap:** `onboarding_execution_roadmap.md` v1.1 — `APPROVED / READY FOR EXECUTION`  

**Resultado:** **APPROVED / ENGINEERING AUTHORITATIVE**

---

# 1. Objetivo de esta re-auditoría

Verificar formalmente que los hallazgos `AR-01..AR-18` derivados de la auditoría inicial de arquitectura han sido integrados con total fidelidad en `onboarding_architecture_spec.md` v0.2, garantizando que:

1. No existen contradicciones con el PRD v2.1 aprobado (`prd_onboarding_v2_approved.md`).
2. No existen ambigüedades de concurrencia, transaccionalidad, idempotencia o límites de dominio.
3. Se respeta el principio offline-first del POS y el production checkout path para Activation.
4. No hay blockers abiertos:

```text
AR-01..AR-18 = CLOSED
Open P0 = 0
Open P1 = 0
Open P2 = 0
```

---

# 2. Resumen ejecutivo de resolución AR-01..AR-18

| ID | Área / Requisito | Severidad Original | Estado v0.2 | Resolución en Spec v0.2 |
|---|---|:---:|:---:|---|
| **AR-01** | Ownership Boundaries & Context Map | P0 | **CLOSED** | Onboarding orquesta readiness vía ports; no invade ni escribe tablas de Fiscal, Catalog, Inventory, Sales, Identity ni Audit Trail (§1). |
| **AR-02** | Persistent OnboardingSession Model | P0 | **CLOSED** | Sesión única por tenant en PostgreSQL con `optimisticVersion`, `tenant_id` y timestamps write-once (§2.1, §14.1). |
| **AR-03** | Lifecycle & Milestone Semantics | P0 | **CLOSED** | Estados formales `PROVISIONED → SETUP_IN_PROGRESS → SALE_READY → ACTIVATION_IN_PROGRESS → ACTIVATED`. Milestones write-once inmutables (§3). |
| **AR-04** | State-based Readiness | P0 | **CLOSED** | Los evaluadores computan readiness contra el estado vivo de los bounded contexts; no dependen de flags booleanos artificiales (§4). |
| **AR-05** | SALE_READY Reconciler & Invariants | P1 | **CLOSED** | Si el estado vivo deja de cumplir el mínimo, vuelve a `SETUP_IN_PROGRESS` sin borrar `saleReadyFirstAt` (§4.3, §5.3). |
| **AR-06** | Idempotency Lease & Recovery | P0 | **CLOSED** | `OnboardingIdempotencyRecord` con key + payloadHash + constraint física + estados `IN_PROGRESS`, `SUCCEEDED`, `FAILED_RETRYABLE`, `FAILED_FINAL` y expiración de lease (§6). |
| **AR-07** | Template Draft Lifecycle | P0 | **CLOSED** | Recetas e insumos generados por template nacen en estado `DRAFT / SUGGESTED`; cero deducción ni movimientos en Kardex antes de publicación explícita (§8.2). |
| **AR-08** | Template Provenance & Reapply | P1 | **CLOSED** | Trazabilidad con `TemplateApplication` y `TemplateSeedLink`; re-aplicación segura sin duplicar insumos/productos (§2.3, §8.3). |
| **AR-09** | Template Cross-Context UoW | P0 | **CLOSED** | La aplicación de template ejecuta en una Unit of Work tenant-bound con ports transaccionales; rollback total ante cualquier falla (§8.1, §14). |
| **AR-10** | Canonical CSV Contract & Versioning | P1 | **CLOSED** | Una única autoridad versionada (`ImportContractVersion`) para parsing raw, aliases, plantilla oficial y validaciones (§9.1, §9.2). |
| **AR-11** | Upload, Chunk & Row Deduplication | P1 | **CLOSED** | Staging con hash de chunk, dedupe en memoria/staging y validación de duplicados intra-batch antes de commit (§9.3, §9.4). |
| **AR-12** | Product Import Safety Guard | P0 | **CLOSED** | V1 escribe exclusivamente en Product Master. Prohibido alterar stock, existencia, costo o Kardex; prohibido degradar `codigo_barras -> sku` (§9.5, §10). |
| **AR-13** | Product vs Inventory Ownership | P0 | **CLOSED** | Inventory es el único owner de existencias y valorizaciones. Remedición legacy aislada en commands de Inventory (§10.2). |
| **AR-14** | Fiscal Revision & POS Fingerprint | P1 | **CLOSED** | Parámetros fiscales versionados con revision monotónica y fingerprint para outbox sync confiable al POS (§7, §15). |
| **AR-15** | Activation Local Persistence & Outbox | P0 | **CLOSED** | Activation usa el checkout real de producción en SQLite local; comprobante, firma DGI y outbox persistidos localmente (§11.2, §15.2). |
| **AR-16** | Cloud/Local Activation Authority Split | P0 | **CLOSED** | El POS nunca declara `ACTIVATED`; reporta evidencia durable y queda `SYNC_VERIFICATION_PENDING`. Cloud finalizer es la única autoridad de `PASS / PASS_WITH_WARNING / FAIL` (§11.4). |
| **AR-17** | TTFSS & First-Sale Claim Semantics | P1 | **CLOSED** | El founder POS genera un `first_successful_sale_claim` write-once local, desacoplado del orden de sincronización WAN (§12). |
| **AR-18** | Granular RBAC, Tenant Isolation & Audit | P1 | **CLOSED** | Permisos específicos (`onboarding.*`), RLS fail-closed por `tenant_id`, y separación estricta entre Audit Trail material y telemetry (§16, §17, §18). |

---

# 3. Veredicto Final

```text
Ownership boundaries:         PASS (CLOSED)
Persistent Session & Locks:   PASS (CLOSED)
State-based Readiness:        PASS (CLOSED)
Idempotency & Leases:         PASS (CLOSED)
Template Safety (DRAFT):      PASS (CLOSED)
Import Scope (Master Only):   PASS (CLOSED)
POS Activation & Outbox:      PASS (CLOSED)
Authority Split (Cloud Pass): PASS (CLOSED)
TTFSS Local Claim:            PASS (CLOSED)
RBAC, Isolation & Audit:      PASS (CLOSED)

Open P0 Blockers:             0
Open P1 Blockers:             0
Open P2 Blockers:             0

FINAL DECISION:               APPROVED / ENGINEERING AUTHORITATIVE
```

Queda levantado el gate **ONB1.0A**. Se autoriza la captura del baseline **ONB1.0B** y el posterior inicio del código funcional en **ONB1.1**.
