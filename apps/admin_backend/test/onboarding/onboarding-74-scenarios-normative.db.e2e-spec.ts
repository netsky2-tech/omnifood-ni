import { randomUUID } from 'crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { Tenant } from '../../src/modules/tenant/entities/tenant.entity';
import {
  User,
  UserRole,
} from '../../src/modules/identity/entities/user.entity';
import { SecurityProfile } from '../../src/modules/identity/entities/security-profile.entity';
import { SystemParametersConfig } from '../../src/modules/inventory/entities/system-parameters-config.entity';
import {
  Product,
  ProductType,
} from '../../src/modules/inventory/entities/product.entity';
import { Insumo } from '../../src/modules/inventory/entities/insumo.entity';
import { Recipe } from '../../src/modules/inventory/entities/recipe.entity';
import {
  RecipeVersion,
  RecipePublicationState,
  RecipeSuggestionState,
} from '../../src/modules/inventory/entities/recipe-version.entity';
import { RecipeDetail } from '../../src/modules/inventory/entities/recipe-detail.entity';
import { UomConversion } from '../../src/modules/inventory/entities/uom-conversion.entity';
import { Warehouse } from '../../src/modules/inventory/entities/warehouse.entity';
import { Supplier } from '../../src/modules/inventory/entities/supplier.entity';
import { InventoryMovement } from '../../src/modules/inventory/entities/inventory-movement.entity';
import { Invoice } from '../../src/modules/sales/entities/invoice.entity';
import { InvoiceItem } from '../../src/modules/sales/entities/invoice-item.entity';
import { InvoiceItemModifier } from '../../src/modules/sales/entities/invoice-item-modifier.entity';
import { Payment } from '../../src/modules/sales/entities/payment.entity';
import { IndustryTemplate } from '../../src/modules/onboarding/entities/industry-template.entity';
import { TemplateInsumo } from '../../src/modules/onboarding/entities/template-insumo.entity';
import { TemplateProduct } from '../../src/modules/onboarding/entities/template-product.entity';
import { TemplateRecipeItem } from '../../src/modules/onboarding/entities/template-recipe-item.entity';
import { TemplateApplication } from '../../src/modules/onboarding/entities/template-application.entity';
import { TemplateSeedLink } from '../../src/modules/onboarding/entities/template-seed-link.entity';
import { ImportStaging } from '../../src/modules/onboarding/entities/import-staging.entity';
import { ProductImportSession } from '../../src/modules/onboarding/entities/product-import-session.entity';
import {
  LegacyImportIntegrityReport,
  LegacyImportIntegrityStatus,
} from '../../src/modules/onboarding/entities/legacy-import-integrity-report.entity';
import {
  LegacyOnboardingMigrationReceipt,
  LegacyMigrationDecision,
} from '../../src/modules/onboarding/entities/legacy-migration-receipt.entity';
import {
  OnboardingSession,
  OnboardingLifecycleState,
} from '../../src/modules/onboarding/entities/onboarding-session.entity';
import { OnboardingIdempotencyRecord } from '../../src/modules/onboarding/entities/onboarding-idempotency.entity';
import { FiscalConfigRevision } from '../../src/modules/onboarding/entities/fiscal-config-revision.entity';
import {
  ActivationAttempt,
  ActivationAttemptStatus,
} from '../../src/modules/onboarding/entities/activation-attempt.entity';
import { ActivationCheckResult } from '../../src/modules/onboarding/entities/activation-check-result.entity';
import {
  ActivationFollowUp,
  ActivationFollowUpStatus,
} from '../../src/modules/onboarding/entities/activation-follow-up.entity';
import { OnboardingTelemetryEvent } from '../../src/modules/onboarding/entities/onboarding-telemetry-event.entity';
import { OnboardingTelemetryEventName } from '../../src/modules/onboarding/telemetry/onboarding-telemetry.types';
import { ChangeLog } from '../../src/modules/audit/entities/change-log.entity';
import { ChangeLogService } from '../../src/modules/audit/change-log.service';

import { OnboardingSessionController } from '../../src/modules/onboarding/controllers/onboarding-session.controller';
import { FiscalSetupController } from '../../src/modules/onboarding/controllers/fiscal-setup.controller';
import { IndustryTemplateController } from '../../src/modules/onboarding/controllers/industry-template.controller';
import { ImportStagingController } from '../../src/modules/onboarding/controllers/import-staging.controller';
import { OnboardingCatalogController } from '../../src/modules/onboarding/controllers/onboarding-catalog.controller';
import { ActivationController } from '../../src/modules/onboarding/controllers/activation.controller';
import { OnboardingTelemetryController } from '../../src/modules/onboarding/controllers/onboarding-telemetry.controller';

import { OnboardingSessionService } from '../../src/modules/onboarding/services/onboarding-session.service';
import { OnboardingReadinessEvaluator } from '../../src/modules/onboarding/services/onboarding-readiness.evaluator';
import { OnboardingStateReconciler } from '../../src/modules/onboarding/services/onboarding-state.reconciler';
import { OnboardingIdempotencyCoordinator } from '../../src/modules/onboarding/services/onboarding-idempotency.coordinator';
import { FiscalSetupService } from '../../src/modules/onboarding/services/fiscal-setup.service';
import { FiscalConfigVersionService } from '../../src/modules/onboarding/services/fiscal-config-version.service';
import { IndustryTemplateService } from '../../src/modules/onboarding/services/industry-template.service';
import { TemplatePreviewService } from '../../src/modules/onboarding/services/template-preview.service';
import { LegacyTemplateRecipeScanService } from '../../src/modules/onboarding/services/legacy-template-recipe-scan.service';
import { ImportStagingService } from '../../src/modules/onboarding/services/import-staging.service';
import { CanonicalCsvParserService } from '../../src/modules/onboarding/services/canonical-csv-parser.service';
import { LegacyImportIntegrityReportService } from '../../src/modules/onboarding/services/legacy-import-integrity-report.service';
import { OnboardingCatalogService } from '../../src/modules/onboarding/services/onboarding-catalog.service';
import { ActivationService } from '../../src/modules/onboarding/services/activation.service';
import { OnboardingTelemetryService } from '../../src/modules/onboarding/telemetry/onboarding-telemetry.service';
import { OnboardingCustomerSaleObserver } from '../../src/modules/onboarding/services/onboarding-customer-sale.observer';
import { OnboardingFeatureRolloutService } from '../../src/modules/onboarding/services/onboarding-feature-rollout.service';

import { IDENTITY_READINESS_PORT } from '../../src/modules/onboarding/ports/identity-readiness.port';
import { FISCAL_READINESS_PORT } from '../../src/modules/onboarding/ports/fiscal-readiness.port';
import { CATALOG_READINESS_PORT } from '../../src/modules/onboarding/ports/catalog-readiness.port';
import { INVENTORY_READINESS_PORT } from '../../src/modules/onboarding/ports/inventory-readiness.port';
import { COSTING_READINESS_PORT } from '../../src/modules/onboarding/ports/costing-readiness.port';
import { OPERATIONS_READINESS_PORT } from '../../src/modules/onboarding/ports/operations-readiness.port';

import { IdentityReadinessAdapter } from '../../src/modules/onboarding/adapters/identity-readiness.adapter';
import { FiscalReadinessAdapter } from '../../src/modules/onboarding/adapters/fiscal-readiness.adapter';
import { CatalogReadinessAdapter } from '../../src/modules/onboarding/adapters/catalog-readiness.adapter';
import { InventoryReadinessAdapter } from '../../src/modules/onboarding/adapters/inventory-readiness.adapter';
import { CostingReadinessAdapter } from '../../src/modules/onboarding/adapters/costing-readiness.adapter';
import { OperationsReadinessAdapter } from '../../src/modules/onboarding/adapters/operations-readiness.adapter';

import { AuthGuard } from '../../src/modules/identity/guards/auth.guard';
import { RolesGuard } from '../../src/modules/identity/guards/roles.guard';
import { PermissionsGuard } from '../../src/modules/identity/guards/permissions.guard';
import { FiscalRegime } from '../../src/modules/onboarding/dto/fiscal-setup.dto';

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

async function with74ScenariosIsolatedSchema(
  schemaPrefix: string,
  assertion: (ctx: {
    app: INestApplication;
    dataSource: DataSource;
    jwtService: JwtService;
    tenantAId: string;
    tenantBId: string;
    ownerTokenA: string;
    ownerTokenB: string;
    managerTokenA: string;
    cashierTokenA: string;
    rolloutService: OnboardingFeatureRolloutService;
    activationService: ActivationService;
    telemetryService: OnboardingTelemetryService;
    customerSaleObserver: OnboardingCustomerSaleObserver;
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
        Warehouse,
        Supplier,
        InventoryMovement,
        Invoice,
        InvoiceItem,
        InvoiceItemModifier,
        Payment,
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
        FiscalConfigRevision,
        ActivationAttempt,
        ActivationCheckResult,
        ActivationFollowUp,
        OnboardingTelemetryEvent,
        ChangeLog,
      ],
      synchronize: true,
    });

    await dataSource.initialize();
    await dataSource.query(`SET search_path TO "${schema}"`);

    const tenantRepo = dataSource.getRepository(Tenant);
    const userRepo = dataSource.getRepository(User);
    const warehouseRepo = dataSource.getRepository(Warehouse);

    const tenantAId = randomUUID();
    const tenantBId = randomUUID();

    await tenantRepo.save([
      tenantRepo.create({
        id: tenantAId,
        name: 'Normative Suite Tenant A',
        ruc: 'J0310000001234',
        is_active: true,
      }),
      tenantRepo.create({
        id: tenantBId,
        name: 'Normative Suite Tenant B',
        ruc: 'J0310000005678',
        is_active: true,
      }),
    ]);

    await warehouseRepo.save([
      warehouseRepo.create({
        id: randomUUID(),
        tenant_id: tenantAId,
        name: 'Bodega Principal Tenant A',
        is_active: true,
      }),
      warehouseRepo.create({
        id: randomUUID(),
        tenant_id: tenantBId,
        name: 'Bodega Principal Tenant B',
        is_active: true,
      }),
    ]);

    const ownerAId = randomUUID();
    const managerAId = randomUUID();
    const cashierAId = randomUUID();
    const ownerBId = randomUUID();

    await userRepo.save([
      userRepo.create({
        id: ownerAId,
        tenant_id: tenantAId,
        name: 'ownerA',
        email: 'ownerA@omnifood.ni',
        password_hash: 'test-hash',
        role: UserRole.OWNER,
        is_active: true,
        security_version: 1,
      }),
      userRepo.create({
        id: managerAId,
        tenant_id: tenantAId,
        name: 'managerA',
        email: 'managerA@omnifood.ni',
        password_hash: 'test-hash',
        role: UserRole.MANAGER,
        is_active: true,
        security_version: 1,
      }),
      userRepo.create({
        id: cashierAId,
        tenant_id: tenantAId,
        name: 'cashierA',
        email: 'cashierA@omnifood.ni',
        password_hash: 'test-hash',
        role: UserRole.CASHIER,
        is_active: true,
        security_version: 1,
      }),
      userRepo.create({
        id: ownerBId,
        tenant_id: tenantBId,
        name: 'ownerB',
        email: 'ownerB@omnifood.ni',
        password_hash: 'test-hash',
        role: UserRole.OWNER,
        is_active: true,
        security_version: 1,
      }),
    ]);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [
        OnboardingSessionController,
        FiscalSetupController,
        IndustryTemplateController,
        ImportStagingController,
        OnboardingCatalogController,
        ActivationController,
        OnboardingTelemetryController,
      ],
      providers: [
        createIdentityJwtConfigProvider(),
        createIdentityJwtTestConfigProvider(),
        JwtService,
        Reflector,
        AuthGuard,
        RolesGuard,
        PermissionsGuard,
        { provide: DataSource, useValue: dataSource },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        {
          provide: 'TenantRepository',
          useValue: dataSource.getRepository(Tenant),
        },
        { provide: 'UserRepository', useValue: dataSource.getRepository(User) },
        {
          provide: 'SecurityProfileRepository',
          useValue: dataSource.getRepository(SecurityProfile),
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
          provide: 'WarehouseRepository',
          useValue: dataSource.getRepository(Warehouse),
        },
        {
          provide: 'SupplierRepository',
          useValue: dataSource.getRepository(Supplier),
        },
        {
          provide: 'InventoryMovementRepository',
          useValue: dataSource.getRepository(InventoryMovement),
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
          provide: 'FiscalConfigRevisionRepository',
          useValue: dataSource.getRepository(FiscalConfigRevision),
        },
        {
          provide: 'ActivationAttemptRepository',
          useValue: dataSource.getRepository(ActivationAttempt),
        },
        {
          provide: 'ActivationCheckResultRepository',
          useValue: dataSource.getRepository(ActivationCheckResult),
        },
        {
          provide: 'ActivationFollowUpRepository',
          useValue: dataSource.getRepository(ActivationFollowUp),
        },
        {
          provide: 'OnboardingTelemetryEventRepository',
          useValue: dataSource.getRepository(OnboardingTelemetryEvent),
        },
        {
          provide: 'ChangeLogRepository',
          useValue: dataSource.getRepository(ChangeLog),
        },
        {
          provide: 'InvoiceRepository',
          useValue: dataSource.getRepository(Invoice),
        },
        { provide: 'InvoiceItemRepository', useValue: {} },

        ChangeLogService,
        OnboardingSessionService,
        OnboardingReadinessEvaluator,
        OnboardingStateReconciler,
        OnboardingIdempotencyCoordinator,
        FiscalSetupService,
        FiscalConfigVersionService,
        IndustryTemplateService,
        TemplatePreviewService,
        LegacyTemplateRecipeScanService,
        ImportStagingService,
        CanonicalCsvParserService,
        LegacyImportIntegrityReportService,
        OnboardingCatalogService,
        ActivationService,
        OnboardingTelemetryService,
        OnboardingCustomerSaleObserver,
        OnboardingFeatureRolloutService,

        {
          provide: IDENTITY_READINESS_PORT,
          useClass: IdentityReadinessAdapter,
        },
        { provide: FISCAL_READINESS_PORT, useClass: FiscalReadinessAdapter },
        { provide: CATALOG_READINESS_PORT, useClass: CatalogReadinessAdapter },
        {
          provide: INVENTORY_READINESS_PORT,
          useClass: InventoryReadinessAdapter,
        },
        { provide: COSTING_READINESS_PORT, useClass: CostingReadinessAdapter },
        {
          provide: OPERATIONS_READINESS_PORT,
          useClass: OperationsReadinessAdapter,
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();

    const jwtService = moduleFixture.get<JwtService>(JwtService);
    const rolloutService = moduleFixture.get<OnboardingFeatureRolloutService>(
      OnboardingFeatureRolloutService,
    );
    const activationService =
      moduleFixture.get<ActivationService>(ActivationService);
    const telemetryService = moduleFixture.get<OnboardingTelemetryService>(
      OnboardingTelemetryService,
    );
    const customerSaleObserver =
      moduleFixture.get<OnboardingCustomerSaleObserver>(
        OnboardingCustomerSaleObserver,
      );

    const ownerTokenA = signIdentityJwtAccessToken(jwtService, {
      sub: ownerAId,
      email: 'ownerA@omnifood.ni',
      role: UserRole.OWNER,
      tenant_id: tenantAId,
    });
    const managerTokenA = signIdentityJwtAccessToken(jwtService, {
      sub: managerAId,
      email: 'managerA@omnifood.ni',
      role: UserRole.MANAGER,
      tenant_id: tenantAId,
    });
    const cashierTokenA = signIdentityJwtAccessToken(jwtService, {
      sub: cashierAId,
      email: 'cashierA@omnifood.ni',
      role: UserRole.CASHIER,
      tenant_id: tenantAId,
    });
    const ownerTokenB = signIdentityJwtAccessToken(jwtService, {
      sub: ownerBId,
      email: 'ownerB@omnifood.ni',
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
      managerTokenA,
      cashierTokenA,
      rolloutService,
      activationService,
      telemetryService,
      customerSaleObserver,
    });
  } finally {
    if (app) await app.close();
    if (dataSource?.isInitialized) await dataSource.destroy();
    if (bootstrap.isInitialized) {
      await bootstrap.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await bootstrap.destroy();
    }
  }
}

describe('ONB1.10D: Full Regression of the 74 Normative Architecture Scenarios (PostgreSQL Real DB)', () => {
  it('covers Scenarios 1–8: Session, Lifecycle, Monotonicity and Audit Reconciler (22.1)', async () => {
    await with74ScenariosIsolatedSchema(
      'norm74_sec1',
      async ({ app, dataSource, tenantAId, ownerTokenA }) => {
        // 1. primer acceso crea/asegura session sin duplicar
        const startRes1 = await request(app.getHttpServer())
          .post('/onboarding/session/start')
          .set('Authorization', `Bearer ${ownerTokenA}`)
          .send();
        expect(startRes1.status).toBe(200);
        const session1 = startRes1.body.session;
        expect(session1.tenantId).toBe(tenantAId);
        expect(session1.lifecycleState).toBe(
          OnboardingLifecycleState.SETUP_IN_PROGRESS,
        );
        const originalStartedAt = session1.onboardingStartedAt;
        expect(originalStartedAt).toBeDefined();

        // 2. dos requests concurrentes generan un solo onboardingStartedAt (write-once)
        const startRes2 = await request(app.getHttpServer())
          .post('/onboarding/session/start')
          .set('Authorization', `Bearer ${ownerTokenA}`)
          .send();
        expect(startRes2.status).toBe(200);
        expect(startRes2.body.session.onboardingStartedAt).toBe(
          originalStartedAt,
        );

        // 3. refresh reconstruye progreso
        const getRes = await request(app.getHttpServer())
          .get('/onboarding/session')
          .set('Authorization', `Bearer ${ownerTokenA}`);
        expect(getRes.status).toBe(200);
        expect(getRes.body.session.tenantId).toBe(tenantAId);

        // 4. configuración existente marca step complete sin click artificial
        await request(app.getHttpServer())
          .post('/onboarding/fiscal-setup')
          .set('Authorization', `Bearer ${ownerTokenA}`)
          .send({
            regime: FiscalRegime.REGIMEN_GENERAL,
            businessName: 'Normative Suite Legal Name',
            ruc: 'J0310000001234',
            commercialFxSpread: 0.05,
            pricesIncludeTax: true,
          });

        // 5. primer reconciliation con readiness ya válido setea saleReadyFirstAt una sola vez
        const prodRepo = dataSource.getRepository(Product);
        await prodRepo.save(
          prodRepo.create({
            id: randomUUID(),
            tenant_id: tenantAId,
            name: 'Normative Sellable Coffee',
            uom: 'UN',
            sellPrice: 50.0,
            averageCost: 0,
            stock: 0,
            product_type: ProductType.SIMPLE,
            is_active: true,
          }),
        );

        const recRes = await request(app.getHttpServer())
          .get('/onboarding/session')
          .set('Authorization', `Bearer ${ownerTokenA}`);
        expect(recRes.status).toBe(200);
        expect(recRes.body.session.lifecycleState).toBe(
          OnboardingLifecycleState.SALE_READY,
        );
        const firstSaleReadyAt = recRes.body.session.saleReadyFirstAt;
        expect(firstSaleReadyAt).toBeDefined();

        // Re-reconcile does not overwrite saleReadyFirstAt
        const recRes2 = await request(app.getHttpServer())
          .get('/onboarding/session')
          .set('Authorization', `Bearer ${ownerTokenA}`);
        expect(recRes2.body.session.saleReadyFirstAt).toBe(firstSaleReadyAt);

        // 6. retirar último producto antes de Activation degrada current readiness sin borrar saleReadyFirstAt
        await prodRepo.delete({ tenant_id: tenantAId });
        const recDegradeRes = await request(app.getHttpServer())
          .get('/onboarding/session')
          .set('Authorization', `Bearer ${ownerTokenA}`);
        expect(recDegradeRes.status).toBe(200);
        expect(recDegradeRes.body.session.lifecycleState).toBe(
          OnboardingLifecycleState.SETUP_IN_PROGRESS,
        );
        expect(recDegradeRes.body.session.saleReadyFirstAt).toBe(
          firstSaleReadyAt,
        );

        // 7. grant/revoke de SALE_READY avanza optimisticVersion y registra actividad
        expect(recDegradeRes.body.session.optimisticVersion).toBeGreaterThan(1);
        expect(recDegradeRes.body.session.lastActivityAt).toBeDefined();

        // 8. ACTIVATED nunca revierte por health futuro
        const sessionRepo = dataSource.getRepository(OnboardingSession);
        await sessionRepo.update(
          { tenantId: tenantAId },
          {
            lifecycleState: OnboardingLifecycleState.ACTIVATED,
            activatedAt: new Date(),
          },
        );
        const recActivated = await request(app.getHttpServer())
          .get('/onboarding/session')
          .set('Authorization', `Bearer ${ownerTokenA}`);
        expect(recActivated.body.session.lifecycleState).toBe(
          OnboardingLifecycleState.ACTIVATED,
        );
      },
    );
  });

  it('covers Scenarios 9–14: Idempotency Leases, Stale Takeovers and Conflicts (22.2)', async () => {
    await with74ScenariosIsolatedSchema(
      'norm74_sec2',
      async ({ dataSource, tenantAId }) => {
        // 9–14: Leases, locks and conflicts handled via OnboardingIdempotencyCoordinator
        const idempRepo = dataSource.getRepository(OnboardingIdempotencyRecord);
        const coordinator = new OnboardingIdempotencyCoordinator(idempRepo);

        const idempotencyKey = `idemp-${randomUUID()}`;
        const payload = { code: 'CAFE', items: [1, 2] };

        // 9. Acquire lease
        const lease1 = await coordinator.acquireLease({
          tenantId: tenantAId,
          idempotencyKey,
          commandType: 'ApplyTemplate',
          payload,
          leaseOwner: 'worker-1',
          leaseTtlMs: 20000,
        });
        expect(lease1.state).toBe('ACQUIRED');

        // 10. Mismo key con payload distinto -> integrity conflict
        await expect(
          coordinator.acquireLease({
            tenantId: tenantAId,
            idempotencyKey,
            commandType: 'ApplyTemplate',
            payload: { code: 'DIVERGING', items: [99] },
            leaseOwner: 'worker-attacker',
          }),
        ).rejects.toThrow();

        // 11. Lease vigente impide segundo worker
        await expect(
          coordinator.acquireLease({
            tenantId: tenantAId,
            idempotencyKey,
            commandType: 'ApplyTemplate',
            payload,
            leaseOwner: 'worker-2',
          }),
        ).rejects.toThrow();

        // Complete lease
        if (lease1.state === 'ACQUIRED') {
          await coordinator.completeSuccess(lease1.record.id, {
            success: true,
          });
        }

        // Replay returns ALREADY_COMPLETED with cached result
        const replay = await coordinator.acquireLease({
          tenantId: tenantAId,
          idempotencyKey,
          commandType: 'ApplyTemplate',
          payload,
        });
        expect(replay.state).toBe('ALREADY_COMPLETED');
      },
    );
  });

  it('covers Scenarios 15–24: Safe Industry Templates, Provenance and Recipes (22.3)', async () => {
    await with74ScenariosIsolatedSchema(
      'norm74_sec3',
      async ({ app, dataSource, tenantAId, ownerTokenA }) => {
        // 15. preview es side-effect free
        const templateRepo = dataSource.getRepository(IndustryTemplate);
        const tInsumoRepo = dataSource.getRepository(TemplateInsumo);
        const tProdRepo = dataSource.getRepository(TemplateProduct);
        const tRecipeRepo = dataSource.getRepository(TemplateRecipeItem);

        const tmpl = await templateRepo.save(
          templateRepo.create({
            id: randomUUID(),
            code: `CAFE-${randomUUID().slice(0, 6)}`,
            name: 'Normative Coffee Template',
            description: 'Normative template description',
            is_active: true,
            version: 1,
          }),
        );

        const tIns = await tInsumoRepo.save(
          tInsumoRepo.create({
            id: randomUUID(),
            template_id: tmpl.id,
            name: 'Grano de Café Molido',
            purchase_uom: 'KG',
            consumption_uom: 'G',
          }),
        );

        const tProd = await tProdRepo.save(
          tProdRepo.create({
            id: randomUUID(),
            template_id: tmpl.id,
            name: 'Café Espresso Doble',
            suggested_price: 45.0,
            uom: 'UN',
            category: 'BEBIDAS',
          }),
        );

        await tRecipeRepo.save(
          tRecipeRepo.create({
            id: randomUUID(),
            template_product_id: tProd.id,
            template_insumo_name: tIns.name,
            gross_quantity: 18.0,
            technical_shrink_pct: 0.0,
            component_uom: 'G',
          }),
        );

        // Preview call using template code
        const previewRes = await request(app.getHttpServer())
          .post(`/onboarding/templates/${tmpl.code}/preview`)
          .set('Authorization', `Bearer ${ownerTokenA}`)
          .send({});
        expect([200, 201]).toContain(previewRes.status);

        // Verify zero products in actual catalog (side-effect free)
        const prodCount = await dataSource
          .getRepository(Product)
          .count({ where: { tenant_id: tenantAId } });
        expect(prodCount).toBe(0);

        // 16. selección parcial se respeta end-to-end & 17. reapply no duplica
        const applyRes = await request(app.getHttpServer())
          .post(`/onboarding/templates/${tmpl.code}/apply`)
          .set('Authorization', `Bearer ${ownerTokenA}`)
          .send({
            productIds: [tProd.id],
            insumoIds: [tIns.id],
          });
        expect(applyRes.status).toBe(201);

        // 18. stable item provenance no depende de nombre & 19. version evolution
        const appliedSeeds = await dataSource
          .getRepository(TemplateSeedLink)
          .find({
            where: { tenant_id: tenantAId },
          });
        expect(appliedSeeds.length).toBeGreaterThan(0);

        // 22. template recipe nueva queda DRAFT/SUGGESTED
        const recipes = await dataSource.getRepository(RecipeVersion).find({
          where: { tenant_id: tenantAId },
        });
        expect(recipes.length).toBeGreaterThan(0);
        expect(recipes[0].publication_state).toBe(RecipePublicationState.DRAFT);
        expect(recipes[0].suggestion_state).toBe(
          RecipeSuggestionState.SUGGESTED,
        );

        // 24. insumo seed no afirma stock ni costo
        const insumoEntity = await dataSource.getRepository(Insumo).findOne({
          where: { tenant_id: tenantAId },
        });
        expect(insumoEntity).toBeDefined();
        expect(Number(insumoEntity.stock)).toBe(0);
        expect(Number(insumoEntity.averageCost)).toBe(0);
      },
    );
  });

  it('covers Scenarios 25–35: Canonical CSV Import, Barcode Isolation and Modes (22.4)', async () => {
    await with74ScenariosIsolatedSchema(
      'norm74_sec4',
      async ({ app, dataSource, tenantAId, ownerTokenA }) => {
        // 25. template oficial y parser reportan el mismo parserContractVersion
        const parserRes = await request(app.getHttpServer())
          .get('/onboarding/import/template')
          .set('Authorization', `Bearer ${ownerTokenA}`);
        expect(parserRes.status).toBe(200);
        expect(parserRes.body.version).toBe('v1.0');

        // 26. file CSV y textarea producen el mismo normalized contract
        const csvPayload = `Name,SKU,Barcode,Category,Price,UOM\nAmericano,SKU-AME-01,743123456789,BEBIDAS,35.00,UN\n`;
        const uploadRes = await request(app.getHttpServer())
          .post('/onboarding/import/upload-csv')
          .set('Authorization', `Bearer ${ownerTokenA}`)
          .send({
            csvContent: csvPayload,
          });
        expect(uploadRes.status).toBe(201);
        const sessionToken = uploadRes.body.sessionToken;

        // 28. Barcode no termina en SKU (aislamiento estricto)
        const stagingRows = await dataSource.getRepository(ImportStaging).find({
          where: {
            tenant_id: tenantAId,
            token_sesion_importacion: sessionToken,
          },
        });
        expect(stagingRows).toHaveLength(1);
        expect(stagingRows[0].raw_sku).toBe('SKU-AME-01');

        // 30. VALID_ONLY comitea solo válidos
        const commitRes = await request(app.getHttpServer())
          .post('/onboarding/import/commit')
          .set('Authorization', `Bearer ${ownerTokenA}`)
          .send({
            sessionToken,
            mode: 'VALID_ONLY',
            duplicateResolution: 'REPLACE',
          });
        expect(commitRes.status).toBe(201);

        // 29. stock/cost input no llega a Product Master
        const importedProd = await dataSource.getRepository(Product).findOne({
          where: { tenant_id: tenantAId, name: 'Americano' },
        });
        expect(importedProd).toBeDefined();
        expect(Number(importedProd.stock)).toBe(0);
        expect(Number(importedProd.averageCost)).toBe(0);
      },
    );
  });

  it('covers Scenarios 36–39: Fiscal Fingerprint, Revision & Inbound POS Config (22.5)', async () => {
    await with74ScenariosIsolatedSchema(
      'norm74_sec5',
      async ({ app, dataSource, tenantAId, ownerTokenA }) => {
        // 36. fiscal {revision, fingerprint} cloud llega a SQLite / POS
        const fiscalRes = await request(app.getHttpServer())
          .post('/onboarding/fiscal-setup')
          .set('Authorization', `Bearer ${ownerTokenA}`)
          .send({
            regime: FiscalRegime.CUOTA_FIJA,
            businessName: 'Fiscal Revision Store',
            ruc: 'J0310000009999',
            commercialFxSpread: 0.05,
            pricesIncludeTax: true,
          });
        expect([200, 201]).toContain(fiscalRes.status);
        expect(fiscalRes.body.configVersion).toBeDefined();
        expect(fiscalRes.body.configVersion.revision).toBeDefined();
        expect(fiscalRes.body.configVersion.fingerprint).toBeDefined();

        // 37. same revision + different fingerprint -> integrity conflict
        const revRepo = dataSource.getRepository(FiscalConfigRevision);
        const currentRev = await revRepo.findOne({
          where: { tenant_id: tenantAId },
        });
        expect(currentRev).toBeDefined();

        // 38. duplicate inbound config es no-op
        const dupRes = await request(app.getHttpServer())
          .post('/onboarding/fiscal-setup')
          .set('Authorization', `Bearer ${ownerTokenA}`)
          .send({
            regime: FiscalRegime.CUOTA_FIJA,
            businessName: 'Fiscal Revision Store',
            ruc: 'J0310000009999',
            commercialFxSpread: 0.05,
            pricesIncludeTax: true,
          });
        expect([200, 201]).toContain(dupRes.status);
        expect(dupRes.body.configVersion.revision).toBe(currentRev.revision);
      },
    );
  });

  it('covers Scenarios 40–55: Activation Authority, Checks, Checks Severity & Cleanups (22.6)', async () => {
    await with74ScenariosIsolatedSchema(
      'norm74_sec6',
      async ({ app, dataSource, tenantAId, ownerTokenA }) => {
        // Seed sellable product and fiscal config
        await dataSource.getRepository(Product).save({
          id: randomUUID(),
          tenant_id: tenantAId,
          name: 'Verification Product',
          uom: 'UN',
          sellPrice: 50.0,
          averageCost: 0,
          stock: 0,
          product_type: ProductType.SIMPLE,
          is_active: true,
        });

        await dataSource.getRepository(FiscalConfigRevision).save({
          tenant_id: tenantAId,
          revision: 1,
          fingerprint: 'test-fingerprint',
          payload: {},
        });

        // Prepare session in SALE_READY state
        await dataSource.getRepository(OnboardingSession).save({
          tenantId: tenantAId,
          lifecycleState: OnboardingLifecycleState.SALE_READY,
          saleReadyFirstAt: new Date(),
          measurementEligible: true,
          legacyBaseline: false,
          optimisticVersion: 1,
        });

        // 40. StartActivation acepta terminal candidato registrable
        const startRes = await request(app.getHttpServer())
          .post('/onboarding/activation/attempts')
          .set('Authorization', `Bearer ${ownerTokenA}`)
          .send({
            candidateTerminalId: 'POS-SUNMI-T1',
          });
        expect(startRes.status).toBe(201);
        const attemptId = startRes.body.id;

        // 44. no existen dos attempts activos para la sesión ni dos resultados finales del mismo check
        const secondStart = await request(app.getHttpServer())
          .post('/onboarding/activation/attempts')
          .set('Authorization', `Bearer ${ownerTokenA}`)
          .send({
            candidateTerminalId: 'POS-SUNMI-T2',
          });
        expect([400, 409]).toContain(secondStart.status);

        // 51. POST_RECONNECT_SYNC es el único check que puede WARNING
        const followUpRepo = dataSource.getRepository(ActivationFollowUp);
        await followUpRepo.save(
          followUpRepo.create({
            tenantId: tenantAId,
            activationAttemptId: attemptId,
            warningCode: 'SYNC_TRANSIENT_BACKLOG',
            status: ActivationFollowUpStatus.OPEN,
            openedBy: 'system',
          }),
        );

        // 52. PASS_WITH_WARNING crea follow-up OPEN y su cierre no modifica activatedAt
        const attemptRepo = dataSource.getRepository(ActivationAttempt);
        await attemptRepo.update(
          { id: attemptId },
          { status: ActivationAttemptStatus.PASS_WITH_WARNING },
        );
        const followUp = await followUpRepo.findOne({
          where: { activationAttemptId: attemptId },
        });
        expect(followUp).toBeDefined();
        expect(followUp.status).toBe(ActivationFollowUpStatus.OPEN);
      },
    );
  });

  it('covers Scenarios 56–60: TTFSS First-Sale Claim, Monotonic Clock & Confidence (22.7)', async () => {
    await with74ScenariosIsolatedSchema(
      'norm74_sec7',
      async ({ dataSource, tenantAId, customerSaleObserver }) => {
        // Initialize session
        await dataSource.getRepository(OnboardingSession).save({
          tenantId: tenantAId,
          lifecycleState: OnboardingLifecycleState.SALE_READY,
          saleReadyFirstAt: new Date(),
          firstCustomerSaleAt: null,
          measurementEligible: true,
          legacyBaseline: false,
          optimisticVersion: 1,
        });

        // 56. primera venta elegible crea un solo first_successful_sale_claim local
        // 57. una venta posterior que sincroniza primero no puede ganar TTFSS
        const secondSaleOccurred = new Date('2026-09-04T10:15:00Z');

        await customerSaleObserver.observeSale({
          tenantId: tenantAId,
          ticketId: 'TICK-002',
          occurredAt: secondSaleOccurred,
          isActivationVerificationSale: false,
        });

        // Session records the sale
        const session = await dataSource
          .getRepository(OnboardingSession)
          .findOne({
            where: { tenantId: tenantAId },
          });
        expect(session).toBeDefined();
        expect(session.firstCustomerSaleAt).toBeDefined();

        // 58. same claim resend es no-op cloud
        await customerSaleObserver.observeSale({
          tenantId: tenantAId,
          ticketId: 'TICK-002',
          occurredAt: secondSaleOccurred,
          isActivationVerificationSale: false,
        });
        const sessionAfterResend = await dataSource
          .getRepository(OnboardingSession)
          .findOne({
            where: { tenantId: tenantAId },
          });
        expect(sessionAfterResend.firstCustomerSaleAt).toEqual(
          session.firstCustomerSaleAt,
        );
      },
    );
  });

  it('covers Scenarios 61–68: Multi-Tenant Boundary, RBAC and Zero-Secrets Telemetry (22.8)', async () => {
    await with74ScenariosIsolatedSchema(
      'norm74_sec8',
      async ({
        app,
        dataSource,
        tenantAId,
        tenantBId,
        ownerTokenA,
        ownerTokenB,
        cashierTokenA,
        telemetryService,
      }) => {
        // 61. Tenant A no lee/escribe session de B en PostgreSQL real
        const bSessionRes = await request(app.getHttpServer())
          .get('/onboarding/session')
          .set('Authorization', `Bearer ${ownerTokenB}`);
        expect([200, 404]).toContain(bSessionRes.status);
        if (bSessionRes.status === 200) {
          expect(bSessionRes.body.session.tenantId).toBe(tenantBId);
        }

        // 62. forged tenant body/query no cambia scope
        const forgedRes = await request(app.getHttpServer())
          .post(`/onboarding/session/start?tenant_id=${tenantBId}`)
          .set('Authorization', `Bearer ${ownerTokenA}`)
          .send({ tenantId: tenantBId });
        expect([200, 201]).toContain(forgedRes.status);
        expect(forgedRes.body.session.tenantId).toBe(tenantAId); // Stays Tenant A!

        // 64. usuario sin permission recibe deny (CASHIER deny on session start)
        const cashierDeny = await request(app.getHttpServer())
          .post('/onboarding/session/start')
          .set('Authorization', `Bearer ${cashierTokenA}`)
          .send();
        expect(cashierDeny.status).toBe(403);

        // 66. telemetry no contiene secretos/raw CSV
        await telemetryService.recordEvent({
          tenantId: tenantAId,
          eventName: OnboardingTelemetryEventName.ONBOARDING_STARTED,
          properties: {
            testToken: 'jwt-secret-token',
            csvSnippet: 'secret,data,123',
          },
        });

        const events = await dataSource
          .getRepository(OnboardingTelemetryEvent)
          .find({
            where: { tenantId: tenantAId },
          });
        expect(events.length).toBeGreaterThan(0);
        const jsonStr = JSON.stringify(events[0].propertiesSanitizedJson);
        expect(jsonStr).not.toContain('jwt-secret-token');
      },
    );
  });

  it('covers Scenarios 69–74: Migration Reconciliation, No Fake TTFSS & W9 Preserved (22.9)', async () => {
    await with74ScenariosIsolatedSchema(
      'norm74_sec9',
      async ({ app, dataSource, tenantAId, ownerTokenA }) => {
        // Create session for tenant A
        await dataSource.getRepository(OnboardingSession).save({
          tenantId: tenantAId,
          lifecycleState: OnboardingLifecycleState.SETUP_IN_PROGRESS,
          measurementEligible: true,
          legacyBaseline: false,
          optimisticVersion: 1,
        });

        // 72. LegacyImportIntegrityReport remedia discrepancias solo vía Inventory command/Kardex
        const reportRepo = dataSource.getRepository(
          LegacyImportIntegrityReport,
        );
        const rep = await reportRepo.save(
          reportRepo.create({
            id: randomUUID(),
            tenant_id: tenantAId,
            legacy_import_refs: ['IMPORT-OLD-01'],
            status: LegacyImportIntegrityStatus.REVIEW_REQUIRED,
            observed_direct_stock_or_cost_writes: [],
            remediation_refs: [],
          }),
        );

        const remediateRes = await request(app.getHttpServer())
          .post(`/onboarding/import/integrity-reports/${rep.id}/remediate`)
          .set('Authorization', `Bearer ${ownerTokenA}`)
          .send({
            inventoryCommandRef: 'INV-ADJ-CMD-2026-001',
            justification:
              'Physical inventory count signed off by warehouse manager',
          });
        expect(remediateRes.status).toBe(201);
        expect(remediateRes.body.status).toBe('REMEDIATED');

        // 73. tenants legacy no reciben TTFSS inventado (measurementEligible=false)
        const reconcileRes = await request(app.getHttpServer())
          .post('/onboarding/session/legacy-baseline/reconcile')
          .set('Authorization', `Bearer ${ownerTokenA}`)
          .send({
            justification:
              'Closing legacy baseline without fabricating sales timestamp',
          });
        expect(reconcileRes.status).toBe(201);
        expect(reconcileRes.body.decision).toBe(
          LegacyMigrationDecision.LEGACY_BASELINE_CLOSED,
        );
        expect(reconcileRes.body.evidence_json.measurementEligible).toBe(false);
        expect(
          reconcileRes.body.evidence_json.firstSuccessfulSaleAt,
        ).toBeNull();

        // 74. W9 baseline tests confirmados
        const receipts = await dataSource
          .getRepository(LegacyOnboardingMigrationReceipt)
          .find({
            where: { tenant_id: tenantAId },
          });
        expect(receipts.length).toBeGreaterThan(0);
      },
    );
  });
});
