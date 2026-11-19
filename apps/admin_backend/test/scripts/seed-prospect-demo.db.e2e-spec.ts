import { randomUUID } from 'crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/core/app/app.module';
import { runInTenantTransaction } from '../../src/core/database/tenant-transaction';
import { CatalogService } from '../../src/modules/catalog/catalog.service';
import { TenantSubscriptionService } from '../../src/modules/entitlements/tenant-subscription.service';
import { TenantTopologyRevisionService } from '../../src/modules/fulfillment/services/tenant-topology-revision.service';
import { Insumo } from '../../src/modules/inventory/entities/insumo.entity';
import { Product } from '../../src/modules/inventory/entities/product.entity';
import {
  FiscalRegime,
  TenantOperationMode,
} from '../../src/modules/onboarding/dto/fiscal-setup.dto';
import { CompanyLogoService } from '../../src/modules/onboarding/services/company-logo.service';
import { DeviceLinkingService } from '../../src/modules/onboarding/services/device-linking.service';
import { FiscalSetupService } from '../../src/modules/onboarding/services/fiscal-setup.service';
import { IndustryTemplateService } from '../../src/modules/onboarding/services/industry-template.service';
import {
  CashShiftSession,
  CashShiftStatus,
} from '../../src/modules/sales/entities/cash-shift.entity';
import { Invoice } from '../../src/modules/sales/entities/invoice.entity';
import { Payment } from '../../src/modules/sales/entities/payment.entity';
import {
  PROSPECT_DEMO_ERROR_CODES,
  isProspectDemoConfig,
  parseArgs,
  seedProspectDemo,
  type ProspectDemoConfig,
  type ProspectDemoDeps,
} from '../../src/scripts/seed-prospect-demo';

/**
 * Real PostgreSQL + real HTTP E2E suite for `seed-prospect-demo.ts`.
 *
 * Exercises the complete sales-demo provisioning pipeline end-to-end against
 * real NestJS services, RLS policies, PostgreSQL triggers (inventory_kardex
 * running balance, append-only system_parameters_config), HTTP login, and
 * pre-auth POS device linking (`POST /onboarding/activation/link`).
 *
 * Run with:
 *   npx jest --config ./test/jest-e2e.json test/scripts/seed-prospect-demo.db.e2e-spec.ts --runInBand
 */
describe('seed-prospect-demo real DB & HTTP E2E', () => {
  const TEST_TIMEOUT_MS = 60_000;
  let app: INestApplication;
  let dataSource: DataSource;
  let deps: ProspectDemoDeps;
  let fiscalSetupService: FiscalSetupService;
  let topologyService: TenantTopologyRevisionService;
  const createdTenantIds: string[] = [];

  const runSuffix = randomUUID().slice(0, 8);

  const requireConfig = (argv: readonly string[]): ProspectDemoConfig => {
    const parsed = parseArgs(argv);
    if (!isProspectDemoConfig(parsed)) {
      throw new Error('Unexpected --help in E2E test');
    }
    return parsed;
  };

  async function cleanupTenant(tenantId: string): Promise<void> {
    // Cleanup executes as the test DB connection owner; remove child records
    // in dependency order so the database remains spotless after the run.
    const tablesByTenantId = [
      'invoice_payments',
      'invoice_items',
      'invoices',
      'cash_shift_sessions',
      'device_linking_codes',
      'template_seed_links',
      'template_applications',
      'recipe_details',
      'recipe_versions',
      'uom_conversions',
      'products',
      'insumos',
      'catalog_values',
      'tenant_brand_assets',
      'fiscal_config_revisions',
      'onboarding_sessions',
      'tenant_entitlement_change_history',
      'tenant_subscriptions',
      'security_profiles',
      'users',
    ];

    await runInTenantTransaction(dataSource, tenantId, async (manager) => {
      for (const table of tablesByTenantId) {
        if (table === 'invoice_payments') {
          await manager.query(
            `DELETE FROM invoice_payments WHERE invoice_id IN (SELECT id FROM invoices WHERE tenant_id = $1)`,
            [tenantId],
          );
        } else if (table === 'security_profiles') {
          await manager.query(
            `DELETE FROM security_profiles WHERE user_id IN (SELECT id FROM users WHERE tenant_id = $1)`,
            [tenantId],
          );
        } else {
          await manager
            .query(`DELETE FROM "${table}" WHERE tenant_id = $1`, [tenantId])
            .catch(() => undefined);
        }
      }
      await manager
        .query(`DELETE FROM tenants WHERE id = $1`, [tenantId])
        .catch(() => undefined);
    }).catch(() => undefined);
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
      }),
    );
    await app.init();

    dataSource = app.get(DataSource);
    fiscalSetupService = app.get(FiscalSetupService);
    topologyService = app.get(TenantTopologyRevisionService);
    deps = {
      dataSource,
      catalogService: app.get(CatalogService),
      tenantSubscriptionService: app.get(TenantSubscriptionService),
      fiscalSetupService,
      companyLogoService: app.get(CompanyLogoService),
      industryTemplateService: app.get(IndustryTemplateService),
      tenantTopologyRevisionService: topologyService,
      deviceLinkingService: app.get(DeviceLinkingService),
    };
  }, TEST_TIMEOUT_MS);

  afterAll(async () => {
    for (const tenantId of createdTenantIds) {
      await cleanupTenant(tenantId);
    }
    if (app) {
      await app.close();
    }
  }, TEST_TIMEOUT_MS);

  it(
    'provisions cafeteria (FOODPARK_QSR) and restaurante (RESTAURANT) with RLS, real login, POS linking, and duplicate-slug guard',
    async () => {
      const cafeSlug = `demo-e2e-cafe-${runSuffix}`;
      const restSlug = `demo-e2e-rest-${runSuffix}`;

      const cafeConfig = requireConfig([
        '--name',
        `Café E2E ${runSuffix}`,
        '--slug',
        cafeSlug,
        '--vertical',
        'cafeteria',
        '--fx',
        '36.62',
        '--invoices',
        '6',
      ]);

      const restConfig = requireConfig([
        '--name',
        `Restaurante E2E ${runSuffix}`,
        '--slug',
        restSlug,
        '--vertical',
        'restaurante',
        '--fx',
        '36.85',
        '--invoices',
        '4',
      ]);

      const cafeResult = await seedProspectDemo(cafeConfig, deps, {
        NODE_ENV: 'test',
      });
      createdTenantIds.push(cafeResult.tenantId);

      const restResult = await seedProspectDemo(restConfig, deps, {
        NODE_ENV: 'test',
      });
      createdTenantIds.push(restResult.tenantId);

      // 1. Fiscal setup verification
      const cafeFiscal = await fiscalSetupService.getFiscalSetup(
        cafeResult.tenantId,
      );
      expect(cafeFiscal.regime).toBe(FiscalRegime.CUOTA_FIJA);
      expect(cafeFiscal.commercialFxSpread).toBe(36.62);
      expect(cafeFiscal.operationMode).toBe(TenantOperationMode.FOODPARK_QSR);

      const restFiscal = await fiscalSetupService.getFiscalSetup(
        restResult.tenantId,
      );
      expect(restFiscal.commercialFxSpread).toBe(36.85);
      expect(restFiscal.operationMode).toBe(TenantOperationMode.RESTAURANT);

      // 2. Restaurant tables topology: absent for QSR, provisioned for RESTAURANT
      const cafeTopology = await topologyService.current(cafeResult.tenantId);
      expect(cafeTopology.provisioned).toBe(false);

      const restTopology = await topologyService.current(restResult.tenantId);
      expect(restTopology.provisioned).toBe(true);
      expect(restTopology.topology?.tableCount).toBe(10);

      // 3. Real DB verification: products, insumos, kardex opening stock, invoices, payments, shift, RLS isolation
      await runInTenantTransaction(
        dataSource,
        cafeResult.tenantId,
        async (manager) => {
          const products = await manager.find(Product, {
            where: { tenant_id: cafeResult.tenantId },
          });
          const insumos = await manager.find(Insumo, {
            where: { tenant_id: cafeResult.tenantId },
          });
          const invoices = await manager.find(Invoice, {
            where: { tenant_id: cafeResult.tenantId },
          });
          const shift = await manager.findOne(CashShiftSession, {
            where: {
              tenant_id: cafeResult.tenantId,
              status: CashShiftStatus.OPEN,
            },
          });
          const payments = await manager.find(Payment, {
            where: invoices.map((inv) => ({ invoiceId: inv.id })),
          });
          const kardexRows = (await manager.query(
            `SELECT insumo_id, movement_type, unit_cost_nio, stock_after
               FROM inventory_kardex
              WHERE tenant_id = $1`,
            [cafeResult.tenantId],
          )) as Array<{
            insumo_id: string;
            movement_type: string;
            unit_cost_nio: string;
            stock_after: string;
          }>;

          expect(products.length).toBeGreaterThan(0);
          expect(insumos.length).toBeGreaterThan(0);
          expect(kardexRows.length).toBe(insumos.length);
          for (const row of kardexRows) {
            expect(row.movement_type).toBe('INITIAL_STOCK');
            expect(Number(row.unit_cost_nio)).toBeGreaterThanOrEqual(0);
            expect(Number(row.stock_after)).toBeGreaterThan(0);
          }

          expect(invoices).toHaveLength(6);
          const totalSales = invoices.reduce(
            (sum, inv) => sum + Number(inv.total),
            0,
          );
          expect(totalSales).toBeGreaterThan(0);
          expect(shift).not.toBeNull();
          expect(shift?.terminal_id).toBe('CAJA-01');

          const paymentCurrencies = new Set(payments.map((p) => p.currency));
          expect(paymentCurrencies.has('NIO')).toBe(true);
          expect(paymentCurrencies.has('USD')).toBe(true);

          // Verify strict tenant_id binding (no cross-tenant contamination between seeded demos)
          for (const product of products) {
            expect(product.tenant_id).toBe(cafeResult.tenantId);
          }
          for (const invoice of invoices) {
            expect(invoice.tenant_id).toBe(cafeResult.tenantId);
          }
          expect(
            products.some((p) => p.tenant_id === restResult.tenantId),
          ).toBe(false);
        },
      );

      // Verify Restaurante tenant also has its own distinct products & 4 invoices
      await runInTenantTransaction(
        dataSource,
        restResult.tenantId,
        async (manager) => {
          const restProducts = await manager.find(Product, {
            where: { tenant_id: restResult.tenantId },
          });
          const restInvoices = await manager.find(Invoice, {
            where: { tenant_id: restResult.tenantId },
          });
          expect(restProducts.length).toBeGreaterThan(0);
          expect(restInvoices).toHaveLength(4);
          expect(
            restProducts.some((p) => p.tenant_id === cafeResult.tenantId),
          ).toBe(false);
        },
      );

      // 4. Real HTTP login for newly provisioned OWNER
      const loginRes = await request(app.getHttpServer())
        .post('/identity/login')
        .send({
          email: cafeResult.users.owner.email,
          pass: cafeResult.password,
          tenantSlug: cafeResult.slug,
        });
      expect([200, 201]).toContain(loginRes.status);
      const loginBody = loginRes.body as Record<string, unknown>;
      expect(typeof loginBody.access_token).toBe('string');

      // 5. Real HTTP pre-auth POS device linking via POST /onboarding/activation/link
      const linkRes = await request(app.getHttpServer())
        .post('/onboarding/activation/link')
        .send({
          code: cafeResult.linkingCode,
          deviceId: `Q80-E2E-${runSuffix}`,
        })
        .expect(200);
      const linkBody = linkRes.body as Record<string, unknown>;
      expect(linkBody.tenantId).toBe(cafeResult.tenantId);
      expect(linkBody.slug).toBe(cafeResult.slug);

      // 6. Duplicate slug invocation fails gracefully without clobbering existing tenant
      await expect(
        seedProspectDemo(cafeConfig, deps, { NODE_ENV: 'test' }),
      ).rejects.toMatchObject({
        code: PROSPECT_DEMO_ERROR_CODES.DUPLICATE_SLUG,
      });
    },
    TEST_TIMEOUT_MS,
  );
});
