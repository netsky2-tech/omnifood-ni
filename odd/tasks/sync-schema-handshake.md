# ODD Task: Sync schema handshake (issue #786)

**Feature**: `sync-schema-handshake`
**Origin**: Defect class D2 from T4.3b field verification (2026-10-06); user flagged it
as a business blocker ("if an owner creates something in the morning and the device
does not receive it, that is a blocker"). Issue: netsky2-tech/omnifood-ni#786.

## Defect

`fetchProductDeltas` (backend) filters rows by `updated_at > since` (the device's
delta cursor). Any DTO field added after the device's cursor passed the row is never
re-emitted: the device keeps its stale projection forever. Concrete instance:
`product.categoryId` (needed for the modifier selector, §30 resolution) never reached
devices with a passed cursor; workaround was `UPDATE products SET updated_at = now()`.

Modifier groups/options/attachments behave correctly because they travel as a
**snapshot without a cursor** — that is the reference design.

## Constraint evidence (T4.3b)

- Pull cadence: every ~5 min; `ohacPosBuild` already travels in the sync query.
- Cursor families and snapshot families must be inventoried before designing.

## Plan

- **T1 — Explore**: map cursor-based families vs snapshot families, cursor semantics,
  the `ohacPosBuild` handshake surface, and existing test coverage
  (`apps/admin_backend` inbound-sync + `apps/pos_app` sync_service).
- **T2 — Design decision** (user): candidate directions are (a) schema/build handshake
  where the device's known schema/build gates re-emission, (b) per-family cursors,
  (c) forced re-emit on payload-schema change. Decide with T1 evidence.
- **T3 — Implement** TDD (RED→GREEN), review, receipt, commit per unit.
- **T4 — Verify**: backend + POS suites; S23 physical pass rides the next release.

## Mandates

- Test-first, English identifiers/comments, Spanish business copy, no internal refs in UI.
- One RDD receipt per unit, burned before its commit.
- Offline-first: local SQLite remains source of truth; backend is eventually consistent.

## Execution log

- **T1 done** (scout, `path:line`): cursor families = products, catalog_values/categories,
  insumos, recipes, recipe_versions, users, loyalty, promotions, customers, alerts
  (`inbound-sync.service.ts:504-1201`, `updated_at > :sinceDate`); snapshot families =
  modifier groups/options/attachments (:1223/:1288/:1348) + fiscal; cursor stored in
  `last_inbound_sync_version` (`sync_service.dart:3479`), server responds `currentVersion`;
  `ohacPosBuild` already read by both sides but only gates OHAC
  (`staff-policy-epoch-delivery.service.ts:89-94`); **no payload schema version exists
  anywhere**. No test covered re-emission of fields on cursor-passed rows (the #786 gap).
- **T2 decided** (product owner): **BUILD-RESET** over schema-handshake — POS-only, zero
  backend/DTO contract changes, the build bump IS the event that pairs with new field
  knowledge; no human-governed version constant to forget.
- **T3 done** (worker `muxi0cec-7-fs7y`, TDD): `_lastInboundSyncBuildKey` +
  build-changed predicate omits `sinceVersion` (`sync_service.dart:3490-3511`) with
  unreadable-build status-quo guard; single `readOhacPosBuild()` read shared with OHAC
  params (signature change, single caller); build persisted only inside the successful-
  ingest block next to the cursor (:4653-4667). RED observed (3 intended failures),
  GREEN **133/133** (127 + 6 new tests) + `flutter analyze` clean — both re-run by the
  orchestrator. numstat +55/−8 (impl) and +318 (tests), surfaces confined.
- **T4 pending**: S23 physical pass rides the next release (OTA → pull → modifier
  selector resolves without the `UPDATE products SET updated_at` workaround).
