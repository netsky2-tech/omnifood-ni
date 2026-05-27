import { Test, TestingModule } from '@nestjs/testing';
import { AuditController } from './audit.controller';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, QueryFailedError } from 'typeorm';
import { AuditLog } from '../entities/audit-log.entity';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { AuthGuard } from '../guards/auth.guard';
import type { PushAuditLogsDto } from '../dto/identity.dto';
import * as crypto from 'crypto';

type AuthenticatedRequest = { user: { sub: string } };

type AuditRepositoryMock = {
  save: jest.Mock;
  findOne: jest.Mock;
};

type QueryRunnerMock = {
  connect: jest.Mock;
  startTransaction: jest.Mock;
  commitTransaction: jest.Mock;
  rollbackTransaction: jest.Mock;
  release: jest.Mock;
  query: jest.Mock;
  manager: {
    findOne: jest.Mock;
    save: jest.Mock;
    insert: jest.Mock;
  };
};

type DataSourceMock = {
  createQueryRunner: jest.Mock;
};

describe('AuditController', () => {
  let controller: AuditController;
  let mockRepo: jest.Mocked<AuditRepositoryMock>;
  let mockQueryRunner: jest.Mocked<QueryRunnerMock>;
  let mockDataSource: jest.Mocked<DataSourceMock>;

  beforeEach(async () => {
    mockRepo = {
      save: jest.fn(),
      findOne: jest.fn(),
    };
    mockRepo.findOne.mockResolvedValue(null);

    mockQueryRunner = {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      query: jest.fn(),
      manager: {
        findOne: jest.fn(),
        save: jest.fn(),
        insert: jest.fn(),
      },
    };
    mockQueryRunner.manager.findOne.mockResolvedValue(null);
    mockDataSource = {
      createQueryRunner: jest.fn(() => mockQueryRunner),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuditController],
      providers: [
        {
          provide: getRepositoryToken(AuditLog),
          useValue: mockRepo,
        },
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .compile();

    controller = module.get<AuditController>(AuditController);
  });

  describe('pushLogs', () => {
    it('should reject logs missing both action and tipo_accion', async () => {
      const dto = {
        logs: [
          {
            id: 'log-missing-action',
            timestamp: '2023-01-01T00:00:00.000Z',
            device_id: 'dev_1',
            sequence_no: 1,
            prev_hash: 'GENESIS',
            entry_hash: 'any',
          },
        ],
      };

      const req: AuthenticatedRequest = { user: { sub: 'user_1' } };

      await expect(controller.pushLogs('tenant_1', dto, req)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject logs with invalid forensic chain', async () => {
      const dto = {
        logs: [
          {
            id: 'log-1',
            action: 'DRAWER_OPEN',
            timestamp: new Date().toISOString(),
            device_id: 'dev_1',
            sequence_no: 2,
            prev_hash: 'abc',
            entry_hash: 'invalid_hash',
          },
        ],
      };

      const req: AuthenticatedRequest = { user: { sub: 'user_1' } };

      await expect(
        controller.pushLogs('tenant_1', dto as PushAuditLogsDto, req),
      ).rejects.toThrow(BadRequestException);
    });

    it('should save logs with valid forensic chain', async () => {
      // Create a valid hash manually for testing or mock the hash function.
      const payload =
        'user_1|DRAWER_OPEN|dev_1|2023-01-01T00:00:00.000Z|1|GENESIS|PIN|supervisor_1|{}';
      const hash = crypto.createHash('sha256').update(payload).digest('hex');

      const dto = {
        logs: [
          {
            id: 'log-2',
            action: 'DRAWER_OPEN',
            timestamp: '2023-01-01T00:00:00.000Z',
            device_id: 'dev_1',
            sequence_no: 1,
            prev_hash: 'GENESIS',
            entry_hash: hash,
            metodo_autorizacion: 'PIN',
            usuario_autorizador_id: 'supervisor_1',
            metadata: {},
          },
        ],
      };

      const req: AuthenticatedRequest = { user: { sub: 'user_1' } };

      const result = await controller.pushLogs('tenant_1', dto, req);

      expect(result).toEqual({ status: 'success', count: 1 });
      expect(mockQueryRunner.manager.insert).toHaveBeenCalled();
    });

    it('should reject out-of-order sequence continuity on persistence path', async () => {
      mockQueryRunner.manager.findOne.mockResolvedValue({
        sequence_no: 4,
        entry_hash: 'persisted-prev-hash',
      });
      const payload =
        'user_1|DRAWER_OPEN|dev_1|2023-01-01T00:00:00.000Z|6|persisted-prev-hash|PIN|supervisor_1|{}';
      const hash = crypto.createHash('sha256').update(payload).digest('hex');

      const dto = {
        logs: [
          {
            id: 'log-out-of-order',
            action: 'DRAWER_OPEN',
            timestamp: '2023-01-01T00:00:00.000Z',
            device_id: 'dev_1',
            sequence_no: 6,
            prev_hash: 'persisted-prev-hash',
            entry_hash: hash,
            metodo_autorizacion: 'PIN',
            usuario_autorizador_id: 'supervisor_1',
            metadata: {},
          },
        ],
      };

      const req: AuthenticatedRequest = { user: { sub: 'user_1' } };

      await expect(
        controller.pushLogs('tenant_1', dto as PushAuditLogsDto, req),
      ).rejects.toThrow('Out-of-order forensic sequence');
      expect(mockQueryRunner.manager.findOne).toHaveBeenCalled();
      expect(mockQueryRunner.manager.insert).not.toHaveBeenCalled();
    });

    it('should reject broken prev_hash linkage against latest persisted record', async () => {
      mockQueryRunner.manager.findOne.mockResolvedValue({
        sequence_no: 4,
        entry_hash: 'persisted-prev-hash',
      });
      const payload =
        'user_1|DRAWER_OPEN|dev_1|2023-01-01T00:00:00.000Z|5|wrong-prev-hash|PIN|supervisor_1|{}';
      const hash = crypto.createHash('sha256').update(payload).digest('hex');

      const dto = {
        logs: [
          {
            id: 'log-broken-chain',
            action: 'DRAWER_OPEN',
            timestamp: '2023-01-01T00:00:00.000Z',
            device_id: 'dev_1',
            sequence_no: 5,
            prev_hash: 'wrong-prev-hash',
            entry_hash: hash,
            metodo_autorizacion: 'PIN',
            usuario_autorizador_id: 'supervisor_1',
            metadata: {},
          },
        ],
      };

      const req: AuthenticatedRequest = { user: { sub: 'user_1' } };

      await expect(
        controller.pushLogs('tenant_1', dto as PushAuditLogsDto, req),
      ).rejects.toThrow('Broken forensic chain');
      expect(mockQueryRunner.manager.insert).not.toHaveBeenCalled();
    });

    it('should accept forensic logs using tipo_accion legacy-compatible read path', async () => {
      const payload =
        'user_1|DRAWER_OPEN|dev_1|2023-01-01T00:00:00.000Z|1|GENESIS|PIN|supervisor_1|{}';
      const hash = crypto.createHash('sha256').update(payload).digest('hex');

      const dto = {
        logs: [
          {
            id: 'log-3',
            tipo_accion: 'DRAWER_OPEN',
            timestamp: '2023-01-01T00:00:00.000Z',
            device_id: 'dev_1',
            sequence_no: 1,
            prev_hash: 'GENESIS',
            entry_hash: hash,
            metodo_autorizacion: 'PIN',
            usuario_autorizador_id: 'supervisor_1',
            metadata: {},
          },
        ],
      };

      const req: AuthenticatedRequest = { user: { sub: 'user_1' } };

      const result = await controller.pushLogs('tenant_1', dto, req);

      expect(result).toEqual({ status: 'success', count: 1 });
      expect(mockQueryRunner.manager.insert).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          action: 'DRAWER_OPEN',
        }),
      );
    });

    it('should accept legacy hash when metadata_raw matches original plain-text payload', async () => {
      const legacyMetadata = 'drawer opened without structured payload';
      const payload = `user_1|DRAWER_OPENED_MANUALLY|dev_1|2023-01-01T00:00:00.000Z|1|GENESIS|PIN|supervisor_1|${legacyMetadata}`;
      const hash = crypto.createHash('sha256').update(payload).digest('hex');

      const dto = {
        logs: [
          {
            id: 'log-legacy-1',
            action: 'DRAWER_OPENED_MANUALLY',
            timestamp: '2023-01-01T00:00:00.000Z',
            device_id: 'dev_1',
            sequence_no: 1,
            prev_hash: 'GENESIS',
            entry_hash: hash,
            metodo_autorizacion: 'PIN',
            usuario_autorizador_id: 'supervisor_1',
            metadata: { raw_text: legacyMetadata },
            metadata_raw: legacyMetadata,
          },
        ],
      };

      const req: AuthenticatedRequest = { user: { sub: 'user_1' } };
      const result = await controller.pushLogs('tenant_1', dto, req);

      expect(result).toEqual({ status: 'success', count: 1 });
      expect(mockQueryRunner.manager.insert).toHaveBeenCalled();
    });

    it('should accept valid offline multi-operator log hashed with payload actor user_id (not requester)', async () => {
      mockQueryRunner.manager.findOne.mockResolvedValue({
        sequence_no: 4,
        entry_hash: 'prev-hash',
      });
      const payload =
        'operator_2|DRAWER_OPEN|dev_1|2023-01-01T00:00:00.000Z|5|prev-hash|PIN|supervisor_1|{}';
      const hash = crypto.createHash('sha256').update(payload).digest('hex');

      const dto = {
        logs: [
          {
            id: 'log-offline-multi-operator',
            user_id: 'operator_2',
            action: 'DRAWER_OPEN',
            timestamp: '2023-01-01T00:00:00.000Z',
            device_id: 'dev_1',
            sequence_no: 5,
            prev_hash: 'prev-hash',
            entry_hash: hash,
            metodo_autorizacion: 'PIN',
            usuario_autorizador_id: 'supervisor_1',
            metadata: {},
          },
        ],
      };

      const req: AuthenticatedRequest = {
        user: { sub: 'sync-requester-user' },
      };
      const result = await controller.pushLogs('tenant_1', dto, req);

      expect(result).toEqual({ status: 'success', count: 1 });
      expect(mockQueryRunner.manager.insert).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          user_id: 'operator_2',
        }),
      );
    });

    it('should return conflict when insert hits duplicate forensic row id', async () => {
      const payload =
        'user_1|DRAWER_OPEN|dev_1|2023-01-01T00:00:00.000Z|1|GENESIS|PIN|supervisor_1|{}';
      const hash = crypto.createHash('sha256').update(payload).digest('hex');
      const driverError: Error & { code: string; constraint: string } =
        Object.assign(
          new Error('duplicate key value violates unique constraint'),
          {
            code: '23505',
            constraint: 'PK_audit_logs_id',
          },
        );
      mockQueryRunner.manager.insert.mockRejectedValue(
        new QueryFailedError('INSERT INTO audit_logs ...', [], driverError),
      );

      const dto = {
        logs: [
          {
            id: 'existing-forensic-id',
            action: 'DRAWER_OPEN',
            timestamp: '2023-01-01T00:00:00.000Z',
            device_id: 'dev_1',
            sequence_no: 1,
            prev_hash: 'GENESIS',
            entry_hash: hash,
            metodo_autorizacion: 'PIN',
            usuario_autorizador_id: 'supervisor_1',
            metadata: {},
          },
        ],
      };

      const req: AuthenticatedRequest = { user: { sub: 'user_1' } };

      await expect(
        controller.pushLogs('tenant_1', dto as PushAuditLogsDto, req),
      ).rejects.toThrow(ConflictException);
    });

    it('should return conflict when insert hits duplicate forensic stream sequence', async () => {
      const payload =
        'user_1|DRAWER_OPEN|dev_1|2023-01-01T00:00:00.000Z|1|GENESIS|PIN|supervisor_1|{}';
      const hash = crypto.createHash('sha256').update(payload).digest('hex');
      const driverError: Error & { code: string; constraint: string } =
        Object.assign(new Error('duplicate stream sequence'), {
          code: '23505',
          constraint: 'uq_audit_stream_sequence_active',
        });
      mockQueryRunner.manager.insert.mockRejectedValue(
        new QueryFailedError('INSERT INTO audit_logs ...', [], driverError),
      );

      const dto = {
        logs: [
          {
            id: 'different-id-same-sequence',
            action: 'DRAWER_OPEN',
            timestamp: '2023-01-01T00:00:00.000Z',
            device_id: 'dev_1',
            sequence_no: 1,
            prev_hash: 'GENESIS',
            entry_hash: hash,
            metodo_autorizacion: 'PIN',
            usuario_autorizador_id: 'supervisor_1',
            metadata: {},
          },
        ],
      };

      const req: AuthenticatedRequest = { user: { sub: 'user_1' } };

      await expect(
        controller.pushLogs('tenant_1', dto as PushAuditLogsDto, req),
      ).rejects.toThrow('Duplicate forensic stream sequence detected');
    });
  });
});
