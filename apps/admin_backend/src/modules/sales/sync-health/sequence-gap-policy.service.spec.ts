import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { InvoicesService } from '../services/invoices.service';
import { Invoice } from '../entities/invoice.entity';
import { InvoiceItem } from '../entities/invoice-item.entity';
import { Payment } from '../entities/payment.entity';
import { SyncBatchRecordDto } from '../dto/sync-batch.dto';
import { InventoryMovement } from '../../inventory/entities/inventory-movement.entity';
import { InventorySyncReceipt } from '../../inventory/entities/inventory-sync-receipt.entity';
import { InventorySyncOutbox } from '../../inventory/entities/inventory-sync-outbox.entity';
import { RecipeService } from '../../inventory/recipe.service';
import { BomExplosionService } from '../../inventory/bom-explosion.service';
import { DataSource } from 'typeorm';
import { User } from '../../identity/entities/user.entity';
import { ChangeLogService } from '../../audit/change-log.service';
import {
  DEFAULT_SEQUENCE_GAP_GRACE_WINDOW_MINUTES,
  SequenceGapPolicyService,
  SYNC_SEQUENCE_GAP_GRACE_WINDOW_MINUTES_ENV_VAR,
  resolveSequenceGapGraceWindowMinutes,
} from './sequence-gap-policy.service';

/**
 * Sequence-gap policy for the sales sync ingest.
 *
 * A lost source_sequence number permanently blocks a device stream: the
 * missing record never arrives, the watermark never moves, and every later
 * record is staged STAGED_FUTURE forever. This policy declares an
 * unrecoverable gap explicitly (auditable fill receipts) after a grace
 * window, so the stream can advance past it — never silently.
 */
describe('sequence gap policy', () => {
  describe('resolveSequenceGapGraceWindowMinutes', () => {
    it('defaults to 60 minutes when the env var is absent', () => {
      expect(resolveSequenceGapGraceWindowMinutes({})).toBe(
        DEFAULT_SEQUENCE_GAP_GRACE_WINDOW_MINUTES,
      );
      expect(DEFAULT_SEQUENCE_GAP_GRACE_WINDOW_MINUTES).toBe(60);
    });

    it('reads the configured value from the env var', () => {
      expect(
        resolveSequenceGapGraceWindowMinutes({
          [SYNC_SEQUENCE_GAP_GRACE_WINDOW_MINUTES_ENV_VAR]: '120',
        }),
      ).toBe(120);
    });

    it('falls back to the default on non-numeric, zero, negative, or fractional values', () => {
      const env = (value: string) => ({
        [SYNC_SEQUENCE_GAP_GRACE_WINDOW_MINUTES_ENV_VAR]: value,
      });
      expect(resolveSequenceGapGraceWindowMinutes(env('abc'))).toBe(60);
      expect(resolveSequenceGapGraceWindowMinutes(env('0'))).toBe(60);
      expect(resolveSequenceGapGraceWindowMinutes(env('-5'))).toBe(60);
      expect(resolveSequenceGapGraceWindowMinutes(env('2.5'))).toBe(60);
    });
  });

  describe('ingest integration (through InvoicesService.syncBatch)', () => {
    let service: InvoicesService;
    let policy: SequenceGapPolicyService;
    let receiptRepo: {
      findOne: jest.Mock;
      create: jest.Mock;
      save: jest.Mock;
      insert: jest.Mock;
    };
    let outboxRepo: {
      findOne: jest.Mock;
      create: jest.Mock;
      save: jest.Mock;
      delete: jest.Mock;
    };
    let changeLogService: { log: jest.Mock };
    let txManager: {
      query: jest.Mock;
      save: jest.Mock;
      getRepository: jest.Mock;
      createQueryBuilder: jest.Mock;
    };
    let receiptsBySequence: Map<string, Record<string, unknown>>;
    let oldestStagedRow: Record<string, unknown> | null;

    const HOUR_MS = 60 * 60 * 1000;

    const makeRecord = (
      overrides: Partial<SyncBatchRecordDto>,
    ): SyncBatchRecordDto => ({
      idempotencyKey: 'gap-policy-record',
      sourceDeviceId: 'd1',
      sourceSequence: 8,
      flowType: 'inventory',
      documentType: 'PURCHASE',
      movements: [{ insumoId: 'ins-1', quantity: 3, unitCostNio: 7 }],
      ...overrides,
    });

    beforeEach(async () => {
      receiptsBySequence = new Map();
      oldestStagedRow = null;

      const invoiceRepo = {
        upsert: jest.fn(),
        find: jest.fn().mockResolvedValue([]),
        findOne: jest.fn().mockResolvedValue(null),
      };
      const itemRepo = { upsert: jest.fn(), find: jest.fn().mockResolvedValue([]) };
      const paymentRepo = { upsert: jest.fn(), find: jest.fn().mockResolvedValue([]) };
      const userRepo = { findOne: jest.fn().mockResolvedValue(null) };
      const movementRepo = {
        create: jest.fn((x: unknown) => x),
        save: jest.fn(),
      };

      receiptRepo = {
        findOne: jest.fn(),
        create: jest.fn((x: unknown) => x),
        save: jest.fn(),
        insert: jest.fn().mockResolvedValue({ identifiers: [] }),
      };
      outboxRepo = {
        findOne: jest.fn(),
        create: jest.fn((x: unknown) => x),
        save: jest.fn(),
        delete: jest.fn(),
      };
      changeLogService = { log: jest.fn().mockResolvedValue(undefined) };

      receiptRepo.findOne.mockImplementation(async (query: {
        where?: Record<string, unknown>;
      }) => {
        const where = query?.where ?? {};
        // resolveExpectedSequence: highest ACCEPTED receipt for the stream
        if (where.result_status === 'ACCEPTED') {
          return { source_sequence: '5' };
        }
        // receipt existence checks (by key, by sequence, gap-fill lookup)
        if (where.source_sequence !== undefined) {
          return receiptsBySequence.get(String(where.source_sequence)) ?? null;
        }
        return null;
      });

      outboxRepo.findOne.mockImplementation(async (query: {
        where?: Record<string, unknown>;
      }) => {
        const where = query?.where ?? {};
        if (where.source_sequence !== undefined) {
          // Policy query uses a TypeORM MoreThan FindOperator; drain and
          // staged-conflict queries use a plain string sequence.
          if (typeof where.source_sequence === 'string') return null;
          return oldestStagedRow;
        }
        return null;
      });

      const qb = {
        setLock: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue({
          id: 'ins-1',
          stock: 10,
          averageCost: 2,
          tenant_id: 'tenant-1',
        }),
      };
      txManager = {
        query: jest.fn().mockResolvedValue([]),
        save: jest.fn().mockResolvedValue(undefined),
        getRepository: jest.fn((target: unknown) => {
          if (target === InventorySyncReceipt) return receiptRepo;
          if (target === InventorySyncOutbox) return outboxRepo;
          return undefined;
        }),
        createQueryBuilder: jest.fn(() => qb),
      };

      const dataSource = {
        transaction: jest.fn(
          async (_iso: unknown, cb: (m: unknown) => Promise<unknown>) =>
            cb(txManager),
        ),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          InvoicesService,
          SequenceGapPolicyService,
          { provide: DataSource, useValue: dataSource },
          { provide: getRepositoryToken(Invoice), useValue: invoiceRepo },
          { provide: getRepositoryToken(InvoiceItem), useValue: itemRepo },
          { provide: getRepositoryToken(Payment), useValue: paymentRepo },
          { provide: getRepositoryToken(User), useValue: userRepo },
          {
            provide: getRepositoryToken(InventoryMovement),
            useValue: movementRepo,
          },
          {
            provide: getRepositoryToken(InventorySyncReceipt),
            useValue: receiptRepo,
          },
          {
            provide: getRepositoryToken(InventorySyncOutbox),
            useValue: outboxRepo,
          },
          { provide: RecipeService, useValue: { findActiveVersion: jest.fn(), getSnapshot: jest.fn() } },
          { provide: BomExplosionService, useValue: { explode: jest.fn() } },
          { provide: ChangeLogService, useValue: changeLogService },
        ],
      }).compile();

      service = module.get<InvoicesService>(InvoicesService);
      policy = module.get<SequenceGapPolicyService>(SequenceGapPolicyService);
    });

    it('case 1: a gap whose oldest staged row is OLDER than the window is declared and the record is APPLIED', async () => {
      oldestStagedRow = {
        id: 'staged-7',
        source_sequence: '7',
        status: 'STAGED_FUTURE',
        created_at: new Date(Date.now() - 3 * HOUR_MS), // 3h old > 60m window
      };
      recipeActive(null);

      const result = await service.syncBatch('tenant-1', [
        makeRecord({ idempotencyKey: 'gap-8', sourceSequence: 8 }),
      ]);

      expect(result.results).toEqual([
        expect.objectContaining({
          idempotencyKey: 'gap-8',
          status: 'ACCEPTED',
        }),
      ]);
      // The record must be applied, not staged.
      expect(outboxRepo.create).not.toHaveBeenCalledWith(
        expect.objectContaining({ status: 'STAGED_FUTURE' }),
      );
      // Fill rows for the missing sequences must exist.
      const insertedSequences = receiptRepo.insert.mock.calls
        .flatMap((call) => call[0] as Record<string, unknown>[])
        .map((row) => String(row.source_sequence))
        .sort();
      expect(insertedSequences).toEqual(['6', '7']);
      const fillRow = receiptRepo.insert.mock.calls
        .flatMap((call) => call[0] as Record<string, unknown>[])[0];
      expect(fillRow).toMatchObject({
        result_status: 'ACCEPTED',
        result_code: 'GAP_FILL_DECLARED',
        payload_hash: 'GAP_FILL_NO_PAYLOAD',
        idempotency_key: expect.stringMatching(/^gap-fill:d1:inventory:[67]$/),
      });
    });

    it('case 2: a gap whose oldest staged row is YOUNGER than the window declares nothing and stages as today', async () => {
      oldestStagedRow = {
        id: 'staged-7',
        source_sequence: '7',
        status: 'STAGED_FUTURE',
        created_at: new Date(Date.now() - 60 * 1000), // 1 minute old < window
      };
      recipeActive(null);

      const result = await service.syncBatch('tenant-1', [
        makeRecord({ idempotencyKey: 'gap-young-8', sourceSequence: 8 }),
      ]);

      expect(result.results).toEqual([
        expect.objectContaining({
          idempotencyKey: 'gap-young-8',
          status: 'STAGED_FUTURE',
          retryable: true,
          code: 'WAITING_FOR_SEQUENCE_6',
        }),
      ]);
      expect(receiptRepo.insert).not.toHaveBeenCalled();
      expect(changeLogService.log).not.toHaveBeenCalled();
    });

    it('case 3: consecutive missing sequences (6 and 7) are each declared exactly once, in order', async () => {
      oldestStagedRow = {
        id: 'staged-8',
        source_sequence: '8',
        status: 'STAGED_FUTURE',
        created_at: new Date(Date.now() - 3 * HOUR_MS),
      };
      recipeActive(null);

      await service.syncBatch('tenant-1', [
        makeRecord({ idempotencyKey: 'gap-consec-8', sourceSequence: 8 }),
      ]);

      const insertedSequences = receiptRepo.insert.mock.calls
        .flatMap((call) => call[0] as Record<string, unknown>[])
        .map((row) => String(row.source_sequence));
      expect(insertedSequences).toEqual(['6', '7']);
    });

    it('case 4: declaring the same gap twice creates exactly one receipt row', async () => {
      oldestStagedRow = {
        id: 'staged-7',
        source_sequence: '7',
        status: 'STAGED_FUTURE',
        created_at: new Date(Date.now() - 3 * HOUR_MS),
      };

      const params = {
        tenantId: 'tenant-1',
        sourceDeviceId: 'd1',
        flowType: 'inventory',
        expectedSequence: 6,
        incomingSequence: 8,
      };

      const first = await policy.declareGapIfBlocked(params);
      expect(first).toBe(true);

      // Simulate the fill rows already committed by the first declaration.
      receiptsBySequence.set('6', { source_sequence: '6' });
      receiptsBySequence.set('7', { source_sequence: '7' });

      const second = await policy.declareGapIfBlocked(params);
      expect(second).toBe(false);

      const fillRowsPerSequence = receiptRepo.insert.mock.calls
        .flatMap((call) => call[0] as Record<string, unknown>[])
        .map((row) => String(row.source_sequence));
      expect(fillRowsPerSequence).toEqual(['6', '7']);
    });

    it('case 4b: a gap already filled by the real record is never declared, even past the window', async () => {
      oldestStagedRow = {
        id: 'staged-8',
        source_sequence: '8',
        status: 'STAGED_FUTURE',
        created_at: new Date(Date.now() - 3 * HOUR_MS),
      };
      receiptsBySequence.set('6', { source_sequence: '6' }); // real record arrived
      receiptsBySequence.set('7', { source_sequence: '7' });
      recipeActive(null);

      const result = await service.syncBatch('tenant-1', [
        makeRecord({ idempotencyKey: 'gap-filled-8', sourceSequence: 8 }),
      ]);

      // Nothing missing: the record itself is now AT the watermark... the
      // stream advanced, so the record must be applied without any fill row.
      expect(receiptRepo.insert).not.toHaveBeenCalled();
      expect(changeLogService.log).not.toHaveBeenCalled();
      expect(result.results).toEqual([
        expect.objectContaining({ idempotencyKey: 'gap-filled-8' }),
      ]);
    });

    it('case 5 (regression): a normal in-order record with no gap behaves exactly as before', async () => {
      oldestStagedRow = null;
      recipeActive(null);

      const result = await service.syncBatch('tenant-1', [
        makeRecord({ idempotencyKey: 'in-order-6', sourceSequence: 6 }),
      ]);

      expect(result.results).toEqual([
        expect.objectContaining({
          idempotencyKey: 'in-order-6',
          status: 'ACCEPTED',
          code: 'APPLIED',
        }),
      ]);
      expect(receiptRepo.insert).not.toHaveBeenCalled();
      expect(changeLogService.log).not.toHaveBeenCalled();
      expect(outboxRepo.create).not.toHaveBeenCalled();
    });

    it('case 6 (regression): an out-of-order record with a young block still stages STAGED_FUTURE / WAITING_FOR_SEQUENCE_n / retryable', async () => {
      oldestStagedRow = {
        id: 'staged-6',
        source_sequence: '6',
        status: 'STAGED_FUTURE',
        created_at: new Date(Date.now() - 60 * 1000),
      };
      // Watermark 1: record at seq 7 is far ahead.
      receiptRepo.findOne.mockImplementation(async (query: {
        where?: Record<string, unknown>;
      }) => {
        const where = query?.where ?? {};
        if (where.result_status === 'ACCEPTED') return { source_sequence: '1' };
        if (where.source_sequence !== undefined) {
          return receiptsBySequence.get(String(where.source_sequence)) ?? null;
        }
        return null;
      });
      recipeActive(null);

      const result = await service.syncBatch('tenant-1', [
        makeRecord({ idempotencyKey: 'future-young-7', sourceSequence: 7 }),
      ]);

      expect(result.results).toEqual([
        expect.objectContaining({
          idempotencyKey: 'future-young-7',
          status: 'STAGED_FUTURE',
          retryable: true,
          code: 'WAITING_FOR_SEQUENCE_2',
        }),
      ]);
      expect(outboxRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          idempotency_key: 'future-young-7',
          source_sequence: '7',
          status: 'STAGED_FUTURE',
        }),
      );
      expect(receiptRepo.insert).not.toHaveBeenCalled();
      expect(changeLogService.log).not.toHaveBeenCalled();
    });

    it('audit: each declared gap writes one change-log event naming tenant, device, flow and sequences', async () => {
      oldestStagedRow = {
        id: 'staged-7',
        source_sequence: '7',
        status: 'STAGED_FUTURE',
        created_at: new Date(Date.now() - 3 * HOUR_MS),
      };
      recipeActive(null);

      await service.syncBatch('tenant-1', [
        makeRecord({ idempotencyKey: 'gap-audit-8', sourceSequence: 8 }),
      ]);

      expect(changeLogService.log).toHaveBeenCalledTimes(1);
      const logCall = changeLogService.log.mock.calls[0][0];
      expect(logCall).toMatchObject({
        tenantId: 'tenant-1',
        action: 'SYNC_SEQUENCE_GAP_DECLARED',
        targetType: 'inventory_sync_stream',
        targetId: 'd1:inventory',
      });
      expect(logCall.changes).toMatchObject({
        declaredSequences: [6, 7],
        sourceDeviceId: 'd1',
        flowType: 'inventory',
      });
    });

    function recipeActive(value: unknown) {
      // PURCHASE movements resolve the insumo through the transaction query
      // builder; nothing else is needed for this flow.
      void value;
    }
  });
});
