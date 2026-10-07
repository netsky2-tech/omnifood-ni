# Factura con nombre — datos fiscales del cliente en la venta

**Origen:** pregunta del cliente en la entrega del equipo — *"por defecto es cliente contado, pero si alguien
le pide la factura con nombre, debería de poder imprimirla así"*.
**Estado:** IMPLEMENTADO y VERIFICADO en rama `feat/factura-con-nombre`.
**Decisor:** dueño del producto (tres decisiones tomadas, ver abajo).

---

## 0. Modelo reconciliado — snapshot fiscal vs. catálogo de clientes

Acá hay **dos cosas distintas** y el plan original las mezclaba. La observación del dueño del producto —*no todo
cliente nombrado pertenece al catálogo*— es la que ordena el diseño.

**1. Los datos fiscales que el comprobante imprimió**, guardados **en la factura**. Esto **no es duplicar**: es
el patrón correcto para un documento fiscal, y el código ya lo usa. `invoice_item_modifiers` guarda el
modificador con su nombre y su precio deliberadamente **sin** vínculo al producto, porque un comprobante emitido
no puede cambiar retroactivamente si el producto se renombra o cambia de precio. Con el receptor pasa lo mismo:
**la factura debe conservar lo que imprimió**.

**2. El catálogo de clientes**, entidad reutilizable, con la **fidelidad** colgando de ella. Ahí va **sólo lo que
vale la pena recordar**. Alguien puede pedir la factura a su nombre y no volver nunca: ese dato es
**descartable** y no debe ensuciar el catálogo.

### Reglas

| Pieza | Qué es | Cuándo se llena |
|---|---|---|
| `invoices.customer_name` / `customer_tax_id` | **snapshot fiscal** de lo impreso | cuando la venta fue nominada; `NULL` si fue anónima |
| `invoices.customer_id` | **vínculo opcional** al catálogo | sólo si la venta se asoció a un cliente registrado |
| Catálogo de clientes + fidelidad | entidad reutilizable | sólo si el operador decide guardarlo, o si ya existe |

- **Nunca crear un cliente automáticamente** a partir de un nombre escrito en el cobro. Guardarlo es una decisión
  **explícita** («guardar como cliente»), no un efecto secundario de facturar. Ése es el error que hay que evitar:
  llenar el catálogo de nombres descartables.
- Venta anónima → `customer_name IS NULL`, y **el ticket imprime `Cliente: Contado`** por regla de
  presentación, no por dato guardado. Así la consulta «ventas anónimas» queda limpia y no se mete texto falso
  en la base.
- La fidelidad cuelga de `customer_id`, que es `NULL` en el caso descartable: correcto — no acumula y no ensucia.
- Un dato fiscal por separado: la cédula/RUC puede venir sola o con el nombre, según pidió el cliente (hay quien
  necesita la cédula para deducir el gasto en su empresa).

### Nota de arquitectura: Programa de Lealtad (nhilos loyalty points)
Con la asignación de cliente se acumula el punto/visita o lo que el programa de fidelización tenga configurado (Slice 14.3 / `LoyaltyService`), así como la captación futura mediante lectura de QR o código digitado. Aunque el motor de lealtad no se altera en este bloque, las interfaces y adaptadores del POS y de cobro deben mantener explícita la distinción:
- Si se asigna un cliente registrado (por búsqueda, escaneo de QR o código), la venta recibe su `customer_id` (para acumulación/redención de lealtad) **y** pre-carga el snapshot fiscal (`customerName`, `customerRuc`).
- Si se ingresan datos fiscales ad-hoc en el checkout (`Nombre Cliente`, `RUC/Cédula`), se puebla únicamente el snapshot fiscal de la factura, dejando `customer_id = NULL` para no generar clientes espurios en el ledger de puntos.
- Los adaptadores e interfaces quedan preparados para que la capa de fidelización opere limpiamente sobre `customer_id`.

---

## 1. Decisiones tomadas

| # | Pregunta | Elegido |
|---|---|---|
| 1 | ¿La normativa exige RUC/cédula, o alcanza el nombre? | **Ambos soportados, cada uno opcional por separado.** Hay clientes que quieren sólo el nombre, y clientes que necesitan nombre + cédula/RUC para deducir el gasto en su empresa |
| 2 | ¿Qué imprime una venta de contado sin nombre? | **`Cliente: Contado` explícito** |
| 3 | ¿Hay que guardarlo? | **Sí, en la factura** |

## 2. Estado verificado (anoche, en el S23)

**La parte de impresión NO está construida — corrección importante.** El *modelo* del documento soporta los dos
datos, pero **el camino de impresión no los recibe**:

- `printer_port.dart:57` — `printInvoice(...)` **no tiene parámetro de cliente**, y ninguno de los adaptadores
  (`ipos`, `sunmi`, `mock`) pasa un nombre: todos llaman sólo `fromInvoice`.
- `receipt_document.dart:427-435` — `customerName` **cae al `invoice.customerId`** cuando no hay nombre.
- `receipt_layout_formatter.dart:1799-1800` — la línea `'Cliente:'` imprime **el id crudo**.
- `sales-export.service.ts:239` — `customerName: inv.customerId || 'CONSUMIDOR FINAL'`: **el export del dueño
  imprime un UUID** como nombre de cliente.

O sea: **hoy el nombre escrito en el cobro no llega al papel**, y cuando hay `customerId` el ticket imprime el
identificador. Es la misma familia que el R-18 y el D-14: un id donde va el nombre de una persona.

Lo que sí existe y sirve: el documento y el formateador saben renderizar `Cliente:` y `RUC/Cedula:` con manejo
honesto del vacío (`:453-457`, `:924-927` — *"never print 'Cliente: N/A'"*), y `invoice_fiscal_calculator.dart:445`
ya recibe `customerName`. Falta conectarlos.

**Y el vínculo opcional ya tiene precedente en el código**: `invoice_item_modifier_entity.dart:4-26` guarda
`name` y `extra_price` con FK **sólo** al ítem de factura, sin vínculo al producto. Es exactamente el patrón de
snapshot que se propone acá, y confirma que es la convención del proyecto.

**La captura está a medias.** El cobro tiene el campo **`Nombre Cliente`** al lado del número de buzzer
(`multi_currency_checkout_dialog.dart:470-472`), precargado desde `vm.customerName` (`:79-80`), y lo pasa a la
venta en `:269` y `:322`. **No hay campo para el RUC/cédula**, aunque el ticket sepa imprimirlo.

**Y no se persiste en ningún lado.** La única columna de cliente en una factura, en el dispositivo **y** en la
nube, es `customer_id`. `sync-invoice.dto.ts` no lleva el nombre. Consecuencia: **una factura con nombre hoy es
un artefacto de papel** — no se puede reimprimir con el nombre, ni reportar para quién fue, ni mostrarla en el
panel del dueño.

**Detalle encontrado de paso:** `fulfillment_execution_service.dart:169` usa `customerName: tableName`, o sea
el nombre de la mesa como nombre de cliente en fulfillment. Conviene saberlo antes de tocar el campo.

## 3. Por qué importa

La respuesta honesta a *"¿puedo imprimir la factura con nombre?"* es **sí, se imprime**, con la advertencia de
que el sistema no registra que fue nominada. Es una respuesta distinta de *"sí, está soportado"*, y de esas
diferencias salen los reclamos de después: *"¿por qué no puedo reimprimir la factura que le hice a nombre
del cliente?"*.

## 4. Plan por tareas

### T1 · Dominio y base local (Completado — Commit `5d23f270`)
- [x] `customerName` y `customerTaxId` en la entidad de factura del dispositivo + migración 64->65 de Floor (`AppDatabase` v65).
- [x] Escribirlos en el camino de venta (`processSale`) desde el cobro.
- [x] Regla: **cada uno puede venir solo**; nombre sin cédula es válido, cédula sin nombre también.
- [x] Preservación de columnas en `SalesRepositoryImpl` (`_copyInvoiceEntity`, `voidInvoice`, `markAsFailed`).

### T2 · Nube (Completado — Commit `d937006f`)
- [x] Columnas `customer_name` y `customer_tax_id` en `invoices`, con migración TypeORM `1809590000000-AddCustomerSnapshotToInvoices.ts`.
- [x] Llevarlas en el DTO de sync de facturas (`SyncInvoiceDto`) y en la ingestión (`InvoicesService`).
- [x] Exponerlas en los reportes que ya usan la factura (`SalesExportService`), priorizando snapshot sobre `customerId`.

### T3 · Impresión — acá está el trabajo real (Completado — Commit `17aa84e4`)
- [x] Agregar `customerName` y `customerRuc` a `printInvoice` (`printer_port.dart:57`) y pasarlos en los tres
      adaptadores (`ipos`, `sunmi`, `mock`, `unavailable`).
- [x] **Dejar de imprimir el UUID**: `receipt_document.dart` y `receipt_layout_formatter.dart` no caen al `customerId`.
- [x] **Mismo arreglo en el export del backend**: `sales-export.service.ts` usa el nombre snapshot y su fallback de texto.
- [x] `Cliente: Contado` cuando no hay nombre ni cédula (DGI compliance decision 2).
- [x] `Cliente: <nombre>` y `RUC/Cedula: <dato>` cuando corresponda, cada uno independiente.
- [x] Actualizar tests de formato: 56/56 en `receipt_layout_formatter_test.dart` y 152/152 en `test/domain/services/printer/`.

### T4 · Interfaz (Completado — Commit `1dfec203`)
- [x] Campo **RUC/Cédula** en el cobro (`checkout_customer_tax_id_input`), junto al de nombre.
- [x] Precarga de ambos desde un cliente registrado cuando se usa ASIGNAR CLIENTE.
- [x] Validación de carácter (capitalización automática), sin imponer formato rígido y opcional.

### T5 · Verificación integral y tests (Completado — Commit `4c6ea16e`)
- [x] Venta sin nombre → el ticket dice **`Cliente: Contado`** y guarda `null`.
- [x] Venta con nombre → dice el nombre, y **no** imprime RUC.
- [x] Venta con nombre + cédula → imprime los dos.
- [x] Cliente registrado → pre-carga snapshot, vincula `customerId` para lealtad y **NUNCA imprime el UUID**.
- [x] Las facturas quedan **guardadas** con sus datos y se pueden reimprimir reproduciendo el snapshot exacto.
- [x] Tests unitarios y de integración: 10/10 en `multi_currency_checkout_dialog_test.dart`, 5/5 en `named_invoice_integration_test.dart`, 490/490 en backend `src/modules/sales`.

## 5. Riesgos y preguntas abiertas

- **Es un documento fiscal.** Cambiar la salida del ticket toca algo que ya se validó con DGI en mente. La
  línea de cliente no debe alterar el correlativo, el total ni el desglose de impuestos.
- **La impresión física nunca se probó** (no salió ni un ticket por impresora en todo el ensayo). T3 se puede
  verificar por el formateador y por el preview; la confirmación en papel depende de que haya impresora.
- **Terminología: hay dos palabras para lo mismo.** El cliente dijo *"cliente contado"*; la interfaz ya tiene
  una acción **"Consumidor Final (Sin Cliente Asignado)"** (`customer_select_dialog.dart:380-395`) y el export
  usa `'CONSUMIDOR FINAL'`. Hay que elegir **una** y usarla en la interfaz, el ticket y los reportes.
- **`customer_id` y nombre ad-hoc juntos**: qué pasa si se asigna un cliente registrado **y** se escribe un
  nombre a mano. Propuesta: el registrado manda y el campo manual sólo se usa sin cliente asignado.
- **El RUC no es único ni obligatorio en ningún lado** (`customer.entity.ts:15` índice no-único; migración sin
  `isUnique`). Como nada crea clientes desde transacciones, no hay riesgo inmediato de colisión, pero conviene
  saberlo: dos clientes con la misma cédula son posibles hoy.

## 6. Defectos encontrados durante el mapeo (registrar y arreglar de paso)

**D-1 · Un cliente creado en la terminal nunca sincroniza.** Existe el alta rápida
(`sale_view_model.dart:527-556` vía `customer_select_dialog.dart:207-241`), pero **no hay sync de salida de
clientes**: queda `syncStatus: 'pending'` para siempre y no hay ninguna ruta de clientes entre los `POST` del
servicio de sync. Ese cliente vive sólo en ese aparato: invisible para la nube, para el panel del dueño y para
cualquier otra terminal. Es exactamente la familia de la divergencia silenciosa (R-15, R-16, el editor del BOH).

**D-2 · Se imprime el UUID como nombre de cliente.** `receipt_document.dart:427-435` cae al `customerId`,
`receipt_layout_formatter.dart:1799-1800` imprime el id crudo y `sales-export.service.ts:239` hace lo mismo en
el export. Familia R-18 / D-14: un identificador donde va el nombre de una persona.

**D-3 · No hay pantalla para editar un cliente.** `CustomerDao.updateCustomer` (`customer_dao.dart:41`) no
tiene llamadores fuera del código generado, y en el panel del dueño tampoco hay alta ni edición de clientes
(sólo ajuste de puntos). Un cliente mal cargado no se puede corregir.

## 7. Ronda de verificación externa (post-implementación)

Se corrió un verifier **read-only** sobre el diff completo contra `main`, con foco explícito en que la geometría
milimétrica del ticket de SOHO no se moviera. Veredicto: geometría **intacta** (ninguna línea supera 32 col en
58 mm ni 40 col en 80 mm, grilla de ítems e indentación colgante de 4 espacios sin tocar) y dos defectos reales
que mi pasada por T3 no cubrió:

**V-1 · D-2 quedó a medias en el export (ALTO).** `sales-export.service.ts` seguía con
`customerName || (customerId || 'CONSUMIDOR FINAL')`. Como la migración deja `customer_name` en `NULL` en todo
el histórico, cualquier factura vieja con cliente registrado exportaba su **UUID interno** al libro de ventas
DGI. Arreglado en `3a05c8ef`: los nombres legacy se resuelven contra el catálogo `customers` **dentro de la
misma** `runInTenantTransaction` (una unidad lógica de lectura, sin segunda transacción, sin dependencias nuevas
de DI, y la lectura queda atada por RLS como la de invoices, issue #581 WU1). Precedencia: snapshot propio de
la factura → nombre del catálogo → `'CONSUMIDOR FINAL'`. El `customerId` no puede llegar a ningún formato.

**V-2 · La etiqueta `Cliente:` se truncaba en el path de lealtad ESC/POS (MEDIO).** `formatInvoiceEscPos` usaba
`formatTwoColumns`, que recorta la **etiqueta izquierda** cuando el valor es largo: a 58 mm un nombre de 24–31
caracteres imprimía `Cliente` / `Client` / sin etiqueta, y un RUC de 20–31 hacía lo mismo con `RUC/Cedula:` (a
80 mm: 32–39 y 28–39). Sin cobertura de tests. Arreglado en `fb694dc2`: sólo esas dos emisiones
pasaron al idiom `formatKeyValue` (etiqueta intacta, valor con wrap bajo indentación de 2 espacios). Los tests
nuevos **prueban el defecto antes de probar la reparación**: afirman que `formatTwoColumns` sigue recortando la
etiqueta en la banda exacta de ancho, y recién después que el ticket la conserva.

> **Lección de esta ronda:** un fixture de test mal elegido hace que una aserción pase **vacía**. El primer
> intento usó un nombre de 34 caracteres para 58 mm; como `formatTwoColumns` deriva a la rama lossless cuando el
> valor supera el ancho, ese test pasaba también antes del fix y no ejercitaba nada. Las bandas hay que
calcularlas por ancho de papel, no inventarlas.

**D-2 en el ticket impreso: cerrado.** `receipt_document.dart` ya no cae al `customerId` y el escenario 4 de la
integración afirma que el UUID no aparece en el papel.

### Decisión de diseño confirmada (no es defecto)

El verifier marcó que la venta anónima no imprime `Cliente: Contado` **adyacente**, sino `Cliente:` + relleno +
`Contado` alineado a la derecha. Es el estilo de casa de **todos** los key-value del documento (`Fecha:`,
`Atendido por:`, `SUBTOTAL:`, `IVA:`), que pasan por `formatKeyValue → formatTwoColumns`. Moverlo a la izquierda
sería alterar la geometría aprobada, así que se deja y en su lugar se **fija el contrato**: el escenario 1 exige
exactamente una línea que case `^Cliente:\s+Contado$`. Si alguien lo mueve, rompe el test.

### Follow-ups (preexistentes, ajenos a este cambio, no tocados)

- **FU-1 · Cabecera de grilla de ítems en 80 mm = 48 columnas en papel de 40.** En `formatInvoiceEscPos`, la rama
  `maxCols > 38` arma `'CANT'(4) + 'DESCRIPCION'(22) + 'P.UNIT'(10) + 'TOTAL'(12)`. Existe en el código heredado
  y se dejó intacto porque la grilla está fuera de la superficie aprobada acá; por eso el test de 80 mm mide el
  ancho **sólo sobre el bloque de cliente**. Decisión pendiente del dueño.
- **FU-2 · `Atendido por:` sufre la misma truncación de etiqueta** (13 caracteres) con cajeros largos, por la
  misma razón (`formatTwoColumns`). Es preexistente y lo posee otro trabajo.
- **FU-3 · Divergencia de término** (sección 5): `Contado` en el ticket vs `CONSUMIDOR FINAL` en el export vs
  `Consumidor Final` en la interfaz. Sigue sin resolver; requiere una decisión del dueño, no del código.
- **FU-4 · D-1 y D-3 siguen abiertos** (sync de clientes de alta local, y falta de pantalla de edición).

### Estado de verificación final de esta rama

| Suite | Resultado |
|---|---|
| POS `test/domain/services/printer/` | 154/154 |
| POS `test/ui/features/sales/` + `test/data/repositories/sales/` + `test/presentation/features/sales/` | 614/614 |
| POS `flutter analyze` | sin issues |
| Backend `npm test` (completo) | 3687/3687 (8 skipped preexistentes) |
| Backend `tsc --noEmit` | exit 0 |
| POS `flutter test` (suite completa, ~3200) | 3196 pasan + 2 fallos de **carga** (`Unable to connect to flutter_tester process: WebSocketException`) |

Sobre el último punto: los archivos que fallan **cambian entre corridas** (primero 3, después 2 distintos), el
error es de conexión al proceso `flutter_tester` y **los cinco pasan al correrlos aislados**. Es flakiness del
runner en paralelo bajo 3000+ tests en un host sin display, no una regresión de este diff. Ninguno de esos
archivos toca impresión ni datos de cliente.

## 8. Ronda de revisión adversarial por slices y remediación

Como el candidato nativo queda fijado al rango completo de la rama (`inspect` ofrece un único START
`base-ref=39c54130 → HEAD`, 46 paths con ~2.9k líneas generadas), la carga de revisión se **partió en tres
slices por unidad de trabajo** con judges read-only (`jd-judge-a`), cada uno atacando solo sus commits. Esto
tampoco es la revisión nativa: es revisión con autoridad humana al mando; entrega y commits siguen la política
normal del repo.

| Slice | Commits revisados | Hallazgos |
|---|---|---|
| A · persistencia | `5d23f270`, `d937006f` | 1 CRÍTICO, 1 CRÍTICO (ya resuelto fuera de slice), 2 WARNING, 1 SUGGESTION |
| B · impresión | `17aa84e4`, `fb694dc2` | 2 MEDIUM, 4 SUGGESTION |
| C · UI + tests + export | `1dfec203`, `4c6ea16e`, `3a05c8ef` | 1 HIGH, 5 WARNING, 3 SUGGESTION |

### Defectos confirmados y arreglados

**R-1 · CRÍTICO · el feature rompía la idempotencia del sync cross-version.** `SalesMapper.toSyncJson` emitía
`customerName`/`customerTaxId` **incondicionalmente**, así que toda venta anónima empezó a serializar
`"customerName": null`. El recibo de idempotencia se calcula con `stableStringify`
(`invoices.service.ts:136-143`), que descarta `undefined` pero **conserva `null`**, y el outbox re-serealiza la
entidad en cada reintento (`getUnsyncedAggregates`). Una venta ya receiptada con la forma vieja, reintentada tras
el upgrade del POS con ack perdido, hash distinto → `CRITICAL_PAYLOAD_MISMATCH` con `retryable: false` → la
factura fiscal **nunca llega al espejo de nube**. Es la familia D-10 que el propio método documenta.
Arreglado en `b72a7506`: emisión **condicional** (clave ausente si el valor es null/blank), siguiendo el
precedente hash-seguro que ya existe en el mismo mapa (`originInvoiceId`, `inventoryPolicyVersion`). El hash del
backend se dejó intacto a propósito: filtrar `null` ahí re-hashearía todos los recibos existentes de
`voidReason`/`shiftId`/`tipAmount*` y provocaría un mismatch masivo.

**R-2 · ALTO · mi propio fix del export podía tumbar el libro de ventas DGI.** `In(unresolvedIds)` comparaba
`customers.id` (**uuid** PK, `1789000000000:10-15`) contra `invoices.customer_id` (**varchar**, sin FK y sin
validación, `1759000000002:393`). Postgres castea cada literal a uuid: cualquier `customer_id` legacy no-UUID en
el rango lanza `22P02` y **aborta el export completo**. Peor todavía: mis fixtures (`cust-uuid-1234`,
`cust-uuid-0000-0001`) **no son UUID válidos**, o sea el test pasaba con exactamente el input que revienta
producción. Arreglado en `8f886cbf`: comparación como texto (`customer.id::text IN`), predicado `tenant_id`
apto (binding aditivo, nunca cross-tenant), fixtures con UUIDv4 reales.

**R-3 · MEDIA · dependencia dura dentro de la transacción.** La lectura del catálogo estaba dentro de la misma
`runInTenantTransaction` que la lectura de invoices: tabla movida, falta de grant o error de RLS mataban un
export que antes funcionaba. Un `try/catch` adentro no alcanza porque Postgres aborta la transacción tras un
statement error. Arreglado en `8f886cbf` con **SAVEPOINT** (`customer_snapshot_resolution`) que se libera o se
revierte, degradando a `CONSUMIDOR FINAL` con log code estable
`CUSTOMER_SNAPSHOT_RESOLUTION_DEGRADED`. Se preserva el invariante #581 WU1: una transacción, un `set_config`.

**R-4 · MEDIA · `''` y espacios llegaban a la fila fiscal.** `@IsString() @IsOptional()` acepta blank y la
ingestión lo escribía verbatim, rompiendo "venta anónima guarda `customer_name IS NULL`". Arreglado en
`13045cd2`: normalización trim/blank→null en el DTO y en la frontera de persistencia. **Nunca se rechaza el
payload**: una venta fiscal no puede bloquearse por un campo opcional vacío.

**R-5 · MEDIA · herencia de snapshot en nota de crédito sin ningún test.** Implementada en ambos lados
(`sales_repository_impl.dart` ~:1036, `invoices.service.ts` ~:414-415) pero sin cobertura: una regresión que la
anulara pasaba verde. Arreglado en `dc712ca9`.

**R-6 · MEDIA · el centinela `N/A` sí llegaba al papel.** Tres reglas convivían: los caminos primarios
comparaban `!= 'N/A'` case-sensitive, el legacy texto comparaba `toUpperCase()`, y el `customerName` **explícito**
no se filtraba en ningún lado. Verificado con RED: `CLIENTE:                     N/A` impreso. Arreglado en
`80fbdc21` con `isPrintableCustomerValue` como regla única en los cuatro caminos más el modelo.

**R-7 · MEDIA · etiquetas truncadas en el path de lealtad ESC/POS** (`formatTwoColumns` recorta la etiqueta
izquierda cuando el valor es largo) y **guard `N/A` sin `trim()`** en `receipt_document.dart`. Arreglado en
`80fbdc21`.

**R-8 · MEDIA · borrar el RUC pre-cargado de un cliente registrado era ignorado.** El dialog mandaba `null` y el
VM caía de vuelta a `_selectedCustomer.taxId`, re-persistiendo el valor del catálogo: no se podía hacer una
factura a nombre de un registrado **sin** su RUC. Arreglado en `2d7dafa0` con tri-state en la frontera de cobro
(`null` = no provisto → prefill; `''` = borrado explícito → sin tax id; no-empty = verbatim), en pago simple y
dividido.

**R-9 · MEDIA · los tests de integración daban falsa confianza.** `saveSale` y `prepareReprintInvoice` estaban
mockeados, así que "persiste" solo probaba que el ViewModel pasó el campo y el escenario de reimpresión pasaba
también con el feature revertido. Arreglado en `7e94e363` con grupos reales sobre Floor
(`sqflite_common_ffi`): round-trip por el DAO real, void que preserva el snapshot, y procedencia de reimpresión
falsificable (se renombra el catálogo y se cambia la config **después** de emitir; el papel sigue con el snapshot
original).

### Decisión de producto tomada en esta ronda

**Vendido con RUC/cédula y sin nombre → se OMITE la línea `Cliente:`.** La decisión 2 decía "sin nombre →
`Cliente: Contado`", lo que producía el par contradictorio `Cliente: Contado` + `RUC/Cedula: <id>`. El dueño elige
omitir la línea de presentación cuando sí hay dato fiscal. `Cliente: Contado` queda reservado para venta
verdaderamente anónima (ni nombre ni cédula). Implementado en los cuatro caminos de render (`80fbdc21`).

### Rechazado con evidencia

- **`down` no-op de la migración.** Un judge lo marcó como contrato de revert roto. Es **convención deliberada
del repo**: la hermana `1809400000000-AddShiftIdAndLocalIssueDateToInvoices.ts:27-32` usa el mismo `SELECT 1` con
la misma justificación DGI (las facturas no se destruyen). Se **asserte** el comportamiento en el nuevo
`.db.spec.ts`, no se cambia.
- **"los loading errors de Flutter son flakiness" como explicación final.** Se intentó y se descartó: no hay
variables de proxy en el entorno, la memoria estaba holgada (9 Gi disponibles) y persisten con
`--concurrency=1`. Quedan characterizados, no resueltos: cambian de archivo en cada corrida, son de carga
(`WebSocketException: Invalid WebSocket upgrade request` al conectar con `flutter_tester`) y **cada archivo que
falla pasa al correrlo aislado**, incluidos los dos de esta ronda (`fiscal_inbox_handler` 47/47,
`loyalty_evaluation` 5/5). Ninguno toca este feature. Lección metodológica: un "falla aislado" debe verificar la
**ruta** antes de afirmarse — mi primer intento usó `domain/services/loyalty` en vez de `domain/models/loyalty` y
el fallo era inexistente.

### Coste ambiental de la ronda (WSL)

Las corridas completas de backend reventaban el VM. `.wslconfig` fija `memory=12 GiB` y `swap=4 GiB` sobre un
host de 24 GB; jest con 11 workers sobre 329 suites de NestJS supera el techo y el kernel mata procesos por OOM
global (`global_oom` en `/var/log/kern.log`) — entre ellos **`engram`, el servidor de memoria de esta sesión**,
que es por lo que los tool calls devolvían `No result provided`. Receta de trabajo: `npx jest --maxWorkers=2`
(3694/3694, pico ~1.5 Gi) y `flutter test --concurrency=2` por bloques.

### Estado final de la rama

| Suite | Resultado |
|---|---|
| POS full (`--concurrency=2`) | 3176 pasan + 2 fallos de carga intermitentes (pasan aislados) |
| POS `flutter analyze` | sin issues |
| Backend `npm test` full (`--maxWorkers=2`) | **3694/3694** (8 skipped preexistentes) |
| Backend `tsc --noEmit` | exit 0 |
| Backend migration `.db.spec.ts` sobre Postgres real | **3/3** (nuevo en `dc712ca9`) |

Commits de remediación: `b72a7506`, `80fbdc21`, `2d7dafa0`, `7e94e363`, `8f886cbf`, `13045cd2`, `dc712ca9`.
