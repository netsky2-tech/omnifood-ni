import { ValueTransformer } from 'typeorm';

const MIN_BIGINT = -(2n ** 63n);
const MAX_BIGINT = 2n ** 63n - 1n;
const DECIMAL_PATTERN = /^-?\d+$/;

/**
 * Postgres bigint columns are returned as text by the driver and cannot be
 * represented exactly by a JS number near the Int64 boundaries, so every
 * bigint column in this module maps to a `string` property through this
 * shared transformer. `to` accepts only canonical base-10 integer strings
 * inside the signed Int64 range and rejects anything else instead of
 * silently rounding a lossy JS number into the database.
 */
export class BigIntStringTransformer implements ValueTransformer {
  to(value: string | null | undefined): string | null {
    if (value === null || value === undefined) {
      return null;
    }
    if (typeof value !== 'string' || !DECIMAL_PATTERN.test(value)) {
      throw new TypeError(
        `bigint columns accept canonical decimal strings, received: ${String(value)}`,
      );
    }
    const parsed = BigInt(value);
    if (parsed < MIN_BIGINT || parsed > MAX_BIGINT) {
      throw new RangeError(`bigint value out of signed Int64 range: ${value}`);
    }
    return value;
  }

  from(value: string | number | null): string | null {
    if (value === null) {
      return null;
    }
    return typeof value === 'number' ? BigInt(value).toString() : value;
  }
}

export const BIGINT_STRING = new BigIntStringTransformer();
