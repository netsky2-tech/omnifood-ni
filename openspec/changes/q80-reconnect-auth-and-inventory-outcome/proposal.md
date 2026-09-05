# Proposal: Q80 reconnect auth and inventory outcome

## Status

Initialized for SDD exploration. Design, specifications, tasks, and implementation are intentionally deferred.

## Confirmed scope

Address two confirmed Q80 hardware-pilot defects:

1. Keep POS local PIN unlock fully offline. During reconnect, safely refresh or rotate cloud credentials and retry the cloud operation once. If refresh is unavailable, preserve the local session and report an explicit cloud reauthentication-required outcome instead of the generic `Sales;Catálogo` error.
2. Treat an onboarding-created SIMPLE verification product without an insumo/recipe as explicitly non-inventoriable. Sale sync must return and audit `APPLIED_NO_INVENTORY_IMPACT`, rather than silently skipping inventory while reporting ordinary `APPLIED`.

## Invariants to preserve

- SQLite remains the local source of truth.
- DGI invoice identity, immutability, and sequential numbering remain intact.
- Sync remains idempotent: no duplicate invoice or inventory movements.
- Tenant isolation is preserved.
- The selected SIMPLE onboarding verification behavior is `APPLIED_NO_INVENTORY_IMPACT` semantics.

## Evidence prompting this change

Invoice `001-001-01-00000001` synced only after full email/password login; PIN-only reconnect received HTTP 401. The backend accepted the invoice but warned about an unresolved insumo and skipped the FOH movement without an explicit no-inventory-impact result.

## Deferred artifacts

Exploration, detailed specification/scenarios, architecture design, task breakdown, implementation, and verification will be created in subsequent SDD phases.
