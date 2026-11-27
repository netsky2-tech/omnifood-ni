import { randomUUID } from 'crypto';
import { ExecutionContext, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { createMigrationBuiltSchemaFixture } from '../../../../test/support/migration-built-schema.helper';
import { AuditLog } from '../../identity/entities/audit-log.entity';
import { SecurityProfile } from '../../identity/entities/security-profile.entity';
import { User, UserRole } from '../../identity/entities/user.entity';
import { AuthGuard } from '../../identity/guards/auth.guard';
import { Batch } from '../../inventory/entities/batch.entity';
import { BatchOutflowTrace } from '../../inventory/entities/batch-outflow-trace.entity';
import { Insumo } from '../../inventory/entities/insumo.entity';
import { InventoryDivergence } from '../../inventory/entities/inventory-divergence.entity';
import { InventoryMovement } from '../../inventory/entities/inventory-movement.entity';
import { InventorySyncOutbox } from '../../inventory/entities/inventory-sync-outbox.entity';
import { InventorySyncReceipt } from '../../inventory/entities/inventory-sync-receipt.entity';
import { ProductInventoryMappingVersion } from '../../inventory/entities/product-inventory-mapping-version.entity';
import { Product } from '../../inventory/entities/product.entity';
import {
  SystemParametersConfig,
  SystemParametersConfigActiveView,
} from '../../inventory/entities/system-parameters-config.entity';
import { UomConversion } from '../../inventory/entities/uom-conversion.entity';
import { Tenant } from '../../tenant/entities/tenant.entity';
import { normalizeTenantSlug } from '../../tenant/tenant-slug';
import { AdminInvoicesController } from '../controllers/admin-invoices.controller';
import { InvoiceItemModifier } from '../entities/invoice-item-modifier.entity';
import { InvoiceItem } from '../entities/invoice-item.entity';
import { Invoice } from '../entities/invoice.entity';
import { Payment } from '../entities/payment.entity';
import { InvoicesService } from './invoices.service';

const postgresConnection = {
  host: process.env.DB_HOST?.trim() ?? '127.0.0.1',
  port: Number(process.env.DB_PORT?.trim() ?? '5432'),
  username: process.env.DB_USERNAME?.trim() ?? 'postgres',
  password: process.env.DB_PASSWORD?.trim() ?? 'postgres',
  database: process.env.DB_DATABASE?.trim() ?? 'omnifood',
};

describe('InvoicesService DT 09-2007 S3 Contingency Back-Entry (real PostgreSQL DB)', () => {
  const TEST_TIMEOUT_MS = 45000;

  async function createDbTestHarness() {
    const fixture = await createMigrationBuiltSchemaFixture();
    const dataSource = new DataSource({
      type: 'postgres',
      ...postgresConnection,
      schema: fixture.schema,
      entities: [
        Tenant,
        User,
        SecurityProfile,
        AuditLog,
        Invoice,
        InvoiceItem,
        InvoiceItemModifier,
        Payment,
        Insumo,
        Product,
        ProductInventoryMappingVersion,
        InventoryMovement,
        UomConversion,
        Batch,
        BatchOutflowTrace,
        InventorySyncOutbox,
        InventorySyncReceipt,
        InventoryDivergence,
        SystemParametersConfig,
        SystemParametersConfigActiveView,
      ],
      extra: {
        allowExitOnIdle: true,
        options: `-c search_path=${fixture.schema},public -c statement_timeout=15000`,
      },
    });
    await dataSource.initialize();

    const service = new InvoicesService(
      dataSource,
      dataSource.getRepository(Invoice),
      dataSource.getRepository(InvoiceItem),
      dataSource.getRepository(Payment),
      dataSource.getRepository(User),
      dataSource.getRepository(InventoryMovement),
      dataSource.getRepository(InventorySyncReceipt),
      dataSource.getRepository(InventorySyncOutbox),
      { findActiveVersion: jest.fn(), getSnapshot: jest.fn() } as never,
      { explode: jest.fn(), explodeRecipe: jest.fn() } as never,
    );

    return { fixture, dataSource, service };
  }

  it(
    'syncs contingency invoice via syncBatch, rejects DGI prefix collision & duplicate manual ref, and filters via AdminInvoicesController',
    async () => {
      const { fixture, dataSource, service } = await createDbTestHarness();
      let app: Awaited<ReturnType<typeof Test.createTestingModule>> extends never
        ? never
        : import('@nestjs/common').INestApplication | undefined;
      try {
        const tenantId = randomUUID();
        const ownerId = randomUUID();

        await dataSource.query(
          `INSERT INTO tenants (id, name, slug, created_at, updated_at)
           VALUES ($1, 'DT09 S3 Tenant', $2, now(), now())`,
          [tenantId, normalizeTenantSlug(`dt09-s3-${tenantId.slice(0, 8)}`)],
        );
        await dataSource.query(
          `INSERT INTO users (id, tenant_id, email, password_hash, name, role, is_active, created_at, updated_at)
           VALUES ($1, $2, 'owner@dt09s3.test', 'hash', 'Owner DT09 S3', $3, true, now(), now())`,
          [ownerId, tenantId, UserRole.OWNER],
        );
        // Configure tenant dgi_prefix in sys_parametros_config
        await dataSource.query(
          `INSERT INTO sys_parametros_config (tenant_id, param_key, param_value, version, is_active, created_by)
           VALUES ($1, 'dgi_prefix', $2::jsonb, 1, true, $3)`,
          [tenantId, JSON.stringify('002-001-01'), ownerId],
        );

        // 1. Sync a regular (non-contingency) invoice
        const regularRes = await service.syncBatch(tenantId, [
          {
            idempotencyKey: 's3-regular-1',
            sourceDeviceId: 'POS-S3',
            sourceSequence: 1,
            flowType: 'sales',
            documentType: 'SALE',
            invoice: {
              id: randomUUID(),
              number: '001-001-01-00000001',
              createdAt: '2026-04-15T12:00:00.000Z',
              userId: ownerId,
              subtotal: 100,
              totalTax: 15,
              total: 115,
              paymentStatus: 'paid',
              items: [],
              payments: [],
            },
          },
        ]);
        expect(regularRes.results[0].status).toBe('ACCEPTED');

        // 2. Reject series colliding with tenant's configured dgi_prefix ('002-001-01')
        const prefixCollisionRes = await service.syncBatch(tenantId, [
          {
            idempotencyKey: 's3-collision-dgi-prefix',
            sourceDeviceId: 'POS-S3',
            sourceSequence: 2,
            flowType: 'sales',
            documentType: 'SALE',
            invoice: {
              id: randomUUID(),
              number: '001-001-01-00000002',
              createdAt: '2026-04-15T13:00:00.000Z',
              userId: ownerId,
              subtotal: 100,
              totalTax: 15,
              total: 115,
              paymentStatus: 'paid',
              items: [],
              payments: [],
              contingencyManualSeries: '002-001-01',
              contingencyManualNumber: '000050',
              contingencyManualIssuedAt: '2026-04-15',
            },
          },
        ]);
        expect(prefixCollisionRes.results[0]).toMatchObject({
          status: 'REJECTED',
          code: 'CONTINGENCY_SERIES_COLLISION',
          retryable: false,
        });

        // 3. Reject incomplete contingency reference
        const incompleteRes = await service.syncBatch(tenantId, [
          {
            idempotencyKey: 's3-incomplete',
            sourceDeviceId: 'POS-S3',
            sourceSequence: 2,
            flowType: 'sales',
            documentType: 'SALE',
            invoice: {
              id: randomUUID(),
              number: '001-001-01-00000003',
              createdAt: '2026-04-15T13:05:00.000Z',
              userId: ownerId,
              subtotal: 100,
              totalTax: 15,
              total: 115,
              paymentStatus: 'paid',
              items: [],
              payments: [],
              contingencyManualSeries: 'MAN-A',
              contingencyManualNumber: '000050',
            },
          },
        ]);
        expect(incompleteRes.results[0]).toMatchObject({
          status: 'REJECTED',
          code: 'CONTINGENCY_REF_INCOMPLETE',
          retryable: false,
        });

        // 4. Valid contingency back-entry succeeds
        const contingencyInvoiceId = randomUUID();
        const validContingencyRes = await service.syncBatch(tenantId, [
          {
            idempotencyKey: 's3-valid-contingency',
            sourceDeviceId: 'POS-S3',
            sourceSequence: 2,
            flowType: 'sales',
            documentType: 'SALE',
            invoice: {
              id: contingencyInvoiceId,
              number: '001-001-01-00000004',
              createdAt: '2026-04-15T14:00:00.000Z',
              userId: ownerId,
              subtotal: 200,
              totalTax: 30,
              total: 230,
              paymentStatus: 'paid',
              items: [],
              payments: [],
              contingencyManualSeries: 'MAN-A',
              contingencyManualNumber: '000042',
              contingencyManualIssuedAt: '2026-04-14',
            },
          },
        ]);
        expect(validContingencyRes.results[0].status).toBe('ACCEPTED');

        // 5. Duplicate active manual ticket rejected by DB unique partial index
        const dupRes = await service.syncBatch(tenantId, [
          {
            idempotencyKey: 's3-dup-contingency',
            sourceDeviceId: 'POS-S3',
            sourceSequence: 3,
            flowType: 'sales',
            documentType: 'SALE',
            invoice: {
              id: randomUUID(),
              number: '001-001-01-00000005',
              createdAt: '2026-04-15T14:10:00.000Z',
              userId: ownerId,
              subtotal: 200,
              totalTax: 30,
              total: 230,
              paymentStatus: 'paid',
              items: [],
              payments: [],
              contingencyManualSeries: 'man-a',
              contingencyManualNumber: '000042',
              contingencyManualIssuedAt: '2026-04-14',
            },
          },
        ]);
        expect(dupRes.results[0]).toMatchObject({
          status: 'REJECTED',
          code: 'CONTINGENCY_MANUAL_REF_DUPLICATE',
          retryable: false,
        });

        // 6. Query via AdminInvoicesController HTTP endpoint (real DB + real serialization)
        const moduleRef = await Test.createTestingModule({
          controllers: [AdminInvoicesController],
          providers: [
            { provide: InvoicesService, useValue: service },
            Reflector,
          ],
        })
          .overrideGuard(AuthGuard)
          .useValue({
            canActivate: (context: ExecutionContext) => {
              const req = context.switchToHttp().getRequest();
              req.user = {
                sub: ownerId,
                role: UserRole.OWNER,
                tenant_id: tenantId,
              };
              return true;
            },
          })
          .compile();

        app = moduleRef.createNestApplication();
        app.useGlobalPipes(
          new ValidationPipe({
            whitelist: true,
            forbidNonWhitelisted: true,
            transform: true,
          }),
        );
        await app.init();

        const allRes = await request(app.getHttpServer()).get(
          '/sales/admin/invoices',
        );
        expect(allRes.status).toBe(200);
        expect(allRes.body).toHaveLength(2);

        const filteredRes = await request(app.getHttpServer()).get(
          '/sales/admin/invoices?contingencyOnly=true',
        );
        expect(filteredRes.status).toBe(200);
        expect(filteredRes.body).toHaveLength(1);
        expect(filteredRes.body[0]).toMatchObject({
          id: contingencyInvoiceId,
          number: '001-001-01-00000004',
          contingencyManualSeries: 'MAN-A',
          contingencyManualNumber: '000042',
          contingencyManualIssuedAt: '2026-04-14',
        });
      } finally {
        if (app) {
          await app.close();
        }
        await dataSource.destroy().catch(() => undefined);
        await fixture.close();
      }
    },
    TEST_TIMEOUT_MS,
  );
});
