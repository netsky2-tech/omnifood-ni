# Acceptance Matrix — boh_inventory_production_full_implementation

## PRD/UC Traceability

| UC | Requirement | Scenario | Evidence |
|---|---|---|---|
| UC-01 | BCN FX conversion + NIO CPP | USD purchase converted by invoice date and updates average cost | `apps/admin_backend/src/modules/inventory/inventory-purchase.service.spec.ts` |
| UC-02 | Offline delta replay | Ordered inventory deltas are posted with stable idempotency key and source sequence | `apps/pos_app/test/data/services/sync_service_test.dart`, `apps/admin_backend/src/modules/sales/services/invoices.service.spec.ts` |
| UC-03 | Negative stock policy | Stock transitions use previous/new snapshots and movement deltas | `apps/admin_backend/src/modules/sales/services/invoices.service.spec.ts` |
| UC-04 | Count correction | Compensating adjustments append new ledger rows | `apps/admin_backend/src/modules/inventory/inventory-adjustment.service.spec.ts` |
| UC-05 | Recipe versioning and production costing | Immutable recipe snapshots and consumed-value receipt costing | `apps/admin_backend/src/modules/inventory/recipe.service.spec.ts`, `apps/admin_backend/src/modules/inventory/production.service.spec.ts` |
