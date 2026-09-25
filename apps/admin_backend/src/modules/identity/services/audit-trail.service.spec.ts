import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AuditTrailService } from './audit-trail.service';
import { TENANT_CONTEXT_SET_CONFIG_SQL } from '../../../core/database/tenant-transaction';
import { AuditLog } from '../entities/audit-log.entity';
import { User, UserRole } from '../entities/user.entity';
import { AppPermission } from '../security/permissions.enum';

describe('AuditTrailService (Slice 10.3)', () => {
  let service: AuditTrailService;

  const mockQueryBuilder = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn(),
  };

  // Issue #581: every access below resolves through the tenant-bound
  // transaction manager, which hands back this functional repository mock,
  // so the behavioral assertions keep working unchanged.
  const auditRepository = {
    createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
    save: jest.fn(),
    findOne: jest.fn(),
  };

  // Pooled tripwire: any call here means an audit read/write escaped the
  // bound transaction and would break the moment `audit_logs` is promoted
  // to direct:SIUD RLS (#512 T3 slice 7).
  const pooledAuditRepository = {
    createQueryBuilder: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
  };

  const userRepository = {
    findOne: jest.fn(),
  };

  const manager = {
    query: jest.fn(),
    getRepository: jest.fn(),
  };
  const dataSource = {
    transaction: jest.fn(),
  };

  const testTenantId = 'tenant-1111';

  beforeEach(async () => {
    jest.clearAllMocks();
    auditRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);
    manager.query.mockResolvedValue([]);
    manager.getRepository.mockImplementation((entity: unknown) => {
      if (entity === AuditLog) return auditRepository;
      throw new Error(
        `Unexpected repository request: ${(entity as { name?: string })?.name ?? typeof entity}`,
      );
    });
    dataSource.transaction.mockImplementation(
      (work: (transactionManager: typeof manager) => Promise<unknown>) =>
        work(manager),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditTrailService,
        {
          provide: getRepositoryToken(AuditLog),
          useValue: pooledAuditRepository,
        },
        { provide: getRepositoryToken(User), useValue: userRepository },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get<AuditTrailService>(AuditTrailService);
  });

  describe('tenant transaction binding (issue #581)', () => {
    it('binds the tenant context on every access; pooled repo stays silent', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);
      auditRepository.findOne.mockResolvedValue(null);
      auditRepository.save.mockResolvedValue({ id: 'audit-1' });

      await service.queryOverrides({}, testTenantId);
      await service.queryDrawerOpens({}, testTenantId);
      await service.recordManualDrawerOpen(
        { terminalId: 'POS-01', reason: 'AUDIT_COUNT' },
        testTenantId,
        'cashier-1',
      );

      // Each method opens its own tenant-bound transaction and binds the
      // tenant context with the production set_config SQL.
      expect(dataSource.transaction).toHaveBeenCalledTimes(3);
      expect(manager.query).toHaveBeenCalledWith(
        TENANT_CONTEXT_SET_CONFIG_SQL,
        [testTenantId],
      );

      // RUNTIME TEETH: the pooled repository tripwire stayed silent.
      expect(pooledAuditRepository.createQueryBuilder).not.toHaveBeenCalled();
      expect(pooledAuditRepository.findOne).not.toHaveBeenCalled();
      expect(pooledAuditRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('queryOverrides', () => {
    it('queries supervisor override audit stream filtered by tenant, dates, supervisor and permission', async () => {
      const mockLogs: Partial<AuditLog>[] = [
        {
          id: 'log-1',
          action: 'SUPERVISOR_OVERRIDE_APPROVED',
          tenant_id: testTenantId,
          user_id: 'cashier-1',
          usuario_autorizador_id: 'supervisor-1',
          metodo_autorizacion: 'PIN',
          device_id: 'POS-01',
          timestamp: new Date('2026-08-26T10:00:00Z'),
          metadata: { permissionRequired: AppPermission.SALES_VOID_INVOICE },
        },
      ];

      mockQueryBuilder.getManyAndCount.mockResolvedValue([mockLogs, 1]);

      const result = await service.queryOverrides(
        {
          startDate: '2026-08-26T00:00:00Z',
          endDate: '2026-08-26T23:59:59Z',
          supervisorId: 'supervisor-1',
          permission: AppPermission.SALES_VOID_INVOICE,
          limit: 10,
          offset: 0,
        },
        testTenantId,
      );

      expect(auditRepository.createQueryBuilder).toHaveBeenCalledWith('audit');
      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'audit.tenant_id = :tenantId',
        { tenantId: testTenantId },
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('action IN (:...overrideActions)'),
        expect.any(Object),
      );
      expect(result.total).toBe(1);
      expect(result.items.length).toBe(1);
      expect(result.items[0].id).toBe('log-1');
      expect(result.items[0].action).toBe('SUPERVISOR_OVERRIDE_APPROVED');
    });
  });

  describe('queryDrawerOpens', () => {
    it('queries manual cash drawer opening logs with reason filter (DEC-10.4)', async () => {
      const mockLogs: Partial<AuditLog>[] = [
        {
          id: 'log-drawer-1',
          action: 'DRAWER_OPENED_MANUALLY',
          tenant_id: testTenantId,
          user_id: 'cashier-1',
          usuario_autorizador_id: 'supervisor-1',
          metodo_autorizacion: 'PIN',
          device_id: 'POS-MAIN',
          timestamp: new Date('2026-08-26T14:30:00Z'),
          metadata: { reason: 'CHANGE_REPLENISHMENT' },
        },
      ];

      mockQueryBuilder.getManyAndCount.mockResolvedValue([mockLogs, 1]);

      const result = await service.queryDrawerOpens(
        {
          terminalId: 'POS-MAIN',
          reason: 'CHANGE_REPLENISHMENT',
          limit: 5,
        },
        testTenantId,
      );

      expect(auditRepository.createQueryBuilder).toHaveBeenCalledWith('audit');
      expect(result.total).toBe(1);
      expect(result.items[0].device_id).toBe('POS-MAIN');
      expect(result.items[0].metadata).toEqual({
        reason: 'CHANGE_REPLENISHMENT',
      });
    });
  });

  describe('recordManualDrawerOpen (INV-10.3 & DEC-10.4)', () => {
    it('persists an immutable audit log entry for manual drawer open', async () => {
      userRepository.findOne.mockResolvedValue({
        id: 'cashier-1',
        name: 'Carlos Cashier',
        role: UserRole.CASHIER,
        tenant_id: testTenantId,
      });

      auditRepository.findOne.mockResolvedValue(null); // first in sequence
      auditRepository.save.mockImplementation(async (entity: AuditLog) => ({
        ...entity,
        id: 'generated-uuid',
      }));

      const entry = await service.recordManualDrawerOpen(
        {
          terminalId: 'POS-01',
          reason: 'AUDIT_COUNT',
          notes: 'Conteo de efectivo',
          supervisorId: 'sup-1',
          metodoAutorizacion: 'PIN',
        },
        testTenantId,
        'cashier-1',
      );

      expect(entry).toBeDefined();
      expect(auditRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'DRAWER_OPENED_MANUALLY',
          target_type: 'CASH_DRAWER',
          device_id: 'POS-01',
          tenant_id: testTenantId,
          user_id: 'cashier-1',
          usuario_autorizador_id: 'sup-1',
          metodo_autorizacion: 'PIN',
          metadata: expect.objectContaining({
            reason: 'AUDIT_COUNT',
            notes: 'Conteo de efectivo',
          }),
        }),
      );
    });

    it('covers the hash-chain read and the append in ONE tenant-bound transaction (issue #581)', async () => {
      auditRepository.findOne.mockResolvedValue({
        sequence_no: 5,
        entry_hash: 'hash-of-entry-5',
      });
      auditRepository.save.mockImplementation(async (log: unknown) => log);

      await service.recordManualDrawerOpen(
        { terminalId: 'POS-01', reason: 'AUDIT_COUNT' },
        testTenantId,
        'cashier-1',
      );

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(auditRepository.findOne).toHaveBeenCalledWith({
        where: {
          tenant_id: testTenantId,
          device_id: 'POS-01',
          user_id: 'cashier-1',
          forensic_status: 'ACTIVE',
        },
        order: { sequence_no: 'DESC' },
      });
      expect(auditRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          sequence_no: 6,
          prev_hash: 'hash-of-entry-5',
        }),
      );
    });
  });
});
