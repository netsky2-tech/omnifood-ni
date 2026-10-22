# Decisión: La disponibilidad derivada NUNCA bloquea la venta (A-3)

> Estado: **DECIDIDO** (2026-10-21, por el dueño con esta investigación)
> Corrige a: `lo-vendible-es-lo-registrable` (FD-02) · Parte de: `fiscal-no-se-congela-por-inventario` (FD-01)
> Consecuencia: el **bloqueo por lotes** que FD-02 implementó **se revierte**.

## 1. La pregunta

El terminal y la nube pueden discrepar sobre cuánto hay vendible (el agregado, los
lotes, la proyección de otra terminal). La solución habitual en el comercio
electrónico es **reservar** el stock en la nube en el momento del pago (ATP + holds):
una escritura que o toma el stock o le dice al cliente antes de que su dinero se mueva.

El dueño la descartó de entrada, y con razón:

> «Sería problema si la nube no responde y la venta tiene que salir, esto rompería
> nuestro offline first y parte de la esencia de nuestro producto.»

Lo que pedía: **explorar bien la solución ideal, investigar cómo se suele hacer en la
industria, evaluar opciones y tomar la mejor decisión para nuestro caso**.

## 2. Lo que hace la industria (la evidencia)

| Fuente | Lo que dice |
|---|---|
| **Kassly** (POS de restaurantes) | *«It never blocks a sale. This is the design, not a gap.»* Un plato con 0 porciones se sigue vendiendo. *«A POS that refuses a dish the kitchen can actually cook is worse than one showing a stale count»*, porque la cifra derivada es una foto de un instante, envejece en cuanto otra caja vende lo mismo, y *«an offline terminal cannot see the sales that have not synced yet»*. |
| **BANA (BOM)** | El material se **reserva al agregarlo al carrito** (no al pagar) y *«when a material is short the item is refused right in the cart»*… salvo los materiales con **allow oversell**: *«still let through when its stock is short, and its stock goes negative»*. Y: *«Running out … sends its stock negative with a warning, never falling through… That negative number is exactly the signal a merchant needs to know the kitchen cooked more without logging a production order, so it can be reconciled at close of day»*. |
| **Square (Recipes)** | Si un ingrediente no alcanza, el plato se marca agotado… *«You can override the sold-out status and still sell the item from your point of sale»*. |
| **Comercio omnicanal (ATP + holds)** | La reserva vive en el **checkout con una autoridad viva**, con **TTL de minutos** y un *reaper* que libera lo caducado. *«Reserve at order confirmation and accept that a 0.1% shortfall is cheaper than the machinery»* ⇒ el default industrial es **no reservar** en un catálogo normal. |
| **POS offline / handheld** | *«Offline lanes should log transactions and reconcile on connectivity restore with conflict resolution rules»*; la reserva optimista (*«reserve 1 x SKU123 at location A»*) se hace **«when connectivity exists»**, con TTL de 2–5 minutos. |
| **Almacén offline (GS1 EPCIS)** | *«Two scanners can each believe the last stock is available… the server must apply the agreed reservation or conflict policy»* — pero *«if the physical picks already occurred, the exception requires an operational reconciliation»*, y la interfaz debe mostrar *«which request was accepted, which remains unresolved»* (no un «sync failed» genérico). |
| **Conteo de perecederos** | *«Cycle counts must include **lot checks**, not just quantity; discrepancies should trigger a recount»*. |

**Los cinco patrones que se repiten:**

1. **La cifra derivada nunca se convierte en un bloqueo** (Kassly, Square, BANA).
2. **El faltante se vuelve un número negativo**, que es *la señal* que se concilia al
   cierre del día (BANA).
3. **La verdad del lote la da el conteo**, no un candado.
4. **La reserva sólo existe cuando hay red**, y con TTL de minutos: es el modelo del
   *e-commerce con entrega pendiente*, no del mostrador.
5. **El POS es la verdad comercial, no la única verdad**: POS, conteos, mermas y compras
   se reconcilian en un solo cuadro operativo.

## 3. Qué clase de negocio somos

Un food park: el cliente pide, se le prepara y se lo come **en el sitio**. No hay pedido
pendiente, ni almacén que reserve, ni promesa de entrega. El producto no se «reserva»
para nadie: se consume.

⇒ El modelo ATP+holds resuelve un problema que **no tenemos** (el mismo cliente
compitiendo por el mismo stock desde dos canales) y **no** el que tenemos (el mostrador
y el tenedor de lotes no están sincronizados, y en un food park muchas veces no hay
nadie más que el operador).

## 4. Las opciones

### Opción 1 — Reserva en la nube (ATP / soft hold)

El terminal pide una reserva antes de cobrar; la nube la concede con TTL.

- **A favor**: elimina la sobreventa entre terminales; es el estándar del comercio
  electrónico.
- **En contra**: **rompe el offline-first** (si la nube no responde, ¿qué hace el
  mostrador?); exige un *reaper* de caducidades y una cola de reservas liberadas
  (un sistema nuevo con su propio modo de fallo); y en nuestro caso **reserva stock
  para un cliente que se lo come en el sitio**.
- **Veredicto**: **descartada** (por el dueño, y por la industria: el default es no
  reservar).

### Opción 2 — El lote como puerta (FD-02 tal como quedó implementado)

El terminal se niega a vender si los lotes no cubren; la nube acepta la venta y declara
la diferencia (FD-01).

- **A favor**: la venta y la trazabilidad coinciden; no se fabrican diferencias.
- **En contra**: **le puede negar al cliente un producto que la cocina sí puede
  preparar** — y la causa sería un registro faltante, no la falta de leche. Convierte un
  problema de contabilidad en un bloqueo de negocio. Viola el principio del dueño
  («nunca bloquear»).
- **Veredicto**: **descartada** — el bloqueo se revierte.

### Opción 3 — La disponibilidad es ADVISORIA (la elegida)

La **puerta** de la venta es la regla del tenant sobre el stock **declarado**
(`RESTRICT` rehúsa, `ALLOW_TEMPORARY` deja que el stock quede negativo). Los **lotes**
no deciden: son la verdad de trazabilidad, y esa verdad la fija el **conteo**.

- La cifra por lotes viaja al terminal y se **muestra** (al cajero y a la cocina):
  «quedan 50 ml en los lotes».
- El faltante **viaja con la venta** ⇒ la nube lo **DECLARA** (FD-01) ⇒ el dueño lo
  ve en «Conciliación» y lo cierra con un **conteo que dice en qué lote está el
  sobrante** (A-1).
- El stock negativo **es la señal** (BANA), no un accidente.

- **A favor**: el negocio nunca se detiene; la diferencia se ve y se concilia; coincide
  con la práctica industrial; no introduce un sistema nuevo (ni reservas, ni TTL, ni
  reapers).
- **En contra**: la diferencia se fabrica con más frecuencia (si el bookkeeping de
  lotes está atrasado) ⇒ ⇒ **por eso A-1 es la mitad de esta decisión**: el conteo con
  lote es lo que la cierra.
- **Veredicto**: **ELEGIDA**.

### Opción 4 — Un «modo mostrador» por tenant

Un ajuste del tenant que activa el bloqueo por lotes sólo para quien lo quiera.

- **A favor**: cubre el caso de quien sí quiere el bloqueo (una tienda con almacén).
- **En contra**: es una bistantería de la que nadie sabe qué significaba; y para
  nosotros es una puerta que el dueño dijo que no quiere.
- **Veredicto**: **descartada** (y si algún día hace falta, es un ajuste, no una regla).

## 5. La decisión

> **La disponibilidad derivada nunca bloquea.** La puerta es la regla del tenant sobre
> el stock declarado. Los lotes son la verdad de trazabilidad, y la fija el **conteo**.
> La diferencia se **declara** (FD-01) y se **concilia** (A-1). No hay reservas en la
> nube.

**Lo que cambia en el código:**

1. **Se revierte el bloqueo por lotes del terminal** (FD-02): la disponibilidad que
   decide vuelve a ser el agregado declarado + la política del tenant. El shortage por
   lotes se **mide y se reporta** (`lotShortages` en el resultado de la preparación),
   en vez de rechazar la venta.
2. **Se revierte el rechazo de `ALLOW_TEMPORARY` en un insumo perecedero** (FD-02): su
   razón («la nube no puede registrar esa venta») se evaporó con FD-01 — la nube la
   registra y declara la diferencia. La política vuelve a ser del tenant; el
   backoffice la explica (incluido el costo: cada venta que la use genera una
   diferencia por conciliar).
3. **Se conserva la publicación** del disponible por lote (`lotAvailableStock`): ahora
   sirve para el aviso (al cajero y a la cocina) y para que la nube declare la
   diferencia con la magnitud exacta.
4. **A-1 pasa a ser la mitad de esta decisión**: el conteo dice **en qué lote** está
   el sobrante ⇒ el conteo cierra la paridad y la trazabilidad.

## 6. Lo que esta decisión NO promete

- **No elimina la diferencia**: dos terminales con la misma proyección pueden vender
  más de lo que hay ⇒ la segunda venta la declara la nube. Lo que cambia es que la
  diferencia es **esperada y conciliaable**, no un accidente.
- **No arregla el bookkeeping atrasado**: si las compras no crean lotes, las
  diferencias seguirán apareciendo ⇒⇒ por eso el diagnóstico de paridad (FD-01) y
  el conteo con lote (A-1) son la parte importante.
- **No promete que el cajero sepa lo que hay en la nevera**: el número es una
  DECLARACIÓN; el conteo es el físico. La cocina sigue siendo la fuente de la
  realidad, como en cualquier restaurante.

## 7. Normativa (R-nn)

- **R-04** (identificación específica): la trazabilidad por lote se conserva en el
 libro — y ahora con el conteo que la fija (A-1). La venta deja de depender del
  registro de lotes para poder concretarse ⇒ **la identificación es un control, no un
  bloqueo**.
- **R-01**: sin cambio de valuación.
- **R-05 / R-06**: el conteo por lotes y la lista firmada por hoja son la evidencia
  que cierra la diferencia (A-1); la divergencia declarada es el registro que la DGI
  puede pedir (FD-01).
