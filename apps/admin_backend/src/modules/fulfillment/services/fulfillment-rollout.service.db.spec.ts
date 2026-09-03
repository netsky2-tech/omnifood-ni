import { DataSource, QueryRunner } from 'typeorm';
import { randomUUID } from 'crypto';
import { Product } from '../../inventory/entities/product.entity';
import { Insumo } from '../../inventory/entities/insumo.entity';
import { UomConversion } from '../../inventory/entities/uom-conversion.entity';
import { Recipe } from '../../inventory/entities/recipe.entity';
import { Tenant } from '../../tenant/entities/tenant.entity';
import { TenantTopologyRevision } from '../entities/tenant-topology-revision.entity';
import { TenantFulfillmentRecord } from '../entities/tenant-fulfillment-record.entity';
import { CreateTenantTopologyRevisions1794000000000 } from '../../../migrations/1794000000000-CreateTenantTopologyRevisions';
import { AddTenantTopologyRevisionsRls1794000000001 } from '../../../migrations/1794000000001-AddTenantTopologyRevisionsRls';
import { CreateTenantFulfillmentRecords1795000000000 } from '../../../migrations/1795000000000-CreateTenantFulfillmentRecords';
import {
  FulfillmentRolloutService,
  DiscrepancyType,
} from './fulfillment-rollout.service';

const TEST_TIMEOUT_MS = 60000;

async function withIsolatedRolloutSchema(
  schemaName: string,
  assertion: (context: {
    dataSource: DataSource;
    queryRunner: QueryRunner;
    schema: string;
  }) => Promise<void>,
): Promise<void> {
  const schema = `${schemaName}_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  const bootstrap = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    username: process.env.DB_USERNAME ?? 'postgres',
    password: process.env.DB_PASSWORD ?? 'postgres',
    database: process.env.DB_NAME ?? 'omnifood',
    synchronize: false,
  });

  await bootstrap.initialize();
  await bootstrap.query(`CREATE SCHEMA "${schema}"`);

  let dataSource: DataSource | null = null;
  let queryRunner: QueryRunner | null = null;

  try {
    dataSource = new DataSource({
      type: 'postgres',
      host: process.env.DB_HOST ?? '127.0.0.1',
      port: parseInt(process.env.DB_PORT ?? '5432', 10),
      username: process.env.DB_USERNAME ?? 'postgres',
      password: process.env.DB_PASSWORD ?? 'postgres',
      database: process.env.DB_NAME ?? 'omnifood',
      synchronize: false,
      schema,
      entities: [
        Tenant,
        Product,
        Insumo,
        UomConversion,
        Recipe,
        TenantTopologyRevision,
        TenantFulfillmentRecord,
      ],
    });
    await dataSource.initialize();

    queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.query(`SET search_path TO "${schema}"`);
    await queryRunner.query(`SET statement_timeout TO '15000ms'`);

    // Create prerequisite tables
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS tenants (
        id varchar PRIMARY KEY,
        name varchar NOT NULL,
        slug varchar,
        ruc varchar,
        created_at timestamptz DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS products (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id varchar NOT NULL,
        warehouse_id varchar,
        is_perishable boolean DEFAULT false,
        name varchar NOT NULL,
        uom varchar NOT NULL,
        stock numeric(12,4) DEFAULT 0,
        "averageCost" numeric(12,2) DEFAULT 0,
        "sellPrice" numeric(12,2) DEFAULT 0,
        is_active boolean DEFAULT true,
        created_at timestamptz DEFAULT now(),
        updated_at timestamptz DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS insumos (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id varchar NOT NULL,
        warehouse_id varchar,
        is_perishable boolean DEFAULT false,
        name varchar NOT NULL,
        "consumptionUom" varchar NOT NULL,
        "purchaseUom" varchar NOT NULL,
        "conversionFactor" numeric(12,4) NOT NULL DEFAULT 1,
        stock numeric(14,4) NOT NULL DEFAULT 0,
        existencia_actual numeric(14,4) NOT NULL DEFAULT 0,
        costo_promedio_nio numeric(14,4) NOT NULL DEFAULT 0,
        "parLevel" numeric(14,4),
        min_stock numeric(14,4),
        max_stock numeric(14,4),
        negative_stock_policy varchar NOT NULL DEFAULT 'RESTRICT',
        is_active boolean DEFAULT true,
        created_at timestamptz DEFAULT now(),
        updated_at timestamptz DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS recipes (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id varchar NOT NULL,
        "productId" uuid NOT NULL,
        "ingredientId" uuid NOT NULL,
        "ingredientType" varchar NOT NULL DEFAULT 'INSUMO',
        quantity numeric(14,4) NOT NULL,
        created_at timestamptz DEFAULT now(),
        updated_at timestamptz DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS uom_conversions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id varchar NOT NULL,
        insumo_id uuid NOT NULL,
        unit_name varchar NOT NULL,
        factor numeric(12,4) NOT NULL,
        is_default boolean DEFAULT false,
        created_at timestamptz DEFAULT now(),
        updated_at timestamptz DEFAULT now()
      );
    `);

    // Run fulfillment migrations
    await new CreateTenantTopologyRevisions1794000000000().up(queryRunner);
    await new AddTenantTopologyRevisionsRls1794000000001().up(queryRunner);
    await new CreateTenantFulfillmentRecords1795000000000().up(queryRunner);

    await assertion({ dataSource, queryRunner, schema });
  } finally {
    try {
      if (queryRunner) {
        await queryRunner.query('SET search_path TO public');
        await queryRunner.release();
      }
    } catch {
      // cleanup
    }

    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }

    try {
      if (bootstrap.isInitialized) {
        await bootstrap.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        await bootstrap.destroy();
      }
    } catch {
      // cleanup
    }
  }
}

describe('FulfillmentRolloutService (db - Real PostgreSQL, Zero Mocks)', () => {
  it(
    'scans catalog on real PostgreSQL, detecting recipe BOM discrepancies and foreign tenant leaks',
    async () => {
      await withIsolatedRolloutSchema(
        'rollout_scan_db',
        async ({ dataSource }) => {
          const tenantId = `tenant-${randomUUID()}`;
          const otherTenantId = `tenant-${randomUUID()}`;

          const productRepo = dataSource.getRepository(Product);
          const insumoRepo = dataSource.getRepository(Insumo);
          const recipeRepo = dataSource.getRepository(Recipe);
          const fulfillmentRepo = dataSource.getRepository(
            TenantFulfillmentRecord,
          );
          const revisionRepo = dataSource.getRepository(TenantTopologyRevision);

          const service = new FulfillmentRolloutService(
            dataSource,
            productRepo,
            insumoRepo,
            recipeRepo,
            fulfillmentRepo,
            revisionRepo,
          );

          // 1. Insumo for other tenant
          const foreignInsumo = await insumoRepo.save({
            id: randomUUID(),
            tenant_id: otherTenantId,
            name: 'Foreign Meat',
            consumptionUom: 'kg',
            purchaseUom: 'kg',
            conversionFactor: 1,
            existenciaActual: 10,
            costoPromedio: 50,
            negativeStockPolicy: 'RESTRICT',
            is_active: true,
          });

          // 2. Insumo for our tenant
          const localInsumo = await insumoRepo.save({
            id: randomUUID(),
            tenant_id: tenantId,
            name: 'Queso Fresco',
            consumptionUom: 'kg',
            purchaseUom: 'kg',
            conversionFactor: 1,
            existenciaActual: 20,
            costoPromedio: 40,
            negativeStockPolicy: 'RESTRICT',
            is_active: true,
          });

          // 3. Product with valid recipe
          const validProduct = await productRepo.save({
            id: randomUUID(),
            tenant_id: tenantId,
            name: 'Quesillo Doble',
            uom: 'UND',
            is_perishable: true,
            is_active: true,
          });
          await recipeRepo.save({
            id: randomUUID(),
            tenant_id: tenantId,
            productId: validProduct.id,
            ingredientId: localInsumo.id,
            quantity: 0.2,
          });

          // 4. Product missing recipe BOM
          const missingBomProduct = await productRepo.save({
            id: randomUUID(),
            tenant_id: tenantId,
            name: 'Gallo Pinto Especial',
            uom: 'UND',
            is_perishable: true,
            is_active: true,
          });

          // 5. Product with cross-tenant leak
          const leakingProduct = await productRepo.save({
            id: randomUUID(),
            tenant_id: tenantId,
            name: 'Plato Mixto Fusión',
            uom: 'UND',
            is_perishable: true,
            is_active: true,
          });
          await recipeRepo.save({
            id: randomUUID(),
            tenant_id: tenantId,
            productId: leakingProduct.id,
            ingredientId: foreignInsumo.id,
            quantity: 1,
          });

          // 6. Unrouted / non-perishable product
          const unroutedProduct = await productRepo.save({
            id: randomUUID(),
            tenant_id: tenantId,
            name: 'Cerveza Toña 350ml',
            uom: 'UND',
            is_perishable: false,
            is_active: true,
          });

          // Run real backfill scan
          const result = await service.scanBackfillDiscrepancies(tenantId);

          expect(result.clean).toBe(false);
          expect(result.totalScanned).toBe(4);

          const missingBom = result.discrepancies.find(
            (d) => d.productId === missingBomProduct.id,
          );
          expect(missingBom).toBeDefined();
          expect(missingBom?.type).toBe(DiscrepancyType.MISSING_RECIPE_BOM);

          const leaking = result.discrepancies.find(
            (d) => d.productId === leakingProduct.id,
          );
          expect(leaking).toBeDefined();
          expect(leaking?.type).toBe(DiscrepancyType.CROSS_TENANT_INSUMO_LEAK);

          const unrouted = result.unroutedProducts.find(
            (u) => u.productId === unroutedProduct.id,
          );
          expect(unrouted).toBeDefined();
          expect(unrouted?.fallbackAction).toBe('DIRECT_HANDOFF');
          expect(unrouted?.fallbackStation).toBe('general-dispatch');
        },
      );
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'toggles rollback gate, verifies enforcement status, and aggregates dashboard metrics across channels',
    async () => {
      await withIsolatedRolloutSchema(
        'rollout_gate_db',
        async ({ dataSource }) => {
          const tenantId = `tenant-${randomUUID()}`;

          const productRepo = dataSource.getRepository(Product);
          const insumoRepo = dataSource.getRepository(Insumo);
          const recipeRepo = dataSource.getRepository(Recipe);
          const fulfillmentRepo = dataSource.getRepository(
            TenantFulfillmentRecord,
          );
          const revisionRepo = dataSource.getRepository(TenantTopologyRevision);

          const service = new FulfillmentRolloutService(
            dataSource,
            productRepo,
            insumoRepo,
            recipeRepo,
            fulfillmentRepo,
            revisionRepo,
          );

          // Seed a topology revision
          await revisionRepo.save({
            id: randomUUID(),
            tenant_id: tenantId,
            contract_version: 1,
            revision: 3,
            topology: {
              operationMode: 'FOOD_PARK',
              channels: ['PRINT_ONLY', 'KDS_ONLY', 'KDS_AND_PRINT'],
            },
            hash: 'hash-abc-123',
          });

          // Seed fulfillment records in 3 channels
          await fulfillmentRepo.save([
            {
              id: randomUUID(),
              tenant_id: tenantId,
              sale_id: randomUUID(),
              topology_snapshot_id: randomUUID(),
              topology_revision: 3,
              channel: 'PRINT_ONLY',
              route_state: 'PRINTED',
              delivery_state: 'PENDING',
              synced_at: new Date(),
            },
            {
              id: randomUUID(),
              tenant_id: tenantId,
              sale_id: randomUUID(),
              topology_snapshot_id: randomUUID(),
              topology_revision: 3,
              channel: 'KDS_ONLY',
              route_state: 'ROUTED',
              delivery_state: 'PENDING',
              synced_at: new Date(),
            },
            {
              id: randomUUID(),
              tenant_id: tenantId,
              sale_id: randomUUID(),
              topology_snapshot_id: randomUUID(),
              topology_revision: 3,
              channel: 'KDS_AND_PRINT',
              route_state: 'PRINTED',
              delivery_state: 'DELIVERED',
              synced_at: new Date(),
            },
          ]);

          // Verify dashboard initially ACTIVE
          let dashboard = await service.getObservabilityDashboard(tenantId);
          expect(dashboard.currentRevision).toBe(3);
          expect(dashboard.operationMode).toBe('FOOD_PARK');
          expect(dashboard.totalFulfillments).toBe(3);
          expect(dashboard.channelsBreakdown).toEqual({
            PRINT_ONLY: 1,
            KDS_ONLY: 1,
            KDS_AND_PRINT: 1,
          });
          expect(dashboard.enforcementStatus).toBe('ACTIVE');

          // Toggle Rollback
          const rollbackResult = await service.toggleRollback(tenantId, {
            rollback: true,
            reason: 'Hardware fault on central kitchen printer',
            authorizedBy: 'owner@omnifood.ni',
          });
          expect(rollbackResult.enforcementEnabled).toBe(false);
          expect(rollbackResult.isRolledBack).toBe(true);

          dashboard = await service.getObservabilityDashboard(tenantId);
          expect(dashboard.enforcementStatus).toBe('ROLLED_BACK');
          expect(dashboard.lastAudit?.reason).toBe(
            'Hardware fault on central kitchen printer',
          );
        },
      );
    },
    TEST_TIMEOUT_MS,
  );
});
