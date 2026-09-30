import type { EntityManager } from 'typeorm';
import { createDeviceSyncPrincipal } from '../../security/device-sync-principal';
import type { OhacAssertionV1 } from '../contracts/assertion.v1';
import { OHAC_ERROR_CODE } from '../contracts/error-codes';
import type {
  HumanAuthorizationVerificationRequest,
  HumanAuthorizationVerificationResult,
} from '../ports/human-authorization-verifier.port';
import { HumanAuthorizationVerifierService } from './human-authorization-verifier.service';
import { HumanAuthorizationMetricsService } from './human-authorization-metrics.service';

const TENANT = '11111111-1111-4111-8111-111111111111';
const OTHER_TENANT = '22222222-2222-4222-8222-222222222222';
const TERMINAL = 'Q802024120001';
const AUTHORIZER = '33333333-3333-4333-8333-333333333333';
const OPERATOR = '44444444-4444-4444-8444-444444444444';
const CREDENTIAL = '55555555-5555-4555-8555-555555555555';
const EPOCH_DIGEST = 'sha256:' + 'e'.repeat(64);
const OP_DIGEST = 'sha256:' + '6'.repeat(64);
const AUDIT_HASH = 'sha256:' + '7'.repeat(64);

const AUTHORIZER_ENTRY = {
  userId: AUTHORIZER,
  status: 'ACTIVE',
  role: 'MANAGER',
  permissions: ['issue_credit_note'],
};

const principal = (
  overrides: Partial<ReturnType<typeof createDeviceSyncPrincipal>> = {},
) =>
  createDeviceSyncPrincipal({
    credentialId: CREDENTIAL,
    tenantId: TENANT,
    deviceId: TERMINAL,
    scopes: ['sync:pull'],
    credentialVersion: 3,
    ...overrides,
  });

const assertion = (
  overrides: Partial<OhacAssertionV1> = {},
): OhacAssertionV1 => ({
  schema: 'ohac.assertion.v1',
  assertionId: '66666666-6666-4666-8666-666666666666',
  tenantId: TENANT,
  terminalId: TERMINAL,
  deviceCredentialId: CREDENTIAL,
  deviceCredentialVersion: '3',
  epochSequence: '1',
  epochDigest: EPOCH_DIGEST,
  authorizerUserId: AUTHORIZER,
  operatorUserId: OPERATOR,
  authorizerRole: 'MANAGER',
  permissionsUsed: ['issue_credit_note'],
  operationType: 'issue_credit_note',
  operationSchema: 'dsi6.credit-note.v1',
  operationDigest: OP_DIGEST,
  localAuthorizationSequence: '42',
  localAuditId: 'local-audit-1',
  localAuditEntryHash: AUDIT_HASH,
  posBuild: 'pos-build-1',
  policySchema: 'ohac.staff-policy-epoch.v1',
  trustLevel: 'APPLICATION_SANDBOX_SOFTWARE',
  authorizedAt: '2026-09-28T12:00:00Z',
  digest: 'sha256:' + '8'.repeat(64),
  ...overrides,
});

const request = (
  overrides: Partial<HumanAuthorizationVerificationRequest> = {},
): HumanAuthorizationVerificationRequest => ({
  assertion: assertion(),
  expectedTenantId: TENANT,
  expectedTerminalId: TERMINAL,
  requiredTransportScope: 'sync:pull',
  expectedOperationType: 'issue_credit_note',
  expectedOperationSchema: 'dsi6.credit-note.v1',
  expectedOperationDigest: OP_DIGEST,
  requiredRoles: [],
  requiredPermissions: [],
  backendBuild: 'backend-build-1',
  correlationId: 'corr-1',
  ...overrides,
});

interface ScriptedQuery {
  readonly match: string | RegExp;
  readonly rows?: unknown[];
}

const epochRow = (entries: unknown[] = [AUTHORIZER_ENTRY]) => ({
  schema: 'ohac.staff-policy-epoch.v1',
  digest: EPOCH_DIGEST,
  payload: { policyEntries: entries },
});

const defaultScript = (
  overrides: Record<string, unknown[]> = {},
  boundTenant = TENANT,
): ScriptedQuery[] => [
  { match: 'set_config', rows: [{ set_config: 'app.tenant_id' }] },
  {
    match: "current_setting('app.tenant_id')",
    rows: [{ tenant: boundTenant }],
  },
  {
    match: 'FROM human_auth_rollout_cohorts',
    rows: overrides.cohorts ?? [
      {
        enabled: true,
        policy_schema: 'ohac.staff-policy-snapshot.v1',
        assertion_schema: 'ohac.assertion.v1',
      },
    ],
  },
  {
    match: 'FROM human_auth_policy_epochs',
    rows: overrides.epochs ?? [epochRow()],
  },
  {
    match: 'FROM human_auth_terminal_ack_floor',
    rows: overrides.floor ?? [{ sequence: '1', digest: EPOCH_DIGEST }],
  },
];

/**
 * Builds the verifier with a scripted consumer-owned transaction manager.
 * Records every statement plus the transaction-control / repository-insert
 * surface so the consumer-boundary contract (design §8: the port must never
 * commit, roll back, or insert consumption) is asserted directly.
 */
const harness = (script: readonly ScriptedQuery[]) => {
  const statements: { sql: string; params: unknown[] }[] = [];
  const forbidden = {
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    transaction: jest.fn(),
    insert: jest.fn(),
    save: jest.fn(),
  };
  const manager = {
    query: jest.fn((sql: string, params: unknown[] = []) => {
      statements.push({ sql, params });
      const entry = script.find((candidate) =>
        typeof candidate.match === 'string'
          ? sql.includes(candidate.match)
          : candidate.match.test(sql),
      );
      return Promise.resolve(entry ? (entry.rows ?? []) : []);
    }),
    ...forbidden,
  } as unknown as EntityManager;
  const metrics = new HumanAuthorizationMetricsService();
  const service = new HumanAuthorizationVerifierService(metrics);
  const verify = (
    principalOverrides: Partial<
      ReturnType<typeof createDeviceSyncPrincipal>
    > = {},
    requestOverrides: Partial<HumanAuthorizationVerificationRequest> = {},
  ): Promise<HumanAuthorizationVerificationResult> =>
    service.verify(
      manager,
      principal(principalOverrides),
      request(requestOverrides),
    );
  return { service, manager, statements, forbidden, metrics, verify };
};

const expectDenied = (
  outcome: HumanAuthorizationVerificationResult,
  code: (typeof OHAC_ERROR_CODE)[keyof typeof OHAC_ERROR_CODE],
) => {
  expect(outcome.decision).toBe('DENIED');
  expect(outcome.reasonCode).toBe(code);
};

describe('HumanAuthorizationVerifierService (design §8 ordered checks)', () => {
  it('admits a fully valid assertion and returns frozen facts', async () => {
    const { verify, metrics } = harness(defaultScript());
    const outcome = await verify();

    expect(outcome.decision).toBe('ADMITTED');
    expect(outcome.reasonCode).toBeNull();
    expect(outcome.facts.assertionId).toBe(
      '66666666-6666-4666-8666-666666666666',
    );
    expect(outcome.facts.epochSequence).toBe('1');
    expect(outcome.facts.epochDigest).toBe(EPOCH_DIGEST);
    expect(outcome.facts.authorizerUserId).toBe(AUTHORIZER);
    expect(outcome.facts.authorizerRole).toBe('MANAGER');
    expect(outcome.facts.operatorUserId).toBe(OPERATOR);
    expect(outcome.facts.permissionsUsed).toEqual(['issue_credit_note']);
    expect(outcome.facts.operationDigest).toBe(OP_DIGEST);
    expect(outcome.facts.localAuditId).toBe('local-audit-1');
    expect(outcome.facts.trustLevel).toBe('APPLICATION_SANDBOX_SOFTWARE');
    expect(Object.isFrozen(outcome)).toBe(true);
    expect(Object.isFrozen(outcome.facts)).toBe(true);
    expect(Object.isFrozen(outcome.facts.permissionsUsed)).toBe(true);
    expect(metrics.readCounters().get('ohac_verification:admitted')).toBe(1);
  });

  it('issues the defensive set_config and asserts the bound tenant equals the principal tenant', async () => {
    const { verify, statements } = harness(defaultScript());
    await verify();

    expect(statements[0].sql).toContain("set_config('app.tenant_id'");
    expect(statements[0].params[0]).toBe(TENANT);
    expect(statements[1].sql).toContain("current_setting('app.tenant_id')");
  });

  it('denies with TENANT_SCOPE_MISMATCH when the bound tenant is not the principal tenant', async () => {
    const { verify } = harness(defaultScript({}, OTHER_TENANT));
    expectDenied(await verify(), OHAC_ERROR_CODE.TENANT_SCOPE_MISMATCH);
  });

  it('denies a principal that is not DEVICE_SYNC (check 3 framing)', async () => {
    const { service, manager } = harness(defaultScript());
    const outcome = await service.verify(
      manager,
      {
        principalType: 'HUMAN_JWT',
        credentialId: CREDENTIAL,
        tenantId: TENANT,
        deviceId: TERMINAL,
        scopes: ['sync:pull'],
        credentialVersion: 3,
      } as never,
      request(),
    );
    expectDenied(outcome, OHAC_ERROR_CODE.TENANT_TERMINAL_MISMATCH);
  });

  it('denies with COHORT_DISABLED when no cohort row exists for the build pair (check 1)', async () => {
    const { verify } = harness(defaultScript({ cohorts: [] }));
    expectDenied(await verify(), OHAC_ERROR_CODE.COHORT_DISABLED);
  });

  it('denies with UNSUPPORTED_BUILD when the cohort is disabled or schemas mismatch (check 1)', async () => {
    const disabled = harness(
      defaultScript({
        cohorts: [
          {
            enabled: false,
            policy_schema: 'ohac.staff-policy-snapshot.v1',
            assertion_schema: 'ohac.assertion.v1',
          },
        ],
      }),
    );
    expectDenied(await disabled.verify(), OHAC_ERROR_CODE.UNSUPPORTED_BUILD);

    const schemaMismatch = harness(
      defaultScript({
        cohorts: [
          {
            enabled: true,
            policy_schema: 'ohac.staff-policy-snapshot.v0',
            assertion_schema: 'ohac.assertion.v1',
          },
        ],
      }),
    );
    expectDenied(
      await schemaMismatch.verify(),
      OHAC_ERROR_CODE.UNSUPPORTED_BUILD,
    );
  });

  it('denies with MALFORMED_ASSERTION when framing digests are not sha256 (check 2)', async () => {
    const { service, manager } = harness(defaultScript());
    expectDenied(
      await service.verify(
        manager,
        principal(),
        request({ assertion: assertion({ digest: 'not-a-digest' }) }),
      ),
      OHAC_ERROR_CODE.MALFORMED_ASSERTION,
    );

    const badEpochDigest = harness(defaultScript());
    expectDenied(
      await badEpochDigest.verify(
        {},
        { assertion: assertion({ epochDigest: 'sha256:ZZ' }) },
      ),
      OHAC_ERROR_CODE.MALFORMED_ASSERTION,
    );
  });

  it('distinguishes TENANT_TERMINAL_MISMATCH from CREDENTIAL_BINDING_MISMATCH (R1-004)', async () => {
    // A principal that is not the asserted tenant at all (bound tenant
    // matches the principal, so the defensive check passes and check 3
    // fires) → tenant/terminal.
    const wrongTenant = harness(defaultScript({}, OTHER_TENANT));
    const wrongTenantOutcome = await wrongTenant.service.verify(
      wrongTenant.manager,
      principal({ tenantId: OTHER_TENANT }),
      request(),
    );
    expectDenied(wrongTenantOutcome, OHAC_ERROR_CODE.TENANT_TERMINAL_MISMATCH);

    // Same tenant/terminal but the credential binding moved on (version
    // bumped) → credential binding.
    const bumpedVersion = harness(defaultScript());
    expectDenied(
      await bumpedVersion.verify({ credentialVersion: 4 }),
      OHAC_ERROR_CODE.CREDENTIAL_BINDING_MISMATCH,
    );

    const rotatedId = harness(defaultScript());
    expectDenied(
      await rotatedId.verify({
        credentialId: '77777777-7777-4777-8777-777777777777',
      }),
      OHAC_ERROR_CODE.CREDENTIAL_BINDING_MISMATCH,
    );
  });

  it('denies with TENANT_TERMINAL_MISMATCH on terminal mismatch or missing scope (check 3)', async () => {
    const otherTerminal = harness(defaultScript());
    expectDenied(
      await otherTerminal.verify({ deviceId: 'OTHER-TERMINAL' }),
      OHAC_ERROR_CODE.TENANT_TERMINAL_MISMATCH,
    );

    const noScope = harness(defaultScript());
    expectDenied(
      await noScope.verify({ scopes: ['sync:push'] }),
      OHAC_ERROR_CODE.TENANT_TERMINAL_MISMATCH,
    );
  });

  it('denies with MALFORMED_ASSERTION / DIGEST_MISMATCH on operation binding mismatch (check 4)', async () => {
    const typeMismatch = harness(defaultScript());
    expectDenied(
      await typeMismatch.verify({}, { expectedOperationType: 'void_invoice' }),
      OHAC_ERROR_CODE.MALFORMED_ASSERTION,
    );

    const schemaMismatch = harness(defaultScript());
    expectDenied(
      await schemaMismatch.verify(
        {},
        { expectedOperationSchema: 'dsi6.credit-note.v2' },
      ),
      OHAC_ERROR_CODE.MALFORMED_ASSERTION,
    );

    const digestMismatch = harness(defaultScript());
    expectDenied(
      await digestMismatch.verify(
        {},
        { expectedOperationDigest: 'sha256:' + '9'.repeat(64) },
      ),
      OHAC_ERROR_CODE.DIGEST_MISMATCH,
    );
  });

  it('denies with STALE_EPOCH when the epoch is missing or the floor has not reached it (check 5)', async () => {
    const missingEpoch = harness(defaultScript({ epochs: [] }));
    expectDenied(await missingEpoch.verify(), OHAC_ERROR_CODE.STALE_EPOCH);

    const floorBehind = harness(
      defaultScript({ floor: [{ sequence: '0', digest: EPOCH_DIGEST }] }),
    );
    expectDenied(await floorBehind.verify(), OHAC_ERROR_CODE.STALE_EPOCH);

    const noFloor = harness(defaultScript({ floor: [] }));
    expectDenied(await noFloor.verify(), OHAC_ERROR_CODE.STALE_EPOCH);
  });

  it('denies with DIGEST_MISMATCH when the epoch digest differs (check 5)', async () => {
    const { verify } = harness(
      defaultScript({
        epochs: [
          {
            schema: 'ohac.staff-policy-epoch.v1',
            digest: 'sha256:' + '0'.repeat(64),
            payload: { policyEntries: [AUTHORIZER_ENTRY] },
          },
        ],
      }),
    );
    expectDenied(await verify(), OHAC_ERROR_CODE.DIGEST_MISMATCH);
  });

  it('denies with ACK_INCONSISTENT when the floor digest conflicts at the same sequence (check 5)', async () => {
    const { verify } = harness(
      defaultScript({
        floor: [{ sequence: '1', digest: 'sha256:' + '1'.repeat(64) }],
      }),
    );
    expectDenied(await verify(), OHAC_ERROR_CODE.ACK_INCONSISTENT);
  });

  it('denies with INELIGIBLE_AUTHORIZER for missing/inactive/role/permission entry failures (check 6)', async () => {
    const missing = harness(defaultScript({ epochs: [epochRow([])] }));
    expectDenied(await missing.verify(), OHAC_ERROR_CODE.INELIGIBLE_AUTHORIZER);

    const inactive = harness(
      defaultScript({
        epochs: [epochRow([{ ...AUTHORIZER_ENTRY, status: 'INACTIVE' }])],
      }),
    );
    expectDenied(
      await inactive.verify(),
      OHAC_ERROR_CODE.INELIGIBLE_AUTHORIZER,
    );

    const roleMismatch = harness(
      defaultScript({
        epochs: [epochRow([{ ...AUTHORIZER_ENTRY, role: 'CASHIER' }])],
      }),
    );
    expectDenied(
      await roleMismatch.verify(),
      OHAC_ERROR_CODE.INELIGIBLE_AUTHORIZER,
    );

    const permissionMissing = harness(
      defaultScript({
        epochs: [
          epochRow([{ ...AUTHORIZER_ENTRY, permissions: ['view_reports'] }]),
        ],
      }),
    );
    expectDenied(
      await permissionMissing.verify(),
      OHAC_ERROR_CODE.INELIGIBLE_AUTHORIZER,
    );

    const consumerRequired = harness(defaultScript());
    expectDenied(
      await consumerRequired.verify(
        {},
        { requiredPermissions: ['approve_payroll'] },
      ),
      OHAC_ERROR_CODE.INELIGIBLE_AUTHORIZER,
    );
  });

  it('denies with MALFORMED_ASSERTION when audit linkage is malformed (check 7)', async () => {
    const badHash = harness(defaultScript());
    expectDenied(
      await badHash.verify(
        {},
        { assertion: assertion({ localAuditEntryHash: 'nope' }) },
      ),
      OHAC_ERROR_CODE.MALFORMED_ASSERTION,
    );

    const badSequence = harness(defaultScript());
    expectDenied(
      await badSequence.verify(
        {},
        { assertion: assertion({ localAuthorizationSequence: '1x' }) },
      ),
      OHAC_ERROR_CODE.MALFORMED_ASSERTION,
    );
  });

  it('denies when the trust level is not exactly software sandbox (check 8)', async () => {
    const badTrust = harness(defaultScript());
    expectDenied(
      await badTrust.verify(
        {},
        { assertion: assertion({ trustLevel: 'HSM_SIGNED' as never }) },
      ),
      OHAC_ERROR_CODE.MALFORMED_ASSERTION,
    );
  });

  it('never commits, rolls back, or performs a repository insert (consumer boundary)', async () => {
    const happy = harness(defaultScript());
    await happy.verify();
    expect(happy.forbidden.commitTransaction).not.toHaveBeenCalled();
    expect(happy.forbidden.rollbackTransaction).not.toHaveBeenCalled();
    expect(happy.forbidden.transaction).not.toHaveBeenCalled();
    expect(happy.forbidden.insert).not.toHaveBeenCalled();
    expect(happy.forbidden.save).not.toHaveBeenCalled();

    const denied = harness(defaultScript({ cohorts: [] }));
    await denied.verify();
    expect(denied.forbidden.commitTransaction).not.toHaveBeenCalled();
    expect(denied.forbidden.rollbackTransaction).not.toHaveBeenCalled();
    expect(denied.forbidden.insert).not.toHaveBeenCalled();
  });

  it('appends exactly one append-only verification event with decision and reason, and no verifier material', async () => {
    const happy = harness(defaultScript());
    await happy.verify();
    const inserts = happy.statements.filter((s) =>
      s.sql.includes('INSERT INTO human_auth_verification_events'),
    );
    expect(inserts).toHaveLength(1);
    expect(inserts[0].params).toContain('ADMITTED');
    expect(happy.metrics.readCounters().get('ohac_verification:admitted')).toBe(
      1,
    );

    const denied = harness(defaultScript({ cohorts: [] }));
    await denied.verify();
    const deniedInserts = denied.statements.filter((s) =>
      s.sql.includes('INSERT INTO human_auth_verification_events'),
    );
    expect(deniedInserts).toHaveLength(1);
    expect(deniedInserts[0].params).toContain('DENIED');
    expect(deniedInserts[0].params).toContain(OHAC_ERROR_CODE.COHORT_DISABLED);
    expect(
      denied.metrics
        .readCounters()
        .get('ohac_verification:denied:OHAC_COHORT_DISABLED'),
    ).toBe(1);

    for (const { statements } of [happy, denied]) {
      const serialized = JSON.stringify(statements);
      expect(serialized).not.toMatch(/pinVerifier|bcrypt|\$2[aby]\$/i);
      expect(serialized.toLowerCase()).not.toContain('pin');
    }
  });

  it('applies the ordered checks in §8 sequence: a disabled cohort masks a later credential mismatch', async () => {
    // Wrong credential version AND no cohort: check 1 must fire first.
    const precedence = harness(defaultScript({ cohorts: [] }));
    expectDenied(
      await precedence.verify({ credentialVersion: 99 }),
      OHAC_ERROR_CODE.COHORT_DISABLED,
    );
  });

  it('evaluates principal framing as a precondition before the ordered checks: a non-DEVICE_SYNC principal denies even against a cohort-disabled tenant', async () => {
    // The framing precondition runs first by design: a principal that is not
    // the asserted transport identity at all gets the mismatch code, never a
    // cohort-specific reason that would probe tenant state for it.
    const { service, manager } = harness(defaultScript({ cohorts: [] }));
    const outcome = await service.verify(
      manager,
      {
        principalType: 'HUMAN_JWT',
        credentialId: CREDENTIAL,
        tenantId: TENANT,
        deviceId: TERMINAL,
        scopes: ['sync:pull'],
        credentialVersion: 3,
      } as never,
      request(),
    );
    expectDenied(outcome, OHAC_ERROR_CODE.TENANT_TERMINAL_MISMATCH);
  });
});
