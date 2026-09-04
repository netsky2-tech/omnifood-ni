import { randomUUID } from 'crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { Tenant } from '../../src/modules/tenant/entities/tenant.entity';
import { SystemParametersConfig } from '../../src/modules/inventory/entities/system-parameters-config.entity';
import { Product } from '../../src/modules/inventory/entities/product.entity';
import { Insumo } from '../../src/modules/inventory/entities/insumo.entity';
import { Recipe } from '../../src/modules/inventory/entities/recipe.entity';
import {
  RecipeOrigin,
  RecipePublicationState,
  RecipeSuggestionState,
  RecipeVersion,
} from '../../src/modules/inventory/entities/recipe-version.entity';
import { RecipeDetail } from '../../src/modules/inventory/entities/recipe-detail.entity';
import { UomConversion } from '../../src/modules/inventory/entities/uom-conversion.entity';
import { IndustryTemplate } from '../../src/modules/onboarding/entities/industry-template.entity';
import { TemplateInsumo } from '../../src/modules/onboarding/entities/template-insumo.entity';
import { TemplateProduct } from '../../src/modules/onboarding/entities/template-product.entity';
import { TemplateRecipeItem } from '../../src/modules/onboarding/entities/template-recipe-item.entity';
import { ImportStaging } from '../../src/modules/onboarding/entities/import-staging.entity';
import { OnboardingSession } from '../../src/modules/onboarding/entities/onboarding-session.entity';
import { OnboardingIdempotencyRecord } from '../../src/modules/onboarding/entities/onboarding-idempotency.entity';
import { TemplateApplication } from '../../src/modules/onboarding/entities/template-application.entity';
import {
  TemplateSeedLink,
  TemplateSourceItemType,
  TemplateTargetEntityType,
} from '../../src/modules/onboarding/entities/template-seed-link.entity';
import {
  LegacyMigrationDecision,
  LegacyOnboardingMigrationReceipt,
} from '../../src/modules/onboarding/entities/legacy-migration-receipt.entity';
import { Invoice } from '../../src/modules/sales/entities/invoice.entity';
import { InvoiceItem } from '../../src/modules/sales/entities/invoice-item.entity';
import { InvoiceItemModifier } from '../../src/modules/sales/entities/invoice-item-modifier.entity';
import { Payment } from '../../src/modules/sales/entities/payment.entity';
import { IndustryTemplateController } from '../../src/modules/onboarding/controllers/industry-template.controller';
import { IndustryTemplateService } from '../../src/modules/onboarding/services/industry-template.service';
import { TemplatePreviewService } from '../../src/modules/onboarding/services/template-preview.service';
import { LegacyTemplateRecipeScanService } from '../../src/modules/onboarding/services/legacy-template-recipe-scan.service';
import { OnboardingIdempotencyCoordinator } from '../../src/modules/onboarding/services/onboarding-idempotency.coordinator';
import { RecipeService } from '../../src/modules/inventory/recipe.service';
import { UomConversionCalculator } from '../../src/modules/inventory/uom-conversion-calculator';
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

async function withTemplateCutoverIsolatedSchema(
  schemaPrefix: string,
  assertion: (ctx: {
    app: INestApplication;
    dataSource: DataSource;
    jwtService: JwtService;
    tenantAId: string;
    tenantBId: string;
    ownerTokenA: string;
    ownerTokenB: string;
    templateId: string;
    insumoId: string;
    productId: string;
    schema: string;
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
        OnboardingSession,
        OnboardingIdempotencyRecord,
        TemplateApplication,
        TemplateSeedLink,
        LegacyOnboardingMigrationReceipt,
        Invoice,
        InvoiceItem,
        InvoiceItemModifier,
        Payment,
      ],
      synchronize: true,
    });
    await dataSource.initialize();
    await dataSource.query(`SET search_path TO "${schema}"`);

    // Seed Two Tenants: Tenant A and Tenant B
    const tenantAId = randomUUID();
    const tenantBId = randomUUID();

    await dataSource.query(
      `INSERT INTO tenants (id, name, is_active, created_at, updated_at) VALUES ($1, $2, true, now(), now())`,
      [tenantAId, 'Tenant A — Café Central'],
    );
    await dataSource.query(
      `INSERT INTO tenants (id, name, is_active, created_at, updated_at) VALUES ($1, $2, true, now(), now())`,
      [tenantBId, 'Tenant B — Panadería Real'],
    );

    // Seed Industry Template
    const templateId = 'CAFETERIA';
    await dataSource.query(
      `INSERT INTO industry_templates (id, code, name, description, icon, is_active, version, source_fingerprint)
       VALUES ($1, 'CAFETERIA', 'Cafetería & Panadería', 'Especializada en café', 'coffee', true, 1, 'fp-cafe-v1')`,
      [templateId],
    );

    const insumoId = randomUUID();
    await dataSource.query(
      `INSERT INTO template_insumos (id, template_id, name, purchase_uom, consumption_uom, conversion_factor, negative_stock_policy)
       VALUES ($1, $2, 'Café en Grano', 'KG', 'G', 1000, 'RESTRICT')`,
      [insumoId, templateId],
    );

    const productId = randomUUID();
    await dataSource.query(
      `INSERT INTO template_products (id, template_id, name, category, uom, suggested_price, is_perishable)
       VALUES ($1, $2, 'Americano 8oz', 'Bebidas Calientes', 'UN', 65.0, false)`,
      [productId, templateId],
    );

    const recipeItemId = randomUUID();
    await dataSource.query(
      `INSERT INTO template_recipe_items (id, template_product_id, template_insumo_name, gross_quantity, technical_shrink_pct, component_uom)
       VALUES ($1, $2, 'Café en Grano', 14.0, 0, 'G')`,
      [recipeItemId, productId],
    );

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        createIdentityJwtConfigProvider(),
        createIdentityJwtTestConfigProvider(),
        JwtService,
        IndustryTemplateService,
        TemplatePreviewService,
        LegacyTemplateRecipeScanService,
        OnboardingIdempotencyCoordinator,
        RecipeService,
        UomConversionCalculator,
        {
          provide: 'IndustryTemplateRepository',
          useFactory: (ds: DataSource) => ds.getRepository(IndustryTemplate),
          inject: [DataSource],
        },
        {
          provide: 'TemplateInsumoRepository',
          useFactory: (ds: DataSource) => ds.getRepository(TemplateInsumo),
          inject: [DataSource],
        },
        {
          provide: 'TemplateProductRepository',
          useFactory: (ds: DataSource) => ds.getRepository(TemplateProduct),
          inject: [DataSource],
        },
        {
          provide: 'TemplateRecipeItemRepository',
          useFactory: (ds: DataSource) => ds.getRepository(TemplateRecipeItem),
          inject: [DataSource],
        },
        {
          provide: 'InsumoRepository',
          useFactory: (ds: DataSource) => ds.getRepository(Insumo),
          inject: [DataSource],
        },
        {
          provide: 'ProductRepository',
          useFactory: (ds: DataSource) => ds.getRepository(Product),
          inject: [DataSource],
        },
        {
          provide: 'RecipeVersionRepository',
          useFactory: (ds: DataSource) => ds.getRepository(RecipeVersion),
          inject: [DataSource],
        },
        {
          provide: 'RecipeDetailRepository',
          useFactory: (ds: DataSource) => ds.getRepository(RecipeDetail),
          inject: [DataSource],
        },
        {
          provide: 'RecipeRepository',
          useFactory: (ds: DataSource) => ds.getRepository(Recipe),
          inject: [DataSource],
        },
        {
          provide: 'UomConversionRepository',
          useFactory: (ds: DataSource) => ds.getRepository(UomConversion),
          inject: [DataSource],
        },
        {
          provide: 'TemplateSeedLinkRepository',
          useFactory: (ds: DataSource) => ds.getRepository(TemplateSeedLink),
          inject: [DataSource],
        },
        {
          provide: 'TemplateApplicationRepository',
          useFactory: (ds: DataSource) => ds.getRepository(TemplateApplication),
          inject: [DataSource],
        },
        {
          provide: 'OnboardingSessionRepository',
          useFactory: (ds: DataSource) => ds.getRepository(OnboardingSession),
          inject: [DataSource],
        },
        {
          provide: 'OnboardingIdempotencyRecordRepository',
          useFactory: (ds: DataSource) =>
            ds.getRepository(OnboardingIdempotencyRecord),
          inject: [DataSource],
        },
        {
          provide: 'LegacyOnboardingMigrationReceiptRepository',
          useFactory: (ds: DataSource) =>
            ds.getRepository(LegacyOnboardingMigrationReceipt),
          inject: [DataSource],
        },
        {
          provide: 'InvoiceItemRepository',
          useFactory: (ds: DataSource) => ds.getRepository(InvoiceItem),
          inject: [DataSource],
        },
        {
          provide: DataSource,
          useValue: dataSource,
        },
      ],
      controllers: [IndustryTemplateController],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();

    const jwtService = moduleRef.get(JwtService);
    const ownerTokenA = signIdentityJwtAccessToken(jwtService, {
      sub: randomUUID(),
      tenant_id: tenantAId,
      email: 'owner-a@example.com',
      role: UserRole.OWNER,
    });
    const ownerTokenB = signIdentityJwtAccessToken(jwtService, {
      sub: randomUUID(),
      tenant_id: tenantBId,
      email: 'owner-b@example.com',
      role: UserRole.OWNER,
    });

    await assertion({
      app,
      dataSource,
      jwtService,
      tenantAId,
      tenantBId,
      ownerTokenA,
      ownerTokenB,
      templateId,
      insumoId,
      productId,
      schema,
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

describe('ONB1.3 Industry Template Safe Cutover (Real PostgreSQL E2E / Zero Mocks)', () => {
  it('verifies side-effect free preview does NOT write to database', async () => {
    await withTemplateCutoverIsolatedSchema(
      'onb13_preview',
      async ({ app, dataSource, ownerTokenA, tenantAId, schema }) => {
        const res = await request(app.getHttpServer())
          .post('/onboarding/templates/CAFETERIA/preview')
          .set('Authorization', `Bearer ${ownerTokenA}`)
          .send({})
          .expect(201);

        expect(res.body.templateCode).toBe('CAFETERIA');
        expect(res.body.items).toHaveLength(2); // 1 insumo + 1 product
        expect(res.body.summary.newCount).toBe(2);

        // Verify ZERO writes occurred
        const [insumos, products, links, apps] = await Promise.all([
          dataSource.query(
            `SELECT count(*) FROM "${schema}".insumos WHERE tenant_id = $1`,
            [tenantAId],
          ),
          dataSource.query(
            `SELECT count(*) FROM "${schema}".products WHERE tenant_id = $1`,
            [tenantAId],
          ),
          dataSource.query(
            `SELECT count(*) FROM "${schema}".onboarding_template_seed_links WHERE tenant_id = $1`,
            [tenantAId],
          ),
          dataSource.query(
            `SELECT count(*) FROM "${schema}".onboarding_template_applications WHERE tenant_id = $1`,
            [tenantAId],
          ),
        ]);

        expect(Number(insumos[0].count)).toBe(0);
        expect(Number(products[0].count)).toBe(0);
        expect(Number(links[0].count)).toBe(0);
        expect(Number(apps[0].count)).toBe(0);
      },
    );
  });

  it('verifies safe apply creates RecipeVersion in DRAFT/SUGGESTED without stock/cost side effects and enforces two-tenant isolation', async () => {
    await withTemplateCutoverIsolatedSchema(
      'onb13_apply',
      async ({
        app,
        dataSource,
        ownerTokenA,
        ownerTokenB,
        tenantAId,
        tenantBId,
        insumoId,
        productId,
        schema,
      }) => {
        // 1. Tenant A applies template with idempotencyKey
        const resA = await request(app.getHttpServer())
          .post('/onboarding/templates/CAFETERIA/apply')
          .set('Authorization', `Bearer ${ownerTokenA}`)
          .send({ idempotencyKey: 'idemp-tenant-a-1' })
          .expect(201);

        expect(resA.body.tenantId).toBe(tenantAId);
        expect(resA.body.insumosCreated).toBe(1);
        expect(resA.body.productsCreated).toBe(1);
        expect(resA.body.recipesCreated).toBe(1);
        expect(resA.body.applicationId).toBeDefined();

        // 2. Verify recipe was created as DRAFT / SUGGESTED, is_active=false
        const recipeRows = await dataSource.query(
          `SELECT id, is_active, origin, publication_state, suggestion_state, yield_quantity
         FROM "${schema}".recipe_versions WHERE tenant_id = $1`,
          [tenantAId],
        );
        expect(recipeRows).toHaveLength(1);
        expect(recipeRows[0].is_active).toBe(false);
        expect(recipeRows[0].origin).toBe(RecipeOrigin.INDUSTRY_TEMPLATE);
        expect(recipeRows[0].publication_state).toBe(
          RecipePublicationState.DRAFT,
        );
        expect(recipeRows[0].suggestion_state).toBe(
          RecipeSuggestionState.SUGGESTED,
        );

        // 3. Verify ZERO legacy Recipe rows were created
        const legacyRecipes = await dataSource.query(
          `SELECT count(*) FROM "${schema}".recipes WHERE tenant_id = $1`,
          [tenantAId],
        );
        expect(Number(legacyRecipes[0].count)).toBe(0);

        // 4. Verify ZERO fictitious stock or cost
        const insumoRows = await dataSource.query(
          `SELECT stock, existencia_actual, costo_promedio_nio FROM "${schema}".insumos WHERE tenant_id = $1`,
          [tenantAId],
        );
        expect(Number(insumoRows[0].stock)).toBe(0);
        expect(Number(insumoRows[0].existencia_actual)).toBe(0);
        expect(Number(insumoRows[0].costo_promedio_nio)).toBe(0);

        const productRows = await dataSource.query(
          `SELECT stock, "averageCost", "sellPrice" FROM "${schema}".products WHERE tenant_id = $1`,
          [tenantAId],
        );
        expect(Number(productRows[0].stock)).toBe(0);
        expect(Number(productRows[0].averageCost)).toBe(0);
        expect(Number(productRows[0].sellPrice)).toBe(65.0);

        // 5. Verify TemplateSeedLink provenance rows
        const linksA = await dataSource.query(
          `SELECT source_item_id, target_entity_type, last_seen_version FROM "${schema}".onboarding_template_seed_links WHERE tenant_id = $1`,
          [tenantAId],
        );
        expect(linksA).toHaveLength(3); // Insumo, Product, Recipe

        // 6. Two-Tenant Isolation (ODAV-34): Tenant B has ZERO rows
        const [insumosB, productsB, recipesB, linksB] = await Promise.all([
          dataSource.query(
            `SELECT count(*) FROM "${schema}".insumos WHERE tenant_id = $1`,
            [tenantBId],
          ),
          dataSource.query(
            `SELECT count(*) FROM "${schema}".products WHERE tenant_id = $1`,
            [tenantBId],
          ),
          dataSource.query(
            `SELECT count(*) FROM "${schema}".recipe_versions WHERE tenant_id = $1`,
            [tenantBId],
          ),
          dataSource.query(
            `SELECT count(*) FROM "${schema}".onboarding_template_seed_links WHERE tenant_id = $1`,
            [tenantBId],
          ),
        ]);
        expect(Number(insumosB[0].count)).toBe(0);
        expect(Number(productsB[0].count)).toBe(0);
        expect(Number(recipesB[0].count)).toBe(0);
        expect(Number(linksB[0].count)).toBe(0);

        // 7. Idempotent Reapplication on Tenant A (AC-13 / AC-47)
        const resReapply = await request(app.getHttpServer())
          .post('/onboarding/templates/CAFETERIA/apply')
          .set('Authorization', `Bearer ${ownerTokenA}`)
          .send({ idempotencyKey: 'idemp-tenant-a-reapply' })
          .expect(201);

        expect(resReapply.body.insumosCreated).toBe(0);
        expect(resReapply.body.insumosSkipped).toBe(1);
        expect(resReapply.body.productsCreated).toBe(0);
        expect(resReapply.body.productsSkipped).toBe(1);
        expect(resReapply.body.recipesCreated).toBe(0);

        // Ensure counts in DB did not duplicate
        const productCountAfter = await dataSource.query(
          `SELECT count(*) FROM "${schema}".products WHERE tenant_id = $1`,
          [tenantAId],
        );
        expect(Number(productCountAfter[0].count)).toBe(1);
      },
    );
  });

  it('verifies partial selection (AC-10) only creates selected items end-to-end', async () => {
    await withTemplateCutoverIsolatedSchema(
      'onb13_partial',
      async ({ app, dataSource, ownerTokenA, tenantAId, insumoId, schema }) => {
        // Only select insumoId, exclude product
        const res = await request(app.getHttpServer())
          .post('/onboarding/templates/CAFETERIA/apply')
          .set('Authorization', `Bearer ${ownerTokenA}`)
          .send({
            idempotencyKey: 'idemp-partial-1',
            selectedItemIds: [insumoId],
          })
          .expect(201);

        expect(res.body.insumosCreated).toBe(1);
        expect(res.body.productsCreated).toBe(0);
        expect(res.body.recipesCreated).toBe(0);

        const [insumoCount, productCount] = await Promise.all([
          dataSource.query(
            `SELECT count(*) FROM "${schema}".insumos WHERE tenant_id = $1`,
            [tenantAId],
          ),
          dataSource.query(
            `SELECT count(*) FROM "${schema}".products WHERE tenant_id = $1`,
            [tenantAId],
          ),
        ]);
        expect(Number(insumoCount[0].count)).toBe(1);
        expect(Number(productCount[0].count)).toBe(0);
      },
    );
  });

  it('verifies LegacyTemplateRecipeScan on real DB produces receipts and protects operational tenants', async () => {
    await withTemplateCutoverIsolatedSchema(
      'onb13_legacy',
      async ({
        app,
        dataSource,
        ownerTokenA,
        ownerTokenB,
        tenantAId,
        tenantBId,
        productId,
        schema,
      }) => {
        // 1. In Tenant A (non-operational, 0 sales), create an active legacy recipe
        const [prodA] = await dataSource.query(
          `INSERT INTO "${schema}".products (id, tenant_id, name, uom, "sellPrice", "averageCost", stock, is_active)
         VALUES (gen_random_uuid(), $1, 'Americano 8oz', 'UN', 65.0, 0, 0, true) RETURNING id`,
          [tenantAId],
        );

        const [rvA] = await dataSource.query(
          `INSERT INTO "${schema}".recipe_versions (id, tenant_id, product_id, product_name, version_number, is_active, origin, publication_state, suggestion_state)
         VALUES (gen_random_uuid(), $1, $2, 'Americano 8oz', 1, true, 'INDUSTRY_TEMPLATE', 'PUBLISHED', 'CONFIRMED') RETURNING id`,
          [tenantAId, prodA.id],
        );

        // Run legacy scan on Tenant A -> should safely migrate to DRAFT with MOVE_TO_DRAFT receipt
        const scanResA = await request(app.getHttpServer())
          .post('/onboarding/templates/legacy-recipe-scan')
          .set('Authorization', `Bearer ${ownerTokenA}`)
          .send({})
          .expect(201);

        expect(scanResA.body.scannedCount).toBe(1);
        expect(scanResA.body.migratedToDraftCount).toBe(1);
        expect(scanResA.body.receipts[0].decision).toBe(
          LegacyMigrationDecision.MOVE_TO_DRAFT,
        );

        // Check DB: is_active should now be false, publication_state = DRAFT
        const [rvAfterA] = await dataSource.query(
          `SELECT is_active, publication_state FROM "${schema}".recipe_versions WHERE id = $1`,
          [rvA.id],
        );
        expect(rvAfterA.is_active).toBe(false);
        expect(rvAfterA.publication_state).toBe('DRAFT');

        // Verify receipt was saved in legacy_onboarding_migration_receipts
        const receiptsA = await dataSource.query(
          `SELECT decision, target_entity_id, reason FROM "${schema}".legacy_onboarding_migration_receipts WHERE tenant_id = $1`,
          [tenantAId],
        );
        expect(receiptsA).toHaveLength(1);
        expect(receiptsA[0].decision).toBe('MOVE_TO_DRAFT');

        // 2. In Tenant B (operational, activated), create an active legacy recipe
        await dataSource.query(
          `INSERT INTO "${schema}".onboarding_sessions (id, tenant_id, lifecycle_state, activated_at, first_successful_sale_at)
         VALUES (gen_random_uuid(), $1, 'ACTIVATED', now(), now())`,
          [tenantBId],
        );

        const [prodB] = await dataSource.query(
          `INSERT INTO "${schema}".products (id, tenant_id, name, uom, "sellPrice", "averageCost", stock, is_active)
         VALUES (gen_random_uuid(), $1, 'Americano 8oz', 'UN', 65.0, 0, 0, true) RETURNING id`,
          [tenantBId],
        );

        const [rvB] = await dataSource.query(
          `INSERT INTO "${schema}".recipe_versions (id, tenant_id, product_id, product_name, version_number, is_active, origin, publication_state, suggestion_state)
         VALUES (gen_random_uuid(), $1, $2, 'Americano 8oz', 1, true, 'INDUSTRY_TEMPLATE', 'PUBLISHED', 'CONFIRMED') RETURNING id`,
          [tenantBId, prodB.id],
        );

        // Run legacy scan on Tenant B -> must NEVER mutate silently, must emit KEEP_PUBLISHED
        const scanResB = await request(app.getHttpServer())
          .post('/onboarding/templates/legacy-recipe-scan')
          .set('Authorization', `Bearer ${ownerTokenB}`)
          .send({})
          .expect(201);

        expect(scanResB.body.scannedCount).toBe(1);
        expect(scanResB.body.keptPublishedCount).toBe(1);
        expect(scanResB.body.migratedToDraftCount).toBe(0);
        expect(scanResB.body.receipts[0].decision).toBe(
          LegacyMigrationDecision.KEEP_PUBLISHED,
        );

        // Check DB: is_active remains true, publication_state = PUBLISHED
        const [rvAfterB] = await dataSource.query(
          `SELECT is_active, publication_state FROM "${schema}".recipe_versions WHERE id = $1`,
          [rvB.id],
        );
        expect(rvAfterB.is_active).toBe(true);
        expect(rvAfterB.publication_state).toBe('PUBLISHED');
      },
    );
  });
});
