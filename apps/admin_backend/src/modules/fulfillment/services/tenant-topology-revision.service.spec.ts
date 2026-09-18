import { DataSource } from 'typeorm';
import { TenantTopologyRevisionService } from './tenant-topology-revision.service';

describe('TenantTopologyRevisionService (unit)', () => {
  const topology = (deviceId: string) => ({
    operationMode: 'FOOD_PARK',
    channels: ['KDS_AND_PRINT'],
    devices: [
      {
        deviceId,
        roles: ['CASHIER', 'KITCHEN'],
        capabilities: ['KDS', 'PRINT'],
      },
    ],
  });

  it('rejects a blank tenant id (Unit 0b-3) before any runner or set_config SQL exists', async () => {
    const runner = {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      query: jest.fn(),
    };
    const dataSource = {
      createQueryRunner: jest.fn(() => runner),
    } as unknown as DataSource;
    const service = new TenantTopologyRevisionService(dataSource);

    for (const blankTenantId of ['', '   ']) {
      await expect(service.current(blankTenantId)).rejects.toThrow(
        'tenantId must not be blank',
      );
      await expect(
        service.create({
          tenantId: blankTenantId,
          baseRevision: 0,
          contractVersion: 1,
          topology: topology('device-a'),
          hash: 'hash-a',
        }),
      ).rejects.toThrow('tenantId must not be blank');

      // Absence of SQL, not just the rejection: a blank tenant id must never
      // reach set_config — not even a query runner may be borrowed for it.
      expect(dataSource.createQueryRunner).not.toHaveBeenCalled();
      expect(runner.query).not.toHaveBeenCalled();
    }
  });

  it('binds the tenant context through the shared guard before reading revisions', async () => {
    const callOrder: string[] = [];
    const runner = {
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
      query: jest.fn().mockImplementation(async (sql: string) => {
        if (sql.includes('set_config')) {
          callOrder.push('set_config');
          return [];
        }
        if (sql.startsWith('SELECT tenant_id')) {
          callOrder.push('readCurrent');
          return [];
        }
        return [];
      }),
    };
    const dataSource = {
      createQueryRunner: jest.fn(() => runner),
    } as unknown as DataSource;
    const service = new TenantTopologyRevisionService(dataSource);

    await expect(service.current('tenant-a')).resolves.toEqual({
      provisioned: false,
      revision: 0,
    });

    expect(runner.query).toHaveBeenCalledWith(
      "SELECT set_config('app.tenant_id', $1, true)",
      ['tenant-a'],
    );
    expect(callOrder).toEqual(['set_config', 'readCurrent']);
    expect(runner.commitTransaction).toHaveBeenCalled();
    expect(runner.release).toHaveBeenCalled();
  });
});
