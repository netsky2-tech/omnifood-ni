# Feature: POS Product Images Integration (Batch 3)

- **Branch / Worktree:** `feat/pos-product-images-batch3` @ `.worktrees/pos-product-images-batch3` (off `main` 395982e6)
- **Authority:** User Directive (Option A: 100% Offline-First, base64 WebP / network image support in cards, initials monogram fallback), `AGENTS.md` (Offline-First or Muerte).

## Specs

- **S1 (Floor SQLite & Domain Schema):**
  - Add `imageUrl` to `Product` Freezed model (`apps/pos_app/lib/domain/models/inventory/product.dart`).
  - Add `image_url` column to `ProductEntity` Floor model (`apps/pos_app/lib/data/models/inventory/product_entity.dart`).
  - Add database migration 72→73 in `migrations.dart` and increment database version to 73 in `app_database.dart`.
- **S2 (Mappers & Sync Integration):**
  - Map `imageUrl` between `ProductEntity` and `Product` in `InventoryMapper`.
  - In `SyncService`, map inbound delta `map['imageUrl']` into `ProductEntity`.
- **S3 (POS Card Thumbnail & Fallback):**
  - Extend `ProductCardThumbnail` with `imageUrl`.
  - Render base64 data URLs via `Image.memory` and network URLs via `Image.network`, cropped to rounded squircle (`BoxFit.cover`).
  - Gracefully fall back to category icon or typographic monogram on null, empty, or decode error.
  - Wire `product.imageUrl` in `sale_view.dart`.
- **S4 (Code Generation & Verification):**
  - Re-generate Freezed / Floor outputs via `build_runner`.
  - Unit tests for thumbnail image decoding, fallback, and database migration.

## Tasks

- [x] **T1:** Update `Product` domain model, `ProductEntity`, and Floor migration 72→73 (S1). Commit: `acf68c24`.
- [x] **T2:** Update `InventoryMapper` and `SyncService` for inbound product `imageUrl` (S2). Commit: `acf68c24`.
- [x] **T3:** Implement `ProductCardThumbnail` image decoding, styling, and monogram fallback in `sale_view.dart` (S3). Commit: `acf68c24`.
- [x] **T4:** Run `build_runner` code generation and verify with test suites (S4). Verified: 1252 outputs generated, 30/30 tests PASS (`product_card_thumbnail_test`, `product_visual_resolver_test`, `migrations_test`), `flutter analyze` clean (0 errors).

## Log

- L1: User authorized Batch 3 (POS App integration with Option A offline-first images and card presentation).
- L2: Added imageUrl to Product Freezed model, ProductEntity, and Floor migration 72->73.
- L3: Mapped imageUrl in InventoryMapper and SyncService.
- L4: Implemented ProductCardThumbnail supporting base64 data URLs via Image.memory and network URLs with rounded squircle clip and monogram fallback.
- L5: Ran build_runner and verified 30/30 tests pass with flutter analyze clean.
