# S23 — Ronda 2 de validación en aparato: las 10 que quedaron

- **Status:** PLANIFICADA — lista para ejecutar (requiere el APK nuevo)
- **Rama:** `docs/s23-round2-plan` (worktree `~/omnifood-ni-s23-round`), desde `main` = `006d45f6` (incluye #850 y #854).
- **De dónde sale la lista:** §7 de `odd/tasks/soho-p3-operational-surfaces.md` (8 superficies, "en el orden del cliente") + las dos tareas que quedaron sin cerrar en `odd/tasks/soho-s23-device-validation.md` (T5 y T6).
- **Por qué una sola ronda:** el APK instalado en el S23 es anterior a los tres arreglos de lealtad y a la etiqueta del cobro, así que hay que compilar uno nuevo igual. Ese APK lleva todo, y una sesión de aparato cierra los 10 ítems en vez de dos rondas.

---

## Estado del rig (medido al escribir este doc)

| Ítem | Estado |
|---|---|
| Device | **`R5CWB2LQJDJ` conectado** (`adb devices` → `device`) |
| Backend `:3000` | **Responde** (hay algo escuchando). Está construido del bloque, que ya es `main`: mis 8 commits de desbloqueo y los de #854 **no tocan código de runtime del backend** (config de lint + specs + dashboard/POS). Conviene igual un `nest build` fresco para que no quede duda. |
| Espejo (Postgres local) | Con `180962`/`180963`/`180964` aplicadas del bloque, que ya están en `main`. |
| `adb reverse tcp:3000 tcp:3000` | **Frágil y obligatorio**: sin él las ventas quedan pendientes *sin que se note*. Verificar antes de empezar y después de cada pausa. |
| APK | **Pendiente de compilar desde `main`.** El instalado es anterior a §18.2 y a los arreglos de lealtad. |
| Contraseña del dueño | Ya restaurada byte a byte (no tocar). |

**Secuencia de arranque:** `nest build` + reiniciar `:3000` → `adb reverse tcp:3000 tcp:3000` → `flutter build` del APK release arm64 con la URL local → `adb install -r` → verificar `versionCode` en `dumpsys` → empezar por el ítem 1.

---

## Los 10 ítems

Cada uno con ruta, esperado y slot de evidencia. **El usuario maneja la UI; el agente guía, captura screenshots y lee `logcat`.**

### 1 · Descuento manual con mutación de carrito después
- **Ruta:** carrito con 2+ ítems → Descuento manual → aplicar → **después mutar el carrito** (agregar y quitar un ítem) → cobrar.
- **Esperado:** el descuento manual **sobrevive a la mutación** y la línea lo atribuye a `manual` en `discount_origin`.
- **Evidencia:** captura del carrito antes/después + consulta a la nube (`invoice_items.discount_origin`).
- **Hallazgo abierto que se documenta, no se arregla acá (§17.3):** el descuento manual **se acumula** (`_manualDiscount += amount`) y **no hay forma de quitarlo** en la UI. Con los topes del tenant en "sin tope", la acumulación es ilimitada. Decisión de producto/UX pendiente.

### 2 · Promoción creada en la web y aplicada en POS sin reiniciar el checkout
- **Ruta:** en la web, crear/activar una promoción → en el POS, con el checkout **ya abierto**, agregar el producto alcanzado → cobrar.
- **Esperado:** la promoción se aplica sin reiniciar nada, y el origen viaja como `promotion`.
- **El dato que falta desde §17.1 (lo más importante de este ítem):** con **dos** capuccinos, ¿qué muestra la fila "Promociones"? El motor calcula **C$150** (2x1 125 + 10% 25) pero en el aparato se leyó **C$125**. **Captura de la fila con dos unidades.**
- **Hallazgo abierto (§17.2):** `comboPackage` es un no-op silencioso en el motor. Confirmar con un combo configurado, o dejarlo declarado.

### 3 · Historial del día con su total
- **Ruta:** ventas del día → abrir el detalle de una venta **con extras y descuento**.
- **Esperado (hoy NO se cumple, §17.4):** el detalle debería ser espejo del carrito. Lo que hay: **los extras no aparecen** (`toItemDomain` sin modifiers en `sales_history_view_model.dart:342`), **no hay filas de descuento/promoción/propina**, y la cifra por línea es el **total fiscal con impuesto** al lado del precio unitario del carrito.
- **Evidencia:** captura del detalle + captura del carrito de la misma venta, lado a lado. El ítem se cierra **documentando la brecha**, o se arregla y se re-valida.

### 4 · Bitácora del dueño con lo que se hizo en el mostrador
- **Ruta:** en el POS, hacer una **anulación** (y un descuento) → en el panel web, abrir la bitácora.
- **Esperado:** el registro aparece con **actor, entidad y acción**, y la cadena sigue encadenada por hash sin huecos.
- **Evidencia:** captura del panel + la cadena de auditoría del terminal en la nube (en §17 se verificó 26→27→28→29 sin huecos).

### 5 · QR/transferencia con su efecto en el Corte Z — **bloqueado, se cierra declarando**
- **Estado real:** el pago QR/transferencia **no existe como método en el POS del piloto**. El bloque §7 lo admite explícitamente: *"Conciliación de QR/transferencia **o declaración explícita de su ausencia**"*.
- **Qué hacer en esta ronda:** (a) la **declaración explícita** de que el piloto no lo ofrece (la firma el usuario, es decisión de producto); (b) validar en su lugar el camino que **sí** existe y sí es dinero: la **conciliación de vouchers de tarjeta** y su efecto en el Corte Z. F-1 (la ruta 404) y F-3 (el user id vacío) ya están arreglados y verificados en código, pero **el circuito completo nunca se vio en el aparato con los dos fixes**.
- **Evidencia:** captura del Corte Z tras conciliar + `POST /api/sales/payment-reconciliations/sync` respondiendo 2xx en `logcat` (no 404 ni 400).

### 6 · Comanda impresa — **bloqueado por hardware**
- **Estado real:** el driver de la impresora es explícitamente lo **no** probado (§16/§17), y el S23 no es un Sunmi (el adapter cae al fallback). Lo que sí está cubierto es el **texto** de la comanda (aserción sobre el nombre del extra en el camino de impresión).
- **Qué hacer:** declarar el hueco de hardware y no contar este ítem como cerrado. Necesita una impresora real (o la tablet del cliente en la próxima visita).

### 7 · Lealtad — **re-verificar el arreglo en el aparato (el circuito que quedó abierto)**
- **Ruta:** cliente con puntos (hay uno de prueba en el rig) → seleccionar en el carrito → la **tarjeta de lealtad** y el **CTA de recompensa** deben aparecer → elegir una recompensa de descuento → aplicar → cobrar.
- **Esperado:** el carrito **cambia**: el beneficio entra como descuento y la línea lo atribuye a `loyalty`. El tope **se rechaza con mensaje**, no se recorta.
- **Por qué este ítem existe:** §18.1 lo dice textual — *"No probado: el render en el aparato con el arreglo (necesita APK nuevo)"*. Los tres defectos se descubrieron **en el aparato**, pero el arreglo sólo se verificó en tests. Es el circuito que cierra la tesis del bloque.
- **Evidencia:** capturas de la tarjeta + el carrito antes/después + `discount_origin` con `loyalty` en la nube.
- **Brecha declarada que se vuelve a medir:** una recompensa `FREE_PRODUCT` registra la selección y cobra los puntos, pero **el carrito aplica 0**. El operador ve un mensaje. Sigue necesitando diseño.

### 8 · Fase 8.3 — la nota de crédito revierte totales y respeta la cadena fiscal
- **Ruta:** venta → anular con nota de crédito (gate owner/manager) → verificar totales y numeración.
- **Esperado:** los totales revierten y la cadena fiscal se respeta.
- **Por qué se puede correr ahora:** el ítem quedó sin ejecutar por la decisión de **no hacer más ventas de prueba en el equipo entregado** — y el S23 **no es** el equipo entregado. Sigue en pie la decisión DEC-1 sobre la numeración (el POS usa la serie de ventas y la nube no ve las NC del piloto): el ítem se corre y se documenta **con esa salvedad explícita**.

### 9 · Los arreglos de esta sesión, en el aparato
- **§18.2 la etiqueta del cobro:** cuenta con **centavos** (C$ 202.50) → el chip debe decir `C$ 202.50` (antes `C$ 203`) y el campo quedar con el mismo número. **Lo más rápido de verificar y lo más caro si se equivoca: es camino de dinero.**
- **§18.3 el tenant de lealtad:** ya cubierto por el ítem 7 (si la tarjeta aparece, el tenant se resolvió).
- **Los `noValidate` del dashboard:** se verifican **en el navegador**, no en el aparato (formularios web). Cierre separado, sin device.

### 10 · T5 y T6 de la ronda anterior (`soho-s23-device-validation.md`)
- **T5 (#79) copia ANULADO con gate y resultado honesto:** auto-print **apagado** → anular → el mensaje **no** debe decir "no se pudo imprimir". Auto-print **prendido sin impresora** → debe decir anulación OK **+ motivo** del fallo de impresión. **Invariante:** la anulación fiscal queda hecha en los dos casos.
- **T6 (#78) `pos_build` real en el handshake:** terminal nuevo apuntando al backend local → linking code → activación → primera venta → claim. **Esperado:** `onboarding_activation_attempts.pos_build = 1.1.0+11025` (el versionCode real del APK de esta ronda), no NULL ni `1.0.0+1`; y **write-once** (un segundo claim no lo pisa).

---

## Restricciones

- **El S23 no es la tablet de SOHO:** es el teléfono de prueba. Nada de esto toca al cliente.
- **El usuario maneja la UI;** el agente guía, captura y lee `logcat`. Se avanza de a un ítem, con su captura antes de pasar al siguiente.
- **`adb reverse`:** verificar antes de cada ítem que implique sync. Si una venta queda pendiente, mirar primero el túnel y después el código.
- **Límites del host:** no lanzar suites completas mientras haya subagentes vivos (techo de memoria de `AGENTS.md`); el `flutter build` no va en paralelo con tests.
- **Bump de versión local** del `pubspec.yaml` para que el device acepte el `install -r`: **no commitear solo**.
- **Un ítem por vez, con evidencia.** Lo que no se pueda cerrar se declara (ítems 5 y 6), no se adorna.

## Resultado esperado de la ronda

Un reporte por ítem con captura + consulta, y una lista corta de lo que quedó abierto — que ya se sabe que incluye: la acumulación del descuento manual, el detalle del historial que no es espejo, `comboPackage`, `FREE_PRODUCT`, la fila "Promociones" con dos unidades (si el motor y la pantalla no coinciden, es un defecto de pantalla), el driver de la impresora y la decisión DEC-1 de numeración de NC.
