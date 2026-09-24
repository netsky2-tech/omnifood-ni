/**
 * Canonical tenant slug normalization (issue #556, OD-03 founder design).
 *
 * The slug is a stable provisioning identifier derived from the tenant name,
 * persisted in `tenants.slug` and resolved server-side when a login request
 * carries an optional `tenantSlug`. It is pre-auth CONTEXT, never authority:
 * post-login authority remains the JWT `tenant_id`.
 *
 * Normalization rule (binding):
 *   1. lowercase
 *   2. whitespace runs -> '-'
 *   3. strip every character outside [a-z0-9-]
 *   4. trim leading/trailing '-'
 *   5. cap at 50 chars, truncating on a dash boundary when one exists
 *
 * Collisions are resolved by `assignUniqueTenantSlug` with -2, -3, ... suffixes.
 * The migration backfill and every tenant-creating script MUST use this exact
 * vocabulary so stored slugs stay reproducible.
 */

export const TENANT_SLUG_MAX_LENGTH = 50;

const SLUG_ALLOWED = /[a-z0-9-]/;

/**
 * Normalizes a tenant name into a slug candidate.
 * Throws when nothing survives normalization: a blank slug can never be
 * stored (the column is NOT NULL with a unique index), so failing fast beats
 * silently inventing a placeholder.
 */
export function normalizeTenantSlug(rawName: string): string {
  const lowercased = (rawName ?? '').toLowerCase();
  const dashed = lowercased.replace(/\s+/g, '-');
  const stripped = Array.from(dashed)
    .filter((char) => SLUG_ALLOWED.test(char))
    .join('');
  const trimmed = stripped.replace(/^-+/, '').replace(/-+$/, '');

  if (!trimmed) {
    throw new Error(
      `TENANT_SLUG_EMPTY: tenant name '${rawName}' normalizes to an empty slug`,
    );
  }

  if (trimmed.length <= TENANT_SLUG_MAX_LENGTH) {
    return trimmed;
  }

  const cut = trimmed.slice(0, TENANT_SLUG_MAX_LENGTH);
  const lastDash = cut.lastIndexOf('-');
  // Truncate on a dash boundary when the 50-char window has one; otherwise
  // hard-cut at the bound. Either way the result must not end with a dash.
  const bounded =
    lastDash > 0 ? cut.slice(0, lastDash) : cut.replace(/-+$/, '');
  const trimmedBounded = bounded.replace(/-+$/, '');
  if (!trimmedBounded) {
    throw new Error(
      `TENANT_SLUG_EMPTY: tenant name '${rawName}' normalizes to an empty slug`,
    );
  }
  return trimmedBounded;
}

/**
 * Resolves slug collisions deterministically: first free candidate from
 * `<base>`, `<base>-2`, `<base>-3`, ... Every candidate stays within the
 * 50-char bound by shortening the base before suffixing.
 */
export function assignUniqueTenantSlug(
  base: string,
  taken: ReadonlySet<string>,
): string {
  if (!taken.has(base)) {
    return base;
  }
  for (let suffix = 2; ; suffix += 1) {
    const suffixText = `-${suffix}`;
    const room = TENANT_SLUG_MAX_LENGTH - suffixText.length;
    const shortened = base.slice(0, room).replace(/-+$/, '');
    const candidate = `${shortened}${suffixText}`;
    if (!taken.has(candidate)) {
      return candidate;
    }
  }
}
