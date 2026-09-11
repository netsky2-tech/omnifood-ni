import { canonicalizeJcs, computeJcsSha256 } from './canonical-jcs';

describe('Canonical JCS (RFC-8785) & Fingerprint', () => {
  it('serializes keys in alphabetical order regardless of insertion order', () => {
    const objA = { b: 2, a: 1, c: 3 };
    const objB = { c: 3, a: 1, b: 2 };

    const jcsA = canonicalizeJcs(objA);
    const jcsB = canonicalizeJcs(objB);

    expect(jcsA).toBe('{"a":1,"b":2,"c":3}');
    expect(jcsB).toBe('{"a":1,"b":2,"c":3}');
    expect(computeJcsSha256(objA)).toBe(computeJcsSha256(objB));
  });

  it('handles nested objects deterministically', () => {
    const nested1 = { z: { y: 2, x: 1 }, a: 'hello' };
    const nested2 = { a: 'hello', z: { x: 1, y: 2 } };

    expect(canonicalizeJcs(nested1)).toBe('{"a":"hello","z":{"x":1,"y":2}}');
    expect(canonicalizeJcs(nested2)).toBe('{"a":"hello","z":{"x":1,"y":2}}');
    expect(computeJcsSha256(nested1)).toBe(computeJcsSha256(nested2));
  });

  it('handles primitive values, arrays, nulls and booleans correctly', () => {
    const payload = {
      tenantId: 'tenant-123',
      businessName: 'Comedor Central',
      ruc: null,
      fiscalRegime: 'REGIMEN_GENERAL',
      taxRate: 0.15,
      pricesIncludeTax: true,
      commercialFxSpread: 0.5,
    };

    const expected =
      '{"businessName":"Comedor Central","commercialFxSpread":0.5,"fiscalRegime":"REGIMEN_GENERAL","pricesIncludeTax":true,"ruc":null,"taxRate":0.15,"tenantId":"tenant-123"}';

    expect(canonicalizeJcs(payload)).toBe(expected);

    const hash = computeJcsSha256(payload);
    expect(hash).toHaveLength(64);
    expect(/^[a-f0-9]{64}$/.test(hash)).toBe(true);
  });

  it('produces different fingerprint if any effective field changes', () => {
    const base = {
      tenantId: 't1',
      businessName: 'Business',
      ruc: 'J0310000000001',
      fiscalRegime: 'CUOTA_FIJA',
      taxRate: 0.0,
      pricesIncludeTax: true,
      commercialFxSpread: 0.5,
    };

    const modifiedTax = { ...base, taxRate: 0.15 };
    const modifiedRegime = { ...base, fiscalRegime: 'REGIMEN_GENERAL' };
    const modifiedRuc = { ...base, ruc: 'J0310000000002' };

    const baseHash = computeJcsSha256(base);
    expect(computeJcsSha256(modifiedTax)).not.toBe(baseHash);
    expect(computeJcsSha256(modifiedRegime)).not.toBe(baseHash);
    expect(computeJcsSha256(modifiedRuc)).not.toBe(baseHash);
  });
});
