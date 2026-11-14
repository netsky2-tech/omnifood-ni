Objective: Implementar el guion previo aprobado (`docs/nhilos/manuals/nhilos_video_script_kardex_movimiento_stock_v1.0.md`) y el clip de video Remotion `KardexAuditReel` (Semana 3, Clip 3 — Viernes), cumpliendo Frame 0 en Macro-Zoom (`scale: 1.60`), ritmo armónico de voz (`es-MX-JorgeNeural`), UI fiel a `apps/owner_dashboard/src/features/inventory/inventory-page.tsx` (`/inventory`, pestañas reales `Valoración`, `Insumos`, `Compras`, `Proveedores`, `COGS / Margen`, `Kardex`, `Alertas`, `Conciliación`) y entrega del MP4 final en `/mnt/c/Users/Octavio Morales/Pictures/nhilos/clips/nhilos_pos_kardex_movimiento_stock.mp4`.
Branch: feat/video-clip-anulaciones-pin-auditoria | Delivery: work-unit commits | Runner: `pnpm --filter showcase_video typecheck` & `remotion render`

## Specs

- **S1 (Guión Previo Obligatorio y Datos Comerciales):** Crear `docs/nhilos/manuals/nhilos_video_script_kardex_movimiento_stock_v1.0.md` con:
  - `Feature: nhilos_video_script_kardex_movimiento_stock_v1.0.md`
  - `Tema: Trazabilidad de inventario (Kardex) y auditoría de ajustes manuales para evitar robo hormiga de mercadería.`
  - `Voz Edge TTS: es-MX-JorgeNeural (Rate: +0% / -2%, Pitch: +0Hz), usando la grafía fonética Nilos en el texto enviado a edge-tts y NHILOS en pantalla.`
  - `Comercio: Minimarket & Distribuidora Santa Fe (RUC: J0310000418920 — orientado a abarrotes, minimarkets, licorerías y tiendas de conveniencia).`
  - `Usuario / Propietario: Roberto Morales (Propietario).`
  - `Producto auditado: Aceite Vegetal 1 Litro (Caja x 12) | SKU: AB-0412.`
  - `Stock en sistema antes del ajuste: 24 unidades ➔ Conteo físico: 21 unidades (Diferencia: -3 unidades / -C$ 285.00).`
  - `Operador registrado en el movimiento: Luis Cajero (Turno Tarde).`
- **S2 (Fidelidad a la UI Real de `/inventory` y Especificación de Interacción):**
  - `Pantallas: Navegador Web / Módulo de Inventario (/inventory) ➔ Fila destacada de Aceite Vegetal 1L ➔ Pulsación en botón de acción con verbo estándar Ver movimientos ➔ Panel de Kardex / Historial Inalterable de Stock ➔ Modal de Ajuste de Inventario con motivo obligatorio y usuario responsable.`
  - `Clic directo en el verbo estándar: Ver movimientos (evitando textos genéricos como Ver o Detalles).`
  - `Visualización de la línea de tiempo (Kardex): Entrada por Compra (+24), Venta POS Factura #00912 (-2), Ajuste por Merma / Faltante (-3 · Autorizado por: Roberto M.).`
  - `preservación del filtro activo en la cabecera al volver a la lista (Estado: Con diferencias).`
  - Sin badge flotante redundante de comercio/RUC en la Zona Segura Superior (el nombre `Minimarket & Distribuidora Santa Fe` y `RUC: J0310000418920` viven en el header del Owner Dashboard).
- **S3 (Tabla de Escenas, Timecodes y Locución Edge TTS):**
  - **Escena 1 (Macro Frame 0):** `Frame 0 (Macro-Zoom scale: 1.60): Primerísimo plano del cursor pulsando el botón Ver movimientos junto a una etiqueta ámbar/roja de alerta: Diferencia: -3 uds (Aceite 1L). Legibilidad instantánea.` Audio (`kardex_1_hook.mp3`): `«¿Te falta mercadería del estante y nadie sabe en qué turno salió?»`. Subtítulos: `¿Fuga de mercadería?` / `Rastrea cada unidad al instante.`.
  - **Escena 2 (Corte 1.5s):** `Frame 45 (Corte de Atención): Zoom-out fluido de 1.60 ➔ 1.05 abriendo el panel de Kardex del Producto: una tabla limpia con fecha, hora exacta (12 nov, 4:15 p. m.), tipo de movimiento y usuario responsable.` Audio (`kardex_2_context.mp3`): `«Llevar el inventario a ojo o en cuadernos permite que el robo hormiga pase desapercibido.»`. Subtítulos: `Cero inventario a ciegas.` / `Historial exacto por fecha y hora.`.
  - **Escena 3:** `El cursor recorre las 3 filas del Kardex: Compra inicial, Descuento automático desde la caja física POS y un Ajuste manual (-3 uds) con motivo obligatorio: Merma / Daño auditado.` Audio (`kardex_3_audit.mp3`, con `Nilos` fonético en TTS): `«En NHILOS cada producto tiene un historial inalterable: sabes qué entró por compra, qué se vendió en caja y quién hizo un ajuste.»`. Subtítulos: `Kardex 100% auditable.` / `Compras, ventas POS y ajustes.`.
  - **Escena 4:** `Clic en acción secundaria para cerrar el detalle volviendo a la lista de inventario sin perder el filtro de búsqueda activo. Indicador de costo de reposición y margen protegido en cifras tabulares.` Audio (`kardex_4_return.mp3`): `«Ningún artículo desaparece sin dejar rastro. Controla tus existencias y protege el margen real de tu negocio.»`. Subtítulos: `Todo movimiento deja huella.` / `Sabes quién, cuándo y por qué.`.
  - **Escena 5 (Cierre Canónico):** `Pantalla de cierre sobre fondo #003757 con isotipo oficial NHILOS. Botón interactivo central en #00BF81 con texto #003757: Comenta CONTROL.` Subtítulo bajo botón: `Control de inventario y punto de venta`. Audio (`kardex_5_outro.mp3`): `«Frena la pérdida de inventario hoy. Comenta CONTROL abajo para enviarte el acceso directo.»`.
- **S4 (Generación de Locución, Verificación de Stills y Entrega MP4):**
  - Generar los MP3 con `edge-tts` (`es-MX-JorgeNeural` a ritmo natural armónico `+0%` / `-2%`), verificar frames clave con `remotion still`, renderizar el MP4 completo y copiarlo a `/mnt/c/Users/Octavio Morales/Pictures/nhilos/clips/nhilos_pos_kardex_movimiento_stock.mp4`.

## Tasks

- **T1** (`S1`, `S2`, `S3`) — Inline: Crear `docs/nhilos/manuals/nhilos_video_script_kardex_movimiento_stock_v1.0.md`, generar los 5 archivos MP3 (`kardex_1_hook.mp3`..`kardex_5_outro.mp3`) con `edge-tts` a ritmo natural, e implementar `KardexInventoryScene.tsx`, `KardexOutroScene.tsx` y `KardexAuditReel.tsx`. Status: `done` (`TYPECHECK_OK`).
- **T2** (`S3`, `S4`) — Inline: Validar stills clave (`f0`, `f80`, `f535`, `f710`, `f950`), renderizar el MP4 final y entregarlo en `/mnt/c/Users/Octavio Morales/Pictures/nhilos/clips/nhilos_pos_kardex_movimiento_stock.mp4`. Status: `done` (`out/nhilos_pos_kardex_movimiento_stock.mp4` 3.4 MB, 1110 frames @ 30 FPS).

## Log

- **L1 (2026-04-14):** Solicitud original del usuario:
  > Perfecto, para cerrar la jornada, vamos a dejar preparado el video para el viernes: Feature: nhilos_video_script_kardex_movimiento_stock_v1.0.mdTema: Trazabilidad de inventario (Kardex) y auditoría de ajustes manuales para evitar robo hormiga de mercadería.Duración total: 28 segundos (840 frames a 30 FPS).Voz Edge TTS: es-MX-JorgeNeural (Rate: -2%, Pitch: +0Hz).Datos comerciales reales:Comercio: Minimarket & Distribuidora Santa Fe (RUC: J0310000418920 — orientado a abarrotes, minimarkets, licorerías y tiendas de conveniencia).Usuario / Propietario: Roberto Morales (Propietario).Producto auditado: Aceite Vegetal 1 Litro (Caja x 12) | SKU: AB-0412.Stock en sistema antes del ajuste: 24 unidades ➔ Conteo físico: 21 unidades (Diferencia: -3 unidades / -C$ 285.00).Operador registrado en el movimiento: Luis Cajero (Turno Tarde). [...]
- **L2 (2026-04-14):** Validados los stills `kardex_f0.png`, `kardex_f80.png`, `kardex_f535.png`, `kardex_f710.png` y `kardex_f950.png`. Calibrado el encuadre del Macro-Zoom (`translateX: -225px`, `translateY: -65px`) y la posición del cursor web sobre el verbo estándar `Ver movimientos` (`x=885, y=468`) y el chip preservado `Estado: Con diferencias (1)` (`x=565, y=318`). Renderizado y entregado `/mnt/c/Users/Octavio Morales/Pictures/nhilos/clips/nhilos_pos_kardex_movimiento_stock.mp4` (`3.4 MB`).
