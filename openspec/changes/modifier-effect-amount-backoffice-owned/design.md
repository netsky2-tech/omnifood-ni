# Design: La cantidad del extra la manda el backoffice

## 1. La decisión de producto, en una frase

**El backoffice configura la cantidad; el cajero marca la opción; el sistema aplica la
cantidad y dice la verdad.**

La cantidad del extra no es «cuántos extras» (eso lo resuelve el grupo: repetir la
opción o elegir una opción discreta ya configurada, como en Toast/Square), sino **cuánto
stock sale** por unidad vendida. Ese es un dato de catálogo, no un dato que el mostrador
pueda adivinar.

## 2. Lo que ya existe y no se toca

| Pieza | Dónde | Nota |
|---|---|---|
| `effect_quantity` (nullable) | `modifier_options` | Ya está en el cable del backoffice (`modifier-effect-dialog.tsx`, "Cantidad a aplicar", placeholder "Heredar de la receta") y en la respuesta del backend. |
| Precedencia de resolución | `modifier_deviation_resolver.dart:425` (POS) y `modifier-deviation-resolver.ts:295` (backend) | Ya es `explícita > heredada > nada`, y ambos lados coinciden. |
| Unidad de la cantidad | `create-modifier-option.dto.ts` | "The quantity to apply per sold unit, in the affected insumo's own consumption unit". |
| `allow_quantities` / `max_selected` | `modifier_groups` | El POS ya los respeta (steppers −/+ por opción). |
| Override de supervisor | `supervisor_override_modal.dart` + `authRepo.authorizeOverride` + `auditRepo.logForensic` | Mecanismo existente (PIN/TOTP) con traza forense. |
| Breakpoints | `ui/design_system/responsive_layout.dart` | 600 / 900 / 1200 dp, en 13 archivos. El diálogo de modificadores **no lo usa**. |

**Consecuencia: el cambio NO altera la semántica de la resolución.** Altera lo que el
cajero ve, lo que la línea guarda y lo que el backoffice puede listar. Por eso el contrato
de conformidad (`fixtures/modifier-deviation/v1/vectors.json`) sigue válido; lo que se
añade son vectores para el caso «cantidad declarada» (que hoy no está cubierto).

## 3. Decisiones

### D1 — La cantidad efectiva se resuelve en un solo lugar

`declared ?? (inherited si las unidades coinciden)`. El preview del POS pasa a conocer
las tres fuentes y a **anunciar la que aplica**. Hoy el preview sólo conoce `inherited` y
`marked`, y por eso puede mentir (el defecto #1).

```
effective = declared ?? inherited ?? (ninguna)
origen    = DECLARED | INHERITED | NONE
```

El `marked` (override de supervisor) tiene prioridad sobre todo, como ya establece el
resolver (`explicit` gana).

### D2 — El campo numérico sale del flujo normal

El cajero no escribe cantidades. El flujo normal es: **tocar la opción**.

- Si hay cantidad efectiva → la línea del extra dice el número. Nada más.
- Si no la hay (sin configurar y sin receta que heredar, o unidades incompatibles) → la
  línea lo dice con calma, la venta **no se bloquea** y el efecto queda `PENDING` con su
  motivo. El backoffice lo lista.

Se conserva **un** camino manual, y no es del cajero: el **override de supervisor**
(D3). El estándar POS §33 distingue "deshabilitado vs. oculto" y exige que la
composición respete el permiso; un campo libre para todos sería una puerta abierta a que
la configuración del backoffice se pise sin que nadie lo note.

### D3 — El override es un acto de supervisor, con motivo y autorización

Se reutiliza `SupervisorOverrideModal` (PIN/TOTP) y `authRepo.authorizeOverride`. El
acto deja traza forense (`MODIFIER_EFFECT_QUANTITY_OVERRIDE`) y la autorización viaja
con la línea: `effect_quantity_source = 'OVERRIDE'`, `effect_authorized_by`,
`effect_authorization_method`, `effect_authorization_reason`.

El estándar §33 pide que el override sea **explícito, con la razón visible y con la
autorización registrada**; por eso la razón no es opcional.

### D4 — El pendiente se traza (fail-soft + visible)

El resolver ya es fail-soft por construcción: un efecto que la empresa no puede aplicar
no toca el stock y la venta pasa (comentario en
`sale_time_inventory_snapshot_builder.dart:188-191`). El problema es que **el motivo se
descarta**: `resolution.outcomes[].skipReason` no se persiste en ninguna parte, así que
ni el terminal ni la nube saben que un extra se vendió sin efecto de inventario.

Decisión: la línea guarda `effect_status` (`APPLIED` | `PENDING`) y
`effect_skip_reason`. Con eso el backoffice puede listar los pendientes por opción (que
son los que hay que configurar) y reconciliar los ya vendidos.

### D5 — El backoffice es quien dice qué falta

Un listado de **pendientes de configurar**: opciones con efecto de inventario cuya
cantidad no se puede resolver, con el producto que las usa y la razón. Se alimenta de:

1. La **configuración**: opción con efecto y sin `effect_quantity` cuyo producto no tiene
   receta (o cuya unidad no coincide con el componente) → falta configurarlo.
2. La **observación**: opciones que se vendieron con el efecto `PENDING` → el dato está
   mal en el catálogo y ya costó una venta.

(2) es la que cierra el círculo: sin la venta, nadie sabría que faltaba el dato.

### D6 — El diálogo se hace independiente de la resolución

- **Ancho**: el contenido usa el ancho disponible con topes por breakpoint
  (`ResponsiveBreakpoints.value`), no `maxWidth: 400` fijo.
- **Targets**: cada opción es un control de ≥48 dp (radio/checkbox sin `dense`, steppers
  con 48 dp, separaciones ≥8 dp).
- **Tipografía**: se eliminate el 10/11 px; cuerpo mínimo 12 dp y jerarquía con la escala
  de la suite (§42.7 "las etiquetas permanecen legibles").
- **Certificación**: pruebas de widget a **360×640**, **800×1280** y **1280×800** que
  afirman ausencia de overflow y altura mínima de los targets. Con eso PX-003 y PX-005
  quedan cerrados **sin el Q80**: el criterio deja de ser "cómo queda en este aparato" y
  pasa a ser "no hay overflow ni target bajo 48 dp en ningún tamaño soportado".

## 4. El wire

### 4.1 La línea (`invoice_item_modifiers`)

| Columna | Tipo | Nullable | Significado |
|---|---|---|---|
| `effect_status` | text | sí | `APPLIED` / `PENDING` / ausente (línea sin efecto). |
| `effect_skip_reason` | text | sí | `INCOMPLETE` / `UNIT_MISMATCH` / `INSUMSO_NOT_IN_CATALOG` / `COMPONENT_NOT_IN_RECIPE`. |
| `effect_quantity_source` | text | sí | `DECLARED` / `INHERITED` / `OVERRIDE`. |
| `effect_authorized_by` | uuid | sí | Supervisor que autorizó el override. |
| `effect_authorization_method` | text | sí | `PIN` / `TOTP`. |
| `effect_authorization_reason` | text | sí | Motivo del override. |

Migraciones aditivas (nullable, sin cambio de RLS): local (Floor) y nube (TypeORM). **No
tocan el documento fiscal**: el precio, la identidad de la opción y el importe de la
línea no cambian; sólo se documenta el efecto de inventario.

### 4.2 El endpoint de pendientes

`GET /modifier-groups/pending-configuration` → opciones con efecto no resoluble, con el
producto que las usa y la razón. Consume la configuración (1) y las líneas vendidas con
efecto pendiente (2).

## 5. Nhilos: qué se cita y por qué

| Regla | Dónde se cumple |
|---|---|
| §0.1 La verdad de producto gana a la conveniencia visual | La pantalla anuncia el número que se aplica (D1). |
| §18.3 Targets táctiles: mínimo 48 dp | Filas de opción y steppers ≥48 dp (D6). |
| §33 Overrides de supervisor | El cambio de cantidad es un acto de supervisor, con razón y autorización (D3). |
| §39.4 Términos técnicos: no exponer vocabulario de implementación | Desaparecen «Heredar» y «heredada de la receta». |
| §40 Defaults humanos | La cantidad configurada es el default: común, seguro, reversible. |
| §41 Divulgación progresiva | El detalle (cantidad, efecto) es apoyo; el trabajo primario es marcar la opción. |
| §42.7 Tipografía | Cuerpo ≥12 dp, jerarquía antes que decoración. |
| §48 Consistencia | Mismo patrón de diálogo y de override en todo el POS. |
| Backoffice §17 Formularios | El campo de cantidad del backoffice se explica en lenguaje de negocio. |

## 6. Riesgo y reversión

- El riesgo real es que un extra se venda sin efecto de inventario. Mitigaciones: fail-soft
  (nunca bloquea), trazado (la línea lo dice), listado en el backoffice (se puede
  configurar y reconciliar), y override de supervisor para el caso urgente.
- La reversión es un revert de los commits; las columnas nuevas son aditivas y nullable.
