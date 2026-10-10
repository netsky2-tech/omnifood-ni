# Regla: ningún input con UUID — todo formulario que referencie otra tabla usa un selector con búsqueda textual flexible

- **Status:** EN EJECUCIÓN
- **Rama / worktree:** `fix/no-uuid-inputs` en `~/omnifood-ni-uuid-inputs`, desde `main` = `4ec86f47` (incluye #850, #854 y #856).
- **Origen:** decisión del usuario (2026-10-10), disparada por un hallazgo real: el formulario de promociones exponía `target_product_id` como **campo de texto libre para un UUID** (§17.5 del estándar: el sentido del control tiene que corresponder a su dato). El usuario lo elevó a **regla del proyecto y parte del estándar NHILOS**, no a un arreglo suelto.
- **Por qué importa más que el arreglo:** un `input` de UUID es la superficie donde el operador **transcribe un identificador que no conoce**. Garantiza error de tipeo, cero descubrimiento y datos cruzados entre filas. Y es una clase, no un caso: hay varios formularios del backoffice con la misma forma.

---

## 1. La regla

> **No puede haber inputs con UUID. Todo formulario que necesite usar registros de otras tablas debe ser un selector con búsqueda textual flexible — textual por varias columnas.**

Se sostiene con cuatro piezas, y ninguna es opcional:

1. **Enmienda al estándar** (`docs/nhilos/nhilos_backoffice_experience_standard_v1.0.md`) y a la plantilla de auditoría (`..._module_audit_template_v2.1.md`): la regla, su porqué y **qué se considera "búsqueda flexible"** — varias columnas, tolerante a mayúsculas/acentos/parciales, no un `id` ni un `name` exacto. Un selector que sólo busca por nombre exacto cumple la forma y viola el espíritu.
2. **Un guard verificable** — del mismo tipo que el de controllers huérfanos o el de `suite-layout`: un test que **falle** cuando un formulario del backoffice exponga un input de UUID (`type="text"` cuyo nombre/etiqueta apunte a `*_id`, o un `id` con formato UUID hardcodeado en el copy). La regla se sostiene con un test, no con buenas intenciones.
3. **Un selector reutilizable** — un componente con la búsqueda flexible y los estados que el estándar exige (carga, vacío legítimo, vacío por filtro, error, sin resultados), para que cada formulario no invente el suyo ni repita el problema.
4. **Aplicarlo** a los formularios que hoy tienen el vicio, empezando por **promociones** (`target_product_id`), y barrer los candidatos del dashboard.

## 2. Alcance: los candidatos a barrer

Medido en el dashboard (`apps/owner_dashboard`):

| Formulario | Campo | Estado |
|---|---|---|
| `features/promotions/PromotionForm.tsx` | `target_product_id` | **confirmado**: texto libre para un UUID |
| `features/recipes/RecipeForm.tsx` | insumos / producto | a verificar |
| `features/modifiers/*` | `product-exceptions.tsx`, `effective-types` | a verificar |
| `features/inventory/purchases-form.tsx` | insumo / producto | a verificar |
| `features/catalog/*` | categoría / unidad | a verificar |
| `features/loyalty/*` | recompensa de producto (`FREE_PRODUCT`) | a verificar |

**Bloqueo estructural del primer caso:** el dashboard **no tiene superficie de catálogo** — sus hooks son sólo `use-auth`, `use-promotions`, `use-toast`, `use-user`. Un selector gobernado de productos necesita **consultar productos por texto**, o sea una **superficie de query nueva** (hook + endpoint). Eso es una decisión de arquitectura, no un parche de formulario.

## 3. Slices de trabajo

- [ ] **S1 · La regla es enforceable:** enmienda al estándar + al template de auditoría + el **guard** que falla ante un input de UUID, con su RED (el guard debe fallar HOY contra `target_product_id` y pasar cuando se arregle).
- [ ] **S2 · El selector:** componente reutilizable con búsqueda textual por varias columnas + los estados del estándar + sus tests (incluye el caso "muchos resultados" y el "sin resultados").
- [ ] **S3 · La superficie de consulta:** el endpoint/hook de búsqueda de productos (con su contrato, su paginación/limite y su RLS por tenant), y la decisión de dónde vive (¿`/products?search=`, que ya existe en el backend, o uno dedicado?).
- [ ] **S4 · Promociones queda *ready*:** `target_product_id` con el selector, y la promoción se crea y se activa desde la web de punta a punta (es lo que cierra el **ítem 2A de la ronda S23**).
- [ ] **S5 · El barrido:** los demás candidatos de la tabla, con el guard como red.
- [ ] **S6 · Follow-up de #856:** `UpdatePromotionDto.start_date/end_date` en `src/types/promotions.ts:68-69` sigue tipado `number` mientras el contrato acepta `null`; ensanchar a `number | null` y sacar el cast local que usó la corrección.

## 4. Gates

| Gate | Comando | Criterio |
|---|---|---|
| Guard | el test nuevo de la regla | **RED hoy** contra `target_product_id`, verde tras S4 |
| Tipos / lint | `npx tsc -b --noEmit` · `npx oxlint src` | 0 errores |
| Suites | `npx vitest run` de los archivos tocados, `--no-file-parallelism` | verdes |
| Backend (si S3) | los specs del endpoint con `--maxWorkers=2` | verdes |

## 5. Decisiones abiertas (necesitan al usuario, no al agente)

1. **El selector: ¿buscador con lista, o combobox con teclado?** El estándar fija el comportamiento; la forma exacta (modal de búsqueda vs. combobox inline) es UX de producto.
2. **S3: ¿reusar `GET /products?search=`** (que ya existe y el POS consume) **o crear uno dedicado** para el backoffice? Reusar es menos código y más riesgo de acoplar contratos de terminal y de panel.
3. **¿El guard bloquea el merge o avisa?** Si bloquea, hay que arreglar todos los candidatos del barrido en el mismo PR; si avisa, se hace por etapas. Recomendación del agente: **bloquea**, pero con una lista de excepciones explícita y con fecha — una regla que se puede ignorar en silencio no es una regla.
