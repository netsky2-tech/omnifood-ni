import { createHash } from 'crypto';

/**
 * Serializes a JavaScript value to canonical JSON according to RFC-8785 (JCS).
 * - Object keys are sorted lexicographically by UTF-16 code units.
 * - No whitespace outside strings.
 * - Numbers and booleans formatted deterministically.
 * - Undefined object values are omitted.
 */
export function canonicalizeJcs(value: unknown): string {
  if (value === null) {
    return 'null';
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError('Cannot serialize non-finite numbers in canonical JSON');
    }
    // standard JSON string representation
    return JSON.stringify(value);
  }

  if (typeof value === 'string') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    const items = value.map((item) => canonicalizeJcs(item));
    return `[${items.join(',')}]`;
  }

  if (typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>)
      .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
      .sort();

    const entries = keys.map((key) => {
      const propVal = (value as Record<string, unknown>)[key];
      return `${JSON.stringify(key)}:${canonicalizeJcs(propVal)}`;
    });

    return `{${entries.join(',')}}`;
  }

  throw new TypeError(`Unsupported type for canonical JSON: ${typeof value}`);
}

/**
 * Computes SHA-256 hex digest of the canonicalized JCS UTF-8 representation.
 */
export function computeJcsSha256(value: unknown): string {
  const canonical = canonicalizeJcs(value);
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}
