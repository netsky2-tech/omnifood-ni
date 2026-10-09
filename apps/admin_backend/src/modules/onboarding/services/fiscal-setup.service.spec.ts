import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { FiscalSetupService, FiscalRegime } from './fiscal-setup.service';
import { TENANT_CONTEXT_SET_CONFIG_SQL } from '../../../core/database/tenant-transaction';
import { Tenant } from '../../tenant/entities/tenant.entity';
import { SystemParametersConfig } from '../../inventory/entities/system-parameters-config.entity';
import {
  CheckoutFxMode,
  FiscalSetupDto,
  TenantOperationMode,
} from '../dto/fiscal-setup.dto';
import { normalizeTenantSlug } from '../../tenant/tenant-slug';

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
    slug: normalizeTenantSlug('Mi Cafetería Original'),
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
          paramValue: 36.5,
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

    const paramMap: Record<string, unknown> = {
      tenantId,
      businessName: 'Café Managua',
      ruc: 'J0310000001234',
      regime: FiscalRegime.REGIMEN_GENERAL,
      taxRateIva: 0.15,
      pricesIncludeTax: true,
      commercialFxSpread: 36.5,
        // BXW-007 U1 rev 2: unconfigured params read as null (absence must
        // look like absence, never rebased to a default).
        operationMode: null,
        checkoutFxMode: null,
      // D-21 (#554): the response must expose the authorization fields so the
      // dashboard can prefill the form and render its expiry banner.
      dgiAuthorizationCode: null,
      dgiAuthorizationIssuedAt: null,
      dgiAuthorizationExpiresAt: null,
      // SOHO P3 (D-A): unconfigured discount caps read as null — absence
      // must look like absence, never rebased to a default.
      maxDiscountAmount: null,
      maxDiscountPercent: null,
    };

    expect(result).toEqual(paramMap);
  });

  it('exposes DGI authorization fields from active parameter rows', async () => {
    tenantRepo.findOne.mockResolvedValueOnce({
      ...mockTenant,
      name: 'Café Managua',
      ruc: 'J0310000001234',
    });

    const dgiRow = (
      paramKey: string,
      paramValue: string,
    ): SystemParametersConfig => ({
      id: paramKey,
      tenant_id: tenantId,
      tenant: mockTenant,
      paramKey,
      paramValue,
      version: 1,
      effectiveFrom: new Date(),
      effectiveTo: null,
      isActive: true,
      createdBy: userId,
      createdAt: new Date(),
    });

    mockManager.find.mockResolvedValueOnce([
      dgiRow('DGI_AUTHORIZATION_CODE', 'DGI-SFC-2024-00123'),
      dgiRow('DGI_AUTHORIZATION_ISSUED_AT', '2025-01-15'),
      dgiRow('DGI_AUTHORIZATION_EXPIRES_AT', '2026-01-15'),
    ]);

    const result = await service.getFiscalSetup(tenantId);

    expect(result.dgiAuthorizationCode).toBe('DGI-SFC-2024-00123');
    expect(result.dgiAuthorizationIssuedAt).toBe('2025-01-15');
    expect(result.dgiAuthorizationExpiresAt).toBe('2026-01-15');
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
        commercialFxSpread: 36.5,
        operationMode: null,
        checkoutFxMode: null,
        dgiAuthorizationCode: null,
        dgiAuthorizationIssuedAt: null,
        dgiAuthorizationExpiresAt: null,
        maxDiscountAmount: null,
        maxDiscountPercent: null,
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
        commercialFxSpread: 36.5,
        pricesIncludeTax: true,
        operationMode: TenantOperationMode.FOODPARK_QSR,
        checkoutFxMode: CheckoutFxMode.COMMERCIAL,
      };

      await expect(service.configureFiscalSetup('   ', dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    // Issue #75: the service guard mirrors the DTO boundary — anything
    // outside 10..100 (including the old permissive < 0 check) is rejected
    // before any write, with a message that names the full valid range.
    it.each([
      ['below the allowed range', 9.9],
      ['above the allowed range', 100.1],
    ])(
      'throws BadRequestException if commercialFxSpread is %s',
      async (_label, spread) => {
        const dto: FiscalSetupDto = {
          regime: FiscalRegime.CUOTA_FIJA,
          businessName: 'Café Central',
          ruc: 'J0310000055555',
          commercialFxSpread: spread as number,
          pricesIncludeTax: true,
          operationMode: TenantOperationMode.FOODPARK_QSR,
          checkoutFxMode: CheckoutFxMode.COMMERCIAL,
        };

        await expect(
          service.configureFiscalSetup(tenantId, dto),
        ).rejects.toThrow(
          'commercialFxSpread must be between 10 and 100',
        );
      },
    );

    it('configures CUOTA_FIJA setting taxRateIva to 0.00 and version 1 parameters', async () => {
      mockManager.findOne.mockResolvedValueOnce({ ...mockTenant });
      mockManager.find.mockResolvedValue([]); // No previous params

      const dto: FiscalSetupDto = {
        regime: FiscalRegime.CUOTA_FIJA,
        businessName: 'Cafetín Las Palmeras',
        ruc: 'J0310000055555',
        commercialFxSpread: 36.5,
        pricesIncludeTax: true,
        operationMode: TenantOperationMode.FOODPARK_QSR,
        checkoutFxMode: CheckoutFxMode.COMMERCIAL,
      };

      const result = await service.configureFiscalSetup(tenantId, dto, userId);

      expect(result).toMatchObject({
        tenantId,
        businessName: 'Cafetín Las Palmeras',
        ruc: 'J0310000055555',
        regime: FiscalRegime.CUOTA_FIJA,
        taxRateIva: 0.0,
        pricesIncludeTax: true,
        commercialFxSpread: 36.5,
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
        commercialFxSpread: 36.75,
        pricesIncludeTax: false,
        operationMode: TenantOperationMode.FOODPARK_QSR,
        checkoutFxMode: CheckoutFxMode.COMMERCIAL,
      };

      const result = await service.configureFiscalSetup(tenantId, dto, userId);

      expect(result).toMatchObject({
        tenantId,
        businessName: 'Restaurante El Güegüense S.A.',
        ruc: 'J0310000055555',
        regime: FiscalRegime.REGIMEN_GENERAL,
        taxRateIva: 0.15,
        pricesIncludeTax: false,
        commercialFxSpread: 36.75,
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
        commercialFxSpread: 36.5,
        pricesIncludeTax: true,
        operationMode: TenantOperationMode.FOODPARK_QSR,
        checkoutFxMode: CheckoutFxMode.COMMERCIAL,
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
          commercialFxSpread: 36.5,
          pricesIncludeTax: true,
          operationMode: TenantOperationMode.FOODPARK_QSR,
          checkoutFxMode: CheckoutFxMode.COMMERCIAL,
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
        commercialFxSpread: 36.5,
        pricesIncludeTax: true,
        operationMode: TenantOperationMode.FOODPARK_QSR,
        checkoutFxMode: CheckoutFxMode.COMMERCIAL,
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
        commercialFxSpread: 36.5,
        pricesIncludeTax: true,
        operationMode: TenantOperationMode.FOODPARK_QSR,
        checkoutFxMode: CheckoutFxMode.COMMERCIAL,
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

  // D-21 (#554): optional DGI authorization fields ride the same append-only
  // SystemParametersConfig supersession as the core fiscal parameters.
  describe('configureFiscalSetup (DGI authorization persistence, D-21 #554)', () => {
    const dgiParamRow = (
      paramKey: string,
      paramValue: string | null,
      version = 1,
    ): SystemParametersConfig => ({
      id: `${paramKey}-${version}`,
      tenant_id: tenantId,
      tenant: mockTenant,
      paramKey,
      paramValue,
      version,
      effectiveFrom: new Date('2026-01-01'),
      effectiveTo: null,
      isActive: true,
      createdBy: userId,
      createdAt: new Date('2026-01-01'),
    });

    // Each upsertParameter call resolves the active row for ITS OWN key
    // through the active view; the mock simulates the view over the initial
    // rows PLUS every row saved during the transaction, resolving a single
    // governing row per key (highest version wins) — mirroring the real
    // DISTINCT ON view so POST responses read the just-written state.
    const configureActiveRows = (rows: SystemParametersConfig[]): void => {
      mockManager.find.mockImplementation(
        async (
          _target: unknown,
          criteria?: { where?: { paramKey?: string } },
        ) => {
          const savedRows = mockManager.save.mock.calls
            .map((call) => call[1])
            .filter(
              (row): row is SystemParametersConfig & { paramKey: string } =>
                typeof row === 'object' &&
                row !== null &&
                (row as { paramKey?: string }).paramKey !== undefined,
            );
          const all = [...rows, ...savedRows];
          const candidates = criteria?.where?.paramKey
            ? all.filter(
                (row) => row.paramKey === criteria.where!.paramKey,
              )
            : all;
          const governing = new Map<string, SystemParametersConfig>();
          for (const row of candidates) {
            const current = governing.get(row.paramKey);
            if (!current || row.version > current.version) {
              governing.set(row.paramKey, row);
            }
          }
          return [...governing.values()];
        },
      );
    };

    const savedRowsFor = (paramKey: string): unknown[] =>
      mockManager.save.mock.calls
        .map((call) => call[1])
        .filter(
          (row): row is SystemParametersConfig & { paramKey: string } =>
            typeof row === 'object' &&
            row !== null &&
            (row as { paramKey?: string }).paramKey === paramKey,
        );

    beforeEach(() => {
      mockManager.findOne.mockResolvedValue({ ...mockTenant });
      configureActiveRows([]);
    });

    it('persists DGI_AUTHORIZATION_CODE, ISSUED_AT and EXPIRES_AT rows when the fields are present', async () => {
      const dto: FiscalSetupDto = {
        regime: FiscalRegime.CUOTA_FIJA,
        businessName: 'Cafetín Las Palmeras',
        ruc: 'J0310000055555',
        commercialFxSpread: 36.5,
        pricesIncludeTax: true,
        dgiAuthorizationCode: 'DGI-SFC-2024-00123',
        dgiAuthorizationIssuedAt: '2025-01-15',
        dgiAuthorizationExpiresAt: '2026-01-15',
        operationMode: TenantOperationMode.FOODPARK_QSR,
        checkoutFxMode: CheckoutFxMode.COMMERCIAL,
      };

      await service.configureFiscalSetup(tenantId, dto, userId);

      expect(savedRowsFor('DGI_AUTHORIZATION_CODE')).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            paramKey: 'DGI_AUTHORIZATION_CODE',
            paramValue: 'DGI-SFC-2024-00123',
            version: 1,
            isActive: true,
          }),
        ]),
      );
      expect(savedRowsFor('DGI_AUTHORIZATION_ISSUED_AT')).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            paramKey: 'DGI_AUTHORIZATION_ISSUED_AT',
            paramValue: '2025-01-15',
            version: 1,
          }),
        ]),
      );
      expect(savedRowsFor('DGI_AUTHORIZATION_EXPIRES_AT')).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            paramKey: 'DGI_AUTHORIZATION_EXPIRES_AT',
            paramValue: '2026-01-15',
            version: 1,
          }),
        ]),
      );
    });

    it('writes no DGI rows when the fields are absent (prior authorization stays untouched)', async () => {
      const dto: FiscalSetupDto = {
        regime: FiscalRegime.CUOTA_FIJA,
        businessName: 'Cafetín Las Palmeras',
        ruc: 'J0310000055555',
        commercialFxSpread: 36.5,
        pricesIncludeTax: true,
        operationMode: TenantOperationMode.FOODPARK_QSR,
        checkoutFxMode: CheckoutFxMode.COMMERCIAL,
      };

      await service.configureFiscalSetup(tenantId, dto, userId);

      expect(savedRowsFor('DGI_AUTHORIZATION_CODE')).toHaveLength(0);
      expect(savedRowsFor('DGI_AUTHORIZATION_ISSUED_AT')).toHaveLength(0);
      expect(savedRowsFor('DGI_AUTHORIZATION_EXPIRES_AT')).toHaveLength(0);
    });

    it('clears a blank code with a superseding null tombstone — never a stored empty string (D-16 spirit)', async () => {
      configureActiveRows([dgiParamRow('DGI_AUTHORIZATION_CODE', 'DGI-OLD-001', 1)]);

      const dto: FiscalSetupDto = {
        regime: FiscalRegime.CUOTA_FIJA,
        businessName: 'Cafetín Las Palmeras',
        ruc: 'J0310000055555',
        commercialFxSpread: 36.5,
        pricesIncludeTax: true,
        dgiAuthorizationCode: '',
        operationMode: TenantOperationMode.FOODPARK_QSR,
        checkoutFxMode: CheckoutFxMode.COMMERCIAL,
      };

      await service.configureFiscalSetup(tenantId, dto, userId);

      expect(savedRowsFor('DGI_AUTHORIZATION_CODE')).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            paramKey: 'DGI_AUTHORIZATION_CODE',
            paramValue: null,
            version: 2,
            isActive: true,
            effectiveTo: null,
          }),
        ]),
      );
      // Absence must read as absence: an empty string is never persisted.
      for (const row of savedRowsFor('DGI_AUTHORIZATION_CODE')) {
        expect((row as { paramValue?: unknown }).paramValue).not.toBe('');
      }
    });

    it('skips the write when the submitted code equals the governing row (idempotent)', async () => {
      configureActiveRows([
        dgiParamRow('DGI_AUTHORIZATION_CODE', 'DGI-SFC-2024-00123', 1),
      ]);

      const dto: FiscalSetupDto = {
        regime: FiscalRegime.CUOTA_FIJA,
        businessName: 'Cafetín Las Palmeras',
        ruc: 'J0310000055555',
        commercialFxSpread: 36.5,
        pricesIncludeTax: true,
        dgiAuthorizationCode: 'DGI-SFC-2024-00123',
        operationMode: TenantOperationMode.FOODPARK_QSR,
        checkoutFxMode: CheckoutFxMode.COMMERCIAL,
      };

      await service.configureFiscalSetup(tenantId, dto, userId);

      expect(savedRowsFor('DGI_AUTHORIZATION_CODE')).toHaveLength(0);
    });

    // D-21 (#554) response contract: the GET/POST response must serialize the
    // authorization fields — the dashboard prefills its form from the GET and
    // overwrites its query cache with the POST response.
    it('returns the just-saved authorization values in the POST response', async () => {
      configureActiveRows([]);

      const dto: FiscalSetupDto = {
        regime: FiscalRegime.CUOTA_FIJA,
        businessName: 'Cafetín Las Palmeras',
        ruc: 'J0310000055555',
        commercialFxSpread: 36.5,
        pricesIncludeTax: true,
        dgiAuthorizationCode: 'DGI-SFC-2024-00123',
        dgiAuthorizationIssuedAt: '2025-01-15',
        dgiAuthorizationExpiresAt: '2026-01-15',
        operationMode: TenantOperationMode.FOODPARK_QSR,
        checkoutFxMode: CheckoutFxMode.COMMERCIAL,
      };

      const result = await service.configureFiscalSetup(tenantId, dto, userId);

      expect(result.dgiAuthorizationCode).toBe('DGI-SFC-2024-00123');
      expect(result.dgiAuthorizationIssuedAt).toBe('2025-01-15');
      expect(result.dgiAuthorizationExpiresAt).toBe('2026-01-15');
    });

    it('reports a date cleared via empty string as null in the response with a tombstone row', async () => {
      configureActiveRows([
        dgiParamRow('DGI_AUTHORIZATION_EXPIRES_AT', '2026-01-15', 1),
      ]);

      const dto: FiscalSetupDto = {
        regime: FiscalRegime.CUOTA_FIJA,
        businessName: 'Cafetín Las Palmeras',
        ruc: 'J0310000055555',
        commercialFxSpread: 36.5,
        pricesIncludeTax: true,
        dgiAuthorizationExpiresAt: '',
        operationMode: TenantOperationMode.FOODPARK_QSR,
        checkoutFxMode: CheckoutFxMode.COMMERCIAL,
      };

      const result = await service.configureFiscalSetup(tenantId, dto, userId);

      expect(result.dgiAuthorizationExpiresAt).toBeNull();
      expect(savedRowsFor('DGI_AUTHORIZATION_EXPIRES_AT')).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            paramKey: 'DGI_AUTHORIZATION_EXPIRES_AT',
            paramValue: null,
            version: 2,
            isActive: true,
            effectiveTo: null,
          }),
        ]),
      );
    });

    it('round-trips code and dates through POST then GET (dashboard prefill contract)', async () => {
      configureActiveRows([]);

      const dto: FiscalSetupDto = {
        regime: FiscalRegime.CUOTA_FIJA,
        businessName: 'Cafetín Las Palmeras',
        ruc: 'J0310000055555',
        commercialFxSpread: 36.5,
        pricesIncludeTax: true,
        dgiAuthorizationCode: 'RES-SFC-145/2025',
        dgiAuthorizationIssuedAt: '2025-06-01',
        dgiAuthorizationExpiresAt: '2026-06-01',
        operationMode: TenantOperationMode.FOODPARK_QSR,
        checkoutFxMode: CheckoutFxMode.COMMERCIAL,
      };

      await service.configureFiscalSetup(tenantId, dto, userId);

      tenantRepo.findOne.mockResolvedValueOnce({
        ...mockTenant,
        name: 'Cafetín Las Palmeras',
        ruc: 'J0310000055555',
      });
      const fetched = await service.getFiscalSetup(tenantId);

      expect(fetched.dgiAuthorizationCode).toBe('RES-SFC-145/2025');
      expect(fetched.dgiAuthorizationIssuedAt).toBe('2025-06-01');
      expect(fetched.dgiAuthorizationExpiresAt).toBe('2026-06-01');
    });
  });

  // SOHO P3 (D-A): the manual-discount caps ride the same append-only
  // SystemParametersConfig supersession as the DGI fields and the mode
  // params. An absent field asserts nothing; an explicit null (or blank)
  // clears through a superseding tombstone; nonsense values are rejected
  // by the service guard before any mutation.
  describe('configureFiscalSetup (manual discount caps, SOHO P3 D-A)', () => {
    const capParamRow = (
      paramKey: string,
      paramValue: SystemParametersConfig['paramValue'],
      version = 1,
    ): SystemParametersConfig => ({
      id: `${paramKey}-${version}`,
      tenant_id: tenantId,
      tenant: mockTenant,
      paramKey,
      paramValue,
      version,
      effectiveFrom: new Date('2026-01-01'),
      effectiveTo: null,
      isActive: true,
      createdBy: userId,
      createdAt: new Date('2026-01-01'),
    });

    // Same active-view simulation as the DGI describe above: each
    // upsertParameter call resolves the governing row for ITS OWN key over
    // the initial rows plus everything saved during the transaction.
    const configureActiveRows = (rows: SystemParametersConfig[]): void => {
      mockManager.find.mockImplementation(
        async (
          _target: unknown,
          criteria?: { where?: { paramKey?: string } },
        ) => {
          const savedRows = mockManager.save.mock.calls
            .map((call) => call[1])
            .filter(
              (row): row is SystemParametersConfig & { paramKey: string } =>
                typeof row === 'object' &&
                row !== null &&
                (row as { paramKey?: string }).paramKey !== undefined,
            );
          const all = [...rows, ...savedRows];
          const candidates = criteria?.where?.paramKey
            ? all.filter((row) => row.paramKey === criteria.where.paramKey)
            : all;
          const governing = new Map<string, SystemParametersConfig>();
          for (const row of candidates) {
            const current = governing.get(row.paramKey);
            if (!current || row.version > current.version) {
              governing.set(row.paramKey, row);
            }
          }
          return [...governing.values()];
        },
      );
    };

    const savedRowsFor = (paramKey: string): unknown[] =>
      mockManager.save.mock.calls
        .map((call) => call[1])
        .filter(
          (row): row is SystemParametersConfig & { paramKey: string } =>
            typeof row === 'object' &&
            row !== null &&
            (row as { paramKey?: string }).paramKey === paramKey,
        );

    const baseDto = (
      extra: Partial<FiscalSetupDto> = {},
    ): FiscalSetupDto => ({
      regime: FiscalRegime.CUOTA_FIJA,
      businessName: 'Cafetín Las Palmeras',
      ruc: 'J0310000055555',
      commercialFxSpread: 36.5,
      pricesIncludeTax: true,
      operationMode: TenantOperationMode.FOODPARK_QSR,
      checkoutFxMode: CheckoutFxMode.COMMERCIAL,
      ...extra,
    });

    beforeEach(() => {
      mockManager.findOne.mockResolvedValue({ ...mockTenant });
      configureActiveRows([]);
    });

    it('persists MAX_DISCOUNT_AMOUNT and MAX_DISCOUNT_PERCENT rows when the fields are present', async () => {
      await service.configureFiscalSetup(
        tenantId,
        baseDto({ maxDiscountAmount: 500, maxDiscountPercent: 15 }),
        userId,
      );

      expect(savedRowsFor('MAX_DISCOUNT_AMOUNT')).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            paramKey: 'MAX_DISCOUNT_AMOUNT',
            paramValue: 500,
            version: 1,
            isActive: true,
          }),
        ]),
      );
      expect(savedRowsFor('MAX_DISCOUNT_PERCENT')).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            paramKey: 'MAX_DISCOUNT_PERCENT',
            paramValue: 15,
            version: 1,
            isActive: true,
          }),
        ]),
      );
    });

    it('writes no cap rows when the fields are absent (prior caps stay untouched)', async () => {
      await service.configureFiscalSetup(tenantId, baseDto(), userId);

      expect(savedRowsFor('MAX_DISCOUNT_AMOUNT')).toHaveLength(0);
      expect(savedRowsFor('MAX_DISCOUNT_PERCENT')).toHaveLength(0);
    });

    it('clears a persisted cap with a superseding null tombstone on explicit null (append-only)', async () => {
      configureActiveRows([
        capParamRow('MAX_DISCOUNT_AMOUNT', 500, 1),
      ]);

      const result = await service.configureFiscalSetup(
        tenantId,
        baseDto({ maxDiscountAmount: null }),
        userId,
      );

      expect(savedRowsFor('MAX_DISCOUNT_AMOUNT')).toHaveLength(1);
      expect(savedRowsFor('MAX_DISCOUNT_AMOUNT')).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            paramKey: 'MAX_DISCOUNT_AMOUNT',
            paramValue: null,
            version: 2,
            isActive: true,
            effectiveTo: null,
          }),
        ]),
      );
      // The tombstone resolves as absent: null in the response — no cap.
      expect(result.maxDiscountAmount).toBeNull();
    });

    it('clears a persisted percent cap with a superseding null tombstone on explicit null (numeric twin)', async () => {
      configureActiveRows([
        capParamRow('MAX_DISCOUNT_PERCENT', 10, 1),
      ]);

      const result = await service.configureFiscalSetup(
        tenantId,
        baseDto({ maxDiscountPercent: null }),
        userId,
      );

      expect(savedRowsFor('MAX_DISCOUNT_PERCENT')).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            paramKey: 'MAX_DISCOUNT_PERCENT',
            paramValue: null,
            version: 2,
            isActive: true,
            effectiveTo: null,
          }),
        ]),
      );
      // No cap: the tombstone reads back as absent.
      expect(result.maxDiscountPercent).toBeNull();
    });

    it('clears a whitespace-only code through the same tombstone — trimming happens before the clear decision', async () => {
      configureActiveRows([
        capParamRow('DGI_AUTHORIZATION_CODE', 'DGI-OLD-002', 1),
      ]);

      await service.configureFiscalSetup(
        tenantId,
        baseDto({ dgiAuthorizationCode: '   ' }),
        userId,
      );

      expect(savedRowsFor('DGI_AUTHORIZATION_CODE')).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            paramKey: 'DGI_AUTHORIZATION_CODE',
            paramValue: null,
            version: 2,
          }),
        ]),
      );
      // Never a stored whitespace value and never a sentinel string.
      for (const row of savedRowsFor('DGI_AUTHORIZATION_CODE')) {
        expect((row as { paramValue?: unknown }).paramValue).toBeNull();
      }
    });

    it('skips the write when the submitted cap equals the governing row (idempotent)', async () => {
      configureActiveRows([capParamRow('MAX_DISCOUNT_PERCENT', 15, 1)]);

      await service.configureFiscalSetup(
        tenantId,
        baseDto({ maxDiscountPercent: 15 }),
        userId,
      );

      expect(savedRowsFor('MAX_DISCOUNT_PERCENT')).toHaveLength(0);
    });

    it.each([
      ['a negative amount', { maxDiscountAmount: -0.01 }],
      ['a percent of 0', { maxDiscountPercent: 0 }],
      ['a negative percent', { maxDiscountPercent: -1 }],
      ['a percent above 100', { maxDiscountPercent: 100.5 }],
    ])(
      'rejects %s before any mutation (defense-in-depth guard)',
      async (_label, extra) => {
        await expect(
          service.configureFiscalSetup(tenantId, baseDto(extra), userId),
        ).rejects.toThrow(BadRequestException);

        expect(dataSource.transaction).not.toHaveBeenCalled();
        expect(mockManager.save).not.toHaveBeenCalled();
      },
    );

    it('returns the just-saved caps in the POST response', async () => {
      const result = await service.configureFiscalSetup(
        tenantId,
        baseDto({ maxDiscountAmount: 500, maxDiscountPercent: 15 }),
        userId,
      );

      expect(result.maxDiscountAmount).toBe(500);
      expect(result.maxDiscountPercent).toBe(15);
    });

    it('reads the stored caps in the GET response and corrupt values as null', async () => {
      configureActiveRows([
        capParamRow('MAX_DISCOUNT_AMOUNT', 500),
        capParamRow('MAX_DISCOUNT_PERCENT', 15),
      ]);
      tenantRepo.findOne.mockResolvedValueOnce({ ...mockTenant });
      const configured = await service.getFiscalSetup(tenantId);
      expect(configured.maxDiscountAmount).toBe(500);
      expect(configured.maxDiscountPercent).toBe(15);

      // Corrupt rows: non-numeric values read as null — absence must look
      // like absence, never as a silently fabricated cap.
      configureActiveRows([
        capParamRow('MAX_DISCOUNT_AMOUNT', 'corrupt'),
        capParamRow('MAX_DISCOUNT_PERCENT', true),
      ]);
      tenantRepo.findOne.mockResolvedValueOnce({ ...mockTenant });
      const corrupted = await service.getFiscalSetup(tenantId);
      expect(corrupted.maxDiscountAmount).toBeNull();
      expect(corrupted.maxDiscountPercent).toBeNull();
    });
  });

  // BXW-007 U1: the Business Profile on web carries the POS operation mode
  // and checkout FX mode through the same append-only parameter channel so
  // the fiscal config snapshot (and the POS sync) covers both.
  describe('operation mode & checkout FX mode (BXW-007 U1)', () => {
    const modeParamRow = (
      paramKey: string,
      paramValue: SystemParametersConfig['paramValue'],
      version = 1,
    ): SystemParametersConfig => ({
      id: `${paramKey}-${version}`,
      tenant_id: tenantId,
      tenant: mockTenant,
      paramKey,
      paramValue,
      version,
      effectiveFrom: new Date('2026-01-01'),
      effectiveTo: null,
      isActive: true,
      createdBy: userId,
      createdAt: new Date('2026-01-01'),
    });

    // Same active-view simulation as the DGI describe above: each
    // upsertParameter call resolves the governing row for ITS OWN key over
    // the initial rows plus everything saved during the transaction.
    const configureActiveRows = (rows: SystemParametersConfig[]): void => {
      mockManager.find.mockImplementation(
        async (
          _target: unknown,
          criteria?: { where?: { paramKey?: string } },
        ) => {
          const savedRows = mockManager.save.mock.calls
            .map((call) => call[1])
            .filter(
              (row): row is SystemParametersConfig & { paramKey: string } =>
                typeof row === 'object' &&
                row !== null &&
                (row as { paramKey?: string }).paramKey !== undefined,
            );
          const all = [...rows, ...savedRows];
          const candidates = criteria?.where?.paramKey
            ? all.filter((row) => row.paramKey === criteria.where.paramKey)
            : all;
          const governing = new Map<string, SystemParametersConfig>();
          for (const row of candidates) {
            const current = governing.get(row.paramKey);
            if (!current || row.version > current.version) {
              governing.set(row.paramKey, row);
            }
          }
          return [...governing.values()];
        },
      );
    };

    const savedRowsFor = (paramKey: string): unknown[] =>
      mockManager.save.mock.calls
        .map((call) => call[1])
        .filter(
          (row): row is SystemParametersConfig & { paramKey: string } =>
            typeof row === 'object' &&
            row !== null &&
            (row as { paramKey?: string }).paramKey === paramKey,
        );

    beforeEach(() => {
      mockManager.findOne.mockResolvedValue({ ...mockTenant });
      configureActiveRows([]);
    });

    it('persists OPERATION_MODE and CHECKOUT_FX_MODE rows on POST', async () => {
      const dto: FiscalSetupDto = {
        regime: FiscalRegime.CUOTA_FIJA,
        businessName: 'Cafetín Las Palmeras',
        ruc: 'J0310000055555',
        commercialFxSpread: 36.5,
        pricesIncludeTax: true,
        operationMode: TenantOperationMode.RESTAURANT,
        checkoutFxMode: CheckoutFxMode.BCN_OFFICIAL,
      };

      await service.configureFiscalSetup(tenantId, dto, userId);

      expect(savedRowsFor('OPERATION_MODE')).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            paramKey: 'OPERATION_MODE',
            paramValue: TenantOperationMode.RESTAURANT,
            version: 1,
            isActive: true,
          }),
        ]),
      );
      expect(savedRowsFor('CHECKOUT_FX_MODE')).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            paramKey: 'CHECKOUT_FX_MODE',
            paramValue: CheckoutFxMode.BCN_OFFICIAL,
            version: 1,
            isActive: true,
          }),
        ]),
      );
    });

    it('reads the stored operationMode/checkoutFxMode in the GET response', async () => {
      configureActiveRows([
        modeParamRow('OPERATION_MODE', TenantOperationMode.RESTAURANT),
        modeParamRow('CHECKOUT_FX_MODE', CheckoutFxMode.BCN_OFFICIAL),
      ]);

      tenantRepo.findOne.mockResolvedValueOnce({ ...mockTenant });
      const result = await service.getFiscalSetup(tenantId);

      expect(result.operationMode).toBe(TenantOperationMode.RESTAURANT);
      expect(result.checkoutFxMode).toBe(CheckoutFxMode.BCN_OFFICIAL);
    });

    it('reads missing or corrupt stored values as null (absence must look like absence, never rebased to a default)', async () => {
      // No rows at all: the tenant never configured the modes.
      configureActiveRows([]);
      tenantRepo.findOne.mockResolvedValueOnce({ ...mockTenant });
      const unconfigured = await service.getFiscalSetup(tenantId);
      expect(unconfigured.operationMode).toBeNull();
      expect(unconfigured.checkoutFxMode).toBeNull();

      // Corrupt rows: non-member and non-string values read as null too.
      configureActiveRows([
        modeParamRow('OPERATION_MODE', 'BOGUS_MODE'),
        modeParamRow('CHECKOUT_FX_MODE', 123),
      ]);
      tenantRepo.findOne.mockResolvedValueOnce({ ...mockTenant });
      const corrupted = await service.getFiscalSetup(tenantId);
      expect(corrupted.operationMode).toBeNull();
      expect(corrupted.checkoutFxMode).toBeNull();
    });

    it('leaves the persisted mode params untouched when the POST omits the keys', async () => {
      const prior = [
        modeParamRow('OPERATION_MODE', TenantOperationMode.RESTAURANT),
        modeParamRow('CHECKOUT_FX_MODE', CheckoutFxMode.BCN_OFFICIAL),
      ];
      configureActiveRows(prior);

      // Rev 2: no operationMode/checkoutFxMode keys — the web asserts nothing.
      const dto: FiscalSetupDto = {
        regime: FiscalRegime.CUOTA_FIJA,
        businessName: 'Cafetín Las Palmeras',
        ruc: 'J0310000055555',
        commercialFxSpread: 36.5,
        pricesIncludeTax: true,
      };

      const result = await service.configureFiscalSetup(tenantId, dto, userId);

      // No new rows for either key.
      expect(savedRowsFor('OPERATION_MODE')).toHaveLength(0);
      expect(savedRowsFor('CHECKOUT_FX_MODE')).toHaveLength(0);

      // The prior rows are intact: still the governing version 1 rows.
      expect(result.operationMode).toBe(TenantOperationMode.RESTAURANT);
      expect(result.checkoutFxMode).toBe(CheckoutFxMode.BCN_OFFICIAL);
    });

    it('returns the just-saved values in the POST response', async () => {
      configureActiveRows([]);

      const dto: FiscalSetupDto = {
        regime: FiscalRegime.CUOTA_FIJA,
        businessName: 'Cafetín Las Palmeras',
        ruc: 'J0310000055555',
        commercialFxSpread: 36.5,
        pricesIncludeTax: true,
        operationMode: TenantOperationMode.HYBRID,
        checkoutFxMode: CheckoutFxMode.BCN_OFFICIAL,
      };

      const result = await service.configureFiscalSetup(tenantId, dto, userId);

      expect(result.operationMode).toBe(TenantOperationMode.HYBRID);
      expect(result.checkoutFxMode).toBe(CheckoutFxMode.BCN_OFFICIAL);
    });

    // D-16 spirit for the mode params: the dashboard's "Sin definir" sentinel
    // sends an explicit null to hand local control back to each POS terminal.
    // The clear must ride the same append-only supersession as the DGI
    // fields: a new null tombstone row supersedes the prior governing row —
    // never a mutation, never a stored '' or 'null' string.
    it('clears a persisted operationMode with a superseding null tombstone on explicit null (append-only, D-16 spirit)', async () => {
      const priorModeRow = modeParamRow(
        'OPERATION_MODE',
        TenantOperationMode.RESTAURANT,
      );
      configureActiveRows([priorModeRow]);

      const dto: FiscalSetupDto = {
        regime: FiscalRegime.CUOTA_FIJA,
        businessName: 'Cafetín Las Palmeras',
        ruc: 'J0310000055555',
        commercialFxSpread: 36.5,
        pricesIncludeTax: true,
        operationMode: null,
      };

      const result = await service.configureFiscalSetup(tenantId, dto, userId);

      // (a) Exactly one new row, with the right key and a null value.
      expect(savedRowsFor('OPERATION_MODE')).toHaveLength(1);
      expect(savedRowsFor('OPERATION_MODE')).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            paramKey: 'OPERATION_MODE',
            paramValue: null,
            version: 2,
            isActive: true,
            effectiveTo: null,
          }),
        ]),
      );
      // (b) Append-only: the prior governing row is never saved or mutated —
      // only the tombstone is written, and the prior row keeps its version 1
      // value intact.
      expect(priorModeRow).toEqual(
        modeParamRow('OPERATION_MODE', TenantOperationMode.RESTAURANT),
      );
      // (c) The post-write read resolves the tombstone as absent: null, not
      // the string 'null', not a POS default, not the superseded value.
      expect(result.operationMode).toBeNull();
    });

    it('clears a persisted checkoutFxMode with a superseding null tombstone on explicit null (append-only, D-16 spirit)', async () => {
      const priorFxRow = modeParamRow(
        'CHECKOUT_FX_MODE',
        CheckoutFxMode.BCN_OFFICIAL,
      );
      configureActiveRows([priorFxRow]);

      const dto: FiscalSetupDto = {
        regime: FiscalRegime.CUOTA_FIJA,
        businessName: 'Cafetín Las Palmeras',
        ruc: 'J0310000055555',
        commercialFxSpread: 36.5,
        pricesIncludeTax: true,
        checkoutFxMode: null,
      };

      const result = await service.configureFiscalSetup(tenantId, dto, userId);

      // (a) Exactly one new row, with the right key and a null value.
      expect(savedRowsFor('CHECKOUT_FX_MODE')).toHaveLength(1);
      expect(savedRowsFor('CHECKOUT_FX_MODE')).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            paramKey: 'CHECKOUT_FX_MODE',
            paramValue: null,
            version: 2,
            isActive: true,
            effectiveTo: null,
          }),
        ]),
      );
      // (b) Append-only: the prior governing row is never saved or mutated —
      // only the tombstone is written, and the prior row keeps its version 1
      // value intact.
      expect(priorFxRow).toEqual(
        modeParamRow('CHECKOUT_FX_MODE', CheckoutFxMode.BCN_OFFICIAL),
      );
      // (c) The post-write read resolves the tombstone as absent: null, not
      // the string 'null', not a POS default, not the superseded value.
      expect(result.checkoutFxMode).toBeNull();
    });
  });
});
