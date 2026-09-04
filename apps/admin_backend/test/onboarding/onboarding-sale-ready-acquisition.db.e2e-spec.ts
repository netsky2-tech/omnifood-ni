import { randomUUID } from 'crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { Tenant } from '../../src/modules/tenant/entities/tenant.entity';
import { User, UserRole } from '../../src/modules/identity/entities/user.entity';
import { SecurityProfile } from '../../src/modules/identity/entities/security-profile.entity';
import { SystemParametersConfig } from '../../src/modules/inventory/entities/system-parameters-config.entity';
import { Product, ProductType } from '../../src/modules/inventory/entities/product.entity';
import { Insumo } from '../../src/modules/inventory/entities/insumo.entity';
import { Recipe } from '../../src/modules/inventory/entities/recipe.entity';
import { RecipeVersion, RecipePublicationState, RecipeOrigin, RecipeSuggestionState } from '../../src/modules/inventory/entities/recipe-version.entity';
import { RecipeDetail } from '../../src/modules/inventory/entities/recipe-detail.entity';
import { UomConversion } from '../../src/modules/inventory/entities/uom-conversion.entity';
import { IndustryTemplate } from '../../src/modules/onboarding/entities/industry-template.entity';
import { TemplateInsumo } from '../../src/modules/onboarding/entities/template-insumo.entity';
import { TemplateProduct } from '../../src/modules/onboarding/entities/template-product.entity';
import { TemplateRecipeItem } from '../../src/modules/onboarding/entities/template-recipe-item.entity';
import { TemplateApplication } from '../../src/modules/onboarding/entities/template-application.entity';
import { TemplateSeedLink } from '../../src/modules/onboarding/entities/template-seed-link.entity';
import { ImportStaging } from '../../src/modules/onboarding/entities/import-staging.entity';
import { ProductImportSession } from '../../src/modules/onboarding/entities/product-import-session.entity';
import { LegacyImportIntegrityReport } from '../../src/modules/onboarding/entities/legacy-import-integrity-report.entity';
import { LegacyOnboardingMigrationReceipt } from '../../src/modules/onboarding/entities/legacy-migration-receipt.entity';
import {
  OnboardingSession,
  OnboardingLifecycleState,
} from '../../src/modules/onboarding/entities/onboarding-session.entity';
import { OnboardingIdempotencyRecord } from '../../src/modules/onboarding/entities/onboarding-idempotency.entity';
import { OnboardingSessionController } from '../../src/modules/onboarding/controllers/onboarding-session.controller';
import { OnboardingSessionService } from '../../src/modules/onboarding/services/onboarding-session.service';
import { OnboardingReadinessEvaluator } from '../../src/modules/onboarding/services/onboarding-readiness.evaluator';
import { OnboardingStateReconciler } from '../../src/modules/onboarding/services/onboarding-state.reconciler';
import { OnboardingIdempotencyCoordinator } from '../../src/modules/onboarding/services/onboarding-idempotency.coordinator';
import { FiscalSetupService } from '../../src/modules/onboarding/services/fiscal-setup.service';
import { FiscalSetupController } from '../../src/modules/onboarding/controllers/fiscal-setup.controller';
import { FiscalRegime } from '../../src/modules/onboarding/dto/fiscal-setup.dto';
import { IndustryTemplateService } from '../../src/modules/onboarding/services/industry-template.service';
import { IndustryTemplateController } from '../../src/modules/onboarding/controllers/industry-template.controller';
import { TemplatePreviewService } from '../../src/modules/onboarding/services/template-preview.service';
import { LegacyTemplateRecipeScanService } from '../../src/modules/onboarding/services/legacy-template-recipe-scan.service';
import { ImportStagingService } from '../../src/modules/onboarding/services/import-staging.service';
import { ImportStagingController } from '../../src/modules/onboarding/controllers/import-staging.controller';
import { CanonicalCsvParserService } from '../../src/modules/onboarding/services/canonical-csv-parser.service';
import { LegacyImportIntegrityReportService } from '../../src/modules/onboarding/services/legacy-import-integrity-report.service';
import { OnboardingCatalogService } from '../../src/modules/onboarding/services/onboarding-catalog.service';
import { OnboardingCatalogController } from '../../src/modules/onboarding/controllers/onboarding-catalog.controller';
import { IDENTITY_READINESS_PORT } from '../../src/modules/onboarding/ports/identity-readiness.port';
import { FISCAL_READINESS_PORT } from '../../src/modules/onboarding/ports/fiscal-readiness.port';
import { CATALOG_READINESS_PORT } from '../../src/modules/onboarding/ports/catalog-readiness.port';
import { IdentityReadinessAdapter } from '../../src/modules/onboarding/adapters/identity-readiness.adapter';
import { FiscalReadinessAdapter } from '../../src/modules/onboarding/adapters/fiscal-readiness.adapter';
import { CatalogReadinessAdapter } from '../../src/modules/onboarding/adapters/catalog-readiness.adapter';
import { AuthGuard } from '../../src/modules/identity/guards/auth.guard';
import { RolesGuard } from '../../src/modules/identity/guards/roles.guard';
import { PermissionsGuard } from '../../src/modules/identity/guards/permissions.guard';
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

async function withAcquisitionIsolatedSchema(
  schemaPrefix: string,
  assertion: (ctx: {
    app: INestApplication;
    dataSource: DataSource;
    jwtService: JwtService;
    tenantId: string;
    ownerToken: string;
    managerToken: string;
    cashierToken: string;
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
        User,
        SecurityProfile,
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
        TemplateApplication,
        TemplateSeedLink,
        ImportStaging,
        ProductImportSession,
        LegacyImportIntegrityReport,
        LegacyOnboardingMigrationReceipt,
        OnboardingSession,
        OnboardingIdempotencyRecord,
      ],
      synchronize: true,
    });

    await dataSource.initialize();

    const tenantId = randomUUID();
    const ownerUserId = randomUUID();
    const managerUserId = randomUUID();
    const cashierUserId = randomUUID();

    await dataSource.getRepository(Tenant).save({
      id: tenantId,
      name: '   ',
      ruc: null,
      is_active: true,
    });

    await dataSource.getRepository(User).save([
      {
        id: ownerUserId,
        tenant_id: tenantId,
        name: 'Owner User',
        email: 'owner@omnifood.ni',
        password_hash: 'test-hash',
        role: UserRole.OWNER,
        is_active: true,
        security_version: 1,
      },
      {
        id: managerUserId,
        tenant_id: tenantId,
        name: 'Manager User',
        email: 'manager@omnifood.ni',
        password_hash: 'test-hash',
        role: UserRole.MANAGER,
        is_active: true,
        security_version: 1,
      },
      {
        id: cashierUserId,
        tenant_id: tenantId,
        name: 'Cashier User',
        email: 'cashier@omnifood.ni',
        password_hash: 'test-hash',
        role: UserRole.CASHIER,
        is_active: true,
        security_version: 1,
      },
    ]);

    // Seed CAFETERIA template
    const template = await dataSource.getRepository(IndustryTemplate).save({
      id: 'CAFETERIA',
      code: 'CAFETERIA',
      name: 'Cafetería & Coffee Shop',
      description: 'Plantilla especializada en café',
      icon: 'coffee',
      version: 1,
      source_fingerprint: 'fp-cafe-test',
      is_active: true,
    });

    await dataSource.getRepository(TemplateProduct).save([
      {
        id: randomUUID(),
        template_id: template.id,
        name: 'Cappuccino Italiano',
        suggested_price: 60.0,
        uom: 'UN',
        category: 'BEBIDAS',
      },
    ]);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [
        OnboardingSessionController,
        FiscalSetupController,
        IndustryTemplateController,
        ImportStagingController,
        OnboardingCatalogController,
      ],
      providers: [
        createIdentityJwtConfigProvider(),
        createIdentityJwtTestConfigProvider(),
        JwtService,
        Reflector,
        AuthGuard,
        RolesGuard,
        PermissionsGuard,
        {
          provide: DataSource,
          useValue: dataSource,
        },
        {
          provide: EventEmitter2,
          useValue: { emit: jest.fn() },
        },
        {
          provide: 'TenantRepository',
          useValue: dataSource.getRepository(Tenant),
        },
        {
          provide: 'UserRepository',
          useValue: dataSource.getRepository(User),
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
          provide: 'TemplateApplicationRepository',
          useValue: dataSource.getRepository(TemplateApplication),
        },
        {
          provide: 'TemplateSeedLinkRepository',
          useValue: dataSource.getRepository(TemplateSeedLink),
        },
        {
          provide: 'ImportStagingRepository',
          useValue: dataSource.getRepository(ImportStaging),
        },
        {
          provide: 'ProductImportSessionRepository',
          useValue: dataSource.getRepository(ProductImportSession),
        },
        {
          provide: 'LegacyImportIntegrityReportRepository',
          useValue: dataSource.getRepository(LegacyImportIntegrityReport),
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
          useValue: {},
        },
        OnboardingSessionService,
        OnboardingReadinessEvaluator,
        OnboardingStateReconciler,
        OnboardingIdempotencyCoordinator,
        FiscalSetupService,
        IndustryTemplateService,
        TemplatePreviewService,
        LegacyTemplateRecipeScanService,
        ImportStagingService,
        CanonicalCsvParserService,
        LegacyImportIntegrityReportService,
        OnboardingCatalogService,
        {
          provide: IDENTITY_READINESS_PORT,
          useClass: IdentityReadinessAdapter,
        },
        {
          provide: FISCAL_READINESS_PORT,
          useClass: FiscalReadinessAdapter,
        },
        {
          provide: CATALOG_READINESS_PORT,
          useClass: CatalogReadinessAdapter,
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    const jwtService = moduleFixture.get<JwtService>(JwtService);
    const ownerToken = signIdentityJwtAccessToken(jwtService, {
      sub: ownerUserId,
      email: 'owner@omnifood.ni',
      role: UserRole.OWNER,
      tenant_id: tenantId,
    });
    const managerToken = signIdentityJwtAccessToken(jwtService, {
      sub: managerUserId,
      email: 'manager@omnifood.ni',
      role: UserRole.MANAGER,
      tenant_id: tenantId,
    });
    const cashierToken = signIdentityJwtAccessToken(jwtService, {
      sub: cashierUserId,
      email: 'cashier@omnifood.ni',
      role: UserRole.CASHIER,
      tenant_id: tenantId,
    });

    await assertion({
      app,
      dataSource,
      jwtService,
      tenantId,
      ownerToken,
      managerToken,
      cashierToken,
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

describe('ONB1.5 — Fiscal + Catalog Acquisition UX & SALE_READY Transition (PostgreSQL Real DB)', () => {
  it('enforces permission guards on fiscal and catalog writes: Cashier and default Manager are rejected with 403', async () => {
    await withAcquisitionIsolatedSchema('onb15_perms', async ({ app, cashierToken, managerToken }) => {
      // Cashier cannot configure fiscal (403)
      await request(app.getHttpServer())
        .post('/onboarding/fiscal-setup')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          regime: FiscalRegime.CUOTA_FIJA,
          businessName: 'Unauth Café',
          commercialFxSpread: 0.5,
          pricesIncludeTax: true,
        })
        .expect(403);

      // Manager cannot configure fiscal without explicit ONBOARDING_FISCAL_CONFIGURE permission (403)
      await request(app.getHttpServer())
        .post('/onboarding/fiscal-setup')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          regime: FiscalRegime.CUOTA_FIJA,
          businessName: 'Unauth Café',
          commercialFxSpread: 0.5,
          pricesIncludeTax: true,
        })
        .expect(403);

      // Cashier cannot create manual product (403)
      await request(app.getHttpServer())
        .post('/onboarding/catalog/manual-product')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          name: 'Unauth Prod',
          sellPrice: 50,
        })
        .expect(403);
    });
  });

  it('completes Fiscal Setup and reaches SALE_READY through Manual Minimal Product (AC-04, AC-06, AC-07, AC-08, AC-27)', async () => {
    await withAcquisitionIsolatedSchema('onb15_manual', async ({ app, ownerToken, dataSource, tenantId }) => {
      // 1. Initial State Check: Session is started/read
      const sessionRes = await request(app.getHttpServer())
        .get('/onboarding/session')
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(sessionRes.body.session.lifecycleState).toBe(OnboardingLifecycleState.SETUP_IN_PROGRESS);
      expect(sessionRes.body.readiness.saleReady).toBe(false);
      expect(sessionRes.body.readiness.blockers).toContain('FISCAL_CONFIGURATION_INCOMPLETE');
      expect(sessionRes.body.readiness.blockers).toContain('CATALOG_NO_SELLABLE_PRODUCTS');

      // 2. Configure Fiscal (AC-04): businessName, regime Cuota Fija, fx spread
      const fiscalRes = await request(app.getHttpServer())
        .post('/onboarding/fiscal-setup')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          regime: FiscalRegime.CUOTA_FIJA,
          businessName: 'Café Managua Central',
          ruc: 'J0310000012345',
          commercialFxSpread: 0.5,
          pricesIncludeTax: true,
          phone: '+505 8888-0000', // Non-persisted field (AC-05)
          address: 'Plaza Central', // Non-persisted field (AC-05)
        })
        .expect(201);

      expect(fiscalRes.body.businessName).toBe('Café Managua Central');
      expect(fiscalRes.body.regime).toBe(FiscalRegime.CUOTA_FIJA);
      expect(fiscalRes.body.phone).toBeUndefined(); // AC-05: Non-persisted field not returned

      // Check readiness after fiscal: Fiscal completed, Catalog still blocking
      const readinessAfterFiscal = await request(app.getHttpServer())
        .get('/onboarding/readiness')
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(readinessAfterFiscal.body.fiscal.minimumConfigurationValid).toBe(true);
      expect(readinessAfterFiscal.body.blockers).toEqual(['CATALOG_NO_SELLABLE_PRODUCTS']);
      expect(readinessAfterFiscal.body.saleReady).toBe(false);

      // 3. Acquire Catalog via Manual Minimal Product (AC-06, AC-07, AC-08)
      const manualProdRes = await request(app.getHttpServer())
        .post('/onboarding/catalog/manual-product')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          name: 'Café Americano 8oz',
          sellPrice: 35.0,
          uom: 'UN',
          category_code: 'BEBIDAS',
        })
        .expect(201);

      expect(manualProdRes.body.product.name).toBe('Café Americano 8oz');
      expect(manualProdRes.body.product.sellPrice).toBe(35.0);
      expect(manualProdRes.body.product.costStatus).toBe('COST_PENDING'); // AC-08: Unknown cost
      expect(manualProdRes.body.readiness.saleReady).toBe(true); // AC-27: Transition immediately to SALE_READY!
      expect(manualProdRes.body.readiness.blockers).toEqual([]);
      expect(manualProdRes.body.session.lifecycleState).toBe(OnboardingLifecycleState.SALE_READY);
      expect(manualProdRes.body.session.saleReadyFirstAt).not.toBeNull();

      // 4. Verify Catalog Summary reports the product with COST_PENDING (AC-08)
      const summaryRes = await request(app.getHttpServer())
        .get('/onboarding/catalog/summary')
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(summaryRes.body.sellableProductCount).toBe(1);
      expect(summaryRes.body.hasSellableProduct).toBe(true);
      expect(summaryRes.body.sampleProducts[0].costStatus).toBe('COST_PENDING');

      // 5. Verify in DB: Product has stock=0, averageCost=0 (no fake inventory outside Kardex)
      const dbProduct = await dataSource.getRepository(Product).findOne({
        where: { tenant_id: tenantId, name: 'Café Americano 8oz' },
      });
      expect(dbProduct).toBeDefined();
      expect(Number(dbProduct!.stock)).toBe(0);
      expect(Number(dbProduct!.averageCost)).toBe(0);
    });
  });

  it('reaches SALE_READY via Industry Template acquisition (M3 safe writer, AC-11, AC-12, AC-27)', async () => {
    await withAcquisitionIsolatedSchema('onb15_template', async ({ app, ownerToken }) => {
      // 1. Configure Fiscal first
      await request(app.getHttpServer())
        .post('/onboarding/fiscal-setup')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          regime: FiscalRegime.REGIMEN_GENERAL,
          businessName: 'Coffee Boutique',
          commercialFxSpread: 0.5,
          pricesIncludeTax: true,
        })
        .expect(201);

      // 2. Apply Industry Template CAFETERIA
      const applyRes = await request(app.getHttpServer())
        .post('/onboarding/templates/CAFETERIA/apply')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({})
        .expect(201);

      expect(applyRes.body.productsCreated).toBeGreaterThanOrEqual(1);

      // 3. Query Session: State is now SALE_READY!
      const sessionRes = await request(app.getHttpServer())
        .get('/onboarding/session')
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(sessionRes.body.session.lifecycleState).toBe(OnboardingLifecycleState.SALE_READY);
      expect(sessionRes.body.session.saleReadyFirstAt).not.toBeNull();
      expect(sessionRes.body.readiness.saleReady).toBe(true);
      expect(sessionRes.body.readiness.blockers).toEqual([]);
    });
  });

  it('reaches SALE_READY via Bulk Import CSV (M4 safe writer, AC-16, AC-27)', async () => {
    await withAcquisitionIsolatedSchema('onb15_import', async ({ app, ownerToken }) => {
      // 1. Configure Fiscal
      await request(app.getHttpServer())
        .post('/onboarding/fiscal-setup')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          regime: FiscalRegime.CUOTA_FIJA,
          businessName: 'MiniMarket Express',
          commercialFxSpread: 0.5,
          pricesIncludeTax: true,
        })
        .expect(201);

      // 2. Upload and commit CSV batch
      const uploadRes = await request(app.getHttpServer())
        .post('/onboarding/import/upload')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          rows: [
            { nombre: 'Gaseosa Cola 500ml', precioVenta: 25.0, uom: 'UN' },
            { nombre: 'Agua Purificada 1L', precioVenta: 18.0, uom: 'UN' },
          ],
        })
        .expect(201);

      const commitRes = await request(app.getHttpServer())
        .post('/onboarding/import/commit')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          sessionToken: uploadRes.body.sessionToken,
          mode: 'VALID_ONLY',
        })
        .expect(201);

      expect(commitRes.body.productsCreated).toBe(2);

      // 3. Query Session: Reconciled to SALE_READY!
      const sessionRes = await request(app.getHttpServer())
        .get('/onboarding/session')
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(sessionRes.body.session.lifecycleState).toBe(OnboardingLifecycleState.SALE_READY);
      expect(sessionRes.body.readiness.saleReady).toBe(true);
      expect(sessionRes.body.readiness.blockers).toEqual([]);
    });
  });

  it('allows combining catalog acquisition routes without resetting progress (AC-50)', async () => {
    await withAcquisitionIsolatedSchema('onb15_combinable', async ({ app, ownerToken }) => {
      // Configure fiscal
      await request(app.getHttpServer())
        .post('/onboarding/fiscal-setup')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          regime: FiscalRegime.CUOTA_FIJA,
          businessName: 'Combo Store',
          commercialFxSpread: 0.5,
          pricesIncludeTax: true,
        })
        .expect(201);

      // 1. Create manual product
      await request(app.getHttpServer())
        .post('/onboarding/catalog/manual-product')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Producto Manual 1', sellPrice: 100 })
        .expect(201);

      // 2. Apply template CAFETERIA
      await request(app.getHttpServer())
        .post('/onboarding/templates/CAFETERIA/apply')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({})
        .expect(201);

      // 3. Verify both manual product and template product are present
      const summary = await request(app.getHttpServer())
        .get('/onboarding/catalog/summary')
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(summary.body.sellableProductCount).toBeGreaterThanOrEqual(2);
      expect(summary.body.hasSellableProduct).toBe(true);
    });
  });
});
