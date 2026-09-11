import { randomUUID } from 'crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { Tenant } from '../../src/modules/tenant/entities/tenant.entity';
import {
  Product,
  ProductType,
} from '../../src/modules/inventory/entities/product.entity';
import { Insumo } from '../../src/modules/inventory/entities/insumo.entity';
import { RecipeVersion } from '../../src/modules/inventory/entities/recipe-version.entity';
import { RecipeDetail } from '../../src/modules/inventory/entities/recipe-detail.entity';
import { UomConversion } from '../../src/modules/inventory/entities/uom-conversion.entity';
import { RecipeService } from '../../src/modules/inventory/recipe.service';
import { ProductService } from '../../src/modules/inventory/product.service';
import { ChangeLogService } from '../../src/modules/audit/change-log.service';
import { RecipeController } from '../../src/modules/inventory/recipe.controller';
import { AuthGuard } from '../../src/modules/identity/guards/auth.guard';
import { AuthoritativeCurrentUserGuard } from '../../src/modules/identity/guards/authoritative-current-user.guard';
import { RolesGuard } from '../../src/modules/identity/guards/roles.guard';
import { CurrentUserAuthorizationService } from '../../src/modules/identity/services/current-user-authorization.service';
import { UserRole } from '../../src/modules/identity/entities/user.entity';
import {
  createIdentityJwtConfigProvider,
  createIdentityJwtTestConfigProvider,
  signIdentityJwtAccessToken,
} from '../support/identity-jwt-test.fixture';

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

async function withIsolatedSchema(
  schemaPrefix: string,
  assertion: (ctx: {
    app: INestApplication;
    dataSource: DataSource;
    jwtService: JwtService;
    tenantId: string;
    recipeService: RecipeService;
    productService: ProductService;
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
        Product,
        Insumo,
        RecipeVersion,
        RecipeDetail,
        UomConversion,
      ],
      synchronize: true,
    });
    await dataSource.initialize();
    await dataSource.query(`SET search_path TO "${schema}"`);

    const tenantId = randomUUID();
    await dataSource.query(
      `INSERT INTO tenants (id, name, is_active, created_at, updated_at) VALUES ($1, $2, true, now(), now())`,
      [tenantId, `E2E Tenant ${schemaPrefix}`],
    );

    const recipeService = new RecipeService(
      dataSource.getRepository(RecipeVersion),
      dataSource.getRepository(RecipeDetail),
      dataSource.getRepository(Insumo),
      dataSource.getRepository(Product),
      dataSource.getRepository(UomConversion),
      new (
        await import('../../src/modules/inventory/uom-conversion-calculator')
      ).UomConversionCalculator(),
      dataSource,
    );

    const productService = new ProductService(dataSource, {
      log: jest.fn(),
    } as unknown as ChangeLogService);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [RecipeController],
      providers: [
        Reflector,
        AuthGuard,
        AuthoritativeCurrentUserGuard,
        RolesGuard,
        {
          provide: CurrentUserAuthorizationService,
          useValue: { authorize: jest.fn((token: unknown) => token) },
        },
        { provide: RecipeService, useValue: recipeService },
        { provide: ProductService, useValue: productService },
        JwtService,
        createIdentityJwtTestConfigProvider(),
        createIdentityJwtConfigProvider(),
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true }),
    );
    await app.init();

    const jwtService = app.get(JwtService);

    await assertion({
      app,
      dataSource,
      jwtService,
      tenantId,
      recipeService,
      productService,
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

describe('RecipeController E2E — real PostgreSQL', () => {
  const TEST_TIMEOUT_MS = 30000;

  const signToken = (
    jwtService: JwtService,
    overrides: Partial<{
      sub: string;
      email: string;
      role: UserRole;
      tenant_id: string;
    }> = {},
  ): string =>
    signIdentityJwtAccessToken(jwtService, {
      sub: 'user-1',
      email: 'manager@example.com',
      role: UserRole.MANAGER,
      tenant_id: 'tenant-A',
      ...overrides,
    });

  describe('POST /recipes/products/:productId/versions', () => {
    it(
      'creates a recipe version for a COMPOUND product with insumo components',
      async () => {
        await withIsolatedSchema(
          'e2e_recipe_create',
          async ({ app, dataSource, jwtService, tenantId, productService }) => {
            const token = signToken(jwtService, {
              role: UserRole.OWNER,
              tenant_id: tenantId,
            });

            // Create a COMPOUND product
            const productId = (
              await productService.create(
                tenantId,
                {
                  name: 'Gallopinto',
                  uom: 'un',
                  product_type: ProductType.COMPOUND,
                  sellPrice: 50,
                  category_code: 'PLATO_FUERTE',
                },
                { userId: 'user-1', userEmail: 'owner@example.com' },
              )
            ).id;

            // Create insumos
            const arrozId = randomUUID();
            await dataSource.query(
              `INSERT INTO insumos (id, tenant_id, name, "consumptionUom", "purchaseUom", "conversionFactor", stock, costo_promedio_nio, is_active, created_at, updated_at)
             VALUES ($1, $2, 'Arroz', 'kg', 'kg', 1, 100, 15, true, now(), now())`,
              [arrozId, tenantId],
            );

            const frijolId = randomUUID();
            await dataSource.query(
              `INSERT INTO insumos (id, tenant_id, name, "consumptionUom", "purchaseUom", "conversionFactor", stock, costo_promedio_nio, is_active, created_at, updated_at)
             VALUES ($1, $2, 'Frijol', 'kg', 'kg', 1, 50, 20, true, now(), now())`,
              [frijolId, tenantId],
            );

            const res = await request(app.getHttpServer())
              .post(`/recipes/products/${productId}/versions`)
              .set('Authorization', `Bearer ${token}`)
              .send({
                productId,
                productName: 'Gallopinto',
                versionNumber: 1,
                yieldQuantity: 10,
                technicalShrinkPct: 5,
                versionNote: 'Receta original',
                effectiveAt: new Date().toISOString(),
                components: [
                  {
                    ingredientId: arrozId,
                    ingredientName: 'Arroz',
                    ingredientType: 'INSUMO',
                    grossQuantity: 5,
                    technicalShrinkPct: 2,
                    componentUom: 'kg',
                  },
                  {
                    ingredientId: frijolId,
                    ingredientName: 'Frijol',
                    ingredientType: 'INSUMO',
                    grossQuantity: 3,
                    technicalShrinkPct: 3,
                    componentUom: 'kg',
                  },
                ],
              })
              .expect(201);

            expect(res.body.recipeVersion).toBeDefined();
            expect(res.body.recipeVersion.id).toBeDefined();
            expect(res.body.recipeVersion.product_id).toBe(productId);
            expect(res.body.recipeVersion.version_number).toBe(1);
            expect(res.body.recipeVersion.is_active).toBe(true);
            expect(res.body.recipeVersion.yield_quantity).toBe(10);
            expect(res.body.recipeVersion.technical_shrink_pct).toBe(5);
            expect(res.body.recipeVersion.version_note).toBe('Receta original');
            expect(res.body.components).toHaveLength(2);
            expect(res.body.components).toEqual(
              expect.arrayContaining([
                expect.objectContaining({
                  insumo_id: arrozId,
                  gross_quantity: 5,
                }),
                expect.objectContaining({
                  insumo_id: frijolId,
                  gross_quantity: 3,
                }),
              ]),
            );
          },
        );
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'returns 400 for missing required fields',
      async () => {
        await withIsolatedSchema(
          'e2e_recipe_create_400',
          async ({ app, jwtService, tenantId }) => {
            const token = signToken(jwtService, {
              role: UserRole.OWNER,
              tenant_id: tenantId,
            });

            await request(app.getHttpServer())
              .post(`/recipes/products/${randomUUID()}/versions`)
              .set('Authorization', `Bearer ${token}`)
              .send({ productName: 'Test' })
              .expect(400);
          },
        );
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'returns 400 when productId in body does not match URL parameter',
      async () => {
        await withIsolatedSchema(
          'e2e_recipe_create_mismatch',
          async ({ app, jwtService, tenantId }) => {
            const token = signToken(jwtService, {
              role: UserRole.OWNER,
              tenant_id: tenantId,
            });

            const productId = randomUUID();
            await request(app.getHttpServer())
              .post(`/recipes/products/${productId}/versions`)
              .set('Authorization', `Bearer ${token}`)
              .send({
                productId: randomUUID(), // Different ID
                productName: 'Test',
                versionNumber: 1,
                yieldQuantity: 10,
                technicalShrinkPct: 0,
                components: [],
              })
              .expect(400);
          },
        );
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'returns 403 for CASHIER role',
      async () => {
        await withIsolatedSchema(
          'e2e_recipe_create_403',
          async ({ app, jwtService, tenantId }) => {
            const token = signToken(jwtService, {
              role: UserRole.CASHIER,
              tenant_id: tenantId,
            });

            await request(app.getHttpServer())
              .post(`/recipes/products/${randomUUID()}/versions`)
              .set('Authorization', `Bearer ${token}`)
              .send({
                productId: randomUUID(),
                productName: 'Test',
                versionNumber: 1,
                yieldQuantity: 10,
                technicalShrinkPct: 0,
                components: [],
              })
              .expect(403);
          },
        );
      },
      TEST_TIMEOUT_MS,
    );
  });

  describe('GET /recipes/products/:productId/active', () => {
    it(
      'returns active recipe version for a product',
      async () => {
        await withIsolatedSchema(
          'e2e_recipe_get_active',
          async ({ app, dataSource, jwtService, tenantId, productService }) => {
            const token = signToken(jwtService, {
              role: UserRole.MANAGER,
              tenant_id: tenantId,
            });

            // Create a COMPOUND product
            const productId = (
              await productService.create(
                tenantId,
                {
                  name: 'Gallopinto',
                  uom: 'un',
                  product_type: ProductType.COMPOUND,
                  sellPrice: 50,
                },
                { userId: 'user-1', userEmail: 'owner@example.com' },
              )
            ).id;

            // Create insumo
            const arrozId = randomUUID();
            await dataSource.query(
              `INSERT INTO insumos (id, tenant_id, name, "consumptionUom", "purchaseUom", "conversionFactor", stock, costo_promedio_nio, is_active, created_at, updated_at)
             VALUES ($1, $2, 'Arroz', 'kg', 'kg', 1, 100, 15, true, now(), now())`,
              [arrozId, tenantId],
            );

            // We'll create it via the controller
            const createToken = signToken(jwtService, {
              role: UserRole.OWNER,
              tenant_id: tenantId,
            });

            const createRes = await request(app.getHttpServer())
              .post(`/recipes/products/${productId}/versions`)
              .set('Authorization', `Bearer ${createToken}`)
              .send({
                productId,
                productName: 'Gallopinto',
                versionNumber: 1,
                yieldQuantity: 10,
                technicalShrinkPct: 5,
                versionNote: 'Receta original',
                components: [
                  {
                    ingredientId: arrozId,
                    ingredientName: 'Arroz',
                    ingredientType: 'INSUMO',
                    grossQuantity: 5,
                    technicalShrinkPct: 2,
                    componentUom: 'kg',
                  },
                ],
              })
              .expect(201);

            // Now get the active recipe
            const res = await request(app.getHttpServer())
              .get(`/recipes/products/${productId}/active`)
              .set('Authorization', `Bearer ${token}`)
              .expect(200);

            expect(res.body.recipeVersion).toBeDefined();
            expect(res.body.recipeVersion.id).toBe(
              createRes.body.recipeVersion.id,
            );
            expect(res.body.recipeVersion.product_id).toBe(productId);
            expect(res.body.recipeVersion.version_number).toBe(1);
            expect(res.body.recipeVersion.is_active).toBe(true);
            expect(res.body.components).toHaveLength(1);
            expect(res.body.components[0].insumo_id).toBe(arrozId);
          },
        );
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'returns empty recipe when no active version exists',
      async () => {
        await withIsolatedSchema(
          'e2e_recipe_get_active_empty',
          async ({ app, jwtService, tenantId, productService }) => {
            const token = signToken(jwtService, {
              role: UserRole.MANAGER,
              tenant_id: tenantId,
            });

            const productId = (
              await productService.create(
                tenantId,
                {
                  name: 'Gallopinto',
                  uom: 'un',
                  product_type: ProductType.COMPOUND,
                  sellPrice: 50,
                },
                { userId: 'user-1', userEmail: 'owner@example.com' },
              )
            ).id;

            const res = await request(app.getHttpServer())
              .get(`/recipes/products/${productId}/active`)
              .set('Authorization', `Bearer ${token}`)
              .expect(200);

            expect(res.body.recipeVersion).toBeDefined();
            expect(res.body.recipeVersion.id).toBe('');
            expect(res.body.recipeVersion.version_number).toBe(0);
            expect(res.body.recipeVersion.is_active).toBe(false);
            expect(res.body.components).toHaveLength(0);
          },
        );
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'returns 401 without token',
      async () => {
        await withIsolatedSchema(
          'e2e_recipe_get_active_401',
          async ({ app }) => {
            await request(app.getHttpServer())
              .get(`/recipes/products/${randomUUID()}/active`)
              .expect(401);
          },
        );
      },
      TEST_TIMEOUT_MS,
    );
  });

  describe('GET /recipes/:recipeVersionId/snapshot', () => {
    it(
      'returns recipe version snapshot with components',
      async () => {
        await withIsolatedSchema(
          'e2e_recipe_snapshot',
          async ({ app, dataSource, jwtService, tenantId, productService }) => {
            const token = signToken(jwtService, {
              role: UserRole.MANAGER,
              tenant_id: tenantId,
            });

            const productId = (
              await productService.create(
                tenantId,
                {
                  name: 'Gallopinto',
                  uom: 'un',
                  product_type: ProductType.COMPOUND,
                  sellPrice: 50,
                },
                { userId: 'user-1', userEmail: 'owner@example.com' },
              )
            ).id;

            const arrozId = randomUUID();
            await dataSource.query(
              `INSERT INTO insumos (id, tenant_id, name, "consumptionUom", "purchaseUom", "conversionFactor", stock, costo_promedio_nio, is_active, created_at, updated_at)
             VALUES ($1, $2, 'Arroz', 'kg', 'kg', 1, 100, 15, true, now(), now())`,
              [arrozId, tenantId],
            );

            const createToken = signToken(jwtService, {
              role: UserRole.OWNER,
              tenant_id: tenantId,
            });

            const createRes = await request(app.getHttpServer())
              .post(`/recipes/products/${productId}/versions`)
              .set('Authorization', `Bearer ${createToken}`)
              .send({
                productId,
                productName: 'Gallopinto',
                versionNumber: 1,
                yieldQuantity: 10,
                technicalShrinkPct: 5,
                versionNote: 'Receta original',
                components: [
                  {
                    ingredientId: arrozId,
                    ingredientName: 'Arroz',
                    ingredientType: 'INSUMO',
                    grossQuantity: 5,
                    technicalShrinkPct: 2,
                    componentUom: 'kg',
                  },
                ],
              })
              .expect(201);

            const recipeVersionId = createRes.body.recipeVersion.id;

            const res = await request(app.getHttpServer())
              .get(`/recipes/${recipeVersionId}/snapshot`)
              .set('Authorization', `Bearer ${token}`)
              .expect(200);

            expect(res.body.recipeVersion.id).toBe(recipeVersionId);
            expect(res.body.recipeVersion.product_id).toBe(productId);
            expect(res.body.components).toHaveLength(1);
            expect(res.body.components[0].insumo_id).toBe(arrozId);
          },
        );
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'returns 404 for nonexistent recipe version',
      async () => {
        await withIsolatedSchema(
          'e2e_recipe_snapshot_404',
          async ({ app, jwtService, tenantId }) => {
            const token = signToken(jwtService, {
              role: UserRole.MANAGER,
              tenant_id: tenantId,
            });

            await request(app.getHttpServer())
              .get(`/recipes/${randomUUID()}/snapshot`)
              .set('Authorization', `Bearer ${token}`)
              .expect(404);
          },
        );
      },
      TEST_TIMEOUT_MS,
    );
  });

  describe('Tenant isolation', () => {
    it(
      'tenant A cannot see tenant B recipes via HTTP',
      async () => {
        await withIsolatedSchema(
          'e2e_recipe_tenant_isolation',
          async ({ app, dataSource, jwtService, tenantId }) => {
            const otherTenantId = randomUUID();
            await dataSource.query(
              `INSERT INTO tenants (id, name, is_active, created_at, updated_at) VALUES ($1, $2, true, now(), now())`,
              [otherTenantId, 'Other Tenant'],
            );

            const tokenA = signToken(jwtService, {
              role: UserRole.OWNER,
              tenant_id: tenantId,
            });

            // Create product and recipe for other tenant directly in DB
            const otherProductId = randomUUID();
            await dataSource.query(
              `INSERT INTO products (id, tenant_id, name, uom, product_type, stock, "averageCost", "sellPrice", is_active, is_perishable, created_at, updated_at)
             VALUES ($1, $2, 'Other Product', 'un', 'COMPOUND', 0, 0, 10, true, false, now(), now())`,
              [otherProductId, otherTenantId],
            );

            const otherRecipeVersionId = randomUUID();
            await dataSource.query(
              `INSERT INTO recipe_versions (id, tenant_id, product_id, version_number, is_active, "yield_quantity", "technical_shrink_pct", "fecha_inicio_vigencia", created_at)
             VALUES ($1, $2, $3, 1, true, 10, 0, now(), now())`,
              [otherRecipeVersionId, otherTenantId, otherProductId],
            );

            const otherInsumoId = randomUUID();
            await dataSource.query(
              `INSERT INTO insumos (id, tenant_id, name, "consumptionUom", "purchaseUom", "conversionFactor", stock, costo_promedio_nio, is_active, created_at, updated_at)
             VALUES ($1, $2, 'Other Insumo', 'kg', 'kg', 1, 100, 15, true, now(), now())`,
              [otherInsumoId, otherTenantId],
            );

            await dataSource.query(
              `INSERT INTO recipe_details (id, tenant_id, recipe_version_id, insumo_id, quantity, gross_quantity, "technical_shrink_pct", ingredient_name, ingredient_type, component_uom, reference_version_id)
             VALUES ($1, $2, $3, $4, 1, 5, 0, 'Other Insumo', 'INSUMO', 'kg', null)`,
              [
                randomUUID(),
                otherTenantId,
                otherRecipeVersionId,
                otherInsumoId,
              ],
            );

            // Tenant A should see empty recipe
            const res = await request(app.getHttpServer())
              .get(`/recipes/products/${otherProductId}/active`)
              .set('Authorization', `Bearer ${tokenA}`)
              .expect(200);

            expect(res.body.recipeVersion.version_number).toBe(0);
            expect(res.body.components).toHaveLength(0);
          },
        );
      },
      TEST_TIMEOUT_MS,
    );
  });

  describe('Version management', () => {
    it(
      'deactivates previous version when creating new one',
      async () => {
        await withIsolatedSchema(
          'e2e_recipe_versioning',
          async ({ app, dataSource, jwtService, tenantId, productService }) => {
            const token = signToken(jwtService, {
              role: UserRole.OWNER,
              tenant_id: tenantId,
            });

            const productId = (
              await productService.create(
                tenantId,
                {
                  name: 'Gallopinto',
                  uom: 'un',
                  product_type: ProductType.COMPOUND,
                  sellPrice: 50,
                },
                { userId: 'user-1', userEmail: 'owner@example.com' },
              )
            ).id;

            const arrozId = randomUUID();
            await dataSource.query(
              `INSERT INTO insumos (id, tenant_id, name, "consumptionUom", "purchaseUom", "conversionFactor", stock, costo_promedio_nio, is_active, created_at, updated_at)
             VALUES ($1, $2, 'Arroz', 'kg', 'kg', 1, 100, 15, true, now(), now())`,
              [arrozId, tenantId],
            );

            // Create version 1
            const v1Res = await request(app.getHttpServer())
              .post(`/recipes/products/${productId}/versions`)
              .set('Authorization', `Bearer ${token}`)
              .send({
                productId,
                productName: 'Gallopinto',
                versionNumber: 1,
                yieldQuantity: 10,
                technicalShrinkPct: 5,
                versionNote: 'Version 1',
                components: [
                  {
                    ingredientId: arrozId,
                    ingredientName: 'Arroz',
                    ingredientType: 'INSUMO',
                    grossQuantity: 5,
                    technicalShrinkPct: 2,
                    componentUom: 'kg',
                  },
                ],
              })
              .expect(201);

            expect(v1Res.body.recipeVersion.version_number).toBe(1);
            expect(v1Res.body.recipeVersion.is_active).toBe(true);

            // Create version 2
            const v2Res = await request(app.getHttpServer())
              .post(`/recipes/products/${productId}/versions`)
              .set('Authorization', `Bearer ${token}`)
              .send({
                productId,
                productName: 'Gallopinto',
                versionNumber: 2,
                yieldQuantity: 10,
                technicalShrinkPct: 5,
                versionNote: 'Version 2 - mejorada',
                components: [
                  {
                    ingredientId: arrozId,
                    ingredientName: 'Arroz',
                    ingredientType: 'INSUMO',
                    grossQuantity: 4.5,
                    technicalShrinkPct: 1.5,
                    componentUom: 'kg',
                  },
                ],
              })
              .expect(201);

            expect(v2Res.body.recipeVersion.version_number).toBe(2);
            expect(v2Res.body.recipeVersion.is_active).toBe(true);
            expect(v2Res.body.recipeVersion.version_note).toBe(
              'Version 2 - mejorada',
            );

            // Verify version 1 is no longer active
            const activeRes = await request(app.getHttpServer())
              .get(`/recipes/products/${productId}/active`)
              .set('Authorization', `Bearer ${token}`)
              .expect(200);

            expect(activeRes.body.recipeVersion.version_number).toBe(2);
            expect(activeRes.body.recipeVersion.id).toBe(
              v2Res.body.recipeVersion.id,
            );
          },
        );
      },
      TEST_TIMEOUT_MS,
    );
  });
});
