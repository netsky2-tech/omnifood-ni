# Feature: Product Images Pipeline (Batch 2 — Backend Schema, Sync & Dashboard WebP Compressor)

- **Branch / Worktree:** `feat/product-images-batch2` @ `.worktrees/product-images-batch2` (off `main` c68e64c9)
- **Authority:** User Directive (Option A: WebP 300x300 client-optimized / 100% Offline-First, security boundaries, format & dimension validation), NHILoS Backoffice Experience Standard v1.0.

## Specs

- **S1 (Database Schema & Migration):**
  - Add nullable `image_url` text column to `products` table via migration `1809900000000-AddImageUrlToProducts.ts`.
  - Update `Product` entity with `@Column({ type: 'text', nullable: true, name: 'image_url' }) image_url: string | null;`.
- **S2 (Backend DTOs & Service Contract):**
  - Update `CreateProductDto` and `UpdateProductDto` with optional `image_url`.
  - Update `ProductService.create` and `update` to persist and log `image_url`.
  - Update `serializeProduct` / `product-response.ts`.
  - Update `InboundSyncProductDto` and `InboundSyncService.fetchProductDeltas` to emit `imageUrl: p.image_url ?? null`.
- **S3 (Dashboard Client-Side Compressor & Security Validator):**
  - Implement `ProductImageField` in `apps/owner_dashboard`:
    - Strict MIME format check (`image/jpeg`, `image/png`, `image/webp`).
    - File size bound (max 2 MB raw upload).
    - Natural dimensions validation (min 100x100, max 2048x2048).
    - Canvas-based 1:1 center-crop resize to 300x300 px WebP (quality 0.82) outputting safe data URL (~15-30 KB).
    - Image preview thumbnail + remove/clear action.
    - Accessible Spanish validation error feedback.
- **S4 (Dashboard Products Table & Dialog Integration):**
  - Wire `image_url` into `ProductDialog` create/edit forms.
  - Display product thumbnail (36x36 px) in `ProductTable` alongside product name with monogram fallback.
- **S5 (Verification & Tests):**
  - Backend migration spec and product controller/service unit tests.
  - Dashboard product image validator tests and table thumbnail specs.

## Tasks

- [x] **T1:** Backend migration `1809900000000-AddImageUrlToProducts.ts` and `Product` entity schema update (S1). Commit: `17c6b537`.
- [x] **T2:** Backend DTOs, `ProductService`, and `InboundSyncService` projection of `imageUrl` (S2). Commit: `17c6b537`.
- [x] **T3:** Dashboard `ProductImageField` client-side WebP compressor with strict security & dimension validation (S3). Commit: `79d4cd96`.
- [x] **T4:** Integrate `ProductImageField` in `ProductDialog` and product thumbnail in `ProductTable` (S4). Commit: `79d4cd96`.
- [x] **T5:** Full verification across `admin_backend` and `owner_dashboard` test suites (S5). Verified: 2/2 migration tests, 18/18 product controller tests, 66/66 inbound sync tests, 53/53 dashboard product tests, and 0 typecheck diagnostics.

## Log

- L1: User authorized Batch 2 (Option A: WebP 300x300 client-optimized / 100% Offline-First, security boundaries, format & dimension validation).
- L2: Completed T1 & T2 (migration 1809900000000, product entity, create/update DTOs, product service, and delta sync projection).
- L3: Completed T3 & T4 (ProductImageField with canvas 1:1 center-crop WebP compression, 2MB size gate, MIME validation, table thumbnail with monogram fallback).
- L4: Verified 100% PASS across backend and dashboard suites and clean typecheck.
