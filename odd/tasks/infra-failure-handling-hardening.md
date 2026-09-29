# infra-failure-handling-hardening

## Goal
Harden silent failure handling across inventory, mapper, terminal, and cache subsystems for findings M5, M6, M7, M8, and M9.

## Findings
- M5: inventory regularization failure after purchase silently swallowed
- M6: 3x empty catch in inventory mapper lets corrupt data pass without warning
- M7: kitchen mapper swallows parse failure
- M8: terminal status check falls back to offline on transient error
- M9: tenant capability cache resets on failure so BOH features disappear

## Constraints
- Preserve offline-first behavior.
- Preserve subsystem stability.
- Keep each fix minimal and localized.
- Do not change unrelated business logic.

## Allowed edit surfaces
- `apps/pos_app/lib/domain/services/inventory/movement_engine_impl.dart`
- `apps/pos_app/lib/data/mappers/inventory_mapper.dart`
- `apps/pos_app/lib/data/mappers/kitchen_mapper.dart`
- `apps/pos_app/lib/data/adapters/terminals/local_network_terminal_adapter.dart`
- `apps/pos_app/lib/data/repositories/tenant_capability_cache.dart`
- `apps/pos_app/test/domain/services/inventory/movement_engine_impl_test.dart`
- `apps/pos_app/test/data/mappers/inventory_mapper_test.dart`
- `apps/pos_app/test/data/mappers/kitchen_mapper_test.dart`
- `apps/pos_app/test/data/adapters/terminals/local_network_terminal_adapter_test.dart`
- `apps/pos_app/test/data/repositories/tenant_capability_cache_test.dart`

## Tasks
1. Replace silent catch blocks with structured logging and observable failure signals.
2. Differentiate transient vs definitive failures where applicable.
3. Preserve in-memory state when persistence fails but the domain state is still valid.
4. Add or extend targeted tests for success and failure branches.

## Acceptance criteria
- No silent swallowed failures remain in the targeted paths.
- Each failure is observable via logging or state-preserving behavior.
- Existing subsystem behavior does not regress.
- Test evidence covers success and failure branches.

## Commit
- Branch: `fix/infra-failure-handling`
- Message: `fix(pos): improve infra failure handling across sync/printer/mapper/cache`
