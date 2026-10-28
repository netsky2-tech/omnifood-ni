# Proposal: La cantidad del extra la manda el backoffice

## Intent

En el diálogo de modificadores el cajero ve hoy un campo «Cantidad a aplicar» con la
herencia de la receta y la palabra «Heredar». Eso es un mostrador de la ingeniería de
inventario, no una pantalla de venta: ninguna app de restaurante le pide al mesero que
escriba mililitros. La industria es consistente —el servidor **marca**, el backoffice
**configura**— y el backoffice ya tiene el cable para hacerlo: `effect_quantity`,
`effect_factor`, `inventory_effect`, `min_selected`, `max_selected`, `allow_quantities`.

Hoy hay tres defectos que lo bancan:

1. **La pantalla puede anunciar un número que NO es el que se aplica.** El preview del POS
   (`modifier_effect_preview.dart`) nunca lee `option.effectQuantity`: sólo conoce la
   cantidad *heredada* y la *marcada*. Con «jarabe extra = 25 ml» configurado y una receta
   de 15 ml, el POS dice «Suma 15 ml de jarabe» y aplica 25 ml. La verdad de producto
   gana a la conveniencia visual (estándar POS §0.1).
2. **Se invita al cajero a escribir lo que el sistema ya sabe**, y el valor escrito pisa
   la configuración del backoffice sin que nadie lo note.
3. **«Heredar» es vocabulario de implementación en la pantalla del cajero** (§39.4).

Y dos diferidos que no dependían del Q80: **PX-003** (el campo de cantidad mide ~30 dp,
por debajo del objetivo táctil de 48 dp) y **PX-005** (texto de 10/11 px). El diferido no
era "falta el aparato": era que el diálogo **no era responsive** —ignora
`ResponsiveBreakpoints` y fija `maxWidth: 400`— y el Q80 ya no está disponible (se lo
entregaron a SOHO). El criterio correcto no es «cómo queda en este aparato» sino «no hay
overflow, no hay target bajo 48 dp y el texto es legible en cualquier tamaño», y eso se
certifica con **pruebas de widget a tres tamaños**, sin hardware.

## Scope

### In Scope

- **POS**: la cantidad efectiva se resuelve **declarada → heredada → nada**; la pantalla
  anuncia SIEMPRE el número que se va a aplicar; el campo numérico desaparece del flujo
  normal; la palabra «Heredar» desaparece de la pantalla del cajero.
- **POS**: cuando la cantidad NO es resoluble (sin configurar y sin receta que heredar, o
  con unidades incompatibles) la venta **NO se bloquea**: el extra se vende, su efecto de
  inventario queda **pendiente**, y la línea lo deja trazado.
- **POS**: cambiar la cantidad a mano queda como **override de supervisor** (§33), con
  motivo y autorización, y la autorización viaja con la línea.
- **POS**: el diálogo pasa a ser **independiente de la resolución** (usa
  `ResponsiveBreakpoints`), con targets táctiles ≥48 dp y tipografía legible — cierra
  PX-003 y PX-005 sin depender del Q80.
- **Backoffice**: la cantidad configurada se explica en lenguaje de negocio y se puede
  dejar «sin definir» a propósito; aparece el **listado de pendientes de configurar**
  (opciones con efecto de inventario cuya cantidad no se puede resolver) para que el
  tenant configure lo que falta y no esté adivinando en el mostrador.
- **Backend**: la nube guarda la verdad de la línea (`efecto aplicado / pendiente` y el
  motivo), para que el pendiente sea reconciliable y auditable.

### Out of Scope

- **Tope por opción** (el «Duplicate Modifiers» de Toast): es una capacidad nueva del
  modelo de configuración; se deja para un change propio. Hoy el tope es de grupo
  (`max_selected`).
- Cambiar el precio o la secuencia de los modificadores (no es problema de este change).
- KDS / comanda de cocina: la línea de cocina ya usa `<cantidad>x <nombre>`.
- La re-facturación / notas de crédito de las facturas no fiscalizadas (issue #937).

## Capabilities

### New Capabilities

- `modifier-effect-configuration`: la verdad del efecto de inventario de una opción
  (cantidad, unidad, origen, pendiente) es **dato de configuración del backoffice** y el
  backoffice puede decir qué queda pendiente de configurar.

### Modified Capabilities

- `sales-core`: el diálogo de modificadores del POS deja de pedir cantidades al cajero y
  pasa a ser independiente de la resolución de pantalla.

## Approach

1. **Contrato primero** (este change): el resolution order ya es
   `marcada > declarada > heredada` en POS y backend; lo que falta es que la PANTALLA
   conozca ese orden y lo diga. No se cambia la semántica de la resolución: se cambia lo
   que el cajero ve y lo que la nube guarda.
2. **POS primero** (el daño visible está en el mostrador): el preview resuelve la
   cantidad efectiva y la anuncia; el campo sale del flujo normal; el diálogo se hace
   responsive; se cierra el caso pendiente con una nota honesta que no bloquea la venta.
3. **La verdad a la nube**: la línea viaja con `efecto aplicado/pendiente` + motivo, para
   que el pendiente se pueda listar, reconciliar y auditar.
4. **El backoffice**: el listado de pendientes, que es lo que convierte «el backoffice
   manda» en una afirmación verificable y no en un wish.

Los dos resolutores (POS y backend) comparten el contrato de conformidad
(`fixtures/modifier-deviation/v1/vectors.json`): cualquier cambio de semántica se
verifica contra esos vectores por los dos lados.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/pos_app/lib/domain/usecases/inventory/modifier_effect_preview.dart` | Modified | La cantidad efectiva (declarada → heredada) y la verdad que se anuncia. |
| `apps/pos_app/lib/ui/features/sales/sale_view.dart` | Modified | El diálogo: sin campo numérico en el flujo normal, responsive, targets ≥48 dp, tipografía legible. |
| `apps/pos_app/lib/data/models/sales/invoice_item_modifier_entity.dart` | Modified | La línea carga el estado del efecto (aplicado/pendiente + motivo). |
| `apps/pos_app/lib/data/mappers/sales_mapper.dart` | Modified | El wire de la línea. |
| `apps/admin_backend/src/modules/sales/entities/*` | Modified | La nube guarda el estado del efecto. |
| `apps/admin_backend/src/modules/modifiers/**` | Modified | Endpoint de pendientes + semántica del "sin definir". |
| `apps/owner_dashboard/src/features/modifiers/**` | Modified | El listado de pendientes y el copy de la cantidad. |

## Risk & Rollback

- **Riesgo**: que un extra se venda sin efecto de inventario (el caso pendiente). Mitigado
  por el diseño **fail-soft + trazado**: la venta no se bloquea, el pendiente queda en la
  línea y en el backoffice, y el resolver no cambia de semántica.
- **Rollback**: el cambio es de capa de presentación y de un campo nuevo en la línea. Se
  revierte con el revert del commit; el campo nuevo en la nube es aditivo (columnas
  nullable) y no altera documentos fiscales.
