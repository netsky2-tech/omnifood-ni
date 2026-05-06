## Exploration: Fixes from Judgment Day R5

### Current State
A recent "Judgment Day" review (Round 5) identified four critical issues spanning the backend and the Flutter POS application. These issues touch upon multi-tenant security, data synchronization robustness, business logic consistency, and regulatory compliance.

### Affected Areas

- **`apps/admin_backend/src/modules/inventory/inventory.service.ts`**: Contains business logic for inventory management. The methods for finding `Insumo` (supply) records lack a `tenant_id` filter, creating a severe multi-tenancy data leak vulnerability.
- **`apps/pos_app/lib/data/services/sync_service.dart`**: This service is responsible for synchronizing local data (sales, inventory movements) with the backend. Its current implementation treats batches as atomic units. If one record in a batch is malformed (a "poison pill"), the entire batch is marked as failed and not processed, blocking valid data from being synced.
- **`apps/pos_app/lib/domain/services/inventory/movement_engine_impl.dart`**: Implements the logic for inventory movements. The `recordShrinkage` method uses a direct, imperative call to an alert service, which is inconsistent with a likely newer, more decoupled alerting pattern expected for this kind of event.
- **`apps/pos_app/lib/data/models/sales/invoice_entity.dart`**: Defines the local database schema for invoices using the Floor library. The `invoice_number` field is missing a `UNIQUE` constraint, creating a risk of duplicate invoice numbers, which violates DGI regulations.

### Approaches

#### 1. Fix Multi-tenant Vulnerability (Backend)
   - **Description**: Modify the `findOne` queries in `inventory.service.ts` to include `tenant_id`. This requires retrieving the tenant context, which is typically available on the request object in NestJS and passed down to the service layer.
   - **Pros**: Directly solves the security vulnerability. Aligns with the project's stated architectural principles (RLS).
   - **Cons**: None. This is a mandatory fix.
   - **Effort**: Low.

#### 2. Refactor Sync Service for Poison Pill Resilience (Flutter & Backend)
   - **Description**:
     - **Backend**: The `syncMovements` transaction should not be all-or-nothing. It should loop through movements, save them individually, and catch errors per-item, adding failed items to a list to return to the client.
     - **Frontend**: The `SyncService` should handle a partial success response from the backend. Instead of marking the whole batch as failed on a 4xx, it should expect a response like `{"processed": [...], "failed": [...]}`. It would then mark only the failed IDs as failed, allowing the rest of the valid items to be marked as synced.
   - **Pros**: Makes the sync process dramatically more robust and resilient. Prevents a single bad record from halting the sync of an entire location.
   - **Cons**: Requires coordinated changes between the frontend and backend.
   - **Effort**: Medium.

#### 3. Unify Alert Logic (Flutter)
   - **Description**: Refactor `recordShrinkage` in `movement_engine_impl.dart`. Instead of calling the alert service directly, it should emit a `ShrinkageRecorded` event or a more generic `StockChanged` event. A separate listener would then be responsible for evaluating the stock level and triggering a low-stock alert if necessary.
   - **Pros**: Decouples inventory movement logic from notification logic. Improves maintainability and aligns with event-driven principles.
   - **Cons**: None. This is a code quality and consistency improvement.
   - **Effort**: Low.

#### 4. Add DGI Compliance Constraint (Flutter)
   - **Description**: Add an `Index` with `unique = true` to the `@Entity` annotation for `InvoiceEntity` in `invoice_entity.dart`. The new annotation would be: `@Entity(tableName: 'invoices', indices: [Index(value: ['invoice_number'], unique: true)])`. This will require a database migration.
   - **Pros**: Enforces data integrity at the database level, preventing a critical DGI compliance violation.
   - **Cons**: Requires a database migration, which must be handled carefully in a production application to avoid data loss. Floor has a migration path that needs to be implemented.
   - **Effort**: Low (for the code change), Medium (for managing the migration).

### Recommendation
All four fixes are critical and should be implemented.

1.  **Immediate**: Fix the multi-tenant vulnerability. It's a security flaw.
2.  **High Priority**: Implement the Poison Pill and DGI constraint fixes. The sync failure is causing data loss/staleness, and the lack of a unique constraint is a major compliance risk.
3.  **Important**: Refactor the alert logic. While not a critical bug, it's an important architecture and consistency fix.

I recommend tackling them in this order of priority, but they can be bundled into a single change set.

### Risks
- **Database Migration**: The `UNIQUE` constraint change on the `invoices` table will require a database migration in the Flutter app. If not handled correctly, users could experience crashes or data loss upon updating the app. A robust migration plan is essential.

### Ready for Proposal
Yes. The exploration is complete, and the issues are well-understood. The next step is to create a formal proposal (`sdd-propose`) to address these findings.
