import { randomUUID } from 'crypto';
import { DataSource, type QueryRunner } from 'typeorm';
import { CreateProductInventoryMappingVersions1802000000000 } from './1802000000000-CreateProductInventoryMappingVersions';

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required for DB-backed migration tests`);
  }
  return value;
}

function readPostgresPort(): number {
  const value = process.env.DB_PORT?.trim() ?? '5432';
  const port = Number(value);
  if (!Number.isInteger(port)) {
    throw new Error(
      'DB_PORT must be a valid integer for DB-backed migration tests',
    );
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

interface IsolatedDatabaseContext {
  queryRunner: QueryRunner;
  schema: string;
  tenantRole: string;
}

async function withIsolatedSchema(
  schemaPrefix: string,
  assertion: (context: IsolatedDatabaseContext) => Promise<void>,
): Promise<void> {
  const dataSource = new DataSource({
    type: 'postgres',
    ...postgresConnection,
  });

  const suffix = randomUUID().replace(/-/g, '');
  const schema = `${schemaPrefix}_${suffix}`;
  const tenantRole = `${schemaPrefix}_role_${suffix}`;
  const queryRunner = dataSource.createQueryRunner();
  let isInitialized = false;

  try {
    await dataSource.initialize();
    isInitialized = true;
    await queryRunner.connect();
    await queryRunner.query(`CREATE SCHEMA "${schema}"`);
    await queryRunner.query(`CREATE ROLE "${tenantRole}" NOLOGIN`);
    await queryRunner.query(`SET search_path TO "${schema}", public`);
    await queryRunner.query(`SET statement_timeout TO '15000ms'`);

    // Setup base tables required for foreign keys
    await queryRunner.query(`
      CREATE TABLE products (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id varchar(128) NOT NULL,
        name varchar(255) NOT NULL,
        created_at timestamptz DEFAULT now()
      );
      CREATE TABLE insumos (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id varchar(128) NOT NULL,
        name varchar(255) NOT NULL,
        created_at timestamptz DEFAULT now()
      );
    `);

    await assertion({ queryRunner, schema, tenantRole });
  } finally {
    try {
      await queryRunner.query('RESET ROLE');
      await queryRunner.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await queryRunner.query(`DROP ROLE IF EXISTS "${tenantRole}"`);
    } catch {
      // best-effort cleanup
    }

    if (queryRunner.isReleased === false) {
      await queryRunner.release();
    }
    if (isInitialized && dataSource.isInitialized) {
      await dataSource.destroy();
    }
  }
}

describe('Migration 1802000000000-CreateProductInventoryMappingVersions DB spec', () => {
  const isDbTest = Boolean(process.env.DB_PASSWORD);
  const itDb = isDbTest ? it : it.skip;

  itDb(
    'enforces tenant composite FKs, RLS isolation, history immutability and down guard',
    async () => {
      await withIsolatedSchema(
        'mapping_migration_test',
        async ({ queryRunner, schema, tenantRole }) => {
          const migration =
            new CreateProductInventoryMappingVersions1802000000000();
          await migration.up(queryRunner);

          const tenantA = 'tenant-alpha';
          const tenantB = 'tenant-beta';

          // Seed parent records
          const [prodA] = await queryRunner.query(
            `INSERT INTO products (tenant_id, name) VALUES ($1, 'Prod A') RETURNING id`,
            [tenantA],
          );
          const [insumoA] = await queryRunner.query(
            `INSERT INTO insumos (tenant_id, name) VALUES ($1, 'Insumo A') RETURNING id`,
            [tenantA],
          );
          const [prodB] = await queryRunner.query(
            `INSERT INTO products (tenant_id, name) VALUES ($1, 'Prod B') RETURNING id`,
            [tenantB],
          );

          // 1. Cross-tenant FK violation must fail
          await expect(
            queryRunner.query(
              `INSERT INTO product_inventory_mapping_versions (tenant_id, product_id, insumo_id) VALUES ($1, $2, $3)`,
              [tenantA, prodB.id, insumoA.id], // prodB belongs to tenantB!
            ),
          ).rejects.toThrow();

          // 2. Matching tenant insertion succeeds
          const [mappingA] = await queryRunner.query(
            `INSERT INTO product_inventory_mapping_versions (tenant_id, product_id, insumo_id) VALUES ($1, $2, $3) RETURNING id`,
            [tenantA, prodA.id, insumoA.id],
          );
          expect(mappingA.id).toBeDefined();

          // 3. RLS isolation: tenant role cannot see other tenant data
          await queryRunner.query(
            `GRANT USAGE ON SCHEMA "${schema}" TO "${tenantRole}"`,
          );
          await queryRunner.query(
            `GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA "${schema}" TO "${tenantRole}"`,
          );
          await queryRunner.query(`SET ROLE "${tenantRole}"`);

          await queryRunner.query(
            `SELECT set_config('app.tenant_id', $1, false)`,
            [tenantB],
          );
          const rowsB = await queryRunner.query(
            `SELECT * FROM product_inventory_mapping_versions`,
          );
          expect(rowsB).toHaveLength(0); // Tenant B sees nothing

          await queryRunner.query(
            `SELECT set_config('app.tenant_id', $1, false)`,
            [tenantA],
          );
          const rowsA = await queryRunner.query(
            `SELECT * FROM product_inventory_mapping_versions`,
          );
          expect(rowsA).toHaveLength(1); // Tenant A sees its mapping

          // 4. Immutability guard tests
          // A. DELETE rejected
          await expect(
            queryRunner.query(
              `DELETE FROM product_inventory_mapping_versions WHERE id = $1`,
              [mappingA.id],
            ),
          ).rejects.toThrow('mapping version history is append-only');

          // B. Updating immutable fields rejected
          await expect(
            queryRunner.query(
              `UPDATE product_inventory_mapping_versions SET insumo_id = gen_random_uuid() WHERE id = $1`,
              [mappingA.id],
            ),
          ).rejects.toThrow('immutable mapping fields cannot be changed');

          // C. Legal close (superseding) succeeds
          await queryRunner.query(
            `UPDATE product_inventory_mapping_versions SET superseded_at = now() + interval '1 minute' WHERE id = $1`,
            [mappingA.id],
          );

          // D. Mutation of already closed history rejected
          await expect(
            queryRunner.query(
              `UPDATE product_inventory_mapping_versions SET superseded_at = now() + interval '2 minute' WHERE id = $1`,
              [mappingA.id],
            ),
          ).rejects.toThrow('closed mapping history cannot be changed');

          // Reset role before down migration check
          await queryRunner.query('RESET ROLE');

          // 5. Down migration refuses to remove evidence when history exists
          await expect(migration.down(queryRunner)).rejects.toThrow(
            'refusing to remove product mapping history',
          );
        },
      );
    },
  );
});
