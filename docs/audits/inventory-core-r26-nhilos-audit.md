# Núcleo de inventario (R26) — NHILOS Experience Audit

**Version:** 1.0
**Date:** 2026-10-19
**Auditor:** opencode (agente), bajo instrucción del owner
**Module:** Núcleo de inventario del backoffice — Insumos, Recetas, Productos, Compras, Kardex
**Module authority:** `docs/inventario_marco_normativo.md` (R-01..R-07), `docs/Product_Requirement_Document.md`, `odd/tasks/nucleo-inventario-remediacion-pre-integracion.md` (spec **S19**, tarea **R26**, log **L46**), `docs/DESIGN_BACKOFFICE.md` §2
**Standard:** `docs/nhilos/nhilos_backoffice_experience_standard_v1.0.md` (v1.0, APPROVED)
**Template:** `docs/nhilos/nhilos_backoffice_module_audit_template_v2.1.md`
**Routes/surfaces reviewed:** `/inventory?tab=insumos`, `/inventory?tab=compras`, `/inventory?tab=kardex`, `/recipes`, `/products`
**Evidence reviewed:** código fuente del backend y del dashboard, DTOs y contratos de ruta, suites de prueba (backend unit 4281 + e2e, dashboard vitest 1792), registro de transportes, y el diff de la rama `feat/inventory-count-session-persistence` (5 commits de R26)

**Alcance de esta auditoría:** no es una auditoría completa del módulo (esa la gobierna `nucleo-inventario-verificacion-pre-integracion.md`). Audita **lo que R26 tocó y lo dejóApplied**, contra las secciones aplicables del estándar. Cada PASS/FAIL cita la evidencia que lo demuestra (EX-18).

---

## 1. Module job (§4)

**Primary user:** el dueño/encargado del Food Park, frente al computador de la oficina, opera el inventario entre turnos.
**Primary job:** entender el estado del inventario y ejecutar las acciones de inventario de forma controlada (Insumos, Compras, Recetas, Kardex).
**Secondary users/jobs:** auditar movimientos (Kardex), costear platos (costo de receta), mantener el maestro de insumos y proveedores.
**Risk if wrong:** que el operador crea un insumo, una receta o una compra con una **unidad o un costo equivocados** → el inventario y el CPP quedan mal, y con ellos la valuación que el marco normativo exige poder sustentar (R-01, R-06).

---

## 2. Surface inventory (§6 Phase B)

| Surface | Route/component | Job | Read/write | Permissions | Evidence |
|---|---|---|---|---|---|
| Insumos | `/inventory?tab=insumos` → `insumos-tab.tsx` | mantener el maestro de insumos | RW | OWNER, MANAGER | `insumo.controller.ts` (`@Roles(OWNER, MANAGER)`) |
| Recetas | `/recipes` → `recipes-page.tsx` + `RecipeForm.tsx` | definir la BOM y su coste | RW | OWNER, MANAGER | `recipe.controller.ts` (`@Roles(OWNER, MANAGER)`) |
| Productos | `/products` → `product-page.tsx` | mantener el maestro de productos | RW | por rol | `product.controller.ts` |
| Compras | `/inventory?tab=compras` → `purchases-form.tsx` | registrar la compra de insumo | W | OWNER, MANAGER | `inventory-movement.controller.ts` |
| Kardex | `/inventory?tab=kardex` → `inventory-page.tsx` (`KardexTab`) | auditar los movimientos | R | OWNER, MANAGER | `inventory-reports.controller.ts` |
| Toast (compartido) | `components/ui/toast.tsx` | confirmar/error de una acción | R | n/a | `use-toast.ts` (`TOAST_LIMIT = 1`) |

---

## 3. Universal page anatomy check (§7)

| Surface | §7.1 dónde estoy | §7.2 qué puedo hacer | §7.3 qué estoy viendo | §7.4 qué requiere atención | §7.5 qué sigue |
|---|---|---|---|---|---|
| Insumos | título del tab + buscador | `Nuevo Insumo` (único CTA primario) | catálogo del tenant, buscador en URL (`q_insumos`) | `stock ≤ parLevel` en ámbar; `Inactivo` en badge neutro | editar / desactivar / reactivar desde la fila |
| Recetas | título "Recetas y BOM" + tabs Recetas/Sugerencias | `Crear Receta` / `Editar Receta` por tarjeta | productos compuestos del tenant | costo no disponible con su razón; producto inactivo | abrir la receta vigente |
| Compras | tab Compras | `Registrar compra` | proveedor, insumo, factura | IVA: costo con IVA bloqueado con su consecuencia | registrar / ver historial |
| Kardex | tab Kardex + rango de fechas | filtro por tipo, búsqueda, orden | rango local de Managua y tipo | `VALUATION_WRITEDOWN` en chip de advertencia | drill por producto |

**PASS** en las cinco superficies: no hay dos CTA de igual peso compitiendo, el alcance de datos es explícito y el próximo paso es evidente.

---

## 4. Information hierarchy check (§8)

| Surface | P0 domina | P1 presente | P2 no compite | Todo promovido a P0 |
|---|---|---|---|---|
| Recetas | el estado de la receta es el contenido de la tarjeta | costo/rendimiento/UoM | precio de venta en cuarta fila | no |
| Insumos | la tabla de insumos | conversión y par | badges de perecedero/IVA | no |
| Kardex | el movimiento | antes/después | motivo en segunda línea | no |

**PASS.**

---

## 5. Experience coverage matrix (EX-01 → EX-18) (§51)

| ID | Dimensión | Pregunta | Estado | Evidencia | Hallazgos |
|---|---|---|---|---|---|
| EX-01 | Core Promise | ¿El módulo hace bien su trabajo principal? | **PASS** | La compra convierte `q × factor` y `c ÷ factor` (`inventory-purchase.service.ts:771-789`); la receta persiste nombre, tipo, unidad y cantidad (`recipe.service.ts:190-215`); el Kardex devuelve el período pedido | BX-001 (cerrado) |
| EX-02 | Product Truth | ¿La UI refleja la semántica del dominio? | **PASS** | El costo mostrado es el **costo teórico** (misma cifra que *Costo por plato*), no el precio de catálogo; la tarjeta sin receta dice "Sin receta vigente" en vez de 0 | BX-001 (cerrado) |
| EX-03 | Precision | ¿Se pueden malinterpretar etiquetas o datos? | **PASS** | "Cantidad (LB)", "Costo unitario (C$ por LB)", "1 LB = 453.59237 G (el inventario se registra en G)"; el `—` significa no disponible y el motivo va al lado | — |
| EX-04 | Navigation | ¿El contexto viaja entre superficies? | **PARTIAL** | El buscador de Insumos vive en la URL (`q_insumos`); la grilla de Recetas **no** expone el producto seleccionado en la URL | BX-006 (refinamiento diferido) |
| EX-05 | Findability | ¿Se encuentran los objetos? | **PASS** | Búsqueda por nombre y UoM en Insumos; búsqueda por nombre/motivo/tipo en Kardex; `EntitySearchSelect` con búsqueda flexible en Recetas | — |
| EX-06 | Forms | ¿Los flujos de alta/edición son claros, seguros y recuperables? | **PASS** | El error de servidor **preserva el formulario** (`RecipeForm.tsx:198-206` no resetea estado); el guardado duplicado se bloquea (`isBusy`); el ámbito de la edición se declara | BX-005 (cerrado) |
| EX-07 | Actions | ¿Las consecuencias, el riesgo y el feedback son claros? | **PASS** | Desactivar un insumo declara objeto, consecuencia y reversibilidad (`insumos-tab.tsx:1085-1122`); el IVA declara la consecuencia de cargar con IVA | — |
| EX-08 | States | ¿Los estados son intencionales? | **PASS** | Grilla Recetas: durante la carga **no** afirma "Sin receta vigente" (`recipes-page.tsx:202-211`); el diálogo espera el snapshot (`recipes-page.tsx:296-306`); "Actualizando…" en refetch | BX-002 (cerrado) |
| EX-09 | Permissions | ¿La autorización es correcta de punta a punta? | **PASS** | Las dos rutas nuevas quedan bajo `Roles(OWNER, MANAGER)` + `AuthGuard` + `TenantInterceptor` y declaradas como transporte `human` en el registro de transportes | — |
| EX-10 | Time | ¿Se eliminó la re-entrada de contexto? | **PASS** | El UoM del insumo ya no se re-deriva: el formulario lo muestra desde el payload; la receta ya no exige transcribir el nombre del ingrediente | BX-001 (cerrado) |
| EX-11 | Sobriety | ¿Se quitó UI inútil? | **PASS** | Se borró la lista duplicada de factores; la grilla de Recetas deja de depender de una consulta por producto | — |
| EX-12 | Consistency | ¿Usa los patrones del backoffice? | **PASS** | Mismo formato de dinero que *Costo por plato* (`formatCurrency`), mismo rótulo "UoM" que Valuación y COGS, mismo badge neutro para `Inactivo` | BX-003, BX-004 (cerrados) |
| EX-13 | Microcopy | ¿El lenguaje es preciso, calmo y accionable? | **PASS** | "Este control NO calcula el IVA: declara de dónde viene el número que usted ingresa"; "Receta guardada" (no "Éxito") | BX-004 (cerrado) |
| EX-14 | Accessibility | ¿Se puede completar el flujo con teclado/lector? | **PASS** | La columna UoM es `th`/`td` real; el error de insumo es `role="alert"` con foco; el select de UoM es el componente de la casa; la，总结 "Cargando…" es texto legible | — |
| EX-15 | Responsive | ¿El comportamiento soportado sigue usable? | **NOT_EVIDENCED** | No se re-verificó en viewport angosto dentro de este lote | BX-007 (evidencia pendiente) |
| EX-16 | Performance | ¿El comportamiento técnico sostiene la calidad percibida? | **PASS** | La grilla hace **una** consulta para toda la lista (`GET /recipes/active`) en vez de una por producto; el catálogo de plataforma se cachea 1 h | — |
| EX-17 | +1 | ¿Hay una mejora útil y sostenible? | **PASS** | Lectura en vivo del costo neto en Compras; "Actualizando…" en la grilla; factor derivado del catálogo | — |
| EX-18 | Evidence | ¿Cada PASS/FAIL se puede demostrar? | **PASS** | Cada corrección del lote tiene prueba: `uom-catalog.spec` (18), `recipe.service.spec` (+2), `recipe-routes.e2e` (assert de `ingredient_name`), `inventory-reports.service.spec` (día local), `insumos-manage` (453.59237), `w7-recipes` (+3) | — |

---

## 6. Conflict resolution (§0.1)

| Conflicto | Autoridad de producto | Estándar | Resolución |
|---|---|---|---|
| La superficie de éxito del toast era pálida (R18) | R18 (L37) fijó el emparejamiento pálido `secondary-50` / `secondary-700` | §26.1: *"An alert whose state cannot be perceived does not communicate state"* | **Resuelto a favor del estándar, con el owner como autoridad:** el owner reportó el toast como "caja en blanco" — la señal de estado era imperceptible. La superficie pasó a **sólida** (`secondary-700` + texto blanco, 9.29:1), el mismo contrato del badge de éxito. R18 se modifica en la capa de toast, no en el resto del vocabulario de estado. Sin `AUTHORITY_CONFLICT`: el owner es la autoridad final del producto y su reporte es explícito. |
| El costo de receta se muestra con 2 decimales | El backend lo calcula con 4 (`roundPurchaseCpp`) | §34 "consistent decimals" | **Aceptado:** la convención de dinero del módulo (Insumos, Valuación, Costo por plato) es `formatCurrency` con 2 decimales. Se **eliminó la divergencia** (la tarjeta recetaba "12.5 NIO" y la otra superficie "C$12.50" para la misma cifra) adopting la convención existente, sin inventar una tercera. La cifra cruda sigue con 4 decimales en el wire. |

---

## 7. Contextual navigation map (§9, §10)

| Source | Trigger | Destination | Context carried | Preserved on arrival | Preserved on return | Estado |
|---|---|---|---|---|---|---|
| Insumos | buscar | `/inventory?tab=insumos&q_insumos=…` | término de búsqueda | el término visible en el input | sí (URL) | PASS |
| Recetas | "Editar Receta" | diálogo de receta de ese producto | `productId` | la receta vigente cargada | — | PASS |
| Kardex | mover/filtro | `/inventory?tab=kardex&from=…&to=…` | rango y tipo | rango visible en el picker | sí (URL) | PASS |

### Navigation checklist (§9, §10, §13, §14, §25)

- [x] El contexto que el sistema ya conoce no se reingresa a mano (§9.1) — el UoM del insumo, el nombre del ingrediente y el costo de la receta llegan del backend.
- [x] Ningún enlace accionable cae en una lista genérica (§9.2).
- [x] Los enlaces contextuales son contratos (§9.3).
- [~] URL-first (§9.4) — el filtro de Insumos y el rango del Kardex viven en la URL; **el producto seleccionado de la grilla de Recetas no** → BX-006.
- [x] Listado/detalle/vuelta conserva el estado de trabajo (§10).
- [x] El término de búsqueda sigue visible (§13.1).
- [x] Los filtros persisten en la ida y la vuelta (§14.3).
- [x] Los filtros deep-linked son visibles (§14.4).
- [x] El estado de tab es direccionable por URL (§25) — `?tab=kardex`, `?tab=insumos`.

---

## 8. Lists and data tables (§12)

| Surface | §12.2 columnas intencionales | §12.2 sin IDs internos | §12.3 alineación numérica | §12.4 clic de fila | §12.5 acciones proporcionales | §12.5 destructivo separado |
|---|---|---|---|---|---|---|
| Insumos | PASS (7 columnas) | PASS | PASS (`tabular-nums`) | n/a (fila con botones) | PASS (editar + apagar) | PASS (apagado con su diálogo) |
| Kardex | PASS — la nueva columna **UoM** justifica su permanencia: una cantidad y un costo unitario sin unidad no son cifras revisables | PASS | PASS | n/a | n/a | n/a |
| Recetas | PASS (4 cifras de la receta) | PASS | PASS | la tarjeta es clicable (selección) | PASS (`Crear`/`Editar`) | n/a |

---

## 9. Filters (§14), Sorting & pagination (§15)

| Surface | §14.1 estado visible | §14.2 reset | §14.3 persiste | §14.4 deep-link visible | §15 orden visible | §15 paginación X–Y de Z |
|---|---|---|---|---|---|---|
| Insumos | campo de búsqueda visible | botón de limpiar | sí (URL) | sí | n/a | n/a |
| Kardex | chips de tipo + picker de rango | rangos predefinidos | sí (URL) | sí | PASS (`aria-sort` + flecha) | PASS ("Mostrando X–Y de Z") |
| Compras | filtros de rango/proveedor/insumo | por filtro | sí | sí | n/a | n/a |

**PASS.**

---

## 10. Forms (§17–§22)

| Surface | §17.1 layout | §17.2 labels visibles | §17.3 requerido explícito | §17.4 helper útil | §18.1 timing | §18.2 copy accionable | §18.3 error de formulario | §18.4 el backend manda | §19 save | §19.2 copy | §20 dirty state | §21 create | §22 edit scope |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Insumos | PASS | PASS | PASS (`*`) | PASS (factor, IVA) | PASS (blur) | PASS (copy de negocio del backend) | PASS (banner + foco) | PASS | PASS | PASS ("Insumo creado") | PASS (descartar cambios) | PASS | PASS |
| Recetas | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | **PASS (corregido)** | PASS | PASS | **PASS (corregido)** |
| Compras | PASS | PASS | PASS | PASS (UoM, IVA) | PASS | PASS | PASS | PASS (guarda de IVA) | PASS | PASS ("Compra registrada") | PASS | PASS | n/a |

### Governed fields (§17.5)

| Surface | Valores gobernados por catálogo | Texto libre donde hay catálogo | Guía de catálogo vacío |
|---|---|---|---|
| Insumos | UoM de compra y de consumo: selector del catálogo compartido (`insumos-tab.tsx:749-809`) | **no** | **sí** — "Sembrar unidades por defecto" / "Agrégala en Catálogos" (`insumos-tab.tsx:811-846`) |
| Producto | UoM y categoría: selector del catálogo, ahora **solo valores activos** | **no** | n/a (el catálogo se siembra desde Catálogos) |
| Compras | insumo y proveedor: selector con búsqueda | **no** | n/a |

**PASS.** Con el cambio de R26, una unidad registrada por el tenant en Catálogos es además **usable** como UoM de insumo (antes la guarda la rechazaba) — el catálogo deja de ser decorativo y pasa a ser la fuente real del vocabulario.

### No identifier inputs (§17.6)

| Surface | FK con selector | Texto libre pidiendo un identificador | Búsqueda flexible |
|---|---|---|---|
| Recetas | ingrediente y versión de referencia: `EntitySearchSelect` | **no** | sí (varias columnas, tolerante a acentos y parciales) |

**PASS** — y con evidencia de guardia permanente: `src/__tests__/no-uuid-inputs.test.ts` (suite del repo, verde).

---

## 11. Destructive / high-risk actions (§23)

| Action | Riesgo | §23.1 confirmación proporcional | Objeto/consecuencia/reversibilidad/alcance | §23.3 verbo explícito | §23.4 confirmación escrita | §23.2 sin sobre-confirmar | AP-19 efecto colateral explicado |
|---|---|---|---|---|---|---|---|
| Desactivar insumo | bajo (reversible) | diálogo | **sí** (objeto, consecuencia, reversibilidad) | "Desactivar insumo" | no | sí | sí |
| Desactivar producto | bajo | diálogo | sí | "Desactivar" | no | sí | sí |
| Costo de compra **con** IVA | medio (sobrevalúa el inventario) | bloque explicativo + rechazo | sí: "sobrevalúa las existencias en un 15%" | — | no | sí | **sí** — es exactamente el efecto colateral forbidden por NIC 2 §23-25, y se explica |

**PASS.**

---

## 12. State coverage (§27–§32, §35)

| Surface | §28.1 carga | §28.2 parcial | §28.3 refetch | §28.4 sin auto-refresh | §29 first-use | §29 filtered | §30 error (5 preguntas) | §30.1 conserva contexto | §30.3 detalle técnico fuera de la pantalla | §31 success calmo + siguiente paso | §32 toast transitorio, no apilado | §27 honesto ante parcial/desconocido | §35 frescura |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Insumos | PASS | PASS | PASS | PASS | PASS ("No hay insumos registrados aún…") | PASS (término visible + limpiar) | PASS | PASS (filtros y formulario intactos) | PASS (`getApiErrorMessage` filtra el texto de class-validator) | PASS | PASS (`TOAST_LIMIT = 1`) | PASS | n/a |
| Recetas | PASS | PASS | **PASS (corregido: "Actualizando…")** | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | **PASS (corregido: nunca afirma "Sin receta vigente" sin saberlo)** | n/a |
| Compras | PASS | PASS | PASS | PASS | PASS | n/a | PASS | PASS (el formulario se conserva) | PASS | PASS | PASS | PASS | n/a |
| Kardex | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | n/a | PASS | PASS | PASS (`FreshnessBadge`) |

### State vocabulary (§27)

- [x] Términos consistentes: `Activo` / `Inactivo` en Insumos, Recetas y Producto.
- [x] Sin sinónimos del mismo estado.
- [x] **Un estado neutro de ciclo de vida no se pinta como excepción:** corregido en la grilla de Recetas (el producto inactivo llevaba badge `destructive`; ahora lleva el badge neutro, igual que la tabla de Insumos) → BX-003.
- [x] `—` significa no disponible, nunca cero: el costo de receta no disponible muestra `—` y la razón al lado; el UoM ausente del Kardex muestra `—`.
- [x] Colores de badge semánticos.

**PASS.**

---

## 13. Microcopy (§39)

### Buttons (§39.1)

| Surface | Verbos | Genéricos evitados | Nombre accesible |
|---|---|---|---|
| Insumos | "Nuevo Insumo", "Guardar Cambios", "Crear Insumo", "Desactivar insumo", "Sembrar unidades por defecto" | "OK"/"Aceptar"/"Continuar" | iconos con `aria-label` (`Editar insumo`, `Desactivar insumo`) |
| Recetas | "Crear Receta", "Editar Receta", "Agregar Ingrediente", "Guardar Cambios" | idem | idem |
| Compras | "Registrar compra", "Desactivar proveedor" | idem | idem |
| Kardex | "Anterior", "Siguiente" | idem | idem |

### Warnings (§39.3)

- [x] Declaran la **consecuencia**: "Cargar el costo con IVA sobrevalúa las existencias en un 15%".
- [x] Sin lenguaje de miedo.

### Technical terms (§39.4)

- [x] El error de la guarda de conversión es copy de negocio: *"Factor inválido para 'libra' → 'gramos': el catálogo establece 453.59237 (recibido 454)"* — el operador puede actuar con ella. El texto crudo de class-validator **nunca** llega a la pantalla (`api-error.ts` filtra el arreglo `message`).
- [x] Sin identificadores internos en el texto visible. El `product_id` que el formulario de receta ya no transcribe (el selector lo resuelve) es el que la §17.6 prohibía.

**PASS.**

---

## 14. Findings

### BX-001 — El nombre del ingrediente se descartaba y la receta no mostraba sus propias cifras
**Severity:** BLOCKER (pérdida de datos + verdad de negocio incorrecta) — **CERRADO** en `c07960c4`
**Standard:** §4.1, §17.6, §18.4, EX-01, EX-02
**Surface:** `/recipes` + `POST /recipes/products/:productId/versions`
**CURRENT (medido):** el controller validaba `ingredientName` y lo **descartaba**; `recipe_details.ingredient_name` quedaba `NULL`; el formulario reenviaba `""` y el DTO respondía 400. La tarjeta mostraba `products.sell_price/stock/uom` (columnas de catálogo que la receta nunca toca) y la grilla consultaba la receta **solo del producto seleccionado**, de modo que "Editar Receta" abría un formulario vacío.
**EXPECTED:** la receta guarda y edita sin pérdida, y la tarjeta muestra las cifras de la receta.
**CORRECTION:** el servidor resuelve el nombre desde el insumo (o el producto, si es `SUB_RECIPE`) y lo persiste; el DTO lo vuelve opcional; nueva ruta `GET /recipes/active` con el costo teórico, el rendimiento y el UoM de toda la grilla; el diálogo espera el snapshot antes de renderizar el formulario.
**ACCEPTANCE:** `recipe.service.spec` (nombre resuelto y fallback), `recipe-routes.e2e` (assert de `ingredient_name` persistido), `w7-recipes` (la grilla muestra el costo y el rendimiento de la receta).

### BX-002 — La grilla afirmaba "Sin receta vigente" antes de saberlo
**Severity:** REQUIRED (AP-02, desconocido presentado como hecho) — **CERRADO** en el commit de auditoría
**Standard:** §27, §28.2, §29, AP-02
**Surface:** `/recipes`
**CURRENT:** mientras la lista de recetas activas cargaba, cada tarjeta afirmaba "Sin receta vigente" y ofrecía "Crear Receta" — unUnknown convertido en veredicto.
**EXPECTED:** mientras no se sabe, no se afirma; y no se ofrece una acción sobre una suposición.
**CORRECTION:** durante la carga la tarjeta no declara el veredicto y no ofrece el CTA; al resolverse, declara el estado real.
**ACCEPTANCE:** `w7-recipes` — "never claims 'Sin receta vigente' while the recipe list is still loading (AP-02)".

### BX-003 — El producto inactivo se pintaba como excepción
**Severity:** REQUIRED (§26) — **CERRADO** en el commit de auditoría
**Standard:** §26, AP-20
**Surface:** `/recipes`
**CURRENT:** `Badge variant="destructive"` para un producto inactivo — un estado neutro de ciclo de vida reportado como problema. La tabla de Insumos ya lo hacía bien (badge neutro, con el comentario que lo explica).
**EXPECTED:** `INACTIVE` es un estado quieto, no una excepción.
**CORRECTION:** badge neutro (`secondary`) para el producto inactivo.
**ACCEPTANCE:** `w7-recipes` — "treats INACTIVE as a neutral lifecycle state, not an exception (Nhilos §26)".

### BX-004 — Copy y formato que no correspondían al estándar
**Severity:** REQUIRED (§19.2, §26.1, §34, §48) — **CERRADO** en los commits de R26 + auditoría
**Standard:** §19.2, §26.1, §34, §39, §48
**Surface:** `RecipeForm`, `purchases-form.tsx`, `components/ui/toast.tsx`, `/recipes`
**CURRENT (antes del cierre):** (a) el toast de éxito de la receta decía "Éxito" (genérico); (b) el toast de "Proveedor creado" en Compras usaba la variante **neutra** — una caja blanca, el mismo defecto que el owner reportó; (c) la tarjeta de Recetas mostraba el costo con `formatNumber` + " NIO" mientras *Costo por plato* mostraba la **misma cifra** con `formatCurrency` — dos formatos para un número; (d) el icono del bloque de IVA usaba `text-emerald-600` (paleta cruda) en un bloque reescrito.
**EXPECTED:** §19.2 (copy específico), §26.1 (variante semántica perceptible), §34 y §48 (decimales y formato consistentes), y el vocabulario de estado en tokens (R18).
**CORRECTION:** "Receta guardada" con el detalle de qué se guardó; `variant: "success"` en el toast de proveedor; `formatCurrency` para todo dinero en la tarjeta; `text-secondary-700` en el icono.
**ACCEPTANCE:** `toast-success-contrast` (superficie sólida, nunca `bg-secondary-50`); suite del dashboard completa verde.

### BX-005 — La edición de receta no declaraba su alcance
**Severity:** REQUIRED (§22) — **CERRADO** en el commit de auditoría
**Standard:** §22, AP-19
**Surface:** `RecipeForm` en modo edición
**CURRENT:** el diálogo decía "Modifique los ingredientes, cantidades y rendimiento de la receta" y bloqueaba el número de versión, sin explicar que al guardar se **publica una versión nueva** y la anterior queda como historial (y deja de consumirse).
**EXPECTED:** el alcance de la edición se declara, en especial cuando tiene consecuencias históricas.
**CORRECTION:** línea explícita en la tarjeta de versión: "Al guardar se publica la versión N. La versión anterior queda como historial y deja de consumirse; ninguna versión se borra."
**ACCEPTANCE:** `w7-recipes` — "states the scope of the edit: a new version, the previous one kept as history (Nhilos §22)".

### BX-006 — La grilla de Recetas no es direccionable por URL
**Severity:** REFINEMENT (+1) — **DIFERIDO**
**Standard:** §9.4, §10
**Surface:** `/recipes`
**CURRENT:** el producto seleccionado y el término de búsqueda viven en memoria transitoria; recargar o compartir la URL pierde el contexto.
**EXPECTED:** los filtros con significado sobreviven al refresh y al enlace de soporte.
**CORRECTION:** llevar la búsqueda (y, si el módulo lo confirma, la selección) a `useSafeSearchParams`, como ya hace la tabla de Insumos con `q_insumos`.
**ACCEPTANCE:** pendiente — no es bloqueante para este lote.

### BX-007 — Viewport angosto no re-verificado en este lote
**Severity:** REFINEMENT — **EVIDENCIA PENDIENTE**
**Standard:** §45, EX-15
**Surface:** las cinco superficies
**CURRENT:** el lote no incluye evidencia de viewport angosto; la columna UoM del Kardex añade una columna a una tabla con scroll horizontal, y la tarjeta de Recetas gana una fila de cifras.
**EXPECTED:** mobile/read sigue siendo usable; los Actions críticos no se recortan.
**CORRECTION:** re-verificar en el rig durante la campaña del owner (las tablas ya viven en un contenedor `overflow-x-auto`).
**ACCEPTANCE:** captura en viewport angosto de Insumos, Recetas, Compras y Kardex.

---

## 15. +1 opportunities (§49 / Phase G)

1. **+1.12 — el costo neto, visible antes de guardar.** El bloque de Compras ya muestra la lectura en vivo; el mismo tratamiento podría aplicarse a la vista previa del CPP (que hoy no cambia con el toggle de IVA porque el backend no lo lee) — requiere decisión de producto, no de UI.
2. **+1.1 — "Ver movimientos" desde la tarjeta de Recetas.** El insumo de una receta podría llevar al Kardex filtrado por ese insumo y ese producto (§9.2, §24.1), como ya se hace en otros módulos. Hoy no existe esa relación en la UI.
3. **+1.8 — no re-ingerir el nombre del ingrediente.** Con el nombre resuelto por el servidor, el selector de la receta podría mostrar solo lo que el operador no puede saber (cantidad y merma) y dejar el nombre como contexto de solo lectura.

---

## 16. Required fixes (pendientes)

| ID | Severidad | Estado |
|---|---|---|
| BX-001 | BLOCKER | ✅ cerrado (`c07960c4`) |
| BX-002 | REQUIRED | ✅ cerrado (commit de auditoría) |
| BX-003 | REQUIRED | ✅ cerrado (commit de auditoría) |
| BX-004 | REQUIRED | ✅ cerrado (R26 + commit de auditoría) |
| BX-005 | REQUIRED | ✅ cerrado (commit de auditoría) |
| BX-006 | REFINEMENT | ⏸ diferido |
| BX-007 | REFINEMENT | ⏸ evidencia pendiente del rig |

---

## 17. Acceptance tests (§52.10)

| Test | Archivo | Qué fija |
|---|---|---|
| UOM del tenant aceptada / factor-1 y unidad desconocida rechazados | `apps/admin_backend/src/modules/inventory/uom-catalog.spec.ts` | §17.5 (catálogo gobernado) + la guarda de conversión |
| Nombre del ingrediente resuelto y persistido | `apps/admin_backend/src/modules/inventory/recipe.service.spec.ts` | BX-001 |
| `ingredient_name` persistido de punta a punta | `apps/admin_backend/test/inventory/recipe-routes.e2e-spec.ts` | BX-001 |
| Kardex: límites de día local de Managua | `apps/admin_backend/src/modules/inventory/services/inventory-reports.service.spec.ts` | EX-01 (el período pedido es el período devuelto) |
| Factor 453.59237 en el formulario y en el envío | `apps/owner_dashboard/src/__tests__/insumos-manage.test.tsx` | EX-03 |
| Superficie de éxito sólida, nunca `bg-secondary-50` | `apps/owner_dashboard/src/__tests__/toast-success-contrast.test.tsx` | §26.1 / BX-004 |
| Cifras de la receta en la grilla; "Editar" solo donde hay receta | `apps/owner_dashboard/src/__tests__/w7-recipes.test.tsx` | BX-001, EX-02 |
| "Sin receta vigente" nunca sin saberlo | `apps/owner_dashboard/src/__tests__/w7-recipes.test.tsx` | BX-002 / AP-02 |
| Badge neutro del producto inactivo | `apps/owner_dashboard/src/__tests__/w7-recipes.test.tsx` | BX-003 / §26 |
| Ámbito de la edición declarado | `apps/owner_dashboard/src/__tests__/w7-recipes.test.tsx` | BX-005 / §22 |
| Sin inputs de identificador | `apps/owner_dashboard/src/__tests__/no-uuid-inputs.test.ts` | §17.6 |
| Vocabulario de estado en tokens | `apps/owner_dashboard/src/__tests__/design-token-vocabulary.test.ts` | §42.1 / R18 |

---

## 18. Verdict

**READY_AFTER_REQUIRED_FIXES** → los cinco hallazgos REQUIRED/BLOCKER (BX-001 a BX-005) están cerrados con prueba; quedan **BX-006** (refinamiento: URL de la grilla) y **BX-007** (evidencia de viewport angosto) como pendientes no bloqueantes, más la re-verificación en el rig que el owner tiene planificada.

Notas de despliegue que condicionan el veredicto:

- `GET /inventory/uom-catalog` es una **ruta nueva**: backend y dashboard deben ir juntos. Un dashboard nuevo contra un backend viejo se queda sin presets (muestra la pista honesta, nunca un factor inventado) — degradación segura, pero no la experiencia pedida.
- La grilla de Recetas depende de la ruta nueva `GET /recipes/active`: un dashboard nuevo contra un backend viejo no tendría las cifras de la receta (la tarjeta volvería al estado honesto "Sin receta vigente"). Misma regla: **juntos o ninguno**.
