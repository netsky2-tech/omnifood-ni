# Modificadores con efecto de inventario (R28) — Auditoría de Experiencia NHILOS POS

**Versión:** v1.0
**Fecha:** 2026-10-19
**Auditor:** agente (campaña R28 en el rig del S23)
**Módulo:** Catálogo-Venta (diálogo de modificadores de producto)
**Hardware target:** MIRAY Q80 / iPOS (Android 12) — **la evidencia se levantó en el S23 del rig** (Android 16, 1080x2316), que es el terminal disponible; el Q80 queda como verificación pendiente de hardware.
**Autoridad del módulo:** `docs/Product_Requirement_Document.md` · `docs/nhilos/nhilos_pos_experience_standard_v1.0.md` · decisiones D1–D6 de L49 en `odd/tasks/nucleo-inventario-remediacion-pre-integracion.md` · `docs/inventario_marco_normativo.md` (R-01, R-06)
**Widgets / views revisadas:** `ProductOptionsDialog` (`apps/pos_app/lib/ui/features/sales/sale_view.dart`), la fila de opción con efecto (`_effectSubtitle`), el campo de cantidad marcada, el badge de nube del encabezado de venta.
**Evidencia revisada:** capturas ADB directas del S23 (`/tmp/opencode/s25d.png`, `s32.png`, `s51.png`), base SQLite local del terminal leída con `run-as` (`authority_insumos`, `authority_recipe_versions`, `modifier_options`), logcat del dispositivo (`E/SQLiteLog`), código y tests de la rama `feat/modifier-inventory-effect`.

---

## 1. Autoridad y conflictos (§0)

- **Autoridad de producto identificada:** D2 del owner (L49) — *"Hereda y en el modal de modificadores … se marca la cantidad a aplicar"*. El efecto es **opt-in por opción** y **jamás bloquea la venta** (D6, garantía de SOHO).
- **Autoridades de experiencia aplicadas:** Brand Part B + POS Standard §0–§62.
- **Conflictos autoridad-producto vs. autoridad-experiencia detectados:** ninguno. La decisión D2 (el modal dice qué sale y qué entra, y el operador marca la cantidad) **coincide** con el estándar: es §7.3 (*¿qué estoy viendo?*), §41 (divulgación progresiva) y §49 +1.6 (*explicar impacto*).

---

## 2. Trabajo del módulo (§1, §4)

**Usuario primario:** Cajero (SOHO, barra de food park, hora pico).
**Trabajo primario (Core Promise):** cobrar rápido **sin que el cajero tenga que saber de inventario**: el modificador se cobra, la verdad fiscal es exacta y el stock baja solo.
**Usuarios/trabajos secundarios:** Encargado de turno (audita el consumo), Propietario (ve el costo y la desviación en el dashboard).
**Requisito de velocidad en hora pico:** el diálogo de modificadores no puede añadir toques ni leitura: el efecto **se继承** y sólo se marca si hace falta.
**Riesgo si falla:** cobro correcto con stock incorrecto (descuenta insumo que no debe, o no descuenta el que sí) → descuadre de inventario y costo de plato irreal.
**Blockers de Core Promise revisados (§4.1):** verdad financiera (el extra cambia el total y el IVA: la factura lo cubre), permisos (n/a en este diálogo), efectos colaterales (el efecto toca stock: **es el corazón de R28**), pérdida de trabajo (n/a), ambigüedad destructiva (n/a), contexto reconstruido a mano (el diálogo **lee** la autoridad proyectada, no la reconstruye), desconocido como válido (un insumo desconocido ⇒ `NO_IMPACT`, nunca un cobro dudoso), contradicción PRD (ninguna), flujo crítico inaccesible (el cajero con lector de pantalla debe poder cobrar: ver PX-002).

---

## 3. Inventario de superficies (§6 Fase B)

| Superficie / Pantalla | Flutter View / Widget | Trabajo | Lectura / Escritura | Densidad táctil | Variantes de permiso | Estados offline | Evidencia |
|---|---|---|---|---|---|---|---|
| Diálogo de modificadores | `ProductOptionsDialog` | Elegir opción y cobrar | Lectura del catálogo local + de la autoridad proyectada | Un toque por opción; el campo de cantidad es opcional | Igual para cajero y propietario | **Offline**: los hechos vienen de la autoridad local; sin autoridad el diálogo **no muestra** el efecto y la venta sigue igual | `s51.png` (con hechos), `s32.png` (sin autoridad) |
| Fila de opción con efecto | `_effectSubtitle` | Saber qué sale/entra del stock | Lectura | 1 toque (radio/check) | — | Igual | `s51.png` |
| Campo «Cantidad a aplicar» | `TextField` denso, 86 dp | **Marcar** una cantidad (D2) | Escritura (sólo si el operador marca) | Objetivo **< 48 dp** (ver PX-003) | — | Igual | `s51.png` |
| Encabezado de venta | badge de nube | Estado de sincronización | Lectura | — | — | Sí | `s49.png` |

---

## 4. Matriz de cobertura de experiencia (EX-01 → EX-19) (§51)

| ID | Dimensión | Pregunta central | Estado | Evidencia | Hallazgos |
|---|---|---|---|---|---|
| EX-01 | Propósito y alcance | ¿El diálogo dice qué hace la opción? | **PASS** | `s51.png`: *«No se consume R23 Leche entera; entran 150 ml de Leche de Almondras en su lugar.»* | — |
| EX-02 | Anatomía de pantalla | ¿El cajero sabe dónde está y qué sigue? | **PASS** | Título del producto, grupos con su regla (`Elige una opción`, `Elige hasta 3 · puedes repetir`), `AGREGAR`/`CANCELAR` | — |
| EX-03 | Jerarquía | ¿Lo importante manda? | **PASS** | Precio del extra, luego el efecto, luego la cantidad heredada | — |
| EX-04 | Microcopy | ¿El copy está en el idioma del operador? | **PASS** | Español, sin vocabulario de backend; la unidad es la del insumo (`ml`) | — |
| EX-05 | Teclados y montos | ¿El campo numérico es cómodo? | **PARTIAL** | Teclado numérico con decimales; **el campo es de 86 dp de ancho y ~30 dp de alto** | PX-003 |
| EX-06 | Guardas y doble envío | ¿Se puede cobrar dos veces? | **PARTIAL** | `AGREGAR` es único; la confirmación de cobro vive fuera de este diálogo (no auditado aquí) | — |
| EX-07 | Estados vacíos | ¿Qué pasa sin autoridad? | **PASS** | Sin hechos, el diálogo **no muestra** el subtítulo: el cajero cobra igual (§7.3 honesto) | — |
| EX-08 | Errores y recuperación | ¿Un fallo de la feature bloquea la venta? | **PASS** | D6: el efecto degrada el inventario, nunca la venta (`NO_IMPACT`) | — |
| EX-09 | Accesibilidad | ¿Todo control crítico tiene nombre accesible? | **FAIL → corregido** | El campo de cantidad no tenía etiqueta programática | PX-002 (corregido) |
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
- **§18.3 Targets táctiles** — el radio/check de la opción cumple; **el campo de cantidad no** (PX-003).
- **§46 Accesibilidad** — el campo de cantidad ya tiene nombre accesible (PX-002 corregido); el radio/check announce su estado ✓.

---

## 6. Marca, sobriedad e identidad (§3, §12.6, §42)

- §42.1 Paleta: sólo navy/esmeralda/slate; el efecto **no** introduce color nuevo (es texto) ✓ — decisión deliberada: el efecto no es una alerta, es información.
- §42.7 Tipografía: el subtítulo del efecto va en 11 px y la cantidad heredada en 10 px — **por debajo del cuerpo legible**; hoy el tamaño va atado al espacio disponible, no a una escala (§42.7 pide jerarquía legible). Registrado como PX-005 (REFINEMENT).
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
- **Pendiente de hardware**: la ergonomía del campo de cantidad (PX-003) debe medirse en el Q80 real (800x1280 vertical, 72 dp de tecla) — el S23 del rig es de 1080x2316 y mucho más ancho, así que **el desbordamiento del campo se midió en un terminal más ancho que el de destino**: en el Q80 el texto se partirá en más líneas (el arreglo es *envolver*, no *cortar*, así que el comportamiento es correcto, pero la evidencia de legibilidad debe repetirse en el Q80).

---

## 11. Fiscal y finanzas (§23, §24, §34)

- No aplica al diálogo. El efecto **no** cambia el total ni el IVA por sí mismo (lo cambia el precio del extra, que es otro módulo).

---

## 12. Hallazgos (§53)

| ID | Severidad | Sección | Superficie | Hallazgo | Corrección |
|---|---|---|---|---|---|
| PX-001 | **REQUIRED** | §42.2/§42.7/§46 | Fila de opción con efecto | El subtítulo del efecto se desbordaba 21 px («RIGHT OVERFLOWED BY 21 PIXELS»): la cantidad heredada competía por el ancho con la etiqueta y el texto de la opción quedaba **tapado** por la franja de desbordamiento | **Corregido**: la cantidad heredada pasa a su propia línea y la etiqueta usa `Flexible` con elipsis; test de widget que falla si el diálogo vuelve a desbordar |
| PX-002 | **REQUIRED** | §46 | Campo «Cantidad a aplicar» | El campo no tenía nombre accesible: un lector de pantalla anunciaba «campo de texto» sin decir de qué es el número | **Corregido**: `Semantics(label: 'Cantidad a aplicar')`; test de semántica |
| PX-003 | **REFINEMENT** | §18.3/§46 | Campo «Cantidad a aplicar» | Objetivo táctil de ~30 dp de alto (muy por debajo del mínimo de 48 dp) | Subir altura del campo (`contentPadding`) y el ancho a 96 dp; medir en el Q80 |
| PX-004 | **+1 OPPORTUNITY** | §49 +1.6 | Diálogo de modificadores | Un cajero nuevo no tiene forma de saber si una opción «toca el stock» sin leer el subtítulo | Chip discreto en la opción con efecto («toca inventario») con la misma voz del dashboard |
| PX-005 | **REFINEMENT** | §42.7 | Fila de opción con efecto | El subtítulo (11 px) y la cantidad heredada (10 px) están por debajo del cuerpo legible del POS | Escalar a 12/11 px cuando el ancho del Q80 lo permita, o mover la cantidad heredada al cuerpo del subtítulo |

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

**Refinamientos diferidos (con justificación):**

| ID | Justificación del diferimiento |
|---|---|
| PX-003 | El campo es **opcional** (el valor por defecto es heredar, D2); tocarlo es la excepción, no el camino común. Se difiere hasta medir el Q80 (el campo no puede crecer sin empobrecer la fila en vertical de 800 dp) |
| PX-005 | Depende de la medición de tipografía real en el Q80 (el S23 no es el terminal de destino) |

---

## 15. Veredicto de la auditoría (§6 Fase H)

- [x] **READY_AFTER_REQUIRED_FIXES** — Núcleo sólido: el diálogo explica el efecto con los nombres reales y la cantidad heredada (D2), nunca bloquea la venta (D6) y no dibuja texto cortado. **PX-001 y PX-002 están cerrados y verificados por test**; PX-003 y PX-005 quedan diferidos con medición pendiente en el Q80.
- [ ] READY — sólo tras cerrar PX-003/PX-005 con evidencia del Q80.
- [ ] NOT_READY
- [ ] BLOCKED_BY_PRODUCT_DECISION
- [ ] BLOCKED_BY_MISSING_EVIDENCE — la ergonomía del campo de cantidad (PX-003) y la escala tipográfica (PX-005) necesitan el **Q80 real**: el rig es un S23 de 1080x2316, más ancho que el destino.

**Nota de campaña (P0 corregido fuera de este módulo):** la campaña de R28 encontró que la entidad de autoridad creció una columna sin migración local (`32f9098e`); el efecto se auditaba bien pero **no llegaba a pantalla** porque la autoridad entera quedaba vacía en los terminales actualizados. LaLesson: *auditar la pantalla no basta — hay que auditar que los hechos lleguen*.
