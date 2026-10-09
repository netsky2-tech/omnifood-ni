# SOHO — Nivel 3: superficies no ejercitadas en campo (auditoría y plan)

**Origen:** items 7–13 del tablero P3 de `odd/tasks/soho-estado-y-pendientes.md` (#81–#89).
**Naturaleza:** existen en código con tests automatizados, nunca se operaron en la tablet frente al cliente.
**Worktree:** `/home/octavio_morales/omnifood-ni-p3` · **Rama:** `feat/soho-p3-operational-surfaces` · **Base:** `main` `b4b5ad27`.
**Método:** 3 auditorías read-only en paralelo (evidencia `path:line`), spot-checks propios sobre las dos afirmaciones estructurales.
**Prioridad declarada del cliente:** descuentos → promociones (e2e web+POS) → historial de ventas → bitácora de auditoría → resto.

---

## 1. Descuento manual (#82) — HALLAZGO CRÍTICO

### Estado verificado
Está cableado de punta a punta: botón `sale_view.dart:1878-1884` → override de supervisor (`:2079`) → prompt de monto (`:2128-2160`) → `SaleViewModel.applyManualDiscount` (`sale_view_model.dart:926-940`). El monto entra en el subtotal, se prorratea por línea (`invoice_fiscal_calculator.dart:206-256`), se persiste (`sales_mapper.dart:406,429`), se imprime (`receipt_layout_formatter.dart:591-660`) y viaja a la nube (`sync-invoice.dto.ts:94` → `invoice-item.entity.ts:80`).

### D1 — CRÍTICO: el descuento manual se pierde en la siguiente mutación del carrito
Un **único** acumulador `_totalDiscounts` (`sale_view_model.dart:1033`) sirve a dos dueños incompatibles:

| Ruta | Operación | Línea |
|---|---|---|
| `applyManualDiscount()` | `_totalDiscounts += discountAmount` | `:938` |
| `_applyPromotions()` | `_totalDiscounts = result.totalDiscount` | `:1122` |

`_applyPromotions()` corre en **cada** mutación: `loadPromotions` `:1108`, `holdCurrentTicket`/recall `:1224`, `addToCart` `:1379`, `removeFromCart` `:1401`, `updateQuantity` `:1425`; `clearCart` lo resetea `:1440`.

**Consecuencia:** el cajero aplica el descuento, agrega o quita cualquier línea y el descuento desaparece del total. Recíprocamente, aplicarlo después de una promo pisa el cálculo de la promoción. El propio código delata el diseño a medias: `:543` expone `promoDiscounts => _totalDiscounts`.

**Por qué los tests no lo vieron:** `sale_view_model_test.dart:970-1075` agrega al carrito **antes** de aplicar el descuento, así que nunca ejerce la secuencia que lo borra.

### D2 — Sin tope de descuento
Sólo hay gate de rol + override de supervisor. No existe máximo por porcentaje ni por monto (grep `maxDiscount|limit`: cero). El permiso `sales:discount_override` existe (`identity/security/permissions.enum.ts:6`) y **nadie lo consume** — ni backend ni POS.

### D3 — La nube no distingue manual de promoción ni de lealtad
Sólo baja `discount` por línea. No hay entidad, endpoint ni registro de aprobación de descuento; únicamente reporte agregado (`sales-export.service.ts:1053`, `features/dashboard/tips-summary.tsx:90`). Imposible responder "cuánto se descontó a mano este mes y quién lo autorizó".

### D4 — La UI miente en la etiqueta
`sale_view.dart:1812` muestra `Descuentos (Promos)` incluso cuando el descuento fue manual.

### D5 — Suspecto a revisar
`:555` calcula `currentSubtotal = rawSubtotal - _totalDiscounts` **sin** `loyaltyDiscount` (que sí suma en `totalDiscounts`, `:1034`). Consistencia a verificar contra `invoice_fiscal_calculator.dart`.

---

## 2. Promociones 2x1 (#83)

### Estado verificado
Motor real en `promotions_engine.dart`: `buyXGetYFree` (2x1/3x2 `:76-98`), `percentageDiscount` (`:100-125`), `fixedDiscount` (`:127-149`); `comboPackage` es **stub vacío** (`:151-152`). Elegibilidad por activo/rango/horario/minOrder/prioridad/no-apilable (`:49-58,166-170`).

**Web (superficie viva):** `/promotions` OWNER/MANAGER (`router.tsx:171-175`, `lib/rbac.ts:55,67`), CRUD + toggle (`hooks/use-promotions.ts:10-64`), `PromotionsController` (`promotions.controller.ts:36-72`) y **`PromotionsModule` sí está registrado** (`app.module.ts:231`, `controllers: [PromotionsController]`, declarado `transport: 'human'`). No es la clase de defecto F-1.

**Canal inbound (funciona):** el POS pide `GET /v1/sync/inbound/deltas` sin filtro de tipos (`sync_service.dart:3625-3633`); el set por defecto del backend incluye `promotions` (`inbound-sync.service.ts:449-470`) y el POS lo consume a `promotionDao.savePromotions` (`sync_service.dart:4311-4358`, nube autoritativa).

### P1 — El motor no muta líneas ni deja rastro
En checkout sólo escribe `_totalDiscounts` (`sale_view_model.dart:1117-1125`) y **descarta `appliedPromotions`**. Nada identifica qué promoción se aplicó: ni UI, ni ticket, ni nube.

### P2 — El checkout abierto no recarga promociones
El listener de inbound del `SaleViewModel` recarga **sólo** productos/catalogValues (`:166-169`, `:228-231`). Una promo recién sincronizada llega a la base y no se evalúa hasta reinicializar el VM.

### P3 — El toggle del POS se pisa
`togglePromotion` (`:1111-1115`) escribe local y el siguiente delta lo revierte (nube autoritativa). No hay canal outbound de promociones: editar el seed local es trabajo perdido, mismo patrón que el #95.

### P4 — Sin e2e web→POS
Toda la cobertura es por capa con mocks; el único e2e del dashboard mockea `/api/promotions` (`e2e/helpers/mock-session.ts:244`).

---

## 3. Historial de Ventas (#86)

### Lo que sí tiene
Fuente: **SQLite local únicamente** (`sales_history_view_model.dart:42` → `invoiceDao.getAllInvoices()`). Muestra número + badge `ANULADA` (`:168-179`), hora y **cajero resuelto por nombre** (`:146-149`, `:306`), método de pago, ítems, total; panel de detalle con subtotal/IVA/total; reimpresión con motivo obligatorio y gate de permiso (`:349-360`, `:425+`); relectura tras anular.

### H1 — No sirve para auditar el día
Sin filtro de fecha, sin fila de totales, sin export, sin paginación (carga todas las facturas). Sólo búsqueda de texto (`filteredInvoices` `:113-128`).

### H2 — Sólo ve la terminal
Una venta sincronizada que no está en la base local, o de otra terminal, es invisible desde acá.

### H3 — Errores por fila tragados en silencio
`catch (_) {}` en `:88` → cajero o ítems vacíos sin señal.

### H4 — Sin puente a bitácora ni a X/Z
No hay enlace factura → entradas de auditoría, ni reporte Z/X en la vista.

### H5 — La web tiene agregados, no listado
`reports.controller.ts` expone dashboard/daily-series/hourly/top-products/cashier-performance/fiscal monthly/voided/sequence-audit y exports; el dashboard tiene pestañas de resumen y `credit-notes-tab`, pero **no hay listado ni búsqueda a nivel factura**.

---

## 4. Bitácora de Auditoría (#87) — HALLAZGO ESTRUCTURAL

### B1 — Dos almacenes disjuntos: la bitácora del dueño no ve el POS
- El POS escribe `audit_logs` por `POST /identity/audit` (`audit.controller.ts`), con cadena de hash verificada, unicidad `(tenant,device,user,sequence)`, gap → 400, replay → 409.
- El dashboard lee **`change_log`**: `audit-events.service.ts:52` → `ChangeLogService.findEvents`, endpoints `GET /operations/audit/events` y `/summary` (`audit-summary.controller.ts:47,67`).
- Nada en `modules/audit/` ni `core/audit/` lee `audit_logs` (verificado por grep).

**Consecuencia:** anulaciones, notas de crédito, descuentos manuales y overrides de supervisor hechos en el POS **no aparecen** en la bitácora del dueño.

### B2 — Escritores reales de `change_log` (lista completa)
Activación/onboarding (`activation.service.ts`), fill de huecos de secuencia (`sequence-gap-policy.service.ts:183`), catálogo/valores (`catalog.service.ts:167,220,261`) y producto (`product.service.ts:262-269`). **No están:** apertura/cierre de turno, override de voucher, promociones.

### B3 — Filtros insuficientes
`audit-events-query.dto.ts:13-33`: sólo `startDate/endDate/severity/limit(≤100)`. Sin actor, sin entidad/objetivo → "quién hizo qué a qué" no se puede responder.

### B4 — Sin lectura general ni integridad expuesta
De `audit_logs` sólo existen `GET /identity/audit/overrides` y `/drawer-opens`. El cron nocturno de integridad (`audit-integrity.service.ts:39`) escribe `audit_integrity_alerts` y emite un evento `gap_detected` **sin superficie HTTP** en el dashboard.

### B5 — Página incompleta
50 eventos (`audit-events.service.ts:23`), sin total. El propio código avisa "older events may exist" (`audit-page.tsx:25-29`).

### B6 — Cobertura contra base real ausente
No hay `*.db.spec.ts` que cubra la lectura de auditoría; el e2e de `audit-query` usa un DataSource falso (`test/identity/audit-query.e2e-spec.ts:36-53`).

### Lo que sí funciona
El POS tiene superficie local propia: ruta `/identity/audit` (`main.dart:953`), entrada en drawer para admin/manager (`app_drawer.dart:298-305`), vista con filtros (búsqueda, rango, usuario, categoría) sobre la tabla Floor encadenada por hash.

---

## 5. Resto del nivel (menor prioridad)

| # | Superficie | Estado real | Brecha concreta |
|---|---|---|---|
| #81 | QR / Transferencia | `PaymentMethod { cash, card, qr, points }` (`payment.dart:6`); chip "QR / Transfer" (`multi_currency_checkout_dialog.dart:1101-1107`); backend `method: string`, sin enum, agrupa QR en `other` (`sales-reports.service.ts:174-185`) | **Sin gate de conciliación:** sólo los vouchers de **tarjeta** bloquean el Corte Z (`close_shift_dialog.dart:78-86`). Un cobro QR/transferencia es auto-declarado y no se confirma. Z de campo: QR 0 |
| #84 | Devoluciones / NC | Implementado y alcanzable: `createCreditNote` (`sales_repository_impl.dart:935`), gate owner/manager (`:900-904`), botón en historial (`sales_history_view.dart:450`), tab web + backend fail-closed en `CREDIT_NOTE_SERIES` (`invoices.service.ts:478-523`) | **Decisión DEC-1, no bug:** el POS consume la serie de **ventas** (`sales_repository_impl.dart:985` → `numberingService.getNextNumber()`), backoffice usa `CREDIT_NOTE_SERIES`. Formatos distintos y la nube no ve NCs del POS durante el piloto (`go-live-decisions.md:9,14,33`; `credit-notes-full-scope.md:34`). Fase 8.3 nunca ejecutada |
| #85 | KDS / comanda | Vive **dentro del POS** (`kitchen_display_view.dart`), impresión real por ESC/POS (`durable_print_service.dart:171` → `printer_port.dart:98`), deuda UX cerrada (merge `09273781`) | La entrada del drawer está **sin guarda de topología** (`app_drawer.dart:193-199`) aunque SOHO corre `PRINT_ONLY`, que suprime la acumulación del KDS: superficie visible y engañosa. Sin evidencia de campo de comanda |
| #88 | Lealtad / puntos | POS (`loyalty_service.dart:6,31,42-52`, checkout `sale_view_model.dart:523-569`), web `/loyalty` (`router.tsx:221-223`), backend `modules/loyalty/` con `loyalty-ledger.service.db.spec.ts` y e2e real sqlite | Sin evidencia de campo; no aparece en el guion integral |
| #89 | Fase 8.3 | Texto literal: `| 8.3 | La nota de crédito revierte totales y respeta la cadena fiscal |` (`prueba_integral_dia_1_soho.md:200`). Estado: `8.3 credit note NOT exercised` (`soho-dia1-integral-test.md:190`) | No probada **por decisión explícita** de no hacer más ventas de prueba en el equipo entregado (`prueba_integral_dia_1_soho.md:424-426`) |

---

## 6. Plan de trabajo (slices por unidad de revisión)

**S1 · Correctitud del dinero (D1, D4, D5) — S1a IMPLEMENTADO Y VERIFICADO**
Separar acumuladores (`manualDiscount` / `promoDiscounts`), `totalDiscounts = manual + promo + loyalty`, corregir la etiqueta de la UI, arreglar la base de canje de lealtad (DD-1) y endurecer la fila del bruto.

**Estado S1a (sin commitear, pendiente de autorización):** 10 archivos, +480/−11. El calculador fiscal, el mapper, el formateador de ticket y el payload de sync **no** están en el diff; el contrato de sincronización queda intacto.
- `sale_view_model.dart` (20/−7): `_promotionDiscount` + `_manualDiscount` independientes; `totalDiscounts` sigue siendo el agregado fiscal; `promoDiscounts` pasa a significar solo promoción; `applyLoyaltyPoints` valida contra `rawSubtotal - _promotionDiscount - _manualDiscount`; `clearCart` limpia ambos.
- `sale_view.dart` (48/−4): la fila `Descuentos (Promos)` se vuelve tres filas honestas (`Descuento manual`, `Promociones`, `Descuento por puntos`), y la fila `Subtotal` pasa a imprimir `grossSubtotal` en vez de `subtotal + totalDiscounts`, que inflaba el bruto cuando el agregado excedía el total.
- Tests: `sale_view_model_test.dart` +215 (adición pura), `sale_view_security_flows_test.dart` +110 (adición pura), 6 mocks regenerados (adición pura).

**Evidencia:** tres mutaciones propias, cada una restaurada con hash byte-idéntico: (1) `_applyPromotions()` borrando el acumulador manual → `Expected <50.0> Actual <0.0>`; (2) base de lealtad ignorando el componente manual → el test del techo falla; (3) borrar el manual **solo con promoción activa** → el test de combinación falla con `Expected <25.0> Actual <0.0>` (cierra el hueco de cobertura que la verificación independiente identificó). Verificación independiente: 63/63 en las suites enfocadas, consumidores auditados, mocks aditivos.

**Anomalías preexistentes registradas, no arregladas:** (a) un canje de lealtad validado sigue siendo válido si el carrito se encoge después — el cálculo fiscal lo recorta y la fila del bruto ya no miente; (b) `SplitBillEngine` recibe `discountNio: 0.0`, así que los descuentos no se reparten entre comensales; (c) 4 de los 6 mocks regenerados absorbieron una obsolescencia previa (`lastVoidCopyPrintOutcome`, `clearCheckoutError`) y 2 otra (`getTaxRegime`), aditivo e inocuo.

*Checks:* suites enfocadas con `--concurrency=1` (nunca la suite completa en este host).

**S1b · Tope de descuento manual (D-A) — S1b-1 COMMITEADO (`6f6afa0b`), S1b-2 IMPLEMENTADO Y VERIFICADO**

Cortado en dos unidades: la configuración (backend + web) y después la proyección y el enforcement en el POS. El orden respeta `forbidNonWhitelisted` (`main.ts:49-53`), que rechaza con 400 cualquier propiedad desconocida: si el POS manda el campo antes de que el backend lo declare, **tira el lote completo**.

**Contrato exacto (S1b-2 debe espejarlo, no reinterpretarlo):**
- Llaves en `sys_parametros_config`: `MAX_DISCOUNT_AMOUNT` (number, `0` permitido = prohibir descuentos) y `MAX_DISCOUNT_PERCENT` (number, `(0, 100]`). Ausente o tumba `null` = **sin tope**. Valor corrupto o no numérico se lee como `null`, nunca se fabrica un tope.
- Campo de cable: `maxDiscountAmount: number | null` y `maxDiscountPercent: number | null`, en el GET/POST de `/onboarding/fiscal-setup`, en el payload efectivo y en la instantánea.
- Semántica de tres estados: **ausente** = no tocar lo guardado; **null** = tumba que limpia (sin tope); **número** = poner el tope. `0` viaja como `0`, nunca como ausencia (verificado: el `preprocess` del zod compara contra `""` y `NaN` explícitamente, no por falsedad).
- **Regla de rechazo:** el descuento se **permite** sólo si `descuento <= maxDiscountAmount` **y** `descuento <= (maxDiscountPercent / 100) x bruto`; o sea, el tope efectivo es el **mínimo** de los topes configurados. Tope `0` prohíbe todo descuento manual. Ambos `null` = sin límite.

**Hallazgo de la ola de re-huella — medido.** Los dos campos viajan como `null` en el payload huellado (convención D-4: "nunca configurado" debe huellarse distinto de "ausente"), y `canonicalizeJcs` omite `undefined` pero **no** `null`, así que la huella de un tenant sin configurar **sí cambia**. Pero la ola **no es un barrido en el despliegue**: `recordRevisionChange` tiene sólo dos llamadores de escritura — activación de terminal (`activation.service.ts:337`) y guardado del owner (`fiscal-setup.service.ts:408`) — y **ningún camino de lectura incrementa la revisión** (el de lectura sólo crea la línea base si no existe). El costo real: cada negocio recibe **un** bump (+1) en su próxima activación o próximo guardado. La dirección es segura: el POS acepta revisiones mayores y sólo rechaza menores (`fiscal_inbox_handler.dart:230-244`) y mismo-revisión-distinta-huella (`:214-228`).

**Deuda registrada, no arreglada (advertencias para S1b-2):**
1. `getFiscalConfigSnapshot` devuelve la huella **almacenada** junto a un payload de forma **nueva** (`fiscal-config-version.service.ts:314` vs `:355-359`), así que para un tenant cuya última revisión es anterior a este cambio, huella y payload no se corresponden hasta el próximo guardado material. Ningún consumidor recalcula hoy, pero **la huella es opaca**: el POS no debe recomputarla.
2. **El JCS del POS omite `null`** (`activation_required_config_adapter.dart:105`) mientras el del backend lo incluye. Reusar el canonicalizador del POS para verificar la huella fiscal produce un falso conflicto de integridad.

**Hallazgos de la verificación independiente de S1b-1:** el contrato es simétrico en los seis saltos y no hay bug de coerción por falsedad; una aserción e2e exacta quedaba rota (`test/onboarding/fiscal-setup.e2e-spec.ts:445`) por quedar fuera de las superficies del worker, y se corrige en el mismo commit.

### S1b-2 · Proyección y enforcement en el POS (implementado y verificado)

**Proyección:** claves locales `max_discount_amount` / `max_discount_percent`. Semántica de instantánea completa: un número finito `>= 0` **escribe**; `null`, **ausente** y corrupto/fuera de rango **borran** la clave local, porque la instantánea es completa y un tope ausente significa "sin tope". El borde del sobre rechaza fuera de rango con `ArgumentError` antes de cualquier commit, y `isProjectionComplete` cubre las dos llaves simétricamente (faltante, incorrecta o obsoleta → incompleto).

**Enforcement:** en `applyManualDiscount`, **después** del gate de rol/override, así que DD-2 se cumple por construcción — el servicio de política es ciego al rol y recibe sólo montos. El tope por porcentaje usa `grossSubtotal`, que se acumula **antes** de aplicar descuentos, así que no hay dependencia circular. Un rechazo no muta ningún estado de descuento.

**Evidencia propia: cinco mutaciones, todas restauradas byte-idénticas.**
| Mutación | Fallas | Garantía anclada |
|---|---|---|
| Quitar el gate del tope | 6 | El tope se aplica en todas sus formas |
| Evaluar por pedido en vez del acumulado | 2 | DD-3 (lo anclan dos tests, no uno) |
| Dejar que el override salte el tope | 1 | DD-2 |
| No borrar el tope local al limpiarlo | 3 | `Expected: null / Actual: <LocalConfigEntity>` — el tope viejo sobrevivía |
| Renombrar la llave del lector | 1 | La guarda de contrato de llaves |

**Guarda agregada:** las llaves locales están duplicadas como literales en la capa de datos (`FiscalProjectionKeys`) y en la de dominio (`TenantConfigService`). Un rename de un solo lado daría "tope escrito y nunca leído" — el tope jamás se aplicaría, sin error. Se agregó un test que fija la igualdad: la divergencia ahora es un test rojo. Se evaluó extraer una constante compartida y se descartó: la duplicación es la convención existente para todas las llaves (`operation_mode`, etc.), y unificar sólo las nuevas rompería la consistencia por un refactor fuera de alcance.

**Riesgo aceptado, no arreglado:** `loadDiscountCaps()` envuelve sus lecturas en un `catch` vacío y **falla abierto** (conserva el último valor conocido, que puede ser `null`). Escenario concreto pero improbable: una terminal nueva donde toda lectura de `local_configs` falle (base bloqueada) aplicaría un descuento por encima del tope **en silencio**. Se verificó que el riesgo no es permanente: la vista refresca los topes antes de cada prompt, y `applyManualDiscount` sólo es alcanzable desde ahí. Se deja como está porque fallar cerrado bloquearía la operación legítima ante un error de lectura, y la verificación independiente no lo consideró alcanzable.

**Hallazgo refutado:** la verificación reportó que el mock estaba "a medio regenerar" por no tener overrides de los tres miembros nuevos. Es falso: ese archivo tampoco tiene overrides de `errorMessage`, `companyTaxRegime`, `selectedCustomer` ni `activeLoadedHoldTicket`, getters nullable que existen desde siempre; el generador de este repo simplemente no los produce. Comprobado con `dart run build_runner build`, que responde **0 outputs (0 actions)**: regenerar produce exactamente ese contenido, así que no hay churn latente.

**Anomalía reportada sin resolver:** una única corrida con 1 falla sobre 121 tests que no se pudo reproducir; cuatro corridas posteriores limpias (128/128, 151/151, 152/152) y el archivo de widget solo, dos veces, 14/14. Consistente con el flake de toolchain ya documentado en `AGENTS.md`.




**S2 · Rastro y activación de promociones (P1, P2, P3) — IMPLEMENTADO, en verificación**

Dos defectos, con las dos causas confirmadas en código.

**D-P1 · El checkout abierto nunca se enteraba de una promoción nueva.** Las promociones llegaban a la tablet (delta `promotions` consumido en `sync_service.dart`), pero el listener de inbound recargaba **solo** productos. Una promo creada o cambiada en la web quedaba invisible hasta reinicializar el view model. Ahora `InboundSyncResult` lleva `promotionsCount`, **poblado en el sitio de ingesta** (`sync_service.dart:4781`, desde `promotionEntities.length`), y el checkout recarga cuando es mayor que cero. Se eligió la señal precisa en vez de recargar en cada sync: el evento ya llevaba contadores por delta y el sitio de ingesta ya tenía la lista.

**D-P2 · El POS ofrecía un control de escritura que la nube revertía en silencio.** El `SwitchListTile` escribía **solo** la fila local de SQLite; el siguiente delta la pisaba. Decisión D-B aplicada: la nube es autoritativa, el POS quedó de **solo lectura** — `ListTile` con estado `Activa`/`Inactiva` y una nota en español que dice dónde se administran. `togglePromotion` se eliminó del view model en vez de dejarlo muerto: un método público que escribe estado local de promociones es un footgun que invita a reconectarlo y reintroducir la reversión silenciosa. `promotionDao.setPromotionActive` queda sin uso y se reporta como candidato de limpieza, **sin** tocarlo: vive en la capa generada.

**Hallazgo de verificación más valioso — el cable que existía y nada probaba.** El test de recarga del worker **fabricaba el evento a mano** (`InboundSyncResult(promotionsCount: 1, ...)`). Eso pinnea la reacción del VM pero **no** que el `SyncService` real produzca ese contador. Lo demostré con una mutación: poner `promotionsCount: 0` en el sitio de ingesta **pasaba todos los tests**. Es la misma clase que ya golpeó a este proyecto (el controlador que existía y no se montó). Se cerró agregando un test que conduce la **ruta real de ingesta** a través del fake HTTP en `sync_service_fiscal_projection_test.dart`, afirmando `promotionsCount == 1` y la proyección a SQLite; con eso, la mutación falla con `Expected: <1> Actual: <0>`. Lección durable: **un test que construye su propia entrada no prueba que la producción construya esa entrada.**

**Evidencia:** tres mutaciones, todas restauradas byte-idénticas — quitar la recarga del listener (`Expected <50.0> Actual <0.0>`), reintroducir un control de escritura en el diálogo (falla el test de solo lectura), y no propagar el contador (falla el test de ingesta, tras cerrar el hueco). 96/96 en las siete suites enfocadas.

**Nota de proceso:** el worker falló dos veces por errores de infraestructura. La segunda vez dejó la librería completa pero sin regenerar los cuatro mocks (que sin `togglePromotion` no compilaban) ni el test de widget; el orquestador cerró ambas cosas a mano. La regeneración se hizo con filtro ajustado y sin `--delete-conflicting-outputs`, midiendo el inventario de generados antes y después (109 archivos, hash de lista idéntico).


## 6bis. S6 · Clase decimal del panel + mensajes de error sin fuga (adelantado por hallazgo en campo)

**Origen:** el usuario, probando la UI de modifiers, encontró que al guardar aparece un error **en inglés** y que el formulario **exige escribir `0`** cuando él mismo muestra `0.00` en los inputs. Ninguno de los 150+ tests del bloque lo detectó. Ese es el punto: son tests **por capa con la frontera mockeada**, y los tres defectos viven exactamente **en la frontera** — la forma del payload, el idioma del mensaje y el formato que el input muestra contra lo que la validación acepta.

**Cadena causal (toda verificada en código):**
1. `modifier-option.entity.ts:55-61` declara la columna `decimal` **sin transformer**. El driver de Postgres devuelve `numeric` como **string** y TypeScript miente declarándolo `number`, así que el API serializa `"0.00"`. El input lo muestra tal cual y al enviar sin tocarlo viaja un string que `@IsNumber()` (`create-modifier-option.dto.ts:22`) rechaza. Escribir `0` re-dispara `onChange` con `valueAsNumber` → número real → pasa.
2. `apps/owner_dashboard/src/lib/api-error.ts` (`getApiErrorMessage`): **antes** del `switch` que mapea 400 a español, devuelve el `message` crudo del backend. class-validator devuelve un **array** de restricciones en inglés, el código lo une y lo muestra; el filtro anti-basura sólo descarta `{`, `at `, `AxiosError` y `node_modules`. El helper lo usan **28 archivos**: la fuga no es de modifiers.
3. La clase **ya estaba documentada y arreglada** para productos en `odd/tasks/products-decimal-contract.md`, con causa raíz idéntica, y ese trabajo declaró explícitamente fuera de alcance "otras entidades con columnas `decimal` (88 en el repo)". La clase se arregló para un módulo y el módulo nuevo la reprodujo.
4. **El defecto está fijado por un test:** `purchases-tab.test.tsx:515` afirma que se renderiza `id should not be empty`. La intención era buena (nunca `[object Object]`), pero el efecto es un test verde defendiendo inglés técnico en pantalla.
5. **Por qué no se vio:** `modifier-group-form.test.tsx` **mockea** `useCreateModifierOption`, así que el payload nunca cruza la validación real del DTO; y el archivo **no compila bajo `tsc`** (`:376` usa `as ModifierOption` sin importarlo). vitest pasa porque esbuild borra los tipos sin chequearlos.

**Radio medido:** 85 columnas `decimal` (inventory 46, sales 28, onboarding 10, modifiers 1). **14 de los 16 clientes de API del panel NO normalizan** sus numéricos — sólo `product-api.ts` y `dashboard-api.ts` lo hacen. `getApiErrorMessage`: 28 consumidores.

**Decisiones tomadas:** (a) arreglo **repo-wide** de `getApiErrorMessage` **más** una guarda falsable anti-fuga; (b) el e2e real es **replay del payload exacto del navegador contra el backend vivo**; (c) el orden es terminar S3a primero, después esta clase.

**Plan:**
- **S6a · modifiers (lo que el cliente está tocando ahora):** coerción de numéricos en la respuesta del backend (patrón de `product-response.ts`), normalización en `modifiers-api.ts`, arreglo del tipo roto del archivo de test, y un test que alimente la **forma real del API** (decimal como string) y afirme que el input muestra un número y que el guardado manda un número.
- **S6b · mensajes de error:** `getApiErrorMessage` nunca devuelve texto técnico; actualizar `purchases-tab.test.tsx` que hoy fija la fuga; y una **guarda falsable** que falle si un mensaje de validación del backend llega crudo a la UI. Cuidado de diseño: el backend **sí** emite mensajes de negocio en español que deben mostrarse (por ejemplo el 409 de nombre duplicado), así que el arreglo necesita un criterio explícito de "mensaje de negocio" en vez de descartar todo.
- **S6c · e2e real:** replay del payload exacto del navegador contra backend vivo, afirmando 201 y tipos numéricos en la respuesta.
- **S6d · barrido medido (agendado):** los 14 clientes restantes, con inventario por cliente y por campo. No se arreglan a ciegas: primero se mide cuáles campos el panel realmente lee como números.

---

**S3 · Historial útil para auditar el día (H1, H3)**
Filtro de fecha, fila de totales del período, límite/paginación, y dejar de tragar errores por fila.
*TDD:* RED de filtrado por rango y de totales; test de que un fallo de contexto por fila se hace visible.

**S4 · Puente POS → bitácora del dueño (B1, B3, B4)**
Requiere decisión D-C. Es la brecha que sustancialmente afecta la operación de SOHO: sin esto el dueño no puede auditar anulaciones, NCs ni descuentos hechos en el mostrador.

**S5 · Resto (#81, #85, #88, #89)**
Conciliación de QR/transferencia o declaración explícita de su ausencia; guarda de topología en la entrada del KDS; validación de lealtad en aparato; ejecución de Fase 8.3 en el próximo ciclo de validación.

*Regla de ejecución:* keep-alive de worktree/rama aislados; commits por unidad de trabajo (Conventional Commits) con tests y docs junto al comportamiento; nunca lanzar suites completas con subagentes vivos (límite de memoria WSL2 de `AGENTS.md`).

---

## 7. Validación en campo pendiente (tablet S23)

Por superficie, en el orden del cliente: (1) descuento manual con mutación de carrito después; (2) promoción creada en la web y aplicada en POS sin reiniciar el checkout; (3) historial del día con su total; (4) bitácora del dueño mostrando la anulación/descuento/NC hechos en el mostrador; (5) QR/transferencia con su efecto en el Corte Z; (6) comanda impresa; (7) lealtad; (8) Fase 8.3.

---

## 8. Decisiones tomadas (2026-10-08)

- **D-A · Tope de descuento — RESUELTO: tope configurable por negocio.** El dueño define monto y porcentaje máximo; el POS rechaza por encima. Requiere: configuración persistida por tenant, superficie en la web, canal de sync al POS y enforcement local. *(El diseño de dónde vive la configuración está en la sección 9.)*
- **D-A2 · Origen del descuento — RESUELTO: sí, origen por línea en la nube con reporte.** Campo de origen (manual/promoción/lealtad) por línea de factura, columna en el reporte y en la web. Cambio de esquema + DTO + mapper + exportación.
- **D-B · Toggle de promoción en el POS — RESUELTO: nube autoritativa, se quita el toggle del POS.** La web es el único lugar donde se activa una promoción. Se elimina el control local para no dejar una reversión silenciosa.
- **D-C · Puente de bitácora — RESUELTO: proyectar `audit_logs` a un endpoint del dashboard.** El dueño lee el ledger encadenado por hash, con actor y entidad; no se duplica la escritura ni se pierde la evidencia forense.
- **D-D · KDS en tenant `PRINT_ONLY`** — pendiente, se decide en S5.
- **D-E · QR/transferencia** — pendiente, se decide en S5.

### Decisiones de diseño tomadas durante la ejecución

- **DD-1 · Base de validación de canje de lealtad — CORREGIDA tras verificación.** La decisión original (validar contra el total neto **solo** de promociones) estaba **invertida** y se revirtió. `LoyaltyService.validateRedemption` usa el total de la orden **únicamente como techo** (`loyalty_service.dart:75`: `if (discountAmount > orderTotal) → failure`) y no existe mínimo de compra en ninguna parte (verificado por grep: el único `minOrderAmount` es de elegibilidad de promociones, `promotions_engine.dart:61`). Un techo más chico **restringe** el canje, nunca lo desbloquea. Al no descontar el componente manual, la base quedaba **más grande** que el residual que el cliente realmente paga, y los puntos podían canjearse contra valor ya regalado. Estado alcanzable: bruto 200, promo 100, manual 15, 900 puntos → base 100, canje de 90 **aceptado**, pero `totalDiscounts = 205 > 200`: el cálculo fiscal recortaba (`invoice_fiscal_calculator.dart:201-203`) y el cliente quemaba puntos de más. Base correcta: `rawSubtotal - _promotionDiscount - _manualDiscount`, que restaura el invariante `totalDiscounts <= bruto` **en el momento del canje**.
- **DD-2 · El override de supervisor NO salta el tope.** El override autoriza **quién** descuenta; el tope es la política del dueño sobre **cuánto**. Si el dueño quiere un límite mayor para supervisores, sube el tope.
- **DD-3 · El tope se evalúa sobre el acumulado, no sobre cada pedido.** La comparación es `_manualDiscount + montoSolicitado` contra el tope efectivo, para que dos pedidos sucesivos por debajo del tope no lo superen entre los dos.

---

## 9. Plan de diseño pendiente de evidencia

- **Configuración del tope:** mapear el plumbing de configuración por negocio (web → backend → delta de sync → tabla local del POS) para decidir dónde monta la política de descuento. Explorador D.
- **Origen del descuento por línea:** mapear el camino `cart line → invoice_item (nube) → reporte/export → web` y definir el cambio mínimo compatible con terminales viejas. Explorador E.

### 9.1 · Diseño del origen del descuento por línea (explorador E) — evidencia

**Cadena de campos:** `totalDiscounts` (escalar único, `sale_view_model.dart:1034`) → prorrateo mayor-resto proporcional al bruto (`invoice_fiscal_calculator.dart:206-256`, `:472`) → `discount` por línea (`sale_view_model.dart:1657`) → Floor `invoice_items.discount` (`invoice_item_entity.dart:14`) → mapper (`sales_mapper.dart:406,429`) → payload `items[].discount` (`sales_mapper.dart:650`) → DTO por ítem (`sync-invoice.dto.ts:94`) → entidad (`invoice-item.entity.ts:80`) → reporte agregado (`sales-reports.service.ts:128,221,231`; `sales-export.service.ts:246,298,959,1053`).

**No existe discriminador alguno hoy.** Ningún `promotionId`, `discount_type` ni `discount_origin` en la nube. La lealtad es inferible sólo a nivel de factura (`customer-point-transaction.entity.ts:15,20,102` y `PaymentMethod.points`); manual vs promoción por línea **no está registrado en ningún lado**.

**Hallazgo que fija el orden:** el prorrateo parte de un agregado único y es proporcional al bruto, así que **el origen por línea no se puede reconstruir después**. El POS tiene que prorratear por origen; el motor de promociones ya devuelve `itemDiscounts` por `productId` (`promotions_engine.dart:23`). Una misma línea puede tener más de un origen, así que hace falta una regla de prioridad o montos por origen. Consecuencia: **S1a (separar acumuladores) es prerequisito de S1c**, y S1c sí toca el prorrateo — la nota "el camino fiscal sigue recibiendo el agregado" vale para S1a, no para S1c.

**Compatibilidad (crítica):** `main.ts:49-53` usa `whitelist: true, forbidNonWhitelisted: true, transform: true`, y los ítems se validan con `@ValidateNested({each:true})` (`sync-invoice.dto.ts:257-261`) sobre un sobre de hasta 500 registros (`sync-batch.dto.ts:322-325`). Un campo desconocido → 400 y **la pipe rechaza el lote completo antes del controlador**. Por lo tanto: **despliegue backend primero**, campo `@IsOptional() @IsEnum(...)`, columna nullable, `NULL` = legado/desconocido, nunca un origen inventado. Una terminal vieja sigue funcionando porque el campo simplemente no viaja.

**Precedente de migración:** agregar columna a `invoice_items` es rutina (`1769000000000-AddRecipeVersionIdToInvoiceItems.ts`: `ADD COLUMN IF NOT EXISTS`, `down` con `DROP COLUMN`). Para enum categórico el patrón es `1809180000000-ReconcileEnumColumns.ts`: `CREATE TYPE` guardado, guarda de membresía fail-closed, manejo de `NO FORCE ROW LEVEL SECURITY`, `DROP DEFAULT → ALTER TYPE USING → SET DEFAULT`. Las políticas de RLS son predicados por tenant a nivel de tabla, así que **una columna nueva no exige cambios de política**. Convención de filas fiscales: nullable, sin default, sin backfill (precedente `1803000000000-AddSaleInventoryOutcomeColumns.ts`, y `invoice.entity.ts:151-154` "D-9: no backfill").

**Nomenclatura propuesta:** `invoice_items.discount_origin` (varchar(20) / enum), `DiscountOrigin { MANUAL='manual', PROMOTION='promotion', LOYALTY='loyalty' }`, nullable. Evitar `origin` a secas: colisiona con `customer_point_transactions.origin = POS|CLOUD`.

**Superficie web:** el export agrega `'Descuento (NIO)'` (`sales-export.service.ts:959,1053`); el dashboard sólo tiene agregados (`tips-summary.tsx:90-95`, `dashboard-api.ts:64,69,144`) — **no existe ninguna tabla a nivel de línea de factura**. El detalle por línea sólo sale por CSV/XLSX. Nota: `AppPermission.SALES_DISCOUNT_OVERRIDE` ya existe con el vocabulario "fuera de promociones" (`owner_dashboard/src/features/users/types.ts:73-76`).

**Riesgos:** (a) backend primero por `forbidNonWhitelisted`; (b) los ítems de nota de crédito fuerzan `discount: 0` (`invoices.service.ts:407`) → el origen debe ser nullable ahí; (c) reportes: **agregar campos nuevos, jamás alterar** `discountNio`/`totalDiscounts` (invariantes de reconciliación documentados en `sales-reports.service.ts:354-359`); (d) filas fiscales append-only: `down()` debe elegirse a conciencia.

**Tamaño:** ~1.5–2 PRs. Backend + reportes S/M cada uno; el slice del POS es M.

**Sin verificar:** dónde se sube la versión del esquema Floor; si el canje de lealtad crea además un pago `points` en la misma venta (doble registro); semántica de fallo parcial del lote más allá de la validación.

### 9.2 · Diseño del tope de descuento por negocio (explorador D) — evidencia

**Hallazgo principal: monta en el mecanismo de configuración que ya existe.** No hace falta migración, ni delta de sync nuevo, ni endpoint, ni página. El tope por monto y porcentaje viaja como dos llaves más en el mismo sobre de configuración fiscal que ya sincroniza.

**Almacenamiento backend:** no son columnas tipadas, es un **almacén clave/valor** — entidad `SystemParametersConfig` → tabla `sys_parametros_config` (`src/modules/inventory/entities/system-parameters-config.entity.ts:11-54`): `tenant_id, param_key, param_value jsonb, version, effective_from/to, is_active`, con trigger append-only y RLS `ENABLE/FORCE` (`1784000000000-CreateSystemParametersConfig.*`), leído por la vista `v_sys_parametros_config_active` (`:74`). Las llaves de configuración fiscal son `FISCAL_PARAM_KEYS` (`modules/onboarding/services/fiscal-setup.service.ts:38-51`) y **no existe ninguna llave de descuento**. La escritura pasa por `configureFiscalSetup` → `upsertParameter`/`upsertOrClearParameter` (`:306-360`, `:456`) → `recordRevisionChange` (revisión + huella).

**Superficie web:** no hay un feature `business-profile`; el Perfil del Negocio **es** `features/settings` (`router.tsx:231`, `settings-page.tsx`). Los campos viven en `fiscal-setup-form.tsx:235-453` y el API es un único `GET/POST /onboarding/fiscal-setup` (`settings-api.ts:18-31`, `fiscal-setup.controller.ts:35,45`, roles OWNER/MANAGER).

**Canal de sync:** el tipo es **`fiscal_config`** (alias `fiscal`, `fiscalconfig`, `config`) — `inbound-sync.service.ts:150-153`, incluido en el set por defecto `:466-477`. El POS lo consume en `sync_service.dart:4676-4687` → `FiscalInboxHandler.handleFiscalEnvelope` (`data/services/fiscal_inbox_handler.dart:127`) → `fiscal_config_local_dao.dart:86 executeFiscalEnvelopeTransaction` (instantánea tipada `fiscal_config_local` + proyección a `local_configs`).

**Almacenamiento local POS:** `local_configs` es clave/valor puro (`local_config_entity.dart:4-13`), `LocalConfigDao` usa llaves string crudas (`local_config_dao.dart:6-13`) y el patrón tipado vive una capa arriba (`TenantConfigService:13-19`, `FiscalProjectionKeys` en `fiscal_inbox_handler.dart:76-110`). **Agregar un valor tipado más es chico: una fila de llave, sin migración de Floor y sin tabla nueva.**

**Punto de enforcement y límite real del override:** el flujo es botón (`sale_view.dart:1882`) → `_requestSupervisorOverrideForManualDiscount` (`:2079`) → monto → `applyManualDiscount` responde `'Acceso denegado.'` → `SupervisorOverrideModal` (`:2095`) → `authRepo.authorizeOverride(supervisorId, pin, totpCode)` (**PIN o TOTP**) → auditoría forense `SUPERVISOR_OVERRIDE_MANUAL_DISCOUNT` (`:2112-2118`) → `grantSupervisorOverride()` (`:2124`). En el VM el gate es un **booleano plano** `_isSupervisorOverrideActive` (`sale_view_model.dart:908-939`), consumido en `_consumeOverride()` (`:920`). **No puede transportar un límite ni un motivo hoy**, así que el tope se aplica dentro de `applyManualDiscount`.

**Camino de lectura en checkout:** `loadTenantConfig()` → `TenantConfigService.getTenantConfig()` (`:631-637`), y lecturas directas `getConfigByKey('tax_regime')` (`:654`), FX (`:718,733,765`). El tope se lee igual, preferentemente por un `DiscountPolicyService` chico con el patrón de `tenant_config_service.dart`.

**Plan ordenado:**
1. Backend: agregar `MAX_DISCOUNT_AMOUNT`/`MAX_DISCOUNT_PERCENT` a `FISCAL_PARAM_KEYS:38`, upsert en `configureFiscalSetup` (~`:335`), campos `@IsOptional` en `fiscal-setup.dto.ts:119` (**obligatorio** por `forbidNonWhitelisted`), y agregarlos a `getEffectiveFiscalPayload` + `getFiscalConfigSnapshot` campo por campo (`fiscal-config-version.service.ts:287-316`). Sin migración.
2. Web: extender `fiscal-setup-form.tsx` y el zod de `features/settings/types.ts`. Sin página ni API nueva.
3. POS: declarar en `FiscalProjectionKeys:76`, validar en el borde del sobre con rango (espejo del chequeo de `commercialFxSpread`, `:199-205`), proyectar en `:564-699` y **agregar a `isProjectionComplete`/chequeos de llave obsoleta** (`:818-830`) o la proyección falla por completitud.
4. POS enforcement: leer el tope y aplicarlo en `sale_view_model.dart:926`; opcional, tope de entrada en el prompt (`sale_view.dart:2128`).

**Riesgos:** (a) **ola de re-huella**: cambiar la forma del payload re-fingerprinta todos los tenants (advertencia documentada en `odd/tasks/soho-business-profile-web.md`), hay que coordinar; (b) `U3` (proyección de Business Profile en el POS) sigue pendiente, así que el patrón del marcador `business_profile_managed_keys` (`fiscal_inbox_handler.dart:110,685`) está disponible pero no implementado — sin verificar si las llaves de descuento deben unírsele; (c) el toggle de exención global de impuestos no está respaldado por configuración (persistencia sin verificar).

**Sin alternativa más barata:** hoy no se sincroniza ningún valor de descuento (verificado en `FISCAL_PARAM_KEYS` y `FiscalProjectionKeys`).

---

## 10. Traspaso de sesión (cierre del bloque P3)

**Rama:** `feat/soho-p3-operational-surfaces`, **23 commits** sobre `origin/main`, empujada hasta `635a0540`, árbol limpio. `origin/main` ya estaba integrado (merge `614793d6`), así que no hay commits de main pendientes de traer.

### Cerrado y validado
S1a, S1b (config + web + POS), S2, S3a/S3b, S4a/S4b, S6a/S6b/S6c, más los defectos que aparecieron al validar: la trampa del filtro vacío, la bitácora en español con búsqueda por lo que se ve, el rechazo del descuento visible en el prompt, el **500 al limpiar cualquier parámetro de configuración**, y el navegador robando el feedback de validación. Todo con mutaciones propias restauradas byte-idénticas.

### S1c · estado y siguiente paso
- **S1c-1 (`019295ef`)**: origen categórico por línea — **superado** por el desglose.
- **S1c-1b (`635a0540`)**: **desglose por origen en `jsonb`** con CHECK. Contratos verificados: nullable y sin backfill (`NULL` = legado/desconocido, **nunca** se fabrica); **opcional en el cable** (cada terminal omite el campo y `forbidNonWhitelisted` tira el lote de 500 entero); el campo en **ambos lados** del hash de conflicto de notas de crédito; ítems de NC en `NULL` (su descuento se fuerza a 0). El DTO y la base **coinciden**: llaves conocidas, valores `> 0`, y un desglose presente debe nombrar al menos un origen. Los dos estados legales son `NULL` y desglose poblado; las cinco formas inválidas las rechaza la base con `23514`.
- ⚠ **Orden de despliegue:** el backend va **primero**. El POS no debe enviar el campo a producción antes de que el backend esté desplegado.

**S1c-2 (lo inmediato) — aceptación ya definida.** El POS ya reparte el descuento por línea con el calculador fiscal (mayor-resto sobre el bruto), así que el nuevo reparto por origen **tiene que reconciliar con ese**. Dos invariantes **simultáneos**:
1. La suma del desglose de cada línea **es igual** a su `discount`.
2. La suma de cada origen sobre todas las líneas **es igual** a su total a nivel de orden.

Se logra repartiendo **un origen por vez**, acotado por la capacidad restante de la línea. **Orden decidido: promociones → manual → lealtad** (el discrecional absorbe el redondeo, por ser el que un humano controla). Ojo con el `build_runner` de este repo (ya borró generados con `--build-filter`) y con la migración local de Floor.

**S1c-3:** reportes aditivos (`discountNio`/`totalDiscounts` **no se tocan**, invariantes de reconciliación documentados en `sales-reports.service.ts:354-359`) y columna de origen en la web.

### Lo que queda, en orden
1. **S1c-2** (POS: prorrateo por origen y envío del desglose) — con la nota de despliegue.
2. **S1c-3** (reportes y web).
3. **Barrido de los 4 formularios** que dependen de la validación nativa como única guarda (`catalog-page`, `product-page` y los dos de lealtad): necesitan esquema propio **antes** de `noValidate`, o se pierden sus `required`/`pattern` en silencio.
4. **S6d** (14 de 16 clientes de API del panel no normalizan numéricos).
5. **S5** (QR/transferencia con conciliación, lealtad, Fase 8.3 del guión).
6. **KDS**: en `FOODPARK_QSR` debía auto-despachar y no lo hace — 17 tickets `PENDIENTE` con badges de ~6 días. **Va al final, por decisión.**
7. **Limpieza del rig** (abajo).

### Estado del entorno (para una sesión fresca)
- **Backend local corriendo** (`node dist/main`, pid 5972) en `:3000`, log en `~/.cache/s4b-backup/backend.log`. **Vite** en `:5173` (`npm exec vite --host 127.0.0.1`).
- ⚠ **Hay procesos de OTRA sesión** (worktree `omnifood-ni-modifiers-web-e2e`): no matarlos a ciegas.
- **Espejo local `omnifood`** (127.0.0.1:5432): migración `180961` (AllowNullParamValue) **aplicada**; `180962`/`180963` **no** aplicadas al esquema público (sus specs construyen esquemas *scratch*). Topes del tenant SOHO **con tumbas nulas** (sin tope), revisión fiscal **17**.
- ⚠ **Contraseña del dueño cambiada** en el espejo local para poder entrar al panel (`admin@soho.com`); el hash original está en `~/.cache/s4b-backup/hash_original.txt`. **Restaurarla al cerrar.**
- `.env` y `apps/pos_app/android/key.properties` copiados desde el checkout principal (gitignoreados). El keystore es `~/.keys/nhilos-upload.jks`.
- **S23** (`R5CWB2LQJDJ`): APK **con todos los arreglos del POS** instalado, apuntando a `http://localhost:3000/api` con `adb reverse tcp:3000 tcp:3000`.
- **Validación web**: el panel se entra por **`http://soho.localhost:5173`** (el slug del tenant es el primer label del hostname; Chromium resuelve `soho.localhost` a loopback y el servidor de desarrollo lo acepta).

### Hallazgos abiertos, no arreglados
- El barrido de formularios (punto 3 de arriba).
- La metadata de la bitácora del POS sigue accesible como JSON crudo tras el toggle **"Ver crudo"** — **a propósito**, es evidencia forense.
- Los 17 tickets del KDS.
- El e2e web del panel está testeado con rutas **mockeadas**; verifiqué a mano que los nombres de parámetros coinciden con el DTO, pero nada automatizado lo prueba.

### Método que funcionó (repetirlo)
Cada unidad cerrada con **mutaciones propias restauradas byte-idénticas** (verificadas con `cmp`), backups **fuera de `/tmp`** (que se barre en este repo), `dart format` **nunca** en sitio, y preferir el test **contra base real** cuando hay constraints, triggers o RLS — los mocks esconden el esquema por diseño.

---

## 11. S1c-2 · Prorrateo por origen en el POS (en ejecución)

Continuación directa de §10. El backend ya guarda el desglose (`635a0540`); falta que el POS lo **produzca** y lo mande.

### Evidencia que faltaba (explorador, verificada en código)

- **El payload de sync se arma desde las filas locales**, no en el checkout: `data/repositories/sales/sales_repository_impl.dart:519-527` (`getItemsByInvoiceId` → `toItemDomain` → `toSyncJson`) y `activation_controlled_sale_runner.dart:405-411`. **Un desglose calculado sólo en memoria se perdería para toda venta encolada offline** → columna local + migración de Floor + codegen. No es opcional.
- **El motor devuelve `itemDiscounts` por `productId`**, no por línea, y **mergea** dos líneas del mismo producto en una sola llave (`promotions_engine.dart:22,93-94,119-120,144-145`). El VM lo descarta hoy (`sale_view_model.dart:1223` sólo guarda `result.totalDiscount`).
- **Dos caminos producen el `discount` por línea**, ambos indexados contra el carrito: el fiscal (`invoice_fiscal_calculator.dart:200-256`, mayor-resto en **centavos**, desempate resto desc → bruto desc → índice asc) y el fallback sin régimen (`sale_view_model.dart:1046-1095`, proporcional sin centavos). El reparto por origen cuelga del **resultado final**, no del calculador.
- Punto de persistencia único: `_processSaleInternal` `:1737-1764` (`calc.lines[i]` → `InvoiceItem`, `:1760 discount: l.discount`).
- Floor: `AppDatabase version: 66` (`app_database.dart:116`); migraciones incrementales en `data/database/migrations.dart` con `allMigrations` (`:2802`) armado en `main.dart:208`; test por migración en `test/data/database/*_migration_test.dart`.
- Paridad instalación-limpia vs migrada: `test/data/database/ohac_delivery_install_parity_test.dart` (hay que actualizarla si enumera columnas).

### Decisiones tomadas

- **DD-4 · El reparto vive en un allocator puro nuevo**, no dentro del calculador fiscal. Motivo: el calculador ya entrega el `discount` por línea y su contrato escalar sostiene el ticket y las pruebas DGI; el allocator recibe ese resultado como **capacidad** y no toca el camino fiscal. Un solo lugar para la regla, y es testeable por sus dos invariantes sin montar el motor fiscal.
- **DD-5 · Pesos por origen:** promoción → monto del motor repartido entre las líneas del mismo `productId` proporcional a su bruto (mayor-resto, desempate bruto desc → índice asc); manual y lealtad → bruto de la línea; si Σ pesos == 0, peso = capacidad restante. La primera pasada la manda el peso; el derrame por capacidad se reparte con la misma ordenación del calculador.
- **DD-6 · Orden y recorte (hereda el orden ya decidido) — CORREGIDO por la verificación adversarial.** promociones → manual → lealtad, **estrictamente secuencial y codicioso**: cada origen reclama `min(lo concedido, la capacidad que queda)`. Si el agregado aplicado es menor que lo concedido (la anomalía preexistente: un canje de lealtad validado sobrevive a que el carrito se encoja y el calculador recorta a bruto, `invoice_fiscal_calculator.dart:200-206`), **el faltante cae sobre el último origen de la fila que todavía tenga monto por colocar**; la lealtad es el pozo **sólo** cuando promociones y manual entran en la capacidad aplicada, que es el caso alcanzable. La primera redacción ("lealtad absorbe el faltante") era **falsa** en el caso degenerado `promoción + manual > bruto`, y la verificación lo reprodujo: con `lineDiscounts [2.00]` y `promo 3.00 / manual 2.00 / lealtad 1.00` el resultado es `{promotion: 2.00}` — promoción corta, manual y lealtad en cero. Consecuencia registrada: en esa anomalía el desglose puede sub-reportar puntos ya quemados. La alternativa (escalar los tres orígenes proporcionalmente) es un cambio chico si el dueño prefiere ver proporciones; no se toma ahora.
- **DD-7 · Nada viaja con cero o negativo.** El DTO (`@IsPositive`) y el CHECK de la base rechazan `<= 0`, y un desglose presente debe nombrar al menos un origen: el mapa omite las llaves cero y la línea manda `NULL` cuando no queda ningún origen.

### Contrato observable (lo que el worker debe espejar, no reinterpretar)

Entrada: brutos por línea, `discount` por línea ya calculado (autoritativo), ids de producto por línea, los tres totales de orden y el mapa opcional del motor. Salida: por línea, monto por origen, en centavos exactos.

**Dos invariantes simultáneos, verificados por test:**
1. Para toda línea: Σ desglose == `discount` de esa línea (centavos exactos).
2. Para todo origen: Σ sobre las líneas == su total de orden (salvo el recorte de DD-6, donde el faltante queda en lealtad).

### Unidades de trabajo

- **S1c-2a · La regla, probada.** Allocator puro + tests de invariantes. Sin wiring, sin cable.
- **S1c-2b · La regla, cableada y persistida.** Columna local + migración 66→67 + modelo + mapper (local y payload) + VM que retiene el mapa del motor e invoca el allocator + tests de mapper/VM/migración.

### S1c-2a · La regla, probada — CERRADO

`apps/pos_app/lib/domain/services/sales/discount_origin_allocator.dart` (328 líneas) + su test (21 casos). Reparto en **centavos enteros** con la misma técnica del calculador (piso + mayor-resto, desempate resto desc → bruto desc → índice asc, tope por línea, y bucle de sobrantes que sólo incrementa líneas con capacidad). La aritmética interna es `int`: no hay fuga de punto flotante hacia una cuenta posterior (verificado por inspección). La unidad **no toca ningún camino de producción todavía** — sólo agrega dos archivos.

**Verificación independiente (adversarial, read-only).** Fuzz de 300k casos de reparto exacto → **0 rupturas** de los dos invariantes; 100k casos de sobre-concesión → el faltante cae siempre en el último origen de la fila (2.221/2.221); 200k mixtos → 0 líneas por encima de su tope y 0 montos no positivos emitidos. Encontró el error de redacción de DD-6 y **cuatro huecos de prueba**, todos cerrados: el caso general de recorte (T5 saltaba la aserción del invariante 2 justo donde falla), el desempate de mayor-resto entre líneas del mismo producto (**ningún fixture lo ejercía**, T10), el fallback de peso cero cuando el mapa nombra sólo un producto ausente del carrito (T11), y un helper de test que redondeaba distinto que la implementación (`1.005` → 101 vs 100, con lo que las aserciones "en centavos exactos" eran más débiles de lo que parecían).

**Mutaciones propias, todas restauradas byte-idénticas** (`sha256` del archivo idéntico antes y después, `cmp` contra el backup en `~/.cache/s1c2a/`):

| Mutación | Resultado | Garantía anclada |
|---|---|---|
| Invertir el orden de los orígenes | fallan T5 y las dos reproducciones de T9 | La secuencia manda el recorte |
| Quitar el tope por línea (`min(base, remaining)`) | `Expected: <400> Actual: <500>` (T1); `Expected: <50> Actual: <66>` (matriz T2) | Ninguna línea puede exceder su descuento |
| Dejar el bucle de sobrantes en una sola pasada | `Expected: <600> Actual: <501>` (T1) | Los centavos sobrantes se colocan **todos**: el bucle es necesario, no decorativo |

**S1c-2b se cortó en dos**: `b-1` persiste localmente (cerrado abajo), `b-2` produce y manda (pendiente).

### S1c-2b-1 · La persistencia local — CERRADO

Columna `discount_origin_json TEXT` nullable en `invoice_items`, con `migration66_67` (guarda por existencia de tabla + sonda de columna, molde exacto de `migration65_66`) y `AppDatabase` de 66 → 67. `InvoiceItem.discountOrigin` es `Map<String, double>?` **nullable sin default**: `null` = legado/desconocido y **nunca** se fabrica un mapa vacío — los dos estados legales son `null` y un desglose poblado. El par local del mapper codifica y decodifica, y el decodificador **falla seguro**: conserva sólo `promotion|manual|loyalty` con valor finito > 0, ignora cualquier otra cosa y devuelve `null` si no queda nada válido, porque una llave desconocida o un cero harían que el backend rechace el lote de 500 **entero**. `toSyncJson` **no se tocó**: nada manda el campo todavía.

Por qué la columna no es opcional: el payload de sync se reconstruye desde las filas locales en el momento del envío (`sales_repository_impl.dart:519-527`), así que un desglose que sólo viviera en memoria se perdería en cada venta encolada offline. Ésa es la diferencia entre "el desglose existe" y "el desglose llega".

**Dos hallazgos que esta unidad destapó, ambos arreglados acá:**

1. **`test/data/database/migrations_test.dart:354` ya estaba en rojo en `d5f94e3e`.** El centinela de la cadena pinnaba "migration64_65 es el eslabón más nuevo" por número e identidad, y **rotó en silencio** cuando entró `migration65_66`: nadie corrió ese archivo en esa unidad. Reescrito como invariante durable: la cadena es contigua, arranca en v10, no repite versiones de arranque y **termina exactamente en la versión con la que Floor abre la base** (leída del runtime, no de la anotación). Mutación de verificación: subir el `version:` del archivo **generado** a 68 sin registrar migración → `Expected: <67> Actual: <68>` con el `reason`; restaurado byte-idéntico. **Lección que vale para el próximo centinela:** el `version:` que cuenta en runtime vive en `app_database.g.dart`, no en la anotación de `app_database.dart`. Mi primer intento de mutación (subir la anotación) pasó en verde y me habría hecho firmar un centinela que no probaba nada; el mutante correcto es el generado.
2. **La doc de la migración citaba un commit `(52b0f1a3)` que no existe.** El worker imitó el ancla `(02cfd0ff)` de la migración vecina —que **sí** es un commit real— e inventó el hash. Se quitó el ancla; la convención "columna + commit que la introdujo" se conserva donde es real.

**Evidencia:** `sales_mapper_test.dart` 39/39 (6 nuevos), suite nueva de persistencia sobre bases reales 10/10 (sqflite ffi, no mocks), `migrations_test.dart` 15/15, `identity_sales_migrations_test.dart` 20/20, `invoice_modifier_quantity_test.dart` 3/3, paridad de instalación limpia 8/8. Inventario de generados: 87 archivos con hash antes y después, delta **exactamente 3**, todos derivados de los dos modelos cambiados. `flutter analyze` sin issues en los siete archivos escritos a mano (los 5 infos restantes son preexistentes, dentro del código generado de Floor y presentes ya en el archivo commiteado).

### S1c-2b-2 · El cable, de punta a punta — CERRADO

`_applyPromotions()` ya no descarta `result.itemDiscounts`: el VM retiene el mapa por producto y lo resetea en `clearCart`. El checkout calcula el reparto **una vez**, desde el mismo snapshot fiscal que consumen las filas (`_buildDiscountOriginBreakdowns(calc)`, justo después de `final calc = currentFiscalCalculation;`), y cada `InvoiceItem` persistido lleva su mapa. La conversión a las llaves del cable itera `DiscountOrigin.values`, así que el orden serializado es siempre promoción → manual → lealtad.

En el payload la llave se **emite sólo cuando el desglose existe y no está vacío**: se omite entera, **nunca** como `null` ni como `{}`. Ésa es la diferencia entre "compatible" y "rompe el hash de conflicto de notas de crédito": un replay legacy y una venta legacy tienen que seguir hasheando byte-idéntico.

**Respuesta a la pregunta abierta del fallback no fiscal: no puede alcanzar el checkout.** Los dos únicos sitios que lanzan `FiscalConfigurationException` (régimen nulo `invoice_fiscal_calculator.dart:166-168`, tasas no usables `:175-183`) están guardados **antes** del cálculo (`sale_view_model.dart:1737-1742` para FX, `:1744-1752` para régimen) y entre la última guarda y `final calc` **no hay `await`**, así que nada puede anular el régimen en esa ventana. Conclusión: el checkout siempre corre el camino fiscal cent-exacto y el desglose reconcilia al centavo con el `discount` de la línea. **Anotado, no arreglado:** si alguna vez se relajan esas guardas, el fallback reparte `totalDiscount * proportion` **sin redondear** (`:1055-1114`) y el desglose podría diferir en menos de un centavo.

**Mutaciones propias, todas restauradas byte-idénticas:**

| Mutación | Resultado | Garantía anclada |
|---|---|---|
| Emitir la llave siempre (aunque sea `null` o `{}`) | `Expected: not contains '"discountOrigin"'` / `Actual: ..."discountOrigin":null...` y `..."discountOrigin":{}...` | La omisión es el contrato: el hash legacy no cambia |
| No pasar el mapa del motor al allocator | `Expected: ['manual']` / `Actual: ['promotion','manual']` | El peso de la promoción aterriza en la línea que la ganó |
| **No** resetear el mapa retenido en `clearCart` | **pasa en verde** (5/5 y 6/6) | **Ninguna**: hoy es inalcanzable, porque `_applyPromotions()` reescribe el mapa en cada mutación del carrito |

Esa tercera fila se registra como está: el reset es **seguro contra la clase de defecto de S1a**, no comportamiento demostrado. El test que lo acompaña fija el estado observable final (la segunda venta no arrastra peso de promoción), no el campo privado. Se deja el reset porque es barato y protege un camino futuro que limpie el carrito **sin** reevaluar promociones, que es exactamente la forma del bug de S1a.

**Evidencia:** checkout real 5/5 —promoción real por `loadPromotions` + `addToCart`, descuento manual tipeado por el test, `processSale`, y las dos invariantes afirmadas contra los montos del propio test, sin inyectarle nada al VM—, `sales_mapper_test.dart` 42/42, `promotions_integration_flow_test.dart` 6/6, `activation_controlled_sale_runner_test.dart` 32/32, `phase7_fiscal_dgi_compliance_integration_test.dart` 8/8, `sales_repository_impl_test.dart` 37/37, `sale_view_model_void_test.dart` 18/18, hold/kitchen 3/3, calculador fiscal 57/57, allocator 21/21, persistencia local 10/10. **Sin archivo generado tocado en esta unidad.**

**S1c-2 queda cerrado.** Lo que sigue es **S1c-3**: reportes aditivos (`discountNio`/`totalDiscounts` **no se tocan** — invariantes de reconciliación en `sales-reports.service.ts:354-359`) y la columna de origen en la web.

⚠ **Orden de despliegue (hereda §10):** el backend va **primero**. El POS no debe mandar el campo a producción antes que el backend esté desplegado; en la rama van juntos, en producción no.

---

## 12. Hallazgo grave durante la verificación de S1c-2: los modifiers no llegan a la nube

**Cómo apareció:** por el replay cross-app que se construyó para S1c-2 (el payload real del POS contra el backend y una base reales, §11). Saltó sobre un campo que **no** era el asunto del trabajo, y lo encontró un verificador al que se le pidió falsificar, no confirmar. La lección operativa: **un fixture prueba el campo para el que se escribió** — el nuestro se armó alrededor de `discountOrigin` y por eso no veía nada del resto del contrato.

### Capa 1 — PROBADA Y ARREGLADA: el lote entero rechazado por una llave anidada

El mapper manda cada modifier como `{'name', 'extraPrice', 'quantity'}` (`sales_mapper.dart:713-718`) y `CreateModifierDto` declaraba sólo `name` y `extraPrice`. Con `whitelist: true, forbidNonWhitelisted: true` (`main.ts:49-53`), replayed contra el `SyncBatchEnvelopeDto` real, la única línea de rechazo es:

```
records.0.invoice.items.0.modifiers.0.property quantity should not exist
```

Un 400 del **lote de 500**, y el camino de ventas del POS no pasa por el bloque de ack en un no-2xx: los registros **quedan pendientes y se reintentan**, o sea el lote envenenado se reenvía completo en cada pasada. El propio código ya documentaba la clase ("400s the ENTIRE batch — so one bad row blocks every good row forever").

### Capa 2 — PROBADA Y ARREGLADA: el cloud no persistía los hijos

La tabla `invoice_item_modifiers` sólo tenía `id`, `invoice_item_id`, `name`, `extra_price`, y el path de venta hacía `upsert` del ítem esparciendo el array `modifiers`: el cascade del `@OneToMany` aplica a `save`, **no** a `upsert`. Arreglado dentro de la **misma transacción** (delete acotado a los ítems de esa factura + insert), con semántica de espejo idempotente: un re-sync reemplaza las filas del ítem en vez de dejar basura.

### Capa 3 — PROBADA, **NO ARREGLADA**: el POS no manda modifiers nunca

Éste es el hallazgo que importa, y corrige una deducción mía previa (creí que `invoice_items.modifiers_json` guardaba los extras: **esa columna no existe**, vive sólo en `hold_ticket_items` y `kitchen_order_items`).

| Punto | Evidencia |
|---|---|
| `InvoiceItemEntity` no tiene ningún campo de modifiers | `lib/data/models/sales/invoice_item_entity.dart` (grep: NONE) |
| `toItemEntity` no los mapea → se pierden al persistir | `sales_mapper.dart` `toItemEntity` |
| El checkout pasa `[]` como lista de modifiers a la transacción | `sales_repository_impl.dart:225-244` |
| El push mapea con `toItemDomain`, cuyo default es `const []` | `sales_repository_impl.dart:522-529` + `sales_mapper.dart:391-413` |
| `toItemModifierEntities` no tiene llamadores | `sales_mapper.dart:515` |

**Consecuencia:** la nube nunca registró un extra de ninguna venta (0 filas), y el POS tampoco puede reconstruirlos localmente. El dinero está bien —el precio del extra entra en el total del ítem y el ticket impreso se arma en memoria— pero **una reimpresión armada desde las filas locales no puede mostrar los extras**, y un documento fiscal tiene que ser reproducible. Requiere autorización: es código de producción del POS y tiene que salir **después** de este backend.

⚠ **Orden, ahora con dientes:** backend primero. Si el POS empieza a mandar modifiers antes que el backend los acepte, cada venta con extras pasa de "pierde el detalle" a **"tapa la cola de sync para siempre"**.

### Lo arreglado en esta unidad (backend)

- `CreateModifierDto.quantity` **opcional** (`@IsOptional @IsInt @Min(1)`). Opcional a propósito: las terminales desplegadas ya lo mandan y las viejas lo omiten — exigirlo rechazaría el lote de las viejas. `0` y negativos se rechazan con error nombrado.
- Columna `quantity integer NOT NULL DEFAULT 1` en `invoice_item_modifiers` + migración `1809640000000`. El default es **factual, no inventado**: el cloud sólo aceptó `name` y `extra_price`, así que toda fila existente viene de un modifier de una unidad, que es exactamente el default local del POS (`invoice_item_modifier_entity.dart:30`). RLS sin cambios (es una columna).
- `test/fixtures/sales/pos-modifier-payload.json`: fixture capturado por la **cadena productora real** (checkout real con un modifier de cantidad 2 → filas reales → `SalesMapper.toSyncJson` + `SyncService.buildSalesSyncRecord`), con **una desviación documentada**: el array de modifiers se re-engancha en la costura del test, porque hoy ese es el punto que producción tira; una unidad POS posterior deberá fijar el camino del runner y cerrar la desviación. Dos capturas dan sha256 idéntico.
- `test/sales/pos-modifier-payload.db.e2e-spec.ts`: replay contra esquema aislado real, pipe de producción, ruta real y `InvoicesService` real. Afirma: aceptado de punta a punta, filas persistidas con `name`/`extra_price`/`quantity`, payload legacy (sin la llave) persiste 1, y `quantity: 0` rechazado sin persistir nada.

**Evidencia:** el replay nuevo 3/3 **con el RED citado** (400 del lote y `column "quantity" does not exist`), el replay de S1c-2 6/6 intacto, 130/130 unitarias tocadas, 8/8 del spec contra base real (que ejercita la migración nueva), 34/34 de la cadena productora del POS. Todo verificado por el orquestador además del worker.

### Capa 3 — ARREGLADA: el POS ya persiste y manda los modifiers

**Qué se hizo:** el checkout construye las filas de modifiers (`SalesMapper.toItemModifierEntities`, que hasta hoy **no tenía llamadores**) y las pasa en lugar de `[]` a **los dos** sitios de transacción (DGI y fulfillment), así que venta y modifiers se commitean o se revierten juntos. El push y el rebuild del runner las cargan con **una sola consulta batch** (`InvoiceItemDao.getModifierRowsByInvoiceId`, con JOIN, sin N+1) y se las pasan a `toItemDomain` — cuyo default vacío era justamente lo que aplanaba todo a `modifiers: []`.

**La desviación de la costura se CERRÓ, y con la mejor evidencia posible:** el fixture se volvió a capturar por la cadena real **sin** el re-enganche del test y los bytes salieron **idénticos** (`sha256 1d8d8cb8…`). O sea que la suposición de la costura sobre la forma del cable era correcta, y ahora está probada por construcción en vez de por convención. El comentario de procedencia del spec del backend lo declara cerrado.

**Duplicación que encontré y consolidé:** el worker había copiado la conversión fila→dominio en dos lugares (repositorio y runner) con un comentario pidiendo "keep the two in sync". Eso es exactamente lo que este repo ya decidió no dejar suelto. Movida a `SalesMapper.toModifierDomain`, **al lado de su inversa** `toItemModifierEntities`: con una sola implementación no hay nada que pueda divergir, y el camino del push y el del rebuild quedan obligados a emitir los mismos bytes.

**Mutaciones propias, todas restauradas byte-idénticas:**
| Mutación | Resultado | Garantía anclada |
|---|---|---|
| El checkout vuelve a pasar `[]` | `Expected: an object with length of <1> / Actual: []` | Los modifiers se persisten con la venta |
| El push no le pasa las filas a `toItemDomain` (aplica el default) | `Expected: [{'name': 'Michelada Extra', 'extraPrice': 30.0, 'quantity': 2}] / Actual: []` | El cable lleva lo vendido |
| El push no carga las filas | el mismo error | La carga batch es load-bearing |

**Nota de método honesta:** la mutación 2 la corrí primero contra la suite del runner y **pasó en verde** — el runner tiene su propio camino de rebuild y no cubre el push del repositorio. Re-ejecutada contra `sales_repository_impl_test.dart` falla como debe. Moraleja: una mutación que pasa puede estar señalando la suite equivocada, no código correcto.

**Evidencia:** 76/76 en las dos suites (repositorio 42, runner 34) con `--concurrency=1`, el replay del backend 3/3 intacto, `invoice_modifier_quantity` 3/3 y `migrations_test` 15/15 de contabilidad, y el inventario de generados con **delta exacto de 1 archivo** (`app_database.g.dart`, la consulta nueva). `flutter analyze` sin issues en los cuatro archivos de producción.

**Lugares donde el camino real todavía suelta un modifier (reportados, NO arreglados en esta unidad):** (1) la **reimpresión** (`prepareReprintInvoice`/`_printInvoiceCopy`) arma los ítems con el default vacío → un reimpreso todavía no muestra los extras: es la unidad siguiente y es fiscalmente la más delicada; (2) la lectura del historial de ventas (`sales_history_view_model.dart:342`), que no alimenta el cable; (3) el mapeo de ítems de anulación/nota de crédito, donde los modifiers son irrelevantes para la reversión de inventario.

### Capa 3, la parte fiscal — ARREGLADA: el reimpreso ya muestra los extras

`prepareReprintInvoice` cargaba los ítems con el default vacío de `toItemDomain`, así que un reimpreso **soltado en silencio** los extras que el original sí imprimió. El formateador ya sabía renderizarlos (`receipt_layout_formatter.dart:605-608,1079-1082,1626`): el hueco era sólo la carga. Ahora usa la **misma** consulta batch (`getModifierRowsByInvoiceId`) y la **misma** conversión (`SalesMapper.toModifierDomain`) que el push y el rebuild — nada duplicado, y los tres consumidores quedan obligados a coincidir.

**El borde honesto se preserva:** una venta anterior a `a137a116` no tiene filas de modifiers porque nunca se registraron. Para esas, el reimpreso **no imprime nada** — jamás se fabrica ni se rellena hacia atrás — y **no lanza**: el contrato fail-closed (`REPRINT_SNAPSHOT_UNAVAILABLE`) sigue limitado a la instantánea fiscal, y los tests de esa denegación pasan sin cambios.

**Evidencia:** el test nuevo nace en rojo (`Expected: an object with length of <1> / Actual: [] / Which: has length of <0>`) y queda verde 10/10; incluye una aserción sobre el **texto impreso** (contiene el nombre del extra), que es lo más profundo que este arnés alcanza — el driver de la impresora no se ejercita, y eso queda dicho. Suites contiguas verdes (`sales_repository_impl_test` 42/42, `sale_view_model_void_test` 18/18, `activation_controlled_sale_runner_test` 34/34) y el fixture cross-app **byte-idéntico**. Mutación propia: volver la carga al default vacío → `Expected: <1> / Actual: []`; restaurada byte-idéntica.

---

## 13. S1c-3 · El origen del descuento en reportes y en la web

**La pregunta que responde:** el hallazgo D3 del §1 —"imposible responder *cuánto se descontó a mano este mes*"—. El "quién lo autorizó" ya lo sirve la bitácora (S4); acá va el **cuánto por origen**.

### S1c-3a · Los totales por origen en el reporte del panel — CERRADO

El corte sale del mapa: `getDashboard` **ya carga los ítems** con `relations: ['items','payments']` dentro de `runInTenantTransaction`, así que el agregado es un *fold* en TypeScript, no SQL crudo. Y hay un detalle que lo vuelve correcto **por construcción** en vez de por disciplina: `totalDiscountsNio` se compone sumando `invoice_items.discount` (`salesRowDiscounts`) sobre las filas que pasan `isRevenueAffectingDocument`. Por lo tanto el fold por origen vive **en el mismo bucle, sobre las mismas filas, con el mismo predicado y el mismo `round2`** — y esta identidad es exacta para toda entrada:

```
manualDiscountNio + promotionDiscountNio + loyaltyDiscountNio + discountOriginUnattributedNio === totalDiscountsNio
```

Un segundo cálculo paralelo habría dado dos números que "casi" coinciden; el dueño no puede reconciliar con un *casi*.

**Contrato del campo nuevo `discountOriginUnattributedNio`** ("sin origen registrado"):
- un desglose `NULL`/ausente (legado) manda **todo** el descuento de esa línea acá — **jamás** se presenta como un cero de origen: decir "descuento manual: C$0.00" cuando en realidad no se registró es fabricar un hecho fiscal;
- un desglose **parcial** deja su residual acá;
- un desglose que **sobre-declara** produce un residual **negativo**, y **no se recorta**: la identidad se mantiene sobre datos que se contradicen a sí mismos en vez de esconder el problema;
- las llaves **desconocidas se ignoran**: el CHECK de la base las prohíbe, pero un reporte nunca debe inflar un total con entrada no validada.

**Mutaciones propias, todas restauradas byte-idénticas:**

| Mutación | Resultado | Garantía anclada |
|---|---|---|
| Un `NULL` no va a "sin origen" (se descarta) | `Expected: 50 / Received: 0` (3 tests) | Legado nunca se convierte en cero de origen |
| Recortar el residual negativo a 0 | `Expected: -20 / Received: 0` | La identidad se mantiene aunque los datos se contradigan |
| Iterar todas las llaves en vez de las tres conocidas | `Expected: 0 / Received: 999` | Entrada no validada no puede inflar un total fiscal |

**Evidencia:** 46/46 en el spec puro de semántica (8 casos nuevos), 34/34 del servicio, 19/19 del controlador = **99/99**; `getTopProducts` (el otro consumidor de `computeSalesReportingTotals`) verificado sin cambios. Ejemplo trabajado del fixture: líneas 40 (manual) + 70 (promo 45 / manual 25) + 15 (lealtad) + una línea legado de 30 con `NULL` → manual 65, promoción 45, lealtad 15, sin origen 30, total **155** ✓.

### S1c-3b · La superficie web — CERRADO
El bloque "Descuentos" de `tips-summary.tsx` (la **única cifra de descuento renderizada** en el panel) ahora muestra el desglose debajo del total: `Descuento manual`, `Descuento por promoción`, `Descuento por lealtad` y `Sin origen registrado`. Anatomía de fila idéntica a las vecinas (misma tipografía, `tabular-nums`, indentación de un nivel) siguiendo el estándar NHILOS §42.5/§42.6 — cero lenguaje visual nuevo, cero componente nuevo. La fila del total queda intacta.

**La trampa que se evitó, y que es todo el punto de la unidad:** el normalizador colapsaba *ausente* a `0` con `toFiniteNumber`. Para estos campos eso habría mentido contra un backend viejo: un negocio cuyos C$279 de descuentos son **todos legado** habría leído "Descuento manual: C$0.00", que es un hecho fiscal inventado. Los cuatro campos entran como **opcionales** y el normalizador **preserva la ausencia** (la llave se omite, nunca se rellena con 0), mientras que un `0` genuino sigue siendo `0`: son dos hechos distintos y se muestran distinto. Cuando el API no reporta el desglose, **no se renderiza nada** — ni ceros ni placeholders.

La fila "Sin origen registrado" aparece sólo cuando es distinto de cero; si es **negativa** se muestra igual, porque es una inconsistencia de datos guardados que el dueño tiene que ver, no un cero para esconder.

**Mutaciones propias, todas restauradas byte-idénticas:**
| Mutación | Test que falla | Garantía anclada |
|---|---|---|
| Colapsar ausente a `0` (la trampa) | `preserves absence: missing fields stay undefined, never fabricated 0` (2 tests) | Ausente nunca se convierte en un cero fiscal |
| Mostrar la fila "sin origen" siempre | `hides the unattributed row when it is exactly zero` | Cero genuino no necesita fila |
| Esconder el valor negativo | `renders the unattributed row for a negative value (stored-data inconsistency)` | Una contradicción de datos no se oculta |

**Evidencia:** 24/24 en `dashboard-v2-tips.spec.tsx` (7 tests nuevos), 54/54 en acceptance + w2-sales, `tsc --noEmit` con 0 issues. **Límite declarado:** la verificación es contra el contrato del cable y la capa mockeada; no se validó contra un backend vivo (queda para la validación de punta a punta, que necesita el `dist` reconstruido). También se reportó, sin tocar, un hazard latente en `kpi-deltas.ts` (`isTipsSummaryApplicable` revienta con `undefined` en vez de `null`), hoy inalcanzable porque la prop es requerida.

⚠ **Cuidado que ya identifiqué:** el normalizador del panel (`dashboard-api.ts:144`) colapsa *ausente* a `0` con `toFiniteNumber`. Para estos campos eso mentiría contra un backend viejo (mostraría "manual: C$0.00" con un total de C$279 de legado), así que la web tiene que **distinguir ausente de cero** y no renderizar el desglose cuando el API no lo reporta.

### S1c-3c · El libro de ventas (export) — PENDIENTE
Una fila por factura: agregar columnas por origen al DTO del export, al CSV (`:959,977`), al XLSX (`:1053,1075`) —el PDF no tiene columna de descuento— más los tipos y el **fixture de contrato** del panel (`fiscal-dtos.json` + `w4-contract.test.ts`). El spec del export **pinnea el header CSV exacto**, así que agregar columnas rompe ese pin y hay que actualizarlo a conciencia.

### Validación de punta a punta (hecha, con la rama viva) — CERRADA

**Preparación del rig:** `dist` reconstruido desde la rama (`nest build`) y backend reiniciado (`:3000`, sólo nuestro pid; los procesos de la otra sesión en `:3300`/`:5174` no se tocaron). Al espejo se le aplicaron **exactamente** las tres migraciones pendientes: `180962`, `180963`, `180964`.

**Prueba viva 1 — la rama honesta sobre datos reales.** Tres líneas reales con descuento (125.00 + 20.00 + 9.00 = 154.00) y **ningún** desglose registrado. El reporte vivo responde:

```
manual 0 | promo 0 | lealtad 0 | sin origen 154 | total 154   → identidad OK
```

O sea: el legado se reporta como **"sin origen registrado"**, no como ceros de origen. Ésa era exactamente la trampa, y está desmentida en vivo.

**Prueba viva 2 — las cuatro ramas a la vez.** Puse un desglose temporal en dos de esas líneas reales (125 → manual 100 + promoción 25; 20 → lealtad 20) y dejé la tercera en `NULL`:

```
manual 100 | promo 25 | lealtad 20 | sin origen 9 | total 154 → identidad OK
```

**Prueba viva 3 — el navegador.** Con el `dist` de la rama, la base real y el proxy de Vite hacia `:3000`, una spec live temporal (patrón del arnés `settings-discount-cap.live.spec.ts`) leyó la tarjeta tal como la ve el dueño:

```
Flujos separados de ventas
Descuentos                C$154.00 · 3.3% base
  Descuento manual        C$100.00
  Descuento por promoción C$25.00
  Descuento por lealtad   C$20.00
  Sin origen registrado   C$9.00
```

Captura en `~/.cache/s1c3/live-card.png`. La spec temporal se **borró** (no queda en el repo) y la mutación de prueba se **revirtió exacta**: hoy 0 filas tienen desglose y el reporte volvió a `sin origen 154`, verificado después del revert.

**Lo que esta validación NO prueba, dicho claro:** un push **real del dispositivo** con desglose (o con modifiers) — haría falta la S23 con `adb reverse`; el cable está probado por el replay contra esquema y base reales (§11 y §12), no por la tablet. Tampoco prueba el flujo de un negocio cuyo POS sea anterior a la rama (que es, justamente, el caso "sin origen").

**Estado del rig al terminar:** backend en `:3000` con el `dist` de la rama; espejo con `180962`/`180963`/`180964` aplicadas; contraseña temporal del dueño (`C0ntr4sen4`) **sigue puesta** — su restauración corresponde a la limpieza del rig, junto con los topes y los `.env`/`key.properties` copiados.

### S1c-3c · El libro de ventas — CERRADO

Las cuatro columnas por origen entran en el libro de ventas (CSV, XLSX y JSON) **al lado** de `Descuento (NIO)`, que no se toca. El PDF no tiene columna de descuento y no se tocó.

**La instrucción clave de esta unidad fue no crear una segunda implementación.** La regla de atribución se **extrajo** a `salesRowDiscountOrigins(row)` en el módulo puro, y **el fold del panel y el bucle del export llaman a la misma función**. Una copia habría dejado al libro y al panel capaces de discrepar sobre *por qué* existe un descuento — que es exactamente el defecto que esta unidad no debía crear. La extracción es idéntica en valor (los 46 casos previos del módulo siguen verdes sin debilitar una sola aserción).

**Guardianes nuevos, y son la parte que importa:** el spec puro afirma que *plegar el helper reproduce los totales del período* (anti-deriva interna), y el spec del export afirma que la fila del libro **coincide exactamente** con `computeSalesReportingTotals` para la misma ventana de una sola factura (anti-deriva **entre superficies**). Son dos formas de decir lo mismo: una sola regla, dos consumidores, imposible que se separen en silencio.

**Pin del header CSV actualizado a conciencia** (el spec lo fijaba exacto):
```
antes:  ...,"Descuento (NIO)","Total (NIO)",...
después:...,"Descuento (NIO)","Descuento Manual (NIO)","Descuento Promoción (NIO)",
         "Descuento Lealtad (NIO)","Descuento Sin Origen (NIO)","Total (NIO)",...
```

**Ejemplo trabajado de la fila pineada:** líneas 40 (manual) + 70 (promoción 45 / manual 25) + 15 (lealtad) → `discountNio = 125.00`; cuatro valores: manual **65.00**, promoción **45.00**, lealtad **15.00**, sin origen **0.00**; identidad 65 + 45 + 15 + 0 = **125** ✓, y los mismos cuatro coinciden con `computeSalesReportingTotals` de la misma factura.

**La tabla fiscal del panel NO necesitó cambio**, y eso se reportó en vez de inventar trabajo: construye sus columnas dinámicamente desde `Object.keys(rows[0])`, así que los cuatro campos fluyen solos. Al no haber cambio visual, el estándar de experiencia NHILOS no aplicó a ninguna decisión de diseño.

**Mutaciones propias, todas restauradas byte-idénticas:**
| Mutación | Resultado | Garantía anclada |
|---|---|---|
| Descartar el `NULL` en el helper | **6** tests nombrados: el caso legado del export, la reconciliación del fixture, el `NULL`→sin origen, la exclusión de anuladas, y **los dos guardianes de deriva** | Legado nunca se convierte en cero de origen, y la regla es una sola |
| El export lee el helper sin los ítems | 4 tests: la fila CSV, la identidad por fila, el caso legado y el guardián cross-superficie | El libro deriva de las líneas reales de la factura |

**Evidencia:** backend 90/90 (semántica + export), web 143/143 (contrato + api + fiscal) y `tsc --noEmit` con 0 issues. **Límite declarado:** `w4-e2e-fiscal.test.ts` está excluido de vitest y exige backend vivo, así que el contrato e2e de los campos nuevos por el cable no quedó probado; ese archivo no afirma campos de fila, por lo que no necesitó cambio.

---

## 14. Barrido de los formularios que dependen de la validación nativa

**Inventario:** 15 formularios en el panel y **sólo uno** con `noValidate` (el fiscal). Clasificados: 3 ya usan RHF+zod (login, promociones, modifiers) → les falta **sólo** `noValidate`, una línea cada uno; 1 con RHF sin resolver pero con reglas JS (`catalog-acquisition-modal`); 1 con `safeParse` de su esquema **más** `required` nativo (`user-dialog`); **4 native-only** (los del handoff); y 5 con guardas JS ad-hoc (inventario ×3, recetas, y un quinto de lealtad).

**El diagnóstico es peor que "globo en inglés":** en un navegador real el globo nativo bloquea el submit y el feedback de la app nunca corre —la misma clase de defecto que el formulario fiscal—, pero además **cualquier submit que no venga del botón esquiva la guarda nativa por completo**: un `form.requestSubmit()` programático (que un test ya usa, `product-type-create.test.tsx:143-163`) o una llamada directa al handler. Hoy la única guarda real es el navegador, y es esquivable. De ahí el orden: **esquema primero, `noValidate` después**; al revés se pierden `required`/`pattern`/`min`/`max` en silencio.

**Contratos nativos a cubrir, atributo por atributo:**
| Formulario | Lo que la guarda nativa cubre hoy |
|---|---|
| Catalog (valor) | `code` required + `pattern ^[A-Za-z0-9_-]+$` + maxLength 64; `name` required + maxLength 120; `sortOrder` number min 0 |
| Product | `name` required + maxLength 200; `uom` required (sólo en create); `sellPrice` number step 0.01 min 0, **no requerido** |
| Lealtad, programa | `name` required; por forma de regla: SPEND_POINTS / PRODUCT_STAMPS / VISIT_STAMPS con `min 1` requeridos y un `min 0` opcional |
| Lealtad, recompensa | `name` required; `cost` min 1 required; `amount` min 1 required en la rama de descuento; `productId` required en la rama de producto gratis |

**Riesgo de regresión que hay que evitar: no inventar restricciones nuevas.** Valores legítimos hoy que un esquema ingenuo rompería: `sortOrder = 0`, `sellPrice = 0`, `amountNio = 50`, `minSpend = ''` (opcional vacío), `eligibleIds` con texto libre. El esquema cubre **lo que el atributo ya cubría** y nada más; endurecer de más rompe flujo legítimo, que es el modo de falla opuesto pero igual de real.

**Cómo se obtiene el RED (técnica medida en el repo):** jsdom aplica las mismas restricciones nativas, así que un test que envía con un requerido vacío **observa el bug**: el submit queda bloqueado y el mensaje español no aparece. Después del arreglo, ese mismo test prueba que la app es dueña del feedback.

**Estilo obligatorio:** mensajes literales por campo, en español, según el estándar §18.2 (dicen qué está mal y cómo corregirlo; prohibido `Invalid`, `Error`, texto crudo del backend y nombres técnicos del DTO) y §18.3 (preservar lo cargado; enfocar al error accionable). Render: `aria-invalid` + `<p className="text-xs text-destructive">{errors.X.message}</p>`.

**Corte en tres unidades:** **A** catalog (la más chica, fija el patrón), **B** product (requeridos condicionales + el camino de cambio de tipo + 5 archivos de test), **C** el par de lealtad (mecánicamente idénticos entre sí → una sola unidad de revisión).

**Hallazgos diferidos, no arreglados:** (a) el **quinto** formulario de lealtad (`customer-loyalty-profile.tsx:75`) que el handoff no nombra — sólo `type=number` nativo y ya tiene guardas JS; (b) el grupo con guardas JS ad-hoc (suppliers/insumos/purchases/RecipeForm) **no se rompe** con `noValidate` porque su guarda es JS, pero sus atributos nativos (`RecipeForm` hasta `max={99.99}`, `suppliers-tab.tsx:496` `required`) necesitan paridad de esquema **antes** de agregarlo; (c) los tres que ya usan RHF+zod necesitan sólo `noValidate` — cambio de una línea cada uno, merece su unidad chica.

### Unidad A · Catalog (valor) — CERRADO

El diálogo tiene esquema propio (`catalogValueFormSchema(isEdit)` en `features/catalog/types.ts`, mensajes literales en español por campo), RHF + `zodResolver`, `noValidate` con el comentario que explica **por qué**, y errores en línea con `aria-invalid` + el `<p className="text-xs text-destructive">` del ejemplar fiscal. Los atributos nativos (`required`/`pattern`/`maxLength`/`min`) se **retiraron**: inertes bajo `noValidate`, y dejarlos habría permitido que una futura remoción del atributo reviviera una guarda silenciosa del navegador.

**Fidelidad al atributo, no endurecimiento.** El esquema cubre exactamente lo que la guarda nativa cubría: `name` se valida **sin** `.trim()` porque `required` sólo bloqueaba la cadena vacía (un nombre de sólo espacios era válido y sigue siéndolo), `code` se valida en crudo porque el `pattern` nativo rechazaba espacios, y `sortOrder = 0` (y el campo vaciado, que el `Number("")` vuelve 0) siguen siendo legales.

**Dos consecuencias de UX que se reportaron en vez de esconderse:** el `maxLength` nativo **truncaba** el tipeo en silencio; ahora el operador puede pasarse y recibe un mensaje visible en español (es lo que vuelve observable el test de >64/>120). Y una entrada numérica inválida pegada (`badInput`) que antes el navegador bloqueaba ahora normaliza a 0 igual que un campo vaciado.

**Mutaciones propias, todas restauradas byte-idénticas:**
| Mutación | Resultado | Garantía anclada |
|---|---|---|
| Quitar `name` requerido del esquema | `submitting with empty name shows the app's Spanish message and never calls the API` | La app es dueña del feedback, no el navegador |
| **Endurecer** `sortOrder` a min 1 | **3** tests: la trampa de regresión (`sortOrder 0 remains VALID...`), el doble submit previo y el modo edición | El esquema no inventa restricciones |
| Quitar el patrón del código | `code with an illegal character shows the Spanish charset message...` | Cada atributo nativo tiene su regla |

**Evidencia:** RED citado antes de tocar producción (`jsdom` bloquea el submit y el mensaje español no aparece), GREEN 34/34 en las dos suites del catálogo, `tsc --noEmit` sin issues, y paridad de payload create/edición (en edición el `code` no se renderiza ni se envía, y el esquema lo relaja para que nunca rechace una edición legítima).
