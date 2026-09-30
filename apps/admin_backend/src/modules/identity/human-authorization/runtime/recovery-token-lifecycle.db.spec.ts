import { createHash, createHmac, randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { createOhacPublicationFixture } from './ohac-publication-db.fixture';
import {
  RecoveryTokenService,
  RECOVERY_TOKEN_TTL_MS,
  type RecoveryRedeemOutcome,
} from '../services/recovery-token.service';
import { HumanAuthorizationMetricsService } from '../services/human-authorization-metrics.service';
import { OHAC_ERROR_CODE } from '../contracts/error-codes';

jest.setTimeout(60_000);

const TENANT = '11111111-1111-4111-8111-111111111111';
const TERMINAL = 'Q802024120001';
const POS_BUILD = 'pos-build-1';
const BACKEND_BUILD = 'backend-build-1';
const CREDENTIAL = '55555555-5555-4555-8555-555555555555';
const OTHER_TERMINAL = 'Q802024120009';
const OTHER_PEPPER = 'rotated-pepper-value-with-at-least-32-bytes-xx';

const PEPPER = process.env.HUMAN_AUTHORIZATION_RECOVERY_PEPPER ?? '';

const roleFor = (
  f: Awaited<ReturnType<typeof createOhacPublicationFixture>>,
): string => f.schema.replace('ohac_p4_', 'ohac_p4_rls_');

describe('RecoveryTokenService (real database, design §9 lifecycle)', () => {
  let fixture: Awaited<ReturnType<typeof createOhacPublicationFixture>>;
  let service: RecoveryTokenService;
  let issuerId: string;

  const redeemInput = (
    overrides: Record<string, unknown> = {},
  ): Parameters<RecoveryTokenService['redeem']>[0] => ({
    tenantId: TENANT,
    terminalId: TERMINAL,
    credentialId: CREDENTIAL,
    token: 'ohr1.invalid',
    idempotencyKey: 'idem-1',
    posBuild: POS_BUILD,
    policySchema: 'ohac.staff-policy-snapshot.v1',
    assertionSchema: 'ohac.assertion.v1',
    backendBuild: BACKEND_BUILD,
    ...overrides,
  });

  const readToken = async (tokenId: string) =>
    (
      await fixture.admin.query(
        `SELECT * FROM human_auth_recovery_tokens WHERE token_id = $1`,
        [tokenId],
      )
    )[0];

  const countEvents = async (tokenId: string, eventType: string) =>
    (
      await fixture.admin.query(
        `SELECT COUNT(*)::int AS n FROM human_auth_recovery_events
          WHERE token_id = $1 AND event_type = $2`,
        [tokenId, eventType],
      )
    )[0].n as number;

  beforeAll(async () => {
    fixture = await createOhacPublicationFixture();
    service = new RecoveryTokenService(
      fixture.transaction,
      {
        get: (key: string) =>
          key === 'HUMAN_AUTHORIZATION_RECOVERY_PEPPER' ? PEPPER : undefined,
      } as unknown as ConfigService,
      new HumanAuthorizationMetricsService(),
    );

    // Real transport schema so the issuance enrollment join sees genuine DDL.
    // The migration classes cannot run here: TypeORM's createTable(ifNotExists)
    // existence check reads information_schema without a schema filter, sees
    // the public-schema production-like tables, and skips creation while the
    // subsequent CREATE INDEX calls collide with public index names. So the
    // two tables are created in the scratch schema with the exact DDL of
    // migrations 1800000000000 and 1807000000000 (source of truth: those
    // migrations; schema-qualified on purpose).
    await fixture.admin.query(
      `CREATE TABLE IF NOT EXISTS "${fixture.schema}".onboarding_activation_attempts (
         id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
         tenant_id varchar(128) NOT NULL,
         onboarding_session_id uuid NOT NULL,
         candidate_terminal_id varchar(128) NOT NULL,
         trusted_terminal_id varchar(128) NULL,
         status varchar(64) NOT NULL DEFAULT 'CREATED',
         started_by_user_id varchar(128) NOT NULL,
         started_at timestamptz NOT NULL DEFAULT now(),
         completed_at timestamptz NULL,
         server_time_anchor_at timestamptz NOT NULL,
         required_fiscal_revision int NOT NULL,
         required_fiscal_fingerprint varchar(64) NOT NULL,
         verification_product_id varchar(128) NOT NULL,
         verification_product_revision int NOT NULL DEFAULT 1,
         verification_product_fingerprint varchar(64) NOT NULL,
         verification_ticket_id varchar(128) NULL,
         pos_build varchar(128) NULL,
         warnings_count int NOT NULL DEFAULT 0,
         failure_code varchar(128) NULL,
         idempotency_key varchar(256) NULL,
         created_at timestamptz NOT NULL DEFAULT now(),
         updated_at timestamptz NOT NULL DEFAULT now()
       )`,
    );
    await fixture.admin.query(
      `CREATE TABLE IF NOT EXISTS "${fixture.schema}".device_sync_credentials (
         id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
         tenant_id varchar(128) NOT NULL,
         activation_attempt_id uuid NOT NULL
           REFERENCES "${fixture.schema}".onboarding_activation_attempts(id),
         renewal_secret_hash varchar(255) NOT NULL,
         scopes jsonb NOT NULL DEFAULT '["sync:push", "sync:pull"]'::jsonb,
         version integer NOT NULL DEFAULT 1,
         status varchar(64) NOT NULL DEFAULT 'PENDING',
         expires_at timestamptz NOT NULL,
         issued_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
         rotated_at timestamptz NULL,
         revoked_at timestamptz NULL,
         revocation_reason varchar(255) NULL,
         created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
         updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
       )`,
    );
    await fixture.admin.query(
      `ALTER TABLE "${fixture.schema}".onboarding_activation_attempts ENABLE ROW LEVEL SECURITY`,
    );
    await fixture.admin.query(
      `ALTER TABLE "${fixture.schema}".device_sync_credentials ENABLE ROW LEVEL SECURITY`,
    );
    await fixture.admin.query(
      `GRANT SELECT ON "${fixture.schema}".onboarding_activation_attempts,
        "${fixture.schema}".device_sync_credentials TO "${roleFor(fixture)}"`,
    );
    await fixture.admin.query(
      `CREATE POLICY activation_attempts_fixture_select
         ON "${fixture.schema}".onboarding_activation_attempts
         FOR SELECT USING (true)`,
    );
    await fixture.admin.query(
      `CREATE POLICY device_sync_credentials_fixture_select
         ON "${fixture.schema}".device_sync_credentials
         FOR SELECT USING (tenant_id = current_setting('app.tenant_id', true))`,
    );
    // The fixture's grants predate the recovery lifecycle; the §9 path needs
    // DML on the recovery token and event tables (schema-qualified, like
    // every grant in the fixture; the tables' tenant RLS still applies).
    await fixture.admin.query(
      `GRANT SELECT, INSERT, UPDATE ON "${fixture.schema}".human_auth_recovery_tokens,
        "${fixture.schema}".human_auth_recovery_events TO "${roleFor(fixture)}"`,
    );

    // Enrolled terminal: a trusted activation attempt with an ACTIVE device
    // sync credential (admin connection bypasses RLS for seeding).
    const attempt = (
      await fixture.admin.query(
        `INSERT INTO onboarding_activation_attempts
           (tenant_id, onboarding_session_id, candidate_terminal_id,
            trusted_terminal_id, status, started_by_user_id,
            server_time_anchor_at, required_fiscal_revision,
            required_fiscal_fingerprint, verification_product_id,
            verification_product_fingerprint, pos_build)
         VALUES ($1, gen_random_uuid(), $2, $2, 'COMPLETED', 'fixture',
                 now(), 0, 'fp', 'prod', 'fp', $3)
         RETURNING id`,
        [TENANT, TERMINAL, POS_BUILD],
      )
    )[0];
    await fixture.admin.query(
      `INSERT INTO device_sync_credentials
         (tenant_id, activation_attempt_id, renewal_secret_hash, status, expires_at)
       VALUES ($1, $2, 'fixture-hash', 'ACTIVE', now() + interval '1 day')`,
      [TENANT, attempt.id],
    );

    // An active OWNER issuer of the tenant.
    await fixture.seedTenantStaff(TENANT, [
      { role: 'OWNER', isActive: true, pinHash: null, customPermissions: [] },
    ]);
    issuerId = (
      await fixture.admin.query(
        `SELECT id FROM users WHERE tenant_id = $1 LIMIT 1`,
        [TENANT],
      )
    )[0].id;

    await fixture.seedCohortPair(TENANT, POS_BUILD, BACKEND_BUILD);
  });

  afterAll(async () => {
    await fixture.close();
  });

  it('issues a one-time ohr1 token, stores only its HMAC, and expires in exactly 15 minutes', async () => {
    const before = Date.now();
    const issued = await service.issue({
      tenantId: TENANT,
      terminalId: TERMINAL,
      issuedByUserId: issuerId,
      reason: 'operator forgot PIN',
      correlationId: 'corr-1',
    });
    const after = Date.now();

    expect(issued.token).toMatch(/^ohr1\.[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/);
    const secret = issued.token.split('.')[2];
    expect(issued.expiresAt.getTime() - before).toBeLessThanOrEqual(
      RECOVERY_TOKEN_TTL_MS + 50,
    );
    expect(issued.expiresAt.getTime() - after).toBeGreaterThanOrEqual(
      RECOVERY_TOKEN_TTL_MS - (after - before) - 50,
    );

    const row = await readToken(issued.tokenId);
    expect(row.status).toBe('ISSUED');
    const expectedHmac = createHmac('sha256', PEPPER)
      .update(secret)
      .digest('hex');
    expect(row.secret_hmac).toBe(expectedHmac);
    expect(row.secret_hmac).not.toBe(secret);
    // No plaintext column anywhere in the row.
    expect(JSON.stringify(row)).not.toContain(secret);

    const events = await fixture.admin.query(
      `SELECT event_type, principal_type FROM human_auth_recovery_events WHERE token_id = $1`,
      [issued.tokenId],
    );
    expect(events.map((e: { event_type: string }) => e.event_type)).toEqual([
      'ISSUANCE',
    ]);
    // Events carry no secret material.
    expect(JSON.stringify(events)).not.toContain(secret);
    expect(JSON.stringify(events)).not.toContain(expectedHmac);
  });

  it('rejects issuance for an unenrolled terminal', async () => {
    await expect(
      service.issue({
        tenantId: TENANT,
        terminalId: OTHER_TERMINAL,
        issuedByUserId: issuerId,
        reason: 'no such terminal',
      }),
    ).rejects.toThrow(/enrolled terminals/i);
  });

  it('redeems a live token for the bound terminal exactly once', async () => {
    const issued = await service.issue({
      tenantId: TENANT,
      terminalId: TERMINAL,
      issuedByUserId: issuerId,
      reason: 'lost authorization state',
    });

    const outcome: RecoveryRedeemOutcome = await service.redeem(
      redeemInput({
        token: issued.token,
        idempotencyKey: 'idem-r1',
        integrityClassification: 'AUTH_STATE_MISSING',
      }),
    );
    expect(outcome.status).toBe('redeemed');
    if (outcome.status === 'redeemed') {
      expect(outcome.receipt.tokenId).toBe(issued.tokenId);
      expect(outcome.receipt.terminalId).toBe(TERMINAL);
    }

    const row = await readToken(issued.tokenId);
    expect(row.status).toBe('REDEEMED');
    expect(row.redemption_credential_id).toBe(CREDENTIAL);
    expect(row.idempotency_key).toBe('idem-r1');
    const requestHash = createHash('sha256')
      .update(
        `${CREDENTIAL}|${TERMINAL}|${POS_BUILD}|ohac.staff-policy-snapshot.v1|ohac.assertion.v1`,
      )
      .digest('hex');
    expect(row.redemption_request_hash).toBe(requestHash);
    expect(await countEvents(issued.tokenId, 'REDEMPTION')).toBe(1);
  });

  it('single-use: a different retry is USED, the identical retry replays the receipt', async () => {
    const issued = await service.issue({
      tenantId: TENANT,
      terminalId: TERMINAL,
      issuedByUserId: issuerId,
      reason: 'single use',
    });
    await service.redeem(
      redeemInput({ token: issued.token, idempotencyKey: 'k1' }),
    );

    const reused = await service.redeem(
      redeemInput({ token: issued.token, idempotencyKey: 'k2' }),
    );
    expect(reused).toEqual({
      status: 'rejected',
      resultCode: OHAC_ERROR_CODE.RECOVERY_USED,
    });

    const replay = await service.redeem(
      redeemInput({ token: issued.token, idempotencyKey: 'k1' }),
    );
    expect(replay.status).toBe('replayed');
    if (replay.status === 'replayed') {
      expect(replay.receipt.tokenId).toBe(issued.tokenId);
    }
  });

  it('denies a redemption bound to another terminal (binding mismatch)', async () => {
    const issued = await service.issue({
      tenantId: TENANT,
      terminalId: TERMINAL,
      issuedByUserId: issuerId,
      reason: 'wrong terminal test',
    });
    const outcome = await service.redeem(
      redeemInput({
        token: issued.token,
        terminalId: OTHER_TERMINAL,
      }),
    );
    expect(outcome).toEqual({
      status: 'rejected',
      resultCode: OHAC_ERROR_CODE.RECOVERY_BINDING_MISMATCH,
    });
  });

  it('observes expiry: denied EXPIRED, one idempotent EXPIRED event per token', async () => {
    // Expiry is modelled at insert time through the admin connection because
    // the append-only trigger refuses UPDATEs on the token row.
    const deterministic = await issueExpiredToken(
      fixture,
      PEPPER,
      TENANT,
      TERMINAL,
      issuerId,
    );
    const denied = await service.redeem(
      redeemInput({ token: deterministic.token }),
    );
    expect(denied).toEqual({
      status: 'rejected',
      resultCode: OHAC_ERROR_CODE.RECOVERY_EXPIRED,
    });
    const deniedAgain = await service.redeem(
      redeemInput({ token: deterministic.token }),
    );
    expect(deniedAgain).toEqual({
      status: 'rejected',
      resultCode: OHAC_ERROR_CODE.RECOVERY_EXPIRED,
    });
    expect(await countEvents(deterministic.tokenId, 'EXPIRY_OBSERVED')).toBe(1);
  });

  it('revocation: idempotent revoke, refuses redeemed tokens, revoked tokens deny redemption', async () => {
    const issued = await service.issue({
      tenantId: TENANT,
      terminalId: TERMINAL,
      issuedByUserId: issuerId,
      reason: 'revocation test',
    });
    const revoked = await service.revoke({
      tenantId: TENANT,
      tokenId: issued.tokenId,
      revokedByUserId: issuerId,
      reason: 'suspected leak',
    });
    expect(revoked).toEqual({ status: 'revoked', tokenId: issued.tokenId });
    expect(
      await service.revoke({
        tenantId: TENANT,
        tokenId: issued.tokenId,
        revokedByUserId: issuerId,
        reason: 'again',
      }),
    ).toEqual({ status: 'already-revoked', tokenId: issued.tokenId });

    const outcome = await service.redeem(redeemInput({ token: issued.token }));
    expect(outcome).toEqual({
      status: 'rejected',
      resultCode: OHAC_ERROR_CODE.RECOVERY_REVOKED,
    });

    // A redeemed token can no longer be revoked.
    const redeemed = await service.issue({
      tenantId: TENANT,
      terminalId: TERMINAL,
      issuedByUserId: issuerId,
      reason: 'redeemed revocation test',
    });
    await service.redeem(
      redeemInput({ token: redeemed.token, idempotencyKey: 'kr' }),
    );
    expect(
      await service.revoke({
        tenantId: TENANT,
        tokenId: redeemed.tokenId,
        revokedByUserId: issuerId,
        reason: 'too late',
      }),
    ).toEqual({
      status: 'rejected',
      resultCode: OHAC_ERROR_CODE.RECOVERY_USED,
      tokenId: redeemed.tokenId,
    });
  });

  it('pepper rotation: tokens issued under the previous pepper are denied like any other verification failure', async () => {
    const issued = await service.issue({
      tenantId: TENANT,
      terminalId: TERMINAL,
      issuedByUserId: issuerId,
      reason: 'before rotation',
    });
    const rotated = new RecoveryTokenService(
      fixture.transaction,
      {
        get: (key: string) =>
          key === 'HUMAN_AUTHORIZATION_RECOVERY_PEPPER'
            ? OTHER_PEPPER
            : undefined,
      } as unknown as ConfigService,
      new HumanAuthorizationMetricsService(),
    );
    const outcome = await rotated.redeem(
      redeemInput({ token: issued.token, idempotencyKey: 'k-rot' }),
    );
    expect(outcome).toEqual({
      status: 'rejected',
      resultCode: OHAC_ERROR_CODE.RECOVERY_BINDING_MISMATCH,
    });
    // The original pepper still redeems: rotation is atomic with deployment,
    // not a rollback of outstanding tokens.
    const stillValid = await service.redeem(
      redeemInput({ token: issued.token, idempotencyKey: 'k-orig' }),
    );
    expect(stillValid.status).toBe('redeemed');
  });

  it('at most one concurrent redemption succeeds', async () => {
    const issued = await service.issue({
      tenantId: TENANT,
      terminalId: TERMINAL,
      issuedByUserId: issuerId,
      reason: 'concurrency test',
    });
    const results = await Promise.allSettled([
      service.redeem(
        redeemInput({ token: issued.token, idempotencyKey: 'c1' }),
      ),
      service.redeem(
        redeemInput({ token: issued.token, idempotencyKey: 'c2' }),
      ),
    ]);
    const outcomes = results.flatMap((r) =>
      r.status === 'fulfilled' ? [r.value] : [],
    );
    expect(outcomes.filter((o) => o.status === 'redeemed')).toHaveLength(1);
    const losses = outcomes.filter(
      (o) =>
        o.status === 'rejected' &&
        o.resultCode === OHAC_ERROR_CODE.RECOVERY_USED,
    );
    expect(losses.length + (results.length - outcomes.length)).toBe(1);
  });

  it('denies redemption when the cohort pair is not enabled (zero fallback)', async () => {
    const issued = await service.issue({
      tenantId: TENANT,
      terminalId: TERMINAL,
      issuedByUserId: issuerId,
      reason: 'cohort test',
    });
    const outcome = await service.redeem(
      redeemInput({
        token: issued.token,
        posBuild: 'unsupported-pos-build',
      }),
    );
    expect(outcome).toEqual({
      status: 'rejected',
      resultCode: OHAC_ERROR_CODE.COHORT_DISABLED,
    });
  });
});

/**
 * Inserts an already-expired token directly and returns its plaintext token.
 * The append-only trigger refuses UPDATEs, so expiry is modelled at insert
 * time through the admin (superuser) connection.
 */
async function issueExpiredToken(
  fixture: Awaited<ReturnType<typeof createOhacPublicationFixture>>,
  pepper: string,
  tenantId: string,
  terminalId: string,
  issuerId: string,
): Promise<{ tokenId: string; token: string }> {
  const tokenId = randomUUID();
  const secret = randomUUID().replace(/-/g, '').repeat(2).slice(0, 43);
  const hmac = createHmac('sha256', pepper).update(secret).digest('hex');
  await fixture.admin.query(
    `INSERT INTO human_auth_recovery_tokens
       (token_id, tenant_id, terminal_id, secret_hmac, status,
        issued_by_user_id, issuance_reason, issued_at, expires_at)
     VALUES ($1, $2, $3, $4, 'ISSUED', $5, 'fixture expired', now() - interval '1 hour',
             now() - interval '1 minute')`,
    [tokenId, tenantId, terminalId, hmac, issuerId],
  );
  return { tokenId, token: `ohr1.${tokenId}.${secret}` };
}
