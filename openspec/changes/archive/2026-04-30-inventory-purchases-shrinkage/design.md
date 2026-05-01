# Design: Inventory Purchases & Shrinkage

## Technical Approach
Implement purchase and shrinkage recording as transactional operations. Use a dedicated `PurchaseService` and `ShrinkageService` in NestJS to manage the orchestration of stock updates, Kardex logs, and WAC recalibrations. The POS UI will provide dedicated forms for both operations, ensuring that the necessary metadata (Supplier for purchase, Reason for shrinkage) is captured.

## Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Transactional Consistency** | DB Transaction (TypeORM) | Ensures stock update and Kardex log insertion succeed or fail as one unit. |
| **Conversion Logic** | Service-level application | Ensures conversion logic is consistent across all purchase entry points. |
| **UI Validation** | Form Validators (Flutter) | Enforce non-negative values and mandatory reason fields in the UI. |

## Data Flow
`UI Form` --(Submit)--> `Controller` --(Service Method)--> `Database Transaction`
                                                                │
                                    ┌───────────────────────────┴────────────────────────────┐
                                    ▼                                                        ▼
                        [Stock Update]                              [Kardex Log Update]

## File Changes

### Admin Backend
- `src/modules/inventory/`: Add `purchase.service.ts`, `shrinkage.service.ts`, `purchase.controller.ts`, `shrinkage.controller.ts`.
- `src/modules/inventory/inventory.service.ts`: Update conversion factor application.

### POS App
- `lib/ui/features/inventory/purchases/`: `purchase_view_model.dart`, `purchase_view.dart`.
- `lib/ui/features/inventory/shrinkage/`: `shrinkage_view_model.dart`, `shrinkage_view.dart`.

## Interfaces / Contracts

### Purchase Request (API)
```typescript
interface RecordPurchaseDto {
  insumoId: string;
  supplierId: string;
  quantity: number; // In purchase UOM
  unitCost: number; // Cost per purchase unit
}
```

## Testing Strategy
| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | WAC/Conversion Logic | Jest unit tests with mock repository values. |
| Integration | Kardex Transaction | Ensure stock and movement are consistent in Postgres. |
| UI | Form submission | Verify navigation and state in Flutter tests. |

## Migration / Rollout
No database migration required, as entities already support movement fields.

## Open Questions
- [ ] Should shrinkage affect the cost average? (Decided: No, shrinkage only affects stock/Kardex).
