# Proposal: Fixes from Judgment Day R5

## Intent

To address four critical issues identified during the "Judgment Day Round 5" review. These fixes are essential for improving multi-tenant security, data synchronization robustness, business logic consistency, and regulatory (DGI) compliance.

## Scope

### In Scope
- Patching the multi-tenant data-leak vulnerability in the backend's inventory service.
- Refactoring the frontend and backend sync services to be resilient to "poison pill" records in a batch.
- Unifying the alerting logic for inventory shrinkage in the Flutter app to use the modern, decoupled pattern.
- Enforcing DGI compliance by adding a `UNIQUE` constraint to the `invoice_number` field in the local mobile database.

### Out of Scope
- A full audit of all database queries for multi-tenancy issues (though recommended as a follow-up).
- Refactoring other services that might use a similar "old" alerting logic.
- Any UI/UX changes not directly related to these fixes.

## Capabilities

### New Capabilities
<!-- Capabilities being introduced. Each becomes a new `openspec/specs/<name>/spec.md`.
     Use kebab-case names (e.g., user-auth, data-export, api-rate-limiting).
     Leave empty if no new capabilities. -->
- `resilient-sync`: Defines the contract for frontend/backend synchronization that can gracefully handle and report on invalid records within a batch without halting the entire process.

### Modified Capabilities
<!-- Existing capabilities whose REQUIREMENTS are changing (not just implementation).
     Only list here if spec-level behavior changes. Each needs a delta spec.
     Use existing spec names from openspec/specs/. Leave empty if none. -->
- `inventory-core`: Queries for `Insumo` must be filtered by `tenant_id`.
- `sales-core`: The `invoice_number` must be unique in the local database. Sales synchronization must adhere to the `resilient-sync` capability.
- `inventory-movements`: Inventory movement synchronization must adhere to the `resilient-sync` capability.
- `inventory-shrinkage`: Generating alerts for shrinkage events must be decoupled from the recording of the event itself.

## Approach

We will implement the four recommended fixes from the exploration phase:
1.  **Multi-tenant Fix**: Add `tenant_id` to the `where` clause of `findOne` queries for `Insumo` in `inventory.service.ts`.
2.  **Resilient Sync**: The backend will be modified to process sync batches item-by-item within a transaction, returning lists of processed and failed IDs. The Flutter client will be updated to handle this new response format, marking only failed records for later inspection.
3.  **Alert Logic**: Refactor `recordShrinkage` to emit a `StockChanged` event, allowing a dedicated listener to handle low-stock notifications.
4.  **DGI Constraint**: Add a Floor `Index` with `unique = true` to the `invoice_number` field in `InvoiceEntity` and implement the necessary database migration.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/admin_backend/src/modules/inventory/inventory.service.ts` | Modified | Add `tenant_id` to queries and modify transaction handling for sync. |
| `apps/pos_app/lib/data/services/sync_service.dart` | Modified | Update error handling and data marking logic for sync batches. |
| `apps/pos_app/lib/domain/services/inventory/movement_engine_impl.dart`| Modified | Decouple alert logic from shrinkage recording. |
| `apps/pos_app/lib/data/models/sales/invoice_entity.dart` | Modified | Add `UNIQUE` index annotation for `invoice_number`. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Database migration failure on Flutter clients. | Medium | Implement a comprehensive migration test plan. The migration logic must be robust to handle the schema change without data loss. Provide clear instructions for manual intervention if a user's migration fails. |

## Rollback Plan

- **Backend**: A standard Git revert of the deployed commits, followed by redeployment.
- **Frontend**: In case of a critical migration failure, a hotfix release will be prepared. This release will contain a new migration version that can either revert the schema or safely move data to the corrected schema. The `resilient-sync` changes are backward-compatible from the client's perspective (it will just see whole batches fail, as it does now), but the backend change is not.

## Dependencies
- None.

## Success Criteria
- [ ] Backend queries for `Insumo` without a `tenant_id` context either fail or are impossible to construct.
- [ ] A sync batch of 50 inventory movements containing 1 "poison pill" results in 49 successful syncs and 1 reported failure.
- [ ] Recording a shrinkage that brings stock below the par level generates a low-stock alert via the event/listener system.
- [ ] Attempting to save two invoices with the same `invoice_number` in the local database results in a `UNIQUE` constraint violation error.
