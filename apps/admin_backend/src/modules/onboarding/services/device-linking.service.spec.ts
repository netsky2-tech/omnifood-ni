import * as bcrypt from 'bcrypt';
import { UnauthorizedException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import {
  CLAIM_LINKING_CODE_SQL,
  CLEANUP_EXPIRED_LINKING_CODES_SQL,
  DEFAULT_LINKING_EXPIRY_MINUTES,
  DeviceLinkingService,
  LINKING_CODE_ALPHABET,
  LINKING_CODE_GENERIC_FAILURE,
  LINKING_CODE_LENGTH,
  generateLinkingCodeValue,
  isCanonicalLinkingCode,
  normalizeLinkingCode,
} from './device-linking.service';
import {
  DeviceLinkingCodeStatus,
  DeviceLinkingCode,
} from '../entities/device-linking-code.entity';

/**
 * Unit contract for the pre-auth device linking service (issue #556 stage 3).
 *
 * The claim path is a bounded cross-tenant scan made possible by the reviewed
 * transaction-local claim branch (founder approval 2026-09-24): the service
 * sets `app.linking_claim` with set_config local to the claim transaction and
 * never accepts it from the client. All failure shapes collapse into ONE
 * generic error (no enumeration, no timing side channel beyond the bounded
 * candidate set), and single-use is enforced by a conditional UPDATE at the
 * SQL level, never by a read-then-write status check.
 */

type RoutedQuery = {
  match: RegExp;
  result: unknown[] | ((parameters: unknown[]) => unknown[]);
};

const buildManager = (routes: RoutedQuery[]) => {
  const query = jest.fn(async (sql: string, parameters?: unknown[]) => {
    for (const route of routes) {
      if (route.match.test(sql)) {
        const result =
          typeof route.result === 'function'
            ? route.result(parameters ?? [])
            : route.result;
        return result;
      }
    }
    throw new Error(`Unexpected query in test: ${sql}`);
  });
  const getRepository = jest.fn(() => ({
    insert: jest.fn(async () => undefined),
  }));
  return {
    manager: { query, getRepository } as unknown as EntityManager,
    query,
  };
};

// Every generation transaction also runs the opportunistic expiry cleanup
// (review finding F2), so the shared stub routes it by default.
const CLEANUP_ROUTE: RoutedQuery = {
  match: /DELETE FROM device_linking_codes/,
  result: [],
};

const buildDataSource = (manager: EntityManager): DataSource =>
  ({
    transaction: jest.fn(async (cb: (m: EntityManager) => Promise<unknown>) =>
      cb(manager),
    ),
  }) as unknown as DataSource;

const SET_CONFIG = /set_config\('app\.linking_claim'/;
const SELECT_CANDIDATES =
  /SELECT id, code_hash, tenant_id FROM device_linking_codes/;
const CLAIM_UPDATE = /UPDATE device_linking_codes SET status = 'CLAIMED'/;
const SELECT_SLUG = /SELECT slug FROM tenants WHERE id = \$1/;
const BIND_TENANT = /set_config\('app\.tenant_id'/;

describe('linking code value helpers', () => {
  it('uses an unambiguous 6-character alphabet (no 0 O 1 I L)', () => {
    expect(LINKING_CODE_LENGTH).toBe(6);
    expect(LINKING_CODE_ALPHABET).not.toMatch(/[0O1IL]/);
    expect(new Set(LINKING_CODE_ALPHABET).size).toBe(
      LINKING_CODE_ALPHABET.length,
    );
  });

  it('generates codes only from the alphabet', () => {
    for (let i = 0; i < 50; i++) {
      const code = generateLinkingCodeValue();
      expect(code).toHaveLength(LINKING_CODE_LENGTH);
      for (const char of code) {
        expect(LINKING_CODE_ALPHABET).toContain(char);
      }
    }
  });

  it('normalizes case and strips non-alphanumerics', () => {
    expect(normalizeLinkingCode(' ab-cd 23 ')).toBe('ABCD23');
    expect(normalizeLinkingCode('wq9x7k')).toBe('WQ9X7K');
    expect(normalizeLinkingCode('')).toBe('');
  });

  it('rejects canonical checks for ambiguous or short values', () => {
    expect(isCanonicalLinkingCode('ABCDE0')).toBe(false);
    expect(isCanonicalLinkingCode('ABCD2')).toBe(false);
    expect(isCanonicalLinkingCode('ABCD2O')).toBe(false);
    expect(isCanonicalLinkingCode('ABCD23')).toBe(true);
  });
});

describe('DeviceLinkingService.generateLinkingCode', () => {
  it('stores only the bcrypt hash, binds tenant context, and returns the plaintext once', async () => {
    const { manager, query } = buildManager([
      { match: BIND_TENANT, result: [] },
      CLEANUP_ROUTE,
    ]);
    const service = new DeviceLinkingService(buildDataSource(manager));

    const result = await service.generateLinkingCode('tenant-1', 'user-9', {
      expiryMinutes: 5,
    });

    expect(result.code).toHaveLength(LINKING_CODE_LENGTH);
    expect(isCanonicalLinkingCode(result.code)).toBe(true);

    const repo = (manager as unknown as { getRepository: jest.Mock })
      .getRepository.mock.results[0].value;
    expect(repo.insert).toHaveBeenCalledTimes(1);
    const payload = repo.insert.mock.calls[0][0] as Partial<DeviceLinkingCode>;
    expect(payload.tenantId).toBe('tenant-1');
    expect(payload.createdByUserId).toBe('user-9');
    expect(payload.status).toBe(DeviceLinkingCodeStatus.ACTIVE);
    expect(payload.codeHash).not.toBe(result.code);
    expect(payload.codeHash).toMatch(/^\$2[aby]\$10\$/);
    expect(payload.expiresAt?.getTime()).toBeGreaterThan(
      Date.now() + 4 * 60_000,
    );

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("set_config('app.tenant_id'"),
      ['tenant-1'],
    );
  });

  it('defaults the expiry to 15 minutes', async () => {
    const { manager } = buildManager([
      { match: BIND_TENANT, result: [] },
      CLEANUP_ROUTE,
    ]);
    const service = new DeviceLinkingService(buildDataSource(manager));

    const before = Date.now();
    await service.generateLinkingCode('tenant-1', 'user-9');
    const repo = (manager as unknown as { getRepository: jest.Mock })
      .getRepository.mock.results[0].value;
    const payload = repo.insert.mock.calls[0][0] as Partial<DeviceLinkingCode>;
    const expected = before + DEFAULT_LINKING_EXPIRY_MINUTES * 60_000;
    expect(payload.expiresAt?.getTime()).toBeGreaterThanOrEqual(expected);
    expect(payload.expiresAt?.getTime()).toBeLessThanOrEqual(expected + 2_000);
  });

  it('rejects out-of-range expiry minutes', async () => {
    const { manager } = buildManager([
      { match: BIND_TENANT, result: [] },
      CLEANUP_ROUTE,
    ]);
    const service = new DeviceLinkingService(buildDataSource(manager));

    await expect(
      service.generateLinkingCode('tenant-1', 'user-9', { expiryMinutes: 0 }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      service.generateLinkingCode('tenant-1', 'user-9', {
        expiryMinutes: 100000,
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('runs the opportunistic expiry cleanup inside the generation transaction', async () => {
    const { manager, query } = buildManager([
      { match: BIND_TENANT, result: [] },
      CLEANUP_ROUTE,
    ]);
    const service = new DeviceLinkingService(buildDataSource(manager));

    await service.generateLinkingCode('tenant-1', 'user-9');

    expect(query).toHaveBeenCalledWith(CLEANUP_EXPIRED_LINKING_CODES_SQL);
    // The cleanup runs after the tenant bind (the pure-tenant DELETE policy
    // requires the bound context) and before the insert.
    const bindCall = query.mock.calls.findIndex((call) =>
      String(call[0]).includes("set_config('app.tenant_id'"),
    );
    const cleanupCall = query.mock.calls.findIndex(
      (call) => call[0] === CLEANUP_EXPIRED_LINKING_CODES_SQL,
    );
    const insertCallOrder = (
      (manager as unknown as { getRepository: jest.Mock }).getRepository.mock
        .results[0].value as { insert: jest.Mock }
    ).insert.mock.invocationCallOrder[0];
    expect(bindCall).toBeGreaterThanOrEqual(0);
    expect(cleanupCall).toBeGreaterThan(bindCall);
    expect(insertCallOrder).toBeGreaterThan(
      query.mock.invocationCallOrder[cleanupCall],
    );
  });

  it('regenerates deterministically when the plaintext collides with an ACTIVE code', async () => {
    const uniqueViolation = Object.assign(
      new Error(
        'duplicate key value violates unique constraint "uq_device_linking_codes_active_hash"',
      ),
      { code: '23505', constraint: 'uq_device_linking_codes_active_hash' },
    );
    let insertAttempts = 0;
    const insert = jest.fn(async () => {
      insertAttempts += 1;
      if (insertAttempts === 1) {
        throw uniqueViolation;
      }
    });
    const query = jest.fn(async () => []);
    const manager = {
      query,
      getRepository: jest.fn(() => ({ insert })),
    } as unknown as EntityManager;
    const service = new DeviceLinkingService(buildDataSource(manager));

    const result = await service.generateLinkingCode('tenant-1', 'user-9');

    expect(isCanonicalLinkingCode(result.code)).toBe(true);
    expect(insertAttempts).toBe(2);
    // Each attempt re-binds the tenant context inside its own transaction.
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("set_config('app.tenant_id'"),
      ['tenant-1'],
    );
  });

  it('gives up with a conflict after the bounded regeneration budget', async () => {
    const uniqueViolation = Object.assign(new Error('duplicate key'), {
      code: '23505',
    });
    const insert = jest.fn(async () => {
      throw uniqueViolation;
    });
    const manager = {
      query: jest.fn(async () => []),
      getRepository: jest.fn(() => ({ insert })),
    } as unknown as EntityManager;
    const service = new DeviceLinkingService(buildDataSource(manager));

    await expect(
      service.generateLinkingCode('tenant-1', 'user-9'),
    ).rejects.toMatchObject({ status: 409 });
    expect(insert).toHaveBeenCalledTimes(5);
  });

  it('propagates non-unique-violation insert errors', async () => {
    const insert = jest.fn(async () => {
      throw Object.assign(new Error('connection refused'), {
        code: 'ECONNREFUSED',
      });
    });
    const manager = {
      query: jest.fn(async () => []),
      getRepository: jest.fn(() => ({ insert })),
    } as unknown as EntityManager;
    const service = new DeviceLinkingService(buildDataSource(manager));

    await expect(
      service.generateLinkingCode('tenant-1', 'user-9'),
    ).rejects.toThrow('connection refused');
    expect(insert).toHaveBeenCalledTimes(1);
  });
});

describe('DeviceLinkingService.claimCode', () => {
  const CODE = 'ABCD23';
  const CODE_HASH_PROMISE = bcrypt.hash(CODE, 10);

  it('claims atomically and returns the persisted tenant slug', async () => {
    const codeHash = await CODE_HASH_PROMISE;
    const { manager, query } = buildManager([
      { match: SET_CONFIG, result: [] },
      {
        match: SELECT_CANDIDATES,
        result: [{ id: 'code-1', code_hash: codeHash, tenant_id: 'tenant-1' }],
      },
      { match: CLAIM_UPDATE, result: [{ tenant_id: 'tenant-1' }] },
      { match: SELECT_SLUG, result: [{ slug: 'mi-puesto' }] },
    ]);
    const service = new DeviceLinkingService(buildDataSource(manager));

    const result = await service.claimCode(' ab-cd 23 ', 'POS-01');

    expect(result).toEqual({
      tenantId: 'tenant-1',
      slug: 'mi-puesto',
      deviceId: 'POS-01',
      linkedAt: expect.any(Date),
    });
    expect(query).toHaveBeenCalledWith(SET_CONFIG_TEST_BIND, ['on']);
    expect(query).toHaveBeenCalledWith(CLAIM_LINKING_CODE_SQL, [
      'code-1',
      'POS-01',
    ]);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('SELECT slug FROM tenants'),
      ['tenant-1'],
    );
  });

  it('lowercases input through normalization before comparing', async () => {
    const codeHash = await CODE_HASH_PROMISE;
    const { manager, query } = buildManager([
      { match: SET_CONFIG, result: [] },
      {
        match: SELECT_CANDIDATES,
        result: [{ id: 'code-1', code_hash: codeHash, tenant_id: 'tenant-1' }],
      },
      { match: CLAIM_UPDATE, result: [{ tenant_id: 'tenant-1' }] },
      { match: SELECT_SLUG, result: [{ slug: 'mi-puesto' }] },
    ]);
    const service = new DeviceLinkingService(buildDataSource(manager));

    await service.claimCode('abcd23', 'POS-01');
    expect(query).toHaveBeenCalledWith(CLAIM_LINKING_CODE_SQL, [
      'code-1',
      'POS-01',
    ]);
  });

  it('fails generically for an unknown code (no candidates)', async () => {
    const { manager, query } = buildManager([
      { match: SET_CONFIG, result: [] },
      { match: SELECT_CANDIDATES, result: [] },
    ]);
    const service = new DeviceLinkingService(buildDataSource(manager));

    await expect(service.claimCode(CODE, 'POS-01')).rejects.toThrow(
      new UnauthorizedException(LINKING_CODE_GENERIC_FAILURE),
    );
    expect(query).not.toHaveBeenCalledWith(
      CLAIM_LINKING_CODE_SQL,
      expect.anything(),
    );
  });

  it('fails generically for expired, claimed, and revoked codes (they are never candidates)', async () => {
    // Expired/claimed/revoked rows never satisfy the candidate SELECT
    // (status = 'ACTIVE' AND expires_at > now()), so they take the same
    // single generic path as an unknown code.
    const { manager } = buildManager([
      { match: SET_CONFIG, result: [] },
      { match: SELECT_CANDIDATES, result: [] },
    ]);
    const service = new DeviceLinkingService(buildDataSource(manager));

    for (const raw of [CODE]) {
      await expect(service.claimCode(raw, 'POS-01')).rejects.toThrow(
        LINKING_CODE_GENERIC_FAILURE,
      );
    }
  });

  it('fails generically for malformed codes without touching the database', async () => {
    const { manager, query } = buildManager([]);
    const service = new DeviceLinkingService(buildDataSource(manager));

    await expect(service.claimCode('ABCDE0', 'POS-01')).rejects.toThrow(
      LINKING_CODE_GENERIC_FAILURE,
    );
    await expect(service.claimCode('ABC', 'POS-01')).rejects.toThrow(
      LINKING_CODE_GENERIC_FAILURE,
    );
    await expect(service.claimCode(CODE, '  ')).rejects.toThrow(
      LINKING_CODE_GENERIC_FAILURE,
    );
    expect(query).not.toHaveBeenCalled();
  });

  it('enforces single-use at the SQL level: the lost race fails generically', async () => {
    const codeHash = await CODE_HASH_PROMISE;
    let updateCalls = 0;
    const { manager } = buildManager([
      { match: SET_CONFIG, result: [] },
      {
        match: SELECT_CANDIDATES,
        result: [{ id: 'code-1', code_hash: codeHash, tenant_id: 'tenant-1' }],
      },
      {
        match: CLAIM_UPDATE,
        result: () => {
          updateCalls += 1;
          // First claim wins; the concurrent second claim re-evaluates the
          // conditional UPDATE after the winner committed and matches 0 rows.
          return updateCalls === 1 ? [{ tenant_id: 'tenant-1' }] : [];
        },
      },
      { match: SELECT_SLUG, result: [{ slug: 'mi-puesto' }] },
    ]);
    const service = new DeviceLinkingService(buildDataSource(manager));

    const [first, second] = await Promise.allSettled([
      service.claimCode(CODE, 'POS-01'),
      service.claimCode(CODE, 'POS-02'),
    ]);

    const wins = [first, second].filter(
      (r) => r.status === 'fulfilled',
    ) as PromiseFulfilledResult<unknown>[];
    const losses = [first, second].filter((r) => r.status === 'rejected');
    expect(wins).toHaveLength(1);
    expect(losses).toHaveLength(1);
    expect((losses[0].reason as UnauthorizedException).message).toBe(
      LINKING_CODE_GENERIC_FAILURE,
    );
    expect(updateCalls).toBe(2);
  });
});

// The exact claim-flag bind the service must issue: transaction-local
// set_config, never read from client input.
const SET_CONFIG_TEST_BIND = "SELECT set_config('app.linking_claim', $1, true)";
