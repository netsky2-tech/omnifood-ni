/**
 * ENT-03 — the `@RequireCapability` decorator (issue #984).
 *
 * Marks an endpoint (handler or whole controller class) as requiring every
 * listed capability key: the keys are AND-ed, so `@RequireCapability('a', 'b')`
 * allows only tenants whose effective snapshot carries BOTH keys.
 *
 * Only GATEABLE keys may appear here. Keys are validated at guard time with
 * `isCapabilityGated()`: an unregistered or non-gateable (nucleus) key in a
 * decorator is a programming error and the `CapabilitiesGuard` fails closed.
 * The keys that may never appear are catalog §7's closed list (`core.sales`,
 * `core.fiscal_invoice`, `core.cash_shifts`, `core.customers`,
 * `core.catalog`, `core.inventory_simple`, `core.fx_dual`) — gating them
 * would block emission, cancellation, reprint, cash closing or the sale.
 */
import { SetMetadata } from '@nestjs/common';

export const CAPABILITY_REQUIREMENT_KEY = 'entitlements:require-capability';

export const RequireCapability = (...capabilityKeys: string[]) =>
  SetMetadata(CAPABILITY_REQUIREMENT_KEY, capabilityKeys);
