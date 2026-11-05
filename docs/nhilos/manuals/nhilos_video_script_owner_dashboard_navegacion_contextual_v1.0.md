# Guion Técnico Detallado — Clip Jueves: Visibilidad Gerencial Sin Ruido y Navegación Contextual

- **Feature:** `nhilos_video_script_owner_dashboard_navegacion_contextual_v1.0.md`
- **Tema:** Visibilidad gerencial sin ruido y navegación contextual (`NHILOS +1: Context travels`).
- **Formato:** Vertical 9:16 (`1080x1920`, 30 FPS).
- **Duración base del guion:** 32 segundos (`960 frames` a 30 FPS) — *sujeto a validación de holgura de locución (Regla 8.3)*.
- **Voz Edge TTS:** `es-MX-JorgeNeural` (`Rate: -4%`, `Pitch: +0Hz`).

---

## Datos Comerciales Reales (Mock Nicaragüense)

- **Comercio:** `Distribuidora & Café San Juan` (`RUC: J0310000145821`).
- **Usuario:** `Roberto Morales` (`Propietario`).
- **Período seleccionado:** `1–15 de noviembre de 2026` (Comparativa humana: `vs. 1–15 oct`).
- **KPIs en pantalla:**
  - `Ventas Netas`: `C$ 148,520.00`
  - `Tickets Completados`: `612`
  - `Ticket Promedio`: `C$ 242.68`
  - `Margen Bruto`: `38.4%` (Cobertura de costos: 100%)
- **Excepción activa (Layer 3 — Atención Requerida):**
  - `Stock crítico · 4 productos` (Botón de acción semántico: `Revisar críticos`)
  - `2 anulaciones en el período` (Botón de acción semántico: `Auditar anulaciones`)

---

## A. Especificación de Interacción y Navegación

- **Pantallas:** Navegador Web en Backoffice2 (`/dashboard`) ➔ Bloque `Atención Requerida` (Layer 3) ➔ Clic en alerta accionable `Stock crítico · 4 productos` (`Revisar críticos`) ➔ Transición directa a `/inventory?status=CRITICAL&source=dashboard` con los 4 productos ya filtrados en pantalla ➔ Acción de retorno `← Volver al Dashboard` preservando el rango de fechas original (`1–15 nov 2026`).
- **Inputs y botones:**
  1. Hover y clic del cursor sobre la fila de excepción `Stock crítico · 4 productos` (Botón de acción semántico: `Revisar críticos`).
  2. Visualización de la tabla de Inventario prefiltrada (`Estado: Crítico`) con los 4 insumos críticos sin pasos manuales de búsqueda.
  3. Clic en acción de retorno `← Volver al Dashboard` preservando el rango de fechas original y recorrido sobre el indicador de frescura (`Datos actualizados`) y el KPI de `Margen Bruto (38.4%)`.

---

## B. Tabla de Escenas y Timecodes (a 30 FPS)

| Escena / Frames | Visual y Acción de Pantalla | Audio Edge TTS (`es-MX-JorgeNeural`, `-4%`) | Texto Cinético Superpuesto (Subtítulos) |
| :--- | :--- | :--- | :--- |
| **Escena 1**<br>`f0 – f45`<br>*(0.0s – 1.5s)*<br>**Acción Frame 0** | **Frame 0 (Live Action):** El cursor ya está en movimiento pulsando sobre la alerta `Stock crítico · 4 productos` dentro del panel `Atención Requerida` del Owner Dashboard. Cero pantallas estáticas de bienvenida. | *«Un panel gerencial no sirve para llenarte de gráficos decorativos...»* | **Visibilidad sin ruido.**<br>*(Sobre el clic en tiempo real)* |
| **Escena 2**<br>`f45 – f180`<br>*(1.5s – 6.0s)*<br>**Corte 1.5s** | **Frame 45 (Corte de Atención):** Zoom de `scale: 1.0` a `1.07` hacia la cabecera ejecutiva (Layer 1) y el bloque `Atención Requerida` (Layer 3). Solo se muestran excepciones reales; cero tarjetas vacías de "todo normal". | *«...sirve para decirte qué pasó en tu negocio y qué requiere tu atención inmediata.»* | **Solo lo que importa.**<br>Excepciones reales, cero adornos. |
| **Escena 3**<br>`f180 – f450`<br>*(6.0s – 15.0s)* | Transición de navegación contextual hacia `/inventory?status=CRITICAL&source=dashboard`. La vista de Inventario se abre mostrando exactamente los 4 insumos en estado crítico, con el filtro activo en la barra superior. | *«En NHILOS el contexto viaja contigo. Al tocar una alerta de stock crítico o una anulación, el sistema te lleva directo al detalle ya filtrado.»* | **El contexto viaja contigo.**<br>Filtro automático: Estado = Crítico. |
| **Escena 4**<br>`f450 – f720`<br>*(15.0s – 24.0s)* | Retorno vía `← Volver al Dashboard` preservando el período `1–15 nov 2026`. Cursor pasando sobre el indicador de frescura en verde (`Datos actualizados`) y el KPI de `Margen Bruto` (`38.4%` con cobertura completa de costos). Cifras con alineación tabular impecable. | *«Sin volver a buscar productos ni repetir fechas. Ventas netas, márgenes reales y auditoría de caja desde cualquier navegador.»* | **Cero pasos repetidos.**<br>Control ejecutivo en tiempo real. |
| **Escena 5**<br>`f720 – f960`<br>*(24.0s – 32.0s)*<br>**Cierre Canónico** | Cierre institucional sobre fondo `#003757` con isotipo oficial (`logo.png`). Botón interactivo central en verde `#00BF81` con texto en navy `#003757`: `Comenta DEMO`. Subtítulo: `Owner Dashboard y control administrativo en tiempo real`. | *«Entiende cómo está tu negocio en segundos. Comenta DEMO abajo para enviarte el acceso directo.»* | **NHILOS POS**<br>`[ Comenta DEMO ]`<br>Acceso a la demostración operativa |

---

## C. Validación Técnica del Activation Contract

1. **Acción viva Frame 0:** El video inicia en $t=0$ con el cursor ejecutando la pulsación sobre la excepción de `Stock crítico · 4 productos`, activando el estado de foco antes del primer segundo.
2. **Corte a los 1.5s:** En el frame 45 exacto se ejecuta el reencuadre dinámico (`1.0 ➔ 1.07`) sobre el panel de excepciones, cumpliendo con la doctrina *Quiet Executive* (mostrar únicamente anomalías accionables, omitiendo filas sanas).
3. **CTA Canónico:** Alineación exacta entre el cierre hablado de Edge TTS (*«Comenta DEMO abajo para enviarte el acceso directo»*) y el botón visual en pantalla (`Comenta DEMO`).
