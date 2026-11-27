import { randomUUID } from 'crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { createMigrationBuiltSchemaFixture } from '../../../../test/support/migration-built-schema.helper';
import { currentLocalDateKey } from '../../../core/reporting/reporting-period';
import {
  DEVICE_SYNC_JWT_CONFIG,
  DeviceSyncJwtConfig,
} from '../../identity/config/device-sync-jwt.config';
import {
  IDENTITY_JWT_CONFIG,
  IdentityJwtConfig,
} from '../../identity/config/identity-jwt.config';
import { AuditLog } from '../../identity/entities/audit-log.entity';
import {
  DeviceSyncCredential,
  DeviceSyncCredentialStatus,
} from '../../identity/entities/device-sync-credential.entity';
import { SecurityProfile } from '../../identity/entities/security-profile.entity';
import { User, UserRole } from '../../identity/entities/user.entity';
import { AuthGuard } from '../../identity/guards/auth.guard';
import { SyncTransportGuard } from '../../identity/guards/sync-transport.guard';
import {
  DEVICE_SYNC_PRINCIPAL_TYPE_CLAIM,
  DEVICE_SYNC_TOKEN_TYPE,
  DeviceSyncJwtClaims,
} from '../../identity/security/jwt-token.types';
import { BatchOutflowTrace } from '../../inventory/entities/batch-outflow-trace.entity';
import { Batch } from '../../inventory/entities/batch.entity';
import { Insumo } from '../../inventory/entities/insumo.entity';
import { InventoryDivergence } from '../../inventory/entities/inventory-divergence.entity';
import {
  InventoryMovement,
  MovementType,
} from '../../inventory/entities/inventory-movement.entity';
import { InventorySyncOutbox } from '../../inventory/entities/inventory-sync-outbox.entity';
import { InventorySyncReceipt } from '../../inventory/entities/inventory-sync-receipt.entity';
import { ProductInventoryMappingVersion } from '../../inventory/entities/product-inventory-mapping-version.entity';
import { Product } from '../../inventory/entities/product.entity';
import {
  SystemParametersConfig,
  SystemParametersConfigActiveView,
} from '../../inventory/entities/system-parameters-config.entity';
import { UomConversion } from '../../inventory/entities/uom-conversion.entity';
import { ActivationAttempt } from '../../onboarding/entities/activation-attempt.entity';
import { Tenant } from '../../tenant/entities/tenant.entity';
import { normalizeTenantSlug } from '../../tenant/tenant-slug';
import { SyncBatchController } from '../controllers/sync-batch.controller';
import { InvoiceItemModifier } from '../entities/invoice-item-modifier.entity';
import { InvoiceItem } from '../entities/invoice-item.entity';
import { Invoice } from '../entities/invoice.entity';
import { Payment } from '../entities/payment.entity';
import { InvoicesService } from '../services/invoices.service';
import { SyncCreditNoteAuthGuard } from './sync-credit-note-auth.guard';

const postgresConnection = {
  host: process.env.DB_HOST?.trim() ?? '127.0.0.1',
  port: Number(process.env.DB_PORT?.trim() ?? '5432'),
  username: process.env.DB_USERNAME?.trim() ?? 'postgres',
  password: process.env.DB_PASSWORD?.trim() ?? 'postgres',
  database: process.env.DB_DATABASE?.trim() ?? 'omnifood',
};

describe('SyncCreditNoteAuthGuard (real PostgreSQL DB + HTTP E2E)', () => {
  const TEST_TIMEOUT_MS = 45000;

  const mockDeviceSyncJwtConfig: DeviceSyncJwtConfig = {
    secret: 'super-secure-device-sync-jwt-secret-key-32-chars!',
    algorithm: 'HS256',
    accessTokenTtlSeconds: 900,
    renewalTtlSeconds: 86400 * 30,
    issuer: 'omnifood-device-sync',
    audience: 'omnifood-device-sync-client',
    clockToleranceSeconds: 5,
  };

  const mockIdentityJwtConfig: IdentityJwtConfig = {
    secret: 'super-secure-identity-jwt-secret-key-32-chars!',
    algorithm: 'HS256',
    accessTokenTtlSeconds: 900,
    refreshTokenTtlSeconds: 86400 * 7,
    issuer: 'omnifood-identity',
    audience: 'omnifood-identity-client',
    clockToleranceSeconds: 5,
  };

  it(
    'blocks forged role & cross-tenant supervisor (403) and allows DB-verified active MANAGER CREDIT_NOTE with inventory reversal (201)',
    async () => {
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
          ActivationAttempt,
          DeviceSyncCredential,
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

      let app: INestApplication<App> | undefined;
      try {
        const jwtService = new JwtService();
        const invoicesService = new InvoicesService(
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

        const moduleFixture: TestingModule = await Test.createTestingModule({
          controllers: [SyncBatchController],
          providers: [
            { provide: InvoicesService, useValue: invoicesService },
            { provide: DEVICE_SYNC_JWT_CONFIG, useValue: mockDeviceSyncJwtConfig },
            { provide: IDENTITY_JWT_CONFIG, useValue: mockIdentityJwtConfig },
            { provide: JwtService, useValue: jwtService },
            { provide: DataSource, useValue: dataSource },
            SyncTransportGuard,
            SyncCreditNoteAuthGuard,
            AuthGuard,
          ],
        }).compile();

        app = moduleFixture.createNestApplication();
        app.useGlobalPipes(
          new ValidationPipe({
            whitelist: true,
            forbidNonWhitelisted: true,
            transform: true,
          }),
        );
        await app.init();

        const tenantA = randomUUID();
        const tenantB = randomUUID();
        const managerAId = randomUUID();
        const cashierAId = randomUUID();
        const managerBId = randomUUID();
        const attemptId = randomUUID();
        const onboardingSessionId = randomUUID();
        const credentialId = randomUUID();
        const insumoId = randomUUID();
        const productId = randomUUID();
        const originInvoiceId = randomUUID();
        const originItemId = randomUUID();
        const creditNoteId = randomUUID();
        const terminalId = 'POS-DT09-T3';
        const todayManagua = currentLocalDateKey();

        await dataSource.query(
          `INSERT INTO tenants (id, name, slug, is_active, created_at, updated_at)
           VALUES ($1, 'Tenant A', $2, true, now(), now()),
                  ($3, 'Tenant B', $4, true, now(), now())`,
          [
            tenantA,
            normalizeTenantSlug(`t3-a-${tenantA.slice(0, 8)}`),
            tenantB,
            normalizeTenantSlug(`t3-b-${tenantB.slice(0, 8)}`),
          ],
        );

        await dataSource.query(
          `INSERT INTO users (id, tenant_id, email, password_hash, name, role, is_active, created_at, updated_at)
           VALUES ($1, $2, 'mgr-a@test.local', 'hash', 'Manager A', $3, true, now(), now()),
                  ($4, $2, 'cash-a@test.local', 'hash', 'Cashier A', $5, true, now(), now()),
                  ($6, $7, 'mgr-b@test.local', 'hash', 'Manager B', $3, true, now(), now())`,
          [
            managerAId,
            tenantA,
            UserRole.MANAGER,
            cashierAId,
            UserRole.CASHIER,
            managerBId,
            tenantB,
          ],
        );

        await dataSource.query(
          `INSERT INTO onboarding_activation_attempts (
             id, tenant_id, onboarding_session_id, candidate_terminal_id, trusted_terminal_id,
             status, started_by_user_id, server_time_anchor_at,
             required_fiscal_revision, required_fiscal_fingerprint,
             verification_product_id, verification_product_fingerprint,
             created_at, updated_at
           )
           VALUES ($1, $2, $3, $4, $4, 'PASS', $5, now(), 1, 'fp-fiscal-1', $6, 'fp-prod-1', now(), now())`,
          [attemptId, tenantA, onboardingSessionId, terminalId, managerAId, productId],
        );

        await dataSource.query(
          `INSERT INTO device_sync_credentials (id, tenant_id, activation_attempt_id, renewal_secret_hash, scopes, version, status, expires_at, issued_at, created_at, updated_at)
           VALUES ($1, $2, $3, 'secret-hash', '["sync:push","sync:pull"]'::jsonb, 1, $4, now() + interval '1 day', now(), now(), now())`,
          [credentialId, tenantA, attemptId, DeviceSyncCredentialStatus.ACTIVE],
        );

        await dataSource.getRepository(Insumo).insert({
          id: insumoId,
          tenant_id: tenantA,
          name: 'Queso Mozzarella',
          purchaseUom: 'kg',
          consumptionUom: 'kg',
          stock: 8,
          existenciaActual: 8,
          averageCost: 100,
        });

        await dataSource.getRepository(Product).insert({
          id: productId,
          tenant_id: tenantA,
          name: 'Pizza Queso',
          uom: 'UNIT',
        });

        await dataSource.query(
          `INSERT INTO invoices (id, tenant_id, invoice_number, created_at, local_issue_date, user_id, subtotal, total_tax, total, is_canceled, payment_status, global_tax_override, type, updated_at)
           VALUES ($1, $2, '001-001-01-00000010', now(), $3, $4, 217.39, 32.61, 250, false, 'PAID', false, 'regular', now())`,
          [originInvoiceId, tenantA, todayManagua, cashierAId],
        );

        await dataSource.query(
          `INSERT INTO invoice_items (id, tenant_id, invoice_id, product_id, product_name, quantity, unit_price, original_tax_rate, applied_tax_rate, tax_amount, total, discount)
           VALUES ($1, $2, $3, $4, 'Pizza Queso', 2, 125, 0.15, 0.15, 32.61, 250, 0)`,
          [originItemId, tenantA, originInvoiceId, productId],
        );

        await dataSource.getRepository(InventoryMovement).insert({
          tenant_id: tenantA,
          insumoId,
          type: MovementType.PURCHASE,
          quantity: 10,
          previousStock: 0,
          newStock: 10,
          averageCostAfterNio: 100,
          unitCostNio: 100,
          totalCostNio: 1000,
          idempotencyKey: `open-${insumoId}`,
          sourceDeviceId: terminalId,
          sourceDocumentId: `purchase:${insumoId}`,
          sourceDocumentType: 'PURCHASE',
          timestamp: new Date(),
          user_id: managerAId,
        });

        await dataSource.getRepository(InventoryMovement).insert({
          tenant_id: tenantA,
          insumoId,
          type: MovementType.SALE,
          quantity: -2,
          previousStock: 10,
          newStock: 8,
          averageCostAfterNio: 100,
          unitCostNio: 100,
          totalCostNio: 200,
          idempotencyKey: `sale-${originInvoiceId}`,
          sourceDeviceId: terminalId,
          sourceDocumentId: `invoice:${originInvoiceId}`,
          sourceDocumentType: 'SALE',
          originInvoiceItemId: originItemId,
          timestamp: new Date(),
          user_id: cashierAId,
        });

        const claims: DeviceSyncJwtClaims = {
          sub: credentialId,
          principal_type: DEVICE_SYNC_PRINCIPAL_TYPE_CLAIM,
          token_type: DEVICE_SYNC_TOKEN_TYPE,
          tenant_id: tenantA,
          device_id: terminalId,
          scopes: ['sync:push', 'sync:pull'],
          credential_version: 1,
          jti: `jti-${randomUUID()}`,
        };
        const token = await jwtService.signAsync(claims, {
          secret: mockDeviceSyncJwtConfig.secret,
          algorithm: mockDeviceSyncJwtConfig.algorithm,
          issuer: mockDeviceSyncJwtConfig.issuer,
          audience: mockDeviceSyncJwtConfig.audience,
          expiresIn: mockDeviceSyncJwtConfig.accessTokenTtlSeconds,
        });

        const buildPayload = (
          idempotencyKey: string,
          authorizedByUserId: string,
          authorizedByRole: string,
          sourceSequence: number,
        ) => ({
          records: [
            {
              idempotencyKey,
              sourceDeviceId: terminalId,
              sourceSequence,
              flowType: 'sales',
              documentType: 'CREDIT_NOTE',
              invoice: {
                id: creditNoteId,
                number: 'NC-001-00000001',
                createdAt: new Date().toISOString(),
                userId: cashierAId,
                subtotal: -217.39,
                totalTax: -32.61,
                total: -250,
                paymentStatus: 'REFUNDED',
                type: 'creditNote',
                originInvoiceId,
                refundReasonCode: 'CUSTOMER_RETURN',
                refundReasonPolicy: 'RESTOCK_ORIGINAL_BOM',
                authorizedByUserId,
                authorizedByRole,
                items: [
                  {
                    id: randomUUID(),
                    productId,
                    productName: 'Pizza Queso',
                    quantity: -2,
                    unitPrice: 125,
                    originalTaxRate: 0.15,
                    appliedTaxRate: 0.15,
                    taxAmount: -32.61,
                    total: -250,
                    discount: 0,
                    originInvoiceItemId: originItemId,
                  },
                ],
                payments: [],
              },
            },
          ],
        });

        // 1) Forged role: cashier user claiming 'manager' -> 403 Forbidden
        await request(app.getHttpServer())
          .post('/v1/sync/batch')
          .set('Authorization', `Bearer ${token}`)
          .send(
            buildPayload(`cn-forged-${creditNoteId}`, cashierAId, 'manager', 1),
          )
          .expect(403);

        // 2) Cross-tenant supervisor: Tenant B manager -> 403 Forbidden
        await request(app.getHttpServer())
          .post('/v1/sync/batch')
          .set('Authorization', `Bearer ${token}`)
          .send(
            buildPayload(`cn-cross-${creditNoteId}`, managerBId, 'manager', 1),
          )
          .expect(403);

        const [stockBefore] = (await dataSource.query(
          `SELECT stock FROM insumos WHERE id = $1`,
          [insumoId],
        )) as Array<{ stock: string }>;
        expect(Number(stockBefore.stock)).toBe(8);

        // 3) Genuine active same-tenant MANAGER -> 201 Created + persists + reverses inventory
        const okRes = await request(app.getHttpServer())
          .post('/v1/sync/batch')
          .set('Authorization', `Bearer ${token}`)
          .send(
            buildPayload(`cn-valid-${creditNoteId}`, managerAId, 'manager', 1),
          )
          .expect(201);

        expect(okRes.body).toEqual(
          expect.objectContaining({
            status: 'success',
            received: 1,
            processed: 1,
          }),
        );

        const [persistedCn] = (await dataSource.query(
          `SELECT id, type, origin_invoice_id, authorized_by_user_id, authorized_by_role
           FROM invoices WHERE id = $1`,
          [creditNoteId],
        )) as Array<{
          id: string;
          type: string;
          origin_invoice_id: string;
          authorized_by_user_id: string;
          authorized_by_role: string;
        }>;
        expect(persistedCn).toEqual({
          id: creditNoteId,
          type: 'creditNote',
          origin_invoice_id: originInvoiceId,
          authorized_by_user_id: managerAId,
          authorized_by_role: 'manager',
        });

        const [stockAfter] = (await dataSource.query(
          `SELECT stock, existencia_actual FROM insumos WHERE id = $1`,
          [insumoId],
        )) as Array<{ stock: string; existencia_actual: string }>;
        expect(Number(stockAfter.stock)).toBe(10);
        expect(Number(stockAfter.existencia_actual)).toBe(10);
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
