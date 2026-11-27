import { randomUUID } from 'crypto';
import { DataSource, type QueryRunner } from 'typeorm';
import { AddDirectStockPolicyAndManagedResaleInsumo1811400000000 } from './1811400000000-AddDirectStockPolicyAndManagedResaleInsumo';

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required for DB-backed migration tests`);
  }
  return value;
}

const postgresConnection = {
  host: process.env.DB_HOST?.trim() ?? '127.0.0.1',
  port: Number(process.env.DB_PORT?.trim() ?? '5432'),
  username: process.env.DB_USERNAME?.trim() ?? 'postgres',
  password: getRequiredEnv('DB_PASSWORD'),
  database: process.env.DB_DATABASE?.trim() ?? 'omnifood',
};

async function withIsolatedSchema(
  schemaPrefix: string,
  assertion: (queryRunner: QueryRunner) => Promise<void>,
): Promise<void> {
  const dataSource = new DataSource({
    type: 'postgres',
    ...postgresConnection,
  });
  const schema = `${schemaPrefix}_${randomUUID().replace(/-/g, '')}`;
  const queryRunner = dataSource.createQueryRunner();
  let isInitialized = false;

  try {
    await dataSource.initialize();
    isInitialized = true;
    await queryRunner.connect();
    await queryRunner.query(`CREATE SCHEMA "${schema}"`);
    await queryRunner.query(`SET search_path TO "${schema}"`);
    await queryRunner.query(`SET statement_timeout TO '15000ms'`);
    await assertion(queryRunner);
  } finally {
    try {
      await queryRunner.query('SET search_path TO public');
      await queryRunner.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    } catch {
      // best effort cleanup
    }
    try {
      await queryRunner.release();
    } catch {
      // ignore
    }
    if (isInitialized) {
      await dataSource.destroy();
    }
  }
}

describe('AddDirectStockPolicyAndManagedResaleInsumo1811400000000 (real PostgreSQL)', () => {
  const TEST_TIMEOUT_MS = 30000;

  it(
    'adds inventory_policy and resale insumo columns, backfills active SIMPLE mappings, enforces constraints, is idempotent, and reverts cleanly on down()',
    async () => {
      await withIsolatedSchema('test_direct_stock_policy', async (qr) => {
        await qr.query(`
          CREATE TABLE products (
            id uuid PRIMARY KEY,
            tenant_id uuid NOT NULL,
            name varchar NOT NULL,
            product_type varchar NOT NULL DEFAULT 'SIMPLE'
          )
        `);

        await qr.query(`
          CREATE TABLE insumos (
            id uuid PRIMARY KEY,
            tenant_id uuid NOT NULL,
            name varchar NOT NULL
          )
        `);

        await qr.query(`
          CREATE TABLE product_inventory_mapping_versions (
            id uuid PRIMARY KEY,
            tenant_id uuid NOT NULL,
            product_id uuid NOT NULL,
            insumo_id uuid NOT NULL,
            superseded_at timestamptz NULL
          )
        `);

        const tenantId = randomUUID();
        const mappedSimpleProductId = randomUUID();
        const supersededSimpleProductId = randomUUID();
        const unmappedSimpleProductId = randomUUID();
        const compoundProductId = randomUUID();
        const insumoId1 = randomUUID();
        const insumoId2 = randomUUID();

        await qr.query(
          `INSERT INTO products (id, tenant_id, name, product_type) VALUES
           ($1, $5, 'Coca Cola 355ml', 'SIMPLE'),
           ($2, $5, 'Agua 500ml (superseded)', 'SIMPLE'),
           ($3, $5, 'Servilleta', 'SIMPLE'),
           ($4, $5, 'Combo Pollo', 'COMPOUND')`,
          [
            mappedSimpleProductId,
            supersededSimpleProductId,
            unmappedSimpleProductId,
            compoundProductId,
            tenantId,
          ],
        );

        await qr.query(
          `INSERT INTO insumos (id, tenant_id, name) VALUES
           ($1, $3, 'Coca Cola 355ml'),
           ($2, $3, 'Harina')`,
          [insumoId1, insumoId2, tenantId],
        );

        // Active mapping for mappedSimpleProductId
        await qr.query(
          `INSERT INTO product_inventory_mapping_versions (id, tenant_id, product_id, insumo_id, superseded_at)
           VALUES ($1, $2, $3, $4, NULL)`,
          [randomUUID(), tenantId, mappedSimpleProductId, insumoId1],
        );

        // Superseded mapping for supersededSimpleProductId
        await qr.query(
          `INSERT INTO product_inventory_mapping_versions (id, tenant_id, product_id, insumo_id, superseded_at)
           VALUES ($1, $2, $3, $4, NOW())`,
          [randomUUID(), tenantId, supersededSimpleProductId, insumoId2],
        );

        // Active mapping on COMPOUND product should NOT be promoted
        await qr.query(
          `INSERT INTO product_inventory_mapping_versions (id, tenant_id, product_id, insumo_id, superseded_at)
           VALUES ($1, $2, $3, $4, NULL)`,
          [randomUUID(), tenantId, compoundProductId, insumoId2],
        );

        const migration =
          new AddDirectStockPolicyAndManagedResaleInsumo1811400000000();
        await migration.up(qr);

        // 1. Verify backfill results
        const productsResult = (await qr.query(
          `SELECT id, inventory_policy FROM products WHERE tenant_id = $1`,
          [tenantId],
        )) as Array<{ id: string; inventory_policy: string }>;
        const policyByProduct = new Map<string, string>(
          productsResult.map((r) => [r.id, r.inventory_policy]),
        );
        expect(policyByProduct.get(mappedSimpleProductId)).toBe('DIRECT_STOCK');
        expect(policyByProduct.get(supersededSimpleProductId)).toBe(
          'NOT_TRACKED',
        );
        expect(policyByProduct.get(unmappedSimpleProductId)).toBe(
          'NOT_TRACKED',
        );
        expect(policyByProduct.get(compoundProductId)).toBe('NOT_TRACKED');

        // 2. Verify defaults on new inserts
        const newProductId = randomUUID();
        await qr.query(
          `INSERT INTO products (id, tenant_id, name, product_type) VALUES ($1, $2, 'Nuevo Simple', 'SIMPLE')`,
          [newProductId, tenantId],
        );
        const [newProduct] = await qr.query(
          `SELECT inventory_policy FROM products WHERE id = $1`,
          [newProductId],
        );
        expect(newProduct.inventory_policy).toBe('NOT_TRACKED');

        const newInsumoA = randomUUID();
        const newInsumoB = randomUUID();
        await qr.query(
          `INSERT INTO insumos (id, tenant_id, name) VALUES ($1, $3, 'Sal'), ($2, $3, 'Azucar')`,
          [newInsumoA, newInsumoB, tenantId],
        );
        const [insumoRow] = await qr.query(
          `SELECT catalog_kind, managed_product_id FROM insumos WHERE id = $1`,
          [newInsumoA],
        );
        expect(insumoRow.catalog_kind).toBe('RAW_MATERIAL');
        expect(insumoRow.managed_product_id).toBeNull();

        // 3. Check constraints reject invalid values
        await expect(
          qr.query(
            `INSERT INTO products (id, tenant_id, name, product_type, inventory_policy)
             VALUES ($1, $2, 'Invalido', 'SIMPLE', 'INVALID_POLICY')`,
            [randomUUID(), tenantId],
          ),
        ).rejects.toThrow(/chk_products_inventory_policy/);

        await expect(
          qr.query(
            `INSERT INTO insumos (id, tenant_id, name, catalog_kind)
             VALUES ($1, $2, 'Invalido', 'INVALID_KIND')`,
            [randomUUID(), tenantId],
          ),
        ).rejects.toThrow(/chk_insumos_catalog_kind/);

        // 4. Partial unique index rejects duplicate (tenant_id, managed_product_id) while allowing multiple NULLs
        const managedInsumo1 = randomUUID();
        await qr.query(
          `INSERT INTO insumos (id, tenant_id, name, catalog_kind, managed_product_id)
           VALUES ($1, $2, 'Resale Coca', 'PRODUCT_RESALE', $3)`,
          [managedInsumo1, tenantId, unmappedSimpleProductId],
        );

        await expect(
          qr.query(
            `INSERT INTO insumos (id, tenant_id, name, catalog_kind, managed_product_id)
             VALUES ($1, $2, 'Resale Coca Dup', 'PRODUCT_RESALE', $3)`,
            [randomUUID(), tenantId, unmappedSimpleProductId],
          ),
        ).rejects.toThrow(/uq_insumos_managed_product/);

        // 5. Idempotent re-run of up() succeeds
        await migration.up(qr);

        // 6. down() cleanly removes columns, constraints, and indexes
        await migration.down(qr);

        const productCols = await qr.query(
          `SELECT column_name FROM information_schema.columns
           WHERE table_schema = current_schema() AND table_name = 'products' AND column_name = 'inventory_policy'`,
        );
        expect(productCols).toHaveLength(0);

        const insumoCols = await qr.query(
          `SELECT column_name FROM information_schema.columns
           WHERE table_schema = current_schema() AND table_name = 'insumos'
             AND column_name IN ('catalog_kind', 'managed_product_id')`,
        );
        expect(insumoCols).toHaveLength(0);
      });
    },
    TEST_TIMEOUT_MS,
  );
});
