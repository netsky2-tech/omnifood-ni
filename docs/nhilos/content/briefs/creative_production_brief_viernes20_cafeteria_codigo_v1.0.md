# CREATIVE PRODUCTION BRIEF

> **Entregable obligatorio pre-render (Separación en 4 Roles Especializados):** Ninguna línea de Remotion se programa en `apps/showcase_video` hasta resolver todos los bloqueos del **Creative Critic**, obtener `PASS_TO_PRODUCTION` y contar con la aprobación del usuario.

- **Piece ID / Slug:** `viernes20_cafeteria_venta_codigo`
- **Versión:** `1.2` *(iteración post-auditoría `KILL_OR_CUT` del Creative Critic: loop `f0 == f749` corregido, layout Handheld real coherente con `SaleView`, labels Flutter 1:1, CTA único `DEMO`, hook `G4`, subtítulos `R6` obligatorios y cero nombres de personas/locales)*
- **Fecha objetivo de publicación:** Viernes `20/11/2026`
- **Tupla 5 Ejes & Guion Técnico:** `D9 (libre) + D6` · `G4` · `T2 -> T5 (Macro-Zoom Handheld real) -> T2` · `CTA único: DEMO` · Guion: `docs/nhilos/manuals/nhilos_video_script_viernes20_cafeteria_venta_codigo_v1.0.md`
- **Biblioteca de Videos de Referencia:** `C:\Users\Octavio Morales\Pictures\nhilos\referencias\` (WSL2: `/mnt/c/Users/Octavio Morales/Pictures/nhilos/referencias/`) · Benchmark interno de fórmula ganadora: `apps/showcase_video/src/compositions/Semana4Pieza2Digital.tsx` (Pieza Día 2 · loop `BG`, `SlamType` ámbar `#F59E0B`, UI real en `DeviceScreen` con AppBar cubierto + banda `#00BF81` y resolución esmeralda). *(Nota: `/mnt/c/.../referencias` no es accesible desde este sandbox; verificar localmente vía `video-understand` antes del render final.)*
- **Registro de Firmas por Rol (`agent_roles_signoff`):**
  - `Marketing Strategist` *(decide qué comunicar y por qué)*: `SIGNED`
  - `Creative Strategist` *(encuentra conceptos y desarrolla narrativas)*: `SIGNED`
  - `Art Director` *(convierte conceptos en instrucciones visuales)*: `SIGNED`
  - `Creative Critic` *(cuestiona y valida antes de producir)*: `PASS_TO_PRODUCTION (v1.2 — tras resolver los 6 bloqueos detectados en v1.0)`

---

## 1. Estrategia — [Rol: Marketing Strategist]

- **Objetivo de marketing:** Generar **comentarios `DEMO`** (`Eje 5` — único llamado a la acción, sin pedir guardados compitiendo en el mismo copy) y elevar el porcentaje visto total en TikTok (`>= 40%` vs línea base `16%`) y completado (`>= 15%` vs `3.24%`).
- **Público objetivo:** Dueños-operadores de **cafeterías** en Nicaragua (`25–44` años, conciencia **Problem-Aware / Solution-Aware**). *Confidencialidad:* negocio tratado como **«una cafetería»** genérica con etiqueta explícita `Pantalla real · cafetería de ejemplo`; cero menciones a clientes reales del piloto y **cero nombres de personas o dispositivos** (`nhilos_content_system_v1.0.md:131-132`).
- **Insight del consumidor:** *"Cuando entra un cajero nuevo a las 8:00 a. m. y hay fila, lo que frena el mostrador no es preparar el café: es que pasa veinte segundos buscando cada artículo entre carpetas."*
- **Problema o deseo:**
  - **`D9` (`libre`):** *"Mi cajero necesita una semana para aprenderlo"*.
  - **`D6`:** *"La fila se atasca en hora pico"*.
  - **Deseo operativo:** Que el cajero digite el código corto (o SKU numérico de mostrador/etiqueta, sin memorizar siglas complejas), pulse `Enter` para enviarlo directo al carrito y cierre el cobro en una sola pantalla.
- **Mensaje principal:** *Si un cajero nuevo busca por código en lugar de navegar carpetas, agrega el pedido al carrito con `Enter` y cobra en segundos sin frenar la fila de tu cafetería.*
- **Etapa del embudo:** **MOFU → BOFU** (`Comenta DEMO` temprano desde `1.5s` y al cierre).

---

## 2. Concepto creativo — [Rol: Creative Strategist]

- **Nombre del concepto:** *«Cajero nuevo a las 8 a. m.: un código y al cobro»*
- **Idea central:** Replicar la **arquitectura ganadora del Día 2 (`Semana4Pieza2Digital.tsx`)** —tesis concreta de mostrador + multiplicación condicional ámbar + prueba en `DeviceScreen` real (layout Handheld retrato `800×1280 @2×`) + resolución en esmeralda `#00BF81` + cierre y loop limpio `f749 == f0`— resolviendo una sola historia unificada en **cafetería**: pasar de perder `15 s` por pedido buscando categorías a **digitar `104` + `Enter` -> carrito -> cobrar `C$ 100.00` con `C$ 200.00` -> vuelto `C$ 100.00`** sin enredos de cambio ni botones ocultos.
- **Ángulo de comunicación:** No explicar pantallas genéricas; defender con aritmética condicional (`20 pedidos × 15 s = 5 minutos de fila frenada`) por qué el código corto (`SKU`) convierte a un cajero de primer día en un mostrador ágil, mostrado paso a paso en UI real de `NHILOS POS` sin inflar el flujo con compras duplicadas.
- **Emoción buscada:** Tensión matutina de mostrador lleno -> alivio inmediato al ver lo limpio que es despachar con un código corto.
- **Diferenciación:**
  - **Rotación (`C2`):** Estrena dolor **`D9` (`libre`)** y cambia el gancho respecto a Jueves 19/11 usando **`G4` (Escenario que se reconoce)** en lugar de repetir `G1 + G3`.
  - **Fidelidad de código real (`apps/pos_app`):** Usa estrictamente el layout **Handheld** vertical de `SaleView` (`Nombre o SKU` en `SearchBarWidget` + `MobileFloatingCartBar` `VER CARRITO`) con un producto estándar sin modificadores obligatorios (`Americano 12oz · C$ 100.00`, SKU `104`), respetando que `Enter` llama a `searchAndAddToCart` -> **agrega al carrito** (nunca afirma que `Enter` cobra solo) y usando los rótulos exactos **`COBRAR`** y **`Cobro y Facturación`** (sin número de factura pre-emitido).

---

## 3. Guion — [Rol: Creative Strategist]

- **3 alternativas de hook** *(Nota `Q3`: `f0` es fondo `BG` limpio idéntico al cierre `f749` para loop perfecto; desde `f1` abre en Macro-Zoom sin placa pausada)*:
  1. **`G4` (Escenario reconocible en cafetería — SELECCIONADO):**
     - **Verbal (`0.0s`, 1.ª sílaba):** *«Ocho de la mañana, fila llena y cajero nuevo.»*
     - **Visual (`f1..f45`):** Macro-Zoom `1.75x` sobre el campo real `Nombre o SKU` de `SaleView` en teléfono + titular arriba (`top: 360px`, lejos del chip CTA en `top: 128px`): `¿Tu cajero nuevo frena la fila?`
  2. **`G5` (Segmentación de rubro):**
     - **Verbal (`0.0s`):** *«En una cafetería a las ocho, cada toque extra cuesta clientes.»*
     - **Visual (`f1`):** Reloj `08:00 a. m.` + barra `Nombre o SKU` ampliada al centro.
  3. **`G2` (Afirmación contraintuitiva):**
     - **Verbal (`0.0s`):** *«Tu fila no es lenta por el barista. Es por el menú del POS.»*
     - **Visual (`f1`):** Contraste visual entre grilla sin buscar vs barra enfocada `Nombre o SKU`.
- **Hook seleccionado y justificación:** **Alternativa 1 (`G4`)** — Cumple la rotación (`!= G1/G3` del Jueves 19/11), instala una escena física real de cafetería en la primera sílaba, abre en Macro-Zoom `1.75x` en `f1`, entrega el rumbo de solución antes del segundo `3` (*«Un código corto lo resuelve»* entra en `f65 / 2.1s`), y separa limpiamente `PersistentCTA` (`top: 128px`) del titular (`top: 360px`).
- **Desarrollo narrativo y resolución (`25.0s / 750f`, 1 sola línea causal sin relleno):**
  - *Nota explícita sobre duración (`R1 = 15s` vs petición `25s` en prompt + `nhilos_content_system_v1.0.md:137` «Entre 15 y 45 segundos, según cuántas ideas tenga la pieza»):* se respeta el presupuesto pedido de **`25.0s` (`750 frames`)** evitando repeticiones (un solo SKU real `104`, cero diálogo extra de divisas) y entregando ritmo visual activo con cortes cada `<= 4s`; además se documenta en nota técnica qué tramo recortar (`f210..f300` -> corte compacto `15s`) si se quisiera testear versión corta en TikTok.
  1. **Escenario + Desenlace temprano (`0.0s–3.0s` | `f0–f90`):** *«Ocho de la mañana, fila llena y cajero nuevo. Con un código corto en caja deja de buscar botones.»* -> Reset de escala en `f45 (1.5s)` + entrada de **`Comenta DEMO · acceso a la demo`** en `top: 128px`.
  2. **Aritmética condicional (`3.0s–7.5s` | `f90–f225` | `T2`):** Número consistente (`15 segundos`): *«Si tarda quince segundos buscando cada bebida entre carpetas, veinte clientes seguidos son cinco minutos de fila parada.»* -> **`20 cafés × 15 s = 5 minutos de fila parada`** (ámbar `#F59E0B`).
  3. **Prueba real en `SaleView` Handheld (`7.5s–16.5s` | `f225–f495` | `T5` Macro-Zoom + `Pantalla real · cafetería de ejemplo`):** Zoom cerrado al `SearchBarWidget` (`Nombre o SKU`), digita código corto de etiqueta **`104`** + `Enter` -> entra **`1× Americano 12oz · C$ 100.00`** sin diálogo de modificadores; la cámara desciende suave a `MobileFloatingCartBar` (`Total: C$ 100.00 · 1 productos agregados` + botón **`VER CARRITO`**), toca `VER CARRITO` -> abre resumen de carrito con botón exacto **`COBRAR`**.
  4. **Cobro ágil + Resolución esmeralda (`16.5s–22.0s` | `f495–f660` | `T5 -> T2`):** En `Cobro y Facturación` (`MultiCurrencyCheckoutDialog`, sin número de factura pre-emitido), toca denominación sugerida **`C$ 200.00`** -> **`Vuelto: C$ 100.00`** (`tabular-nums`, banda esmeralda `#00BF81`) y toca **`COBRAR`**. Cierre de arco visual en `f590..f660`: los **`5 minutos perdidos`** en ámbar pasan a **`0 minutos buscando menús`** en `#00BF81` (*«Si opera por código desde el día 1»*).
  5. **Cierre CTA único + Loop (`22.0s–25.0s` | `f660–f750`):** `logo.png` + `NHILOS POS` + eslogan + botón `#00BF81` **`Comenta DEMO`** (sin URLs no verificadas), saliendo `f732..f744` para empatar `f749 == f0`.
- **CTA único:** **`Comenta DEMO abajo para enviarte el acceso directo.`** · Botón y chip superior: **`Comenta DEMO`**.
- **Voz en off y textos en pantalla (`750 frames @ 30fps = 25.0s`):**

| Beat | Ventana (`s` / `frames @30fps`) | Voz en off (`es-NI` `FedericoNeural`) | Texto protagonista / Banda (`<= 8` palabras) | Subtítulos obligatorios `R6` + Acción visual |
|---|---|---|---|---|
| `beat_0_hook` | `0.0–3.0s` (`0–90`) | *«Ocho de la mañana, fila llena y cajero nuevo. Con un código corto deja de buscar botones.»* | `¿Tu cajero nuevo frena la fila?` (`top: 360px`) | Subtítulos `R6` sobre zona segura (`bottom: 350px`). `f0` en `BG` limpio; `f1..f45` Macro-Zoom `1.75x` en barra `Nombre o SKU`; `f45` zoom-out `1.18x` + entra chip `Comenta DEMO` (`top: 128px`). |
| `beat_1_aritmetica` | `3.0–7.5s` (`90–225`) | *«Si tarda quince segundos por orden entre carpetas, en veinte pedidos ya frenó cinco minutos tu mostrador.»* | `20 pedidos × 15 s` / `= 5 minutos de fila parada` *(ámbar `#F59E0B`)* | `SlamType` ancho (`T2`) sobre fondo `BG` limpio (sin Backdrop ruidoso para máxima nitidez `360px`) + subtítulos `R6`. |
| `beat_2_macro_sku` | `7.5–16.5s` (`225–495`) | *«En una cafetería con NHILOS digita el código del producto, presiona Enter y ya quedó en el carrito. Un toque en cobrar.»* | Bandas abajo: `104 + Enter -> al carrito` -> `Total C$ 100.00` | Badge visible **`Pantalla real · cafetería de ejemplo`** (AppBar cubierto, cero nombres personales). `SaleView` Handheld (`Nombre o SKU` -> digita `104 + Enter` -> `MobileFloatingCartBar` actualiza `Total: C$ 100.00` -> `VER CARRITO` -> botón `COBRAR`). |
| `beat_3_cobro_resolucion` | `16.5–22.0s` (`495–660`) | *«Paga con doscientos córdobas: vuelto exacto al instante y cero curva de aprendizaje.»* | Banda `Vuelto exacto C$ 100.00` (`#00BF81`) -> `0 min buscando menús` | Modal `Cobro y Facturación` (`C$ 200.00` -> `Vuelto: C$ 100.00` -> clic `COBRAR`), luego contraste `T2` ámbar `5 min` -> esmeralda `0 min` (`si busca por código`). |
| `beat_4_cta_loop` | `22.0–25.0s` (`660–750`) | *«Comenta DEMO abajo para enviarte el acceso directo.»* | `NHILOS POS` · `Comenta DEMO` | Logo `logo.png` + eslogan + botón `#00BF81`; todo desvanece `f732..f744` dejando `f749 == f0`. |

---

## 4. Dirección de arte — [Rol: Art Director]

- **Referencias visuales:** `C:\Users\Octavio Morales\Pictures\nhilos\referencias\` (`/mnt/c/Users/Octavio Morales/Pictures/nhilos/referencias/`) + mecanismo auditado de `Semana4Pieza2Digital.tsx` (`BG` radial compartido, `SlamType`, `DeviceScreen` cubriendo AppBar sin datos personales, banda `#00BF81`, resolución ámbar -> esmeralda y `CloseBeat` `exit f732..f744`) + `v4`.
- **Paleta y composición:**
  - Fondo `BG`: `radial-gradient(circle at 50% 40%, #0A4D73 0%, #003757 45%, #00253B 78%)`
  - Semántica: Ámbar pérdida hipotética `#F59E0B` · Esmeralda control/prueba/CTA `#00BF81` · Texto `#FFFFFF` / `#CCCCCC` · UI `SaleView`: `#F8FAFC` / `#1E3A40` / `#0F172A`
  - Escala móvil `360px`: `Renogare` (`tabular-nums`, titulares `64–140px`, subtítulos `R6` en `Poppins` `34px` semibold con fondo scrim `#001F33 @ 82%` legible incluso reducido `3×` a `360px`), UI Handheld escalada para que `SearchBarWidget` y el modal llenen el ancho del teléfono sin micro-texto.
  - Zonas seguras estrictas: chip `Comenta DEMO` en `top: 128px` (centrado), contenido principal debajo de `top: 230px` y por encima de `bottom: 330px`, márgenes laterales `>= 90px` / `right >= 120px`.
- **Storyboard por escena:**

| Beat | Tratamiento (`T1..T7`) | Sujeto focal | Composición y jerarquía |
|---|---|---|---|
| `beat_0_hook` | `T5` (Macro-Zoom) + `T2` | Campo `Nombre o SKU` ampliado `1.75x` desde `f1` | `f0` fondo `BG`; `f1` input blanco enorme al centro (`top: 720px`) + titular en `top: 360px`; `f45` entra chip `Comenta DEMO` en `top: 128px` sin colisión. |
| `beat_1_aritmetica` | `T2` | `20 pedidos × 15 s = 5 min` | Tipografía gigante ámbar al centro absoluto sobre `BG` limpio (cero textura ruidosa detrás). |
| `beat_2_macro_sku` | `T5` (Macro-Zoom UI Handheld) | `SaleView` Handheld (`Nombre o SKU` -> `MobileFloatingCartBar` -> `COBRAR`) | `DeviceScreen` vertical centrado (`zoom 1.38x -> 1.05x`), AppBar cubierto con chip `"Pantalla real · cafetería de ejemplo"`, banda `#00BF81` en `top: 1460px` sobre subtítulos en `top: 1620px` (todo sobre `bottom: 300px`? Ajuste preciso: UI llega hasta `1380px`, banda en `top: 1380–1470px`, subtítulo en `top: 1500–1585px`, libre de los últimos `320px` = `1600–1920px`). |
| `beat_3_cobro_resolucion` | `T5` -> `T2` | `Cobro y Facturación` (`C$ 200.00 -> Vuelto C$ 100.00 -> COBRAR`) + resolución esmeralda | Modal centrado con zoom `1.12x` para lectura nitida a `360px`; remate `T2` ámbar -> esmeralda `0 min buscando`. |
| `beat_4_cta_loop` | Cierre institucional | `logo.png` + `NHILOS POS` + `Comenta DEMO` | Sin URL; desvanece en `f732..f744` empatando `f749 == f0`. |

- **Movimiento de cámara:** `f0` fondo `BG` -> `f1` entrada instantánea en Macro-Zoom `1.75x` sobre barra `Nombre o SKU` -> `f45 (1.5s)` zoom-out a `1.18x` -> en `beat_2`, paneo vertical suave del campo superior hacia la barra inferior `VER CARRITO` -> transición continua (`animateEnter = false`) al modal `Cobro y Facturación`.
- **Transiciones:** Crossfades concéntricos `absolute inset-0` sin flash blanco; salida unificada `CLOSE_EXIT_START = 732` hasta `f744` dejando `f744..f749` igual a `f0`.
- **Diseño sonoro:** Locución `edge-tts` (`es-NI-FedericoNeural`, rate `-2%`, respaldo `es-MX-JorgeNeural`) generada previo al render final para validar duración exacta; SFX discretos de teclado/Enter (`f265`) y cobro (`f545`) a `-8 dB`; cola final silenciosa (`>= 24` frames).
- **Duración de cada escena:** **`25.0 s` (`750 frames @ 30fps`)** repartidos en `90 + 135 + 270 + 165 + 90 = 750` frames.

---

## 5. Especificaciones técnicas — [Rol: Art Director]

- **Motor:** **`Remotion`** (`threejs_execution_spec.enabled = false`, `integration_mode = "none"` — cumple Q6).
- **Componentes y assets necesarios:**
  - **Logo oficial:** `apps/owner_dashboard/public/logo.png` (`NhilosLogo.tsx`).
  - **Componentes UI reales de código (`apps/pos_app`):**
    - `apps/pos_app/lib/ui/features/sales/sale_view.dart`: layout Handheld (`isHandheld: true`), hint `'Nombre o SKU'` (`line 1005`), `MobileFloatingCartBar` (`VER CARRITO`), modal/hoja carrito botón **`COBRAR`** (`line 2773`).
    - `apps/pos_app/lib/ui/features/sales/widgets/multi_currency_checkout_dialog.dart`: título `'Cobro y Facturación'` (sin folio pre-emitido), chip `C$ 200.00` (de `[180..]` / `[100, 200, 500, 1000]`), **`Vuelto: C$ 100.00`**, botón **`COBRAR`** (`line 708`).
    - Base visual adaptada de `Semana4HeroSalesScreenAsset.tsx` (corrigiendo hint `'Buscar...'` -> **`Nombre o SKU`** y producto `Americano 12oz` `C$ 100.00`).
  - **Audio TTS:** `apps/showcase_video/public/audio/viernes20_cafeteria_codigo_vo.mp3`.
- **Animaciones:** `spring({ frame, fps, config: { damping: 18, stiffness: 120, mass: 0.9 } })` + cursor con `dwell` de 4 frames antes de cada tap; tipeo interpolado `104` + `Enter`; subtítulos sincronizados `R6`; `tabular-nums`.
- **Resolución y formato:** `1080 × 1920` (9:16), `30 fps`, MP4 H.264.
- **Timing de cada elemento:**
  - `layer_stack_order`: `[0] SharedBG -> [1] SaleView / Checkout Handheld (Zoom controlado) -> [2] Pill "Pantalla real · cafetería de ejemplo" -> [3] Banda métrica #00BF81 / SlamType T2 -> [4] Subtítulos R6 (y=1500..1585) -> [5] PersistentCTA "Comenta DEMO" (f45..f732, top=128) -> [6] CloseBeat (exit f732..f744)`.
  - `<Sequence>` map: `beat_0_hook (0..90, 90f)` · `beat_1_aritmetica (90..225, 135f)` · `beat_2_macro_sku (225..495, 270f)` · `beat_3_cobro_resolucion (495..660, 165f)` · `beat_4_cta_loop (660..750, 90f)`.

---

## 6. Validación — [Rol: Creative Critic]

- **Coherencia con la marca:** `PASS` — Cero menciones a clientes reales del piloto, cero nombres de persona en pantalla (`sin nombres de personas ni dispositivos`), etiqueta explícita `"Pantalla real · cafetería de ejemplo"`, cero URLs no verificadas, 100% fidelidad a `sale_view.dart` Handheld + `multi_currency_checkout_dialog.dart`.
- **Calidad del hook:** `PASS` — `f0` = `BG` para loop perfecto; `f1` irrumpe con Macro-Zoom `1.75x` en `Nombre o SKU` + escenario `G4` + desenlace `< 3s` (`f65`) + `Comenta DEMO` desde `f45`.
- **Claridad del mensaje:** `PASS` — Un solo SKU numérico realista para día 1 (`104` -> `Americano 12oz C$ 100.00`), una sola historia causal, texto legible a `360px` + subtítulos `R6` obligatorios sin colisión de zonas seguras (`y < 1600px`).
- **Potencial de retención:** `PASS_TO_PRODUCTION` *(con nota de control)* — 5 beats dinámicos con cambios visuales cada `<= 4.5s` dentro de los `25s` solicitados por el usuario (justificado por `nhilos_content_system_v1.0.md:137` «Entre 15 y 45 segundos»), dejando identificada la variante corta de `15s` en caso de caída después del segundo `12` en TikTok.
- **Capacidad de generar acción:** CTA **único (`Comenta DEMO`)** en voz, chip temprano (`1.5s`), cierre `#00BF81` y copys sociales (`Eje 5` cumplido al 100%).
- **Hipótesis que se medirán al publicar (FASE 06 · `content-performance-analyst`):**
  1. **Retención TikTok:** superar línea base (`16%` visto total, `3.24%` completado) hacia **`>= 40%`** y **`>= 15%`** validando apertura `G4` + Macro-Zoom handheld `f1`.
  2. **Comentarios comerciales (`DEMO`):** incrementar tasa de comentarios `DEMO` frente al `0%` previo aislando una sola llamada a la acción (`Eje 5`).
  3. **Comparación 25s vs 15s:** auditar punto exacto de caída en la curva de retención de TikTok entre el segundo `12` y el `22` para decidir si futuras demos de flujo se mantienen en `25s` o regresan a `<= 15s`.
