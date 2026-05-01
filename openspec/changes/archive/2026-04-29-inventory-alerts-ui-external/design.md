# Design: Inventory Alert UI & External Integrations

## Technical Approach
Implement a decoupled notification system. The POS app uses a Stream-based service for immediate UI feedback. The backend uses an event-driven architecture to deliver asynchronous owner alerts via Email and SMS, ensuring a strict separation between the "Inventory" domain and "Notification" infrastructure.

## Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **UI Delivery** | Stream-based Overlay | Allows displaying alerts globally without polluting business widgets with `Scaffold` context. |
| **Backend Hook** | NestJS EventEmitter | Decouples `InventoryModule` from `NotificationModule`; inventory logic doesn't need to know how or where alerts are sent. |
| **Provider Port** | Hexagonal Interface | Allows easy swapping of providers (e.g., Twilio vs local GSM gateway) without changing business rules. |

## Data Flow

### POS (Real-time)
`MovementEngine` --(notify)--> `AlertService (Impl)` --(emit)--> `Stream` --(listen)--> `GlobalOverlay` --> [Toast UI]

### Backend (Sync-triggered)
`InventoryController` --(sync)--> `InventoryService` --(emit LowStockEvent)--> `NotificationListener` --(dispatch)--> `Email/SmsProvider` --> [Owner]

## File Changes

### POS App
- `lib/presentation/services/alert_service_impl.dart`: Concrete implementation with `StreamController`.
- `lib/presentation/widgets/inventory_alert_overlay.dart`: Global listener and visual UI.
- `lib/main.dart`: Inject `AlertService` and wrap app with `GlobalAlertOverlay`.

### Admin Backend
- `src/modules/notifications/`: `notifications.module.ts`, `notifications.service.ts`, `listeners/low-stock.listener.ts`.
- `src/integrations/notifications/ports/`: `email.port.ts`, `sms.port.ts`.
- `src/integrations/notifications/adapters/`: `console-email.adapter.ts` (Stub), `console-sms.adapter.ts` (Stub).

## Interfaces / Contracts

### Email Port
```typescript
export interface EmailPort {
  send(to: string, subject: string, body: string): Promise<void>;
}
```

### Alert Stream (Dart)
```dart
abstract class AlertService {
  Stream<AlertMessage> get alertStream;
  void notifyLowStock(String insumoName, double currentStock, double parLevel);
}
```

## Testing Strategy
| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit (POS) | Alert emission | Verify `alertStream` receives correct values when `notifyLowStock` is called. |
| Unit (Backend) | Event listener | Verify `LowStockListener` calls providers when event is emitted. |
| Integration | End-to-end event | Trigger a sync with low stock and verify console output (stubs). |

## Migration / Rollout
No database schema changes; behavioral rollout only.
