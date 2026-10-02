# Prueba Integral — Día 1 SOHO (go-live viernes)

Documento operativo de validación. El objetivo no es "probar features": es garantizar que
**la terminal opere un día de trabajo completo sin intervención**. Nos jugamos la imagen.

## Marco de aceptación

Regla del proyecto: `docs/nhilos/nhilos_backoffice_experience_standard_v1.0.md`.

Aplica el **§4 Core Promise First** y su **§4.1 Core Promise blockers**. Un módulo falla de
inmediato si su flujo principal:

| Blocker NHILOS §4.1 | Dónde lo tenemos hoy |
|---|---|
| produce información de negocio incorrecta | IVA en 0 (ver R-1) |
| oculta un efecto secundario material | error de venta invisible bajo el carrito (R-4) |
| convierte dato desconocido/parcial en valor válido | tenant vacío → camino legacy (corregido) · badge contando mal (corregido) |
| hace ambigua una acción irreversible | factura de activación consume consecutivo DGI (R-7) |
| pierde trabajo ingresado por el usuario innecesariamente | por validar: carrito ante fallo de venta |
| expone inaccesible una acción crítica | por validar: COBRAR con error de dominio |

Regla de oro para cada check: **¿el operador completa su trabajo, y el sistema dice la verdad
sobre lo que pasó?**

## Escenario bajo prueba (alcance explícito)

- El cliente entrega **solo menú y precios**. Sin recetas, sin insumos, sin conteo inicial.
- Todos los productos deben quedar **SIMPLE**.
- Insumos y recetas se integran **después** del go-live, con remediación retroactiva
  (`POST /api/inventory/remediations/sale-inventory`).
- Todo lo que quede fuera de este alcance no bloquea el viernes, pero debe estar documentado.

---

# Fase 0 — Habilitación (antes de tocar la terminal)

**Promesa: el negocio existe, tiene menú y su numeración fiscal es real.**

### Menú real del cliente — VALIDADO

| | |
|---|---|
| Fuente | `Menú SOHO.pdf` (2 páginas) |
| Resultado del preview | `categories: 7`, `productsToCreate: 56`, `productsToUpdate: 2`, **`recipesToCreate: 0`**, **`insumosToCreate: []`**, **`errors: []`**, **`warnings: []`** |
| Total | **58 productos, todos SIMPLE** |
| Artefacto | `Menu_SOHO_import_listo.xlsx` (58 filas, 0 con insumo, fila de ejemplo borrada de las 8 hojas) |

Composición: CAFÉ CALIENTE 16 · CAFÉ HELADO 11 · BEBIDAS 12 · BATIDOS 4 · POSTRES 4 · DESAYUNOS 5 · COMIDA 6.

Decisiones confirmadas por el cliente:
- **Cuota Fija, no aplica IVA** (Art. 244 Ley 822). El precio listado en el menú es el precio final; el PDF dice "los precios no incluyen IVA" pero bajo este régimen no se recauda IVA, así que no se agrega nada.
- Los **tamaños son productos separados** (`Cappuccino 12oz` / `Cappuccino 8oz`): el import del menú no soporta variantes. 58 ítems donde el cliente ve ~30.
- Los precios reconstruidos de la extracción del PDF (Latte 125/100, Flat White 135/125, Mocca 140/110, Matcha Latte 140/120) fueron **revisados y confirmados** por el cliente.

Los 2 productos `productsToUpdate` son `Espresso Doble` y `Latte 12oz`, que quedaron **COMPOUND** en el tenant de pruebas por la corrección de recetas inertes de hoy. El import hace actualización de precio únicamente y **nunca toca el tipo**, así que siguen COMPOUND ahí. En el tenant limpio del cliente los 58 se crean SIMPLE.

**Criterio de control:** si el preview en el tenant del cliente no da `56 a crear / 2 a actualizar / 0 recetas / 0 insumos / 0 errores`, **parar** e investigar antes de commitear.

| # | Check | Evidencia esperada | Estado |
|---|---|---|---|
| 0.1 | Tenant provisionado (`npm run provision`) con nombre, RUC y slug correctos | fila en `tenants`, `is_active=true` | |
| 0.2 | Dueño creado con email, contraseña y PIN de 6 dígitos | login del dueño funciona | |
| 0.3 | **Serie fiscal DGI configurada** (prefijo + consecutivo inicial de la autorización) | `initializeRange()` ejecutado; sin esto `FiscalSequenceUnconfiguredError` **bloquea toda facturación** | |
| 0.4 | Menú importado por Excel (`Configuración → Importar menú`) | preview sin errores; ver Fase 0-bis | |
| 0.5 | Productos creados como **SIMPLE** con precio > 0 y `is_active=true` | ver Fase 0-bis | |

### Fase 0-bis — Import del menú (reglas que causan fallos reales)

| # | Check | Por qué |
|---|---|---|
| 0.6 | Se usó **la plantilla oficial**, no un Excel propio | las **5 columnas son obligatorias** como encabezado: `producto, precio, insumo, cantidad, unidad`. Un archivo de 2 columnas es **rechazado** |
| 0.7 | Se **borró la fila de ejemplo** de las 6 hojas | si queda, crea un producto real `Cappuccino 8oz` (COMPOUND) + insumo `Café molido`. Es comportamiento diseñado, no un bug, y ensucia el menú |
| 0.8 | `insumo`, `cantidad`, `unidad` quedaron **vacías** en todas las filas | es lo único que separa SIMPLE de COMPOUND |
| 0.9 | Se pasó por **preview** antes de commit | `productsToCreate`, `recipesToCreate: 0`, `insumosToCreate: []`, `errors: []` |
| 0.10 | Precio por fila numérico y sin conflicto | precio faltante o contradictorio bloquea el commit completo |

**Salida de fase:** el preview reporta 0 recetas, 0 insumos, 0 errores.

---

# Fase 1 — Arranque y login inicial

**Promesa: el sistema autentica al negocio y a su gente, y sabe quién puede operar.**

| # | Check |
|---|---|
| 1.1 | Arranque en frío sin crash ni pantalla en blanco |
| 1.2 | Login online con credenciales del dueño (email + contraseña) |
| 1.3 | El staff se sincroniza y aparece completo en la selección de usuario |
| 1.4 | Un usuario con tenant vacío **no** degrada la terminal (regresión del defecto de hoy) |
| 1.5 | La terminal queda vinculada al tenant (`local_configs['tenant_id']` presente) |
| 1.6 | Con red caída, el login online falla con mensaje claro y **no** destruye la sesión de dispositivo |

**Señal de alerta:** si algún usuario local queda con `tenant_id` NULL, la venta cae al camino
legacy y los COMPOUND se vuelven invendibles. Hoy está curado en cada pull, pero se verifica.

---

# Fase 2 — Login por PIN offline

**Promesa: el cajero entra a operar aunque no haya internet.**

| # | Check |
|---|---|
| 2.1 | **Con la red desconectada**, "Modo Operativo (Cajeros con PIN)" lista usuarios |
| 2.2 | PIN correcto entra; PIN incorrecto rechaza con mensaje claro |
| 2.3 | Ningún mensaje muestra UUIDs, códigos internos ni inglés |
| 2.4 | El bloqueo por intentos fallidos funciona y es acotado (no deja la cuenta muerta) |
| 2.5 | Al entrar, la pantalla de ventas se reconstruye limpia y carga el turno del operador correcto |

---

# Fase 3 — Activación de terminal

**Promesa: la terminal queda operativa y verificada.** Ojo: **esta fase factura de verdad.**

| # | Check | Consecuencia |
|---|---|---|
| 3.1 | Vinculación con código de activación | el código expira; no reusar códigos quemados |
| 3.2 | Las 3 fases de onboarding avanzan sin saltos ni estados fantasma | |
| 3.3 | La verificación ejecuta una **factura de prueba real** | |
| 3.4 | **Esa factura consume un consecutivo DGI de forma permanente** | el primer número comercial **no** es el inicial autorizado, es `inicial + 1`. El cliente debe aceptarlo |
| 3.5 | La factura de verificación queda marcada como tal y con `payment_status='paid'` | único camino que hoy setea `paid` |
| 3.6 | El Setup Center **no** vuelve a ofrecer activación para una terminal ya activa | defecto H-3 corregido |
| 3.7 | Al tocar "Ir al POS" el sync se dispara de inmediato | defecto H-4 corregido: antes esperaba 5 min |

---

# Fase 4 — Apertura de caja

**Promesa: el turno arranca con un fondo declarado y auditable.**

| # | Check |
|---|---|
| 4.1 | No se puede vender sin turno abierto (la pantalla de ventas muestra la apertura en su lugar) |
| 4.2 | Apertura con fondo en **NIO y USD** por separado |
| 4.3 | El fondo declarado se refleja como efectivo esperado del turno |
| 4.4 | El turno queda ligado a **usuario + terminal** (no al terminal solo) |
| 4.5 | El turno sincroniza al cloud (`cashier_sessions.sync_status` pasa a `synced`) |

**Riesgo abierto R-3:** hoy un turno abierto puede quedar `sync_status='pending'`
indefinidamente. El endpoint `POST /api/sales/shifts/sync` existe, así que hay que verificar
si es un fallo o una feature a medias. **No bloquea la venta local, sí la verdad en el cloud.**

---

# Fase 5 — Venta simple con efectivo y vuelto

**Promesa: cobro exacto, vuelto correcto, descuento de inventario honesto.**

| # | Check |
|---|---|
| 5.1 | Producto del menú (SIMPLE) se agrega y muestra precio correcto |
| 5.2 | Cobro con monto exacto cierra la venta |
| 5.3 | **Cobro con monto mayor calcula el vuelto correcto** (el caso reportado hoy) |
| 5.4 | Vuelto en NIO y en USD, con el tipo de cambio comercial aplicado |
| 5.5 | El vuelto **no** infla el monto del pago en el registro |
| 5.6 | La factura queda `APPLIED_NO_INVENTORY_IMPACT` con razón `NO_EXPLICIT_INSUMO_MAPPING` (SIMPLE sin insumos) |
| 5.7 | **No** se escribe ningún movimiento de kardex |
| 5.8 | Numeración DGI consecutiva, sin saltos |
| 5.9 | La factura sincroniza al cloud con totales correctos |

**Riesgo abierto R-2:** `payment_status` queda `'pending'` en **toda** venta normal — nada lo
setea a `paid` salvo el camino de activación. Si el cliente mira su dashboard, verá facturas
cobradas como impagas. **Corregir antes del viernes.**

---

# Fase 6 — Venta con tarjeta

**Promesa: el cobro con tarjeta queda registrado con su rastro completo.**

| # | Check |
|---|---|
| 6.1 | Diálogo de datáfono completo (marca, tipo débito/crédito, banco) |
| 6.2 | Voucher rápido (`PENDIENTE`) permitido para no frenar la cola |
| 6.3 | El pago llega al cloud con marca, banco y estado de conciliación |
| 6.4 | La venta no queda bloqueada esperando autorización |

# Fase 7 — Pago dividido (multi-tender)

**Promesa: un ticket se cobra con varios medios sin perder un centavo.**

| # | Check |
|---|---|
| 7.1 | Efectivo + tarjeta en el mismo ticket, saldo restante baja a 0.00 |
| 7.2 | Efectivo NIO + efectivo USD + tarjeta (3 medios) |
| 7.3 | El botón de cobro se **deshabilita** mientras no esté saldado |
| 7.4 | Ambos pagos llegan al cloud ligados a la misma factura |
| 7.5 | La suma de pagos cuadra exactamente con el total |

# Fase 8 — Anulación, nota de crédito y reimpresión

**Promesa: se puede corregir un error sin romper la ley ni la trazabilidad.**

| # | Check |
|---|---|
| 8.1 | La factura **no se borra nunca**: solo se marca anulada |
| 8.2 | Anulación exige autorización (rol y/o PIN de supervisor) |
| 8.3 | La nota de crédito revierte totales y respeta la cadena fiscal |
| 8.4 | Anular dos veces se rechaza con mensaje honesto y en español |
| 8.5 | La reimpresión reproduce el documento **como se emitió** (snapshot), no recalcula |
| 8.6 | Si la impresora no imprime, el sistema **lo dice** en vez de mentir con un éxito |

---

# Fase 9 — Corte X y Corte Z

**Promesa: leer el turno sin cerrarlo, y cerrarlo de forma inmutable.**

| # | Check |
|---|---|
| 9.1 | **Corte X**: lectura parcial de ventas y efectivo esperado, **sin cerrar** el turno |
| 9.2 | El Corte X no altera la numeración fiscal |
| 9.3 | **Arqueo ciego**: se cuenta físicamente **antes** de ver el esperado |
| 9.4 | La diferencia se calcula después del conteo |
| 9.5 | Discrepancia sobre el umbral exige autorización de gerencia |
| 9.6 | **Corte Z**: congela el turno, calcula diferencias, genera **número Z secuencial** |
| 9.7 | El Corte Z queda bloqueado si hay **vouchers pendientes de conciliar** |
| 9.8 | Un turno cerrado no se puede reabrir ni modificar |
| 9.9 | Corte X y Corte Z en **NIO y USD** |

# Fase 10 — Movimientos de caja

| # | Check |
|---|---|
| 10.1 | Ingreso y retiro manual con motivo |
| 10.2 | Retiro exige **PIN de supervisor** |
| 10.3 | Caja chica y depósito a bóveda (safe drop) |
| 10.4 | Cada movimiento actualiza el efectivo esperado de inmediato |
| 10.5 | Los movimientos quedan auditados con usuario y hora |

# Fase 11 — Conciliación de vouchers

| # | Check |
|---|---|
| 11.1 | La lista muestra los vouchers de tarjeta **del turno activo** |
| 11.2 | Se cargan los códigos de autorización de los vouchers físicos |
| 11.3 | Un voucher conciliado sale de la lista de pendientes |
| 11.4 | El Corte Z se desbloquea al conciliar el último voucher |

---

# Fase 12 — Cambio de operador (pase de turno)

**Promesa: cambiar de cajero sin destruir la sesión del dispositivo.**

| # | Check |
|---|---|
| 12.1 | "Cambiar operador" está disponible en el drawer |
| 12.2 | Con caja abierta, el pase se **rechaza** y manda a cerrar caja primero |
| 12.3 | Sin caja abierta, el pase pide **solo el PIN del que entra** |
| 12.4 | **El sync sigue funcionando tras el pase** (no hay que reloguear) |
| 12.5 | El operador entrante carga **su propio** turno, nunca el del saliente |
| 12.6 | Ninguna venta queda atribuida al operador equivocado |
| 12.7 | "CERRAR SESIÓN" sigue funcionando como cierre de dispositivo |

---

# Fase 13 — Sincronización

**Promesa: el cloud refleja la verdad, y el operador sabe cuándo no.**

| # | Check |
|---|---|
| 13.1 | Badge de sync verde en operación normal |
| 13.2 | **"Pendientes en Outbox: 0"** cuando no hay nada pendiente (regresión del falso positivo de hoy) |
| 13.3 | Cada factura llega al cloud con ítems, pagos y totales íntegros |
| 13.4 | El freshness reporta `COMPLETE` en operación con tráfico |
| 13.5 | Con red caída: se sigue vendiendo, y al volver la red todo sube |
| 13.6 | El badge **no** queda en 1 para siempre por un documento ya entregado |
| 13.7 | Tras un reboot del dispositivo, el sync arranca sin intervención |

# Fase 14 — Reportes y cierre del día

| # | Check |
|---|---|
| 14.1 | Historial de ventas del día completo y correcto |
| 14.2 | Reporte de ventas por tipo de pago |
| 14.3 | Reporte fiscal (DGI) sin huecos de numeración |
| 14.4 | Cierre de caja del último turno con diferencias declaradas |
| 14.5 | Todos los turnos del día cerrados y sincronizados |
| 14.6 | El día siguiente abre con numeración continuada, sin reinicio |

---

# Corrida de validación contra staging — 2026-10-02

Corrida ejecutada **contra staging como entorno productivo**, no contra el backend local, sobre
una terminal real (Q80) y datos sembrados de prueba. Decisión del responsable: validar en el
entorno donde va a operar el local, no en un backend de desarrollo.

| | |
|---|---|
| Tenant | `b94b8536-e3b6-4db5-9d82-d887006756d1` (SOHO, RUC `J0000000000000`, slug `soho`) |
| Terminal | `pos-local-dc8b3c14-67dc-4f27-bd37-4d8e5a1bf017` |
| Artefacto | APK `1.0.1+2010`, horneado con `--api-url https://api-staging.nhilospos.com/api` |
| Datos | **dummy**, sembrados por `npm run seed:soho-catalog` (fuente: `odd/plans/soho-integration-test-plan.md`) |

> **Estado posterior (2026-10-02, tarde):** este tenant fue **renombrado** a `SOHO Test Fixture`
> (slug `soho-test-fixture`, RUC `J0000000000000`) para liberar nombre, slug y email del tenant
> limpio de entrega. Los valores de la tabla describen la corrida de la mañana y quedan como
> registro histórico. La entrega final usa el tenant `5af6c6c9-47eb-4bed-badd-b30cd1943ad1` y el
> APK `1.0.1+2012` — ver `## Estado de entrega — tenant limpio de SOHO`.

## Resultados por check (sólo lo observado)

| # | Check | Evidencia observada | Estado |
|---|---|---|---|
| 1.1 | Arranque en frío sin crash | lanzamiento limpio tras `pm clear`, sin pantalla en blanco | **PASS** |
| 3.x | Activación de terminal | `device_linking_codes` CLAIMED (20:22:08Z → 20:22:22Z); `status: ACCEPTED`, `policyVersion: SALE_TIME_V1`; factura de verificación `10010100000007` | **PASS** |
| 4.x | Apertura de caja, dos monedas | `initial_float_nio=1000.0000`, `initial_float_usd=50.0000`, `status=OPEN`, terminal correcta | **PASS** |
| 5.x | Venta simple, efectivo y vuelto | `10010100000008`: total 120.00, recibido 500.00, `change_given=380.00` (500−380=120) | **PASS** |
| 5.4 | Vuelto en USD | `10010100000010`: total 95.00, recibido 200.00 NIO, `change_given=2.86`, `change_currency=USD`, `exchange_rate=36.7000` (105 ÷ 36.70 = 2.861) | **PASS** |
| 5.x | Propina en el checkout | `10010100000009`: `total=70.00` (fiscal, sin propina), `tip_amount_nio=7.00`, `tip_percentage=10.00`, `total_usd=1.91`; pago 100.00 con vuelto 23.00 (100−23 = 70+7) | **PASS** |
| 8.x | Anulación de factura | `10010100000008` → `is_canceled=t`; la numeración siguió avanzando (…09, …10) sin reutilizar el número | **PASS** |
| 9.x | Corte X no cierra el turno | tras emitir X, el turno siguió `status=OPEN` | **PASS** |
| 9.x | Corte Z con diferencia | `status=CLOSED`; `expected_cash_nio=1277.00` vs `final_counted_nio=1200.00` → `difference_nio=-77.00`; `expected_cash_usd=47.14` vs `final_counted_usd=40.00` → `difference_usd=-7.14`; `z_report_sequence=1`; cerró **sin PIN ni umbral** | **PASS** |
| 13.x | Sync de negocio | facturas, turnos y activación llegan a staging | **PASS** |
| 13.x | Sync de auditoría | `audit_logs` de la terminal = **0 filas**; último registro del tenant 2026-09-29 22:54 | **ROJO** |

**Verificación aritmética del cierre multi-moneda** (lo que valida el neteo de vuelto de D-19):
`1000 (fondo) + 77 (venta 09: 100−23) + 200 (venta 10 completa, porque su vuelto salió en dólares) = 1277` ✔
`50 (fondo USD) − 2.86 (vuelto entregado en USD) = 47.14` ✔
La venta anulada (500/380) **no** entra al esperado. El efectivo esperado está neto de vuelto, en cada moneda.

## Checks no ejercitados

Fases **6** (tarjeta), **7** (pago dividido), **8.3** (nota de crédito), **10** (movimientos de caja),
**11** (conciliación de vouchers), **12** (cambio de operador) y **14** (reportes del día) **no se
ejecutaron** en esta corrida. La Fase 0 completa (tenant provisionado limpio) tampoco: se corrió
sobre el tenant sembrado con datos dummy.

## Hallazgos nuevos de esta corrida

| # | Hallazgo | Evidencia | Impacto |
|---|---|---|---|
| **R-10** | El panel de sincronización atribuye a la red lo que es un bloqueo de inventario | `inventory_sync_receipts` de **todos** los terminales del tenant en `APPLIED_INVENTORY_PENDING`; último receipt en estado terminal: `Q802024120001`, 2026-09-23 02:06Z (= **22 sept 20:06 local**, exactamente el "hasta" que muestra el panel). La frescura (`freshness-derivation.ts`) sólo avanza con outcomes terminales | **§4.1** — manda al operador a buscar un problema inexistente y esconde la causa real por 10 días |
| **R-11** | El stream de auditoría no replica a producción | `audit_logs` de la terminal = 0 filas; cada terminal del tenant tiene **exactamente 1** fila histórica; último del tenant 2026-09-29 22:54; la terminal acumula **7 pendientes + 1 outbox**; `audit_integrity_alerts` = 0 (la cadena forense no reporta hueco, pero tampoco sube). El badge es honesto; "Forzar Sincronización" no drena | **RESUELTO** — causa raíz: **brecha de deploy, no defecto de código.** El commit del fix (`33eebf31`, D-18 parte 2) existía sólo en la rama local `fix/soho-commercial-fx-rate`; nunca se empujó. `origin/main` no lo contenía y la rama estaba 49 commits adelante. Fix requerido (dos commits, no uno): `33eebf31` (guard de transporte en la ruta) + `585ad47e` (registro del provider del guard). Resolución: push fast-forward `27a15728..9e83b15d` a `main` → auto-deploy de Railway `fcee4eaa-1341-40f3-9284-7ceba9d496c4` = SUCCESS. Evidencia: (1) `POST /identity/audit` con token humano pasó de `201 {"status":"success","count":0}` a `401 {"message":"Invalid device access token"}`, con el control `GET /onboarding/fiscal-setup` en 200 con el mismo token; (2) `audit_logs` del tenant `5af6c6c9-47eb-4bed-badd-b30cd1943ad1` registra `Q802024120001 | SALE_CREATED | sequence_no 1 | 2026-10-02 16:06:58.863+00`; (3) el operador ejecutó "Forzar Sincronización" y el badge de nube quedó verde; (4) el stream quedó drenado, no goteando: `sales_transaction_dao.dart` escribe exactamente una fila de auditoría por transacción (`:406` transacción de venta, `:522` transacción de anulación — call sites distintos, no dos por venta), así que 1 venta = 1 fila = 1 recibida; (5) `audit_integrity_alerts` del tenant = 0. Veredicto anterior: `Bloqueador de entrega` — sin causa raíz |
| **R-12** | Timestamps fiscales inconsistentes entre tablas | `invoices.created_at` guarda **hora local** sin normalizar (venta 14:27 local → `14:27Z`) mientras `cash_shift_sessions.opened_at/closed_at` guarda **UTC real** (`20:26Z`/`20:59Z`). La factura parece anterior al turno que la precede | **DGI/reportes** — ensucia cualquier filtro por fecha |
| **R-13** | No hay detección ni aviso de ventas con inventario no aplicado, ni replay automático | 10 días de ventas de toda la flota en `APPLIED_INVENTORY_PENDING` sin una sola alerta al dueño. Sólo existe remediación **manual**: `POST /inventory/remediations/sale-inventory` | **§4.1** — el sistema vendió 10 días sin descontar inventario y nadie se enteró |

### Nota sobre R-8 (no es hallazgo nuevo)

R-8 ya estaba documentado como cerrado ("diseñado, se remedia al publicar la receta"). Esta corrida
**no lo contradice**, pero agrega el mecanismo completo y verificable:

1. `menu-import.service.ts` crea las recetas con `publication_state: DRAFT` **por diseño**, y
   clasifica el producto `COMPOUND` cuando el Excel trae al menos una fila de ingredientes.
2. El pipeline de ventas (`sale-inventory-outcome.service.ts`) **exige `PUBLISHED`**: sin receta
   publicada la disposición es `PENDING_RECIPE` → `APPLIED_INVENTORY_PENDING` para **toda** la venta,
   con `acknowledgedMovementCorrelationIds = []`.
3. Consecuencia: la cola local de movimientos nunca se acusa y el watermark de frescura no avanza.

Lo que **sí** falta cerrar es que nada en el flujo le dice al dueño que debe publicar las recetas, y
que el panel reporta el síntoma como problema de red (R-10).

### Trampa del re-import de menú (verificada en código)

`menu-import.service.ts` matchea productos por nombre y, si el producto ya existe, aplica
**sólo precio**:

```
// Price-only update: never touch name, recipe, or type.
await manager.save(Product, { ...existing, sellPrice: roundPrice(group.price) });
```

Y las recetas existentes se saltean con `VERSION_ALREADY_EXISTS`. Por lo tanto **re-importar el
menú corregido no cambia el tipo de ningún producto existente y no lo reporta como problema**.
El camino soportado para corregir el tipo es **Catálogo → tipo de producto** en el portal
(`PATCH /products/:id`, con confirmación explícita de cambio destructivo porque desvincula la
receta). En un tenant limpio no aplica: los 58 se crean SIMPLE de entrada.

**Hallazgo de entorno (corrige una suposición de todo el proyecto):** la environment de Railway se llama literalmente `production` (proyecto `nhilos-pos`, environment `c770e500-e68f-40c3-9d2c-098584fabda3`, servicio de API `78c67b33-f1f8-4d58-aad8-6ce17fe6970f`). El host `api-staging.nhilospos.com` es **sólo un nombre heredado**: staging y producción sirven el mismo servicio y la misma base de datos. Nunca existieron dos entornos. Se verificó que `https://api.nhilospos.com/api` responde 200 y ve el mismo tenant `5af6c6c9-47eb-4bed-badd-b30cd1943ad1`.

## Estado de entrega — tenant limpio de SOHO

- Tenant limpio: `5af6c6c9-47eb-4bed-badd-b30cd1943ad1` | `SOHO` | slug `soho` | RUC `0011112930059D`; dueño `admin@soho.com` (usuario `6bb99487-5dc1-4438-9823-f7a60fc37034`).
- Config fiscal real cargada: régimen `CUOTA_FIJA`, `taxRateIva: 0`, `pricesIncludeTax: false`, `commercialFxSpread: 36.6243`, modo `FOODPARK_QSR`, FX de checkout `COMMERCIAL`, código de autorización DGI `0011112930059D-84`. Revisión 1.
- Menú real importado con el gate exacto: `categories: 7, productsToCreate: 58, productsToUpdate: 0, recipesToCreate: 0, errors: []`. **58 productos, todos `SIMPLE`**, 0 recetas y 0 insumos → cada venta produce `APPLIED_NO_INVENTORY_IMPACT` (terminal), que es justamente lo que evita la cadena R-8/R-10.
- Terminal activada con device-id horneado `Q802024120001`: `device_linking_codes` = CLAIMED, credencial de sync ACTIVE con scopes `sync:push`/`sync:pull`, resultado de activación `PASS_WITH_WARNING`. La serie fiscal arrancó en 1 con prefijo vacío.
- Venta de verificación: factura 1 — subtotal 80.00, `total_tax` 0.00, total 80.00, pago en efectivo 80.00 NIO, `APPLIED_NO_INVENTORY_IMPACT`.
- Catálogo en el equipo: el listado de Productos del POS muestra el menú real **poblado** (observado por el operador tras la activación). La vista **no tiene contador**, así que el conteo exacto no es verificable desde la pantalla; el conteo exacto de 58 productos `SIMPLE` sí está verificado en base.
- La dirección y el teléfono del negocio son **dato device-local** (`local_configs`, en Configuración → Perfil del Negocio): no existe columna en la nube, no sincronizan nunca y se pierden si se borran los datos de la app.

| Artefacto | Valor | Nota |
| --- | --- | --- |
| APK instalado | `1.0.1+2012` (versionCode 2012) | incluye los dos fixes de esta pasada |
| `git_commit` del APK | `9e83b15d` | commit de `main` tras el push |
| `terminal_identity` | `Q802024120001` | device-id horneado en build |
| `api_url` | `https://api.nhilospos.com/api` | producción |
| `sha256` | `52764ec18e8838cce53fd5b2db9065902e1d8304977925821bf596e5e1b440fa` | 89.327.827 bytes |

## Veredicto de esta corrida

**La puerta de salida NO se considera habilitada.** Faltan las Fases 6, 7, 8.3, 10, 11, 12 y 14:
nunca se ejercitaron, y sobre el tenant limpio no se re-corrrieron por decisión explícita del
responsable de no hacer más ventas de prueba en el equipo que se entrega. El bloqueador de entrega
que sí había abierto (**R-11**: la auditoría no llegaba a producción) quedó **resuelto y
verificado** — ver la fila R-11 de los hallazgos y `## Estado de entrega — tenant limpio de SOHO`.
El resto de lo ejercitado pasó con evidencia en base, incluido el neteo multi-moneda del cierre.

---

# Riesgos abiertos ordenados por impacto en el día 1

| # | Riesgo | Impacto | Estado |
|---|---|---|---|
| **R-1** | `taxRate`/`isTaxExempt` estaban excluidos del contrato de sync; el POS guardaba `0.0` mientras el cloud decía `0.15` | **DGI** bajo Régimen General: toda línea se declaraba exenta | **CORREGIDO** (`ee55ad9c`) — el backend emite ambos desde las columnas. Cuota Fija (el cliente del viernes) nunca estuvo afectado |
| **R-2** | `payment_status` quedaba `'pending'` en toda venta normal | el dashboard mostraba cobrado como impago | **CORREGIDO** (`5fd5cb76`) — `saveSale` resuelve el estado con el mismo `SplitPaymentCalculator` que habilita COBRAR |
| **R-3** | ~~Turno abierto con `sync_status='pending'`~~ **NO es un defecto — verificado** | El turno abierto **sí** llega al cloud (`status=OPEN`, terminal y cajero correctos, verificado en `cash_shift_sessions`). `sync_service` marca `synced` **solo a los cerrados** a propósito: un turno abierto sigue mutando (los movimientos alteran el esperado) y se re-empuja en cada ciclo. El `pending` local es el estado esperado, no un fallo | Cerrado — falsa alarma |
| **R-4** | Mensaje de error de venta: UUID crudo, en inglés, **oculto bajo el carrito**, y COBRAR reintenta sin límite | ante un fallo el operador no sabe qué pasó y no puede reaccionar | Sin corregir — **§4.1 "hides a material side effect"** |
| **R-5** | La fila de ejemplo de la plantilla crea un producto fantasma COMPOUND | ensucia el menú y agrega un insumo no pedido | Documentado en 0.7 |
| **R-9** | `prepare()` acumula hechos de autoridad **por línea de carrito sin de-duplicar**, y `_validatedFacts` rechaza identidades duplicadas | **Puede morder el DÍA 1**: el mismo producto en dos líneas (distinta variante o modificadores) duplica el `AuthorityProduct` y **aborta el checkout entero**. No requiere recetas. Dos productos que comparten un insumo (dos bebidas con leche) lo mismo | **EN CORRECCIÓN** — hallado al cerrar R-6 |
| **R-6** | Un mapeo directo (`mappingVersionId` + `insumoId`) sin receta no resolvía su insumo (se pueblaba solo desde cierres de receta) y el guard tumbaba **todo** el checkout | Aparece al integrar insumos/mapeos, no el viernes | **CORREGIDO** — hidratación en sync + lectura en `prepare()`, con test end-to-end |
| **R-7** | La factura de prueba de activación consume un consecutivo DGI | el primer número comercial no es el inicial autorizado | Informar al cliente |
| **R-8** | Venta COMPOUND sin receta publicada → `APPLIED_INVENTORY_PENDING` | **no bloquea**: está diseñado, y se remedia al publicar la receta | Cerrado como riesgo |

## Riesgos ya cerrados hoy (con evidencia)

- Tenant borrado por el pull de usuarios → venta COMPOUND invendible. Corregido y verificado.
- Badge de outbox con falso positivo permanente. Corregido y verificado en dispositivo (0 pendientes).
- Recetas inertes por tipo de producto + delta que nunca reenviaba. Corregido.
- Sync no disparado tras la activación (esperaba 5 min). Corregido.
- Cambio de operador destruía la sesión del dispositivo. Corregido.
- Keystore con circuit breaker crónico en tablets sin hardware-backed key. Corregido.
- Setup Center re-ofreciendo activación. Corregido.
- **Validador de RUC rechazaba persona natural** (commit `9e83b15d`). `business_profile_view.dart:129` usaba una regex inline `^[A-Z][0-9]{13}$` que sólo acepta la forma jurídica, bajo un comentario que afirmaba "natural o legal"; ya existía un validador correcto y testeado en `lib/core/utils/nicaragua_fiscal_validator.dart`. RED observado; GREEN reemplazando por `NicaraguaFiscalValidator.isValidRuc()`. Cuatro fixtures de otros tests usaban `A0011234567890` (válido en ningún formato nicaragüense — sólo pasaban porque el validador viejo era más laxo que la regla real) y se corrigieron a `J0310000000000`. 174 tests pasan y `flutter analyze` queda limpio en los archivos tocados. **Verificado en el equipo:** el operador guardó dirección y teléfono en el Perfil del Negocio con el RUC de cédula `0011112930059D` — antes ese guardado era imposible.
- **R-11 / stream de auditoría** — cerrado; ver la fila R-11 de la tabla de hallazgos de esta corrida (ya resuelta arriba), no se repite aquí la evidencia completa.

---

# Puerta de salida (release gate)

El día 1 se considera **habilitado** solo si:

1. Fases 0 a 14 ejecutadas en una terminal real, en orden, en **un solo día de trabajo simulado**.
2. Ningún **Core Promise blocker** (§4.1) abierto en el flujo principal de venta, caja o fiscal.
3. `0` diferencias entre lo que el POS dice y lo que el cloud muestra, para: facturas, pagos,
   turnos y numeración.
4. Ningún paso requiere conocimiento técnico del operador (ni UUIDs, ni códigos internos, ni inglés).
5. Con la red caída: se vende, se cobra, se da vuelto, y al volver la red **todo** llega al cloud.

**Actualización 2026-10-02 (tarde):** el criterio 2 en lo que concierne a R-11 está ahora **CUMPLIDO** — el discriminador `POST /identity/audit` con token humano responde `401 Invalid device access token`, y `audit_logs` ya contiene la fila `Q802024120001 | SALE_CREATED | sequence_no 1`. Detalle completo en la fila R-11 de los hallazgos y en "Estado de entrega — tenant limpio de SOHO".

**Criterio de honestidad:** si algo no se pudo probar, se declara **no probado**, no "OK".
Un check sin evidencia observada es un check en rojo.
