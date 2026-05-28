# Design: Post-Archive Identity Audit & Quality Hardening

This design resolves explicit quality debt in the backend identity scope to improve test reliability, eliminate lint noise, and increase test coverage. It also addresses legacy schema compatibility.

## Quick path

1. **Test Hygiene**: Implement `afterAll` teardowns in module tests and fix async boundaries to eliminate `pg` overlapping query warnings.
2. **Strict Typing**: Replace `any` casts in `audit.controller.spec.ts` with `jest.Mocked` and proper DTO definitions. Enforce enum safety in `auth.service.ts`.
3. **Coverage Uplift**: Add specific branch tests in `auth.service.spec.ts` for role-sensitive flows.
4. **Clean up specs**: Remove the trivial `user.entity.spec.ts`.
5. **Schema Cleanup (Slice E)**: Drop the obsolete `User.pin_hash` compatibility ballast.

## Details

### Decision: Legacy Compatibility Ballast (Slice E)

**Choice**: Remove legacy compatibility entirely (Option B).
**Alternatives considered**: Keep temporary compatibility ballast (Option A).
**Rationale**: `User.pin_hash` is completely unused in the write path. `user.service.ts` intentionally avoids writing to it, `auth.service.ts` pulls `pin_hash` strictly from `security_profile.pin_hash`, and tests explicitly assert that the legacy field is not persisted. Keeping it increases technical debt without providing fallback value.

### Decision: Test Teardown Strategy

**Choice**: Use `await module.close()` in `afterAll` blocks for all module-level unit and integration tests.
**Alternatives considered**: Pass `--forceExit` and `--detectOpenHandles` to the Jest runner.
**Rationale**: Using runner flags masks the root cause of resource leaks. Calling `module.close()` properly disposes of TypeORM database connection pools and background NestJS providers, fixing the `pg` query warnings organically.

### Decision: Mock Typing Strategy

**Choice**: Use explicit `jest.Mocked<T>` or `Partial<T>` and strict interface casting for test doubles.
**Alternatives considered**: Using `unknown` or `Record<string, unknown>`.
**Rationale**: `jest.Mocked` retains autocomplete and compile-time type safety on mock functions, aligning with the "No Any" NestJS strict typing mandate.

## Data Flow

No architectural data flow changes occur in this quality hardening phase. The change is restricted to testing infrastructure, typescript adherence, and removing dead schema paths. 

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `apps/admin_backend/src/core/app/app.module.spec.ts` | Modify | Add `afterAll` teardown logic to close module and resolve open handles. |
| `apps/admin_backend/src/modules/identity/controllers/audit.controller.spec.ts` | Modify | Replace `any` mocks with `jest.Mocked<T>`, strongly type DTO inputs. |
| `apps/admin_backend/src/modules/identity/services/auth.service.ts` | Modify | Fix unsafe enum comparisons. |
| `apps/admin_backend/src/modules/identity/services/auth.service.spec.ts` | Modify | Add new tests for missing role and edge-case branches. |
| `apps/admin_backend/src/modules/identity/entities/user.entity.spec.ts` | Delete | Remove trivial test file entirely. |
| `apps/admin_backend/src/modules/identity/entities/user.entity.ts` | Modify | Remove `pin_hash` property. |
| `apps/admin_backend/src/migrations/<timestamp>-DropUserPinHash.ts` | Create | Database migration to drop the `pin_hash` column. |

## Interfaces / Contracts

```typescript
// Strict mock definitions for tests (example)
const mockQueryRunner: jest.Mocked<Partial<QueryRunner>> = {
  connect: jest.fn(),
  startTransaction: jest.fn(),
  commitTransaction: jest.fn(),
  rollbackTransaction: jest.fn(),
  release: jest.fn(),
  manager: {
    findOne: jest.fn(),
    insert: jest.fn(),
  } as unknown as EntityManager,
};
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | `auth.service.ts` role checks | Add missing branch scenarios using invalid roles/scopes. |
| Unit | `audit.controller.ts` payload validation | Maintain existing tests but pass fully typed DTO objects instead of `as any`. |
| Suite | Open handles and `pg` warnings | Run `npm test` and assert 0 warnings and clean process exit without `--forceExit`. |

## Migration / Rollout

**Rollback notes for dev-stage environments (Slice E)**:
The down migration for the `pin_hash` column removal will execute:
`ALTER TABLE users ADD COLUMN pin_hash varchar NULL`
Data previously stored in `users.pin_hash` will be lost during the DROP, but this is safe because all active authentication and offline synchronization already relies exclusively on `security_profile.pin_hash`. The rollback safely restores schema compatibility if unexpected hidden consumers break.

## Implementation Slices (400-Line Budget)

1. **Slice A**: Add `afterAll` teardowns in module and e2e specs.
2. **Slice B**: Refactor `audit.controller.spec.ts` to eliminate `any` and fix `auth.service.ts` enums.
3. **Slice C & D**: Extend `auth.service.spec.ts` coverage and delete `user.entity.spec.ts`.
4. **Slice E**: Remove `pin_hash` from `user.entity.ts` and generate TypeORM migration.

## Open Questions

- None. All scope has been clarified and dependencies validated.
