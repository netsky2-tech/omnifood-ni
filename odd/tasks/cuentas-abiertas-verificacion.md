# Cuentas abiertas (Ventas en Espera) — matriz de escenarios y evidencia

**Dispositivo:** S23 Ultra (`R5CWB2LQJDJ`) contra backend local, tenant de pruebas.
**Fecha:** 2026-10-02/03.
**Estado:** en ejecución. Cada fila se cierra con evidencia, no con opinión.

Leyenda: **✔ verificado** · **✗ defecto** · **⚠ hueco/riesgo** · **· pendiente**

---

## A. Crear y mantener cuentas

| # | Escenario | Qué prueba | Resultado |
|---|---|---|---|
| A1 | Guardar una venta en espera con nombre | park con nombre y limpieza del carrito | **✔** Cuenta 1, carrito a cero, botones de cobro deshabilitados |
| A2 | Recuperarla desde "Ventas en Espera" | recall y restauración de items | **✔** volvió con 2 Americanos y C$ 180.00 |
| A3 | Agregarle productos y volver a guardar | acumulación sobre la misma cuenta | **✔** fusionó: 4×Americano + 1×Espresso Doble = **C$ 440.00** (180 + 260) |
| A4 | **Múltiples cuentas abiertas a la vez** | convivencia de varias cuentas | **✗** al guardar con un nombre nuevo **no** se creó la segunda cuenta |
| A5 | Re-guardar una cuenta recuperada | ¿reemplaza o agrega? | **✗ DEFECTO** ver abajo: **duplica** el contenido |
| A6 | Sobreviven al **reinicio de la app** | persistencia real (SQLite) | · |
| A7 | **Cancelar/abandonar** una cuenta | ¿se puede borrar? ¿queda huérfana? | · |

## B. Facturar normalmente con cuentas abiertas

| # | Escenario | Qué prueba | Resultado |
|---|---|---|---|
| B1 | Con una cuenta en espera, **vender y facturar normal** | que la cuenta abierta no interfiera | · |
| B2 | Con **varias** cuentas en espera, vender normal | idem con más estado | · |
| B3 | Volver a la cuenta abierta **después** de facturar | que el recall siga intacto | · |
| B4 | Facturar y que la cuenta en espera **no cambie de total** | aislamiento entre el carrito y las cuentas | · |

## C. Cobrar las cuentas abiertas

| # | Escenario | Qué prueba | Resultado |
|---|---|---|---|
| C1 | Cobrar una cuenta en espera | que el cobro use sus items | **✔** el cobro abrió con C$ 880.00 exacto, TC comercial 36.62, Efectivo precargado, y cerró bien |
| C2 | **La cuenta desaparece de la lista al cobrarla** | no dejar cuentas fantasma | **✔** la lista quedó en "No hay ventas en espera" |
| C3 | Con pago dividido, efectivo + tarjeta | cuenta abierta con cobro mixto | · |
| C4 | Propina y/o descuento manual sobre una cuenta en espera | que las reglas del carrito apliquen igual | · |
| C5 | Cobrar una cuenta con **medias unidades** (2,5 × algo) | redondeo con acumulación | · |

## D. Riesgo y cierre

| # | Escenario | Qué prueba | Resultado |
|---|---|---|---|
| D1 | **Corte Z con cuentas abiertas** | el hueco de compliance: hoy el código **no las mira** | **✗ CONFIRMADO EN APARATO** ver abajo |
| D2 | **Cambiar de operador** con cuentas abiertas | si se heredan o se pierden | · |
| D3 | Ver el **corte X** con cuentas abiertas | si aparecen o no en el reporte parcial | · |
| D4 | Las cuentas abiertas **no llegan a la nube** | ¿el dueño las ve en el dashboard? | · |
| D5 | Cerrar la app a la fuerza (kill) con cuentas abiertas | persistencia ante muerte abrupta | · |

---

## DEFECTO (A4/A5) — el re-guardado DUPLICA el contenido de la cuenta

**Severidad: alta. Es un defecto de dinero.**

Reproducción exacta, con los números del aparato:

1. Se pone en espera un carrito de **3 líneas / C$ 440.00** → queda como "Cuenta 1" (A1).
2. Se recupera desde "Ventas en Espera" → el carrito vuelve con esos items (A2).
3. Se vuelve a poner en espera, escribiendo **otro nombre** ("Cuenta 2").
4. La lista queda: **"Cuenta 1" · 6 productos · C$ 880.00**.

`880 = 440 + 440`, y las líneas pasaron de 3 a 6: **el contenido del carrito se AGREGA al ticket en vez de
REEMPLAZARLO**. Cada ciclo *recuperar + guardar* duplica el saldo (440 → 880 → 1760).

Además, **el nombre escrito se descarta**: no se creó "Cuenta 2" y la cuenta siguió llamándose "Cuenta 1".
El diálogo "Poner Venta en Espera" abre con el campo **vacío** aunque el carrito venga de una cuenta
recuperada, así que no sabe que se está editando una cuenta existente.

**Impacto real:** el cliente paga dos veces la misma ronda, o queda un saldo fantasma en una cuenta que ya
se cobró. Es el peor tipo de defecto en un POS: silencioso y con dinero de por medio.

### Escalada: el defecto llegó a un documento fiscal

En el **Historial de Ventas** del aparato quedó registrado:

```
15   23:16 · Maxwell Orozco [Efectivo]     C$ 880.00
     2x Americano 8oz, 2x Americano 8oz, 1x Espres…
```

La factura 15 se emitió por **C$ 880.00 con las líneas duplicadas adentro**. No es sólo un estado de
pantalla: **se emitió una factura por el doble de los productos**. Y el camino que lo produce es el uso normal
— recuperar la cuenta, agregar una ronda, volver a ponerla en espera, cobrar —, así que le va a pasar a
cualquiera que use cuentas abiertas.

En un POS sujeto a normativa DGI esto deja de ser una molestia y pasa a ser un **comprobante con monto
inflado**, que es lo que más caro se paga.

### Hallazgos colaterales de la misma pantalla

El Historial de Ventas (hueco sin probar) funciona y aporta:

- **Número, hora, cajero, método de pago (Efectivo / Tarjeta / Mixto), total y resumen de items** por fila.
- El **nombre del cajero se resuelve en todas las filas** — el mismo camino del R-18, confirmado.
- Una factura anulada se marca **ANULADA** en rojo, sin borrarse: correcto para DGI.
- El detalle de factura expone **REIMPRIMIR**, **EMITIR NOTA DE CRÉDITO** y **ANULAR FACTURA**.

**Camino correcto:** al guardar con una cuenta cargada, el ticket debe quedar con **el contenido del carrito
actual** (reemplazo), y el nombre debe precargarse o respetarse.

**Causa probable en código:** el guardado usa el ticket cargado (`_activeLoadedHoldTicket`) y **acumula**, en
lugar de reemplazar. Ya existía un `expectedVersion` para concurrencia, así que el reemplazo controlado era
el diseño previsto.

## HUECO CONFIRMADO (D1) — el cierre de caja ignora las cuentas abiertas

Con "Cuenta A" (C$ 80.00) en espera, el menú ⋮ → **Cerrar Caja** abre el diálogo **"Cierre de Caja - Arqueo"**:

```
Resumen de Ventas:
  Efectivo   C$ 100.00
  Tarjeta    C$   0.00
  Código QR  C$   0.00
Efectivo Real en Caja:  0.00
```

**No hay advertencia, no hay bloqueo y la cuenta abierta no aparece en ninguna parte.** Coincide con el
código: cero referencias a tickets en espera en toda la pantalla de caja. Una cuenta abierta cruza el corte
sin que nada la mencione, y la venta que representa **no se cobra ni aparece en ningún reporte**.

Contraste con la industria: Clover **bloquea** el cierre de lote, Square **reporta y excluye** las cuentas
abiertas del ingreso bruto, Revel ofrece reglas explícitas (cerrar a cero / efectivo / crédito / anular), y
Lightspeed las **arrastra al día siguiente marcadas**. Nosotros no hacemos ninguna de las cuatro.

### Sospecha abierta, NO confirmada: dos caminos de cierre con distinta aritmética

Ese **"Efectivo esperado C$ 100.00"** parece incluir sólo el fondo inicial, sin las ventas en efectivo del
turno (entre las facturas 12 y 15 hubo unos C$ 950). Si se confirma, habría dos caminos de cierre con
aritmética distinta: el del menú ⋮ (**Cerrar Caja**) y el de **Control de Caja y Turnos → Cerrar Turno (Corte
Z)**, que es el que validamos con el Z-0002 y **sí** sumaba las ventas (esperado 1290 = fondo 1000 + 190 de
ventas + 200 − 100 de movimientos).

**Hay que compararlos antes de afirmarlo.** Una cifra de gaveta que omite las ventas del turno sería un
defecto de dinero, y ya tuve tres falsos positivos por apurar conclusiones.

---

**Lo que verifiqué mal:** busqué `deleteHoldTicket` y `cancelLoadedHoldTicket`, vi que no los llamaba nadie,
y concluí que cobrar una cuenta no la borraba. **Nunca busqué `liquidateOrder`**, que es el nombre real de la
operación.

**Lo que dice el código:** `sale_view_model.dart:1558-1560`, en el cobro:

```dart
if (_activeLoadedHoldTicket != null) {
  await _tableOrderService.liquidateOrder(_activeLoadedHoldTicket!.id);
  _activeLoadedHoldTicket = null;
} else {
  // Venta directa de mostrador: manda la comanda a cocina
}
```

Liquida la cuenta y además bifurca con criterio. Y el aparato lo confirma: tras cobrar, la lista dice
**"No hay ventas en espera"**.

**Lección, que vale para toda la verificación:** **un grep negativo no es evidencia.** Buscar un símbolo que
no se llama no prueba que la funcionalidad falte: prueba que el nombre buscado no es el que se usa. La forma
correcta es buscar el **llamador** de la operación, o mirarlo en el aparato.

*(Esta es la tercera vez en la sesión que un atajo mío produjo un defecto inventado. Las otras dos las frené
antes de publicarlas; esta llegó al documento.)*

---

## CAUSA RAIZ COMÚN: el servicio está completo, el cableado no

`table_order_service.dart` tiene el juego de herramientas que usa la industria:

| Método | Estado |
|---|---|
| `parkOrder` (:31) | ✔ en uso |
| `getAllOpenOrders` (:94) | ✔ en uso |
| `appendItemsToOrder` (:106) | ✗ **el re-guardado usa esto**, y por definición AGREGA → de ahí la duplicación |
| `mergeOrders` (:140) | ✗ sin usar |
| `transferOrder` (:181) | ✗ sin usar |
| `splitOrderItems` (:213) | ✗ sin usar |
| `liquidateOrder` (:295) | **✔ en uso**, en el cobro (`sale_view_model.dart:1559`) |

**El modelo no hay que rediseñarlo: hay que cablearlo bien.** Es el mismo patrón que ya apareció dos veces
esta noche (el runner de limpieza de la venta de activación, y el flujo de auditoría): servicios completos
con adopción incompleta.

### Plan de arreglo

| # | Arreglo | Tipo |
|---|---|---|
| F1 | Al re-guardar una cuenta cargada, **reemplazar** su contenido (id + `expectedVersion`), no `appendItemsToOrder` | defecto de dinero |
| F2 | Al cobrar, llamar **`liquidateOrder(ticketId)`** para que la cuenta desaparezca | defecto operativo |
| F3 | **Precargar el nombre** en el diálogo de Poner en Espera cuando hay cuenta cargada | UX / causa de F1 |
| F4 | Ofrecer **cancelar/abandonar** una cuenta (no hay ninguna vía de borrado desde la UI) | hueco |
| F5 | Decidir qué hace el **cierre de turno** con cuentas abiertas (bloquear, o cerrar a efectivo explícito) | **decisión de producto** |
| F6 | Evaluar exponer **fusionar / transferir / dividir**, que ya están hechos | oportunidad |

---

## Contexto que ya está firme (código)

- El modelo es **completo**: `HoldTicket` con `name` libre, `items` (el carrito), `tableId` **opcional**,
  `guestCount`, `waiterId`/`waiterName`, `isGlobalTaxExempt` y `version` para concurrencia.
- Persistido en SQLite en **dos tablas** (`hold_tickets` + `hold_ticket_items`) con `saveHoldTicket`
  **transaccional**.
- Hay **dos flujos**: "Poner en Espera" (guardar) y "Recuperar Ventas en Espera" (recall), accesibles desde
  el menú ⋮ — y el botón del carrito, que queda deshabilitado con el carrito vacío.
- **Hueco conocido:** el cierre de turno **no referencia** tickets en espera en ninguna parte de la pantalla
  de caja. Una cuenta abierta al Z es una venta que nunca se cobra y no aparece en ningún reporte.
- **Inconsistencia menor:** el globito del carrito cuenta **unidades** y la lista de cuentas cuenta
  **líneas**. Confunde (me confundió a mí y casi reporto un defecto falso).

## Cómo lo resuelve la industria (para contrastar los resultados)

- *Hold/park*, *open tab* y *table order* son tres cosas distintas; lo que hay acá es **open tab**.
- Acumular items sobre una cuenta existente es **estándar**.
- Identificación sin mesas: **nombre manual**, número de cuenta, o puck — el nombre libre que ya existe.
- **Cierre con cuentas abiertas (todos los sistemas serios lo tratan):** Clover **no deja cerrar el lote**;
  Square las **reporta y las excluye del ingreso bruto**; Revel ofrece cerrar a cero, a efectivo, a crédito
  o anular; Lightspeed las **arrastra al día siguiente marcadas**.
- Para **food park / QSR** la industria **desaconseja** la cuenta abierta sin garantía por riesgo de fuga, y
  recomienda pago al pedir o cuenta digital con tarjeta pre-autorizada.
