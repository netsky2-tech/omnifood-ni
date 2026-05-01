# Tasks: Inventory Alert UI & External Integrations

## Phase 1: Foundation

### Backend (NestJS)
- [x] 1.1 Create `src/integrations/notifications/ports/email.port.ts` and `sms.port.ts`.
- [x] 1.2 Create `src/modules/notifications/notifications.module.ts`.
- [x] 1.3 Implement `src/integrations/notifications/adapters/console-email.adapter.ts` and `console-sms.adapter.ts` (stubs).

### POS App (Flutter)
- [x] 1.4 Refactor `lib/domain/services/inventory/movement_engine.dart` to expose `alertStream`.
- [x] 1.5 Implement `lib/presentation/services/alert_service_impl.dart` using a `StreamController`.

## Phase 2: Core Implementation

- [x] 2.1 Create `src/modules/notifications/listeners/low-stock.listener.ts` to handle backend events.
- [x] 2.2 Create `lib/presentation/widgets/inventory_alert_overlay.dart` to display toasts from the stream.
- [x] 2.3 Add "Low Stock" event emission to `InventoryService.recordPurchase` (and sync handlers).

## Phase 3: Wiring

- [x] 3.1 Register `NotificationModule` in `AppModule`.
- [x] 3.2 Update `main.dart` to provide `AlertServiceImpl` and wrap the app with `InventoryAlertOverlay`.
- [x] 3.3 Ensure `MovementEngineImpl` correctly triggers the new `AlertService` implementation.

## Phase 4: Testing (Verification)

- [x] 4.1 Unit Test: Verify `LowStockListener` calls providers when event is emitted.
- [x] 4.2 Unit Test: Verify `AlertServiceImpl` emits to stream when `notifyLowStock` is called.
- [x] 4.3 Integration: Verify console logs for Email/SMS when a low-stock event occurs in the backend.
