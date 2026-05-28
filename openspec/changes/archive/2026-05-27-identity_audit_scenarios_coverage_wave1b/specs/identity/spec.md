# Delta for identity

## MODIFIED Requirements

### Requirement: Audit Trail Inalterability and Continuity

The system MUST keep `audit_logs` append-only for all tenants.
The system MUST reject any direct `UPDATE` or `DELETE` attempt on `audit_logs` at database level.
The system MUST run an automated nightly continuity check for active audit streams scoped by `(tenant_id, device_id, user_id)`.
The continuity check MUST evaluate only rows where `forensic_status='ACTIVE'`.
The continuity check MUST detect missing `sequence_no` values and produce tenant-scoped alert evidence without cross-tenant leakage.
The system SHOULD avoid duplicate alerts when no new gaps are detected for the same tenant stream.

(Previously: Audit logs were declared append-only at policy level, but DB hard-reject and automated nightly gap evidence were not explicitly required.)

#### Scenario: DB rejects mutation on audit logs

- GIVEN an existing `audit_logs` row for tenant `T1`
- WHEN any actor executes `UPDATE` or `DELETE` against that row
- THEN the database MUST reject the operation with an immutability error
- AND the original row MUST remain unchanged.

#### Scenario: Nightly check finds tenant-scoped gap on active rows

- GIVEN tenant `T1` has an active stream with sequence `10,11,13` and tenant `T2` has a complete active stream
- WHEN the nightly continuity check runs
- THEN the system MUST emit alert evidence for `T1` gap `12`
- AND the run output MUST NOT include `T2` internal stream details.

#### Scenario: Nightly check ignores non-active forensic rows

- GIVEN a stream where missing numbers exist only across rows marked non-`ACTIVE`
- WHEN the nightly continuity check runs
- THEN the system MUST ignore those rows for gap detection
- AND MUST NOT create a gap alert from non-active-only discontinuities.

#### Scenario: No new gaps does not create duplicate noise

- GIVEN a previous alert exists for tenant `T1` stream gap and no new gap appears
- WHEN the next nightly continuity check runs
- THEN the system SHOULD avoid generating duplicate alert evidence for the same unchanged gap.
