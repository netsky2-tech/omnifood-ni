# NHILOS POS — Guión Técnico de Video y Especificación de Showcase
## Tema A: Velocidad y Ergonomía en Mostrador («La fila avanza tan rápido como responde la caja»)

**Document ID:** NH-VID-003  
**Versión:** 1.0  
**Objetivo de Negocio:** Atacar el cuello de botella en la hora pico mediante diseño ergonómico, targets táctiles amplios, cálculo automático de vuelto multimoneda (C$ / USD) y despacho veloz en terminal MIRAY Q80.  
**Formato:** Reel Vertical 9:16 (1080 × 1920 px)  
**Duración Total:** 32.0 segundos (960 frames @ 30 FPS)  
**Motor de Locución:** Microsoft Edge TTS  
**Voz Principal:** `es-NI-FedericoNeural` (Nicaragua) | Velocidad: `-4%` | Tono: neutral/sereno  
**Voz Alternativa:** `es-MX-JorgeNeural` (si `es-NI-FedericoNeural` no estuviese disponible)  
**Logo Oficial:** `apps/owner_dashboard/public/logo.png`  
**Colores Oficiales:** `#003757` (Navy Profundo), `#00BF81` (Verde Esmeralda), `#CCCCCC` (Gris Neutro), `#F8FAFC` (Surface Slate 50), `#1E3A40` (Brand Primary Deep Teal)  

---

## 1. Estructura Narrativa y Tiempos por Escena

| Escena | Rango de Frames | Duración (s) | Enfoque Visual | Locución (Edge TTS) | Subtítulos Cinéticos |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **1. Hook & Contraste** | 0 – 180 | 0.0s – 6.0s (6.0s) | Fondo Navy `#003757`. Zoom comparativo: UI genérica saturada con 30 micro-botones estridentes vs. interfaz limpia y espaciosa de NHILOS POS. | *«En un mostrador lleno, cada toque de más en la pantalla es un cliente esperando en la fila.»* | **Menos toques.**<br>**Más fluidez en caja.** |
| **2. Terminal Q80 & Extras** | 180 – 450 | 6.0s – 15.0s (9.0s) | Terminal táctil MIRAY Q80 (ratio físico 800×1280). Toque en producto *Cappuccino Artesanal*, modal limpio de modificadores y extras (*Leche de Almendras +C$ 20.00*), botón generoso `COBRAR` (>56 dp). Respuesta táctil <50 ms. | *«Diseñamos la terminal de NHILOS con botones táctiles amplios, respuesta en menos de cincuenta milisegundos y teclado numérico sin distracciones.»* | **Respuesta táctil: <50 ms**<br>**Teclado limpio y seguro.** |
| **3. Cobro Multimoneda & Vuelto** | 450 – 720 | 15.0s – 24.0s (9.0s) | Diálogo oficial `MultiCurrencyCheckoutDialog`. Entrada de efectivo C$ 500, cálculo instantáneo de vuelto en C$ y USD con tipografía tabular fija (`FontFeature.tabularFigures()`). Cero titubeo mental. | *«El cálculo de vuelto en córdobas y dólares es automático. Cero margen de error mental para el cajero bajo presión.»* | **Vuelto exacto C$ / USD**<br>**Tipografía tabular fija.** |
| **4. Ticket Térmico & Cierre CTA** | 720 – 960 | 24.0s – 32.0s (8.0s) | Render de ticket térmico 58mm (DGI 09-2007) saliendo por la ranura superior con corte parcial. Pantalla de cierre institucional con Logo oficial, eslogan y CTA en verde `#00BF81`. | *«La velocidad en mostrador no es casualidad; es diseño de software. Comenta DEMO para ver el flujo en vivo.»* | **Despacho en 1 segundo**<br>**Comenta DEMO** |

---

## 2. Fidelidad Técnica a las UIs Reales del Producto

Para cumplir estrictamente con el principio de **cero invención de UIs**, cada elemento visual se deriva directamente del código fuente de `apps/pos_app`:

### A. Terminal MIRAY Q80 (`product_grid_geometry.dart`, `sale_view.dart`)
- **Geometría física:** Ratio 800×1280 px @ 240 dpi (ancho lógico 533 dp).
- **Header superior:** Tienda activa mock `Café San Juan`, cajero `Carlos Cajero`, indicador de sincronización `En Línea` (`cloud_sync_status_badge.dart`).
- **Barra de categorías:** Chips oficiales (`category_filter_bar.dart`): `Todos`, `Bebidas Calientes`, `Bebidas Frías`, `Comidas`, `Postres`.
- **Target táctil de producto:** `ProductCard` con altura y área de pulsación ergonométrica (>56 dp) y feedback visual inmediato de toque (ripple con respuesta <50 ms).

### B. Selector de Modificadores y Extras (`sale_view.dart` - `_showOptionsDialog`)
- **Diálogo Modal:** Título del producto `Cappuccino Artesanal` con precio base de `C$ 85.00`.
- **Grupo de modificadores:** `Tipo de Leche` (Opcional, 1 opción) y `Extras`:
  - `Leche Entera (+C$ 0.00)`
  - `Leche de Almendras (+C$ 20.00)` (Seleccionada activamente con check/radio verde)
- **Botón de acción:** `AGREGAR AL PEDIDO` (ElevatedButton en azul marino `#1E3A40` / `#003757` con radio redondeado de 8 dp).
- **Línea añadida al carrito:** `1x Cappuccino Artesanal` con extra `+ Leche de Almendras (C$ 20.00)` - Total: `C$ 105.00`.

### C. Botón de Cobro Primario (`sale_view.dart`)
- **Dimensiones:** Botón `COBRAR` con target táctil mayor a 56 dp de alto, contraste máximo sobre la base del carrito, ubicado ergonómicamente al alcance del pulgar derecho del cajero.

### D. Modal de Cobro Multimoneda (`multi_currency_checkout_dialog.dart`)
- **Total de la venta:** `C$ 105.00`.
- **Selector de moneda recibida:** Chips `NIO (C$)` y `USD ($)`.
- **Monto entregado:** Billete de `C$ 500.00`.
- **Tasa de cambio oficial BCN:** `36.6243` NIO/USD.
- **Panel de Vuelto (`NhilosColors.successLight` `#ECFDF5`, borde `#10B981`):**
  - Texto principal: `Vuelto: C$ 395.00` en tipografía tabular fija (`FontFeature.tabularFigures()`).
  - Línea secundaria: `Equivalente en USD: $10.79 USD`.
- **Botón final:** `COMPLETAR COBRO` (Verde esmeralda `#00BF81`).

### E. Impresión de Ticket Térmico 58mm (`receipt_58mm_formatter.dart`)
- **Cabecera DGI:** `CAFÉ SAN JUAN`, `RUC: J0310000000000`, `Plaza Central, Managua` (datos 100% ficticios/mock).
- **Numeración oficial:** Factura `001-001-01-00004521`.
- **Detalle:** `1  Cappuccino Artesanal   C$ 85.00`, `   + Leche Almendras       C$ 20.00`.
- **Totales:** Total `C$ 105.00`, Efectivo `C$ 500.00`, Cambio `C$ 395.00` (`$10.79 USD`).
- **Pie DGI:** *«Conserve su factura para cualquier reclamo.»*

---

## 3. Detalle Cinemático por Escena

### Escena 1: Hook & Contraste (Frames 0 – 180 | 0.0s – 6.0s)
* **Fondo:** Sólido `#003757` corporativo.
* **Composición Visual:**
  - Lado izquierdo / Fondo desvanecido: Réplica de un sistema legacy saturado de botones diminutos (30 botones de colores discordantes, textos apiñados de 9px, targets táctiles de apenas 28px propensos a errores de dedo).
  - Lado derecho / Primer plano emergente: La interfaz limpia y diáfana de NHILOS POS con tarjetas de producto amplias y espaciado de descanso visual.
* **Efecto de Cámara:** Zoom suave `1.0 ➔ 1.05` destacando la tranquilidad visual de NHILOS.
* **Subtítulo Cinético:**
  - Frames 30–100: `Menos toques.` (Texto blanco en tipografía `Renogare`, tracking `4px`).
  - Frames 100–170: `Más fluidez en caja.` (Color verde `#00BF81`).

### Escena 2: Terminal MIRAY Q80 & Modificadores / Extras (Frames 180 – 450 | 6.0s – 15.0s)
* **Hardware:** Mockup realista de la terminal portátil MIRAY Q80 (cuerpo oscuro ergonómico, pantalla 800×1280 táctil).
* **Acciones Animadas:**
  1. **Frame 200–225:** El cursor táctil pulsa sobre la tarjeta de `Cappuccino Artesanal` (C$ 85.00). Efecto ripple instantáneo (<50 ms).
  2. **Frame 225–290:** Se abre el diálogo modal `_showOptionsDialog` con los grupos de modificadores y extras.
  3. **Frame 290–330:** Toque en el extra `Leche de Almendras (+C$ 20.00)`. La opción se selecciona con check verde `#00BF81`.
  4. **Frame 330–370:** Toque en el botón `AGREGAR AL PEDIDO`. El modal se cierra suavemente.
  5. **Frame 370–420:** El carrito lateral refleja `1x Cappuccino Artesanal` con modificador `+ Leche Almendras` y total `C$ 105.00`. El cursor se desplaza al botón inferior `COBRAR` (>56 dp) y ejecuta clic en el frame 415.
* **Subtítulo Cinético:**
  - Frames 210–320: `Respuesta táctil: <50 ms`
  - Frames 330–440: `Teclado limpio y seguro.`

### Escena 3: Cobro Multimoneda & Vuelto Tabular (Frames 450 – 720 | 15.0s – 24.0s)
* **Entorno:** Diálogo modal `MultiCurrencyCheckoutDialog` centrado sobre la pantalla del POS con overlay oscuro.
* **Acciones Animadas:**
  1. **Frame 460–500:** El modal presenta el total a pagar `C$ 105.00` con desglose limpio.
  2. **Frame 500–560:** Marcación rápida de efectivo entregado: billete de `C$ 500.00` (pulsación de botón de denominación rápida o tipeo numérico fluido).
  3. **Frame 560–660:** Se despliega automáticamente el contenedor de vuelto verde esmeralda:
     - `Vuelto: C$ 395.00`
     - `Equivalente en USD: $10.79 USD` (a tasa oficial `36.6243`).
     - Tipografía tabular fija: sin saltos de ancho en los números, precisión visual absoluta.
  4. **Frame 660–700:** Clic en el botón verde `COMPLETAR COBRO`.
* **Subtítulo Cinético:**
  - Frames 480–590: `Vuelto exacto C$ / USD`
  - Frames 600–710: `Tipografía tabular fija.`

### Escena 4: Ticket Térmico & Cierre CTA (Frames 720 – 960 | 24.0s – 32.0s)
* **Transición:** El modal de cobro se desvanece con éxito de pago verificado.
* **Animación del Ticket Térmico (Frames 720–830):**
  - La terminal Q80 emite la factura térmica de 58mm saliendo suavemente por el cabezal superior.
  - Efecto de desplazamiento vertical y animación de corte parcial nítido.
  - Se aprecian los datos fiscales reales: `SOHO CAFÉ`, RUC, número de factura DGI y el cambio desglosado.
* **Pantalla Final de Cierre (Frames 830–960 | Regla de Marca NHILOS):**
  - Fondo Navy `#003757`.
  - Elemento 1: Logo oficial PNG (`apps/owner_dashboard/public/logo.png`).
  - Elemento 2: Texto `NHILOS POS` (fuente `Renogare`, tracking `6px`, mayúsculas).
  - Elemento 3: Eslogan `Conectamos los hilos de tu negocio.` en color `#CCCCCC`.
  - Elemento 4 (Badge interactivo de conversión): Botón verde `#00BF81` con texto oscuro en negrita: `Comenta DEMO`.
* **Subtítulo Cinético:**
  - Frames 840–950: `NHILOS POS` / `Comenta DEMO`

---

## 4. Datos Reales de Prueba (Validación Operativa y Confidencialidad)

- **Comercio:** Café San Juan (Mock / Demo Comercial)
- **RUC Fiscal:** `J0310000000000` (Mock)
- **Cajero:** Carlos Cajero
- **Producto:** Cappuccino Artesanal (SKU: `CAF-CAP-01`, Base C$ 85.00)
- **Modificador / Extra:** Leche de Almendras (+C$ 20.00 -> Total C$ 105.00)
- **Moneda Recibida:** Córdobas (Efectivo C$ 500.00)
- **Tasa de Cambio Oficial BCN:** C$ 36.6243 por USD
- **Vuelto en C$:** C$ 395.00
- **Equivalente de Vuelto en USD:** $10.79 USD
- **Resolución de Salida:** 1080 × 1920 (Vertical 9:16)
- **Frame Rate:** 30 FPS exactos (960 frames = 32.00 segundos)
