import { canonicalizeOhac, ohacDigest } from './canonical';
import {
  OHAC_ERROR_CODE,
  type OhacError,
  type OhacResult,
} from './error-codes';
import {
  GENESIS_DIGEST,
  STAFF_POLICY_EPOCH_V1_SCHEMA,
  parseStaffPolicyEpochV1,
  type StaffPolicyEpochV1,
  validateEpochAcceptance,
} from './staff-policy-epoch.v1';

const TENANT = '11111111-1111-4111-8111-111111111111';
const OTHER_TENANT = '22222222-2222-4222-8222-222222222222';
const AUTHORIZER = '33333333-3333-4333-8333-333333333333';
const TERMINAL = 'Q802024120001';

const epochBody = (
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  schema: STAFF_POLICY_EPOCH_V1_SCHEMA,
  tenantId: TENANT,
  targetTerminalId: TERMINAL,
  sequence: '1',
  previousSequence: '0',
  previousDigest: GENESIS_DIGEST,
  publisherBackendBuild: 'backend-build-1',
  targetPosBuild: 'pos-build-1',
  minimumAssertionSchema: 'ohac.assertion.v1',
  policyEntries: [
    {
      userId: AUTHORIZER,
      status: 'ACTIVE',
      role: 'MANAGER',
      permissions: ['sales:void_invoice'],
      pinVerifier: {
        algorithm: 'bcrypt',
        formatVersion: '2b',
        encoded: '$2b$10$abcdefghijklmnopqrstuv',
      },
      attemptResetGeneration: '0',
    },
  ],
  ...overrides,
});

const sign = (body: Record<string, unknown>): Buffer => {
  const canonical = canonicalizeOhac(Buffer.from(JSON.stringify(body), 'utf8'));
  if (canonical.ok === false) throw new Error(canonical.error.code);
  const digest = ohacDigest(canonical.value);
  return Buffer.from(JSON.stringify({ ...body, digest }), 'utf8');
};

const failure = (result: OhacResult<unknown>): OhacError => {
  if (result.ok === false) return result.error;
  throw new Error('expected the contract to reject the payload');
};

const acceptanceInput = (overrides: Record<string, unknown> = {}) => ({
  expectedTenantId: TENANT,
  expectedTerminalId: TERMINAL,
  acceptedSequence: '0',
  acceptedDigest: GENESIS_DIGEST,
  supportedPosBuild: 'pos-build-1',
  ...overrides,
});

describe('ohac.staff-policy-epoch.v1', () => {
  it('parses a valid signed epoch', () => {
    const result = parseStaffPolicyEpochV1(sign(epochBody()));
    expect(result.ok).toBe(true);
    if (result.ok === false) throw new Error(result.error.code);
    const epoch: StaffPolicyEpochV1 = result.value;
    expect(epoch.sequence).toBe('1');
    expect(epoch.policyEntries).toHaveLength(1);
    expect(epoch.digest).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('rejects a payload whose transmitted digest does not match its bytes', () => {
    const body = epochBody({ digest: `sha256:${'0'.repeat(64)}` });
    expect(
      failure(
        parseStaffPolicyEpochV1(Buffer.from(JSON.stringify(body), 'utf8')),
      ).code,
    ).toBe(OHAC_ERROR_CODE.DIGEST_MISMATCH);
  });

  it('rejects an unsupported schema id', () => {
    const result = parseStaffPolicyEpochV1(
      sign(epochBody({ schema: 'ohac.staff-policy-epoch.v2' })),
    );
    expect(failure(result).code).toBe(OHAC_ERROR_CODE.UNSUPPORTED_SCHEMA);
  });

  it('rejects unknown and missing fields', () => {
    expect(
      failure(parseStaffPolicyEpochV1(sign(epochBody({ extra: 'nope' })))).code,
    ).toBe(OHAC_ERROR_CODE.UNKNOWN_FIELD);
    const withoutTerminal = epochBody();
    delete withoutTerminal.targetTerminalId;
    expect(failure(parseStaffPolicyEpochV1(sign(withoutTerminal))).code).toBe(
      OHAC_ERROR_CODE.MISSING_FIELD,
    );
  });

  it('rejects non-canonical decimal strings and non-contiguous sequences', () => {
    expect(
      failure(parseStaffPolicyEpochV1(sign(epochBody({ sequence: '01' }))))
        .code,
    ).toBe(OHAC_ERROR_CODE.INVALID_FIELD);
    expect(
      failure(
        parseStaffPolicyEpochV1(
          sign(epochBody({ sequence: '5', previousSequence: '0' })),
        ),
      ).code,
    ).toBe(OHAC_ERROR_CODE.INVALID_FIELD);
  });

  it('requires entries sorted by userId with de-duplicated sorted permissions', () => {
    const secondUser = '44444444-4444-4444-8444-444444444444';
    const entries = (epochBody().policyEntries as Record<string, unknown>[])[0];
    const unsorted = [
      { ...entries, userId: secondUser },
      { ...entries, userId: AUTHORIZER },
    ];
    expect(
      failure(
        parseStaffPolicyEpochV1(sign(epochBody({ policyEntries: unsorted }))),
      ).code,
    ).toBe(OHAC_ERROR_CODE.INVALID_FIELD);

    const unsortedPermissions = [
      {
        ...entries,
        permissions: ['sales:void_invoice', 'analytics:read', 'analytics:read'],
      },
    ];
    expect(
      failure(
        parseStaffPolicyEpochV1(
          sign(epochBody({ policyEntries: unsortedPermissions })),
        ),
      ).code,
    ).toBe(OHAC_ERROR_CODE.INVALID_FIELD);
  });

  it('rejects unknown roles and statuses', () => {
    const entries = (epochBody().policyEntries as Record<string, unknown>[])[0];
    expect(
      failure(
        parseStaffPolicyEpochV1(
          sign(
            epochBody({ policyEntries: [{ ...entries, role: 'SUPERUSER' }] }),
          ),
        ),
      ).code,
    ).toBe(OHAC_ERROR_CODE.INVALID_FIELD);
    expect(
      failure(
        parseStaffPolicyEpochV1(
          sign(
            epochBody({ policyEntries: [{ ...entries, status: 'PENDING' }] }),
          ),
        ),
      ).code,
    ).toBe(OHAC_ERROR_CODE.INVALID_FIELD);
  });

  it('rejects a foreign tenant, a foreign terminal and an unsupported build pair', () => {
    const epoch = parseStaffPolicyEpochV1(sign(epochBody()));
    if (epoch.ok === false) throw new Error(epoch.error.code);

    expect(
      failure(
        validateEpochAcceptance({
          ...acceptanceInput(),
          epoch: epoch.value,
          expectedTenantId: OTHER_TENANT,
        }),
      ).code,
    ).toBe(OHAC_ERROR_CODE.TENANT_SCOPE_MISMATCH);
    expect(
      failure(
        validateEpochAcceptance({
          ...acceptanceInput(),
          epoch: epoch.value,
          expectedTerminalId: 'OTHER-TERMINAL',
        }),
      ).code,
    ).toBe(OHAC_ERROR_CODE.TENANT_TERMINAL_MISMATCH);
    expect(
      failure(
        validateEpochAcceptance({
          ...acceptanceInput(),
          epoch: epoch.value,
          supportedPosBuild: 'pos-build-9',
        }),
      ).code,
    ).toBe(OHAC_ERROR_CODE.UNSUPPORTED_BUILD_PAIR);
  });

  it('accepts only the exact next epoch and rejects a broken chain', () => {
    const epoch = parseStaffPolicyEpochV1(sign(epochBody()));
    if (epoch.ok === false) throw new Error(epoch.error.code);

    expect(
      validateEpochAcceptance({ ...acceptanceInput(), epoch: epoch.value }).ok,
    ).toBe(true);

    const stale = parseStaffPolicyEpochV1(
      sign(
        epochBody({
          sequence: '1',
          previousSequence: '0',
          previousDigest: GENESIS_DIGEST,
        }),
      ),
    );
    if (stale.ok === false) throw new Error(stale.error.code);
    expect(
      failure(
        validateEpochAcceptance({
          ...acceptanceInput(),
          epoch: stale.value,
          acceptedSequence: '1',
        }),
      ).code,
    ).toBe(OHAC_ERROR_CODE.SEQUENCE_NOT_NEWER);

    expect(
      failure(
        validateEpochAcceptance({
          ...acceptanceInput(),
          epoch: stale.value,
          acceptedSequence: '0',
          acceptedDigest: `sha256:${'a'.repeat(64)}`,
        }),
      ).code,
    ).toBe(OHAC_ERROR_CODE.INVALID_FIELD);
  });
});
