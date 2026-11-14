# Feature: Guard de lote en compras (#938 resto)

- **Bloque:** 4 — Prevención de descuadres en inventario (P2)
- **Issue:** #938 (resto)
- **Módulos:** `apps/pos_app`, `apps/admin_backend`, `apps/owner_dashboard`
- **Normativa:** toca **R-04** (bienes no intercambiables → identificación específica obligatoria; no promediarlos)

## Specs

### S1: Regla única — una compra necesita lote si el insumo es perecedero **o** ya tiene lotes
Hoy la regla es `requiresBatchTracking = insumo.isPerishable` en las tres capas. Eso permite subir el
agregado de un insumo no perecedero **que ya se gestiona por lotes** sin crear lote, dejando el saldo de
lotes atrás del agregado y bloqueando la venta siguiente con un error de otro dominio.

La regla pasa a ser: una compra exige `lotCode`, `receivedDate` y `expirationDate` cuando
`insumo.isPerishable == true` **o** el insumo ya tiene al menos un lote registrado.

### S2: POS — el formulario avisa por qué aparecen los campos de lote
En `purchase_view.dart`, cuando el insumo ya tenía lotes y **no** es perecedero, el formulario muestra
un aviso explícito (en español neutro) antes de los campos de lote, explicando que el insumo ya se
gestiona por lotes y que omitir el lote descuadra el saldo por lote contra el agregado.

### S3: POS — la ruta de guardado re-verifica contra el repositorio (autoridad, no estado de UI)
`recordPurchase` no confía en el flag de preview: consulta `repository.getBatchesByInsumoId(insumoId)`
y aplica la regla de S1. Si falta lote lanza un error que **nombra la causa real** y la consecuencia,
en vez del mensaje genérico de "batch-managed items".

### S4: Backend — la misma regla en preview y en registro
En `inventory-purchase.service.ts`, `buildPreview` recibe el conteo de lotes existentes y devuelve
`requiresBatchTracking = is_perishable || existingBatchCount > 0`, tanto en `previewPurchase` como en
`recordPurchase`. `assertBatchMetadata` distingue el caso "perecedero" del caso "ya tiene lotes".

### S5: Owner Dashboard — el formulario consume el flag del backend
`purchases-form.tsx` deja de derivar el requisito solo de `selectedInsumo.is_perishable` y usa
`preview?.requiresBatchTracking ?? isPerishable`, para que los campos de lote aparezcan cuando el
insumo ya tiene lotes y para que el payload envíe los datos de lote en ese caso.

### S6: Pruebas
- POS: unitarias del view model (regla + rechazo + mensaje) y de UI (aviso visible y campos de lote).
- Backend: unitarias del servicio (flag en preview, rechazo en registro, lote creado cuando el insumo
  ya tenía lotes).
- Dashboard: la tab de compras envía los datos de lote cuando el preview lo exige.

## Tasks
- [x] T1: Regla y guard en `purchase_view_model.dart` (S1, S3) + tests unitarios
- [x] T2: Aviso y campos de lote en `purchase_view.dart` (S2) + tests de UI
- [x] T3: Regla en `inventory-purchase.service.ts` (S4) + tests backend
- [x] T4: Consumo del flag en `purchases-form.tsx` (S5) + tests dashboard
- [x] T5: Verificación independiente del cambio (alto riesgo: integridad de datos)

## Log
- L1: "En su lugar, vamos a continuar arreglando issues que son importantes para la puesta en produccion de NHILOS POS... ahora toca el 4: ### Bloque 4: Prevención de Descuadres en Inventario (P2) ... #938 (Resto) — Guard en compras para insumos perecederos/con lote: ... Lo que resta de #938 es un guard en el formulario de compras para alertar si se está ingresando stock sin lote para un insumo que ya se gestiona por lotes."
- L2: Alcance ampliado al backend y al dashboard: un guard solo en el POS deja el formulario de compras del dashboard creando exactamente la divergencia que #938 describe.
- L3: Tres capas verdes: POS view model 17/17 (5 nuevos), POS widget 11/11 (2 nuevos), backend 50/50 (4 nuevos), dashboard 28/28 (1 nuevo) + `tsc -b --noEmit` y `dart analyze` limpios.
- L4: El verificador independiente (`gentle-ai-verify`) quedó **no disponible**: dos subagentes se colgaron 30 min en su primer `bash` por el límite de hilos del host WSL2, y el worker que llegó a entregar no pudo ejecutar ni un comando. La verificación se hizo inline (abajo) y se declara como tal.

## Verification

Verificación inline (el agente independiente no estuvo disponible: ver L4).

| # | Criterio | Veredicto | Evidencia |
|---|---|---|---|
| 1 | La autoridad lee **todos** los lotes, no solo los que conservan saldo | **PASS** | `batch-allocation.ts:139` — `batchRepo.find({ where: { tenant_id, insumo_id } })`, sin filtro de `remaining_stock`; POS `inventory_repository_impl.dart:576` → `batch_dao.dart:5` `findBatchesByInsumoId` (sin filtro; el filtrado es `findActiveBatchesByInsumoId`, que no se usa aquí). Un lote consumido sigue contando como prueba de que el insumo se gestiona por lote ⇒ "cualquier fila de lote" es el predicado correcto. |
| 2 | El rechazo ocurre **antes** de mover el agregado | **PASS** | POS: `purchase_view_model.dart:252` (`_resolveLotMetadata`) precede a `:260` (`movementEngine.recordPurchase`). Backend: `inventory-purchase.service.ts:470` (`assertBatchMetadata`) precede a `:505` (`save(PurchaseDocument)`). El test backend lo pincha: `expect(manager.save).not.toHaveBeenCalledWith(PurchaseDocument, expect.anything())`. |
| 3 | Sin regresión del comportamiento previo | **PASS** | Un insumo perecedero sin lote sigue rechazado con el mensaje **exacto** anterior (`inventory-purchase.service.spec.ts:764`, verde). Un insumo no perecedero **sin** lotes sigue comprando sin lote: `requiresBatchTracking` es `false` en preview (`spec.ts` caso nuevo) y los casos preexistentes de compra no perecedera siguen verdes. |
| 4 | El dashboard no puede **deblitar** el requisito | **PASS** | `purchases-form.tsx:107` — `isPerishable \|\| Boolean(preview?.requiresBatchTracking)`: las fuentes se suman, nunca se restan. Con `preview?.requiresBatchTracking ?? isPerishable` los dos tests preexistentes de insumo perecedero **fallaban** (el preview mockeado devuelve `false`), lo que confirma que el OR es la forma segura. |
| 5 | Los tests prueban el invariante | **PASS tras corrección** | El test de rechazo del POS usaba `expect(() => future, throwsA(...))` seguido de `verifyNever(...)`, que corre antes de que el future se resuelva y pasaba sin probar nada. Corregido a `await expectLater(...)`. Los dos tests de widget venan en un solo `testWidgets` con dos `pumpWidget`: el segundo reutilizaba el `State` y nunca reejecutaba `loadInitialData`, así que se separaron en dos tests. |

**Chequeo diferencial:** el único comportamiento previo que comparte el código tocado es "compra perecedera sin lote ⇒ rechazo"; se reejecutó con el código ya cambiado y produce el mismo mensaje (test preexistente sin modificar, verde). La compra no perecedera **sin** lotes conserva su camino (preview `false` + casos preexistentes verdes).

**Limitación declarada:** no hubo verificación en un aparato ni contra la réplica `omnifood_prod_rehearsal`; la evidencia es de pruebas unitarias y de widget. La divergencia que este guard previene se midió en el rig en L57, no aquí.

**Riesgo:** item 1 (integridad de datos: cambia qué compras se aceptan) e item 3 (comportamiento consumido por el POS y el dashboard).

## Verification — edge cases, integración y E2E real

Segunda pasada, con bases de datos reales (no mocks de persistencia).

### Backend contra PostgreSQL real
`apps/admin_backend/src/modules/inventory/inventory-purchase-lot-guard.db.spec.ts` — esquema aislado por test, `synchronize: true`, `InventoryPurchaseService` real con `CostCalculatorService` real. **11/11.** Comando: `npx jest --config ./test/jest-db.json --runInBand src/modules/inventory/inventory-purchase-lot-guard.db.spec.ts`.

| Caso | Qué prueba |
|---|---|
| Preview, no perecedero con un lote | el flag del preview es `true` |
| **Lote con `remaining_stock = 0`** | el predicado cuenta filas, no saldos: un lote consumido sigue forzando lote (`drawBatchOutflow` lo sigue leyendo) |
| Rechazo sin lote | `insumos.stock`, suma de lotes, número de lotes y kardex **no cambian**; 0 documentos de compra |
| Compra con lote | `stock == SUM(batches.remaining_stock)` (la invariante), 2 lotes, 1 documento |
| **Aislamiento por tenant** | los lotes de otro tenant no exigen lote aquí (un `count` sin `tenant_id` devolvería `true`) |
| No perecedero sin lotes | sigue comprando sin lote; 0 lotes creados |
| Perecedero sin lote | mensaje **exacto** anterior, sin cambios |
| El flag del cliente no manda | con lote + cliente diciendo "sin lote", el lote se escribe igual |
| `lotCode` de solo espacios | se trata como ausencia y se rechaza |
| Trimming | el lote se guarda recortado |
| Kardex | `ENTRADA_COMPRA` con la cantidad y el saldo esperados |

### POS contra Floor/SQLite real
`apps/pos_app/test/ui/features/inventory/purchases/purchase_lot_guard_e2e_real_test.dart` — `$FloorAppDatabase.inMemoryDatabaseBuilder()`, `InventoryRepositoryImpl`, `MovementEngineImpl` y `PurchaseViewModel` reales. **8/8.** Comando: `flutter test --concurrency=1 test/ui/features/inventory/purchases/purchase_lot_guard_e2e_real_test.dart`.

| Caso | Qué prueba |
|---|---|
| Rechazo sin lote | stock, saldo de lotes, historial de compras y kardex **intactos** |
| Compra con lote | `stock == SUM(lotes)` (2005), lote persistido, `requiresBatchTracking` en el payload |
| Lote consumido (`remaining = 0`) | sigue exigiendo lote |
| No perecedero sin lotes | compra sin lote permitida, sin lote creado (sin falso positivo) |
| Perecedero sin lote | mensaje anterior preservado |
| **`lotCode` de solo espacios** | rechazado: un `'   '` pasaba el chequeo de ausencia y guardaba un lote ilegible |
| Trimming | se persiste `LOT-TRIMMED`, no el valor crudo |
| **Preview y guardado coinciden** | el preview dice "requiere lote" exactamente cuando el guardado se niega (un preview que dijera que no y un guardado que rechaza deja al operador en un formulario imposible) |

### Integración entre capas
- El POS encola `Purchase.requiresBatchTracking` y `lotCode`; el backend **recalcula** y crea el lote aunque el cliente diga lo contrario (caso "el flag del cliente no manda").
- La regla coincide con el `isBatchManaged` que la nube ya deriva para el terminal (`inbound-sync.service.ts:852` + `fetchLotAvailability`: `SELECT ... FROM batches ... GROUP BY insumo_id`, **sin** filtro de `remaining_stock`). El guard usa por tanto la misma noción de "insumo gestionado por lote" que el resto de la plataforma; no inventa una segunda.

### Totales ejecutados
- POS compras **36/36** (17 view model + 11 widget + 8 E2E real) · `dart analyze` limpio.
- Backend compras **50/50** unit + **11/11** PostgreSQL real · `tsc --noEmit` limpio.
- Dashboard compras **28/28** · `tsc -b --noEmit` limpio.

### Defectos encontrados en esta pasada (corregidos)
1. **`lotCode` de solo espacios pasaba el guard** en POS y backend: el chequeo era de vacío, no de texto en blanco. Un `'   '` cumplía el requisito y guardaba un lote ilegible. Corregido en los dos lados, con trimming del valor persistido.
2. **Fixture incoherente en el primer intento del DB spec**: sembraba un lote sin subir el agregado, es decir un estado ya divergido, y la invariante `stock == SUM(lotes)` no se podía medir. Corregido sembrando un insumo coherente.

### Lo que sigue sin cubrirse
- **Nada en aparato ni contra la réplica `omnifood_prod_rehearsal`**: la evidencia es SQLite real y PostgreSQL real, no el rig.
- **No se ejercita la ruta del dashboard contra su backend real** (Playwright + API): el formulario está cubierto por sus 28 tests con la API interceptada. Queda como paso pendiente si se quiere el circuito completo desde la web.
- **El circuit breaker del paso 3 de `recordPurchase` del backend** (`SERIALIZABLE`) no se ejercita bajo concurrencia real: dos compras simultáneas sin lote sobre el mismo insumo. Riesgo residual bajo (el guard es determinista sobre el conteo), pero no medido.

## Verification — dispositivo real (S23) y los P0 que destapó

`adb install -r` del APK release sobre la app vinculada conservó la vinculación
(`firstInstallTime` intacto). En el aparato se comprobó el guard completo: aviso ámbar en un
insumo NO perecedero con lotes, rechazo sin lote y aceptación con lote (CPP 6.9667 y 8.5000).

La sincronización destapó **tres defectos de la misma familia**: ids locales que viajan a
columnas `uuid` de la nube generados como `millisecondsSinceEpoch`.

| # | Defecto | Estado |
|---|---|---|
| 1 | `recordPurchase` generaba el id de la compra como timestamp ⇒ **toda** compra del POS fallaba el sync con 500 `invalid input syntax for type uuid` y reintentaba en bucle | **Corregido** (`Uuid().v4()` + test de formato) |
| 2 | La outbox de compras hacía `rethrow` ante cualquier fallo ⇒ **una fila inservible bloqueaba todas las compras siguientes para siempre** (bloqueo de cabeza de fila) | **Corregido**: `MovementSyncStateStatus.rejected` + `markMovementAsRejected` + `findUnsyncedPurchases` excluye las rechazadas + un 4xx se registra y **continúa** |
| 3 | `SupplierViewModel.saveSupplier` generaba el id del proveedor como timestamp ⇒ una compra contra un proveedor creado en el terminal fallaba con 500 en la búsqueda del proveedor | **Corregido** (`Uuid().v4()`) — mismo patrón aplicado a `WarehouseViewModel` |

### Backend: 400 en vez de 500

`PurchaseDocumentDto` valida `@IsUUID()` en `id`, `insumoId` y `supplierId`: son columnas `uuid`.
Un 400 dice "el registro está mal", que el terminal puede clasificar como **permanente**; un 500
decía "reintenta", y el terminal reintentaba para siempre.

### Proveedores por el cable (hallazgo menor, tratado)

`InboundSyncSupplierDto` + `suppliers` en las deltas + `fetchSupplierDeltas` (transacción
tenant-bound) + ingesta en el POS (`SupplierDao.insertSuppliers`). `suppliers` se añadió al
conjunto por defecto de `parseRequestedTypes`, porque el POS **no envía** el parámetro `types`.

### Suites

POS compras + master data + sync: **191/191** · `dart analyze` limpio.
Backend inventario + inbound sync + terminal priming + DTO: **`inventory-purchase` 50, DTO 4,
`inbound-sync.service` 76, controlador y priming** — 156+ verdes; `tsc --noEmit` limpio.

### Lo que quedó abierto en el aparato

- El proveedor de la nube (`Distribuidora Cloud E2E`) **no apareció** en el desplegable del
  terminal pese a la delta implementada y al backend reconstruido: falta confirmar si el cursor
  `sinceVersion` lo excluye o si la ingesta no corre. No se cerró como verificado.
- Las tres compras ya registradas en el teléfono (una con id numérico, dos con `supplierId`
  numérico) son **inservibles de origen**: recibirán 400 y quedarán rechazadas. La prueba de
  viaje completo (compra nueva → nube con lote, `stock == SUM(lotes)`, kardex) queda pendiente.
- Fixtures que siguen en el tenant `demo`: insumo `Guard Lote E2E (borrar)` con 2 lotes,
  proveedor `Proveedor` (local) y `Distribuidora Cloud E2E` (nube).

**Riesgo:** item 1 (integridad de datos) e item 3 (contrato del sync: `suppliers` en las deltas).

## Cierre del viaje completo — proveedor, compra, nube (2026-11-13, S23)

### El proveedor sí llega: el defecto era mi fixture, no el código

Diagnóstico temporal en `fetchSupplierDeltas` (revertido después) mostró
`[SUPPLIER_DELTA] since=2026-11-14T00:42:23Z rows=1`: la delta se emitía bien. El proveedor
apareció en `Directorio de Proveedores` del terminal. La causa de la ausencia anterior fue el
**cursor de sincronización**: `sinceVersion` es el instante del pull anterior, y una fila con
`updated_at` *anterior* a ese cursor no se vuelve a emitir nunca (comportamiento documentado
#786; sólo un cambio de build fuerza un re-emit completo). Mi fixture se había creado antes del
cursor del siguiente pull. No es un defecto del producto: es la semántica del delta.

### Viaje completo verificado

Se descartó el fixture envenenado y se creó un insumo perecedero limpio en la nube
(`RT Perecedero E2E (borrar)`, `stock = 0`, sin kardex). Luego, en el dispositivo: compra
`E2E-005`, proveedor de la nube, 3 unidades a NIO 25, lote `LOTE-RT-01` con recepción y
vencimiento. En el mismo ciclo también drenó `E2E-003` (lote `LOTE-E2E-03`).

| Verificación | Resultado |
|---|---|
| `inventory_purchase_documents` | 2 filas, ids **UUID**, `lot_code` correcto (`LOTE-E2E-03`, `LOTE-RT-01`), `quantity` 3 |
| `batches` | 3 filas: `LOTE-E2E-03` 3000, `LOTE-SEMILLA-E2E` 10, `LOTE-RT-01` 3000 |
| `inventory_kardex` | cadena válida: 0→10 (`INITIAL_STOCK`), 10→3010, 0→3000 (`ENTRADA_COMPRA`) |
| `insumos.stock == SUM(batches.remaining_stock)` | **cierto** en ambos insumos (3010 y 3000) |
| Dispositivo vs nube | **coinciden**: el POS muestra 3010.00 G y 3000.00 G tras el pull |
| Outbox | sin POST posteriores ni errores: la cola quedó vacía |

### Hallazgo abierto: un 5xx del servidor sigue bloqueando la cola

`E2E-003` declaraba `stock_before = 10` y la nube tenía el kardex **vacío** para ese insumo
(`stock_before` esperado 0). El trigger `enforce_inventory_kardex_running_balance` lo rechazó
con un error de invariante → **500**. Como 5xx es transitorio, la outbox hacía `rethrow` y
**abortaba la pasada entera**: `E2E-005`, correcta y de otro insumo, no se enviaba mientras
`E2E-003` fallara. Se destrabó insertando el saldo de apertura que faltaba
(`INITIAL_STOCK` 0→10), no cambiando código.

Dos consecuencias que merecen tarea propia:

1. **Robustez de la outbox**: un fallo transitorio de una fila no debería impedir el envío de
   las siguientes de la misma pasada. Propuesta: continuar el bucle, contar los fallos y
   reintentar en el ciclo siguiente en vez de abortar en la primera.
2. **Historia envenenada en campo**: un terminal cuya primera compra quedó rechazada por id
   numérico deja las compras posteriores con `stock_before` que la nube no puede encadenar; no
   se arreglan solas. Hace falta una ruta de reparación (saldo de apertura o descarte auditado),
   no un simple reintento.

### Limpieza: no es seguro borrar sólo la nube

Los insumos y el proveedor están referenciados por las dos compras ya sincronizadas y, sobre
todo, **el dispositivo los sigue listando**: las deltas no llevan tombstone, así que borrarlos
en la nube dejaría al terminal ofreciendo insumos que la nube rechazaría con 500 en la próxima
compra — exactamente el bloqueo que acabamos de destrabar. Quedan como ruido inerte en el
tenant `demo`: ambos insumos tienen 0 mapeos a productos, así que no se pueden vender.
Orden correcto si se quiere limpiar: dispositivo primero (ajuste de stock a 0 y borrado en
`Ítems`/`Proveedores`), después la nube.
