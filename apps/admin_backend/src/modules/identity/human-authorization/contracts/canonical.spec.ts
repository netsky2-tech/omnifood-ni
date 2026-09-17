import {
  OHAC_ERROR_CODE,
  type OhacErrorCode,
  type OhacResult,
} from './error-codes';
import { canonicalizeOhac, digestOfJson, ohacDigest } from './canonical';

const utf8 = (value: string): Buffer => Buffer.from(value, 'utf8');

/** `=== false` is the narrowing idiom this codebase uses for Result unions. */
const ohacFailureCode = (result: OhacResult<unknown>): OhacErrorCode => {
  if (result.ok === false) return result.error.code;
  throw new Error('expected the contract to reject the payload');
};

describe('OHAC-C14N-1 canonicalization', () => {
  it('emits canonical bytes with UTF-16 ordered keys and no whitespace', () => {
    const result = canonicalizeOhac(utf8('{ "b" : "2" , "a" : "1" }'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.toString('utf8')).toBe('{"a":"1","b":"2"}');
  });

  it('keeps NFC and NFD distinct instead of normalizing', () => {
    const nfc = canonicalizeOhac(utf8('{"k":"\u00f3"}'));
    const nfd = canonicalizeOhac(utf8('{"k":"o\u0301"}'));
    expect(nfc.ok && nfd.ok).toBe(true);
    if (!nfc.ok || !nfd.ok) return;
    expect(nfc.value.equals(nfd.value)).toBe(false);
  });

  it('rejects JSON numbers because every numeric value is a decimal string', () => {
    const result = canonicalizeOhac(utf8('{"sequence":17}'));
    expect(ohacFailureCode(result)).toBe(OHAC_ERROR_CODE.NUMBER_FORBIDDEN);
  });

  it('forbids null in v1 payloads', () => {
    const result = canonicalizeOhac(utf8('{"customerId":null}'));
    expect(ohacFailureCode(result)).toBe(OHAC_ERROR_CODE.NULL_FORBIDDEN);
  });

  it('rejects duplicate keys', () => {
    const result = canonicalizeOhac(utf8('{"a":"1","a":"2"}'));
    expect(ohacFailureCode(result)).toBe(OHAC_ERROR_CODE.DUPLICATE_KEY);
  });

  it('rejects unpaired surrogates', () => {
    const result = canonicalizeOhac(utf8('{"a":"\\ud800"}'));
    expect(ohacFailureCode(result)).toBe(OHAC_ERROR_CODE.INVALID_UNICODE);
  });

  it('rejects payloads above the existing size bound', () => {
    const oversized = `{"a":"${'x'.repeat(1_048_600)}"}`;
    const result = canonicalizeOhac(utf8(oversized));
    expect(ohacFailureCode(result)).toBe(OHAC_ERROR_CODE.LIMIT_EXCEEDED);
  });

  it('derives a lowercase sha256 digest over canonical bytes', () => {
    const digest = digestOfJson(utf8('{"a":"1"}'));
    expect(digest.ok).toBe(true);
    if (!digest.ok) return;
    expect(digest.value).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(digest.value).toBe(ohacDigest(Buffer.from('{"a":"1"}', 'utf8')));
  });
});
