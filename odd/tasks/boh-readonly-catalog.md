# #899 — BOH read-only catalog (POS terminal is never a catalog writer)

Owner directives (L1/L2): implement issue #899 as approved, apply the NHilos POS
experience standard to the touched surfaces, remove internal terminology
("Inventario BOH" module naming), and organize the touched screens better.
Owner decision (L3): STRICT read-only now — no terminal-writable catalog fields,
exceptions (e.g. operational stock min/max) deferred to a future issue.

## Specs

- S1 (issue #899 verbatim): "Ninguna superficie del BOH local permite editar
  productos/precios/recetas."
- S2 (issue #899 verbatim): "Un delta de catálogo generado en la terminal no
  sobreescribe el estado del Dashboard."
- S3 (issue #899 verbatim): "Test que reproduce el overwrite actual como RED antes
  del fix."
- S4 (issue #899 verbatim): "UI: ocultar/deshabilitar las superficies de edición de
  catálogo en el BOH local del POS (producto/precio/receta), con un mensaje que
  apunte al Dashboard."
- S5 (issue #899 verbatim): "Defensa en profundidad: el sync inbound delta debe
  ignorar/rechazar escrituras de catálogo originadas en la terminal (la terminal
  nunca persiste deltas de catálogo que ella misma generó)."
- S6 (owner): apply NHilos POS terminal experience standard to every touched POS
  surface; no internal jargon ("BOH", "Backoffice") in user-facing copy.
- S7 (owner): rename the "Inventario BOH" module naming (e.g. "Inventario") and
  better organize the touched screens.
- S8 (owner decision L3): exceptions (operational stock fields) explicitly DEFERRED
  — document as future issue, do not implement.

## Tasks

- T1 (S3): RED test at the backend reproducing the overwrite — a catalog delta
  ingested from a terminal principal overwrites dashboard state.
- T2 (S5 backend half): catalog deltas arriving through sync ingestion are
  terminal-originated by definition (the Dashboard writes via REST, never via
  sync) → reject them at ingestion; pull deltas carry origin metadata.
- T3 (S5 terminal half): the terminal skips persisting catalog deltas whose origin
  is its own deviceId (products, prices, recipes, catalogValues; inventory/insumo
  deltas unaffected).
- T4 (S4, S6, S7): read-only UI — insumo/product edit surfaces and recipe edit
  surfaces in the POS BOH local become read-only with an honest message pointing
  to the Dashboard; "Inventario BOH" naming removed; screens organized per the
  POS standard (P0 first, no dead ends).
- T5 (S8): exceptions documented as a future issue (PR body + issue comment), not
  implemented.
- T6: native review + PR of the branch (feat/boh-readonly-catalog, from main).

## Evidence map (from exploration, 2026-10-13)

- Editable surfaces: InsumoView route /inventory/items behind BohRouteGuard
  (apps/pos_app/lib/main.dart:919-923); form fields in
  lib/ui/features/inventory/items/insumo_view.dart (price :445, save :666-680);
  insumo_view_model.dart:215-250 → repository.saveProduct →
  inventory_repository_impl.dart:204-207. Recipes: route /inventory/recipes
  (main.dart:969-973), recipe_view.dart + recipe_view_model.dart
  (publishDraftVersion :220). item_options_editor.dart already read-only-asserted
  (item_options_editor_readonly_test.dart:97).
- Sync writes: sync_service.dart:3767 _pullInboundDeltas; products :3849-3892;
  catalogValues :3896-3915; insumos :3917-3950; recipes :3997-4012; recipeVersions
  :4033-4086; second product write path activation_priming_service.dart:145.
  No origin/author check exists; delta DTOs carry no author field
  (admin_backend inbound-sync.dto.ts:64-70); backend emitter
  inbound-sync.service.ts:489-620.
- Tests: authority_hydration_kardex_integration_test.dart:48,136,219;
  sync_service_authority_hydration_test.dart:221-348; sync_service_test.dart
  :2706,5762; insumo_view_test.dart:9; recipe_view_test.dart:9.

## Log

- L1 (owner, verbatim): "Vamos con #899, ahi tambien aplicaremos los nhilos
  standard POS, quitr terminologías como el nombre del modulo que se llama
  'Inventario BOH' y organizar mejor aparte de todo lo que la issue piensa resolver"
- L2 (owner decision): strict read-only now ("Estricto ahora, excepciones
  después") — no terminal-writable catalog fields; exceptions deferred to a
  future issue.
- L3: branch feat/boh-readonly-catalog created from main (c68e64c9).
- L4 (native review, lineage review-fdeee5ed336359af, tier high): refuter admitted
  R3-001 CRITICAL introduced — the pull emitter hardcoded source 'DASHBOARD' while
  the POS guard only skipped own-deviceId echoes, making the S5 terminal-side layer
  inert. Correction applied and committed (522e09ba): the terminal now persists
  dashboard-originated catalog rows ONLY (any non-DASHBOARD source is skipped) and
  the DTO source type widened to string with the truthful origin contract. POS
  138/138 (foreign-terminal RED first), backend 105/105, tsc clean.
- L5 (review machinery blocker): the provider correction-plan capture slot rejects
  every submission as "collectBinding is missing or stale" (5 attempts, byte-exact
  bindings from fresh STATUS, with and without workspaceRoot). The lineage stays in
  correction_required with nothing consumed; the R3-001 fix is applied and pushed to
  PR #910 regardless. Native review completion pending on the facade/native-CLI
  side — maintainer may inspect the authority or the slot may be retried later.
