import { canonicalizeOhac, ohacDigest } from './canonical';
import {
  OHAC_ERROR_CODE,
  type OhacError,
  type OhacResult,
} from './error-codes';
import {
  GENESIS_DIGEST,
  MINIMUM_ASSERTION_SCHEMA,
  STAFF_POLICY_EPOCH_V1_SCHEMA,
  parseStaffPolicyEpochV1,
  type StaffPolicyEpochV1,
  validateEpochAcceptance,
} from './staff-policy-epoch.v1';

const TENANT = '11111111-1111-4111-8111-111111111111';
const OTHER_TENANT = '22222222-2222-4222-8222-222222222222';
const AUTHORIZER = '33333333-3333-4333-8333-333333333333';
const TERMINAL = 'Q802024120001';

const MAX_INT64 = '9223372036854775807';
const MAX_INT64_MINUS_ONE = '9223372036854775806';
const MAX_INT64_PLUS_ONE = '9223372036854775808';
const BOUNDARY_DIGEST = `sha256:${'b'.repeat(64)}`;

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

  it('requires the supported assertion schema for minimumAssertionSchema', () => {
    // The supported assertion schema constant itself parses.
    expect(
      parseStaffPolicyEpochV1(
        sign(epochBody({ minimumAssertionSchema: MINIMUM_ASSERTION_SCHEMA })),
      ).ok,
    ).toBe(true);

    // Unknown non-empty schema ids are rejected with the schema-level
    // error, not a build/field error.
    const error = failure(
      parseStaffPolicyEpochV1(
        sign(epochBody({ minimumAssertionSchema: 'ohac.assertion.v2' })),
      ),
    );
    expect(error.code).toBe(OHAC_ERROR_CODE.UNSUPPORTED_SCHEMA);
    expect(error.field).toBe('minimumAssertionSchema');
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

  it('reports OHAC_UNKNOWN_FIELD, never a digest mismatch, for a signed payload carrying the reserved `__proto__` key', () => {
    // The publisher signed bytes whose canonical form includes the reserved
    // key, and JSON.parse keeps `__proto__` as an own data property. Digest
    // verification must therefore re-canonicalize with the key kept (like
    // the Dart map) and the exact-keys guard — not the digest — must reject
    // it.
    const withReserved = { ...epochBody() };
    Object.defineProperty(withReserved, '__proto__', {
      value: 'x',
      enumerable: true,
      writable: true,
      configurable: true,
    });
    const error = failure(parseStaffPolicyEpochV1(sign(withReserved)));
    expect(error.code).toBe(OHAC_ERROR_CODE.UNKNOWN_FIELD);
    expect(error.field).toBe('__proto__');
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

  it('accepts the maximum Int64 sequence chained from max-1', () => {
    const epoch = parseStaffPolicyEpochV1(
      sign(
        epochBody({
          sequence: MAX_INT64,
          previousSequence: MAX_INT64_MINUS_ONE,
          previousDigest: BOUNDARY_DIGEST,
        }),
      ),
    );
    if (epoch.ok === false) throw new Error(epoch.error.code);
    expect(epoch.value.sequence).toBe(MAX_INT64);

    expect(
      validateEpochAcceptance({
        ...acceptanceInput(),
        epoch: epoch.value,
        acceptedSequence: MAX_INT64_MINUS_ONE,
        acceptedDigest: BOUNDARY_DIGEST,
      }).ok,
    ).toBe(true);

    // The Int64 head itself is semantically valid: no newer epoch can exist,
    // so the outcome is staleness, never a throw or a field error.
    expect(
      failure(
        validateEpochAcceptance({
          ...acceptanceInput(),
          epoch: epoch.value,
          acceptedSequence: MAX_INT64,
          acceptedDigest: BOUNDARY_DIGEST,
        }),
      ),
    ).toMatchObject({
      code: OHAC_ERROR_CODE.SEQUENCE_NOT_NEWER,
      field: 'sequence',
    });
  });

  it('rejects sequence values beyond Int64 before BigInt parsing', () => {
    const beyondHead = failure(
      parseStaffPolicyEpochV1(
        sign(
          epochBody({
            sequence: MAX_INT64_PLUS_ONE,
            previousSequence: MAX_INT64,
            previousDigest: BOUNDARY_DIGEST,
          }),
        ),
      ),
    );
    expect(beyondHead.code).toBe(OHAC_ERROR_CODE.INVALID_FIELD);
    expect(beyondHead.field).toBe('sequence');

    const beyondChain = failure(
      parseStaffPolicyEpochV1(
        sign(
          epochBody({
            sequence: '1',
            previousSequence: MAX_INT64_PLUS_ONE,
          }),
        ),
      ),
    );
    expect(beyondChain.code).toBe(OHAC_ERROR_CODE.INVALID_FIELD);
    expect(beyondChain.field).toBe('previousSequence');
  });

  it('rejects a huge decimal sequence before an expensive parse', () => {
    const huge = '9'.repeat(400);
    const result = failure(
      parseStaffPolicyEpochV1(
        sign(
          epochBody({
            sequence: huge,
            previousSequence: `${'9'.repeat(399)}8`,
            previousDigest: BOUNDARY_DIGEST,
          }),
        ),
      ),
    );
    expect(result.code).toBe(OHAC_ERROR_CODE.INVALID_FIELD);
    expect(result.field).toBe('sequence');
  });

  it('returns OHAC_INVALID_FIELD for a malformed acceptedSequence instead of throwing', () => {
    const epoch = parseStaffPolicyEpochV1(sign(epochBody()));
    if (epoch.ok === false) throw new Error(epoch.error.code);

    for (const acceptedSequence of [
      '',
      'abc',
      '01',
      '-1',
      '+1',
      '1.0',
      ' 1',
      '1e3',
      MAX_INT64_PLUS_ONE,
      '9'.repeat(400),
    ]) {
      const result = validateEpochAcceptance({
        ...acceptanceInput(),
        epoch: epoch.value,
        acceptedSequence,
      });
      expect(failure(result)).toMatchObject({
        code: OHAC_ERROR_CODE.INVALID_FIELD,
        field: 'acceptedSequence',
      });
    }
  });

  it('returns OHAC_INVALID_FIELD for a malformed acceptedDigest instead of proceeding', () => {
    const epoch = parseStaffPolicyEpochV1(sign(epochBody()));
    if (epoch.ok === false) throw new Error(epoch.error.code);

    for (const acceptedDigest of [
      '',
      'genesis',
      'GENESIS ',
      '0'.repeat(64),
      'sha256:',
      `sha256:${'a'.repeat(63)}`,
      `sha256:${'a'.repeat(65)}`,
      `sha256:${'A'.repeat(64)}`,
      `sha256:${'g'.repeat(64)}`,
    ]) {
      const result = validateEpochAcceptance({
        ...acceptanceInput(),
        epoch: epoch.value,
        acceptedDigest,
      });
      expect(failure(result)).toMatchObject({
        code: OHAC_ERROR_CODE.INVALID_FIELD,
        field: 'acceptedDigest',
      });
    }
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
