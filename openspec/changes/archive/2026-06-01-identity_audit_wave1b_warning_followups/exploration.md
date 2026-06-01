## Exploration: identity_audit_wave1b_warning_followups

### Current State
Wave1B was archived as PASS WITH WARNINGS with three explicit non-blocking follow-ups: (1) no runtime migration harness yet for `1765000000000-CreateAuditIntegrityAlerts.ts`, (2) `npm test` in default parallel Jest mode still emits a forced worker-exit warning, and (3) OpenSpec task `4.3` (docs cleanup) remained open. The existing migration runtime harness pattern already exists in `1764000000000-EnforceAuditLogImmutability.spec.ts` using real Postgres + isolated schema + direct `migration.up/down` execution.

### Affected Areas
- `apps/admin_backend/src/migrations/1765000000000-CreateAuditIntegrityAlerts.ts` — target migration that still lacks runtime up/down proof.
- `apps/admin_backend/src/migrations/1764000000000-EnforceAuditLogImmutability.spec.ts` — reusable reference harness for real Postgres migration testing.
- `apps/admin_backend/package.json` — `npm test` uses default parallel Jest workers (`jest`), where warning appears.
- `apps/admin_backend/src/core/app/app.module.masterdata.spec.ts` — uses `beforeAll` module compile but currently no `afterAll` teardown; likely contributor to worker-exit noise.
- `apps/admin_backend/src/core/app/app.module.spec.ts` — already has `afterAll` teardown; useful baseline for stabilization pattern.
- `openspec/changes/archive/2026-05-27-identity_audit_scenarios_coverage_wave1b/tasks.md` — archived source of unfinished task `4.3`.
- `openspec/changes/archive/2026-05-27-identity_audit_scenarios_coverage_wave1b/verify-report.md` — warning evidence and accepted closure rationale.

### Approaches
1. **Targeted warning-followup micro-change** — create minimal, warning-only hardening scope for issue #24.
   - Pros: Small blast radius; review-safe; aligns with “no feature scope expansion”; directly addresses issue checklist.
   - Cons: May leave broader test-suite hygiene debt untouched if other latent handles exist.
   - Effort: Low/Medium

2. **Broad quality sweep across backend tests/docs** — investigate all potential open handles and documentation inconsistencies in one pass.
   - Pros: Potentially resolves more latent issues at once.
   - Cons: Scope creep risk, likely over 400-line review budget, higher regression/review risk, conflicts with issue intent.
   - Effort: High

### Recommendation
Use **Approach 1**. Keep this change strictly to the three warnings already documented in issue #24: add runtime harness for `176500...`, isolate/fix worker-exit root cause in default `npm test` mode (starting with missing teardown in `app.module.masterdata.spec.ts` and confirming with reruns), and close docs cleanup task `4.3` by reconciling archived Wave1B records and follow-up notes. This is the best fit for minimal, review-safe delivery.

### Risks
- The forced worker-exit warning may have multiple contributors; fixing only one spec teardown might reduce but not fully eliminate warning.
- Task `4.3` references a non-archived path (`openspec/changes/identity_audit_scenarios_coverage_wave1b/...`) while the change is archived under a dated folder; documentation update must avoid rewriting archived truth while still resolving consistency.

### Ready for Proposal
Yes — proceed with a narrow proposal that is limited to migration runtime proof, Jest teardown stabilization in default parallel mode, and OpenSpec docs consistency closure for archived Wave1B.
