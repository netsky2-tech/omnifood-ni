# Guión Técnico de Video: Cierre de Turno y Arqueo Ciego (Reel 9:16)

- **Versión:** 1.0 (Aprobado con Opción A — Sincronización completa de voz con padding de seguridad)
- **Fecha:** 2026-11-02
- **Formato:** Vertical 9:16 (`1080 × 1920 px`, 30 FPS) — Instagram Reels / TikTok / YouTube Shorts
- **Duración total:** 38.0 segundos (`1,140 frames` @ 30 FPS)
- **Composición Remotion:** `BlindAuditReel` (`apps/showcase_video/src/compositions/BlindAuditReel.tsx`)
- **Archivo de salida:** `nhilos_pos_cierre_arqueo_ciego.mp4`
- **Voz Edge TTS:** `es-MX-JorgeNeural` (`Rate: -4%`, `Pitch: +0Hz`)

---

## 1. Datos Comerciales Reales (Mock Nicaragüense Autorizado)

- **Comercio:** `Café San Juan` (`RUC: J0310000000000`, `Plaza Central, Managua`)
- **Terminal:** `MIRAY Q80` (`TERM-01`, `Caja 1`)
- **Operador:** `Carlos Cajero`
- **Monedas activas:** Córdobas (`C$`) y Dólares (`USD`, T.C. Oficial BCN: `36.6243`)
- **Fondo de caja inicial:** `C$ 1,500.00` / `$ 0.00`
- **Conteo físico digitado en arqueo ciego:**
  - Efectivo Córdobas: `C$ 4,850.00`
  - Efectivo Dólares: `$ 40.00` (equiv. `C$ 1,464.97`)
  - Vouchers POS conciliados: `C$ 2,340.00`
- **Resultado del Corte:** `Diferencia: C$ 0.00` (Cuadre exacto al centavo)

---

## 2. Especificación de Interacción y Navegación

- **Recorrido de pantallas:**
  1. `Terminal POS (Control de Caja y Turnos / Menú lateral)` ➔ Acción viva en Frame 0 sobre el botón verde `Cerrar Turno` y activación de gaveta.
  2. `Modal Arqueo Ciego de Gaveta (CloseShiftDialog)` ➔ Corte de atención en Frame 45 (`scale: 1.0 ➔ 1.08`) enfocando el aviso del sistema: `Saldo teórico oculto por política de control`.
  3. `Ingreso con teclado numérico nativo` ➔ Conteo físico en Córdobas (`C$ 4,850.00`), Dólares (`$ 40.00`) y Vouchers POS (`C$ 2,340.00`) con tipografía tabular fija (`tabular-nums`) ➔ Toque con pausa de asentamiento (4 frames) en botón principal `Confirmar Arqueo e Imprimir`.
  4. `Impresión de comprobante térmico 58mm (Corte X)` ➔ Desglose de Total recaudado vs. Conteo físico y `Diferencia: C$ 0.00` con sello de fecha y hora exacta.
  5. `Cierre Canónico NHILOS POS` ➔ Fondo `#003757`, logo oficial `logo.png`, título `NHILOS POS`, eslogan `Conectamos los hilos de tu negocio.` y botón `#00BF81` con texto en `#003757`: `Comenta CONTROL`.

---

## 3. Tabla de Escenas y Timecodes (30 FPS — Total: 1,140 Frames / 38.0s)

| Escena | Frames | Tiempo | Visual y Acción de Pantalla | Audio Edge TTS (`es-MX-JorgeNeural`, `-4%`) | Texto Cinético Superpuesto (Subtítulos) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Escena 1**<br>Acción Viva Frame 0 | `f0 – f45`<br>(45 frames) | `0.0s – 1.5s` | **Frame 0 (Live Action):** El dedo pulsa el botón verde `Cerrar Turno` en la terminal MIRAY Q80 (`Control de Caja y Turnos`). La gaveta se activa y emerge el modal de arqueo ciego. Overlay ligero con los 4 elementos de marca. Cero fondos estáticos. | `blind_1_hook.mp3` (parte 1):<br>*«Si tu cajero ve cuánto dinero debería haber antes de contar...»* | **Arqueo en caja.** |
| **Escena 2**<br>Corte de Atención 1.5s | `f45 – f300`<br>(255 frames) | `1.5s – 10.0s` | **Frame 45 (Corte de Atención):** Zoom dinámico continuo de `scale: 1.0` a `1.08` enfocado en el campo de entrada y el mensaje del sistema: `Saldo teórico oculto por política de control`. Los saldos esperados del sistema permanecen protegidos. (Audio total Escenas 1+2: `275f` + `25f` padding = `300f`). | `blind_1_hook.mp3` (parte 2):<br>*«...el arqueo de caja deja de ser una auditoría y se convierte en un cuadre acomodado.»* | **Saldo teórico oculto.**<br>**Cero manipulación de cifras.** |
| **Escena 3**<br>Conteo Físico a Ciegas | `f300 – f600`<br>(300 frames) | `10.0s – 20.0s` | Ingreso rápido con teclado numérico nativo: billetes contados en Córdobas (`C$ 4,850.00`), Dólares (`$ 40.00`) y Vouchers POS (`C$ 2,340.00`). Tipografía tabular fija (`tabular-nums`) que no tiembla al sumar. Pulsación de `Confirmar Arqueo e Imprimir`. (Audio: `272f` + `28f` padding = `300f`). | `blind_2_count.mp3`:<br>*«En NHILOS POS el arqueo es cien por ciento ciego. El operador digita el conteo físico de gaveta sin saber la meta del sistema.»* | **Arqueo 100% Ciego**<br>**Córdobas, Dólares y Vouchers.** |
| **Escena 4**<br>Ticket Térmico Corte X | `f600 – f900`<br>(300 frames) | `20.0s – 30.0s` | Transición concéntrica (`absolute inset-0`) al ticket térmico 58mm saliendo de la ranura. Se muestra el desglose del Corte X: Total recaudado vs. Conteo físico, señalando `Diferencia: C$ 0.00` con sello de hora y fecha exacta. (Audio: `271f` + `29f` padding = `300f`). | `blind_3_ticket.mp3`:<br>*«El ticket de corte calcula automáticamente sobrantes y faltantes al centavo, enviando el registro inalterable a tu panel administrativo.»* | **Corte X Inalterable**<br>**Diferencias al centavo en tiempo real.** |
| **Escena 5**<br>Cierre Canónico CTA | `f900 – f1140`<br>(240 frames) | `30.0s – 38.0s` | Pantalla de cierre sobria sobre fondo `#003757` con isotipo oficial (`logo.png`), título `NHILOS POS`, eslogan `Conectamos los hilos de tu negocio.` y botón interactivo central en verde `#00BF81` con texto en navy `#003757`: `Comenta CONTROL` + `Protocolo de Auditoría de Caja`. (Audio: `226f` + `14f` padding = `240f`). | `blind_4_outro.mp3`:<br>*«Protege el dinero de tu negocio. Comenta CONTROL abajo para enviarte el protocolo técnico de auditoría.»* | **NHILOS POS**<br>**[ Comenta CONTROL ]**<br>**Protocolo de Auditoría de Caja** |

---

## 4. Validación Técnica del Activation Contract (`nhilos-video-showcase` v1.2.0)

- [x] **Acción viva en Frame 0:** El botón `Cerrar Turno` se acciona en `t = 0s` (`f0`), abriendo el flujo transaccional de arqueo sin pantallas de espera ni placas introductorias.
- [x] **Corte de atención a los 1.5s (`f45`):** En el frame 45 exacto se dispara el cambio de escala (`1.0 ➔ 1.08`) hacia el input de conteo a ciegas y el aviso `Saldo teórico oculto por política de control`.
- [x] **Continuidad sin flashes (`Window Frame Invariance`):** Las escenas 1, 2 y 3 mantienen el marco de la terminal MIRAY Q80 estable sin fundidos a blanco ni reinicios de estado; la transición a la Escena 4 (ticket térmico) es concéntrica.
- [x] **Safe Zones de Instagram Reels / TikTok:** Encabezados y badges sobre `top >= 130px`; subtítulos cinéticos alojados en el bloque inferior reservado (`h-[320px] pt-6`) garantizando `bottom >= 280px` libres.
- [x] **CTA Canónico Comment-to-DM:** Coincidencia palabra por palabra entre el audio pronunciado (*«Comenta CONTROL abajo para enviarte el protocolo técnico de auditoría»*) y la interfaz gráfica del botón (`Comenta CONTROL`).
