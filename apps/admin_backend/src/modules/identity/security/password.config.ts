import * as bcrypt from 'bcrypt';

/**
 * Password hashing cost contract (security-hardening-batch2 S1).
 *
 * OWASP Password Storage Cheat Sheet: legacy bcrypt stays acceptable with a
 * work factor of 10+, and 12 matches the shared-egress-IP food-park threat
 * model (online guessing is bounded by the batch-1 throttlers, so a higher
 * per-hash cost is the right marginal spend). New and re-hashed passwords
 * use this cost; a stored digest at a lower cost is transparently upgraded
 * on successful login (see AuthService). Pin hashing keeps its own cost:
 * a 4-digit offline PIN is a terminal convenience factor, not the primary
 * web credential.
 */
export const PASSWORD_BCRYPT_COST = 12;

/**
 * Whether a stored digest sits below the configured cost and should be
 * transparently upgraded on the next successful login.
 *
 * An unparsable digest returns false: the compare already validated the
 * credential, and upgrading a corrupt-format digest is a dedicated
 * migration concern, never a login-path surprise.
 */
export function needsCostUpgrade(storedDigest: string): boolean {
  try {
    return bcrypt.getRounds(storedDigest) < PASSWORD_BCRYPT_COST;
  } catch {
    return false;
  }
}
