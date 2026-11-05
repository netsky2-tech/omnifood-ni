# NHILOS POS — Guión Técnico de Video y Especificación de Showcase
## Tema B: Certeza Contable y Cumplimiento DGI («Cero saltos en numeración, cero riesgo fiscal»)

**Document ID:** NH-VID-004  
**Versión:** 1.0  
**Objetivo de Negocio:** Neutralizar el temor de gerentes y contadores ante auditorías fiscales de la DGI, facturas anuladas y saltos en la numeración correlativa. Demostrar la inmutabilidad de los registros, la exigencia de motivo formal DGI + PIN de supervisor, la exportación contable limpia (Excel/CSV) y la bitácora forense de auditoría.  
**Formato:** Reel Vertical 9:16 (1080 × 1920 px)  
**Duración Total:** 35.0 segundos (1050 frames @ 30 FPS)  
**Motor de Locución:** Microsoft Edge TTS  
**Voz Oficial:** `es-NI-FedericoNeural` (Nicaragua, dicción corporativa nítida)  
**Logo Oficial:** `apps/owner_dashboard/public/logo.png`  
**Colores Oficiales:** `#003757` (Navy Profundo), `#00BF81` (Verde Esmeralda), `#CCCCCC` (Gris Neutro), `#F8FAFC` (Surface Slate 50), `#00253B` / `#001F33` (Navy Dark)  

---

## 1. Estructura Narrativa y Tiempos por Escena

| Escena | Rango de Frames | Duración (s) | Enfoque Visual | Locución (Edge TTS) | Subtítulos Cinéticos & Badges |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **1. Secuencia Correlativa Estricta** | 0 – 210 | 0.0s – 7.0s (7.0s) | Módulo Fiscal (`/fiscal`) en el Backoffice. Cursor recorriendo la tabla de facturación con folios consecutivos (#00104, #00105, #00106). Badge de serie DGI autorizada y estado verde `Cero saltos`. | *«Para la administración tributaria, una factura desaparecida no es un error de sistema; es una anomalía fiscal.»* (Audio: 192f \| Padding: 18f) | **Secuencia correlativa estricta.**<br>Cero saltos en numeración. |
| **2. Anulación Inmutable & PIN Supervisor** | 210 – 510 | 7.0s – 17.0s (10.0s) | Zoom interactivo sobre anulación de factura #00105. Modal oficial DGI con motivos formales obligatorios (radio buttons), campo de PIN de supervisor (••••) y badge de inmutabilidad (no se borra, preserva correlativo). | *«En NHILOS ningún registro fiscal se elimina. Las anulaciones exigen motivo formal y autorización de supervisor, preservando siempre la secuencia inalterada.»* (Audio: 276f \| Padding: 24f) | **Facturas inmutables.**<br>Anulación con motivo formal y PIN. |
| **3. Exportación Limpia & Cuadre Contable** | 510 – 790 | 17.0s – 26.33s (9.33s) | Clic en «Exportar Reporte Mensual». Generación instantánea de reporte contable con vista previa Excel (.xlsx) y CSV con desglose oficial: Base Imponible, Exenciones, IVA 15% y Retenciones. | *«Tu contador recibe la información consolidada al final del mes, lista para declaración, sin necesidad de transcribir papeles ni cuadrar hojas de cálculo.»* (Audio: 255f \| Padding: 25f) | **Exportación limpia en Excel / CSV.**<br>Cero doble digitación manual. |
| **4. Bitácora de Auditoría & Cierre CTA** | 790 – 1050 | 26.33s – 35.0s (8.67s) | Vista rápida de la Bitácora Forense (`/audit`) con registro de eventos de mostrador (quién, cuándo, qué caja, supervisor). Transición al cierre oficial con Logo oficial, NHILOS POS, eslogan y botón CTA verde `#00BF81`. | *«Control administrativo real. Escribe CONTROL para enviarte nuestro protocolo técnico de auditoría.»* (Audio: 195f \| Padding: 65f) | **NHILOS POS**<br>**Comenta CONTROL** |

---

## 2. Fidelidad Técnica a las UIs Reales del Producto

### A. Módulo Fiscal (`apps/owner_dashboard/src/features/fiscal/`)
- **Pestaña Auditoría Secuencia (`SequenceTab`):**
  - KPI Cards superiores: `Secuencia Esperada: 106`, `Secuencia Real: 106`, `Secuencias Faltantes: 0` (Badge verde `OK`).
  - Tabla de Series Fiscales DGI:
    - Serie: `SERIE-001`
    - Rango: `#00104` ➔ `#00106`
    - Estado: `OK - Consecutivo Íntegro`
- **Datos de prueba comerciales (Nicaragua):**
  - Razón Social: `CAFÉ SAN JUAN`
  - RUC: `J0310000000000`
  - Cajero: `Carlos Cajero`
  - Moneda: Córdobas (`C$ NIO`)

### B. Modal de Anulación Fiscal (`apps/pos_app/lib/ui/features/sales/sales_history_view.dart`, `void_decision.dart`)
- **Título del diálogo:** `Anular Factura Fiscal #00105`
- **Motivos formales DGI obligatorios (`VoidReasonCodes`):**
  - `(•) Error de captura` (Seleccionado activamente con radio verde)
  - `( ) Cliente desiste`
  - `( ) Ticket duplicado`
  - `( ) Otro motivo formal`
- **Autorización de Supervisor obligatoria:**
  - Campo de entrada: `PIN de Supervisor *` con valor `••••` y badge `Autorizado por: Gerencia General`.
- **Principio de inmutabilidad DGI:**
  - Etiqueta explicativa: `La factura quedará registrada como ANULADA con fecha, hora y motivo. La secuencia numérica no sufre saltos ni eliminación física.`

### C. Exportaciones y Resumen Contable (`fiscal-page.tsx` - `ExportsTab`, `SummaryTab`)
- **Selector de formato:** Botones de descarga `Excel (.xlsx)` y `CSV (.csv)`.
- **Desglose normativo de ventas:**
  - Ventas Brutas: `C$ 145,280.00`
  - Base Imponible Gravable (IVA 15%): `C$ 126,330.43`
  - IVA Débito Fiscal: `C$ 18,949.57`
  - Ventas Exentas: `C$ 0.00`
  - Facturas Anuladas con Motivo: `2 registros (C$ 850.00)`
- **Validación:** Sello visual `100% Cuadrado con Arqueos Z`.

### D. Bitácora Forense de Mostrador (`apps/owner_dashboard/src/features/audit/audit-page.tsx`)
- **Vista seleccionada:** `Bitácora del mostrador (POS)`.
- **Columnas de evento:**
  - Hora: `12:42 PM`
  - Acción: `ANULACIÓN FACTURA #00105`
  - Motivo: `Error de captura (digitación)`
  - Operador: `Carlos Cajero (Caja 1)`
  - Autorizado por: `PIN Supervisor (Gerencia)`

---

## 3. Zonas Seguras de Instagram Reels (9:16 - 1080×1920)

- **Zona Segura Superior:** Margen libre de al menos `130px` para no colisionar con los controles de Instagram (*Reels*, *Amigos*, *Búsqueda*, *Cámara*).
- **Zona Segura Inferior:** Margen libre de al menos `280px` a `320px` para no solapar con el nombre de usuario `@nhilosapp`, la descripción del reel y el reproductor de audio.
- **Tipografía:**
  - Titulares y Marca: `Renogare, Poppins, sans-serif` con tracking espaciado (`4px` a `6px`).
  - Textos de lectura y tablas: `Poppins, system-ui, sans-serif` con cifras tabulares fijas (`tabular-nums`).

---

## 4. Estrategia de Audio Edge TTS

- **Voz:** `es-NI-FedericoNeural`
- **Rates calibrados para holgura de audio:**
  - Escena 1: `+8%` ➔ Duración audio: 6.40s (192 frames) en escena de 210 frames (18 frames padding).
  - Escena 2: `+12%` ➔ Duración audio: 9.20s (276 frames) en escena de 300 frames (24 frames padding).
  - Escena 3: `+8%` ➔ Duración audio: 8.50s (255 frames) en escena de 280 frames (25 frames padding).
  - Escena 4: `+4%` ➔ Duración audio: 6.50s (195 frames) en escena de 260 frames (65 frames padding).
- **Consistencia Sensorial:** Locución *«Escribe CONTROL para enviarte nuestro protocolo técnico de auditoría»* alineada al botón interactivo verde `#00BF81` con texto en pantalla `Comenta CONTROL`.
