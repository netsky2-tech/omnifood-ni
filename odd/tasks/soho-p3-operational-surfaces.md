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

**S2 · Rastro y activación de promociones (P1, P2, P3)**
Recargar promociones en el listener de inbound del checkout; decidir el conflicto del toggle local/ nube (decisión D-B).
*TDD:* RED que afirme que un delta de promoción dispara `loadPromotions` y que el resultado queda evaluado en el carrito abierto.

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
