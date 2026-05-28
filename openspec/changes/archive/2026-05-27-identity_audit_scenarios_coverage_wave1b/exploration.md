## Exploration: identity_audit_scenarios_coverage_wave1b

### Current State
Wave1A already closed RBAC critical scenarios and one-transaction override flows, but left audit immutability/signoff gaps open for backend evidence. Current backend audit path (`POST /identity/audit`) enforces append continuity at service level (hash validation, per-stream sequence, advisory lock, unique partial index for ACTIVE rows), yet there is still no explicit **DB-level reject UPDATE/DELETE** control on `audit_logs`, and no implemented **nightly gap alert** mechanism for stream sequence integrity.

### Affected Areas
- `apps/admin_backend/src/modules/identity/entities/audit-log.entity.ts` — current forensic model and index scope (`forensic_status`, stream uniqueness).
- `apps/admin_backend/src/modules/identity/controllers/audit.controller.ts` — insert-time chain validation baseline; should stay insert-only and become consumer of DB immutability constraints.
- `apps/admin_backend/src/migrations/1762000000000-AddAuditStreamSequenceUniqueness.ts` — prior wave migration baseline for sequence uniqueness.
- `apps/admin_backend/src/migrations/*.ts` (new migration expected) — DB-level trigger/function strategy for immutable rows + optional audit-gap materialization table/view.
- `apps/admin_backend/src/modules/identity/controllers/audit.controller.spec.ts` — existing ingest tests; extend with conflict/immutability behavior expectations where applicable.
- `apps/admin_backend/src/modules/identity/**` (new service/spec) — nightly integrity checker and alert emission path for S-AUDIT-02 evidence.
- `docs/Scenarios/gestion_identidad_acceso_auditoria_signoff_checklist.md` — source of closure criteria for S-AUDIT-01/S-AUDIT-02 and related partial S-DRAWER-03 evidence.

### Approaches
1. **DB-trigger immutability + scheduled gap detector (direct compliance path)** — Add PostgreSQL trigger(s) that hard-reject UPDATE/DELETE on `audit_logs`, plus backend scheduled integrity job that scans per-stream sequence gaps and emits alerts.
   - Pros: Strongest compliance evidence for S-AUDIT-01 and S-AUDIT-02; immutable guarantee enforced at source of truth; clear testable artifacts (migration SQL + integration tests + alert test).
   - Cons: Introduces migration + scheduler complexity; requires careful tenant-aware scanning and noisy-alert prevention.
   - Effort: Medium

2. **Application-only protections (repository/controller guards) + ad-hoc integrity command** — Block update/delete in service code and add manual script for gap checks.
   - Pros: Lower immediate code churn; easier short-term implementation.
   - Cons: Weaker audit defensibility (DB still mutable via direct SQL); does not fully satisfy scenario wording requiring DB constraint/trigger rejection and automatic nightly alert.
   - Effort: Low

### Recommendation
Use **Approach 1**.

Review-safe plan (<=400 lines total target; chain if drift):

- **Slice 1 (target ~170-240 lines): DB immutability hardening**
  - Add migration with `BEFORE UPDATE OR DELETE` trigger raising exception on `audit_logs`.
  - Add migration spec test validating SQL statements.
  - Add minimal integration/unit evidence that update/delete attempts surface DB error.
  - Primary closure: **S-AUDIT-01** + reinforcement for **S-DRAWER-03** (“no se puede modificar/eliminar”).

- **Slice 2 (target ~150-230 lines): Nightly sequence gap audit + alert evidence**
  - Add dedicated integrity-check service (identity module) that scans `(tenant_id, device_id, user_id)` streams for missing `sequence_no`.
  - Add scheduled execution (nightly cron or explicit job hook already used by backend conventions) and structured alert output.
  - Add tests covering: no gaps (no alert), synthetic gap (alert created), multi-tenant isolation.
  - Primary closure: **S-AUDIT-02**.

If combined estimate exceeds 400 changed lines, keep **feature-branch chain** boundaries exactly at Slice 1 -> Slice 2.

### Risks
- Trigger design risk: overly broad trigger could block legitimate forensic-status remediation if future flows require quarantine updates.
- Operational risk: nightly job over large audit volume may be expensive without indexed query strategy.
- False-positive risk: historical quarantined/legacy rows can generate artificial gaps unless checker filters `forensic_status='ACTIVE'` consistently.
- Multi-tenant risk: missing tenant scoping in checker may leak cross-tenant integrity signals.

### Ready for Proposal
Yes — proceed with proposal focused on two review-safe backend slices (immutability trigger first, nightly gap alert second), with explicit chained boundary if forecast exceeds 400 lines.
