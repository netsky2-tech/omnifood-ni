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

### 3 · Historial del día con su total — **CERRADO documentando la brecha (2026-10-10)**
- **Ruta:** ventas del día → abrir el detalle de una venta **con extras y descuento**.
- **Resultado medido (la brecha se confirmó tal cual):** el detalle **no es espejo del carrito**.
  - **Factura 41** → `Cappuccino 12oz` · `1 x C$ 125.00` · trailing `C$ 13.75`; Subtotal `13.75`; TOTAL `13.75`. **Faltan:** el extra `Leche: Entera` y **los C$ 111.25 de descuento** (`loyalty 80` + `promotion 31.25`).
  - **Factura 36** → `Cappuccino 12oz` · `2 x C$ 125.00` · trailing `C$ 40.00`; Subtotal `40.00`; TOTAL `40.00`. **Faltan:** los extras (`Extra shot` C$15 ×4 = C$60 + `Leche: Entera`) y **los C$ 270 de descuento** (`manual 40 + loyalty 80 + promotion 150`); el `2 × 125 = 250` contra `40.00` queda irreconciliable en pantalla.
- **Causa (ya identificada en §17.4):** `sales_history_view_model.dart:342` arma los ítems con `toItemDomain` **sin modifiers**; el detalle (`sales_history_view.dart:681-724`) pinta `productName` + `"qty x unitPrice"` + `trailing total` y un resumen con **sólo Subtotal / IVA / TOTAL** (sin filas de descuento, promoción ni propina). Nota: para este tenant `CUOTA_FIJA` el IVA es 0, así que la inflación fiscal por línea del hallazgo original no se reproduce; sí el salto unit-price vs total.
- **Evidencia:** capturas `/tmp/s23-shots/item3-fac41-detalle.png` y `/tmp/s23-shots/item3-fac36-detalle.png` + la verdad en nube de la consulta.
- **Cierre:** se documenta la brecha (arreglarla toca el POS → APK nuevo), para el batch de fixes con D-2 y D-3.

### 4 · Bitácora del dueño con lo que se hizo en el mostrador — **CERRADO (2026-10-10), con 4 hallazgos**
- **Ruta:** en el POS, hacer una **anulación** → en el panel web, **Administración → Auditoría → chip "Bitácora del mostrador (POS)"**.
- **Lo que SÍ funcionó:** factura 40 anulada (`is_canceled=t`, motivo `ERROR_DE_CAPTURA`); `audit_logs` S23TEST **seq 38 `SALE_VOIDED`** (13:26:19), actor Maxwell Orozco; encadenamiento 37→38 exacto (`prev_hash`), secuencia **1..38 sin huecos**, 0 alertas de integridad. El panel muestra la fila (la vista por defecto "Registro de la plataforma" sólo trae `change_log` de administración; hay que tocar el chip del mostrador).
- **F-4a (panel web):** la columna **entidad sale "—"**. `audit_logs.target_type`/`target_id` son NULL en todas las filas del POS; la entidad vive sólo en `metadata.invoice_id`, y `/operations/audit/ledger` excluye el metadata a propósito. El dueño no ve QUÉ se anuló.
- **F-4b (POS, serio):** el listado local de auditoría **oculta los eventos de las últimas ~6 h** (UTC−6). `_buildAuditEntity` (`audit_repository_impl.dart:113`) guarda el timestamp en **UTC con 'Z'** y `getLocalLogs` (`:601-604`) compara con límites **locales sin 'Z'** como texto (`audit_log_dao.dart`) → `'19:26…Z' > '13:35…'` descarta la fila. Verificado: la anulación de hoy no aparece en el POS; la del 02/10 sí.
- **F-4c (POS, UX del diálogo):** `Código: SALE_VOIDED` crudo, **uuid pelado** en `Factura (ID)`, `CLIENTE_DESISTE` duplicado y crudo en Motivo/Código del motivo, toggle `Ver crudo`.
- **F-4d (secundario):** device `pos-local-082cc471…` con `sequence_no` 1/2/3 duplicados en la nube (posible doble entrega en un terminal viejo).
- **Fecha:** el `timestamp` es el de la **anulación**, no el de la factura (13 creada 21:22:20, anulada 21:23:22).
- **Evidencia:** capturas del panel + consultas a `audit_logs`/`invoices` + log del backend (`POST /api/identity/audit`).

### 5 · QR/transferencia con su efecto en el Corte Z — **CERRADO (2026-10-10)**
- **Estado real (CORREGIDO 2026-10-10 tras explorar el código y la base):** el plan partía de que QR/transferencia no existía; **es falso**. El POS ofrece el método **"QR / Transfer"** (`multi_currency_checkout_dialog.dart:1101` + `_buildQrPanel()` en `:1450`) con campo "Referencia de Transferencia (Opcional)" que se persiste en `invoice_payments.voucher_code` (`:264`), y ya hay una venta `method='qr'` real (factura 20, C$40, `CONCILIADO`). **Decisión del dueño: QR no se usa, pero Transferencia SÍ, y la referencia de la transacción es el mecanismo de seguimiento.** → La "declaración explícita de ausencia" **no aplica** y se elimina: en su lugar se **valida el camino de transferencia** en el aparato.
- **Qué se hizo:** (a) **transferencia validada** — factura 43 (C$93.75, `method='qr'`, **`voucher_code='REF-RONDA2'`**, `CONCILIADO`): la referencia de la transacción es el mecanismo de seguimiento y el QR no entra en el gate de vouchers; (b) **conciliación de tarjeta F-1/F-3 validada en campo** — factura 42 con voucher `PENDIENTE` → el Corte Z **bloquea** ("Existen 1 vouchers…") → conciliada con `445566` → `CONCILIADO` + `reconciled_by_user_id` = Maxwell Orozco, y `POST /api/sales/payment-reconciliations/sync` **2xx desde el aparato**; (c) **Corte Z-0009** cerró tras conciliar: arqueo NIO 500/2541.25/2540 → **varianza −1.25**, tarjeta y transferencia fuera del efectivo, y el turno quedó `CLOSED`/`z_report_sequence=9` en la nube.
- **Hallazgos:** **F-5a** copy "Existen 1 vouchers"; **F-5b** el Corte Z imprime **"Cajero: Operador no disponible"** aunque el turno tiene `cashier_name='Maxwell Orozco'`; **F-5c** el push de la conciliación sale en el ciclo de sync de ~5 min (13:58 → 14:00:45); **F-5d** la nube conserva 3 vouchers `PENDIENTE` viejos (facturas 3, 4 anuladas y 11) mientras el POS local contaba 0.
- **Evidencia:** `/tmp/s23-shots/item5-bloqueo-cortez.png`, `item5-conciliado.png`, `item5-transferencia.png`, `item5-caja-cerrada.png` + `invoice_payments`/`cash_shift_sessions` + log del backend.

### 6 · Comanda impresa — **DECLARADO: hueco de hardware + defecto F-6 (2026-10-10)**
- **Estado real:** el driver de la impresora es explícitamente lo **no** probado (§16/§17), y el S23 no es un Sunmi (el adapter cae al fallback). Lo que sí está cubierto es el **texto** de la comanda (aserción sobre el nombre del extra en el camino de impresión).
- **Declaración (no se cierra):** la comanda **impresa** no puede darse por validada en el piloto. Requiere impresora real (o la tablet del cliente en la próxima visita); sin fecha comprometida.
- **F-6 (honestidad, medido):** con el driver **"Simulador"** seleccionado, la pantalla dice **"Impresora Conectada y Lista — El cabezal térmico está disponible y cuenta con papel"** (verde). Falso: `PrinterDriverType.mock` → `MockPrinterAdapter` (`printer_resolver.dart:22`), que siempre devuelve `PrinterStatus.ready` (`mock_printer_adapter.dart:14,43`) y `_buildStatusCard` lo traduce a ese copy físico. El propio código ya sabe que el mock "reports false successes" (por eso `escPosNetwork` va a `UnavailablePrinterAdapter`, `:25-31`); falta el mismo criterio para el driver `mock`. Viola NHILOS §0.1 (nunca certeza falsa).
- **Evidencia:** `/tmp/s23-shots/item6-hardware.png`.

### 7 · Lealtad — **CERRADO (2026-10-10, S23 `R5CWB2LQJDJ`)**
- **Fixture aplicado:** la recompensa `Café de prueba` se editó en el panel (`/loyalty`) bajando `cost_units` 800 → **500** (beneficio `{"amountNio":80}` intacto); el delta `loyaltyprograms` bajó al POS sin reiniciar. Saldo real previo **704** (la nube tenía las 4 transacciones correctas pero la proyección stale, ver D-1).
- **Escenario A (aplicar) — PASS.** **Factura 41** (13:04:45): `Cappuccino 12oz ×1`, `unit_price 125.00`, `discount 111.25`, `discount_origin = {"loyalty": 80, "promotion": 31.25}`, `total 13.75`. Identidad: `125 − 31.25 − 80 = 13.75`. El CTA **"Aplicar Café de prueba"** apareció con el costo corregido y el carrito cambió con la línea atribuida a `loyalty`.
- **Ledger de puntos:** `redeem −500` (origin POS) + `earn +1` (POS) a las 13:04:45.9x → el canje se registró y los puntos se cobraron.
- **Escenario B (tope) — PASS funcional + defecto UX (D-3).** Con carrito de C$40 el descuento de C$80 **no se aplica** (se rechaza, no se recorta). Pero el rechazo es **invisible**: la alerta roja se renderiza debajo del carrito y fuera de la vista; el operador tiene que minimizar el carrito para verla.
- **Defectos abiertos (batch de fixes):**
  - **D-1 (nube):** `customer_loyalty_account_projection.balance_units` **stale** en 1500 con `recomputed_at = 2026-10-09 18:53:11`, **reproducido** tras el segundo redeem/earn. El push del POS por `POST /loyalty/point-transactions/sync` no recomputa la proyección (y `balance_after` queda en 0.00).
  - **D-2 (POS):** `clearCart()` (`sale_view_model.dart:1753`) no resetea `_selectedCustomer`; vaciar el carrito a mano deja el cliente puesto para la venta siguiente.
  - **D-3 (POS/UX):** el mensaje de rechazo del tope de recompensa queda fuera de la vista del carrito.
- **Brecha declarada que sigue:** una recompensa `FREE_PRODUCT` registra la selección y cobra los puntos, pero **el carrito aplica 0** (mensaje directivo, sin no-op silencioso). La única recompensa del rig es `DISCOUNT_AMOUNT`, así que no se pudo ejercitar.

### 8 · Fase 8.3 — la nota de crédito revierte totales y respeta la cadena fiscal — **CERRADO (2026-10-10), con 5 hallazgos**
- **Ruta:** venta → anular con nota de crédito (gate owner/manager) → verificar totales y numeración.
- **Esperado:** los totales revierten y la cadena fiscal se respeta.
- **Resultado medido:** factura 41 → **EMITIR NOTA DE CRÉDITO** (gate owner/manager) → NC **factura 44** (`type='creditNote'`, `RETURN: Cappuccino 12oz`, **TOTAL −13.75**, `related_invoice_id`=41). Numeración de la **serie de ventas** (44) → **DEC-1 confirmado**; `shiftId=null` honesto (caja cerrada). El segundo intento **se bloquea** (`_assertRefundWithinOriginalQuantity`) → **sin reembolso duplicado**. Auditoría: `CREDIT_NOTE_CREATED` = **seq 41**, y la nube **no** ve el documento (DEC-1).
- **F-8a:** la factura **original no cambia de estado**; en la lista la 40 (anulada) muestra badge **ANULADA** pero la **41 (acreditada) no muestra nada** y la 44 (NC) tampoco tiene etiqueta. El detalle de la 41 sigue ofreciendo NC y **ANULAR FACTURA**.
- **F-8b:** el rechazo del duplicado muestra una **excepción cruda en inglés** al operador: *"Error al procesar devolución. Bad state: Credit note cumulative refund exceeds original line quantity"*.
- **F-8c:** el detalle de la NC repite el §17.4: **Subtotal −125.00 vs TOTAL −13.75** (descuento invisible).
- **F-8d (fiscal):** el encabezado del día queda **Subtotal C$5414.75 / Total C$5526.00 con IVA 0** → no reconcilia; la diferencia es **C$111.25** = el descuento de la NC. Causa: la NC guarda `subtotal` **bruto** y la factura original **neto**. Rompe la identidad del resumen diario.
- **F-8e:** la nube recibe el **evento** `CREDIT_NOTE_CREATED` pero no el **documento**.
- **Evidencia:** `item8-nc.png`, `item8-historial-nc.png`, `item8-historial-totales.png` + `invoices`/`audit_logs` en la nube.

### 9 · Los arreglos de esta sesión, en el aparato
- **§18.3 el tenant de lealtad — CUBIERTO por el ítem 7 ✅** (la tarjeta de lealtad apareció: el tenant se resolvió desde el binding del terminal).
- **Los `noValidate` del dashboard — VERIFICADO 7/7 ✅ (2026-10-10, navegador en `:5173`).** Campos obligatorios vacíos + Enter en cada formulario → aparece el error propio de la app en español y **ningún** globito nativo del navegador; el submit válido sigue funcionando. Formularios: Login · Perfil del Negocio (`fiscal-setup-form`) · Promoción · Grupo de modificadores · Programa/Recompensa de lealtad · Perfil de lealtad del cliente · Revocar dispositivo.
- **§18.2 la etiqueta del cobro — NO capturada en esta sesión.** El APK de la ronda **sí** incluye el arreglo (su base `006d45f6` ya trae #854), y los cobros de la ronda con centavos fueron exactos en base (factura 41 = C$13.75; 42/43 = C$93.75, con el `discount` y el `discount_origin` cerrando al centavo), pero el **texto del chip** del cobro no se capturó como evidencia. Queda pendiente de captura; requiere un terminal con la activación completa (ver T6).

### 10 · T5 y T6 de la ronda anterior (`soho-s23-device-validation.md`)
- **T5 (#79) copia ANULADO con gate y resultado honesto — PASS en las dos rutas (2026-10-10):**
  - **Ruta A (auto-print OFF):** factura **39** → mensaje *"Factura anulada. Comprobante ANULADO no impreso: la impresión automática está desactivada."* → **no** dice "no se pudo imprimir"; `is_canceled=t` (`TICKET_DUPLICADO`) y audit **seq 42**.
  - **Ruta B (auto-print ON, driver Q80/iPos sin hardware):** factura **42** → rama `failed` con motivo (*"No se pudo imprimir el comprobante ANULADO…"*), **no** un falso "se imprimió"; `is_canceled=t` y audit **seq 43**. (Predicción previa del agente —que el fallback simularía éxito— **refutada**: el camino de impresión es honesto; lo que miente es la *tarjeta de estado*, ver F-6.)
  - **Nota de diseño (correcta, no defecto):** anular una factura de **día anterior** se rechaza categóricamente con *"La anulación de días anteriores se realiza por el flujo administrativo."* (`void_decision.dart:46`, `deniedCrossDay`), para todo actor.
- **T6 (#78) `pos_build` real en el handshake — BLOQUEADO en el S23 (no verificado en aparato):** la vinculación y la creación del intento funcionaron, pero la **Fase 2 · venta de verificación** falla porque el terminal nuevo no tiene las claves locales `commercial_exchange_rate` / `bcn_official_exchange_rate` (`activation_controlled_sale_runner.dart:301-313`) y todavía no tiene credencial de sync (círculo). Hallazgos **F-10a** (el banner dice "Revise la conexión" para fallos que no son de conexión), **F-10b** (3 códigos sin mapear en `FriendlyError`), **F-10c** (el mensaje manda a "Perfil del Negocio", donde **no existe** campo de tasa BCN), **F-10d** (un terminal recién instalado no puede completar la activación) y **F-10e** (la activación incluye checks de impresora). El intento quedó `CREATED` con `pos_build=NULL`.
  - **Corrección al valor esperado:** no es `1.1.0+11025` sino **`1.1.0+13025`** (el `ohacPosBuild` real del APK; `11025` es el de `pubspec` antes del split ABI).
  - **Write-once:** verificado **por código** (`activation.service.ts:224-226`: escribe sólo si `attempt.posBuild` está vacío), **pendiente por aparato**.
- **Evidencia:** `item10-t5-rutaA.png`, `item10-t5-rutaB.png`, `t6-fresh.png`, `t6-claimed.png`, `t6-fase2.png` + `device_linking_codes` / `onboarding_activation_attempts` + logcat del POS.

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
