# Tasks: La facturación no se congela por un problema de inventario

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | 900-1200 (a mano, sin generados) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes (3 unidades encadenadas) |
| Delivery strategy | ask-on-risk |

### Work Units

| Unit | Goal | Commit |
|------|------|--------|
| 1 | La nube: el dibujo parcial, la divergencia y el resultado `APPLIED_WITH_DIVERGENCE` | `16d68396` |
| 2 | El backoffice: el panel de divergencias y el diagnóstico de paridad | `6325a67b` |
| 3 | La terminal: el resultado nuevo se ve como aviso, no como bloqueo | (en curso) |

---

## Unidad 1 — La nube (HECHA, `16d68396`)

- [x] 1.1 `modules/inventory/entities/inventory-divergence.entity.ts`: la entidad (tenant,
      venta, insumo, unidades, valor, causa, estado, origen, cierre) + índices por tenant
      y estado, y por venta.
- [x] 1.2 La migración de la tabla `inventory_divergences` (`1810080000000`), con RLS
      `direct:SIU` (la divergencia se cierra, así que la tabla es mutable a propósito) y
      su entrada en el manifiesto de cobertura.
- [x] 1.3 `modules/inventory/batch-allocation.ts`: `drawBatchOutflowPartial` — el mismo
      FEFO, pero devuelve `{hasLots, covered, uncovered, traces}` en vez de lanzar; el
      `drawBatchOutflow` estricto se conserva para merma y conteo.
- [x] 1.4 `modules/inventory/services/inventory-divergence.service.ts`: la escritura (en
      la transacción de la venta), la lectura paginada, el cierre por regularización y el
      diagnóstico de paridad (agregado ≠ Σ lotes).
- [x] 1.5 `modules/sales/services/invoices.service.ts`: la ruta de venta deja de
      rechazar por inventario; aplica el agregado, consume lo que los lotes respaldan y
      declara la diferencia. **Y el pre-chequeo R22 (que degradaba a
      `APPLIED_INVENTORY_PENDING` y dejaba la nube congelada) desaparece**: el
      movimiento aplica y el incumplimiento se declara.
- [x] 1.6 El resultado: `APPLIED_WITH_DIVERGENCE` con su razón (código, insumo,
      unidades, valor) en el `SaleInventoryOutcomeService`; la factura se amendia con
      la verdad de su propio inventario.
- [x] 1.7 `modules/inventory/controllers/inventory-divergence.controller.ts`:
      `GET /inventory/divergences` (paginado, filtro por estado) y
      `GET /inventory/divergences/parity` (el diagnóstico de paridad) + el registro en
      el transporte de rutas (`human`).
- [x] 1.8 La regularización cierra las divergencias abiertas del insumo (con su
      referencia).
- [x] 1.9 Pruebas: el dibujo parcial (cubre, no cubre, sin lotes), la divergencia
      escrita con su venta, el resultado aceptado, el flujo NO bloqueado tras una
      divergencia, el cierre por regularización, el diagnóstico de paridad.

## Unidad 1 (desglose original)

- [ ] 1.1 `modules/inventory/entities/inventory-divergence.entity.ts`: la entidad (tenant,
      venta, insumo, unidades, valor, causa, estado, origen, cierre) + índices por tenant
      y estado, y por venta.
- [ ] 1.2 La migración de la tabla `inventory_divergences`.
- [ ] 1.3 `modules/inventory/batch-allocation.ts`: `drawBatchOutflowPartial` — el mismo
      FEFO, pero devuelve `{covered, uncovered, traces}` en vez de lanzar; el
      `drawBatchOutflow` estricto se conserva para merma y conteo.
- [ ] 1.4 `modules/inventory/services/inventory-divergence.service.ts`: la escritura (en
      la transacción de la venta), la lectura paginada, el cierre por regularización y el
      diagnóstico de paridad (agregado ≠ Σ lotes).
- [ ] 1.5 `modules/sales/services/invoices.service.ts`: la ruta de venta deja de
      rechazar por inventario; aplica el agregado, consume lo que los lotes respaldan y
      declara la diferencia.
- [ ] 1.6 El resultado: `APPLIED_WITH_DIVERGENCE` con su razón (código, insumo,
      unidades, valor) en el `SaleInventoryOutcomeService`.
- [ ] 1.7 `modules/inventory/controllers/inventory-divergence.controller.ts`:
      `GET /inventory/divergences` (paginado, filtro por estado) y
      `GET /inventory/divergences/parity` (el diagnóstico de paridad).
- [ ] 1.8 La regularización cierra las divergencias abiertas del insumo (con su
      referencia).
- [ ] 1.9 Pruebas: el dibujo parcial (cubre, no cubre, sin lotes), la divergencia
      escrita con su venta, el resultado aceptado, el flujo NO bloqueado tras una
      divergencia, el cierre por regularización, el diagnóstico de paridad.

## Unidad 2 — El backoffice (HECHA, `6325a67b`)

- [x] 2.1 `src/features/inventory/divergences-api.ts`: el cliente de la API (divergencias
      + diagnóstico de paridad), con los tipos de cable honestos.
- [x] 2.2 `src/features/inventory/divergence-panel.tsx`: el panel con cada divergencia
      (venta, unidades sin respaldo, dinero, causa) y, debajo, el diagnóstico que
      NOMBRA el origen (los insumos cuyo agregado no cuadra con sus lotes).
- [x] 2.3 La pestaña «Conciliación» en Inventario + los rótulos en las palabras del
      negocio («sin respaldo», «no cuadra con sus lotes»).
- [x] 2.4 Pruebas del panel (4): vacío, con divergencia, con desajuste, y el fallo de
      lectura visible (nunca en silencio).

## Unidad 3 — La terminal (en curso)

- [x] 3.1 La terminal NO bloquea: el resultado `APPLIED_WITH_DIVERGENCE` es un resultado
      ACEPTADO ⇒ la venta se marca sincronizada y sus movimientos quedan
      `cloudAcknowledged` (prueba en `sales_movement_ownership_and_ack_test.dart`).
- [x] 3.2 El rastro: la terminal lo deja dicho en el log de sincronización
      (`SYNC_SALES_DIVERGENCE`), con la venta y el detalle.
- [ ] 3.3 El aviso en la pantalla del cajero: un banner que diga cuántas ventas se
      registraron con diferencias por conciliar. La conciliación se hace en el
      backoffice (Unidad 2), así que esto es visibilidad, no control — pero el
      operador tiene que poder verlo sin pedirle el informe a nadie.

## Unidad 3 — La terminal

- [ ] 3.1 `sync_service.dart`: el resultado `APPLIED_WITH_DIVERGENCE` se registra como
      aceptado (no queda *pending*) y se guarda la diferencia para mostrarla.
- [ ] 3.2 La pantalla de estado de sincronización muestra el aviso («venta registrada
      con una diferencia de inventario por conciliar»), nunca como un error.
- [ ] 3.3 Pruebas: el resultado con diferencia no queda pendiente y no bloquea la
      siguiente venta.

---

## Tareas abiertas (declaradas, no resueltas aquí)

- [ ] **A-1** La varianza **positiva** de conteo no puede crear un lote (`expiration_date`
      es NOT NULL ⇒ no se inventa un lote sin vencimiento real): es una fábrica de
      divergencias. Documentada en `docs/inventario_marco_normativo.md`; este change
      garantiza que **no** bloquee la facturación, pero su causa raíz queda abierta.
- [ ] **A-2** El ledger de lealtad: un fallo de lealtad también mete el flujo en
      `blockedStreams` (el mismo defecto, hermano). Otro ledger, otro análisis.
- [ ] **A-3** El change hermano `lo-vendible-es-lo-registrable`: alinear la regla de
      disponibilidad (el lote manda) y **publicar** el disponible por lote al terminal
      (que hoy no conoce el saldo de lotes de la nube).
