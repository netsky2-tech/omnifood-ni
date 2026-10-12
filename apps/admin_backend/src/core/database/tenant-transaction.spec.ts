import { DataSource, EntityManager, QueryRunner } from 'typeorm';
import {
  bindTenantContext,
  resolveTenantContextId,
  runInTenantTransaction,
  TENANT_CONTEXT_SET_CONFIG_SQL,
  TenantContextRequiredError,
} from './tenant-transaction';

describe('bindTenantContext — transaction-local tenant binding', () => {
  let manager: { query: jest.Mock };

  beforeEach(() => {
    manager = { query: jest.fn().mockResolvedValue(undefined) };
  });

  const asManager = () => manager as unknown as EntityManager;

  it('executes exactly SELECT set_config(app.tenant_id, $1, true) with a parameterized tenant id', async () => {
    await bindTenantContext(asManager(), 'tenant-a');

    expect(manager.query).toHaveBeenCalledTimes(1);
    expect(manager.query).toHaveBeenCalledWith(TENANT_CONTEXT_SET_CONFIG_SQL, [
      'tenant-a',
    ]);
    // Guard the contract: tenant id is always a bound parameter, never interpolated.
    expect(TENANT_CONTEXT_SET_CONFIG_SQL).toBe(
      "SELECT set_config('app.tenant_id', $1, true)",
    );
  });

  it('trims the tenant id before binding', async () => {
    await bindTenantContext(asManager(), '  tenant-a  ');

    expect(manager.query).toHaveBeenCalledWith(TENANT_CONTEXT_SET_CONFIG_SQL, [
      'tenant-a',
    ]);
  });

  it.each(['', '   ', ' \t '])(
    'rejects blank tenant id %p before issuing any SQL',
    async (blank) => {
      await expect(bindTenantContext(asManager(), blank)).rejects.toThrow(
        TenantContextRequiredError,
      );
      expect(manager.query).not.toHaveBeenCalled();
    },
  );

  it('resolves only after the set_config query completes (ordering)', async () => {
    let releaseQuery: (() => void) | undefined;
    manager.query.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          releaseQuery = resolve;
        }),
    );

    let settled = false;
    const bound = bindTenantContext(asManager(), 'tenant-a');
    void bound.then(() => {
      settled = true;
    });

    await Promise.resolve();
    expect(manager.query).toHaveBeenCalledTimes(1);
    expect(settled).toBe(false);

    releaseQuery?.();
    await bound;
    expect(settled).toBe(true);
  });
});

describe('bindTenantContext — widened executor shapes', () => {
  let executor: { query: jest.Mock };

  beforeEach(() => {
    executor = { query: jest.fn().mockResolvedValue(undefined) };
  });

  const asManager = () => executor as unknown as EntityManager;
  const asQueryRunner = () => executor as unknown as QueryRunner;

  it.each([
    ['EntityManager', asManager],
    ['QueryRunner', asQueryRunner],
  ])('rejects a blank tenant id without issuing SQL through %s', async (_, cast) => {
    await expect(bindTenantContext(cast(), '')).rejects.toThrow(
      TenantContextRequiredError,
    );
    expect(executor.query).not.toHaveBeenCalled();
  });

  it.each([
    ['EntityManager', asManager],
    ['QueryRunner', asQueryRunner],
  ])('rejects a whitespace-only tenant id without issuing SQL through %s', async (_, cast) => {
    await expect(bindTenantContext(cast(), '  \t  ')).rejects.toThrow(
      TenantContextRequiredError,
    );
    expect(executor.query).not.toHaveBeenCalled();
  });

  it('binds a valid tenant id through a QueryRunner with the same parameterised SQL as through a manager', async () => {
    await bindTenantContext(asQueryRunner(), 'tenant-a');

    expect(executor.query).toHaveBeenCalledTimes(1);
    expect(executor.query).toHaveBeenCalledWith(TENANT_CONTEXT_SET_CONFIG_SQL, [
      'tenant-a',
    ]);
  });
});

describe('resolveTenantContextId', () => {
  it('rejects blank tenant ids', () => {
    expect(() => resolveTenantContextId('   ')).toThrow(
      TenantContextRequiredError,
    );
    expect(() =>
      resolveTenantContextId(undefined as unknown as string),
    ).toThrow(TenantContextRequiredError);
  });

  it('returns the trimmed tenant id', () => {
    expect(resolveTenantContextId(' tenant-a ')).toBe('tenant-a');
  });
});

describe('runInTenantTransaction', () => {
  it('binds tenant context on the transaction manager before running work', async () => {
    const order: string[] = [];
    const manager = {
      query: jest.fn(async () => {
        order.push('set_config');
      }),
    };
    const dataSource = {
      transaction: jest.fn(async (cb: (m: unknown) => Promise<unknown>) =>
        cb(manager),
      ),
    };

    const result = await runInTenantTransaction(
      dataSource as unknown as DataSource,
      'tenant-a',
      async (m) => {
        order.push('work');
        expect(m).toBe(manager);
        return 'work-result';
      },
    );

    expect(result).toBe('work-result');
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(order).toEqual(['set_config', 'work']);
  });

  it('binds before work even when work fails, and propagates the rejection', async () => {
    const manager = { query: jest.fn().mockResolvedValue(undefined) };
    const dataSource = {
      transaction: jest.fn(async (cb: (m: unknown) => Promise<unknown>) =>
        cb(manager),
      ),
    };

    await expect(
      runInTenantTransaction(
        dataSource as unknown as DataSource,
        'tenant-a',
        async () => {
          throw new Error('work failed');
        },
      ),
    ).rejects.toThrow('work failed');

    // set_config was awaited before the failing work executed.
    expect(manager.query).toHaveBeenCalledTimes(1);
  });

  it('rejects a blank tenant id without opening a transaction', async () => {
    const dataSource = { transaction: jest.fn() };

    await expect(
      runInTenantTransaction(
        dataSource as unknown as DataSource,
        '   ',
        jest.fn(),
      ),
    ).rejects.toThrow(TenantContextRequiredError);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });
});
