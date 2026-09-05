# Q80 Reconnect Auth and Inventory Outcome Acceptance Specification

## Purpose

This root specification is the normative acceptance index for `q80-reconnect-auth-and-inventory-outcome`. The four domain specifications below remain authoritative and are incorporated by reference; this file adds no behavior beyond their requirements and the approved proposal.

## Authoritative Domain Requirements

The system MUST satisfy the complete requirements and scenarios in:

- [`specs/identity/spec.md`](specs/identity/spec.md) — identity, offline access, authorization, and audit integrity.
- [`specs/inventory-core/spec.md`](specs/inventory-core/spec.md) — item categorization, stock policy, valuation, and inventory acceptance anchors.
- [`specs/inventory-sync-topologies/spec.md`](specs/inventory-sync-topologies/spec.md) — ordered, idempotent synchronization outcomes.
- [`specs/sales-core/spec.md`](specs/sales-core/spec.md) — sales, fiscal integrity, and immutable inventory outcome lineage.

A domain requirement is accepted only when its authoritative specification's stated scenarios pass. This root contract does not replace, narrow, or reinterpret those specifications.

## Cross-Domain Invariants

The system MUST preserve these invariants while satisfying the authoritative domain requirements:

- POS PIN unlock MUST remain available offline using the locally synchronized credential; reconnect MUST NOT require full email/password login merely to preserve the local session.
- Cloud credential refresh or rotation MUST preserve valid local access, and credential invalidation MUST be represented by an explicit clear/tombstone outcome rather than an ambiguous generic failure.
- Inventory synchronization and sale synchronization MUST return explicit outcomes, including `APPLIED_NO_INVENTORY_IMPACT` when the authoritative rules identify no inventory impact.
- DGI invoice identity, immutability, and sequential numbering MUST remain intact.
- Repeated delivery or retry MUST be idempotent: it MUST NOT create duplicate invoices or inventory movements.
- Tenant-scoped data, outcomes, alerts, and audit evidence MUST remain isolated between tenants.
- A sale lifecycle MUST NOT create duplicate inventory movements; cancellation reversal and original consumption MUST retain their invoice lineage.

#### Scenario: Cross-domain acceptance preserves safety invariants

- GIVEN an offline-authenticated POS reconnects and replays a sale
- WHEN credentials require refresh and the sale has no applicable inventory impact
- THEN the local session MUST remain governed by the identity requirements
- AND the sync result MUST be explicit
- AND retrying the same operation MUST NOT duplicate the invoice or movement
- AND DGI identity and tenant isolation MUST remain intact.

## Requirement-to-Domain Traceability

| Acceptance concern | Authoritative domain |
|---|---|
| Offline PIN, reconnect authentication, credential state, and audit immutability | `identity/spec.md` |
| Item type and whether inventory can be impacted | `inventory-core/spec.md` |
| Ordered replay, stable idempotency, and duplicate suppression | `inventory-sync-topologies/spec.md` |
| Invoice identity, sale/cancellation lineage, and FOH-to-BOH movements | `sales-core/spec.md` |
| Cross-domain outcome and tenant-safety invariants | The four domains jointly, with this index as the acceptance trace |

Where authoritative requirements appear to conflict, the stricter safety or invariant requirement MUST govern. No conflict resolution may weaken immutability, idempotency, tenant isolation, offline access, or explicit outcome reporting.

## Slice 1 Acceptance Subset

Slice 1 is limited to the durable-storage primitives required by the refresh lifecycle in [`specs/identity/spec.md`](specs/identity/spec.md), using the credential coordination and recovery rules defined in `design.md`:

- an ACTIVE generation stores one complete access/refresh credential pair, never a partial rotation;
- login, refresh, and clear intents share monotonic ordering so a stale response cannot overwrite a newer intent;
- clear persists a CLEARED tombstone that prevents pre-clear responses from resurrecting credentials;
- startup recovery selects only a fully committed, schema-valid, checksum-valid newest generation and otherwise fails closed; and
- credential persistence has no SharedPreferences fallback and never logs token material.

#### Scenario: Slice 1 rejects stale or partial credential state

- GIVEN a credential write is interrupted, corrupted, tied ambiguously, or superseded by a newer login/refresh/clear intent
- WHEN the coordinator commits or recovers durable state
- THEN it MUST activate only the newest unambiguous fully valid generation
- AND MUST discard stale responses without durable or in-memory mutation
- AND MUST preserve a newer CLEARED tombstone over every older ACTIVE generation.

Slice 1 does not wire online login, Dio retry, PIN UI, or synchronization triggers; those remain later slices.
