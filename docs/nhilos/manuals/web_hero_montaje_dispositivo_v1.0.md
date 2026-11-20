# Guía: Montaje Hero Web — UI del POS sobre dispositivo en mano (Google Flow)

**Versión:** 1.0 · **Para:** Hero del home de la web NHILOS (estilo referencia PayOne: mano + dispositivo con UI real + mensaje a la izquierda)
**Asset UI:** `hero_pos_screen.png` (1600×2560, 2 filas de menú café + carrito `Total: C$ 125.00 · VER CARRITO`) — 100% fiel a `sale_view.dart`, `product_card.dart` y `nhilos_tokens.dart`, y verbatim del menú de las fotos del cliente.

---

## 1. Recurso 2: el dispositivo en mano (qué buscar y descargar)

En Google Images / bancos PNG gratuitos (PNGWing, FreePik, Pixabay, PNGRepo), busca y descarga **un solo recurso** con **fondo transparente** (PNG):

**Opción recomendada (celular genérico, más resultados limpios):**
- `hand holding smartphone mockup transparent background png`
- `mano sosteniendo celular png fondo transparente`
- `hand holding iphone png isolated` (elige pantalla apagada/negra y vista frontal o 3/4 con la pantalla visible en su totalidad)

**Opción fiel al piloto (terminal POS con impresora integrada, estilo Q80):**
- `Alacrity POS terminal photo` / `MIRAY Q80 POS terminal` (posible que no haya PNG transparente; si solo hay foto con fondo, funciona igual en Flow porque Veo re-encuadra)
- `rugged handheld pos terminal with printer photo`

Criterios de selección: pantalla **totalmente visible y sin reflejos**, mano agarrando por los bordes (no tapando la pantalla), fondo transparente o liso, resolución ≥1500 px de alto. Descárgalo como `device_in_hand.png` / `device_in_hand.jpg`.

> Nota: el ángulo exacto no importa — Flow (Veo) re-proyecta la UI sobre la pantalla del dispositivo en el ángulo que genere. Lo importante es que la pantalla se vea completa.

---

## 2. Recursos que subes a Google Flow (ingredients)

1. `hero_pos_screen.png` — la UI real (este asset).
2. `device_in_hand.png` — el dispositivo agarrado por la mano (recursos de la Sección 1).

---

## 3. Prompt principal para Flow (Veo) — en inglés

Genera imagen (o video de 4–8 s con cámara estática para usarlo como hero animado):

> *"Commercial product photography: a real hand holding a dark countertop Android point-of-sale device, screen facing the camera slightly angled, on the right side of the frame over a clean deep teal studio background (#1E3A40). The device screen displays exactly the provided point-of-sale app screenshot: a Spanish coffee shop sales screen with a light background, a search bar, category filter chips, a grid of coffee product cards with prices in Cordobas, one card highlighted with an orange 2x1 promotion badge, and a dark teal cart bar at the bottom reading 'Total: C$ 125.00' with a 'VER CARRITO' button. Do not alter, blur, or reinterpret the screen content — render the provided screenshot sharply on the device screen with correct perspective and slight screen glow. Soft studio lighting, shallow depth of field, photorealistic, high detail, vertical subject on the right half of the frame leaving the left half empty for headline text."*

Variante video (hero con movimiento sutil):

> *"Slow subtle camera push-in on a real hand holding a dark Android point-of-sale device, screen facing the camera, over a deep teal studio background. The screen shows exactly the provided point-of-sale app screenshot (Spanish coffee shop sales grid with a 2x1 promo badge and a dark cart bar reading 'Total: C$ 125.00'). Do not alter the screen content — keep the provided screenshot perfectly readable with correct perspective and a soft screen glow. Photorealistic, soft studio lighting, shallow depth of field, 6 seconds."*

**Instrucciones negativas (si Flow ofrece el campo o las acepta en el prompt):**
`no changed screen text, no invented app UI, no brand logos on the device bezel, no captions, no extra floating cards`

**Reglas de fidelidad:**
- La fuente de verdad de la pantalla es `hero_pos_screen.png`. Si Veo altera textos/precios de la pantalla, re-genera con la instrucción "render the provided screenshot exactly" o sube el screenshot **recortado solo a la pantalla** como segundo ingrediente con el prompt variante B.
- **Variante B (si la UI sale deformada):** genera solo el entorno (mano + dispositivo con pantalla negra + fondo) con el prompt de la Sección 4, y monta `hero_pos_screen.png` tú mismo con máscara de perspectiva (CapCut/Punch "transformar en cuadrilátero" o en la web con CSS `transform: perspective(...) rotateY(...)` + `clip-path`).

---

## 4. Variante B — prompt del entorno limpio (para montaje manual de la UI)

> *"Commercial product photography: a real hand holding a dark countertop Android point-of-sale device with a completely black blank screen, screen facing the camera slightly angled, on the right side of the frame over a clean deep teal studio background (#1E3A40), soft studio lighting, shallow depth of field, photorealistic, no reflections on the black screen, no logos on the device, vertical subject on the right half leaving the left half empty."*

Luego montas la UI en edición (o en el propio HTML del hero con CSS perspective, que es lo más nítido y escalable).

---

## 5. Montaje final del Hero (web)

Estructura tipo PayOne adaptada a NHILOS:
- **Fondo:** `#1E3A40` (Deep Teal — token real de tu app; es además el color del cart bar, coherencia total).
- **Izquierda (~55%):** eyebrow (`SOFTWARE REAL. HARDWARE REAL.`), headline, subtítulo (p. ej. "El sistema de caja que funciona sin internet, con factura fiscal y vuelto exacto en córdobas."), CTA verde `#00BF81` (`Solicitar demo`) + secundario (`Ver cómo funciona ▶`).
- **Derecha (~45%):** el montaje de Flow (mano + dispositivo + UI), recortado 9:16 o libre; opcional tarjeta flotante blanca tipo PayOne (`Venta cobrada +C$ 125.00 · 2x1 aplicado`) y otra inferior (`25+ comercios en piloto`).
- **Tipografía sobre el fondo oscuro:** blanco `#F8FAFC`, acentos `#00BF81`.
- **Alternativa 100% CSS (nítida en cualquier resolución):** dispositivo de la variante B como imagen base + `hero_pos_screen.png` posicionado con `transform: perspective(1200px) rotateY(-8deg) rotateX(2deg)` dentro del marco de pantalla — sin depender de la re-proyección de Veo.

---

## 6. Checklist de fidelidad

- [ ] La UI montada es `hero_pos_screen.png` (precios verbatim: 80/70/100/90/125 2x1/100; carrito Total C$ 125.00).
- [ ] Sin logos de hardware en el bezel; dispositivo genérico oscuro.
- [ ] La pantalla es legible en móvil (probar el hero a 375 px de ancho).
- [ ] El left half queda libre para el headline; nada de texto generado por Veo.
- [ ] Colores del hero: fondo `#1E3A40`, CTA `#00BF81`, texto `#F8FAFC`.
