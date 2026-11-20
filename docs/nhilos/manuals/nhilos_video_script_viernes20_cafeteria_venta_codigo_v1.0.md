# Guión Técnico de Video: Viernes 20/11 — Venta Rápida por Código en Cafetería (Macro-Zoom Remotion)

**Document ID:** NH-VID-S4-03  
**Versión:** 1.2 *(corregida tras auditoría `KILL_OR_CUT` del Creative Critic)*  
**Formato:** Reel Vertical 9:16 (`1080 × 1920 px @ 30 fps`)  
**Duración total:** `25.0 segundos` (`750 frames @ 30 fps`) · *Variante compacta opcional `15s`: recortable eliminando el paso intermedio del modal si la retención de TikTok lo pidiera.*  
**Producción vinculada:** [CREATIVE PRODUCTION BRIEF — Viernes 20/11](../content/briefs/creative_production_brief_viernes20_cafeteria_codigo_v1.0.md)  
**Benchmark técnico (Fórmula Día 2):** `apps/showcase_video/src/compositions/Semana4Pieza2Digital.tsx`  
**Biblioteca física de referencias:** `C:\Users\Octavio Morales\Pictures\nhilos\referencias` (WSL2: `/mnt/c/Users/Octavio Morales/Pictures/nhilos/referencias`)

---

## 1. Requisitos de Apertura, Veracidad UI y Confidencialidad (`nhilos-video-showcase` + `nhilos_content_system_v1.0.md`)

- **Identidad en UI (`nhilos_content_system_v1.0.md` líneas 131–143):** Cero menciones a clientes reales del piloto, **cero nombres de personas** (eliminado cualquier nombre de cajero) y **cero dispositivos/marcas**. El `DeviceScreen` cubre el AppBar superior mostrando únicamente el chip de estado y la etiqueta **`Pantalla real · cafetería de ejemplo`**.
- **Fidelidad Flutter 1:1 (Layout Handheld Portrait `800×1280` — `Semana4HeroSalesScreenAsset.tsx` + `sale_view.dart`):**
  - `SearchBarWidget` (`sale_view.dart:1005`, `isHandheld: true`): hint exacto **`Nombre o SKU`** *(nota: no heredar `'Buscar...'` de la versión previa de web hero)*. Al enviar con `Enter` (`onSubmitted`), llama `searchAndAddToCart(code)` (`sale_view_model.dart:1689`) y agrega el ítem directo al carrito — nunca pasa directo al cobro sin tocar el botón de cobro.
  - Producto seleccionado de catálogo verificado (`Semana4HeroSalesScreenAsset.tsx`): **`104` → `Americano 12oz` (`C$ 100.00`)**, producto simple sin diálogo de modificadores obligatorios (`PC-FOH-02`).
  - `MobileFloatingCartBar` (`sale_view.dart:637`): barra inferior **`Total: C$ 100.00 · 1 productos agregados`** + botón **`VER CARRITO`** -> al abrir muestra botón exacto **`COBRAR`** (`sale_view.dart:2773`, sin monto dentro del botón).
  - `MultiCurrencyCheckoutDialog` (`multi_currency_checkout_dialog.dart:597-708`): título **`Cobro y Facturación`** *(sin número de factura pre-emitido antes de cerrar el cobro)*, denominaciones en Córdobas (`[C$ 100.00, C$ 200.00, C$ 500.00, C$ 1,000.00]`), **`Vuelto: C$ 100.00`** al pagar con **`C$ 200.00`**, botón final exacto **`COBRAR`**.
- **Loop limpio (`R4`):** `f0` y `f744..f749` muestran exactamente el mismo gradiente radial navy `BG`; en `f1` irrumpe sin flash el Macro-Zoom `1.75x`.
- **Subtítulos obligatorios (`R6`):** Toda locución lleva subtítulos nítidos (`Poppins` `34px`, scrim `#001F33 @ 82%`) sobre `bottom >= 335px` (`y=1500..1585`), sin pisar `PersistentCTA` (`top: 128px`) ni las bandas esmeralda (`y=1380`).
- **CTA único (`Eje 5`) idéntico en botón y voz:** **`Comenta DEMO abajo para enviarte el acceso directo.`** · Botón `#00BF81`: **`Comenta DEMO`**. Sin URLs no publicadas y sin pedir dos acciones distintas (`Guarda` + `DEMO`) en los copys.

---

## 2. Desglose Escena por Escena (`750 frames @ 30fps`)

### Escena 0 · Hook `G4` + Desenlace Temprano `< 3s` (`0.0s – 3.0s` | `frames 0 – 90` | `90f`)
- **Tratamiento:** `T5` (Macro-Zoom `1.75x -> 1.18x` en `f45`) + `T2`
- **Visual:** `f0` es `BG` limpio. En `f1..f45`, primer plano `1.75x` sobre la barra **`Nombre o SKU`** enfocada; arriba (`top: 360px`) titular bicolor: **`¿Tu cajero nuevo frena la fila?`**. En `f45` (`1.5s`), zoom-out a `1.18x` y entra el chip superior **`Comenta DEMO · acceso a la demo`** (`top: 128px`). En `f65` (`2.16s`) aparece subtítulo clave **`Un código corto lo resuelve`** (`R2`).
- **Locución (`es-NI-FedericoNeural` desde `f0`):** *«Ocho de la mañana, fila llena y cajero nuevo. Con un código corto deja de buscar botones.»*

### Escena 1 · Aritmética Condicional Consistente (`3.0s – 7.5s` | `frames 90 – 225` | `135f`)
- **Tratamiento:** `T2` (`SlamType` ancho en ámbar `#F59E0B` sobre `BG` limpio para legibilidad absoluta a `360px`).
- **Progresión:**
  - `f95..f145`: `Si tarda 15 segundos buscando cada orden` -> **`20 pedidos × 15 s`**
  - `f145..f225`: **`= 5 minutos de fila parada`** (`#F59E0B`)
- **Locución:** *«Si tarda quince segundos por orden entre carpetas, en veinte pedidos ya frenó cinco minutos tu mostrador.»*

### Escena 2 · Demostración Real Handheld: Código `104` + `Enter` -> Carrito (`7.5s – 16.5s` | `frames 225 – 495` | `270f`)
- **Tratamiento:** `T5` (Macro-Zoom UI Handheld real con rótulo **`Pantalla real · cafetería de ejemplo`**).
- **Acciones exactas en pantalla:**
  1. `f236–f240` (`dwell 4f`): cursor se posa en **`Nombre o SKU`**.
  2. `f240–f265`: digita **`104`** (código corto de mostrador) + **`Enter`** -> SFX -> `SearchBarWidget.onSubmitted` ejecuta `searchAndAddToCart('104')`.
  3. `f275–f375`: cámara panea hacia `MobileFloatingCartBar`: **`Total: C$ 100.00 · 1 productos agregados`** + clic en **`VER CARRITO`**.
  4. `f375–f495`: abre resumen de carrito (`1× Americano 12oz · C$ 100.00`), cursor con dwell 4f baja al botón **`COBRAR`** (`f445`).
- **Banda esmeralda segura (`top: 1380px`, sobre subtítulos `top: 1500px`):** `Código 104 + Enter -> al carrito`
- **Locución:** *«En una cafetería con NHILOS digita el código del producto, presiona Enter y ya quedó en el carrito. Un toque en cobrar.»*

### Escena 3 · Cobro Instantáneo + Resolución de Cifra (`16.5s – 22.0s` | `frames 495 – 660` | `165f`)
- **Tratamiento:** `T5` (`animateEnter = false` al modal) -> `T2` (resolución ámbar a esmeralda).
- **Acciones (`f495–f585`):** En `Cobro y Facturación` (`MultiCurrencyCheckoutDialog` sin folio pre-emitido), tap en chip **`C$ 200.00`** (`f525`) -> panel esmeralda resalta **`Vuelto: C$ 100.00`** -> clic en botón **`COBRAR`** (`f565`).
- **Resolución (`f585–f660`):** La cifra `5 min de fila parada` (ámbar) transiciona a **`0 min buscando menús`** (`#00BF81`) con pie `si busca por código`.
- **Locución:** *«Paga con doscientos córdobas: vuelto exacto al instante y cero curva de aprendizaje.»*

### Escena 4 · Cierre Institucional + Loop Frame 0 (`22.0s – 25.0s` | `frames 660 – 750` | `90f`)
- **Elementos (`nhilos-video-showcase` §3.D):** `logo.png` + `NHILOS POS` + `Conectamos los hilos de tu negocio.` + botón `#00BF81` **`Comenta DEMO`** (sin URL).
- **Loop (`R4`):** Todo el contenido + chip CTA desvanecen entre `f732..f744`; `f744..f749` queda el mismo fondo `BG` de `f0`.
- **Locución (`f660..f726`):** *«Comenta DEMO abajo para enviarte el acceso directo.»*

---

## 3. Copys de Publicación Verbatim (TikTok, Instagram, Facebook — CTA Único `DEMO`)

### TikTok
> Cajero nuevo, ocho de la mañana y veinte cafés esperando ☕
>
> En una cafetería real, el mostrador no se traba si el cajero digita el código corto del artículo, presiona Enter para sumarlo al carrito y cierra el cobro en la misma pantalla.
>
> Comenta DEMO abajo para enviarte el acceso directo.
>
> #negociosnicaragua #cafeteriasnicaragua #puntodeventa #controldecaja #nhilosapp

### Instagram y Facebook
> En hora pico de cafetería, buscar cada bebida entre submenús detiene toda la fila cuando hay personal nuevo.
>
> En este ejemplo real de caja con datos de prueba ves el flujo directo: buscar por código corto (`104 + Enter`), enviar directo al carrito (`Americano 12oz · C$ 100.00`), cobrar con `C$ 200.00` y ver el vuelto exacto (`C$ 100.00`) al instante en la misma pantalla.
>
> 📩 Comenta DEMO abajo y te enviamos el acceso directo.
>
> #CafeteriasNicaragua #PuntoDeVenta #ControlDeCaja #GestionDeNegocios #NHILOS
