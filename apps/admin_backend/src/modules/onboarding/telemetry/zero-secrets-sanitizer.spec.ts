import { ZeroSecretsSanitizer } from './zero-secrets-sanitizer';

describe('ZeroSecretsSanitizer (ONB1.9F Security Guardrail)', () => {
  it('redacts JWT tokens from values and strings', () => {
    const fakeJwt =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    const payload = {
      action: 'LOGIN_ATTEMPT',
      authHeader: `Bearer ${fakeJwt}`,
      directToken: fakeJwt,
    };

    const sanitized = ZeroSecretsSanitizer.sanitize(payload);
    expect(sanitized.authHeader).not.toContain(fakeJwt);
    expect(sanitized.authHeader).toContain('[REDACTED_JWT]');
    expect(sanitized.directToken).toBe('[REDACTED_JWT]');
  });

  it('redacts password, pin, totp and secret field names', () => {
    const payload = {
      username: 'admin',
      password: 'superSecretPassword123!',
      pin: '1234',
      totpCode: '987654',
      apiKey: 'sk-live-abcdef123456',
    };

    const sanitized = ZeroSecretsSanitizer.sanitize(payload);
    expect(sanitized.username).toBe('admin');
    expect(sanitized.password).toBe('[REDACTED_SECRET]');
    expect(sanitized.pin).toBe('[REDACTED_PIN]');
    expect(sanitized.totpCode).toBe('[REDACTED_PIN]');
    expect(sanitized.apiKey).toBe('[REDACTED_SECRET]');
  });

  it('redacts credit card numbers (PAN)', () => {
    const payload = {
      card: '4532015012345678', // Visa pattern
      text: 'Customer paid with card 5425233430109903 in store',
    };

    const sanitized = ZeroSecretsSanitizer.sanitize(payload);
    expect(sanitized.card).toBe('[REDACTED_CARD]');
    expect(sanitized.text).toContain('[REDACTED_CARD]');
    expect(sanitized.text).not.toContain('5425233430109903');
  });

  it('strips full raw CSV and replaces with metadata summary', () => {
    const rawCsv =
      'barcode,name,sell_price,category\n7430001,Gaseosa 500ml,35.0,Bebidas\n7430002,Agua 600ml,20.0,Bebidas\n7430003,Snack,15.0,Snacks';

    const payload = {
      filename: 'catalog.csv',
      rawCsv: rawCsv,
      nested: {
        csvContent: rawCsv,
      },
    };

    const sanitized = ZeroSecretsSanitizer.sanitize(payload);
    expect(sanitized.filename).toBe('catalog.csv');
    expect(sanitized.rawCsv).not.toContain('Gaseosa 500ml');
    expect(sanitized.rawCsv).toEqual({
      redacted: true,
      type: 'RAW_CSV_REDACTED',
      lineCount: 4,
      byteLength: rawCsv.length,
    });
    expect(sanitized.nested.csvContent).toEqual({
      redacted: true,
      type: 'RAW_CSV_REDACTED',
      lineCount: 4,
      byteLength: rawCsv.length,
    });
  });

  it('masks unnecessary PII such as plain text emails', () => {
    const payload = {
      contact: 'owner@pulperia-juana.com',
      note: 'Sent report to accountant@empresa.ni yesterday',
    };

    const sanitized = ZeroSecretsSanitizer.sanitize(payload);
    expect(sanitized.contact).toBe('o***r@pulperia-juana.com');
    expect(sanitized.note).toContain('a***t@empresa.ni');
    expect(sanitized.note).not.toContain('accountant@empresa.ni');
  });

  it('preserves legitimate telemetry metrics, latencies, counts and safe codes', () => {
    const safePayload = {
      stepId: 'BOH_INVENTORY',
      durationMs: 432,
      counts: {
        productsCount: 15,
        insumosCount: 8,
        warehousesCount: 2,
      },
      errorCode: 'INVENTORY_COUNT_MISMATCH',
    };

    const sanitized = ZeroSecretsSanitizer.sanitize(safePayload);
    expect(sanitized).toEqual(safePayload);
  });

  it('triangulation: handles deeply nested arrays, nulls, and mixed case key names', () => {
    const complex = {
      nested: [
        {
          USER_PASSWORD: 'hidden',
          PIN_CODE: '9999',
          items: [{ amount: 100, is_active: true, notes: null }],
        },
      ],
      empty: {},
    };

    const sanitized = ZeroSecretsSanitizer.sanitize(complex);
    expect(sanitized.nested[0].USER_PASSWORD).toBe('[REDACTED_SECRET]');
    expect(sanitized.nested[0].PIN_CODE).toBe('[REDACTED_PIN]');
    expect(sanitized.nested[0].items[0].amount).toBe(100);
    expect(sanitized.nested[0].items[0].is_active).toBe(true);
    expect(sanitized.nested[0].items[0].notes).toBeNull();
  });
});
