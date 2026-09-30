# SOHO — Perfil de Negocio: Modo de Operación y Modo FX Checkout en Web (BXW-007)

## Goal
Permitir que el dueño/gerente configure desde la Web (Owner Dashboard) la política operativa y comercial del negocio sin depender de la tablet en el mostrador, y que esa política descienda de forma atómica a **todas** las terminales POS:
1. `operationMode`: modo operativo del local.
2. `checkoutFxMode`: tasa de cambio usada al cobrar en divisas.

## Decisiones bloqueadas (usuario, 2026-09-30)
- **D-1 Autoridad**: **Web es master**. El sync del snapshot escribe `operation_mode` / `checkout_fx_mode` en `local_configs` y el POS pasa esos dos campos a **solo lectura** (indicando "definido por la oficina"). Si la nube nunca los proveyó, el valor local sigue vigente y editable (fail-safe para tenants pre-aprobados y para trabajo offline).
- **D-2 Vocabulario**: canon = vocabulario del POS → `FOODPARK_QSR | RESTAURANT | HYBRID` y `COMMERCIAL | BCN_OFFICIAL`. El `operationMode: 'FOOD_PARK'` de `modules/fulfillment` **NO se toca** (dominio distinto: topología de fulfillment). Follow-up registrado en BXW-010.
- **D-3 Ausencia ≠ default** (rev 2, obligatorio para que D-1 sea seguro): `null` significa "el tenant nunca afirmó este campo" y se conserva como `null` en `FiscalSetupResponse`, `EffectiveFiscalPayload` y `FiscalConfigSnapshot`. Un valor `coerce`-ado a default sería indistinguible de un FOODPARK_QSR explícito, y como HOY `operation_mode` sólo lo escribe la tablet (`business_profile_view.dart:308`, `tenant_config_service.dart:38`), la nube nunca lo ha afirmado: el parámetro está ausente para TODOS los tenants. Proyectar defaults habría rebajado toda terminal RESTAURANT/HYBRID a QSR en el primer sync tras el deploy, sin un solo error en pantalla.
- **D-4 El fingerprint cubre `null`**: la huella JCS se calcula sobre el valor nulable crudo, así "nunca configurado" y "configurado en el default del POS" son revisiones distintas y sinceras (misma escuela que D-16/D-21: ausencia parece ausencia).
- **D-5 Undo desde la UI**: el centinela "Sin definir" del dashboard envía `operationMode: null` (tombstone) cuando el GET traía un valor real, y OMITE la clave cuando el GET ya venía en `null`. Omitir siempre (rev 2 original) hacía el cambio irreversible: `upsertOrClearParameter(undefined)` es no-op y la fila RESTAURANT gobernaría para siempre.

## Por qué esto es Office y no Floor
- Política, no operación: el dueño decide la tasa con la que se recibe divisas y el modelo de despacho.
- Anti-fraude en caja: si la tasa vive en la tablet, un operador la cambia y reporta a otra.
- Multi-terminal: con 2+ cajas en un Food Park, configurar por tablet garantiza divergencia. Con web + snapshot, todas las cajas reciben la misma revisión atómicamente.

## Slices (un PR por work unit; nunca el branch acumulado)
- [x] **U1 Backend rev 2** — enums POS-canon, DTO opcional (ausencia = no afirmar), respuesta/payload nulables, persistencia por `upsertOrClearParameter` antes de `recordRevisionChange`, snapshot/fingerprint sobre `null`. Entregado en **PR #723** (squash `17fb3a2a`).
- [x] **U2 Dashboard** — `types.ts` (Zod nulable) + `fiscal-setup-form.tsx` (selectores con centinela "Sin definir" + camino de undo a `null`) + tests. Entregado en **PR #725** (squash `e2683442`).

  **Corrección al plan original:** U1 y U2 iban en un solo candidato. No fue posible: el freeze combinado (1647 líneas) murió dos veces en el relay del revisor con `reviewer-empty-output / stopReason: length` (`mutation_performed: false` las dos). Al dividir, cada mitad pasó en una sola corrida (1078 y 658 líneas). Rev 2 además los desacopló en despliegue: el backend acepta peticiones sin las claves, así que PR-A puede vivir solo.
- [ ] **U3 POS** (pendiente, requiere issue propio ahora que #723/#725 están en `main`) — proyección **condicional**: escribir `local_configs` sólo cuando el snapshot trae valor no-nulo; ni escribir ni borrar cuando es `null`. Marcador `business_profile_managed_keys` en la misma transacción para que Business Profile sepa qué campos afirmó la nube y muestre solo lectura. **Sin bump de `FiscalProjectionKeys.currentVersion`**: no es una proyección obligatoria (las obligatorias como `pricesIncludeTax` se validan no-nulas y se escriben incondicionales, `fiscal_inbox_handler.dart:173-178,573`) y por eso tampoco entra en `isProjectionComplete`.

## Orden de despliegue (rev 2 lo hace seguro; rev 1 no lo era)
**Backend primero, dashboard después.** Con campos REQUIRED (rev 1) ningún orden funcionaba: backend antes → 400 porque el web viejo no los envía; web antes → 400 por `forbidNonWhitelisted: true` (`src/main.ts:51`) que rechaza propiedades desconocidas. Con ausencia-admitida + claves declaradas, el backend desplegado primero no afirma nada y el dashboard puede aterrizar después sin ventana rota.

**Ejecutado 2026-09-30 en ese orden:** #723 squash-mergeado a `main` como `17fb3a2a`, luego #725 como `e2683442`. No hubo ventana rota entre ambos (ambos el mismo día), pero la regla sigue vigente para cualquier rollback parcial.

## Nota de scope aprendida en U1
Agregar campos REQUIRED a un DTO de límite obliga a actualizar TODAS las suites que POSTean esa ruta, incluidas las `*.db.e2e-spec.ts` de Postgres real. `test/onboarding/fiscal-setup.e2e-spec.ts` usa DataSource simulado, así que es estructuralmente ciego al ValidationPipe: verde ahí no prueba el límite. Al cambiar un DTO de límite, grepear `test/` por la ruta del endpoint y por las claves del payload.

## Riesgo conocido y aceptado (U1)
Cambiar la forma del payload re-fingerprintea a **todos** los tenants: cada uno verá **un bump de revisión** en su próximo guardado material. Con D-3/D-4 esto es deseable (es lo que baja los `null` al POS para que U3 distinga ausencia), pero es una ola de revisiones +1 tras el deploy: **coordinar con el equipo de POS/sync antes de publicar**. Es upgrade-only y seguro: la anti-bajada del POS sólo rechaza revisiones menores.

## Delivery record (2026-09-30)
| slice | PR | HEAD entregado | revisión nativa |
|---|---|---|---|
| U1 backend (+ test de tombstone) | #723 | `17fb3a2a` | `review-5e2e24ea9719348d` approved/burned, 1078 líneas |
| U2 dashboard | #725 | `e2683442` | `review-7a9050ab7680feb8` approved/burned, 658 líneas |

Advisories informativos que quedan como trabajo separado (ninguno abrió corrección):
- `R3-MISSING-NULL-CLEAR-TEST` → **cerrado antes de abrir #723** (`9a07add6`: dos tests que fijan que `null` explícito escribe fila superscedente `version+1` y lee `null`). Vale la pena recongelar: en el siguiente freeze ese hallazgo desapareció.
- `R3-001` (`fiscal-config-version.service.ts:292-293`) — el snapshot enumerando campo por campo es intencional, no un spread.
- `R3-coverage-real-to-real` (`fiscal-business-profile.test.tsx:382-449`) — falta un test `RESTAURANT`→`HYBRID` con snapshot no-nulo. Mismo ramo de código que uno ya cubierto: follow-up.

Lección de encadenado: #724 apuntaba a la rama de #723. Como GitHub hace squash, los commits de #723 no son ancestros de `main` y el diff de #724 volvió a mostrar los 13 archivos de backend (16 en total); fusionarlo ahí además habría aterrizado el dashboard en la rama, no en `main`. Se cerró y se reabrió como #725 con el mismo commit cherrypickeado sobre `main`.

## Evidence & Verification
- Backend: `fiscal-setup.dto.spec.ts`, `fiscal-setup.service.spec.ts`, `fiscal-config-version.service.spec.ts` (+ `.db.spec.ts`), e2e onboarding.
- POS: `test/data/services/fiscal_inbox_handler_test.dart`, `test/ui/features/config/business_profile_view_model_test.dart`.
- Dashboard: `src/__tests__/fiscal-dgi-authorization.test.tsx` como referencia de patrón.
