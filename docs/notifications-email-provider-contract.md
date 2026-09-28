# Email Notification Provider Contract

Status: active seam, provider selection deferred to post go-live planning.
Related audit finding: B4 (email stub). SMS (B5) remains a console stub and is out of scope for this contract.

## Why

`NotificationsModule` binds `EMAIL_PORT` to a provider. Shipping the binding as a
hard `useClass: ConsoleEmailAdapter` made swapping in a real transport a code
change under time pressure. The contract below makes provider selection a
configuration decision instead, while the vendor/cost decision is planned after
go-live.

## Configuration

| Env var | Default | Values |
| --- | --- | --- |
| `EMAIL_PROVIDER` | `console` | `console` \| any other value fails fast at bootstrap |

Documented intent for `.env.example` (template is protected by harness policy,
apply manually when the file is next touched):

```dotenv
# Email notification provider for NotificationsModule. Only "console" is
# implemented (alerts are logged instead of sent); vendor selection is
# deferred to post go-live planning.
# To plug in a real provider (e.g. Resend/SMTP/SendGrid):
#   1. Implement EmailPort in a new adapter under
#      apps/admin_backend/src/integrations/notifications/adapters/
#   2. Register the provider in
#      apps/admin_backend/src/integrations/notifications/email-provider.factory.ts
#   3. Add the provider-specific env vars here.
# Any other value fails fast at bootstrap.
EMAIL_PROVIDER=console
```

## Extension procedure (post go-live)

1. Implement `EmailPort` in a new adapter under
   `apps/admin_backend/src/integrations/notifications/adapters/`.
   The port contract is intentionally minimal: `send(to, subject, body)` returns
   `Promise<void>`; retries/backoff are an adapter concern.
2. Register the provider name in
   `apps/admin_backend/src/integrations/notifications/email-provider.factory.ts`.
3. Add provider-specific env vars (API key, from-address, region) to `.env`
   files and document them here.
4. Add a factory branch test alongside
   `apps/admin_backend/src/modules/notifications/notifications.module.spec.ts`.

Unknown `EMAIL_PROVIDER` values fail at bootstrap with an error that names the
configured value and points at this extension point — no silent fallback to the
console stub.

## References

- Requirement source: `odd/tasks/notification-email-port-contract.md`
- Audit plan: `odd/tasks/audit-remediation-27-items.md`
