# Batch 2: ADN del Plato (Recipes & BOM) — Remediación

Definir cómo se componen los productos finales a partir de insumos. **Remedia** el módulo de recetas existente (con comparador de versiones) y completa el vínculo histórico de versiones.

## Estado actual
- `RecetaEntity`/`RecetaDetalleEntity` existen con soporte de sub-recetas anidadas.
- CRUD de recetas y comparador de versiones funcionales.

## Brechas a remediar
- [ ] **Vínculo histórico de versión (UC-05)**: cada venta/producción debe guardar el `id_receta_version` con el que se cocinó, para que el recosteo histórico sea exacto. Verificar que las ventas existentes ya lo persistan.
- [ ] Cálculo de costo teórico basado en CPP actual — confirmar integración con el motor CPP (Batch 3b).
- [ ] Explosión BOM con cantidad bruta vs neta y factor de rendimiento validados.

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
- [ ] CRUD de recetas con múltiples ingredientes y sub-recetas anidadas.
- [ ] Selector de insumos/sub-recetas.
- [ ] Algoritmo de costo teórico basado en CPP actual.
- [ ] Migraciones para `recetas`/`receta_detalles`.
- [ ] Vínculo `id_receta_version` persistido en ventas y producciones (test que demuestre recosteo histórico estable tras cambiar la receta).

## Reglas de negocio críticas
- No circularidad: una receta A no puede contener a la receta A.
- Las unidades en la receta deben ser compatibles con la unidad base del insumo (salvo densidad definida).

## PRD cubierto
§2.1 Recetas/BOM · UC-05 Versionamiento
