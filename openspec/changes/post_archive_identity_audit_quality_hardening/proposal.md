# Proposal: Post-Archive Identity Audit & Quality Hardening

## Intent

Resolve explicit quality debt in the backend identity scope to improve test reliability, reduce lint noise, and increase auth coverage.

## Scope

### In Scope

- **Slice A**: Backend test hygiene (`pg` deprecation, open-handle mitigation).
- **Slice B**: Identity lint baseline reduction (focusing on `audit.controller.spec.ts` and `auth.service.ts`).
- **Slice C**: Critical coverage uplift in `auth.service.ts`.
- **Slice D**: Replace or remove trivial `user.entity.spec.ts`.
- **Slice E**: Remove legacy `User.pin_hash` field (conditional on compatibility gate evidence).

### Out of Scope

- Full elimination of all identity lint findings beyond hotspot files.
- Dropping `users.pin_hash` if the compatibility check fails or evidence is insufficient.

## Capabilities

### New Capabilities

- None

### Modified Capabilities

- `identity`: Hardening backend identity test quality and coverage. Potential database schema cleanup if compatibility gate passes.

## Approach

Implement targeted quality improvements through feature-branch chains, delivering review-safe slices under 400 lines each. Focus on proper dependency teardown in tests, strict TypeScript typing (avoiding `any`), and comprehensive enum-safe checks following NestJS best practices. Slice E requires explicit proof of no existing consumers before execution.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/admin_backend/src/core/app/app.module.spec.ts` | Modified | Open-handle and teardown fixes |
| `apps/admin_backend/src/modules/identity/controllers/audit.controller.spec.ts` | Modified | Typing cleanup and `unknown` replacements |
| `apps/admin_backend/src/modules/identity/services/auth.service.ts` | Modified | Enum-safe comparisons |
| `apps/admin_backend/src/modules/identity/services/auth.service.spec.ts` | Modified | Additional coverage paths |
| `apps/admin_backend/src/modules/identity/entities/user.entity.spec.ts` | Removed/Modified | Replace trivial assertions |
| `apps/admin_backend/src/modules/identity/entities/user.entity.ts` | Modified | Legacy `pin_hash` removal (conditional) |
| `apps/admin_backend/src/migrations/` | New | Drop `pin_hash` column (conditional) |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Test flakiness from hidden leaks | Medium | Use proper teardown over runner flags |
| Scope creep in lint fixes | High | Restrict fixes to predefined hotspots |
| Security regression in auth | Low | Expand negative path coverage |
| Unintended DB schema breakage | Medium | Enforce compatibility gate before Slice E |

## Rollback Plan

- **Slices A-D**: Revert individual chained PRs if test runs fail or block integration.
- **Slice E**: Roll back TypeORM migration down-script and reinstate `User.pin_hash` mapping if hidden consumers fail in staging.

## Dependencies

- Completion of the compatibility investigation for `User.pin_hash`.

## Success Criteria

- [ ] `npm test` runs deterministically without open handles or `pg` warnings.
- [ ] Identity lint hotspots (`audit.controller.spec.ts`, `auth.service.ts`) report 0 warnings/errors.
- [ ] `auth.service.ts` branch and line coverage is improved over the previous 45% baseline.
- [ ] Meaningful assertions replace the trivial `user.entity.spec.ts`.
- [ ] Slice E is either implemented or explicitly deferred with documented justification.