# Proposal: La facturación no se congela por un problema de inventario

## Intent

El terminal y la nube aplican **dos reglas de disponibilidad distintas** sobre el mismo
insumo:

| | Qué mira | Dónde |
|---|---|---|
| **Terminal** | el **agregado** (`insumos.stock`) | `checkout_inventory_preparation_service.dart:327` |
| **Nube** | los **lotes** (FEFO) | `batch-allocation.ts` → `drawBatchOutflow` |

Con la evidencia del rig (SOHO): 50 ml en los lotes, 150 ml en el agregado, política
`ALLOW_TEMPORARY` ⇒ el terminal vende 150 y la nube rechaza. Hasta ahí parece un
desajuste de datos. **Pero el rechazo no es inocuo:**

- `invoices.service.ts:885` mete el flujo en `blockedStreams` ⇒ todas las ventas
  siguientes salen `BLOCKED_BY_PRIOR_FAILURE` (reintentable);
- en el terminal, el registro queda *pending* para siempre
  (`sync_service.dart:1166`).

Es decir: **la nube deja de facturar**. El cliente pagó, el correlativo se congela y el
food park tiene una fila de gente esperando. Para un negocio con clientes en producción,
eso no es un bug de inventario: es el final del negocio.

El dueño lo puso en sus palabras, y es la razón de este change:

> «No podemos dejar hueco o bloqueo, peor con clientes en producción, publicar una
> update así es enterrarnos nosotros mismos como marca.»

## La decisión

**La nube aplica SIEMPRE la factura.** Ningún problema de inventario puede:

- **rechazar** la factura,
- **bloquear** el flujo fiscal,
- dejar un **hueco** en la numeración.

Lo que no cierra en el inventario **no se esconde**: se registra como una **divergencia**
—con su venta, su insumo, sus unidades y su dinero— y se concilia con una
regularización, que es un acto contable con su evidencia.

La idea que ordena el change, y que además es la que el proyecto ya viene aplicando en
la supervisión:

> **La nube es un espejo, no una puerta.** La **terminal** es la puerta (allí se impide
> vender lo que no hay); la **nube** es el espejo (allí se registra lo que pasó, incluso
> cuando no cuadra).

## Scope

### In Scope

- **La capa de inventario deja de rechazar la venta**: dibuja de los lotes lo que puede
  cubrir y registra la diferencia como divergencia, en vez de tumbar el registro.
- **El agregado se aplica igual**: la mercancía salió del negocio; el movimiento contra
  `insumos.stock` no se deshace porque los lotes no alcancen.
- **La divergencia**: entidad, escritura, endpoint y panel en el backoffice, con su
  resolución por regularización.
- **El diagnóstico del origen**: los insumos cuyo agregado no cuadra con la suma de sus
  lotes (el 150 vs 50 de SOHO), nombrados.
- **La terminal**: el resultado nuevo (`APPLIED_WITH_DIVERGENCE`) se ve como **aviso**,
  nunca como bloqueo.

### Out of Scope

- **La regla de disponibilidad por lotes y su publicación al terminal** (que el terminal
  y la nube digan lo mismo sobre lo vendible): es un change propio
  (`lo-vendible-es-lo-registrable`). Este change no lo necesita para cumplir su
  promesa: aun con las dos reglas distintas, **la nube deja de bloquear**.
- **La causa fábrica de divergencias**: la varianza **positiva** de un conteo no puede
  crear un lote (`batches.expiration_date` es NOT NULL ⇒ no se inventa un lote sin
  vencimiento real; el propio código lo declara como caso abierto). Ese hueco está
  documentado en el marco normativo y se **abre como tarea**, no se tapa en este change.
- **La nota de crédito y el ledger de lealtad**: hoy un fallo de lealtad también mete el
  flujo en `blockedStreams` (el mismo defecto, hermano). Se **abre como tarea**: son
  ledgers distintos y merecen su propio análisis.
- **El panel de la cola de revisión de supervisiones** y lo demás ya entregado.

## Capabilities

### New Capabilities

- `inventory-divergence`: una diferencia entre lo que la nube registró y lo que los lotes
  respaldan queda **registrada, visible y conciliable**; nunca frena la facturación.

### Modified Capabilities

- `inventory-batch-management`: el dibujo de una salida por lotes puede dejar una
  diferencia **declarada** en vez de un rechazo.

## Approach

1. **Primero la promesa**: la nube aplica la factura, siempre. El dibujo parcial se
   escribe dentro de la misma transacción que la factura ⇒ no hay ventana en la que una
   cosa aplique y la otra no.
2. **El espejo muestra la diferencia**: la divergencia nace en la misma transacción que
   el movimiento (si la transacción falla, no hay ni factura ni divergencia: se reintenta
   entero, que es lo correcto).
3. **La paridad se mantiene**: tras el movimiento, `agregado = Σ lotes` sigue siendo
   cierto, porque el dibujo parcial consume lo que los lotes cubren y la diferencia se
   lleva contra el agregado, que es donde el tenant declaró la existencia.
4. **El backoffice nombra la causa**: el diagnóstico de *agregado ≠ Σ lotes* dice qué
   insumo tiene el problema y cuánto; sin eso, el dueño persigue la diferencia a ciegas.
5. **Sin huecos**: el bloqueo del flujo fiscal queda reservado para los fallos **fiscales**
   (la numeración, la nota de crédito), que sí son irrecuperables por sí solos.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/admin_backend/src/modules/inventory/batch-allocation.ts` | Modified | El dibujo parcial con divergencia declarada. |
| `apps/admin_backend/src/modules/sales/services/invoices.service.ts` | Modified | La capa de inventario deja de rechazar; la divergencia se registra. |
| `apps/admin_backend/src/modules/inventory/entities/inventory-divergence.entity.ts` | New | La divergencia (tenant, venta, insumo, unidades, dinero, estado). |
| `apps/admin_backend/src/modules/inventory/services/inventory-divergence.service.ts` | New | La escritura, la lectura y el cierre por regularización. |
| `apps/admin_backend/src/modules/inventory/controllers/inventory-divergence.controller.ts` | New | `GET /inventory/divergences` y el diagnóstico de paridad. |
| `apps/admin_backend/src/modules/inventory/` (migración) | Modified | La tabla de divergencias. |
| `apps/owner_dashboard/src/features/inventory/**` | New | El panel de divergencias y el diagnóstico de paridad. |
| `apps/pos_app/lib/data/services/sync_service.dart` | Modified | El resultado nuevo se ve como aviso, no como bloqueo. |

## Risk & Rollback

- **Riesgo**: que la nube acepte una venta que el negocio no quería (stock negativo bajo
  `RESTRICT`). Mitigado por dos vías: la **terminal sigue siendo la puerta** (con su
  check de disponibilidad) y la **divergencia queda visible** con su causa y su dinero.
  El cambio de comportamiento se declara explícitamente en el diseño.
- **Riesgo**: que la divergencia se acumule sin conciliar. Mitigado por el panel y por el
  diagnóstico que nombra los insumos con desajuste (que es donde nacen).
- **Riesgo**: tocar la ruta fiscal. Mitigado por la forma del cambio: la **aplicación**
  de la factura no se toca; lo que cambia es qué se hace con el inventario cuando no
  cuadra (antes: no había factura; ahora: hay factura y una divergencia).
- **Rollback**: la escritura de divergencias es **aditiva** (una tabla y un panel). El
  comportamiento del dibujo parcial se puede volver a estricto con un flag de
  configuración por tenant; mientras tanto, el rollback es el revert del código, que
  deja el sistema en el estado anterior (con su congelamiento, que es justo lo que se
  vino a matar).

## Normativa (R-nn)

Este change toca inventario, así que declara su cumplimiento (marco normativo):

- **R-04** (NIC 2 §23-24, identificación específica): la salida por lotes se dibuja del
  **lote identificado** (FEFO). El tramo sin cobertura **no se promedia en silencio**:
  queda declarado como divergencia con su cantidad y su dinero ⇒ la identificación
  faltante se ve, no se disuelve en un promedio.
- **R-01** (menor entre costo y mercado): el tramo sin cobertura se valoriza con el
  **CPP** (último costo de compra del kardex) como **aproximación declarada** —la misma
  que ya declara el §5 del marco— y **marcado** como divergencia, no como valor
  silencioso.
- **R-06** (registros y conteos disponibles para la DGI): la divergencia es un **registro**
  con la venta que la originó ⇒ la diferencia queda trazable; no es un hueco.
- **R-05** (conteo físico con listas firmadas y fechadas por hoja): la conciliación es
  una **regularización** (acto contable con su evidencia), no un clic; la lista firmada
  del conteo es la evidencia que la respalda.
- **R-02 / R-03**: **no** cambia el método de valuación ⇒ no se tocan (y si algún día se
  tocaran, R-02 exigiría la autorización escrita de la DGI registrada como evidencia).
