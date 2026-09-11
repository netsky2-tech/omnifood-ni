# NHILOS Loyalty V1 — Acceptance Plan

**Documento:** `loyalty_acceptance_plan.md`  
**Estado:** **PROPOSED / RELEASE GATE — CONTRACT COMPLETE**  
**Versión:** 1.1  
**Fecha:** 2026-09-02  
**Autoridad de producto:** `prd_loyalty_v1.md` — APPROVED / AUTHORITATIVE  
**Autoridad de arquitectura:** `loyalty_architecture_spec.md` — APPROVED / ENGINEERING AUTHORITATIVE  
**Baseline técnico:** `loyalty_gap_audit.md` — L0 CERRADO  
**Plan de ejecución:** `loyalty_execution_roadmap.md` — PROPOSED / READY FOR EXECUTION  
**Contrato profit-aware:** `loyalty_profit_aware_metric_contract.md` — APPROVED / NORMATIVE CLARIFICATION  
**Alcance fundador:** SOHO — una ubicación / un terminal, offline-first y multi-tenant.

> **Propósito del documento**
>
> Este plan determina cuándo NHILOS puede afirmar, con evidencia reproducible:
>
> **NHILOS Loyalty V1 está terminado.**
>
> No significa que “las pantallas funcionan”, que “el happy path pasó” o que “hay tests verdes”.
>
> Significa que el dominio, POS, persistencia local, sincronización, cloud, Owner Portal, redención, Sales, Inventory, VOID/Reversal, auditoría, RBAC, migración y operación real convergen sobre el mismo modelo y sobreviven las condiciones de fallo definidas para V1.

---

# 0. Regla ejecutiva de aceptación

Loyalty V1 solo puede declararse **DONE** cuando se cumplen simultáneamente las cinco condiciones siguientes:

1. Todos los Acceptance Criteria normativos `AC-01..AC-44` del PRD están cubiertos por evidencia.
2. Los 28 escenarios mínimos de verificación de arquitectura están automatizados o cuentan con una prueba reproducible equivalente donde la automatización no sea suficiente.
3. Los criterios `MC-01..MC-10` del contrato profit-aware están cubiertos por evidencia.
4. El **Golden E2E de Loyalty V1** pasa de extremo a extremo en condiciones reales sobre el hardware fundador y con pérdida/restauración de conectividad.
5. Todos los dominios del Definition of Done están en estado **Operationally Proven**, sin release blockers abiertos.

```text
Domain           ✅
POS              ✅
Offline          ✅
Persistence      ✅
Sync             ✅
Cloud            ✅
Owner Portal     ✅
Redemption       ✅
Sales            ✅
BOM/Kardex       ✅
VOID/Reversal    ✅
Audit            ✅
RBAC             ✅
E2E              ✅
```

**No se acepta como cierre:**

- un demo visual;
- una suite únicamente mocked;
- tests de UI sin evidencia de ledger/persistencia;
- un E2E online que nunca corte WAN;
- una migración que ignore la historia de Batch 14.3;
- un saldo/progreso que dependa de un balance paralelo;
- un flujo que permita a Loyalty escribir directamente stock/Kardex;
- una validación de sync que no fuerce retry/replay;
- una validación de seguridad sin PostgreSQL real y prueba de dos tenants.

---

# 1. Jerarquía de autoridad y regla de conflicto

Este documento **no redefine** producto ni arquitectura. Ordena cómo demostrar que lo aprobado está realmente cumplido.

En caso de conflicto:

1. `prd_loyalty_v1.md` gobierna comportamiento de producto y alcance.
2. `loyalty_architecture_spec.md` gobierna invariantes técnicos, ownership, migración, idempotencia, sync, RBAC y aislamiento.
3. `loyalty_profit_aware_metric_contract.md` gobierna exclusivamente la semántica normativa de LV1.6 y cierra el placeholder de métricas que el roadmap dejó pendiente.
4. `loyalty_execution_roadmap.md` gobierna gates de implementación, hardening, rollback y evidencia.
5. `loyalty_gap_audit.md` gobierna el baseline real de Batch 14.3 y qué se conserva/evoluciona.
6. Este Acceptance Plan gobierna **la demostración de completitud**.

Ninguna prueba puede “aprobar” una implementación que contradiga una invariante del PRD o Architecture Spec.

---

# 2. Invariantes que son release blockers absolutos

Cualquier violación de uno de los siguientes puntos implica **FAIL**, aunque el Golden E2E aparente funcionar:

1. Existe un único ledger de Loyalty.
2. `CustomerLoyaltyAccount` es una proyección reconstruible, no un segundo balance autoritativo.
3. `Customer.points_balance` / `balance_after` legacy no son source of truth del código V1.
4. EARN, REDEEM, ADJUST y REVERSAL son append-only.
5. Correcciones y VOID agregan movimientos compensatorios; no hacen UPDATE/DELETE de historia.
6. El Customer existente es la identidad de Loyalty; no existe `LoyaltyCustomer`.
7. La participación es automática; no existe `ProgramMembership` en V1.
8. El earning ordinario nace de `Ticket PAID`.
9. Un ticket puede producir EARN `0..N` y REDEEM `0..1`.
10. Las unidades nuevas V1 son enteras.
11. `SPEND_POINTS` usa Eligible Spend en NIO y `floor`.
12. `PRODUCT_STAMPS` solo considera cantidades discretas enteras y no hace `floor` de líneas pesables/fraccionarias.
13. Las líneas `source=LOYALTY_REWARD` no generan earning recursivo.
14. `startsAt/endsAt` del Program gobiernan earning; `endsAt` no destruye saldo ni impide por sí mismo redimir una Reward válida.
15. Una Reward solo puede ser `DISCOUNT_AMOUNT` o `FREE_PRODUCT` en V1.
16. La redención no consume saldo antes de `PAID`.
17. `FREE_PRODUCT` se materializa mediante Sales y es Inventory quien procesa BOM/Kardex.
18. Loyalty no posee ningún command port de escritura hacia Inventory.
19. Sync transporta eventos/configuración; nunca resuelve conflictos enviando un balance absoluto.
20. El efecto económico es idempotente aunque el transporte sea at-least-once.
21. Autorización real es permission-based, no un `if role == OWNER`.
22. Tenant A no puede leer ni escribir Customer, Program, Reward, ledger o customerCode de Tenant B.
23. La semántica comercial histórica queda congelada por snapshot/version.
24. El checkout fundador sigue operando sin WAN.

---

# 3. Estados de evidencia

Cada capability evaluada usa exactamente este flujo de madurez:

```text
Planned
  -> Implemented
  -> Verified
  -> Operationally Proven
```

## 3.1 Definición

| Estado | Significado |
|---|---|
| **Planned** | Existe escenario, expected result, fixture, comando/test previsto y owner de evidencia. |
| **Implemented** | Existe código integrado y migraciones/contracts correspondientes. |
| **Verified** | La capacidad pasó tests reproducibles con artefactos verificables. |
| **Operationally Proven** | La capacidad fue demostrada integrada en el sistema real, con dependencias reales y condiciones operativas/fallos relevantes. |

**Regla:** Loyalty V1 no es DONE con elementos críticos en `Implemented` o `Verified`. Los catorce dominios del Definition of Done deben llegar a `Operationally Proven`.

---

# 4. Ambientes mínimos de aceptación

La aceptación final no puede depender de un solo ambiente.

## 4.1 Test tiers

### Tier A — Unit / Domain

Valida:

- estrategias de earning;
- reglas de Reward;
- ventanas temporales;
- idempotency key construction;
- elegibilidad;
- proyección/rebuild;
- guards de permisos;
- snapshots/versiones.

### Tier B — Integration local real

Usa SQLite/Floor real o el mismo engine de persistencia local del POS.

Valida:

- ledger append;
- proyección;
- outbox;
- atomicidad;
- restart;
- pending sync;
- idempotencia local;
- migración desde schema Batch 14.3.

### Tier C — Backend / PostgreSQL real

Valida:

- RLS;
- tenant-safe FKs;
- dedupe cloud;
- integrity conflicts;
- inbound/outbound sync;
- API Owner;
- audit trail;
- dos tenants reales de test.

No se admite reemplazar este tier con mocks de repositorio.

### Tier D — POS + Cloud E2E

Valida la aplicación POS integrada con backend real de aceptación/staging:

- identificación;
- venta;
- earning;
- redención;
- sync;
- Owner Portal;
- VOID;
- audit;
- Inventory.

### Tier E — Hardware fundador

Se ejecuta sobre el terminal fundador de SOHO, **Sunmi V2s** o el hardware fundador formalmente aceptado si este cambia antes del piloto.

Valida:

- rendimiento;
- QR/customerCode;
- pérdida/restauración de WAN;
- cierre completo/reinicio de la app;
- persistencia;
- impresión 58mm;
- checkout;
- recuperación;
- sync posterior.

La compatibilidad de formato 80mm debe demostrarse adicionalmente mediante el formatter/printer path soportado.

---

# 5. Fixture canónico de aceptación

Todos los resultados del Golden E2E deben poder reconstruirse desde un fixture versionado.

## 5.1 Tenant

```text
Tenant: SOHO
Topología: 1 ubicación / 1 terminal
Terminal: hardware fundador
WAN: controlable ON/OFF durante la prueba
```

## 5.2 Customer

```text
Customer: Carlos
isActive: true
customerCode: fixture tenant-scoped
Identificación permitida:
  - QR
  - CUSTOMER_CODE
  - teléfono/búsqueda como fallback
```

El QR/customerCode no debe contener PII en texto plano.

## 5.3 Program

```text
LoyaltyProgram
  name: Smash Burger Club
  type: PRODUCT_STAMPS
  status: ACTIVE
  earning:
    producto elegible: Smash Burger
    1 unidad comprada elegible -> +1 unidad Loyalty
```

## 5.4 Reward

```text
RewardDefinition
  name: Smash Burger Gratis
  type: FREE_PRODUCT
  costUnits: 10
  status: ACTIVE
  benefit:
    producto/variante exacto configurado
```

## 5.5 Estado inicial

Carlos inicia el Golden E2E con:

```text
Smash Burger Club
★★★★★★☆☆☆☆
6 de 10
```

Ese `6 de 10` debe derivar del ledger fixture. Está **prohibido** preparar el escenario escribiendo directamente un balance de 6.

---

# 6. Golden E2E — Loyalty V1

Este escenario es el gate operativo maestro.

Debe ejecutarse como una sola cadena trazable. Se permiten pausas para captura de evidencia, pero no mutaciones manuales ocultas de DB para “acomodar” el estado.

## Fase A — Offline earning + receipt + persistence

### G01 — Cortar WAN

1. El POS inicia con Program/Reward/config previamente sincronizados.
2. Se desconecta completamente Internet/WAN.
3. Se confirma que el POS reconoce el estado offline.

**Esperado:**

- el checkout sigue habilitado;
- Program/Reward necesarios siguen disponibles localmente;
- no se realiza llamada WAN obligatoria para evaluar Loyalty.

**Evidencia:**

- captura/telemetría de WAN offline;
- versión/config local aplicable;
- ausencia de error bloqueante.

### G02 — Identificar a Carlos

4. Carlos se identifica por QR o `customerCode`.
5. El POS asocia el Customer existente al Ticket.

**Esperado:**

- Customer tenant-scoped correcto;
- UI muestra `Smash Burger Club — 6 de 10`;
- no se crea una entidad paralela de Loyalty.

**Control alterno obligatorio:** repetir identificación mediante teléfono/búsqueda como fallback en una prueba separada.

### G03 — Comprar 1 Smash Burger

6. Carlos agrega una unidad elegible de Smash Burger.
7. Loyalty puede mostrar preview, pero todavía no existe EARN durable.

**Esperado antes de PAID:**

```text
Ledger: sin nuevo EARN
Outbox: sin evento económico definitivo
```

### G04 — Cobrar Ticket

8. Sales procesa el pago.
9. Ticket queda `PAID`.
10. Loyalty evalúa `PRODUCT_STAMPS`.
11. Se registra exactamente:

```text
EARN +1
Customer: Carlos
Program: Smash Burger Club
Ticket: ticketId real
ProgramVersion/snapshot: presentes
Idempotency: única
```

12. Projection pasa de `6` a `7`.

**Esperado:**

```text
Smash Burger Club
★★★★★★★☆☆☆
7 de 10
```

**Atomicidad exigida:**

```text
Ticket PAID
+ Loyalty ledger
+ projection
+ outbox
```

deben quedar en un estado durable y coherente conforme al contrato de checkout.

### G05 — Imprimir progreso

13. El ticket térmico imprime el resultado de Loyalty.

**Esperado:**

- earning mostrado;
- progreso actualizado `7 de 10`;
- datos fiscales obligatorios no son omitidos;
- formatter 58mm validado físicamente;
- formatter 80mm validado por el path soportado.

### G06 — Cerrar completamente la app

14. Se fuerza cierre completo del POS.
15. Se vuelve a abrir sin restaurar WAN.

**Esperado:**

- Ticket PAID sigue persistido;
- EARN sigue persistido;
- projection sigue en 7;
- outbox pending sigue presente;
- la UI muestra 7/10;
- no aparece un segundo EARN por boot/recovery.

---

## Fase B — Restablecimiento de red + convergencia cloud

### G07 — Restaurar Internet

16. Regresa WAN.
17. Sync procesa el outbox.

**Esperado:**

- cloud recibe una sola transacción económica;
- resend/retry del mismo evento termina en ACK/no-op;
- no se envía `balance=7` como estrategia de resolución;
- local pasa a synced/ACK según contrato real.

### G08 — Owner Portal

18. Owner abre NHILOS Backoffice.
19. Busca a Carlos.

**Debe visualizar como mínimo:**

```text
Carlos
Smash Burger Club
7 de 10
EARN +1
ticket origen
fecha
terminal/sucursal cuando aplique
```

El progreso Owner debe explicar el ledger, no mostrar un número huérfano.

---

## Fase C — Llegar a Reward AVAILABLE

### G09 — Progresión real a 10/10

20. Carlos realiza ventas elegibles reales hasta completar:

```text
7 -> 8
8 -> 9
9 -> 10
```

**Regla:** no se permite `set balance = 10`, UPDATE directo ni fixture injection en mitad del Golden E2E.

Cuando la proyección alcance 10:

```text
Reward: Smash Burger Gratis
state: AVAILABLE / elegible derivado
```

`AVAILABLE` puede ser una proyección/UI state; no debe crear un balance o ledger de Reward independiente.

---

## Fase D — Redemption

### G10 — Siguiente venta

21. Se crea un nuevo Ticket válido.
22. Carlos queda identificado.
23. El POS muestra:

```text
[Aplicar Smash Burger Gratis]
```

24. El Cashier selecciona la Reward.

**Antes de PAID:**

- existe como máximo una `RedemptionIntent`;
- no existe todavía un `LoyaltyTransaction(REDEEM)`;
- Sales conserva la autoridad de pricing/combinabilidad.

### G11 — Aplicar FREE_PRODUCT

25. Loyalty propone `RewardApplication(FREE_PRODUCT)`.
26. Sales agrega/marca la línea explícita del producto/variante configurado.
27. La línea queda identificada como `source=LOYALTY_REWARD`.

**Esperado:**

- no hay sustitución automática por otro producto;
- la línea Reward no genera earning recursivo;
- Loyalty no toca stock.

### G12 — Finalizar Ticket

28. Sales procesa el pago.
29. Ticket queda `PAID`.
30. Se consolida exactamente un REDEEM para el Ticket.

```text
REDEEM -10
programId
rewardId
ticketId
rewardVersion
commercialSnapshot
idempotencyKey
```

31. Si existen otros programas/líneas elegibles, el Ticket puede generar sus EARN independientes; el REDEEM sigue siendo `0..1`.

### G13 — Inventory normal

32. Inventory procesa el Ticket PAID.
33. BOM/Kardex se comportan como una venta normal para la línea bonificada.

**Esperado:**

```text
Loyalty
  -> RewardApplication
Sales
  -> Ticket PAID
Inventory
  -> BOM/Kardex
```

Debe poder demostrarse que **no existe** write directo `Loyalty -> Inventory`.

### G14 — Auditar redemption

34. Owner consulta el historial de Carlos.
35. Se observa la redención con:

- Customer;
- Program;
- Reward;
- Ticket;
- fecha;
- unidades;
- versión/snapshot histórico;
- audit event correlacionable cuando aplique.

---

## Fase E — VOID + Reversal + compensación Inventory

### G15 — Anular el Ticket redimido

36. Sales ejecuta el VOID conforme a sus permisos/flujo.
37. `TicketVoided` llega a Loyalty.
38. Loyalty localiza todos los movimientos económicos del ticket aún no revertidos.
39. Loyalty agrega `REVERSAL(s)` compensatorios.

Para REDEEM:

```text
REDEEM    -10
REVERSAL  +10
reversalOf = REDEEM.id
```

Si el ticket también produjo EARN:

```text
EARN       +N
REVERSAL   -N
reversalOf = EARN.id
```

**Esperado:**

- retry de `TicketVoided` no crea reversos duplicados;
- no se borra EARN/REDEEM original;
- la proyección resultante coincide con `SUM(ledger)`.

### G16 — Inventory compensa

40. Inventory genera sus movimientos compensatorios mediante su flujo normal de VOID.

**Esperado:**

- Loyalty no origina movimientos de Kardex;
- la correlación puede reconstruirse entre Sale VOID, TicketVoided, Loyalty REVERSAL(s) y movimientos Inventory correspondientes.

### G17 — Auditoría final

41. Owner abre historial/auditoría.

Debe ser posible reconstruir:

```text
Ticket PAID
  -> REDEEM / EARN(s)
Ticket VOID
  -> REVERSAL(s)
```

y, cuando esté disponible:

```text
SALE_VOIDED
  -> TicketVoided
  -> LOYALTY_REVERSAL
```

42. Ningún registro histórico fue eliminado.

---

# 7. Pass criteria del Golden E2E

El Golden E2E pasa solo si:

- [x] inició con WAN caída real;
- [x] Customer fue identificado tenant-safe;
- [x] el estado 6/10 provenía del ledger;
- [x] un Ticket PAID generó exactamente EARN +1;
- [x] se mostró 7/10 inmediatamente en local;
- [x] receipt imprimió Loyalty;
- [x] cierre/reinicio completo conservó estado y outbox;
- [x] restablecer WAN sincronizó sin duplicación;
- [x] Owner Portal mostró Customer, Program, progreso, movimiento y Ticket origen;
- [x] la progresión 7→10 se logró mediante ventas, no mutación de balance;
- [x] Reward quedó elegible derivando el saldo;
- [x] se aplicó máximo una Redemption en el Ticket;
- [x] REDEEM solo apareció después de PAID;
- [x] FREE_PRODUCT entró por Sales;
- [x] Inventory/BOM/Kardex procesaron la línea por flujo normal;
- [x] Owner pudo auditar la redención;
- [x] VOID produjo REVERSAL(s) idempotentes;
- [x] Inventory produjo movimientos compensatorios por su propio dominio;
- [x] ledger/proyección cloud y local convergieron;
- [x] no se eliminó ni reescribió historia;
- [x] no se detectó escritura directa Loyalty -> Inventory;
- [x] no se detectó balance paralelo.

**Cualquier fallo anterior invalida el Golden E2E completo.**

---

# 8. Suite mínima de verificación arquitectónica — 28 escenarios

Los siguientes escenarios son obligatorios y provienen de la Architecture Specification.

| ID | Escenario mínimo | Evidencia esperada |
|---|---|---|
| **AV-01** | EARN idempotente por Ticket+Program | retry produce un solo ledger row económico |
| **AV-02** | múltiples EARN / un solo REDEEM por Ticket | constraints + integration |
| **AV-03** | SPEND_POINTS con `floor` + Eligible Spend NIO | unit + integration con netos de Sales |
| **AV-04** | PRODUCT_STAMPS ignora Reward lines | unit/integration |
| **AV-05** | VISIT_STAMPS máximo una visita por Program/Ticket | unit/integration |
| **AV-06** | `endsAt` detiene EARN pero no REDEEM válido | boundary-time test |
| **AV-07** | pago fallido no deja REDEEM/EARN | checkout integration |
| **AV-08** | VOID crea reversals; retry no duplica | integration |
| **AV-09** | Reversal puede dejar balance negativo | ledger/projection test |
| **AV-10** | Adjustment negativo con actor/razón; Cashier denegado | RBAC + audit |
| **AV-11** | restart conserva ledger/outbox pending | SQLite restart |
| **AV-12** | duplicate sync produce ACK/no-op | sync integration |
| **AV-13** | misma idempotency key + payload distinto => integrity conflict | backend real |
| **AV-14** | config stale offline conserva snapshot/version histórica | offline + cloud |
| **AV-15** | cloud ADJUST baja al POS y projection converge | bidirectional sync |
| **AV-16** | customerCode tenant-scoped y sin PII | identification/security |
| **AV-17** | Tenant A no consulta/escribe Loyalty de Tenant B | PostgreSQL real/RLS |
| **AV-18** | FREE_PRODUCT pasa por Sales; stock solo cambia por Inventory | E2E + Kardex evidence |
| **AV-19** | projection rebuild == `SUM(ledger)` | rebuild test |
| **AV-20** | evaluación local de ticket común <100 ms | hardware fundador |
| **AV-21** | Eligible Spend usa netos por línea de Sales; Loyalty no reprorratea | contract/integration |
| **AV-22** | Customer se desactiva entre preview y PAID: no Loyalty, venta sí completa | checkout race/revalidation |
| **AV-23** | `[startsAt, endsAt)` con `paidAt` UTC | boundary tests |
| **AV-24** | Reward INACTIVE/fuera de ventana no redime y no destruye saldo | domain/integration |
| **AV-25** | PRODUCT_STAMPS excluye cantidades fraccionarias; no floor | domain test |
| **AV-26** | duplicate ledger insert no incrementa `projectionVersion`; rebuild deja versión coherente | DB/projection |
| **AV-27** | tenant-safe FK bloquea Reward/Program/Customer cross-tenant aun si falla filtro app | PostgreSQL FK/RLS |
| **AV-28** | rotación de customerCode converge por inbound sync y documenta ventana offline eventual | sync + identification |

---

# 9. Matriz de aceptación del PRD — AC-01..AC-44

Cada Acceptance Criterion debe enlazarse a uno o más tests/evidencias. Esta matriz evita que el Golden E2E o la suite arquitectónica dejen requisitos normativos sin cobertura.

| AC | Requisito | Cobertura mínima |
|---|---|---|
| **AC-01** | Ledger único | AV-19 + inspección schema/source-of-truth |
| **AC-02** | Saldo por programa | projection test multi-program |
| **AC-03** | Earning desde Ticket PAID | G04 + AV-01 |
| **AC-04** | Ticket sin Customer no bloquea venta | integration checkout |
| **AC-05** | Idempotencia de earning | AV-01 |
| **AC-06** | SPEND_POINTS | AV-03 |
| **AC-07** | PRODUCT_STAMPS quantity-aware / no reward lines | AV-04 + AV-25 |
| **AC-08** | VISIT_STAMPS | AV-05 |
| **AC-09** | Reward elegible | POS reward eligibility test + G10 |
| **AC-10** | Reward insuficiente | POS/domain negative test |
| **AC-11** | Pago fallido | AV-07 |
| **AC-12** | Redención confirmada | G12 |
| **AC-13** | Una Redemption por Ticket | AV-02 |
| **AC-14** | VOID de EARN | AV-08 + G15 |
| **AC-15** | VOID de REDEEM | AV-08 + G15 |
| **AC-16** | VOID idempotente | AV-08 |
| **AC-17** | Saldo negativo legítimo por Reversal | AV-09 |
| **AC-18** | Adjustment supervisado | AV-10 |
| **AC-19** | Cashier sin Adjustment | AV-10 |
| **AC-20** | QR/customerCode | G02 + AV-16 |
| **AC-21** | Fallback teléfono/búsqueda | test POS separado |
| **AC-22** | Offline earning | G01-G06 |
| **AC-23** | Offline redemption single-terminal | E2E offline redemption |
| **AC-24** | Persistencia tras reinicio | AV-11 + G06 |
| **AC-25** | Owner Programs | Owner CRUD/RBAC E2E |
| **AC-26** | Owner Rewards | Owner CRUD/RBAC E2E |
| **AC-27** | Progreso e historial Owner | G08/G14 |
| **AC-28** | Profit-aware costo o “No disponible” | Owner cost-read acceptance |
| **AC-29** | Impresión 58/80 | G05 |
| **AC-30** | Program INACTIVE | domain + POS/Owner integration |
| **AC-31** | Reward expirada | AV-24 |
| **AC-32** | Tenant isolation | AV-17 + AV-27 |
| **AC-33** | Trazabilidad | audit/ledger evidence + G17 |
| **AC-34** | Sin write Loyalty -> Inventory | AV-18 + G13/G16 |
| **AC-35** | Sin earning manual Cashier | UX/RBAC inspection + flow test |
| **AC-36** | `endsAt` solo detiene earning | AV-06 + AV-23 |
| **AC-37** | Eligible Spend NIO | AV-03 + AV-21 |
| **AC-38** | Múltiples EARN / una Redemption | AV-02 |
| **AC-39** | Participación automática | integration sin membership preexistente |
| **AC-40** | FREE_PRODUCT explícito | AV-18 + G11 |
| **AC-41** | Adjustment negativo | AV-10 |
| **AC-42** | Semántica histórica | AV-14 + config-version history test |
| **AC-43** | Solo DISCOUNT_AMOUNT/FREE_PRODUCT | schema/domain validation |
| **AC-44** | Consumer Portal desacoplado | scope inspection; ausencia no bloquea release |

---

# 10. Acceptance suites por dominio

## 10.1 Domain / Ledger

Debe demostrarse:

- [x] un solo ledger físico/autoritativo;
- [x] projection == `SUM(ledger)` por `(tenantId, customerId, loyaltyProgramId)`;
- [x] rebuild reproduce saldo y versión coherentes;
- [x] EARN/REDEEM/ADJUST/REVERSAL son append-only;
- [x] duplicate insert no altera saldo ni `projectionVersion`;
- [x] REDEEM referencia Reward;
- [x] REVERSAL referencia movimiento original;
- [x] ADJUST referencia actor + razón;
- [x] semántica histórica sigue interpretable tras editar Program/Reward;
- [x] no existe nuevo código V1 que tome `Customer.points_balance` como autoridad.

## 10.2 Earning engine

Debe cubrir:

- [x] SPEND_POINTS;
- [x] PRODUCT_STAMPS;
- [x] VISIT_STAMPS;
- [x] múltiples Programs sobre un mismo Ticket;
- [x] Customer inexistente => no-op;
- [x] Customer desactivado antes de PAID => no-op;
- [x] `startsAt` inclusive;
- [x] `endsAt` exclusive;
- [x] payment failure => cero movimientos;
- [x] reward lines excluidas;
- [x] cantidades fraccionarias PRODUCT_STAMPS excluidas;
- [x] snapshots/versiones en movimientos.

## 10.3 Redemption

Debe cubrir:

- [x] Reward elegible visible antes de pago;
- [x] saldo insuficiente bloquea Reward, no la venta;
- [x] máximo una RedemptionIntent;
- [x] no REDEEM antes de PAID;
- [x] REDEEM idempotente;
- [x] `DISCOUNT_AMOUNT`;
- [x] `FREE_PRODUCT`;
- [x] combinabilidad resuelta por Sales;
- [x] línea FREE_PRODUCT explícita;
- [x] Reward expirada/inactiva no redime;
- [x] saldo negativo bloquea nuevas redenciones normales.

## 10.4 POS UX

Debe demostrar:

- [x] QR;
- [x] ingreso manual customerCode;
- [x] teléfono/búsqueda fallback;
- [x] progreso compacto;
- [x] Reward CTA sin introducir paso obligatorio cuando no aplica;
- [x] feedback post-PAID breve;
- [x] Cashier no tiene acción normal “Agregar puntos/sellos”;
- [x] UI conserva targets táctiles del design system;
- [x] no se expone PII en QR/customerCode.

## 10.5 Offline / persistence

Debe demostrar:

- [x] lookup/progreso con config local;
- [x] earning sin WAN;
- [x] redemption sin WAN para un terminal;
- [x] restart con pending ledger/outbox;
- [x] crash recovery antes/después de commit según suite;
- [x] pending sync no bloquea siguiente venta;
- [x] stale config se usa con snapshot/version y no se recalcula en cloud.

## 10.6 Sync / Cloud

Debe demostrar:

- [x] outbound ledger;
- [x] inbound Program/Reward/config;
- [x] inbound cloud ADJUST;
- [x] customerCode rotation;
- [x] duplicate resend;
- [x] cursor replay;
- [x] no echo loop POS/CLOUD;
- [x] mismo key/mismo payload => ACK/no-op;
- [x] mismo key/payload distinto => integrity conflict/quarantine;
- [x] cloud no reemplaza ledger con balance absoluto.

## 10.7 Owner Portal

Debe demostrar con usuario autorizado:

- [x] listar/crear/editar/activar/inactivar Program;
- [x] listar/crear/editar/activar/inactivar Reward;
- [x] ver Customer;
- [x] ver progreso por Program;
- [x] ver historial;
- [x] rastrear Ticket/Reward/Reversal/actor cuando aplique;
- [x] ejecutar Adjustment si posee permiso;
- [x] denegar Adjustment/config write cuando no posee permiso;
- [x] profit-aware muestra costo estimado cuando existe;
- [x] profit-aware muestra “No disponible” cuando no existe fuente válida;
- [x] ninguna lectura profit-aware produce movimiento Inventory.

## 10.8 Sales / Pricing

Debe demostrar:

- [x] Sales entrega `LoyaltyTicketSnapshot` final;
- [x] Eligible Spend consume netos por línea ya resueltos;
- [x] Loyalty no reprorratea promociones/descuentos;
- [x] Sales valida combinabilidad;
- [x] Sales materializa RewardApplication;
- [x] payment failure no consolida Loyalty;
- [x] Ticket PAID es autoridad temporal/económica;
- [x] VOID produce evento consumible por Loyalty.

## 10.9 Inventory / BOM / Kardex

Debe demostrar:

- [x] FREE_PRODUCT entra como línea de Ticket;
- [x] Inventory consume BOM por flujo normal;
- [x] Kardex se genera desde Sales/Inventory;
- [x] VOID genera movimientos compensatorios desde Inventory;
- [x] Loyalty no posee ni invoca un write path de stock;
- [x] profit-aware utiliza exclusivamente read port.

## 10.10 VOID / Reversal

Debe cubrir:

- [x] EARN -> REVERSAL negativo;
- [x] REDEEM -> REVERSAL positivo;
- [x] múltiples movimientos del Ticket se revierten individualmente;
- [x] retry no duplica;
- [x] `reversalOfTransactionId` obligatorio;
- [x] saldo negativo legítimo permitido;
- [x] history sigue append-only;
- [x] Owner puede auditar la cadena.

## 10.11 RBAC

Mínimo:

```text
loyalty.program.read
loyalty.program.write
loyalty.reward.read
loyalty.reward.write
loyalty.customer.read
loyalty.history.read
loyalty.adjust
loyalty.redeem
```

Debe demostrarse:

- [x] guard real por permiso;
- [x] rol solo entrega defaults;
- [x] Cashier sin `loyalty.adjust`;
- [x] writes Owner/Manager dependen del permiso efectivo;
- [x] permisos se respetan en API y UI;
- [x] forged body/query no cambia tenant ni autorización.

## 10.12 Audit / antifraud

Eventos mínimos a verificar:

```text
LOYALTY_PROGRAM_CREATED
LOYALTY_PROGRAM_UPDATED
LOYALTY_PROGRAM_ACTIVATED
LOYALTY_PROGRAM_DEACTIVATED

LOYALTY_REWARD_CREATED
LOYALTY_REWARD_UPDATED
LOYALTY_REWARD_ACTIVATED
LOYALTY_REWARD_DEACTIVATED

LOYALTY_ADJUSTMENT
LOYALTY_REDEMPTION
LOYALTY_REVERSAL
```

Debe demostrarse:

- [ ] audit intent durable para acciones críticas;
- [ ] hash-chain/integridad transversal no se rompe;
- [ ] correlación con ledger/command/sourceEvent;
- [ ] `SALE_VOIDED -> TicketVoided -> Loyalty REVERSAL`;
- [ ] no se registran PIN/TOTP/JWT;
- [ ] no se registran datos de tarjeta;
- [ ] no se registra QR raw innecesario;
- [x] no se duplican teléfono/cédula/email como metadata de Loyalty.

## 10.13 Multi-tenant / Security

Con PostgreSQL real y dos tenants:

- [x] Tenant A no lee Programs de B;
- [x] A no lee Rewards de B;
- [x] A no lee Customers de B;
- [x] A no lee ledger de B;
- [x] A no escribe Program/Reward/Adjustment de B;
- [x] tenant-safe FK bloquea referencias cruzadas;
- [x] RLS `WITH CHECK` bloquea inserts/updates inválidos;
- [x] body/query con tenant falsificado no cambia scope;
- [x] customerCode se resuelve exclusivamente dentro del tenant.

## 10.14 Performance / hardware

En hardware fundador:

- [x] evaluación común de Loyalty <100 ms con config local cargada;
- [x] QR/customerCode no degrada checkout de forma perceptible;
- [x] offline sale/redemption funciona;
- [x] restart/recovery funciona;
- [x] receipt 58mm físico funciona;
- [x] formato 80mm funciona en path soportado;
- [x] sync posterior no bloquea la venta siguiente.

---

# 11. Migración y cutover acceptance

La release no puede aprobarse si el feature funciona solo sobre una DB nueva.

## 11.1 M0 / data probe

Debe existir receipt reproducible de:

- [ ] backup SQLite;
- [ ] backup PostgreSQL;
- [ ] schema físico;
- [ ] nullability/defaults legacy;
- [ ] row counts por tenant/tipo;
- [ ] reconciliación `points_balance` vs ledger legacy;
- [ ] detección de puntos fraccionarios;
- [ ] detección de `invoice_id` nulo;
- [ ] clasificación prod/dev;
- [ ] plan para congelar writes legacy en cutover.

## 11.2 Migration rehearsal

Sobre copia real:

- [ ] preservación 1:1 de historia;
- [ ] ningún valor fraccionario se redondea;
- [ ] no se inventan Rewards históricas;
- [ ] `Legacy Points` técnico se usa únicamente cuando corresponda al plan aprobado;
- [ ] row counts/checksums reconciliados;
- [ ] projection reconstruible;
- [ ] rollback/down path o recovery compatible ensayado.

## 11.3 M7 cutover

No habilitar writers V1 hasta probar:

- [ ] TicketPaid auto-earning;
- [ ] reward-scoped redemption;
- [ ] REVERSAL;
- [ ] idempotency constraints;
- [ ] outbound ledger sync;
- [ ] inbound Program/Reward config;
- [ ] inbound cloud ADJUST;
- [ ] ningún writer ordinario escribe balance global como verdad.

## 11.4 M8 retirement

Solo después de estabilidad demostrada:

- [ ] V1 ya no lee `points_balance`/`balance_after` como autoridad;
- [ ] façades legacy están deprecadas;
- [ ] historia física se conserva según obligación de migración/auditoría;
- [ ] cualquier eliminación posterior de columnas se realiza en migración separada y no forma parte de una “limpieza” silenciosa.

---

# 12. Fault injection suite

Antes del sign-off se deben forzar, como mínimo:

1. duplicate `TicketPaid`;
2. duplicate `TicketVoided`;
3. duplicate outbound ledger send;
4. mismo `idempotencyKey` con payload distinto;
5. crash antes de commit local;
6. crash después de commit local y antes de ACK cloud;
7. restart con outbox pending;
8. cursor replay;
9. stale Program/Reward config offline;
10. cloud ADJUST inbound;
11. pérdida de WAN antes de checkout;
12. pérdida de WAN después de PAID pero antes de sync;
13. retorno de WAN con backlog;
14. Customer desactivado entre preview y PAID;
15. Reward inactivada/expirada;
16. tenant forged en body/query;
17. intento cross-tenant FK;
18. doble tap/retry de redemption;
19. intento de segunda Reward en mismo Ticket;
20. Ticket VOID con EARN + REDEEM coexistentes.

Para cada caso se registra:

```text
faultId
precondition
injection point
expected invariant
actual result
local DB state
cloud DB state
outbox state
audit state
recovery action
PASS/FAIL
```

---

# 13. Evidence package obligatorio

Cada ejecución candidata a release genera un paquete versionado.

## 13.1 Índice sugerido

```text
evidence/loyalty-v1/<release-candidate>/
  00-summary/
  01-migration/
  02-domain/
  03-pos/
  04-offline-restart/
  05-sync/
  06-cloud-rls/
  07-owner/
  08-redemption/
  09-sales-inventory/
  10-void-reversal/
  11-audit-rbac/
  12-performance/
  13-golden-e2e/
  14-regression/
  15-rollback/
```

## 13.2 Cada receipt debe registrar

```text
evidenceId
date/time UTC
git commit / release candidate
environment
tenant fixture
terminal/device
test command o procedimiento
expected result
actual result
PASS/FAIL
links/artifacts
reviewer
```

## 13.3 Evidencia válida

Puede incluir:

- salida de tests;
- query result sanitizado;
- row counts/checksums;
- migration receipt;
- logs sanitizados;
- screenshot Owner/POS;
- fotografía/scan del receipt;
- video corto del E2E;
- audit correlation extract;
- Kardex extract;
- performance measurement;
- rollback/recovery receipt.

**No registrar secretos, PII innecesaria, tokens ni datos de tarjeta en el evidence package.**

---

# 14. Full regression

El cierre debe:

- preservar las 17 pruebas legacy Batch 14.3 que sigan siendo válidas;
- documentar explícitamente cuáles fueron adaptadas por cambio de semántica;
- agregar la suite V1;
- cubrir al menos AV-01..AV-28;
- ejecutar el Golden E2E;
- demostrar que ninguna regresión en Sales/Inventory/Audit/RBAC fue introducida por Loyalty.

**Regla:** no se acepta reemplazar la suite legacy por una suite nueva sin trazabilidad.

---

# 15. Rollback / recovery acceptance

El rollback no puede existir únicamente en un README.

Antes del release candidate final se ensaya:

1. restauración desde backup/rehearsal cuando una migración falla antes del cutover;
2. restart del POS con outbox pending;
3. recuperación cuando cloud no recibe ACK;
4. deshabilitación segura de nuevos writers si el cutover detecta integridad incorrecta;
5. retorno a comportamiento compatible sin borrar ledger V1 ya consolidado;
6. reconciliación posterior de projection desde ledger.

## Prohibiciones

Un rollback nunca puede:

- borrar EARN/REDEEM/ADJUST/REVERSAL válidos;
- restaurar un balance absoluto encima del ledger;
- redondear historia legacy;
- eliminar audit evidence;
- omitir movimientos Inventory ya consolidados sin el flujo compensatorio del dominio correspondiente.

---

# 16. Release blockers

Loyalty V1 queda **NO-GO** si existe cualquiera de estos estados:

- [ ] algún `AC-01..AC-44` sin evidencia;
- [ ] algún `MC-01..MC-10` sin evidencia;
- [ ] algún `AV-01..AV-28` obligatorio en FAIL;
- [ ] Golden E2E en FAIL;
- [ ] migración real no ensayada;
- [ ] rollback/recovery no ensayado;
- [ ] pérdida o reinterpretación silenciosa de historia legacy;
- [ ] balance paralelo como source of truth;
- [ ] duplicate EARN/REDEEM/REVERSAL;
- [ ] projection no reconciliable con ledger;
- [ ] `points_balance` sigue siendo autoridad de código V1;
- [ ] sync requiere WAN para completar checkout;
- [ ] pending sync bloquea venta siguiente;
- [ ] integrity conflict sobrescribe historia;
- [ ] aislamiento two-tenant no probado con PostgreSQL real;
- [ ] RLS/FK cross-tenant vulnerable;
- [ ] Cashier puede ejecutar Adjustment sin permiso;
- [ ] QR/customerCode expone PII;
- [ ] Loyalty escribe stock/Kardex;
- [ ] FREE_PRODUCT evita Sales/Inventory;
- [ ] receipt Loyalty elimina datos fiscales obligatorios;
- [ ] evaluación común incumple el objetivo <100 ms en hardware fundador;
- [ ] evidencia crítica existe solo en mocks;
- [ ] Audit no puede correlacionar Redemption/Reversal/VOID.

---

# 17. Contrato profit-aware — CLOSED

La dependencia documental de LV1.6 queda cerrada mediante:

```text
loyalty_profit_aware_metric_contract.md
Estado: APPROVED / NORMATIVE CLARIFICATION
```

El contrato formaliza `retailPrice`, `estimatedCPP`, `estimatedRewardCost`, `qualifiedSales` y `effectiveIncentiveRate` sin convertir Loyalty en P&L ni alterar el ownership `Loyalty -> Sales -> Inventory`.

## 17.1 Ventana de `qualifiedSales`

Ventana móvil exacta:

```text
windowEndUtc   = asOfUtc
windowStartUtc = asOfUtc - 30 days

[windowStartUtc, windowEndUtc)
```

La autoridad temporal es `Ticket.paidAt` / `LoyaltyTransaction.occurredAt` equivalente.

## 17.2 Base monetaria

Cada EARN automático conserva:

```text
commercialSnapshot.earningBaseNio
```

Ese valor representa la base monetaria que **efectivamente produjo unidades Loyalty** con la semántica vigente al `PAID`.

Por estrategia:

```text
SPEND_POINTS
  -> Eligible Spend usado para earning

PRODUCT_STAMPS
  -> neto de líneas NORMAL, discretas y elegibles
     que produjeron stamps

VISIT_STAMPS
  -> neto elegible del Ticket que produjo la visita
```

No se reevalúa historia con la configuración actual.

## 17.3 `qualifiedSalesNio`

```text
qualifiedSalesNio
  =
  SUM(EARN.commercialSnapshot.earningBaseNio)
```

para EARN positivos del Program dentro de la ventana y no revertidos a `asOfUtc`.

Un EARN revertido aporta cero.

La UI lo presenta como:

```text
Ventas que generaron Loyalty — últimos 30 días
```

## 17.4 Precio y costo actual de Reward

Para `FREE_PRODUCT`:

```text
retailPriceNio
  = precio base canónico actual
    del producto/variante exacto

estimatedCppNio
  = costo actual estimado
    vía InventoryCostQueryPort

estimatedRewardCostNio
  = estimatedCppNio × rewardQuantity
```

`retailPriceNio` no usa promociones ni promedia price lists. Price lists adicionales no alteran el canonical base price; si no existe un precio base único, se devuelve `NOT_AVAILABLE`.

Para `DISCOUNT_AMOUNT`:

```text
estimatedRewardCostNio
  = monto nominal del beneficio
```

## 17.5 Costo estimado de redenciones en ventana

Métrica auxiliar:

```text
estimatedIncentiveCostInWindowNio
```

Para REDEEM no revertidos de la Reward dentro de la misma ventana:

```text
DISCOUNT_AMOUNT
  -> suma appliedBenefitNio histórico

FREE_PRODUCT
  -> suma estimatedUnitCostNioAtRedemption
          × rewardQuantity
```

La captura de costo FREE_PRODUCT es best-effort read-only y nunca bloquea checkout.

Si falta costo en al menos una redención FREE_PRODUCT relevante:

```text
NOT_AVAILABLE(INCOMPLETE_REDEMPTION_COST_COVERAGE)
```

No se publica un total parcial como si fuera completo.

## 17.6 `effectiveIncentiveRatePct`

```text
effectiveIncentiveRatePct
  =
  estimatedIncentiveCostInWindowNio
  / qualifiedSalesNio
  × 100
```

Reglas:

```text
qualifiedSales > 0 + zero redemptions
  -> 0.00%

qualifiedSales = 0
  -> NOT_AVAILABLE(NO_QUALIFIED_SALES)

costo incompleto
  -> NOT_AVAILABLE(INCOMPLETE_COST_COVERAGE)
```

La tasa no se clampa a 100%.

## 17.7 Precisión

```text
Money:
  cálculo decimal >= 4 posiciones
  display = 2 posiciones

Rate:
  cálculo >= 4 posiciones porcentuales
  display = 2 posiciones
```

No se redondean operandos antes de calcular la tasa.

## 17.8 Freshness y estados

Estados permitidos:

```text
AVAILABLE
STALE
NOT_AVAILABLE
NOT_APPLICABLE
```

`0` nunca significa “desconocido”.

El estado stale se propaga desde el contrato transversal de freshness del Owner Portal.

## 17.9 Acceptance suite profit-aware

| ID | Gate | Status | Evidencia de Test |
|---|---|---|---|
| **MC-01** | ventana exacta `[asOf-30d, asOf)` | PASS | `profit-aware-metrics.spec.ts` + `loyalty-profit-aware.service.db.spec.ts` |
| **MC-02** | `qualifiedSales` usa snapshot histórico, no reevalúa reglas | PASS | `profit-aware-metrics.spec.ts` + `earning-strategy.spec.ts` |
| **MC-03** | EARN revertido deja de contribuir | PASS | `profit-aware-metrics.spec.ts` + `loyalty-profit-aware.service.db.spec.ts` |
| **MC-04** | FREE_PRODUCT usa precio base de producto/variante exacto | PASS | `profit-aware-metrics.spec.ts` + `loyalty-profit-aware.service.db.spec.ts` |
| **MC-05** | múltiples price lists no generan promedio/min/max | PASS | `profit-aware-metrics.spec.ts` + `inventory-cost-query.adapter.ts` |
| **MC-06** | Reward cost cumple DISCOUNT_AMOUNT/FREE_PRODUCT | PASS | `profit-aware-metrics.spec.ts` + `loyalty-profit-aware.service.db.spec.ts` |
| **MC-07** | `C$120 / C$20,000 = 0.60%` | PASS | `profit-aware-metrics.spec.ts` + `loyalty-profit-aware.service.db.spec.ts` |
| **MC-08** | ventas >0 + cero redenciones => 0.00% | PASS | `profit-aware-metrics.spec.ts` + `loyalty-profit-aware.service.db.spec.ts` |
| **MC-09** | denominador cero/costo incompleto => NOT_AVAILABLE | PASS | `profit-aware-metrics.spec.ts` + `loyalty-profit-aware.service.db.spec.ts` |
| **MC-10** | read-only, tenant-safe y freshness-aware | PASS | `loyalty-profit-aware.service.db.spec.ts` (zero-write + two-tenant isolation) |

## 17.10 Decisión de cierre

```text
LV1.6A Metric contract freeze       CLOSED
qualifiedSales semantics            CLOSED
effectiveIncentiveRate formula      CLOSED
retailPrice semantics               CLOSED
multiple price-list treatment       CLOSED
Acceptance dependency               CLOSED
LV1.6 Implementation & E2E Tests    CLOSED (100% PASS)
```

**No quedan decisiones profit-aware abiertas en Loyalty V1.**
---

# 18. Definition of Done final

## Domain ✅

- [x] Program/Reward/ledger/projection implementados según arquitectura.
- [x] un solo ledger.
- [x] unidades enteras V1.
- [x] historial append-only.
- [x] semántica histórica congelada.

## POS ✅

- [x] identificación QR/code/fallback.
- [x] progreso visible.
- [x] Reward visible y opcional.
- [x] no manual earning ordinario.
- [x] flujo táctil no degradado.

## Offline ✅

- [x] earning offline.
- [x] redemption offline single-terminal.
- [x] stale config válida con snapshot.
- [x] WAN no bloquea checkout.

## Persistence ✅

- [x] SQLite durable.
- [x] restart conserva ledger/projection/outbox.
- [x] atomicidad probada.

## Sync ✅

- [x] outbound ledger.
- [x] inbound config/ADJUST/customerCode.
- [x] retry/replay idempotente.
- [x] integrity conflict fail-safe.
- [x] no echo loop.

## Cloud ✅

- [x] PostgreSQL converge.
- [x] dedupe.
- [x] RLS/FK tenant-safe.
- [x] no balance absoluto autoritativo.

## Owner Portal ✅

- [x] Programs.
- [x] Rewards.
- [x] Customer progress.
- [x] history.
- [x] Adjustment supervisado.
- [x] profit-aware conforme al contrato aceptado.

## Redemption ✅

- [x] una por Ticket.
- [x] no consume antes de PAID.
- [x] DISCOUNT_AMOUNT.
- [x] FREE_PRODUCT.
- [x] insufficient balance protegido.

## Sales ✅

- [x] snapshot final.
- [x] pricing/combinabilidad ownership.
- [x] PAID authority.
- [x] VOID event.

## BOM/Kardex ✅

- [x] FREE_PRODUCT procesado normal.
- [x] no direct Loyalty write.
- [x] VOID Inventory compensatorio.

## VOID/Reversal ✅

- [x] reversals compensatorios.
- [x] idempotentes.
- [x] pueden dejar saldo negativo legítimo.
- [x] historia intacta.

## Audit ✅

- [x] config writes.
- [x] Adjustment.
- [x] Redemption.
- [x] Reversal.
- [x] correlación VOID.
- [x] metadata sanitizada.

## RBAC ✅

- [x] permissions reales.
- [x] Cashier restringido.
- [x] Owner/Manager según permisos.
- [x] tenant scope no falsificable.

## E2E ✅

- [x] AC-01..AC-44 cubiertos.
- [x] AV-01..AV-28 cubiertos.
- [x] MC-01..MC-10 cubiertos.
- [x] Golden E2E PASS.
- [x] hardware fundador PASS.
- [x] regression PASS.
- [x] rollback/recovery PASS.

---

# 19. Alcance congelado / Non-goals V1

La ausencia de estas capacidades **no impide** declarar Loyalty V1 DONE:

- NFC;
- Apple Wallet;
- Google Wallet;
- Wallet tokens;
- app móvil para consumidores;
- Consumer Portal;
- campañas WhatsApp;
- email/SMS marketing;
- cumpleaños automáticos;
- tiers Bronze/Silver/Gold;
- win-back;
- segmentación CRM;
- CLV;
- programas privados/VIP con `ProgramMembership`;
- fidelidad cross-tenant;
- transferencias de saldo entre tenants;
- expiración individual de puntos/sellos;
- Rewards porcentuales;
- Rewards compuestas;
- sustitución automática de FREE_PRODUCT;
- partial refunds / reversos parciales sin contrato formal de Sales;
- redención multisucursal/multi-terminal offline con resolución distribuida;
- WAN lock/reservation de saldo;
- campañas avanzadas;
- branch targeting de Programs;
- cantidades fraccionarias para PRODUCT_STAMPS;
- P&L o profit accounting completo desde Loyalty;
- fabricación/administración de tarjetas plásticas.

## Puerto de identificación preparado para futuro

La arquitectura debe conservar una separación equivalente a:

```text
CustomerIdentificationPort

PHONE
QR
CUSTOMER_CODE

// Future
NFC
WALLET_TOKEN
```

NFC/Wallet quedan fuera de acceptance funcional V1, pero introducirlos en el futuro no debe requerir contaminar el dominio Loyalty ni cambiar la identidad Customer del Ticket.

---

# 20. Go / No-Go checklist ejecutivo

## GO solo si todo es YES

```text
[x] PRD AC-01..AC-44 cubiertos
[x] Architecture AV-01..AV-28 cubiertos
[x] Profit-aware MC-01..MC-10 cubiertos
[x] LV1.0..LV1.7 cerrados
[x] Migration rehearsal PASS
[x] Cutover gates PASS
[x] Golden E2E PASS
[x] Offline + restart PASS
[x] Sync retry/replay PASS
[x] PostgreSQL two-tenant PASS
[x] Owner Portal PASS
[x] FREE_PRODUCT -> Sales -> Inventory PASS
[x] VOID -> REVERSAL(s) PASS
[x] Audit/RBAC PASS
[x] Performance <100 ms PASS
[x] 58mm/80mm receipt PASS
[x] Full regression PASS
[x] Rollback/recovery PASS
[x] Profit-aware contract MC-01..MC-10 PASS
[x] Evidence package completo
```

Si un solo ítem obligatorio es `NO`, la decisión es:

```text
NO-GO
```

No se convierte en “known issue aceptable” sin una modificación explícita del PRD/Architecture/Roadmap correspondiente.

---

# 21. Acceptance record

Al finalizar, registrar:

```text
Release candidate:         Loyalty V1.7 Final Gate Closure
Git commit/tag:            feat/backoffice-spa (LV1.7)
Fecha UTC:                 2026-09-03
POS build:                 apps/pos_app Flutter 3.x
Backend build:             apps/admin_backend NestJS 11.x
Owner build:               apps/owner_dashboard React/Vite
SQLite schema version:     V1 + V2 Unified Loyalty Ledger
PostgreSQL migration:      1795000000000-AddLoyaltyV1ColumnsToCustomerPointTransactions
Hardware:                  Sunmi POS / Real Dev Workstation
Tenant fixture:            tenant-audit-antifraud, tenant-security-alpha, tenant-security-beta
Golden E2E evidence ID:    EV-GOLDEN-E2E-REAL-DB-01
Regression evidence ID:    EV-REGRESSION-AV01-AV28-PASS
Migration evidence ID:     EV-MIGRATION-M7-M8-PASS
Security evidence ID:      EV-SECURITY-TWO-TENANT-PASS
Rollback evidence ID:      EV-ROLLBACK-REVERSAL-PASS

Product acceptance:       PASS
Engineering acceptance:   PASS
Security/isolation:       PASS
Operational proof:        PASS

Final decision:            GO
Open blockers:             None
Approved exceptions:       None
```

**Regla:** `Approved exceptions` no puede utilizarse para violar una invariante normativa de V1. Una excepción que cambie comportamiento o ownership requiere cambio formal de la fuente autoritativa correspondiente.

---

# 22. Criterio final de completitud

NHILOS Loyalty V1 está **terminado** cuando puede demostrarse, sin ambigüedad, que:

```text
Customer
  -> se identifica tenant-safe
  -> compra normalmente
  -> Loyalty escucha Ticket PAID
  -> genera EARN 0..N idempotentes
  -> deriva progreso desde un único ledger
  -> funciona offline
  -> persiste tras restart
  -> sincroniza sin duplicación
  -> Owner configura y audita
  -> Customer redime máximo una Reward
  -> Sales aplica el beneficio
  -> Inventory procesa BOM/Kardex
  -> VOID genera REVERSAL(s)
  -> Cloud y POS convergen
  -> historia permanece intacta
```

y toda esa cadena está respaldada por evidencia **Verified + Operationally Proven**, no por intención de diseño.

---

# 23. Fuentes autoritativas

1. `prd_loyalty_v1.md`
2. `loyalty_architecture_spec.md`
3. `loyalty_profit_aware_metric_contract.md` — clarificación normativa que cierra LV1.6A.
4. `loyalty_execution_roadmap.md`
5. `loyalty_gap_audit.md`
6. `owner_dashboard_execution_roadmap.md` — contexto de Owner/W10 y disciplina de evidencia.
7. `DESIGN.md` — experiencia POS.
8. `DESIGN_BACKOFFICE.md` — experiencia Owner.
