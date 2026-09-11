# Proposal: Q80 reconnect auth and inventory outcome

## Status

Validated and applied. The initial exploration and design were expanded to cover full immutable SALE_TIME_V1 inventory snapshots, explicit remediation pipelines, and robust two-slot credential CAS recovery. The implementation successfully met all verification criteria.

## Confirmed scope

Address two confirmed Q80 hardware-pilot defects and their architectural root causes:

1. Keep POS local PIN unlock fully offline. During reconnect, safely refresh or rotate cloud credentials using a two-slot robust CAS coordinator. If refresh is unavailable, preserve the local session and report an explicit cloud reauthentication-required outcome instead of a generic error.
2. Treat an onboarding-created SIMPLE verification product without an insumo/recipe as explicitly non-inventoriable. 
3. (Expanded in Design) Decouple inventory snapshots from active recipes. Sale sync must attach immutable snapshot outcomes (`APPLIED`, `APPLIED_NO_INVENTORY_IMPACT`, `APPLIED_INVENTORY_PENDING`) determined at sale time, and use these to compute the Kardex impact.

## Invariants to preserve

- SQLite remains the local source of truth and operates fully offline-first.
- DGI invoice identity, immutability, and sequential numbering remain intact.
- Sync remains strictly idempotent: no duplicate invoice or inventory movements.
- Tenant isolation is rigorously preserved via TypeORM multi-tenancy and RLS policies.
- Remediation operations are explicitly logged, idempotent, and append-only.

## Evidence prompting this change

Invoice `001-001-01-00000001` synced only after full email/password login; PIN-only reconnect received HTTP 401. The backend accepted the invoice but warned about an unresolved insumo and skipped the FOH movement without an explicit no-inventory-impact result. Furthermore, FOH generic movements could race with sales ingestion.

## Implementation Results

The SDD lifecycle executed 13 discrete slices under explicit line-count budgets, introducing immutable checkout outcomes, explicit backend idempotency checks, a comprehensive e2e verification suite mimicking the Q80 gateway, and a safe physical rollout runbook. All unit, database, and e2e integration tests pass.
