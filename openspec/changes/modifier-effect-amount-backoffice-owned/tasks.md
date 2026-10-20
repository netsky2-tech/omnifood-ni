# Tasks: La cantidad del extra la manda el backoffice

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | 900-1200 (hand-written, sin generados) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | 3 unidades encadenadas |
| Delivery strategy | ask-on-risk |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | La verdad en la pantalla: el preview conoce la cantidad declarada, la anuncia, y desaparece «Heredar» | PR #1 | `modifier_effect_preview.dart` + `sale_view.dart` (diálogo) + tests |
| 2 | El diálogo independiente de la resolución: responsive, targets ≥48 dp, tipografía legible | PR #2 | Cierra PX-003/PX-005 sin el Q80; pruebas de widget a 3 tamaños |
| 3 | La verdad a la nube + el backoffice: estado del efecto en la línea, endpoint de pendientes, vista del dashboard | PR #3 | Migraciones local/nube + mapper + endpoint + dashboard |

---

## Fase 1 — La verdad en la pantalla (Unidad 1) — **HECHA (`51f0d427`)**

- [x] 1.1 `ModifierEffectPreview` conoce las tres fuentes: `declaredQuantity`,
      `inheritedQuantity`, `markedQuantity`, y expone `effectiveQuantity` +
      `quantitySource` (`DECLARED` | `INHERITED` | `NONE`).
- [x] 1.2 El `explanation` anuncia **el número que se va a aplicar** (declarada antes que
      heredada) con su unidad; sin «heredar» ni «receta» en el texto del cajero.
- [x] 1.3 Sin cantidad resoluble: la línea dice que el consumo de inventario queda
      pendiente de configuración — sin pedir una cantidad y sin bloquear el alta.
- [x] 1.4 `sale_view.dart`: el campo «Cantidad a aplicar» sale del flujo normal; el
      `_effectSubtitle` muestra la verdad y el estado pendiente.
- [x] 1.5 La cantidad marcada (override) deja de ser un campo libre: el diálogo pide
      autorización de supervisor con `SupervisorOverrideModal` y motivo obligatorio.
- [x] 1.6 Tests unitarios del preview: declarada gana sobre heredada; heredada cuando no
      hay declarada; pendiente cuando no hay ninguna; el texto no contiene «heredar».
- [x] 1.7 Test de widget: elegir una opción con cantidad declarada NO pide escribir nada
      y la línea anuncia el número configurado.

## Fase 2 — El diálogo independiente de la resolución (Unidad 2) — **HECHA (`51f0d427`)**

- [x] 2.1 El ancho del contenido del diálogo sigue a `ResponsiveBreakpoints` (sin
      `maxWidth: 400` fijo).
- [x] 2.2 Cada opción es un control de ≥48 dp; los steppers también; separación ≥8 dp.
- [x] 2.3 Tipografía: se elimina el 10/11 px; cuerpo mínimo 12 dp con la escala de la suite.
- [x] 2.4 Pruebas de widget a **360×640**, **800×1280** y **1280×800**: sin overflow y
      con altura mínima de 48 dp en las opciones.
- [x] 2.5 Actualiza la auditoría Nhilos del módulo (`docs/audits/...`): PX-003 y PX-005
      quedan cerrados con la evidencia de las pruebas, no con una medición en un aparato.
- [x] 2.6 Actualiza el log ODD con el cierre de PX-003/PX-005 y la credencial del Q80
      (entregado a SOHO: el criterio pasa a ser independiente de la resolución).

## Fase 3 — La verdad a la nube y el backoffice (Unidad 3) — **PARCIAL**

- [x] 3.7 El diálogo del backoffice explica la cantidad en lenguaje de negocio
      («Cantidad que descuenta este extra», la unidad del insumo, y la
      consecuencia enunciada cuando se deja sin definir). Test: 76/76 verdes en
      `apps/owner_dashboard/src/features/modifiers`.
- [ ] 3.1 Migración local (Floor): `invoice_item_modifiers` gana `effect_status`,
      `effect_skip_reason`, `effect_quantity_source`, `effect_authorized_by`,
      `effect_authorization_method`, `effect_authorization_reason`.
- [ ] 3.2 `build_runner` y el mapeo de la línea (`sales_mapper.dart`) con los campos nuevos.
- [ ] 3.3 Migración nube (TypeORM) con las mismas columnas (nullable, sin tocar RLS).
- [ ] 3.4 El backend guarda el estado del efecto al sincronizar la venta.
- [ ] 3.5 `GET /modifier-groups/pending-configuration`: opciones con efecto no resoluble.
      **Una sola verdad**: el backend NO replica la resolución del POS (eso sería
      una segunda verdad que divergiría); el pendiente lo sabe el terminal, que
      es quien resuelve, y viaja en la línea (3.1–3.4). El endpoint lista las
      opciones con efecto y sin cantidad configurada **y** las que se vendieron
      con el efecto `PENDING`, con el producto y la razón.
- [ ] 3.6 Dashboard: pestaña «Pendientes de configurar» en Modificadores, con acceso
      directo a la configuración de la opción.
- [ ] 3.7 El diálogo del backoffice explica la cantidad en lenguaje de negocio y deja
      explícito el «sin definir» (heredar de la receta).
- [ ] 3.8 Vectores de conformidad (`fixtures/modifier-deviation/v1/vectors.json`) para el
      caso «cantidad declarada», verificados por los dos resolutores.

## Verificación

- [ ] `flutter test` (POS) verde, con las pruebas de widget de tamaño.
- [ ] `npm test` (backend) verde.
- [ ] `flutter analyze` sin avisos nuevos.
- [ ] Revisión Nhilos del POS con la plantilla `nhilos_pos_module_audit_template_v1.0.md`.
