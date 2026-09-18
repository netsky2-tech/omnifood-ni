import { OHAC_ERROR_CODE, type OhacError } from '../contracts/error-codes';
import { parseStaffPolicyEpochV1 } from '../contracts/staff-policy-epoch.v1';
import {
  projectStaffPolicyEpochV1,
  type StaffPolicyEpochProjectionMetadata,
  type StaffPolicyEpochSourceRecord,
} from './staff-policy-epoch-projector';

const TENANT = '11111111-1111-4111-8111-111111111111';
const TERMINAL = 'Q802024120001';
const USER_A = '33333333-3333-4333-8333-333333333333';
const USER_B = '44444444-4444-4444-8444-444444444444';
const USER_C = '55555555-5555-4555-8555-555555555555';

const metadata: StaffPolicyEpochProjectionMetadata = {
  tenantId: TENANT,
  targetTerminalId: TERMINAL,
  sequence: '1',
  previousSequence: '0',
  previousDigest: 'GENESIS',
  publisherBackendBuild: 'backend-build-1',
  targetPosBuild: 'pos-build-1',
};

const record = (
  overrides: Partial<StaffPolicyEpochSourceRecord> = {},
): StaffPolicyEpochSourceRecord => ({
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

describe('staff-policy-epoch-projector', () => {
  it('projects a single active record into a contract-valid epoch', () => {
    // MANAGER carries non-empty role defaults, so a contained default
    // permission proves role-default projection through
    // resolveEffectivePermissions (§4.1 rule 3).
    const result = projectStaffPolicyEpochV1(metadata, [
      record({ role: 'MANAGER' }),
    ]);
    if (result.ok === false) throw new Error(result.error.code);
    const epoch = result.value;
    expect(epoch.schema).toBe('ohac.staff-policy-epoch.v1');
    expect(epoch.sequence).toBe('1');
    expect(epoch.minimumAssertionSchema).toBe('ohac.assertion.v1');
    expect(epoch.digest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(epoch.policyEntries).toHaveLength(1);
    expect(epoch.policyEntries[0].status).toBe('ACTIVE');
    expect(epoch.policyEntries[0].role).toBe('MANAGER');
    expect(epoch.policyEntries[0].permissions).toContain('sales:void_invoice');
    expect(epoch.policyEntries[0].pinVerifier.formatVersion).toBe('2b');
    // §4.1 rule 4 fidelity: the encoded verifier is the untouched source
    // bcrypt hash, never re-encoded or trimmed.
    expect(epoch.policyEntries[0].pinVerifier.encoded).toBe(
      '$2b$10$abcdefghijklmnopqrstuv',
    );
  });

  it('resolves a CASHIER custom permission through resolveEffectivePermissions', () => {
    const result = projectStaffPolicyEpochV1(metadata, [
      record({ customPermissions: ['sales:void_invoice'] }),
    ]);
    if (result.ok === false) throw new Error(result.error.code);
    expect(result.value.policyEntries[0].permissions).toContain(
      'sales:void_invoice',
    );
  });

  it('deduplicates and UTF-16 lexically sorts permissions', () => {
    const result = projectStaffPolicyEpochV1(metadata, [
      record({
        customPermissions: [
          'sales:void_invoice',
          'inventory:recipe_edit',
          'inventory.remediation.execute',
          'sales:void_invoice',
        ],
      }),
    ]);
    if (result.ok === false) throw new Error(result.error.code);
    expect(result.value.policyEntries[0].permissions).toEqual([
      'inventory.remediation.execute',
      'inventory:recipe_edit',
      'sales:void_invoice',
    ]);
  });

  it('maps isActive to explicit ACTIVE and INACTIVE statuses', () => {
    const result = projectStaffPolicyEpochV1(metadata, [
      record({ userId: USER_B, isActive: false }),
      record(),
    ]);
    if (result.ok === false) throw new Error(result.error.code);
    const [first, second] = result.value.policyEntries;
    expect(first.userId).toBe(USER_A);
    expect(first.status).toBe('ACTIVE');
    expect(second.userId).toBe(USER_B);
    expect(second.status).toBe('INACTIVE');
  });

  it('derives formatVersion from all three supported bcrypt prefixes', () => {
    for (const [prefix, version] of [
      ['$2a$', '2a'],
      ['$2b$', '2b'],
      ['$2y$', '2y'],
    ] as const) {
      const result = projectStaffPolicyEpochV1(metadata, [
        record({ pinHash: `${prefix}10$abcdefghijklmnopqrstuv` }),
      ]);
      if (result.ok === false) throw new Error(result.error.code);
      expect(result.value.policyEntries[0].pinVerifier.formatVersion).toBe(
        version,
      );
    }
  });

  it('fails closed on an unsupported non-null hash prefix without defaulting', () => {
    const result = projectStaffPolicyEpochV1(metadata, [
      record({ pinHash: '$2x$10$abcdefghijklmnopqrstuv' }),
    ]);
    const error = failure(result);
    expect(error.code).toBe(OHAC_ERROR_CODE.INVALID_FIELD);
    expect(error.field).toBe('pinVerifier');
  });

  it('omits records with no PIN hash', () => {
    const result = projectStaffPolicyEpochV1(metadata, [
      record({ userId: USER_B, pinHash: null }),
      record(),
    ]);
    if (result.ok === false) throw new Error(result.error.code);
    expect(result.value.policyEntries.map((entry) => entry.userId)).toEqual([
      USER_A,
    ]);
  });

  it('returns the stable empty-policy invalid-field result when every record lacks a PIN hash', () => {
    const error = failure(
      projectStaffPolicyEpochV1(metadata, [record({ pinHash: null })]),
    );
    expect(error.code).toBe(OHAC_ERROR_CODE.INVALID_FIELD);
    expect(error.field).toBe('policyEntries');
  });

  it('rejects duplicate user ids instead of overwriting', () => {
    const error = failure(
      projectStaffPolicyEpochV1(metadata, [record(), record()]),
    );
    expect(error.code).toBe(OHAC_ERROR_CODE.INVALID_FIELD);
    expect(error.field).toBe('userId');
  });

  it('produces an identical digest and entry order from reversed source order', () => {
    const forward = projectStaffPolicyEpochV1(metadata, [
      record({ userId: USER_C, role: 'MANAGER' }),
      record({ userId: USER_B, isActive: false }),
      record(),
    ]);
    const reversed = projectStaffPolicyEpochV1(metadata, [
      record(),
      record({ userId: USER_B, isActive: false }),
      record({ userId: USER_C, role: 'MANAGER' }),
    ]);
    if (forward.ok === false) throw new Error(forward.error.code);
    if (reversed.ok === false) throw new Error(reversed.error.code);
    expect(reversed.value.digest).toBe(forward.value.digest);
    expect(reversed.value.policyEntries).toEqual(forward.value.policyEntries);
  });

  it('round-trips the projected epoch through parseStaffPolicyEpochV1', () => {
    const result = projectStaffPolicyEpochV1(metadata, [record()]);
    if (result.ok === false) throw new Error(result.error.code);
    const reparsed = parseStaffPolicyEpochV1(
      Buffer.from(JSON.stringify(result.value), 'utf8'),
    );
    if (reparsed.ok === false) throw new Error(reparsed.error.code);
    expect(reparsed.value.digest).toBe(result.value.digest);
  });

  it('propagates stable contract failures for broken sequence chains', () => {
    const gapped = failure(
      projectStaffPolicyEpochV1(
        { ...metadata, sequence: '5', previousSequence: '0' },
        [record()],
      ),
    );
    expect(gapped.code).toBe(OHAC_ERROR_CODE.INVALID_FIELD);
    expect(gapped.field).toBe('sequence');
    const brokenGenesis = failure(
      projectStaffPolicyEpochV1(
        {
          ...metadata,
          previousDigest: `sha256:${'a'.repeat(64)}`,
        },
        [record()],
      ),
    );
    expect(brokenGenesis.code).toBe(OHAC_ERROR_CODE.INVALID_FIELD);
    expect(brokenGenesis.field).toBe('sequence');
  });

  it('rejects an invalid attemptResetGeneration through contract validation', () => {
    const error = failure(
      projectStaffPolicyEpochV1(metadata, [
        record({ attemptResetGeneration: '01' }),
      ]),
    );
    expect(error.code).toBe(OHAC_ERROR_CODE.INVALID_FIELD);
    expect(error.field).toBe('attemptResetGeneration');
  });

  it('propagates malformed metadata through contract validation', () => {
    const error = failure(
      projectStaffPolicyEpochV1(
        { ...metadata, tenantId: '11111111-1111-4111-8111-11111111111A' },
        [record()],
      ),
    );
    expect(error.code).toBe(OHAC_ERROR_CODE.INVALID_FIELD);
    expect(error.field).toBe('tenantId');
  });
});
