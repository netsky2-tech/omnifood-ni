import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { canonicalizeOhac, ohacDigest } from './canonical';
import { OHAC_ERROR_CODE, type OhacErrorCode } from './error-codes';
import { parseStaffPolicyEpochV1 } from './staff-policy-epoch.v1';

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

interface ContractVector {
  readonly id: string;
  readonly note: string;
  readonly operation: 'parseStaffPolicyEpochV1';
  readonly raw?: string;
  readonly validRaw?: string;
  readonly mutatedRaw?: string;
  readonly errorCode: string;
  readonly field?: string;
}

interface SizeVector {
  readonly id: string;
  readonly note: string;
  readonly totalBytes: number;
  readonly fillCharacter: string;
  readonly jsonPrefix: string;
  readonly jsonSuffix: string;
  readonly expected?: 'success';
  readonly errorCode?: string;
}

interface Fixture {
  readonly contract: string;
  readonly canonicalVectors: readonly CanonicalVector[];
  readonly rejectionVectors: readonly RejectionVector[];
  readonly contractVectors: readonly ContractVector[];
  readonly sizeVectors: readonly SizeVector[];
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
    expect(fixture.contractVectors.map((vector) => vector.id)).toEqual([
      'K01',
      'K02',
      'K03',
    ]);
    expect(fixture.sizeVectors.map((vector) => vector.id)).toEqual([
      'S01',
      'S02',
    ]);
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

  it.each(fixture.contractVectors.map((vector) => [vector.id, vector]))(
    '%s enforces the authored contract-level expectation',
    (id, vector) => {
      expect(vector.operation).toBe('parseStaffPolicyEpochV1');
      if (vector.validRaw !== undefined) {
        expect(
          parseStaffPolicyEpochV1(Buffer.from(vector.validRaw, 'utf8')).ok,
        ).toBe(true);
      }
      const rejectedRaw = vector.raw ?? vector.mutatedRaw;
      if (rejectedRaw === undefined) {
        throw new Error(`${id} has no rejection payload`);
      }
      if (vector.validRaw !== undefined && vector.mutatedRaw !== undefined) {
        const validBytes = Buffer.from(vector.validRaw, 'utf8');
        const mutatedBytes = Buffer.from(vector.mutatedRaw, 'utf8');
        expect(mutatedBytes).toHaveLength(validBytes.length);
        expect(
          validBytes.reduce(
            (count, byte, index) =>
              count + (byte === mutatedBytes[index] ? 0 : 1),
            0,
          ),
        ).toBe(1);
      }
      const result = parseStaffPolicyEpochV1(Buffer.from(rejectedRaw, 'utf8'));
      if (result.ok === true) {
        throw new Error(`${id} was accepted but must be rejected`);
      }
      expect(result.error.code).toBe(vector.errorCode as OhacErrorCode);
      expect(result.error.field).toBe(vector.field);
    },
  );

  it.each(fixture.sizeVectors.map((vector) => [vector.id, vector]))(
    '%s enforces the authored compact size boundary',
    (id, vector) => {
      const fixedBytes = Buffer.byteLength(
        vector.jsonPrefix + vector.jsonSuffix,
      );
      const fillBytes = Buffer.byteLength(vector.fillCharacter);
      expect(fillBytes).toBe(1);
      const raw = Buffer.from(
        vector.jsonPrefix +
          vector.fillCharacter.repeat(vector.totalBytes - fixedBytes) +
          vector.jsonSuffix,
        'utf8',
      );
      expect(raw).toHaveLength(vector.totalBytes);
      const result = canonicalizeOhac(raw);
      if (vector.expected === 'success') {
        expect(result.ok).toBe(true);
        return;
      }
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
