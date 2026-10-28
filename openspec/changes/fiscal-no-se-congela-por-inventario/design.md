# Design: La facturación no se congela por un problema de inventario

## 1. El problema, en una frase

La nube **rechaza** una venta cuando los lotes no cubren la salida, y ese rechazo
**bloquea el flujo fiscal** ⇒ el tenant deja de facturar y el correlativo se congela.

## 2. La idea que lo ordena

> **La nube es un espejo, no una puerta.** La **terminal** es la puerta: allí se impide
> vender lo que no hay. La **nube** es el espejo: allí se registra lo que pasó, incluso
> cuando no cuadra.

Esta idea ya es la del proyecto en la supervisión (la credencial se pide en la terminal,
el registro forense vive en la nube; el backoffice revisa después). Lo que cambia aquí es
que **el espejo nunca se rebela contra la puerta**: si el inventario no cuadra, el espejo
lo dice; no cierra la puerta.

La consecuencia operativa es la que el dueño exigió:

- **Ningún hueco** en la numeración (la factura se aplica siempre).
- **Ningún bloqueo**: una diferencia de inventario no puede detener la venta.

## 3. La anatomía del fallo (por qué el castigo fue desproporcionado)

```
terminal:  disponible = agregado (150)  →  policy ALLOW_TEMPORARY  →  VENDE 150
nube:      disponible = Σ lotes (50)    →  drawBatchOutflow        →  RECHAZA
nube:      el rechazo → blockedStreams.add(flujo)                    →  BLOQUEA EL FLUJO
terminal:  el registro queda pending para siempre                    →  NO REINTENTA, NO AVANZA
```

Los dos primeros pasos son un desajuste de datos. El tercero es el que mata: **el
castigo no era «el inventario no cuadra», era «la nube deja de facturar»**.

La causa de fondo del desajuste está identificada y es una incompatibilidad, no una
comparación mal escrita:

**`ALLOW_TEMPORARY` y la gestión por lotes no pueden convivir.** La política permite vender
sin existencias (el agregado puede quedar negativo, y la nube lo permite hoy:
`invoices.service.ts:3109`). Pero una salida por lote **no puede** quedar negativa: un
lote sin vencimiento real no se puede inventar (`batches.expiration_date` es NOT NULL; el
propio código lo declara como caso abierto en `batch-allocation.ts`). Para un insumo con
lotes, «vender sin stock» es una venta que la nube no sabe registrar.

Este change **no** resuelve esa incompatibilidad (eso es el change
`lo-vendible-es-lo-registrable`, que alinea las dos reglas y publica el disponible por
lote). Resuelve lo que **no puede esperar**: que la incompatibilidad no pare el negocio.

## 4. El contrato del dibujo de lotes

Hoy `drawBatchOutflow` lanza `BatchAllocationConflictException('BALANCE_INSUFFICIENT')`
cuando la traza FEFO no cubre la salida, y **no toca ningún lote** (el fallo es atómico
en los lotes ✓). Ese comportamiento se conserva para las rutas que no son fiscales
(merma, variación de conteo): un faltante físico en una merma o en un conteo **no se
puede inventar** y debe seguir siendo un rechazo.

Para la **ruta de venta** el dibujo cambia de forma:

```ts
interface BatchOutflowResult {
  /** Unidades que los lotes respaldan (consumidas de ellos, FEFO). */
  covered: number;
  /** Unidades que los lotes NO respaldan (la diferencia declarada). */
  uncovered: number;
  /** Las trazas de lo que se consumió, para poder revertirlo (R3). */
  traces: BatchOutflowTraceEntry[];
}

drawBatchOutflowPartial(input): Promise<BatchOutflowResult>
```

El llamador de la venta hace tres cosas con el resultado:

1. **Aplica el agregado**: el movimiento contra `insumos.stock` va por la cantidad
   completa (la mercancía salió del negocio). El stock agregado puede quedar negativo: es
   la política del tenant, y aquí es una **constatación**, no un rechazo.
2. **Aplica los lotes**: lo que los lotes respaldan se consume de ellos (FEFO) y deja su
   traza (para la nota de crédito ✓ R3).
3. **Declara la diferencia**: las unidades sin respaldo se registran como divergencia.

### Por qué la paridad sigue valiendo

| | Antes de la venta | Después |
|---|---|---|
| Agregado | 150 | 0 |
| Lotes (Σ) | 50 | 0 |

`agregado = Σ lotes` sigue siendo cierto ✓ porque la diferencia (100) se llevó contra el
agregado, que es donde el tenant declaró la existencia. Lo que se declara no es una
cantidad de stock: es **stock fantasma que se vendió** (lo había en el agregado y no
estaba en ningún lote). Es un hecho físico que hay que explicar, no una cifra que
inventar.

## 5. La divergencia

```
inventory_divergences
  id                  uuid          (PK)
  tenant_id           uuid          (FK)
  invoice_id          uuid          (la venta que la originó)
  invoice_number      varchar       (el número, para leerlo sin hunt)
  insumo_id           uuid          (FK)
  quantity            numeric(14,4) (unidades sin respaldo)
  unit_cost_nio       numeric(14,4) (el CPP en el momento de la venta)
  amount_nio          numeric(14,4) (quantity × unit_cost_nio)
  cause               varchar       (SALE_WITHOUT_LOT_COVERAGE)
  status              varchar       (OPEN | RECONCILED)
  source_device_id    varchar       (la terminal que vendió)
  source_sequence     bigint        (la secuencia del origen)
  created_at          timestamptz
  reconciled_at       timestamptz   null
  reconciliation_ref  varchar       null  (la regularización que la cerró)
  resolution_note     text          null
```

**El valor de la diferencia** usa el **CPP** del insumo (el último costo de compra del
kardex), no el costo del lote: el lote no existe para esa parte. Es la **aproximación
declarada** que el §5 del marco normativo ya declara para el CPP, y aquí además queda
**marcada** (no es un valor silencioso) ⇒ R-01 y R-04 quedan cumplidos sin esconder la
identificación faltante.

**La escritura** ocurre en la **misma transacción** que la factura y el movimiento: si la
transacción falla, no hay ni factura ni divergencia (se reintenta entera, que es lo
correcto). No hay ventana en la que una cosa aplique y la otra no.

**El cierre** es por **regularización** del insumo (un acto contable con su evidencia),
no por un clic: la regularización deja su referencia en la divergencia. Una lista firmada
y fechada del conteo (R-05) es la evidencia que la respalda.

## 6. El resultado hacia la terminal

El vocabulario de resultado de inventario ya existe
(`SaleInventoryOutcomeService`: `APPLIED | APPLIED_NO_INVENTORY_IMPACT | APPLIED_INVENTORY_PENDING`).
Se le añade uno:

```
APPLIED_WITH_DIVERGENCE
  reason: {
    code: 'LOT_COVERAGE_INSUFFICIENT',
    divergences: [{ insumoId, insumoName, quantity, amountNio }],
  }
```

El registro se reporta **aceptado** (`accepted: true`) ⇒ la terminal no lo deja *pending*
y el flujo fiscal no se bloquea. El terminal lo muestra como **aviso** («venta
registrada con una diferencia de inventario por conciliar»), nunca como un error que
impida vender.

## 7. Por qué no hace falta tocar el bloqueo del flujo

`blockedStreams` se alimenta de `!applied.accepted` (`invoices.service.ts:885`). Con este
change, un problema de inventario **deja de producir `!accepted`**: la factura se aplica
y la diferencia se declara ⇒ el flujo no se bloquea ✓. Los fallos **fiscales** (la
numeración, la nota de crédito, la ruptura de secuencia) siguen produciendo
`!accepted` ⇒ el flujo se bloquea como antes ✓. El comportamiento del bloqueo queda,
por tanto, correcto sin tocarlo — y sin tocarlo, que es más seguro.

⇒ Un fallo **de base de datos** (por ejemplo, si la escritura de la divergencia falla)
sí rechaza el registro, pero como **reintentable**: el terminal reintenta el mismo
registro con la misma clave de idempotencia ⇒ la factura entra al reintento ✓. No hay
congelamiento permanente, porque un error de base de datos no es un error de negocio.

## 8. El diagnóstico que falta

El backoffice necesita **nombrar** el origen de la diferencia: los insumos cuyo stock
agregado no cuadra con la suma de sus lotes. Sin eso, el dueño ve «100 ml sin respaldo»
y no sabe de dónde salieron. El diagnóstico es una consulta barata (un `GROUP BY` sobre
`insumos` y `batches`) y es la lista de trabajo real del tenant.

## 9. Lo que este change NO hace (y por qué está bien)

- **No alinea las dos reglas de disponibilidad** (el terminal sigue usando el agregado).
  Es el change `lo-vendible-es-lo-registrable`. Aquí no hace falta: la promesa de este
  change es «la nube no bloquea», y eso se cumple sin alinear las reglas.
- **No inventa lotes**. Un lote sin vencimiento real no existe; la diferencia se declara.
- **No regulariza sola**. El tenant concilia; el sistema registra y muestra.
- **No toca la nota de crédito ni la lealtad** (hermanos del mismo defecto, con su propio
  análisis). Quedan como **tareas abiertas**, no como huecos silenciosos.

## 10. Alternativas descartadas (y por qué)

| Alternativa | Por qué no |
|---|---|
| Que la nube siga rechazando y el terminal bloquee siempre | Con dos terminales, el segundo vende con una proyección vieja y el bloqueo lo atrapa igual: el congelamiento vuelve. Además, el terminal **no conoce** hoy el saldo de lotes de la nube. |
| Que la nube acepte y **no registre** la diferencia | La diferencia se pierde: el dueño descubre el problema en el conteo anual (R-05) y la clasificación de merma ya no es posible. Sin registro, el problema es invisible. |
| Crear un lote negativo para cuadrar | `batches.expiration_date` es NOT NULL ⇒ habría que inventar un vencimiento ⇒ falsear la evidencia de un bien perecedero. |
| Rechazar el movimiento de inventario pero aplicar la factura | El agregado queda con el stock que ya salió ⇒ el siguiente cálculo de disponibilidad parte de una cifra que no es real ⇒ el defecto se propaga al resto del catálogo. |
