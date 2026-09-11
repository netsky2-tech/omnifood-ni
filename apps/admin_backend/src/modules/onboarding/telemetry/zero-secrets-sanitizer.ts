function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export class ZeroSecretsSanitizer {
  private static readonly JWT_REGEX =
    /\beyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\b/g;

  private static readonly CARD_REGEX =
    /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|3(?:0[0-5]|[68][0-9])[0-9]{11}|6(?:011|5[0-9]{2})[0-9]{12})\b/g;

  private static readonly EMAIL_REGEX =
    /\b([a-zA-Z0-9_.+-])[a-zA-Z0-9_.+-]*([a-zA-Z0-9_.+-])@([a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+)\b/g;

  private static readonly SECRET_KEY_NAMES = new Set([
    'password',
    'pass',
    'pwd',
    'secret',
    'apikey',
    'api_key',
    'privkey',
    'privatekey',
    'token',
    'jwt',
    'bearer',
  ]);

  private static readonly PIN_KEY_NAMES = new Set([
    'pin',
    'totp',
    'totpcode',
    'totp_code',
    'otp',
    'passcode',
  ]);

  private static readonly CSV_KEY_NAMES = new Set([
    'rawcsv',
    'raw_csv',
    'csvcontent',
    'csv_content',
    'csvdata',
    'filedata',
    'file_data',
  ]);

  /**
   * Recursively sanitizes any payload, stripping JWTs, passwords, PINs, card data,
   * full raw CSV strings, and masking PII.
   */
  public static sanitize<T>(input: T): T {
    if (input === null || input === undefined) {
      return input;
    }

    if (typeof input === 'string') {
      return this.sanitizeString(input) as unknown as T;
    }

    if (Array.isArray(input)) {
      const items: readonly unknown[] = input;
      return items.map((item: unknown): unknown =>
        this.sanitize(item),
      ) as unknown as T;
    }

    if (isRecord(input)) {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(input)) {
        if (typeof value === 'string') {
          // Check for JWT token pattern first
          if (
            /^eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+$/.test(
              value.trim(),
            ) ||
            value.includes('Bearer eyJ')
          ) {
            result[key] = this.sanitizeString(value);
            continue;
          }

          // Check for card pattern
          if (/^\d{13,19}$/.test(value.trim())) {
            result[key] = '[REDACTED_CARD]';
            continue;
          }

          // Check for raw CSV
          if (this.isCsvKey(key) || this.isRawCsvContent(value)) {
            result[key] = this.summarizeRawCsv(value);
            continue;
          }
        }

        if (this.isSecretKey(key)) {
          result[key] = '[REDACTED_SECRET]';
          continue;
        }

        if (this.isPinKey(key)) {
          result[key] = '[REDACTED_PIN]';
          continue;
        }

        result[key] = this.sanitize(value);
      }
      return result as unknown as T;
    }

    return input;
  }

  private static isSecretKey(key: string): boolean {
    const lower = key.toLowerCase().replace(/[-_]/g, '');
    for (const secret of this.SECRET_KEY_NAMES) {
      if (lower.includes(secret)) return true;
    }
    return false;
  }

  private static isPinKey(key: string): boolean {
    const lower = key.toLowerCase().replace(/[-_]/g, '');
    for (const pin of this.PIN_KEY_NAMES) {
      if (lower.includes(pin)) return true;
    }
    return false;
  }

  private static isCsvKey(key: string): boolean {
    const lower = key.toLowerCase().replace(/[-_]/g, '');
    for (const csv of this.CSV_KEY_NAMES) {
      if (lower.includes(csv)) return true;
    }
    return false;
  }

  private static sanitizeString(str: string): string {
    // 1. Check exact card numbers
    if (/^\d{13,19}$/.test(str)) {
      return '[REDACTED_CARD]';
    }

    let sanitized = str;

    // 2. JWTs
    sanitized = sanitized.replace(this.JWT_REGEX, '[REDACTED_JWT]');

    // 3. Embedded credit card patterns
    sanitized = sanitized.replace(this.CARD_REGEX, '[REDACTED_CARD]');

    // 4. PII Email masking (user@domain.com -> u***r@domain.com)
    sanitized = sanitized.replace(
      this.EMAIL_REGEX,
      (_match, firstChar, lastChar, domain) =>
        `${firstChar}***${lastChar}@${domain}`,
    );

    return sanitized;
  }

  private static isRawCsvContent(value: string): boolean {
    if (value.length < 50) return false;
    const lines = value.split('\n');
    if (lines.length >= 3) {
      const commaCountFirst = (lines[0].match(/,/g) || []).length;
      const commaCountSecond = (lines[1].match(/,/g) || []).length;
      if (commaCountFirst >= 2 && commaCountFirst === commaCountSecond) {
        return true;
      }
    }
    return false;
  }

  private static summarizeRawCsv(content: string): {
    redacted: boolean;
    type: string;
    lineCount: number;
    byteLength: number;
  } {
    const lines = content.split('\n').filter((l) => l.trim().length > 0);
    return {
      redacted: true,
      type: 'RAW_CSV_REDACTED',
      lineCount: lines.length,
      byteLength: Buffer.byteLength(content, 'utf8'),
    };
  }
}
