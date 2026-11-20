# precio-mercado-r01-operativo

Operacionalizar R-01 (Ley 822 art. 44): pasar de "parcial con mecanismo" a cumplimiento operativo real. Las rutas existen (`InventoryValuationService.setMarketPrice` / `applyLowerOfCostWritedown`, `POST /inventory/reports/valuation/market-price` y `/writedown`) y nadie las usa. La decisión de negocio y el flujo quedaron resueltos por el fundador en `docs/DGI/precio_del_mercado_flujo.md` (2026-11-19); este documento ejecuta ese flujo en el producto.

## Specs

- **S1.** Responsable operativo: **Contador del cliente o Dueño con validación contable, nunca el proveedor**. RBAC: `setMarketPrice` y `applyLowerOfCostWritedown` invisibles para barista/cajero; expuestas solo en Backoffice Web para rol Contador/Dueño, cada ejecución con entrada de Audit Trail (usuario + referencia de respaldo). (`docs/DGI/precio_del_mercado_flujo.md` §1.)
- **S2.** Cadencia: **revisión mensual opcional para control interno + cierre anual obligatorio** antes de generar el Informe de Inventario de la DAG 01-2014 (30 días tras el cierre fiscal). Nada semanal. (§2.)
- **S3.** La vista vive en el Backoffice Web como **"Valuación y Cierre (Art. 44 LCT)"**, no en la caja ni en el POS. (§4.1.)
- **S4.** Asistente de prellenado: mostrar solo insumos **con existencia al cierre**, comparando costo actual contra última factura de compra o último `market_price` vigente; resaltar donde el último precio de compra bajó respecto al costo promedio para que el contador confirme y ejecute. (§4.2.)
- **S5.** Cierre anual (export DAG 01-2014): advertir si hay ítems sin revisión de precio de mercado reciente, con la opción explícita de confirmar "costo ≤ mercado" o ejecutar `applyLowerOfCostWritedown` antes de cerrar el período. (§4.3.)
- **S6.** El sistema distingue dos castigos que NO se contabilizan igual: **castigo por precio de mercado** (`applyLowerOfCostWritedown`, ajuste de valuación de cierre art. 44 — nunca "reserva genérica", art. 43 la haría no deducible) y **baja física por merma/caducidad** (art. 39 num. 18, con notificación previa de 10 días si hay destrucción). El asiento del writedown debe quedar documentado como ajuste de valuación. (§3.)
- **S7.** Cláusula de responsabilidad por escrito en el acuerdo comercial: el software provee las herramientas del art. 44; la carga de precios (`setMarketPrice`) y la aprobación de castigos (`applyLowerOfCostWritedown`) son responsabilidad exclusiva del contribuyente y su contador. (§4.4.)

## Tasks

| ID | Specs | Ruta | Commit |
|---|---|---|---|
| T1 | S1 | RBAC en las dos rutas + audit trail por ejecución | `feat(inventory): rbac y auditoría para valuación art. 44` |
| T2 | S3,S4 | Vista "Valuación y Cierre (Art. 44 LCT)" en owner_dashboard con asistente de prellenado | `feat(owner): vista de valuación y cierre art. 44` |
| T3 | S5 | Advertencia de ítems sin revisar en la exportación anual DAG 01-2014 | `feat(inventory): recordatorio de mercado en el cierre anual` |
| T4 | S6 | Documentar el asiento del writedown como ajuste de valuación (etiqueta/descripción del asiento, no reserva) | `docs(inventory): castigo art. 44 ≠ reserva` |
| T5 | S7 | Cláusula en el acuerdo comercial (doc legal) | `docs(legal): cláusula de responsabilidad de valuación` |

## Log

- **L1.** El fundador dejó la decisión resuelta en `docs/DGI/precio_del_mercado_flujo.md` (2026-11-19): quién (contador/dueño), cuándo (mensual opcional + anual obligatorio), dónde (backoffice web), y las cuatro mejoras de producto para revivir las rutas. Este documento traduce ese flujo a tareas implementables.
