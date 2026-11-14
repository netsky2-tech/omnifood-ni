Objective: Implementar el guion previo aprobado y el clip de video Remotion `MultiCurrencyReel` (28s / 840 frames a 30 FPS) para `nhilos_video_script_cobro_multimoneda_vuelto_exacto_v1.0.md`, con Frame 0 en Macro-Zoom (`scale: 1.60`), UIs fieles a `MultiCurrencyCheckoutDialog` y `ReceiptLayoutFormatter` (80 mm) de `apps/pos_app`, y entrega del MP4 final.
Branch: feat/video-clip-anulaciones-pin-auditoria | Delivery: work-unit commits | Runner: `pnpm --filter showcase_video typecheck` & `remotion render`

## Specs

- **S1 (Guión Previo Obligatorio y Datos Comerciales):** Crear `docs/nhilos/manuals/nhilos_video_script_cobro_multimoneda_vuelto_exacto_v1.0.md` con:
  - `Feature: nhilos_video_script_cobro_multimoneda_vuelto_exacto_v1.0.md`
  - `Tema: Pérdidas de efectivo por errores de cálculo de tipo de cambio y vuelto bajo presión en caja.`
  - `Duración total: 28 segundos (840 frames a 30 FPS).`
  - `Voz Edge TTS: es-MX-JorgeNeural (Rate: -2%, Pitch: +0Hz).`
  - `Comercio: Repuestos & Lubricantes El Norte (RUC: J0310000391205 — continuamos abriendo el espectro a comercios de alta rotación donde el pago en dólares es diario).`
  - `Operador: Carlos Cajero.`
  - `Tasa oficial BCN / Comercial en sistema: C$ 36.6243.`
  - `Total de la factura (#00892): C$ 640.00 (Equivalente: $ 17.47 USD).`
  - `Pago recibido del cliente: Billete de $ 50.00 USD (Equivalente a C$ 1,831.22).`
  - `Vuelto exacto calculado: C$ 1,191.22 (o $ 32.53 USD).`
- **S2 (Fidelidad Absoluta a las UIs Reales del Proyecto):**
  - "NOTE: Siempre importante usar las UIs reales del proyecto, tenemos el codigo a la mano asi que no podemos inventar."
  - En `MultiCurrencyCheckoutDialog` (`apps/pos_app/lib/ui/features/sales/widgets/multi_currency_checkout_dialog.dart`):
    - Encabezado: `Cobro y Facturación` con `SegmentedButton` (`Cobro Completo` | `Pago Dividido`).
    - En **Cobro Completo**:
      - Tarjeta resumen: `Total a Cobrar: C$ 640.00`, `Equivalente Comercial: $17.47 USD`, chip `TC BCN: 36.6243`.
      - Selector de método (`ChoiceChip`): `Efectivo` (activo), `Tarjeta`, `QR / Transfer`.
      - Selector `Paga con:`: `NIO (C$)` | `USD ($)` (activo) y `Vuelto en:`: `Vuelto en NIO (C$)` (activo) | `Vuelto en USD ($)`.
      - Campo `Monto Recibido`: `$ 50.00` con `fontFeatures: [FontFeature.tabularFigures()]`.
      - Chips de denominación rápida (`_buildQuickSuggestionChips` de `getSuggestedDenominations` para `$17.47 USD`): `$ 17.47`, `$ 20`, `$ 50`, `$ 100`.
      - Tarjeta `_buildCashBreakdownCard`: `Vuelto: C$ 1,191.22` (`24px bold tabular-nums`, `NhilosColors.success`) y subtítulo `Equivalente en USD: $32.53 USD`.
      - Botón principal: `COBRAR`.
    - En **Pago Dividido** (Escena 3, simulación de pago mixto `$ 10.00 USD + C$ 300.00`):
      - Tarjeta de balance `_splitCalculator` (`SplitPaymentCalculator`): `Total Ticket: C$ 640.00`, `Total Pagado: C$ 640.00`, `Resta: C$ 0.00 ($ 0.00 USD)`.
      - Lista `Pagos Aplicados (2):` con `font-variant-numeric: tabular-nums`:
        1. `$ 10.00 (C$ 366.24)` (Efectivo USD)
        2. `C$ 300.00` con subtítulo `Vuelto: C$ 26.24` (Efectivo NIO)
      - Acción de cierre: `COBRAR` / `FINALIZAR VENTA`.
  - En **Ticket Térmico de 80 mm** (`ReceiptLayoutFormatter.format80mm`, `receipt_layout_formatter.dart`):
    - Encabezado: `REPUESTOS & LUBRICANTES EL NORTE`, `RUC: J0310000391205`, `FACTURA`, `No. 001-001-01-00000892`, `Fecha: 12/11/2026 11:15`, `Caja: Caja 1`, `Atendido por: Carlos Cajero`, `Cliente: Contado`.
    - Tabla de 4 columnas de 80 mm (`CANT DESCRIPCION P.UNIT TOTAL`), `SUBTOTAL: C$ 556.52`, `IVA: C$ 83.48`, `TOTAL CORDOBAS: C$ 640.00`, `T/C USD: 36.6243`, `TOTAL USD: $ 17.47`, `----------- DETALLE DE PAGO ------------`, `Efectivo (USD): $ 50.00`, `Equiv. Recibido: C$ 1,831.22`, `Cambio (NIO): C$ 1,191.22`.
- **S3 (Tabla de Escenas, Timecodes a 30 FPS y Locución Edge TTS):**
  - **Escena 1 (`f0 – f45`, `0.0s – 1.5s`, Macro Frame 0):** `Frame 0 (Macro-Zoom scale: 1.60)`: Primerísimo plano del dedo pulsando el botón de billete rápido `$ 50` en la pantalla de cobro y disparándose de inmediato el recuadro verde brillante: `Vuelto: C$ 1,191.22`. Audio Escena 1 (`fx_1_hook.mp3`): `«¿Te pagan con billetes en dólares y pierdes dinero dando mal el vuelto?»`. Texto cinético superpuesto: `¿Pagos en dólares?` / `Cero errores dando vuelto.`.
  - **Escena 2 (`f45 – f150`, `1.5s – 5.0s`, Corte 1.5s):** `Frame 45 (Corte de Atención)`: Zoom-out fluido de `1.60 ➔ 1.05` mostrando el modal completo de cobro multimoneda: `Total a Cobrar: C$ 640.00`, `Monto Recibido: $ 50.00`, `TC BCN: 36.6243`. Audio (`fx_2_context.mp3`): `«En plena fila, usar una calculadora aparte con el tipo de cambio provoca pérdidas en cada turno.»`. Texto cinético superpuesto: `Olvida la calculadora.` / `Conversión instantánea en pantalla.`.
  - **Escena 3 (`f150 – f390`, `5.0s – 13.0s`):** Simulación de pago mixto en `Pago Dividido`: el cajero combina `$ 10.00 USD + C$ 300.00`. Los números se recalculan en `<50 ms` con tipografía tabular fija (`tabular-nums`, `Vuelto: C$ 26.24`) y luego pulsa `COBRAR`. Audio (`fx_3_mixed.mp3`): `«En NHILOS POS recibes córdobas, dólares o pagos mixtos en una sola pantalla. El sistema calcula el vuelto exacto al centavo.»`. Texto cinético superpuesto: `Pagos mixtos C$ + USD` / `Tipografía tabular sin errores.`.
  - **Escena 4 (`f390 – f630`, `13.0s – 21.0s`):** Corte al ticket térmico de 80 mm saliendo con el desglose impreso: monto en córdobas (`C$ 640.00`), dólares recibidos (`$ 50.00 USD` / pago mixto registrado en gaveta bimoneda), tasa de cambio (`36.6243`) y vuelto entregado (`C$ 1,191.22`), listo para el arqueo ciego de turno. Audio (`fx_4_ticket.mp3`): `«Cada dólar recibido queda separado en la gaveta virtual para que el arqueo ciego cuadre sin sorpresas al cerrar el día.»`. Texto cinético superpuesto: `Gaveta bimoneda exacta.` / `Desglose claro en ticket y cierre.`.
  - **Escena 5 (`f630 – f840`, `21.0s – 28.0s`, Cierre Canónico):** Pantalla de cierre sobre fondo `#003757` con isotipo oficial NHILOS (`logo.png`). Botón interactivo central en `#00BF81` con texto `#003757`: `Comenta DEMO` y subtítulo `Acceso a la demostración operativa`. Audio (`fx_5_outro.mp3`): `«Elimina los descuadres por tipo de cambio. Comenta DEMO abajo para enviarte el acceso directo.»`.
- **S4 (Generación de Locución, Renderizado MP4 y Entrega):**
  - Generar los MP3 con `edge-tts` (`es-MX-JorgeNeural`), validar frames clave (`f0`, `f45`, `f260`, `f500`, `f720`) con `remotion still`, renderizar el MP4 final y copiarlo a `/mnt/c/Users/Octavio Morales/Pictures/nhilos/clips/nhilos_pos_cobro_multimoneda_vuelto_exacto.mp4`.

## Tasks

- **T1** (`S1`, `S2`, `S3`) — Inline: Crear `docs/nhilos/manuals/nhilos_video_script_cobro_multimoneda_vuelto_exacto_v1.0.md`, generar los audios `fx_1_hook.mp3`..`fx_5_outro.mp3` con `edge-tts`, e implementar `MultiCurrencyPosScene.tsx`, `MultiCurrencyTicketScene.tsx`, `MultiCurrencyOutroScene.tsx` y `MultiCurrencyReel.tsx` (840 frames). Status: `done` (`TYPECHECK_OK`).
- **T2** (`S3`, `S4`) — Inline: Validar stills (`f0`, `f65`, `f218`, `f240`, `f358`, `f500`, `f720`), renderizar el MP4 completo (`build:multi-currency`) y entregarlo en `/mnt/c/Users/Octavio Morales/Pictures/nhilos/clips/nhilos_pos_cobro_multimoneda_vuelto_exacto.mp4`. Status: `done` (`out/nhilos_pos_cobro_multimoneda_vuelto_exacto.mp4` 2.3 MB, 840 frames @ 30 FPS).

## Log

- **L1 (2026-04-14):** Solicitud original del usuario:
  > Vamos con el clip para mañana jueves: Feature: nhilos_video_script_cobro_multimoneda_vuelto_exacto_v1.0.mdTema: Pérdidas de efectivo por errores de cálculo de tipo de cambio y vuelto bajo presión en caja.Duración total: 28 segundos (840 frames a 30 FPS).Voz Edge TTS: es-MX-JorgeNeural (Rate: -2%, Pitch: +0Hz).Datos comerciales reales:Comercio: Repuestos & Lubricantes El Norte (RUC: J0310000391205 — continuamos abriendo el espectro a comercios de alta rotación donde el pago en dólares es diario).Operador: Carlos Cajero.   Tasa oficial BCN / Comercial en sistema: C$ 36.6243.Total de la factura (#00892): C$ 640.00 (Equivalente: $ 17.47 USD).Pago recibido del cliente: Billete de $ 50.00 USD (Equivalente a C$ 1,831.22).Vuelto exacto calculado: C$ 1,191.22 (o $ 32.53 USD). [...] NOTE: Siempre importante usar las UIs reales del proyecto, tenemos el codigo a la mano asi que no podemos inventar.
- **L2 (2026-04-14):** Validados los stills `fx_f0.png`, `fx_f65.png`, `fx_f218.png`, `fx_f240.png`, `fx_f358.png`, `fx_f500.png` y `fx_f720.png`. Se calibró la trayectoria del puntero táctil sobre el chip `$ 50` (`x=306, y=506`), el botón `+ Agregar Pago (C$ 300.00)` (`x=254, y=384`) y el verbo principal `COBRAR · C$ 640.00` (`x=254, y=766`). Renderizado y entregado `/mnt/c/Users/Octavio Morales/Pictures/nhilos/clips/nhilos_pos_cobro_multimoneda_vuelto_exacto.mp4`.
- **L3 (2026-04-14):** Corrección solicitada por el usuario: *"El audio inicial se escucha aceleraod, y la parte final tiene un ritmo mas normal. No hay armonía ahí"*. Se homologó el `rate` de `es-MX-JorgeNeural` en `apps/showcase_video/scripts/generate-voiceover.py` a `+0%` (apertura) y `-2%` uniforme en el resto de escenas tanto para `MultiCurrencyReel` como para `VoidAuditReel`, ajustando los `<Series.Sequence>` a la duración real de la voz natural (`1110 frames` en `MultiCurrencyReel` y `975 frames` en `VoidAuditReel`) sin acelerar ninguna sílaba. Re-renderizados y entregados ambos MP4 en `/mnt/c/Users/Octavio Morales/Pictures/nhilos/clips/`.
- **L4 (2026-04-14):** Corrección solicitada por el usuario: *"Cuando va a entrar a la parte de 'pago dividido' dice 'nialos po' en lugar de NHILOS POS. Y segundo, quitemos el badge que dice el nombre del negocio y ruc, es irrelevante tenerlo ahi fijo si ya se muestra en las UIs."* Se actualizó `scripts/generate-voiceover.py` con la grafía fonética `Nilos POS` para `edge-tts`, se eliminaron los badges flotantes redundantes de comercio/RUC en `MultiCurrencyPosScene.tsx`, `MultiCurrencyTicketScene.tsx`, `VoidAuditPosScene.tsx` y `VoidAuditDashboardScene.tsx`, se documentó la regla en `.agents/skills/nhilos-video-showcase/SKILL.md`, y se re-renderizaron y entregaron ambos MP4 finales.
