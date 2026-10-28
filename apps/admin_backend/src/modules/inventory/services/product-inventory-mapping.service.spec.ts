import { ProductInventoryMappingService } from './product-inventory-mapping.service';
import { TenantContextRequiredError } from '../../../core/database/tenant-transaction';

describe('ProductInventoryMappingService', () => {
  const tenant = 'tenant-a';
  const product = '00000000-0000-4000-8000-000000000001';
  const insumoA = '00000000-0000-4000-8000-000000000011';
  const insumoB = '00000000-0000-4000-8000-000000000012';

  it('selects only its tenant/product interval at exact supersession boundaries and sets RLS config', async () => {
    const getOne = jest
      .fn()
      .mockResolvedValue({ id: 'version-b', insumo_id: insumoB });
    const query = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getOne,
    };
    const mockQueryRunner = {
      connect: jest.fn().mockResolvedValue(undefined),
      query: jest.fn().mockResolvedValue([]),
      release: jest.fn().mockResolvedValue(undefined),
      manager: {
        getRepository: jest.fn().mockReturnValue({
          createQueryBuilder: jest.fn().mockReturnValue(query),
        }),
      },
    };
    const dataSource = {
      createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
    };

    const service = new ProductInventoryMappingService(dataSource as any);
    const targetDate = new Date('2026-01-02T00:00:00Z');
    const result = await service.findEffective(tenant, product, targetDate);

    expect(result).toMatchObject({ id: 'version-b', insumo_id: insumoB });
    expect(mockQueryRunner.query).toHaveBeenCalledWith(
      "SELECT set_config('app.tenant_id', $1, true)",
      [tenant],
    );
    expect(query.where).toHaveBeenCalledWith('mapping.tenant_id = :tenantId', {
      tenantId: tenant,
    });
    expect(query.andWhere).toHaveBeenCalledWith(
      'mapping.product_id = :productId',
      { productId: product },
    );
    expect(query.andWhere).toHaveBeenCalledWith(
      'mapping.effective_at <= :effectiveAt',
      { effectiveAt: targetDate },
    );
    expect(query.andWhere).toHaveBeenCalledWith(
      '(mapping.superseded_at IS NULL OR mapping.superseded_at > :effectiveAt)',
      { effectiveAt: targetDate },
    );
    expect(mockQueryRunner.release).toHaveBeenCalled();
  });

  it('closes the old row and inserts a distinct history-preserving version atomically with advisory lock', async () => {
    const active = {
      id: 'version-a',
      tenant_id: tenant,
      product_id: product,
      insumo_id: insumoA,
      effective_at: new Date('2026-01-01T00:00:00Z'),
      superseded_at: null,
    };
    const save = jest.fn().mockImplementation(async (row) => ({
      ...row,
      id: row.id ?? 'version-b',
    }));
    const repo = {
      findOne: jest.fn().mockResolvedValue(active),
      create: jest.fn((row) => row),
      save,
    };
    const mockQueryRunner = {
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
      query: jest.fn().mockResolvedValue([]),
      manager: {
        getRepository: jest.fn().mockReturnValue(repo),
      },
    };
    const dataSource = {
      createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
    };

    const service = new ProductInventoryMappingService(dataSource as any);
    const next = await service.supersede({
      tenantId: tenant,
      productId: product,
      insumoId: insumoB,
      effectiveAt: new Date('2026-01-02T00:00:00Z'),
    });

    expect(mockQueryRunner.query).toHaveBeenCalledWith(
      "SELECT set_config('app.tenant_id', $1, true)",
      [tenant],
    );
    expect(mockQueryRunner.query).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))',
      [tenant, product],
    );
    expect(active.superseded_at).toEqual(new Date('2026-01-02T00:00:00Z'));
    expect(next.insumo_id).toBe(insumoB);
    expect(next.id).not.toBe(active.id);
    expect(save).toHaveBeenCalledTimes(2);
    expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
    expect(mockQueryRunner.release).toHaveBeenCalled();
  });

  it('rejects an effectiveAt that is not after the active mapping and rolls back', async () => {
    const active = {
      id: 'version-a',
      tenant_id: tenant,
      product_id: product,
      insumo_id: insumoA,
      effective_at: new Date('2026-01-05T00:00:00Z'),
      superseded_at: null,
    };
    const mockQueryRunner = {
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
      query: jest.fn().mockResolvedValue([]),
      manager: {
        getRepository: jest.fn().mockReturnValue({
          findOne: jest.fn().mockResolvedValue(active),
        }),
      },
    };
    const dataSource = {
      createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
    };

    const service = new ProductInventoryMappingService(dataSource as any);
    await expect(
      service.supersede({
        tenantId: tenant,
        productId: product,
        insumoId: insumoB,
        effectiveAt: new Date('2026-01-03T00:00:00Z'), // Prior to active!
      }),
    ).rejects.toThrow('Mapping effectiveAt must be after the active mapping');

    expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
    expect(mockQueryRunner.release).toHaveBeenCalled();
  });

  it('rejects a blank tenant id (Unit 0b-3) with TenantContextRequiredError and issues no set_config SQL', async () => {
    const makeRunner = () => ({
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
      query: jest.fn().mockResolvedValue([]),
      manager: {
        getRepository: jest.fn(),
      },
    });

    for (const blankTenantId of ['', '   ']) {
      const readRunner = makeRunner();
      const readSource = {
        createQueryRunner: jest.fn().mockReturnValue(readRunner),
      };
      const readService = new ProductInventoryMappingService(readSource as any);

      await expect(
        readService.findEffective(
          blankTenantId,
          product,
          new Date('2026-01-02T00:00:00Z'),
        ),
      ).rejects.toThrow(TenantContextRequiredError);

      expect(readRunner.query).not.toHaveBeenCalled();
      expect(readRunner.release).toHaveBeenCalled();

      const supersedeRunner = makeRunner();
      const supersedeSource = {
        createQueryRunner: jest.fn().mockReturnValue(supersedeRunner),
      };
      const supersedeService = new ProductInventoryMappingService(
        supersedeSource as any,
      );

      await expect(
        supersedeService.supersede({
          tenantId: blankTenantId,
          productId: product,
          insumoId: insumoA,
          effectiveAt: new Date('2026-01-02T00:00:00Z'),
        }),
      ).rejects.toThrow(TenantContextRequiredError);

      // Absence of SQL, not just the rejection: a blank tenant id must
      // never reach set_config on the query runner.
      expect(supersedeRunner.query).not.toHaveBeenCalled();
      expect(supersedeRunner.rollbackTransaction).toHaveBeenCalled();
      expect(supersedeRunner.release).toHaveBeenCalled();
    }
  });
});
