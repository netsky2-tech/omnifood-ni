# Setup Center: onboarding UX overhaul + activation hard gates (#903 / #899 follow-up)

Owner directive: make the Setup Center speak the owner's language (NHilos backoffice
standard v1.0, luxury-by-restraint +1), make catalog seeding visible for already-created
tenants, and hard-gate activation on missing business configuration. POS BOH read-only
(#899) is a separate feature document, to start after this one.

## Specs

- S1: "Setup Center: acción de siembra visible para tenants ya creados" — the setup
  center must offer a visible seed-defaults action (useSeedCatalogDefaults exists; the
  empty-state currently lives only in the insumos form).
- S2: "Native review + PR de la rama" — the branch gets native review and a PR.
- S3: "No ver camel case o variables a secas" — no raw machine identifiers (backend
  blocker codes, keys like `measurementEligible: false`, enum values) shown to the user.
- S4: "que los estados se actualicen en todas las cards" — lifecycle/readiness state
  changes must be reflected consistently across every card that displays them.
- S5: "ordenarlo mejor" — page information hierarchy follows the standard (P0 primary
  job first, technical/observability detail demoted to progressive disclosure).
- S6: "no usar cosas como (Backoffice Readiness)... igual 'BOH' el usuario no va a saber
  que significa" — remove internal jargon (BOH, Backoffice Readiness, TTFSS, M6,
  measurementEligible) from user-facing copy; keep the two texts the owner quoted as
  reference tone but subject to the NHilos sweep (owner confirmed: "También revisalos,
  la idea es aplicar los standard de nhilos y los lineamientos para backoffice,
  manteniendo ese luxury y +1").
- S7 (blockers, owner decision: hard backend gate): "si me voy a activar el POS y no he
  llenado la info de datos fiscales, tipo de operación como restaurante o foodpark,
  tasas de cambio, tasa de cambio a utilizar, eso me bloquea al ejecutar las fases de
  activación" — starting an activation attempt must fail (backend) when fiscal data,
  operation type, or exchange-rate configuration is missing, with human-readable
  reasons; Setup Center surfaces each gap as a step with a CTA.
- S8: "no permite iniciar activación de terminal porque no está listo para la venta (no
  hay productos)" — the no-products blocker must be clearly surfaced and unblockable via
  S1 seeding / catalog acquisition, not discovered at activation time.
- S9: "revisar que las plantillas siembren bien los datos, sin vacíos" — template
  application must not leave empty required fields.
- S10: "la opción de crear manual funcione, porque probé ese formulario y tiene blockers
  y tampoco lo veo actualizado respecto al formulario de productos" — the manual product
  creation form in the acquisition modal must work and be aligned with the current
  products management form.

## Tasks

(Tasks refined after exploration; routes and commits filled in per task.)

- T1 (S1): seed-defaults action card in Setup Center for tenants with empty catalog.
- T2 (S3,S5,S6): copy/jargon sweep + hierarchy pass on setup-center-view (BOH/TTFSS/M6/
  raw codes out; blockers rendered as human sentences; technical badges demoted).
- T3 (S4): state consistency pass — one source of truth per state across cards.
- T4 (S7): backend hard gate — `fiscal-setup.service.ts` exposes
  `commercialFxSpreadConfigured` (raw param presence; the 36.5 default must not
  silently satisfy the requirement, standard §40); `fiscal-readiness.adapter.ts` +
  `ports/fiscal-readiness.port.ts` expose `operationMode` and the FX-configured flag;
  `onboarding-readiness.evaluator.ts:77-104` pushes blockers
  `FISCAL_OPERATION_MODE_NOT_CONFIGURED` (operationMode null) and
  `FISCAL_FX_RATE_NOT_CONFIGURED`. Existing `FISCAL_CONFIGURATION_INCOMPLETE`
  unchanged. Owner decision = product authority: adding blockers may flip in-flight
  tenants out of SALE_READY — accepted, degraded-live-state banner already exists.
  checkoutFxMode deliberately NOT gated: the fiscal form does not expose it, so the
  gate would be an unblockable dead end (AP-17).
- T5 (S7): Setup Center surfaces the new gates as steps with CTAs (needs readiness data):
  map machine blockers to human sentences (localize map, no raw codes — S3) and point
  to the fiscal tab where "Modo de Operación" and "Tipo de Cambio Comercial" live
  (`features/settings/fiscal-setup-form.tsx:312-360`).
- T6 (S8): no-products blocker surfaced early with unblock path
  (`CATALOG_NO_SELLABLE_PRODUCTS` at onboarding-readiness.evaluator.ts:90 — exists;
  needs visible copy + seeding/acquisition CTA, ties to T1).
- T7 (S9): template seeding fills required fields without gaps:
  `industry-template.service.ts:applyTemplate:118` — products with missing/0
  `suggested_price` currently become sellPrice 0 (silently unsellable;
  :367-380). Fail the apply loudly (400, itemized) instead of creating
  valid-looking-but-unsellable rows (standard core-promise blocker); audit
  category/uom fills.
- T8 (S10): manual product creation form fixed and aligned with products form.
- T9 (S2): native review + PR of the branch.

## Log

- L1 (owner, verbatim): "Vamos a continuar con #899 Boh-read only y - Setup Center:
  acción de siembra visible para tenants ya creados (como tu demo — mientras tanto, el
  botón del formulario de insumos que ya conocés funciona, o POST
  /catalogs/seed-defaults) - Native review + PR de la rama. Aprovechando que vas a tocar
  el setup center, me gustaría le hicieramos mejoras, ver si cumple con los nhilos
  standard experiencie y pos. No ver camel case o variables a secas, que los estados se
  actualicen en todas las cards, ordenarlo mejor, no usar coosas como (Backoffice
  Readiness) que son terminos que usamos internamente igual 'BOH' el usuario no va a
  saber que significa. El proxima accion recomendada se queda asi 'Próxima Acción
  Recomendada: Onboarding Completado'. aunque haya ventas comerciales este texto se
  queda asi 'Primer Ticket Comercial Cliente Final / Pendiente de primera venta comercial
  / Observado de forma desacoplada; no altera el TTFSS histórico.'. todo ese tipo de
  detalles en general del setup center hay que verlo. Hay temas también que son blockers
  en el onboarding, por ejemplo si me voy a activar el POS y no he llenao la infor de
  datos fiscales, tipo de ooperacion como restaurante o foodpark, tasas de cambios, tasa
  de cambio a utilizar, eso me bloquea al ejecutar las fases de activacion. También el
  tema de que no permite iniciar activacion de terminal por que no está listo para la
  venta (no hay productos), revisar que las plantillas siembre bien los datos, sin
  vacios y que la opcion de crear manual funcione, por que probé ese formulario y tiene
  blockers y tampoco lo veo actualizado respecto al formulario de productos."
- L2 (owner decisions via questionnaire): Setup Center first (then #899 in its own
  branch); activation blockers = hard gate in backend ("Gate duro en backend"); copy
  sweep covers ALL texts including the quoted ones, applying NHilos standards and
  backoffice guidelines keeping "luxury y +1".
- L3 (execution): T1–T8 landed in 4 local commits on fix/catalog-seed-defaults —
  c53dfac7 (backend gate, focused suites 65/65), 0769950a (template apply guard,
  43/43), 42b0fb9f (feature doc), d4c82586 (dashboard overhaul: seeding card, label
  maps onboardingBlocker/WarningLabels, copy sweep, gate surfacing, manual form
  catalog-backed selects; dashboard suite 1707 passed + tsc clean). Owner WIP docs
  left untouched (5 modified files under docs/). T9 (native review + PR) in flight.
- L4 (S4 resolution): catalog step now reads readiness.catalog (single backend
  source); useSeedCatalogDefaults invalidates the ["onboarding"] prefix so the seed
  refreshes session + summary + steps together.
