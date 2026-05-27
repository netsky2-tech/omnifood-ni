## Exploration: post_archive_identity_audit_quality_hardening

### Current State
- Previous identity/audit change is functionally closed (`PASS WITH WARNINGS`) but left explicit quality debt in backend identity scope (`openspec/changes/prd_gestion_identidad_acceso_y_auditoria/verify-report.md`).
- Legacy compatibility field still exists in runtime entity: `User.pin_hash` remains mapped in `apps/admin_backend/src/modules/identity/entities/user.entity.ts`, while active credential flow already uses `SecurityProfile.pin_hash` in `apps/admin_backend/src/modules/identity/entities/security-profile.entity.ts`, `user.service.ts`, `auth.service.ts`, and `src/scripts/provision.ts`.
- Backend test hygiene warnings are reproducible now: `npm test` emits `pg` deprecation warnings (`client.query()` while already executing) and forced worker exit/open-handle noise.
- Identity lint baseline is currently substantial and concentrated in test typing/unsafe usage rather than business modules: running lint against identity files returns 119 findings (113 errors, 6 warnings), with a large concentration in `audit.controller.spec.ts` plus enum-safety issues in `auth.service.ts`.
- `apps/admin_backend/src/modules/identity/entities/user.entity.spec.ts` is trivial (`expect(user).toBeDefined()` only), and changed-file backend coverage remains lowest in `auth.service.ts` (45% lines in prior verify report).

### Affected Areas
- `apps/admin_backend/src/modules/identity/entities/user.entity.ts` — remove legacy `pin_hash` compatibility column mapping.
- `apps/admin_backend/src/migrations/*.ts` (new migration required) — schema change to drop `users.pin_hash` after compatibility gate.
- `apps/admin_backend/src/modules/identity/services/auth.service.ts` — tighten role typing comparisons and add coverage for uncovered branches.
- `apps/admin_backend/src/modules/identity/services/auth.service.spec.ts` — extend tests to cover low-coverage paths and enum-safe behavior.
- `apps/admin_backend/src/modules/identity/entities/user.entity.spec.ts` — replace or remove trivial spec.
- `apps/admin_backend/src/modules/identity/controllers/audit.controller.spec.ts` — primary lint debt hotspot (`any`, `require`, unsafe member access).
- `apps/admin_backend/src/modules/identity/services/user.service.spec.ts` and `security/totp-secret.transformer.spec.ts` — secondary lint debt hotspots.
- `apps/admin_backend/src/core/app/app.module.spec.ts` and `app.module.masterdata.spec.ts` — likely open-handle contributors (module compilation without teardown).
- `apps/admin_backend/package.json` / test scripts and Jest config — place to add deterministic hygiene flags/targeted runner adjustments.

### Approaches
1. **Quality-first minimal hardening (recommended)** — land test/lint/coverage hygiene first, keep schema drop gated but included only if compatibility check passes.
   - Pros: Low regression risk; directly addresses warnings that block confidence for next changes; fits chained small PRs under 400 lines.
   - Cons: Legacy column removal may be deferred to final slice if compatibility evidence is not ready.
   - Effort: Medium

2. **Single-shot full cleanup** — remove `User.pin_hash`, refactor tests/lint, and improve coverage in one PR.
   - Pros: Closes all warning items in one cycle.
   - Cons: High review density, higher rollback risk, likely exceeds 400-line review budget and mixes schema + quality concerns.
   - Effort: High

### Recommendation
Use **Approach 1** with incremental review slices and explicit go/no-go gate for dropping `users.pin_hash`.

Proposed slices (target each under ~400 review lines):
1. **Slice A (mandatory): test hygiene**
   - Add deterministic teardown in app-level module/e2e specs and remove open-handle noise.
   - Re-run `npm test` and `npm run test:e2e`; capture remaining warning source if any.
2. **Slice B (mandatory): identity lint baseline reduction**
   - Focus first on `audit.controller.spec.ts` typing cleanup (`unknown`/typed mocks/imports).
   - Fix enum-unsafe comparisons in `auth.service.ts`.
3. **Slice C (mandatory): critical coverage uplift**
   - Raise `auth.service.ts` branch/line coverage with targeted tests for role/scope edge paths.
4. **Slice D (mandatory): trivial spec replacement/removal**
   - Replace `user.entity.spec.ts` with meaningful mapping/selection assertions or remove it if redundant.
5. **Slice E (conditional mandatory): legacy column removal**
   - Remove `User.pin_hash` + migration to drop DB column only after compatibility gate is explicitly satisfied.

Mandatory in this change:
- Test hygiene warnings (pg/open handles) mitigation path with reproducible green runs.
- Identity lint baseline reduction focused on high-volume offenders.
- Coverage uplift for backend `auth.service.ts` (critical low-coverage changed file).
- Replace/remove trivial `user.entity.spec.ts`.

Deferred only if budget/risk pressure appears:
- Full elimination of all identity lint findings beyond the hotspot files.
- Physical DB drop of `users.pin_hash` if compatibility closure cannot be proven during this cycle.

### Risks
- **Schema risk**: dropping `users.pin_hash` too early can break hidden compatibility consumers (scripts/reporting/manual tooling) not covered by current tests.
- **Test flakiness risk**: open-handle fixes can hide true resource leaks if done only via runner flags rather than proper teardown.
- **Scope creep risk**: trying to fully zero lint in identity in one pass can exceed 400-line review budget and delay higher-impact debt closure.
- **Security regression risk**: auth sync behavior has role-sensitive branches; coverage additions must include negative paths to avoid accidental exposure.

### Ready for Proposal
Yes — scope is clear, dependencies are identified, and the change can be executed as 4 mandatory + 1 conditional slice under the review budget.
