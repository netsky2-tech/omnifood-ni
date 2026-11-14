# Guión de Video Showcase — Cobro Multimoneda y Vuelto Exacto al Centavo (`v1.0`)

- **Feature:** `nhilos_video_script_cobro_multimoneda_vuelto_exacto_v1.0.md`
- **Tema:** Pérdidas de efectivo por errores de cálculo de tipo de cambio y vuelto bajo presión en caja.
- **Formato:** Vertical `9:16` (`1080x1920`, `30 FPS`)
- **Duración total:** `28.0 segundos` (`840 frames`)
- **Voz (Microsoft Edge TTS):** `es-MX-JorgeNeural` (`Rate: -2%`, `Pitch: +0Hz`)
- **Composición en Remotion:** `MultiCurrencyReel` (`apps/showcase_video/src/compositions/MultiCurrencyReel.tsx`)

---

## Datos Comerciales de Prueba
- **Comercio:** `Repuestos & Lubricantes El Norte` (`RUC: J0310000391205`)
- **Operador:** `Carlos Cajero` (`Caja 1`)
- **Tasa Oficial BCN / Comercial en sistema:** `C$ 36.6243` (`TC BCN: 36.6243`)
- **Factura objetivo:** `001-001-01-00000892` (`#00892`) por **`C$ 640.00`** (`Equivalente Comercial: $17.47 USD`)
- **Pago recibido en Escenas 1–2:** Billete rápido de **`$ 50.00 USD`** (`Equivalente: C$ 1,831.22`) ➔ **`Vuelto: C$ 1,191.22`** (`Equivalente en USD: $32.53 USD`)
- **Pago mixto en Escena 3:** **`$ 10.00 USD`** (`C$ 366.24`) + **`C$ 300.00`** ➔ Total recibido `C$ 666.24` ➔ **`Vuelto: C$ 26.24`**

---

## A. Especificación de Interacción y Navegación (Fiel al Código Real)

### Componentes Reales de `apps/pos_app`
1. **Modal de Cobro Multimoneda (`apps/pos_app/lib/ui/features/sales/widgets/multi_currency_checkout_dialog.dart`):**
   - Título: `Cobro y Facturación` con botón de cierre `×`.
   - `SegmentedButton<bool>`: **`Cobro Completo`** (`Icons.payment`) | **`Pago Dividido`** (`Icons.call_split`).
   - **Vista `Cobro Completo` (`_buildSingleCheckoutBody`):**
     - Tarjeta resumen (`_buildTotalHeaderCard`):
       - `Total a Cobrar:` **`C$ 640.00`** (`NhilosColors.brandPrimary`)
       - `Equivalente Comercial:` **`$17.47 USD`** (`NhilosColors.success`)
       - Chip de tasa (`viewModel.activeCheckoutRateLabel`): **`TC BCN: 36.6243`** (`Icons.currency_exchange`)
     - Selector de método (`_buildMethodSelector`): `ChoiceChip` **`Efectivo`** (seleccionado), `Tarjeta`, `QR / Transfer`.
     - Selectores de divisa (`_buildCurrencySelectors`):
       - `Paga con:` `ChoiceChip` `NIO (C$)` | **`USD ($)`** (seleccionado).
       - `Vuelto en:` `ChoiceChip` **`Vuelto en NIO (C$)`** (seleccionado) | `Vuelto en USD ($)`.
     - Campo `Monto Recibido` (`_buildTenderInputField`): prefijo `$ `, valor **`50.00`** en `FontFeature.tabularFigures()`.
     - Chips de denominación rápida (`_buildQuickSuggestionChips` generados por `CurrencyCheckoutCalculator.getSuggestedDenominations` para `$17.47 USD`): **`$ 17.47`**, **`$ 20`**, **`$ 50`**, **`$ 100`**.
     - Tarjeta de conversión instantánea (`_buildCashBreakdownCard` sobre `NhilosColors.successLight` / `NhilosColors.successBorder`):
       - **`Vuelto: C$ 1,191.22`** (`24px bold tabular-nums`)
       - Subtítulo: **`Equivalente en USD: $32.53 USD`**
     - Botón principal de confirmación: **`COBRAR`**.
   - **Vista `Pago Dividido` (`_buildSplitCheckoutBody` + `SplitPaymentCalculator`):**
     - Tarjeta de balance: `Total Ticket: C$ 640.00`, `Total Pagado: C$ 640.00`, `Resta: C$ 0.00 ($ 0.00 USD)`.
     - Formulario de pago parcial (`ChoiceChip` `NIO (C$)` / `USD ($)`, campo `Monto a Pagar`, botón `Agregar Pago`).
     - Lista **`Pagos Aplicados (2):`** con `tabular-nums`:
       - Pago 1: **`$ 10.00 (C$ 366.24)`**
       - Pago 2: **`C$ 300.00`** — Subtítulo: **`Vuelto: C$ 26.24`**
2. **Ticket Térmico de 80 mm (`apps/pos_app/lib/domain/services/printer/receipt_layout_formatter.dart` — `ReceiptLayoutFormatter.format80mm`):**
   - Impresión de 40 columnas lógicas (`CANT DESCRIPCION P.UNIT TOTAL`), encabezado fiscal DGI (`REPUESTOS & LUBRICANTES EL NORTE`, `RUC: J0310000391205`, `FACTURA`, `No. 001-001-01-00000892`), totales en córdobas (`TOTAL CORDOBAS: C$ 640.00`), bloque cambiario (`T/C USD: 36.6243`, `TOTAL USD: $ 17.47`) y sección `----------- DETALLE DE PAGO ------------` con el desglose bimoneda exacto para el arqueo ciego de turno.

---

## B. Tabla de Escenas y Timecodes (a 30 FPS)

| Escena / Frames | Visual y Acción de Pantalla | Audio Edge TTS (`es-MX-JorgeNeural`) | Texto Cinético Superpuesto (Subtítulos) |
| :--- | :--- | :--- | :--- |
| **Escena 1**<br>`f0 – f45`<br>(`0.0s – 1.5s`)<br>*(Macro Frame 0)* | **Frame 0 (Macro-Zoom `scale: 1.60`):** Primerísimo plano del dedo pulsando el chip de billete rápido **`$ 50`** en el modal `Cobro y Facturación` (`Paga con: USD ($)`), iluminándose al instante el recuadro verde esmeralda (`_buildCashBreakdownCard`): **`Vuelto: C$ 1,191.22`** (`Equivalente en USD: $32.53 USD`). Cero pantallas estáticas. | *«¿Te pagan con billetes en dólares y pierdes dinero dando mal el vuelto?»* | **¿Pagos en dólares?**<br>Cero errores dando vuelto. |
| **Escena 2**<br>`f45 – f150`<br>(`1.5s – 5.0s`)<br>*(Corte 1.5s)* | **Frame 45 (Corte de Atención):** Zoom-out fluido de `1.60 ➔ 1.16` mostrando el modal completo `MultiCurrencyCheckoutDialog` en la terminal POS: `Total a Cobrar: C$ 640.00` (`Equivalente Comercial: $17.47 USD`), chip `TC BCN: 36.6243`, `Monto Recibido: $ 50.00` y `Vuelto: C$ 1,191.22`. | *«En plena fila, usar una calculadora aparte con el tipo de cambio provoca pérdidas en cada turno.»* | **Olvida la calculadora.**<br>Conversión instantánea en pantalla. |
| **Escena 3**<br>`f150 – f390`<br>(`5.0s – 13.0s`) | Simulación de pago mixto en **`Pago Dividido`**: el cajero combina **`$ 10.00 USD (C$ 366.24)`** + **`C$ 300.00`**. Los números se recalculan en `<50 ms` con tipografía tabular fija (`tabular-nums`: `Resta: C$ 0.00`, `Vuelto: C$ 26.24`) sin que los dígitos bailen horizontalmente, y pulsa el botón de confirmación **`COBRAR`**. | *«En NHILOS POS recibes córdobas, dólares o pagos mixtos en una sola pantalla. El sistema calcula el vuelto exacto al centavo.»* | **Pagos mixtos C$ + USD**<br>Tipografía tabular sin errores. |
| **Escena 4**<br>`f390 – f630`<br>(`13.0s – 21.0s`) | Corte al **ticket térmico de 80 mm** saliendo en tiempo real con el formato exacto de `ReceiptLayoutFormatter.format80mm`: factura `No. 001-001-01-00000892`, `TOTAL CORDOBAS: C$ 640.00`, `T/C USD: 36.6243`, `TOTAL USD: $ 17.47`, dólares recibidos (`$ 50.00` / desglose en gaveta bimoneda) y `Cambio (NIO): C$ 1,191.22`, listo para el arqueo ciego de turno. | *«Cada dólar recibido queda separado en la gaveta virtual para que el arqueo ciego cuadre sin sorpresas al cerrar el día.»* | **Gaveta bimoneda exacta.**<br>Desglose claro en ticket y cierre. |
| **Escena 5**<br>`f630 – f840`<br>(`21.0s – 28.0s`)<br>*(Cierre Canónico)* | Pantalla de cierre sobre fondo `#003757` con isotipo oficial NHILOS (`logo.png`), título `NHILOS POS` y eslogan `Conectamos los hilos de tu negocio.`. Botón interactivo central en `#00BF81` con texto `#003757`: **`Comenta DEMO`** y subtítulo `Acceso a la demostración operativa`. | *«Elimina los descuadres por tipo de cambio. Comenta DEMO abajo para enviarte el acceso directo.»* | **NHILOS POS**<br>`[ Comenta DEMO ]`<br>Acceso a la demostración operativa |
