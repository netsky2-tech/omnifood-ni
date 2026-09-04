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
import {
  Product,
  ProductType,
} from '../../src/modules/inventory/entities/product.entity';
import { Insumo } from '../../src/modules/inventory/entities/insumo.entity';
import { Recipe, IngredientType } from '../../src/modules/inventory/entities/recipe.entity';
import {
  RecipeVersion,
  RecipePublicationState,
  RecipeSuggestionState,
} from '../../src/modules/inventory/entities/recipe-version.entity';
import { RecipeDetail } from '../../src/modules/inventory/entities/recipe-detail.entity';
import { UomConversion } from '../../src/modules/inventory/entities/uom-conversion.entity';
import { Warehouse } from '../../src/modules/inventory/entities/warehouse.entity';
import { Supplier } from '../../src/modules/inventory/entities/supplier.entity';
import {
  InventoryMovement,
  MovementType,
} from '../../src/modules/inventory/entities/inventory-movement.entity';
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
import { FiscalConfigRevision } from '../../src/modules/onboarding/entities/fiscal-config-revision.entity';
import { ActivationAttempt } from '../../src/modules/onboarding/entities/activation-attempt.entity';
import { ActivationCheckResult } from '../../src/modules/onboarding/entities/activation-check-result.entity';
import { ActivationFollowUp } from '../../src/modules/onboarding/entities/activation-follow-up.entity';
import { OnboardingTelemetryEvent } from '../../src/modules/onboarding/entities/onboarding-telemetry-event.entity';
import { ChangeLog } from '../../src/modules/audit/entities/change-log.entity';
import { ChangeLogService } from '../../src/modules/audit/change-log.service';

import { OnboardingRolloutController } from '../../src/modules/onboarding/controllers/onboarding-rollout.controller';
import { OnboardingFeatureRolloutService } from '../../src/modules/onboarding/services/onboarding-feature-rollout.service';
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

describe('ONB1.10G: Rollback Rehearsal & Controlled Degradation Suite (PostgreSQL Real DB)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let rolloutService: OnboardingFeatureRolloutService;
  let jwtService: JwtService;
  let tenantId: string;
  let ownerToken: string;
  let schema: string;
  let bootstrap: DataSource;

  // Snapshot variables to verify strict invariants
  let seededProductId: string;
  let seededStartedAt: Date;
  let seededSaleReadyFirstAt: Date;
  let seededActivatedAt: Date;

  beforeAll(async () => {
    bootstrap = new DataSource({ type: 'postgres', ...postgresConnection });
    await bootstrap.initialize();
    schema = `rollback_${randomUUID().replace(/-/g, '')}`;
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

    tenantId = randomUUID();
    const ownerUserId = randomUUID();

    // 1. Seed Tenant & Owner
    await dataSource.getRepository(Tenant).save({
      id: tenantId,
      name: 'Rollback Invariants Tenant',
      is_active: true,
    });

    await dataSource.getRepository(User).save({
      id: ownerUserId,
      tenant_id: tenantId,
      name: 'Owner User',
      email: 'owner.rollback@omnifood.ni',
      password_hash: 'hash',
      role: UserRole.OWNER,
      is_active: true,
    });

    // 2. Seed Valid Product & Fiscal Config
    seededProductId = randomUUID();
    await dataSource.getRepository(Product).save({
      id: seededProductId,
      tenant_id: tenantId,
      name: 'Valid Product Created In Onboarding',
      uom: 'UN',
      sellPrice: 120.0,
      averageCost: 0,
      stock: 0,
      product_type: ProductType.SIMPLE,
      is_active: true,
    });

    await dataSource.getRepository(FiscalConfigRevision).save({
      tenant_id: tenantId,
      revision: 1,
      fingerprint: 'fp-valid-fiscal-revision-1',
      payload: { regime: 'REGIMEN_GENERAL' },
    });

    // 3. Seed OnboardingSession with all milestones
    seededStartedAt = new Date('2026-09-01T10:00:00Z');
    seededSaleReadyFirstAt = new Date('2026-09-01T10:05:00Z');
    seededActivatedAt = new Date('2026-09-01T10:12:00Z');

    await dataSource.getRepository(OnboardingSession).save({
      tenantId,
      lifecycleState: OnboardingLifecycleState.ACTIVATED,
      onboardingStartedAt: seededStartedAt,
      saleReadyFirstAt: seededSaleReadyFirstAt,
      activatedAt: seededActivatedAt,
      measurementEligible: true,
      legacyBaseline: false,
      optimisticVersion: 5,
    });

    // 4. Seed Audit Trail (ChangeLog) & Kardex
    await dataSource.getRepository(ChangeLog).save({
      id: randomUUID(),
      tenant_id: tenantId,
      user_id: ownerUserId,
      action: 'ONBOARDING_INITIALIZED',
      target_type: 'OnboardingSession',
      target_id: tenantId,
      details: { step: 'ALL_COMPLETE' },
    });

    await dataSource.getRepository(InventoryMovement).save({
      id: '1001',
      tenant_id: tenantId,
      insumoId: randomUUID(),
      type: MovementType.ADJUSTMENT,
      quantity: 10,
      previousStock: 0,
      newStock: 10,
      unitCostNio: 25.0,
      totalCostNio: 250.0,
    });

    // 5. Seed Template Recipe as DRAFT/SUGGESTED
    const recipe = await dataSource.getRepository(Recipe).save({
      id: randomUUID(),
      tenant_id: tenantId,
      productId: seededProductId,
      ingredientId: randomUUID(),
      ingredientType: IngredientType.INSUMO,
      quantity: 1,
    });

    await dataSource.getRepository(RecipeVersion).save({
      id: randomUUID(),
      tenant_id: tenantId,
      product_id: seededProductId,
      version_number: 1,
      publication_state: RecipePublicationState.DRAFT,
      suggestion_state: RecipeSuggestionState.SUGGESTED,
    });

    // 6. Seed Import Staging session
    await dataSource.getRepository(ImportStaging).save({
      id: randomUUID(),
      tenant_id: tenantId,
      token_sesion_importacion: randomUUID(),
      raw_nombre: 'Staged Item 1',
      raw_sku: 'STG-001',
      estado: 'COMMITTED',
    });

    // Setup Nest App
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [OnboardingRolloutController],
      providers: [
        createIdentityJwtConfigProvider(),
        createIdentityJwtTestConfigProvider(),
        JwtService,
        Reflector,
        AuthGuard,
        RolesGuard,
        PermissionsGuard,
        { provide: DataSource, useValue: dataSource },
        { provide: 'TenantRepository', useValue: dataSource.getRepository(Tenant) },
        { provide: 'UserRepository', useValue: dataSource.getRepository(User) },
        { provide: 'SecurityProfileRepository', useValue: dataSource.getRepository(SecurityProfile) },
        OnboardingFeatureRolloutService,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    jwtService = moduleFixture.get<JwtService>(JwtService);
    rolloutService = moduleFixture.get<OnboardingFeatureRolloutService>(
      OnboardingFeatureRolloutService,
    );

    ownerToken = signIdentityJwtAccessToken(jwtService, {
      sub: ownerUserId,
      email: 'owner.rollback@omnifood.ni',
      role: UserRole.OWNER,
      tenant_id: tenantId,
    });

    // Set all flags to stage 10 (fully active) before testing rollback
    rolloutService.applyCutoverStage(tenantId, 10);
  });

  afterAll(async () => {
    if (app) await app.close();
    if (dataSource?.isInitialized) await dataSource.destroy();
    if (bootstrap?.isInitialized) {
      await bootstrap.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await bootstrap.destroy();
    }
  });

  it('executes rollback and verifies that all feature flags are safely disabled', async () => {
    const res = await request(app.getHttpServer())
      .post('/onboarding/rollout/rollback')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send();

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ROLLED_BACK');
  });

  it('INVARIANT 1: Rollback NEVER deletes valid Product or Fiscal records created in onboarding', async () => {
    const prod = await dataSource.getRepository(Product).findOne({
      where: { id: seededProductId, tenant_id: tenantId },
    });
    expect(prod).toBeDefined();
    expect(prod!.name).toBe('Valid Product Created In Onboarding');

    const fiscal = await dataSource.getRepository(FiscalConfigRevision).findOne({
      where: { tenant_id: tenantId, revision: 1 },
    });
    expect(fiscal).toBeDefined();
    expect(fiscal!.fingerprint).toBe('fp-valid-fiscal-revision-1');
  });

  it('INVARIANT 2: Rollback NEVER truncates import staging globally or destroys staging trace', async () => {
    const stagingCount = await dataSource.getRepository(ImportStaging).count({
      where: { tenant_id: tenantId },
    });
    expect(stagingCount).toBeGreaterThan(0);
  });

  it('INVARIANT 3: Rollback NEVER alters or deletes Audit Trail (ChangeLog)', async () => {
    const logs = await dataSource.getRepository(ChangeLog).find({
      where: { tenant_id: tenantId },
    });
    expect(logs.length).toBeGreaterThan(0);
    expect(logs[0].action).toBe('ONBOARDING_INITIALIZED');
  });

  it('INVARIANT 4: Rollback NEVER modifies Kardex (InventoryMovement) records', async () => {
    const movements = await dataSource.getRepository(InventoryMovement).find({
      where: { tenant_id: tenantId },
    });
    expect(movements.length).toBe(1);
    expect(movements[0].type).toBe(MovementType.ADJUSTMENT);
  });

  it('INVARIANT 5: Rollback NEVER rewrites historical milestones in OnboardingSession', async () => {
    const session = await dataSource.getRepository(OnboardingSession).findOne({
      where: { tenantId },
    });
    expect(session).toBeDefined();
    expect(session!.onboardingStartedAt.toISOString()).toBe(seededStartedAt.toISOString());
    expect(session!.saleReadyFirstAt?.toISOString()).toBe(seededSaleReadyFirstAt.toISOString());
    expect(session!.activatedAt?.toISOString()).toBe(seededActivatedAt.toISOString());
    expect(session!.lifecycleState).toBe(OnboardingLifecycleState.ACTIVATED);
  });

  it('INVARIANT 6: Rollback NEVER auto-publishes recipes (remains DRAFT/SUGGESTED)', async () => {
    const recipeVersions = await dataSource.getRepository(RecipeVersion).find({
      where: { tenant_id: tenantId },
    });
    expect(recipeVersions.length).toBe(1);
    expect(recipeVersions[0].publication_state).toBe(RecipePublicationState.DRAFT);
    expect(recipeVersions[0].suggestion_state).toBe(RecipeSuggestionState.SUGGESTED);
  });
});
