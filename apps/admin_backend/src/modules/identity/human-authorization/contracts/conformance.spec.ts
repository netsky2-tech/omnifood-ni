import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { canonicalizeOhac, ohacDigest } from './canonical';
import { OHAC_ERROR_CODE, type OhacErrorCode } from './error-codes';

interface CanonicalVector {
  readonly id: string;
  readonly note: string;
  readonly raw: string;
  readonly canonical: string;
  readonly digest: string;
}

interface RejectionVector {
  readonly id: string;
  readonly note: string;
  readonly raw?: string;
  readonly rawHex?: string;
  readonly errorCode: string;
}

interface Fixture {
  readonly contract: string;
  readonly canonicalVectors: readonly CanonicalVector[];
  readonly rejectionVectors: readonly RejectionVector[];
}

/** Same resolution convention as the audit-v3 fixtures (jest cwd is apps/admin_backend). */
const FIXTURE_PATH = resolve(
  process.cwd(),
  '../../fixtures/human-authorization/v1/canonical-vectors.json',
);

const fixture = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as Fixture;

const rawBytes = (vector: RejectionVector): Buffer =>
  vector.rawHex === undefined
    ? Buffer.from(vector.raw ?? '', 'utf8')
    : Buffer.from(vector.rawHex, 'hex');

describe('OHAC-C14N-1 shared conformance vectors', () => {
  it('loads the authored fixture instead of generating expectations at runtime', () => {
    expect(fixture.contract).toBe('OHAC-C14N-1');
    expect(fixture.canonicalVectors.length).toBeGreaterThanOrEqual(9);
    expect(fixture.rejectionVectors.length).toBeGreaterThanOrEqual(6);
  });

  it.each(fixture.canonicalVectors.map((vector) => [vector.id, vector]))(
    '%s canonicalizes to the authored bytes and digest',
    (id, vector) => {
      const result = canonicalizeOhac(Buffer.from(vector.raw, 'utf8'));
      if (result.ok === false) {
        throw new Error(`${id} was rejected with ${result.error.code}`);
      }
      expect(result.value.toString('utf8')).toBe(vector.canonical);
      expect(ohacDigest(result.value)).toBe(vector.digest);
    },
  );

  it.each(fixture.rejectionVectors.map((vector) => [vector.id, vector]))(
    '%s fails with the authored error code',
    (id, vector) => {
      const result = canonicalizeOhac(rawBytes(vector));
      if (result.ok === true) {
        throw new Error(`${id} was accepted but must be rejected`);
      }
      expect(result.error.code).toBe(vector.errorCode as OhacErrorCode);
    },
  );

  it('keeps NFC and NFD vectors distinct in both bytes and digest', () => {
    const nfc = fixture.canonicalVectors.find((v) => v.id === 'C04');
    const nfd = fixture.canonicalVectors.find((v) => v.id === 'C05');
    expect(nfc).toBeDefined();
    expect(nfd).toBeDefined();
    if (!nfc || !nfd) return;
    expect(nfc.canonical).not.toBe(nfd.canonical);
    expect(nfc.digest).not.toBe(nfd.digest);
    expect(OHAC_ERROR_CODE.NULL_FORBIDDEN).toBe('OHAC_NULL_FORBIDDEN');
  });
});
