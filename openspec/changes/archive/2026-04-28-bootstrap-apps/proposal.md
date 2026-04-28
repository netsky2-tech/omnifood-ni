# Proposal: Bootstrap Apps

## Goal
Scaffold the base projects for the POS application (Flutter) and the Admin Backend (NestJS) within the `apps/` directory, following Clean Architecture and Offline-first principles.

## Approaches
We will use standard CLI tools to initialize the projects and then refactor the directory structure to match the project's architectural layers.

### 1. Flutter POS App (`apps/pos_app`)
- Use `flutter create pos_app`.
- Structure:
  - `lib/core`: Shared logic, themes, DI.
  - `lib/data`: Data sources (SQLite, API), Repository implementations.
  - `lib/domain`: Entities, Use Cases, Repository interfaces.
  - `lib/presentation`: Features (Views + ViewModels).
- Key Dependencies: `provider`, `get_it`, `floor`, `dio`, `freezed`.

### 2. NestJS Backend (`apps/admin_backend`)
- Use `nest new admin_backend`.
- Structure:
  - `src/core`: Middleware, filters, common logic.
  - `src/modules`: Feature-based modules (Sales, Inventory, Billing).
  - `src/integrations`: Adapters for DGI and Banks.
- Key Dependencies: `@nestjs/typeorm`, `typeorm`, `class-validator`, `helmet`.

## Risks
- Initial setup overhead to align with Clean Architecture.
- Potential mismatch in shared logic between apps (will be addressed in future phases).

## Rollback Plan
Delete the `apps/pos_app` and `apps/admin_backend` directories.
