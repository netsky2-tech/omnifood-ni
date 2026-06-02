# UAT Evidence + PR Slicing Notes

## UAT Evidence

- Inventory ledger runtime writes now target `inventory_kardex` via `InventoryMovement` entity remap.
- Topology sync now posts inventory delta records (not sales aggregates) with deterministic ordering and idempotency keys.
- Production receipt costing now derives unit cost from consumed valuation / produced quantity.
- Forensic alerts now flow through `forensic-alert.service.ts` and are called from shrinkage high-value path.

## PR Slicing Notes (feature-branch-chain)

- Slice A: backend ledger/runtime wiring (`inventory_kardex` remap + FOH valuation snapshots).
- Slice B: topology outbox delta contract (Flutter sync payload + backend DTO/service ingestion expansion).
- Slice C: production costing + forensic alert extraction + task/docs closure.
