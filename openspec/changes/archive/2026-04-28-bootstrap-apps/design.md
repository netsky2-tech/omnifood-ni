# Design: Bootstrap Apps

## Technical Approach
Initialize the monorepo structure by creating two distinct applications in the `apps/` directory. Each application will follow a strict Clean Architecture layout, separated into core, data, domain, and presentation/integration layers. This ensures that business logic remains independent of UI and external services from day one.

## Architecture Decisions

### Decision: Clean Architecture Layering
| Option | Choice | Rationale |
|--------|--------|-----------|
| Standard CLI | Refactored Clean | CLI defaults mix logic/UI. Separating them ensures testability and scalability for Phase 2. |

### Decision: SQLite Implementation (Flutter)
| Option | Choice | Rationale |
|--------|--------|-----------|
| Sqflite | Floor | Floor provides an abstraction layer (DAO/Entities) that fits perfectly with the Data/Domain layer separation. |

### Decision: Module Organization (NestJS)
| Option | Choice | Rationale |
|--------|--------|-----------|
| Layer-based | Feature-based | Organizing by feature (Sales, Inventory) as per `arch-feature-modules` prevents the backend from becoming a "monolithic layer" blob. |

## Data Flow
Flutter: View ──→ ViewModel ──→ Repository ──→ Service/SQLite
NestJS: Controller ──→ Service ──→ Repository ──→ TypeORM/PostgreSQL

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `apps/pos_app/` | Create | Flutter project root |
| `apps/pos_app/lib/core/` | Create | DI, configuration, common themes |
| `apps/pos_app/lib/domain/` | Create | Plain entities and repo interfaces |
| `apps/pos_app/lib/data/` | Create | SQLite DB (Floor), API client, repo impl |
| `apps/pos_app/lib/presentation/` | Create | Feature-based UI and ViewModels |
| `apps/admin_backend/` | Create | NestJS project root |
| `apps/admin_backend/src/core/` | Create | Global filters, interceptors, middleware |
| `apps/admin_backend/src/modules/` | Create | Feature modules (e.g., `sales`, `tenant`) |
| `apps/admin_backend/src/integrations/` | Create | DGI and Bank API adapters |

## Interfaces / Contracts
```dart
// Flutter Repository Interface Example
abstract class IInvoiceRepository {
  Future<List<Invoice>> getInvoices();
  Future<void> saveInvoice(Invoice invoice);
}
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | Use Cases & ViewModels | Mock repositories and test logic isolation. |
| Integration | SQLite DAOs | Verify local persistence and queries. |
| E2E | API Sync | Test the full sync flow between Flutter and NestJS. |

## Migration / Rollout
No migration required. Initial bootstrap.

## Open Questions
- [ ] Should we use `flutter_bloc` or stick to `ChangeNotifier` + `Provider`? (Recommendation: `ChangeNotifier` for simplicity as per Rule #1).
- [ ] Will we use schema-per-tenant or discriminator-column for NestJS? (Recommendation: Discriminator with RLS as per GEMINI.md).
