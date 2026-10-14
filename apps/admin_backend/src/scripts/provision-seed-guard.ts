/**
 * Review R3-1 hardening (owner decision: hard verification): a provisioned
 * tenant whose catalog seeding wrote ZERO values is not a successful
 * provision — the terminal would be born without master catalogs (the exact
 * #903 defect). seedDefaults is idempotent and a fresh provision must seed
 * the full default set, so a zero result means the write silently did
 * nothing. Throwing routes through the provision script's existing
 * failed/exit-code handling instead of reporting a green provision.
 *
 * Lives in its own side-effect-free module: provision.ts is a script with
 * top-level readline/bootstrap effects that must never load inside a test
 * worker.
 */
export function assertSeedOutcome(tenantId: string, seeded: number): void {
  if (!Number.isFinite(seeded) || seeded <= 0) {
    throw new Error(
      `Catalog seeding wrote ${seeded} values for tenant ${tenantId} — refusing to report the provision as successful.`,
    );
  }
}
