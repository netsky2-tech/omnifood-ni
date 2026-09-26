# Issue #559 — Seed script RLS vulnerability audit

Status: in progress · Branch: `chore/559-seed-script-audit` (worktree `issue-559-seed-script`, base `main`)

## Context and Audit Findings

Issue #559 relates to `apps/admin_backend/src/scripts/seed-test-data.ts` writing to DIRECT RLS tables without a bound tenant context in the past (before slice 9). 

The read-only audit confirmed:
1. **Atomicity**: The script always wrapped everything in a single `dataSource.transaction`. Any RLS failure during the unbound exposure window would have rolled back entirely. No partial artifacts exist.
2. **Exposure**: The script is only used manually in local dev and as a prerequisite for `owner_dashboard` integration tests. It never runs in CI.
3. **Current State**: The `bindTenantContext` introduced in slice 9 fully covers all writes. No branching skips it. Other scripts (`provision-dev.ts`, `provision.ts`, `seed-onboarding-founder-pilot.ts`) also correctly call `bindTenantContext`.
4. **Conclusion**: The script is safe, not dead code, and should be kept. However, the manual call to `bindTenantContext` inside `dataSource.transaction` is prone to being forgotten in future scripts.

## Decisions

- **D1 — Script Transaction Wrapper**: Create a specific helper `runInAdminTenantTransaction` in `apps/admin_backend/src/core/database/admin-transaction.ts`. This helper wraps `dataSource.transaction`, ensures the tenant is saved (since `tenants` is a public table), and calls `bindTenantContext` before yielding the manager.
- **D2 — Refactor Scripts**: Update the 4 provisioning scripts to use this new helper.
- **D3 — Lint Guard**: Add an ESLint override for `src/scripts/**/*.ts` forbidding direct `dataSource.transaction` usage, to prevent future bypasses.

## Edit Surfaces

- `apps/admin_backend/src/core/database/admin-transaction.ts`
- `apps/admin_backend/src/scripts/seed-test-data.ts`
- `apps/admin_backend/src/scripts/provision-dev.ts`
- `apps/admin_backend/src/scripts/provision.ts`
- `apps/admin_backend/src/scripts/seed-onboarding-founder-pilot.ts`
- `apps/admin_backend/.eslintrc.js`

## Acceptance Criteria

1. Scripts use `runInAdminTenantTransaction` instead of manual binding.
2. ESLint prevents `dataSource.transaction` in `src/scripts`.
3. `npm run lint` passes in `apps/admin_backend`.
