# NHILOS Owner Dashboard — Acceptance Plan

**Documento:** `owner_dashboard_acceptance_plan.md`  
**Estado:** **APPROVED / RELEASE GATE — ENGINEERING & PRODUCT ACCEPTANCE CONTRACT**  
**Versión:** 1.1  
**Fecha:** 2026-09-03  
**Plan de ejecución:** `owner_dashboard_execution_roadmap.md` — Evidence-Gated Execution Roadmap  
**Design authority:** `DESIGN_BACKOFFICE.md`  
**Autoridades de dominio:** PRDs Master + Sales + Inventory + Onboarding + Audit/RBAC vigentes  
**Contrato Loyalty:** `docs/loyalty/loyalty_acceptance_plan.md` — v1.1, obligatorio para W10  
**Soporte Loyalty:** `docs/loyalty/prd_loyalty_v1.md`, `docs/loyalty/loyalty_architecture_spec.md`, `docs/loyalty/loyalty_execution_roadmap.md`, `docs/loyalty/loyalty_gap_audit.md`  
**Alcance fundador:** SOHO — portal Owner incluido en go-live; arquitectura multi-tenant y camino a GA con piloto de dos tenants.

> **Propósito del documento**
>
> Este plan determina cuándo NHILOS puede afirmar, con evidencia reproducible:
>
> **El Owner Dashboard está terminado, es confiable y está listo para operación real.**
>
> No significa que “las pantallas cargan”, que “el CRUD funciona” o que “la suite está verde”.
>
> Significa que semántica de negocio, aislamiento multi-tenant, autenticación web, freshness, reportería, escrituras estratégicas, auditoría, sincronización con POS, DGI, accesibilidad, routing, observabilidad, recuperación y operación real convergen bajo el mismo contrato.

---

# 0. Regla ejecutiva de aceptación

El Owner Dashboard solo puede declararse **DONE / GA-READY** cuando se cumplen simultáneamente las condiciones siguientes:

1. Todos los milestones del roadmap aplicables `D0-A, D0-B, S1, S2, T1, F1, W1..W10, I1, O1, P1` están cerrados con evidencia según su dependencia de aceptación.
2. Los dominios del Definition of Done de este documento están en estado **Operationally Proven**.
3. El **Golden E2E Owner Dashboard** pasa completo sin intervención manual sobre base de datos para “acomodar” resultados.
4. La suite mínima `ODAV-01..ODAV-42` está en PASS.
5. Las métricas operativas `OM-01..OM-25` cumplen sus thresholds.
6. El aislamiento de dos tenants está demostrado sobre **PostgreSQL real** con rol de aplicación no-bypass y casos negativos.
7. La semántica KPI, timezone y freshness está aprobada y reconciliada contra fixtures canónicos.
8. Las escrituras estratégicas producen auditoría y convergen al POS cuando corresponde, sin hacer al POS dependiente del dashboard.
9. W10 de Loyalty cumple `docs/loyalty/loyalty_acceptance_plan.md` v1.1 y sus autoridades de soporte; la semántica legacy de “points balance” no basta.
10. El piloto de dos tenants concluye sin hallazgos críticos abiertos y con sign-off explícito de Product, Security, Finance, Backend, Infrastructure y Operations.

```text
Product Semantics       ✅
Tenant Isolation        ✅
Browser Auth            ✅
Tenant Context          ✅
Freshness               ✅
Sales Analytics         ✅
Inventory Insight       ✅
Fiscal / Audit          ✅
Catalog / Products      ✅
Promotions              ✅
Recipes / BOM           ✅
Users / Permissions     ✅
Fiscal Setup / Onboard  ✅
Customers / Loyalty     ✅
POS Sync Boundary       ✅
Routing / TLS           ✅
Accessibility / UX      ✅
Performance             ✅
Observability           ✅
Recovery                ✅
Two-Tenant Pilot        ✅
```

## 0.1 Dos gates distintos: SOHO contractual vs Owner Dashboard GA

Este documento distingue dos decisiones de aceptación que **no deben confundirse**:

### Gate A — SOHO Contractual Owner Portal

Este gate valida exclusivamente la obligación contractual del portal incluida en el go-live fundador de SOHO. Puede aprobarse antes de que el Owner Dashboard alcance GA si cumple, como mínimo:

- acceso autenticado para los usuarios acordados de SOHO;
- tenant/contexto correcto y aislamiento probado;
- portal de **consulta** disponible sobre información sincronizada a la nube;
- reportería incluida en el alcance contractual y estados de freshness comprensibles;
- routing/TLS y sesión web seguros;
- indisponibilidad del portal o WAN no bloquea la operación local del POS;
- evidencia conjunta de aceptación o pendientes conforme al go-live contractual.

**Gate A no exige cerrar W5..W10 completos** salvo que una de esas capacidades haya sido incorporada expresamente al alcance contractual aceptado de SOHO. Entregar capacidades adicionales no las convierte retroactivamente en condición contractual.

### Gate B — Owner Dashboard GA

Este es el gate de producto completo de NHILOS. Exige `D0/S1/S2/T1/F1/W1..W10/I1/O1/P1`, todos los ODAV, OM, DoD, recuperación y piloto de dos tenants definidos en este Acceptance Plan.

```text
SOHO Contractual Portal  !=  Owner Dashboard GA
        Gate A                    Gate B
```

**Regla:** una falla en Gate B no invalida por sí sola un Gate A ya aceptado cuando la capacidad fallida estaba fuera del alcance contractual de SOHO; una falla de seguridad, aislamiento o acceso que afecte Gate A sí invalida ambos gates.

**No se acepta como cierre:**

- un demo visual;
- tests únicamente mocked para RLS, auth o aislamiento;
- dashboards con números que no reconcilian con la fuente transaccional;
- KPIs sin timezone o freshness explícita;
- esconder errores de sincronización mostrando datos antiguos como actuales;
- confiar en host, slug, header o UUID enviado por el cliente como autoridad de tenant;
- un write estratégico sin audit trail;
- un portal que pueda modificar, borrar o renumerar facturas fiscales;
- una prueba de aislamiento que no use PostgreSQL real;
- una implementación que haga al POS depender de Railway, Cloudflare o del dashboard para vender;
- un W10 reducido a “sumar/restar puntos” si Loyalty V1 ya está activa;
- aprobar GA con hallazgos Critical/High de aislamiento, DGI o seguridad de escritura.

---

# 1. Jerarquía de autoridad y regla de conflicto

Este Acceptance Plan **no redefine producto ni dominio**. Define cómo demostrar completitud.

En caso de conflicto:

1. Los PRDs vigentes gobiernan comportamiento de negocio, DGI, Sales, Inventory, Onboarding y Audit/RBAC.
2. Los specs/contratos de dominio aprobados gobiernan invariantes técnicas del bounded context correspondiente.
3. `docs/loyalty/loyalty_acceptance_plan.md` v1.1 gobierna la completitud de Loyalty V1 y su superficie Owner dentro de W10; `docs/loyalty/prd_loyalty_v1.md`, `docs/loyalty/loyalty_architecture_spec.md`, `docs/loyalty/loyalty_execution_roadmap.md` y `docs/loyalty/loyalty_gap_audit.md` aportan el contrato de producto, arquitectura, ejecución y baseline respectivamente.
4. `owner_dashboard_execution_roadmap.md` gobierna milestones, dependencias, critical path, evidence lifecycle y boundaries de implementación.
5. `DESIGN_BACKOFFICE.md` gobierna experiencia visual, responsive y accesibilidad del backoffice.
6. Los decision records D0 aprobados gobiernan KPI dictionary, reporting timezone, access/write ACL y freshness semantics.
7. Este documento gobierna **la demostración de que todo lo anterior funciona integrado**.

**Regla:** el código existente es baseline de rutas/behavior, pero no puede usarse para invalidar una invariante de producto aprobada.

---

# 2. Invariantes que son release blockers absolutos

Cualquier violación implica **FAIL / NO-GO** aunque el Golden E2E aparente funcionar:

1. El JWT verificado `tenant_id` es la autoridad de autorización tenant-scoped.
2. Host, slug, forwarded-host, body, query o headers solo aportan contexto y deben cruzarse server-side contra el JWT.
3. Toda consulta sensible usa aislamiento en defensa en profundidad: tenant predicate explícito + RLS transaccional donde aplique.
4. La aplicación DB usada en aceptación no puede bypass RLS.
5. Tenant A no puede leer, inferir, exportar ni escribir datos de Tenant B.
6. Un contexto ausente, inconsistente o forged falla cerrado.
7. La SPA no almacena secretos o access tokens en mecanismos no aprobados por el browser-session contract.
8. Logout/revocation invalida acceso posterior según el contrato aprobado.
9. El dashboard es un espejo cloud eventualmente consistente; nunca reemplaza SQLite/POS como fuente operativa local.
10. El POS debe seguir operando si el dashboard, Railway, Cloudflare o WAN no están disponibles.
11. Cada KPI/read model sensible a sync expone freshness de acuerdo con F1.
12. `STALE`, `PARTIAL` o `UNKNOWN` nunca se representan visualmente como datos actuales completos.
13. Las fórmulas KPI y timezone no se inventan en frontend.
14. Facturas emitidas permanecen inmutables; el dashboard no crea workflows de delete, renumber o historical correction.
15. Las escrituras del backoffice se limitan a configuración estratégica autorizada.
16. Todo write estratégico tiene actor, tenant, timestamp y before/after o metadata equivalente auditable.
17. CASHIER/WAITER no adquieren permisos de administración estratégica por ocultamiento de UI; el backend debe denegarlo.
18. Gestión de usuarios permanece OWNER-only donde el contrato vigente así lo define.
19. Los cambios cloud que deban llegar al POS lo hacen mediante el sync existente; no se crea un canal paralelo ad hoc.
20. La sincronización tardía no debe reinterpretar silenciosamente historia fiscal o transaccional.
21. El Owner Dashboard no calcula ni presenta “net profit/P&L” sin datos de gastos y contrato explícito.
22. Gross margin/COGS solo se publican con terminología y fórmula aprobadas por Finance.
23. Mobile `<768px` es lectura básica; no se exige ni se habilita un flujo CRUD que contradiga el design contract.
24. W10 Loyalty usa Program/Reward/progress/history/authorized adjustment/profit-aware conforme a `docs/loyalty/loyalty_acceptance_plan.md` v1.1; no un balance legacy como autoridad.
25. Los usuarios con historia transaccional no se eliminan físicamente; el lifecycle usa desactivación/soft-delete y preserva referencias históricas.
26. El Owner raíz/principal no puede quedar desactivado, eliminado ni degradado de forma que provoque lockout del tenant.
27. El 100% de endpoints expuestos al Owner Dashboard debe estar cubierto por una matriz Endpoint × Tenant × ACL con evidencia negativa cross-tenant.
28. Ninguna excepción de release puede aprobar una violación de aislamiento tenant, DGI o autorización.

---

# 3. Estados de evidencia

Cada capability usa exactamente este flujo:

```text
Planned
  -> Implemented
  -> Verified
  -> Operationally Proven
```

| Estado | Evidencia mínima |
|---|---|
| **Planned** | autoridad, owner, acceptance criteria, fixture, test/harness, rollback boundary y métricas definidas |
| **Implemented** | PR/commit, diff real, migrations/config, observability hooks y contratos actualizados |
| **Verified** | tests exactos, navegador/runtime/DB real según aplique, casos negativos y reconciliación de fixtures |
| **Operationally Proven** | staging/pilot, telemetría, synthetic checks, routing/TLS, lag/freshness, rollback drill y sign-off |

**Regla:** ningún módulo crítico puede quedar solo en `Implemented` o `Verified` al declarar GA.

---

# 4. Ambientes mínimos de aceptación

## Tier A — Unit / Contract

Valida:

- formatters y KPI transformations;
- Zod/forms;
- ACL helpers;
- tenant-context parsing;
- freshness state mapping;
- table/filter/date-range behavior;
- reducers/query keys/cache isolation;
- domain contracts de UI.

## Tier B — Frontend integration

Usa React + Vite + Testing Library/Vitest con API contracts reales o test server controlado.

Valida:

- auth states;
- protected routes;
- error/loading/empty/stale states;
- forms;
- keyboard/focus;
- role-driven rendering;
- cache key tenant scoping.

## Tier C — Backend + PostgreSQL real

Obligatorio para:

- RLS;
- transaction-bound `app.tenant_id`;
- two-tenant isolation;
- route reads/writes;
- audit trail;
- idempotency/conflict behavior;
- fiscal invariants;
- report reconciliation.

Mocks no satisfacen este tier.

## Tier D — Browser + deployed staging

Debe utilizar el mismo modelo de despliegue previsto:

- Cloudflare Pages o Worker fallback aprobado;
- Railway backend;
- PostgreSQL staging;
- TLS válido;
- CSP/CORS/CSRF/session policy real;
- branded tenant host.

## Tier E — POS integration

Usa POS real o build staging con SQLite real para demostrar:

- el POS no depende del dashboard;
- cambios de configuración cloud convergen al POS cuando vuelve la conectividad;
- el POS no recibe datos de otro tenant;
- Loyalty V1 Owner ↔ POS mantiene su contrato.

## Tier F — Pilot / operational proof

Dos tenants representativos con:

- journeys completos;
- telemetría;
- soporte/incidentes registrados;
- reconciliación KPI;
- pruebas cross-tenant negativas;
- recovery drill.

---

# 5. Fixture canónico de aceptación

El fixture debe ser versionado, reproducible y no depender de mutaciones manuales ocultas.

## 5.1 Tenant A — SOHO

```text
slug: soho
timezone: D0-approved tenant reporting timezone
role users:
  owner-a
  manager-a
  cashier-a
  waiter-a
```

Debe contener al menos:

- ventas PAID y VOID;
- split payments NIO/USD;
- productos SIMPLE + COMPOUND + VARIANT_PARENT;
- categorías y promociones;
- recetas/BOM + Kardex + merma;
- resolución/config fiscal;
- usuarios/roles/permisos;
- customers;
- Loyalty V1 Program + Reward + ledger/projection conforme al fixture del acceptance Loyalty.

## 5.2 Tenant B — Isolation Sentinel

```text
slug: tenant-b-sentinel
```

Todos sus datos deben tener sentinels inequívocos:

```text
product: FOREIGN_TENANT_SENTINEL_PRODUCT
customer: FOREIGN_TENANT_SENTINEL_CUSTOMER
invoice external marker: FOREIGN_TENANT_SENTINEL_INVOICE
```

El sentinel permite detectar leaks incluso si un total agregado accidentalmente parece plausible.

## 5.3 Dataset de performance propuesto

Para la prueba de carga funcional del backoffice:

```text
Tickets:            >= 5,000 por tenant
Ticket lines:       >= 20,000 por tenant
Kardex movements:   >= 50,000 por tenant
Products/variants:  >= 1,000 por tenant
Customers:          >= 500 por tenant
Users:              >= 25 por tenant
Promotions:         >= 50 por tenant
Recipes/BOM:        >= 200 por tenant
```

Este volumen es un **acceptance budget propuesto** para evitar aprobar únicamente sobre fixtures triviales.

## 5.4 Reconciliación

Los expected totals se calculan desde fixtures fuente y se versionan como receipt. Está prohibido “corregir” el dashboard hasta que coincida sin explicar la causa.

---

# 6. Golden E2E — Owner Dashboard

El Golden E2E es una sola cadena trazable. No se permite editar DB manualmente entre pasos.

## G01 — Branded routing + tenant resolution

1. Abrir `soho.<brand-domain>` en staging/prod-like.
2. Confirmar TLS válido.
3. Resolver `soho` server-side.
4. Intentar host/slug forged hacia Tenant B.

**Esperado:**

- branding/contexto de SOHO;
- autorización sigue derivando del JWT;
- mismatch/unknown/inactive falla genéricamente;
- forged forwarding header no cambia tenant.

## G02 — Login / session lifecycle

5. Login OWNER SOHO.
6. Navegar rutas protegidas.
7. Forzar access token expiry/refresh conforme al contrato.
8. Ejecutar logout/revocation.
9. Reintentar una ruta protegida.

**Esperado:** sesión renovada solo de forma aprobada; tras revocation no hay acceso residual.

## G03 — Dashboard sales + KPI reconciliation

10. Abrir Dashboard con rango canónico.
11. Comparar KPIs con expected fixture D0.
12. Abrir hourly/top-products/cashier views.

**Esperado:**

- reconciliación 100%;
- timezone visible/aplicado;
- no datos Tenant B;
- labels financieros aprobados.

## G04 — Freshness / degraded cloud truth

13. Presentar streams completos.
14. Simular al menos `STALE`, `PARTIAL` y `UNKNOWN` según F1.
15. Mantener la misma data numérica mientras cambia metadata de completeness.

**Esperado:** la UI cambia el estado de confianza, no inventa valores nuevos y no presenta incompletos como completos.

## G05 — Inventory insight

16. Abrir valuation, COGS/gross-margin, Kardex y alerts.
17. Reconciliar contra fixtures.
18. Navegar desde agregado a detalle donde el producto lo permita.

**Esperado:** cantidades/costos concuerdan; ningún KPI implica net profit.

## G06 — Fiscal / audit read-only

19. Abrir monthly summary, voided invoices y sequence audit.
20. Exportar sales book/Z report en formatos soportados.
21. Comparar conteos, totales e IDs contra el fixture.

**Esperado:**

- no existe mutación fiscal desde la vista;
- export corresponde al tenant/rango;
- invoices/sequence no cambian tras consultar/exportar.

## G07 — Catalog/product strategic write

22. Como MANAGER/OWNER, crear producto canónico de prueba.
23. Editar precio/categoría.
24. Desactivar el producto.
25. Consultar Audit.

**Esperado:**

- write tenant-safe;
- actor + before/after auditables;
- CASHIER recibe 403 si intenta el mismo endpoint aunque fuerce request manual.

## G08 — POS independence + later sync

26. Dejar POS SOHO offline antes del write cloud.
27. Confirmar que POS sigue vendiendo con su estado local previo.
28. Restaurar WAN y ejecutar sync normal.
29. Confirmar que el nuevo estado de catálogo converge al POS.

**Esperado:** dashboard no bloquea POS; el cambio llega por infraestructura de sync existente y no por un canal paralelo.

## G09 — Promotions

30. Crear promoción con schedule válido.
31. Crear conflicto/overlap según reglas soportadas.
32. Activar/inactivar.
33. Confirmar sync al POS.

**Esperado:** validación coherente, audit trail y role gates.

## G10 — Recipe/BOM

34. Editar/publicar una receta versionada para COMPOUND.
35. Confirmar que historia previa no se reinterpreta.
36. Confirmar trigger/read model de costo conforme al contrato vigente.

**Esperado:** versión nueva aplica hacia adelante; no se reescribe historia.

## G11 — Users & permissions

37. OWNER crea usuario Manager.
38. Ajusta rol/permisos.
39. Desactiva usuario normal y confirma soft-delete/historia preservada.
40. Usuario desactivado intenta acceder.
40a. Intentar eliminar/desactivar/degradar al Owner raíz/principal hasta un estado de lockout.

**Esperado:**

- solo OWNER administra usuarios donde así esté definido;
- PIN nunca se expone en claro;
- revocation/deactivation es efectiva;
- audit trail existe;
- el usuario normal conserva referencias históricas tras la baja;
- el Owner raíz/principal queda protegido frente a delete/deactivate/authority-loss que cause lockout.

## G12 — Fiscal setup / onboarding

41. Ejecutar configuración fiscal permitida y/o industry template en tenant de prueba.
42. Ejecutar import de 1,500 filas con 20 filas deliberadamente inválidas, verificando chunks de máximo 100 registros y UI responsive.
43. Confirmar resultado esperado `1,480 VALID / 20 ERROR` o equivalente exacto del fixture versionado.
43a. Reintentar el mismo token/lote de importación.

**Esperado:** staging, errores trazables, chunk size `<=100`, UI sin freeze/OOM, idempotencia, 0 duplicados y blast radius tenant = 0.

## G13 — Customers + Loyalty V1

44. Abrir Customer de Loyalty fixture.
45. Ver progreso por programa e historial explicativo.
46. Gestionar Program y Reward de Loyalty V1 desde la superficie Owner obligatoria.
47. Ejecutar Adjustment autorizado con razón.
48. Confirmar audit trail y estado posterior.

**Esperado:** se cumple `docs/loyalty/loyalty_acceptance_plan.md` v1.1 y sus autoridades de soporte; no se usa un “balance global” legacy como autoridad.

## G14 — Cross-tenant adversarial pass

49. Repetir reads/writes relevantes con JWT Tenant A y IDs Tenant B.
50. Intentar body/query/slug/header forged.
51. Buscar sentinels Tenant B en HTML, JSON, exports, logs de navegador y caches.

**Esperado:** cero leakage y fail-closed.

## G15 — Incident / recovery

52. Simular backend 5xx/transient failure.
53. Simular pérdida de ruta Cloudflare/Railway según runbook.
54. Verificar error state, retry y no corrupción de writes.
55. Ejecutar rollback/fallback documentado.

**Esperado:** degradación segura; no se relaja auth/RLS/DGI para recuperar disponibilidad.

## G16 — Pilot sign-off

56. Ejecutar journeys equivalentes con Tenant B.
57. Revisar support log, telemetry, latency, freshness, auth y audit.
58. Cerrar hallazgos.

**Esperado:** P1 firmado, sin Critical abiertos y sin High de isolation/DGI/write-safety.

---

# 7. Pass criteria del Golden E2E

El Golden E2E pasa solo si:

- [ ] branded routing/TLS funciona o Worker fallback aprobado funciona;
- [ ] JWT continúa siendo autoridad tenant;
- [ ] auth expiry/refresh/logout/revocation funcionan;
- [ ] KPI sales reconcilian 100%;
- [ ] timezone aprobado se respeta en boundaries;
- [ ] freshness COMPLETE/STALE/PARTIAL/UNKNOWN se representa correctamente;
- [ ] inventory reconcilia;
- [ ] fiscal views/exports son read-only e inmutables;
- [ ] writes estratégicos entran al Audit Trail canónico y la integrity/hash-chain queda en PASS;
- [ ] role gates se aplican en backend;
- [ ] OM-25 confirma 100% de endpoints expuestos cubiertos por tenant + ACL + negative cross-tenant;
- [ ] POS sigue operando sin dashboard/WAN;
- [ ] config cloud converge posteriormente al POS;
- [ ] Promotions y BOM conservan semántica/versionado;
- [ ] user deactivation/revocation funciona, preserva historia y Root Lock protege al Owner principal;
- [ ] onboarding/import es tenant-safe, chunks `<=100`, UI responsive e idempotente;
- [ ] W10 Loyalty cumple `docs/loyalty/loyalty_acceptance_plan.md` v1.1 y sus contratos de soporte;
- [ ] no aparece ningún sentinel extranjero en response/UI/export/cache;
- [ ] incident recovery no reduce controles de seguridad;
- [ ] dos tenants terminan el journey;
- [ ] métricas OM-01..OM-25 están dentro de threshold.

**Cualquier fallo de aislamiento, DGI o autorización invalida el Golden E2E completo.**

---

# 8. Suite mínima de verificación — ODAV-01..ODAV-42

| ID | Escenario | Evidencia mínima |
|---|---|---|
| **ODAV-01** | tenant transaction bind-before-query | PostgreSQL real + `current_setting` receipt |
| **ODAV-02** | transaction commit/rollback/release | DB integration test |
| **ODAV-03** | no tenant value persiste en fresh connection | DB probe |
| **ODAV-04** | T1 no lee T2 dashboard relations | two-tenant route E2E |
| **ODAV-05** | missing tenant context fail-closed | negative DB/route test |
| **ODAV-06** | mismatched slug/JWT rechazado | auth/tenant integration |
| **ODAV-07** | forged forwarded-host rechazado | staging/security test |
| **ODAV-08** | legacy POS login sigue compatible | integration contract |
| **ODAV-09** | expired/revoked browser session no accede | browser E2E |
| **ODAV-10** | CSP/CORS/CSRF contract aplicado | headers + attack-negative test |
| **ODAV-11** | freshness COMPLETE | contract + UI test |
| **ODAV-12** | freshness STALE | seeded lag + UI test |
| **ODAV-13** | freshness PARTIAL | missing stream + UI test |
| **ODAV-14** | freshness UNKNOWN | unknown state + UI test |
| **ODAV-15** | KPI sales exactos | D0 fixture reconciliation |
| **ODAV-16** | timezone midnight boundary | fixture boundary test |
| **ODAV-17** | VOID/cancellation treatment KPI | fixture reconciliation |
| **ODAV-18** | inventory valuation/COGS reconciliation | inventory fixture |
| **ODAV-19** | Kardex tenant-scoped | DB + UI integration |
| **ODAV-20** | fiscal monthly/void/sequence read-only | regression + DB diff |
| **ODAV-21** | exports tenant/range exactos | row count + checksum/parsed totals |
| **ODAV-22** | catalog/product CRUD tenant-safe | browser + DB integration |
| **ODAV-23** | CASHIER strategic write denied backend-side | raw HTTP 403 test |
| **ODAV-24** | strategic write entra al Audit Trail canónico: before/after + append-only + hash-chain/integrity PASS | audit query + integrity verifier receipt |
| **ODAV-25** | POS offline mientras dashboard cambia config | integrated POS test |
| **ODAV-26** | POS sync-down posterior sin canal paralelo | sync contract test |
| **ODAV-27** | promotion schedule/overlap | CRUD/domain integration |
| **ODAV-28** | recipe publish/version history safe | versioning integration |
| **ODAV-29** | user CRUD OWNER-only | permission matrix E2E |
| **ODAV-30** | deactivated user cannot continue | auth revocation test |
| **ODAV-31** | fiscal setup no muta invoices históricas | DB regression |
| **ODAV-32** | import 1,500 filas: 20 inválidas, chunks `<=100`, UI responsive, 1,480 válidas | browser/backend integration + chunk telemetry |
| **ODAV-33** | repeated import token idempotent | replay test |
| **ODAV-34** | industry template blast radius 0 | two-tenant DB diff |
| **ODAV-35** | W10 Customer + Loyalty Owner journey | Loyalty acceptance link + E2E |
| **ODAV-36** | Loyalty adjustment role/audit | Loyalty + audit evidence |
| **ODAV-37** | mobile read-only contract | responsive browser test |
| **ODAV-38** | WCAG keyboard/zoom/accessibility | axe + manual keyboard receipt |
| **ODAV-39** | incident/fallback recovery | runbook drill receipt |
| **ODAV-40** | two-tenant pilot final adversarial pass | P1 signed evidence |
| **ODAV-41** | user lifecycle soft-delete + Root Lock del Owner principal | identity DB/auth/audit E2E |
| **ODAV-42** | 100% endpoints expuestos cubiertos por matriz Endpoint × Tenant × ACL | versioned endpoint matrix + negative test receipts |

---

# 9. Métricas operativas de aceptación — OM-01..OM-25

Los thresholds siguientes se dividen en dos clases:

- **SOURCE-BOUND:** derivados directamente de contratos ya existentes del roadmap/design.
- **PROVISIONAL BUDGET — FREEZE AT W2 RECALIBRATION:** thresholds cuantitativos iniciales introducidos por este Acceptance Plan. Se miden durante W1/W2 y quedan congelados, ajustados o rechazados mediante decision record al cierre de la recalibración W2. Después de ese freeze, cualquier cambio requiere versión y justificación explícita.

| ID | Métrica | Threshold | Clase |
|---|---|---:|---|
| **OM-01** | Cross-tenant leaked rows/objects/exports | **0** | SOURCE-BOUND |
| **OM-02** | Foreign tenant sentinel **data returned, rendered, exported or persisted client-side** | **0**; excluye el valor foreignId introducido deliberadamente como test input | SOURCE-BOUND |
| **OM-03** | Unauthorized strategic writes accepted | **0** | SOURCE-BOUND |
| **OM-04** | Strategic writes con audit evidence | **100%** | SOURCE-BOUND |
| **OM-05** | KPI fixture reconciliation | **100%** a precisión fuente | SOURCE-BOUND |
| **OM-06** | Diferencia visual monetaria por formatting | **<= C$0.01** por valor mostrado | PROVISIONAL BUDGET — FREEZE AT W2 RECALIBRATION |
| **OM-07** | KPI surfaces con freshness aplicable visible | **100%** | SOURCE-BOUND |
| **OM-08** | STALE/PARTIAL/UNKNOWN mostrado como COMPLETE | **0 casos** | SOURCE-BOUND |
| **OM-09** | Auto-refresh dashboard | **5 min**; pausado con forms/modals abiertos | SOURCE-BOUND |
| **OM-10** | Accessibility automated serious/critical violations | **0** | PROVISIONAL BUDGET — FREEZE AT W2 RECALIBRATION |
| **OM-11** | Keyboard-only critical journeys | **100% pass** | SOURCE-BOUND |
| **OM-12** | Layout funcional a 200% zoom | **100% critical views** | SOURCE-BOUND |
| **OM-13** | LCP authenticated landing, p75 | **<= 2.5 s** | PROVISIONAL BUDGET — FREEZE AT W2 RECALIBRATION |
| **OM-14** | INP, p75 | **<= 200 ms** | PROVISIONAL BUDGET — FREEZE AT W2 RECALIBRATION |
| **OM-15** | CLS, p75 | **<= 0.10** | PROVISIONAL BUDGET — FREEZE AT W2 RECALIBRATION |
| **OM-16** | API auth/session p95 en staging dataset | **<= 750 ms** | PROVISIONAL BUDGET — FREEZE AT W2 RECALIBRATION |
| **OM-17** | CRUD standard API p95 | **<= 750 ms** | PROVISIONAL BUDGET — FREEZE AT W2 RECALIBRATION |
| **OM-18** | Report/dashboard API p95 | **<= 1.5 s** | PROVISIONAL BUDGET — FREEZE AT W2 RECALIBRATION |
| **OM-19** | 5xx rate en soak controlado, excluyendo fault injection | **< 0.5%** | PROVISIONAL BUDGET — FREEZE AT W2 RECALIBRATION |
| **OM-20** | Security/DGI invariant failures en soak | **0** | SOURCE-BOUND |
| **OM-21** | Import 1,500 filas completa sin OOM/crash | **100%** | SOURCE-BOUND |
| **OM-22** | Duplicate/replay import creates duplicates | **0** | SOURCE-BOUND |
| **OM-23** | Pilot tenants con full journey + sign-off | **2/2** | SOURCE-BOUND |
| **OM-24** | Open Critical findings al GA gate | **0** | SOURCE-BOUND |
| **OM-25** | Endpoints expuestos al Owner Dashboard con cobertura tenant + ACL + negative cross-tenant | **100%** | SOURCE-BOUND |

## 9.1 Performance Measurement Contract

Los budgets OM-06/10/13..19 son provisionales hasta la recalibración W2. El freeze de W2 debe versionar un contrato de medición que fije, como mínimo:

- browser y versión;
- clase de dispositivo / perfil CPU y memoria;
- condición de red y región;
- dataset y fixture versionado;
- build production y staging deploy real;
- cold/warm cache policy;
- concurrencia y duración de soak;
- cantidad de observaciones;
- exclusiones explícitas de fault injection;
- método de separación backend/network/rendering.

Para evitar números de laboratorio irrelevantes:

- medir build production;
- usar staging deploy real;
- ejecutar con dataset de §5.3;
- registrar **>=100 observaciones por endpoint/journey interactivo crítico** o una ventana de carga estable que produzca una población equivalente;
- reportar p50/p75/p95, no solo promedio;
- no mezclar tiempos de export masivo con endpoints interactivos;
- separar latencia de backend, network y rendering cuando exista degradación.

**Regla de freeze:** al cerrar W2, los thresholds quedan `FROZEN`. Un cambio posterior no puede hacerse para “hacer pasar” el RC; requiere decision record, causa medida y repetición de la evidencia afectada.

## 9.2 Métrica de exactitud

Para dinero/cantidades:

```text
source decimal -> cálculo backend -> DTO -> UI formatter
```

La comparación se hace antes del formatting visual. El UI no puede redondear operands y luego recalcular KPIs.

---

# 10. Acceptance suites por dominio

## 10.1 Product semantics / D0

D0 se divide para eliminar ambigüedad de secuencia:

### D0-A — Security / ACL readiness — prerequisito de S1

- [ ] access matrix + write ACL aprobada.
- [ ] endpoint-by-role expectations definidas.
- [ ] DGI read-only/write boundary documentado.
- [ ] autoridad tenant y trust boundaries documentadas.

### D0-B — KPI / Finance / Timezone semantics — prerequisito de publicación W2

- [ ] KPI dictionary aprobado.
- [ ] nombres, fórmulas, inclusiones/exclusiones y tratamiento de VOID aprobados.
- [ ] reporting timezone aprobado.
- [ ] ejemplos fixture reconcilian.
- [ ] no aparece “net profit/P&L” sin contrato.

**D0 = CLOSED** únicamente cuando D0-A + D0-B están aprobados. S1 puede iniciar con D0-A cerrado; W2 no puede publicarse sin D0-B.

## 10.2 Tenant isolation / S1-S2-T1

- [ ] transaction primitive bind-before-query.
- [ ] RLS real en mismo transaction scope.
- [ ] predicates explícitos preservados.
- [ ] app DB role no bypass RLS.
- [ ] context mismatch fail-closed.
- [ ] host/slug no es autorización.
- [ ] forged forwarded headers rechazados.
- [ ] two-tenant sentinels = 0 leaks.

## 10.3 Freshness / F1

- [ ] COMPLETE definido.
- [ ] STALE definido.
- [ ] PARTIAL definido.
- [ ] UNKNOWN definido.
- [ ] incomplete streams identificables.
- [ ] last complete sync visible donde aplica.
- [ ] copy aprobado por Product.
- [ ] auto-refresh 5 min y no interrumpe forms/modals.

## 10.4 Browser foundation / W1

- [ ] login/logout.
- [ ] refresh/revocation.
- [ ] protected routes.
- [ ] tenant context.
- [ ] branded shell.
- [ ] CSP/CORS/CSRF posture aprobada.
- [ ] no token logging.
- [ ] accessibility baseline.
- [ ] lazy route loading.

## 10.5 Sales / W2

- [ ] dashboard summary.
- [ ] hourly sales.
- [ ] top products.
- [ ] cashier performance.
- [ ] timezone.
- [ ] freshness.
- [ ] exact fixture reconciliation.
- [ ] tenant isolation receipt.

## 10.6 Inventory / W3

- [ ] valuation.
- [ ] COGS/gross margin terminology approved.
- [ ] Kardex.
- [ ] alerts.
- [ ] stale-state behavior.
- [ ] role checks.
- [ ] no P&L overclaim.

## 10.7 Fiscal / Audit views / W4

- [ ] monthly summary.
- [ ] voided invoices.
- [ ] sequence audit.
- [ ] sales book export.
- [ ] Z export.
- [ ] no invoice mutation.
- [ ] DGI regression suite.

## 10.8 Catalog / Products / W5

- [ ] catalogs/categories CRUD.
- [ ] SIMPLE.
- [ ] COMPOUND.
- [ ] VARIANT_PARENT/variants.
- [ ] pricing.
- [ ] deactivate instead of destructive history break where applicable.
- [ ] audit trail.
- [ ] role gates.
- [ ] POS sync-down.
- [ ] concurrent web + POS sync scenario probado.

## 10.9 Promotions / W6

- [ ] CRUD.
- [ ] day/time/date schedule.
- [ ] activate/deactivate.
- [ ] overlap/conflict behavior.
- [ ] role gates.
- [ ] audit.
- [ ] POS sync-down.

## 10.10 Recipes / BOM / W7

- [ ] ingredient associations.
- [ ] quantities/units.
- [ ] publish/versioning.
- [ ] historical semantics preserved.
- [ ] CPP/cost trigger/read behavior verificado.
- [ ] role gates.
- [ ] audit.

## 10.11 Users / Permissions / W8

- [ ] create/edit/deactivate.
- [ ] roles OWNER/MANAGER/CASHIER/WAITER.
- [ ] granular permissions.
- [ ] OWNER-only guard donde aplica.
- [ ] PIN hash behavior.
- [ ] deactivation terminates effective access.
- [ ] lifecycle usa soft-delete y preserva historia/FKs.
- [ ] Root Lock impide eliminar/desactivar/degradar al Owner principal hasta lockout.
- [ ] audit.

## 10.12 Fiscal setup / Onboarding / W9

- [x] DGI resolution/tax/fiscal series config permitida.
- [x] no historical invoice rewrite.
- [x] industry templates tenant-safe.
- [x] import staging.
- [x] chunking/large-file behavior.
- [x] 1,500-row scenario con 20 inválidas y expected 1,480/20.
- [x] chunk size máximo `<=100`.
- [x] UI responsive durante import.
- [x] replay idempotency.
- [x] blast radius other tenants = 0.

## 10.13 Customers + Loyalty V1 / W10

W10 queda aceptado solo cuando **toda** la superficie Owner de Loyalty V1 requerida por su contrato está presente:

- [ ] Customer CRUD tenant-safe.
- [ ] customer profile/history.
- [ ] Program management de Loyalty V1.
- [ ] Reward management de Loyalty V1.
- [ ] progress por programa.
- [ ] ledger/history explicativo.
- [ ] Adjustment autorizado con razón.
- [ ] profit-aware read model/metrics exigidos por Loyalty V1.
- [ ] role gates + audit.
- [ ] configuración Loyalty cloud -> POS converge por sync canónico.
- [ ] no balance legacy paralelo como autoridad.
- [ ] evidencia referencia `docs/loyalty/loyalty_acceptance_plan.md` v1.1 y, cuando aplique, `prd_loyalty_v1.md`, `loyalty_architecture_spec.md`, `loyalty_execution_roadmap.md` y `loyalty_gap_audit.md` del mismo directorio.

## 10.14 Routing / I1

- [ ] wildcard domain o Worker fallback probado.
- [ ] TLS.
- [ ] original host trust contract.
- [ ] forged host negative test.
- [ ] rollback DNS/routing documentado y ensayado.

## 10.15 Operations / O1

- [ ] structured privacy-safe logs.
- [ ] auth/403/5xx/freshness dashboards.
- [ ] RLS/bind failure counters.
- [ ] rate limits.
- [ ] synthetic tenant checks.
- [ ] foreign sentinel canary.
- [ ] runbooks.
- [ ] alert thresholds.
- [ ] incident drill.
- [ ] staging soak.

## 10.16 Pilot / P1

- [ ] 2 tenants.
- [ ] sales journey.
- [ ] inventory journey.
- [ ] fiscal journey.
- [ ] configuration writes.
- [ ] Loyalty V1 full Owner journey obligatorio.
- [ ] cross-tenant negative tests.
- [ ] support log.
- [ ] KPI reconciliation.
- [ ] no Critical abiertos.

---

# 11. UX / responsive / accessibility acceptance

Basado en `DESIGN_BACKOFFICE.md`:

## Desktop >=1024px

- sidebar + content;
- 12-column grid;
- CRUD completo habilitado según roles;
- keyboard navigation completa.

## Tablet 768–1023px

- sidebar colapsado por defecto;
- 8-column grid;
- CRUD soportado.

## Mobile <768px

- drawer overlay;
- lectura básica;
- tablas con scroll cuando sea necesario;
- operaciones de escritura no se consideran objetivo V1.

## Accesibilidad

- [ ] WCAG 2.1 AA mínimo.
- [ ] 0 serious/critical automated violations en journeys críticos.
- [ ] focus visible en todo interactive element.
- [ ] tab order lógico.
- [ ] Escape cierra modals/dropdowns.
- [ ] Arrow keys funcionan donde el pattern lo requiere.
- [ ] `aria-label`/`aria-describedby`/`aria-current` correctos.
- [ ] color nunca es única señal.
- [ ] `prefers-reduced-motion` respetado.
- [ ] 200% zoom no pierde función crítica.
- [ ] datos numéricos usan tabular figures conforme al design system.

---

# 12. Security acceptance

Antes de GO:

1. PostgreSQL real con dos tenants.
2. RLS role inspection.
3. JWT vs slug mismatch.
4. forged forwarded-host.
5. forged tenant IDs en body/query/header.
6. CASHIER/WAITER direct API write attempts.
7. inactive user/session replay.
8. revoked token/session replay.
9. public login/slug enumeration resistance conforme al contract.
10. export endpoints tenant-safe.
11. cache/query-key isolation por tenant.
12. logs sin token/password/PIN/raw sensitive payloads.

## 12.1 Matriz Endpoint × Tenant × ACL

Antes del RC debe existir `EV-SECURITY-ENDPOINT-MATRIX` con **una fila por cada endpoint realmente expuesto o consumido por `apps/owner_dashboard/`**. La matriz mínima contiene:

| Campo | Obligatorio |
|---|---|
| HTTP method + path | sí |
| capability / pantalla consumidora | sí |
| read / write | sí |
| permiso requerido | sí |
| roles/default policy permitidos | sí |
| tenant predicate explícito | sí |
| tabla/policy RLS aplicable | sí cuando corresponda |
| negative cross-tenant test | sí |
| audit required | sí/no justificado |
| freshness required | sí/no justificado |
| test/evidence ID | sí |
| status | PASS/FAIL |

**Gate:** ODAV-42 y OM-25 exigen cobertura **100%**. Un endpoint olvidado equivale a cobertura incompleta aunque todos los endpoints probados individualmente hayan pasado.

**Blocker:** una fuga de un único ID, nombre, total o sentinel cross-tenant es Critical.

---

# 13. Audit acceptance

Para cada write estratégico seleccionado del Golden E2E debe poder reconstruirse:

```text
actor
  -> request / action
  -> tenant
  -> entity
  -> before
  -> after
  -> timestamp
  -> result
```

El write originado desde el Owner Dashboard debe entrar al **Audit Trail canónico** del sistema. No se acepta un log paralelo o únicamente observacional. La evidencia de ODAV-24 debe demostrar:

- append-only: no UPDATE/DELETE de la historia auditada;
- actor/tenant/entity correctos;
- before/after o metadata equivalente sanitizada;
- hash encadenado conforme al mecanismo vigente;
- integrity verifier/hash-chain en `PASS` después del write;
- payload sin secretos, PINs, tokens ni datos financieros prohibidos.

No es necesario ejecutar una auditoría forense completa por cada CRUD, pero sí demostrar que **todas las familias de write del backoffice usan el mismo mecanismo canónico** y que OM-04 = 100% de los writes estratégicos del acceptance fixture tienen evidencia.

---

# 14. Freshness acceptance

El dashboard no puede prometer “tiempo real” por defecto.

Cada read surface dependiente de POS/cloud convergence debe poder expresar:

```text
COMPLETE
STALE
PARTIAL
UNKNOWN
```

La threshold temporal exacta para STALE pertenece al contrato F1. Este Acceptance Plan **no inventa esa ventana**.

Reglas:

- `UNKNOWN` no se representa como cero;
- `PARTIAL` debe indicar que faltan streams;
- `STALE` debe indicar que el snapshot no es reciente según F1;
- `COMPLETE` solo cuando los streams requeridos cumplen el contrato;
- una caída de sync puede degradar data pero no bloquear POS.

---

# 15. Performance / load acceptance

## 15.1 Browser

Pass si OM-13..OM-15 cumplen en build production, dataset §5.3 y Performance Measurement Contract congelado en W2.

## 15.2 API

Pass si OM-16..OM-19 cumplen durante staging soak bajo el Performance Measurement Contract congelado en W2.

## 15.3 Bulk import

El escenario de 1,500 filas debe:

- completar sin crash/OOM;
- procesar chunks de máximo 100 registros;
- producir el expected fixture de 1,480 válidas / 20 inválidas;
- permitir continuar según contrato de staging;
- reintentar el mismo token sin duplicar;
- mantener UI responsive.

## 15.4 No performance-by-disabling-security

No se acepta mejorar p95 desactivando:

- RLS;
- explicit predicates;
- audit;
- auth checks;
- CSP/CSRF protections;
- freshness metadata.

---

# 16. Fault injection suite

Antes del sign-off forzar como mínimo:

1. missing tenant bind;
2. DB transaction error antes del query;
3. DB error durante read;
4. DB error durante strategic write;
5. wrong slug + valid JWT;
6. forged host/forwarded-host;
7. expired access token;
8. revoked session;
9. backend 401/403/429/500;
10. Cloudflare route failure;
11. Railway transient unavailable;
12. sales stream stale;
13. inventory stream partial;
14. freshness unknown;
15. duplicate import token;
16. concurrent web catalog write + POS sync;
17. attempt strategic write by CASHIER;
18. attempt user management by MANAGER if contract says OWNER-only;
19. export request with foreign IDs;
20. cache switch from Tenant A to Tenant B context;
21. POS offline during web config write;
22. POS reconnect with backlog;
23. Loyalty Owner adjustment concurrent with POS offline activity, según Loyalty contract;
24. recovery/rollback after bad frontend release.

---

# 17. Rollback / recovery acceptance

El rollback no puede existir solo en un README.

Antes de GA se ensaya:

1. deshabilitar una ruta/dashboard afectado sin relajar RLS;
2. revertir frontend release en Cloudflare;
3. activar Worker/non-wildcard fallback si routing falla;
4. revocar sesiones si existe incidente de auth;
5. revertir una write UI defectuosa sin borrar historia válida;
6. ocultar/mark-unavailable un KPI si freshness/semantics no son confiables;
7. recuperar desde incidente sin modificar facturas históricas;
8. verificar que POS siguió operando durante la indisponibilidad del Owner Portal.

## Prohibiciones

Un rollback nunca puede:

- desactivar RLS para “restaurar servicio”;
- confiar temporalmente en slug/host como autorización;
- eliminar audit evidence;
- modificar/renumerar facturas;
- presentar data stale como current;
- borrar writes válidos de configuración sin procedimiento explícito;
- hacer que POS espere al dashboard.

---

# 18. Definition of Done final

## Product Semantics ✅

- [ ] D0-A + D0-B approved.
- [ ] KPI dictionary versionado.
- [ ] timezone versionado.
- [ ] ACL matrix versionada.
- [ ] DGI boundaries explícitas.

## Tenant Isolation ✅

- [ ] S1/S2/T1 Operationally Proven.
- [ ] PostgreSQL real.
- [ ] explicit predicates + RLS.
- [ ] forged contexts fail-closed.
- [ ] zero sentinel leaks.

## Browser Auth ✅

- [ ] login/refresh/logout/revocation.
- [ ] session storage contract.
- [ ] CSP/CORS/CSRF.
- [ ] no secret logging.

## Freshness ✅

- [ ] F1 complete/stale/partial/unknown.
- [ ] last complete sync surfaced.
- [ ] stale data nunca masquerades as current.

## Sales ✅

- [ ] W2 all views.
- [ ] 100% fixture reconciliation.
- [ ] tenant + freshness + timezone.

## Inventory ✅

- [ ] W3 valuation/COGS/Kardex/alerts.
- [ ] finance terminology approved.
- [ ] reconciled fixtures.

## Fiscal / Audit Read ✅

- [ ] W4 summary/void/sequence/exports.
- [ ] no fiscal mutation.
- [ ] DGI regression pass.

## Catalog / Products ✅

- [ ] W5 complete.
- [ ] role gates.
- [ ] audit.
- [ ] POS sync-down.
- [ ] concurrency test.

## Promotions ✅

- [ ] W6 complete.
- [ ] schedule/conflicts.
- [ ] audit + sync.

## Recipes / BOM ✅

- [ ] W7 complete.
- [ ] versioning.
- [ ] historical safety.
- [ ] cost behavior verified.

## Users / Permissions ✅

- [ ] W8 complete.
- [ ] OWNER-only enforcement.
- [ ] deactivation/revocation.
- [ ] soft-delete/history preservation.
- [ ] Root Lock Owner principal.
- [ ] audit.

## Fiscal Setup / Onboarding ✅

- [x] W9 complete.
- [x] tenant-safe imports/templates.
- [x] 1,500-row scenario 1,480/20 con chunks <=100.
- [x] idempotency.

## Customers / Loyalty ✅

- [ ] W10 Customer capabilities.
- [ ] Loyalty V1 Owner surface completa conforme a `docs/loyalty/loyalty_acceptance_plan.md` v1.1.
- [ ] authorized adjustment.
- [ ] history/progress/audit.

## POS Boundary ✅

- [ ] POS opera sin Owner Portal/WAN.
- [ ] config converge luego.
- [ ] no parallel sync.

## Routing / Infra ✅

- [ ] I1 routing/TLS.
- [ ] fallback probado.
- [ ] trust boundary correcto.

## UX / Accessibility ✅

- [ ] DESIGN_BACKOFFICE aplicado.
- [ ] WCAG 2.1 AA.
- [ ] keyboard.
- [ ] 200% zoom.
- [ ] responsive contract.

## Performance ✅

- [ ] Performance Measurement Contract congelado en W2.
- [ ] OM performance budgets pass.
- [ ] dataset no trivial.
- [ ] no security bypass.

## Observability / Operations ✅

- [ ] O1 telemetry.
- [ ] synthetic checks.
- [ ] alerts.
- [ ] runbooks.
- [ ] soak.
- [ ] incident drill.

## Pilot ✅

- [ ] 2/2 tenants.
- [ ] full journeys.
- [ ] KPI reconciliation.
- [ ] support log.
- [ ] zero Critical.
- [ ] sign-offs completos.

---

# 19. Release blockers

Owner Dashboard queda **NO-GO** si existe cualquiera de estos estados:

- [ ] D0-A o D0-B requerido no aprobado;
- [ ] algún milestone requerido sin evidencia;
- [ ] algún ODAV obligatorio en FAIL;
- [ ] Golden E2E en FAIL;
- [ ] cross-tenant leak >0;
- [ ] DB role bypass RLS;
- [ ] host/slug puede sobreescribir JWT tenant;
- [ ] browser session contract inseguro/no probado;
- [ ] KPI no reconcilia con fixture;
- [ ] timezone no aprobado o boundary incorrecto;
- [ ] freshness ausente en superficie que la requiere;
- [ ] stale/partial/unknown mostrado como current;
- [ ] dashboard modifica factura fiscal o secuencia;
- [ ] strategic write sin audit;
- [ ] CASHIER/WAITER puede ejecutar strategic write no autorizado;
- [ ] user-management role gate incorrecto;
- [ ] usuario histórico eliminado físicamente;
- [ ] Root Lock del Owner principal violado;
- [ ] OM-25 endpoint tenant/ACL coverage <100%;
- [ ] POS deja de vender cuando dashboard/cloud falla;
- [ ] sync de configuración crea canal paralelo o mezcla tenants;
- [ ] import duplicate produce registros duplicados;
- [ ] W10 Loyalty contradice `docs/loyalty/loyalty_acceptance_plan.md` v1.1 o sus autoridades de soporte;
- [ ] accessibility serious/critical violations >0 en journeys críticos;
- [ ] OM-20 security/DGI invariant failures >0;
- [ ] recovery no ensayado;
- [ ] P1 two-tenant pilot no completado;
- [ ] Critical open findings >0;
- [ ] High open finding de isolation/DGI/write-safety >0.

---

# 20. Traceability roadmap -> acceptance

| Roadmap | Acceptance principal |
|---|---|
| D0-A | §10.1 Security/ACL + ODAV-42 + OM-25 |
| D0-B | §10.1 KPI/Finance/Timezone + OM-05/06 |
| S1 | ODAV-01..03 |
| S2 | ODAV-04..05 + OM-01/02 |
| T1 | ODAV-06..08 |
| F1 | ODAV-11..14 + §14 |
| W1 | ODAV-09..10 + §11/12 |
| W2 | ODAV-15..17 |
| W3 | ODAV-18..19 |
| W4 | ODAV-20..21 |
| W5 | ODAV-22..26 |
| W6 | ODAV-27 |
| W7 | ODAV-28 |
| W8 | ODAV-29..30 + ODAV-41 |
| W9 | ODAV-31..34 |
| W10 | ODAV-35..36 + `docs/loyalty/loyalty_acceptance_plan.md` v1.1 |
| I1 | ODAV-07 + routing evidence |
| O1 | ODAV-39 + OM-19/20 |
| P1 | ODAV-40 + OM-23/24 |
| Security endpoint coverage | ODAV-42 + OM-25 |
| GA | §18 + §19 + Acceptance Record |

---

# 21. Evidence index mínimo

Cada release candidate debe adjuntar un índice como:

```text
EV-D0A-SECURITY-ACL
EV-D0B-KPI-SEMANTICS
EV-S1-TENANT-TX
EV-S2-RLS-TWO-TENANT
EV-T1-SLUG-CONTEXT
EV-F1-FRESHNESS
EV-W1-BROWSER-AUTH
EV-W2-SALES-RECONCILIATION
EV-W3-INVENTORY-RECONCILIATION
EV-W4-DGI-READONLY
EV-W5-CATALOG-POS-SYNC
EV-W6-PROMOTIONS
EV-W7-RECIPES
EV-W8-RBAC-ROOT-LOCK
EV-W9-ONBOARDING
EV-W10-CUSTOMER-LOYALTY
EV-I1-ROUTING-TLS
EV-O1-SOAK-OBSERVABILITY
EV-SECURITY-ADVERSARIAL
EV-SECURITY-ENDPOINT-MATRIX
EV-RECOVERY-DRILL
EV-P1-TWO-TENANT
EV-GOLDEN-OWNER-E2E
```

Cada receipt registra:

- commit/tag;
- ambiente;
- fecha/hora UTC;
- test command;
- result;
- dataset/fixture version;
- screenshots/logs/metrics cuando apliquen;
- owner/reviewer;
- si reemplaza evidencia previa, referencia al receipt superseded.

---

# 22. Acceptance record

## 22.1 SOHO Contractual Owner Portal — Gate A

Cuando se evalúe el go-live contractual de SOHO, registrar separadamente:

```text
Gate:                       SOHO Contractual Owner Portal
Fecha:                      __________________________
Git commit/tag:             __________________________
Portal host:                __________________________
SOHO users verified:        __________________________
Tenant isolation evidence:  __________________________
Read/report evidence:       __________________________
Freshness evidence:         __________________________
Routing/TLS evidence:       __________________________
POS independence evidence:  __________________________
Critical contractual gaps:  ______
Accepted pending items:     __________________________
SOHO acceptance:            PASS / FAIL / PENDING
NHILOS acceptance:          PASS / FAIL / PENDING
Go-live contractual:        ACCEPTED / DEFERRED
```

**Regla:** este registro no sustituye ni prejuzga el Gate B de GA. Solo certifica el alcance contractual del portal Owner para SOHO.

## 22.2 Owner Dashboard GA — Gate B

Al finalizar GA, registrar:

```text
Release candidate:          Owner Dashboard GA Gate
Git commit/tag:             __________________________
Fecha UTC:                  __________________________
Frontend build:             apps/owner_dashboard React/Vite
Backend build:              apps/admin_backend NestJS
Deployment:                 Cloudflare Pages / Worker fallback
Backend host:               Railway staging/production-like
PostgreSQL migration set:   __________________________
D0-A security/ACL record:  __________________________
D0-B KPI semantics record: __________________________
F1 freshness contract:      __________________________
Tenant fixture A:           SOHO
Tenant fixture B:           tenant-b-sentinel
Golden E2E evidence ID:     __________________________
RLS/security evidence ID:   __________________________
KPI reconciliation ID:      __________________________
Accessibility evidence ID:  __________________________
Performance evidence ID:    __________________________
Routing/TLS evidence ID:    __________________________
Recovery evidence ID:       __________________________
Pilot evidence ID:          __________________________
Loyalty acceptance ID:      __________________________
Endpoint matrix evidence:   __________________________
Performance contract ID:    __________________________

Product acceptance:         PASS / FAIL
Finance semantics:          PASS / FAIL
Security/isolation:         PASS / FAIL
Engineering / Backend:      PASS / FAIL
Infrastructure / Routing:   PASS / FAIL
DGI Compliance:             PASS / FAIL
Accessibility:              PASS / FAIL
Performance:                PASS / FAIL
Operations:                 PASS / FAIL
Two-tenant pilot:           PASS / FAIL

OM-01 Cross-tenant leaks:   0 / ______
OM-05 KPI reconciliation:   ______ %
OM-13 LCP p75:              ______ s
OM-14 INP p75:              ______ ms
OM-15 CLS p75:              ______
OM-18 Report API p95:       ______ ms
OM-19 5xx soak rate:        ______ %
OM-23 Pilot tenants:        ______ / 2
OM-25 Endpoint coverage:    ______ %

Final decision:             GO / NO-GO
Open Critical findings:     ______
Open High findings:         ______
Approved exceptions:        __________________________
```

**Regla:** `Approved exceptions` no puede cubrir tenant isolation, DGI invariants, authorization boundaries, audit destruction o falsificación de freshness.

---

# 23. Criterio final de completitud

NHILOS Owner Dashboard está **terminado** cuando puede demostrarse, sin ambigüedad, que:

```text
Owner entra por su tenant host
  -> servidor resuelve contexto
  -> JWT gobierna autorización
  -> PostgreSQL RLS + filters aíslan datos
  -> freshness explica cuánto confiar en el cloud mirror
  -> KPIs reconcilian con transacciones aprobadas
  -> Sales / Inventory / Fiscal son auditables
  -> Owner/Manager ejecuta configuración estratégica autorizada
  -> cada write entra al Audit Trail canónico y conserva integridad
  -> POS continúa operando offline
  -> config converge al POS después
  -> Users/RBAC restringen correctamente y Root Lock evita lockout del Owner
  -> Onboarding/import usa chunks <=100, es idempotente y no cruza tenants
  -> Loyalty V1 se administra según `docs/loyalty/` y su acceptance contract v1.1
  -> routing/TLS funcionan
  -> incidentes degradan de forma segura
  -> performance/accessibility cumplen presupuesto
  -> dos tenants completan el piloto
  -> no quedan blockers críticos
```

y toda esa cadena está respaldada por evidencia **Verified + Operationally Proven**, no por intención, screenshots aislados o suites mocked.

---

# 24. Fuentes autoritativas

1. `owner_dashboard_execution_roadmap.md`
2. `DESIGN_BACKOFFICE.md`
3. `Product_Requirement_Document.md`
4. `Product_Requirement_Document_v2.md`
5. `prd_modulo_ventas.md`
6. `prd_gestion_inventario.md`
7. `prd_onboarding.md`
8. `prd_audit_trail.md`
9. `master_execution_roadmap.md`
10. `docs/loyalty/loyalty_acceptance_plan.md` — v1.1 / release gate Loyalty V1.
11. `docs/loyalty/prd_loyalty_v1.md` — autoridad de producto Loyalty V1.
12. `docs/loyalty/loyalty_architecture_spec.md` — autoridad de arquitectura Loyalty V1.
13. `docs/loyalty/loyalty_execution_roadmap.md` — gates de implementación Loyalty V1.
14. `docs/loyalty/loyalty_gap_audit.md` — baseline/evidencia del dominio existente.
15. `OE-001OM-propuesta-SOHO.pdf` — alcance contractual fundador y criterio de portal Owner/go-live de SOHO.
16. Specs/decision records D0/F1/RBAC/RLS aprobados durante la ejecución.

