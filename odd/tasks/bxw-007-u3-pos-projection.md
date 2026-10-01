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
- [x] T1 Tests rojos: proyección condicional en el handler (afirma / ausente / retracción), marcador en la misma transacción, marcador borrado cuando no hay campos, `isProjectionComplete` intacto y `currentVersion` en 1. — 6 tests, commit `2fc53085`.
- [x] T2 Implementar R-1..R-4 en `fiscal_inbox_handler.dart`. — `FiscalProjectionKeys.operationMode/checkoutFxMode/businessProfileManagedKeys`; el marcador entra en la misma lista `projections` que el resto (misma transacción). 43/43 en la suite del handler, 399/399 en `test/data/services/`.
- [x] T3 Tests + implementación de los flags por campo en el view model (R-5). — `isOperationModeCloudManaged` / `isCheckoutFxModeCloudManaged`; el marcador se carga aparte porque no está en el mapa de defaults; parseo tolerante (trim + sólo claves conocidas).
- [x] T4 Solo lectura por campo en la vista + R-6 (el guardado no pisa lo gestionado). — `onChanged: null` cuando el campo está gestionado, ícono de candado y texto honesto por campo.
- [x] T5 Verificación — 116/116 en `test/ui/features/config/`, 399/399 en `test/data/services/`, `flutter analyze` del proyecto entero en exit 0 (es el gate de `pos-app-ci.yml`).

## Verificación con mutación (por qué los tests valen)
Los tests verdes no prueban que aten el comportamiento. Se rompió a propósito y se midió:
- **Condicionalidad del handler**: hacer los mirrors incondicionales rompió 3 aserciones (marcador escrito cuando no corresponde, valor local pisado por `''`, marcador con un campo de más).
- **Autoridad por campo**: acoplar `isCheckoutFxModeCloudManaged` a `isOperationModeCloudManaged` rompió el test «sólo `checkout_fx_mode` gestionado → FX bloqueado y modo operativo editable».
- **Carrera del guardado**: quitar el re-read del marcador rompió el test de regresión con `Expected: not contains 'operation_mode'` — exactamente el bug que el revisor describió.

## Estado de revisión y gap de RDD (2026-09-30)
| candidato | árbol | receipt |
|---|---|---|
| T1+T2 handler | `cc2034a6` | `review-fe19fbdb8c6c7a81` approved/burned (280 líneas) |
| T3+T4 + corrección | `26bbc5f9` | **sin receipt** — ver abajo |

El linaje `review-330a9d5a501f5620` encontró un hallazgo **CRITICAL** real que sobrevivió al refuter:

> **`R3-stale-managed-keys-race`**: el guardado de R-6 confiaba en `_cloudManagedKeys`, cargado sólo por `loadConfig`, y nunca releía el marcador dentro de `saveConfig`. Una proyección que commitea entre el load y el guardado dejaba que el formulario escribiera encima del valor afirmado por la oficina, y como `isProjectionComplete` ignora estas claves, **nada lo habría reparado después**.

Corregido en `767f849e` (plan declarado 60 líneas de diff, 52 usadas): `saveConfig` relee el marcador antes de aplicar el guard, con test de regresión que falla sin el cambio.

**El linaje quedó atascado en `correction_required`**: el slot de validación dirigida fue rechazado dos veces con `collectBinding is unknown, expired, or belongs to a different session route` — la sesión se cerró por accidente y la ruta de transporte se recreó, así que STATUS reofrece el binding pero `capture-validation` no lo acepta. El árbol corregido coincide exactamente con `correction_candidate_tree` (`26bbc5f9`) y sus paths son los dos esperados.

Decisión explícita del usuario: **entregar sin receipt del candidato corregido**, dado que la corrección está aplicada y probada con test de regresión, pero no validada por el validador dirigido. Queda como deuda de verificación visible, no como silencio.

## Fuera de alcance
- **BXW-010** (`FOOD_PARK` de fulfillment vs `FOODPARK_QSR` de business profile). Verificado: canales **disjuntos**. Fulfillment lo guarda como string libre sin validar, con default `LEGACY_COMPATIBILITY` (`fulfillment-rollout.service.ts:260`), mientras que el contrato fiscal **rechaza** `FOOD_PARK` como inválido (`fiscal-setup.dto.spec.ts:149`). Nunca se comparan ni convierten: es higiene de nombres, no un bug de datos.
- Reporte de impresión/factura que muestre el modo operativo.
