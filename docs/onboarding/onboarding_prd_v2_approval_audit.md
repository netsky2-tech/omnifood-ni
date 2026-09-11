# NHILOS Client Onboarding V1 — PRD Approval Audit

**Documento auditado:** `prd_onboarding_v2.md`  
**Baseline:** `onboarding_gap_audit.md` (`L0 CLOSED`)  
**Resultado:** `PASS WITH CORRECTIONS → APPROVED / AUTHORITATIVE`  
**Versión resultante:** `prd_onboarding_v2_approved.md` v2.1  
**Fecha:** 2026-09-03

---

# 1. Resumen ejecutivo

La estructura central del PRD V2 era correcta y estaba alineada con el Gap Audit:

```text
Provisioning
  -> Setup Center
  -> SALE_READY
  -> Activation
  -> BOH Enrichment
```

La auditoría no encontró una razón para reabrir el scope ni volver al modelo de cinco CSV / BOH completo antes de vender.

Sí encontró varias ambigüedades que debían cerrarse antes de declarar el documento autoritativo. Todas fueron corregidas en v2.1.

---

# 2. Hallazgos y resolución

| ID | Severidad | Hallazgo | Riesgo | Resolución |
|---|---|---|---|---|
| OA-01 | P0 | `PASS_WITH_WARNING` no definía cuándo activa y cuándo falla | Un defecto de sync podía esconderse como warning | Se congeló contrato `PASS / PASS_WITH_WARNING / FAIL` |
| OA-02 | P0 | Product Activation podía confundirse con Go-Live contractual | Se podía declarar aceptado un deployment sin entregables contractuales | Se separó `ACTIVATED` de `GO_LIVE_ACCEPTED` |
| OA-03 | P0 | Product CSV todavía dejaba abierta la opción de aplicar stock/costo | Podía perpetuar la sobrescritura directa detectada por Gap Audit | V1 no aplica stock ni CPP/costo desde Product CSV |
| OA-04 | P1 | `REPLACE` no acotaba sus side effects | Un replace podía tocar stock/costo | Quedó limitado a Product Master |
| OA-05 | P1 | Alias `codigo_barras -> sku` preservaba una deuda semántica | Corrupción silenciosa de identidad de producto | Barcode nunca se degrada a SKU |
| OA-06 | P1 | `onboardingStartedAt` podía medir solo trabajo del Owner | Assisted setup podía “desaparecer” del KPI | Inicio = primera actividad real de onboarding; timestamp inmutable |
| OA-07 | P1 | Setup Center estaba descrito como una ruta elegida | Template + CSV + manual podían quedar artificialmente excluyentes | Las rutas son combinables |
| OA-08 | P1 | Steps podían depender de que el usuario hiciera click/write | Repetición de configuración ya existente | Completitud state-based |
| OA-09 | P1 | `SALE_READY` no distinguía cloud readiness de terminal readiness | Podía interpretarse como offline-ready antes de Activation | Se definió como control-plane readiness; Activation prueba local |
| OA-10 | P1 | `ACTIVATED` no definía si podía “regresar” | Health runtime podía contaminar lifecycle | Activation es milestone histórico monotónico |
| OA-11 | P1 | RBAC quedaba como “Manager según política” | Contrato insuficiente para implementación | Writes de onboarding son permission-based |
| OA-12 | P2 | Audit Trail y analytics estaban mezclados | Bitácora forense ruidosa | Se separó Audit Trail material de telemetry |
| OA-13 | P2 | TTFSS no distinguía venta técnica controlada de venta cliente | Lectura comercial confusa | Se mantiene TTFSS técnico y se observa First Customer Sale por separado |

---

# 3. Invariantes de aprobación

El PRD v2.1 queda aprobado bajo estas invariantes:

1. `Provisioning != Client Onboarding != Activation`.
2. `SALE_READY` requiere identidad + fiscal mínimo + al menos un producto vendible.
3. BOH incompleto no bloquea la primera venta.
4. Pre-BOM de templates entra `SUGGESTED / DRAFT`, nunca activo automáticamente.
5. Self-service V1 importa Product Master; no un grafo BOH.
6. Product CSV V1 no escribe stock ni costo/CPP.
7. Un alias no cambia la semántica del dato.
8. Onboarding es persistente y reanudable.
9. `onboardingStartedAt` es inmutable y no oculta trabajo asistido.
10. Activation recorre el production checkout path real.
11. `PASS_WITH_WARNING` solo cubre verificación inconclusa por causa externa/transitoria con datos locales íntegros.
12. Defecto reproducible, pérdida, duplicación o integrity conflict => `FAIL`.
13. `ACTIVATED` es histórico; operational health se gobierna aparte.
14. Product Activation no elimina gates contractuales de un deployment.
15. Tenant isolation, permission-based RBAC y audit material son obligatorios.

---

# 4. Decisión

```text
Gap Audit alignment:          PASS
Product boundary:             PASS
Sale-ready semantics:         PASS
Template safety:              PASS
Import scope:                 PASS
Inventory/cost ownership:     PASS
TTFSS contract:               PASS
Activation semantics:         PASS
Offline-first boundary:       PASS
Tenant/RBAC/Audit:            PASS
Contractual boundary:         PASS

Open P0 blockers:             0
Open P1 blockers:             0

FINAL PRD DECISION:           APPROVED / AUTHORITATIVE
```

---

# 5. Siguiente gate

El siguiente documento debe ser:

```text
docs/onboarding/onboarding_architecture_spec.md
```

Architecture debe resolver **cómo** implementar el contrato sin reabrir **qué** significa:

- OnboardingSession / persisted state machine;
- idempotency and retry keys;
- transition/readiness evaluator;
- Draft/Suggested Recipe lifecycle;
- safe Product Import cutover;
- Product Master vs Inventory ownership;
- Activation evidence model;
- POS/cloud readiness and sync verification;
- permission mapping;
- forensic audit vs telemetry;
- migration from current W9 behavior.
