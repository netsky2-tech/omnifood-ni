# Batch 5: Producción y Pre-elaboración — Remediación

Formalizar la creación de productos intermedios (sub-recetas). **Remedia** el módulo de órdenes de producción existente.

## Estado actual
- Órdenes de producción existen con UI y validación de existencias.
- Costeo de sub-receta parcial.

## Brechas a remediar
- [ ] **Atomización de movimientos**: la producción debe ser transaccional (todo o nada) — N salidas de insumos + 1 entrada de sub-receta en una sola transacción, o ninguna.
- [ ] Costeo de sub-receta: el CPP de la sub-receta producida = suma de costos de insumos consumidos al CPP del momento.
- [ ] Vínculo con versión de receta (Batch 2): la orden referencia el `id_receta_version` usado.
- [ ] Validación de existencias antes de iniciar producción clara y bloqueante (o advertencia explícita si se permite forzar).

## Alcance técnico

### Órdenes de producción interna (PRD §2.5)
- Selección de sub-receta + cantidad a producir.
- El sistema calcula insumos requeridos según BOM para ese batch.

### Procesamiento (transaccional)
1. **Salida masiva**: movimientos de salida Kardex por cada ingrediente del BOM (explosión).
2. **Entrada de producto**: movimiento de entrada Kardex por la cantidad neta producida.
3. **Costeo**: CPP de la sub-receta = suma de componentes consumidos.

## DoD (Criterios de aceptación)
- [ ] Módulo de producción funcional.
- [ ] Atomización transaccional probada (fallo parcial → rollback, ningún movimiento queda suelto).
- [ ] Recalculo CPP del producto producido basado en componentes consumidos (test).
- [ ] Orden referencia `id_receta_version`.

## Reglas de negocio
- No se produce cantidad negativa.
- Registro con fecha y usuario responsable.

## PRD cubierto
§2.5 Producción · NFR Decimal
