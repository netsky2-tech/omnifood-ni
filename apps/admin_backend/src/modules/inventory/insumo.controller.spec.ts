import { DataSource } from 'typeorm';
import { TENANT_CONTEXT_SET_CONFIG_SQL } from '../../core/database/tenant-transaction';
import { InsumoController } from './insumo.controller';
import { Insumo } from './entities/insumo.entity';

describe('InsumoController', () => {
  const insumoRepo = { find: jest.fn() };
  const manager = {
    query: jest.fn(),
    getRepository: jest.fn(() => insumoRepo),
  };
  const dataSource = {
    transaction: jest.fn(
      <T>(cb: (m: typeof manager) => Promise<T>): Promise<T> => cb(manager),
    ),
    // The pooled repository path must stay unused for this route.
    getRepository: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    insumoRepo.find.mockResolvedValue([
      { id: 'ins-1', tenant_id: 'tenant-A', name: 'Arroz', is_active: true },
    ]);
  });

  const buildController = () =>
    new InsumoController(dataSource as unknown as DataSource);

  it('binds app.tenant_id inside one transaction before the first protected read, resolving the repository from that manager', async () => {
    const result = await buildController().list(undefined, 'tenant-A');

    expect(result).toEqual([
      { id: 'ins-1', tenant_id: 'tenant-A', name: 'Arroz', is_active: true },
    ]);
    expect(manager.query).toHaveBeenCalledWith(TENANT_CONTEXT_SET_CONFIG_SQL, [
      'tenant-A',
    ]);
    // Binding order: transaction-local set_config first, then the read,
    // all on the same tenant-bound manager.
    expect(manager.query.mock.invocationCallOrder[0]).toBeLessThan(
      insumoRepo.find.mock.invocationCallOrder[0],
    );
    expect(manager.getRepository).toHaveBeenCalledWith(Insumo);
    expect(insumoRepo.find).toHaveBeenCalledWith({
      where: { tenant_id: 'tenant-A', is_active: true },
      order: { name: 'ASC' },
    });
    // The pooled repository path must never serve this read (issue #512).
    expect(dataSource.getRepository).not.toHaveBeenCalled();
  });

  it('keeps the includeInactive filter and preserves ordering', async () => {
    await buildController().list('true', 'tenant-A');

    expect(insumoRepo.find).toHaveBeenCalledWith({
      where: { tenant_id: 'tenant-A' },
      order: { name: 'ASC' },
    });
  });

  it('fails closed without a tenant id before any SQL', async () => {
    await expect(buildController().list(undefined, undefined)).rejects.toThrow(
      'Tenant context is required',
    );
    // A blank tenant id is rejected by the requireTenant guard before any
    // SQL is issued, so no transaction and no query ever runs.
    await expect(buildController().list(undefined, '')).rejects.toThrow(
      'Tenant context is required',
    );
    // Defense in depth: the binding helper would also reject a blank id
    // (TENANT_CONTEXT_REQUIRED) before borrowing a connection.
    expect(dataSource.transaction).not.toHaveBeenCalled();
    expect(manager.query).not.toHaveBeenCalled();
    expect(insumoRepo.find).not.toHaveBeenCalled();
  });
});
