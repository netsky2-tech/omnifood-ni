# Proposal: El conteo dice en qué lote está el sobrante (A-01)

## Intent

Una varianza **positiva** de un conteo es stock que **aparece**. El código lo decía
explícitamente (`batches.expiration_date` es NOT NULL ⇒ no se puede inventar un lote sin
vencimiento real) y lo dejaba entrar **sólo en el agregado**, sin lote detrás.

Esa es la **fábrica de divergencias** del sistema: el agregado crece, los lotes no, y la
siguiente venta de ese insumo encuentra los dos números distintos ⇒ la nube declara la
diferencia (FD-01) y el dueño tiene que cazarla a ciegas.

El dueño lo dijo sin rodeos:

> «No queremos que se cree algo sin lote y cause problemas después, el conteo debe
> poder decir en qué lote está el sobrante.»

Y la industria hace exactamente eso: *«Cycle counts must include **lot checks**, not just
quantity; discrepancies should trigger a recount»*.

## Scope

### In Scope

- **El conteo dice el lote**: cada observación (la entrada del conteo) puede declarar en
  qué lote se hizo ⇒ el sobrante entra **por ese lote** y la paridad queda restaurada.
- **Sin lote, el conteo no se postea**: para un insumo por lotes, una varianza positiva
  sin lote declarado se rechaza con un mensaje que explica qué falta ⇒ **no se crea
  stock sin lote**.
- **La evidencia**: la entrada guarda el lote (id) y el número del lote tal como se
  vio en la estante (la evidencia del R-05).

### Out of Scope

- **La varianza negativa**: sigue saliendo por FEFO de los lotes (el comportamiento
  documentado); el conteo puede nombrar el lote, pero no cambia el criterio de salida.
- **La interfaz del terminal** (el selector de lote en el conteo): es la mitad de la
  historia y va en el change siguiente; la nube ya acepta el lote (orden de despliegue:
  **la nube antes que la terminal**).
- **La regularización como vía de cierre**: ya existe (FD-01) y no cambia.

## Capabilities

### Modified Capabilities

- `inventory-batch-management`: el conteo entra por el lote que se contó, y un sobrante
  sin lote declarado no se puede postear.

## Approach

1. **El lote es de la observación, no de la línea**: una línea puede tener varias
   entradas (una por lote) ⇒ el lote viaja en la **entrada** (`batchId` + `batchNumber`).
2. **El sobrante entra por su lote**: la varianza positiva suma al `remaining_stock` del
   lote declarado ⇒ el agregado y los lotes vuelven a cuadrar.
3. **Sin lote no se postea**: un insumo por lotes con sobrante y sin lote declarado ⇒
   el conteo se rechaza con el mensaje que dice qué falta. La regla se aplica **donde
   el hecho entra al libro**, no en un aviso previo.
4. **El número del lote es la evidencia**: se guarda tal como se leyó en la estante
   (R-05: las listas firmadas y fechadas por hoja).

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/admin_backend/src/modules/inventory/dto/count-session-document.dto.ts` | Modified | La entrada declara el lote. |
| `apps/admin_backend/src/modules/inventory/entities/count-session-entry.entity.ts` | Modified | La entrada guarda el lote y su número. |
| `apps/admin_backend/src/migrations/1810090000000-AddCountSessionEntryLot.ts` | New | Las dos columnas (aditivas y anulables). |
| `apps/admin_backend/src/modules/inventory/count-session.service.ts` | Modified | El sobrante entra por su lote; sin lote, el conteo no se postea. |
| `apps/pos_app/**` | Modified | El terminal declara el lote en el conteo (change siguiente). |

## Risk & Rollback

- **Riesgo**: un conteo que antes se posteaba y ahora se rechaza (el operador no dijo
  el lote). Es el comportamiento pedido (no crear stock sin lote) y el mensaje dice
  exactamente qué hacer. Los insumos **sin** lotes no cambian.
- **Riesgo**: que el lote declarado sea de otro insumo ⇒ se rechaza con un mensaje
  explícito.
- **Rollback**: la columna es aditiva y anulable; el comportamiento se puede revertir
  con el código (la nube volvería a accepting el conteo sin lote ⇒ el estado anterior).

## Normativa (R-nn)

- **R-04** (NIC 2 §23-24, identificación específica): el conteo es el hecho físico y
  ahora **lleva la identificación**: la entrada al libro conserva el lote que se
  contó ⇒ la identificación específica deja de ser una aspiración y tiene su hecho.
- **R-05** (conteo físico con listas firmadas y fechadas por hoja): el número del lote
  tal como se vio en la estante es parte de la evidencia de la hoja.
- **R-06** (registros disponibles para la DGI): el lote del conteo queda en el registro
  ⇒ la diferencia entre el agregado y los lotes tiene su explicación documentada.
- **R-01**: sin cambio de valuación (el CPP del insumo sigue valuando la variación).
