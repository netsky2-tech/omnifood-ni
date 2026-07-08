# Batch 3b: Factura de Compra + CPP + BCN

Flujo de primera clase para la **factura de compra**: identidad fiscal, fecha fiscal, fuente/caché BCN, cálculo CPP en NIO y corrección por movimiento compensatorio. Cierra UC-01 (compra USD: FX BCN por fecha de factura).

## Estado actual

- UI de compras existe con proveedores, presentaciones, número de factura y fecha fiscal.
- El lookup oficial BCN por `invoiceDate` ya existe en backend + POS como flujo opt-in con fallback manual offline-safe, y el backend ahora soporta transporte proxy/configurable para consultar BCN cuando falta una tasa exacta local.
- El POS ya persiste `fxRateMode` (`explicit | official`) en compras nuevas, mantiene `bcnRate` local aun cuando la fuente fue oficial y sincroniza `fxRateMode` hacia backend.
- La identidad fiscal de factura de proveedor ya cubre número, proveedor, CAE/clave fiscal opcional, fecha fiscal y fecha de digitación separadas en backend y POS. Sigue faltando el cierre integral del batch: corrección compensatoria y trazabilidad backend/reporting de la procedencia FX más allá del contrato de sync.

## Brechas a remediar

- [x] **Identidad de factura de proveedor**: persistir número de factura, proveedor, CAE/clave fiscal (si aplica), fecha de emisión (fiscal) y fecha de digitación por separado.
- [x] **Fecha fiscal vs fecha de digitación**: el FX se toma de la **fecha de la factura** (PRD UC-01), no de hoy ni de la fecha de digitación.
- [x] **Fuente/caché BCN determinista backend**: servicio que obtiene el tipo de cambio oficial BCN por `fecha_emision`, consulta primero persistencia local exacta y puede usar BCN/proxy para persistir la fecha exacta. Si la fuente carece de cambio para una fecha, la regla queda **respaldada por fuente oficial**: no inventar el cambio, no asumir fallback a "último cambio hábil" — ver D2. Aún faltan UX/operación completa y reporting de trazabilidad para cerrar el batch integral.
- [x] **CalculadoraCPP**: el backend expone una API explícita de cálculo CPP de compra en `CostCalculatorService.calculatePurchaseCpp`, redondea a 4 decimales y el flujo de compras la usa para preview/posting en lugar de duplicar la fórmula.
- [x] Corrección de factura errónea **solo por movimiento compensatorio** (append-only), nunca editando la línea original. Implementado en backend con `POST /inventory/purchases/:id/correction`, documento de corrección enlazado y movimiento compensatorio enlazado al Kardex original.
- [ ] Campos de auditoría de la compra vinculados al `documento_origen_id` del Kardex.

## Alcance técnico

### Entidad factura de compra

- `CompraEntity`: `id`, `proveedor_id`, `numero_factura` (unique por proveedor), `fecha_emision` (fiscal), `fecha_digitacion`, `moneda` ('NIO','USD'), `tipo_cambio_bcn_nio` (si USD), `total`, `usuario_id`, `terminal_id`.
- `CompraDetalleEntity`: `insumo_id`, `cantidad`, `costo_unitario` (en moneda original), `costo_unitario_nio` (convertido), `uom_compra`, `factor_conversion`.

### Algoritmo CPP (PRD §2.2)

- `CPP_Nuevo = (Stock_Actual * CPP_Actual + Cantidad_Entrada * Costo_Entrada_NIO) / (Stock_Actual + Cantidad_Entrada)`.
- `Costo_Entrada_NIO = Costo_Unitario_USD * TipoCambio_BCN(fecha_emision)`.
- Se dispara con cada entrada por compra (y producción, pero esa va en Batch 5).

### Integrador BCN

- Servicio `BcnFxService.obtenerCambio(fecha)`: API BCN + caché local por fecha. El tipo de cambio se toma por `fecha_emision`; **la BCN no cambia el cambio por feriados** (D2). **No** asumir fallback a "último cambio hábil anterior" salvo que una fuente oficial lo respalde. Si la fuente carece de cambio para una fecha, documentar la regla con respaldo de fuente — no inventarla.

### Exención de IVA / IVA-cero (regla fiscal separada, D2)

- Las ventanas de exención o IVA-cero declaradas por el gobierno (períodos temporales de X días) son una **regla fiscal de calendario**, independiente del FX.
- Fuera del alcance de FX de este batch. Si el cálculo de IVA de compra/venta entra en alcance futuro, se modela como un input de **calendario fiscal aparte** — nunca como un fallback del cambio BCN.

### Corrección por movimiento compensatorio

- Error en factura → nueva `Compra`/movimiento de signo inverso que anula la entrada incorrecta, y opcionalmente una nueva entrada correcta. Ambas quedan en el Kardex; nada se edita.

## DoD (Criterios de aceptación)

- [x] Registro de compra con identidad fiscal completa (número, proveedor, CAE/clave fiscal opcional, fecha emisión, fecha digitación).
- [x] `CalculadoraCPP` con tests exhaustivos: stock cero, stock negativo temporal, compra USD, compra retroactiva (fecha pasada).
- [ ] FX BCN por `fecha_emision` con caché; test de fecha sin cambio publicado (regla documentada con respaldo de fuente, no fallback asumido a "último cambio hábil").
- [x] Corrección de factura solo vía movimiento compensatorio (test que demuestre la línea original queda intacta).
- [ ] Generación automática de línea Kardex `ENTRADA_COMPRA` por cada detalle.

## PRD cubierto

§2.2 CPP Multi-moneda · UC-01 Compra USD (FX por fecha de factura) · NFR Decimal
