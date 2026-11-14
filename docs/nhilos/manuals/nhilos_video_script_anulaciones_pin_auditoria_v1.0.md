# Guión Técnico de Video: Control de Anulaciones con PIN de Supervisor y Auditoría DGI (Reel 9:16)

- **Feature:** `nhilos_video_script_anulaciones_pin_auditoria_v1.0.md`
- **Versión:** 1.0 (Semana 3 — Clip 1 Martes, con regla de retención 0:01s Macro-Zoom + Pregunta de Dolor en 4 palabras)
- **Formato:** Vertical 9:16 (`1080 × 1920 px`, 30 FPS) — TikTok / Instagram Reels / YouTube Shorts
- **Duración:** 28.0 segundos (`840 frames` a 30 FPS) — Reducción de 2 a 4 segundos para maximizar el % de video completado
- **Composición Remotion:** `VoidAuditReel` (`apps/showcase_video/src/compositions/VoidAuditReel.tsx`)
- **Archivo de salida:** `nhilos_pos_anulaciones_pin_auditoria.mp4`
- **Voz Edge TTS:** `es-MX-JorgeNeural` (`Rate: -2%`, `Pitch: +0Hz`)

---

## 1. Datos Comerciales de Prueba (Fidelidad Retail / Ferretería Nicaragua)

- **Comercio:** `Ferretería & Comercial Las Colinas` (`RUC: J0310000289104`)
- **Terminal:** `MIRAY Q80` (`TERM-01`, `Caja 1`)
- **Cajero activo:** `Luis Operador`
- **Supervisor que autoriza:** `Roberto Morales` (`Gerente / Owner`, método: `PIN` de 4 dígitos `••••`)
- **Factura objetivo:** `001-001-01-00000418` por `C$ 1,250.00` (pago en `Efectivo`, entre las facturas `001-001-01-00000417` y `001-001-01-00000419`)
- **Motivo formal DGI seleccionado (`kVoidReasonLabels`):** `Error de captura`

---

## 2. Especificación de Interacción y Navegación (UIs Reales del Código)

- **Pantallas:**
  1. `Terminal POS — InvoiceDetailScreen (sales_history_view.dart)` ➔ Detalle de `Factura 001-001-01-00000418` (`C$ 1,250.00`) y pulsación en el botón destructivo **`ANULAR FACTURA`** (`Icons.cancel_outlined`).
  2. `Modal de Anulación y Autorización de Supervisor (_showVoidDialog + SupervisorOverrideModal + PinPad)` ➔ Selección obligatoria del radio button **`Error de captura`** (`VoidReasonCodes.all`) + ingreso de **`Su PIN`** (`••••`) en el teclado numérico limpio `PinPad` (`1–9`, `C`, `0`, `⌫`) + confirmación en **`AUTORIZAR Y ANULAR`**.
  3. `Terminal POS — SalesHistoryView (sales_history_view.dart)` ➔ SnackBar oficial *«Factura anulada. Se imprimió el comprobante ANULADO.»* y lista de `Historial de Ventas` con encabezado `Facturas: 3 · Total: C$ 2,990.00 · Anuladas: 1 (excluidas del dinero)`, mostrando la factura `001-001-01-00000418` con badge **`ANULADA`** y el correlativo intacto entre `#00000417` y `#00000419`.
  4. `Owner Dashboard (attention-band.tsx + fiscal-page.tsx / audit-page.tsx)` ➔ Bloque **`Atención Requerida`** con la señal `▲ Anulaciones` (`1 anulaciones · C$1,250.00`, chip `Período`, acción `Ver anulaciones →`) y tabla de auditoría en tiempo real mostrando hora exacta (`10/11/2026 10:24`), factura (`001-001-01-00000418`), cajero (`Luis Operador`), quien autorizó (`Roberto Morales · PIN`), motivo (`Error de captura`) y monto (`C$ 1,250.00`).
  5. `Cierre Canónico NHILOS POS` ➔ Fondo `#003757`, logo oficial `logo.png`, `NHILOS POS`, eslogan `Conectamos los hilos de tu negocio.`, botón `#00BF81` con texto `#003757`: **`Comenta CONTROL`** y subtítulo `Auditoría y control de mostrador`.

---

## 3. Tabla de Escenas y Timecodes (a 30 FPS — Total: 840 Frames / 28.0s)

| Escena / Frames | Visual y Acción de Pantalla | Audio Edge TTS (`es-MX-JorgeNeural`, `-2%`) | Texto Cinético Superpuesto |
| :--- | :--- | :--- | :--- |
| **Escena 1**<br>`f0 – f45`<br>*(0.0s – 1.5s)*<br>**Macro Frame 0** | **Frame 0 (Macro-Zoom `scale: 1.55`):** Primerísimo plano cerrado sobre la `Factura 001-001-01-00000418` (`C$ 1,250.00 · Efectivo`) y el dedo tocando el botón rojo **`ANULAR FACTURA`**, emergiendo al instante el candado de bloqueo de PIN y motivo. Legibilidad en 0.2s. | `void_1_hook.mp3` (parte 1):<br>*«¿Borraron una factura hoy?»* | **¿Facturas borradas?**<br>Bloqueo inmediato en caja. |
| **Escena 2**<br>`f45 – f150`<br>*(1.5s – 5.0s)*<br>**Corte 1.5s** | **Frame 45 (Corte de Atención):** Zoom-out suave de `1.55 ➔ 1.18` revelando el modal completo en la terminal MIRAY Q80: exige seleccionar motivo formal DGI (`Error de captura`) y `Autorización de supervisor` con PIN de 4 dígitos (`Roberto Morales`). | `void_1_hook.mp3` (parte 2):<br>*«Cobran en efectivo, anulan el ticket y tu dinero desaparece.»* | **Cero anulaciones libres.**<br>Exige PIN de supervisor y motivo. |
| **Escena 3**<br>`f150 – f390`<br>*(5.0s – 13.0s)* | Se selecciona el radio `Error de captura`, se digitan los 4 puntos del PIN (`••••`) en el `PinPad` y se pulsa `AUTORIZAR Y ANULAR`. La factura `001-001-01-00000418` cambia a **`ANULADA`** (`Anuladas: 1 (excluidas del dinero)`), conservando su correlativo intacto entre la `#00000417` y la `#00000419`. | `void_2_pos.mp3`:<br>*«En NHILOS POS ninguna factura desaparece. Toda anulación requiere autorización, motivo justificado y conserva su número correlativo.»* | **Folio #00418 intacto.**<br>Trazabilidad fiscal DGI al 100%. |
| **Escena 4**<br>`f390 – f630`<br>*(13.0s – 21.0s)* | Corte limpio al Owner Dashboard (`Ferretería & Comercial Las Colinas`) mostrando el bloque **`Atención Requerida`** (`▲ Anulaciones · 1 anulaciones · C$1,250.00 · Período · Ver anulaciones →`) y la tabla de auditoría en tiempo real (`10/11/2026 10:24 · 001-001-01-00000418 · Luis Operador · Autorizó: Roberto Morales [PIN] · Error de captura`). | `void_3_dashboard.mp3`:<br>*«Al instante, el movimiento queda auditado en tu panel gerencial con hora exacta, monto y quién lo autorizó.»* | **Auditoría en tiempo real.**<br>Sabes quién, cuándo y por qué. |
| **Escena 5**<br>`f630 – f840`<br>*(21.0s – 28.0s)*<br>**Cierre Canónico** | Pantalla de cierre sobre `#003757` con isotipo oficial (`logo.png`), `NHILOS POS`, eslogan `Conectamos los hilos de tu negocio.`, botón central en `#00BF81` con texto `#003757`: **`Comenta CONTROL`** y subtítulo `Auditoría y control de mostrador`. | `void_4_outro.mp3`:<br>*«Cierra la puerta al robo hormiga. Comenta CONTROL abajo para enviarte el acceso directo.»* | **NHILOS POS**<br>`[ Comenta CONTROL ]`<br>Auditoría y control de mostrador |

---

## 4. Checklist de Validación (`nhilos-video-showcase` v1.3.0)

- [x] **Frame 0 (Macro-Zoom `scale: 1.55`):** Primer plano cerrado sobre la factura `#00418` (`C$ 1,250.00`) y el botón rojo `ANULAR FACTURA` siendo pulsado en grande, nunca mostrando la pantalla completa en reposo.
- [x] **Audio 0:00 (Pregunta de dolor en 4 palabras):** Inicia en la primera sílaba con *«¿Borraron una factura hoy?»*.
- [x] **Frame 45 (1.5s):** Cambio de encuadre (`scale: 1.55 ➔ 1.18`) hacia el modal completo de motivo DGI + PIN de supervisor.
- [x] **Fidelidad UI:** Usa `ANULAR FACTURA`, `Error de captura`, `Autorización de supervisor`, `PinPad`, `Anuladas: 1 (excluidas del dinero)` y `Atención Requerida`.
- [x] **CTA Canónico:** Botón `Comenta CONTROL` y audio *«Comenta CONTROL abajo para enviarte el acceso directo»*.
