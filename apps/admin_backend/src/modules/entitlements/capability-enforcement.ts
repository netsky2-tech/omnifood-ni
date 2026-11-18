/**
 * ENT-03 — the single decision "may this tenant use these capability keys?"
 * shared by the `CapabilitiesGuard` (endpoint level) and the service-level
 * checks that need the same verdict inside business logic — for example the
 * `promotions.convenio` B2B check, which cannot live on a decorator because
 * it depends on the payload type.
 *
 * Keeping the denial in ONE function guarantees every 403 carries the same
 * clear Spanish upgrade message (ODD S6: mensaje de upgrade, never cryptic)
 * and never leaks anything but the missing key — never the whole snapshot,
 * never another tenant's data.
 */
import { ForbiddenException } from '@nestjs/common';

/**
 * The user-facing 403 copy. Names exactly the missing capability and the
 * upgrade path, with the formal "usted" register.
 */
export const capabilityUpgradeMessage = (
  missingKeys: readonly string[],
): string => {
  const quoted = missingKeys.map((key) => `"${key}"`).join(', ');
  return `La función requiere el plan o el complemento que incluye ${quoted}. Actualice su plan para usarla.`;
};

/**
 * Throws `ForbiddenException` unless every required key is in the tenant's
 * effective capabilities. Empty `requiredKeys` grants (no requirement).
 */
export function assertCapabilitiesGranted(
  capabilities: readonly string[],
  requiredKeys: readonly string[],
): void {
  const missing = requiredKeys.filter((key) => !capabilities.includes(key));
  if (missing.length > 0) {
    throw new ForbiddenException(capabilityUpgradeMessage(missing));
  }
}
