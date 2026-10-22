# Proposal: Lo que el terminal puede vender es lo que la nube puede registrar

> ⚠️ **CORREGIDO por `disponibilidad-derivada-no-bloquea` (FD-03, 2026-10-21).**
> La regla que este change implementó —**el terminal se niega a vender si los lotes no
> cubren**— **se revierte**: la disponibilidad derivada nunca bloquea (la evidencia de
> la industria y el principio del dueño: «nunca bloquear»). Lo que se conserva de aquí
> es la **publicación** del disponible por lote, que ahora sirve para el aviso y para
> que la nube declare la diferencia con la magnitud exacta.

## Intent

El terminal y la nube aplican **dos reglas de disponibilidad distintas** sobre el mismo
insumo:

| | Qué mira | Consecuencia |
|---|---|---|
| **Terminal** | el **agregado** (`insumos.stock`) | vendía 150 ml con 50 ml en los lotes |
| **Nube** | los **lotes** (FEFO) | rechazaba esa venta |

La diferencia se fabricó una divergencia de inventario en producción (la evidencia del
rig: 50 ml en los lotes, 150 ml en el agregado, política `ALLOW_TEMPORARY`), y esa
divergencia rechazaba la venta en la nube, lo que **congelaba la facturación** (ya
resuelto por `fiscal-no-se-congela-por-inventario`: la nube ahora declara la diferencia
en vez de bloquear).

Este change cierra la causa: **las dos reglas pasan a ser la misma**, y la nube publica
el número con el que va a decidir para que el terminal pueda aplicarlo sin conexión.

## La causa de fondo: `ALLOW_TEMPORARY` y los lotes son incompatibles

La política `ALLOW_TEMPORARY` significa «vende aunque no haya existencias» ⇒ el agregado
puede quedar negativo (la nube lo permite). Pero **una salida por lote no puede quedar
negativa**: un lote sin fecha de vencimiento real no se puede inventar
(`batches.expiration_date` es NOT NULL; el propio código lo declara como caso abierto).

Para un insumo con lotes, «vender sin stock» es **una venta que la nube no sabe
registrar**. El sistema lo permitía en un lado y lo proibía en el otro.

## Scope

### In Scope

- **La nube publica el disponible por lote**: el delta de insumos que la terminal ya
  espeja viaja con `lotAvailableStock` (la suma del saldo de sus lotes) y
  `isBatchManaged`.
- **La terminal aplica la MISMA regla**: un insumo por lotes se disponible por sus
  lotes (el número que la nube va a dibujar); un insumo sin lotes sigue disponible por
  su agregado (donde el agregado es la única verdad).
- **El backoffice no puede configurar la combinación imposible**: un insumo perecedero
  (que se gestiona por lotes) no puede llevar `ALLOW_TEMPORARY`; el servidor lo
  rechaza con la razón y el formulario lo explica y lo corrige.

### Out of Scope

- **La varianza positiva de conteo** (una entrada de stock sin lote): sigue siendo el
  caso abierto de `docs/inventario_marco_normativo.md` (tarea A-1 del change hermano).
- **La reconciliación de la divergencia existente** en el tenant (SOHO tiene un insumo
  con 150 en el agregado y 50 en los lotes): es un conteo, no código.
- **La publicación del saldo por lote en la nube**: el terminal NO necesita conocer los
  lotes individuales, sólo el total disponible ⇒ un solo número.

## Capabilities

### Modified Capabilities

- `inventory-batch-management`: la disponibilidad de un insumo por lotes es la de sus
  lotes, y esa disponibilidad se publica para que el terminal decida con el mismo
  número.

### New Capabilities

- `sellable-parity`: el terminal y la nube coinciden en lo vendible, con la misma regla
  y los mismos datos.

## Approach

1. **Publicar, no inventar**: la nube publica el disponible por lote en el delta que la
   terminal ya espeja ⇒ ningún canal nuevo, ninguna segunda fuente de verdad.
2. **Una sola regla**: la disponibilidad de un insumo por lotes es la de sus lotes. El
   insumo sin lotes conserva el agregado ⇒ la regla es exactamente la que la nube
   aplica al dibujar (`drawBatchOutflow`).
3. **El fallo seguro es el guardián**: sin dato de lotes (una terminal vieja, un delta que no
   llegó), la terminal sigue usando el agregado ⇒ el peor caso es una diferencia
   declarada (FD-01), nunca un bloqueo.
4. **La configuración imposible se rechaza, no se documenta**: `ALLOW_TEMPORARY` en un
   insumo perecedero es un error de negocio, no una preferencia.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/admin_backend/src/modules/sales/services/inbound-sync.service.ts` | Modified | El delta de insumos publica el disponible por lote. |
| `apps/admin_backend/src/modules/inventory/insumo.controller.ts` | Modified | Se rechaza `ALLOW_TEMPORARY` en un insumo perecedero. |
| `apps/pos_app/lib/data/models/inventory/insumo_entity.dart` + `migrations.dart` | Modified | Las dos columnas nuevas (migración 79→80). |
| `apps/pos_app/lib/data/services/sync_service.dart` | Modified | El delta las trae. |
| `apps/pos_app/lib/domain/usecases/inventory/checkout_inventory_preparation_service.dart` | Modified | La regla de disponibilidad por lotes. |
| `apps/owner_dashboard/src/features/inventory/insumos-tab.tsx` | Modified | El formulario explica la política y no permite la combinación imposible. |

## Risk & Rollback

- **Riesgo**: la terminal bloquee una venta que la nube aceptaría (si el disponible
  publicado está desactualizado). Mitigado por el fallo seguro: sin dato de lotes, la
  terminal usa el agregado; y aun así, un rechazo de la nube ya no bloquea (FD-01).
- **Riesgo**: un insumo perecedero con `ALLOW_TEMPORARY` existente (SOHO) no se pueda
  guardar hasta corregirlo. Es el comportamiento buscado: el servidor explica el
  porqué y el formulario corrige el dato.
- **Rollback**: la publicación y la regla son aditivas (dos columnas y un campo en el
  delta). El rollback es revertir el código; las columnas quedan inertes.

## Normativa (R-nn)

- **R-04** (NIC 2 §23-24, identificación específica): la disponibilidad y la salida
  salen del **lote identificado**. Este change hace que la DECISIÓN de vender también
  salga de ahí ⇒ la identificación deja de ser un detalle del libro y pasa a ser la regla
  que decide lo vendible.
- **R-01**: sin cambio de valuación.
- **R-06**: el disponible por lote publicado es un dato disponible para el DGI (el
  mismo que ya viaja en el delta).
- **R-02 / R-03**: no se toca el método de valuación.
