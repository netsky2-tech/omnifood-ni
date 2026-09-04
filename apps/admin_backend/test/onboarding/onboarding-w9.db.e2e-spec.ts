import { randomUUID } from 'crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { Tenant } from '../../src/modules/tenant/entities/tenant.entity';
import { SystemParametersConfig } from '../../src/modules/inventory/entities/system-parameters-config.entity';
import { Product, ProductType } from '../../src/modules/inventory/entities/product.entity';
import { Insumo } from '../../src/modules/inventory/entities/insumo.entity';
import { Recipe } from '../../src/modules/inventory/entities/recipe.entity';
import { RecipeVersion } from '../../src/modules/inventory/entities/recipe-version.entity';
import { RecipeDetail } from '../../src/modules/inventory/entities/recipe-detail.entity';
import { UomConversion } from '../../src/modules/inventory/entities/uom-conversion.entity';
import { IndustryTemplate } from '../../src/modules/onboarding/entities/industry-template.entity';
import { TemplateInsumo } from '../../src/modules/onboarding/entities/template-insumo.entity';
import { TemplateProduct } from '../../src/modules/onboarding/entities/template-product.entity';
import { TemplateRecipeItem } from '../../src/modules/onboarding/entities/template-recipe-item.entity';
import { ImportStaging } from '../../src/modules/onboarding/entities/import-staging.entity';
import { TemplateSeedLink } from '../../src/modules/onboarding/entities/template-seed-link.entity';
import { TemplateApplication } from '../../src/modules/onboarding/entities/template-application.entity';
import { LegacyOnboardingMigrationReceipt } from '../../src/modules/onboarding/entities/legacy-migration-receipt.entity';
import { OnboardingSession } from '../../src/modules/onboarding/entities/onboarding-session.entity';
import { OnboardingIdempotencyRecord } from '../../src/modules/onboarding/entities/onboarding-idempotency.entity';
import { TemplatePreviewService } from '../../src/modules/onboarding/services/template-preview.service';
import { LegacyTemplateRecipeScanService } from '../../src/modules/onboarding/services/legacy-template-recipe-scan.service';
import { OnboardingIdempotencyCoordinator } from '../../src/modules/onboarding/services/onboarding-idempotency.coordinator';
import { FiscalSetupController } from '../../src/modules/onboarding/controllers/fiscal-setup.controller';
import { IndustryTemplateController } from '../../src/modules/onboarding/controllers/industry-template.controller';
import { ImportStagingController } from '../../src/modules/onboarding/controllers/import-staging.controller';
import { FiscalSetupService } from '../../src/modules/onboarding/services/fiscal-setup.service';
import { IndustryTemplateService } from '../../src/modules/onboarding/services/industry-template.service';
import { ImportStagingService } from '../../src/modules/onboarding/services/import-staging.service';
import { FiscalRegime } from '../../src/modules/onboarding/dto/fiscal-setup.dto';
import { UserRole } from '../../src/modules/identity/entities/user.entity';
import { AuthGuard } from '../../src/modules/identity/guards/auth.guard';
import { RolesGuard } from '../../src/modules/identity/guards/roles.guard';
import {
  createIdentityJwtConfigProvider,
  createIdentityJwtTestConfigProvider,
  signIdentityJwtAccessToken,
} from '../support/identity-jwt-test.fixture';

const postgresConnection = {
  host: process.env.DB_HOST?.trim() ?? '127.0.0.1',
  port: Number(process.env.DB_PORT?.trim() ?? 5432),
  username: process.env.DB_USERNAME?.trim() ?? 'postgres',
  password: process.env.DB_PASSWORD?.trim() ?? 'postgres',
  database: process.env.DB_DATABASE?.trim() ?? 'omnifood',
};

async function withOnboardingIsolatedSchema(
  schemaPrefix: string,
  assertion: (ctx: {
    app: INestApplication;
    dataSource: DataSource;
    jwtService: JwtService;
    tenantAId: string;
    tenantBId: string;
    ownerTokenA: string;
    ownerTokenB: string;
  }) => Promise<void>,
): Promise<void> {
  const bootstrap = new DataSource({ type: 'postgres', ...postgresConnection });
  const schema = `${schemaPrefix}_${randomUUID().replace(/-/g, '')}`;
  let dataSource: DataSource | null = null;
  let app: INestApplication | null = null;

  try {
    await bootstrap.initialize();
    await bootstrap.query(`CREATE SCHEMA "${schema}"`);

    dataSource = new DataSource({
      type: 'postgres',
      ...postgresConnection,
      schema,
      entities: [
        Tenant,
        SystemParametersConfig,
        Product,
        Insumo,
        Recipe,
        RecipeVersion,
        RecipeDetail,
        UomConversion,
        IndustryTemplate,
        TemplateInsumo,
        TemplateProduct,
        TemplateRecipeItem,
        ImportStaging,
        TemplateSeedLink,
        TemplateApplication,
        LegacyOnboardingMigrationReceipt,
        OnboardingSession,
        OnboardingIdempotencyRecord,
      ],
      synchronize: true,
    });
    await dataSource.initialize();
    await dataSource.query(`SET search_path TO "${schema}"`);

    // Create historical invoices table in the isolated schema (ODAV-31)
    await dataSource.query(`
      CREATE TABLE IF NOT EXISTS invoices (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id VARCHAR NOT NULL,
        invoice_number VARCHAR NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        user_id VARCHAR NOT NULL,
        subtotal NUMERIC(12, 2) NOT NULL,
        total_tax NUMERIC(12, 2) NOT NULL,
        total NUMERIC(12, 2) NOT NULL,
        is_canceled BOOLEAN NOT NULL DEFAULT false,
        payment_status VARCHAR NOT NULL DEFAULT 'paid',
        type VARCHAR NOT NULL DEFAULT 'regular'
      );
    `);

    // Seed Two Tenants: Tenant A and Tenant B (ODAV-34)
    const tenantAId = randomUUID();
    const tenantBId = randomUUID();

    await dataSource.query(
      `INSERT INTO tenants (id, name, is_active, created_at, updated_at) VALUES ($1, $2, true, now(), now())`,
      [tenantAId, 'Tenant A — Café Central'],
    );
    await dataSource.query(
      `INSERT INTO tenants (id, name, is_active, created_at, updated_at) VALUES ($1, $2, true, now(), now())`,
      [tenantBId, 'Tenant B — Bar El Molino'],
    );

    // Seed Industry Templates (CAFETERIA archetype with insumos, products, recipes)
    const templateCafeId = 'TPL_CAFETERIA_E2E';
    await dataSource.query(
      `INSERT INTO industry_templates (id, code, name, description, icon, is_active)
       VALUES ($1, 'CAFETERIA', 'Cafetería & Panadería', 'Plantilla para café', 'coffee', true)`,
      [templateCafeId],
    );

    const insumoCafeId = randomUUID();
    await dataSource.query(
      `INSERT INTO template_insumos (id, template_id, name, purchase_uom, consumption_uom, conversion_factor, negative_stock_policy)
       VALUES ($1, $2, 'Café en Grano Especial', 'KG', 'G', 1000, 'RESTRICT')`,
      [insumoCafeId, templateCafeId],
    );

    const insumoLecheId = randomUUID();
    await dataSource.query(
      `INSERT INTO template_insumos (id, template_id, name, purchase_uom, consumption_uom, conversion_factor, negative_stock_policy)
       VALUES ($1, $2, 'Leche Entera 1L', 'L', 'ML', 1000, 'RESTRICT')`,
      [insumoLecheId, templateCafeId],
    );

    const prodLatteId = randomUUID();
    await dataSource.query(
      `INSERT INTO template_products (id, template_id, name, category, uom, suggested_price)
       VALUES ($1, $2, 'Café Latte Caliente', 'Bebidas Calientes', 'UN', 65.00)`,
      [prodLatteId, templateCafeId],
    );

    await dataSource.query(
      `INSERT INTO template_recipe_items (template_product_id, template_insumo_name, gross_quantity, technical_shrink_pct, component_uom)
       VALUES ($1, 'Café en Grano Especial', 18.0000, 0, 'G')`,
      [prodLatteId],
    );

    // Build NestJS Application
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [
        FiscalSetupController,
        IndustryTemplateController,
        ImportStagingController,
      ],
      providers: [
        Reflector,
        AuthGuard,
        RolesGuard,
        JwtService,
        createIdentityJwtTestConfigProvider(),
        createIdentityJwtConfigProvider(),
        {
          provide: DataSource,
          useValue: dataSource,
        },
        {
          provide: 'TenantRepository',
          useValue: dataSource.getRepository(Tenant),
        },
        {
          provide: 'SystemParametersConfigRepository',
          useValue: dataSource.getRepository(SystemParametersConfig),
        },
        {
          provide: 'ProductRepository',
          useValue: dataSource.getRepository(Product),
        },
        {
          provide: 'InsumoRepository',
          useValue: dataSource.getRepository(Insumo),
        },
        {
          provide: 'RecipeRepository',
          useValue: dataSource.getRepository(Recipe),
        },
        {
          provide: 'RecipeVersionRepository',
          useValue: dataSource.getRepository(RecipeVersion),
        },
        {
          provide: 'RecipeDetailRepository',
          useValue: dataSource.getRepository(RecipeDetail),
        },
        {
          provide: 'UomConversionRepository',
          useValue: dataSource.getRepository(UomConversion),
        },
        {
          provide: 'IndustryTemplateRepository',
          useValue: dataSource.getRepository(IndustryTemplate),
        },
        {
          provide: 'TemplateInsumoRepository',
          useValue: dataSource.getRepository(TemplateInsumo),
        },
        {
          provide: 'TemplateProductRepository',
          useValue: dataSource.getRepository(TemplateProduct),
        },
        {
          provide: 'TemplateRecipeItemRepository',
          useValue: dataSource.getRepository(TemplateRecipeItem),
        },
        {
          provide: 'ImportStagingRepository',
          useValue: dataSource.getRepository(ImportStaging),
        },
        {
          provide: 'TemplateSeedLinkRepository',
          useValue: dataSource.getRepository(TemplateSeedLink),
        },
        {
          provide: 'TemplateApplicationRepository',
          useValue: dataSource.getRepository(TemplateApplication),
        },
        {
          provide: 'LegacyOnboardingMigrationReceiptRepository',
          useValue: dataSource.getRepository(LegacyOnboardingMigrationReceipt),
        },
        {
          provide: 'OnboardingSessionRepository',
          useValue: dataSource.getRepository(OnboardingSession),
        },
        {
          provide: 'OnboardingIdempotencyRecordRepository',
          useValue: dataSource.getRepository(OnboardingIdempotencyRecord),
        },
        {
          provide: 'InvoiceItemRepository',
          useValue: { count: jest.fn().mockResolvedValue(0) },
        },
        {
          provide: EventEmitter2,
          useValue: { emit: jest.fn() },
        },
        TemplatePreviewService,
        LegacyTemplateRecipeScanService,
        OnboardingIdempotencyCoordinator,
        FiscalSetupService,
        IndustryTemplateService,
        ImportStagingService,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();

    const jwtService = app.get(JwtService);
    const ownerTokenA = signIdentityJwtAccessToken(jwtService, {
      sub: randomUUID(),
      email: 'owner-a@omnifood.ni',
      role: UserRole.OWNER,
      tenant_id: tenantAId,
    });
    const ownerTokenB = signIdentityJwtAccessToken(jwtService, {
      sub: randomUUID(),
      email: 'owner-b@omnifood.ni',
      role: UserRole.OWNER,
      tenant_id: tenantBId,
    });

    await assertion({
      app,
      dataSource,
      jwtService,
      tenantAId,
      tenantBId,
      ownerTokenA,
      ownerTokenB,
    });
  } finally {
    if (app) {
      await app.close();
    }
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
    if (bootstrap.isInitialized) {
      await bootstrap.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await bootstrap.destroy();
    }
  }
}

describe('W9 Backend PostgreSQL E2E — ODAV-31..34 Specifications', () => {
  it('ODAV-31: Fiscal setup configuration NEVER mutates historical invoices in PostgreSQL', async () => {
    await withOnboardingIsolatedSchema('odav31', async ({ app, dataSource, tenantAId, ownerTokenA }) => {
      // 1. Seed historical invoice under baseline regime (0% tax, subtotal 500, total 500)
      const invoiceId = randomUUID();
      await dataSource.query(
        `INSERT INTO invoices (id, tenant_id, invoice_number, user_id, subtotal, total_tax, total, is_canceled, payment_status)
         VALUES ($1, $2, 'FAC-HIST-0001', 'usr-001', 500.00, 0.00, 500.00, false, 'paid')`,
        [invoiceId, tenantAId],
      );

      // Verify baseline invoice in database
      const [beforeInvoice] = await dataSource.query(
        `SELECT subtotal, total_tax, total, is_canceled FROM invoices WHERE id = $1`,
        [invoiceId],
      );
      expect(Number(beforeInvoice.subtotal)).toBe(500.0);
      expect(Number(beforeInvoice.total_tax)).toBe(0.0);
      expect(Number(beforeInvoice.total)).toBe(500.0);
      expect(beforeInvoice.is_canceled).toBe(false);

      // 2. Perform strategic fiscal reconfiguration (CUOTA_FIJA -> REGIMEN_GENERAL 15% IVA, custom FX spread, prices include tax)
      const res = await request(app.getHttpServer())
        .post('/onboarding/fiscal-setup')
        .set('Authorization', `Bearer ${ownerTokenA}`)
        .send({
          regime: FiscalRegime.REGIMEN_GENERAL,
          businessName: 'Café Central Nicaragua S.A.',
          ruc: 'J0310000055555',
          commercialFxSpread: 0.75,
          pricesIncludeTax: true,
        });

      expect(res.status).toBe(201);
      expect(res.body.regime).toBe(FiscalRegime.REGIMEN_GENERAL);
      expect(res.body.taxRateIva).toBe(0.15);

      // 3. ODAV-31 Verification: The historical invoice must remain 100% unmodified!
      const [afterInvoice] = await dataSource.query(
        `SELECT subtotal, total_tax, total, is_canceled FROM invoices WHERE id = $1`,
        [invoiceId],
      );
      expect(Number(afterInvoice.subtotal)).toBe(500.0);
      expect(Number(afterInvoice.total_tax)).toBe(0.0);
      expect(Number(afterInvoice.total)).toBe(500.0);
      expect(afterInvoice.is_canceled).toBe(false);

      // Zero extra or mutated invoices in table
      const countRes = await dataSource.query(
        `SELECT COUNT(*) as cnt FROM invoices WHERE tenant_id = $1`,
        [tenantAId],
      );
      expect(Number(countRes[0].cnt)).toBe(1);
    });
  });

  it('ODAV-32 & ODAV-33: 1,500-row bulk import in chunks <=100, 20 invalid rows rejected, 1,480 valid rows committed, replay idempotent', async () => {
    await withOnboardingIsolatedSchema('odav32', async ({ app, dataSource, tenantAId, ownerTokenA }) => {
      const sessionToken = randomUUID();

      // 1. Generate ODAV-32 scenario: 1,500 rows total (20 invalid, 1,480 valid)
      const allRows = Array.from({ length: 1500 }, (_, i) => {
        const isInvalid = i < 20;
        return {
          nombre: isInvalid ? `Invalid Row #${i + 1}` : `Valid Item #${i + 1}`,
          sku: `SKU-${String(i + 1).padStart(5, '0')}`,
          precioVenta: isInvalid ? -5 : 45 + (i % 20),
          costoInsumo: isInvalid ? -1 : 15,
          categoria: 'General',
          uom: 'UN',
        };
      });

      // 2. Upload in 15 chunks of 100 rows each (strictly <= 100 rows per chunk)
      const CHUNK_SIZE = 100;
      const totalChunks = Math.ceil(allRows.length / CHUNK_SIZE);
      expect(totalChunks).toBe(15);

      for (let c = 0; c < totalChunks; c++) {
        const chunk = allRows.slice(c * CHUNK_SIZE, (c + 1) * CHUNK_SIZE);
        const res = await request(app.getHttpServer())
          .post('/onboarding/import/upload')
          .set('Authorization', `Bearer ${ownerTokenA}`)
          .send({
            sessionToken,
            rows: chunk,
          });

        expect(res.status).toBe(201);
      }

      // 3. ODAV-32 DB Verification: 1,500 rows in staging (1,480 VALIDO, 20 ERROR)
      const [stagingCounts] = await dataSource.query(
        `SELECT
           COUNT(*) as total,
           COUNT(*) FILTER (WHERE estado_fila = 'VALIDO') as valid,
           COUNT(*) FILTER (WHERE estado_fila = 'ERROR') as errors
         FROM staging_importacion_productos
         WHERE tenant_id = $1 AND token_sesion_importacion = $2`,
        [tenantAId, sessionToken],
      );

      expect(Number(stagingCounts.total)).toBe(1500);
      expect(Number(stagingCounts.valid)).toBe(1480);
      expect(Number(stagingCounts.errors)).toBe(20);

      // 4. Commit valid rows only (mode = VALID_ONLY)
      const commitRes = await request(app.getHttpServer())
        .post('/onboarding/import/commit')
        .set('Authorization', `Bearer ${ownerTokenA}`)
        .send({
          sessionToken,
          mode: 'VALID_ONLY',
          duplicateResolution: 'REPLACE',
        });

      expect(commitRes.status).toBe(201);
      expect(commitRes.body.totalCommitted).toBe(1480);
      expect(commitRes.body.productsCreated).toBe(1480);

      // Verify production catalog table has exactly 1,480 products
      const [prodCount] = await dataSource.query(
        `SELECT COUNT(*) as cnt FROM products WHERE tenant_id = $1`,
        [tenantAId],
      );
      expect(Number(prodCount.cnt)).toBe(1480);

      // 5. ODAV-33 Replay Idempotency Verification:
      // Re-posting commit with the identical session token must succeed and must NOT insert duplicate products
      const replayRes = await request(app.getHttpServer())
        .post('/onboarding/import/commit')
        .set('Authorization', `Bearer ${ownerTokenA}`)
        .send({
          sessionToken,
          mode: 'VALID_ONLY',
          duplicateResolution: 'REPLACE',
        });

      expect(replayRes.status).toBe(201);

      // Catalog remains exactly 1,480 rows (no duplicates)
      const [prodCountAfterReplay] = await dataSource.query(
        `SELECT COUNT(*) as cnt FROM products WHERE tenant_id = $1`,
        [tenantAId],
      );
      expect(Number(prodCountAfterReplay.cnt)).toBe(1480);
    });
  });

  it('ODAV-34: Industry template application has blast radius = 0 on other tenants in PostgreSQL', async () => {
    await withOnboardingIsolatedSchema('odav34', async ({ app, dataSource, tenantAId, tenantBId, ownerTokenA }) => {
      // 1. Seed Tenant B with 3 existing products and 2 insumos
      const prodRepo = dataSource.getRepository(Product);
      const insumoRepo = dataSource.getRepository(Insumo);

      for (let i = 1; i <= 3; i++) {
        await prodRepo.save(
          prodRepo.create({
            id: randomUUID(),
            tenant_id: tenantBId,
            name: `Tenant B Exclusive Product #${i}`,
            uom: 'UN',
            product_type: ProductType.SIMPLE,
          }),
        );
      }
      for (let i = 1; i <= 2; i++) {
        await insumoRepo.save(
          insumoRepo.create({
            id: randomUUID(),
            tenant_id: tenantBId,
            name: `Tenant B Exclusive Insumo #${i}`,
            purchaseUom: 'KG',
            consumptionUom: 'G',
          }),
        );
      }

      // Snapshot Tenant B database state before Tenant A action
      const [bProdsBefore] = await dataSource.query(
        `SELECT COUNT(*) as cnt FROM products WHERE tenant_id = $1`,
        [tenantBId],
      );
      const [bInsumosBefore] = await dataSource.query(
        `SELECT COUNT(*) as cnt FROM insumos WHERE tenant_id = $1`,
        [tenantBId],
      );
      expect(Number(bProdsBefore.cnt)).toBe(3);
      expect(Number(bInsumosBefore.cnt)).toBe(2);

      // 2. Tenant A applies CAFETERIA template
      const applyRes = await request(app.getHttpServer())
        .post('/onboarding/templates/CAFETERIA/apply')
        .set('Authorization', `Bearer ${ownerTokenA}`)
        .send({
          overrideExisting: false,
          prefixSku: 'CAFE-',
        });

      expect(applyRes.status).toBe(201);
      expect(applyRes.body.productsCreated).toBeGreaterThan(0);
      expect(applyRes.body.insumosCreated).toBeGreaterThan(0);

      // 3. ODAV-34 Verification: Tenant B must experience ZERO change (Blast Radius = 0)
      const [bProdsAfter] = await dataSource.query(
        `SELECT COUNT(*) as cnt FROM products WHERE tenant_id = $1`,
        [tenantBId],
      );
      const [bInsumosAfter] = await dataSource.query(
        `SELECT COUNT(*) as cnt FROM insumos WHERE tenant_id = $1`,
        [tenantBId],
      );
      expect(Number(bProdsAfter.cnt)).toBe(3);
      expect(Number(bInsumosAfter.cnt)).toBe(2);

      // Ensure no rows in Tenant B have Tenant A references or template items
      const [crossTenantLeak] = await dataSource.query(
        `SELECT COUNT(*) as cnt FROM products WHERE tenant_id = $1 AND name LIKE '%Latte%'`,
        [tenantBId],
      );
      expect(Number(crossTenantLeak.cnt)).toBe(0);
    });
  });
});
