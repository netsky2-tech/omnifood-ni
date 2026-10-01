# SOHO — BXW-007 U3: Proyección condicional del Perfil de Negocio en POS

Feature padre: `odd/tasks/soho-business-profile-web.md` (BXW-007, issue #722).
Issue de este slice: **#734**. Slice previo bloqueante: U1 (#723, `17fb3a2a`) y U2 (#725, `e2683442`), ambos en `main`.

## Goal
Que la tablet **honre** lo que la oficina afirmó. Hoy el snapshot fiscal ya baja `operationMode` y `checkoutFxMode`, pero el POS los ignora: ni los proyecta en `local_configs` ni deja que gobiernen el formulario. Un operador todavía puede cambiarlos desde la tablet — exactamente la divergencia que el feature existe para eliminar.

## Decisiones heredadas que este slice implementa
- **D-1 (Web es master, por campo)**: la nube manda cuando afirmó el campo; si no lo afirmó, el valor local sigue vigente y **editable**. Los dos knobs son independientes (la oficina puede fijar la tasa FX y dejar el modo operativo a la terminal pre-provisionada), así que la autoridad se resuelve **por campo**, nunca con un flag único de "perfil gestionado".
- **D-5 (undo)**: el centinela "Sin definir" del dashboard escribe un tombstone `null`. Ese tombstone cierra su ciclo acá: el POS ve `null`, saca el campo del marcador y **devuelve el control local sin borrar el valor local**.

## Reglas de implementación
- **R-1 Afirmación**: snapshot con string no vacío → escribir la clave local con el valor de la nube + agregar el campo al marcador.
- **R-2 Ausencia**: snapshot `null`/ausente → **no escribir y no borrar**. El valor local queda intacto (es el master local).
- **R-3 Marcador** `business_profile_managed_keys` escrito en la **misma transacción atómica** que el resto de la proyección (`executeFiscalEnvelopeTransaction`): no puede existir una ventana donde la UI lea un valor de la nube sin saber que es de la nube. Si ningún campo quedó afirmado, el marcador se **borra** (ausencia parece ausencia).
- **R-4 Sin bump de `FiscalProjectionKeys.currentVersion`** y **sin entrar en `isProjectionComplete`**. Son proyecciones condicionales: "ausente" es un estado estable legal, así que no se pueden validar como obligatorias. Meterlas ahí haría fallar la completitud de todo tenant donde la nube no las afirmó y dispararía un loop de repair. Las obligatorias (`businessName`, `taxRegime`, `pricesIncludeTax`) no se tocan.
- **R-5 UI por campo**: el control afectado pasa a solo lectura con etiqueta honesta ("Definido por la oficina"), no se deshabilita en silencio ni muestra un valor falso como editable.
- **R-6 El guardado del formulario nunca pisa un campo gestionado por la nube.**

## Patrón a copiar (ya existe y ya fue reviewado)
Los campos DGI son *optional mirrors* y hacen exactamente esto: `fiscal_inbox_handler.dart:606-625` escribe sólo si el snapshot trae valor no-blanco y **nunca borra** cuando falta. U3 sigue esa forma; no inventa un mecanismo nuevo.

| snapshot | `local_configs` | marcador |
|---|---|---|
| string no vacío | escrito (valor nube) | campo agregado |
| `null` / ausente | **intacto** (master local) | campo removido |

## Fail-safe de despliegue
Seguro de mergear **antes** de que el backend esté desplegado y antes de la ola de revisiones +1: sin campos en el snapshot el marcador no existe, todos los controles quedan editables y el comportamiento es byte a byte el de hoy. El cambio sólo empieza a actuar cuando la oficina afirma un valor de verdad.

## Alcance / superficies
- `apps/pos_app/lib/data/services/fiscal_inbox_handler.dart` — `FiscalProjectionKeys` + `_commitFiscalProjectionTransaction`.
- `apps/pos_app/lib/ui/features/config/business_profile/business_profile_view_model.dart` — flags por campo.
- `apps/pos_app/lib/ui/features/config/business_profile/business_profile_view.dart` — solo lectura + skip de escritura en guardado.
- `apps/pos_app/test/data/services/fiscal_inbox_handler_test.dart`, `apps/pos_app/test/ui/features/config/business_profile_view_model_test.dart`.

Consumidor aguas abajo a verificar: `presentation/features/sales/view_models/sale_view_model.dart:602-630` lee `checkout_fx_mode` para la tasa de cobro — es el impacto operativo real (la tasa de la oficina es la que cobra).

## Criterios de aceptación
- Snapshot con ambos campos → ambos proyectados y ambos solo lectura.
- Snapshot con un solo campo → sólo ése proyectado y bloqueado; el otro sigue local y editable.
- Snapshot en `null` después de una afirmación previa → el campo sale del marcador, el valor local se conserva, el control vuelve a ser editable.
- Snapshot sin ninguno de los dos, en terminal con valores locales → nada escrito, nada borrado, todo editable.
- `isProjectionComplete` sin cambios; `fiscal_projection_version` sigue en `1`.
- Un guardado del formulario nunca sobreescribe un campo gestionado por la nube.

## Tasks
- [ ] T1 Tests rojos: proyección condicional en el handler (afirma / ausente / retracción), marcador en la misma transacción, marcador borrado cuando no hay campos, `isProjectionComplete` intacto y `currentVersion` en 1.
- [ ] T2 Implementar R-1..R-4 en `fiscal_inbox_handler.dart`.
- [ ] T3 Tests + implementación de los flags por campo en el view model (R-5).
- [ ] T4 Solo lectura por campo en la vista + R-6 (el guardado no pisa lo gestionado).
- [ ] T5 Verificación: `flutter test`, `flutter analyze`, y confirmación de que `sale_view_model` sigue leyendo `checkout_fx_mode` correctamente.

## Fuera de alcance
- **BXW-010** (`FOOD_PARK` de fulfillment vs `FOODPARK_QSR` de business profile). Verificado: canales **disjuntos**. Fulfillment lo guarda como string libre sin validar, con default `LEGACY_COMPATIBILITY` (`fulfillment-rollout.service.ts:260`), mientras que el contrato fiscal **rechaza** `FOOD_PARK` como inválido (`fiscal-setup.dto.spec.ts:149`). Nunca se comparan ni convierten: es higiene de nombres, no un bug de datos.
- Reporte de impresión/factura que muestre el modo operativo.
