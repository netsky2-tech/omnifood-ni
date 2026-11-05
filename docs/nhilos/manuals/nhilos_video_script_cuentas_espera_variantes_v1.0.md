# Guión Técnico de Video: Agilidad Operativa y Cuentas en Espera (Reel 9:16)

- **Versión:** 1.0 (Sincronización completa de voz con padding de seguridad — Regla 8.3)
- **Fecha:** 2026-11-02
- **Formato:** Vertical 9:16 (`1080 × 1920 px`, 30 FPS) — Instagram Reels / TikTok / YouTube Shorts
- **Duración total:** 35.5 segundos (`1,065 frames` @ 30 FPS — *Nota: los 4 audios en `es-MX-JorgeNeural` a `Rate: -4%` suman `31.83s` / `955 frames` reales de locución; se aplica la distribución de 1,065 frames para otorgar de 22 a 31 frames de padding limpio por escena según la Regla 8.3 de `nhilos-video-showcase`, o 900 frames / 30.0s si se prefiere ajustar `Rate` a `+16%`*)
- **Composición Remotion:** `HoldOrdersReel` (`apps/showcase_video/src/compositions/HoldOrdersReel.tsx`)
- **Archivo de salida:** `nhilos_pos_cuentas_espera_variantes.mp4`
- **Voz Edge TTS:** `es-MX-JorgeNeural` (`Rate: -4%`, `Pitch: +0Hz`)

---

## 1. Datos Comerciales Reales (Mock Nicaragüense Autorizado)

- **Comercio:** `Café San Juan` (`RUC: J0310000000000`, `Plaza Central, Managua`)
- **Terminal:** `MIRAY Q80` (`Caja 1 · Punto de Venta`)
- **Operador:** `Carlos Cajero`
- **Monedas activas:** Córdobas (`C$`) y Dólares (`USD`, T.C. Oficial BCN: `36.6243`)
- **Orden #12 (Puesta en Espera con Variantes/Modificadores):**
  - Producto base: `Capuccino Artesanal` (`C$ 85.00`)
  - Modificador (`Tipo de Leche`): `+ Leche de Almendras (+C$ 20.00)`
  - Nota operativa: `Sin azúcar · Para llevar`
  - Producto opcional visible en catálogo: `Pastel Tres Leches` (`C$ 90.00`)
  - Total Orden #12 a cobrar: `C$ 105.00` (equiv. `$ 2.87 USD`)
- **Orden Rápida Alternativa (Cliente siguiente en la fila):**
  - Producto: `Café Americano` (`C$ 60.00`)

---

## 2. Especificación de Interacción y Navegación

- **Recorrido de pantallas:**
  1. `Terminal POS (Catálogo/Carrito activo con modificadores)` ➔ Acción viva en Frame 0: toque sobre el botón ámbar/estructurado `Poner en Espera` (`EN ESPERA`) y limpieza inmediata del carrito a `C$ 0.00`.
  2. `Barra superior con badge activo En espera (1)` ➔ Corte de atención en Frame 45 (`scale: 1.0 ➔ 1.08`) enfocando la barra superior donde se enciende `En espera (1)` mientras se marca al instante un `Café Americano (C$ 60.00)` para el siguiente cliente.
  3. `Drawer lateral Cuentas en Espera` ➔ Toque con pausa de asentamiento (4 frames) en el botón `En espera (1)` de la barra superior ➔ Despliegue de panel lateral limpio con la `Orden #12 - Capuccino Artesanal` intacta (`+ Leche de Almendras +C$ 20.00`) ➔ Toque en `Recuperar Orden #12` (`Reanudar`) devolviendo el carrito a `C$ 105.00` en `<50 ms`.
  4. `Cobro Multimoneda e Impresión Térmica` ➔ Toque en `Cobrar (C$ 105.00)` ➔ Modal `Cobro y Facturación` Multimoneda (C$ y USD con `tabular-nums`) ➔ Confirmación de cobro e impresión inmediata del ticket térmico con desglose completo.
  5. `Cierre Canónico NHILOS POS` ➔ Fondo `#003757`, isotipo oficial `logo.png`, título `NHILOS POS`, eslogan `Conectamos los hilos de tu negocio.`, subtítulo `Flujo de mostrador para tiendas, retail y gastronomía` y botón `#00BF81` con texto en `#003757`: `Comenta DEMO`.

---

## 3. Tabla de Escenas y Timecodes (30 FPS — Opción A Recomendada: 1,065 Frames / 35.5s)

| Escena | Frames (Opción A / 30s Base) | Tiempo | Visual y Acción de Pantalla | Audio Edge TTS (`es-MX-JorgeNeural`, `-4%`) | Texto Cinético Superpuesto (Subtítulos) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Escena 1**<br>Acción Viva Frame 0 | `f0 – f45`<br>(45 frames) | `0.0s – 1.5s` | **Frame 0 (Live Action):** El dedo pulsa el botón `Poner en Espera` en la terminal MIRAY Q80 mientras hay un pedido con modificadores en pantalla (`Capuccino Artesanal C$ 85.00` + `Leche de Almendras +C$ 20.00`). El carrito se despeja inmediatamente a `C$ 0.00`. Overlay ligero con los 4 elementos de marca. Cero arranques estáticos. | `hold_1_hook.mp3` (parte 1):<br>*«Un cliente olvida su billetera o duda al pedir...»* | **Cuentas en espera.** |
| **Escena 2**<br>Corte de Atención 1.5s | `f45 – f280`<br>(235 frames)<br>*(Base: f45–f150)* | `1.5s – 9.33s` | **Frame 45 (Corte de Atención):** Zoom dinámico de `scale: 1.0` a `1.08` hacia la barra superior. Se enciende el indicador discreto `En espera (1)` mientras se marca un `Café Americano (C$ 60.00)` para el cliente de atrás en menos de un segundo. (Audio Escenas 1+2: `252f` + `28f` padding = `280f`). | `hold_1_hook.mp3` (parte 2):<br>*«...y la fila entera se detiene. En NHILOS la caja nunca se frena.»* | **Cero filas trabadas.**<br>**Atiende al siguiente al instante.** |
| **Escena 3**<br>Drawer Cuentas en Espera y Recuperación | `f280 – f590`<br>(310 frames)<br>*(Base: f150–f390)* | `9.33s – 19.67s` | Toque en el botón `En espera (1)` en la barra superior. Se despliega el panel lateral limpio con el ticket guardado intacto (`Orden #12 - Capuccino Artesanal`, `Leche de Almendras +C$ 20.00` y notas). Toque en `Recuperar Orden #12` (`Reanudar`). La orden vuelve al carrito exactamente como estaba (`C$ 105.00`) en `<50 ms`. (Audio: `284f` + `26f` padding = `310f`). | `hold_2_resume.mp3`:<br>*«Guarda la orden en proceso con un solo toque y atiende al siguiente. Recupera carritos simultáneos sin perder variantes ni extras.»* | **Múltiples órdenes activas.**<br>**Variantes intactas en <50 ms.** |
| **Escena 4**<br>Cobro Multimoneda y Ticket Térmico | `f590 – f835`<br>(245 frames)<br>*(Base: f390–f660)* | `19.67s – 27.83s` | Pulsación de `Cobrar (C$ 105.00)` ➔ Modal Multimoneda (`C$ 105.00` / `$ 2.87 USD`, efectivo recibido `C$ 200.00`, vuelto `C$ 95.00` / `$ 2.59 USD`) ➔ Confirmar cobro e impresión automática de ticket térmico con desglose claro (`Capuccino Artesanal C$ 85.00` + `Leche de Almendras C$ 20.00`). (Audio: `216f` + `29f` padding = `245f`). | `hold_3_checkout.mp3`:<br>*«Despacho fluido en mostrador, control de comanda sin confusiones y cobro ágil en córdobas o dólares.»* | **Despacho sin pausas.**<br>**Impresión térmica inmediata.** |
| **Escena 5**<br>Cierre Canónico CTA | `f835 – f1065`<br>(230 frames)<br>*(Base: f660–f900)* | `27.83s – 35.50s` | Pantalla de cierre sobre fondo `#003757` con isotipo oficial (`logo.png`), título `NHILOS POS`, eslogan `Conectamos los hilos de tu negocio.`, subtítulo `Flujo de mostrador para tiendas, retail y gastronomía` y botón interactivo central en verde `#00BF81` con texto en navy `#003757`: `Comenta DEMO` + `Acceso a la demostración operativa`. (Audio: `203f` + `27f` padding = `230f`). | `hold_4_outro.mp3`:<br>*«Agiliza la atención de tu negocio. Comenta DEMO abajo para enviarte el acceso directo.»* | **NHILOS POS**<br>**[ Comenta DEMO ]**<br>**Acceso a la demostración operativa** |

---

## 4. Validación Técnica del Activation Contract (`nhilos-video-showcase` v1.2.0)

- [x] **Acción viva en Frame 0:** El botón `Poner en Espera` se presiona en el instante `0.0s` (`f0`) y limpia la comanda a `C$ 0.00`, demostrando la reactividad del sistema sin tarjetas de título previas.
- [x] **Corte de atención a los 1.5s (`f45`):** En el frame 45 exacto se aplica el cambio de escala (`1.0 ➔ 1.08`) hacia el badge `En espera (1)` mientras entra el siguiente pedido (`Café Americano C$ 60.00`), reseteando la atención del usuario.
- [x] **Continuidad sin flashes (`Window Frame Invariance`):** Las escenas 1, 2 y 3 mantienen el marco de la terminal MIRAY Q80 estable sin fundidos a blanco; el modal de cobro y el ticket térmico transicionan con capas concéntricas.
- [x] **Safe Zones de Instagram Reels / TikTok:** Encabezados y badges sobre `top >= 130px`; subtítulos cinéticos alojados sobre `bottom >= 280px`.
- [x] **CTA Canónico Comment-to-DM:** Coincidencia exacta palabra por palabra entre el audio Edge TTS (*«Comenta DEMO abajo para enviarte el acceso directo»*) y la interfaz del botón (`Comenta DEMO`).
