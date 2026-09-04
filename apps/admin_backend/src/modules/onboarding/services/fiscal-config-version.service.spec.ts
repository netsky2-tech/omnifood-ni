import { ConflictException, NotFoundException } from '@nestjs/common';
import { Repository, DataSource, EntityManager } from 'typeorm';
import { FiscalConfigVersionService } from './fiscal-config-version.service';
import { FiscalConfigRevision } from '../entities/fiscal-config-revision.entity';
import { Tenant } from '../../tenant/entities/tenant.entity';
import { SystemParametersConfig } from '../../inventory/entities/system-parameters-config.entity';
import { FiscalRegime } from '../dto/fiscal-setup.dto';
import { computeJcsSha256 } from '../utils/canonical-jcs';

describe('FiscalConfigVersionService (Unit & Triangulation)', () => {
  let service: FiscalConfigVersionService;
  let revisionRepo: jest.Mocked<Repository<FiscalConfigRevision>>;
  let tenantRepo: jest.Mocked<Repository<Tenant>>;
  let sysParamRepo: jest.Mocked<Repository<SystemParametersConfig>>;
  let dataSource: jest.Mocked<DataSource>;
  let mockManager: jest.Mocked<EntityManager>;

  const tenantId = 'tenant-test-uuid';

  const mockTenant: Tenant = {
    id: tenantId,
    name: 'Restaurante El Volcán',
    ruc: 'J0310000000001',
    is_active: true,
    created_at: new Date('2026-01-01'),
    updated_at: new Date('2026-01-01'),
  };

  const mockParams: SystemParametersConfig[] = [
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
      createdBy: 'user-1',
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
      createdBy: 'user-1',
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
      createdBy: 'user-1',
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
      createdBy: 'user-1',
      createdAt: new Date(),
    },
  ];

  beforeEach(() => {
    revisionRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn((plain: unknown) => plain as FiscalConfigRevision),
      save: jest.fn((entity: unknown) => Promise.resolve(entity as FiscalConfigRevision)),
    } as unknown as jest.Mocked<Repository<FiscalConfigRevision>>;

    tenantRepo = {
      findOne: jest.fn().mockResolvedValue(mockTenant),
    } as unknown as jest.Mocked<Repository<Tenant>>;

    sysParamRepo = {
      find: jest.fn().mockResolvedValue(mockParams),
    } as unknown as jest.Mocked<Repository<SystemParametersConfig>>;

    mockManager = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn((_cls: unknown, plain: unknown) => plain as object),
      save: jest.fn((_cls: unknown, entity: unknown) => Promise.resolve(entity)),
    } as unknown as jest.Mocked<EntityManager>;

    dataSource = {
      transaction: jest.fn((cb: (mgr: EntityManager) => Promise<unknown>) => cb(mockManager)),
    } as unknown as jest.Mocked<DataSource>;

    service = new FiscalConfigVersionService(
      revisionRepo,
      tenantRepo,
      sysParamRepo,
      dataSource,
    );
  });

  describe('Effective Payload & Fingerprint', () => {
    it('constructs effective payload and computes deterministic SHA-256 fingerprint', async () => {
      const payload = await service.getEffectiveFiscalPayload(tenantId);

      expect(payload).toEqual({
        tenantId,
        businessName: 'Restaurante El Volcán',
        ruc: 'J0310000000001',
        fiscalRegime: FiscalRegime.REGIMEN_GENERAL,
        taxRate: 0.15,
        pricesIncludeTax: true,
        commercialFxSpread: 0.5,
      });

      const fingerprint = service.computeCanonicalFingerprint(payload);
      expect(fingerprint).toHaveLength(64);
      expect(fingerprint).toBe(computeJcsSha256(payload));
    });

    it('throws NotFoundException if tenant does not exist', async () => {
      tenantRepo.findOne.mockResolvedValueOnce(null);
      await expect(service.getEffectiveFiscalPayload('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('Revision Tracking & Monotonic Increment', () => {
    it('creates baseline revision 1 when no revision exists yet', async () => {
      revisionRepo.findOne.mockResolvedValueOnce(null);

      const snapshot = await service.getFiscalConfigSnapshot(tenantId);

      expect(snapshot.configVersion.revision).toBe(1);
      expect(snapshot.configVersion.fingerprint).toHaveLength(64);
      expect(snapshot.tenantId).toBe(tenantId);
      expect(snapshot.businessName).toBe('Restaurante El Volcán');
      expect(revisionRepo.save).toHaveBeenCalled();
    });

    it('returns existing revision without increment when effective config has not materially changed', async () => {
      const payload = await service.getEffectiveFiscalPayload(tenantId);
      const fingerprint = service.computeCanonicalFingerprint(payload);

      const existingRevision: FiscalConfigRevision = {
        id: 'rev-1-id',
        tenant_id: tenantId,
        revision: 1,
        fingerprint,
        payload: payload as unknown as Record<string, unknown>,
        created_at: new Date('2026-01-01'),
      };

      revisionRepo.findOne.mockResolvedValueOnce(existingRevision);

      const res = await service.recordRevisionChange(tenantId);
      expect(res.revision).toBe(1);
      expect(res.fingerprint).toBe(fingerprint);
      expect(revisionRepo.save).not.toHaveBeenCalled();
    });

    it('strictly increments revision (prev.revision + 1) when effective config changes materially', async () => {
      const oldPayload = {
        tenantId,
        businessName: 'Old Business Name',
        ruc: 'J0310000000001',
        fiscalRegime: FiscalRegime.CUOTA_FIJA,
        taxRate: 0.0,
        pricesIncludeTax: true,
        commercialFxSpread: 0.5,
      };
      const oldFingerprint = service.computeCanonicalFingerprint(oldPayload);

      const existingRevision: FiscalConfigRevision = {
        id: 'rev-1-id',
        tenant_id: tenantId,
        revision: 1,
        fingerprint: oldFingerprint,
        payload: oldPayload as unknown as Record<string, unknown>,
        created_at: new Date('2026-01-01'),
      };

      revisionRepo.findOne.mockResolvedValueOnce(existingRevision);

      // Now the current effective payload (mockTenant + mockParams) has REGIMEN_GENERAL and 0.15
      const newRes = await service.recordRevisionChange(tenantId);

      expect(newRes.revision).toBe(2);
      expect(newRes.fingerprint).not.toBe(oldFingerprint);
      expect(revisionRepo.save).toHaveBeenCalled();
    });
  });

  describe('Integrity Invariant (INTEGRITY_CONFLICT)', () => {
    it('throws INTEGRITY_CONFLICT when same revision has a different fingerprint', async () => {
      const existingRevision: FiscalConfigRevision = {
        id: 'rev-1-id',
        tenant_id: tenantId,
        revision: 3,
        fingerprint: 'correct-sha256-hash-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        payload: {},
        created_at: new Date(),
      };

      revisionRepo.findOne.mockResolvedValueOnce(existingRevision);

      await expect(
        service.validateIntegrity(
          tenantId,
          3,
          'tampered-sha256-hash-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        ),
      ).rejects.toThrow(ConflictException);

      revisionRepo.findOne.mockResolvedValueOnce(existingRevision);
      try {
        await service.validateIntegrity(
          tenantId,
          3,
          'tampered-sha256-hash-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        );
      } catch (err: any) {
        expect(err.message).toContain('INTEGRITY_CONFLICT');
      }
    });

    it('passes integrity validation when revision and fingerprint match exactly', async () => {
      const fingerprint = 'valid-sha256-hash-cccccccccccccccccccccccccccccccccccccccccccc';
      const existingRevision: FiscalConfigRevision = {
        id: 'rev-1-id',
        tenant_id: tenantId,
        revision: 3,
        fingerprint,
        payload: {},
        created_at: new Date(),
      };

      revisionRepo.findOne.mockResolvedValueOnce(existingRevision);

      await expect(
        service.validateIntegrity(tenantId, 3, fingerprint),
      ).resolves.toBeUndefined();
    });
  });
});
