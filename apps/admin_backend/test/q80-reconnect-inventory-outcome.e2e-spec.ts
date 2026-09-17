import { randomUUID } from 'crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as request from 'supertest';
import { SyncBatchController } from '../src/modules/sales/controllers/sync-batch.controller';
import { InvoicesService } from '../src/modules/sales/services/invoices.service';
import { SaleInventoryOutcomeService } from '../src/modules/sales/services/sale-inventory-outcome.service';
import { Invoice } from '../src/modules/sales/entities/invoice.entity';
import { InvoiceItem } from '../src/modules/sales/entities/invoice-item.entity';
import { Payment } from '../src/modules/sales/entities/payment.entity';
import { User } from '../src/modules/identity/entities/user.entity';
import { InventoryMovement } from '../src/modules/inventory/entities/inventory-movement.entity';
import { InventorySyncReceipt } from '../src/modules/inventory/entities/inventory-sync-receipt.entity';
import { InventorySyncOutbox } from '../src/modules/inventory/entities/inventory-sync-outbox.entity';

import { Insumo } from '../src/modules/inventory/entities/insumo.entity';
import { Product } from '../src/modules/inventory/entities/product.entity';
import { CatalogValue } from '../src/modules/catalog/entities/catalog-value.entity';
import { Recipe } from '../src/modules/inventory/entities/recipe.entity';
import { RecipeVersion } from '../src/modules/inventory/entities/recipe-version.entity';
import { ProductInventoryMappingVersion } from '../src/modules/inventory/entities/product-inventory-mapping-version.entity';
import { RecipeDetail } from '../src/modules/inventory/entities/recipe-detail.entity';
import { RecipeService } from '../src/modules/inventory/recipe.service';
import { BomExplosionService } from '../src/modules/inventory/bom-explosion.service';
import { Tenant } from '../src/modules/tenant/entities/tenant.entity';
import { AuthGuard } from '../src/modules/identity/guards/auth.guard';
import { SyncTransportGuard } from '../src/modules/identity/guards/sync-transport.guard';
import { SyncCreditNoteAuthGuard } from '../src/modules/sales/guards/sync-credit-note-auth.guard';
import {
  DEVICE_SYNC_JWT_CONFIG,
  getDeviceSyncJwtConfig,
} from '../src/modules/identity/config/device-sync-jwt.config';
import { DeviceSyncCredential } from '../src/modules/identity/entities/device-sync-credential.entity';
import { ActivationAttempt } from '../src/modules/onboarding/entities/activation-attempt.entity';
import { UomConversion } from '../src/modules/inventory/entities/uom-conversion.entity';
import { SecurityProfile } from '../src/modules/identity/entities/security-profile.entity';
import { CashShiftSession } from '../src/modules/sales/entities/cash-shift.entity';
import { CashMovement } from '../src/modules/sales/entities/cash-movement.entity';
import { DatafonoEquipo } from '../src/modules/sales/entities/datafono-equipo.entity';
import { InvoiceItemModifier } from '../src/modules/sales/entities/invoice-item-modifier.entity';
import {
  createIdentityJwtConfigProvider,
  createIdentityJwtTestConfigProvider,
} from './support/identity-jwt-test.fixture';
import {
  ensurePublicDeviceSyncTables,
  provisionDeviceSyncCredential,
  signDeviceSyncAccessToken,
  type ProvisionedDeviceSyncCredential,
} from './support/device-sync-e2e.helper';

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for DB-backed E2E tests`);
  return value;
}

const postgresConnection = {
  host: process.env.DB_HOST?.trim() ?? '127.0.0.1',
  port: Number(process.env.DB_PORT?.trim() ?? 5432),
  username: process.env.DB_USERNAME?.trim() ?? 'postgres',
  password: getRequiredEnv('DB_PASSWORD'),
  database: process.env.DB_DATABASE?.trim() ?? 'omnifood',
};

const ALL_ENTITIES = [
  Tenant,
  Invoice,
  InvoiceItem,
  Payment,
  User,
  InventoryMovement,
  InventorySyncReceipt,
  InventorySyncOutbox,

  Insumo,
  Product,
  CatalogValue,
  Recipe,
  RecipeVersion,
  ProductInventoryMappingVersion,
  RecipeDetail,
  UomConversion,
  SecurityProfile,
  CashShiftSession,
  CashMovement,
  DatafonoEquipo,
  InvoiceItemModifier,
  DeviceSyncCredential,
  ActivationAttempt,
];

async function withIsolatedSchema(
  schemaPrefix: string,
  assertion: (ctx: {
    app: INestApplication;
    dataSource: DataSource;
    deviceToken: string;
    tenantId: string;
  }) => Promise<void>,
): Promise<void> {
  const provisionedDevices: ProvisionedDeviceSyncCredential[] = [];
  const bootstrap = new DataSource({ type: 'postgres', ...postgresConnection });
  const schema = `${schemaPrefix}_${randomUUID().replace(/-/g, '')}`;
  let dataSource: DataSource | null = null;
  let app: INestApplication | null = null;

  try {
    await bootstrap.initialize();
    await bootstrap.query(`CREATE SCHEMA "${schema}"`);

    // Device sync rows live in public on fresh databases: create the
    // device-only transport tables next to the schema setup (the helper
    // also self-ensures them before provisioning).
    const bootstrapRunner = bootstrap.createQueryRunner();
    try {
      await bootstrapRunner.connect();
      await ensurePublicDeviceSyncTables(bootstrapRunner);
    } finally {
      await bootstrapRunner.release();
    }

    dataSource = new DataSource({
      type: 'postgres',
      ...postgresConnection,
      schema,
      entities: ALL_ENTITIES,
      synchronize: true,
      // Every pooled connection must share the isolated-schema search_path
      // so the device-sync helper's raw INSERTs and SyncTransportGuard's
      // entity reads resolve to the same tables (same convention as the
      // migrated sync-down-contract reference suite).
      extra: { options: `-c search_path=${schema},public` },
    });
    await dataSource.initialize();
    await dataSource.query(`SET search_path TO "${schema}"`);

    const tenantId = randomUUID();
    await dataSource.query(
      `INSERT INTO tenants (id, name, is_active, created_at, updated_at) VALUES ($1, $2, true, now(), now())`,
      [tenantId, `E2E Tenant ${schemaPrefix}`],
    );

    // The /v1/sync transport is device-only: provision an ACTIVE device sync
    // credential (plus its PASS activation attempt) for the tenant, bound to
    // the canonical terminal id every batch record below uses as
    // sourceDeviceId. sync:push is the exact scope /v1/sync/batch requires.
    provisionedDevices.push(
      await provisionDeviceSyncCredential(dataSource, {
        // This suite bootstraps the app with a DataSource-level `schema` option,
        // so SyncTransportGuard reads the device tables from that isolated schema
        // and the provisioned rows must land there too.
        schema,
        tenantId,
        deviceId: 'terminal1',
        scopes: ['sync:push'],
      }),
    );

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [SyncBatchController],
      providers: [
        InvoicesService,
        SaleInventoryOutcomeService,
        { provide: DataSource, useValue: dataSource },
        {
          provide: getRepositoryToken(Invoice),
          useValue: dataSource.getRepository(Invoice),
        },
        {
          provide: getRepositoryToken(InvoiceItem),
          useValue: dataSource.getRepository(InvoiceItem),
        },
        {
          provide: getRepositoryToken(Payment),
          useValue: dataSource.getRepository(Payment),
        },
        {
          provide: getRepositoryToken(User),
          useValue: dataSource.getRepository(User),
        },
        {
          provide: getRepositoryToken(InventoryMovement),
          useValue: dataSource.getRepository(InventoryMovement),
        },
        {
          provide: getRepositoryToken(InventorySyncReceipt),
          useValue: dataSource.getRepository(InventorySyncReceipt),
        },
        {
          provide: getRepositoryToken(InventorySyncOutbox),
          useValue: dataSource.getRepository(InventorySyncOutbox),
        },
        { provide: RecipeService, useValue: {} },
        { provide: BomExplosionService, useValue: {} },
        JwtService,
        AuthGuard,
        SyncTransportGuard,
        SyncCreditNoteAuthGuard,
        {
          provide: DEVICE_SYNC_JWT_CONFIG,
          inject: [ConfigService],
          useFactory: getDeviceSyncJwtConfig,
        },
        createIdentityJwtTestConfigProvider(),
        createIdentityJwtConfigProvider(),
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    // Mimic the AuthGuard + tenant interceptor setting the user property
    app.use((req: any, _res: any, next: any) => {
      // It uses AuthGuard which reads Authorization header.
      // So no need to stub req.user here, we pass real JWTs!
      next();
    });

    await app.init();

    // Device tokens are minted from the SAME DEVICE_SYNC_JWT_CONFIG the
    // bootstrapped app runs with (read from the container, not duplicated).
    const deviceToken = signDeviceSyncAccessToken(app, provisionedDevices[0]);

    await assertion({
      app,
      dataSource,
      deviceToken,
      tenantId,
    });
  } finally {
    if (app) await app.close();
    if (dataSource?.isInitialized) {
      // Device sync rows live in the isolated schema: delete provisioned
      // credentials before their activation attempts inside a per-tenant
      // transaction that sets the RLS tenant context.
      for (const device of provisionedDevices) {
        await dataSource.transaction(async (manager) => {
          await manager.query("SELECT set_config('app.tenant_id', $1, true)", [
            device.tenantId,
          ]);
          await manager.query(
            `DELETE FROM device_sync_credentials WHERE id = $1`,
            [device.credentialId],
          );
          await manager.query(
            `DELETE FROM onboarding_activation_attempts WHERE id = $1`,
            [device.activationAttemptId],
          );
        });
      }
      await dataSource.destroy();
    }
    if (bootstrap.isInitialized) {
      await bootstrap.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await bootstrap.destroy();
    }
  }
}

describe('Q80 Reconnect Auth and Inventory Outcome Gate (e2e)', () => {
  // Full isolated-schema bootstrap (synchronize of all entities plus app
  // init) runs inside the test body; same budget as the sibling
  // sync-down-contract reference suite.
  jest.setTimeout(30000);

  it('processes one invoice with SALE_TIME_V1, stores outcome/Kardex, and rejects duplicate replay', async () => {
    await withIsolatedSchema(
      'q80_reconnect',
      async ({ app, dataSource, deviceToken, tenantId }) => {
        // 1. Set up product, insumo, mapping
        const productId = randomUUID();
        const insumoId = randomUUID();
        const mappingVersionId = randomUUID();
        const userId = randomUUID();

        await dataSource.query(
          `INSERT INTO products (id, tenant_id, name, product_type, is_active, uom) VALUES ($1, $2, 'Test Product', 'SIMPLE', true, 'UN')`,
          [productId, tenantId],
        );
        await dataSource.query(
          `INSERT INTO insumos (id, tenant_id, name, "purchaseUom", "consumptionUom", stock, negative_stock_policy) VALUES ($1, $2, 'Test Insumo', 'UN', 'UN', 10, 'ALLOW_TEMPORARY')`,
          [insumoId, tenantId],
        );
        await dataSource.query(
          `INSERT INTO product_inventory_mapping_versions (id, tenant_id, product_id, insumo_id, effective_at) VALUES ($1, $2, $3, $4, now())`,
          [mappingVersionId, tenantId, productId, insumoId],
        );

        const invoiceId = randomUUID();
        const itemId = randomUUID();
        const correlationId = randomUUID();

        const payload = {
          records: [
            {
              idempotencyKey: `sale:terminal1:seq1`,
              sourceDeviceId: 'terminal1',
              sourceSequence: 1,
              flowType: 'sales',
              documentType: 'SALE',
              invoice: {
                id: invoiceId,
                number: '001-001-01-00000001',
                createdAt: new Date().toISOString(),
                userId: userId,
                subtotal: 100,
                totalTax: 15,
                total: 115,
                paymentStatus: 'PAID',
                inventoryOutcome: 'APPLIED',
                items: [
                  {
                    id: itemId,
                    productId: productId,
                    productName: 'Test Product',
                    quantity: 2,
                    unitPrice: 50,
                    originalTaxRate: 15,
                    appliedTaxRate: 15,
                    taxAmount: 15,
                    total: 115,
                    discount: 0,
                    inventorySnapshotVersion: 'SALE_TIME_V1',
                    inventorySnapshot: {
                      classification: 'SIMPLE',
                      disposition: 'DIRECT',
                      catalogRevision: 'test-revision',
                      mappingVersionId: mappingVersionId,
                      bindings: [
                        {
                          bindingOrdinal: 0,
                          insumoId: insumoId,
                          quantityPerSaleUnit: 1,
                          saleCorrelationId: correlationId,
                        },
                      ],
                    },
                  },
                ],
                payments: [
                  {
                    id: randomUUID(),
                    method: 'CASH',
                    amount: 115,
                    currency: 'NIO',
                    exchangeRate: 1,
                  },
                ],
              },
            },
          ],
        };

        // Initial Sync
        const response = await request(app.getHttpServer())
          .post('/v1/sync/batch')
          .set('Authorization', `Bearer ${deviceToken}`)
          .send(payload)
          .expect(201);

        expect(response.body).toMatchObject({
          status: 'success',
          received: 1,
          processed: 1,
          duplicates: 0,
          results: [
            expect.objectContaining({
              idempotencyKey: 'sale:terminal1:seq1',
              status: 'ACCEPTED',
            }),
          ],
        });

        // Verify DB State
        const invoices = await dataSource.query(
          `SELECT * FROM invoices WHERE tenant_id = $1`,
          [tenantId],
        );
        expect(invoices).toHaveLength(1);
        expect(invoices[0].id).toBe(invoiceId);
        expect(invoices[0].invoice_number).toBe('001-001-01-00000001');

        const receipts = await dataSource.query(
          `SELECT * FROM inventory_sync_receipts WHERE tenant_id = $1`,
          [tenantId],
        );
        expect(receipts).toHaveLength(1);
        expect(receipts[0].idempotency_key).toBe('sale:terminal1:seq1');

        const kardex = await dataSource.query(
          `SELECT * FROM inventory_kardex WHERE tenant_id = $1`,
          [tenantId],
        );
        expect(kardex).toHaveLength(1);
        expect(kardex[0].sale_correlation_id).toBe(correlationId);
        expect(Number(kardex[0].quantity)).toBe(-2); // 2 units sold

        // Replay Sync (Duplicate Gate)
        const replayResponse = await request(app.getHttpServer())
          .post('/v1/sync/batch')
          .set('Authorization', `Bearer ${deviceToken}`)
          .send(payload)
          .expect(201);

        expect(replayResponse.body).toMatchObject({
          status: 'success',
          received: 1,
          processed: 0, // Duplicate is not re-processed
          duplicates: 1,
          results: [
            expect.objectContaining({
              idempotencyKey: 'sale:terminal1:seq1',
              status: 'DUPLICATE',
            }),
          ],
        });

        // Verify DB State remains unchanged
        const invoicesAfter = await dataSource.query(
          `SELECT * FROM invoices WHERE tenant_id = $1`,
          [tenantId],
        );
        expect(invoicesAfter).toHaveLength(1); // DGI number unchanged

        const kardexAfter = await dataSource.query(
          `SELECT * FROM inventory_kardex WHERE tenant_id = $1`,
          [tenantId],
        );
        expect(kardexAfter).toHaveLength(1); // No new Kardex entries
      },
    );
  });
});
