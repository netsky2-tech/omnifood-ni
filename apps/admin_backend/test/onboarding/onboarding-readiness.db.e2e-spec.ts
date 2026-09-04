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
import { RecipeVersion } from '../../src/modules/inventory/entities/recipe-version.entity';
import { RecipeDetail } from '../../src/modules/inventory/entities/recipe-detail.entity';
import { UomConversion } from '../../src/modules/inventory/entities/uom-conversion.entity';
import { Warehouse } from '../../src/modules/inventory/entities/warehouse.entity';
import { Supplier } from '../../src/modules/inventory/entities/supplier.entity';
import { InventoryMovement } from '../../src/modules/inventory/entities/inventory-movement.entity';
import { IndustryTemplate } from '../../src/modules/onboarding/entities/industry-template.entity';
import { TemplateInsumo } from '../../src/modules/onboarding/entities/template-insumo.entity';
import { TemplateProduct } from '../../src/modules/onboarding/entities/template-product.entity';
import { TemplateRecipeItem } from '../../src/modules/onboarding/entities/template-recipe-item.entity';
import { ImportStaging } from '../../src/modules/onboarding/entities/import-staging.entity';
import {
  OnboardingSession,
  OnboardingLifecycleState,
} from '../../src/modules/onboarding/entities/onboarding-session.entity';
import { OnboardingIdempotencyRecord } from '../../src/modules/onboarding/entities/onboarding-idempotency.entity';
import { OnboardingSessionController } from '../../src/modules/onboarding/controllers/onboarding-session.controller';
import { OnboardingSessionService } from '../../src/modules/onboarding/services/onboarding-session.service';
import { OnboardingReadinessEvaluator } from '../../src/modules/onboarding/services/onboarding-readiness.evaluator';
import { OnboardingStateReconciler } from '../../src/modules/onboarding/services/onboarding-state.reconciler';
import { FiscalSetupService } from '../../src/modules/onboarding/services/fiscal-setup.service';
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
import { OnboardingTelemetryEvent } from '../../src/modules/onboarding/entities/onboarding-telemetry-event.entity';
import { OnboardingTelemetryController } from '../../src/modules/onboarding/controllers/onboarding-telemetry.controller';
import { OnboardingTelemetryService } from '../../src/modules/onboarding/telemetry/onboarding-telemetry.service';
import { OnboardingCustomerSaleObserver } from '../../src/modules/onboarding/services/onboarding-customer-sale.observer';
import { ChangeLog } from '../../src/modules/audit/entities/change-log.entity';
import { ChangeLogService } from '../../src/modules/audit/change-log.service';
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

async function withReadinessIsolatedSchema(
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
    customerSaleObserver: OnboardingCustomerSaleObserver;
    telemetryService: OnboardingTelemetryService;
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
        ImportStaging,
        OnboardingSession,
        OnboardingIdempotencyRecord,
        Warehouse,
        Supplier,
        InventoryMovement,
        OnboardingTelemetryEvent,
        ChangeLog,
      ],
      synchronize: true,
    });
    await dataSource.initialize();
    await dataSource.query(`SET search_path TO "${schema}"`);

    const tenantRepo = dataSource.getRepository(Tenant);
    const userRepo = dataSource.getRepository(User);

    const tenantAId = randomUUID();
    const tenantBId = randomUUID();

    await tenantRepo.save([
      tenantRepo.create({
        id: tenantAId,
        name: 'Café El Buen Sabor',
        ruc: 'J0310000001234',
        is_active: true,
      }),
      tenantRepo.create({
        id: tenantBId,
        name: 'Pupusería Doña María',
        ruc: 'J0310000009999',
        is_active: true,
      }),
    ]);

    const ownerAId = randomUUID();
    const ownerBId = randomUUID();

    await userRepo.save([
      userRepo.create({
        id: ownerAId,
        tenant_id: tenantAId,
        name: 'Propietario A',
        email: 'owner.a@example.com',
        password_hash: 'hashed-pass',
        role: UserRole.OWNER,
        is_active: true,
      }),
      userRepo.create({
        id: ownerBId,
        tenant_id: tenantBId,
        name: 'Propietario B',
        email: 'owner.b@example.com',
        password_hash: 'hashed-pass',
        role: UserRole.OWNER,
        is_active: true,
      }),
    ]);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [
        OnboardingSessionController,
        OnboardingTelemetryController,
      ],
      providers: [
        Reflector,
        AuthGuard,
        RolesGuard,
        PermissionsGuard,
        JwtService,
        createIdentityJwtTestConfigProvider(),
        createIdentityJwtConfigProvider(),
        {
          provide: EventEmitter2,
          useValue: { emit: jest.fn(), on: jest.fn() },
        },
        {
          provide: DataSource,
          useValue: dataSource,
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
          provide: 'OnboardingSessionRepository',
          useValue: dataSource.getRepository(OnboardingSession),
        },
        {
          provide: 'OnboardingIdempotencyRecordRepository',
          useValue: dataSource.getRepository(OnboardingIdempotencyRecord),
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
          provide: 'InsumoRepository',
          useValue: dataSource.getRepository(Insumo),
        },
        {
          provide: 'RecipeVersionRepository',
          useValue: dataSource.getRepository(RecipeVersion),
        },
        {
          provide: 'OnboardingTelemetryEventRepository',
          useValue: dataSource.getRepository(OnboardingTelemetryEvent),
        },
        {
          provide: 'ChangeLogRepository',
          useValue: dataSource.getRepository(ChangeLog),
        },
        ChangeLogService,
        OnboardingTelemetryService,
        OnboardingCustomerSaleObserver,
        FiscalSetupService,
        OnboardingSessionService,
        OnboardingReadinessEvaluator,
        OnboardingStateReconciler,
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
        {
          provide: INVENTORY_READINESS_PORT,
          useClass: InventoryReadinessAdapter,
        },
        {
          provide: COSTING_READINESS_PORT,
          useClass: CostingReadinessAdapter,
        },
        {
          provide: OPERATIONS_READINESS_PORT,
          useClass: OperationsReadinessAdapter,
        },
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

    const jwtService = moduleFixture.get<JwtService>(JwtService);
    const ownerTokenA = await signIdentityJwtAccessToken(jwtService, {
      userId: ownerAId,
      sub: ownerAId,
      tenantId: tenantAId,
      tenant_id: tenantAId,
      role: UserRole.OWNER,
    });
    const ownerTokenB = await signIdentityJwtAccessToken(jwtService, {
      userId: ownerBId,
      sub: ownerBId,
      tenantId: tenantBId,
      tenant_id: tenantBId,
      role: UserRole.OWNER,
    });
    const managerTokenA = await signIdentityJwtAccessToken(jwtService, {
      userId: randomUUID(),
      sub: randomUUID(),
      tenantId: tenantAId,
      tenant_id: tenantAId,
      role: UserRole.MANAGER,
    });
    const cashierTokenA = await signIdentityJwtAccessToken(jwtService, {
      userId: randomUUID(),
      sub: randomUUID(),
      tenantId: tenantAId,
      tenant_id: tenantAId,
      role: UserRole.CASHIER,
    });

    const customerSaleObserver = moduleFixture.get<OnboardingCustomerSaleObserver>(
      OnboardingCustomerSaleObserver,
    );
    const telemetryService = moduleFixture.get<OnboardingTelemetryService>(
      OnboardingTelemetryService,
    );

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
      customerSaleObserver,
      telemetryService,
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

describe('Onboarding Readiness & State Reconciler (Real PostgreSQL DB)', () => {
  jest.setTimeout(30000);

  it('runs complete lifecycle: starts SETUP_IN_PROGRESS -> transitions to SALE_READY on product addition -> reverts on product deactivation while preserving saleReadyFirstAt', async () => {
    await withReadinessIsolatedSchema(
      'onb_readiness_lifecycle',
      async ({ app, dataSource, tenantAId, ownerTokenA }) => {
        // 1. Initial POST /onboarding/session/start with 0 products
        const startRes = await request(app.getHttpServer())
          .post('/onboarding/session/start')
          .set('Authorization', `Bearer ${ownerTokenA}`)
          .send({ source: 'SETUP_CENTER' })
          .expect(200);

        expect(startRes.body.session.lifecycleState).toBe(
          OnboardingLifecycleState.SETUP_IN_PROGRESS,
        );
        expect(startRes.body.session.onboardingStartedAt).toBeDefined();
        expect(startRes.body.session.saleReadyFirstAt).toBeNull();
        expect(startRes.body.readiness.saleReady).toBe(false);
        expect(startRes.body.readiness.blockers).toContain(
          'CATALOG_NO_SELLABLE_PRODUCTS',
        );

        // 2. Insert a sellable product for Tenant A in PostgreSQL
        const productRepo = dataSource.getRepository(Product);
        const prod = await productRepo.save(
          productRepo.create({
            id: randomUUID(),
            tenant_id: tenantAId,
            name: 'Café Latte Caliente',
            uom: 'UN',
            stock: 10,
            averageCost: 20.0,
            sellPrice: 65.0,
            is_active: true,
            product_type: ProductType.SIMPLE,
          }),
        );

        // 3. GET /onboarding/session dynamically detects product, promotes to SALE_READY and sets saleReadyFirstAt
        const saleReadyRes = await request(app.getHttpServer())
          .get('/onboarding/session')
          .set('Authorization', `Bearer ${ownerTokenA}`)
          .expect(200);

        expect(saleReadyRes.body.session.lifecycleState).toBe(
          OnboardingLifecycleState.SALE_READY,
        );
        expect(saleReadyRes.body.session.saleReadyFirstAt).toBeDefined();
        expect(saleReadyRes.body.readiness.saleReady).toBe(true);
        expect(saleReadyRes.body.readiness.blockers).toEqual([]);

        const originalSaleReadyFirstAt =
          saleReadyRes.body.session.saleReadyFirstAt;

        // 4. Triangulation: deactivating the product returns readiness to false
        prod.is_active = false;
        await productRepo.save(prod);

        const revertedRes = await request(app.getHttpServer())
          .get('/onboarding/session')
          .set('Authorization', `Bearer ${ownerTokenA}`)
          .expect(200);

        // Lifecycle reverts to SETUP_IN_PROGRESS, but saleReadyFirstAt remains inmutable!
        expect(revertedRes.body.session.lifecycleState).toBe(
          OnboardingLifecycleState.SETUP_IN_PROGRESS,
        );
        expect(revertedRes.body.session.saleReadyFirstAt).toBe(
          originalSaleReadyFirstAt,
        );
        expect(revertedRes.body.readiness.saleReady).toBe(false);
        expect(revertedRes.body.readiness.blockers).toContain(
          'CATALOG_NO_SELLABLE_PRODUCTS',
        );

        // 5. GET /onboarding/readiness exposes live snapshot
        const snapshotRes = await request(app.getHttpServer())
          .get('/onboarding/readiness')
          .set('Authorization', `Bearer ${ownerTokenA}`)
          .expect(200);

        expect(snapshotRes.body.saleReady).toBe(false);
        expect(snapshotRes.body.catalog.sellableProductCount).toBe(0);
      },
    );
  });

  it('guarantees tenant isolation: Tenant B does not observe Tenant A session or products', async () => {
    await withReadinessIsolatedSchema(
      'onb_readiness_iso',
      async ({ app, dataSource, tenantAId, ownerTokenA, ownerTokenB }) => {
        // Tenant A adds a product and starts session
        await request(app.getHttpServer())
          .post('/onboarding/session/start')
          .set('Authorization', `Bearer ${ownerTokenA}`)
          .send()
          .expect(200);

        const productRepo = dataSource.getRepository(Product);
        await productRepo.save(
          productRepo.create({
            id: randomUUID(),
            tenant_id: tenantAId,
            name: 'Super Quesillo Especial',
            uom: 'UN',
            stock: 5,
            averageCost: 30.0,
            sellPrice: 75.0,
            is_active: true,
            product_type: ProductType.SIMPLE,
          }),
        );

        // Tenant B queries GET /onboarding/session
        const bRes = await request(app.getHttpServer())
          .get('/onboarding/session')
          .set('Authorization', `Bearer ${ownerTokenB}`)
          .expect(200);

        // Tenant B has 0 products and remains in SETUP_IN_PROGRESS
        expect(bRes.body.session.lifecycleState).toBe(
          OnboardingLifecycleState.SETUP_IN_PROGRESS,
        );
        expect(bRes.body.readiness.saleReady).toBe(false);
        expect(bRes.body.readiness.catalog.sellableProductCount).toBe(0);
      },
    );
  });

  it('enforces granular RBAC permissions: CASHIER denied, MANAGER can read but cannot start, OWNER full access', async () => {
    await withReadinessIsolatedSchema(
      'onb_rbac_perms',
      async ({ app, ownerTokenA, managerTokenA, cashierTokenA }) => {
        // 1. CASHIER attempting to start session gets 403 Forbidden
        await request(app.getHttpServer())
          .post('/onboarding/session/start')
          .set('Authorization', `Bearer ${cashierTokenA}`)
          .send({ source: 'SETUP_CENTER' })
          .expect(403);

        // 2. CASHIER attempting to read session gets 403 Forbidden
        await request(app.getHttpServer())
          .get('/onboarding/session')
          .set('Authorization', `Bearer ${cashierTokenA}`)
          .expect(403);

        // 3. MANAGER attempting to start session gets 403 Forbidden (lacks onboarding:start)
        await request(app.getHttpServer())
          .post('/onboarding/session/start')
          .set('Authorization', `Bearer ${managerTokenA}`)
          .send({ source: 'SETUP_CENTER' })
          .expect(403);

        // 4. OWNER starts session successfully (has onboarding:start)
        await request(app.getHttpServer())
          .post('/onboarding/session/start')
          .set('Authorization', `Bearer ${ownerTokenA}`)
          .send({ source: 'SETUP_CENTER' })
          .expect(200);

        // 5. MANAGER reading session gets 200 OK (has onboarding:read)
        const mgrGetRes = await request(app.getHttpServer())
          .get('/onboarding/session')
          .set('Authorization', `Bearer ${managerTokenA}`)
          .expect(200);

        expect(mgrGetRes.body.session).toBeDefined();

        // 6. MANAGER reading readiness gets 200 OK
        const mgrReadinessRes = await request(app.getHttpServer())
          .get('/onboarding/readiness')
          .set('Authorization', `Bearer ${managerTokenA}`)
          .expect(200);

        expect(mgrReadinessRes.body.saleReady).toBeDefined();
      },
    );
  });

  it('demonstrates ONB1.9A–D Progressive BOH Readiness: tenant reaches SALE_READY with stock=0 and COST_PENDING, then advances to ACTIVATED and subsequent BOH enrichment does not modify activatedAt or revoke ACTIVATED (AC-07, AC-08, AC-40, AC-41)', async () => {
    await withReadinessIsolatedSchema(
      'onb_progressive_boh',
      async ({ app, dataSource, tenantAId, ownerTokenA }) => {
        // 1. Start session with 0 products
        await request(app.getHttpServer())
          .post('/onboarding/session/start')
          .set('Authorization', `Bearer ${ownerTokenA}`)
          .send({ source: 'SETUP_CENTER' })
          .expect(200);

        // 2. Insert sellable product with stock=0 and averageCost=0 (AC-07, AC-08)
        const productRepo = dataSource.getRepository(Product);
        await productRepo.save(
          productRepo.create({
            id: randomUUID(),
            tenant_id: tenantAId,
            name: 'Café Americano BOH Test',
            uom: 'UN',
            stock: 0,
            averageCost: 0,
            sellPrice: 40.0,
            is_active: true,
            product_type: ProductType.SIMPLE,
          }),
        );

        // 3. GET /onboarding/readiness: verify saleReady = true, costingReady = false (COST_PENDING), inventoryReady = true
        const readinessRes = await request(app.getHttpServer())
          .get('/onboarding/readiness')
          .set('Authorization', `Bearer ${ownerTokenA}`)
          .expect(200);

        expect(readinessRes.body.saleReady).toBe(true);
        expect(readinessRes.body.blockers).toEqual([]);
        expect(readinessRes.body.inventoryReady).toBe(true);
        expect(readinessRes.body.costingReady).toBe(false);
        expect(readinessRes.body.costing.pendingCostCount).toBe(1);
        expect(readinessRes.body.costing.items[0].state).toBe('COST_PENDING');
        expect(readinessRes.body.warnings).toContain(
          'COSTING_PENDING_PROVENANCE',
        );

        // 4. Progress session to ACTIVATED (monotonically locked)
        const sessionRepo = dataSource.getRepository(OnboardingSession);
        const originalActivatedAt = new Date('2026-09-04T12:00:00.000Z');
        await sessionRepo.update(
          { tenantId: tenantAId },
          {
            lifecycleState: OnboardingLifecycleState.ACTIVATED,
            activatedAt: originalActivatedAt,
          },
        );

        // 5. Subsequent BOH enrichment: Add Warehouse, published Recipe, Supplier, and positive averageCost
        const warehouseRepo = dataSource.getRepository(Warehouse);
        await warehouseRepo.save(
          warehouseRepo.create({
            id: randomUUID(),
            tenant_id: tenantAId,
            name: 'Bodega Principal BOH',
            is_active: true,
          }),
        );

        const supplierRepo = dataSource.getRepository(Supplier);
        await supplierRepo.save(
          supplierRepo.create({
            id: randomUUID(),
            tenant_id: tenantAId,
            name: 'Distribuidora Central S.A.',
            is_active: true,
          }),
        );

        // Update product to have confirmed positive cost (AC-41)
        await productRepo.update(
          { tenant_id: tenantAId },
          { averageCost: 18.5 },
        );

        // 6. GET /onboarding/session: Reconciler runs and confirms:
        // - inventoryReady = true
        // - costingReady = true
        // - operationsReady = true
        // - lifecycleState REMAINS ACTIVATED
        // - activatedAt REMAINS UNMODIFIED (AC-40, AC-41)
        const postBohSessionRes = await request(app.getHttpServer())
          .get('/onboarding/session')
          .set('Authorization', `Bearer ${ownerTokenA}`)
          .expect(200);

        expect(postBohSessionRes.body.session.lifecycleState).toBe(
          OnboardingLifecycleState.ACTIVATED,
        );
        expect(
          new Date(postBohSessionRes.body.session.activatedAt).toISOString(),
        ).toBe(originalActivatedAt.toISOString());

        expect(postBohSessionRes.body.readiness.saleReady).toBe(true);
        expect(postBohSessionRes.body.readiness.inventoryReady).toBe(true);
        expect(postBohSessionRes.body.readiness.costingReady).toBe(true);
        expect(postBohSessionRes.body.readiness.operationsReady).toBe(true);
        expect(postBohSessionRes.body.readiness.costing.knownCostCount).toBe(1);
        expect(postBohSessionRes.body.readiness.costing.pendingCostCount).toBe(
          0,
        );
      },
    );
  });

  it('demonstrates ONB1.9E–G: Canonical Product Telemetry, Zero Secrets Guardrail, and Decoupled First Customer Sale Observation (AC-07, AC-08, AC-40, AC-41)', async () => {
    await withReadinessIsolatedSchema(
      'onb_telemetry_cust_sale',
      async ({ app, dataSource, tenantAId, ownerTokenA, customerSaleObserver, telemetryService }) => {
        // 1. Start session
        await request(app.getHttpServer())
          .post('/onboarding/session/start')
          .set('Authorization', `Bearer ${ownerTokenA}`)
          .send({ source: 'SETUP_CENTER' })
          .expect(200);

        // 2. Telemetry Ingestion: Post canonical telemetry events through API
        // a) STEP_VIEWED -> 200 OK
        const viewRes = await request(app.getHttpServer())
          .post('/onboarding/telemetry/events')
          .set('Authorization', `Bearer ${ownerTokenA}`)
          .send({
            eventName: 'STEP_VIEWED',
            stepId: 'FISCAL_SETUP',
            durationMs: 150,
            properties: { navigationPath: '/onboarding/fiscal' },
          })
          .expect(200);

        expect(viewRes.body.accepted).toBe(true);
        expect(viewRes.body.eventName).toBe('STEP_VIEWED');

        // b) INVARIANT: STEP_SKIPPED on required blocker FISCAL_SETUP -> 400 Bad Request
        await request(app.getHttpServer())
          .post('/onboarding/telemetry/events')
          .set('Authorization', `Bearer ${ownerTokenA}`)
          .send({
            eventName: 'STEP_SKIPPED',
            stepId: 'FISCAL_SETUP', // REQUIRED
          })
          .expect(400);

        // c) STEP_SKIPPED on optional BOH_INVENTORY -> 200 OK
        const skipRes = await request(app.getHttpServer())
          .post('/onboarding/telemetry/events')
          .set('Authorization', `Bearer ${ownerTokenA}`)
          .send({
            eventName: 'STEP_SKIPPED',
            stepId: 'BOH_INVENTORY', // OPTIONAL
          })
          .expect(200);
        expect(skipRes.body.accepted).toBe(true);

        // d) Zero Secrets Guardrail: Post telemetry containing JWT, password, card, and raw CSV
        const rawCsv = 'barcode,name,price\n743001,Soda,30.0\n743002,Juice,25.0';
        await request(app.getHttpServer())
          .post('/onboarding/telemetry/events')
          .set('Authorization', `Bearer ${ownerTokenA}`)
          .send({
            eventName: 'IMPORT_VALIDATED',
            properties: {
              admin_password: 'superSecretPassword123!',
              token_jwt: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIn0.sig',
              card_number: '4532015012345678',
              raw_csv: rawCsv,
              legitimateCounter: 42,
            },
          })
          .expect(200);

        // Query real PostgreSQL database table to verify zero secrets stored physically
        const telemetryRepo = dataSource.getRepository(OnboardingTelemetryEvent);
        const importEvent = await telemetryRepo.findOne({
          where: { tenantId: tenantAId, eventName: 'IMPORT_VALIDATED' as any },
        });

        expect(importEvent).toBeDefined();
        const storedProps = importEvent!.propertiesSanitizedJson!;
        expect(storedProps.admin_password).toBe('[REDACTED_SECRET]');
        expect(storedProps.token_jwt).toContain('[REDACTED_JWT]');
        expect(storedProps.card_number).toBe('[REDACTED_CARD]');
        expect(storedProps.raw_csv).toEqual({
          redacted: true,
          type: 'RAW_CSV_REDACTED',
          lineCount: 3,
          byteLength: rawCsv.length,
        });
        expect(storedProps.legitimateCounter).toBe(42);

        // 3. ONB1.9G — Decoupled First Customer Sale Observation
        // Establish historical Activation state (M6): controlled verification sale performed
        const sessionRepo = dataSource.getRepository(OnboardingSession);
        const historicalTtfss = new Date('2026-09-04T12:00:00.000Z');
        const historicalActivatedAt = new Date('2026-09-04T12:05:00.000Z');

        await sessionRepo.update(
          { tenantId: tenantAId },
          {
            lifecycleState: OnboardingLifecycleState.ACTIVATED,
            activatedAt: historicalActivatedAt,
            firstSuccessfulSaleAt: historicalTtfss,
            firstCustomerSaleAt: null,
          },
        );

        // First commercial sale to end-customer happens 2 hours later
        const firstCustomerSaleTime = new Date('2026-09-04T14:15:00.000Z');
        const obsResult = await customerSaleObserver.observeSale({
          tenantId: tenantAId,
          ticketId: 'ticket-commercial-final-001',
          occurredAt: firstCustomerSaleTime,
          isActivationVerificationSale: false,
        });

        expect(obsResult.observed).toBe(true);
        expect(obsResult.isFirstCustomerSale).toBe(true);
        expect(obsResult.firstCustomerSaleAt).toEqual(firstCustomerSaleTime);

        // INVARIANT CHECK: In real PostgreSQL, verify that:
        // - firstCustomerSaleAt is persisted
        // - historical firstSuccessfulSaleAt is 100% UNCHANGED
        // - historical activatedAt is 100% UNCHANGED
        const sessionInDb = await sessionRepo.findOne({
          where: { tenantId: tenantAId },
        });

        expect(sessionInDb).toBeDefined();
        expect(sessionInDb!.firstCustomerSaleAt?.toISOString()).toBe(
          firstCustomerSaleTime.toISOString(),
        );
        expect(sessionInDb!.firstSuccessfulSaleAt?.toISOString()).toBe(
          historicalTtfss.toISOString(),
        );
        expect(sessionInDb!.activatedAt?.toISOString()).toBe(
          historicalActivatedAt.toISOString(),
        );

        // Verify that FIRST_CUSTOMER_SALE telemetry event was persisted in DB
        const custSaleTelemetry = await telemetryRepo.findOne({
          where: { tenantId: tenantAId, eventName: 'FIRST_CUSTOMER_SALE' as any },
        });
        expect(custSaleTelemetry).toBeDefined();
        expect(custSaleTelemetry!.propertiesSanitizedJson!.ticketId).toBe(
          'ticket-commercial-final-001',
        );
        expect(custSaleTelemetry!.propertiesSanitizedJson!.historicalTtfssPreserved).toBe(
          true,
        );

        // Subsequent commercial sale (ticket 002) at 16:00 does NOT overwrite firstCustomerSaleAt
        const secondSaleTime = new Date('2026-09-04T16:00:00.000Z');
        const secondObsResult = await customerSaleObserver.observeSale({
          tenantId: tenantAId,
          ticketId: 'ticket-commercial-final-002',
          occurredAt: secondSaleTime,
          isActivationVerificationSale: false,
        });

        expect(secondObsResult.observed).toBe(false);
        expect(secondObsResult.isFirstCustomerSale).toBe(false);

        const sessionAfterSecond = await sessionRepo.findOne({
          where: { tenantId: tenantAId },
        });
        expect(sessionAfterSecond!.firstCustomerSaleAt?.toISOString()).toBe(
          firstCustomerSaleTime.toISOString(),
        );
        expect(sessionAfterSecond!.firstSuccessfulSaleAt?.toISOString()).toBe(
          historicalTtfss.toISOString(),
        );
      },
    );
  });
});
