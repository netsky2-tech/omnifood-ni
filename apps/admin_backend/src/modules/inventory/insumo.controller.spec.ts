import { DataSource } from 'typeorm';
import { TENANT_CONTEXT_SET_CONFIG_SQL } from '../../core/database/tenant-transaction';
import { InsumoController } from './insumo.controller';
import { Insumo } from './entities/insumo.entity';

describe('InsumoController', () => {
  const insumoRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn((val: unknown) => val),
    save: jest.fn(async (val: unknown) => ({ id: 'new-id', ...(val as object) })),
  };
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
    insumoRepo.findOne.mockResolvedValue(null);
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

  describe('create (POST /insumos)', () => {
    const validDto = {
      name: 'Café Grano',
      purchaseUom: 'LB',
      consumptionUom: 'G',
      conversionFactor: 454,
      parLevel: 5000,
      minStock: 1000,
      averageCost: 350,
    };

    it('creates an insumo bound to the tenant transaction', async () => {
      insumoRepo.findOne.mockResolvedValue(null);

      const result = await buildController().create(validDto, 'tenant-A');

      expect(result).toMatchObject({
        tenant_id: 'tenant-A',
        name: 'Café Grano',
        purchaseUom: 'LB',
        consumptionUom: 'G',
        conversionFactor: 454,
        is_active: true,
      });
      expect(insumoRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: 'tenant-A',
          name: 'Café Grano',
          conversionFactor: 454,
        }),
      );
      expect(insumoRepo.save).toHaveBeenCalled();
    });

    it('throws ConflictException when insumo name already exists for tenant', async () => {
      insumoRepo.findOne.mockResolvedValue({
        id: 'existing-id',
        name: 'Café Grano',
      });

      await expect(
        buildController().create(validDto, 'tenant-A'),
      ).rejects.toThrow(/Ya existe un insumo con el nombre/);

      expect(insumoRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('update (PUT /insumos/:id)', () => {
    it('updates an existing insumo fields', async () => {
      insumoRepo.findOne.mockResolvedValue({
        id: 'ins-1',
        tenant_id: 'tenant-A',
        name: 'Leche',
        purchaseUom: 'L',
        consumptionUom: 'ML',
        conversionFactor: 1000,
      });

      const result = await buildController().update(
        'ins-1',
        { parLevel: 20000, averageCost: 55 },
        'tenant-A',
      );

      expect(result).toMatchObject({
        parLevel: 20000,
        averageCost: 55,
      });
      expect(insumoRepo.save).toHaveBeenCalled();
    });

    it('throws NotFoundException when insumo is not found for tenant', async () => {
      insumoRepo.findOne.mockResolvedValue(null);

      await expect(
        buildController().update('ins-missing', { name: 'Otro' }, 'tenant-A'),
      ).rejects.toThrow(/no encontrado/);
    });

    it('throws ConflictException when updating name to an existing other insumo', async () => {
      insumoRepo.findOne
        .mockResolvedValueOnce({
          id: 'ins-1',
          tenant_id: 'tenant-A',
          name: 'Leche',
        })
        .mockResolvedValueOnce({
          id: 'ins-2',
          tenant_id: 'tenant-A',
          name: 'Café',
        });

      await expect(
        buildController().update('ins-1', { name: 'Café' }, 'tenant-A'),
      ).rejects.toThrow(/Ya existe otro insumo con el nombre/);
    });
  });
});
