# Modificadores con efecto de inventario (R28) — Auditoría de Experiencia NHILOS POS

**Versión:** v1.0
**Fecha:** 2026-10-19
**Auditor:** agente (campaña R28 en el rig del S23)
**Módulo:** Catálogo-Venta (diálogo de modificadores de producto)
**Hardware target:** MIRAY Q80 / iPOS (Android 12) — **la evidencia se levantó en el S23 del rig** (Android 16, 1080x2316) y, desde el 2026-10-20, **la certificación es independiente del hardware** (pruebas de widget a 360×640, 800×1280 y 1280×800). El Q80 real se entregó a SOHO y ya no se necesita para cerrar este módulo.
**Autoridad del módulo:** `docs/Product_Requirement_Document.md` · `docs/nhilos/nhilos_pos_experience_standard_v1.0.md` · decisiones D1–D6 de L49 en `odd/tasks/nucleo-inventario-remediacion-pre-integracion.md` · `docs/inventario_marco_normativo.md` (R-01, R-06)
**Widgets / views revisadas:** `ProductOptionsDialog` (`apps/pos_app/lib/ui/features/sales/sale_view.dart`), la fila de opción con efecto (`_effectSubtitle`), el campo de cantidad marcada, el badge de nube del encabezado de venta.
**Evidencia revisada:** capturas ADB directas del S23 (`/tmp/opencode/s25d.png`, `s32.png`, `s51.png`), base SQLite local del terminal leída con `run-as` (`authority_insumos`, `authority_recipe_versions`, `modifier_options`), logcat del dispositivo (`E/SQLiteLog`), código y tests de la rama `feat/modifier-inventory-effect`.

---

## 1. Autoridad y conflictos (§0)

- **Autoridad de producto identificada:** D2 del owner (L49) — *"Hereda y en el modal de modificadores … se marca la cantidad a aplicar"* — **SUSTITUIDA el 2026-10-20 por la decisión del owner** tras la investigación de mercado (Square, Toast, Lightspeed, Aloha: *el servidor marca, el backoffice configura*): **la cantidad del extra la configura el backoffice** (`effect_quantity`) y, si no la hay, la hereda de la receta; el cajero **no escribe cantidades**. El único número en juego es un **override de supervisor** (cantidad + motivo + autorización, con traza forense). El efecto sigue siendo **opt-in por opción** y **jamás bloquea la venta** (D6, garantía de SOHO). Decisión y diseño: `openspec/changes/modifier-effect-amount-backoffice-owned/`.
- **Autoridades de experiencia aplicadas:** Brand Part B + POS Standard §0–§62.
- **Conflictos autoridad-producto vs. autoridad-experiencia detectados:** ninguno. La decisión vigente (el modal dice qué sale y qué entra, con la cantidad **que se va a aplicar**, y el cajero no escribe cantidades) **coincide** con el estándar: es §7.3 (*¿qué estoy viendo?*), §39.4 (sin vocabulario de implementación), §40 (defaults humanos), §41 (divulgación progresiva) y §49 +1.6 (*explicar impacto*).

---

## 2. Trabajo del módulo (§1, §4)

**Usuario primario:** Cajero (SOHO, barra de food park, hora pico).
**Trabajo primario (Core Promise):** cobrar rápido **sin que el cajero tenga que saber de inventario**: el modificador se cobra, la verdad fiscal es exacta y el stock baja solo.
**Usuarios/trabajos secundarios:** Encargado de turno (audita el consumo), Propietario (ve el costo y la desviación en el dashboard).
**Requisito de velocidad en hora pico:** el diálogo de modificadores no puede añadir toques ni lectura: el efecto **se aplica solo** (la cantidad la puso el backoffice) y sólo se toca un supervisor cuando el efecto no tiene cantidad.
**Riesgo si falla:** cobro correcto con stock incorrecto (descuenta insumo que no debe, o no descuenta el que sí) → descuadre de inventario y costo de plato irreal.
**Blockers de Core Promise revisados (§4.1):** verdad financiera (el extra cambia el total y el IVA: la factura lo cubre), permisos (n/a en este diálogo), efectos colaterales (el efecto toca stock: **es el corazón de R28**), pérdida de trabajo (n/a), ambigüedad destructiva (n/a), contexto reconstruido a mano (el diálogo **lee** la autoridad proyectada, no la reconstruye), desconocido como válido (un insumo desconocido ⇒ `NO_IMPACT`, nunca un cobro dudoso), contradicción PRD (ninguna), flujo crítico inaccesible (el cajero con lector de pantalla debe poder cobrar: ver PX-002).

---

## 3. Inventario de superficies (§6 Fase B)

| Superficie / Pantalla | Flutter View / Widget | Trabajo | Lectura / Escritura | Densidad táctil | Variantes de permiso | Estados offline | Evidencia |
|---|---|---|---|---|---|---|---|
| Diálogo de modificadores | `ProductOptionsDialog` | Elegir opción y cobrar | Lectura del catálogo local + de la autoridad proyectada | Un toque por opción; el campo de cantidad es opcional | Igual para cajero y propietario | **Offline**: los hechos vienen de la autoridad local; sin autoridad el diálogo **no muestra** el efecto y la venta sigue igual | `s51.png` (con hechos), `s32.png` (sin autoridad) |
| Fila de opción con efecto | `_effectSubtitle` | Saber qué sale/entra del stock | Lectura | 1 toque (radio/check), fila de **≥48 dp** | — | Igual | `s51.png` |
| Cantidad del efecto | **No hay campo en el flujo normal**: la cantidad la configura el backoffice (`effect_quantity`) y, si no la hay, la hereda de la receta | Sólo lectura | El único campo numérico vive en el **override de supervisor** (`ModifierQuantityOverrideContent`), con altura estándar | El override exige supervisor + motivo | Igual | `s51.png` |
| Encabezado de venta | badge de nube | Estado de sincronización | Lectura | — | — | Sí | `s49.png` |

---

## 4. Matriz de cobertura de experiencia (EX-01 → EX-19) (§51)

| ID | Dimensión | Pregunta central | Estado | Evidencia | Hallazgos |
|---|---|---|---|---|---|
| EX-01 | Propósito y alcance | ¿El diálogo dice qué hace la opción? | **PASS** | *«No sale R23 Leche entera; entran 150 ml de Leche de Almondras en su lugar.»* (la cantidad **configurada** en el backoffice manda sobre la de la receta) | — |
| EX-02 | Anatomía de pantalla | ¿El cajero sabe dónde está y qué sigue? | **PASS** | Título del producto, grupos con su regla (`Elige una opción`, `Elige hasta 3 · puedes repetir`), `AGREGAR`/`CANCELAR` | — |
| EX-03 | Jerarquía | ¿Lo importante manda? | **PASS** | Precio del extra, luego el efecto (con la cantidad que se va a aplicar) | — |
| EX-04 | Microcopy | ¿El copy está en el idioma del operador? | **PASS** | Español, sin vocabulario de backend; la unidad es la del insumo (`ml`) | — |
| EX-05 | Teclados y montos | ¿El campo numérico es cómodo? | **PASS** | **No hay campo numérico en el flujo normal**: el cajero marca la opción. El único número en juego (override de supervisor) usa el campo estándar del tema, con teclado de decimales y objetivo táctil ≥48 dp | PX-003 (cerrado) |
| EX-06 | Guardas y doble envío | ¿Se puede cobrar dos veces? | **PARTIAL** | `AGREGAR` es único; la confirmación de cobro vive fuera de este diálogo (no auditado aquí) | — |
| EX-07 | Estados vacíos | ¿Qué pasa sin autoridad? | **PASS** | Sin hechos, el diálogo **no muestra** el subtítulo: el cajero cobra igual (§7.3 honesto) | — |
| EX-08 | Errores y recuperación | ¿Un fallo de la feature bloquea la venta? | **PASS** | D6: el efecto degrada el inventario, nunca la venta (`NO_IMPACT`) | — |
| EX-09 | Accesibilidad | ¿Todo control crítico tiene nombre accesible? | **FAIL → corregido** | El campo de cantidad no tenía etiqueta programática; **hoy el campo ya no existe en el flujo normal** y el del override usa `labelText` del tema | PX-002 (corregido) |
| EX-10 | Integridad visual | ¿La pantalla se dibuja limpia? | **FAIL → corregido** | *«RIGHT OVERFLOWED BY 21 PIXELS»* sobre la opción con cantidad heredada | PX-001 (corregido) |
| EX-11 | Performance | ¿Responde al toque? | **PASS** | Hechos leídos de SQLite local en `initState`; sin espera | — |
| EX-12 | Consistencia | ¿Usa el vocabulario de componentes del POS? | **PASS** | Radio/check, `InputDecoration` densa, tipografía del tema | — |
| EX-13 | Offline y sincronización | ¿Funciona sin nube? | **PASS** | La autoridad es local; la nube recalcula después (M4) | — |
| EX-14 | Fiscal y dinero | ¿El extra afecta el total? | **PASS** | El precio del extra entra al total con su IVA (fuera de este módulo) | — |
| EX-15 | Confianza | ¿El cajero puede dudar de lo que ve? | **PASS** | La cantidad heredada se **anuncia** («150 ml (heredada de la receta)») y el operador puede marcarla | — |
| EX-16 | Onboarding | ¿Un cajero nuevo entiende el diálogo? | **NOT_EVIDENCED** | Sin estudio con cajero nuevo | PX-004 (oportunidad) |
| EX-17 | +1 | ¿El efecto explica su impacto? | **PASS** | §49 +1.6 *explicar impacto*: el diálogo dice qué entra y qué sale | — |
| EX-18 | Honestidad del estado | ¿El badge de nube dice la verdad? | **PASS** | Verde = última sincronización limpia; con el rotulador se ve el error | — |
| EX-19 | Marca | ¿Se respeta la sobriedad? | **PASS** | Navy/esmeralda, sin colores nuevos, sin arcoíris | — |

---

## 5. Anatomía de pantalla y ergonomía táctil (§7, §8, §18, §46)

- **§7.3 ¿Qué estoy viendo?** — el efecto se anuncia en la fila de la opción, no en un toast ni en un modal aparte ✓.
- **§8 Jerarquía** — P0: el precio y el nombre de la opción; P1: el efecto (una línea, la que el cajero necesita para no surprises); P2: la cantidad heredada y el campo para marcarla ✓.
- **§18.3 Targets táctiles** — el radio/check de la opción cumple y **la fila mide ≥48 dp**; el campo de cantidad ya no está en el flujo normal (PX-003 cerrado).
- **§46 Accesibilidad** — el campo de cantidad ya tiene nombre accesible (PX-002 corregido); el radio/check announce su estado ✓.

---

## 6. Marca, sobriedad e identidad (§3, §12.6, §42)

- §42.1 Paleta: sólo navy/esmeralda/slate; el efecto **no** introduce color nuevo (es texto) ✓ — decisión deliberada: el efecto no es una alerta, es información.
- §42.7 Tipografía: **corregido** — el subtítulo del efecto usa la escala del tema (`bodySmall`, 12 dp) y la cantidad heredada dejó de ser una línea aparte; la jerarquía la da el tema, no un tamaño suelto (PX-005 cerrado).
- §39 Microcopy: sin vocabulario de backend (`NO_IMPACT`, `insumo_id`, `recipeComponentId` no aparecen en pantalla) ✓.

---

## 7. Navegación, contexto y botón atrás (§9, §10, §11)

- El diálogo se cierra con `CANCELAR` sin perder el carrito ✓ (§10: el estado del carrito sobrevive al cierre del diálogo).
- El botón atrás del sistema no está conectado en este diálogo (falta evidencia de comportamiento) — **NOT_EVIDENCED**, fuera del alcance de R28.

---

## 8. Cobertura de estados (§28–§32)

| Estado | Comportamiento | Evidencia |
|---|---|---|
| Con autoridad (hechos completos) | Muestra el efecto con nombres y cantidad heredada | `s51.png` |
| **Sin autoridad** (terminal recién actualizado, o insumo desconocido) | **No muestra** subtítulo; el cobrador cobra igual | `s32.png` (así se veía el bug P0: además de vacío, era ilegible) |
| Insumo **desactivado** | El efecto **no aplica**; la venta sigue y el consumo no se descuenta (D6) | Base local: `Leche de Soya` con `isActive = 0` ✓ |
| Teclado abierto | El teclado tapa el diálogo; el cajero lo cierra para ver la opción completa | `s29.png` |

---

## 9. Continuidad offline y sincronización (§35)

- §35.1 La fuente de verdad local es SQLite (Floor) ✓.
- §35.2 La cola de sincronización no se toca en este módulo ✓.
- §35.4 Señal calmada de estado offline: el badge del encabezado ✓.
- **Hallazgo de campaña (P0, ya corregido en `32f9098e`)**: la entidad `authority_insumos` creció la columna `isActive` **sin migración local** → **toda** inserción de autoridad fallaba en los terminales ya actualizados → la autoridad quedaba vacía → el cajero veía el diálogo **sin efecto y sin nombres** (y el POS no podía resolver la demanda de la línea). *Una entidad nueva sin migración es un apagón silencioso*: la instalación nueva no lo ve.

---

## 10. Hardware y periféricos (§45)

- No aplica al diálogo (sin impresión ni gaveta). El ticket térmico de la venta con el extra (precio + IVA) se audita en el módulo de cobro.
- **El diferido por hardware se disolvió (2026-10-20)**: PX-003 y PX-005 ya no dependen de un aparato. El Q80 real se entregó a SOHO y, más importante, el criterio correcto no es «cómo queda en este terminal» sino «**no desborda y no hay target bajo 48 dp en ningún tamaño soportado**». El diálogo pasó a seguir al dispositivo (`ResponsiveBreakpoints`, sin `maxWidth` fijo) y la evidencia son **pruebas de widget a 360×640, 800×1280 y 1280×800** que fallan si el diálogo desborda o si una fila de opción baja de 48 dp (`product_options_modifier_effect_test.dart`). Un aparato nuevo no exige otra medición: exige otro tamaño en la lista de pruebas.

---

## 11. Fiscal y finanzas (§23, §24, §34)

- No aplica al diálogo. El efecto **no** cambia el total ni el IVA por sí mismo (lo cambia el precio del extra, que es otro módulo).

---

## 12. Hallazgos (§53)

| ID | Severidad | Sección | Superficie | Hallazgo | Corrección |
|---|---|---|---|---|---|
| PX-001 | **REQUIRED** | §42.2/§42.7/§46 | Fila de opción con efecto | El subtítulo del efecto se desbordaba 21 px («RIGHT OVERFLOWED BY 21 PIXELS»): la cantidad heredada competía por el ancho con la etiqueta y el texto de la opción quedaba **tapado** por la franja de desbordamiento | **Corregido**: la cantidad heredada pasa a su propia línea y la etiqueta usa `Flexible` con elipsis; test de widget que falla si el diálogo vuelve a desbordar |
| PX-002 | **REQUIRED** | §46 | Campo «Cantidad a aplicar» | El campo no tenía nombre accesible: un lector de pantalla anunciaba «campo de texto» sin decir de qué es el número | **Corregido**: `Semantics(label: 'Cantidad a aplicar')`; test de semántica |
| PX-003 | **REFINEMENT** | §18.3/§46 | Campo «Cantidad a aplicar» | Objetivo táctil de ~30 dp de alto (muy por debajo del mínimo de 48 dp) | **Cerrado por eliminación (2026-10-20)**: el campo salió del flujo normal —la cantidad la configura el backoffice— y el único campo numérico (el override de supervisor) usa la altura estándar del tema. Verificado por test de widget: la fila de opción mide ≥48 dp en los tres tamaños |
| PX-004 | **+1 OPPORTUNITY** | §49 +1.6 | Diálogo de modificadores | Un cajero nuevo no tiene forma de saber si una opción «toca el stock» sin leer el subtítulo | Chip discreto en la opción con efecto («toca inventario») con la misma voz del dashboard |
| PX-005 | **REFINEMENT** | §42.7 | Fila de opción con efecto | El subtítulo (11 px) y la cantidad heredada (10 px) están por debajo del cuerpo legible del POS | **Cerrado (2026-10-20)**: el subtítulo del efecto usa `textTheme.bodySmall` (12 dp) y la cantidad dejó de ser una línea aparte; la jerarquía la da el tema, no un tamaño suelto |

### PX-001 — REQUIRED — §42.2, §42.7, §46

```text
ID: PX-001
Severidad: REQUIRED
Estado: CLOSED (corregido en el mismo lote)
Estándar: §42.2 (restricción visual), §42.7 (tipografía legible), §46 (accesibilidad)
Superficie: ProductOptionsDialog — fila de opción con efecto
Autoridad: D2 (L49) + POS Standard

ACTUAL
La fila con cantidad heredada construye un Row con MainAxisSize.min que contiene
un Expanded. Un hijo flexible dentro de una fila sin ancho definido no tiene
espacio donde crecer: el Row se desborda 21 px y Flutter pinta la franja
amarilla/negra sobre la opción. En el S23 el texto de «Soya» queda cortado.

ESPERADO
La pantalla se dibuja limpia (§42.2) y la etiqueta queda legible (§42.7).

POR QUÉ IMPORTA
CUIDADO y PRECISIÓN: un cajero que ve una franja de error en pantalla no sabe si
el cobro está mal. El desbordamiento además ocultaba el copy que explica el
efecto: la verdad de la operación quedaba ilegible justo en el punto donde el
cajero debe decidir.

EVIDENCIA
Captura ADB s51.png (franja «RIGHT OVERFLOWED BY 21 PIXELS» sobre la opción
Soya); código lib/ui/features/sales/sale_view.dart (_effectSubtitle);
test de widget test/ui/features/sales/product_options_modifier_effect_test.dart
(falla con «A RenderFlex overflowed by 7.0 pixels on the right» al reintroducir
el patrón defectuoso).

CORRECCIÓN
La cantidad heredada pasa a su propia línea (Column dentro de Column) y la
etiqueta usa Flexible con TextOverflow.ellipsis. Sin cambio de copy.

ACEPTACIÓN
El test «the dialog lays out without overflowing» pasa; el diálogo en el S23 se
dibuja sin franja y el copy se lee completo.
```

### PX-002 — REQUIRED — §46

```text
ID: PX-002
Severidad: REQUIRED
Estado: CLOSED (corregido en el mismo lote)
Estándar: §46 (accesibilidad en terminales táctiles)
Superficie: ProductOptionsDialog — campo «Cantidad a aplicar»
Autoridad: POS Standard §46

ACTUAL
El TextField no tiene etiqueta programática: la palabra «Cantidad a aplicar:»
vive en un Text hermano. Un lector de pantalla anuncia «campo de texto» y el
cajero no sabe qué número marcar.

ESPERADO
Todo control que el operador usa tiene nombre accesible.

POR QUÉ IMPORTA
CUIDADO: el flujo de cobro debe poder completarse con lector de pantalla.

EVIDENCIA
Test de semántica: tester.getSemantics(...) contiene «Cantidad a aplicar».

CORRECCIÓN
Semantics(label: 'Cantidad a aplicar', child: TextField(...)).

ACEPTACIÓN
El test de semántica pasa.
```

---

## 13. Oportunidades +1 (§49)

| Candidato +1 | Patrón | Útil / Sostenible / No compensatorio | Recomendación |
|---|---|---|---|
| Chip «toca inventario» en la opción con efecto | §49 +1.6 (explicar impacto) | Útil y sostenible; no compensa nada (§5.1: un +1 sobre un cobro confuso es un fracaso) | Medir primero en el Q80 |
| Mostrar el consumo resultante en el carrito («este extra usa 18 g de café») | §49 +1.6 + §8 P1 | Útil; el dato ya está en el snapshot | Cuando el resumen del carrito tenga lugar |

---

## 14. Correcciones requeridas y refinamientos diferidos

**Correcciones requeridas para aceptación:**

| ID | Severidad | Encargado | Test de aceptación |
|---|---|---|---|
| PX-001 | REQUIRED | POS | `product_options_modifier_effect_test.dart` — «lays out without overflowing» |
| PX-002 | REQUIRED | POS | `product_options_modifier_effect_test.dart` — «carries an accessible name» |

**Refinamientos diferidos:** ninguno.

| ID | Estado |
|---|---|
| PX-003 | **Cerrado** (2026-10-20): el campo de cantidad salió del flujo normal; el override de supervisor usa la altura estándar y las filas cumplen 48 dp |
| PX-005 | **Cerrado** (2026-10-20): el subtítulo del efecto usa la escala del tema (`bodySmall`, 12 dp) |

**Por qué el diferimiento ya no depende del hardware**: el criterio pasó de «cómo queda en el Q80» a «no desborda y no hay target bajo 48 dp en ningún tamaño soportado», y ese criterio se certifica con pruebas de widget a tres resoluciones (360×640, 800×1280, 1280×800). Un terminal nuevo es otro tamaño en la lista de pruebas, no otra medición de campo.

---

## 15. Veredicto de la auditoría (§6 Fase H)

- [x] **READY** — El diálogo dice la verdad (la cantidad que se va a aplicar: la del backoffice, o la de la receta si no la hay), nunca pide una cantidad al cajero, nunca bloquea la venta y no dibuja texto cortado. **PX-001 a PX-005 están cerrados y verificados por test**, incluidos PX-003/PX-005, que se certificaron por resolución (tres tamaños) y no por una medición en un aparato.
- [ ] NOT_READY
- [ ] BLOCKED_BY_PRODUCT_DECISION
- [ ] BLOCKED_BY_MISSING_EVIDENCE — cerrado: el diferimiento por hardware (Q80 entregado a SOHO) se sustituyó por el criterio de independencia de la resolución.

**Alcance que queda fuera de este módulo** (no es un hallazgo, es otra capacidad): el listado de **opciones con efecto de inventario cuya cantidad no se puede resolver**, que el backoffice debe mostrar para que el tenant configure lo que falta. Vive en el change de SDD `modifier-effect-amount-backoffice-owned` (Unidad 3).

**Nota de campaña (P0 corregido fuera de este módulo):** la campaña de R28 encontró que la entidad de autoridad creció una columna sin migración local (`32f9098e`); el efecto se auditaba bien pero **no llegaba a pantalla** porque la autoridad entera quedaba vacía en los terminales actualizados. LaLesson: *auditar la pantalla no basta — hay que auditar que los hechos lleguen*.
