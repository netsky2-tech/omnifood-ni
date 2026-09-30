import { randomUUID } from 'crypto';
import { createOhacPublicationFixture } from './ohac-publication-db.fixture';
import { createDeviceSyncPrincipal } from '../../security/device-sync-principal';
import type { OhacAssertionV1 } from '../contracts/assertion.v1';
import { OHAC_ERROR_CODE } from '../contracts/error-codes';
import type { HumanAuthorizationVerificationRequest } from '../ports/human-authorization-verifier.port';
import { HumanAuthorizationVerifierService } from '../services/human-authorization-verifier.service';
import { HumanAuthorizationMetricsService } from '../services/human-authorization-metrics.service';

jest.setTimeout(60_000);

const TENANT = '11111111-1111-4111-8111-111111111111';
const OTHER_TENANT = '22222222-2222-4222-8222-222222222222';
const TERMINAL = 'Q802024120001';
const POS_BUILD = 'pos-build-1';
const BACKEND_BUILD = 'backend-build-1';
const CREDENTIAL = '55555555-5555-4555-8555-555555555555';
const OPERATOR = '44444444-4444-4444-8444-444444444444';
const OP_DIGEST = 'sha256:' + '6'.repeat(64);
const AUDIT_HASH = 'sha256:' + '7'.repeat(64);

describe('HumanAuthorizationVerifierService (real database)', () => {
  let fixture: Awaited<ReturnType<typeof createOhacPublicationFixture>>;
  let verifier: HumanAuthorizationVerifierService;
  let authorizerUserId: string;
  let epochDigest: string;

  const principal = (overrides: Record<string, unknown> = {}) =>
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
    assertionId: randomUUID(),
    tenantId: TENANT,
    terminalId: TERMINAL,
    deviceCredentialId: CREDENTIAL,
    deviceCredentialVersion: '3',
    epochSequence: '1',
    epochDigest,
    authorizerUserId,
    operatorUserId: OPERATOR,
    authorizerRole: 'MANAGER',
    permissionsUsed: ['sales:issue_credit_note'],
    operationType: 'issue_credit_note',
    operationSchema: 'dsi6.credit-note.v1',
    operationDigest: OP_DIGEST,
    localAuthorizationSequence: '42',
    localAuditId: 'local-audit-1',
    localAuditEntryHash: AUDIT_HASH,
    posBuild: POS_BUILD,
    policySchema: 'ohac.staff-policy-epoch.v1',
    trustLevel: 'APPLICATION_SANDBOX_SOFTWARE',
    authorizedAt: '2026-09-28T12:00:00Z',
    digest: 'sha256:' + '8'.repeat(64),
    ...overrides,
  });

  const request = (
    assertionOverrides: Partial<OhacAssertionV1> = {},
    overrides: Partial<HumanAuthorizationVerificationRequest> = {},
  ): HumanAuthorizationVerificationRequest => ({
    assertion: assertion(assertionOverrides),
    expectedTenantId: TENANT,
    expectedTerminalId: TERMINAL,
    requiredTransportScope: 'sync:pull',
    expectedOperationType: 'issue_credit_note',
    expectedOperationSchema: 'dsi6.credit-note.v1',
    expectedOperationDigest: OP_DIGEST,
    requiredRoles: [],
    requiredPermissions: [],
    backendBuild: BACKEND_BUILD,
    correlationId: 'corr-1',
    ...overrides,
  });

  const readVerificationEvents = async (
    assertionId: string,
  ): Promise<{ decision: string; reason_code: string | null }[]> =>
    await fixture.admin.query(
      `SELECT decision, reason_code
         FROM human_auth_verification_events
        WHERE assertion_id = $1`,
      [assertionId],
    );

  beforeAll(async () => {
    fixture = await createOhacPublicationFixture();
    verifier = new HumanAuthorizationVerifierService(
      new HumanAuthorizationMetricsService(),
    );

    // Staff + a real projected snapshot payload (MANAGER authorizer with the
    // required permission), then the per-terminal epoch carrying that payload.
    const projected = await fixture.seedProjectedSnapshot(
      TENANT,
      { sequence: 1, publisherBackendBuild: BACKEND_BUILD },
      [
        {
          role: 'MANAGER',
          isActive: true,
          pinHash: '$2b$12$fixturefixturefixturefixturefixturefixturefixturefi',
          customPermissions: [],
        },
      ],
    );
    epochDigest = projected.digest;
    // The projected payload carries deterministic per-entry user ids (the
    // fixture's convention), which is the identity the verifier must match —
    // not the users-table id the fixture seeds alongside it.
    const snapshotRow = (
      await fixture.admin.query(
        `SELECT payload FROM human_auth_policy_snapshots WHERE tenant_id = $1 AND sequence = '1'`,
        [TENANT],
      )
    )[0];
    authorizerUserId = (
      snapshotRow.payload.policyEntries as { userId: string }[]
    )[0].userId;
    // The verification event FKs users(id): back the payload's deterministic
    // entry id with a real user row (the fixture seeded a random-id user).
    await fixture.admin.query(
      `INSERT INTO users (id, tenant_id, email, role, is_active)
       VALUES ($1, $2, $3, 'MANAGER', TRUE)`,
      [authorizerUserId, TENANT, `${authorizerUserId}@verifier-fixture.test`],
    );
    await fixture.seedCohortPair(TENANT, POS_BUILD, BACKEND_BUILD);
    await fixture.admin.query(
      `INSERT INTO human_auth_policy_epochs
         (tenant_id, terminal_id, schema, sequence, previous_sequence,
          previous_digest, publisher_backend_build, target_pos_build,
          minimum_assertion_schema, cohort_decision, digest, payload)
       VALUES ($1, $2, 'ohac.staff-policy-epoch.v1', '1', '0', 'GENESIS',
               $3, $4, 'ohac.assertion.v1', 'ELIGIBLE', $5, $6)`,
      [
        TENANT,
        TERMINAL,
        BACKEND_BUILD,
        POS_BUILD,
        epochDigest,
        snapshotRow.payload,
      ],
    );
    await fixture.seedAckFloor(TENANT, TERMINAL, 1, epochDigest);
    // The fixture grants predate the verifier port, so the §8 verification
    // event append needs its INSERT grant (schema-qualified, like every
    // grant in the fixture; the table's tenant RLS WITH CHECK still applies).
    await fixture.admin.query(
      `GRANT INSERT, SELECT ON "${fixture.schema}".human_auth_verification_events
         TO "${roleFor(fixture)}"`,
    );
  });

  afterAll(async () => {
    await fixture.close();
  });

  it('admits a valid assertion inside a real tenant-RLS transaction and appends the verification event', async () => {
    const target = assertion();
    const outcome = await fixture.transaction.run(TENANT, (manager) =>
      verifier.verify(manager, principal(), request({}, { assertion: target })),
    );

    expect(outcome.decision).toBe('ADMITTED');
    expect(outcome.reasonCode).toBeNull();
    expect(Object.isFrozen(outcome.facts)).toBe(true);

    const events = await readVerificationEvents(target.assertionId);
    expect(events).toHaveLength(1);
    expect(events[0].decision).toBe('ADMITTED');
    expect(events[0].reason_code).toBeNull();
  });

  it('denies a bumped credential version with CREDENTIAL_BINDING_MISMATCH, preserving the assertion append-only', async () => {
    const target = assertion();
    const outcome = await fixture.transaction.run(TENANT, (manager) =>
      verifier.verify(
        manager,
        principal({ credentialVersion: 4 }),
        request({}, { assertion: target }),
      ),
    );
    expect(outcome.decision).toBe('DENIED');
    expect(outcome.reasonCode).toBe(
      OHAC_ERROR_CODE.CREDENTIAL_BINDING_MISMATCH,
    );

    const events = await readVerificationEvents(target.assertionId);
    expect(events).toHaveLength(1);
    expect(events[0].decision).toBe('DENIED');
    expect(events[0].reason_code).toBe(
      OHAC_ERROR_CODE.CREDENTIAL_BINDING_MISMATCH,
    );
  });

  it('denies a principal from another tenant with TENANT_TERMINAL_MISMATCH (RLS-bound)', async () => {
    // Seed the other tenant's cohort so check 1 passes and the §8 order
    // reaches the principal-binding check itself.
    await fixture.seedCohortPair(OTHER_TENANT, POS_BUILD, BACKEND_BUILD);
    const target = assertion();
    const outcome = await fixture.transaction.run(OTHER_TENANT, (manager) =>
      verifier.verify(
        manager,
        principal({ tenantId: OTHER_TENANT }),
        request({}, { assertion: target }),
      ),
    );
    expect(outcome.reasonCode).toBe(OHAC_ERROR_CODE.TENANT_TERMINAL_MISMATCH);
  });

  it('denies with STALE_EPOCH when the floor has not reached the asserted epoch', async () => {
    // A second terminal that never acknowledged epoch 1.
    const terminal = 'Q802024120002';
    const terminalSnapshot = (
      await fixture.admin.query(
        `SELECT payload FROM human_auth_policy_snapshots WHERE tenant_id = $1 AND sequence = '1'`,
        [TENANT],
      )
    )[0];
    await fixture.admin.query(
      `INSERT INTO human_auth_policy_epochs
         (tenant_id, terminal_id, schema, sequence, previous_sequence,
          previous_digest, publisher_backend_build, target_pos_build,
          minimum_assertion_schema, cohort_decision, digest, payload)
       VALUES ($1, $2, 'ohac.staff-policy-epoch.v1', '1', '0', 'GENESIS',
               $3, $4, 'ohac.assertion.v1', 'ELIGIBLE', $5, $6)`,
      [
        TENANT,
        terminal,
        BACKEND_BUILD,
        POS_BUILD,
        epochDigest,
        terminalSnapshot.payload,
      ],
    );
    const outcome = await fixture.transaction.run(TENANT, (manager) =>
      verifier.verify(
        manager,
        principal({ deviceId: terminal }),
        request(
          { terminalId: terminal },
          {
            expectedTerminalId: terminal,
            assertion: assertion({ terminalId: terminal }),
          },
        ),
      ),
    );
    expect(outcome.decision).toBe('DENIED');
    expect(outcome.reasonCode).toBe(OHAC_ERROR_CODE.STALE_EPOCH);
  });

  describe('consumer boundary (design §8): a test-only consumer harness on a REAL transaction', () => {
    const CONSUMER_TABLE = 'human_auth_test_consumption';

    /**
     * The canonical consumer flow (design §8): in one tenant-RLS transaction
     * it rechecks idempotency, invokes the verifier, inserts consumption with
     * a unique (tenant_id, assertion_id), applies the effect, and commits.
     * `failureMode` injects the harness fault.
     */
    const consume = async (
      target: OhacAssertionV1,
      opts: {
        operationDigest?: string;
        forceEffectFailure?: boolean;
      } = {},
    ): Promise<'consumed' | 'replayed' | 'replay-conflict'> => {
      const requestHash = opts.operationDigest ?? OP_DIGEST;
      return await fixture.transaction.run(TENANT, async (manager) => {
        // Idempotency recheck (consumer-owned).
        const existing = await manager.query(
          `SELECT operation_digest FROM ${CONSUMER_TABLE}
            WHERE tenant_id = $1 AND assertion_id = $2`,
          [TENANT, target.assertionId],
        );
        if (existing.length > 0) {
          return existing[0].operation_digest === requestHash
            ? 'replayed'
            : 'replay-conflict';
        }
        const outcome = await verifier.verify(
          manager,
          principal(),
          request(
            {},
            {
              assertion: target,
              expectedOperationDigest: requestHash,
            },
          ),
        );
        if (outcome.decision === 'DENIED') {
          throw new Error(`verifier denied: ${outcome.reasonCode}`);
        }
        await manager.query(
          `INSERT INTO ${CONSUMER_TABLE} (tenant_id, assertion_id, operation_digest, effect)
           VALUES ($1, $2, $3, 'credit-note-issued')`,
          [TENANT, target.assertionId, requestHash],
        );
        if (opts.forceEffectFailure) {
          throw new Error('forced effect failure after verify');
        }
        return 'consumed';
      });
    };

    beforeAll(async () => {
      // Test-only consumer table with the §8-required unique identity.
      await fixture.admin.query(
        `CREATE TABLE IF NOT EXISTS ${CONSUMER_TABLE} (
           tenant_id uuid NOT NULL,
           assertion_id uuid NOT NULL,
           operation_digest varchar(128) NOT NULL,
           effect varchar(128) NOT NULL,
           CONSTRAINT uq_${CONSUMER_TABLE} UNIQUE (tenant_id, assertion_id)
         )`,
      );
      await fixture.admin.query(
        `GRANT SELECT, INSERT, DELETE ON "${fixture.schema}".${CONSUMER_TABLE} TO "${roleFor(fixture)}"`,
      );
    });

    const countConsumption = async (assertionId?: string) => {
      const rows = assertionId
        ? await fixture.admin.query(
            `SELECT COUNT(*)::int AS n FROM ${CONSUMER_TABLE} WHERE assertion_id = $1`,
            [assertionId],
          )
        : await fixture.admin.query(
            `SELECT COUNT(*)::int AS n FROM ${CONSUMER_TABLE}`,
          );
      return rows[0].n as number;
    };

    it('verifier success followed by a forced effect failure leaves NEITHER consumption NOR committed verification', async () => {
      const target = assertion();
      await expect(
        consume(target, { forceEffectFailure: true }),
      ).rejects.toThrow('forced effect failure');

      // The consumer transaction rolled back: no consumption row.
      expect(await countConsumption(target.assertionId)).toBe(0);
      // The verifier's own event rode the same transaction: if the port had
      // committed on its own, its event would have survived the rollback.
      expect(await readVerificationEvents(target.assertionId)).toHaveLength(0);
    });

    it('matching retry after a lost response returns the prior receipt; mismatched reuse is a conflict', async () => {
      const target = assertion();
      expect(await consume(target)).toBe('consumed');
      expect(await countConsumption(target.assertionId)).toBe(1);

      // Identical retry: the consumer's idempotency recheck short-circuits.
      expect(await consume(target)).toBe('replayed');
      // Same assertion id under a different operation digest: conflict.
      expect(
        await consume(target, { operationDigest: 'sha256:' + '9'.repeat(64) }),
      ).toBe('replay-conflict');
      expect(await countConsumption(target.assertionId)).toBe(1);
    });

    it('concurrent reuse yields exactly ONE effect via the unique (tenant_id, assertion_id)', async () => {
      const target = assertion();
      const results = await Promise.allSettled([
        consume(target),
        consume(target),
      ]);
      // Exactly one winner: the other transaction either loses the unique
      // index race (rejected) or serializes behind the first commit and
      // returns its receipt ('replayed'). Both never consume.
      const outcomes = results.flatMap((r) =>
        r.status === 'fulfilled' ? [r.value] : [],
      );
      expect(outcomes.filter((v) => v === 'consumed')).toHaveLength(1);
      expect(await countConsumption(target.assertionId)).toBe(1);
    });
  });
});

// The fixture role name is derived from the fixture schema name; the schema is
// `ohac_p4_<suffix>` and the role `ohac_p4_rls_<suffix>`.
const roleFor = (
  f: Awaited<ReturnType<typeof createOhacPublicationFixture>>,
): string => f.schema.replace('ohac_p4_', 'ohac_p4_rls_');
