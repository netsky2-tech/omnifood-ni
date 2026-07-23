import { Test, TestingModule } from '@nestjs/testing';
import { AuditController } from './audit.controller';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, QueryFailedError } from 'typeorm';
import { AuditLog } from '../entities/audit-log.entity';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { AuthGuard } from '../guards/auth.guard';
import { AuditVerificationService } from '../services/audit-verification.service';
import { AuditMetricsService } from '../services/audit-metrics.service';
import type { PushAuditLogsDto } from '../dto/identity.dto';
import * as crypto from 'crypto';
import { canonicalizeNumberFreeJson } from '../../../core/audit/v3/canonicalizer';
import { buildAuditV3Frame } from '../../../core/audit/v3/frame';
import { sha256LowerHex } from '../../../core/audit/v3/sha256';

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
  let verificationService: { verifyBatch: jest.Mock };

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
    verificationService = {
      verifyBatch: jest.fn((logs, requesterUserId) =>
        new AuditVerificationService(new AuditMetricsService()).verifyBatch(
          logs as PushAuditLogsDto['logs'],
          requesterUserId as string,
        ),
      ),
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
        {
          provide: AuditVerificationService,
          useValue: verificationService,
        },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .compile();

    controller = module.get<AuditController>(AuditController);
  });

  describe('pushLogs', () => {
    it('runs version verification before creating a transaction', async () => {
      verificationService.verifyBatch.mockImplementation(() => {
        throw new BadRequestException('invalid version');
      });
      const dto = {
        logs: [
          {
            id: 'version-invalid',
            action: 'DRAWER_OPEN',
            timestamp: '2023-01-01T00:00:00.000Z',
            device_id: 'dev_1',
            sequence_no: 1,
            prev_hash: 'GENESIS',
            entry_hash: 'untrusted',
            hash_version: null,
          },
        ],
      };

      await expect(
        controller.pushLogs('tenant_1', dto as PushAuditLogsDto, {
          user: { sub: 'user_1' },
        }),
      ).rejects.toThrow('invalid version');
      expect(verificationService.verifyBatch).toHaveBeenCalledWith(
        dto.logs,
        'user_1',
      );
      expect(mockDataSource.createQueryRunner).not.toHaveBeenCalled();
    });

    it('persists a verified mixed-version batch through existing continuity logic', async () => {
      const payload = (sequence: number, previous: string): string =>
        `user_1|DRAWER_OPEN|dev_1|2023-01-01T00:00:00.000Z|${sequence}|${previous}|null|null|{}`;
      const legacyHash = crypto
        .createHash('sha256')
        .update(payload(1, 'GENESIS'))
        .digest('hex');
      const v2Hash = crypto
        .createHash('sha256')
        .update(payload(2, legacyHash))
        .digest('hex');
      const canonical = canonicalizeNumberFreeJson(Buffer.from('{}'));
      if (!canonical.ok) throw new Error('v3 fixture canonicalization failed');
      const frame = buildAuditV3Frame(
        {
          user_id: 'user_1',
          resolved_action: 'DRAWER_OPEN',
          device_id: 'dev_1',
          timestamp: '2023-01-01T00:00:00.000Z',
          sequence_no: '3',
          prev_hash: v2Hash,
          metodo_autorizacion: { state: 'absent' },
          usuario_autorizador_id: { state: 'absent' },
        },
        canonical.value,
      );
      if (!frame.ok) throw new Error('v3 fixture frame failed');
      const logs = [
        {
          id: 'legacy',
          sequence_no: 1,
          prev_hash: 'GENESIS',
          entry_hash: legacyHash,
        },
        {
          id: 'v2',
          sequence_no: 2,
          prev_hash: legacyHash,
          entry_hash: v2Hash,
          hash_version: 'v2-canonical-json',
        },
        {
          id: 'v3',
          sequence_no: 3,
          prev_hash: v2Hash,
          entry_hash: sha256LowerHex(frame.value),
          hash_version: 'v3-jcs-rfc8785',
          metadata_raw: '{}',
        },
      ].map((log) => ({
        ...log,
        action: 'DRAWER_OPEN',
        timestamp: '2023-01-01T00:00:00.000Z',
        device_id: 'dev_1',
      }));

      const result = await controller.pushLogs(
        'tenant_1',
        { logs },
        {
          user: { sub: 'user_1' },
        },
      );

      expect(result).toEqual({ status: 'success', count: 3 });
      expect(mockQueryRunner.manager.insert).toHaveBeenCalledTimes(3);
      const insertCalls = mockQueryRunner.manager.insert.mock
        .calls as unknown as Array<[typeof AuditLog, Record<string, unknown>]>;
      const legacyInsert = insertCalls[0][1];
      expect(legacyInsert).not.toHaveProperty('hash_version');
      expect(mockQueryRunner.manager.insert).toHaveBeenNthCalledWith(
        2,
        AuditLog,
        expect.objectContaining({ hash_version: 'v2-canonical-json' }),
      );
      expect(mockQueryRunner.manager.insert).toHaveBeenNthCalledWith(
        3,
        AuditLog,
        expect.objectContaining({
          hash_version: 'v3-jcs-rfc8785',
          metadata: {},
        }),
      );
    });
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

    it('should keep ingest on INSERT-only path (compatible with immutable DB trigger)', async () => {
      const payload =
        'user_1|DRAWER_OPEN|dev_1|2023-01-01T00:00:00.000Z|1|GENESIS|PIN|supervisor_1|{}';
      const hash = crypto.createHash('sha256').update(payload).digest('hex');

      const dto = {
        logs: [
          {
            id: 'log-insert-only',
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
      expect(mockQueryRunner.manager.insert).toHaveBeenCalledTimes(1);
      expect(mockQueryRunner.manager.save).not.toHaveBeenCalled();
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
      expect(mockQueryRunner.manager.insert).toHaveBeenCalledWith(
        AuditLog,
        expect.not.objectContaining({ metadata_raw: legacyMetadata }),
      );
    });

    it('persists explicit metadata null as null rather than defaulting it to an object', async () => {
      const hash = crypto
        .createHash('sha256')
        .update(
          'user_1|DRAWER_OPEN|dev_1|2023-01-01T00:00:00.000Z|1|GENESIS|null|null|{}',
        )
        .digest('hex');

      await controller.pushLogs(
        'tenant_1',
        {
          logs: [
            {
              id: 'explicit-null-metadata',
              action: 'DRAWER_OPEN',
              timestamp: '2023-01-01T00:00:00.000Z',
              device_id: 'dev_1',
              sequence_no: 1,
              prev_hash: 'GENESIS',
              entry_hash: hash,
              metadata: null,
            },
          ],
        },
        { user: { sub: 'user_1' } },
      );

      expect(mockQueryRunner.manager.insert).toHaveBeenCalledWith(
        AuditLog,
        expect.objectContaining({ metadata: null }),
      );
    });

    it('persists authoritative v3 metadata_raw null as null', async () => {
      const canonical = canonicalizeNumberFreeJson(Buffer.from('null'));
      if (!canonical.ok) throw new Error('v3 null canonicalization failed');
      const frame = buildAuditV3Frame(
        {
          user_id: 'user_1',
          resolved_action: 'DRAWER_OPEN',
          device_id: 'dev_1',
          timestamp: '2023-01-01T00:00:00.000Z',
          sequence_no: '1',
          prev_hash: 'GENESIS',
          metodo_autorizacion: { state: 'absent' },
          usuario_autorizador_id: { state: 'absent' },
        },
        canonical.value,
      );
      if (!frame.ok) throw new Error('v3 null frame failed');

      await controller.pushLogs(
        'tenant_1',
        {
          logs: [
            {
              id: 'v3-null-metadata',
              action: 'DRAWER_OPEN',
              timestamp: '2023-01-01T00:00:00.000Z',
              device_id: 'dev_1',
              sequence_no: 1,
              prev_hash: 'GENESIS',
              entry_hash: sha256LowerHex(frame.value),
              hash_version: 'v3-jcs-rfc8785',
              metadata_raw: 'null',
            },
          ],
        },
        { user: { sub: 'user_1' } },
      );

      expect(mockQueryRunner.manager.insert).toHaveBeenCalledWith(
        AuditLog,
        expect.objectContaining({ metadata: null }),
      );
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

    it('rolls back a failed offline persistence attempt and accepts its retry', async () => {
      const hash = crypto
        .createHash('sha256')
        .update(
          'user_1|DRAWER_OPEN|dev_1|2023-01-01T00:00:00.000Z|1|GENESIS|null|null|{}',
        )
        .digest('hex');
      const dto = {
        logs: [
          {
            id: 'offline-retry',
            action: 'DRAWER_OPEN',
            timestamp: '2023-01-01T00:00:00.000Z',
            device_id: 'dev_1',
            sequence_no: 1,
            prev_hash: 'GENESIS',
            entry_hash: hash,
          },
        ],
      };
      mockQueryRunner.manager.insert.mockRejectedValueOnce(
        new Error('temporary persistence failure'),
      );

      await expect(
        controller.pushLogs('tenant_1', dto, { user: { sub: 'user_1' } }),
      ).rejects.toThrow('temporary persistence failure');
      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
      expect(mockQueryRunner.commitTransaction).not.toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalledTimes(1);

      await expect(
        controller.pushLogs('tenant_1', dto, { user: { sub: 'user_1' } }),
      ).resolves.toEqual({ status: 'success', count: 1 });
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalledTimes(1);
      expect(mockQueryRunner.manager.insert).toHaveBeenCalledTimes(2);
    });

    it('acknowledges an identical committed replay without appending a duplicate', async () => {
      const hash = crypto
        .createHash('sha256')
        .update(
          'user_1|DRAWER_OPEN|dev_1|2023-01-01T00:00:00.000Z|1|GENESIS|null|null|{}',
        )
        .digest('hex');
      const dto = {
        logs: [
          {
            id: 'committed-offline-batch',
            action: 'DRAWER_OPEN',
            timestamp: '2023-01-01T00:00:00.000Z',
            device_id: 'dev_1',
            sequence_no: 1,
            prev_hash: 'GENESIS',
            entry_hash: hash,
          },
        ],
      };
      const request = { user: { sub: 'user_1' } };

      await expect(
        controller.pushLogs('tenant_1', dto, request),
      ).resolves.toEqual({ status: 'success', count: 1 });
      mockQueryRunner.manager.findOne.mockResolvedValue({
        sequence_no: 1,
        entry_hash: hash,
      });

      await expect(
        controller.pushLogs('tenant_1', dto, request),
      ).resolves.toEqual({ status: 'success', count: 1 });
      expect(mockQueryRunner.manager.insert).toHaveBeenCalledTimes(1);
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalledTimes(2);
      expect(mockQueryRunner.rollbackTransaction).not.toHaveBeenCalled();
      expect(mockQueryRunner.manager.findOne).toHaveBeenLastCalledWith(
        AuditLog,
        {
          where: {
            tenant_id: 'tenant_1',
            device_id: 'dev_1',
            user_id: 'user_1',
            sequence_no: 1,
            forensic_status: 'ACTIVE',
          },
        },
      );
    });

    it('rejects a replay sequence whose stored forensic hash differs', async () => {
      const hash = crypto
        .createHash('sha256')
        .update(
          'user_1|DRAWER_OPEN|dev_1|2023-01-01T00:00:00.000Z|1|GENESIS|null|null|{}',
        )
        .digest('hex');
      mockQueryRunner.manager.findOne.mockResolvedValue({
        sequence_no: 1,
        entry_hash: 'stored-forensic-hash',
      });

      await expect(
        controller.pushLogs(
          'tenant_1',
          {
            logs: [
              {
                id: 'tampered-replay',
                action: 'DRAWER_OPEN',
                timestamp: '2023-01-01T00:00:00.000Z',
                device_id: 'dev_1',
                sequence_no: 1,
                prev_hash: 'GENESIS',
                entry_hash: hash,
              },
            ],
          },
          { user: { sub: 'user_1' } },
        ),
      ).rejects.toThrow(ConflictException);
      expect(mockQueryRunner.manager.insert).not.toHaveBeenCalled();
      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
    });

    it('skips an identical replay prefix and appends only its contiguous new tail', async () => {
      const firstHash = crypto
        .createHash('sha256')
        .update(
          'user_1|DRAWER_OPEN|dev_1|2023-01-01T00:00:00.000Z|1|GENESIS|null|null|{}',
        )
        .digest('hex');
      const secondHash = crypto
        .createHash('sha256')
        .update(
          `user_1|DRAWER_OPEN|dev_1|2023-01-01T00:00:00.000Z|2|${firstHash}|null|null|{}`,
        )
        .digest('hex');
      mockQueryRunner.manager.findOne.mockResolvedValue({
        sequence_no: 1,
        entry_hash: firstHash,
      });
      const logs = [
        {
          id: 'replayed-prefix',
          action: 'DRAWER_OPEN',
          timestamp: '2023-01-01T00:00:00.000Z',
          device_id: 'dev_1',
          sequence_no: 1,
          prev_hash: 'GENESIS',
          entry_hash: firstHash,
        },
        {
          id: 'new-tail',
          action: 'DRAWER_OPEN',
          timestamp: '2023-01-01T00:00:00.000Z',
          device_id: 'dev_1',
          sequence_no: 2,
          prev_hash: firstHash,
          entry_hash: secondHash,
        },
      ];

      await expect(
        controller.pushLogs('tenant_1', { logs }, { user: { sub: 'user_1' } }),
      ).resolves.toEqual({ status: 'success', count: 2 });
      expect(mockQueryRunner.manager.insert).toHaveBeenCalledTimes(1);
      expect(mockQueryRunner.manager.insert).toHaveBeenCalledWith(
        AuditLog,
        expect.objectContaining({ id: 'new-tail', sequence_no: 2 }),
      );
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalledTimes(1);
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
