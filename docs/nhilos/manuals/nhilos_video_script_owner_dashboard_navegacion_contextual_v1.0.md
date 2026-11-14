# Guion Técnico Detallado — Clip Jueves: Visibilidad Gerencial Sin Ruido y Navegación Contextual

- **Feature:** `nhilos_video_script_owner_dashboard_navegacion_contextual_v1.0.md`
- **Tema:** Visibilidad gerencial sin ruido y navegación contextual (`NHILOS +1: Context travels`).
- **Formato:** Vertical 9:16 (`1080x1920`, 30 FPS).
- **Duración final:** 40.67 segundos (`1,220 frames` a 30 FPS), con padding de seguridad para Edge TTS.
- **Voz Edge TTS:** `es-MX-JorgeNeural` (`Rate: -4%`, `Pitch: +0Hz`).

---

## Datos Comerciales Reales (Mock Nicaragüense)

- **Comercio:** `Distribuidora & Café San Juan` (`RUC: J0310000145821`).
- **Usuario:** `Roberto Morales` (`owner` en la UI; `Propietario` en locución).
- **Período seleccionado:** `07/10/2026 — 05/11/2026` (últimos 30 días; comparativa real: `vs 30 días anteriores`).
- **KPIs en pantalla:**
  - `Ventas Netas`: `C$148,520.00`
  - `Tickets`: `612`
  - `Ticket Promedio`: `C$242.68`
  - `Margen Bruto`: `38.4%` (subvalor `C$57,031.68`)
- **Excepción activa (Layer 3 — Atención Requerida):**
  - `Stock crítico` · `4 producto(s) en nivel crítico` · alcance `Actual` · acción `Ver productos →`
  - `Anulaciones` · `2 anulaciones · C$490.00` · alcance `Período` · acción `Ver anulaciones →`

---

## A. Especificación de Interacción y Navegación

- **Pantallas:** Owner Dashboard (`/`) ➔ bloque `Atención Requerida` (Layer 3) ➔ clic en `Ver productos →` ➔ `/inventory?source=dashboard&sourceWidget=attention&severity=CRITICAL&status=CRITICAL&tab=alerts` con las 4 alertas críticas ya filtradas ➔ retorno con el botón **Back del navegador** (no existe botón “Volver al Dashboard” en la vista real) conservando el rango de fechas original.
- **Inputs y botones:**
  1. Hover y clic del cursor sobre la acción `Ver productos →` de la fila `Stock crítico`.
  2. Visualización de la tabla de Inventario prefiltrada (`Mostrando alertas con severidad: CRITICAL (4)`) con los 4 insumos críticos, sin pasos manuales de búsqueda.
  3. Clic en el botón Back del navegador; el Dashboard vuelve con `07/10/2026 — 05/11/2026` intacto. Recorrido posterior sobre el indicador de frescura (`Datos completos hasta 14:32 · sync 14:32`) y el KPI de `Margen Bruto (38.4%)`.

---

## B. Tabla de Escenas y Timecodes (a 30 FPS)

| Escena / Frames | Visual y Acción de Pantalla | Audio Edge TTS (`es-MX-JorgeNeural`, `-4%`) | Texto Cinético Superpuesto (Subtítulos) |
| :--- | :--- | :--- | :--- |
| **Escena 1**<br>`f0 – f315`<br>*(0.0s – 10.5s)*<br>**Acción Frame 0** | **Frame 0 (Live Action):** El cursor ya está en movimiento dentro de `Atención Requerida` y pulsa `Ver productos →` alrededor de `f14`. Cero pantallas estáticas de bienvenida. En `f45` entra el corte de atención (`scale 1.0 ➔ 1.06`) sobre la cabecera ejecutiva y las excepciones reales. | *«Un panel gerencial no sirve para llenarte de gráficos decorativos... sirve para decirte qué pasó en tu negocio y qué requiere tu atención inmediata.»* | `f0–f44`: **Visibilidad sin ruido.**<br>Acción inmediata sobre alertas reales.<br>`f45–f314`: **Solo lo que importa.**<br>Excepciones reales, cero adornos. |
| **Escena 2**<br>`f315 – f660`<br>*(10.5s – 22.0s)*<br>**Corte exacto** | **Frame 315:** la URL cambia a `/inventory?source=dashboard&sourceWidget=attention&severity=CRITICAL&status=CRITICAL&tab=alerts`. La vista de Inventario abre en la tab `Alertas` con el filtro `CRITICAL (4)` y las 4 filas críticas. El cursor recorre el filtro y la tabla. En `f640` pulsa el Back del navegador; en `f656` el Dashboard reaparece antes de que entre la locución de la Escena 3. | *«En NHILOS el contexto viaja contigo. Al tocar una alerta de stock crítico o una anulación, el sistema te lleva directo al detalle ya filtrado.»* | **El contexto viaja contigo.**<br>Filtro automático: Estado = Crítico. |
| **Escena 3**<br>`f660 – f980`<br>*(22.0s – 32.67s)* | **Frame 660:** Dashboard restaurado, mismo rango `07/10/2026 — 05/11/2026` y mismas cifras, sin repetir fechas. Cursor sobre `Datos completos hasta 14:32 · sync 14:32` (`f695`) y luego sobre `Margen Bruto` (`38.4%` / `C$57,031.68`, `f810`). Cifras con alineación tabular. | *«Sin volver a buscar productos ni repetir fechas. Ventas netas, márgenes reales y auditoría de caja desde cualquier navegador.»* | **Cero pasos repetidos.**<br>Control ejecutivo en tiempo real. |
| **Escena 4**<br>`f980 – f1220`<br>*(32.67s – 40.67s)*<br>**Cierre Canónico** | Cierre institucional sobre fondo `#003757` con isotipo oficial (`logo.png`). Botón central verde `#00BF81` con texto navy `#003757`: `Comenta DEMO`. Subtítulo: `Owner Dashboard y control administrativo en tiempo real`. | *«Entiende cómo está tu negocio en segundos. Comenta DEMO abajo para enviarte el acceso directo.»* | **NHILOS POS**<br>`[ Comenta DEMO ]`<br>Acceso a la demostración operativa |

---

## C. Validación Técnica del Activation Contract

1. **Acción viva Frame 0:** El video inicia en `t=0` con el cursor en movimiento y ejecuta la pulsación sobre `Ver productos →` en `f14` (0.47s), antes del primer segundo.
2. **Corte a los 1.5s:** En `f45` se ejecuta el reencuadre dinámico (`1.0 ➔ 1.06`) sobre el panel de excepciones, cumpliendo con la doctrina *Quiet Executive* (solo anomalías accionables, sin filas sanas).
3. **Contexto verificable:** la URL de inventario y el filtro `CRITICAL (4)` son navegables; el retorno usa el Back real del navegador, que conserva el rango de fechas. No se inventan botones ni rutas.
4. **CTA Canónico:** alineación exacta entre el cierre hablado (*«Comenta DEMO abajo para enviarte el acceso directo»*) y el botón visual (`Comenta DEMO`) en `f980–f1220`.
