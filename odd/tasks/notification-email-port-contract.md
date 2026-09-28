# notification-email-port-contract

## Goal
Design and implement the notification port contract and configuration seam for email (finding B4 scope reduction), so a real provider can be plugged in post go-live without rewiring. SMS (B5) stays a console stub until the vendor decision is made.

## Decisions
- Vendor selection (Resend/SMTP/SendGrid, costs) is deferred to post go-live planning.
- This batch ships: config-driven provider selection + console default + extension point.
- SMS untouched (B5 deferred).

## Constraints
- Default behavior must not change: console adapter remains the default provider.
- Preserve hexagonal architecture: ports + adapters only.
- Fail fast and clearly when a non-implemented provider is configured.
- No UI/UX change (NHILOS docs not applicable to this batch).

## Allowed edit surfaces
- apps/admin_backend/src/modules/notifications/notifications.module.ts
- apps/admin_backend/src/integrations/notifications/ports/email.port.ts
- apps/admin_backend/src/integrations/notifications/adapters/console-email.adapter.ts
- apps/admin_backend/src/integrations/notifications/email-provider.factory.ts
- apps/admin_backend/src/modules/notifications/notifications.module.spec.ts
- apps/admin_backend/.env.example

## Tasks
1. Add config-driven EmailPort selection via env (`EMAIL_PROVIDER`, default `console`).
2. Implement factory that fails fast on unknown/unimplemented providers.
3. Document the contract and required env vars in `.env.example`.
4. Add unit tests: default selection, explicit console, unknown provider failure.

## Acceptance criteria
- `EMAIL_PROVIDER` unset or `console` -> console adapter (current behavior preserved).
- `EMAIL_PROVIDER=<future>` -> startup fails with a clear message naming the contract extension point.
- Tests cover all three branches.
- `.env.example` documents the contract.

## Commit
- Branch: `feat/notification-email-contract`
- Message: `feat(notifications): config-driven email provider contract with console default`
