# #521 S1 — Par level, min stock, max stock reach the POS via inbound sync

## Goal

Include `parLevel`, `minStock`, and `maxStock` in the backend's inbound sync DTO and mapper, and in the POS's insumo ingestion handler, so that stock alert thresholds configured in the backoffice are present on the device and can fire alerts.

## Root Cause

- Backend entity `Insumo` has `parLevel`, `minStock`, `maxStock` (`apps/admin_backend/src/modules/inventory/entities/insumo.entity.ts:75-91`).
- Backend DTO `InboundSyncInsumoDto` does not include them (`apps/admin_backend/src/modules/sales/dto/inbound-sync.dto.ts:92-108`).
- Backend mapper `fetchInsumosDeltas` does not output them (`apps/admin_backend/src/modules/sales/services/inbound-sync.service.ts:483-506`).
- POS entity `InsumoEntity` has the columns `par_level`, `stock_min`, `stock_max` (`apps/pos_app/lib/data/models/inventory/insumo_entity.dart:17-22`).
- POS ingestion in `sync_service.dart` maps `id`, `name`, `consumptionUom`, `stock`, `averageCost`, `isActive`, `isPerishable` — but not `parLevel`, `stockMin`, `stockMax`.

## Changes

### Backend (3 files)
1. `apps/admin_backend/src/modules/sales/dto/inbound-sync.dto.ts`:
   Add `parLevel: number | null`, `minStock: number | null`, `maxStock: number | null` to `InboundSyncInsumoDto`.

2. `apps/admin_backend/src/modules/sales/services/inbound-sync.service.ts`:
   In `fetchInsumosDeltas`, add `parLevel: i.parLevel ?? null`, `minStock: i.minStock ?? null`, `maxStock: i.maxStock ?? null` to the returned object.

3. `apps/admin_backend/src/modules/sales/services/inbound-sync.service.spec.ts`:
   Add a test that when insumos are fetched, the response includes `parLevel`, `minStock`, `maxStock` from the mock entity.

### POS (1 file)
4. `apps/pos_app/lib/data/services/sync_service.dart`:
   In the insumos ingestion handler (~line 1848-1860), add:
   ```dart
   parLevel: (map['parLevel'] as num?)?.toDouble(),
   stockMin: (map['minStock'] as num?)?.toDouble(),
   stockMax: (map['maxStock'] as num?)?.toDouble(),
   ```

### POS Tests (1 file)
5. `apps/pos_app/test/data/services/sync_service_test.dart`:
   Add assertions that insumos with `parLevel`, `minStock`, `maxStock` in the delta payload are ingested with those values.

## Allowed edit surfaces
apps/admin_backend/src/modules/sales/dto/inbound-sync.dto.ts
apps/admin_backend/src/modules/sales/services/inbound-sync.service.ts
apps/admin_backend/src/modules/sales/services/inbound-sync.service.spec.ts
apps/pos_app/lib/data/services/sync_service.dart
apps/pos_app/test/data/services/sync_service_test.dart
odd/tasks/issue-521-s1-par-level-sync.md

## Verification
Backend (from `apps/admin_backend`):
1. `npx jest src/modules/sales/services/inbound-sync.service.spec.ts`
2. `npx eslint src/modules/sales/dto/inbound-sync.dto.ts src/modules/sales/services/inbound-sync.service.ts`
3. `npx nest build`

POS (from `apps/pos_app`):
4. `flutter test --concurrency=1 test/data/services/sync_service_test.dart`
5. `flutter analyze`

Do NOT run `npm run lint` in admin_backend (it runs `--fix` on ~106 unrelated files).
Do NOT run `dart format` (SDK 3.11.5 disagrees with repo style).
No commit, no push.
