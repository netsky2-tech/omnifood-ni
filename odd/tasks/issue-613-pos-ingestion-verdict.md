# #613 — Non-failing ingestion verdict for inert recipes (POS)

## The condition

A published `recipe_versions` row can reference a product whose `product_type` is
`SIMPLE`. Authoring is guarded (#612), legacy template data was repaired (#622),
but the condition remains reachable through pre-guard rows and any cloud path that
skips the guard.

## Corrected diagnosis (the issue's premise was partly wrong)

Exploration of `apps/pos_app` established, with code:

1. **The push does not break today.** `adaptAuthorityDelta`
   (`lib/data/services/authority_delta_adapter.dart:48-243`) returns refusal as a
   **value** (`.failure`), never an exception; the hydration `catch`
   (`lib/data/services/sync_service.dart:1863-1877`) sets a verdict and does **not**
   rethrow; outbound domains run through `_runDomain` (`:434-519`) which catches
   everything. So "must not break the offline push" is already satisfied and must be
   *preserved*, not built.
2. **One malformed row refuses the whole `recipeVersions` payload.** The adapter is
   fail-closed at payload level, and the delta watermark advances only on a
   successful pull (`:2100-2107`), so the server re-sends the same row every cycle.
   Consequence: good recipes for other products stay **inert in the terminal** —
   availability of correctness, not of transport.
3. **The real damage is silent.** For a `SIMPLE` product,
   `sale_inventory_outcome_planner.dart:96-103` classifies from
   `mappingsByProductId` and **never reads `hasRecipe`**. The sale proceeds as
   `APPLIED_NO_INVENTORY_IMPACT` with **zero kardex movements**. The authority rows
   sit unread. That is #611 reproduced inside the POS, with no signal anywhere.
4. Nothing surfaces it: `authorityHydrationFailureReason` is emitted to a stream and
   never rendered; the badge shows only connectivity/pending/`lastError`; no label
   exists for `authority_hydration_refused` or `..._threw`.

So #613 is **not** "stop the push from failing". It is: *per-record verdict for
semantic inertness, persisted where it can be read, and visible in the sync detail.*

## Design decisions

1. **Structural refusal stays fail-closed at payload level.** Mixed tenant, missing
   version identity, missing product id, conflicting closure facts, malformed
   component → whole payload refused. Those mean the payload is not trustworthy;
   applying "the good parts" of an untrusted payload is how cross-tenant data lands
   in a local source of truth. This unit must not weaken it.
2. **The semantic case is per-record and non-blocking.** A structurally valid recipe
   whose product is `SIMPLE` is not a threat — it is inert material. It gets a
   verdict; the rest of the payload hydrates normally.
3. **Verdicts get their own append-only table.** `authority_recipe_versions` cannot
   carry a status column: the tables are immutable by `BEFORE UPDATE/DELETE` triggers
   (`lib/data/database/migrations.dart:76-100`) and that immutability is deliberate.
   A new `authority_ingestion_verdicts` table (insert-if-absent, keyed by
   `recipe_version_id` + `code`) records facts without touching the projections.
4. **Consumption behaviour does not change.** A `SIMPLE` product keeps not consuming
   from a recipe. The verdict *reports* inertness; it does not override the business
   rule. Making the POS consume insumos for a product the operator typed as `SIMPLE`
   would be the POS deciding a business fact it does not own — that decision is #611's.
5. **The operator sees it in the sync detail dialog** (owner decision 2026-09-27),
   not as an alarm: amber/informational, never flipping `CloudSyncStatus.error`,
   never blocking the sale path. Cashier-facing red for a data-hygiene condition the
   operator cannot fix at the register would be noise that trains people to ignore it.
6. **Aggregate telemetry stays as the machine-readable channel** (`local_configs`
   keys), so pilot tooling can read counts without parsing UI.

## Work units (two commits, split at PR time if the diff crosses 400 lines)

### A — verdict + persistence (no UI)
- `lib/data/services/authority_delta_adapter.dart`: classify inert-recipe rows
  per record; keep every structural refusal exactly as is; return
  `inertRecipeVersionIds` alongside success/failure rather than refusing the payload.
- `lib/data/repositories/inventory/...` + `lib/data/database/...`: new entity + DAO
  + migration for `authority_ingestion_verdicts`; register in `allMigrations`.
- `authority_hydration_service.dart` / `sync_service.dart`: write verdicts during
  hydration; verdict must never fail the pull or the push.
- `local_configs` telemetry keys for the count and reason.
- Tests: per-record case (one inert + one good in the same payload → good applies,
  inert verdicted); structural refusal unchanged (tenant mixing still refuses the
  whole payload); verdict write failure does not fail the pull; no push regression.

### B — surfacing
- `lib/ui/features/sales/widgets/cloud_sync_status_badge.dart`: informational line in
  the detail dialog ("N recetas inertes en este dispositivo") with the product names,
  plus a Spanish label in `core/localization/label_map.dart`.
- Never changes the badge colour state or blocks anything.
- Tests: count renders; zero inert recipes renders nothing; status stays
  `idle`/`success` with inert verdicts present.

## Non-goals

- No server-side change. #612 already guards authoring; #622 repaired template data.
- No new consumption path for `SIMPLE` products.
- No repair action in the POS (the operator fixes the type in Catálogo, which is
  #611's runbook and #617's control).
- No change to `authority_*` immutability triggers.
- No bulk-delete/backlog machinery for verdicts — append-only with
  insert-if-absent is enough at pilot scale; say so rather than inventing retention.

## Verification

`cd apps/pos_app && flutter test --concurrency=1` — always `--concurrency=1` (this
repo has shown flaky isolation failures otherwise). Rule of noise: a single isolated
re-run that reproduces is a BUG; only a `+N -0` isolated delta is noise. Do not
`dart format` (SDK 3.11.5 disagrees with the repo baseline style).

Existing relevant suites: `test/data/services/authority_delta_adapter_test.dart`,
`authority_hydration_service_test.dart`, `sync_service_authority_hydration_test.dart`,
`test/integration/authority_hydration_kardex_integration_test.dart`,
`test/domain/usecases/inventory/sale_inventory_outcome_planner_test.dart`.

## Status log

- Contract written from a read-only integration map of `apps/pos_app`; the issue's
  "the push breaks" premise was falsified and replaced by the payload-refusal and
  silent-inertness findings above. Owner chose badge+detail surfacing (decision 5).
