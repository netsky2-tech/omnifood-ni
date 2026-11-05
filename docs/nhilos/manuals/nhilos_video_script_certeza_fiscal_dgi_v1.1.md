# NHILOS POS — Guión Técnico de Video y Especificación de Showcase
## Tema B: Certeza Contable y Cumplimiento DGI («Cero saltos en numeración, cero riesgo fiscal»)

**Document ID:** NH-VID-004  
**Versión:** 1.1 (corrige la v1.0 contra el código real)  
**Objetivo de Negocio:** Neutralizar el temor de gerentes y contadores ante auditorías fiscales de la DGI: demostrar que la numeración no salta, que una factura no se elimina (solo se anula con motivo formal), que el libro de ventas se exporta sin doble digitación y que la bitácora del mostrador deja evidencia forense.  
**Formato:** Reel Vertical 9:16 (1080 × 1920 px)  
**Duración Total:** 35.0 segundos (1050 frames @ 30 FPS)  
**Motor de Locución:** Microsoft Edge TTS  
**Voz Oficial:** `es-NI-FedericoNeural`  
**Logo Oficial:** `apps/owner_dashboard/public/logo.png`  
**Colores Oficiales:** `#003757`, `#00BF81`, `#CCCCCC`, `#F8FAFC`, `#00253B`, `#001F33`

---

## 1. Diagnóstico de la v1.0 (por qué no cumplía)

| # | Defecto de la v1.0 | Evidencia en código | Corrección v1.1 |
| :-- | :--- | :--- | :--- |
| D1 | La tabla de la Escena 1 inventaba columnas `Serie / Folio`, `Fecha`, `Cajero`, `Total`, `Estado DGI` y estados `REVISIÓN EN CAJA` / `EMITIDA`. | `fiscal-page.tsx` `SequenceTab`: columnas reales `Serie`, `Inicio`, `Fin`, `Real / Esperado`, `Estado`; estados `OK` / `CON FALTAS`. | Replicar la tabla real de series y el badge `OK`. |
| D2 | La Escena 3 mostraba `Descargar Excel (.xlsx)`, `Base Imponible`, `Retención Alcaldía` y `Facturas Anuladas`, que no existen en Fiscal. | `fiscal-page.tsx` `ExportsTab`: solo tarjetas `Libro de Ventas` y `Reportes Z`, botones `CSV` / `JSON`, totales `Total Registros`, `Total Bruto (NIO)`, `Total IVA (NIO)`, `Total Exento (NIO)`. | Clic real en `CSV`, toast oficial y totales reales. |
| D3 | La Escena 2 inventaba un campo `PIN de Supervisor *` y el título `Anular Factura Fiscal`. | `sales_history_view.dart` `_showVoidDialog`: título `Anular Factura`, radios de `VoidReasonCodes`, campo `Detalle (opcional)`, botones `CANCELAR` / `ANULAR`. No hay PIN en la anulación. | Replicar el diálogo real y el flujo `detalle → ANULAR FACTURA → diálogo`. |
| D4 | La Escena 4 mostraba la tabla de plataforma (Hora / Operación / Cajero / Autorización) y las 3 tarjetas de resumen dentro de la vista de bitácora POS. | `audit-page.tsx`: en `view=ledger` NO se muestran las tarjetas; columnas reales `Fecha y hora`, `Usuario`, `Acción`, `Severidad`, `Entidad`, `Dispositivo`. | Mostrar la bitácora real con severidad y dispositivo. |
| D5 | El subtítulo de la página Fiscal y de Auditoría estaba inventado. | Fiscal: `Cumplimiento DGI, correlatividad de facturas y libros de ventas`. Auditoría ledger: texto exacto en `audit-page.tsx:510`. | Copiar los textos exactos. |
| D6 | El botón decía `COMENTA CONTROL` y la locución/subtexto decían `Escribe CONTROL`. | Regla de marca de la skill: audio y CTA deben coincidir. | Locución, botón y subtexto: `Comenta CONTROL`. |
| D7 | El sidebar rotulaba `Correcciones kardex` y ocultaba `Auditoría` bajo el fold. | `sidebar.tsx`: label real `Correcciones de inventario`, ruta `/kardex`; `Auditoría` es ítem de Administración. | Corregir label, compactar ítems para que `Auditoría` sea visible y quede activo en la Escena 4. |
| D8 | Subtítulos demasiado bajos (borde inferior a ~260 px) y badge superior a 128 px. | Zonas seguras Reels: top ≥ 130 px, bottom ≥ 280 px. | `pt` superior que deje el badge en ≥ 136 px y bloque de subtítulo con borde inferior ≥ 288 px. |
| D9 | La locución de la Escena 2 afirmaba «autorización de supervisor», inexistente en el diálogo de anulación. | `void_decision.dart`: la anulación se gatea por permiso (`canVoidInvoice`), no por PIN. | Nueva locución sin «PIN» ni «supervisor». |
| D10 | Escena 1 con 220 frames y guión con 210/1050 inconsistentes; Escena 4 con 250 vs 260. | `FiscalReel.tsx` vs tabla v1.0. | Tabla y composición alineadas en 220 + 300 + 280 + 250 = 1050. |

---

## 2. Estructura Narrativa y Tiempos por Escena (30 FPS)

| Escena | Frames | Duración | Pantalla / Navegación | Interacciones | Locución (Edge TTS) | Subtítulos cinéticos |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **1. Secuencia Correlativa Estricta** | 0 – 219 | 7.33 s | Backoffice → `Fiscal` (`/fiscal`) → pestaña `Auditoría Secuencia`. | Cursor entra por el sidebar a `Fiscal`, luego recorre las 3 filas de series y reposa en el badge `OK`. Sin clics. | *«Para la administración tributaria, una factura desaparecida no es un error de sistema; es una anomalía fiscal.»* (200 f, padding 20 f) | 1) `Secuencia correlativa estricta` → 2) `Cero saltos en numeración` |
| **2. Anulación Inmutable** | 220 – 519 | 10.0 s | POS MIRAY Q80 → `Historial de Ventas` → detalle de la factura #00105 → diálogo `Anular Factura`. | Toque en la fila #00105 → toque en `ANULAR FACTURA` → toque en `Error de captura` → toque en `ANULAR` → SnackBar y fila `ANULADA`. | *«En NHILOS ningún registro fiscal se elimina. Las anulaciones exigen un motivo formal y conservan el folio y la secuencia inalterada.»* (nuevo audio, padding ≥ 24 f) | 1) `Facturas inmutables` → 2) `Anulación con motivo formal` |
| **3. Exportación Limpia** | 520 – 799 | 9.33 s | Backoffice → `Fiscal` → pestaña `Exportaciones`. | Clic en pestaña `Exportaciones` → clic en `CSV` de `Libro de Ventas` → toast oficial. Reposo sobre `Reportes Z`. | *«Tu contador recibe la información consolidada al final del mes, lista para declaración, sin necesidad de transcribir papeles ni cuadrar hojas de cálculo.»* (257 f, padding 23 f) | 1) `Exportación contable limpia` → 2) `Cero doble digitación manual` |
| **4. Bitácora Forense & Cierre** | 800 – 1049 | 8.33 s | Backoffice → `Auditoría` (`/audit?view=ledger`), bitácora POS; transición al cierre de marca. | Cursor reposa sobre la fila `Anulación de factura` (severidad `Crítico`). Sin clics. | *«Control administrativo real. Comenta CONTROL para enviarte nuestro protocolo técnico de auditoría.»* (nuevo audio, padding ≥ 30 f) | 1) `Control administrativo real` → Cierre: `NHILOS POS`, eslogan, `Comenta CONTROL`. |

---

## 3. Fidelidad Técnica a las UIs Reales

### A. Fiscal — `Auditoría Secuencia` (`apps/owner_dashboard/src/features/fiscal/fiscal-page.tsx`, `SequenceTab`)
- Header de página: `Fiscal` + `Cumplimiento DGI, correlatividad de facturas y libros de ventas`.
- `DateRangePicker` visible a la derecha: `27/10/2026 — 27/10/2026`.
- Pestañas: `Resumen Mensual`, `Anulaciones`, `Auditoría Secuencia` (activa), `Exportaciones`.
- KPI cards: `Secuencia Esperada` = `106`, `Secuencia Real` = `106`, `Secuencias Faltantes` = `0`.
- Tabla real:
  - `Serie` | 104 | 106 | 3 / 3 | `OK`
  - `Serie` | 1 | 50 | 50 / 50 | `OK`
  - `Serie` | 1 | 53 | 53 / 53 | `OK`
- `FreshnessBadge`: `Actualizado 12:48`.
- Datos de prueba: `CAFÉ SAN JUAN`, `RUC: J0310000000000`, moneda Córdobas (`C$ NIO`).

### B. Fiscal — `Exportaciones` (`ExportsTab`)
- Tarjeta `Libro de Ventas` con botones `CSV` y `JSON`.
  - `Total Registros`: `106 registros`
  - `Total Bruto (NIO)`: `C$ 145,280.00`
  - `Total IVA (NIO)`: `C$ 18,949.57`
  - `Total Exento (NIO)`: `C$ 0.00`
- Tarjeta `Reportes Z` con botones `CSV` y `JSON`.
  - `Total Turnos`: `7 registros`
- Clic en `CSV` de `Libro de Ventas`.
- Toast oficial (`use-toast`): título `Libro de Ventas exportado`, descripción `Se descargó el reporte fiscal en formato CSV.`

### C. POS — Anulación (`apps/pos_app/lib/ui/features/sales/sales_history_view.dart`)
- Historial:
  - AppBar: `Historial de Ventas` + icono de búsqueda (handheld).
  - Header operativo: `Sin filtro de fecha`, botón `Hoy`, totales `Facturas: 3`, `Subtotal`, `IVA`, `Total`, `Anuladas: 0`.
  - Filas tipo `ListTile`: número de factura, hora · cajero, resumen de ítems, método de pago, total; badge `ANULADA` solo tras la anulación.
- Detalle de factura: AppBar `Factura 001-001-01-00000105`, botones `EMITIR NOTA DE CRÉDITO` y `ANULAR FACTURA`.
- Diálogo real:
  - Título: `Anular Factura`
  - Texto: `Seleccione el motivo de la anulación de 001-001-01-00000105:`
  - Radios: `Error de captura`, `Cliente desiste`, `Ticket duplicado`, `Otro`.
  - Campo: `Detalle (opcional)` con hint `Describa el motivo si lo considera necesario`.
  - Acciones: `CANCELAR` y `ANULAR`.
- SnackBar real: `Factura anulada. Se imprimió el comprobante ANULADO.`
- Sin campo de PIN y sin textos `Factura Fiscal` / `Otro motivo formal` inventados.

### D. Auditoría — Bitácora del mostrador (`apps/owner_dashboard/src/features/audit/audit-page.tsx`, `view=ledger`)
- Título: `Auditoría`.
- Subtítulo exacto: `Registro de lo que ocurrió en las cajas del local: anulaciones, notas de crédito, descuentos autorizados, aperturas de gaveta y reimpresiones — quién, cuándo y desde qué dispositivo.`
- Chips: `Registro de la plataforma` / `Bitácora del mostrador (POS)` (activo).
- Nota exacta: `Entradas escritas por los terminales POS del local. No incluye los cambios de administración de la plataforma.`
- Filtros: `Todos los actores`, `Todas las entidades`.
- Tabla real (sin tarjetas de resumen en esta vista):
  - `27/10/2026 12:42` | `carlos.cajero@cafesanjuan.ni` | `Anulación de factura` | `Crítico` | `Factura` / `001-001-01-00000105` | `Q80-CAJA-01`
  - `27/10/2026 12:35` | `carlos.cajero@cafesanjuan.ni` | `Venta registrada` | `Informativo` | `Factura` / `001-001-01-00000104` | `Q80-CAJA-01`
  - `27/10/2026 12:30` | `carlos.cajero@cafesanjuan.ni` | `Apertura manual de gaveta` | `Advertencia` | `Caja / gaveta` | `Q80-CAJA-01`
- `FreshnessBadge` en el header.

### E. Sidebar (`apps/owner_dashboard/src/app/layout/sidebar.tsx`)
- Orden real: `Dashboard`, `Ventas`, `Inventario`, `Fiscal` (Principal); `Sesiones de caja`, `Correcciones de inventario`, `Catálogo`, `Productos`, `Promociones`, `Modificadores`, `Fidelización`, `Recetas`, `QR del menú` (Gestión); `Usuarios`, `Dispositivos`, `Auditoría`, `Clientes`, `Configuración` (Administración).
- Ítem activo con barra izquierda `#00BF81` y `bg-white/15`.
- Altura compactada para que `Auditoría` quede visible y activo en la Escena 4.

---

## 4. Zonas Seguras y Composición (1080 × 1920)

- **Superior:** el contenedor del badge arranca en `top ≥ 136 px` (`p-8` + `pt-[104px]`).
- **Inferior:** el texto del subtítulo termina a `≥ 288 px` del borde inferior.
- **Ventana Web:** `1000 × 780 px`, centrada, con escala `1.04` (1040 × 811); sidebar 260 px.
- **Terminal POS:** 540 × 860 con escala 1.25, centrada.
- **Continuidad:** Escena 1 usa `animateEnter=true` (única entrada desde el fondo); Escenas 3 y 4 usan `animateEnter=false` para evitar flash blanco.
- **Outro:** capas `absolute inset-0` concéntricas, crossfade sin reflow; logo PNG oficial, `NHILOS POS`, eslogan y CTA.

---

## 5. Audio Edge TTS (v1.1)

| Archivo | Texto | Rate | Padding mínimo |
| :--- | :--- | :--- | :--- |
| `fiscal_1_intro.mp3` | Para la administración tributaria, una factura desaparecida no es un error de sistema; es una anomalía fiscal. | `+8%` | 20 f |
| `fiscal_2_void.mp3` | En NHILOS ningún registro fiscal se elimina. Las anulaciones exigen un motivo formal y conservan el folio y la secuencia inalterada. | `+12%` | 24 f |
| `fiscal_3_export.mp3` | Tu contador recibe la información consolidada al final del mes, lista para declaración, sin necesidad de transcribir papeles ni cuadrar hojas de cálculo. | `+8%` | 23 f |
| `fiscal_4_outro.mp3` | Control administrativo real. Comenta CONTROL para enviarte nuestro protocolo técnico de auditoría. | `+4%` | 30 f |

- Solo se regeneran `fiscal_2_void.mp3` y `fiscal_4_outro.mp3`; si su duración cambia, se re-calcula el padding y se mantiene el total de 1050 frames.
- **Consistencia sensorial:** botón `Comenta CONTROL`, subtexto `Comenta CONTROL para enviarte nuestro protocolo técnico de auditoría` y locución idéntica.

---

## 6. Criterios de Aceptación

1. Ninguna columna, botón, estado o texto de las escenas 1, 3 y 4 contradice `fiscal-page.tsx` y `audit-page.tsx`.
2. El diálogo de anulación replica `_showVoidDialog` y no muestra PIN.
3. El flujo POS es `fila → detalle → ANULAR FACTURA → diálogo → ANULAR`.
4. El CTA y la locución dicen `Comenta CONTROL`.
5. Badge superior ≥ 136 px y subtítulos con borde inferior ≥ 288 px.
6. `Auditoría` visible y activo en el sidebar durante la Escena 4.
7. Total 1050 frames; padding de audio ≥ 20 f por escena.
8. Render final verificado con stills en frames 60, 350, 620, 900 y 1000.
