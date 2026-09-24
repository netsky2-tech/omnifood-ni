import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { FiscalSetupService, FiscalRegime } from './fiscal-setup.service';
import { TENANT_CONTEXT_SET_CONFIG_SQL } from '../../../core/database/tenant-transaction';
import { Tenant } from '../../tenant/entities/tenant.entity';
import { SystemParametersConfig } from '../../inventory/entities/system-parameters-config.entity';
import { FiscalSetupDto } from '../dto/fiscal-setup.dto';

describe('FiscalSetupService (Unit & Triangulation)', () => {
  let service: FiscalSetupService;
  let tenantRepo: jest.Mocked<Repository<Tenant>>;
  let eventEmitter: jest.Mocked<EventEmitter2>;
  let dataSource: jest.Mocked<DataSource>;
  let mockManager: jest.Mocked<EntityManager>;

  const tenantId = 'tenant-uuid-1';
  const userId = 'user-uuid-1';

  const mockTenant: Tenant = {
    id: tenantId,
    name: 'Mi Cafetería Original',
    slug: 'mi-cafeteria-original',
    ruc: null,
    is_active: true,
    created_at: new Date('2026-01-01'),
    updated_at: new Date('2026-01-01'),
  };

  beforeEach(() => {
    tenantRepo = {
      findOne: jest.fn(),
      save: jest.fn(),
    } as unknown as jest.Mocked<Repository<Tenant>>;

    eventEmitter = {
      emit: jest.fn(),
    } as unknown as jest.Mocked<EventEmitter2>;

    mockManager = {
      query: jest.fn().mockResolvedValue(undefined),
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn(
        (_entityClass: unknown, plain: unknown) => plain as object,
      ),
      save: jest.fn((_entityClass: unknown, entities: unknown) =>
        Promise.resolve(entities),
      ),
    } as unknown as jest.Mocked<EntityManager>;

    dataSource = {
      transaction: jest.fn((cb: (mgr: EntityManager) => Promise<unknown>) =>
        cb(mockManager),
      ),
    } as unknown as jest.Mocked<DataSource>;

    service = new FiscalSetupService(tenantRepo, eventEmitter, dataSource);
  });

  describe('getFiscalSetup', () => {
    it('returns fiscal setup from tenant and system parameters', async () => {
      tenantRepo.findOne.mockResolvedValueOnce({
        ...mockTenant,
        name: 'Café Managua',
        ruc: 'J0310000001234',
      });

      const params: SystemParametersConfig[] = [
        {
          id: '1',
          tenant_id: tenantId,
          tenant: mockTenant,
          paramKey: 'FISCAL_REGIME',
          paramValue: FiscalRegime.REGIMEN_GENERAL,
          version: 1,
          effectiveFrom: new Date(),
          effectiveTo: null,
          isActive: true,
          createdBy: userId,
          createdAt: new Date(),
        },
        {
          id: '2',
          tenant_id: tenantId,
          tenant: mockTenant,
          paramKey: 'TAX_RATE_IVA',
          paramValue: 0.15,
          version: 1,
          effectiveFrom: new Date(),
          effectiveTo: null,
          isActive: true,
          createdBy: userId,
          createdAt: new Date(),
        },
        {
          id: '3',
          tenant_id: tenantId,
          tenant: mockTenant,
          paramKey: 'PRICES_INCLUDE_TAX',
          paramValue: true,
          version: 1,
          effectiveFrom: new Date(),
          effectiveTo: null,
          isActive: true,
          createdBy: userId,
          createdAt: new Date(),
        },
        {
          id: '4',
          tenant_id: tenantId,
          tenant: mockTenant,
          paramKey: 'COMMERCIAL_FX_SPREAD',
          paramValue: 0.5,
          version: 1,
          effectiveFrom: new Date(),
          effectiveTo: null,
          isActive: true,
          createdBy: userId,
          createdAt: new Date(),
        },
      ];

      mockManager.find.mockResolvedValueOnce(params);

      const result = await service.getFiscalSetup(tenantId);

      expect(result).toEqual({
        tenantId,
        businessName: 'Café Managua',
        ruc: 'J0310000001234',
        regime: FiscalRegime.REGIMEN_GENERAL,
        taxRateIva: 0.15,
        pricesIncludeTax: true,
        commercialFxSpread: 0.5,
      });
    });

    it('returns default values when system parameters have not yet been configured', async () => {
      tenantRepo.findOne.mockResolvedValueOnce({ ...mockTenant });
      mockManager.find.mockResolvedValueOnce([]);

      const result = await service.getFiscalSetup(tenantId);

      expect(result).toEqual({
        tenantId,
        businessName: 'Mi Cafetería Original',
        ruc: null,
        regime: FiscalRegime.CUOTA_FIJA,
        taxRateIva: 0.0,
        pricesIncludeTax: true,
        commercialFxSpread: 0.5,
      });
    });

    it('throws NotFoundException when tenant does not exist', async () => {
      tenantRepo.findOne.mockResolvedValueOnce(null);

      await expect(service.getFiscalSetup('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('configureFiscalSetup (Triangulation & Versioning)', () => {
    it('throws BadRequestException if tenantId is missing or empty', async () => {
      const dto: FiscalSetupDto = {
        regime: FiscalRegime.CUOTA_FIJA,
        businessName: 'Café Central',
        ruc: 'J0310000055555',
        commercialFxSpread: 0.5,
        pricesIncludeTax: true,
      };

      await expect(service.configureFiscalSetup('   ', dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException if commercialFxSpread is negative', async () => {
      const dto: FiscalSetupDto = {
        regime: FiscalRegime.CUOTA_FIJA,
        businessName: 'Café Central',
        ruc: 'J0310000055555',
        commercialFxSpread: -0.1,
        pricesIncludeTax: true,
      };

      await expect(service.configureFiscalSetup(tenantId, dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('configures CUOTA_FIJA setting taxRateIva to 0.00 and version 1 parameters', async () => {
      mockManager.findOne.mockResolvedValueOnce({ ...mockTenant });
      mockManager.find.mockResolvedValue([]); // No previous params

      const dto: FiscalSetupDto = {
        regime: FiscalRegime.CUOTA_FIJA,
        businessName: 'Cafetín Las Palmeras',
        ruc: 'J0310000055555',
        commercialFxSpread: 0.5,
        pricesIncludeTax: true,
      };

      const result = await service.configureFiscalSetup(tenantId, dto, userId);

      expect(result).toMatchObject({
        tenantId,
        businessName: 'Cafetín Las Palmeras',
        ruc: 'J0310000055555',
        regime: FiscalRegime.CUOTA_FIJA,
        taxRateIva: 0.0,
        pricesIncludeTax: true,
        commercialFxSpread: 0.5,
      });
      expect(result.configuredAt).toBeInstanceOf(Date);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'ONBOARDING_FISCAL_SETUP_COMPLETED',
        expect.objectContaining({
          tenantId,
          regime: FiscalRegime.CUOTA_FIJA,
          taxRateIva: 0.0,
        }),
      );
    });

    it('configures REGIMEN_GENERAL setting taxRateIva to 0.15', async () => {
      mockManager.findOne.mockResolvedValueOnce({ ...mockTenant });
      mockManager.find.mockResolvedValue([]);

      const dto: FiscalSetupDto = {
        regime: FiscalRegime.REGIMEN_GENERAL,
        businessName: 'Restaurante El Güegüense S.A.',
        ruc: 'J0310000055555',
        commercialFxSpread: 0.75,
        pricesIncludeTax: false,
      };

      const result = await service.configureFiscalSetup(tenantId, dto, userId);

      expect(result).toMatchObject({
        tenantId,
        businessName: 'Restaurante El Güegüense S.A.',
        ruc: 'J0310000055555',
        regime: FiscalRegime.REGIMEN_GENERAL,
        taxRateIva: 0.15,
        pricesIncludeTax: false,
        commercialFxSpread: 0.75,
      });
      expect(result.configuredAt).toBeInstanceOf(Date);
    });

    it('appends version 2 on value change and never mutates the prior row (append-only, issue #377)', async () => {
      // Issue #377: this test previously asserted the defective supersession
      // — deactivating the prior row in place (UPDATE) — which the
      // trg_sys_parametros_config_immutable trigger rejects in a migrated
      // database. It now encodes the append-only contract: the prior row
      // stays untouched and a new version row is inserted instead.
      mockManager.findOne.mockResolvedValueOnce({ ...mockTenant });

      // Existing active version 1 parameters
      const existingParams: SystemParametersConfig[] = [
        {
          id: '1',
          tenant_id: tenantId,
          tenant: mockTenant,
          paramKey: 'FISCAL_REGIME',
          paramValue: FiscalRegime.CUOTA_FIJA,
          version: 1,
          effectiveFrom: new Date('2026-01-01'),
          effectiveTo: null,
          isActive: true,
          createdBy: userId,
          createdAt: new Date('2026-01-01'),
        },
        {
          id: '2',
          tenant_id: tenantId,
          tenant: mockTenant,
          paramKey: 'TAX_RATE_IVA',
          paramValue: 0.0,
          version: 1,
          effectiveFrom: new Date('2026-01-01'),
          effectiveTo: null,
          isActive: true,
          createdBy: userId,
          createdAt: new Date('2026-01-01'),
        },
      ];

      mockManager.find.mockResolvedValue(existingParams);

      const dto: FiscalSetupDto = {
        regime: FiscalRegime.REGIMEN_GENERAL, // changed from CUOTA_FIJA
        businessName: 'Mi Cafetería Actualizada',
        ruc: 'J0310000099999',
        commercialFxSpread: 0.5,
        pricesIncludeTax: true,
      };

      const result = await service.configureFiscalSetup(tenantId, dto, userId);

      expect(result.regime).toBe(FiscalRegime.REGIMEN_GENERAL);
      expect(result.taxRateIva).toBe(0.15);

      // Append-only: the prior row is untouched — no in-place deactivation.
      const prior = existingParams.find((p) => p.paramKey === 'FISCAL_REGIME');
      expect(prior?.isActive).toBe(true);
      expect(prior?.effectiveTo).toBeNull();

      // Supersession inserts a new version row instead of saving the loaded one.
      expect(mockManager.save).toHaveBeenCalledWith(
        SystemParametersConfig,
        expect.objectContaining({
          paramKey: 'FISCAL_REGIME',
          paramValue: FiscalRegime.REGIMEN_GENERAL,
          version: 2,
          isActive: true,
          effectiveTo: null,
        }),
      );
    });
  });

  describe('configureFiscalSetup (defense-in-depth RUC guard, FR-1)', () => {
    it.each([
      ['empty string', ''],
      ['whitespace only', '   '],
      ['malformed (CF prefix)', 'CF-12345'],
      ['wrong letter (K)', 'K0310000055555'],
      ['too short (12 digits)', 'J031000005555'],
    ])(
      'rejects %s before any mutation and preserves the prior tenant RUC',
      async (_label, ruc) => {
        mockManager.findOne.mockResolvedValueOnce({
          ...mockTenant,
          ruc: 'J0310000099999',
        });

        const dto: FiscalSetupDto = {
          regime: FiscalRegime.CUOTA_FIJA,
          businessName: 'Cafe Central',
          ruc,
          commercialFxSpread: 0.5,
          pricesIncludeTax: true,
        };

        const rejection = service.configureFiscalSetup(tenantId, dto, userId);

        await expect(rejection).rejects.toThrow(BadRequestException);
        await expect(rejection).rejects.toThrow(
          'El RUC del emisor es obligatorio',
        );

        // Guard fires before the transactional mutation path: the prior
        // tenant RUC is untouched and nothing is saved.
        expect(dataSource.transaction).not.toHaveBeenCalled();
        expect(mockManager.save).not.toHaveBeenCalled();
      },
    );

    it('persists the trimmed accepted RUC on success', async () => {
      mockManager.findOne.mockResolvedValueOnce({ ...mockTenant });
      mockManager.find.mockResolvedValue([]);

      const dto: FiscalSetupDto = {
        regime: FiscalRegime.CUOTA_FIJA,
        businessName: 'Cafetin Las Palmeras',
        ruc: '  J0310000055555  ',
        commercialFxSpread: 0.5,
        pricesIncludeTax: true,
      };

      const result = await service.configureFiscalSetup(tenantId, dto, userId);

      expect(result.ruc).toBe('J0310000055555');
      expect(mockManager.save).toHaveBeenCalledWith(
        Tenant,
        expect.objectContaining({ ruc: 'J0310000055555' }),
      );
    });
  });

  describe('Tenant context binding (RLS pre-hardening)', () => {
    it('binds tenant context at the start of the configureFiscalSetup transaction before any repository access', async () => {
      mockManager.findOne.mockResolvedValueOnce({ ...mockTenant });
      mockManager.find.mockResolvedValue([]);

      const dto: FiscalSetupDto = {
        regime: FiscalRegime.CUOTA_FIJA,
        businessName: 'Cafetín Las Palmeras',
        // The RUC guard introduced on main runs before the transaction, so a
        // valid value is required for this test to reach the binding point.
        ruc: 'J0310000055555',
        commercialFxSpread: 0.5,
        pricesIncludeTax: true,
      };

      await service.configureFiscalSetup(tenantId, dto, userId);

      expect(mockManager.query).toHaveBeenCalledWith(
        TENANT_CONTEXT_SET_CONFIG_SQL,
        [tenantId],
      );
      expect(mockManager.query.mock.invocationCallOrder[0]).toBeLessThan(
        mockManager.findOne.mock.invocationCallOrder[0],
      );
    });
  });
});
