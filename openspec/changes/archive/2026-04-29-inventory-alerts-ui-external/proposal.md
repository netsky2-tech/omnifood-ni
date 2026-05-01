# Proposal: Inventory Alert UI & External Integrations

## Intent
Provide real-time feedback to POS users and remote notifications to business owners when inventory stock levels reach critical thresholds (PAR levels). This bridges the gap between domain logic and user awareness.

## Scope

### In Scope
- **UI Alerts (Flutter)**: Implement `AlertServiceImpl` using a Stream/Listener pattern to show SnackBars or Overlay Toasts in the POS app.
- **Backend Notifications (NestJS)**: New `NotificationModule` to handle outgoing alerts.
- **Email/SMS Adapters**: Hexagonal integration for external providers (e.g., Mailer, Twilio port).
- **Event Hook**: Connect `InventoryService` in the backend to trigger external notifications upon receiving low-stock sync events.

### Out of Scope
- Configurable alert templates (Hardcoded for now).
- Multi-channel preference management (Owner receives all configured channels).

## Capabilities

### New Capabilities
- `inventory-ui-alerts`: Real-time visual notifications in the POS application.
- `external-notifications`: Delivery of alerts via Email and SMS.

### Modified Capabilities
- `inventory-par-alerts`: Update requirement to include delivery via UI and external channels.

## Approach
- **Frontend**: Create a `GlobalAlertManager` widget that listens to the `AlertService` stream.
- **Backend**: Use NestJS `EventEmitter` for local event handling between `InventoryModule` and `NotificationModule`.
- **Integrations**: Define `EmailProvider` and `SmsProvider` interfaces (ports) and implement stubs/adapters.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/pos_app/lib/presentation/services` | New | `alert_service_impl.dart`. |
| `apps/pos_app/lib/presentation/widgets` | New | `inventory_alert_overlay.dart`. |
| `apps/admin_backend/src/modules/notifications` | New | Module, Service, Listeners. |
| `apps/admin_backend/src/integrations` | New | Email and SMS adapters. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Provider Cost | Med | Implement throttling to prevent excessive SMS sending. |
| Offline Lag | High | Clearly state in Email/SMS the timestamp of the event. |

## Rollback Plan
- Disable `NotificationModule` in `AppModule`.
- Revert `AlertService` binding in `pos_app`.

## Success Criteria
- [ ] Low stock event in POS displays a visual toast/header immediately.
- [ ] Low stock sync event in Backend triggers an Email/SMS (verified via logs/stubs).
- [ ] Alerts are throttled (no more than 1 per item per hour).
