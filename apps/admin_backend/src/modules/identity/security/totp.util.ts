import * as crypto from 'crypto';

const RFC4648_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * Encodes a buffer to RFC 4648 Base32 string (without padding).
 */
export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;

    while (bits >= 5) {
      output += RFC4648_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += RFC4648_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

/**
 * Decodes an RFC 4648 Base32 string (case-insensitive, ignores padding) to a Buffer.
 */
export function base32Decode(base32Str: string): Buffer {
  const cleaned = base32Str.toUpperCase().replace(/=+$/, '').trim();
  if (cleaned.length === 0) {
    return Buffer.alloc(0);
  }

  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (let i = 0; i < cleaned.length; i++) {
    const char = cleaned[i];
    const index = RFC4648_ALPHABET.indexOf(char);
    if (index === -1) {
      throw new Error(`Invalid Base32 character encountered: '${char}'`);
    }

    value = (value << 5) | index;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

/**
 * Generates an RFC 6238 TOTP 6-digit code for a given base32 secret and timestamp.
 * Defaults to 30-second intervals and SHA-1 algorithm.
 */
export function generateTotp(
  base32Secret: string,
  timestampMs: number = Date.now(),
  stepSeconds: number = 30,
): string {
  const secretBuffer = base32Decode(base32Secret);
  const counter = Math.floor(timestampMs / 1000 / stepSeconds);

  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigInt64BE(BigInt(counter), 0);

  const hmac = crypto
    .createHmac('sha1', secretBuffer)
    .update(counterBuffer)
    .digest();

  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  const token = (binary % 1000000).toString().padStart(6, '0');
  return token;
}

export interface VerifyTotpOptions {
  nowMs?: number;
  stepSeconds?: number;
  window?: number; // lookback / forward steps (default 1 = +/- 30s)
}

/**
 * Verifies a 6-digit TOTP token against an RFC 6238 Base32 secret seed.
 * Accommodates clock drift via the window parameter (+/- 1 step by default).
 */
export function verifyTotp(
  token: string,
  base32Secret: string,
  options: VerifyTotpOptions = {},
): boolean {
  if (!token || typeof token !== 'string') {
    return false;
  }

  const normalizedToken = token.trim();
  if (!/^\d{6}$/.test(normalizedToken)) {
    return false;
  }

  const nowMs = options.nowMs ?? Date.now();
  const stepSeconds = options.stepSeconds ?? 30;
  const window = options.window ?? 1;

  try {
    for (let offset = -window; offset <= window; offset++) {
      const stepTimestamp = nowMs + offset * stepSeconds * 1000;
      const expectedToken = generateTotp(
        base32Secret,
        stepTimestamp,
        stepSeconds,
      );
      if (normalizedToken === expectedToken) {
        return true;
      }
    }
  } catch {
    return false;
  }

  return false;
}
