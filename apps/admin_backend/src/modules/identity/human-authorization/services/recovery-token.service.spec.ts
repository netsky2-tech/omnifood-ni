import type { EntityManager } from 'typeorm';
import { createHmac } from 'crypto';
import { OhacTenantTransaction } from '../rls/ohac-tenant-transaction';
import { ConfigService } from '@nestjs/config';
import { OHAC_ERROR_CODE } from '../contracts/error-codes';
import {
  RecoveryTokenService,
  RECOVERY_TOKEN_TTL_MS,
  redemptionRequestHash,
  type IssueRecoveryTokenInput,
  type RedeemRecoveryTokenInput,
  type RevokeRecoveryTokenInput,
} from './recovery-token.service';
import { HumanAuthorizationMetricsService } from './human-authorization-metrics.service';

const TENANT = '11111111-1111-4111-8111-111111111111';
const TERMINAL = 'Q802024120001';
const ISSUER = '33333333-3333-4333-8333-333333333333';
const CREDENTIAL = '55555555-5555-4555-8555-555555555555';
const TOKEN_ID = '66666666-6666-4666-8666-666666666666';
const PEPPER = 'unit-test-pepper-value-with-at-least-32-bytes!!';
const SECRET = 'a'.repeat(42) + 'B';
const HMAC = createHmac('sha256', PEPPER).update(SECRET).digest('hex');

interface ScriptedQuery {
  readonly match: string | RegExp;
  readonly rows?: unknown[];
}

const tokenRow = (overrides: Record<string, unknown> = {}) => ({
  token_id: TOKEN_ID,
  terminal_id: TERMINAL,
  status: 'ISSUED',
  expires_at: new Date(Date.now() + 10 * 60 * 1000),
  idempotency_key: null,
  redemption_request_hash: null,
  redeemed_at: null,
  ...overrides,
});

const defaultScript = (
  overrides: Record<string, unknown[]> = {},
): ScriptedQuery[] => [
  { match: 'FROM users', rows: overrides.users ?? [{ is_active: true }] },
  {
    match: 'FROM device_sync_credentials',
    rows: overrides.enrolled ?? [{ '?column?': 1 }],
  },
  {
    match: 'FROM human_auth_recovery_tokens',
    rows: overrides.token ?? [tokenRow()],
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
    match: /UPDATE human_auth_recovery_tokens[\s\S]*RETURNING redeemed_at/,
    rows: overrides.cas ?? [{ redeemed_at: new Date('2026-09-28T12:05:00Z') }],
  },
];

const harness = (script: readonly ScriptedQuery[]) => {
  const statements: { sql: string; params: unknown[] }[] = [];
  const boundTenants: unknown[] = [];
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
  } as unknown as EntityManager;
  const transaction = {
    run: jest.fn(
      async (
        tenantId: unknown,
        work: (mgr: EntityManager) => Promise<unknown>,
      ) => {
        boundTenants.push(tenantId);
        return await work(manager);
      },
    ),
  } as unknown as OhacTenantTransaction;
  const metrics = new HumanAuthorizationMetricsService();
  const configService = {
    get: (key: string) =>
      key === 'HUMAN_AUTHORIZATION_RECOVERY_PEPPER' ? PEPPER : undefined,
  } as unknown as ConfigService;
  const service = new RecoveryTokenService(transaction, configService, metrics);
  return { service, statements, boundTenants, metrics };
};

const issueInput = (
  overrides: Partial<IssueRecoveryTokenInput> = {},
): IssueRecoveryTokenInput => ({
  tenantId: TENANT,
  terminalId: TERMINAL,
  issuedByUserId: ISSUER,
  reason: 'operator forgot PIN',
  correlationId: 'corr-1',
  ...overrides,
});

const redeemInput = (
  overrides: Partial<RedeemRecoveryTokenInput> = {},
): RedeemRecoveryTokenInput => ({
  tenantId: TENANT,
  terminalId: TERMINAL,
  credentialId: CREDENTIAL,
  token: `ohr1.${TOKEN_ID}.${SECRET}`,
  idempotencyKey: 'idem-1',
  posBuild: 'pos-build-1',
  policySchema: 'ohac.staff-policy-snapshot.v1',
  assertionSchema: 'ohac.assertion.v1',
  backendBuild: 'backend-build-1',
  correlationId: 'corr-1',
  ...overrides,
});

const revokeInput = (
  overrides: Partial<RevokeRecoveryTokenInput> = {},
): RevokeRecoveryTokenInput => ({
  tenantId: TENANT,
  tokenId: TOKEN_ID,
  revokedByUserId: ISSUER,
  reason: 'suspected leak',
  ...overrides,
});

const statementsMatching = (
  statements: { sql: string; params?: unknown[] }[],
  fragment: string,
): { sql: string; params?: unknown[] }[] =>
  statements.filter((s) => s.sql.includes(fragment));

describe('RecoveryTokenService (design §9)', () => {
  describe('issuance', () => {
    it('returns a one-time ohr1 token with exactly-15-minute expiry', async () => {
      const { service } = harness(defaultScript());
      const before = Date.now();
      const issued = await service.issue(issueInput());
      const after = Date.now();

      expect(issued.tokenId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
      expect(issued.token).toBe(
        `ohr1.${issued.tokenId}.${issued.token.split('.')[2]}`,
      );
      expect(issued.token.split('.')[2]).toMatch(/^[A-Za-z0-9_-]{43}$/);
      const ttl = issued.expiresAt.getTime() - before;
      const ttlAfter = issued.expiresAt.getTime() - after;
      expect(ttl).toBeLessThanOrEqual(RECOVERY_TOKEN_TTL_MS + 50);
      expect(ttlAfter).toBeGreaterThanOrEqual(
        RECOVERY_TOKEN_TTL_MS - (after - before) - 50,
      );
      expect(RECOVERY_TOKEN_TTL_MS).toBe(15 * 60 * 1000);
    });

    it('stores only the HMAC of the secret with the deployment pepper — never the raw secret', async () => {
      const { service, statements } = harness(defaultScript());
      const issued = await service.issue(issueInput());
      const secret = issued.token.split('.')[2];

      const inserts = statementsMatching(
        statements,
        'INSERT INTO human_auth_recovery_tokens',
      );
      expect(inserts).toHaveLength(1);
      const expectedHmac = createHmac('sha256', PEPPER)
        .update(secret)
        .digest('hex');
      expect(inserts[0].params).toContain(expectedHmac);
      expect(inserts[0].params).not.toContain(secret);
      expect(inserts[0].params).not.toContain(issued.token);
      // The stored column value is exactly 64 hex chars (sha256 hex), not the
      // plaintext secret.
      const storedValue = inserts[0].params.find(
        (p) => typeof p === 'string' && /^[0-9a-f]{64}$/.test(p),
      );
      expect(storedValue).toBe(expectedHmac);
    });

    it('rejects an inactive issuer', async () => {
      const { service } = harness(
        defaultScript({ users: [{ is_active: false }] }),
      );
      await expect(service.issue(issueInput())).rejects.toThrow(
        /active same-tenant user/i,
      );
    });

    it('rejects a terminal that is not an enrolled device-sync terminal of the tenant', async () => {
      const { service } = harness(defaultScript({ enrolled: [] }));
      await expect(service.issue(issueInput())).rejects.toThrow(
        /enrolled terminals/i,
      );
    });

    it('binds the tenant RLS transaction and appends an ISSUED event', async () => {
      const { service, statements, boundTenants } = harness(defaultScript());
      await service.issue(issueInput());
      expect(boundTenants).toEqual([TENANT]);
      const events = statementsMatching(
        statements,
        'INSERT INTO human_auth_recovery_events',
      );
      expect(events).toHaveLength(1);
      expect(events[0].params).toContain('ISSUANCE');
      expect(events[0].params).toContain(ISSUER);
    });
  });

  describe('redemption', () => {
    it('redeems a valid live token exactly once and returns the receipt', async () => {
      const { service, statements } = harness(defaultScript());
      const outcome = await service.redeem(redeemInput());

      expect(outcome.status).toBe('redeemed');
      if (outcome.status !== 'redeemed') return;
      expect(outcome.receipt.tokenId).toBe(TOKEN_ID);
      expect(outcome.receipt.terminalId).toBe(TERMINAL);
      const updates = statementsMatching(statements, "SET status = 'REDEEMED'");
      expect(updates).toHaveLength(1);
      expect(updates[0].params).toContain(CREDENTIAL);
      expect(updates[0].params).toContain('idem-1');
      expect(updates[0].params).toContain(
        redemptionRequestHash({
          credentialId: CREDENTIAL,
          terminalId: TERMINAL,
          posBuild: 'pos-build-1',
          policySchema: 'ohac.staff-policy-snapshot.v1',
          assertionSchema: 'ohac.assertion.v1',
        }),
      );
      expect(statementsMatching(statements, 'FOR UPDATE')).not.toHaveLength(0);
    });

    it('rejects a token that does not match the ohr1 format without any lookup', async () => {
      const { service, statements } = harness(defaultScript());
      const outcome = await service.redeem(
        redeemInput({ token: 'ohr1.not-a-token' }),
      );
      expect(outcome).toEqual({
        status: 'rejected',
        resultCode: OHAC_ERROR_CODE.RECOVERY_BINDING_MISMATCH,
      });
      expect(
        statementsMatching(statements, 'FROM human_auth_recovery_tokens'),
      ).toHaveLength(0);
    });

    it('rejects an unknown token without revealing existence', async () => {
      const { service, statements } = harness(defaultScript({ token: [] }));
      const outcome = await service.redeem(redeemInput());
      expect(outcome).toEqual({
        status: 'rejected',
        resultCode: OHAC_ERROR_CODE.RECOVERY_BINDING_MISMATCH,
      });
      // No DENIED event for a token row that does not exist (the event table
      // requires a real token id).
      expect(
        statementsMatching(
          statements,
          'INSERT INTO human_auth_recovery_events',
        ),
      ).toHaveLength(0);
    });

    it('rejects a revoked token', async () => {
      const { service } = harness(
        defaultScript({ token: [tokenRow({ status: 'REVOKED' })] }),
      );
      const outcome = await service.redeem(redeemInput());
      expect(outcome).toEqual({
        status: 'rejected',
        resultCode: OHAC_ERROR_CODE.RECOVERY_REVOKED,
      });
    });

    it('replays the receipt for the same principal and idempotency key, and rejects a different retry', async () => {
      const requestHash = redemptionRequestHash({
        credentialId: CREDENTIAL,
        terminalId: TERMINAL,
        posBuild: 'pos-build-1',
        policySchema: 'ohac.staff-policy-snapshot.v1',
        assertionSchema: 'ohac.assertion.v1',
      });
      const redeemedRow = tokenRow({
        status: 'REDEEMED',
        idempotency_key: 'idem-1',
        redemption_request_hash: requestHash,
        redeemed_at: new Date('2026-09-28T12:05:00Z'),
      });
      const { service, statements } = harness(
        defaultScript({ token: [redeemedRow] }),
      );
      const replay = await service.redeem(redeemInput());
      expect(replay.status).toBe('replayed');
      if (replay.status === 'replayed') {
        expect(replay.receipt.tokenId).toBe(TOKEN_ID);
      }
      expect(
        statementsMatching(statements, "SET status = 'REDEEMED'"),
      ).toHaveLength(0);

      const conflict = harness(defaultScript({ token: [redeemedRow] }));
      const mismatch = await conflict.service.redeem(
        redeemInput({ idempotencyKey: 'idem-2' }),
      );
      expect(mismatch).toEqual({
        status: 'rejected',
        resultCode: OHAC_ERROR_CODE.RECOVERY_USED,
      });
    });

    it('treats a token at exactly its expiry as expired (boundary: server-issued-at + exactly 15 minutes, design §9)', async () => {
      // Deterministic clock: the token expires exactly at the decision
      // instant. The service must deny with RECOVERY_EXPIRED (the `<=`
      // semantics: a token is dead the moment its 15 minutes are up).
      const decisionInstant = 1_800_000_000_000;
      const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(decisionInstant);
      try {
        const { service } = harness(
          defaultScript({
            token: [tokenRow({ expires_at: new Date(decisionInstant) })],
          }),
        );
        const outcome = await service.redeem(redeemInput());
        expect(outcome).toEqual({
          status: 'rejected',
          resultCode: OHAC_ERROR_CODE.RECOVERY_EXPIRED,
        });
      } finally {
        nowSpy.mockRestore();
      }
    });

    it('still redeems a token one millisecond before its expiry (boundary)', async () => {
      const decisionInstant = 1_800_000_000_000;
      const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(decisionInstant);
      try {
        const { service, statements } = harness(
          defaultScript({
            token: [tokenRow({ expires_at: new Date(decisionInstant + 1) })],
          }),
        );
        const outcome = await service.redeem(redeemInput());
        expect(outcome.status).toBe('redeemed');
        // The expiry check ran but no EXPIRY_OBSERVED event may exist.
        expect(
          statementsMatching(
            statements,
            'INSERT INTO human_auth_recovery_events',
          ).some((e) => e.params?.includes('EXPIRY_OBSERVED')),
        ).toBe(false);
      } finally {
        nowSpy.mockRestore();
      }
    });

    it('rejects an expired token and observes expiry idempotently', async () => {
      const { service, statements } = harness(
        defaultScript({
          token: [tokenRow({ expires_at: new Date(Date.now() - 60 * 1000) })],
        }),
      );
      const outcome = await service.redeem(redeemInput());
      expect(outcome).toEqual({
        status: 'rejected',
        resultCode: OHAC_ERROR_CODE.RECOVERY_EXPIRED,
      });
      const events = statementsMatching(
        statements,
        'INSERT INTO human_auth_recovery_events',
      );
      expect(events.some((e) => e.params.includes('EXPIRY_OBSERVED'))).toBe(
        true,
      );
    });

    it('rejects a redemption for a different terminal (binding mismatch)', async () => {
      const { service } = harness(
        defaultScript({ token: [tokenRow({ terminal_id: 'OTHER-TERMINAL' })] }),
      );
      const outcome = await service.redeem(redeemInput());
      expect(outcome).toEqual({
        status: 'rejected',
        resultCode: OHAC_ERROR_CODE.RECOVERY_BINDING_MISMATCH,
      });
    });

    it('requires transport restoration first when the POS reports TRANSPORT_STATE_MISSING', async () => {
      const { service } = harness(defaultScript());
      const outcome = await service.redeem(
        redeemInput({ integrityClassification: 'TRANSPORT_STATE_MISSING' }),
      );
      expect(outcome).toEqual({
        status: 'rejected',
        resultCode: OHAC_ERROR_CODE.TRANSPORT_RECOVERY_REQUIRED,
      });
    });

    it('validates the cohort/build pair before granting redemption', async () => {
      const noCohort = harness(defaultScript({ cohorts: [] }));
      expect(await noCohort.service.redeem(redeemInput())).toEqual({
        status: 'rejected',
        resultCode: OHAC_ERROR_CODE.COHORT_DISABLED,
      });

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
      expect(await schemaMismatch.service.redeem(redeemInput())).toEqual({
        status: 'rejected',
        resultCode: OHAC_ERROR_CODE.UNSUPPORTED_BUILD,
      });
    });

    it('treats a lost CAS race as a single-use violation with a RACE_LOSS event', async () => {
      const { service, statements } = harness(defaultScript({ cas: [] }));
      const outcome = await service.redeem(redeemInput());
      expect(outcome).toEqual({
        status: 'rejected',
        resultCode: OHAC_ERROR_CODE.RECOVERY_USED,
      });
      const events = statementsMatching(
        statements,
        'INSERT INTO human_auth_recovery_events',
      );
      expect(events.some((e) => e.params.includes('RACE_LOSS'))).toBe(true);
    });

    it('never emits the raw secret, the token, or its HMAC into events or counters', async () => {
      const happy = harness(defaultScript());
      await happy.service.redeem(redeemInput());
      const events = happy.statements.filter((s) =>
        s.sql.includes('INSERT INTO human_auth_recovery_events'),
      );
      const counters = JSON.stringify([...happy.metrics.readCounters().keys()]);
      // The raw secret and the full plaintext token never appear anywhere.
      const serializedAll = JSON.stringify(happy.statements) + counters;
      expect(serializedAll).not.toContain(SECRET);
      expect(serializedAll).not.toContain(`ohr1.${TOKEN_ID}.${SECRET}`);
      // The HMAC is the storage/lookup key by design; it must never leak
      // into the append-only events or the observability counters.
      expect(JSON.stringify(events)).not.toContain(HMAC);
      expect(counters).not.toContain(HMAC);
    });
  });

  describe('revocation', () => {
    it('revokes an unredeemed token idempotently', async () => {
      const { service, statements } = harness(defaultScript());
      const outcome = await service.revoke(revokeInput());
      expect(outcome).toEqual({ status: 'revoked', tokenId: TOKEN_ID });
      expect(
        statementsMatching(statements, "SET status = 'REVOKED'"),
      ).toHaveLength(1);

      const again = harness(
        defaultScript({ token: [tokenRow({ status: 'REVOKED' })] }),
      );
      expect(await again.service.revoke(revokeInput())).toEqual({
        status: 'already-revoked',
        tokenId: TOKEN_ID,
      });
    });

    it('refuses to revoke a redeemed token and reports unknown tokens', async () => {
      const redeemed = harness(
        defaultScript({ token: [tokenRow({ status: 'REDEEMED' })] }),
      );
      expect(await redeemed.service.revoke(revokeInput())).toEqual({
        status: 'rejected',
        resultCode: OHAC_ERROR_CODE.RECOVERY_USED,
        tokenId: TOKEN_ID,
      });

      const unknown = harness(defaultScript({ token: [] }));
      expect(await unknown.service.revoke(revokeInput())).toEqual({
        status: 'not-found',
        tokenId: TOKEN_ID,
      });
    });
  });
});
