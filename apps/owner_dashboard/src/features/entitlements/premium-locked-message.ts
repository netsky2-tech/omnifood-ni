/**
 * Exact contractual upgrade copy (ENT-05b): names the missing capability key
 * inside the sentence, in Spanish, "usted" register. Kept in its own module
 * so the component file stays fast-refresh clean (components only).
 */
export function premiumLockedMessage(capabilityKey: string): string {
  return `La función requiere el plan o el complemento que incluye "${capabilityKey}". Actualice su plan para usarla.`;
}
