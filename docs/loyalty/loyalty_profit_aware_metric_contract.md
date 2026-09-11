# NHILOS Loyalty V1 — Profit-aware Metric Contract

**Documento:** `loyalty_profit_aware_metric_contract.md`  
**Estado:** **APPROVED / NORMATIVE CLARIFICATION — Loyalty V1**  
**Versión:** 1.0  
**Fecha:** 2026-09-02  
**Ámbito:** LV1.6 — Profit-aware Reward / Owner Portal  
**Autoridad superior:** `prd_loyalty_v1.md` y `loyalty_architecture_spec.md`  
**Motivo:** cerrar formalmente la semántica pendiente de `retailPrice`, `qualifiedSales` y `effectiveIncentiveRate`.

> **Decisión**
>
> Este contrato cierra el bloqueador documental de `LV1.6A — Metric contract freeze`.
>
> A partir de esta aprobación, `qualifiedSales` y `effectiveIncentiveRate` están **READY FOR CODE** y forman parte del gate de aceptación de Loyalty V1.
>
> Este documento no modifica ownership de Sales/Inventory/Loyalty, no introduce P&L y no convierte estas métricas en datos contables.

---

# 1. Propósito

Las métricas profit-aware permiten al Owner evaluar si una Reward está siendo comercialmente costosa en relación con las ventas que efectivamente generan Loyalty.

Su finalidad es responder preguntas de diseño de incentivo, por ejemplo:

```text
¿Cuánto me cuesta aproximadamente esta Reward?
¿Cuánto vendió el programa mientras generaba unidades?
¿Qué porcentaje de esas ventas estoy destinando aproximadamente
al costo de esta Reward?
```

No responden:

```text
¿Cuál fue mi utilidad neta?
¿Cuál fue mi margen contable exacto?
¿Cuál fue el costo fiscal histórico de cada ticket?
¿Cuál será el ROI futuro del programa?
```

---

# 2. Invariantes

1. Las métricas son **read-only**.
2. Ninguna métrica genera movimiento de Inventory, BOM, CPP o Kardex.
3. Sales sigue siendo propietario de los importes monetarios del ticket.
4. Inventory sigue siendo propietario de costo/CPP.
5. Loyalty puede conservar en `commercialSnapshot` valores derivados de Sales/Inventory para preservar la semántica histórica.
6. Ninguna métrica altera earning, redemption, balance, Reward eligibility o checkout.
7. Un dato desconocido nunca se representa como `0`.
8. `0` solo se devuelve cuando es un valor real y demostrable.
9. Los cálculos se realizan en NIO.
10. Las métricas son tenant-scoped.
11. No se promedian ni mezclan tenants, monedas ni price contexts implícitamente.
12. `effectiveIncentiveRate` puede superar 100%; nunca se aplica clamp artificial.

---

# 3. Read model normativo

```text
ProfitAwareRewardMetrics
  tenantId
  loyaltyProgramId
  rewardId

  asOfUtc
  windowStartUtc
  windowEndUtc

  retailPriceNio
  estimatedCppNio
  estimatedRewardCostNio

  qualifiedSalesNio
  estimatedIncentiveCostInWindowNio
  effectiveIncentiveRatePct

  freshness
```

Cada campo calculado usa un estado explícito:

```text
AVAILABLE(value, metadata?)
NOT_AVAILABLE(reason)
STALE(value, freshnessMetadata)
NOT_APPLICABLE(reason)
```

`STALE` conserva el valor calculable y expone que una o más fuentes requeridas no están frescas conforme al contrato general de freshness del Owner Portal.

---

# 4. Ventana temporal de métricas

## 4.1 Ventana V1

`qualifiedSales` y `effectiveIncentiveRate` utilizan una ventana móvil exacta de **30 × 24 horas**:

```text
windowEndUtc   = asOfUtc
windowStartUtc = asOfUtc - 30 days

window = [windowStartUtc, windowEndUtc)
```

La ventana es semiabierta:

- incluye un Ticket cuyo `paidAt == windowStartUtc`;
- excluye un Ticket cuyo `paidAt == windowEndUtc`.

## 4.2 Autoridad temporal

Se usa `Ticket.paidAt` como autoridad.

Para el ledger, la implementación debe conservar la equivalencia:

```text
automatic LoyaltyTransaction.occurredAt == source Ticket.paidAt
```

No se usa:

- `recordedAt`;
- hora de sincronización;
- hora en que Owner abrió la pantalla;
- timestamp de llegada a PostgreSQL.

## 4.3 Display

El Owner Portal muestra:

```text
Últimos 30 días
```

y debe poder exponer `windowStartUtc`, `windowEndUtc` y `asOfUtc` en metadata/debug/evidence.

---

# 5. `retailPriceNio`

## 5.1 Definición

`retailPriceNio` es el **precio base actual de catálogo en NIO** del producto/variante exacto configurado como beneficio de una Reward `FREE_PRODUCT`.

No es:

- precio promocional;
- precio después de descuento;
- precio Loyalty;
- total fiscal;
- promedio histórico;
- último precio pagado;
- precio de una lista elegida arbitrariamente.

## 5.2 Resolución

```text
if Reward.type != FREE_PRODUCT:
    retailPriceNio = NOT_APPLICABLE

else if reward.variantId != null:
    retailPriceNio = current canonical base price of that exact variant

else:
    retailPriceNio = current canonical base price of reward.productId
```

Si la variante posee un override/base price propio, ese valor prevalece sobre el producto padre.

## 5.3 Múltiples listas de precio

En V1, `retailPriceNio` usa exclusivamente el **canonical/base catalog price**.

Las listas de precio adicionales:

- no se promedian;
- no se toma el menor;
- no se toma el mayor;
- no se intenta adivinar cuál aplicaría al próximo Ticket.

Si el catálogo no puede resolver un único precio base canónico para el producto/variante:

```text
NOT_AVAILABLE(NO_CANONICAL_BASE_PRICE)
```

La UI debe etiquetarlo como **“Precio base actual”**, no como “precio final al cliente”.

---

# 6. `estimatedCppNio`

## 6.1 Definición

Para `FREE_PRODUCT`, es el costo unitario actual estimado en NIO del producto/variante exacto de la Reward.

Fuente:

```text
InventoryCostQueryPort.getCurrentEstimatedCost(productId, branchId?)
```

El port puede resolver internamente:

- CPP directo de producto simple;
- BOM actual × CPP actual de componentes para producto compuesto;
- costo de la variante exacta cuando aplique.

## 6.2 Falta de costo

Si falta un componente, BOM, CPP o cualquier dato necesario:

```text
estimatedCppNio = NOT_AVAILABLE(COST_NOT_RESOLVABLE)
```

No se sustituye con:

- precio de venta;
- costo cero;
- promedio arbitrario;
- costo de otro producto equivalente.

Para `DISCOUNT_AMOUNT`:

```text
estimatedCppNio = NOT_APPLICABLE
```

---

# 7. `estimatedRewardCostNio`

## 7.1 DISCOUNT_AMOUNT

```text
estimatedRewardCostNio
  = Reward.benefit.amountNio
```

Es el valor nominal vigente del beneficio.

Ejemplo:

```text
100 puntos -> C$50 descuento

estimatedRewardCostNio = C$50
```

## 7.2 FREE_PRODUCT

```text
estimatedRewardCostNio
  = estimatedCppNio × rewardQuantity
```

Para V1, `rewardQuantity` es la cantidad explícita configurada en el beneficio.

Si `estimatedCppNio` no puede resolverse:

```text
estimatedRewardCostNio = NOT_AVAILABLE(COST_NOT_RESOLVABLE)
```

---

# 8. Base monetaria histórica de earning

Para poder calcular `qualifiedSales` sin reinterpretar historia con reglas actuales, cada EARN automático V1 debe conservar en su `commercialSnapshot`:

```text
earningBaseNio
```

`earningBaseNio` proviene del `LoyaltyTicketSnapshot` entregado por Sales en el momento del `PAID`.

No es un balance ni un nuevo ledger. Es metadata histórica del movimiento.

## 8.1 SPEND_POINTS

```text
earningBaseNio = Eligible Spend usado por la estrategia
```

Es decir:

```text
productos elegibles
- promociones
- descuentos
- beneficios Loyalty
```

excluyendo impuestos, propinas, cargos de servicio, forma de pago, vuelto y FX.

## 8.2 PRODUCT_STAMPS

```text
earningBaseNio
  = suma del merchandiseNetNioAfterAllBenefits
    de las líneas NORMAL, discretas y elegibles
    que efectivamente produjeron stamps
```

Las líneas `source=LOYALTY_REWARD` se excluyen.

## 8.3 VISIT_STAMPS

Si el Ticket generó el EARN de visita:

```text
earningBaseNio
  = neto de mercancía elegible del Ticket
    usado para validar la visita
```

Si el Ticket no generó la unidad de visita, no existe contribución.

## 8.4 EARN de cero unidades

V1 no crea movimientos `EARN 0`.

Por tanto, `qualifiedSales` representa específicamente:

> **ventas monetarias que efectivamente generaron unidades Loyalty**, no todo gasto que estuvo cerca de calificar.

La UI debe usar el copy:

```text
Ventas que generaron Loyalty
```

Puede mostrar `qualifiedSales` como nombre técnico/API.

---

# 9. `qualifiedSalesNio`

## 9.1 Definición formal

Para un Program y ventana:

```text
qualifiedSalesNio(programId, window, asOf)
  =
  SUM(EARN.commercialSnapshot.earningBaseNio)
```

donde:

```text
EARN.tenantId = tenantId
EARN.loyaltyProgramId = programId
EARN.units > 0
EARN.occurredAt ∈ [windowStartUtc, windowEndUtc)
EARN no está efectivamente revertido a asOfUtc
```

## 9.2 Reversal

Si un EARN incluido en la ventana tiene un `REVERSAL` efectivo antes de `asOfUtc`, su contribución monetaria es **0**.

No se resta el `earningBaseNio` dos veces; el reversal simplemente invalida la contribución del EARN original para esta métrica.

## 9.3 Granularidad

`qualifiedSalesNio` es una métrica de **Program**.

Cuando aparece en la vista de una Reward, representa las ventas que generaron unidades del Program al que pertenece esa Reward durante la misma ventana.

Dos Rewards del mismo Program pueden mostrar el mismo `qualifiedSalesNio`.

---

# 10. Costo estimado de incentivos redimidos en la ventana

Para explicar `effectiveIncentiveRate`, se define la métrica auxiliar:

```text
estimatedIncentiveCostInWindowNio
```

## 10.1 Universo

Se consideran REDEEM de la Reward consultada:

```text
REDEEM.rewardId = rewardId
REDEEM.occurredAt ∈ window
REDEEM no está efectivamente revertido a asOfUtc
```

## 10.2 DISCOUNT_AMOUNT

Cada REDEEM debe preservar en su `commercialSnapshot` el monto realmente aplicado:

```text
appliedBenefitNio
```

Entonces:

```text
estimatedIncentiveCostInWindowNio
  = SUM(REDEEM.commercialSnapshot.appliedBenefitNio)
```

No se multiplica por la definición actual de la Reward si su monto cambió después.

## 10.3 FREE_PRODUCT

Cada REDEEM preserva:

```text
rewardProductId
rewardVariantId?
rewardQuantity
estimatedUnitCostNioAtRedemption?
estimatedCostStatus
costAsOf?
```

La obtención del costo es **best-effort read-only** y nunca puede bloquear checkout.

Si el costo estaba disponible:

```text
estimatedRedemptionCostNio
  = estimatedUnitCostNioAtRedemption × rewardQuantity
```

El costo agregado es:

```text
estimatedIncentiveCostInWindowNio
  = SUM(estimatedRedemptionCostNio)
```

## 10.4 Cobertura incompleta

Si existe al menos un REDEEM `FREE_PRODUCT` no revertido dentro de la ventana cuyo costo no pudo resolverse:

```text
estimatedIncentiveCostInWindowNio
  = NOT_AVAILABLE(INCOMPLETE_REDEMPTION_COST_COVERAGE)
```

No se publica una cifra parcial como si fuera completa.

La venta/redención sigue siendo válida. Solo la métrica queda no disponible.

## 10.5 Cero redenciones

Si:

```text
qualifiedSalesNio > 0
redemptionCount == 0
```

entonces:

```text
estimatedIncentiveCostInWindowNio = C$0
```

Este sí es un cero válido.

---

# 11. `effectiveIncentiveRatePct`

## 11.1 Definición

Es el porcentaje estimado de las ventas que generaron Loyalty que fue consumido por el costo de las redenciones de **esa Reward** en la misma ventana.

```text
effectiveIncentiveRatePct
  =
  (estimatedIncentiveCostInWindowNio / qualifiedSalesNio)
  × 100
```

## 11.2 Reglas

Si:

```text
qualifiedSalesNio > 0
estimatedIncentiveCostInWindowNio = AVAILABLE
```

se calcula normalmente.

Si:

```text
qualifiedSalesNio > 0
estimatedIncentiveCostInWindowNio = 0
```

resultado:

```text
0%
```

Si:

```text
qualifiedSalesNio = 0
```

resultado:

```text
NOT_AVAILABLE(NO_QUALIFIED_SALES)
```

No se devuelve `0%`, porque no existe denominador económico sobre el cual interpretar la tasa.

Si el costo agregado está `NOT_AVAILABLE`:

```text
effectiveIncentiveRatePct
  = NOT_AVAILABLE(INCOMPLETE_COST_COVERAGE)
```

## 11.3 No clamp

Un resultado puede ser:

```text
125.00%
```

Esto debe mostrarse tal cual. Una tasa superior a 100% es una señal de diseño comercial deficiente, no un error matemático que deba ocultarse.

## 11.4 Interpretación

Copy recomendado:

```text
Tasa efectiva estimada
Costo estimado de redenciones / ventas que generaron Loyalty
Últimos 30 días
```

No usar:

```text
Margen
Utilidad
ROI
Rentabilidad neta
COGS%
```

---

# 12. Precisión y redondeo

## Money

Los cálculos usan decimal exacto en NIO con al menos 4 decimales internamente.

```text
calculation scale: >= 4 decimals
display: 2 decimals
```

No usar `double` binario como autoridad financiera si el stack dispone de decimal/NUMERIC.

## Rate

```text
calculation: >= 4 decimal places in percentage
display: 2 decimal places
```

Ejemplo:

```text
estimatedIncentiveCost = C$120.0000
qualifiedSales         = C$20,000.0000

rate = 0.6000%
display = 0.60%
```

El redondeo es solo de presentación; no se redondean operandos antes de dividir.

---

# 13. Freshness

Cada respuesta debe conservar el freshness de las fuentes requeridas.

## 13.1 Fuentes

- Catalog/Product: `retailPriceNio`
- Inventory/BOM/CPP: `estimatedCppNio`, `estimatedRewardCostNio`
- Loyalty ledger + snapshots: `qualifiedSalesNio`, redemption count/cost
- Sync/Owner freshness contract: estado de completitud del espejo cloud

## 13.2 Regla

Si el valor es calculable pero la fuente está marcada stale por el contrato transversal:

```text
STALE(value, lastCompleteSyncAt, source)
```

Si no es calculable:

```text
NOT_AVAILABLE(reason)
```

`STALE` y `NOT_AVAILABLE` no son equivalentes.

---

# 14. Tenant isolation

Toda consulta debe recibir el tenant desde la identidad/autorización del request.

No se acepta:

```text
tenantId elegido libremente por query/body
```

Los joins de:

```text
Program
Reward
EARN
REDEEM
Product
Inventory cost
```

deben permanecer tenant-safe y sujetos a RLS/FKs cuando correspondan.

---

# 15. API / DTO contract

Shape conceptual:

```text
ProfitAwareMetric<T> =
  AVAILABLE {
    value: T
    asOfUtc
    metadata?
  }
| STALE {
    value: T
    asOfUtc
    lastCompleteSyncAt?
    source?
  }
| NOT_AVAILABLE {
    reason
    asOfUtc
  }
| NOT_APPLICABLE {
    reason
  }
```

Reward read model:

```text
RewardProfitAwareView
  rewardId
  programId

  window:
    startUtc
    endUtc
    label = LAST_30_DAYS

  retailPriceNio
  estimatedCppNio
  estimatedRewardCostNio

  qualifiedSalesNio
  estimatedIncentiveCostInWindowNio
  effectiveIncentiveRatePct
```

---

# 16. Acceptance Criteria del contrato

## MC-01 — Ventana exacta

Dado `asOfUtc=T`, la ventana es `[T-30d, T)`. Un movimiento exactamente en `T-30d` cuenta y uno exactamente en `T` no.

## MC-02 — qualifiedSales histórico

Dado un EARN con `earningBaseNio=C$250`, la métrica suma C$250 sin recalcular el ticket con la configuración actual del Program.

## MC-03 — Reversal excluye contribución

Dado un EARN dentro de ventana posteriormente revertido, su `earningBaseNio` no contribuye a `qualifiedSalesNio`.

## MC-04 — Precio base

Dada una FREE_PRODUCT con variante y base price propio, `retailPriceNio` usa la variante exacta. Promociones/listas temporales no alteran este valor.

## MC-05 — Múltiples price lists

La existencia de price lists adicionales no produce promedio/min/max. Se usa el canonical base price; si no existe, se devuelve `NOT_AVAILABLE`.

## MC-06 — Reward cost

`DISCOUNT_AMOUNT` usa el monto nominal. `FREE_PRODUCT` usa CPP/BOM actual × cantidad. Costo irresoluble => “No disponible”.

## MC-07 — Rate calculable

Dado:

```text
qualifiedSalesNio = C$20,000
estimatedIncentiveCostInWindowNio = C$120
```

resultado:

```text
effectiveIncentiveRatePct = 0.60%
```

## MC-08 — Sin redenciones

Dado `qualifiedSalesNio > 0` y cero REDEEM no revertidos, la tasa es `0.00%`.

## MC-09 — Sin denominador / costo incompleto

`qualifiedSalesNio=0` => `NOT_AVAILABLE(NO_QUALIFIED_SALES)`.

Un FREE_PRODUCT REDEEM sin costo resoluble dentro de la ventana => costo agregado y tasa `NOT_AVAILABLE`, nunca cálculo parcial silencioso.

## MC-10 — Read-only + tenant/freshness

Calcular estas métricas:

- no genera Kardex;
- no muta CPP;
- no modifica Reward/Program/ledger;
- no cruza tenants;
- propaga `STALE` cuando el freshness transversal lo indique.

---

# 17. Gate de salida LV1.6

LV1.6 queda cerrado únicamente si:

- [ ] `retailPriceNio` cumple precio base canónico.
- [ ] `estimatedCppNio` usa Inventory read-only.
- [ ] `estimatedRewardCostNio` cumple por tipo de Reward.
- [ ] `earningBaseNio` queda congelado en el snapshot de cada EARN automático.
- [ ] `qualifiedSalesNio` usa ventana `[asOf-30d, asOf)`.
- [ ] EARN revertidos no contribuyen.
- [ ] costo de redenciones usa snapshot histórico y cobertura completa.
- [ ] `effectiveIncentiveRatePct` usa la fórmula aprobada.
- [ ] zero / unavailable / stale se distinguen correctamente.
- [ ] MC-01..MC-10 están en PASS.
- [ ] ninguna consulta produce Inventory writes.
- [ ] two-tenant test está en PASS.

---

# 18. Resolución del bloqueador previo

La frase del Execution Roadmap que indicaba que:

```text
qualifiedSales y effectiveIncentiveRate
no estaban Ready for Code
```

queda resuelta por este contrato.

Decisión vigente:

```text
LV1.6A — Metric contract freeze: CLOSED
LV1.6 commercial metrics: READY FOR CODE
Acceptance dependency: CLOSED
```

No quedan fórmulas profit-aware abiertas para Loyalty V1.
