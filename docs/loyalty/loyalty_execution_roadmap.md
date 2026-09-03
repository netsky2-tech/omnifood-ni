# NHILOS Loyalty V1 — Execution Roadmap

**Documento:** `loyalty_execution_roadmap.md`  
**Estado:** **PROPOSED / READY FOR EXECUTION**  
**Versión:** 1.0  
**Fecha:** 2026-09-02  
**Autoridad de producto:** `prd_loyalty_v1.md` — APPROVED / AUTHORITATIVE  
**Autoridad de arquitectura:** `loyalty_architecture_spec.md` — APPROVED / ENGINEERING AUTHORITATIVE  
**Baseline de evidencia:** `loyalty_gap_audit.md` — L0 CERRADO  
**Integración de roadmap:** adelanta la porción Loyalty de W10 después del cierre de W7.

---

## 0. Objetivo

Convertir Loyalty V1 en una secuencia de unidades de trabajo cerrables, verificables y reversibles, evitando un bloque monolítico de “Implementar Loyalty”.

Este roadmap no redefine el PRD ni la arquitectura. Su función es ordenar implementación, dependencias, gates, evidencia, rollback y límites de PR para llevar el feature desde el estado real de Batch 14.3 hasta un Loyalty V1 operable para SOHO.

### Invariantes de ejecución

1. **Un solo ledger.** `customer_point_transactions` evoluciona in-place; no se crea un ledger paralelo para puntos, sellos o Rewards.
2. **Append-only.** EARN, REDEEM, ADJUST y REVERSAL nunca corrigen historia mediante UPDATE/DELETE.
3. **Balance derivado.** `Customer.points_balance` deja de ser source of truth; el progreso se deriva por `(tenantId, customerId, loyaltyProgramId)` y puede materializarse únicamente como proyección reconstruible.
4. **Loyalty no escribe Inventory.** Una `FREE_PRODUCT` entra al Ticket mediante Sales; Inventory procesa BOM/Kardex por su flujo normal.
5. **Sales conserva ownership de Ticket/Pricing.** Loyalty no replica promociones, impuestos, propinas, cargos, combinabilidad ni totalización fiscal.
6. **Offline-first.** El checkout fundador de una ubicación/un terminal no depende de WAN.
7. **Exactly-once effect.** El transporte puede ser at-least-once, pero idempotencia y constraints impiden movimientos duplicados.
8. **Una Redemption por Ticket.** Puede haber múltiples EARN —uno por programa elegible— y como máximo un REDEEM.
9. **Unidades enteras V1.** No se redondean silenciosamente datos legacy ni cantidades fraccionarias de PRODUCT_STAMPS.
10. **Permisos efectivos, no roles hardcodeados.** Los defaults por rol no sustituyen `PermissionsGuard`/equivalente.
11. **Cada batch debe cerrar con evidencia.** “Implementado” no equivale a “Verificado”.
12. **Presupuesto de revisión.** Cada PR debe mantenerse por debajo de 400 líneas authored cambiadas; si un outcome no cabe, se divide en PRs apilados con gates propios.

### Modelo de dependencias

```text
LV1.0  Gap Audit — CLOSED
  ↓
LV1.1  Loyalty Program Domain + Migration Foundation
  ↓
LV1.2  Earning Engine
  ↓
LV1.3  Redemption & Reversal
  ├──────────────┐
  ↓              ↓
LV1.4 POS UX    LV1.5 Owner Loyalty / W10
  └──────┬───────┘
         ↓
LV1.6 Profit-aware Reward
         ↓
LV1.7 Hardening + E2E + Cutover
```

**Paralelización permitida:** una vez estabilizados los contratos de LV1.1 y LV1.3, LV1.4 y LV1.5 pueden avanzar en paralelo. Ninguno se considera cerrado sin integrar contra el mismo ledger y los mismos contracts.

---

# LV1.0 — Gap Audit

**Estado inicial:** **CLOSED**.  
**Propósito:** congelar qué existe, qué debe evolucionar y qué debe añadirse antes de tocar el dominio.

## Outcome

Existe una matriz ejecutable del sistema real vs. Loyalty V1 y no quedan incógnitas P0 sobre Customer, ledger, checkout, sync, APIs, RBAC, Audit Trail ni tests existentes.

## Trabajo requerido

No hay implementación funcional en este batch. Su output es evidencia.

La vista de ejecución se normaliza como:

```text
EXISTS  = capacidad existente que se conserva
EXTEND  = capacidad existente que se evoluciona o refactoriza in-place
ADD     = capacidad nueva
```

La clasificación técnica completa del Gap Audit sigue conservando `KEEP / EXTEND / REFACTOR / ADD / REMOVE` cuando esa granularidad sea necesaria para migración.

### Matriz mínima de salida

| Área | Estado de ejecución |
|---|---|
| Customer domain y validación fiscal | EXISTS |
| Asociación Customer -> Ticket | EXTEND |
| Ledger Batch 14.3 | EXTEND |
| `Customer.points_balance` global | EXTEND / REFACTOR |
| LoyaltyService mono-programa | EXTEND |
| Checkout redemption actual | EXTEND |
| Persistencia offline | EXISTS |
| Sync infrastructure | EXTEND |
| Loyalty outbound/inbound records | ADD |
| LoyaltyProgram | ADD |
| RewardDefinition | ADD |
| Progress projection | ADD |
| TicketPaid auto-earning | ADD |
| VOID reversal | ADD |
| QR/customerCode | ADD |
| Owner Loyalty UI | ADD |
| Profit-aware reads | ADD |
| Ledger separado de sellos | PROHIBITED |
| Loyalty -> Kardex direct write | PROHIBITED |
| Cashier manual earning | PROHIBITED |

## Gate de salida

- [x] Inventario de código real cerrado.
- [x] Rutas backend reales inventariadas.
- [x] Semántica actual de balance confirmada.
- [x] Ausencia de TicketPaid auto-earning confirmada.
- [x] Ausencia de idempotencia Loyalty confirmada.
- [x] Ausencia de VOID reversal confirmada.
- [x] Ausencia de Loyalty outbound/inbound sync confirmada.
- [x] 17 tests legacy localizados para preservación/regresión.
- [x] No existe segundo balance de sellos.
- [x] No existe escritura directa Loyalty -> Kardex.

**Exit:** LV1.1 puede iniciar sin más discovery funcional.

---

# LV1.1 — Loyalty Program Domain

**Objetivo:** introducir el modelo multi-programa y preparar la migración in-place del ledger sin activar todavía todo el comportamiento de checkout V1.

## Outcome

NHILOS dispone de un dominio Loyalty program-scoped, tenant-safe y compatible con historia Batch 14.3. El saldo global deja de ser autoridad para nuevo código y existe una proyección reconstruible por Customer + Program.

## Modelo objetivo

```text
LoyaltyProgram
  id
  tenantId
  name
  type:
    SPEND_POINTS
    PRODUCT_STAMPS
    VISIT_STAMPS
  status:
    DRAFT
    ACTIVE
    INACTIVE
  startsAt?
  endsAt?
  earningRule
  eligibilityRule
  configVersion
```

La idea inicial de `rewardRule` se aterriza en arquitectura como un **catálogo de `RewardDefinition`** separado. No se embebe un segundo modelo de recompensa dentro de `LoyaltyProgram` si eso duplicaría la fuente de verdad.

```text
RewardDefinition
  loyaltyProgramId
  type:
    DISCOUNT_AMOUNT
    FREE_PRODUCT
  costUnits
  benefitConfig
  status
  startsAt?
  endsAt?
  configVersion
```

## Work units

### LV1.1A — Migration evidence + expand contract

Ejecutar M0/M1:

- backup reproducible de SQLite y PostgreSQL;
- inspección física de columnas/constraints legacy;
- row counts y reconciliación `Customer.points_balance` vs ledger;
- detección de puntos fraccionarios y `invoice_id` nulo;
- clasificación de ambiente productivo vs fixtures/dev;
- expansión compatibility-first del schema sin borrar columnas Batch 14.3;
- receipt de migración up/down o estrategia de rollback compatible.

**No permitido:** redondear, castear o “sanear” historia sin evidencia.

### LV1.1B — Program + Reward domain

Implementar:

- `LoyaltyProgram` + validación discriminada de reglas;
- lifecycle `DRAFT / ACTIVE / INACTIVE`;
- ventanas UTC `[startsAt, endsAt)`;
- `RewardDefinition` con `DISCOUNT_AMOUNT | FREE_PRODUCT`;
- `configVersion` monotónico;
- restricción de cambio de tipo una vez activado/usado;
- tenant-safe FKs y RLS.

### LV1.1C — Evolve existing ledger

Añadir al ledger existente, según migración aprobada:

```text
loyaltyProgramId
transactionType
units
rewardId?
reversalOfTransactionId?
idempotencyKey
sourceEventId?
actorUserId?
branchId?
terminalId?
reason?
programVersion?
rewardVersion?
commercialSnapshot
origin
occurredAt
recordedAt
legacyImported
```

Mantener columnas legacy durante la ventana dual-read.

### LV1.1D — Projection

Crear `CustomerLoyaltyAccount` como read model reconstruible:

```text
(tenantId, customerId, loyaltyProgramId)
  balanceUnits
  nextRewardId?
  eligibleRewardIds[]
  lastTransactionId?
  projectionVersion
```

Reglas:

- `balanceUnits = SUM(ledger.units)`;
- append + delta de proyección en la misma DB transaction;
- duplicate idempotente no incrementa `projectionVersion`;
- `rebuild()` debe reproducir exactamente el saldo.

### LV1.1E — Legacy classification + dual-read

Ejecutar M2–M6:

- crear `Legacy Points` técnico por tenant cuando exista historia;
- backfill clasificatorio sin inventar Rewards;
- preservar valores fraccionarios legacy sin convertirlos a unidades V1;
- permitir `rewardId = NULL` únicamente para redenciones legacy clasificadas;
- construir/reconciliar projection;
- nuevas superficies leen Program/projection;
- ninguna feature nueva lee `Customer.points_balance` como autoridad.

### LV1.1F — Admin contracts, RBAC y master-data sync

Agregar/estabilizar:

```http
GET  /loyalty/programs
POST /loyalty/programs
GET  /loyalty/programs/:programId
PATCH /loyalty/programs/:programId
POST /loyalty/programs/:programId/activate
POST /loyalty/programs/:programId/deactivate

GET  /loyalty/programs/:programId/rewards
POST /loyalty/programs/:programId/rewards
GET  /loyalty/rewards/:rewardId
PATCH /loyalty/rewards/:rewardId
POST /loyalty/rewards/:rewardId/activate
POST /loyalty/rewards/:rewardId/deactivate
```

Permisos:

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

Extender inbound sync para distribuir Program/Reward/config activos al POS. Si el inbound genérico actual puede transportar esos records, se reutiliza; no se crea infraestructura paralela.

## Gate de salida

- [x] No existe una segunda tabla/ledger autoritativo de Loyalty.
- [x] Program/Reward son tenant-scoped y RLS/FKs rechazan referencias cross-tenant.
- [x] Todas las nuevas reglas son typed/versioned; no se ejecuta JSON arbitrario.
- [x] `Customer.points_balance` ya no es usado por código V1 como source of truth.
- [x] Projection reconstruida == `SUM(ledger)`.
- [x] Duplicate ledger insert no altera balance ni `projectionVersion`.
- [x] Historia legacy se conserva 1:1 y cualquier excepción queda documentada.
- [x] Filas legacy fraccionarias no se redondean.
- [x] Program/Reward config puede llegar al POS y sobrevivir restart.
- [x] Tests legacy que siguen siendo válidos permanecen verdes.

## Evidencia mínima

- migración SQLite desde schema Batch 14.3;
- migración PostgreSQL real;
- RLS/FK two-tenant test;
- projection rebuild test;
- typed-rule validation tests;
- compatibility receipt con las 17 suites legacy.

## PR forecast

- `LV1.1A migration-evidence`
- `LV1.1B program-reward-domain`
- `LV1.1C ledger-projection`
- `LV1.1D admin-contracts-rbac-sync-config`

Cada PR debe ser autónomo, verificable y <400 líneas authored; si no cabe, dividirlo.

---

# LV1.2 — Earning Engine

**Objetivo:** hacer que un Ticket `PAID` genere automáticamente movimientos EARN idempotentes por cada programa elegible.

## Outcome

```text
TicketPaid
   ↓
Build final LoyaltyTicketSnapshot
   ↓
Evaluate ACTIVE programs
   ↓
Generate EARN 0..N
   ↓
Projection + Outbox
```

El cajero deja de ser writer del earning ordinario.

## Work units

### LV1.2A — Sales -> Loyalty snapshot

Definir/adaptar `LoyaltyTicketSnapshot` con:

```text
tenantId
branchId
terminalId
ticketId
customerId?
paidAt
lines[]:
  lineId
  productId
  variantId?
  categoryId?
  quantity
  merchandiseNetNioAfterAllBenefits
  source = NORMAL | LOYALTY_REWARD
```

Sales entrega el neto por línea ya resuelto. Loyalty no vuelve a prorratear promociones/descuentos globales.

### LV1.2B — Strategy engine

Implementar estrategias deterministas:

**SPEND_POINTS**

```text
eligibleSpendNio
  = suma de líneas elegibles post-promos/descuentos/beneficios Loyalty

earned
  = floor(eligibleSpendNio / spendBlockNio) * pointsPerBlock
```

**PRODUCT_STAMPS**

- cuenta cantidades discretas enteras de productos/categorías elegibles;
- respeta `unitsPerPurchasedUnit`;
- ignora líneas `source=LOYALTY_REWARD`;
- cantidades pesables/fraccionarias no son elegibles en V1.

**VISIT_STAMPS**

- un Ticket elegible genera como máximo una visita lógica por Program;
- aplica `minimumSpendNio` cuando esté configurado;
- luego multiplica por `unitsPerVisit`.

### LV1.2C — TicketPaid handler

Integrar `TicketPaid` como único writer automático del earning:

1. revalidar Customer activo y tenant;
2. reconstruir snapshot final PAID;
3. evaluar Program `ACTIVE` dentro de ventana de earning;
4. append un EARN por Program elegible;
5. snapshot comercial/versiones;
6. actualizar proyección;
7. insertar outbox en la misma unidad local de commit.

Si no existe Customer válido, Loyalty hace no-op y Sales completa la venta.

### LV1.2D — Idempotency

Keys canónicas:

```text
EARN = loyalty:earn:{tenantId}:{ticketId}:{programId}
```

Constraints:

- único por `(tenantId, ticketId, loyaltyProgramId)`;
- mismo key + mismo payload => ACK/no-op;
- mismo key + payload diferente => integrity conflict.

### LV1.2E — Outbound ledger sync

Extender `/v1/sync/batch` o su contrato genérico con records `LOYALTY_LEDGER`.

Requisitos:

- ledger + outbox en la misma SQLite transaction;
- retry seguro después de restart;
- Cloud dedupe por idempotency;
- `pending sync` nunca bloquea la próxima venta.

## Gate de salida

- [x] Un Ticket retry no duplica EARN.
- [x] Un mismo Ticket puede generar EARN independientes en SPEND, PRODUCT y VISIT.
- [x] `SPEND_POINTS` usa NIO y `floor` exactamente una vez.
- [x] PRODUCT_STAMPS es quantity-aware y excluye reward lines.
- [x] PRODUCT_STAMPS nunca redondea cantidades fraccionarias.
- [x] VISIT_STAMPS genera máximo una visita lógica por Program/Ticket.
- [x] `startsAt` incluye; `endsAt` excluye usando `paidAt` UTC.
- [x] Program `INACTIVE` no genera EARN.
- [x] Payment failure no deja EARN.
- [x] Customer desactivado entre preview y PAID no genera EARN y no bloquea Sales.
- [x] EARN conserva `programVersion` + `commercialSnapshot`.
- [x] Sync duplicate produce ACK/no-op.
- [x] Evaluación local de un Ticket común cumple objetivo <100 ms en hardware fundador con config cargada.

## Evidencia mínima

- unit tests por estrategia;
- integration test TicketPaid -> ledger -> projection -> outbox;
- retry/double-tap test;
- offline + restart + resend test;
- performance receipt en dispositivo fundador.

---

# LV1.3 — Redemption & Reversal

**Objetivo:** convertir Rewards elegibles en beneficios de checkout sin consumir saldo antes de `PAID`, y compensar correctamente todo efecto Loyalty de un `VOID`.

## Outcome

```text
Reward available
      ↓
RedeemReward
      ↓
RedemptionIntent
      ↓
RewardApplication -> Sales Ticket
      ↓
Payment succeeds
      ↓
REDEEM
```

Y:

```text
Ticket VOID
   ↓
Find unreversed EARN/REDEEM
   ↓
REVERSAL(s)
```

Nunca `DELETE`.

## Work units

### LV1.3A — Reward eligibility + RedemptionIntent

Implementar `RedeemReward` con precondiciones:

- permiso `loyalty.redeem`;
- Customer activo y tenant-safe;
- Program `ACTIVE`;
- Reward `ACTIVE` y dentro de su propia ventana;
- saldo local derivado suficiente;
- no existe otra RedemptionIntent en el Ticket;
- Sales acepta la aplicación/combinabilidad.

Antes de `PAID`, la intención no consume unidades.

### LV1.3B — RewardApplication -> Sales

**DISCOUNT_AMOUNT**

- Sales aplica monto fijo al Ticket;
- no puede producir total inválido;
- Loyalty no reemplaza Pricing.

**FREE_PRODUCT**

- se agrega o marca una línea explícita del producto/variante configurado;
- `source=LOYALTY_REWARD`;
- no genera earning recursivo;
- Inventory procesa normalmente BOM/Kardex tras `PAID`.

### LV1.3C — PAID consolidation

En la misma unidad local de commit:

```text
Ticket PAID
  -> REDEEM 0..1
  -> EARN 0..N
  -> projection
  -> outbox
```

Idempotency:

```text
REDEEM = loyalty:redeem:{tenantId}:{ticketId}
```

Unique constraint por `(tenantId, ticketId)` para REDEEM V1.

### LV1.3D — VOID reversal

`ReverseTicketLoyalty`:

- obtiene EARN/REDEEM del Ticket;
- por cada movimiento aún no revertido agrega:

```text
REVERSAL.units = -original.units
reversalOfTransactionId = original.id
```

Idempotency:

```text
REVERSAL = loyalty:reversal:{tenantId}:{originalTransactionId}
```

Un retry del VOID debe retornar éxito/no-op.

### LV1.3E — Audit correlation

Registrar como mínimo:

```text
LOYALTY_REDEMPTION
LOYALTY_REVERSAL
```

Correlación esperada:

```text
SALE_VOIDED
  -> TicketVoided
  -> LOYALTY_REVERSAL(s)
```

## Gate de salida

- [x] Preview/selección de Reward no consume saldo.
- [x] Pago fallido no deja REDEEM.
- [x] Como máximo existe un REDEEM por Ticket.
- [x] Reward expirada/inactiva no redime y no elimina saldo.
- [x] `LoyaltyProgram.endsAt` no bloquea REDEEM si el Program sigue ACTIVE.
- [x] `INACTIVE` sí bloquea REDEEM.
- [x] FREE_PRODUCT usa línea explícita Sales y Loyalty no genera Kardex.
- [x] Reward line no genera earning.
- [x] VOID genera reversals exactos de los movimientos del Ticket.
- [x] Reintentar VOID no duplica reversals.
- [x] REVERSAL puede dejar saldo negativo.
- [x] Historias antiguas conservan costo/beneficio vía snapshot aunque la Reward cambie después.

## Evidencia mínima

- E2E discount reward;
- E2E free-product reward con stock mutado exclusivamente por Inventory;
- failed payment test;
- one-redemption constraint test;
- VOID/retry test;
- historical reward-version test;
- Audit Trail correlation receipt.

---

# LV1.4 — POS Loyalty Experience

**Objetivo:** integrar Loyalty al flujo normal de caja sin crear una pantalla paralela de “sellar tarjeta”.

## Outcome

```text
1. Identificar Customer
2. Construir Ticket normalmente
3. Mostrar progreso/recompensa elegible
4. Aplicar Reward opcional
5. Cobrar
6. Earning automático al PAID
7. Mostrar progreso actualizado
8. Imprimir resultado
```

Todo debe funcionar offline en la topología SOHO de un terminal usando la última configuración válida local.

## Work units

### LV1.4A — CustomerIdentificationPort

Extender la identificación existente con adaptadores:

```text
QR
CUSTOMER_CODE
PHONE
SEARCH
```

Reglas del `customerCode`:

- opaco y no predecible;
- tenant-scoped;
- no contiene PII;
- identifica, no autentica;
- QR recomendado como representación del mismo identificador;
- rotación no cambia `CustomerId` ni ledger.

### LV1.4B — Loyalty compact state

Con Customer asociado al Ticket, mostrar sin desplazar el checkout:

- programas relevantes;
- balance/progreso;
- próxima Reward;
- Rewards elegibles;
- estado de configuración desactualizada cuando aplique.

No mostrar un “saldo global” si existen múltiples programas.

### LV1.4C — Reward interaction

- CTA solo para Reward elegible;
- confirmación explícita del operador/cliente;
- si cambia el Ticket, re-evaluar la intención;
- si deja de ser elegible, invalidar selección;
- jamás auto-redimir al alcanzar umbral.

### LV1.4D — Post-PAID feedback

Mostrar feedback compacto:

```text
+25 puntos
+2 sellos
Te faltan 3 para tu recompensa
Recompensa disponible
```

El mensaje se deriva de ledger/projection post-commit.

### LV1.4E — Receipt 58/80mm

Integrar bloque Loyalty al receipt formatter:

```text
Programa
Earning de la venta
Reward redimida, si aplica
Saldo/progreso posterior
Siguiente Reward / recompensa disponible
```

Nunca omitir ni alterar datos fiscales obligatorios por incluir Loyalty.

### LV1.4F — Offline/restart UX

- operar con última config sincronizada;
- `pending sync` no bloquea venta;
- restart conserva ledger/outbox;
- señal discreta de config stale, sin modal bloqueante cuando el POS puede seguir operando.

## Gate de salida

- [x] QR/customerCode identifica al Customer correcto dentro del tenant.
- [x] Teléfono/búsqueda existente siguen funcionando como fallback.
- [x] Ningún QR/customerCode expone PII.
- [x] El cashier no tiene acción "Agregar punto/sello" para earning ordinario.
- [x] Progreso por programa visible antes y después del pago.
- [x] Reward elegible puede aplicarse y revocarse antes de PAID.
- [x] Operación completa funciona sin WAN en un solo terminal.
- [x] Restart preserva pending transactions/outbox.
- [x] Receipt 58/80 imprime Loyalty sin romper formato fiscal.
- [x] Config stale se comunica sin bloquear checkout.

## Evidencia mínima

- widget/UI tests;
- scanner/manual code integration test;
- offline golden path;
- restart golden path;
- snapshot/golden receipt 58/80;
- accesibilidad básica y keyboard/focus según backoffice/POS conventions aplicables.

---

# LV1.5 — Owner Loyalty / W10

**Objetivo:** adelantar la porción Loyalty de W10 ahora que W7 está cerrada, sin esperar al resto del roadmap del Owner Dashboard.

## Scope

El Owner debe administrar como mínimo:

```text
Programa
Mecánica
Producto/categoría elegible
Regla de earning
Meta / costo en unidades
Reward
Vigencia
Estado
Customer progress
Ledger/history
Ajuste manual autorizado
Audit trail relacionado
```

Fixture comercial de aceptación:

```text
Smash Burger Club
PRODUCT_STAMPS
Smash Burger
1 sello / unidad
10 sellos
1 Smash Burger gratis
Activo
```

## Work units

### LV1.5A — Programs UI

Consumir los contratos de Programs para:

- listar;
- crear DRAFT;
- editar;
- activar;
- inactivar;
- filtrar por status/type;
- mostrar `configVersion`/estado de forma trazable cuando sea útil.

Form por mecánica:

**SPEND_POINTS**

```text
spendBlockNio
pointsPerBlock
exclusiones por producto/categoría
```

**PRODUCT_STAMPS**

```text
producto/categoría elegible
unitsPerPurchasedUnit
```

**VISIT_STAMPS**

```text
minimumSpendNio?
unitsPerVisit
```

### LV1.5B — Rewards UI

Owner/Manager autorizado puede:

- crear `DISCOUNT_AMOUNT`;
- crear `FREE_PRODUCT`;
- definir `costUnits`;
- seleccionar producto/variante para FREE_PRODUCT;
- definir vigencia;
- activar/inactivar;
- ordenar presentación.

No existen Rewards porcentuales ni compuestas en V1.

### LV1.5C — Customer Loyalty profile

Extender Customer UI para consumir:

```http
GET /customers/:customerId/loyalty/accounts
GET /customers/:customerId/loyalty/transactions?program_id=...
```

Mostrar:

- progreso por programa;
- next reward / eligible rewards;
- ledger explicativo;
- ticket/reward/reversal/actor cuando aplique;
- nunca un “balance global” como verdad V1.

### LV1.5D — Adjustment supervisado

Acción visible como **Ajuste manual**, no “Agregar puntos”.

Input:

```text
Customer
Program
deltaUnits integer != 0
reason mandatory
```

Requisitos:

- permiso `loyalty.adjust`;
- actor obligatorio;
- confirmar impacto si deja saldo negativo;
- append-only ADJUST;
- Audit Trail durable.

### LV1.5E — RBAC

Aplicar permisos efectivos:

- Owner: defaults completos;
- Manager: según policy efectiva;
- Cashier: sin configuración ni adjustment;
- Waiter: sin administración;
- lectura operativa de reward/customer en POS no implica permiso de administrar Program/Reward.

### LV1.5F — Cloud -> POS convergence

Prueba de aceptación del flujo administrativo:

```text
Owner crea/activa Program + Reward
  ↓
Cloud persiste con RLS/audit
  ↓
Inbound sync
  ↓
POS recibe nueva configVersion
  ↓
Checkout la evalúa localmente
```

## Gate de salida

- [x] Owner puede configurar los tres tipos de Program.
- [x] Owner puede crear y mantener Rewards V1.
- [x] Fixture “Smash Burger Club” se crea, activa y llega al POS.
- [x] Program DRAFT no aparece como ejecutable en POS.
- [x] Program/Reward changes incrementan configVersion.
- [x] Customer profile muestra progreso derivado y history program-scoped.
- [x] Adjustment positivo/negativo requiere actor + razón + permiso.
- [x] Cashier sin permiso recibe deny de backend aunque intente llamar la API directamente.
- [x] Todas las mutaciones críticas generan Audit Trail.
- [x] UI sigue `DESIGN_BACKOFFICE.md` y estados stale/errores no se confunden con datos autoritativos.

## Evidencia mínima

- CRUD API integration tests;
- browser/UI tests;
- role/permission negative tests;
- two-tenant isolation test;
- audit test;
- cloud->POS config sync contract test;
- fixture de aceptación “Smash Burger Club”.

---

# LV1.6 — Profit-aware Reward

**Objetivo:** dar al Owner una lectura económica útil de una Reward sin convertir Loyalty en contabilidad ni permitirle manipular stock/costo.

## Resultado visible esperado

Una Reward puede exponer, cuando exista contrato de dato suficiente:

```text
retailPrice
estimatedCPP
qualifiedSales
estimatedRewardCost
effectiveIncentiveRate
```

## Decisión de arquitectura

Loyalty solo consume **read ports**. No existe command port Loyalty -> Inventory.

```text
InventoryCostQueryPort
  getCurrentEstimatedCost(productId, branchId?)
    -> MoneyNio | NOT_AVAILABLE
```

## Work units

### LV1.6A — Metric contract freeze

Antes de implementar fórmulas, congelar semántica y fuente de cada métrica.

**Ya definido por PRD:**

- `DISCOUNT_AMOUNT.estimatedRewardCost` = valor nominal del beneficio;
- `FREE_PRODUCT.estimatedRewardCost` = costo actual estimado disponible vía producto/BOM/CPP;
- sin costo resoluble => `NOT_AVAILABLE` / “No disponible”.

**Debe formalizarse antes de codear:**

- ventana exacta de `qualifiedSales`;
- denominador/fórmula exacta de `effectiveIncentiveRate`;
- si `retailPrice` usa precio vigente, precio base o variante;
- tratamiento cuando existan múltiples precios/listas.

No inventar estas fórmulas desde UI.

### LV1.6B — Read-only ports

Conectar lecturas de:

- Product/Catalog para retail price vigente;
- Inventory/BOM/CPP para costo estimado;
- Sales/reporting para qualified sales una vez aprobada su definición.

Ninguna consulta produce movimiento de inventario.

### LV1.6C — DTO/read model

Exponer valores con estado explícito:

```text
AVAILABLE(value)
NOT_AVAILABLE(reason)
STALE(optional metadata)
```

No enviar cero cuando el dato es desconocido.

### LV1.6D — Owner presentation

Mostrar:

- precio de venta;
- CPP/costo estimado;
- costo estimado de Reward;
- métricas aprobadas de incidencia;
- copy visible de que son métricas de diseño de incentivos, no P&L ni costo histórico del ticket.

## Gate de salida

- [ ] FREE_PRODUCT con costo disponible muestra un costo consistente con el read port.
- [ ] Sin BOM/CPP resoluble muestra “No disponible”; nunca una cifra inventada.
- [ ] DISCOUNT_AMOUNT usa valor nominal del beneficio.
- [ ] Ninguna lectura de profit-aware genera stock movement/Kardex.
- [ ] Fórmulas de `qualifiedSales` y `effectiveIncentiveRate` están documentadas y aprobadas antes de quedar en producción.
- [ ] Métricas respetan tenant y freshness.

## Bloqueador explícito

`qualifiedSales` y `effectiveIncentiveRate` aparecen como objetivo del roadmap, pero el PRD/Architecture actuales no fijan una fórmula suficiente para implementarlos sin inventar semántica. **LV1.6 no se considera Ready for Code para esas dos métricas hasta cerrar ese contrato.** El resto del read model de costo sí puede avanzar.

---

# LV1.7 — Hardening + E2E

**Objetivo:** cerrar Loyalty V1 como feature operable, migrable, observable y recuperable.

## Outcome

El siguiente flujo queda probado de extremo a extremo:

```text
Customer identificado
  -> Ticket normal
  -> Loyalty muestra progreso/Reward
  -> Reward opcional entra al Ticket
  -> Ticket PAID
  -> REDEEM 0..1 + EARN 0..N
  -> projection actualizada
  -> receipt
  -> offline/restart safe
  -> sync sin duplicación
  -> Owner ve Program/Customer/history
  -> VOID genera REVERSAL(s)
```

## Work units

### LV1.7A — Migration cutover M7

Activar oficialmente los nuevos writers:

- TicketPaid auto-earning;
- Reward-scoped redemption;
- REVERSAL;
- idempotency constraints;
- outbound ledger sync;
- inbound Program/Reward config;
- inbound cloud-origin ADJUST.

Después del cutover ningún writer ordinario modifica un balance global como verdad.

### LV1.7B — Legacy retirement M8

Después de evidencia de estabilidad:

- deprecar façades legacy de puntos;
- retirar lecturas V1 de `points_balance`/`balance_after`;
- mantener historia física mientras lo exija migración/auditoría;
- retirar columnas solo con migración separada y evidencia de que ningún consumer las necesita.

### LV1.7C — Sync fault suite

Cubrir:

- duplicate resend;
- same idempotencyKey + different payload -> integrity conflict;
- crash antes/después de local commit;
- restart con outbox pending;
- cloud ADJUST inbound;
- no echo loop POS/CLOUD;
- stale config offline + snapshot histórico;
- cursor replay.

### LV1.7D — Security / isolation

Probar con PostgreSQL real:

- tenant A no lee/escribe Customer/Program/Reward/ledger de B;
- tenant-safe FKs;
- RLS `WITH CHECK`;
- forged tenant body/query no cambia scope;
- permissions para read/write/adjust/redeem.

### LV1.7E — Audit / antifraud

Verificar:

- Program/Reward create/update/activate/deactivate;
- Adjustment;
- Redemption;
- Reversal;
- hash-chain/integrity transversal;
- metadata sin PIN/JWT/card/PII innecesaria;
- correlación SALE_VOIDED -> TicketVoided -> Loyalty Reversal.

### LV1.7F — Performance + founder hardware

En el terminal fundador:

- evaluación común <100 ms con config cargada;
- QR/customerCode usable sin degradar checkout;
- receipt 58/80;
- offline sale/redemption;
- restart/recovery;
- sync posterior.

### LV1.7G — Full regression

Conservar y extender las 17 pruebas Batch 14.3. La nueva suite debe demostrar como mínimo los 28 escenarios normativos de `loyalty_architecture_spec.md`.

## Gate de salida final

### Ledger / correctness

- [ ] EARN idempotente por Ticket+Program.
- [ ] Múltiples EARN y máximo un REDEEM por Ticket.
- [ ] Projection == SUM(ledger).
- [ ] Duplicate no incrementa `projectionVersion`.
- [ ] REVERSAL es compensatorio, nunca DELETE.
- [ ] ADJUST puede ser negativo con actor/razón.
- [ ] Semántica histórica sigue interpretable tras cambios de config.

### Earning / Reward

- [ ] SPEND_POINTS calcula Eligible Spend NIO correcto.
- [ ] PRODUCT_STAMPS respeta cantidades discretas y excluye Reward lines.
- [ ] VISIT_STAMPS produce máximo una visita lógica.
- [ ] `endsAt` detiene EARN y no destruye redención válida.
- [ ] Reward inactive/expired no redime y conserva saldo.
- [ ] FREE_PRODUCT pasa por Sales y Inventory normal.

### Offline / sync

- [ ] WAN caída no bloquea earning/redemption single-terminal.
- [ ] Restart conserva ledger/outbox.
- [ ] Duplicate sync converge.
- [ ] Integrity conflict no sobrescribe historia.
- [ ] Stale config conserva snapshot/version aplicada.
- [ ] Cloud ADJUST converge al POS.
- [ ] customerCode rotation converge eventualmente por inbound sync.

### Security / audit

- [ ] Two-tenant isolation en DB real.
- [ ] RLS + tenant-safe FK probados.
- [ ] Cashier sin adjustment/config write.
- [ ] Audit events críticos presentes y correlacionables.
- [ ] QR/customerCode sin PII.

### UX / Owner

- [ ] Customer se identifica por QR/código + fallback.
- [ ] POS muestra progreso/reward sin pantalla paralela.
- [ ] Receipt incluye Loyalty.
- [ ] Owner configura Program/Reward y ve Customer progress/history.
- [ ] Fixture “Smash Burger Club” funciona end-to-end.
- [ ] Profit-aware muestra costo o “No disponible” sin tocar Inventory.

### Performance / operations

- [ ] Evaluación común <100 ms en hardware fundador.
- [ ] `pending sync` no bloquea ventas.
- [ ] Rollback/recovery fue ensayado.
- [ ] Evidencia indexada por batch/PR y estado: Planned -> Implemented -> Verified -> Operationally Proven.

## Rollback / recovery

Rollback nunca borra ni reescribe el ledger.

Orden de recuperación preferido:

1. detener activación de nueva configuración si existe un defecto de reglas;
2. inactivar Program/Reward afectado cuando el problema sea comercial/configurable;
3. mantener schema expandido compatible mientras se revierte application code;
4. reconstruir projection desde ledger si existe divergencia;
5. reintentar outbox/cursor idempotentemente;
6. toda corrección de unidades se expresa como ADJUST/REVERSAL, no UPDATE de historia;
7. no revertir a `points_balance` como source of truth para “salir del paso”.

---

# 8. PR / review plan

Los IDs LV1.x son outcomes de producto/arquitectura, **no un único PR por milestone**.

Forecast recomendado:

| Orden | PR / work unit | Focus |
|---:|---|---|
| 1 | LV1.1A Migration evidence | M0/M1, compatibility, no data loss |
| 2 | LV1.1B Program + Reward domain | typed rules, lifecycle, tenant safety |
| 3 | LV1.1C Ledger + projection | in-place evolution, rebuild, idempotency schema |
| 4 | LV1.1D Admin/RBAC/config sync | APIs, permissions, inbound master data |
| 5 | LV1.2A Snapshot + strategies | Sales contract, SPEND/PRODUCT/VISIT |
| 6 | LV1.2B TicketPaid + outbox | auto-earning, local atomicity, sync |
| 7 | LV1.3A Redemption workflow | intent, RewardApplication, one redemption |
| 8 | LV1.3B Reversal + audit | VOID compensation, correlation |
| 9 | LV1.4A Identification + progress | QR/code/fallback, compact POS state |
| 10 | LV1.4B Reward UX + receipt | checkout CTA, post-paid, 58/80 |
| 11 | LV1.5A Programs/Rewards Owner UI | W10 Loyalty administration |
| 12 | LV1.5B Customer/history/adjust UI | projection, ledger, permissions, audit |
| 13 | LV1.6A Cost read model | Inventory read-only cost + Owner display |
| 14 | LV1.6B Commercial metrics | only after metric contract freeze |
| 15 | LV1.7A Hardening/cutover | M7, fault/security suite |
| 16 | LV1.7B E2E/legacy retirement | M8 after stability evidence |

**Mandatory review rule:** forecast o diff real >=400 authored additions+deletions => re-slice antes de merge.

---

# 9. Non-goals de este roadmap

No se debe introducir durante Loyalty V1:

- Consumer Portal;
- ProgramMembership / enrollment VIP;
- balances separados de sellos;
- Rewards porcentuales/compuestas;
- sustitución automática de FREE_PRODUCT;
- expiración individual de puntos/sellos;
- partial refund Loyalty sin contrato previo de Sales;
- multi-terminal offline double-spend resolution;
- WAN lock/reservation de saldo;
- “last balance wins”;
- branch targeting de Programs en V1 arquitectónico; `branchId` queda como trazabilidad;
- cantidades fraccionarias para PRODUCT_STAMPS;
- writes Loyalty -> BOM/Kardex/stock;
- earning manual ordinario por Cashier;
- portal Owner calculando P&L o costo histórico a partir de la métrica profit-aware.

---

# 10. Criterio de cierre de Loyalty V1

Loyalty V1 se considera **DONE** únicamente cuando LV1.0–LV1.7 están cerrados y existe evidencia de que:

```text
Customer
  -> se identifica de forma tenant-safe
  -> compra normalmente
  -> puede obtener múltiples earnings por programas elegibles
  -> puede aplicar como máximo una Reward
  -> Ticket PAID consolida ledger idempotente
  -> progreso deriva del ledger único
  -> receipt comunica resultado
  -> el flujo opera offline y sobrevive restart
  -> Cloud converge sin duplicados
  -> Owner configura y audita Loyalty
  -> VOID compensa con REVERSAL
  -> Inventory solo cambia por Sales/Inventory
```

No se acepta como cierre un demo visual, una suite únicamente mocked ni una migración que ignore historia Batch 14.3.

---

# 11. Fuentes autoritativas

1. `prd_loyalty_v1.md` — autoridad de producto y Acceptance Criteria.
2. `loyalty_architecture_spec.md` — autoridad de ingeniería, migración, idempotencia, sync, RBAC y verification suite.
3. `loyalty_gap_audit.md` — baseline de código real y disposición EXISTS/EXTEND/ADD.
4. `owner_dashboard_execution_roadmap.md` — contexto W10, disciplina de PRs/evidencia y roadmap del Owner Portal.
5. `DESIGN_BACKOFFICE.md` — patrones visuales/accesibilidad del portal.

