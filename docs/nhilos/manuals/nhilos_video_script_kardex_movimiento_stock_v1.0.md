# Guión de Video: Trazabilidad de Inventario (Kardex) y Auditoría de Ajustes Manuales

**Versión:** 1.0 (Aprobado para Producción — Semana 3, Clip 3 · Viernes)  
**Formato:** Reel / TikTok / Shorts Vertical (`1080x1920`, `9:16`, `30 FPS`)  
**Duración Total:** 28 segundos base (`840 frames` nominales a `30 FPS` / sincronizado a cadencia armónica natural)  
**Composición Remotion:** `KardexAuditReel` (`apps/showcase_video/src/compositions/KardexAuditReel.tsx`)  
**Archivo de Salida:** `nhilos_pos_kardex_movimiento_stock.mp4`  
**Voz Edge TTS:** `es-MX-JorgeNeural` (`Rate: +0%` en apertura y `-2%` en desarrollo/cierre, `Pitch: +0Hz`; grafía fonética `Nilos` en `edge-tts` y `NHILOS` en pantalla)

---

## 1. Datos Comerciales Reales (Contexto Nicaragua)

- **Comercio:** `Minimarket & Distribuidora Santa Fe` (`RUC: J0310000418920` — orientado a abarrotes, minimarkets, licorerías y tiendas de conveniencia).
- **Usuario / Propietario:** `Roberto Morales` (`Propietario`).
- **Producto auditado:** `Aceite Vegetal 1 Litro (Caja x 12)` | `SKU: AB-0412`.
- **Stock en sistema antes del ajuste:** `24 unidades` ➔ **Conteo físico:** `21 unidades` (**Diferencia:** `-3 unidades` / `-C$ 285.00`).
- **Operador registrado en el movimiento:** `Luis Cajero` (`Turno Tarde`).

---

## 2. Especificación de Interacción y Navegación (UIs Reales)

### Pantallas (`apps/owner_dashboard/src/features/inventory/inventory-page.tsx`)
1. **Navegador Web / Módulo de Inventario (`/inventory`):**
   - Barra lateral oficial (`DashboardSidebar` con `activePath="/inventory"`) y cabecera con `Minimarket & Distribuidora Santa Fe` (`RUC: J0310000418920`).
   - Pestañas reales del módulo (`Valoración`, `Insumos`, `Compras`, `Proveedores`, `COGS / Margen`, `Kardex`, `Alertas`, `Conciliación`).
   - Fila destacada de `Aceite Vegetal 1 Litro (Caja x 12) | SKU: AB-0412` con etiqueta ámbar/roja de alerta `Diferencia: -3 uds` (`-C$ 285.00`) y pulsación en el botón de acción con verbo estándar **`Ver movimientos`**.
2. **Panel de Kardex / Historial Inalterable de Stock + Modal de Ajuste Auditado:**
   - Tabla limpia con fecha, hora exacta (`12 nov, 4:15 p. m.`), tipo de movimiento (`MOVEMENT_LABELS`), cantidad (`Antes` ➔ `Después`), costo unitario y usuario responsable.
   - Visualización de las 3 filas del Kardex de `Aceite Vegetal 1 Litro`:
     1. **`Entrada Compra` (`+24 uds`):** `12 nov, 8:30 a. m.` · Stock `0 ➔ 24` · Costo unit.: `C$ 95.00` · `Factura Prov. #4410 · Luis Cajero`.
     2. **`Venta` (`-2 uds`):** `12 nov, 1:40 p. m.` · Stock `24 ➔ 22` · `Venta POS Factura #00912 · Luis Cajero (Turno Tarde)`.
     3. **`Merma / Ajuste` (`-3 uds`):** `12 nov, 4:15 p. m.` · Stock `24 ➔ 21` (`-C$ 285.00`) · **Motivo obligatorio:** `Merma / Daño auditado` · **Autorizado por:** `Roberto M. (Propietario)`.
3. **Retorno a la Lista con Preservación de Contexto (`Estado: Con diferencias`):**
   - Clic en acción secundaria `← Volver a existencias` cerrando el detalle del Kardex sin perder el filtro activo en la cabecera (`Estado: Con diferencias` y búsqueda activa), mostrando indicadores tabulares (`tabular-nums`) de **Costo de Reposición** (`C$ 95.00 / ud`) y **Margen Protegido** (`31.6%`).

---

## 3. Tabla de Escenas y Timecodes (a 30 FPS)

| Escena / Frames | Visual y Acción de Pantalla | Audio Edge TTS (`es-MX-JorgeNeural`) | Texto Cinético Superpuesto (Subtítulos) |
| :--- | :--- | :--- | :--- |
| **Escena 1**<br>`f0 – f45`<br>(`0.0s – 1.5s`)<br>*(Macro Frame 0)* | **Frame 0 (Macro-Zoom `scale: 1.60`):** Primerísimo plano del cursor pulsando el botón **`Ver movimientos`** junto a una etiqueta ámbar/roja de alerta: **`Diferencia: -3 uds`** (`Aceite 1L`). Legibilidad instantánea. | *«¿Te falta mercadería del estante y nadie sabe en qué turno salió?»* | **¿Fuga de mercadería?**<br>Rastrea cada unidad al instante. |
| **Escena 2**<br>`f45 – f150`<br>(`1.5s – 5.0s`)<br>*(Corte 1.5s)* | **Frame 45 (Corte de Atención):** Zoom-out fluido de `1.60 ➔ 1.05` abriendo el panel de **Kardex del Producto**: una tabla limpia con fecha, hora exacta (`12 nov, 4:15 p. m.`), tipo de movimiento y usuario responsable. | *«Llevar el inventario a ojo o en cuadernos permite que el robo hormiga pase desapercibido.»* | **Cero inventario a ciegas.**<br>Historial exacto por fecha y hora. |
| **Escena 3**<br>`f150 – f390`<br>(`5.0s – 13.0s`) | El cursor recorre las 3 filas del Kardex: **Compra inicial** (`+24`), **Descuento automático desde la caja física POS** (`Factura #00912`, `-2`) y un **Ajuste manual (`-3 uds`)** con motivo obligatorio: **`Merma / Daño auditado`** (`Autorizado por: Roberto M.`). | *«En NHILOS cada producto tiene un historial inalterable: sabes qué entró por compra, qué se vendió en caja y quién hizo un ajuste.»* | **Kardex 100% auditable.**<br>Compras, ventas POS y ajustes. |
| **Escena 4**<br>`f390 – f630`<br>(`13.0s – 21.0s`) | Clic en acción secundaria para cerrar el detalle volviendo a la lista de inventario sin perder el filtro de búsqueda activo (`Estado: Con diferencias`). Indicador de costo de reposición y margen protegido en cifras tabulares (`tabular-nums`). | *«Ningún artículo desaparece sin dejar rastro. Controla tus existencias y protege el margen real de tu negocio.»* | **Todo movimiento deja huella.**<br>Sabes quién, cuándo y por qué. |
| **Escena 5**<br>`f630 – f840`<br>(`21.0s – 28.0s`)<br>*(Cierre Canónico)* | Pantalla de cierre sobre fondo `#003757` con isotipo oficial NHILOS (`logo.png`). Botón interactivo central en `#00BF81` con texto `#003757`: **`Comenta CONTROL`** y subtítulo **`Control de inventario y punto de venta`**. | *«Frena la pérdida de inventario hoy. Comenta CONTROL abajo para enviarte el acceso directo.»* | **NHILOS**<br>`[ Comenta CONTROL ]`<br>Control de inventario y punto de venta |

---

## 4. Validación Técnica del Activation Contract

1. **Acción viva en Macro (Frame 0):** Inicia en $t=0$ con el clic en curso sobre `Ver movimientos` y el badge de diferencia (`Diferencia: -3 uds`) a escala `1.60`, eliminando por completo cualquier pausa introductoria.
2. **Corte a los 1.5s:** En el frame 45 exacto se ejecuta la transición de escala (`1.60 ➔ 1.05`) para mostrar la trazabilidad del Kardex con formato de fecha explícito (`12 nov, 4:15 p. m.`).
3. **Sin badge superior redundante:** No se repite el nombre del comercio ni el RUC en un badge flotante en la Zona Segura Superior, dado que ya figuran en el encabezado del Owner Dashboard.
4. **CTA Canónico:** Alineación literal entre la locución de cierre (*«Comenta CONTROL abajo para enviarte el acceso directo»*) y el botón en pantalla (`Comenta CONTROL`).
