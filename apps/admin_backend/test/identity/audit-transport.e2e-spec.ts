import 'reflect-metadata';
import { Controller, Module } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { AuditController } from '../../src/modules/identity/controllers/audit.controller';
import { AuditLog } from '../../src/modules/identity/entities/audit-log.entity';
import { AuthGuard } from '../../src/modules/identity/guards/auth.guard';
import { RolesGuard } from '../../src/modules/identity/guards/roles.guard';
import { SyncTransportGuard } from '../../src/modules/identity/guards/sync-transport.guard';
import { SYNC_SCOPES_KEY } from '../../src/modules/identity/decorators/sync-scopes.decorator';
import { ROLES_KEY } from '../../src/core/decorators/roles.decorator';
import { AuditTrailService } from '../../src/modules/identity/services/audit-trail.service';
import { AuditVerificationService } from '../../src/modules/identity/services/audit-verification.service';
import type { PushAuditLogsDto } from '../../src/modules/identity/dto/identity.dto';
import {
  enumerateAppRoutes,
  TRANSPORT_DECLARATIONS,
  verifyRouteTransportRegistry,
} from '../support/route-transport-registry';

type QueryRunnerMock = {
  connect: jest.Mock;
  startTransaction: jest.Mock;
  commitTransaction: jest.Mock;
  rollbackTransaction: jest.Mock;
  release: jest.Mock;
  query: jest.Mock;
  manager: {
    findOne: jest.Mock;
    insert: jest.Mock;
  };
};

/**
 * D-18 (part 2): POST /identity/audit is device-sync transport (the POS
 * pushes audit rows under a device-sync JWT, e.g. after offline-PIN unlock
 * when no cloud user session exists), while the read/drawer routes stay on
 * the human transport.
 */
describe('AuditController transport (D-18 part 2)', () => {
  const handlerOf = (method: string): ((...args: unknown[]) => unknown) => {
    const handler = AuditController.prototype[
      method as keyof AuditController
    ] as unknown as (...args: unknown[]) => unknown;
    expect(handler).toBeDefined();
    return handler;
  };

  it('declares POST push (empty subpath) as device sync transport with sync:push scope and no human guard', () => {
    const pushHandler = handlerOf('pushLogs');
    const guards = Reflect.getMetadata(GUARDS_METADATA, pushHandler) ?? [];
    expect(guards).toContain(SyncTransportGuard);
    expect(guards).not.toContain(AuthGuard);
    expect(Reflect.getMetadata(SYNC_SCOPES_KEY, pushHandler)).toEqual([
      'sync:push',
    ]);
  });

  it('keeps GET overrides and GET drawer-opens on the human transport with OWNER/MANAGER roles', () => {
    for (const method of ['getOverrides', 'getDrawerOpens']) {
      const handler = handlerOf(method);
      const guards = Reflect.getMetadata(GUARDS_METADATA, handler) ?? [];
      expect(guards).toContain(AuthGuard);
      expect(guards).toContain(RolesGuard);
      expect(guards).not.toContain(SyncTransportGuard);
      expect(Reflect.getMetadata(ROLES_KEY, handler)).toEqual([
        'OWNER',
        'MANAGER',
      ]);
    }
  });

  it('keeps POST drawer-opens on the human transport and gates it to OWNER/MANAGER (audit remediation S5)', () => {
    const handler = handlerOf('recordDrawerOpen');
    const guards = Reflect.getMetadata(GUARDS_METADATA, handler) ?? [];
    expect(guards).toContain(AuthGuard);
    expect(guards).toContain(RolesGuard);
    expect(guards).not.toContain(SyncTransportGuard);
    expect(Reflect.getMetadata(ROLES_KEY, handler)).toEqual([
      'OWNER',
      'MANAGER',
    ]);
  });

  it('declares GET stream-head as device sync transport with sync:push and sync:pull scopes and no human guard (#936)', () => {
    const headHandler = handlerOf('getStreamHead');
    const guards = Reflect.getMetadata(GUARDS_METADATA, headHandler) ?? [];
    expect(guards).toContain(SyncTransportGuard);
    expect(guards).not.toContain(AuthGuard);
    expect(Reflect.getMetadata(SYNC_SCOPES_KEY, headHandler)).toEqual([
      'sync:push',
      'sync:pull',
    ]);
  });

  it('classifies the enumerated AuditController routes with the registry and passes the contract', () => {
    @Controller('identity/audit')
    class AuditControllerFixture extends AuditController {}

    @Module({ controllers: [AuditControllerFixture] })
    class FixtureModule {}

    const routes = enumerateAppRoutes(FixtureModule).map((route) => ({
      ...route,
      controller: 'AuditController',
    }));
    expect(routes.length).toBe(5);

    const findings = verifyRouteTransportRegistry(
      routes,
      TRANSPORT_DECLARATIONS,
    ).filter((finding) => finding.controller === 'AuditController');
    expect(findings).toEqual([]);
  });

  describe('pushLogs over the device transport', () => {
    let controller: AuditController;
    let mockQueryRunner: jest.Mocked<QueryRunnerMock>;
    let verificationService: { verifyBatch: jest.Mock };

    beforeEach(async () => {
      mockQueryRunner = {
        connect: jest.fn(),
        startTransaction: jest.fn(),
        commitTransaction: jest.fn(),
        rollbackTransaction: jest.fn(),
        release: jest.fn(),
        query: jest.fn(),
        manager: {
          findOne: jest.fn().mockResolvedValue(null),
          insert: jest.fn().mockResolvedValue({}),
        },
      };
      verificationService = { verifyBatch: jest.fn() };

      const module: TestingModule = await Test.createTestingModule({
        controllers: [AuditController],
        providers: [
          {
            provide: getRepositoryToken(AuditLog),
            useValue: { findOne: jest.fn(), save: jest.fn() },
          },
          {
            provide: DataSource,
            useValue: { createQueryRunner: () => mockQueryRunner },
          },
          { provide: AuditTrailService, useValue: {} },
          { provide: AuditVerificationService, useValue: verificationService },
        ],
      })
        // Human routes still reference AuthGuard as a guard dependency and the
        // device route references SyncTransportGuard; the fixture stubs both
        // (no JWT machinery) — the metadata assertions above are what pin WHICH
        // routes carry which guard.
        .overrideGuard(AuthGuard)
        .useValue({ canActivate: () => true })
        .overrideGuard(SyncTransportGuard)
        .useValue({ canActivate: () => true })
        .compile();

      controller = module.get<AuditController>(AuditController);
    });

    it('accepts a device-sync principal with no user and attributes each log by its per-log user_id', async () => {
      const dto = {
        logs: [
          {
            id: 'log-cashier',
            user_id: 'cashier_1',
            action: 'SALE_CREATED',
            timestamp: '2026-03-01T12:00:00.000Z',
            device_id: 'term-1',
            sequence_no: 1,
            prev_hash: 'GENESIS',
            entry_hash: 'h1',
          },
          {
            id: 'log-supervisor',
            user_id: 'supervisor_2',
            action: 'DRAWER_OPEN',
            timestamp: '2026-03-01T12:01:00.000Z',
            device_id: 'term-1',
            sequence_no: 1,
            prev_hash: 'GENESIS',
            entry_hash: 'h2',
          },
        ],
      } as unknown as PushAuditLogsDto;

      // Offline-PIN kiosk session: no req.user at all, only the device
      // principal attached by SyncTransportGuard.
      await controller.pushLogs('tenant_1', dto, {
        devicePrincipal: { deviceId: 'term-1' },
      });

      expect(verificationService.verifyBatch).toHaveBeenCalledWith(
        dto.logs,
        'term-1',
      );
      expect(mockQueryRunner.manager.insert).toHaveBeenCalledTimes(2);
      const insertedUsers = mockQueryRunner.manager.insert.mock.calls.map(
        (call: unknown[]) => (call[1] as { user_id: string }).user_id,
      );
      expect(insertedUsers).toEqual(['cashier_1', 'supervisor_2']);
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
    });

    it('falls back to the device id as the actor when a log carries no user_id', async () => {
      const dto = {
        logs: [
          {
            id: 'log-device-actor',
            action: 'SYNC_TICK',
            timestamp: '2026-03-01T12:00:00.000Z',
            device_id: 'term-1',
            sequence_no: 1,
            prev_hash: 'GENESIS',
            entry_hash: 'h1',
          },
        ],
      } as unknown as PushAuditLogsDto;

      await controller.pushLogs('tenant_1', dto, {
        devicePrincipal: { deviceId: 'term-1' },
      });

      const inserted = mockQueryRunner.manager.insert.mock.calls[0][1] as {
        user_id: string;
      };
      expect(inserted.user_id).toBe('term-1');
    });

    it('still accepts a human principal request shape (compatibility with existing callers of the handler)', async () => {
      const dto = {
        logs: [
          {
            id: 'log-human',
            user_id: 'user_1',
            action: 'DRAWER_OPEN',
            timestamp: '2026-03-01T12:00:00.000Z',
            device_id: 'dev_1',
            sequence_no: 1,
            prev_hash: 'GENESIS',
            entry_hash: 'h1',
          },
        ],
      } as unknown as PushAuditLogsDto;

      await controller.pushLogs('tenant_1', dto, {
        user: { sub: 'user_1' },
      });

      expect(verificationService.verifyBatch).toHaveBeenCalledWith(
        dto.logs,
        'user_1',
      );
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
    });

    it('records AUDIT_BACKEND_TERMINAL_REJECTION and throws 409 with streamHead when replay conflict is detected (#936)', async () => {
      mockQueryRunner.manager.findOne.mockImplementation(
        (_entity: unknown, options: { where: { sequence_no: number } }) => {
          if (options.where.sequence_no === undefined) {
            // latest query
            return Promise.resolve({
              sequence_no: 19,
              entry_hash: 'cloud_hash_19',
            });
          }
          // existing sequence check
          return Promise.resolve({
            sequence_no: 1,
            entry_hash: 'different_cloud_hash_1',
          });
        },
      );

      const dto = {
        logs: [
          {
            id: 'conflicting-log',
            user_id: 'user_1',
            action: 'SALE_CREATED',
            timestamp: '2026-03-01T12:00:00.000Z',
            device_id: 'term-1',
            sequence_no: 1,
            prev_hash: 'GENESIS',
            entry_hash: 'local_hash_1',
          },
        ],
      } as unknown as PushAuditLogsDto;

      await expect(
        controller.pushLogs('tenant_1', dto, {
          devicePrincipal: { deviceId: 'term-1' },
        }),
      ).rejects.toThrow('Conflicting forensic replay detected');

      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
    });

    it('accepts AUDIT_STREAM_REANCHOR event followed by contiguous re-anchored logs (#936)', async () => {
      mockQueryRunner.manager.findOne.mockResolvedValueOnce({
        sequence_no: 19,
        entry_hash: 'cloud_hash_19',
      });

      const dto = {
        logs: [
          {
            id: 'reanchor-log',
            user_id: 'user_1',
            action: 'AUDIT_STREAM_REANCHOR',
            timestamp: '2026-03-01T12:00:00.000Z',
            device_id: 'term-1',
            sequence_no: 20,
            prev_hash: 'cloud_hash_19',
            entry_hash: 'reanchor_hash_20',
          },
          {
            id: 'reanchored-sale',
            user_id: 'user_1',
            action: 'SALE_CREATED',
            timestamp: '2026-03-01T12:01:00.000Z',
            device_id: 'term-1',
            sequence_no: 21,
            prev_hash: 'reanchor_hash_20',
            entry_hash: 'sale_hash_21',
          },
        ],
      } as unknown as PushAuditLogsDto;

      const result = await controller.pushLogs('tenant_1', dto, {
        devicePrincipal: { deviceId: 'term-1' },
      });

      expect(result).toEqual({ status: 'success', count: 2 });
      expect(mockQueryRunner.manager.insert).toHaveBeenCalledTimes(2);
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
    });
  });

  describe('getStreamHead (Issue #936)', () => {
    let controller: AuditController;
    let mockAuditRepo: { findOne: jest.Mock };

    beforeEach(async () => {
      mockAuditRepo = {
        findOne: jest.fn(),
      };

      const module: TestingModule = await Test.createTestingModule({
        controllers: [AuditController],
        providers: [
          {
            provide: getRepositoryToken(AuditLog),
            useValue: mockAuditRepo,
          },
          {
            provide: DataSource,
            useValue: {},
          },
          {
            provide: AuditTrailService,
            useValue: {},
          },
          {
            provide: AuditVerificationService,
            useValue: {},
          },
        ],
      })
        .overrideGuard(AuthGuard)
        .useValue({ canActivate: () => true })
        .overrideGuard(SyncTransportGuard)
        .useValue({ canActivate: () => true })
        .compile();

      controller = module.get<AuditController>(AuditController);
    });

    it('returns sequence_no: 0 and entry_hash: GENESIS when stream is empty', async () => {
      mockAuditRepo.findOne.mockResolvedValue(null);

      const result = await controller.getStreamHead(
        'tenant-1',
        'term-1',
        'user-1',
        { devicePrincipal: { deviceId: 'term-1' } },
      );

      expect(result).toEqual({
        sequence_no: 0,
        entry_hash: 'GENESIS',
        sequenceNo: 0,
        entryHash: 'GENESIS',
      });
      expect(mockAuditRepo.findOne).toHaveBeenCalledWith({
        where: {
          tenant_id: 'tenant-1',
          device_id: 'term-1',
          user_id: 'user-1',
          forensic_status: 'ACTIVE',
        },
        order: { sequence_no: 'DESC' },
      });
    });

    it('returns latest sequence_no and entry_hash when stream has records', async () => {
      mockAuditRepo.findOne.mockResolvedValue({
        sequence_no: 19,
        entry_hash: 'hash-19-entry',
      });

      const result = await controller.getStreamHead(
        'tenant-1',
        'term-1',
        'user-1',
        { devicePrincipal: { deviceId: 'term-1' } },
      );

      expect(result).toEqual({
        sequence_no: 19,
        entry_hash: 'hash-19-entry',
        sequenceNo: 19,
        entryHash: 'hash-19-entry',
      });
    });

    it('throws BadRequestException when userId is missing', async () => {
      await expect(
        controller.getStreamHead('tenant-1', 'term-1', '', {
          devicePrincipal: { deviceId: 'term-1' },
        }),
      ).rejects.toThrow('Missing userId');
    });

    it('throws ForbiddenException when deviceId does not match devicePrincipal', async () => {
      await expect(
        controller.getStreamHead('tenant-1', 'other-device', 'user-1', {
          devicePrincipal: { deviceId: 'term-1' },
        }),
      ).rejects.toThrow(
        'Device term-1 cannot query stream head for other-device',
      );
    });

    it('defaults deviceId to devicePrincipal.deviceId when query deviceId is omitted', async () => {
      mockAuditRepo.findOne.mockResolvedValue({
        sequence_no: 5,
        entry_hash: 'hash-5',
      });

      const result = await controller.getStreamHead(
        'tenant-1',
        undefined,
        'user-1',
        { devicePrincipal: { deviceId: 'term-1' } },
      );

      expect(result.sequence_no).toBe(5);
      expect(mockAuditRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ device_id: 'term-1' }),
        }),
      );
    });
  });
});
