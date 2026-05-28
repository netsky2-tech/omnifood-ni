# Proposal: Identity Audit Scenarios Coverage Wave1B

## Intent

Close backend audit evidence gaps for append-only compliance: enforce DB-level immutability on `audit_logs` and detect tenant-scoped sequence gaps automatically each night.

## Scope

### In Scope
- Add PostgreSQL trigger/function rejecting `UPDATE` and `DELETE` on `audit_logs`.
- Add nightly tenant-scoped sequence-gap scan for active audit streams.
- Add backend tests for immutability rejection, gap detection, and alert behavior.

### Out of Scope
- Backfilling or repairing historical gaps automatically.
- New UI for alerts or broad audit refactors beyond required evidence.

## Capabilities

### New Capabilities
- `identity-audit-integrity-monitoring`: Nightly integrity checks for `(tenant_id, device_id, user_id)` streams, with gap alerts scoped per tenant.

### Modified Capabilities
- `identity`: Strengthen audit-trail requirements so append-only behavior is enforced by DB trigger, and active-stream sequence continuity is checked automatically.

## Approach

Implement in two review-safe slices. Slice 1 adds a migration with `BEFORE UPDATE OR DELETE` rejection on `audit_logs` and test evidence. Slice 2 adds an identity integrity service plus nightly scheduler/job hook that scans `forensic_status='ACTIVE'` rows for missing `sequence_no` values and emits deduplicated alerts.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/admin_backend/src/migrations/*.ts` | Modified | Add immutable-row trigger/function and rollback SQL. |
| `apps/admin_backend/src/modules/identity/**` | Modified | Add nightly integrity checker and alert emission path. |
| `apps/admin_backend/src/modules/identity/controllers/audit.controller.spec.ts` | Modified | Add immutability and gap-detection evidence tests. |
| `openspec/specs/identity/spec.md` | Modified | Update audit requirements and scenarios. |
| `openspec/specs/identity-audit-integrity-monitoring/spec.md` | New | Define nightly gap monitoring capability. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Trigger blocks future remediation flows | Med | Scope trigger to `audit_logs`; require explicit new migration for exceptions. |
| Nightly scan is expensive | Med | Query only indexed active streams and validate plan in tests/review. |
| False-positive gaps from quarantined rows | Med | Filter consistently by `forensic_status='ACTIVE'`. |

## Rollback Plan

Revert the new migration to drop trigger/function, disable the scheduled job, and remove the new monitoring spec if the change is abandoned before archive.

## Dependencies

- Existing `audit_logs` sequence uniqueness baseline and tenant RLS behavior.
- Backend scheduler/job mechanism already accepted in `apps/admin_backend`.

## Success Criteria

- [ ] Any direct `UPDATE` or `DELETE` against `audit_logs` fails at DB level in automated evidence.
- [ ] A nightly run detects a synthetic gap for one tenant stream without leaking another tenant's data.
- [ ] No-gap streams produce no duplicate alert noise in automated tests.
