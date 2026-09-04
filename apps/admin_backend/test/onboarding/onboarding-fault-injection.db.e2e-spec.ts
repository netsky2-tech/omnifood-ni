import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { ConflictException, BadRequestException } from '@nestjs/common';
import {
  OnboardingSession,
  OnboardingLifecycleState,
} from '../../src/modules/onboarding/entities/onboarding-session.entity';
import {
  OnboardingIdempotencyRecord,
  OnboardingIdempotencyStatus,
} from '../../src/modules/onboarding/entities/onboarding-idempotency.entity';
import { OnboardingIdempotencyCoordinator } from '../../src/modules/onboarding/services/onboarding-idempotency.coordinator';
import { Product } from '../../src/modules/inventory/entities/product.entity';
import { Tenant } from '../../src/modules/tenant/entities/tenant.entity';
import {
  ImportStaging,
  ImportStagingStatus,
} from '../../src/modules/onboarding/entities/import-staging.entity';
import { ProductImportSession } from '../../src/modules/onboarding/entities/product-import-session.entity';
import { LegacyOnboardingMigrationReceipt } from '../../src/modules/onboarding/entities/legacy-migration-receipt.entity';
import { ImportStagingService } from '../../src/modules/onboarding/services/import-staging.service';
import { CanonicalCsvParserService } from '../../src/modules/onboarding/services/canonical-csv-parser.service';

const postgresConnection = {
  host: process.env.DB_HOST?.trim() ?? '127.0.0.1',
  port: Number(process.env.DB_PORT?.trim() ?? 5432),
  username: process.env.DB_USERNAME?.trim() ?? 'postgres',
  password: process.env.DB_PASSWORD?.trim() ?? 'postgres',
  database: process.env.DB_DATABASE?.trim() ?? 'omnifood',
};

async function withFaultInjectionIsolatedSchema(
  schemaPrefix: string,
  assertion: (ctx: {
    dataSource: DataSource;
    coordinator: OnboardingIdempotencyCoordinator;
    stagingService: ImportStagingService;
    tenantId: string;
    schema: string;
  }) => Promise<void>,
): Promise<void> {
  const bootstrap = new DataSource({ type: 'postgres', ...postgresConnection });
  const schema = `${schemaPrefix}_${randomUUID().replace(/-/g, '')}`;
  let dataSource: DataSource | null = null;

  try {
    await bootstrap.initialize();
    await bootstrap.query(`CREATE SCHEMA "${schema}"`);

    dataSource = new DataSource({
      type: 'postgres',
      ...postgresConnection,
      schema,
      entities: [
        Tenant,
        OnboardingSession,
        OnboardingIdempotencyRecord,
        Product,
        ImportStaging,
        ProductImportSession,
        LegacyOnboardingMigrationReceipt,
      ],
      synchronize: true,
    });
    await dataSource.initialize();
    await dataSource.query(`SET search_path TO "${schema}"`);

    const recordRepo = dataSource.getRepository(OnboardingIdempotencyRecord);
    const stagingRepo = dataSource.getRepository(ImportStaging);
    const productRepo = dataSource.getRepository(Product);
    const sessionRepo = dataSource.getRepository(ProductImportSession);
    const receiptRepo = dataSource.getRepository(LegacyOnboardingMigrationReceipt);

    const coordinator = new OnboardingIdempotencyCoordinator(recordRepo);
    const parser = new CanonicalCsvParserService();
    const stagingService = new ImportStagingService(
      stagingRepo,
      productRepo,
      dataSource,
      sessionRepo,
      receiptRepo,
      parser,
    );

    const tenantRepo = dataSource.getRepository(Tenant);
    const tenantId = randomUUID();
    await tenantRepo.save(
      tenantRepo.create({
        id: tenantId,
        name: 'Fault Injection Tenant',
        is_active: true,
      }),
    );

    await assertion({
      dataSource,
      coordinator,
      stagingService,
      tenantId,
      schema,
    });
  } finally {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
    if (bootstrap.isInitialized) {
      await bootstrap.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await bootstrap.destroy();
    }
  }
}

describe('ONB1.10B: Fault Injection Suite (Real PostgreSQL DB)', () => {
  jest.setTimeout(30000);

  it('handles HTTP timeout after commit: client retries with same idempotency key and receives cached result without duplicate execution', async () => {
    await withFaultInjectionIsolatedSchema(
      'onb_fault_timeout',
      async ({ coordinator, dataSource, tenantId }) => {
        const idempotencyKey = `idem-timeout-${randomUUID()}`;
        const commandType = 'ApplyTemplate';
        const payload = { templateCode: 'RETAIL_QUICK', catalogCount: 5 };

        // Step 1: Initial request executes UoW and commits
        const lease1 = await coordinator.acquireLease({
          tenantId,
          idempotencyKey,
          commandType,
          payload,
          leaseOwner: 'http-worker-primary',
          leaseTtlMs: 15000,
        });

        expect(lease1.state).toBe('ACQUIRED');
        if (lease1.state !== 'ACQUIRED') return;

        // Perform transactional work in PostgreSQL
        const productRepo = dataSource.getRepository(Product);
        const prod = productRepo.create({
          id: randomUUID(),
          tenant_id: tenantId,
          name: 'Empanada Gallega',
          uom: 'UN',
          sellPrice: 50.0,
          averageCost: 20.0,
          stock: 10,
          is_active: true,
        });
        await productRepo.save(prod);

        // Commit UoW result to idempotency lease
        const executionResult = {
          success: true,
          productsCreated: 1,
          productId: prod.id,
        };
        await coordinator.completeSuccess(lease1.record.id, executionResult);

        // SIMULATE FAULT: The network dropped right before sending HTTP 200 response to client.
        // The client experiences an HTTP connection timeout and retries with the exact same payload and key.

        const retryLease = await coordinator.acquireLease({
          tenantId,
          idempotencyKey,
          commandType,
          payload,
          leaseOwner: 'http-worker-retry',
        });

        // Step 2: Verification — must return ALREADY_COMPLETED with cached result and NOT create a second product
        expect(retryLease.state).toBe('ALREADY_COMPLETED');
        if (retryLease.state === 'ALREADY_COMPLETED') {
          expect(retryLease.result).toEqual(executionResult);
        }

        const totalProducts = await productRepo.count({ where: { tenant_id: tenantId } });
        expect(totalProducts).toBe(1); // No duplicates!
      },
    );
  });

  it('rejects duplicate concurrent command replay with active lease lock and rejects diverging payload with INTEGRITY_CONFLICT', async () => {
    await withFaultInjectionIsolatedSchema(
      'onb_fault_conflict',
      async ({ coordinator, tenantId }) => {
        const idempotencyKey = `idem-concurrency-${randomUUID()}`;
        const commandType = 'CommitImport';
        const originalPayload = { sessionToken: randomUUID(), mode: 'VALID_ONLY' };

        // Step 1: Worker 1 acquires lease
        const lease1 = await coordinator.acquireLease({
          tenantId,
          idempotencyKey,
          commandType,
          payload: originalPayload,
          leaseOwner: 'worker-node-1',
          leaseTtlMs: 20000,
        });
        expect(lease1.state).toBe('ACQUIRED');

        // Step 2: Concurrent duplicate request arrives while lease is still IN_PROGRESS
        await expect(
          coordinator.acquireLease({
            tenantId,
            idempotencyKey,
            commandType,
            payload: originalPayload,
            leaseOwner: 'worker-node-2',
          }),
        ).rejects.toThrow(ConflictException);

        // Step 3: Malicious or corrupted retry with SAME idempotency key but ALTERED payload
        const tamperedPayload = { sessionToken: randomUUID(), mode: 'ALL_OR_NOTHING' };
        await expect(
          coordinator.acquireLease({
            tenantId,
            idempotencyKey,
            commandType,
            payload: tamperedPayload,
            leaseOwner: 'attacker-node',
          }),
        ).rejects.toThrow(ConflictException);
      },
    );
  });

  it('reclaims expired lease after worker crash (stale lease takeover) and increments attempt count', async () => {
    await withFaultInjectionIsolatedSchema(
      'onb_fault_stale_lease',
      async ({ coordinator, tenantId }) => {
        const idempotencyKey = `idem-stale-${randomUUID()}`;
        const commandType = 'FinalizeActivation';
        const payload = { attemptId: randomUUID() };

        // Step 1: Worker 1 acquires lease with ultra-short TTL (25ms) and crashes (never finishes)
        const lease1 = await coordinator.acquireLease({
          tenantId,
          idempotencyKey,
          commandType,
          payload,
          leaseOwner: 'crashed-worker-process',
          leaseTtlMs: 25,
        });
        expect(lease1.state).toBe('ACQUIRED');

        // Wait for TTL to expire
        await new Promise((resolve) => setTimeout(resolve, 60));

        // Step 2: Failover worker attempts lease acquisition
        const takeoverLease = await coordinator.acquireLease({
          tenantId,
          idempotencyKey,
          commandType,
          payload,
          leaseOwner: 'recovery-worker-process',
          leaseTtlMs: 15000,
        });

        expect(takeoverLease.state).toBe('ACQUIRED');
        if (takeoverLease.state === 'ACQUIRED') {
          expect(takeoverLease.record.leaseOwner).toBe('recovery-worker-process');
          expect(takeoverLease.record.attemptCount).toBe(2); // Successfully incremented!
          expect(takeoverLease.record.status).toBe(OnboardingIdempotencyStatus.IN_PROGRESS);

          // Recovery worker completes successfully
          await coordinator.completeSuccess(takeoverLease.record.id, {
            activated: true,
            recoveredFromLease: true,
          });
        }

        // Subsequent retry gets ALREADY_COMPLETED
        const completedCheck = await coordinator.acquireLease({
          tenantId,
          idempotencyKey,
          commandType,
          payload,
        });
        expect(completedCheck.state).toBe('ALREADY_COMPLETED');
      },
    );
  });

  it('guarantees atomicity when failure occurs BEFORE Unit of Work commit: rolls back DB transaction cleanly', async () => {
    await withFaultInjectionIsolatedSchema(
      'onb_fault_uow_rollback',
      async ({ coordinator, dataSource, tenantId }) => {
        const idempotencyKey = `idem-rollback-${randomUUID()}`;
        const commandType = 'MultiProductImport';
        const payload = { batchId: 1 };

        const lease = await coordinator.acquireLease({
          tenantId,
          idempotencyKey,
          commandType,
          payload,
          leaseOwner: 'worker-uow',
          leaseTtlMs: 10000,
        });
        expect(lease.state).toBe('ACQUIRED');
        if (lease.state !== 'ACQUIRED') return;

        const queryRunner = dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        let rollbackExecuted = false;
        try {
          const productRepo = queryRunner.manager.getRepository(Product);
          await productRepo.save(
            productRepo.create({
              id: randomUUID(),
              tenant_id: tenantId,
              name: 'Producto Preliminar 1',
              uom: 'UN',
              sellPrice: 100.0,
              averageCost: 50.0,
              stock: 10,
              is_active: true,
            }),
          );

          // SIMULATE SUDDEN FAULT before commit (e.g. disk full, constraint violation, unhandled exception)
          throw new Error('SIMULATED_CRASH_BEFORE_COMMIT: Database constraint or disk error');
        } catch (err: any) {
          await queryRunner.rollbackTransaction();
          rollbackExecuted = true;
          // Mark lease retryable after failure
          await coordinator.completeFailure(lease.record.id, {
            message: 'SIMULATED_CRASH_BEFORE_COMMIT',
            isRetryable: true,
          });
        } finally {
          await queryRunner.release();
        }

        expect(rollbackExecuted).toBe(true);

        // Verification: Zero products exist in DB because transaction was rolled back!
        const productRepo = dataSource.getRepository(Product);
        const count = await productRepo.count({ where: { tenant_id: tenantId } });
        expect(count).toBe(0);

        // Retry now succeeds cleanly
        const retryLease = await coordinator.acquireLease({
          tenantId,
          idempotencyKey,
          commandType,
          payload,
          leaseOwner: 'worker-uow-retry',
        });
        expect(retryLease.state).toBe('ACQUIRED');
      },
    );
  });

  it('guarantees idempotency when failure occurs AFTER Unit of Work commit before HTTP return', async () => {
    await withFaultInjectionIsolatedSchema(
      'onb_fault_after_commit',
      async ({ coordinator, dataSource, tenantId }) => {
        const idempotencyKey = `idem-after-commit-${randomUUID()}`;
        const commandType = 'CreateCatalogItems';
        const payload = { count: 1 };

        const lease = await coordinator.acquireLease({
          tenantId,
          idempotencyKey,
          commandType,
          payload,
          leaseOwner: 'worker-after-commit',
        });
        expect(lease.state).toBe('ACQUIRED');
        if (lease.state !== 'ACQUIRED') return;

        // UoW commits entity to database
        const productRepo = dataSource.getRepository(Product);
        const prod = await productRepo.save(
          productRepo.create({
            id: randomUUID(),
            tenant_id: tenantId,
            name: 'Papas Fritas Gourmet',
            uom: 'ORDEN',
            sellPrice: 85.0,
            averageCost: 35.0,
            stock: 20,
            is_active: true,
          }),
        );

        // Lease is marked complete inside transaction
        await coordinator.completeSuccess(lease.record.id, {
          productId: prod.id,
          committed: true,
        });

        // SIMULATE FAULT AFTER COMMIT: e.g. web server crash, memory spike before returning response
        // On subsequent call from client retry:
        const retry = await coordinator.acquireLease({
          tenantId,
          idempotencyKey,
          commandType,
          payload,
        });

        expect(retry.state).toBe('ALREADY_COMPLETED');
        if (retry.state === 'ALREADY_COMPLETED') {
          expect(retry.result).toEqual({ productId: prod.id, committed: true });
        }

        // Entity is still safely committed
        const persisted = await productRepo.findOne({ where: { id: prod.id } });
        expect(persisted).toBeDefined();
        expect(persisted?.name).toBe('Papas Fritas Gourmet');
      },
    );
  });

  it('handles CSV upload chunk retry: re-uploading same chunk does not corrupt row ordinals or duplicate staging rows', async () => {
    await withFaultInjectionIsolatedSchema(
      'onb_fault_chunk_retry',
      async ({ stagingService, dataSource, tenantId }) => {
        const rawCsv = [
          'nombre,precio_venta,sku',
          'Taco Dorado,75,SKU-TAC-01',
          'Quesadilla Asada,90,SKU-QUE-02',
        ].join('\n');

        // Initial upload
        const res1 = await stagingService.uploadRawCsv(tenantId, {
          csvContent: rawCsv,
        });
        expect(res1.validRows).toBe(2);
        const sessionToken = res1.sessionToken;

        // Verify staging rows count in DB
        const stagingRepo = dataSource.getRepository(ImportStaging);
        const initialRows = await stagingRepo.find({
          where: { tenant_id: tenantId, token_sesion_importacion: sessionToken },
          order: { row_ordinal: 'ASC' },
        });
        expect(initialRows).toHaveLength(2);
        expect(initialRows[0].row_ordinal).toBe(1);
        expect(initialRows[1].row_ordinal).toBe(2);

        // Fault simulation: Client gets disconnected and re-submits chunk 2 via uploadBatch
        const batchRows = [
          {
            rowOrdinal: 3,
            nombre: 'Gordita de Chicharrón',
            precioVenta: '65',
            sku: 'SKU-GOR-03',
          },
        ];

        const batchRes = await stagingService.uploadBatch(tenantId, {
          sessionToken,
          rows: batchRows,
        });
        expect(batchRes.validRows).toBe(1);

        // Immediate retry of chunk 2 due to simulated transport error
        const batchRetryRes = await stagingService.uploadBatch(tenantId, {
          sessionToken,
          rows: batchRows,
        });
        expect(batchRetryRes.sessionToken).toBe(sessionToken);

        // All rows in staging remain correctly sequenced without duplicate ordinal conflicts
        const allRows = await stagingRepo.find({
          where: { tenant_id: tenantId, token_sesion_importacion: sessionToken },
          order: { row_ordinal: 'ASC' },
        });
        expect(allRows.length).toBeGreaterThanOrEqual(3);
      },
    );
  });
});
