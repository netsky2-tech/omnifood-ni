# T5 — Ticket print: extras debajo del item en letra una talla menor

**Fecha**: 2026-10-06 · **Estado**: planificación
**Origen**: pedido explícito del usuario durante T4.3b (S23). Scope decidido por el usuario:
**todas las impresoras** — ESC/POS (Sunmi) + vista previa + iPOS/Nyx (path de texto con
ajuste del handler nativo).

## Requisito

Al imprimir el ticket, los extras/modificadores de cada producto van **justo debajo del
item, en una talla de letra una unidad menor** (estilo estándar de la industria),
**sin alterar el diseño actual** — dimensiones, márgenes, anchos de columna y tamaño de
papel están calculados al milímetro.

## Verdades del código (scout mux4noep-1-vplj, 2026-10-06)

- Los modificadores **ya se imprimen en línea propia bajo el item**: `receipt_layout_formatter.dart:527-534`
  (texto) y `:993-1000` (ESC/POS) → `wrap('  + $mod', contentWidth, '    ')`. El delta real
  es **sólo la talla de letra**.
- Fuente de contenido: `ReceiptModifierDisplay.printableText` (`receipt_document.dart:25-30`)
  — imprimir verbatim (`displayAmount` no se re-multiplica, doc `receipt_document.dart:7-8`).
- ESC/POS: `EscPosFontSize` (`esc_pos_builder.dart:6`, comando `GS !` en `:53-68`) es
  **grow-only** — hace falta una vía de talla menor (mecanismo estándar del stack; el AIDL
  Sunmi `printTextWithFont` y `PrintTextFormat.textSize` existen).
- Path de texto iPOS/Nyx: **un blob por job** (`ipos_printer_adapter.dart:165,196`);
  `IPosPrinterHandler.kt:204-213` fija `textSize=24`; AIDL `printText(text, fontSize, …)`.
  Sin control por línea ⇒ hay que **partir el trabajo por talla** (runs) y pasar el tamaño
  por llamada, cuidando no inyectar ni perder saltos de línea.
- Comanda cocina ESC/POS **pierde la cantidad**: `receipt_58mm_formatter.dart:315-317`
  hardcodea `'   * [MOD] ${mod.name}'`; la vía texto usa `[MOD] 2x …`
  (`kitchen_modifier_lines.dart:16-21`, testeado en `kitchen_modifier_print_test.dart:41-44`).
  → corregir esta divergencia en la unidad A (defecto, autoridad = tests existentes).

## Invariantes NO tocables

- `formatItemRow` (`receipt_layout_formatter.dart:166`), `formatTwoColumns` (`:115`),
  `wrap` (`:310`), constantes de `receipt_layout_metrics.dart` (32/40 cols, `:9-10`, `:54-82`).
- Orden de bloques (items → modificadores → descuentos → notas) y ≤32/40 caracteres por línea.
- `ReceiptModifierDisplay.printableText` sigue siendo la fuente del string.
- Suites autoridad (deben quedar verdes sin reescribir aserciones de layout):
  `receipt_layout_formatter_test.dart`, `thermal_receipt_completion_test.dart`,
  `receipt_modifier_quantity_test.dart`, `kitchen_modifier_print_test.dart`,
  `receipt_58mm_formatter_test.dart`.

## Mandato de alcance (usuario, 2026-10-06 — decisión final)

1. **Sólo iPOS/Nyx** — es la impresora del terminal en producción (el ya entregado y
   probado). No se da soporte a hardware que no tenemos: ESC/POS/Sunmi y la divergencia
   D3 de comanda ESC/POS quedan **fuera de scope** hasta que exista un dispositivo real.
   Si llega otro equipo, se adapta entonces.
2. T0 (auditoría) concluída: **Nyx SÍ soporta talla menor por llamada** —
   `PrintTextFormat.textSize` (hoy clavado en 24 en `IPosPrinterHandler.kt:207`, y
   `NyxPrintProfile.receipt80mm.createFormat()` para 80mm) y AIDL
   `printText(text, float fontSize, …)`. Cambio = dejar de hardcodear, no invención.
3. Riesgo de diseño a controlar: al fraccionar el blob en runs por tamaño, los saltos de
   línea deben ser EXACTAMENTE equivalentes (sin \n de más ni perdidos) y sólo cambia
   `textSize` — `lineSpacing`/`topPadding`/alineación y el formato normal quedan idénticos.
4. **Matriz de impacto de extras** (todo donde los extras deben contar):
   - Totales en carrito ✓ (ya funciona, verificado en T4.3b).
   - Impresión del ticket → este feature (T5, unidades A/B según T0).
   - Re-impresión ✓ **por el mismo pipeline**: el adapter arma
     `ReceiptDocument.fromInvoice(…, isReprint: true, …)` (`ipos_printer_adapter.dart:145`)
     ⇒ hereda automáticamente el formato nuevo. Verificado por lectura; confirmar con test
     de runs en la unidad A.
   - KDS/comanda ✓ con defecto D1 (#785, holds) y D3 (cantidad en ESC/POS).
   - **Inventario/insumos (futuro)**: cuando SOHO integre recetas/insumos, los extras
     deben descontar/componer insumos (ej. Extra shot → 1 shot de espresso; Leche extra →
     leche) además de sus precios. Hoy SOHO es producto simple ⇒ sólo totales. **Dejarlo
     como requisito de diseño en el backlog para el trabajo de insumos** (no se implementa
     ahora).
   - Auditar otros superficies (backlog): devoluciones/notas de crédito, split bill,
     reportes, sync de `invoice_item_modifiers` al backend.

## Unidad única de trabajo (TDD + recibo RDD + work-unit commit)

**Scope**: sólo path iPOS/Nyx. Superficies: `receipt_layout_formatter.dart` (vía texto),
`ipos_printer_adapter.dart`, `IPosPrinterHandler.kt`, tests. **Excluido**: Sunmi, mock,
preview, `esc_pos_builder.dart`, `receipt_58mm_formatter.dart`.

1. **RED**:
   - Formatter: API de runs por talla — cada línea de modificador sale como segmento
     pequeño; la concatenación de los runs debe ser **idéntica byte a byte** al texto plano
     actual (`formatReceiptDocumentText`) ⇒ invariantes ≤32/40 y orden intactos.
   - Adapter: con method-channel mockeado, el blob se envía segmentado con su `textSize`
     por run (normal = valor actual del perfil; pequeño = **18** = 3/4 de 24, constante
     tunable) y las uniones de saltos de línea son equivalentes.
2. **GREEN**:
   - Helper de runs en el formatter (bloque de modificadores detectado en los loops de
     items `:511-541`), manteniendo `formatReceiptDocumentText` como concatenación.
   - `ipos_printer_adapter.dart`: enviar runs por separado con su tamaño.
   - `IPosPrinterHandler.kt`: aceptar segmentos/tamaño por llamada (default = comportamiento
     actual: `textSize = 24` / perfil 80mm) — sin romper el contrato actual del channel.
3. **Checks**: suites de printer verdes (`receipt_layout_formatter_test`,
   `thermal_receipt_completion_test`, `receipt_modifier_quantity_test`, adapter tests) +
   `flutter analyze` + compilación Kotlin (`gradlew compile…`).
4. **Aceptación final (usuario)**: imprime un ticket de prueba en la terminal real iPOS/Nyx
   y confirma que los extras salen debajo del item en letra menor sin alterar el layout.

## Evidencia / decisiones

- Decisión de usuario (2026-1006): **scope final = sólo iPOS/Nyx** ("no le vamos a dar
  soporte a cosas que no tenemos"); antes había elegido "todas las impresoras", luego
  restringió al hardware real. ESC/POS/Sunmi queda documentado como "cuando llegue otro
  dispositivo".
- Tamaño propuesto: **18 px (3/4 de 24)** para runs de modificadores — constante tunable,
  ajustable tras la prueba física en terminal.

## Estado de cierre (2026-10-06)

- **Implementado, revisado y pusheado**: commit `c85e53c5` (recibo RDD `f7bad6ce…`
  quemado). 175 tests de printer verdes + analyze + `gradlew :app:compileDebugKotlin`.
- **Aceptación física → FOLLOW-UP**: el dispositivo iPOS/Nyx está en manos del cliente;
  la prueba de impresión real (extras en letra menor bajo el item, layout intacto) se
  coordina con él cuando tenga un escenario de venta con extras. Si la talla18 px no se
  ve bien en el papel, es una constante tunable (`IPosPrinterAdapter.smallModifierTextSize`).
- Advisories del review (informativos, backlog): R3-001..003 en `IPosPrinterHandler.kt`
  (:193/:219/:206).
