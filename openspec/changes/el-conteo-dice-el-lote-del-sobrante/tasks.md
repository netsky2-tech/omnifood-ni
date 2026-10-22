# Tasks: El conteo dice en qué lote está el sobrante

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | 300-450 (nube + terminal) |
| 400-line budget risk | Medium |
| Chained PRs recommended | Two units (nube primero) |
| Delivery strategy | ask-on-risk |

### Work Units

| Unit | Goal | Commit |
|------|------|--------|
| 1 | La nube: el conteo declara el lote, el sobrante entra por él y sin lote no se postea | (pendiente) |
| 2 | La terminal: el conteo deja elegir el lote y lo declara | (pendiente) |

---

## Unidad 1 — La nube (HECHA en este cambio)

- [x] 1.1 `dto/count-session-document.dto.ts`: la entrada declara `batchId` y
      `batchNumber`.
- [x] 1.2 `entities/count-session-entry.entity.ts`: la entrada guarda el lote (id) y su
      número (la evidencia de R-05).
- [x] 1.3 `migrations/1810090000000-AddCountSessionEntryLot.ts`: las dos columnas
      (aditivas, anulables) + el índice + la FK blanda (`ON DELETE SET NULL`: un lote
      borrado después del conteo no puede borrar la evidencia).
- [x] 1.4 `count-session.service.ts`: la varianza positiva suma al lote declarado; sin
      lote declarado en un insumo por lotes, el conteo NO se postea (con el mensaje que
      pide el lote); un lote ajeno o inexistente se rechaza.
- [x] 1.5 Pruebas (DB real): el sobrante entra por su lote y el agregado vuelve a
      cuadrar; sin lote, el conteo se rechaza.

## Unidad 2 — La terminal

- [ ] 2.1 La sesión de conteo local: la entrada declara el lote (migración 80→81).
- [ ] 2.2 La pantalla de conteo: cuando el insumo tiene lotes, el operador **elige** el
      lote que está contando (y ve los lotes con su saldo y su vencimiento).
- [ ] 2.3 El conteo sin lote declarado en un insumo por lotes: la interfaz lo avisa
      antes de postear (la nube lo rechaza igual).
- [ ] 2.4 El payload del conteo lleva el lote (el mismo `batchId`/`batchNumber`).
- [ ] 2.5 Pruebas: la entrada guarda el lote; la pantalla ofrece los lotes del insumo.
