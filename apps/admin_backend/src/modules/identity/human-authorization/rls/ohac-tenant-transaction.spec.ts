import { UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource, EntityManager } from 'typeorm';
import { OhacTenantTransaction } from './ohac-tenant-transaction';

describe('OhacTenantTransaction', () => {
  let service: OhacTenantTransaction;
  let query: jest.Mock<Promise<unknown>, unknown[]>;
  let transaction: jest.Mock;
  let txManager: EntityManager;

  beforeEach(async () => {
    query = jest.fn<Promise<unknown>, unknown[]>().mockResolvedValue([]);
    txManager = { query } as unknown as EntityManager;
    transaction = jest.fn(
      async (cb: (mgr: EntityManager) => Promise<unknown>) => cb(txManager),
    );

    const module = await Test.createTestingModule({
      providers: [
        OhacTenantTransaction,
        { provide: DataSource, useValue: { transaction } },
      ],
    }).compile();

    service = module.get(OhacTenantTransaction);
  });

  it('issues the RLS binding statement as the first statement, before any callback statement', async () => {
    const callOrder: string[] = [];
    query.mockImplementation(async (statement: string) => {
      callOrder.push(statement);
      return [];
    });

    await service.run('tenant-1', async (manager) => {
      await manager.query('SELECT 1');
      callOrder.push('callback-statement');
      return null;
    });

    expect(query).toHaveBeenCalledWith(
      "SELECT set_config('app.tenant_id', $1, true)",
      ['tenant-1'],
    );
    expect(callOrder).toEqual([
      "SELECT set_config('app.tenant_id', $1, true)",
      'SELECT 1',
      'callback-statement',
    ]);
  });

  it('passes the tenant value as a query parameter and never interpolates it', async () => {
    const hostileTenant = "t'; DROP TABLE users; --";

    await service.run(hostileTenant, async () => null);

    const [statement, params] = query.mock.calls[0];
    expect(statement).toBe("SELECT set_config('app.tenant_id', $1, true)");
    expect(statement).not.toContain(hostileTenant);
    expect(params).toEqual([hostileTenant]);
  });

  it.each([undefined, null, '', '   ', 42])(
    'rejects tenant id %p without opening a transaction',
    async (badTenant) => {
      await expect(service.run(badTenant, async () => null)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(transaction).not.toHaveBeenCalled();
      expect(query).not.toHaveBeenCalled();
    },
  );

  it('propagates a binding failure and never runs the callback', async () => {
    query.mockRejectedValue(new Error('set_config failed'));
    const work = jest.fn();

    await expect(service.run('tenant-1', work)).rejects.toThrow(
      'set_config failed',
    );
    expect(work).not.toHaveBeenCalled();
  });

  it('returns the callback result unchanged', async () => {
    const result = await service.run('tenant-1', async () => ({ ok: true }));

    expect(result).toEqual({ ok: true });
  });

  it('runs the callback inside the same manager the binding statement used', async () => {
    const managersSeen: EntityManager[] = [];

    await service.run('tenant-1', async (manager) => {
      managersSeen.push(manager);
      return null;
    });

    expect(managersSeen).toEqual([txManager]);
  });
});
