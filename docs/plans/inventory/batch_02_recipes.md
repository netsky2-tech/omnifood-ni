# Batch 2: ADN del Plato (Recipes & BOM) — Remediación

Definir cómo se componen los productos finales a partir de insumos. **Remedia** el módulo de recetas existente (con comparador de versiones) y completa el vínculo histórico de versiones.

> **Estado:** Parcial-alto. Slice 2.1 (PR #34) y Slice 2.2 (PR #36) mergeados. Resta ingesta backend de recipe-version (limpieza pre-Batch 3 recomendada), BOM multi-nivel versionado completo, UI jerárquica profunda y CPP teórico (→3b).

## Estado actual
- `RecetaEntity`/`RecetaDetalleEntity` existen con soporte de sub-recetas anidadas.
- CRUD de recetas y comparador de versiones funcionales.

### Progreso por slice

| Slice | Estado | PR | Entregado |
|-------|--------|----|-----------|
| 2.1 — Vínculo histórico `recipeVersionId` | ✅ Mergeado | #34 | `recipeVersionId` per-line persistido en POS (`invoice_items`, Floor migration 21→22) y backend (TypeORM migration); resolución al momento de venta; binding venta/reversal de movimientos; void atómico POS (Floor `@transaction`); validación tenant/product backend; tests de persistencia + no-recompute de versiones históricas. |
| 2.2 — BOM versionado gross/yield + UOM | ✅ Mergeado | #36 | `MovementEngine` consume `grossQuantity` del documento versionado escalado por `saleQuantity/yieldQuantity`; valida `yieldQuantity>0`, `grossQuantity>0`, `technicalShrinkPct` en [0,100) y `netQuantity == gross*(1-shrink/100)` a 4dp antes de generar movimientos; `componentUom` + compatibilidad de UOM contra unidad base de consumo; CI focused-test gate. |

## Brechas a remediar
- [x] **Vínculo histórico de versión (UC-05)**: cada venta/producción debe guardar el `id_receta_version` con el que se cocinó, para que el recosteo histórico sea exacto. *(Slice 2.1 — per-line `recipeVersionId` persistido en POS y backend; resuelto al momento de la venta.)*
- [ ] Cálculo de costo teórico basado en CPP actual — confirmar integración con el motor CPP (Batch 3b). **No es prerequisito de 3a.**
- [x] **Explosión BOM con cantidad bruta vs neta y factor de rendimiento validados.** *(Slice 2.2 — validación de `yieldQuantity`/`grossQuantity`/`technicalShrinkPct`/`netQuantity` a 4dp + compatibilidad de UOM del componente contra la unidad base de consumo del insumo.)*

## Alcance técnico

### Entidades y relaciones
- `RecetaEntity`: cabecera que vincula un `ProductoVenta` con sus componentes.
- `RecetaDetalleEntity`: desglose de insumos o sub-recetas (relación jerárquica multi-nivel).

### Lógica de explosión (BOM)
- `Cantidad Neta = Cantidad Bruta * (Factor Rendimiento / 100)`.
- Costo del plato = suma del costo de cada insumo (proporcional a cantidad bruta) según CPP vigente.

### Versionamiento (UC-05)
- Las recetas NO se borran: campo `fechaVencimiento`/`estaActiva`.
- **Obligatorio**: el documento de origen (ticket/orden de producción) referencia el `id_receta_version` vigente al momento del movimiento.

## DoD (Criterios de aceptación)
- [~] CRUD de recetas con múltiples ingredientes y sub-recetas anidadas. → CRUD + comparador existen con sub-recetas anidadas; explosión versionada multi-nivel completa diferida.
- [~] Selector de insumos/sub-recetas. → Existe en el CRUD/comparador; selector de UOM por componente diferido (Slice 2.2 captura `componentUom` automáticamente).
- [ ] Algoritmo de costo teórico basado en CPP actual. → Depende de Batch 3b; **no es prerequisito de 3a**.
- [x] Migraciones para `recetas`/`receta_detalles`. → Existentes (entidades en Flutter y backend).
- [x] Vínculo `id_receta_version` persistido en ventas y producciones (test que demuestre recosteo histórico estable tras cambiar la receta). *(Slice 2.1 — per-line binding en `invoice_items` POS y backend; tests cubren persistencia, resolución al momento de venta y no-recompute de versiones históricas.)*

## Limpieza pre-Batch 3 recomendada

- [ ] **Ingesta de versiones de receta en el backend**: el POS sincroniza hacia `/inventory/recipes/versions` (incluyendo `componentUom` en el payload), pero el backend aún no expone un controlador que la consuma. La validación/conversión de UOM del lado backend queda diferida a ese endpoint. → **Ítem #2 de la limpieza pre-Batch 3 del roadmap.**

## Diferido de Slice 2.1 (no sobre-construir)

Los siguientes elementos se identificaron durante Slice 2.1 pero se deferan para no exceder el alcance del slice:

- **Explosión BOM versionada multi-nivel completa (POS)**: el `MovementEngine` usa el `RecipeVersionDocument` solo en el nivel superior (depth 0) cuando se provee `recipeVersionId`. Las sub-recetas continúan usando la tabla simple `recipes`. La explosión multi-nivel versionada completa (usando `referenceVersionId` de los componentes versionados) requiere un cambio más profundo en el motor y se deferirá.
- **Explosión BOM multi-nivel en el backend**: `BomExplosionService.explode()` es single-level (itera `snapshotComponents` directamente). La explosión multi-nivel con resolución recursiva de sub-recetas versionadas se deferirá.
- **UI de sub-recetas multi-nivel**: el comparador de versiones y CRUD de recetas existentes manejan sub-recetas, pero una UI completa para edición/visualización jerárquica profunda queda pendiente.
- **Integración CPP con recosteo histórico**: el costo teórico basado en CPP actual (DoD pendiente) depende del Batch 3b (motor CPP).
- **Validación de compatibilidad de unidades**: la regla "las unidades en la receta deben ser compatibles con la unidad base del insumo" no se implementó en este slice. *(Cubierto en Slice 2.2.)*

## Diferido de Slice 2.2 (no sobre-construir)

Slice 2.2 corrige la matemática de cantidad de la explosión BOM versionada (bruta + rendimiento) y añade validación de compatibilidad de UOM. Los siguientes elementos se identificaron pero se deferan:

- **Costo teórico CPP**: el cálculo de costo teórico basado en CPP actual sigue pendiente; es dependencia del Batch 3b. Slice 2.2 no toca costing. **No es prerequisito de 3a.**
- **Explosión BOM versionada multi-nivel completa**: el `MovementEngine` sigue usando el `RecipeVersionDocument` solo en el nivel superior (depth 0). Las sub-recetas continúan usando la tabla simple `recipes` con el fallback existente. La explosión multi-nivel versionada completa (resolviendo `referenceVersionId` de sub-recetas versionadas) sigue diferida. **No es prerequisito de 3a.**
- **Selector de UOM por componente en la UI**: para evitar churn de UI amplio, Slice 2.2 NO agrega un selector de UOM. El `RecipeViewModel` captura automáticamente el `consumptionUom` del insumo al publicar (`componentUom`), de modo que las versiones nuevas siempre quedan en la unidad base de consumo. La conversión solo se aplica al procesar documentos donde el `componentUom` difiere de la base y existe una conversión registrada.
- **Ingesta de versiones de receta en el backend**: el POS sincroniza hacia `/inventory/recipes/versions` (ahora incluyendo `componentUom` en el payload), pero el backend aún no expone un controlador que la consuma. La validación/conversión de UOM del lado backend queda diferida a ese endpoint. → **Limpieza pre-Batch 3.**
- **Validación de compatibilidad de UOM para sub-recetas (componentes product)**: la validación de UOM aplica solo a componentes insumo (hojas que consumen stock). Los componentes sub-receta no tienen unidad base de insumo contra la cual validar.

## Reglas de negocio críticas
- No circularidad: una receta A no puede contener a la receta A.
- Las unidades en la receta deben ser compatibles con la unidad base del insumo (salvo densidad definida). *(Slice 2.2: enforced al procesar documentos versionados — mismo unit, o conversión registrada con factor positivo; si no, se rechaza antes de generar movimientos.)*

## PRD cubierto
§2.1 Recetas/BOM · UC-05 Versionamiento
