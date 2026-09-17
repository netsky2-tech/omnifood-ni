import { canonicalizeOhac, ohacDigest } from './canonical';
import {
  OHAC_ERROR_CODE,
  type OhacError,
  type OhacResult,
} from './error-codes';
import {
  ASSERTION_V1_SCHEMA,
  OHAC_TRUST_LEVEL,
  parseAssertionV1,
  type OhacAssertionV1,
} from './assertion.v1';
import { STAFF_POLICY_EPOCH_V1_SCHEMA } from './staff-policy-epoch.v1';

const TENANT = '11111111-1111-4111-8111-111111111111';
const TERMINAL = 'Q802024120001';
const AUTHORIZER = '33333333-3333-4333-8333-333333333333';
const OPERATOR = '44444444-4444-4444-8444-444444444444';
const CREDENTIAL = '55555555-5555-4555-8555-555555555555';
const LOCAL_AUDIT = '66666666-6666-4666-8666-666666666666';
const HASH = `sha256:${'a'.repeat(64)}`;

const assertionBody = (
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  schema: ASSERTION_V1_SCHEMA,
  assertionId: '77777777-7777-4777-8777-777777777777',
  tenantId: TENANT,
  terminalId: TERMINAL,
  deviceCredentialId: CREDENTIAL,
  deviceCredentialVersion: '3',
  epochSequence: '17',
  epochDigest: `sha256:${'b'.repeat(64)}`,
  authorizerUserId: AUTHORIZER,
  operatorUserId: OPERATOR,
  authorizerRole: 'MANAGER',
  permissionsUsed: ['sales:void_invoice'],
  operationType: 'sales.credit-note.v1',
  operationSchema: 'sales.credit-note.v1',
  operationDigest: `sha256:${'c'.repeat(64)}`,
  localAuthorizationSequence: '42',
  localAuditId: LOCAL_AUDIT,
  localAuditEntryHash: HASH,
  posBuild: 'pos-build-1',
  policySchema: STAFF_POLICY_EPOCH_V1_SCHEMA,
  trustLevel: OHAC_TRUST_LEVEL.APPLICATION_SANDBOX_SOFTWARE,
  authorizedAt: '2026-09-17T02:00:00Z',
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

describe('ohac.assertion.v1', () => {
  it('parses a valid signed assertion', () => {
    const result = parseAssertionV1(sign(assertionBody()));
    if (result.ok === false) throw new Error(result.error.code);
    const assertion: OhacAssertionV1 = result.value;
    expect(assertion.assertionId).toBe('77777777-7777-4777-8777-777777777777');
    expect(assertion.trustLevel).toBe('APPLICATION_SANDBOX_SOFTWARE');
    expect(assertion.digest).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('has no signature field, so a signature claim is rejected as unknown', () => {
    expect(
      failure(parseAssertionV1(sign(assertionBody({ signature: 'nope' }))))
        .code,
    ).toBe(OHAC_ERROR_CODE.UNKNOWN_FIELD);
  });

  it('rejects a digest that does not cover the transmitted body', () => {
    const body = assertionBody({ digest: `sha256:${'0'.repeat(64)}` });
    expect(
      failure(parseAssertionV1(Buffer.from(JSON.stringify(body), 'utf8'))).code,
    ).toBe(OHAC_ERROR_CODE.DIGEST_MISMATCH);
  });

  it('accepts only the declared software trust level', () => {
    expect(
      failure(
        parseAssertionV1(
          sign(assertionBody({ trustLevel: 'HARDWARE_ATTESTED' })),
        ),
      ).code,
    ).toBe(OHAC_ERROR_CODE.INVALID_FIELD);
  });

  it('requires the declared policy schema to be the epoch contract', () => {
    expect(
      failure(
        parseAssertionV1(
          sign(assertionBody({ policySchema: 'ohac.staff-policy-epoch.v2' })),
        ),
      ).code,
    ).toBe(OHAC_ERROR_CODE.UNSUPPORTED_SCHEMA);
  });

  it('rejects non-canonical decimal strings and malformed digests', () => {
    expect(
      failure(
        parseAssertionV1(
          sign(assertionBody({ deviceCredentialVersion: '03' })),
        ),
      ).code,
    ).toBe(OHAC_ERROR_CODE.INVALID_FIELD);
    expect(
      failure(
        parseAssertionV1(
          sign(assertionBody({ operationDigest: 'c'.repeat(64) })),
        ),
      ).code,
    ).toBe(OHAC_ERROR_CODE.INVALID_FIELD);
  });

  it('requires permissionsUsed to be non-empty, sorted and de-duplicated', () => {
    expect(
      failure(parseAssertionV1(sign(assertionBody({ permissionsUsed: [] }))))
        .code,
    ).toBe(OHAC_ERROR_CODE.INVALID_FIELD);
    expect(
      failure(
        parseAssertionV1(
          sign(
            assertionBody({
              permissionsUsed: ['sales:void_invoice', 'analytics:read'],
            }),
          ),
        ),
      ).code,
    ).toBe(OHAC_ERROR_CODE.INVALID_FIELD);
  });

  it('requires a UTC RFC3339 timestamp', () => {
    expect(
      failure(
        parseAssertionV1(
          sign(assertionBody({ authorizedAt: '2026-09-17T02:00:00-06:00' })),
        ),
      ).code,
    ).toBe(OHAC_ERROR_CODE.INVALID_FIELD);
  });

  it('rejects an unknown role and a missing required field', () => {
    expect(
      failure(
        parseAssertionV1(sign(assertionBody({ authorizerRole: 'SUPERUSER' }))),
      ).code,
    ).toBe(OHAC_ERROR_CODE.INVALID_FIELD);
    const withoutTerminal = assertionBody();
    delete withoutTerminal.terminalId;
    expect(failure(parseAssertionV1(sign(withoutTerminal))).code).toBe(
      OHAC_ERROR_CODE.MISSING_FIELD,
    );
  });
});
