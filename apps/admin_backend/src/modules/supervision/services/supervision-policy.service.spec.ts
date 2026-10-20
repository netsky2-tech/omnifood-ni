import { BadRequestException } from '@nestjs/common';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { SupervisionPolicyService } from './supervision-policy.service';
import {
  SystemParametersConfig,
  SystemParametersConfigActiveView,
} from '../../inventory/entities/system-parameters-config.entity';
import { FiscalConfigVersionService } from '../../onboarding/services/fiscal-config-version.service';
import { UserRole } from '../../identity/security/user-role.enum';
import { SUPERVISION_POLICY_PARAM_KEY } from '../contracts/supervision-policy.contract';

describe('SupervisionPolicyService', () => {
  const tenantId = 'tenant-supervision-uuid';

  let service: SupervisionPolicyService;
  let dataSource: jest.Mocked<DataSource>;
  let mockManager: jest.Mocked<EntityManager>;
  let activeViewRepo: jest.Mocked<Repository<SystemParametersConfigActiveView>>;
  let configRepo: jest.Mocked<Repository<SystemParametersConfig>>;
  let eventEmitter: jest.Mocked<EventEmitter2>;
  let fiscalConfigVersionService: jest.Mocked<FiscalConfigVersionService>;

  const paramRow = (key: string, value: unknown, version = 1) =>
    ({
      id: `${key}-${version}`,
      tenant_id: tenantId,
      paramKey: key,
      paramValue: value,
      version,
      effectiveFrom: new Date('2026-01-01'),
      effectiveTo: null,
      isActive: true,
      createdBy: 'user-1',
      createdAt: new Date('2026-01-01'),
    }) as unknown as SystemParametersConfigActiveView;

  beforeEach(() => {
    activeViewRepo = {
      find: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<Repository<SystemParametersConfigActiveView>>;

    configRepo = {
      create: jest.fn((_cls: unknown, plain: unknown) => plain),
      save: jest.fn((_cls: unknown, entity: unknown) =>
        Promise.resolve(entity),
      ),
    } as unknown as jest.Mocked<Repository<SystemParametersConfig>>;

    mockManager = {
      query: jest.fn().mockResolvedValue(undefined),
      getRepository: jest.fn((target: unknown) => {
        if (target === SystemParametersConfigActiveView) return activeViewRepo;
        if (target === SystemParametersConfig) return configRepo;
        throw new Error('Unexpected repository target');
      }),
      // The service reads the tenant parameters through the active view
      // with manager.find (the house pattern for the append-only params
      // table), so the mock delegates to that repository's mock.
      find: jest.fn(() => activeViewRepo.find()),
      findOne: jest.fn(),
      create: jest.fn((_cls: unknown, plain: unknown) => plain),
      save: jest.fn((_cls: unknown, entity: unknown) =>
        Promise.resolve(entity),
      ),
    } as unknown as jest.Mocked<EntityManager>;

    dataSource = {
      transaction: jest.fn((cb: (mgr: EntityManager) => Promise<unknown>) =>
        cb(mockManager),
      ),
    } as unknown as jest.Mocked<DataSource>;

    eventEmitter = {
      emit: jest.fn(),
    } as unknown as jest.Mocked<EventEmitter2>;

    fiscalConfigVersionService = {
      getLatestRevision: jest.fn().mockResolvedValue(null),
      recordRevisionChange: jest
        .fn()
        .mockResolvedValue({ revision: 7, fingerprint: 'fp-7' }),
    } as unknown as jest.Mocked<FiscalConfigVersionService>;

    service = new SupervisionPolicyService(
      dataSource,
      eventEmitter,
      fiscalConfigVersionService,
    );
  });

  describe('getPolicy', () => {
    it('reads an unconfigured tenant as "no policy" plus the default for its mode', async () => {
      activeViewRepo.find.mockResolvedValue([
        paramRow('OPERATION_MODE', 'FOODPARK_QSR'),
      ]);

      const result = await service.getPolicy(tenantId);

      expect(result.configured).toBe(false);
      expect(result.policy).toBeNull();
      expect(result.operationMode).toBe('FOODPARK_QSR');
      // The default the terminals will apply: a food park has no manager on
      // the floor, so the operator may sign their own drawer/discount.
      expect(result.defaultPolicy.selfAuthorizationAllowedCashDrawer).toBe(true);
      expect(result.defaultPolicy.selfAuthorizationAllowedCloseBox).toBe(true);
    });

    it('reads a configured policy and validates it', async () => {
      activeViewRepo.find.mockResolvedValue([
        paramRow('OPERATION_MODE', 'RESTAURANT'),
        paramRow(SUPERVISION_POLICY_PARAM_KEY, {
          authorizingRoles: ['OWNER'],
          selfAuthorizationAllowedCloseBox: true,
          selfAuthorizationAllowedCashDrawer: false,
          selfAuthorizationAllowedManualDiscount: false,
          supervisorRequiredForModifierQuantity: false,
        }),
      ]);

      const result = await service.getPolicy(tenantId);

      expect(result.configured).toBe(true);
      expect(result.policy?.authorizingRoles).toEqual([UserRole.OWNER]);
      expect(result.validation.errors).toEqual([]);
      // A restaurant keeps the stricter default.
      expect(result.defaultPolicy.selfAuthorizationAllowedCashDrawer).toBe(false);
    });

    it('rejects a blank tenant id before touching the database', async () => {
      await expect(service.getPolicy('  ')).rejects.toThrow(BadRequestException);
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });
  });

  describe('configurePolicy', () => {
    const validPolicy = {
      authorizingRoles: [UserRole.OWNER, UserRole.MANAGER],
      selfAuthorizationAllowedCloseBox: true,
      selfAuthorizationAllowedCashDrawer: true,
      selfAuthorizationAllowedManualDiscount: false,
      supervisorRequiredForModifierQuantity: false,
    };

    it('appends a new parameter version and bumps the config revision', async () => {
      await service.configurePolicy(tenantId, validPolicy, 'user-1');

      expect(mockManager.save).toHaveBeenCalledTimes(1);
      const saved = mockManager.save.mock.calls[0][1] as {
        paramKey: string;
        paramValue: Record<string, unknown>;
        version: number;
      };
      expect(saved.paramKey).toBe(SUPERVISION_POLICY_PARAM_KEY);
      expect(saved.paramValue).toEqual({
        authorizingRoles: ['MANAGER', 'OWNER'],
        selfAuthorizationAllowedCloseBox: true,
        selfAuthorizationAllowedCashDrawer: true,
        selfAuthorizationAllowedManualDiscount: false,
        supervisorRequiredForModifierQuantity: false,
      });
      // The revision bump is what makes the terminals pick it up.
      expect(
        fiscalConfigVersionService.recordRevisionChange,
      ).toHaveBeenCalledWith(tenantId, mockManager);
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'SUPERVISION_POLICY_UPDATED',
        expect.objectContaining({ tenantId, cleared: false }),
      );
    });

    it('refuses a policy that would make the shift close impossible', async () => {
      await expect(
        service.configurePolicy(
          tenantId,
          {
            ...validPolicy,
            authorizingRoles: [],
            selfAuthorizationAllowedCloseBox: false,
          },
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);

      expect(mockManager.save).not.toHaveBeenCalled();
      expect(
        fiscalConfigVersionService.recordRevisionChange,
      ).not.toHaveBeenCalled();
    });

    it('clears the policy with a superseding null tombstone', async () => {
      await service.configurePolicy(tenantId, null, 'user-1');

      const saved = mockManager.save.mock.calls[0][1] as {
        paramKey: string;
        paramValue: unknown;
      };
      expect(saved.paramKey).toBe(SUPERVISION_POLICY_PARAM_KEY);
      expect(saved.paramValue).toBeNull();
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'SUPERVISION_POLICY_UPDATED',
        expect.objectContaining({ cleared: true }),
      );
    });
  });
});
