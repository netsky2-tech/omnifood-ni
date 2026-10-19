# Modificadores — NHILOS Experience Audit (el efecto de inventario, R28)

**Version:** 1.0
**Date:** 2026-10-19
**Auditor:** opencode (agente), por instrucción del owner
**Module:** Modificadores (grupos de modificadores / extras) del backoffice — el editor del **efecto de inventario** de una opción
**Module authority:** `odd/tasks/nucleo-inventario-remediacion-pre-integracion.md` (spec **S21**, tarea **R28**, decisiones **D1–D6** en L49), `docs/inventario_marco_normativo.md` (R-01, R-06)
**Standard:** `docs/nhilos/nhilos_backoffice_experience_standard_v1.0.md` (v1.0, APPROVED)
**Template:** `docs/nhilos/nhilos_backoffice_module_audit_template_v2.1.md`
**Routes/surfaces reviewed:** `/modifier-groups` (editor de grupo → filas de opción → diálogo del efecto)
**Evidence reviewed:** código del dashboard (`apps/owner_dashboard/src/features/modifiers/`), el dominio del efecto en backend, y las suites de prueba del dashboard (1815 verdes)

**Alcance:** auditoría de la **superficie nueva** que introduce R28 (el diálogo del efecto de inventario y la fila de opción que lo hospeda), no del módulo completo de Modificadores.

---

## 1. Module job (§4)

**Primary user:** el dueño del food park, configurando el catálogo de extras y sus efectos sobre el stock.
**Primary job:** definir qué hace cada extra con el inventario, sin que la definición pueda bloquear una venta.
**Risk if wrong:** un efecto mal declarado descuenta el insumo equivocado (o el equivocado dos veces) y **el margen reportado deja de reflejar el costo real** (R-01); y un efecto mal calculado podría, en el futuro, bloquear la venta de un cliente que no tiene insumos registrados (la garantía D6).

---

## 2. Surface inventory (§6 Phase B)

| Surface | Route/component | Job | Read/write | Permissions | Evidence |
|---|---|---|---|---|---|
| Fila de opción | `modifier-group-form.tsx` | ver y editar el efecto declarado de una opción | RW | OWNER, MANAGER | `modifier-group-form.tsx` |
| Diálogo del efecto | `modifier-effect-dialog.tsx` | declarar el efecto, sus insumos y su cantidad | RW | OWNER, MANAGER | `modifier-effect-dialog.tsx` |
| Selector de insumo | `EntitySearchSelect` | elegir el insumo gobernado | R | — | `entity-search-select.tsx` |

---

## 3. Universal page anatomy check (§7)

| Surface | §7.1 | §7.2 | §7.3 | §7.4 | §7.5 |
|---|---|---|---|---|---|
| Fila de opción | la opción se nombra en la etiqueta accesible del botón | una acción: **Configurar** el efecto | el badge dice el efecto vigente | el badge **distingue** el efecto del default (color + texto) | el diálogo lleva al siguiente paso (elegir unidades) |
| Diálogo | el título nombra la opción | aplicar / cancelar | el efecto vigente y sus campos | el error de validación | aplicar al grupo |

**PASS.**

---

## 4. Information hierarchy check (§8)

El efecto es un dato **P2** de la opción (un atributo de la configuración), no su P0 (el nombre y el precio). Por eso vive en una línea propia bajo la fila, con un badge discreto, y su edición es una **acción secundaria** ("Configurar") al lado del badge — no un campo más del grid. La fila no se vuelve el P0 de la pantalla.

**PASS.**

---

## 5. Experience coverage matrix (EX-01 → EX-18) (§51)

| ID | Dimensión | Estado | Evidencia | Hallazgos |
|---|---|---|---|---|
| EX-01 | Core Promise | **PASS** | El efecto se declara, se guarda y viaja en el payload de la opción (`modifier-group-form.test.tsx` pinea el conjunto de claves) | — |
| EX-02 | Product Truth | **PASS** | Las cinco efectos y sus reglas son las del backend (`modifier-inventory-effect.ts` ↔ `effect.ts`); el copy dice lo que el efecto **hace** ("Aporta un insumo", "Reemplaza un componente") | BX-006 |
| EX-03 | Precision | **PASS** | "Costo" nunca se confunde con "cantidad": el factor se llama *Factor* y la cantidad *Cantidad a aplicar*; el valor heredado se dice explícitamente ("Heredar de la receta") | — |
| EX-04 | Navigation | **N/A** | El efecto se edita en un diálogo; no hay navegación con contexto que perder | — |
| EX-05 | Findability | **PASS** | La búsqueda del insumo es parcial, tolerante a mayúsculas y acentos, y cubre nombre **y** unidad (`filterInsumos`) | — |
| EX-06 | Forms | **PASS** | §20 con guarda de descarte (BX-001), §18.3 con el error focalizado (BX-002), §17.5/§17.6 con selectores gobernados | BX-001, BX-002 |
| EX-07 | Actions | **PASS** | "Aplicar al grupo" dice exactamente qué pasa; el diálogo aclara que el grupo es lo que guarda | BX-003 |
| EX-08 | States | **PASS** | Vacío de insumos con guía ("regístrelos en Inventario → Insumos"), error focalizado, sin resultados con el término | — |
| EX-09 | Permissions | **PASS** | La superficie hereda los roles del módulo (OWNER, MANAGER); el efecto no amplía ninguna capacidad | — |
| EX-10 | Time | **PASS** | El insumo no se re-deriva: el buscador lo trae del catálogo del tenant | — |
| EX-11 | Sobriety | **PASS** | Un solo campo visible por cada efecto: no se muestran los campos que no aplican (cambiar de efecto los limpia) | — |
| EX-12 | Consistency | **PASS** | Mismos tokens, mismos componentes y mismos padrões de diálogo que el resto del backoffice | — |
| EX-13 | Microcopy | **PASS** | Español, calmo, con la consecuencia; sin vocabulario de implementación | BX-003 |
| EX-14 | Accessibility | **PASS** | Etiquetas visibles, `role="alert"` en el error, foco en el error, `aria-label` en el botón de la fila, `role="combobox"` en el buscador | BX-002 |
| EX-15 | Responsive | **PARTIAL** | La fila del grid pasa a dos líneas en móvil (`col-span-12`); **no re-verificado en viewport angosto** | BX-007 |
| EX-16 | Performance | **PASS** | El diálogo lee el catálogo de insumos ya cacheado (`useInsumos`), sin consulta propia | — |
| EX-17 | +1 | **PASS** | El badge resume el efecto de un vistazo; el copy de la garantía SOHO evita la duda más caro de la feature | — |
| EX-18 | Evidence | **PASS** | 23 specs nuevas de la superficie + suite completa del dashboard en 1815 verdes | — |

---

## 6. Conflict resolution (§0.1)

Sin conflictos de autoridad: las cinco decisiones (D1–D6) son del owner y el estándar se aplica sobre ellas. El único punto donde el estándar y unaCostumbre previa chocaban —el diálogo que edita una parte de un formulario en vez de un formulario propio— se resolvió a favor del estándar: la guarda de descarte (§20) existe aunque el formulario mayor no la tenga para sus filas.

---

## 7. Navigation / state checklist (§9, §10, §13, §14, §25)

- [x] No hay navegación con contexto en esta superficie (diálogo).
- [x] El estado del diálogo vive con la opción (el padre lo monta con `key` por fila): no hay estado invisible que sobreviva a otra opción.
- [x] El diálogo no resetea con un efecto: se monta fresco (un draft obsoleto sería pérdida silenciosa).

---

## 8. Forms (§17–§22)

| Surface | §17.1 layout | §17.2 labels | §17.3 requerido | §17.4 helper | §18.1 timing | §18.2 copy | §18.3 error | §18.4 servidor | §19 save | §20 dirty | §22 ámbito |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Diálogo del efecto | una columna, secciones | visibles | `*` en los requeridos | donde previene un error (cantidad heredada, factor) | al confirmar | qué falta y cómo corregirlo | **focalizado** | el backend valida | **"Aplicar al grupo"** | **guarda de descarte** | el diálogo dice que el grupo guarda |

### Governed fields (§17.5)

| Surface | Valores gobernados | Texto libre | Guía de catálogo vacío |
|---|---|---|---|
| Diálogo del efecto | insumo (efecto y componente objetivo) | **no** | **sí** ("regístrelos en Inventario → Insumos") |

### No identifier inputs (§17.6)

| Surface | FK con selector | Texto libre pidiendo un id | Búsqueda flexible |
|---|---|---|---|
| Diálogo del efecto | los dos insumos | **no** | **sí** (parcial, sin acentos, nombre + unidad) |

**PASS.**

---

## 9. State coverage (§27–§32, §35)

| Surface | Vacío | Sin resultados | Error | Éxito | Toast | Honesto ante lo desconocido |
|---|---|---|---|---|---|---|
| Selector de insumo | mensaje con el próximo paso | "Sin resultados para «x». Pruebe con otra ortografía" | — | — | — | — |
| Diálogo | — | — | focalizado, `role="alert"` | el badge de la fila cambia (visible) | ninguno (no es un evento transitorio: es un estado de la fila) | el efecto no declarado dice "Solo precio" |

**PASS** — con una nota: el éxito de "Aplicar al grupo" **no** es un toast (sería ruido: el estado ya está visible en el badge), sino un cambio de estado en la fila.

---

## 10. Microcopy (§39)

- [x] Verbos: "Configurar", "Aplicar al grupo", "Seguir editando", "Descartar" — ninguno genérico.
- [x] No se explica lo que el encabezado ya dice.
- [x] Las advertencias dicen la consecuencia ("la venta se registra igual y el inventario no se ve afectado").
- [x] Sin vocabulario de implementación en el texto visible.

**PASS.**

---

## 11. Findings

### BX-001 — El diálogo descartaba los cambios en silencio
**Severity:** REQUIRED (§20) — **CERRADO**
**Surface:** diálogo del efecto
**CURRENT:** el botón Cancelar (y el Escape, y el clic afuera) cerraban el diálogo y **perdía** lo que el operador había escrito, sin aviso.
**EXPECTED:** §20 — si la navegación descartaría trabajo con significado, avisar antes, explicar qué se pierde y ofrecer quedarse.
**CORRECTION:** guarda de descarte: con cambios sin aplicar, el cierre **pregunta** ("¿Descartar los cambios del efecto?" / "Seguir editando" / "Descartar"); sin cambios, cierra directo.
**ACCEPTANCE:** `modifier-effect.test.tsx` — "§20 — asks before discarding the edits of the effect" y "§20 — a close without changes does not ask anything".

### BX-002 — El error no tomaba el foco
**Severity:** REQUIRED (§18.3) — **CERRADO**
**Surface:** diálogo del efecto
**CURRENT:** el error se renderizaba con `role="alert"` pero sin foco: un operador de teclado o de lector de pantalla no aterrizaba en la explicación.
**EXPECTED:** §18.3 — enfocar el error accionable.
**CORRECTION:** el párrafo del error recibe `tabIndex={-1}` y el foco tras el render.
**ACCEPTANCE:** cubierto por la aserción de foco del caso de rechazo.

### BX-003 — "Guardar efecto" mentía sobre lo que había pasado
**Severity:** REQUIRED (§19.1, §31) — **CERRADO**
**Surface:** diálogo del efecto
**CURRENT:** el botón decía "Guardar efecto", pero el efecto solo se **aplicaba** a la fila: el grupo es lo que lo persiste. El operador podía creer que estaba guardado.
**EXPECTED:** §19.1 — el usuario siempre sabe si los datos se guardaron.
**CORRECTION:** el botón dice **"Aplicar al grupo"** y el diálogo dice *"El efecto se aplica a la opción del grupo. Se guarda al actualizar el grupo."*
**ACCEPTANCE:** cubierto por la prueba del payload (el efecto llega al `updateOption` con el guardado del grupo).

### BX-004 — La nota de la garantía usaba la alerta neutra
**Severity:** REQUIRED (§26.1) — **CERRADO**
**Surface:** diálogo del efecto
**CURRENT:** la nota "Si el insumo no está registrado…" usaba la variante **neutra** de `Alert` (`border-border bg-card`): indistinguible de cualquier otra caja, es decir, un estado que no comunica estado.
**EXPECTED:** §26.1 — cada alerta lleva una variante semántica (success, warning, danger, info) con distinción perceptible.
**CORRECTION:** variante `info` (tinte + borde + icono).
**ACCEPTANCE:** `modifier-effect.test.tsx` — "§26.1 — the note carries a semantic variant, not the neutral default".

### BX-005 — La fila de opción se desbordaba de su grid de 12 columnas
**Severity:** REFINEMENT — **CERRADO**
**Surface:** fila de opción
**CURRENT:** la fila usaba las doce columnas exactamente (4+3+2+2+1). El badge y el botón del efecto las desbordaban a quince.
**EXPECTED:** §42.3/§42.5 — la estructura se mantiene legible; nada se corta ni se encoge.
**CORRECTION:** el efecto ocupa una **línea propia** dentro de la tarjeta de la fila (con borde superior), sin tocar el grid existente.
**ACCEPTANCE:** inspección del layout + suite verde.

### BX-006 — Las reglas están duplicadas entre backend y dashboard
**Severity:** +1 OPPORTUNITY (riesgo de deriva) — **ACEPTADO CON MITIGACIÓN**
**Surface:** modelo del efecto
**CURRENT:** el backend es la autoridad (§18.4) y el dashboard replica las reglas en español para responder sin ida y vuelta (§18.1). Es duplicación deliberada.
**EXPECTED:** §48 — consistencia; el riesgo real es la **deriva** entre las dos copias.
**CORRECTION:** ambos espejos tienen specs que fijan las **mismas** reglas (mismos casos: insumo faltante, cantidad faltante, insumo consigo mismo, factor faltante), de modo que una divergencia se ve en un test y no en producción. Documentado en L50.
**ACCEPTANCE:** `uom`/`effect` specs de ambos lados.

### BX-007 — El viewport angosto no se ha re-verificado
**Severity:** REFINEMENT — **PENDIENTE**
**Surface:** fila de opción + diálogo
**CURRENT:** el lote no incluye evidencia de viewport angosto; la fila ahora ocupa dos líneas.
**EXPECTED:** §45 — móvil legible, acciones críticas no recortadas.
**CORRECTION:** re-verificar en el rig durante la campaña M6.
**ACCEPTANCE:** captura en viewport angosto de la pantalla de Modificadores.

---

## 12. Verdict

**READY** — los cuatro hallazgos REQUIRED (BX-001 a BX-004) están cerrados con prueba, el refinamiento de layout (BX-005) está cerrado, y el modelo duplicado (BX-006) tiene su mitigación documentada. Queda una evidencia pendiente (BX-007, viewport angosto) que se cierra en la campaña del rig.

**Lo que esta auditoría NO cubre** (y conviene decirlo): la auditoría es de la **superficie del dashboard**. El consumo real del efecto —que el POS resuelva la demanda, que la nube la recalcule y compare, y que el kardex la trace— es M2 a M4 y se auditará cuando exista, con la campaña del rig como evidencia.
