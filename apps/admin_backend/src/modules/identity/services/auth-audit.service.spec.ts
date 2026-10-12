import { Logger } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { AuditLog } from '../entities/audit-log.entity';
import { runInTenantTransaction } from '../../../core/database/tenant-transaction';
import {
  AUTH_AUDIT_DEVICE,
  AuthAuditService,
  LoginAuditReason,
} from './auth-audit.service';

// The mocked transaction helper hands the callback a manager bound to the
// tenant id; the manager exposes whichever repository the current test set
// in mockState (jest only allows out-of-scope refs prefixed with `mock`).
const mockState: { repo?: unknown; lastManager?: unknown } = {
  repo: undefined,
};

jest.mock('../../../core/database/tenant-transaction', () => ({
  runInTenantTransaction: jest.fn(
    async (
      _dataSource: unknown,
      tenantId: string,
      fn: (manager: unknown) => Promise<void>,
    ) => {
      const manager = {
        __tenantId: tenantId,
        getRepository: () => mockState.repo,
      };
      mockState.lastManager = manager;
      return fn(manager);
    },
  ),
}));

const lastRow = {
  sequence_no: 7,
  entry_hash: 'prev-entry-hash',
};

function buildService(repoOverride?: Record<string, unknown>) {
  const saved: AuditLog[] = [];
  const repo = {
    findOne: jest.fn(async () => lastRow),
    save: jest.fn(async (row: AuditLog) => {
      saved.push(row);
      return row;
    }),
    ...(repoOverride ?? {}),
  };

  const service = new AuthAuditService(
    repo as never,
    { query: jest.fn() } as never,
  );
  mockState.repo = repo;
  return { service, saved, repo };
}

function capturedTenant(manager: unknown): string {
  return (manager as { __tenantId?: string }).__tenantId ?? '';
}

afterEach(() => {
  jest.restoreAllMocks();
});

beforeEach(() => {
  // Call-count assertions must be per test, not per file.
  (runInTenantTransaction as jest.Mock).mockClear();
});

describe('AuthAuditService', () => {
  it('writes a hash-chained LOGIN_SUCCESS row on the WEB_ADMIN device chain', async () => {
    const { service, saved } = buildService();
    await service.recordLoginSuccess('tenant-1', 'user-1');

    expect(saved).toHaveLength(1);
    const row = saved[0];
    expect(row.action).toBe('LOGIN_SUCCESS');
    expect(row.tenant_id).toBe('tenant-1');
    expect(row.user_id).toBe('user-1');
    expect(row.device_id).toBe(AUTH_AUDIT_DEVICE);
    expect(row.sequence_no).toBe(8);
    expect(row.prev_hash).toBe('prev-entry-hash');
    expect(row.entry_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.forensic_status).toBe('ACTIVE');
  });

  it('derives entry_hash from the canonical hash-chained payload', async () => {
    const { service, saved } = buildService();
    const crypto = jest.requireActual('crypto');
    await service.recordLoginSuccess('tenant-1', 'user-1');

    const row = saved[0];
    const timestamp = (row.metadata as { timestamp: string }).timestamp;
    const expected = crypto
      .createHash('sha256')
      .update(
        `user-1|LOGIN_SUCCESS|${AUTH_AUDIT_DEVICE}|${timestamp}|8|prev-entry-hash|null|null|${JSON.stringify(row.metadata)}`,
      )
      .digest('hex');
    expect(row.entry_hash).toBe(expected);
  });

  it('records a failed login with a reason and never with credential material', async () => {
    const { service, saved } = buildService();
    await service.recordAuthFailure({
      action: 'LOGIN_FAILURE',
      tenantId: 'tenant-1',
      userId: 'user-1',
      email: 'Owner@Example.com',
      reason: LoginAuditReason.WRONG_PASSWORD,
      pass: 'super-secret-passphrase',
    });

    const row = saved[0];
    expect(row.action).toBe('LOGIN_FAILURE');
    expect(row.tenant_id).toBe('tenant-1');
    expect(JSON.stringify(row.metadata)).toContain('wrong_password');
    expect(JSON.stringify(row.metadata)).toContain('owner@example.com');
    expect(JSON.stringify(row.metadata)).not.toContain('super-secret-passphrase');
  });

  it('falls back to the logger (no DB row) when no tenant anchor exists', async () => {
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const { service, saved } = buildService();
    await service.recordAuthFailure({
      action: 'LOGIN_FAILURE',
      tenantId: null,
      userId: null,
      email: 'ghost@example.com',
      reason: LoginAuditReason.UNKNOWN_TENANT,
    });

    expect(saved).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('ghost@example.com'),
      AuthAuditService.name,
    );
  });

  it('falls back to the logger when the user cannot be identified', async () => {
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const { service, saved } = buildService();
    await service.recordAuthFailure({
      action: 'REFRESH_FAILURE',
      tenantId: 'tenant-1',
      userId: null,
      reason: LoginAuditReason.UNKNOWN_USER,
    });

    expect(saved).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalled();
  });

  it('opens its own tenant-bound transaction when no manager is supplied', async () => {
    const { service, saved } = buildService();
    await service.recordLoginSuccess('tenant-9', 'user-9');

    expect(saved[0].tenant_id).toBe('tenant-9');
    // runInTenantTransaction was invoked (mocked) with the tenant id.
    const { runInTenantTransaction } = jest.requireMock(
      '../../../core/database/tenant-transaction',
    ) as { runInTenantTransaction: jest.Mock };
    expect(runInTenantTransaction).toHaveBeenCalled();
    const calls = runInTenantTransaction.mock.calls as unknown[][];
    expect(calls.length).toBeGreaterThan(0);
    // The manager handed to the callback carries the bound tenant id.
    expect(capturedTenant(mockState.lastManager)).toBe('tenant-9');
  });

  it('reuses a supplied transaction manager instead of opening a new one', async () => {
    const { service, saved, repo } = buildService();
    const manager = { getRepository: () => repo } as unknown as EntityManager;
    await service.recordLoginSuccess('tenant-2', 'user-2', manager);

    expect(saved).toHaveLength(1);
    const { runInTenantTransaction } = jest.requireMock(
      '../../../core/database/tenant-transaction',
    ) as { runInTenantTransaction: jest.Mock };
    expect(runInTenantTransaction).not.toHaveBeenCalled();
  });

  it('records refresh success rows', async () => {
    const { service, saved } = buildService();
    await service.recordRefreshSuccess('tenant-1', 'user-1');
    expect(saved[0].action).toBe('REFRESH_SUCCESS');
  });

  it('never fails the auth flow when the audit write itself fails', async () => {
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const { service } = buildService({
      findOne: async () => lastRow,
      save: async () => {
        throw new Error('audit storage down');
      },
    });

    await expect(
      service.recordLoginSuccess('tenant-1', 'user-1'),
    ).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalled();
  });
});
