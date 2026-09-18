import { canonicalizeOhac, ohacDigest } from '../contracts/canonical';
import { OHAC_ERROR_CODE, type OhacError } from '../contracts/error-codes';
import {
  STAFF_POLICY_EPOCH_V1_SCHEMA,
  parseStaffPolicyEpochV1,
} from '../contracts/staff-policy-epoch.v1';
import {
  projectStaffPolicySnapshotV1,
  type StaffPolicySnapshotProjectionMetadata,
} from './staff-policy-snapshot-projector';

const TENANT = '11111111-1111-4111-8111-111111111111';
const USER_A = '33333333-3333-4333-8333-333333333333';
const USER_B = '44444444-4444-4444-8444-444444444444';
const USER_C = '55555555-5555-4555-8555-555555555555';

const metadata: StaffPolicySnapshotProjectionMetadata = {
  tenantId: TENANT,
  sequence: '1',
  previousSequence: '0',
  previousDigest: 'GENESIS',
  publisherBackendBuild: 'backend-build-1',
};

const record = (
  overrides: Partial<{
    userId: string;
    role: string;
    isActive: boolean;
    pinHash: string | null;
    customPermissions: readonly string[] | null;
    attemptResetGeneration: string;
  }> = {},
) => ({
  userId: USER_A,
  role: 'CASHIER',
  isActive: true,
  pinHash: '$2b$10$abcdefghijklmnopqrstuv',
  customPermissions: null,
  attemptResetGeneration: '0',
  ...overrides,
});

const failure = (
  result: { ok: false; error: OhacError } | { ok: true },
): OhacError => {
  if (result.ok === false) return result.error;
  throw new Error('expected the projection to fail');
};

describe('staff-policy-snapshot-projector', () => {
  it('projects records into a terminal-agnostic snapshot with exactly the normative body keys', () => {
    const result = projectStaffPolicySnapshotV1(metadata, [record()]);
    if (result.ok === false) throw new Error(result.error.code);
    // Decision 17: the snapshot is terminal-agnostic, so neither the
    // terminal identity nor any negotiated build may appear in the body —
    // not even as an empty or optional field.
    expect([...Object.keys(result.value)].sort()).toEqual(
      [
        'digest',
        'minimumAssertionSchema',
        'policyEntries',
        'previousDigest',
        'previousSequence',
        'publisherBackendBuild',
        'schema',
        'sequence',
        'tenantId',
      ].sort(),
    );
    expect(result.value).not.toHaveProperty('targetTerminalId');
    expect(result.value).not.toHaveProperty('targetPosBuild');
  });

  it('uses the dedicated snapshot schema id, not the epoch schema id', () => {
    const result = projectStaffPolicySnapshotV1(metadata, [record()]);
    if (result.ok === false) throw new Error(result.error.code);
    expect(result.value.schema).toBe('ohac.staff-policy-snapshot.v1');
    expect(result.value.schema).not.toBe(STAFF_POLICY_EPOCH_V1_SCHEMA);
    expect(result.value.minimumAssertionSchema).toBe('ohac.assertion.v1');
  });

  it('projects entries through the shared rules: role defaults, verifier fidelity, explicit status', () => {
    // MANAGER carries non-empty role defaults, so a contained default
    // permission proves role-default projection through
    // resolveEffectivePermissions (§4.1 rule 3).
    const result = projectStaffPolicySnapshotV1(metadata, [
      record({ role: 'MANAGER' }),
      record({ userId: USER_B, isActive: false }),
    ]);
    if (result.ok === false) throw new Error(result.error.code);
    const [first, second] = result.value.policyEntries;
    expect(first.status).toBe('ACTIVE');
    expect(first.role).toBe('MANAGER');
    expect(first.permissions).toContain('sales:void_invoice');
    expect(first.pinVerifier.formatVersion).toBe('2b');
    expect(first.pinVerifier.encoded).toBe('$2b$10$abcdefghijklmnopqrstuv');
    expect(second.status).toBe('INACTIVE');
  });

  it('returns the stable empty-policy invalid-field result when every record lacks a PIN hash (decision 18)', () => {
    const error = failure(
      projectStaffPolicySnapshotV1(metadata, [record({ pinHash: null })]),
    );
    expect(error.code).toBe(OHAC_ERROR_CODE.INVALID_FIELD);
    expect(error.field).toBe('policyEntries');
  });

  it('produces an identical digest and entry order from reversed source order', () => {
    const forward = projectStaffPolicySnapshotV1(metadata, [
      record({ userId: USER_C, role: 'MANAGER' }),
      record({ userId: USER_B, isActive: false }),
      record(),
    ]);
    const reversed = projectStaffPolicySnapshotV1(metadata, [
      record(),
      record({ userId: USER_B, isActive: false }),
      record({ userId: USER_C, role: 'MANAGER' }),
    ]);
    if (forward.ok === false) throw new Error(forward.error.code);
    if (reversed.ok === false) throw new Error(reversed.error.code);
    expect(reversed.value.digest).toBe(forward.value.digest);
    expect(reversed.value.policyEntries).toEqual(forward.value.policyEntries);
    expect(reversed.value.digest).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('digests exactly the whole body except digest, with no terminal or build fields in the digest input', () => {
    const result = projectStaffPolicySnapshotV1(metadata, [
      record({ userId: USER_C, role: 'MANAGER' }),
      record(),
    ]);
    if (result.ok === false) throw new Error(result.error.code);
    const { digest, ...body } = result.value;
    // The digest input is re-derived from the returned body: if the body
    // carried a terminal or build field, this recomputation would diverge.
    const canonical = canonicalizeOhac(
      Buffer.from(JSON.stringify(body), 'utf8'),
    );
    if (canonical.ok === false) throw new Error(canonical.error.code);
    expect(ohacDigest(canonical.value)).toBe(digest);
    expect(JSON.stringify(body)).not.toContain('targetTerminalId');
    expect(JSON.stringify(body)).not.toContain('targetPosBuild');
  });

  it('accepts the genesis chain: sequence 1 from previousSequence 0 with GENESIS', () => {
    const result = projectStaffPolicySnapshotV1(metadata, [record()]);
    if (result.ok === false) throw new Error(result.error.code);
    expect(result.value.sequence).toBe('1');
    expect(result.value.previousSequence).toBe('0');
    expect(result.value.previousDigest).toBe('GENESIS');
  });

  it('accepts a non-genesis chain only with a canonical previous digest and contiguous sequence', () => {
    const result = projectStaffPolicySnapshotV1(
      {
        ...metadata,
        sequence: '2',
        previousSequence: '1',
        previousDigest: `sha256:${'a'.repeat(64)}`,
      },
      [record()],
    );
    if (result.ok === false) throw new Error(result.error.code);
    expect(result.value.sequence).toBe('2');
    expect(result.value.previousDigest).toBe(`sha256:${'a'.repeat(64)}`);
  });

  it('rejects a gapped sequence with the stable sequence failure', () => {
    const error = failure(
      projectStaffPolicySnapshotV1(
        { ...metadata, sequence: '5', previousSequence: '0' },
        [record()],
      ),
    );
    expect(error.code).toBe(OHAC_ERROR_CODE.INVALID_FIELD);
    expect(error.field).toBe('sequence');
  });

  it('rejects genesis chaining from a digest instead of GENESIS', () => {
    const error = failure(
      projectStaffPolicySnapshotV1(
        { ...metadata, previousDigest: `sha256:${'a'.repeat(64)}` },
        [record()],
      ),
    );
    expect(error.code).toBe(OHAC_ERROR_CODE.INVALID_FIELD);
    expect(error.field).toBe('sequence');
  });

  it('rejects a non-genesis chain whose previousDigest is GENESIS', () => {
    const error = failure(
      projectStaffPolicySnapshotV1(
        {
          ...metadata,
          sequence: '2',
          previousSequence: '1',
          previousDigest: 'GENESIS',
        },
        [record()],
      ),
    );
    expect(error.code).toBe(OHAC_ERROR_CODE.INVALID_FIELD);
    expect(error.field).toBe('sequence');
  });

  it('propagates the stable tenantId failure for a malformed tenant', () => {
    const error = failure(
      projectStaffPolicySnapshotV1(
        { ...metadata, tenantId: '11111111-1111-4111-8111-11111111111A' },
        [record()],
      ),
    );
    expect(error.code).toBe(OHAC_ERROR_CODE.INVALID_FIELD);
    expect(error.field).toBe('tenantId');
  });

  it('propagates the stable sequence failure for a non-canonical decimal sequence', () => {
    const error = failure(
      projectStaffPolicySnapshotV1({ ...metadata, sequence: '01' }, [record()]),
    );
    expect(error.code).toBe(OHAC_ERROR_CODE.INVALID_FIELD);
    expect(error.field).toBe('sequence');

    // The same non-canonical form on the chain's previous sequence reports
    // the field the epoch parser reports for it, so the two paths cannot
    // diverge on the only field name they share differently.
    const chainError = failure(
      projectStaffPolicySnapshotV1({ ...metadata, previousSequence: '01' }, [
        record(),
      ]),
    );
    expect(chainError.code).toBe(OHAC_ERROR_CODE.INVALID_FIELD);
    expect(chainError.field).toBe('previousSequence');
  });

  it('propagates the stable previousDigest failure for a non-genesis non-digest value', () => {
    const error = failure(
      projectStaffPolicySnapshotV1(
        { ...metadata, previousDigest: 'not-a-digest' },
        [record()],
      ),
    );
    expect(error.code).toBe(OHAC_ERROR_CODE.INVALID_FIELD);
    expect(error.field).toBe('previousDigest');
  });

  it('propagates the stable build failure for an empty publisher build', () => {
    const error = failure(
      projectStaffPolicySnapshotV1({ ...metadata, publisherBackendBuild: '' }, [
        record(),
      ]),
    );
    expect(error.code).toBe(OHAC_ERROR_CODE.INVALID_FIELD);
    expect(error.field).toBe('build');
  });

  it('is neither parseable as a v1 epoch nor riding the epoch contract keys', () => {
    const result = projectStaffPolicySnapshotV1(metadata, [record()]);
    if (result.ok === false) throw new Error(result.error.code);
    const reparsed = parseStaffPolicyEpochV1(
      Buffer.from(JSON.stringify(result.value), 'utf8'),
    );
    // The epoch parser requires the terminal and build fields the snapshot
    // deliberately omits, so the snapshot cannot silently ride the v1 epoch
    // contract (decision 17).
    if (reparsed.ok !== false) throw new Error('expected parse failure');
    expect(reparsed.error.code).toBe(OHAC_ERROR_CODE.MISSING_FIELD);
    expect(reparsed.error.field).toBe('targetTerminalId');
  });
});
