# Guion de Video: Pieza 2 — Video Físico en Mostrador (Semana 4 · Jueves 19/11)

**Versión:** 1.1 (montaje híbrido con fotos reales) · **Duración objetivo:** 18–22 s · **Formato:** 9:16 vertical (1080×1920, TikTok/Reels)
**Producto:** NHILOS POS — Cobro bimoneda + impresión térmica 80 mm, sin internet
**Hardware:** terminal POS de mostrador genérico (Android con impresora térmica integrada/cercana). *Nota interna: el equipo del piloto es un MIRAY Q80 distribuido como Alacrity; no se nombra ni el modelo ni el distribuidor en el video ni en el caption — no es hardware que vendamos o distribuyamos.*

---

## 1. Cambio de v1.0 → v1.1

El terminal físico del piloto devolvió al cliente: **no hay rodaje nuevo disponible**. El montaje es **híbrido** con dos fotos reales ya tomadas en el cliente de café (08:00 a. m., `20261002_080016.jpg` y `20261002_080158.jpg`, 3000×4000) más assets digitales re-generados para continuidad con el menú visible en las fotos (Cappuccino 12oz C$ 125.00, promo 2x1). El argumento de venta sigue intacto: **app real corriendo en un terminal real, con dedo real tocando la pantalla** — y no nombramos hardware que no vendemos.

**Inventario real disponible:**
- **Foto A `20261002_080158.jpg`** — dedo de un usuario tocando el tile "Cappuccino 12oz" en la app NHILOS POS real; badge 2x1, carrito "Total: C$ 90.00 · 1 productos agregados", botón VER CARRITO; al fondo, el dashboard de propietario en un monitor. **Oro para el Frame 0.** Ratio de la toma: vertical 3:4 → encaja en 9:16 con leve crop lateral o reframe con margen.
- **Foto B `20261002_080016.jpg`** — terminal casi frontal y estática, pantalla legible (menú de café) sobre superficie oscura. Ideal para el **plano de cierre** con zoom lento (Ken Burns) + overlay de marca.

---

## 2. Timeline aprobado (verbatim del brief) + fuente de cada toma

| Tiempo | Plano | Fuente del material | Texto en pantalla | Asset NHILOS |
| --- | --- | --- | --- | --- |
| 0.0–1.5 s | Frame 0 en vivo: dedo toca el monto/producto en pantalla | **Foto A real** (`080158.jpg`): manejar como plano animado — zoom-in sutil lento sobre el dedo/tile (efecto "la foto respira") o parallax 2.5D separando mano/pantalla | `Software real. Hardware real.` | Overlay `overlay_1` |
| 1.5–6.0 s | Primer plano de la pantalla con el vuelto exacto en C$ | **Insert digital** `q80_screen.png` (checkout bimoneda de café) a pantalla completa, flash-in 1.06→1.00 | `Cobro bimoneda e impresión en 1 segundo.` | `q80_screen.png` + overlay `overlay_2` |
| 6.0–14.0 s | Ticket térmico 80 mm saliendo; mano lo toma y se lee el desglose fiscal y el vuelto | **Generado en Flow (Veo)** con `ticket_80mm.png` como ingrediente + SFX de corte térmico de librería (no hay impresora disponible) | `Sin internet. Sin filas trabadas.` | `ticket_80mm.png` (ingrediente) + overlay `overlay_3` |
| 14.0–20.0 s | Cierre: plano limpio del terminal | **Foto B real** (`080016.jpg`): Ken Burns lento (zoom 1.00→1.08, 6 s) | — | Overlay `overlay_4` (NHILOS POS + `Comenta DEMO`) |

**Audio:** `fisico_1_vo.mp3` (Edge TTS `es-MX-JorgeNeural`, −2%, 43 KB) entra en **14.0 s** sobre el plano de cierre:
> «Así responde NHILOS en un mostrador real. Comenta DEMO abajo para enviarte el acceso directo.»

Tramo 6.0–14.0 s: SFX de impresora térmica (corte mecánico) de librería, −6 dB bajo la voz; sin música en ese tramo para que el "clack" recorte. Resto: música TikTok de librería low-profile.

---

## 3. Kit de assets entregado (`recursos/semana4/`)

| Archivo | Origen | Dimensiones | Uso |
| --- | --- | --- | --- |
| `q80_screen.png` | `Semana4PosScreen` — UI real de `MultiCurrencyCheckoutDialog`, **contexto café**: Café La Ceiba · Caja 1, factura #00893, 2 Cappuccino 12oz · Promo 2x1, Total **C$ 125.00** ($3.41 USD), paga `$ 20.00` USD (chip resaltado, = C$ 732.49), **Vuelto: C$ 607.49**, TC BCN 36.6243, botón `COBRAR · C$ 125.00` | 1600×2560 (800×1280 @2×, ratio nativo del terminal) | Insert 1.5–6.0 s |
| `ticket_80mm.png` | `Semana4Ticket80mm` — layout real 40 columnas, **contexto café**: 2 Cappuccino 12oz 250.00, PROMOCION 2x1 −125.00, SUBTOTAL C$ 108.70, IVA 15% C$ 16.30, TOTAL CORDOBAS **C$ 125.00**, TOTAL USD $ 3.41, `DETALLE DE PAGO BIMONEDA`: $ 20.00 recibidos (C$ 732.49) → Cambio **C$ 607.49**, Gaveta Virtual, factura 001-001-01-00000893 | 945×1256 (80 mm a 300 dpi) | Ingrediente en Flow + zoom de edición en el close-up |
| `overlay_1_software_hardware.png` | `Semana4Overlays` f0 | 1080×1920, PNG alpha | 0.0–1.5 s |
| `overlay_2_bimoneda_1seg.png` | f1 | 1080×1920, PNG alpha | 1.5–6.0 s |
| `overlay_3_sin_internet.png` | f2 | 1080×1920, PNG alpha | 6.0–14.0 s |
| `overlay_4_cierre_marca.png` | f3 — NHILOS POS + `▬ Comenta DEMO` | 1080×1920, PNG alpha | 14.0–20.0 s |
| `fisico_1_vo.mp3` | Edge TTS parte 12 | 43 KB | Audio de cierre |

**Foto A y Foto B** se copian a la carpeta de recursos (son el material base del montaje). Overlays: fondo transparente, texto en píldora scrim `#001F33 @ 72%` + borde `#00BF81 @ 45%`, tercio superior (top 180 px), libre de la UI de TikTok (~300 px inferiores).

---

## 4. Manejo de las fotos en la edición

1. **Foto A (Frame 0):** recortar a 9:16 (crop centrado en la pantalla y el dedo; el dashboard del fondo puede quedar parcialmente fuera si estorba). Animar: zoom 1.00→1.04 en 1.5 s + 2–3 px de drift vertical — la foto "respira" y parece video. Alternativa más premium: parallax 2.5D (separar en dos capas: mano/tile en primer plano, resto al fondo — CapCut "estilo 3D zoom" lo hace automático).
2. **Coordenada del toque:** el dedo toca el tile "Cappuccino 12oz C$ 125.00 (2x1)" — que es exactamente el ítem del insert. El corte a pantalla completa 1.5 s debe coincidir con el tile tocado: continuidad visual instalada.
3. **Foto B (cierre):** Ken Burns 1.00→1.08 en 6 s, sin drift lateral (la foto es casi frontal); overlay 4 entra en 14.2 s con fade 6 frames.

---

## 5. Prompts para Google Flow (Veo) — tramo del ticket

Sube `ticket_80mm.png` como ingrediente. Toma 9:16, 24 fps, 4–8 s. El terminal se describe **genérico** (sin marca):

> *"Close-up shot of a generic dark countertop Android point-of-sale terminal on a wooden shop counter next to a compact thermal receipt printer, the printer ejects a 80mm white receipt with visible Spanish text and a green highlighted payment breakdown box, a hand enters frame and pulls the receipt out holding it steady in front of the camera so the fiscal totals and the change line reading 'Cambio C$ 607.49' are readable, warm morning light, shallow depth of field, subtle handheld camera drift, photorealistic, no captions or on-screen text overlays, 9:16 vertical."*

Segunda variante (solo impresora, sin mano):

> *"Macro shot of a compact thermal receipt printer rollers feeding white 80mm receipt paper upward, printed Spanish fiscal text and green payment totals scrolling out, mechanical cutter snaps the receipt with a small paper flutter, dark counter surface, warm shop lighting, shallow depth of field, photorealistic, no captions or on-screen text overlays, 9:16 vertical."*

**Reglas de fidelidad en Flow:**
- Si Veo distorsiona el texto del ticket (limitación conocida con texto pequeño), monta el plano físico/ambiental generado SIN texto legible y resuelve el close-up legible con **zoom de edición sobre `ticket_80mm.png`** (asset real, texto perfecto).
- Nunca dejar que Veo invente texto sobre la UI ni logos en el bezel: el terminal se prompta como "generic dark" y el texto sobre pantalla solo existe en el insert digital.
- El rodaje/foto real siempre gana sobre lo generado: Flow solo cubre lo que no existe (impresora + mano).

---

## 6. Plan de edición (CapCut / Premiere)

| # | Tramo | Pista de video | Pista de overlay | Audio |
| --- | --- | --- | --- | --- |
| 1 | 0.0–1.5 s | Foto A con zoom/parallax | `overlay_1` fade-in 6 frames | Música low-profile |
| 2 | 1.5–6.0 s | Insert `q80_screen.png` flash-in 1.06→1.00 | `overlay_2` desde 1.8 s | Música + "ding" suave al aparecer el vuelto |
| 3 | 6.0–14.0 s | Flow: impresora + mano con ticket | `overlay_3` desde 6.5 s | **SFX corte térmico** (gancho) |
| 4 | 14.0–20.0 s | Foto B Ken Burns | `overlay_4` desde 14.2 s | `fisico_1_vo.mp3` desde 14.0 s |
| 5 | 20.0–22.0 s | Freeze del último frame con `overlay_4` | — | Cola del VO |

Export: 1080×1920, 30 fps (igualar al dominante de Flow si generó a 24), H.264 8–12 Mbps, AAC 128 kbps.

---

## 7. Publicación (TikTok)

- **Caption:** `El vuelto exacto en córdobas hasta con descuento 2x1, y la factura fiscal impresa, sin internet. Tu mostrador no se detiene cuando se cae la red. #nicaragua #pos #cafetin #pymes`
- **Comentario fijado:** `DEMO 👇`
- **Hora:** 11:30–12:30 o 19:00–21:00.
- **Sin marca de hardware** en caption ni texto: el texto en pantalla en venta (el argumento de venta es el software + "hardware real" genérico).

---

## 8. Validación de entrega

- [ ] Overlays con alfa verificado, dimensiones exactas.
- [ ] Continuidad visual: tile `Cappuccino 12oz (2x1)` en la Foto A ↔ ítem del insert ↔ ítem del ticket; `Vuelto: C$ 607.49` idéntico en insert y ticket.
- [ ] Vuelto legible ≥2 s en 1.5–6.0 s; desglose fiscal y Cambio legibles ≥3 s en 6–14 s.
- [ ] SFX térmico nítido, VO sincronizado con `overlay_4`.
- [ ] Duración final 18–22 s; sin marcas de hardware ni de terceros.
- [ ] Export final en `/mnt/c/Users/Octavio Morales/Pictures/nhilos/clips/`.

---

## 9. Especificaciones de firma visual (tokens)

- Verde `#00BF81`, azul `#003757`, `#001F33` (`apps/showcase_video/src/tokens/brand.ts`).
- Renogare en overlays y cierre; UI del POS nativa del diálogo real de Flutter.
- Primera frase del overlay en blanco, segunda (o clave) en verde de marca.
