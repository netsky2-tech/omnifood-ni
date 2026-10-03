# Factura con nombre — datos fiscales del cliente en la venta

**Origen:** pregunta del cliente en la entrega del equipo — *"por defecto es cliente contado, pero si alguien
le pide la factura con nombre, debería de poder imprimirla así"*.
**Estado:** diseño aprobado, implementación no iniciada.
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

**No implementar T1 en adelante hasta que llegue el mapeo de clientes y fidelidad.** Hay una hipótesis concreta a
confirmar: si el catálogo se construye en algún lado a partir de nombres de transacciones, el problema es más
grande que esta funcionalidad y conviene saberlo antes de escribir código.

---

## 1. Decisiones tomadas

| # | Pregunta | Elegido |
|---|---|---|
| 1 | ¿La normativa exige RUC/cédula, o alcanza el nombre? | **Ambos soportados, cada uno opcional por separado.** Hay clientes que quieren sólo el nombre, y clientes que necesitan nombre + cédula/RUC para deducir el gasto en su empresa |
| 2 | ¿Qué imprime una venta de contado sin nombre? | **`Cliente: Contado` explícito** |
| 3 | ¿Hay que guardarlo? | **Sí, en la factura** |

## 2. Estado verificado (anoche, en el S23)

**La parte de impresión ya está construida.** El ticket sabe imprimir los dos datos:

- `receipt_document.dart:201/264/311-312/353` — el documento lleva `customerName` **y** `customerRuc`.
- `receipt_layout_formatter.dart:453-457` — *"Only display customer fields if actual data exists (never print
  'Cliente: N/A')"*; imprime `Cliente:` y `RUC/Cedula:` sólo cuando hay dato. Hay un segundo bloque de formato
  que hace lo mismo en `:924-927`.
- `printer_port.dart:75` — un comentario registra que *"this port previously dropped customerRuc"*: acá ya se
  arregló algo una vez, o sea que la zona es sensible.
- `invoice_fiscal_calculator.dart:445` — `customerName` entra al calculador fiscal.

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

### T1 · Dominio y base local
- [ ] `customerName` y `customerRuc` en la entidad de factura del dispositivo + migración de Floor.
- [ ] Escribirlos en el camino de venta (`processSale`) desde el cobro.
- [ ] Regla: **cada uno puede venir solo**; nombre sin cédula es válido, cédula sin nombre también.

### T2 · Nube
- [ ] Columnas `customer_name` y `customer_ruc` en `invoices`, con migración.
- [ ] Llevarlas en el DTO de sync de facturas y en la ingestión.
- [ ] Exponerlas en los reportes que ya usan la factura, para que el dueño vea para quién fue.

### T3 · Impresión
- [ ] **`Cliente: Contado`** cuando no hay nombre ni cédula (hoy el bloque se omite en silencio).
- [ ] `Cliente: <nombre>` cuando hay nombre.
- [ ] `RUC/Cedula: <dato>` cuando hay dato, con o sin nombre.
- [ ] Revisar y actualizar los tests de formato del ticket: **es un documento fiscal**, cualquier línea nueva
      es un cambio visible para DGI y no puede romper lo que ya se validó.

### T4 · Interfaz
- [ ] Campo **RUC/Cédula** en el cobro, junto al de nombre.
- [ ] Precarga de ambos desde un cliente registrado cuando se usa ASIGNAR CLIENTE.
- [ ] Validación de carácter, sin imponer formato (cédula y RUC tienen largos distintos) y sin bloquear la
      venta por un dato inválido: el cliente pidió que sea **opcional**.

### T5 · Verificación en aparato
- [ ] Venta sin nombre → el ticket dice **`Cliente: Contado`**.
- [ ] Venta con nombre → dice el nombre, y **no** imprime RUC.
- [ ] Venta con nombre + cédula → imprime los dos.
- [ ] Las tres quedan **guardadas** con sus datos y se pueden reimprimir igual.
- [ ] Ver el dato del lado del dashboard.

## 5. Riesgos y preguntas abiertas

- **Es un documento fiscal.** Cambiar la salida del ticket toca algo que ya se validó con DGI en mente. La
  línea de cliente no debe alterar el correlativo, el total ni el desglose de impuestos.
- **La impresión física nunca se probó** (no salió ni un ticket por impresora en todo el ensayo). T3 se puede
  verificar por el formateador y por el preview; la confirmación en papel depende de que haya impresora.
- **`customer_id` y el nombre ad-hoc conviven**: hoy son caminos distintos. Hay que definir qué pasa si se
  asigna un cliente registrado **y** se escribe un nombre a mano. Propuesta: el registrado manda, y el campo
  manual sólo se usa sin cliente asignado. Confirmar antes de T4.
- **"Cliente: Contado"** es texto nuevo en un comprobante: conviene confirmar la redacción exacta que espera el
  contador del cliente.
