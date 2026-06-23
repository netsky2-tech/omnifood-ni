# Batch 4: Mermas y Ajustes — Remediación

Gestión de pérdidas y control físico. **Remedia** el módulo de mermas existente y alinea la taxonomía con el PRD.

## Estado actual
- `Merma`/`MermaDetalle` existen; UI de mermas (shrinkage) funcional.
- Ajustes por conteo físico (counts) con sesiones de conteo existentes.

## Brechas a remediar
- [ ] **Taxonomía de merma canónica alineada al PRD** (PRD §2.4): `VENCIDO`, `DESECHO_COCINA` (Quemado/Mal preparado), `DETERIORO_BODEGA`, `CORTESIA_DEGUSTACION`. El código actual usa `MALA_PREPARACION`, `ROTO`, `DETERIORADO`, `CORTESIA` — **declarar canónicas y aliases** (ver tabla) y migrar/mapear.
- [ ] Comentario/observación obligatorio en toda merma.
- [ ] Merma de plato final dispara explosión BOM de sus insumos (no solo insumo directo).
- [ ] Ajuste por conteo vinculado a "Sesión de Conteo" para trazabilidad.
- [ ] Alerta forense (NFR): ajuste manual > C$1,500.00 dispara notificación asíncrona al admin (verificar umbrales y canal).

### Taxonomía canónica de mermas
| Canonical PRD | Alias actuales (mapear) | Descripción |
|---------------|-------------------------|-------------|
| `VENCIDO` | `VENCIDO` | Producto caducado |
| `DESECHO_COCINA` | `MALA_PREPARACION`, `QUERMADO`/`ROTO` (cocina) | Quemado / mal preparado |
| `DETERIORO_BODEGA` | `DETERIORADO`, `ROTO` (bodega) | Deterioro en almacenamiento |
| `CORTESIA_DEGUSTACION` | `CORTESIA` | Cortesía / degustación |

> Los aliases se conservan como etiquetas de UI pero persisten el canonical para reportes fiscales/gerenciales.

## Alcance técnico

### Gestión de mermas (PRD §2.4)
- `Merma`/`MermaDetalle` con `tipo_motivo` canonical.
- Impacto: salida automática de Kardex valorada al CPP actual; resta valor monetario e impacta cuenta de gasto por merma.
- Nivel de registro: producto final (explota BOM) o materia prima directa.

### Ajustes por conteo físico (UC-04)
- Toma de inventario: "Stock Teórico" vs "Stock Real".
- Genera movimiento `AJUSTE_CONTEO` (positivo o negativo) valorado al CPP actual, sin alterar compras pasadas.
- Vinculado a `SesionConteo` para trazabilidad.

## DoD (Criterios de aceptación)
- [ ] UI de merma con taxonomía canonical (aliases mapeados, persistencia canonical).
- [ ] Merma de plato final explota BOM y genera salidas por insumo.
- [ ] Observación obligatoria validada.
- [ ] Ajuste por conteo con sesión vinculada y diferencia validada.
- [ ] Alerta forense > C$1,500.00 disparada asíncronamente (test).

## PRD cubierto
§2.4 Mermas · UC-04 Conteo físico · NFR Auditoría forense
