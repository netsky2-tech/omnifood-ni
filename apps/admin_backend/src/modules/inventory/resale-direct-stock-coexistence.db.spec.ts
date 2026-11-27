import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { Tenant } from '../tenant/entities/tenant.entity';
import { normalizeTenantSlug } from '../tenant/tenant-slug';
import {
  Product,
  ProductInventoryPolicy,
  ProductType,
} from './entities/product.entity';
import { Insumo, InsumoCatalogKind } from './entities/insumo.entity';
import { UomConversion } from './entities/uom-conversion.entity';
import { ProductInventoryMappingVersion } from './entities/product-inventory-mapping-version.entity';
import { Recipe } from './entities/recipe.entity';
import {
  RecipeOrigin,
  RecipePublicationState,
  RecipeSuggestionState,
  RecipeVersion,
} from './entities/recipe-version.entity';
import { RecipeDetail } from './entities/recipe-detail.entity';
import { Supplier } from './entities/supplier.entity';
import { PurchaseDocument } from './entities/purchase-document.entity';
import { Batch } from './entities/batch.entity';
import {
  InventoryMovement,
  MovementType,
} from './entities/inventory-movement.entity';
import { CatalogValue } from '../catalog/entities/catalog-value.entity';
import { ProductService } from './product.service';
import { ProductInventoryMappingService } from './services/product-inventory-mapping.service';
import { InsumoController } from './insumo.controller';
import {
  CURRENCY,
  FxRateResolver,
  InventoryPurchaseService,
} from './inventory-purchase.service';
import { CostCalculatorService } from './cost-calculator.service';
import { BomExplosionService } from './bom-explosion.service';
import { SaleInventoryOutcomeService } from '../sales/services/sale-inventory-outcome.service';
import { ChangeLogService } from '../audit/change-log.service';
import { runInTenantTransaction } from '../../core/database/tenant-transaction';
import { SyncInvoiceDto } from '../sales/dto/sync-invoice.dto';

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required for DB-backed service tests`);
  }
  return value;
}

function readPostgresPort(): number {
  const value = process.env.DB_PORT?.trim() ?? '5432';
  const port = Number(value);
  if (!Number.isInteger(port)) {
    throw new Error('DB_PORT must be a valid integer');
  }
  return port;
}

const postgresConnection = {
  host: process.env.DB_HOST?.trim() ?? '127.0.0.1',
  port: readPostgresPort(),
  username: process.env.DB_USERNAME?.trim() ?? 'postgres',
  password: getRequiredEnv('DB_PASSWORD'),
  database: process.env.DB_DATABASE?.trim() ?? 'omnifood',
};

async function withIsolatedSchema(
  schemaPrefix: string,
  assertion: (ctx: { dataSource: DataSource; schema: string }) => Promise<void>,
): Promise<void> {
  const bootstrap = new DataSource({ type: 'postgres', ...postgresConnection });
  const schema = `${schemaPrefix}_${randomUUID().replace(/-/g, '')}`;
  let dataSource: DataSource | null = null;

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
        UomConversion,
        ProductInventoryMappingVersion,
        Recipe,
        RecipeVersion,
        RecipeDetail,
        Supplier,
        PurchaseDocument,
        Batch,
        InventoryMovement,
        CatalogValue,
      ],
      synchronize: true,
    });
    await dataSource.initialize();
    await dataSource.query(`SET search_path TO "${schema}"`);

    await assertion({ dataSource, schema });
  } finally {
    if (dataSource?.isInitialized) await dataSource.destroy();
    if (bootstrap.isInitialized) {
      await bootstrap.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await bootstrap.destroy();
    }
  }
}

async function seedTenant(
  dataSource: DataSource,
  tenantId: string,
  name: string,
): Promise<void> {
  await dataSource.query(
    `INSERT INTO tenants (id, name, is_active, created_at, updated_at, slug) VALUES ($1, $2, true, now(), now(), $3)`,
    [tenantId, name, normalizeTenantSlug(name)],
  );
}

describe('Resale DIRECT_STOCK & Product-Type Coexistence — real PostgreSQL (S1-S4)', () => {
  const TEST_TIMEOUT_MS = 30000;

  it(
    'provisions resale backing insumo, keeps kitchen insumos clean, mirrors purchases, classifies mixed 5-line invoice, and preserves kardex on policy toggle',
    async () => {
      await withIsolatedSchema('resale_coexist', async ({ dataSource }) => {
        const tenantId = randomUUID();
        await seedTenant(dataSource, tenantId, 'Tenant Coexistence');

        const mappingService = new ProductInventoryMappingService(dataSource);
        const productService = new ProductService(
          dataSource,
          { log: jest.fn() } as unknown as ChangeLogService,
          mappingService,
        );
        const insumoController = new InsumoController(dataSource);
        const fxResolver: FxRateResolver = {
          resolveBcnRateByDate: jest.fn().mockResolvedValue(36.6243),
        };
        const purchaseService = new InventoryPurchaseService(
          dataSource,
          new CostCalculatorService(),
          fxResolver,
        );
        const bomExplosionService = new BomExplosionService();
        const outcomeService = new SaleInventoryOutcomeService(
          bomExplosionService,
        );

        // 1. Provision all 5 product types + raw materials + supplier
        const sohoProduct = await productService.create(tenantId, {
          name: 'Servicio de Empaque',
          uom: 'un',
          product_type: ProductType.SIMPLE,
          sellPrice: 10,
        });
        expect(sohoProduct.inventory_policy).toBe(
          ProductInventoryPolicy.NOT_TRACKED,
        );

        const resaleProduct = await productService.create(tenantId, {
          name: 'Coca-Cola 600ml',
          uom: 'botella',
          product_type: ProductType.SIMPLE,
          inventory_policy: ProductInventoryPolicy.DIRECT_STOCK,
          sellPrice: 35,
        });
        expect(resaleProduct.inventory_policy).toBe(
          ProductInventoryPolicy.DIRECT_STOCK,
        );

        const rawCoffee = await insumoController.create(
          {
            name: 'Café Molido',
            purchaseUom: 'LB',
            consumptionUom: 'G',
            conversionFactor: 453.59237,
            averageCost: 0.5,
          },
          tenantId,
        );

        const rawSugar = await insumoController.create(
          {
            name: 'Azúcar Refinada',
            purchaseUom: 'LB',
            consumptionUom: 'G',
            conversionFactor: 453.59237,
            averageCost: 0.1,
          },
          tenantId,
        );

        const directRecipeProduct = await productService.create(tenantId, {
          name: 'Café Americano',
          uom: 'taza',
          product_type: ProductType.COMPOUND,
          sellPrice: 50,
        });

        const subRecipeProduct = await productService.create(tenantId, {
          name: 'Jarabe Base',
          uom: 'ml',
          product_type: ProductType.COMPOUND,
          sellPrice: 0,
        });

        const nestedRecipeProduct = await productService.create(tenantId, {
          name: 'Café Vainilla Especial',
          uom: 'taza',
          product_type: ProductType.COMPOUND,
          sellPrice: 75,
        });

        const pendingRecipeProduct = await productService.create(tenantId, {
          name: 'Plato del Día (Sin Receta)',
          uom: 'plato',
          product_type: ProductType.COMPOUND,
          sellPrice: 120,
        });

        const now = new Date();
        const effectiveAt = new Date(now.getTime() - 60_000);

        let directRv!: RecipeVersion;
        let subRv!: RecipeVersion;
        let nestedRv!: RecipeVersion;

        await runInTenantTransaction(dataSource, tenantId, async (manager) => {
          const rvRepo = manager.getRepository(RecipeVersion);
          const rdRepo = manager.getRepository(RecipeDetail);

          directRv = await rvRepo.save(
            rvRepo.create({
              tenant_id: tenantId,
              product_id: directRecipeProduct.id,
              product_name: directRecipeProduct.name,
              version_number: 1,
              is_active: true,
              publication_state: RecipePublicationState.PUBLISHED,
              fecha_inicio_vigencia: effectiveAt,
              yield_quantity: 1,
              technical_shrink_pct: 0,
              origin: RecipeOrigin.MANUAL,
              suggestion_state: RecipeSuggestionState.CONFIRMED,
            }),
          );
          await rdRepo.save(
            rdRepo.create({
              tenant_id: tenantId,
              recipe_version_id: directRv.id,
              insumo_id: rawCoffee.id,
              ingredient_type: 'INSUMO',
              ingredient_name: rawCoffee.name,
              component_uom: 'G',
              quantity: 18,
              gross_quantity: 18,
              technical_shrink_pct: 0,
            }),
          );

          subRv = await rvRepo.save(
            rvRepo.create({
              tenant_id: tenantId,
              product_id: subRecipeProduct.id,
              product_name: subRecipeProduct.name,
              version_number: 1,
              is_active: true,
              publication_state: RecipePublicationState.PUBLISHED,
              fecha_inicio_vigencia: effectiveAt,
              yield_quantity: 100,
              technical_shrink_pct: 0,
              origin: RecipeOrigin.MANUAL,
              suggestion_state: RecipeSuggestionState.CONFIRMED,
            }),
          );
          await rdRepo.save(
            rdRepo.create({
              tenant_id: tenantId,
              recipe_version_id: subRv.id,
              insumo_id: rawSugar.id,
              ingredient_type: 'INSUMO',
              ingredient_name: rawSugar.name,
              component_uom: 'G',
              quantity: 50,
              gross_quantity: 50,
              technical_shrink_pct: 0,
            }),
          );

          nestedRv = await rvRepo.save(
            rvRepo.create({
              tenant_id: tenantId,
              product_id: nestedRecipeProduct.id,
              product_name: nestedRecipeProduct.name,
              version_number: 1,
              is_active: true,
              publication_state: RecipePublicationState.PUBLISHED,
              fecha_inicio_vigencia: effectiveAt,
              yield_quantity: 1,
              technical_shrink_pct: 0,
              origin: RecipeOrigin.MANUAL,
              suggestion_state: RecipeSuggestionState.CONFIRMED,
            }),
          );
          await rdRepo.save(
            rdRepo.create({
              tenant_id: tenantId,
              recipe_version_id: nestedRv.id,
              insumo_id: rawCoffee.id,
              ingredient_type: 'INSUMO',
              ingredient_name: rawCoffee.name,
              component_uom: 'G',
              quantity: 18,
              gross_quantity: 18,
              technical_shrink_pct: 0,
            }),
          );
          await rdRepo.save(
            rdRepo.create({
              tenant_id: tenantId,
              recipe_version_id: nestedRv.id,
              insumo_id: subRecipeProduct.id,
              ingredient_type: 'SUB_RECIPE',
              ingredient_name: subRecipeProduct.name,
              component_uom: 'ml',
              quantity: 20,
              gross_quantity: 20,
              technical_shrink_pct: 0,
              reference_version_id: subRv.id,
            }),
          );
        });

        // 2. Verify GET /insumos default filter excludes PRODUCT_RESALE
        const kitchenInsumos = await insumoController.list(
          undefined,
          undefined,
          undefined,
          tenantId,
        );
        expect(kitchenInsumos.map((i) => i.name).sort()).toEqual([
          'Azúcar Refinada',
          'Café Molido',
        ]);

        const resaleInsumos = await insumoController.list(
          undefined,
          'PRODUCT_RESALE',
          undefined,
          tenantId,
        );
        expect(resaleInsumos).toHaveLength(1);
        expect(resaleInsumos[0].managedProductId).toBe(resaleProduct.id);
        expect(resaleInsumos[0].catalogKind).toBe(
          InsumoCatalogKind.PRODUCT_RESALE,
        );
        const backingInsumoId = resaleInsumos[0].id;

        const allInsumos = await insumoController.list(
          undefined,
          'ALL',
          undefined,
          tenantId,
        );
        expect(allInsumos).toHaveLength(3);

        // 3. Purchase on backing resale insumo updates insumos AND mirrors to products
        const supplierId = randomUUID();
        await runInTenantTransaction(dataSource, tenantId, async (manager) => {
          const supRepo = manager.getRepository(Supplier);
          await supRepo.save(
            supRepo.create({
              id: supplierId,
              tenant_id: tenantId,
              name: 'Distribuidora Bebidas SA',
              is_active: true,
            }),
          );
        });

        await purchaseService.recordPurchase({
          id: randomUUID(),
          tenantId,
          insumoId: backingInsumoId,
          supplierId,
          invoiceNumber: 'FAC-RESALE-001',
          quantity: 24,
          unitCost: 18.5,
          currency: CURRENCY.NIO,
          invoiceDate: '2026-10-01',
          entryTimestamp: '2026-10-01T10:00:00Z',
        });

        const refreshedProduct = await productService.findOne(
          resaleProduct.id,
          tenantId,
        );
        expect(Number(refreshedProduct.stock)).toBe(24);
        expect(Number(refreshedProduct.averageCost)).toBe(18.5);

        // 4. Verify SaleInventoryOutcomeService classifies all 5 lines in one mixed invoice
        const activeResaleMapping = await mappingService.findEffective(
          tenantId,
          resaleProduct.id,
          now,
        );
        expect(activeResaleMapping).not.toBeNull();
        if (!activeResaleMapping) {
          throw new Error('Expected active resale mapping');
        }

        const appliedMixedInvoice: SyncInvoiceDto = {
          id: randomUUID(),
          number: '001-001-01-00000098',
          subtotal: 170,
          totalTax: 25.5,
          total: 195.5,
          isCanceled: false,
          paymentStatus: 'PAID',
          payments: [],
          userId: randomUUID(),
          createdAt: now.toISOString(),
          items: [
            {
              id: 'item-soho',
              productId: sohoProduct.id,
              productName: sohoProduct.name,
              quantity: 1,
              unitPrice: 10,
              originalTaxRate: 0.15,
              appliedTaxRate: 0.15,
              taxAmount: 1.5,
              total: 11.5,
              discount: 0,
              inventorySnapshotVersion: 'SALE_TIME_V1',
              inventorySnapshot: {
                classification: 'SIMPLE',
                disposition: 'NO_IMPACT',
                reasonCode: 'NO_EXPLICIT_INSUMO_MAPPING',
                catalogRevision: 'rev-1',
                bindings: [],
              },
            },
            {
              id: 'item-resale',
              productId: resaleProduct.id,
              productName: resaleProduct.name,
              quantity: 2,
              unitPrice: 35,
              originalTaxRate: 0.15,
              appliedTaxRate: 0.15,
              taxAmount: 10.5,
              total: 80.5,
              discount: 0,
              inventorySnapshotVersion: 'SALE_TIME_V1',
              inventorySnapshot: {
                classification: 'SIMPLE',
                disposition: 'DIRECT',
                catalogRevision: 'rev-1',
                mappingVersionId: activeResaleMapping.id,
                bindings: [
                  {
                    bindingOrdinal: 0,
                    saleCorrelationId: 'corr-resale-1',
                    insumoId: backingInsumoId,
                    quantityPerSaleUnit: 1,
                  },
                ],
              },
            },
            {
              id: 'item-direct-recipe',
              productId: directRecipeProduct.id,
              productName: directRecipeProduct.name,
              quantity: 1,
              unitPrice: 50,
              originalTaxRate: 0.15,
              appliedTaxRate: 0.15,
              taxAmount: 7.5,
              total: 57.5,
              discount: 0,
              inventorySnapshotVersion: 'SALE_TIME_V1',
              inventorySnapshot: {
                classification: 'COMPOUND',
                disposition: 'RECIPE',
                catalogRevision: 'rev-1',
                recipeVersionId: directRv.id,
                bindings: [
                  {
                    bindingOrdinal: 0,
                    saleCorrelationId: 'corr-direct-1',
                    insumoId: rawCoffee.id,
                    quantityPerSaleUnit: 18,
                  },
                ],
              },
            },
            {
              id: 'item-nested-recipe',
              productId: nestedRecipeProduct.id,
              productName: nestedRecipeProduct.name,
              quantity: 1,
              unitPrice: 75,
              originalTaxRate: 0.15,
              appliedTaxRate: 0.15,
              taxAmount: 11.25,
              total: 86.25,
              discount: 0,
              inventorySnapshotVersion: 'SALE_TIME_V1',
              inventorySnapshot: {
                classification: 'COMPOUND',
                disposition: 'RECIPE',
                catalogRevision: 'rev-1',
                recipeVersionId: nestedRv.id,
                bindings: [
                  {
                    bindingOrdinal: 0,
                    saleCorrelationId: 'corr-nested-coffee',
                    insumoId: rawCoffee.id,
                    quantityPerSaleUnit: 18,
                  },
                  {
                    bindingOrdinal: 1,
                    saleCorrelationId: 'corr-nested-sugar',
                    insumoId: rawSugar.id,
                    quantityPerSaleUnit: 10,
                  },
                ],
              },
            },
          ],
        };

        const appliedOutcome = await runInTenantTransaction(
          dataSource,
          tenantId,
          (manager) =>
            outcomeService.validateSaleTimeSnapshot(
              tenantId,
              appliedMixedInvoice,
              manager,
            ),
        );
        expect(appliedOutcome).not.toBeNull();
        if (!appliedOutcome) {
          throw new Error('Expected appliedOutcome');
        }
        expect(appliedOutcome.policyVersion).toBe('SALE_TIME_V1');
        expect(appliedOutcome.outcome).toBe('APPLIED');
        expect(appliedOutcome.bindingsToApply).toHaveLength(4);
        expect(appliedOutcome.acknowledgedMovementCorrelationIds).toEqual([
          'corr-resale-1',
          'corr-direct-1',
          'corr-nested-coffee',
          'corr-nested-sugar',
        ]);

        const mixedWithPendingInvoice: SyncInvoiceDto = {
          ...appliedMixedInvoice,
          id: randomUUID(),
          number: '001-001-01-00000099',
          items: [
            ...(appliedMixedInvoice.items ?? []),
            {
              id: 'item-pending-recipe',
              productId: pendingRecipeProduct.id,
              productName: pendingRecipeProduct.name,
              quantity: 1,
              unitPrice: 120,
              originalTaxRate: 0.15,
              appliedTaxRate: 0.15,
              taxAmount: 18,
              total: 138,
              discount: 0,
              inventorySnapshotVersion: 'SALE_TIME_V1',
              inventorySnapshot: {
                classification: 'COMPOUND',
                disposition: 'PENDING_RECIPE',
                reasonCode: 'MISSING_PUBLISHED_RECIPE',
                catalogRevision: 'rev-1',
                bindings: [],
              },
            },
          ],
        };

        const pendingOutcome = await runInTenantTransaction(
          dataSource,
          tenantId,
          (manager) =>
            outcomeService.validateSaleTimeSnapshot(
              tenantId,
              mixedWithPendingInvoice,
              manager,
            ),
        );
        expect(pendingOutcome).not.toBeNull();
        if (!pendingOutcome) {
          throw new Error('Expected pendingOutcome');
        }
        expect(pendingOutcome.policyVersion).toBe('SALE_TIME_V1');
        expect(pendingOutcome.outcome).toBe('APPLIED_INVENTORY_PENDING');
        expect(pendingOutcome.reason).toEqual({
          code: 'MISSING_PUBLISHED_RECIPE',
          lines: ['item-pending-recipe'],
        });

        // 5. Switch DIRECT_STOCK -> NOT_TRACKED: supersedes mapping, preserves kardex, and re-enabling reuses backing insumo
        await productService.update(resaleProduct.id, tenantId, {
          inventory_policy: ProductInventoryPolicy.NOT_TRACKED,
        });

        const afterDisableMapping = await mappingService.findEffective(
          tenantId,
          resaleProduct.id,
          new Date(),
        );
        expect(afterDisableMapping).toBeNull();

        await runInTenantTransaction(dataSource, tenantId, async (manager) => {
          const movements = await manager
            .getRepository(InventoryMovement)
            .find({
              where: { tenant_id: tenantId, insumoId: backingInsumoId },
            });
          expect(movements).toHaveLength(1);
          expect(movements[0].type).toBe(MovementType.ENTRADA_COMPRA);
        });

        await productService.update(resaleProduct.id, tenantId, {
          inventory_policy: ProductInventoryPolicy.DIRECT_STOCK,
        });

        const resaleInsumosAfterReenable = await insumoController.list(
          undefined,
          'PRODUCT_RESALE',
          undefined,
          tenantId,
        );
        expect(resaleInsumosAfterReenable).toHaveLength(1);
        expect(resaleInsumosAfterReenable[0].id).toBe(backingInsumoId);
        expect(resaleInsumosAfterReenable[0].stock).toBe(24);

        const reenabledProduct = await productService.findOne(
          resaleProduct.id,
          tenantId,
        );
        expect(Number(reenabledProduct.stock)).toBe(24);
        expect(Number(reenabledProduct.averageCost)).toBe(18.5);
      });
    },
    TEST_TIMEOUT_MS,
  );
});
