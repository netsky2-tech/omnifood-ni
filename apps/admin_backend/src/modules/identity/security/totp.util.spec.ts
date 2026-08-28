import {
  generateTotp,
  verifyTotp,
  base32Decode,
  base32Encode,
} from './totp.util';

describe('TOTP Utility RFC 6238 (Slice 10.2)', () => {
  // Standard test secret: "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ" (Base32 of "12345678901234567890")
  const testSecretBase32 = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

  describe('Base32 encoding and decoding', () => {
    it('correctly encodes and decodes ASCII strings', () => {
      const original = '12345678901234567890';
      const encoded = base32Encode(Buffer.from(original, 'utf-8'));
      expect(encoded).toBe(testSecretBase32);

      const decoded = base32Decode(encoded);
      expect(decoded.toString('utf-8')).toBe(original);
    });

    it('handles padding and lowercase gracefully', () => {
      const decoded = base32Decode('gezdgnbvgy3tqojqgezdgnbvgy3tqojq===');
      expect(decoded.toString('utf-8')).toBe('12345678901234567890');
    });

    it('throws error on invalid base32 characters', () => {
      expect(() => base32Decode('INVALID_BASE32_!@#$')).toThrow();
    });
  });

  describe('generateTotp', () => {
    it('generates a 6-digit numeric string for standard timestamp', () => {
      const timestampMs = 1700000000000;
      const code = generateTotp(testSecretBase32, timestampMs);

      expect(code).toHaveLength(6);
      expect(/^\d{6}$/.test(code)).toBe(true);
    });

    it('generates deterministic code for the same 30s window', () => {
      const windowStart = 56666666 * 30 * 1000;
      const t1 = windowStart + 2000;
      const t2 = windowStart + 25000; // strictly within the same 30s window
      expect(generateTotp(testSecretBase32, t1)).toBe(
        generateTotp(testSecretBase32, t2),
      );
    });

    it('generates different codes across different 30s intervals', () => {
      const windowStart = 56666666 * 30 * 1000;
      const t1 = windowStart + 5000;
      const t2 = windowStart + 35000; // next 30s window
      expect(generateTotp(testSecretBase32, t1)).not.toBe(
        generateTotp(testSecretBase32, t2),
      );
    });
  });

  describe('verifyTotp', () => {
    it('verifies exact current window code successfully', () => {
      const now = 1700000010000;
      const code = generateTotp(testSecretBase32, now);

      expect(verifyTotp(code, testSecretBase32, { nowMs: now })).toBe(true);
    });

    it('verifies code from previous 30s window within default +/- 1 step tolerance', () => {
      const pastTime = 1700000010000 - 30000;
      const pastCode = generateTotp(testSecretBase32, pastTime);
      const currentTime = 1700000010000;

      expect(
        verifyTotp(pastCode, testSecretBase32, {
          nowMs: currentTime,
          window: 1,
        }),
      ).toBe(true);
    });

    it('verifies code from next 30s window within default +/- 1 step tolerance', () => {
      const futureTime = 1700000010000 + 30000;
      const futureCode = generateTotp(testSecretBase32, futureTime);
      const currentTime = 1700000010000;

      expect(
        verifyTotp(futureCode, testSecretBase32, {
          nowMs: currentTime,
          window: 1,
        }),
      ).toBe(true);
    });

    it('rejects code outside the +/- 1 window tolerance (> 60s drift)', () => {
      const farPastTime = 1700000010000 - 90000;
      const farPastCode = generateTotp(testSecretBase32, farPastTime);
      const currentTime = 1700000010000;

      expect(
        verifyTotp(farPastCode, testSecretBase32, {
          nowMs: currentTime,
          window: 1,
        }),
      ).toBe(false);
    });

    it('rejects invalid, malformed, or non-6-digit tokens', () => {
      const now = 1700000010000;
      expect(verifyTotp('12345', testSecretBase32, { nowMs: now })).toBe(false);
      expect(verifyTotp('abcdef', testSecretBase32, { nowMs: now })).toBe(
        false,
      );
      expect(verifyTotp('', testSecretBase32, { nowMs: now })).toBe(false);
      expect(verifyTotp('000000', testSecretBase32, { nowMs: now })).toBe(
        false,
      );
    });
  });
});
