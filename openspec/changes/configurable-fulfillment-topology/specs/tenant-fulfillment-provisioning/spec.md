# Tenant Fulfillment Provisioning Specification

## Purpose
Define backend-owned, versioned fulfillment configuration consumed safely offline.

## Requirements

### Requirement: Versioned Provisioning and Compatibility
The backend MUST own tenant operation mode, channel modes, and device roles/capabilities in immutable revisions. Devices MAY hold multiple roles; device count MUST NOT infer topology. Existing tenants MUST retain prior behavior until explicitly provisioned, with no history rewriting.

#### Scenario: Provisioned multi-role tenant
- GIVEN a tenant is provisioned with FOOD PARK, KDS_AND_PRINT, and one device having cashier and kitchen roles
- WHEN the POS receives revision 12
- THEN it SHALL use those explicit capabilities and MUST NOT infer additional devices or roles.

#### Scenario: Existing tenant remains compatible
- GIVEN a tenant has no fulfillment revision
- WHEN it processes a sale
- THEN prior behavior SHALL remain active and historical records SHALL remain unchanged.

### Requirement: Shift-Frozen Activation
The POS MUST freeze one accepted revision for each shift; ordinary changes MUST activate at the next shift. Mid-shift activation MUST be limited to a supervised emergency action that records authorization, reason, revision, device, and time.

#### Scenario: Revision waits for next shift
- GIVEN shift A uses revision 3
- WHEN revision 4 is published during shift A
- THEN shift A SHALL continue using revision 3 and shift B SHALL use revision 4.

#### Scenario: Unauthorized emergency activation
- GIVEN a shift is active
- WHEN a user without emergency permission requests activation
- THEN activation MUST be rejected and no snapshot SHALL change.

### Requirement: Offline Snapshot and Conflicts
The POS MUST retain the last valid tenant snapshot and continue operating offline. A stale or conflicting revision MUST be rejected or surfaced for supervised resolution, never silently last-write-wins.

#### Scenario: Offline checkout with cached revision
- GIVEN the backend is unreachable and a valid snapshot exists
- WHEN a sale is finalized
- THEN the POS SHALL use the frozen snapshot and complete the sale.
