# NHILOS POS — Guión Técnico de Video y Especificación de Showcase
## Tema C: Continuidad Real Offline («La fila no puede esperar»)

**Document ID:** NH-VID-005  
**Versión:** 1.0  
**Objetivo de Negocio:** Demostrar que la terminal con base de datos local sigue cobrando, imprimiendo y registrando aunque el Wi-Fi caiga en plena hora punta, y que al volver la señal la cola transaccional se sincroniza sin duplicar folios ni bloquear la caja.  
**Formato:** Reel Vertical 9:16 (1080 × 1920 px)  
**Duración Total:** 36.0 segundos (1080 frames @ 30 FPS)  
**Motor de Locución:** Microsoft Edge TTS  
**Voz Oficial:** `es-NI-FedericoNeural` (Nicaragua, dicción corporativa nítida)  
**Logo Oficial:** `apps/owner_dashboard/public/logo.png`  
**Colores Oficiales:** `#003757` (Navy Profundo), `#00BF81` (Verde Esmeralda), `#D97706` (Ámbar Sereno de continuidad), `#CCCCCC` (Gris Neutro), `#F8FAFC` (Surface Slate 50), `#00253B` / `#001F33` (Navy Dark)

---

## 1. Estructura Narrativa y Tiempos por Escena

| Escena | Rango de Frames | Duración (s) | Enfoque Visual | Locución (Edge TTS) | Subtítulos Cinéticos & Badges |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **1. Hook: el Wi-Fi cae en hora punta** | 0 – 240 | 0.00s – 8.00s (8.00s) | Terminal MIRAY Q80 en mostrador. Router con barras de señal que se apagan una a una y Wi-Fi tachado. La terminal NO se congela: el cajero sigue marcando productos y el badge pasa de verde `En Línea` a ámbar `Venta local protegida`. | *«¿Qué ocurre en tu local si el internet se corta en plena hora punta? La mayoría de sistemas en la nube simplemente se paralizan.»* | **¿Tu caja depende del internet?**<br>La fila no puede esperar. |
| **2. Cobro local e impresión inmediata** | 240 – 540 | 8.00s – 18.00s (10.00s) | La cajera presiona `Cobrar`, completa el cobro multimoneda y el ticket térmico 58mm se imprime al instante. Barra superior ámbar serena `#D97706`: `Venta local protegida · 1 ticket en cola`. Sello `GUARDADO LOCAL · Base local`. | *«En NHILOS la terminal física es la fuente de verdad. El cobro se valida sobre una base de datos local embebida y el ticket térmico se emite al instante.»* | **Base de datos local**<br>Cobro e impresión ininterrumpidos. |
| **3. Reconexión e idempotencia** | 540 – 810 | 18.00s – 27.00s (9.00s) | Animación de reconexión: las barras suben, el indicador ámbar pasa a verde sereno `En sincronía`. Pantalla dividida: terminal arriba y módulo `Ventas` del Owner Dashboard abajo, con la misma venta `#00107` reflejada. Contador `1 venta = 1 folio`. | *«Al volver la señal, la cola transaccional se sincroniza automáticamente con la nube sin duplicar números ni bloquear la caja.»* | **Sincronización idempotente.**<br>Cero duplicados. Cero pérdidas. |
| **4. Cierre institucional y CTA** | 810 – 1080 | 27.00s – 36.00s (9.00s) | Claim `Diseñamos para la realidad, no para el escenario perfecto`. Logo oficial, `NHILOS POS`, eslogan y CTA verde `#00BF81` `Escríbenos por WhatsApp`. | *«Operación continua garantizada. Conoce cómo blindar tu mostrador escribiendo a nuestro WhatsApp.»* | **NHILOS POS**<br>Diseñado para la realidad. |

---

## 2. Fidelidad Técnica a las UIs Reales del Producto

### A. Terminal POS (`apps/pos_app`)
- **Marco de hardware:** MIRAY Q80 portrait, ranura de impresora térmica 58mm en la parte superior.
- **Barra de estado:** comercio mock `Café San Juan`, cajero `Carlos Cajero`, hora `12:52 PM` y `CloudSyncStatusBadge`.
- **Estados reales del badge (`cloud_sync_status_badge.dart`):**
  - Sin conexión: `Icons.cloud_off` en ámbar `NhilosColors.warning`, tooltip `Venta local protegida — N pendiente(s)`. Nunca rojo de alarma (§35.4).
  - Con pendientes: `Icons.cloud_upload` ámbar con contador de documentos.
  - Sincronizado: `Icons.cloud_done` verde `Nube Sincronizada`.
- **Venta de prueba:** `#00107`, 3 ítems (2 Cappuccino Artesanal + 1 Pastel Tres Leches), total `C$ 260.00`, efectivo `C$ 500.00`, vuelto `C$ 240.00` / `$6.55 USD` a T.C. BCN `36.6243`.
- **Cobro:** diálogo `MultiCurrencyCheckoutDialog` con chips de denominación y botón `Completar Cobro & Imprimir`.
- **Ticket:** mismo formato 58mm de los clips anteriores, con cabecera `CAFÉ SAN JUAN`, `RUC: J0310000000000`, `Plaza Central, Managua` y pie DGI.

### B. Owner Dashboard (`apps/owner_dashboard`)
- **Módulo:** `Ventas` (`/sales`) con tabs oficiales `Resumen`, `Ventas por Hora`, `Top Productos`, `Rendimiento Cajeros`, `Reconciliaciones`.
- **Tarjetas:** `Ventas Brutas`, `Facturas`, `Ticket Promedio`.
- **Fila sincronizada:** factura `001-001-01-00000107`, `Carlos Cajero`, `12:52 PM`, `C$ 260.00`, estado `Sincronizada`.
- **Header:** `Café San Juan`, `RUC: J0310000000000`, badge verde `En Línea`.

### C. Datos de prueba comerciales (Nicaragua)
- Razón Social: `CAFÉ SAN JUAN`
- RUC: `J0310000000000`
- Dirección: `Plaza Central, Managua`
- Cajero: `Carlos Cajero`
- Moneda: Córdobas (`C$ NIO`) y Dólares (`$ USD`)

---

## 3. Zonas Seguras de Instagram Reels (9:16 — 1080×1920)

- **Zona Segura Superior:** margen libre de al menos `130px` para los controles nativos (*Reels*, *Amigos*, *Búsqueda*, *Cámara*).
- **Zona Segura Inferior:** margen libre de al menos `280px` a `320px` para `@nhilosapp`, pie de foto y reproductor de audio.
- **Tipografía:** titulares y marca en `Renogare, Poppins, sans-serif` con tracking `4px` a `6px`; cifras tabulares fijas (`tabular-nums`).
- **Regla de capas:** las fases dentro de una misma escena viven en `absolute inset-0` concéntrico para evitar saltos de layout.

---

## 4. Estrategia de Audio Edge TTS

- **Voz:** `es-NI-FedericoNeural`
- **Rates calibrados para holgura de audio:** cada escena reserva al menos 20 frames de padding después de la locución.
  - Escena 1: `+8%` sobre 240 frames.
  - Escena 2: `+10%` sobre 300 frames.
  - Escena 3: `+12%` sobre 270 frames.
  - Escena 4: `+4%` sobre 270 frames.
- **Consistencia Sensorial:** la locución cierra con *«escribiendo a nuestro WhatsApp»* y el botón en pantalla dice `Escríbenos por WhatsApp`; no se asume número, enlace ni dominio.
- **Comando:** `pnpm --filter showcase_video generate:voiceover -- --only offline_`

---

## 5. Entregables

- Composición Remotion: `OfflineReel` (1080 × 1920, 30 FPS, 1080 frames).
- Escenas: `OfflineHookScene`, `OfflineSaleScene`, `OfflineSyncScene`, `OfflineOutroScene`.
- MP4 final: `apps/showcase_video/out/nhilos_pos_continuidad_offline.mp4`.
- Entrega: `C:\Users\Octavio Morales\Pictures\nhilos\clips\nhilos_pos_continuidad_offline.mp4`.
