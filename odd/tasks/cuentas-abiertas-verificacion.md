# Cuentas abiertas (Ventas en Espera) — matriz de escenarios y evidencia

**Dispositivo:** S23 Ultra (`R5CWB2LQJDJ`) contra backend local, tenant de pruebas.
**Fecha:** 2026-10-02/03.
**Estado:** en ejecución. Cada fila se cierra con evidencia, no con opinión.
**Re-verificación 2026-10-03 (build 9014 de `fix/open-account-lifecycle`, instalada por `adb install -r`
sobre la misma firma, SQLite intacto):** se cerraron A4, A5 y A7, y se probaron en aparato el bloqueo del
Corte Z y el listado del Corte X. Evidencia al final del documento.

Leyenda: **✔ verificado** · **✗ defecto** · **⚠ hueco/riesgo** · **· pendiente**

---

## A. Crear y mantener cuentas

| # | Escenario | Qué prueba | Resultado |
|---|---|---|---|
| A1 | Guardar una venta en espera con nombre | park con nombre y limpieza del carrito | **✔** Cuenta 1, carrito a cero, botones de cobro deshabilitados |
| A2 | Recuperarla desde "Ventas en Espera" | recall y restauración de items | **✔** volvió con 2 Americanos y C$ 180.00 |
| A3 | Agregarle productos y volver a guardar | acumulación sobre la misma cuenta | **✔** fusionó: 4×Americano + 1×Espresso Doble = **C$ 440.00** (180 + 260). **Aclarado post-arreglo:** sigue siendo correcto, pero ahora la acumulación viene de *editar el carrito cargado*, no de un doble-escritura (ver A5) |
| A4 | **Múltiples cuentas abiertas a la vez** | convivencia de varias cuentas | **✔ re-verificado 2026-10-03** conviven sin pisarse: `PRUEBA R1` (1 · C$ 80.00) junto a `Cuenta A` (1 · C$ 80.00). El comportamiento original esperado ("nombre nuevo crea cuenta nueva") fue **reemplazado por decisión del dueño**: re-estacionar con nombre nuevo **renombra** la cuenta, no crea una |
| A5 | Re-guardar una cuenta recuperada | ¿reemplaza o agrega? | **✔ corregido y re-verificado 2026-10-03** recall de `PRUEBA A4` (3 líneas · C$ 280.00) → re-guardar tal cual → sigue **3 productos · C$ 280.00**. Antes: 6 / C$ 560.00. Renombrar `PRUEBA R1` → `PRUEBA R2` deja **una** cuenta con el mismo dinero |
| A6 | Sobreviven al **reinicio de la app** | persistencia real (SQLite) | · |
| A7 | **Cancelar/abandonar** una cuenta | ¿se puede borrar? ¿queda huérfana? | **✔ construido y re-verificado 2026-10-03** papelera roja por fila + confirmación que nombra la cuenta, sus líneas y su total. Tras abandonar, la cuenta desaparece de la lista y el carrito queda limpio |

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

---

## Estado post-arreglo (2026-10-03)

Este documento registra lo observado en el aparato y **no se reescribe**: las filas conservan lo que se
vio en el S23. Lo que cambió desde entonces está en `odd/tasks/cuentas-abiertas-open-accounts-fix.md`,
en la rama `fix/open-account-lifecycle`:

| Hallazgo | Estado |
|---|---|
| A4/A5 — el re-guardado duplica el contenido y descarta el nombre | **corregido y re-probado en el aparato 2026-10-03** (`replaceOrderItems` + cableado del ViewModel, commit 9bd557f5) |
| A7 — no hay forma de abandonar una cuenta | **construido y re-probado en el aparato 2026-10-03** (confirmación + `abandonHoldTicket`, commit 4efc2c53) |
| F2 (cobrar liquidaba la cuenta) | ya estaba bien: era un falso positivo por buscar `deleteHoldTicket` en lugar del llamador real. |
| D1 — el cierre ignora las cuentas abiertas | **decidido: bloquear el cierre (estilo Clover)**, diferido fuera de este slice. |
| F5/F6 | F5 diferido (ver arriba), F6 sin empezar. |
| Nuevo defecto encontrado al construir F4 | la lista "Ventas en Espera" reventaba en **debug** apenas había ≥1 cuenta (`shrinkWrap` + `IntrinsicWidth` de `AlertDialog`); el APK del aparato era release, por eso nunca se vio. Corregido en 4efc2c53. |
| Riesgo restante | **F8**: una cuenta ya duplicada en el SQLite del aparato se sigue recuperando duplicada. El arreglo corta el daño de aquí en adelante, no repara el pasado. |

Filas de la matriz que siguen sin evidencia: C3, C4, C5, D2, D3, D4, D5.


---

## Re-verificación en hardware — 2026-10-03 (build 9014)

Artefacto probado: release de `fix/open-account-lifecycle` instalada con `adb install -r` (misma firma
`d44db6eb…` que la build anterior, uid 10277 intacto → **no se perdió SQLite**). Se subió el build-number
a 9014 porque el rig venía de una actualización OTA con versionCode 4014 y Android rechaza el downgrade.
Sesión: Maxwell Orozco (OWNER), modo operativo local, **sin tocar la nube ni sincronizar**.

| Fila | Qué se vio en la pantalla | Veredicto |
|---|---|---|
| A5 dinero | `PRUEBA A4` recuperada → 3 líneas · C$ 280.00 → re-guardada → **3 productos · C$ 280.00** | **PASS** |
| A5 rename | banner `Está editando la cuenta abierta "PRUEBA R1". Al guardar se reemplazan sus productos y su nombre; no se crea una cuenta nueva.` → guardar como `PRUEBA R2` → **una** cuenta, C$ 80.00 | **PASS** |
| A4 convivencia | `PRUEBA R1` + `Cuenta A` listadas a la vez, cada una con su total | **PASS** |
| A7 abandonar | `¿Abandonar cuenta? La cuenta "PRUEBA R2" tiene 1 producto por C$ 80.00. Nada de esto ha sido facturado. Al abandonarla se descarta definitivamente: no se puede deshacer.` | **PASS** |
| Prefill (T3) | `Editar Cuenta Abierta` con el nombre ya escrito, sin tipear | **PASS** |
| F5 bloqueo Z | `Bloqueo de Corte Z — Cuentas Abiertas` nombrando **cada** cuenta con líneas y total, un solo control `ENTENDIDO`, y el cierre no se inició | **PASS** |
| T9 Corte X | fila `Cuentas abiertas · 1 · C$ 80.00` dentro de `CORTE X (TURNO EN CURSO)`, con el pie `La lectura X es informativa y no cierra el turno de caja.` | **PASS** |
| F7 diálogo | el listado de cuentas renderizó sin errores en el aparato | **PASS** (el crash era exclusivo de debug; cubierto además por tests widget) |

**No se tocó:** `Cuenta A` (cuenta del dueño, quedó intacta en 1 · C$ 80.00), COBRAR (ninguna factura
emitida), confirmación de Corte Z (ningún Z quemado), Sincronizar Nube.

**Consecuencia que hay que resolver:** el rig quedó con la build de esta rama (9014), que **no incluye**
lo que se desplegó por OTA (4014). Como 9014 es más alto, la próxima OTA necesita un versionCode mayor a
9014 para poder instalarse por encima, o el aparato hay que desinstalarlo (y se pierde el SQLite local).

**Corrección medida después (2026-10-03 15:55):** el servidor del rig es `http://localhost:3000/api`,
procedencia *"Configuración guardada en este dispositivo"*, y llega al backend local por un
**`adb reverse tcp:3000`** sobre USB — no por red. El canal OTA también es local: `app_releases` tiene
`3014`, `4014` y `6014` (esquema `X014`, todos 1.0.1). O sea que el conflicto de versionCode es contra el
canal de pruebas local, no contra producción, y se deshace publicando un `X014 > 9014` o instalando por
`adb install -r` con un número mayor. Las facturas con formato DGI (`100101000000041`…) que el rig sincronizó
están en el Postgres de esta máquina, lo que confirma que la tubería fiscal de este aparato desemboca acá.

**Queda pendiente de matriz:** A6 (reinicio de app), B1-B4 (facturar con cuentas abiertas), C3-C5, D2-D5.

## B/C en hardware — 2026-10-03 (build 9014) y resolución de sus hallazgos

La pasada de B1-B4/C3-C5 se hizo con el aparato ya encendido y sesión abierta. Resultado:

| Fila | Qué se vio | Veredicto |
|---|---|---|
| B1 | Factura 18 (C$ 80) emitida con `Cuenta A` abierta y sin tocarla | **PASS** |
| B2 | Facturas 19-20, varias cuentas conviviendo | **PASS** |
| B3/B4 | Recuperar + re-guardar conserva totales (el fix F1 se mantiene) | **PASS** |
| C3 | Pago partido Efectivo + QR → factura 20 | **PASS** |
| C4 | Propina cobrada (C$ 66) pero la factura muestra C$ 60 | **PASS con hallazgo → ver abajo** |
| C5 | Medio producto / cantidad fraccionada | **NO EJERCIBLE → ver abajo** |

Cuatro cosas salieron de esa pasada. Las tres primeras quedaron resueltas el mismo día;
la cuarta quedó como decisión de producto.

### K1 — la cuenta facturada seguía apareciendo como abierta (DEFECTO, ARREGLADO)

Al cobrar una cuenta recallada, el camino de checkout llamaba `liquidateOrder` (borra la fila
de SQLite) y ponía `_activeLoadedHoldTicket = null`, pero **nunca** volvía a cargar
`_holdTickets`, que es la lista que renderiza el diálogo de recuperación. La cuenta seguía
visible como abierta aunque ya no existiera: el operador podía volver a recallarla y cobrarla
de nuevo. Es la misma clase de defecto que el duplicado original: el estado en memoria no
refleja la base de datos.

Prueba que lo reproduce y que ahora pasa (RED → GREEN):
`test/ui/features/sales/open_account_list_refresh_after_checkout_test.dart`. En RED el DAO
devolvía vacío y `vm.holdTickets` todavía traía `Cuenta A`. Commit `2cc6ff94`.

### C4 — la propina no entra al total fiscal (NO ES DEFECTO)

`sale_view_model.dart` lo dice explícito con referencia a la norma: el total cobrado es
*total fiscal + propina voluntaria*, y la propina se mantiene **fuera** del total imponible
(DGI INV-16.1). La propina sí queda registrada: el snapshot (`tipAmountNio`, `tipAmountUsd`,
`tipPercentage`, `tipEligibleBaseNio`) se persiste en el momento del checkout. Por eso la
factura muestra C$ 60 y el cajón recibió C$ 66. Comportamiento correcto; se cierra sin cambio.

### C5 — cantidades fraccionadas (HUECO DE FUNCIONALIDAD, no defecto)

El stepper de cantidad del POS es de enteros, así que "2.5 unidades" no se puede ingresar.
No es una regresión de esta rama ni un bug: es una funcionalidad que no existe. Va como slice
aparte; mezclarla acá agrandaría el cambio sin relación con las cuentas abiertas.

### K3 — "descartar el carrito borra la cuenta sin avisar" (NO REPRODUCIBLE)

El reporte decía que al vaciar el carrito de una cuenta recallada la cuenta desaparecía sin
confirmación. Se probó determinísticamente con una base de datos real en memoria:

| Paso | carrito | cuenta cargada | lista | SQLite |
|---|---|---|---|---|
| tras park | 0 | — | 1 | `Cuenta A`/1 |
| tras recall | 1 | `Cuenta A` | 1 | `Cuenta A`/1 |
| **tras vaciar el carrito** | **0** | `Cuenta A` | **1** | **`Cuenta A`/1** |
| tras re-park con otro producto | 1 | — | 1 | `Cuenta A`/1 (Panini) |

Vaciar el carrito **no** elimina la cuenta: sigue en SQLite y sigue en la lista. Además el único
método que suelta la cuenta en memoria (`cancelLoadedHoldTicket`) no tiene llamadores en `lib/`,
y el único camino que la borra de verdad (`abandonHoldTicket`) ya pide confirmación nombrando
cantidad y total. No se agregó ningún diálogo para un camino que no existe.

Lo que la tabla sí muestra, y es real: al re-parkear con un carrito distinto, el contenido anterior
se **reemplaza** (Espresso → Panini) sin decir cuánto se pierde. Eso es la semántica REPLACE que
se decidió para F1, y el diálogo ya la anuncia ("Al guardar se reemplazan sus productos y su
nombre"). Lo que falta es que anuncie **qué** se pierde, con números, como lo hace el abandono.
Queda como decisión de producto, no se implementó por iniciativa propia.

### Método: por qué la pasada anterior falló en el aparato

`adb shell uiautomator dump` no devuelve nada útil sobre esta app: Flutter dibuja todo en un
solo canvas y no expone nodos de accesibilidad salvo que se active semantics. Por eso los taps
se estaban calculando a ciegas y terminaron inflando un carrito a C$ 1.600 y botando la app.
La forma que sí funciona es leer la captura de pantalla y calcular la coordenada sobre la
imagen, un tap por vez.
