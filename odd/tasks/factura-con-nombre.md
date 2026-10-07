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
