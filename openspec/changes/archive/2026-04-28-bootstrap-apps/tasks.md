# Tasks: Bootstrap Apps

## Phase 1: Project Scaffolding
- [x] 1.1 Execute `flutter create pos_app` within the `apps/` directory.
- [x] 1.2 Execute `nest new admin_backend` within the `apps/` directory (using npm/default settings).

## Phase 2: Flutter Structure Refactoring (Clean Architecture)
- [x] 2.1 Create directories `core`, `data`, `domain`, and `presentation` under `apps/pos_app/lib/`.
- [x] 2.2 Create `apps/pos_app/lib/ui/features/` directory for feature-based organization.
- [x] 2.3 Create `apps/pos_app/lib/data/repositories/`, `apps/pos_app/lib/data/services/`, and `apps/pos_app/lib/data/models/`.
- [x] 2.4 Create `apps/pos_app/lib/domain/repositories/` and `apps/pos_app/lib/domain/models/`.

## Phase 3: NestJS Structure Refactoring
- [x] 3.1 Create directories `core`, `modules`, and `integrations` under `apps/admin_backend/src/`.
- [x] 3.2 Move `app.controller.ts`, `app.service.ts`, and `app.module.ts` to `apps/admin_backend/src/core/` or appropriate subfolders.
- [x] 3.3 Create a placeholder `TenantModule` in `apps/admin_backend/src/modules/tenant/` to establish pattern.

## Phase 4: Initial Dependencies & Config
- [x] 4.1 Update `apps/pos_app/pubspec.yaml` with `provider`, `floor`, `get_it`, `dio`. (Skipped `freezed` due to version conflicts).
- [x] 4.2 Update `apps/admin_backend/package.json` with `@nestjs/typeorm`, `typeorm`, `pg`, `class-validator`, and `helmet`.
- [x] 4.3 Configure `main.ts` in NestJS with global prefix, validation pipe, and security middleware (helmet).

## Phase 5: Verification
- [x] 5.1 Run `flutter pub get` in `apps/pos_app` and verify no errors.
- [x] 5.2 Run `npm install` and `npm run build` in `apps/admin_backend` and verify success.
- [x] 5.3 Verify that both applications start and respect the established directory structure.
