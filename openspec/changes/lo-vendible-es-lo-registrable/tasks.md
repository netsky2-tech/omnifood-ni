# Tasks: Lo que el terminal puede vender es lo que la nube puede registrar

> ⚠️ **La Unidad 2.3 (el terminal decide por los lotes) se REVIERTE** por
> `disponibilidad-derivada-no-bloquea` (FD-03): la disponibilidad derivada nunca
> bloquea. El faltante por lotes se **mide y se reporta** (`lotShortages`), no se
> rechaza la venta. La Unidad 1.3 (el servidor rechaza `ALLOW_TEMPORARY` en un
> perecedero) también se revierte: su razón se evaporó con FD-01.

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | 350-500 (a mano, sin generados) |
| 400-line budget risk | Medium |
| Chained PRs recommended | No (dos unidades) |
| Delivery strategy | ask-on-risk |

### Work Units

| Unit | Goal | Commit |
|------|------|--------|
| 1 | La nube: publica el disponible por lote y rechaza la combinación imposible | (pendiente) |
| 2 | La terminal: espeja el dato y decide por los lotes; el backoffice lo explica | (pendiente) |

> El código de ambas unidades ya está escrito y verificado en este change; falta
> revisar el tamaño del commit contra el presupuesto de 400 líneas y partirlo si
> toca.

---

## Unidad 1 — La nube

- [ ] 1.1 `modules/sales/services/inbound-sync.service.ts`: el delta de insumos publica
      `lotAvailableStock` (la suma del saldo de sus lotes) y `isBatchManaged`.
- [ ] 1.2 `modules/sales/dto/inbound-sync.dto.ts`: el contrato publicado.
- [ ] 1.3 `modules/inventory/insumo.controller.ts`: se rechaza `ALLOW_TEMPORARY` en un
      insumo perecedero (crear y actualizar), con el porqué en el mensaje.
- [ ] 1.4 Pruebas: el delta publica el disponible; el servidor rechaza la combinación.

## Unidad 2 — La terminal y el backoffice

- [ ] 2.1 `lib/data/models/inventory/insumo_entity.dart` + `migrations.dart`: las dos
      columnas nuevas (`lot_available_stock`, `is_batch_managed`), migración 79→80.
- [ ] 2.2 `lib/data/services/sync_service.dart`: el delta las trae.
- [ ] 2.3 `lib/domain/usecases/inventory/checkout_inventory_preparation_service.dart`: la
      regla de disponibilidad (por lotes si los hay; por el agregado si no), con el
      fallo seguro.
- [ ] 2.4 `src/features/inventory/insumos-tab.tsx`: el formulario explica la política y
      ofrece la que sí se puede usar al marcar el insumo como perecedero.
- [ ] 2.5 Pruebas: la terminal rechaza lo que los lotes no cubren; un insumo sin lotes
      sigue decidiendo por el agregado; sin dato de lotes, decide por el agregado.

---

## Tareas abiertas (declaradas, no resueltas aquí)

- [ ] **A-3** El protocolo de **reserva de lotes** en la nube: el arreglo definitivo de
      la carrera entre dos terminales (la diferencia seguiría declarándose, pero sin
      que ocurra). Es un change mayor, con su propia decisión de producto.
- [ ] **A-1** (del change hermano) La varianza positiva de conteo no puede crear lote:
      sigue siendo la fábrica de divergencias.
- [ ] **A-4** La **reconciliación del dato existente**: el tenant tiene insumos con el
      agregado y los lotes descuadrados (150 vs 50). Se concilia con un conteo; el
      diagnóstico de paridad del backoffice (FD-01) es la lista de trabajo.
